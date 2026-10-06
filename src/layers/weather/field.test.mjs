import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FIELD_STAT,
  FIELD_STATS,
  FIELD_UPSCALE,
  POPULATION_STATS,
  decodeGrid,
  paintField,
  percentileRanks,
  rampColor,
  rampLegend,
  weightByPopulation,
} from './fieldModel.js';
import {
  createOracleFieldSource,
  normalizeFieldManifest,
} from './fieldSource.js';
import { fixtureSkill } from './fixtures.mjs';

const ROWS = 3;
const COLS = 4;
const manifestPayload = (init = '2026-09-29') => ({
  source: 'Oil Oracle store',
  model: 'AIFS_ENS',
  init,
  observedAt: `${init}T00:00:00Z`,
  fetchedAt: `${init}T23:06:39Z`,
  days: ['2026-09-30', '2026-10-01'],
  leads: [1, 2],
  stats: ['p10', 'p50', 'p90', 'spread', 'freeze', 'tmax'],
  scale: { p50: 0.1, spread: 0.1, freeze: 0.001 },
  units: { p50: 'degF' },
  grid: {
    lat0: 50,
    lon0: -126,
    di: 0.25,
    rows: ROWS,
    cols: COLS,
    latS: 49.5,
    lonE: -125.25,
  },
  members: 51,
  freezeF: 32,
  provider: 'ECMWF AIFS ENS, open data (CC BY 4.0)',
});
const gridPayload = (stat, lead, values, scale = 0.1) => ({
  init: '2026-09-29',
  day: '2026-09-30',
  lead,
  stat,
  scale,
  min: Math.min(...values),
  max: Math.max(...values),
  values,
});

test('ramps are piecewise-linear and clamped; the legend names its stops', () => {
  assert.deepEqual(rampColor('temperature', -100), [120, 40, 200]);
  assert.deepEqual(rampColor('temperature', 200), [150, 0, 40]);
  assert.deepEqual(rampColor('temperature', 32), [120, 220, 255]);
  const mid = rampColor('temperature', 10); // halfway between 0 and 20
  assert.deepEqual(mid, [50, 115, 230]);
  assert.deepEqual(rampColor('temperature', NaN), [107, 114, 128]);
  const legend = rampLegend('freeze', 3);
  assert.deepEqual(
    legend.map((s) => s.label),
    ['0%', '50%', '100%'],
  );
  assert.match(legend[0].color, /^rgb\(/);
  assert.equal(rampLegend('p50')[0].label, '-20°F');
  assert.equal(FIELD_STATS[DEFAULT_FIELD_STAT].label, 'p50 TMIN');
  // M7 (§11.8.15 D7.4/D7.5): degree-day chips 0 → 40, the people chips 0 → 100 %
  assert.deepEqual(
    rampLegend('hdd', 3).map((s) => s.label),
    ['0', '20', '40'],
  );
  assert.deepEqual(
    rampLegend('hddPop', 3).map((s) => s.label),
    ['0%', '50%', '100%'],
  );
  assert.deepEqual(POPULATION_STATS, { hddPop: 'hdd', cddPop: 'cdd' });
  assert.deepEqual(rampColor('people', 0), [30, 30, 45]);
  assert.deepEqual(rampColor('degreeDays', 99), [220, 40, 60]);
});

test('weightByPopulation normalizes the degree-day × people product to the day max; empty cells read 0', () => {
  const hdd = Float32Array.from([10, 20, NaN, 5]);
  const pop = Float32Array.from([1000, 250, 9000, 0]);
  const out = weightByPopulation(hdd, pop);
  assert.equal(out.max, 10_000);
  assert.deepEqual([...out.values], [1, 0.5, 0, 0]);
  assert.throws(() => weightByPopulation(hdd, Float32Array.from([1])), /match/);
  const none = weightByPopulation(
    Float32Array.from([0, 0]),
    Float32Array.from([1, 1]),
  );
  assert.equal(none.max, 0);
  assert.deepEqual([...none.values], [0, 0]);
});

test('percentile ranks span 0..1 and ignore NaN', () => {
  const r = percentileRanks(new Float32Array([5, NaN, 1, 3]));
  assert.equal(r[2], 0);
  assert.equal(r[3], 0.5);
  assert.equal(r[0], 1);
  assert.ok(Number.isNaN(r[1]));
});

test('paintField upscales cells to blocks, fades by lead skill × spread percentile, hides NaN', () => {
  const values = new Float32Array([
    60,
    60,
    60,
    60,
    60,
    60,
    60,
    60,
    60,
    60,
    60,
    NaN,
  ]);
  const spread = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0]); // one very unsure cell
  const skill = fixtureSkill(); // lead 7 confidence 0.65 → alphaLead 0.7725
  const out = paintField({
    stat: 'p50',
    values,
    spread,
    rows: ROWS,
    cols: COLS,
    lead: 7,
    skill,
    upscale: 2,
  });
  assert.equal(out.width, COLS * 2);
  assert.equal(out.height, ROWS * 2);
  assert.ok(Math.abs(out.alphaLead - 0.7725) < 1e-9);
  const alphaAt = (r, c) => out.data[(r * 2 * out.width + c * 2) * 4 + 3];
  // a confident cell: alphaLead × alphaSpread(rank ≈ 0.45 of the ties) — brighter than the unsure one
  const sure = alphaAt(0, 0);
  const unsure = alphaAt(2, 2); // spread 20 → rank 1 → alphaSpread 0.4
  assert.ok(sure > unsure, `${sure} > ${unsure}`);
  assert.ok(Math.abs(unsure - Math.round(255 * 0.7725 * 0.4)) <= 1);
  assert.equal(alphaAt(2, 3), 0, 'NaN cell is transparent');
  // every pixel of a block is identical (nearest-neighbour)
  const p = (r, c) =>
    Array.from(
      out.data.slice((r * out.width + c) * 4, (r * out.width + c) * 4 + 4),
    );
  assert.deepEqual(p(0, 0), p(1, 1));
  assert.equal(FIELD_UPSCALE, 4);
  assert.throws(
    () => paintField({ values: new Float32Array(2), rows: 3, cols: 4 }),
    /rows × cols/,
  );
});

