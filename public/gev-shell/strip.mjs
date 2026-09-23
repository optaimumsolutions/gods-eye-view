/**
 * The product strip shared by the globe and the Oil Oracle console pages
 * (plan §15 R13.3, row 1 R11). Served as a plain module from the globe's
 * origin at /gev-shell/strip.mjs, so the console pages proxied under that
 * origin load the same file. Pure helpers are exported for the tests; the
 * DOM part mounts itself only in a browser.
 *
 * Every freshness read goes through subscribeFreshness(). Milestone 4 swaps
 * its body from polling /logs.json to the WebSocket hub; nothing else polls.
 */

export const NAV_LINKS = Object.freeze([
  Object.freeze({ id: 'globe', label: 'GLOBE', href: '/' }),
  Object.freeze({ id: 'market', label: 'MARKET', href: '/market' }),
  Object.freeze({ id: 'gas', label: 'GAS', href: '/gas' }),
  Object.freeze({ id: 'weather', label: 'WEATHER', href: '/weather' }),
  Object.freeze({ id: 'trades', label: 'TRADES', href: '/trades' }),
  Object.freeze({ id: 'chat', label: 'CHAT', href: '/market#ask' }),
]);

/** A source is stale past twice its tolerance, the console's own rule. */
export const STALE_TOLERANCE_FACTOR = 2;
/** The fast tier runs every 30 minutes; no ingest for 75 minutes is stale. */
export const LATEST_INGEST_MAX_AGE_MS = 75 * 60 * 1000;
export const POLL_INTERVAL_MS = 60 * 1000;

/** Which strip link the current page is. */
export function activeLinkId(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/index.html') return 'globe';
  const match = NAV_LINKS.find(
    (link) => link.id !== 'chat' && link.href === path,
  );
  return match ? match.id : null;
}

const pad = (value) => String(value).padStart(2, '0');

