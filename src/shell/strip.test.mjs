import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LATEST_INGEST_MAX_AGE_MS,
  NAV_LINKS,
  activeLinkId,
  formatFreshness,
  formatUtcClock,
  freshnessFromLogs,
  openConsoleChat,
  subscribeFreshness,
  applyHubFrame,
  createHubState,
  freshnessFromHub,
  hubUrl,
} from '../../public/gev-shell/strip.mjs';

// Shape of the VPS console's /logs.json on 2026-09-23 (trimmed).
const LOGS = {
  host: 'vps',
  live: true,
  tol: { quotes: 2, gdelt_news: 2, portwatch: 192, eia_spot: 36 },
  sources: {
    'eia_bulk:spot_prices': {
      run_at: '2026-09-02T21:47:47.641962+00:00',
      rows: 63319,
    },
    ng_storage: { run_at: '2026-09-15T14:03:41+00:00', rows: 12 },
    eia_spot: { run_at: '2026-09-22T23:00:05+00:00', rows: 7 },
    portwatch: { run_at: '2026-09-23T02:01:16.178520+00:00', rows: 7 },
    gdelt_news: { run_at: '2026-09-23T12:01:26.716359+00:00', rows: 481 },
    quotes: { run_at: '2026-09-23T14:15:07.392429+00:00', rows: 672 },
  },
  events: [],
};
const NOW = Date.parse('2026-09-23T14:45:00Z');

test('the strip links are the product pages, in order', () => {
  assert.deepEqual(
    NAV_LINKS.map((link) => `${link.label} ${link.href}`),
    [
      'GLOBE /',
      'MARKET /market',
      'GAS /gas',
      'WEATHER /weather',
      'TRADES /trades',
      'CHAT /market#ask',
    ],
  );
  assert.ok(Object.isFrozen(NAV_LINKS) && Object.isFrozen(NAV_LINKS[0]));
});

test('the current page is highlighted; unknown pages highlight nothing', () => {
  assert.equal(activeLinkId('/'), 'globe');
  assert.equal(activeLinkId('/index.html'), 'globe');
  assert.equal(activeLinkId('/market'), 'market');
  assert.equal(activeLinkId('/market/'), 'market');
  assert.equal(activeLinkId('/trades'), 'trades');
  assert.equal(activeLinkId('/elsewhere'), null);
  assert.equal(activeLinkId(undefined), 'globe');
});

test('a fresh store with every tolerated source in bounds is LIVE', () => {
  const freshness = freshnessFromLogs(LOGS, NOW);
  assert.deepEqual(freshness, {
    state: 'live',
    asOf: Date.parse('2026-09-23T14:15:07.392429+00:00'),
    host: 'store',
    stale: [],
  });
  assert.equal(formatFreshness(freshness), 'store as of 14:15Z · LIVE');
});

test('a source past twice its tolerance makes the strip STALE and names it', () => {
  const later = NOW + 3 * 3_600_000; // gdelt_news now 5.7 h old against 2 h tolerance
  const freshness = freshnessFromLogs(
    {
      ...LOGS,
      sources: {
        ...LOGS.sources,
        quotes: { run_at: new Date(later - 60_000).toISOString() },
      },
    },
    later,
  );
  assert.equal(freshness.state, 'stale');
  assert.deepEqual(freshness.stale, ['gdelt_news']);
  assert.equal(formatFreshness(freshness), 'store as of 17:44Z · STALE (1)');
});

test('no ingest for 75 minutes is STALE even with no tolerated source late', () => {
  const quiet = freshnessFromLogs(
    {
      host: 'mirror',
      sources: { quotes: { run_at: '2026-09-23T13:00:00Z' } },
      tol: {},
    },
    Date.parse('2026-09-23T13:00:00Z') + LATEST_INGEST_MAX_AGE_MS + 1,
  );
  assert.equal(quiet.state, 'stale');
  assert.equal(quiet.host, 'mirror');
  assert.equal(formatFreshness(quiet), 'mirror as of 13:00Z · STALE');
});

