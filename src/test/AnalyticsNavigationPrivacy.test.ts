import { afterEach, describe, expect, it } from 'vitest';
import { createAnalyticsPrivacy, hasCapabilityParams, isCapabilityUrl } from '../services/analyticsPrivacy';

const frames: HTMLIFrameElement[] = [];
afterEach(() => { for (const frame of frames.splice(0)) frame.remove(); });
const tokenPath = '/r/' + 'a'.repeat(64);
function fixture(path = '/', referrer?: string) {
  const frame = document.createElement('iframe');
  frame.src = window.location.origin + '/';
  document.body.append(frame); frames.push(frame);
  const browser = frame.contentWindow!;
  browser.document.open(); browser.document.write('<!doctype html><html><head></head><body></body></html>'); browser.document.close();
  if (referrer) Object.defineProperty(browser.document, 'referrer', { value: referrer });
  browser.history.replaceState({}, '', path);
  const privacy = createAnalyticsPrivacy(browser, browser.document);
  const id = 'G-SYNTHETIC';
  privacy.registerMeasurement(id);
  const sent: string[] = [];
  const send = (url = browser.location.href) => {
    if (!(browser as any)[`ga-disable-${id}`]) sent.push(url);
  };
  return { browser, privacy, sent, send, id };
}

describe('Firebase/GA automatic collection privacy boundary', () => {
  it('blocks a safe entry page whose document referrer contains a capability', () => {
    const { privacy, sent, send } = fixture('/safe', 'https://shop.invalid' + tokenPath);
    send(); expect(privacy.allowed()).toBe(false); expect(sent).toEqual([]);
  });
  it('keeps automatic and explicit analytics available for ordinary navigation', () => {
    const { browser, privacy, sent, send } = fixture();
    browser.history.pushState({ safe: true }, '', '/catalogo'); send();
    privacy.gtag('event', 'purchase', { value: 1000 });
    expect(privacy.allowed()).toBe(true); expect(sent).toHaveLength(1);
    expect((browser as any).dataLayer).toHaveLength(1);
  });
  it.each([tokenPath, '/%72/short', '/?%74oken=secret', '/#token=secret', '/#/r/secret'])('blocks direct entry %s before initialization', path => {
    const { privacy, browser, send, sent } = fixture(path);
    expect(privacy.allowed()).toBe(false); send();
    expect(sent).toEqual([]);
    expect(browser.document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
  });

  it.each(['pushState', 'replaceState'] as const)('disables collection synchronously inside a later GA %s wrapper and never re-enables it', method => {
    const { browser, privacy, sent, send } = fixture();
    const original = browser.history[method];
    browser.history[method] = function (...args) {
      send(new URL(String(args[2]), browser.location.href).href); // Even a pre-mutation target observer.
      const result = original.apply(this, args);
      send(); // Enhanced-measurement page view, before any React effect.
      return result;
    };
    const state = { marker: 'preserve-state' };
    expect(browser.history[method](state, '', tokenPath)).toBeUndefined();
    expect(browser.history.state).toEqual(state);
    expect(browser.location.pathname).toBe(tokenPath);
    expect(sent.every(url => !url.includes('/r/'))).toBe(true);
    browser.history[method]({}, '', '/catalogo');
    send(); expect(privacy.allowed()).toBe(false);
    expect(sent).toHaveLength(0); // Previous capability can remain GA's referrer.
  });

  it('disables before capture and bubbling popstate listeners for native back/forward', async () => {
    const frame = document.createElement('iframe');
    frame.src = window.location.origin + '/';
    document.body.append(frame); frames.push(frame);
    const browser = frame.contentWindow!;
    browser.document.open(); browser.document.write('<!doctype html><html><head></head><body></body></html>'); browser.document.close();
    // Historical capability predates SDK/guard; guard boots on a safe page.
    browser.history.replaceState({}, '', tokenPath);
    browser.history.pushState({}, '', '/safe');
    const privacy = createAnalyticsPrivacy(browser, browser.document);
    privacy.registerMeasurement('G-SYNTHETIC');
    const sent: string[] = [];
    for (const capture of [true, false]) browser.addEventListener('popstate', () => {
      if (!(browser as any)['ga-disable-G-SYNTHETIC']) sent.push(browser.location.href);
    }, capture);
    const navigated = () => new Promise<void>(resolve => browser.addEventListener('popstate', () => resolve(), { once: true }));
    let done = navigated(); browser.history.back(); await done;
    expect(browser.location.pathname).toBe(tokenPath); expect(sent).toEqual([]);
    done = navigated(); browser.history.forward(); await done;
    expect(browser.location.pathname).toBe('/safe'); expect(sent).toEqual([]);
    expect(privacy.allowed()).toBe(false);
  });

  it('latches on capability link intent before later automatic click listeners', () => {
    const { browser, privacy, send, sent } = fixture();
    browser.addEventListener('click', () => send(), true);
    const anchor = browser.document.createElement('a');
    anchor.href = tokenPath;
    anchor.addEventListener('click', event => event.preventDefault());
    browser.document.body.append(anchor); anchor.click();
    expect(sent).toEqual([]); expect(privacy.allowed()).toBe(false);
  });

  it('blocks a remotely resolved measurement ID and queued config after sensitive navigation during SDK init', () => {
    const { browser, privacy } = fixture();
    privacy.gtag('config', 'G-INITIAL', { send_page_view: false });
    expect((browser as any).dataLayer).toHaveLength(1);
    browser.history.pushState({}, '', tokenPath);
    privacy.gtag('config', 'G-REMOTE-DIFFERENT', {});
    privacy.gtag('event', 'page_view', { page_location: browser.location.href });
    expect((browser as any)['ga-disable-G-REMOTE-DIFFERENT']).toBe(true);
    expect((browser as any).dataLayer).toHaveLength(1);
  });

  it('rejects explicit nested capability parameters on otherwise safe pages', () => {
    const { browser, privacy } = fixture();
    privacy.gtag('event', 'share', { nested: { link_url: tokenPath } });
    expect((browser as any).dataLayer).toBeUndefined(); expect(privacy.allowed()).toBe(false);
    expect(hasCapabilityParams({ token: 'opaque' })).toBe(true);
    expect(hasCapabilityParams({ page_location: 'https://shop.invalid/catalogo', value: 10 })).toBe(false);
    expect(isCapabilityUrl('/catalogo')).toBe(false);
  });

  it('preserves native history exceptions', () => {
    const { browser } = fixture();
    expect(() => browser.history.pushState({}, '', 'https://foreign.invalid/')).toThrow();
  });
});
