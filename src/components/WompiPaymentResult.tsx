import { useLayoutEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatWompiAmount } from './WompiAmounts';
import { RechargeResultContent } from './RechargeResultContent';

export type WompiFinalStatus = 'approved' | 'sandbox_approved' | 'rejected';

// Stay in the document stack below Wompi while it owns the interaction. Only
// enter the native modal layer once the provider has actually closed.
export function WompiPaymentResult({ status, baseAmount, onClose, onRetry, canRetry = true, providerOpen = false }: {
  status: WompiFinalStatus | 'pending'; baseAmount: number; onClose: () => void; onRetry: () => void; canRetry?: boolean; providerOpen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const providerActive = useRef(providerOpen); providerActive.current = providerOpen;
  const title = useId();
  const rejected = status === 'rejected';
  const pending = status === 'pending';
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.toggleAttribute('inert', providerOpen);
    if (providerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const fallback = document.querySelector<HTMLElement>('[data-wompi-status-refresh]');
    dialog.showModal();
    return () => {
      dialog.close();
      if (providerActive.current || document.querySelector('.waybox-modal:not([hidden])')) return;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else if (fallback?.isConnected) fallback.focus();
    };
  }, [providerOpen]);
  const label = pending ? 'Pago pendiente' : rejected ? 'Pago rechazado' : status === 'sandbox_approved' ? 'Prueba aprobada' : 'Pago aprobado';
  return createPortal(<dialog ref={ref} open={providerOpen || undefined} data-wompi-result aria-hidden={providerOpen || undefined} aria-modal={!providerOpen} aria-label={label} id={title}
    onClick={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); if (!providerOpen) onClose(); }}
    onKeyDown={event => {
      if (providerOpen || event.key !== 'Tab') return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
      const first = controls[0], last = controls[controls.length - 1];
      // Keep Tab in the result rather than moving into browser chrome at the
      // boundary. The provider owns its separate focus handling while open.
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    className="glass fixed inset-0 z-50 !m-auto h-fit w-[calc(100%_-_2rem)] max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto overscroll-contain border-0 text-white backdrop:bg-black/80 backdrop:backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
    <RechargeResultContent success={!pending && !rejected} pending={pending} title={label} message={pending
      ? 'El servidor aún no confirmó el pago. Consultá el estado en el historial. No repitas el pago.' : rejected
      ? 'El pago no fue aprobado. Podés volver a intentarlo.'
      : status === 'sandbox_approved' ? 'Sin saldo real. Este pago fue una prueba.'
        : `Se acreditaron ${formatWompiAmount(baseAmount)} de saldo.`}>
    {rejected && !canRetry && <p className="mt-3 text-sm text-gray-300">Cerrá Wompi antes de volver a intentar.</p>}
    {rejected && <button type="button" disabled={!canRetry} onClick={onRetry} className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">Volver a intentar</button>}
    <button type="button" autoFocus={!providerOpen} onClick={onClose} className="w-full py-2.5 text-gray-400 hover:text-white font-medium text-sm transition-colors">Cerrar</button>
    </RechargeResultContent>
  </dialog>, document.body);
}
