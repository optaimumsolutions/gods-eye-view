import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORACLE_SOURCE_LABEL,
  createOracleChokepointSource,
  createPreferredChokepointSource,
  normalizeOracleChokepoints,
} from './oracleSource.js';
import { buildChokepointSnapshot } from './records.js';

const POINTS = [
  { id: 'chokepoint1', name: 'Suez Canal', lon: 32.4369, lat: 30.5933 },
  { id: 'chokepoint2', name: 'Panama Canal', lon: -79.7672, lat: 9.1205 },
];
const NOW = Date.parse('2026-09-24T16:00:00Z');

/** `days` consecutive `[date, nTotal, nTanker]` rows ending on `end`. */
function series(end, days, tankers) {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(endMs - i * 86_400_000).toISOString().slice(0, 10);
    rows.push([date, tankers * 2, tankers]);
  }
  return rows;
}

/** The /api/oracle/chokepoints payload shape (tools/oracle_api.py). */
function payload(end = '2026-09-20') {
  return {
    source: 'Oil Oracle store',
    window: { from: '2026-05-24', to: end, days: 120 },
    chokepoints: [
      { id: 'chokepoint1', name: 'Suez Canal', observedAt: end, series: series(end, 90, 20) },
      { id: 'chokepoint2', name: 'Panama Canal', observedAt: end, series: series(end, 90, 10) },
    ],
  };
}

function fetchReturning(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, calls };
}

test('normalizeOracleChokepoints maps route series onto daily rows', () => {
  const rows = normalizeOracleChokepoints(payload());
  assert.equal(rows.length, 180);
  assert.deepEqual(rows[0], {
    id: 'chokepoint1',
    date: '2026-06-23',
    tankers: 20,
    tankerCapacity: null,
    total: 40,
  });
});

test('normalizeOracleChokepoints rejects malformed payloads whole', () => {
  assert.equal(normalizeOracleChokepoints({}), null);
  assert.equal(normalizeOracleChokepoints({ chokepoints: [{ id: '', series: [] }] }), null);
  assert.equal(
    normalizeOracleChokepoints({ chokepoints: [{ id: 'x', series: [['20-09-2026', 1, 1]]}] }),
    null,
  );
  assert.equal(normalizeOracleChokepoints({ chokepoints: [{ id: 'x', series: 'no' }] }), null);
});

test('oracle source builds the same snapshot the PortWatch rows would', async () => {
  const { fetchImpl, calls } = fetchReturning(200, payload());
  const source = createOracleChokepointSource({ fetchImpl, now: () => NOW, points: POINTS });
  const snapshot = await source.getSnapshot();
  assert.equal(calls[0].url, '/api/oracle/chokepoints?days=120');
  assert.equal(snapshot.source, ORACLE_SOURCE_LABEL);
  assert.equal(snapshot.latestDate, '2026-09-20');
  const expected = buildChokepointSnapshot(POINTS, normalizeOracleChokepoints(payload()));
  assert.deepEqual(snapshot.rows, expected.rows);
  assert.equal(snapshot.rows[0].recentAvg, 20);
});

test('oracle source refuses HTTP errors, empty and stale stores', async () => {
  for (const [status, body] of [
    [404, { error: 'no route' }],
    [502, {}],
    [200, { chokepoints: [] }],
  ]) {
    const { fetchImpl } = fetchReturning(status, body);
    const source = createOracleChokepointSource({ fetchImpl, now: () => NOW, points: POINTS });
    await assert.rejects(source.getSnapshot());
  }
  const { fetchImpl } = fetchReturning(200, payload('2026-09-04'));
  const stale = createOracleChokepointSource({ fetchImpl, now: () => NOW, points: POINTS });
  await assert.rejects(stale.getSnapshot(), /stale: newest day 2026-09-04/);
});

test('preferred source uses the oracle when it answers', async () => {
  let fallbackCalls = 0;
  const source = createPreferredChokepointSource({
    primary: { getSnapshot: async () => ({ rows: [], latestDate: 'a', source: 'oracle' }) },
    fallback: {
      label: 'IMF PortWatch',
      getSnapshot: async () => {
        fallbackCalls++;
        return { rows: [], latestDate: 'b' };
      },
    },
  });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.source, 'oracle');
  assert.equal(fallbackCalls, 0);
});

test('preferred source falls back to PortWatch, labels it, and logs once', async () => {
  const logged = [];
  const source = createPreferredChokepointSource({
    primary: { getSnapshot: async () => { throw new Error('HTTP 404'); } },
    fallback: { label: 'IMF PortWatch', getSnapshot: async () => ({ rows: [1], latestDate: 'b' }) },
    onFallback: (error) => logged.push(error.message),
  });
  const first = await source.getSnapshot();
  await source.getSnapshot();
  assert.equal(first.source, 'IMF PortWatch');
  assert.deepEqual(first.rows, [1]);
  assert.deepEqual(logged, ['HTTP 404']);
});

test('preferred source never turns an abort into a fallback fetch', async () => {
  const controller = new AbortController();
  let fallbackCalls = 0;
  const source = createPreferredChokepointSource({
    primary: {
      getSnapshot: async () => {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
    },
    fallback: {
      label: 'IMF PortWatch',
      getSnapshot: async () => {
        fallbackCalls++;
        return { rows: [] };
      },
    },
    onFallback: () => {},
  });
  await assert.rejects(source.getSnapshot({ signal: controller.signal }), /aborted/);
  assert.equal(fallbackCalls, 0);
});
