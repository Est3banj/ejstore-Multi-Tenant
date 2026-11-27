// The origin comes only from window.location.origin at the call site, never
// from a query parameter, provider callback or caller-supplied return URL.
export function checkoutWithReturn(checkoutUrl: string, origin: string, tenantId: string | undefined, panel = false): string {
  const checkout = new URL(checkoutUrl);
  if (checkout.origin !== 'https://checkout.wompi.co' || checkout.pathname !== '/p/' || checkout.username || checkout.password) {
    throw new Error('Checkout inválido');
  }
  const site = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
  if (site.origin !== origin || site.username || site.password ||
      (site.protocol !== 'https:' && !(import.meta.env.DEV && local && site.protocol === 'http:'))) {
    throw new Error('Origen de retorno inválido');
  }
  const reference = checkout.searchParams.get('reference');
  if (!tenantId || !reference || !/^[a-zA-Z0-9_-]{1,128}$/.test(reference)) throw new Error('Retorno de pago inválido');
  // CloudFront rejects loopback redirect targets, including HTTPS localhost.
  // Only local DEV sandbox may continue without the optional return parameter.
  if (local) {
    if (!import.meta.env.DEV || !checkout.searchParams.get('public-key')?.startsWith('pub_test_')) {
      throw new Error('El checkout local requiere Sandbox. Para retorno automático usá un dominio HTTPS público.');
    }
    checkout.searchParams.delete('redirect-url');
    return checkout.href;
  }
  const back = new URL(panel ? '/r/historial-recargas' : '/historial-recargas', site.origin);
  back.searchParams.set('v', tenantId);
  back.searchParams.set('wompi_ref', reference);
  checkout.searchParams.set('redirect-url', back.href);
  return checkout.href;
}