test('no answer or an unreadable answer is OFFLINE', () => {
  for (const logs of [null, undefined, 'x', {}, { host: 'vps' }]) {
    const freshness = freshnessFromLogs(logs, NOW);
    assert.equal(freshness.state, 'offline');
    assert.equal(formatFreshness(freshness), 'console · OFFLINE');
  }
  assert.equal(
    formatFreshness(
      freshnessFromLogs(
        { host: 'vps', sources: { x: { run_at: 'bad' } } },
        NOW,
      ),
    ),
    'store as of n/a · STALE',
  );
});

test('clock text is UTC hours and minutes', () => {
  assert.equal(formatUtcClock(Date.parse('2026-09-23T04:05:59Z')), '04:05Z');
});

test('subscribeFreshness polls /logs.json, reports failures as OFFLINE and stops cleanly', async () => {
  const requested = [];
  const answers = [
    async () => Response.json(LOGS),
    async () => new Response('bad gateway', { status: 502 }),
    async () => {
      throw new TypeError('network down');
    },
  ];
  let tick;
  let cleared = false;
  const seen = [];
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  const stop = subscribeFreshness((freshness) => seen.push(freshness.state), {
    fetchImpl: async (url) => {
      requested.push(url);
      return answers.shift()();
    },
    now: () => NOW,
    setIntervalImpl: (fn, ms) => {
      assert.equal(ms, 60_000);
      tick = fn;
      return 7;
    },
    clearIntervalImpl: (id) => {
      assert.equal(id, 7);
      cleared = true;
    },
  });
  await settled();
  tick();
  await settled();
  tick();
  await settled();
  assert.deepEqual(requested, ['/logs.json', '/logs.json', '/logs.json']);
  assert.deepEqual(seen, ['live', 'offline', 'offline']);
  stop();
  assert.equal(cleared, true);
});

test('the CHAT link opens the console chat drawer once and focuses the question', () => {
  const log = [];
  const element = (id, open = false) => ({
    classList: { contains: (name) => name === 'open' && open },
    click: () => log.push(`click ${id}`),
    focus: () => log.push(`focus ${id}`),
  });
  const page = (boxOpen) => ({
    getElementById: (id) =>
      ({
        chatbtn: element('chatbtn'),
        chatbox: element('chatbox', boxOpen),
        chatq: element('chatq'),
      })[id] ?? null,
  });
  assert.equal(openConsoleChat(page(false)), true);
  assert.deepEqual(log.splice(0), ['click chatbtn', 'focus chatq']);
  assert.equal(openConsoleChat(page(true)), true, 'already open: no toggle');
  assert.deepEqual(log.splice(0), ['focus chatq']);
  assert.equal(
    openConsoleChat({ getElementById: () => null }),
    false,
    'the globe has no chat drawer',
  );
});

/** A socket the test drives: `server.send(frame)`, `server.close()`. */
function fakeSocketFactory() {
  const sockets = [];
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.closed = false;
      sockets.push(this);
    }
    close() {
      this.closed = true;
    }
    serverSend(frame) {
      this.onmessage?.({ data: JSON.stringify(frame) });
    }
    serverClose() {
      this.onclose?.();
    }
  }
  return { FakeSocket, sockets };
}

test('hubUrl follows the page: wss on https, none outside a page', () => {
  assert.equal(
    hubUrl({ protocol: 'https:', host: 'commodities.optaimum.com' }),
    'wss://commodities.optaimum.com/api/events',
  );
  assert.equal(
    hubUrl({ protocol: 'http:', host: '127.0.0.1:4176' }),
    'ws://127.0.0.1:4176/api/events',
  );
  assert.equal(hubUrl(undefined), null);
  assert.equal(hubUrl({ protocol: 'file:', host: '' }), null);
});

