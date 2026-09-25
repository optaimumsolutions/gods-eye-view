import {
  healthFrame,
  heartbeatFrame,
  parseUtc,
  snapshotFrame,
  sourceRecord,
  sourceUpdatedFrame,
} from './eventContract.js';

/**
 * The M4 event hub (plan §15.7 R13.15–R13.17; contract in eventContract.js).
 * Holds the freshness of every oracle source and the health of the console
 * and askd, fans frames out to connected browsers, and pages Slack through
 * askd's localhost relay on the transitions that matter. Transport-free:
 * clients are `{ send(text) }`, time and HTTP are injected, so the whole state
 * machine is testable without sockets.
 */

export const HEARTBEAT_MS = 30_000;
export const PROBE_MS = 20_000;
export const PROBE_TIMEOUT_MS = 5_000;
export const PUBLISH_FRESHNESS_TIMEOUT_MS = 1_500;
export const FAILURES_FOR_OFFLINE = 2;
export const PAGES_PER_HOUR = 12;
export const PAGE_QUEUE_MAX = 20;

const PAGED_COMPONENTS = new Set(['console', 'askd']);

async function getJson(fetchImpl, url, { timeoutMs, headers = {} } = {}) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function createEventHub({
  consoleUrl = 'http://127.0.0.1:8011',
  askdUrl = 'http://127.0.0.1:8014',
  proxyKey = '',
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  setIntervalImpl = globalThis.setInterval,
  clearIntervalImpl = globalThis.clearInterval,
  heartbeatMs = HEARTBEAT_MS,
  probeMs = PROBE_MS,
  pagesPerHour = PAGES_PER_HOUR,
  log = console,
} = {}) {
  const freshnessUrl = `${trimSlash(consoleUrl)}/api/oracle/freshness`;
  const askdHealthUrl = `${trimSlash(askdUrl)}/health`;
  const relayUrl = `${trimSlash(askdUrl)}/relay/slack`;

  const clients = new Set();
  const sources = new Map();
  const health = new Map();
  const failures = new Map();
  const pageTimes = [];
  const pageQueue = [];
  const counters = {
    published: 0,
    framesSent: 0,
    pages: 0,
    pagesDropped: 0,
    pageFailures: 0,
  };
  let timers = [];
  let freshnessInFlight = null;

  function send(client, text) {
    try {
      client.send(text);
      counters.framesSent += 1;
    } catch (error) {
      log.warn?.('[gev-events] send failed', error?.message);
    }
  }

  function broadcast(frame) {
    const text = JSON.stringify(frame);
    for (const client of clients) send(client, text);
  }

  function healthList() {
    return [...health.values()].map((entry) =>
      healthFrame({ ...entry, at: now() }),
    );
  }

  function snapshot() {
    return snapshotFrame({
      sources: [...sources.values()],
      health: healthList(),
      at: now(),
    });
  }

  /**
   * Page through askd's relay. askd cannot relay its own outage: that page
   * is queued and flushed when askd answers again. Rate-limited per hour.
   */
  async function page(text) {
    const at = now();
    while (pageTimes.length && at - pageTimes[0] > 3_600_000) pageTimes.shift();
    if (pageTimes.length >= pagesPerHour) {
      counters.pagesDropped += 1;
      log.warn?.('[gev-events] page dropped (hourly cap)', text);
      return false;
    }
    if (health.get('askd')?.state === 'offline') {
      if (pageQueue.length < PAGE_QUEUE_MAX) pageQueue.push(text);
      else counters.pagesDropped += 1;
      return false;
    }
    pageTimes.push(at);
    try {
      const response = await fetchImpl(relayUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-oracle-proxy-key': proxyKey,
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      counters.pages += 1;
      return true;
    } catch (error) {
      counters.pageFailures += 1;
      if (pageQueue.length < PAGE_QUEUE_MAX) pageQueue.push(text);
      log.warn?.('[gev-events] page failed', error?.message);
      return false;
    }
  }

  async function flushPages() {
    while (pageQueue.length && health.get('askd')?.state !== 'offline') {
      const text = pageQueue.shift();
      if (!(await page(text))) break;
    }
  }

  function describe(component, state, detail) {
    const stamp = new Date(now()).toISOString().slice(0, 16).replace('T', ' ');
    const what = component.startsWith('ingest:')
      ? `source ${component.slice(7)}`
      : component;
    const verb =
      state === 'live'
        ? 'recovered'
        : state === 'offline'
          ? 'is OFFLINE'
          : 'is STALE';
    return `commodities hub ${stamp}Z: ${what} ${verb}${detail ? ` (${detail})` : ''}`;
  }

  /**
   * Record a component's state; broadcast and maybe page on a change. A
   * first observation never pages, and neither does recovering from one: a
   * restart does not re-page a condition that began before it.
   */
  function setHealth(
    component,
    state,
    { detail = null, pageable = false } = {},
  ) {
    const previous = health.get(component);
    if (previous?.state === state) return false;
    const entry = {
      component,
      state,
      since: now(),
      detail,
      initial: !previous,
    };
    health.set(component, entry);
    broadcast(healthFrame({ ...entry, at: now() }));
    const unpagedStart = previous?.initial && previous.state !== 'live';
    const askdBack = component === 'askd' && state === 'live';
    if (previous && pageable && !unpagedStart) {
      const text = describe(component, state, detail);
      // askd's recovery queues behind its own outage page, so both go in order.
      if (askdBack && pageQueue.length < PAGE_QUEUE_MAX) pageQueue.push(text);
      else void page(text);
    }
    if (askdBack) void flushPages();
    return true;
  }

  function probeResult(component, ok, detail) {
    if (ok) {
      failures.set(component, 0);
      setHealth(component, 'live', {
        pageable: PAGED_COMPONENTS.has(component),
      });
      return;
    }
    const count = (failures.get(component) ?? 0) + 1;
    failures.set(component, count);
    if (count >= FAILURES_FOR_OFFLINE || !health.has(component))
      setHealth(component, 'offline', {
        detail,
        pageable: PAGED_COMPONENTS.has(component),
      });
  }

  /** Deadline check: a source whose last write is past cadence + grace is stale. */
  function evaluateDeadlines() {
    const at = now();
    for (const record of sources.values()) {
      const deadline = parseUtc(record.deadline);
      if (deadline === null) continue;
      const state = at > deadline ? 'stale' : 'live';
      setHealth(`ingest:${record.source}`, state, {
        detail: state === 'stale' ? `no write since ${record.fetchedAt}` : null,
        pageable: record.critical,
      });
    }
  }

  function applyFreshness(payload) {
    for (const entry of payload?.sources ?? []) {
      const record = sourceRecord(entry);
      if (record.source) sources.set(record.source, record);
    }
  }

  /** Read /api/oracle/freshness through the console; doubles as its probe. */
  function refreshFreshness({ timeoutMs = PROBE_TIMEOUT_MS } = {}) {
    if (freshnessInFlight) return freshnessInFlight;
    freshnessInFlight = getJson(fetchImpl, freshnessUrl, { timeoutMs })
      .then(
        (payload) => {
          applyFreshness(payload);
          probeResult('console', true);
          evaluateDeadlines();
          return true;
        },
        (error) => {
          probeResult('console', false, error?.message ?? 'unreachable');
          return false;
        },
      )
      .finally(() => {
        freshnessInFlight = null;
      });
    return freshnessInFlight;
  }

  function probeAskd() {
    return getJson(fetchImpl, askdHealthUrl, {
      timeoutMs: PROBE_TIMEOUT_MS,
    }).then(
      (body) => probeResult('askd', body?.ok === true, 'unhealthy'),
      (error) => probeResult('askd', false, error?.message ?? 'unreachable'),
    );
  }

  /**
   * Items from the oracle's publish (already validated). Re-reads freshness
   * so each frame carries the store's observedAt, then emits one
   * source.updated per item, within the 5 s budget (R13.15, G13.6).
   */
  async function publish(items) {
    counters.published += items.length;
    await Promise.race([
      refreshFreshness({ timeoutMs: PUBLISH_FRESHNESS_TIMEOUT_MS }),
      new Promise((resolve) =>
        setTimeout(resolve, PUBLISH_FRESHNESS_TIMEOUT_MS + 100),
      ),
    ]);
    for (const item of items) {
      const record = sources.get(item.source);
      if (record) {
        record.lastRunAt = item.runAt ?? record.lastRunAt;
        record.lastRunRows = item.rows ?? record.lastRunRows;
      }
      broadcast(
        sourceUpdatedFrame({
          source: item.source,
          observedAt: record?.observedAt ?? null,
          rows: item.rows,
          runAt: item.runAt,
          at: now(),
        }),
      );
    }
    return items.length;
  }

  function addClient(client) {
    clients.add(client);
    send(client, JSON.stringify(snapshot()));
    return () => clients.delete(client);
  }

  function start() {
    if (timers.length) return;
    setHealth('globe', 'live');
    void refreshFreshness();
    void probeAskd();
    timers = [
      setIntervalImpl(() => broadcast(heartbeatFrame(now())), heartbeatMs),
      setIntervalImpl(() => {
        void refreshFreshness();
        void probeAskd();
      }, probeMs),
    ];
    for (const timer of timers) timer?.unref?.();
  }

  function stop() {
    for (const timer of timers) clearIntervalImpl(timer);
    timers = [];
    clients.clear();
  }

  function stats() {
    return {
      clients: clients.size,
      sources: sources.size,
      health: Object.fromEntries(
        [...health.values()].map((entry) => [entry.component, entry.state]),
      ),
      queuedPages: pageQueue.length,
      ...counters,
    };
  }

  return {
    addClient,
    publish,
    start,
    stop,
    stats,
    snapshot,
    refreshFreshness,
    probeAskd,
    evaluateDeadlines,
    flushPages,
  };
}
