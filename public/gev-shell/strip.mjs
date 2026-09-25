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

/** The event hub's path on the globe server (plan §15.12, M4 contract). */
export const EVENTS_PATH = '/api/events';
export const HUB_RETRY_MS = 5_000;
export const HUB_RETRY_MAX_MS = 60_000;
/** The event a hub `source.updated` frame becomes on `window` (detail = frame). */
export const SOURCE_UPDATED_EVENT = 'gev:source-updated';

/** The hub's WebSocket URL for this page; null outside a served page. */
export function hubUrl(loc = globalThis.location) {
  if (!loc?.host || !/^https?:$/.test(loc.protocol || '')) return null;
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}${EVENTS_PATH}`;
}

/** What the strip knows from the hub: source records and component health. */
export function createHubState() {
  return { sources: new Map(), health: new Map() };
}

/** Fold one hub frame into the state; true when the strip should re-render. */
export function applyHubFrame(state, frame) {
  switch (frame?.type) {
    case 'snapshot':
      state.sources = new Map(
        (frame.sources ?? []).map((record) => [record.source, { ...record }]),
      );
      state.health = new Map(
        (frame.health ?? []).map((entry) => [entry.component, entry]),
      );
      return true;
    case 'source.updated': {
      const record = state.sources.get(frame.source) ?? {
        source: frame.source,
      };
      if (frame.runAt) record.lastRunAt = frame.runAt;
      if (frame.rows > 0 && frame.runAt) record.fetchedAt = frame.runAt;
      if (frame.observedAt) record.observedAt = frame.observedAt;
      state.sources.set(frame.source, record);
      return true;
    }
    case 'health':
      state.health.set(frame.component, frame);
      return true;
    case 'heartbeat':
      return true;
    default:
      return false;
  }
}

/**
 * Reduce the hub's state to the strip's freshness, in the same shape as
 * freshnessFromLogs: OFFLINE when the console is down; STALE when a source
 * missed its deadline, askd is down, or nothing was ingested for 75 minutes.
 */
export function freshnessFromHub(state, now = Date.now()) {
  if (!state || state.health.get('console')?.state === 'offline')
    return { state: 'offline', asOf: null, host: null, stale: [] };
  let latest = null;
  for (const record of state.sources.values()) {
    const at = Date.parse(record.lastRunAt ?? record.fetchedAt);
    if (Number.isFinite(at) && (latest === null || at > latest)) latest = at;
  }
  const stale = [];
  for (const entry of state.health.values()) {
    if (entry.component?.startsWith('ingest:') && entry.state === 'stale')
      stale.push(entry.component.slice('ingest:'.length));
    else if (entry.component === 'askd' && entry.state === 'offline')
      stale.push('askd');
  }
  stale.sort();
  if (latest === null)
    return { state: 'stale', asOf: null, host: 'store', stale };
  const fresh = now - latest <= LATEST_INGEST_MAX_AGE_MS && stale.length === 0;
  return {
    state: fresh ? 'live' : 'stale',
    asOf: latest,
    host: 'store',
    stale,
  };
}

function dispatchSourceUpdated(target, frame) {
  const Event = globalThis.CustomEvent;
  if (typeof Event !== 'function' || !target?.dispatchEvent) return;
  target.dispatchEvent(new Event(SOURCE_UPDATED_EVENT, { detail: frame }));
}

/**
 * The one freshness feed. Calls `callback(freshness)` now and on every
 * change; returns an unsubscribe function. It prefers the event hub (M4):
 * once the hub's snapshot arrives the /logs.json polling stops,
 * `window.__gevHubLive` is true, and every `source.updated` is re-dispatched
 * as `gev:source-updated` and passed to `onEvent`. While the socket is down
 * it polls /logs.json every 60 s and retries the hub (5 s, doubling to 60 s).
 */
export function subscribeFreshness(
  callback,
  {
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    intervalMs = POLL_INTERVAL_MS,
    setIntervalImpl = globalThis.setInterval,
    clearIntervalImpl = globalThis.clearInterval,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
    WebSocketImpl = globalThis.WebSocket,
    url = hubUrl(),
    target = globalThis,
    onEvent = () => {},
  } = {},
) {
  let stopped = false;
  let timer = null;
  let socket = null;
  let retryTimer = null;
  let retryMs = HUB_RETRY_MS;
  let hub = null;

  const setHubLive = (live) => {
    try {
      if (target) target.__gevHubLive = live;
    } catch {
      /* a frozen global: the console simply keeps its reload */
    }
  };

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
    if (!stopped && !hub) callback(freshness);
  };
  const startPolling = () => {
    if (timer !== null) return;
    poll();
    timer = setIntervalImpl(poll, intervalMs);
  };
  const stopPolling = () => {
    if (timer === null) return;
    clearIntervalImpl(timer);
    timer = null;
  };

  const scheduleRetry = () => {
    if (stopped || retryTimer !== null) return;
    retryTimer = setTimeoutImpl(() => {
      retryTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, HUB_RETRY_MAX_MS);
  };

  function connect() {
    if (stopped || !url || typeof WebSocketImpl !== 'function') return;
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      scheduleRetry();
      return;
    }
    socket = ws;
    ws.onmessage = (message) => {
      if (socket !== ws || stopped) return;
      let frame;
      try {
        frame = JSON.parse(message.data);
      } catch {
        return;
      }
      if (frame?.type === 'snapshot') {
        hub = createHubState();
        retryMs = HUB_RETRY_MS;
        stopPolling();
        setHubLive(true);
      }
      if (!hub || !applyHubFrame(hub, frame)) return;
      if (frame.type === 'source.updated') {
        dispatchSourceUpdated(target, frame);
        onEvent(frame);
      }
      callback(freshnessFromHub(hub, now()));
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      hub = null;
      setHubLive(false);
      if (stopped) return;
      startPolling();
      scheduleRetry();
    };
    ws.onerror = () => {};
  }

  startPolling();
  connect();
  return () => {
    stopped = true;
    stopPolling();
    if (retryTimer !== null) clearTimeoutImpl(retryTimer);
    retryTimer = null;
    const ws = socket;
    socket = null;
    hub = null;
    setHubLive(false);
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
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
/* The console's chat drawer is pinned to the top of the window. */
html.gev-strip-flow #chatbox { top: var(--gev-strip-height); height: calc(100% - var(--gev-strip-height)); }
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
#gev-strip .gev-pill { margin-left: auto; font: inherit; letter-spacing: 0.04em; color: #0b0f14; background: #38bdf8; border: 0; border-radius: 10px; padding: 3px 10px; cursor: pointer; }
#gev-strip .gev-pill[hidden] { display: none; }
#gev-strip .gev-pill:not([hidden]) + .gev-fresh { margin-left: 10px; }
@media (max-width: 640px) {
  #gev-strip a { padding: 6px 6px; }
  #gev-strip .gev-fresh { display: none; }
}
`;