test('hub frames: snapshot, writes, deadlines and outages drive the strip', () => {
  const state = createHubState();
  applyHubFrame(state, {
    type: 'snapshot',
    sources: [
      { source: 'quotes', lastRunAt: '2026-09-23T14:30:00.000Z' },
      { source: 'portwatch', lastRunAt: '2026-09-23T02:01:00.000Z' },
    ],
    health: [
      { component: 'console', state: 'live' },
      { component: 'askd', state: 'live' },
      { component: 'ingest:quotes', state: 'live' },
    ],
  });
  assert.deepEqual(freshnessFromHub(state, NOW), {
    state: 'live',
    asOf: Date.parse('2026-09-23T14:30:00Z'),
    host: 'store',
    stale: [],
  });
  applyHubFrame(state, {
    type: 'source.updated',
    source: 'quotes',
    rows: 4,
    runAt: '2026-09-23T14:44:00.000Z',
  });
  assert.equal(
    freshnessFromHub(state, NOW).asOf,
    Date.parse('2026-09-23T14:44:00Z'),
  );
  applyHubFrame(state, {
    type: 'health',
    component: 'ingest:quotes',
    state: 'stale',
  });
  applyHubFrame(state, { type: 'health', component: 'askd', state: 'offline' });
  const late = freshnessFromHub(state, NOW);
  assert.equal(late.state, 'stale');
  assert.deepEqual(late.stale, ['askd', 'quotes']);
  applyHubFrame(state, {
    type: 'health',
    component: 'console',
    state: 'offline',
  });
  assert.equal(freshnessFromHub(state, NOW).state, 'offline');
  assert.equal(applyHubFrame(state, { type: 'mystery' }), false);
});

test('subscribeFreshness prefers the hub, falls back to polling, and retries', async () => {
  const { FakeSocket, sockets } = fakeSocketFactory();
  const target = new EventTarget();
  const dispatched = [];
  target.addEventListener('gev:source-updated', (event) =>
    dispatched.push(event.detail),
  );
  const events = [];
  const seen = [];
  let polls = 0;
  let intervalCleared = 0;
  const retries = [];
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  const stop = subscribeFreshness((freshness) => seen.push(freshness.state), {
    fetchImpl: async () => {
      polls += 1;
      return Response.json(LOGS);
    },
    now: () => NOW,
    setIntervalImpl: () => 11,
    clearIntervalImpl: () => {
      intervalCleared += 1;
    },
    setTimeoutImpl: (fn, ms) => {
      retries.push(ms);
      return { fn };
    },
    clearTimeoutImpl: () => {},
    WebSocketImpl: FakeSocket,
    url: 'ws://127.0.0.1:4176/api/events',
    target,
    onEvent: (frame) => events.push(frame.source),
  });
  await settled();
  assert.equal(polls, 1, 'polls at once so the strip is never blank');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'ws://127.0.0.1:4176/api/events');

  sockets[0].serverSend({
    type: 'snapshot',
    sources: [{ source: 'quotes', lastRunAt: '2026-09-23T14:40:00.000Z' }],
    health: [{ component: 'console', state: 'live' }],
  });
  assert.equal(target.__gevHubLive, true);
  assert.equal(intervalCleared, 1, 'polling stops once the hub answers');
  sockets[0].serverSend({
    type: 'source.updated',
    source: 'quotes',
    rows: 4,
    runAt: '2026-09-23T14:44:00.000Z',
  });
  assert.deepEqual(events, ['quotes']);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].rows, 4);
  assert.equal(seen.at(-1), 'live');

  // The hub goes away: polling resumes and the socket is retried, backing off.
  sockets[0].serverClose();
  assert.equal(target.__gevHubLive, false);
  await settled();
  assert.equal(polls, 2);
  assert.deepEqual(retries, [5_000]);
  sockets.length = 0;
  const firstRetry = retries.length;
  stop();
  assert.equal(target.__gevHubLive, false);
  assert.equal(retries.length, firstRetry);
});
