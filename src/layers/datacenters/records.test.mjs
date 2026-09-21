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
import { buildDossierModel } from './dossier.js';

const BUNDLE_URL = new URL(
  '../../data/local_data/us_datacenters/datacenters.json',
  import.meta.url,
);

function loadBundle() {
  return JSON.parse(readFileSync(BUNDLE_URL, 'utf8'));
}

test('the bundle normalizes to fifteen ranked US sites, largest IT power first', () => {
  const snapshot = normalizeDatacenterDataset(loadBundle());
  assert.ok(snapshot);
  assert.equal(snapshot.vintage, '2026-09-18');
  assert.equal(snapshot.asOf, 'as of 2026-09-18 · Epoch AI');
  assert.equal(snapshot.source.license, 'CC BY 4.0');
  assert.equal(snapshot.rows.length, 15);
  const ranks = snapshot.rows.map((r) => r.rank);
  assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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
      'fairwater-wisconsin',
      'google-pryor-north',
      'colossus-1',
      'google-new-albany',
      'google-columbus',
      'amazon-madison',
      'coreweave-denton',
      // 13 and 14 are both 238 MW; records.js breaks the tie on id.
      'google-bristow',
      'qts-richmond-1',
      'google-council-bluffs-east',
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
    Math.round(
      gasEquivalentMmcfd(1000, {
        heatRateMmbtuPerMwh: 7,
        gasEnergyMmbtuPerMcf: 1,
      }),
    ),
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
  assert.equal(first.rows.length, 15);

  const failing = createBundledDatacenterSource({
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  await assert.rejects(() => failing.getSnapshot(), /HTTP 404/);

  const malformed = createBundledDatacenterSource({
    fetchImpl: async () => ({ ok: true, json: async () => ({ nope: true }) }),
  });
  await assert.rejects(() => malformed.getSnapshot(), /Malformed/);
});

test('campus footprints and on-site assets normalize and survive bad input', () => {
  const snapshot = normalizeDatacenterDataset(loadBundle());
  const byId = new Map(snapshot.rows.map((r) => [r.id, r]));
  for (const id of ['colossus-2', 'new-carlisle-rainier', 'stargate-abilene']) {
    const row = byId.get(id);
    assert.ok(
      row.footprint && row.footprint.length >= 3,
      id + ' has a footprint',
    );
    for (const [lon, lat] of row.footprint) {
      assert.ok(
        Math.abs(lon - row.lon) < 0.2 && Math.abs(lat - row.lat) < 0.2,
        id + ' footprint sits on the site',
      );
    }
  }
  assert.equal(byId.get('fairwater-atlanta').footprint, null);
  const colossus = byId.get('colossus-2');
  assert.equal(colossus.assets.length, 1);
  assert.equal(colossus.assets[0].kind, 'gas-turbines');
  assert.equal(colossus.assets[0].capacityMw, 495);
  assert.deepEqual(byId.get('meta-prometheus').assets, []);

  const site = normalizeDatacenterSite(
    {
      id: 'z',
      name: 'Z',
      lat: 1,
      lon: 1,
      itPowerMw: 1,
      footprint: [
        [1, 1],
        [2, 2],
      ],
      assets: [{ id: 'a' }, { id: 'b', name: 'B', lat: 1, lon: 1 }],
    },
    DEFAULT_GAS_ASSUMPTIONS,
  );
  assert.equal(site.footprint, null);
  assert.equal(site.assets.length, 1);
  assert.equal(site.assets[0].capacityMw, null);
});

test('the dossier model carries every section an analyst reads', () => {
  const snapshot = normalizeDatacenterDataset(loadBundle());
  const model = buildDossierModel(snapshot.rows[0], { total: 5 });
  assert.equal(model.title, 'Colossus 2');
  assert.match(model.kicker, /#1 of 5/);
  assert.equal(model.stats.length, 4);
  assert.equal(model.stats[0].value, '946 MW');
  assert.deepEqual(
    model.sections.map((s) => s.title),
    ['Supply', 'Compute', 'Capital', 'Campus', 'People'],
  );
  for (const section of model.sections)
    assert.ok(section.rows.length >= 2, section.title + ' has rows');
  const supply = Object.fromEntries(model.sections[0].rows);
  assert.match(supply['On-site MW'], /495 MW/);
  assert.match(supply['Gas-equiv.'], /illustrative/);
  assert.ok(model.chart.length >= 4);
  assert.ok(model.chart.some((p) => p.projected));
  assert.ok(model.sources.length >= 3);
  assert.match(model.footer, /CC BY 4.0/);
  const steady = buildDossierModel(
    normalizeDatacenterSite(
      { id: 'y', name: 'Y', lat: 1, lon: 1, itPowerMw: 10 },
      DEFAULT_GAS_ASSUMPTIONS,
    ),
  );
  assert.equal(steady.stats[2].value, 'no growth');
  assert.equal(steady.chart.length, 0);
});
