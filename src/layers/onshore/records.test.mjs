import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_COLUMNS,
  facilityStamp,
  formatApi,
  mapAnalystRecord,
  mapClusterAnalystRecord,
  normaliseOnshoreDataset,
  onshoreMetaLine,
  readingFrom,
  reconciliationPhrase,
} from './records.js';
import { clusters, facility, months, payload, reading } from './fixtures.mjs';

const NOW = Date.parse('2026-09-21T18:00:00Z');

test('the reading columns are the bundle contract and both rates derive one way', () => {
  assert.deepEqual(
    [...READING_COLUMNS],
    ['oil', 'water', 'days', 'runs', 'gas', 'gasSold', 'flared'],
  );
  const r = readingFrom(reading(), '2026-07');
  assert.equal(r.gasMcf, 2532);
  assert.equal(r.oilBbl, 459);
  assert.equal(r.days, 26);
  assert.ok(Math.abs(r.gasMcfd - 2532 / 31) < 1e-9, 'per calendar day');
  assert.ok(
    Math.abs(r.gasMcfdProducing - 2532 / 26) < 1e-9,
    'per producing day',
  );
  assert.ok(Math.abs(r.oilBopd - 459 / 31) < 1e-9);
  assert.ok(Math.abs(r.flaredShare - 592 / 2532) < 1e-9);
  // Days of zero: no producing-day rate, never a division by zero.
  const idle = readingFrom(reading({ gas: 0, oil: 0, days: 0 }), '2026-07');
  assert.equal(idle.gasMcfdProducing, null);
  assert.equal(idle.flaredShare, null);
  assert.equal(readingFrom(null, '2026-07'), null);
  assert.equal(
    readingFrom([null, null, null, null, null, null, null], '2026-07'),
    null,
  );
  // A partly filed month keeps what was filed.
  const partial = readingFrom(
    [null, null, 30, null, 1500, null, null],
    '2026-06',
  );
  assert.equal(partial.oilBbl, null);
  assert.equal(partial.gasMcf, 1500);
  assert.equal(formatApi('33053039010000'), '33-053-03901');
  assert.equal(formatApi('abc'), 'abc');
});

test('normaliseOnshoreDataset ranks producers by gas and keeps quiet and absent wells after them', () => {
  const snapshot = normaliseOnshoreDataset(
    payload([
      facility('33053039010000', { current: reading({ gas: 2532 }) }),
      facility('33053039020000', {
        current: reading({ gas: 9000 }),
        name: 'BIG 1H',
      }),
      facility('33053039030000', {
        status: 'quiet',
        current: reading({ gas: 0, oil: 0, days: 0, gasSold: 0, flared: 0 }),
      }),
      facility('33053039040000', {
        status: 'absent',
        current: null,
        prior: null,
        lastYear: null,
        summary: null,
      }),
      facility('33053039050000', { lat: null }),
    ]),
    { clusters: clusters(), fetchedAt: NOW },
  );
  assert.equal(snapshot.layerId, 'production-williston');
  assert.equal(snapshot.regionId, 'williston');
  assert.equal(snapshot.currentMonth, '2026-07');
  assert.equal(snapshot.currentIndex, 23);
  assert.equal(
    snapshot.rows.length,
    4,
    'the well without coordinates is dropped',
  );
  assert.deepEqual(
    snapshot.rows.map((r) => r.id),
    ['33053039020000', '33053039010000', '33053039030000', '33053039040000'],
  );
  assert.deepEqual(
    snapshot.rows.map((r) => r.rank),
    [1, 2, null, null],
  );
  assert.deepEqual(
    snapshot.rows.map((r) => r.status),
    ['producing', 'producing', 'quiet', 'absent'],
  );
  assert.deepEqual(
    snapshot.rows.map((r) => r.yoy.class),
    ['up', 'down', 'quiet', 'unknown'],
  );
  assert.equal(snapshot.counts.producing, 2);
  assert.equal(snapshot.counts.quiet, 1);
  assert.equal(snapshot.counts.absent, 1);
  assert.equal(snapshot.counts.placed, 4);
  assert.equal(snapshot.counts.facilities, 5);
  assert.ok(Math.abs(snapshot.counts.gasMcfdTotal - (2532 + 9000) / 31) < 1e-6);
  assert.ok(Math.abs(snapshot.gasMaxMcfd - 9000 / 31) < 1e-6);
  assert.ok(snapshot.byId.get('33053039020000'));
  assert.ok(Object.isFrozen(snapshot.rows[0]));
  // Clusters: ranked by gas, with the change class and the producing count.
  assert.deepEqual(
    snapshot.clusters.fields.map((f) => f.id),
    ['ALEXANDER', 'ZION'],
  );
  assert.equal(snapshot.clusters.fields[0].rank, 1);
  assert.equal(snapshot.clusters.fields[0].yoy.class, 'up');
  assert.equal(snapshot.clusters.fields[0].producing, 100);
  assert.ok(
    Math.abs(snapshot.clusters.fields[0].current.gasMcfd - 80_000 / 31) < 1e-6,
  );
  assert.equal(snapshot.clusters.fields[1].yoy.class, 'quiet');
  assert.equal(snapshot.clusters.counties.length, 1);
  assert.equal(snapshot.counts.fields, 2);
  assert.ok(Math.abs(snapshot.counts.clusterGasMaxMcfd - 80_000 / 31) < 1e-6);
});

