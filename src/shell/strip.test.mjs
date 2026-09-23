import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LATEST_INGEST_MAX_AGE_MS,
  NAV_LINKS,
  activeLinkId,
  formatFreshness,
  formatUtcClock,
  freshnessFromLogs,
  subscribeFreshness,
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
