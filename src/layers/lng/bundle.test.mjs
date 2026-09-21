import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildLngSnapshot,
  normalizeCargoes,
  normalizeMatrix,
  normalizeRoutes,
  normalizeTerminals,
} from './records.js';

/**
 * Pins on the committed bundle (docs/COMMODITIES-PLAN.md §12.8 milestone 1).
 * Every number here moves only when the build's EXPECTED block moves with
 * it; a silent upstream drift fails here, named.
 */

const bundle = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../data/local_data/lng/${name}`, import.meta.url),
      'utf8',
    ),
  );
const terminalsRaw = bundle('terminals.json');
const cargoesRaw = bundle('cargoes.json');
const matrixRaw = bundle('matrix.json');
const routesRaw = bundle('routes.json');
const manifest = bundle('source.json');
const crosswalk = bundle('crosswalk.json');

const terminals = normalizeTerminals(terminalsRaw);
const cargoes = normalizeCargoes(cargoesRaw);
const matrix = normalizeMatrix(matrixRaw);
const routes = normalizeRoutes(routesRaw);
const snapshot = buildLngSnapshot({ terminals, cargoes, matrix, routes });

const SABINE_PASS = 'T100000130240';
const SODEGAURA = 'T100000130523';
const DAHEJ = 'T100000130427';
const QATAR_NORTH = 'T100000130594';
const SOUTH_HOOK = 'T100000130557';

test('terminal counts per kind and status are pinned to the GEM Sept 2025 release', () => {
  assert.equal(terminals.rows.length, 308);
  const tally = {};
  for (const t of terminals.rows)
    tally[`${t.kind}:${t.status}`] = (tally[`${t.kind}:${t.status}`] ?? 0) + 1;
  assert.deepEqual(tally, {
    'export:construction': 15,
    'export:operating': 59,
    'import:construction': 38,
    'import:operating': 196,
  });
  assert.equal(terminalsRaw.gem.release, 'September 2025');
  assert.equal(manifest.vintage.terminals, 'GEM September 2025');
});

test('every US export terminal resolves in the crosswalk and carries an EIA train table', () => {
  const us = terminals.rows.filter(
    (t) => t.country === 'United States' && t.kind === 'export',
  );
  assert.equal(us.length, 14);
  for (const t of us) {
    const row = crosswalk.usExportTerminals.find((r) => r.gemId === t.id);
    assert.ok(row, `${t.name} has no crosswalk row`);
    assert.ok(t.us, `${t.name} has no us block`);
    if (row.smallScale) continue;
    assert.ok(t.us.trains.length > 0, `${t.name} has no EIA trains`);
    assert.ok(row.eiaProjects.length > 0, `${t.name} names no EIA project`);
    // Operating plants ship cargoes, so they need a DOE point of exit too.
    if (t.status === 'operating')
      assert.ok(
        row.doeNames.length > 0,
        `${t.name} operating without a DOE exit name`,
      );
  }
  // The API code column waits for milestone 7; until then it is null by design.
  assert.ok(
    crosswalk.usExportTerminals.every((r) => r.eiaApiTerminal === null),
  );
  assert.equal(terminalsRaw.counts.eiaTrains, 39);
  assert.equal(terminalsRaw.counts.eiaTrainsJoined, 37);
});

test('Sabine Pass carries six operating trains and the DOE span', () => {
  const sp = snapshot.rows.find((t) => t.id === SABINE_PASS);
  assert.equal(sp.us.trainsOperating, 6);
  assert.equal(sp.us.trains.length, 6);
  assert.ok(Math.abs(sp.us.baseloadMtpa - 27) < 0.01);
  assert.equal(sp.derived.cargoes, 436);
  assert.ok(
    sp.derived.utilizationPct > 50 && sp.derived.utilizationPct < 120,
    `utilization ${sp.derived.utilizationPct}`,
  );
  assert.equal(sp.derived.series.length, 24);
});

test('the DOE latest month is pinned and no exit name in the span is unmapped', () => {
  assert.equal(cargoes.latestMonth, '2026-06');
  assert.deepEqual(cargoes.span, { from: '2025-07', to: '2026-06' });
  assert.deepEqual(cargoesRaw.unmappedExitsBeforeWindow, []);
  const ids = new Set(terminals.rows.map((t) => t.id));
  for (const exit of cargoesRaw.exits)
    assert.ok(
      ids.has(exit.terminalId),
      `${exit.exit} maps outside the terminal set`,
    );
  for (const pair of cargoes.pairs)
    assert.ok(ids.has(pair.terminalId), `${pair.terminalId} not a terminal`);
  assert.equal(cargoesRaw.counts.cargoesInWindow, 1868);
  assert.equal(cargoesRaw.counts.pairsInWindow, 220);
  assert.equal(cargoesRaw.exits.length, 10);
});

test('the GIIGNL world total is within 0.5 MT of 428', () => {
  assert.ok(Math.abs(matrix.world - 428) <= 0.5, `world ${matrix.world}`);
  assert.equal(matrix.year, 2025);
  assert.equal(matrix.exporters.length, 25);
  assert.equal(matrix.importers.length, 47);
  const china = matrix.importers.find((i) => i.market === 'China');
  assert.equal(china.totalMt, 67);
  assert.ok(
    matrix.exporters.every((e) => e.terminalId),
    'every exporter column resolves to a terminal',
  );
});

test('route counts, grades and the vertex gate are pinned', () => {
  assert.equal(routes.rows.length, 470);
  assert.equal(snapshot.counts.doeRoutes, 218);
  assert.equal(snapshot.counts.giignlRoutes, 252);
  const ids = new Set(terminals.rows.map((t) => t.id));
  for (const r of routes.rows) {
    assert.ok(
      ids.has(r.originId) && ids.has(r.destinationId),
      `${r.id} endpoint missing`,
    );
    assert.ok(
      r.variants.open.coords.length <= 400,
      `${r.id} over the vertex gate`,
    );
    if (r.redSeaExposed)
      assert.ok(
        r.variants.redSeaClosed,
        `${r.id} exposed without a closed variant`,
      );
    if (r.variantInUse === 'redSeaClosed') assert.ok(r.redSeaExposed);
  }
  assert.equal(routes.unrouted.length, 1);
  assert.match(routes.unrouted[0].id, /^doe:T100000131069:mexico$/);
});

test('three known routes sit within 5 % of published distances', () => {
  // Sabine Pass → Tokyo Bay via Panama: ~9,300 nm (sea-distances tables).
  const spJapan = routes.rows.find((r) => r.id === `doe:${SABINE_PASS}:japan`);
  assert.equal(spJapan.destinationId, SODEGAURA);
  assert.ok(
    Math.abs(spJapan.variants.open.nm - 9300) / 9300 < 0.05,
    `${spJapan.variants.open.nm} nm`,
  );
  assert.ok(spJapan.variants.open.via.includes('Panama Canal'));
  assert.ok(!spJapan.variants.open.via.includes('Cape of Good Hope'));
  assert.equal(spJapan.variantInUse, 'open');
  // Ras Laffan → Milford Haven via Suez: ~6,200 nm; via the Cape: ~11,100 nm.
  const qatarUk = routes.rows.find(
    (r) => r.id === `giignl:${QATAR_NORTH}:${SOUTH_HOOK}`,
  );
  assert.ok(
    Math.abs(qatarUk.variants.open.nm - 6200) / 6200 < 0.05,
    `${qatarUk.variants.open.nm} nm`,
  );
  assert.ok(qatarUk.variants.open.via.includes('Suez Canal'));
  assert.ok(qatarUk.variants.open.via.includes('Strait of Hormuz'));
  assert.ok(
    Math.abs(qatarUk.variants.redSeaClosed.nm - 11100) / 11100 < 0.05,
    `${qatarUk.variants.redSeaClosed.nm} nm`,
  );
  assert.ok(qatarUk.variants.redSeaClosed.via.includes('Cape of Good Hope'));
  assert.equal(qatarUk.variantInUse, 'redSeaClosed');
  // A 2026 US → India pair draws the Red Sea-closed variant round the Cape.
  const spIndia = routes.rows.find((r) => r.id === `doe:${SABINE_PASS}:india`);
  assert.equal(spIndia.destinationId, DAHEJ);
  assert.equal(spIndia.variantInUse, 'redSeaClosed');
  assert.ok(spIndia.variants.redSeaClosed.via.includes('Cape of Good Hope'));
  assert.ok(spIndia.variants.open.via.includes('Bab el-Mandeb Strait'));
});

test('the manifest names every input with a retrieval date and the bundle stays under 8 MB', () => {
  for (const key of ['gem', 'eia', 'doe'])
    assert.match(
      String(manifest.inputs[key].retrieved),
      /^\d{4}-\d{2}-\d{2}$/,
      key,
    );
  assert.match(String(manifest.inputs.giignl.pdfSha256), /^[0-9a-f]{64}$/);
  assert.ok(manifest.total_bytes < 8 * 1024 * 1024);
  assert.equal(manifest.files.length, 4);
});

test('the snapshot states the span, the lag and the GEM release in one line', () => {
  assert.equal(
    snapshot.asOf,
    'Jul 2025 to Jun 2026 · DOE · 2-month lag · GEM September 2025',
  );
  assert.equal(snapshot.lagMonths, 2);
  assert.equal(snapshot.published, '2026-08-24');
});