test('each row carries current, prior and last-year readings, the change class, the window and a stamp', () => {
  const snapshot = normaliseOnshoreDataset(
    payload([facility('33053039010000')]),
    {
      fetchedAt: NOW,
    },
  );
  const row = snapshot.rows[0];
  assert.equal(row.api, '33-053-03901');
  assert.equal(row.name, 'WELL 0000');
  assert.equal(row.grain, 'well');
  assert.equal(row.cadence, 'monthly');
  assert.ok(Math.abs(row.current.gasMcfd - 2532 / 31) < 1e-9);
  assert.equal(row.prior.gasMcf, 2400);
  assert.equal(row.prior.month, '2026-06');
  assert.equal(row.lastYear.gasMcf, 3100);
  assert.equal(row.lastYear.month, '2025-07');
  assert.equal(row.yoy.class, 'down');
  assert.equal(row.yoy.pct, -18.3);
  assert.equal(row.summary.peakGasMcfd, 210.5);
  assert.ok(
    Math.abs(
      row.declineFromPeakPct - Math.round((1 - 2532 / 31 / 210.5) * 1000) / 10,
    ) < 1e-9,
  );
  assert.equal(row.observation.freshnessClass, 'published');
  assert.equal(row.observation.observedAt, '2026-07-31T23:59:59.000Z');
  assert.equal(row.observation.publishedAt, '2026-09-21T00:00:00.000Z');
  assert.equal(row.observation.headline, 'WELL 0000 82 Mcf/d');
  assert.equal(facilityStamp(row, NOW), 'as of 2026-07-31 · 51d lag');
  assert.equal(snapshot.asOf, 'as of 2026-07 · ND DMR');
  assert.equal(snapshot.sources[0].short, 'ND DMR');
});

test('the panel line names the light month, the filed count and the EIA reconciliation', () => {
  const snapshot = normaliseOnshoreDataset(
    payload([facility('33053039010000')], {
      counts: { facilities: 1, reported: 20231, unplaced: 0 },
    }),
    { fetchedAt: NOW },
  );
  assert.equal(
    onshoreMetaLine(snapshot),
    '1 PRODUCING · 0.00 BCF/D · 0.00 MMBBL/D · AS OF 2026-07 · 20,231 FILED (92 % OF USUAL) · 94 % OF EIA GROSS (JUN)',
  );
  assert.equal(reconciliationPhrase(snapshot), '94 % OF EIA GROSS (JUN)');
  assert.equal(onshoreMetaLine(null), 'state files · no bundle loaded');
  const record = mapAnalystRecord(snapshot.rows[0]);
  assert.equal(record.api, '33-053-03901');
  assert.equal(record.yoyClass, 'down');
  assert.equal(record.pools, 'BAKKEN');
  assert.equal(JSON.stringify(record).includes('undefined'), false);
  const withClusters = normaliseOnshoreDataset(
    payload([facility('33053039010000')]),
    {
      clusters: clusters(),
      fetchedAt: NOW,
    },
  );
  const cluster = mapClusterAnalystRecord(withClusters.clusters.fields[0]);
  assert.equal(cluster.kind, 'field');
  assert.equal(cluster.producing, 100);
  assert.equal(JSON.stringify(cluster).includes('undefined'), false);
});

test('a malformed payload is refused rather than rendered empty', () => {
  for (const bad of [
    null,
    {},
    { months: [], facilities: [] },
    { ...payload([]), region: null },
    { ...payload([]), current: { month: '1999-01' } },
    { ...payload([]), retrieved: '' },
  ]) {
    assert.equal(
      normaliseOnshoreDataset(bad),
      null,
      JSON.stringify(bad).slice(0, 60),
    );
  }
});

test('a synthetic hundred-thousand-well region normalises inside the budget (milestone 0)', () => {
  const rows = [];
  for (let i = 0; i < 100_000; i += 1) {
    rows.push(
      facility(`33${String(1_000_000_000 + i).padStart(12, '0')}`, {
        lat: 46 + (i % 1000) / 500,
        lon: -104 + Math.floor(i / 1000) / 50,
        current: reading({ gas: (i * 37) % 5000 }),
        status: i % 10 === 0 ? 'quiet' : 'producing',
      }),
    );
  }
  const started = performance.now();
  const snapshot = normaliseOnshoreDataset(payload(rows), { fetchedAt: NOW });
  const elapsed = performance.now() - started;
  assert.equal(snapshot.rows.length, 100_000);
  assert.equal(snapshot.rows[0].rank, 1);
  assert.ok(
    elapsed < 5_000,
    `normalised 100,000 wells in ${Math.round(elapsed)} ms`,
  );
});
