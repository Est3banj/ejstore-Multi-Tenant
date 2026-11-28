import { expect, it, vi } from 'vitest';
import { sdk } from '../../tests/security-frontend/sdk-boundary';
import { getAnalytics } from 'firebase/analytics';

it('direct capability URLs never initialize analytics or forward events, including query-token aliases', async () => {
  const previous = window.location.href;
  try {
    for (const path of ['/r/' + 'a'.repeat(64), '/?token=' + 'a'.repeat(64)]) {
      vi.resetModules();
      sdk.supported.mockClear(); sdk.logEvent.mockClear();
      window.history.replaceState({}, '', path);
      const firebase = await import('../services/firebase');
      await Promise.resolve();
      firebase.logAnalyticsEvent('page_view', { page_location: window.location.href });
      expect(sdk.supported).not.toHaveBeenCalled();
      expect(sdk.logEvent).not.toHaveBeenCalled();
    }
  } finally {
    window.history.replaceState({}, '', previous);
  }
});

it('SPA entry suppresses explicit events even after leaving the capability route', async () => {
  vi.resetModules();
  window.history.replaceState({}, '', '/safe');
  sdk.supported.mockResolvedValue(true); sdk.logEvent.mockClear();
  const firebase = await import('../services/firebase');
  await Promise.resolve();
  firebase.logAnalyticsEvent('safe_event'); expect(sdk.logEvent).toHaveBeenCalledOnce();
  window.history.pushState({}, '', '/r/' + 'b'.repeat(64));
  firebase.logAnalyticsEvent('page_view');
  window.history.pushState({}, '', '/catalogo');
  firebase.logAnalyticsEvent('page_view');
  expect(sdk.logEvent).toHaveBeenCalledOnce();
  expect((window as any)['ga-disable-synthetic-measurement']).toBe(true);
});

it('navigation during the async support check prevents late SDK initialization', async () => {
  vi.resetModules(); window.history.replaceState({}, '', '/safe');
  let resolve!: (supported: boolean) => void;
  sdk.supported.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  const analytics = vi.mocked(getAnalytics);
  analytics.mockClear();
  const firebase = await import('../services/firebase');
  window.history.pushState({}, '', '/?token=synthetic-capability');
  window.history.replaceState({}, '', '/safe');
  resolve(true); await Promise.resolve();
  firebase.logAnalyticsEvent('page_view');
  expect(analytics).not.toHaveBeenCalled();
});
