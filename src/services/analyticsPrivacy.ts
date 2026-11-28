// A capability must never become a GA location, referrer, click URL or event
// parameter. Once seen, collection stays off for this document's lifetime.
export function isCapabilityUrl(value: string, base = 'https://privacy.invalid/'): boolean {
  try {
    const url = new URL(value, base);
    const path = decodeURIComponent(url.pathname);
    return /^\/r(?:\/|$)/i.test(path)
      || [...url.searchParams.keys()].some(key => key.toLowerCase() === 'token')
      || /(?:^|[?&#/])token(?:=|[&#]|$)/i.test(decodeURIComponent(url.hash.slice(1)))
      || /^\/?r(?:\/|$)/i.test(decodeURIComponent(url.hash.slice(1)));
  } catch {
    return true;
  }
}

export function hasCapabilityParams(value: unknown): boolean {
  if (typeof value === 'string') return isCapabilityUrl(value);
  if (!value || typeof value !== 'object') return false;
  // Cyclic/opaque objects are not valid analytics payloads either.
  try {
    return /"token"\s*:/i.test(JSON.stringify(value))
      || Object.values(value).some(hasCapabilityParams);
  } catch {
    return true;
  }
}

export function createAnalyticsPrivacy(browser: Window, doc: Document) {
  const ids = new Set<string>();
  let blocked = false;
  const globals = browser as unknown as Record<string, unknown>;
  const disable = () => {
    blocked = true;
    for (const id of ids) globals[`ga-disable-${id}`] = true;
  };
  const inspect = (url: string) => {
    if (isCapabilityUrl(url, browser.location.href)) disable();
  };
  // Set before the SDK can insert scripts, including async initialization.
  let policy = doc.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!policy) {
    policy = doc.createElement('meta');
    policy.name = 'referrer';
    doc.head.appendChild(policy);
  }
  policy.content = 'no-referrer';
  inspect(browser.location.href);
  if (doc.referrer) inspect(doc.referrer);
  for (const method of ['pushState', 'replaceState'] as const) {
    const wrap = (original: History[typeof method]): History[typeof method] => function (this: History, ...args) {
      if (args[2] != null) inspect(String(args[2]));
      return original.apply(this, args);
    };
    let guarded = wrap(browser.history[method]);
    // Keep the guard OUTSIDE subsequently assigned instrumentation too: a GA
    // wrapper can inspect the target argument before invoking native history.
    // Each wrapper captures its own immutable delegate to avoid recursion when
    // an integration retains the previous method and calls it from its patch.
    Object.defineProperty(browser.history, method, {
      configurable: true,
      get: () => guarded,
      set: (replacement: History[typeof method]) => { guarded = wrap(replacement); },
    });
  }
  // Registered before GA, including capture phase for native back/forward.
  browser.addEventListener('popstate', () => inspect(browser.location.href), true);
  browser.addEventListener('hashchange', () => inspect(browser.location.href), true);
  browser.addEventListener('click', event => {
    for (const node of event.composedPath()) {
      if ('tagName' in node && (node as Element).tagName === 'A') {
        const href = (node as Element).getAttribute('href');
        if (href) inspect(href);
        break;
      }
    }
  }, true);
  const registerMeasurement = (id: string) => {
    ids.add(id);
    if (blocked) globals[`ga-disable-${id}`] = true;
  };
  // Firebase may fetch a measurement ID different from the env fallback.
  // Its config command MUST pass here before gtag processes that ID.
  function gtag(...args: unknown[]) {
    if (args[0] === 'config' && typeof args[1] === 'string') registerMeasurement(args[1]);
    if (hasCapabilityParams(args)) disable();
    if (blocked) return;
    const layer = (globals.dataLayer ??= []) as IArguments[];
    layer.push(arguments);
  }
  return {
    registerMeasurement, gtag,
    allowed: () => {
      inspect(browser.location.href);
      return !blocked;
    },
  };
}

export const analyticsPrivacy = typeof window === 'undefined'
  ? null : createAnalyticsPrivacy(window, document);
