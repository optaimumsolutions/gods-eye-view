import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChokepointSnapshot,
  deviationStatus,
  formatDeviation,
  normalizeChokepointDailyRows,
  normalizeChokepointPoints,
} from './records.js';
import { createPortWatchChokepointSource } from './source.js';

function point(portid, portname, lon, lat) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { portid, portname },
  };
}

function daily(portid, date, n_tanker) {
  return { attributes: { portid, date, n_tanker, capacity_tanker: 1, n_total: 2 } };
}

/** Build `days` consecutive daily rows ending on `end` with the given tanker rate. */
function series(portid, end, days, rate) {
  const rows = [];
  const endMs = Date.parse(`${end}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(endMs - i * 86_400_000).toISOString().slice(0, 10);
    rows.push({ id: portid, date, tankers: typeof rate === 'function' ? rate(i) : rate });
  }
  return rows;
}

test('chokepoint geometry is validated as a complete feed', () => {
  const ok = normalizeChokepointPoints({
    features: [point('chokepoint6', 'Strait of Hormuz', 56.86, 26.3)],
  });
  assert.deepEqual(ok, [{ id: 'chokepoint6', name: 'Strait of Hormuz', lon: 56.86, lat: 26.3 }]);
  assert.equal(normalizeChokepointPoints(null), null);
  assert.equal(normalizeChokepointPoints({ features: [point('x', 'Bad lon', 181, 0)] }), null);
  assert.equal(normalizeChokepointPoints({ features: [point('x', '', 0, 0)] }), null);
  assert.equal(
    normalizeChokepointPoints({ features: [point('dup', 'A', 0, 0), point('dup', 'B', 1, 1)] }),
    null,
  );
  const line = { ...point('l', 'Line', 0, 0), geometry: { type: 'LineString', coordinates: [0, 0] } };
  assert.equal(normalizeChokepointPoints({ features: [line] }), null);
});

test('daily rows accept ISO strings and epoch dates and reject missing identity', () => {
  const rows = normalizeChokepointDailyRows({
    features: [daily('chokepoint1', '2026-09-13', 16), daily('chokepoint2', Date.UTC(2026, 8, 12), null)],
  });
  assert.deepEqual(rows, [
    { id: 'chokepoint1', date: '2026-09-13', tankers: 16, tankerCapacity: 1, total: 2 },
    { id: 'chokepoint2', date: '2026-09-12', tankers: null, tankerCapacity: 1, total: 2 },
  ]);
  assert.equal(normalizeChokepointDailyRows({ features: [daily('', '2026-09-13', 1)] }), null);
  assert.equal(normalizeChokepointDailyRows({ features: [daily('p', 'not a date', 1)] }), null);
  assert.equal(normalizeChokepointDailyRows({}), null);
});

test('windows anchor on the newest published day, not today', () => {
  const points = [{ id: 'hormuz', name: 'Strait of Hormuz', lon: 56.86, lat: 26.3 }];
  // 90 days at 40/day, then the last 7 published days collapse to 20/day.
  const rows = series('hormuz', '2026-09-13', 97, (i) => (i < 7 ? 20 : 40));
  const { rows: [row], latestDate } = buildChokepointSnapshot(points, rows);
  assert.equal(latestDate, '2026-09-13');
  assert.equal(row.latestDate, '2026-09-13');
  assert.equal(row.recentDays, 7);
  assert.equal(row.baselineDays, 90);
  assert.equal(row.recentAvg, 20);
  // Baseline is the newest 90 days: 83 at 40 and 7 at 20.
  assert.ok(Math.abs(row.baselineAvg - (83 * 40 + 7 * 20) / 90) < 1e-9);
  assert.ok(row.deviationPct < -40);
  assert.equal(row.status, 'collapse');
  assert.equal(row.history.length, 30);
  assert.equal(row.history.at(-1).date, '2026-09-13');
});

test('a republished day replaces its earlier copy and missing data reads unknown', () => {
  const points = [
    { id: 'a', name: 'A', lon: 0, lat: 0 },
    { id: 'b', name: 'B', lon: 1, lat: 1 },
  ];
  const rows = [
    { id: 'a', date: '2026-09-10', tankers: 10 },
    { id: 'a', date: '2026-09-10', tankers: 30 },
    { id: 'a', date: '2026-09-11', tankers: 30 },
  ];
  const { rows: [a, b] } = buildChokepointSnapshot(points, rows);
  assert.equal(a.baselineDays, 2);
  assert.equal(a.recentAvg, 30);
  assert.equal(a.baselineAvg, 30);
  assert.equal(a.status, 'normal');
  assert.equal(b.baselineDays, 0);
  assert.equal(b.recentAvg, null);
  assert.equal(b.deviationPct, null);
  assert.equal(b.status, 'unknown');
  assert.equal(b.latestDate, null);
});

test('deviation bands and formatting', () => {
  assert.equal(deviationStatus(-54), 'collapse');
  assert.equal(deviationStatus(-40), 'collapse');
  assert.equal(deviationStatus(-25), 'down');
  assert.equal(deviationStatus(-19), 'normal');
  assert.equal(deviationStatus(0), 'normal');
  assert.equal(deviationStatus(25), 'up');
  assert.equal(deviationStatus(57), 'surge');
  assert.equal(deviationStatus(null), 'unknown');
  assert.equal(deviationStatus(Number.NaN), 'unknown');
  assert.equal(formatDeviation(-54.4), '-54%');
  assert.equal(formatDeviation(57.5), '+58%');
  assert.equal(formatDeviation(0.2), '0%');
  assert.equal(formatDeviation(null), 'n/a');
});

test('the source pages daily rows, anchors the query window, and rejects failures', async () => {
  const requests = [];
  const pageOne = Array.from({ length: 2 }, (_, i) => daily('chokepoint6', `2026-09-1${i}`, 40));
  const pageTwo = [daily('chokepoint6', '2026-09-13', 20)];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (url.includes('PortWatch_chokepoints_database'))
      return {
        ok: true,
        json: async () => ({ features: [point('chokepoint6', 'Strait of Hormuz', 56.86, 26.3)] }),
      };
    const offset = Number(new URL(url).searchParams.get('resultOffset'));
    return {
      ok: true,
      json: async () =>
        offset === 0
          ? { features: pageOne, exceededTransferLimit: true }
          : { features: pageTwo, exceededTransferLimit: false },
    };
  };
  const source = createPortWatchChokepointSource({
    fetchImpl,
    now: () => Date.parse('2026-09-16T12:00:00Z'),
    pageSize: 2,
  });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.latestDate, '2026-09-13');
  assert.equal(snapshot.rows[0].name, 'Strait of Hormuz');
  assert.equal(snapshot.rows[0].baselineDays, 3);
  assert.equal(snapshot.rows[0].recentAvg, (40 + 40 + 20) / 3);
  const dailyUrls = requests.filter((url) => url.includes('Daily_Chokepoints_Data'));
  assert.equal(dailyUrls.length, 2);
  const where = new URL(dailyUrls[0]).searchParams.get('where');
  assert.equal(where, "date >= DATE '2026-05-19'");
  assert.equal(new URL(dailyUrls[1]).searchParams.get('resultOffset'), '2');

  const failing = createPortWatchChokepointSource({
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  await assert.rejects(failing.getSnapshot(), /HTTP 503/);
  const arcgisError = createPortWatchChokepointSource({
    fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: 400 } }) }),
  });
  await assert.rejects(arcgisError.getSnapshot(), /error 400/);
});

test('paging follows the server transfer-limit flag even when the server caps below the page size', async () => {
  const offsets = [];
  const fetchImpl = async (url) => {
    if (url.includes('PortWatch_chokepoints_database'))
      return { ok: true, json: async () => ({ features: [point('p', 'P', 0, 0)] }) };
    const offset = Number(new URL(url).searchParams.get('resultOffset'));
    offsets.push(offset);
    // Requested 5 per page; the server returns one row per page and flags more.
    const pages = [
      { features: [daily('p', '2026-09-10', 10)], exceededTransferLimit: true },
      { features: [daily('p', '2026-09-11', 20)], exceededTransferLimit: true },
      { features: [daily('p', '2026-09-12', 30)], exceededTransferLimit: false },
    ];
    return { ok: true, json: async () => pages[offsets.length - 1] };
  };
  const source = createPortWatchChokepointSource({ fetchImpl, pageSize: 5 });
  const snapshot = await source.getSnapshot();
  assert.deepEqual(offsets, [0, 1, 2]);
  assert.equal(snapshot.latestDate, '2026-09-12');
  assert.equal(snapshot.rows[0].baselineDays, 3);
  assert.equal(snapshot.rows[0].recentAvg, 20);
});
