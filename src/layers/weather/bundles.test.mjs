import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseYaml, flow } from '../../../scripts/build-weather-gazetteer.mjs';
import { reduceNormals } from '../../../scripts/build-weather-normals.mjs';
import { buildSkill, MAX_LEAD } from '../../../scripts/build-weather-skill.mjs';
import {
  FIELD_GRID,
  buildBundle,
  parseAsciiGrid,
} from '../../../scripts/build-weather-population.mjs';

const read = (name) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../data/local_data/weather/${name}`, import.meta.url),
      ),
      'utf8',
    ),
  );

// --------------------------------------------------------- gazetteer ----

test('gazetteer pins nineteen entries inside the contiguous US with freezeF on every basin', () => {
  const { entries } = read('gazetteer.json');
  assert.equal(entries.length, 19);
  const ids = entries.map((e) => e.id);
  assert.deepEqual(ids, [
    'appalachia',
    'permian',
    'haynesville',
    'anadarko',
    'eagleford',
    'bakken',
    'southcentral',
    'texas',
    'gulf-offshore',
    'gulf-lng',
    'new-england',
    'middle-atlantic',
    'east-north-central',
    'west-north-central',
    'south-atlantic',
    'east-south-central',
    'west-south-central',
    'mountain',
    'pacific',
  ]);
  for (const e of entries) {
    assert.ok(e.lat > 24 && e.lat < 50, `${e.id} lat ${e.lat}`);
    assert.ok(e.lon > -126 && e.lon < -66, `${e.id} lon ${e.lon}`);
    assert.equal(e.country, 'US');
    assert.ok(['basin', 'region', 'gulf', 'division'].includes(e.kind));
    const w = e.points.reduce((s, p) => s + p.w, 0);
    assert.ok(Math.abs(w - 1) < 1e-4, `${e.id} weights sum ${w}`);
    if (e.kind === 'basin') {
      assert.equal(typeof e.freezeF, 'number', `${e.id} freezeF`);
      assert.equal(typeof e.share, 'number');
    }
  }
  // the oracle's heuristics, verbatim (edited in the yaml, re-bundled, never in code)
  assert.equal(entries.find((e) => e.id === 'permian').freezeF, 25);
  assert.equal(entries.find((e) => e.id === 'bakken').freezeF, -10);
  // regions resolve metros by name: South Central lists nine, Texas four
  assert.equal(entries.find((e) => e.id === 'southcentral').points.length, 9);
  assert.equal(entries.find((e) => e.id === 'texas').points.length, 4);
  // M7 (§11.8.15 D7.1/D7.3): nine divisions, gas shares summing to 1, the
  // oracle's metro basket, and the EIA-930 regions each quotes
  const divisions = entries.filter((e) => e.kind === 'division');
  assert.equal(divisions.length, 9);
  const gas = divisions.reduce((s, d) => s + d.gasShare, 0);
  assert.ok(Math.abs(gas - 1) < 1e-4, `gas shares sum ${gas}`);
  assert.equal(
    entries.find((e) => e.id === 'east-north-central').gasShare,
    0.239614,
  );
  assert.equal(
    entries.find((e) => e.id === 'east-north-central').points.length,
    7,
  );
  assert.deepEqual(entries.find((e) => e.id === 'south-atlantic').eia930, [
    'CAR',
    'SE',
    'FLA',
  ]);
  assert.deepEqual(entries.find((e) => e.id === 'west-south-central').eia930, [
    'TEX',
  ]);
  for (const d of divisions) {
    assert.ok(d.eia930.length >= 1 && d.eia930.length <= 3, `${d.id} eia930`);
    assert.deepEqual(d.commodities, ['natgas']);
  }
});

// -------------------------------------------------------- population ----

test('the population builder reads an ESRI ASCII grid and quarter-sums the four cells at each field point', () => {
  // a 1440 × 720 world at 0.25°, every cell = 4 people, so each field point = 4
  const ncols = 1440;
  const nrows = 720;
  const header = `ncols ${ncols}\nnrows ${nrows}\nxllcorner -180\nyllcorner -90\ncellsize 0.25\nNODATA_value -9999\n`;
  const row = new Array(ncols).fill(4).join(' ');
  const rows = new Array(nrows).fill(row);
  // one NODATA cell at the field's north-west corner (row for lat 49.75..50, col for lon -126..-125.75)
  const rTop = Math.round((90 - 50) / 0.25); // the cell whose top edge is 50 N
  const cLeft = Math.round((-126 + 180) / 0.25);
  const cells = row.split(' ');
  cells[cLeft] = '-9999';
  rows[rTop] = cells.join(' ');
  const grid = parseAsciiGrid(header + rows.join('\n') + '\n');
  assert.equal(grid.nrows, nrows);
  const bundle = buildBundle(grid);
  assert.equal(bundle.values.length, FIELD_GRID.rows * FIELD_GRID.cols);
  assert.equal(bundle.grid.rows, 105);
  assert.equal(bundle.grid.cols, 241);
  // interior points: (4 + 4 + 4 + 4) / 4 = 4
  assert.equal(bundle.values[50 * 241 + 120], 4);
  // the north-west corner point touches the NODATA cell (read as 0) to its SE: (0 + 4 + 4 + 4) / 4 = 3
  assert.equal(bundle.values[0], 3);
  assert.equal(bundle.licence, 'CC BY 4.0');
  assert.match(bundle.vintage, /GPWv4\.11/);
  // the shipped bundle: the field's grid, whole people, New York the densest cell
  const shipped = read('population.json');
  assert.deepEqual(shipped.grid, { ...FIELD_GRID });
  assert.equal(shipped.values.length, 105 * 241);
  assert.ok(shipped.values.every((x) => Number.isInteger(x) && x >= 0));
  assert.ok(
    shipped.total > 350e6 && shipped.total < 450e6,
    `window total ${shipped.total}`,
  );
  const cell = (lat, lon) =>
    shipped.values[
      Math.round((50 - lat) / 0.25) * 241 + Math.round((lon + 126) / 0.25)
    ];
  assert.equal(Math.max(...shipped.values), cell(40.75, -74), 'New York');
  assert.equal(cell(35, -70), 0, 'open Atlantic');
  assert.equal(shipped.licence, 'CC BY 4.0');
  assert.throws(
    () =>
      parseAsciiGrid(
        'ncols 3\nnrows 1\nxllcorner 0\nyllcorner 0\ncellsize 0.25\n1 2\n',
      ),
    /cols/,
  );
});

test('the flow-yaml parser reads the oracle grammar and refuses anything else', () => {
  assert.deepEqual(flow('{name: Midland TX, lat: 31.99, lon: -102.08, w: 2}'), {
    name: 'Midland TX',
    lat: 31.99,
    lon: -102.08,
    w: 2,
  });
  const doc = parseYaml(
    '# comment\nbasins:\n  A: {freeze_f: 10, share: 0.4,\n    points: [{name: X, lat: 1, lon: 2, w: 1},\n             {name: Y, lat: 3, lon: 4, w: 2}]}\n',
  );
  assert.equal(doc.basins.A.points.length, 2);
  assert.equal(doc.basins.A.points[1].w, 2);
  const divisions = parseYaml(
    'divisions:\n  New England:\n    - {name: Boston, lat: 42.36, lon: -71.06, pop: 4.9}\n',
  );
  assert.equal(divisions.divisions['New England'][0].pop, 4.9);
  assert.throws(() => flow('{name: X'), /unterminated/);
  assert.throws(() => parseYaml('key: [1, 2\n'), /unbalanced/);
});

// ----------------------------------------------------------- normals ----

test('normals carry 366 smoothed slots per entry with no null after smoothing', () => {
  const normals = read('normals.json');
  const { entries } = read('gazetteer.json');
  assert.equal(Object.keys(normals.entries).length, entries.length);
  assert.match(normals.attribution, /Copernicus/);
  assert.equal(normals.window.start, '2016-01-01');
  for (const [id, n] of Object.entries(normals.entries)) {
    assert.equal(n.tmin.length, 366, `${id} tmin slots`);
    assert.equal(n.tmax.length, 366, `${id} tmax slots`);
    assert.ok(
      n.tmin.every((v) => Number.isFinite(v)),
      `${id} tmin null`,
    );
    assert.ok(
      n.tmax.every((v) => Number.isFinite(v)),
      `${id} tmax null`,
    );
    assert.ok(
      n.tmin.every((v, i) => v <= n.tmax[i]),
      `${id} tmin > tmax`,
    );
  }
  // physically sane: Bakken in January is colder than the Gulf in July
  assert.ok(normals.entries.bakken.tmin[14] < 20);
  assert.ok(normals.entries['gulf-offshore'].tmin[195] > 70);
});

test('reduceNormals weights points before averaging days and smooths ±7 days', () => {
  const days = [];
  for (let d = 0; d < 366 * 2; d++)
    days.push(
      new Date(Date.UTC(2016, 0, 1) + d * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  const mk = (base) => ({
    daily: {
      time: days,
      temperature_2m_min: days.map(() => base),
      temperature_2m_max: days.map(() => base + 10),
    },
  });
  const entry = { points: [{ w: 0.75 }, { w: 0.25 }] };
  const out = reduceNormals(entry, [mk(0), mk(40)]);
  assert.equal(out.tmin.length, 366);
  // 0.75*0 + 0.25*40 = 10 on every day, so every slot is exactly 10
  assert.ok(out.tmin.every((v) => v === 10));
  assert.ok(out.tmax.every((v) => v === 20));
});

// ------------------------------------------------------------- skill ----

test('skill.json pins the model ids, 17 leads and the provisional flag', () => {
  const skill = read('skill.json');
  assert.deepEqual(Object.keys(skill.models).sort(), [
    'ecmwf_aifs025_ensemble',
    'google_weathernext2_ensemble',
    'ncep_aigefs025',
    'ncep_gefs025',
  ]);
  for (const [id, m] of Object.entries(skill.models)) {
    assert.equal(m.leads.length, MAX_LEAD + 1, `${id} leads`);
    assert.equal(m.leads[0].confidence, 1, `${id} D+0`);
    assert.equal(typeof m.provisional, 'boolean');
    assert.ok(m.leads.every((l) => l.confidence >= 0 && l.confidence <= 1));
    // monotone non-increasing decay: a longer lead is never more confident
    for (let i = 1; i < m.leads.length; i++)
      assert.ok(
        m.leads[i].confidence <= m.leads[i - 1].confidence + 1e-9,
        `${id} lead ${i}`,
      );
  }
  const aifs = skill.models.ecmwf_aifs025_ensemble;
  assert.equal(aifs.provisional, true, 'the 30-init gate is not met yet');
  assert.match(aifs.label, /provisional \(\d+\/30 inits\)/);
  assert.equal(
    skill.models.google_weathernext2_ensemble.label,
    'no skill measured yet',
  );
});

test('buildSkill derives confidence from MAE relative to D+1 and never invents a curve', () => {
  const raw = {
    maturity_gate: 30,
    scored_valid_dates: { AIFS_ENS: 5 },
    models: {
      AIFS_ENS: {
        1: { n: 5, mae: 1 },
        2: { n: 4, mae: 2 },
        3: { n: 3, mae: 4 },
      },
    },
  };
  const out = buildSkill(raw, { vintage: '2026-01-01' });
  const a = out.models.ecmwf_aifs025_ensemble;
  assert.deepEqual(
    a.leads.slice(0, 4).map((l) => l.confidence),
    [1, 1, 0.5, 0.25],
  );
  assert.equal(a.leads[4].extrapolated, true);
  assert.equal(a.leads[4].confidence, 0.25);
  assert.equal(a.provisional, true);
  const none = buildSkill({}, { vintage: 'x' }).models.ecmwf_aifs025_ensemble;
  assert.equal(none.label, 'no skill measured yet');
  assert.ok(none.leads.every((l) => l.confidence === 1));
});