/** The hash the CHAT link carries; on a console page it opens the chat drawer. */
export const CHAT_HASH = '#ask';

/**
 * Open the console's chat drawer (`#chatbox`, toggled by `#chatbtn`) and
 * focus its question box. Returns false on pages without one (the globe).
 */
export function openConsoleChat(doc = globalThis.document) {
  const button = doc.getElementById('chatbtn');
  if (!button) return false;
  const box = doc.getElementById('chatbox');
  if (!box || !box.classList.contains('open')) button.click();
  doc.getElementById('chatq')?.focus();
  return true;
}

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
  // H15: console pages show "new data · refresh" instead of reloading; the
  // globe refreshes its layers in place (src/hosting/liveRefresh.js).
  const onGlobe = Boolean(doc.getElementById('cesiumContainer'));
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'gev-pill';
  pill.textContent = 'new data · refresh';
  pill.hidden = true;
  pill.addEventListener('click', () => loc?.reload?.());
  nav.appendChild(pill);
  const fresh = doc.createElement('span');
  fresh.className = 'gev-fresh';
  fresh.dataset.state = 'offline';
  fresh.setAttribute('role', 'status');
  fresh.textContent = 'checking…';
  nav.appendChild(fresh);
  // Outside <body>, so the shifted body cannot clip or move it.
  root.insertBefore(nav, doc.body);

  const chatFromHash = () => {
    if (loc?.hash === CHAT_HASH) openConsoleChat(doc);
  };
  chatFromHash();
  globalThis.addEventListener?.('hashchange', chatFromHash);

  subscribeFreshness(
    (freshness) => {
      fresh.dataset.state = freshness.state;
      fresh.textContent = formatFreshness(freshness);
      fresh.title = freshness.stale.length
        ? `Late: ${freshness.stale.join(', ')}`
        : '';
    },
    {
      onEvent: (frame) => {
        if (!onGlobe && frame.rows > 0) {
          pill.hidden = false;
          pill.title = `${frame.source} wrote ${frame.rows} rows`;
        }
      },
    },
  );
  return nav;
}

if (typeof document !== 'undefined' && !globalThis.__GEV_STRIP_MANUAL__) {
  mountStrip();
}