/** `HH:MMZ` for a millisecond timestamp. */
export function formatUtcClock(ms) {
  const date = new Date(ms);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

/**
 * Reduce the console's /logs.json to the strip's state.
 * Returns { state: 'live' | 'stale' | 'offline', asOf, host, stale: [names] }.
 */
export function freshnessFromLogs(logs, now = Date.now()) {
  if (!logs || typeof logs !== 'object' || !logs.sources)
    return { state: 'offline', asOf: null, host: null, stale: [] };
  const tolerance = logs.tol && typeof logs.tol === 'object' ? logs.tol : {};
  let latest = null;
  const stale = [];
  for (const [name, info] of Object.entries(logs.sources)) {
    const at = Date.parse(info?.run_at);
    if (!Number.isFinite(at)) continue;
    if (latest === null || at > latest) latest = at;
    const hours = Number(tolerance[name]);
    if (Number.isFinite(hours) && hours > 0) {
      const ageHours = (now - at) / 3_600_000;
      if (ageHours > STALE_TOLERANCE_FACTOR * hours) stale.push(name);
    }
  }
  stale.sort();
  const host = logs.host === 'vps' ? 'store' : 'mirror';
  if (latest === null) return { state: 'stale', asOf: null, host, stale };
  const fresh = now - latest <= LATEST_INGEST_MAX_AGE_MS && stale.length === 0;
  return { state: fresh ? 'live' : 'stale', asOf: latest, host, stale };
}

/** The strip's right-hand text for a freshness state. */
export function formatFreshness(freshness) {
  if (!freshness || freshness.state === 'offline') return 'console · OFFLINE';
  const when = freshness.asOf === null ? 'n/a' : formatUtcClock(freshness.asOf);
  const label = freshness.state === 'live' ? 'LIVE' : 'STALE';
  const extra = freshness.stale.length ? ` (${freshness.stale.length})` : '';
  return `${freshness.host} as of ${when} · ${label}${extra}`;
}

/**
 * The one freshness feed. Calls `callback(freshness)` now and on every poll;
 * returns an unsubscribe function. Milestone 4 replaces the polling body.
 */
export function subscribeFreshness(
  callback,
  {
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    intervalMs = POLL_INTERVAL_MS,
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval,
  } = {},
) {
  let stopped = false;
  const poll = async () => {
    let freshness;
    try {
      const response = await fetchImpl('/logs.json', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      freshness = response.ok
        ? freshnessFromLogs(await response.json(), now())
        : freshnessFromLogs(null);
    } catch {
      freshness = freshnessFromLogs(null);
    }
    if (!stopped) callback(freshness);
  };
  poll();
  const timer = setIntervalImpl(poll, intervalMs);
  return () => {
    stopped = true;
    clearIntervalImpl(timer);
  };
}

const STYLE = `
:root { --gev-strip-height: 30px; }
html.gev-strip-shift body {
  position: relative;
  top: var(--gev-strip-height);
  height: calc(100% - var(--gev-strip-height));
  transform: translateZ(0);
}
html.gev-strip-flow body { margin-top: var(--gev-strip-height); }
#gev-strip {
  position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
  height: var(--gev-strip-height); box-sizing: border-box;
  display: flex; align-items: center; gap: 2px; padding: 0 10px;
  background: #0b0f14; border-bottom: 1px solid #1f2a36;
  font: 600 11px/1 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em; color: #8b98a8;
}
#gev-strip a { color: #8b98a8; text-decoration: none; padding: 6px 10px; border-radius: 3px; }
#gev-strip a:hover, #gev-strip a:focus-visible { color: #e6edf3; background: #16202b; outline: none; }
#gev-strip a[aria-current='page'] { color: #e6edf3; background: #1b2733; box-shadow: inset 0 -2px 0 #38bdf8; }
#gev-strip .gev-fresh { margin-left: auto; font-weight: 500; letter-spacing: 0.04em; white-space: nowrap; }
#gev-strip .gev-fresh[data-state='live'] { color: #4ade80; }
#gev-strip .gev-fresh[data-state='stale'] { color: #fbbf24; }
#gev-strip .gev-fresh[data-state='offline'] { color: #f87171; }
@media (max-width: 640px) {
  #gev-strip a { padding: 6px 6px; }
  #gev-strip .gev-fresh { display: none; }
}
`;

/** Build and attach the strip. Idempotent; returns the element. */
export function mountStrip(
  doc = globalThis.document,
  loc = globalThis.location,
) {
  const existing = doc.getElementById('gev-strip');
  if (existing) return existing;
  const root = doc.documentElement;
  // The globe's chrome is absolutely positioned against the body, so it
  // shifts as one block; console pages are ordinary document flow.
  root.classList.add(
    doc.getElementById('cesiumContainer')
      ? 'gev-strip-shift'
      : 'gev-strip-flow',
  );
  const style = doc.createElement('style');
  style.id = 'gev-strip-style';
  style.textContent = STYLE;
  doc.head.appendChild(style);

  const nav = doc.createElement('nav');
  nav.id = 'gev-strip';
  nav.setAttribute('aria-label', 'Commodities');
  const current = activeLinkId(loc?.pathname);
  for (const link of NAV_LINKS) {
    const anchor = doc.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    anchor.dataset.link = link.id;
    if (link.id === current) anchor.setAttribute('aria-current', 'page');
    nav.appendChild(anchor);
  }
  const fresh = doc.createElement('span');
  fresh.className = 'gev-fresh';
  fresh.dataset.state = 'offline';
  fresh.setAttribute('role', 'status');
  fresh.textContent = 'checking…';
  nav.appendChild(fresh);
  // Outside <body>, so the shifted body cannot clip or move it.
  root.insertBefore(nav, doc.body);

  subscribeFreshness((freshness) => {
    fresh.dataset.state = freshness.state;
    fresh.textContent = formatFreshness(freshness);
    fresh.title = freshness.stale.length
      ? `Past twice their tolerance: ${freshness.stale.join(', ')}`
      : '';
  });
  return nav;
}

if (typeof document !== 'undefined' && !globalThis.__GEV_STRIP_MANUAL__) {
  mountStrip();
}
