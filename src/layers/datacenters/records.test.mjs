import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DEFAULT_GAS_ASSUMPTIONS,
  datacenterAsOf,
  formatCount,
  formatMw,
  formatUsdB,
  gasEquivalentMmcfd,
  mapAnalystRecord,
  normalizeDatacenterDataset,
  normalizeDatacenterSite,
} from './records.js';
import { createBundledDatacenterSource } from './source.js';

const BUNDLE_URL = new URL(
  '../../data/local_data/us_datacenters/datacenters.json',
  import.meta.url,
);

function loadBundle() {
  return JSON.parse(readFileSync(BUNDLE_URL, 'utf8'));
}

test('the bundle normalizes to five ranked US sites, largest IT power first', () => {
  const snapshot = normalizeDatacenterDataset(loadBundle());
  assert.ok(snapshot);
  assert.equal(snapshot.vintage, '2026-09-17');
  assert.equal(snapshot.asOf, 'as of 2026-09-17 · Epoch AI');
  assert.equal(snapshot.source.license, 'CC BY 4.0');
  assert.equal(snapshot.rows.length, 5);
  const ranks = snapshot.rows.map((r) => r.rank);
  assert.deepEqual(ranks, [1, 2, 3, 4, 5]);
  for (let i = 1; i < snapshot.rows.length; i++)
    assert.ok(snapshot.rows[i - 1].itPowerMw >= snapshot.rows[i].itPowerMw);
  assert.deepEqual(
    snapshot.rows.map((r) => r.id),
    [
      'colossus-2',
      'new-carlisle-rainier',
      'fairwater-atlanta',
      'meta-prometheus',
      'stargate-abilene',
    ],
  );
  for (const row of snapshot.rows) {
    assert.ok(Object.isFrozen(row));
    assert.ok(row.lat > 24 && row.lat < 50, `${row.id} latitude in the US`);
    assert.ok(row.lon > -125 && row.lon < -66, `${row.id} longitude in the US`);
    assert.ok(row.owner, `${row.id} owner`);
    assert.ok(row.itPowerMw > 0);
    assert.ok(row.facilityPowerMw >= row.itPowerMw);
    assert.ok(row.sources.length >= 3, `${row.id} carries its sources`);
    assert.ok(row.timeline.length >= 3);
    assert.ok(row.latestMilestone && !row.latestMilestone.projected);
  }
});

test('derived readings are null-safe and arithmetically right', () => {
  const site = normalizeDatacenterSite(
    {
      id: 'x',
      name: 'X',
      lat: 35,
      lon: -90,
      itPowerMw: 500,
      facilityPowerMw: 700,
      plannedItPowerMw: 1000,
      capexUsdB: 20,
    },
    DEFAULT_GAS_ASSUMPTIONS,
  );
  assert.equal(site.status, 'expanding');
  assert.equal(site.facilityToItRatio, 1.4);
  assert.equal(site.capexPerItMwUsdM, 40);
  assert.equal(site.plannedGrowthMw, 500);
  // 700 MW × 24 h × 7.0 MMBtu/MWh ÷ 1.037 MMBtu/Mcf ÷ 1000 = 113.4 MMcf/d
  assert.equal(Math.round(site.gasEquivalentMmcfd * 10) / 10, 113.4);
  assert.equal(site.plannedGasEquivalentMmcfd, null);
  assert.equal(site.chipCount, null);
  assert.equal(site.latestMilestone, null);

  const steady = normalizeDatacenterSite(
    { id: 'y', name: 'Y', lat: 1, lon: 1, itPowerMw: 10 },
    DEFAULT_GAS_ASSUMPTIONS,
  );
  assert.equal(steady.status, 'operating');
  assert.equal(steady.facilityToItRatio, null);
  assert.equal(steady.gasEquivalentMmcfd, null);
});

test('rows without the essentials never reach the map', () => {
  const bad = [
    null,
    {},
    { id: 'a', name: 'A', lat: 91, lon: 0, itPowerMw: 1 },
    { id: 'a', name: 'A', lat: 0, lon: 0, itPowerMw: -1 },
    { id: 'a', name: 'A', lat: 0, itPowerMw: 1 },
    { name: 'A', lat: 0, lon: 0, itPowerMw: 1 },
  ];
  for (const site of bad) assert.equal(normalizeDatacenterSite(site), null);
  assert.equal(normalizeDatacenterDataset(null), null);
  assert.equal(normalizeDatacenterDataset({ sites: [] }), null);
  assert.equal(normalizeDatacenterDataset({ vintage: '2026-01-01' }), null);
  const partial = normalizeDatacenterDataset({
    vintage: '2026-01-01',
    sites: [{ id: 'ok', name: 'OK', lat: 40, lon: -80, itPowerMw: 5 }, {}],
  });
  assert.equal(partial.rows.length, 1);
  assert.equal(partial.rows[0].rank, 1);
  assert.equal(partial.assumptions.heatRateMmbtuPerMwh, 7.0);
});

test('gas-equivalent arithmetic follows the stated assumptions', () => {
  assert.equal(gasEquivalentMmcfd(null), null);
  assert.equal(gasEquivalentMmcfd(0), null);
  assert.equal(
    Math.round(gasEquivalentMmcfd(1000, { heatRateMmbtuPerMwh: 7, gasEnergyMmbtuPerMcf: 1 })),
    168,
  );
  assert.equal(gasEquivalentMmcfd(100, { heatRateMmbtuPerMwh: 0 }), null);
});

test('formatters and the analyst record are stable', () => {
  assert.equal(formatMw(946), '946 MW');
  assert.equal(formatMw(1531), '1,531 MW');
  assert.equal(formatMw(null), 'n/a');
  assert.equal(formatUsdB(35.84), '$35.8B');
  assert.equal(formatUsdB(0.853), '$0.85B');
  assert.equal(formatCount(440000), '440k');
  assert.equal(formatCount(1044980), '1.04M');
  assert.equal(formatCount(985), '985');
  assert.equal(datacenterAsOf('2026-09-17'), 'as of 2026-09-17 · Epoch AI');

  const snapshot = normalizeDatacenterDataset(loadBundle());
  const record = mapAnalystRecord(snapshot.rows[0]);
  assert.equal(record.id, 'colossus-2');
  assert.equal(record.rank, 1);
  assert.equal(record.itPowerMw, 946);
  assert.equal(record.gridOperator, 'TVA');
  assert.equal(record.onSiteGenerationMw, 495);
  assert.equal(typeof record.gasEquivalentMmcfd, 'number');
  assert.doesNotThrow(() => JSON.stringify(record));
});

test('the bundled source reads once and caches the snapshot', async () => {
  let calls = 0;
  const payload = loadBundle();
  const source = createBundledDatacenterSource({
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => payload };
    },
  });
  const first = await source.getSnapshot();
  const second = await source.getSnapshot();
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(first.rows.length, 5);

  const failing = createBundledDatacenterSource({
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  await assert.rejects(() => failing.getSnapshot(), /HTTP 404/);

  const malformed = createBundledDatacenterSource({
    fetchImpl: async () => ({ ok: true, json: async () => ({ nope: true }) }),
  });
  await assert.rejects(() => malformed.getSnapshot(), /Malformed/);
});
