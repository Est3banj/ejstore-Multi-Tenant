import type { WompiCheckoutResponse, WompiWidget, WompiWidgetConfig, WompiWidgetResult } from '../types/wompi';
import { checkoutWithReturn } from './wompiReturn';

const SCRIPT = 'https://checkout.wompi.co/widget.js';
let scriptPromise: Promise<void> | undefined;
let opened = false;
let previous: { key: string; widget: WompiWidget; constructor: Window['WidgetCheckout']; dialog?: HTMLElement; controller?: WompiWidgetController } | undefined;
export interface WompiWidgetController { isOpen: () => boolean; close: () => void; onClosed: (listener: () => void) => () => void }

export function getWompiWidgetController(config: WompiWidgetConfig) {
  return previous && previous.constructor === window.WidgetCheckout && previous.key === JSON.stringify(config) ? previous.controller : undefined;
}

export function loadWompiWidget(): Promise<void> {
  if (window.WidgetCheckout) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT; script.async = true;
    const timer = window.setTimeout(failed, 15000);
    function failed() {
      window.clearTimeout(timer); script.remove(); scriptPromise = undefined;
      reject(new Error('No se pudo cargar Wompi. Tu recarga sigue pendiente.'));
    }
    script.onerror = failed;
    script.onload = () => {
      if (!window.WidgetCheckout) { failed(); return; }
      window.clearTimeout(timer); resolve();
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function prepareWompiWidget(data: WompiCheckoutResponse, origin: string, tenantId?: string, panel = false) {
  const url = checkoutWithReturn(data.checkoutUrl, origin, tenantId, panel);
  const params = new URL(url).searchParams;
  const config: WompiWidgetConfig = {
    publicKey: params.get('public-key') || '', currency: params.get('currency') as 'COP',
    amountInCents: Number(params.get('amount-in-cents')), reference: params.get('reference') || '',
    signature: { integrity: params.get('signature:integrity') || '' },
  };
  const environment = config.publicKey.startsWith('pub_test_') ? 'test' : config.publicKey.startsWith('pub_prod_') ? 'prod' : '';
  if (!environment || !/^pub_(test|prod)_[A-Za-z0-9_]+$/.test(config.publicKey) || config.currency !== 'COP' ||
      !Number.isSafeInteger(config.amountInCents) || config.amountInCents <= 0 ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(config.reference) || !/^[a-f0-9]{64}$/i.test(config.signature.integrity) ||
      (data.environment !== undefined && data.environment !== environment) ||
      (data.rechargeId !== undefined && data.rechargeId !== config.reference) ||
      (data.reference !== undefined && data.reference !== config.reference)) throw new Error('Detalle del pago Wompi inválido.');
  // Explicit allowlist: never spread the response or accept provider-supplied redirects.
  const typed = data.widgetConfig;
  if (typed && (typed.publicKey !== config.publicKey || typed.currency !== config.currency ||
      typed.amountInCents !== config.amountInCents || typed.reference !== config.reference ||
      typed.signature?.integrity !== config.signature.integrity)) throw new Error('Detalle del pago Wompi inválido.');
  const redirect = params.get('redirect-url');
  if (redirect) config.redirectUrl = redirect;
  const history = new URL(panel ? '/r/historial-recargas' : '/historial-recargas', origin);
  history.searchParams.set('v', tenantId!); history.searchParams.set('wompi_ref', config.reference);
  return { config, url, history: history.href, environment, transactionId: undefined as string | undefined };
}

// The published SDK exposes open(), but no close/destroy. Its own keydown
// handler accepts Escape (keyCode 27) and runs closeModal: listener removal,
// aria-hidden/body-height restoration, backdrop hiding and focus restoration.
// Never forge a provider message or remove an iframe to emulate settlement.
export function openWompiWidget(config: WompiWidgetConfig, callback: (result: WompiWidgetResult) => void, onClose: () => void): WompiWidgetController {
  if (opened) throw new Error('Ya hay un pago Wompi abierto.');
  if (!window.WidgetCheckout) throw new Error('No se pudo cargar Wompi. Tu recarga sigue pendiente.');
  opened = true;
  let widget: WompiWidget;
  let observer: MutationObserver | undefined;
  let finished = false, closing = false;
  const closeListeners = new Set<() => void>();
  let dialog: HTMLElement | undefined;
  const finish = () => { if (finished) return; finished = true; observer?.disconnect(); opened = false; onClose(); closeListeners.forEach(listener => listener()); closeListeners.clear(); };
  try {
    const before = new Set(document.querySelectorAll('.waybox-modal'));
    const key = JSON.stringify(config);
    // Reopen the same frozen SDK instance: its public API has no destroy, and
    // constructing again would leave an extra hidden provider dialog each time.
    if (previous?.key === key && previous.constructor === window.WidgetCheckout) widget = previous.widget;
    else {
      widget = new window.WidgetCheckout(config);
      previous = { key, widget, constructor: window.WidgetCheckout };
    }
    widget.open(result => callback(result));
    // Capture only the dialog created by THIS construction/open (or the exact
    // recorded node when reopening). Never select another flow's visible modal.
    dialog = previous?.dialog || Array.from(document.querySelectorAll<HTMLElement>('.waybox-modal')).find(node => !before.has(node));
    if (dialog && previous) previous.dialog = dialog;
    if (dialog) {
      observer = new MutationObserver(() => { if (dialog?.hasAttribute('hidden') || !dialog?.isConnected) finish(); });
      observer.observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
      observer.observe(document.body, { childList: true });
    } else {
      // Also allows SDK test doubles without coupling tests to provider markup.
      opened = false;
    }
    const controller: WompiWidgetController = {
      isOpen: () => !!dialog?.isConnected && !dialog.hasAttribute('hidden'),
      onClosed: listener => { closeListeners.add(listener); return () => { closeListeners.delete(listener); }; },
      close: () => {
        if (closing || finished || !dialog?.isConnected || dialog.hasAttribute('hidden')) return;
        closing = true;
        // Scoped, non-bubbling Escape invokes the SDK's actual cleanup path.
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: false }));
      },
    };
    if (previous) previous.controller = controller;
    return controller;
  } catch (error) { finish(); throw error; }
}