test('decodeGrid applies the scale; the manifest normalizes the grid box', () => {
  assert.deepEqual(
    Array.from(decodeGrid({ scale: 0.1, values: [123, -45] })),
    [12.3, -4.5].map((v) => Math.fround(v)),
  );
  assert.equal(decodeGrid({ values: 'x' }), null);
  const m = normalizeFieldManifest(manifestPayload());
  assert.equal(m.grid.north, 50);
  assert.equal(m.grid.west, -126);
  assert.equal(m.grid.east, -125.25);
  assert.equal(m.initialisedAt, '2026-09-29T00:00:00.000Z');
  assert.equal(
    normalizeFieldManifest({ error: 'no field in the store yet' }),
    null,
  );
});

test('the field source caches grids per init and drops them on a new run', async () => {
  let init = '2026-09-29';
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const u = new URL(String(url), 'http://x/');
    const stat = u.searchParams.get('stat');
    const day = u.searchParams.get('day');
    if (!stat)
      return { ok: true, status: 200, json: async () => manifestPayload(init) };
    assert.match(day, /^D\+\d+$/);
    return {
      ok: true,
      status: 200,
      json: async () =>
        gridPayload(
          stat,
          Number(day.slice(2)),
          Array.from({ length: ROWS * COLS }, (_, i) => 600 + i),
        ),
    };
  };
  const source = createOracleFieldSource({ fetchImpl });
  const m = await source.getManifest();
  assert.equal(m.init, '2026-09-29');
  const g1 = await source.getGrid(1, 'p50');
  assert.equal(g1.values.length, ROWS * COLS);
  assert.ok(Math.abs(g1.values[0] - 60) < 1e-6);
  const g2 = await source.getGrid(1, 'p50');
  assert.equal(g1, g2, 'cached');
  assert.equal(calls.filter((u) => u.includes('stat=')).length, 1);
  init = '2026-09-30';
  await source.getManifest();
  await source.getGrid(1, 'p50');
  assert.equal(
    calls.filter((u) => u.includes('stat=')).length,
    2,
    'a new init refetches',
  );
  assert.equal(source.getStats().init, '2026-09-30');
});

test('field freshness: the oracle verdict wins, else the run age on the 48 h / 96 h tiers', async () => {
  const { fieldFreshness } = await import('./fieldSource.js');
  const now = Date.parse('2026-10-06T20:00:00Z');
  assert.equal(
    fieldFreshness({ init: '2026-10-05', freshness: { state: 'stale' } }, now),
    'stale',
  );
  assert.equal(fieldFreshness({ init: '2026-10-05' }, now), 'ok');
  assert.equal(fieldFreshness({ init: '2026-10-03' }, now), 'late');
  assert.equal(fieldFreshness({ init: '2026-09-30' }, now), 'stale');
});
