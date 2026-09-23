import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGulfDossierModel } from './dossier.js';
import { normaliseGulfDataset } from './records.js';

const NOW = Date.parse('2026-09-21T18:00:00Z');

function months() {
  const out = [];
  for (let i = 23; i >= 0; i -= 1) {
    const total = 2026 * 12 + 5 - i;
    out.push(
      `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`,
    );
  }
  return out;
}

function structure(id, overrides = {}) {
  return {
    id,
    complexId: '251',
    structureNumber: '1',
    name: 'A(Allegheny Sea',
    area: 'GC',
    block: '254',
    lease: 'G07049',
    field: 'GC254',
    operator: 'Eni US Operating Co. Inc.',
    type: 'FIXED',
    major: true,
    waterDepthFt: 3300,
    lat: 27.5,
    lon: -90.5,
    nad: '27',
    installed: '1999-08-19',
    removed: null,
    district: '2',
    incidents: 58,
    series: null,
    lifetime: null,
    ...overrides,
  };
}

const gas = new Array(24).fill(100_000);
gas[23] = 120_000; // this month
gas[22] = 110_000; // May
gas[11] = 150_000; // a year ago
gas[5] = null; // a month not filed
const oil = new Array(24).fill(10_000);
oil[23] = 9_000;
const SERIES = {
  gas,
  oil,
  water: new Array(24).fill(500),
  boe: new Array(24).fill(null),
  wells: new Array(24).fill(7),
};
const LIFETIME = {
  firstMonth: '2002-03',
  lastMonth: '2026-06',
  monthsProducing: 280,
  peakGasMcfd: 205_000,
  peakGasMonth: '2004-07',
  peakOilBopd: 30_000,
  peakOilMonth: '2003-11',
  cumGasMcf: 1_234_000_000,
  cumOilBbl: 45_000_000,
};

function snapshot(structures) {
  return normaliseGulfDataset(
    {
      retrieved: '2026-09-21',
      months: months(),
      current: { month: '2026-06', index: 23 },
      completeness: {
        table: [
          { month: '2026-08', reporters: 2, share: 0.006, complete: false },
          { month: '2026-07', reporters: 163, share: 0.468, complete: false },
          { month: '2026-06', reporters: 338, share: 0.971, complete: true },
        ],
      },
      counts: {
        installed: structures.length,
        outOfRegion: { Y: { name: 'Alaska', structures: 1, gasMcfd: 547_000 } },
      },
      structures,
    },
    { fetchedAt: NOW },
  );
}

const rowValue = (model, sectionPrefix, label) =>
  model.sections
    .find((s) => s.title.startsWith(sectionPrefix))
    ?.rows.find(([k]) => k === label)?.[1] ?? null;

test('the dossier leads with the month, compared three ways, and stamps it', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW }); // the stamp's lag reads the clock
  const snap = snapshot([
    structure('251-1', { series: SERIES, lifetime: LIFETIME }),
  ]);
  const model = buildGulfDossierModel(snap.rows[0], { snapshot: snap });
  assert.equal(model.title, 'A(Allegheny Sea');
  assert.equal(
    model.kicker,
    '#1 of 1 by gas this month · as of 2026-06 · BSEE',
  );
  assert.equal(
    model.subtitle,
    'GC 254 · complex 251 · operator Eni US Operating Co. Inc.',
  );
  assert.deepEqual(
    model.stats.map((s) => s.label),
    ['Gas', 'Oil', 'Wells', 'Water depth'],
  );
  assert.equal(model.stats[0].value, '120.0 MMcf/d');
  assert.equal(model.stats[0].note, '▼ -20.0 % vs last year');
  assert.equal(
    rowValue(model, 'This month', 'Gas'),
    '120.0 MMcf/d · +9.1 % vs MAY · -20.0 % vs last year',
  );
  assert.equal(
    rowValue(model, 'This month', 'Oil'),
    '9,000 bbl/d · -10.0 % vs MAY · -10.0 % vs last year',
  );
  assert.match(
    rowValue(model, 'This month', 'BOE'),
    /BOE\/d · oil \+ gas ÷ 5\.62, BSEE convention$/,
  );
  assert.equal(
    rowValue(model, 'This month', 'Stamp'),
    'as of 2026-06-30 · 82d lag',
  );
});

test('identity and lifetime read from the record; incidents and datum are named, not hidden', () => {
  const snap = snapshot([
    structure('251-1', { series: SERIES, lifetime: LIFETIME }),
  ]);
  const model = buildGulfDossierModel(snap.rows[0], { snapshot: snap });
  assert.equal(rowValue(model, 'Identity', 'Complex'), '251 · structure 1');
  assert.equal(
    rowValue(model, 'Identity', 'Incidents'),
    '58 of non-compliance on record (BSEE INC)',
  );
  assert.equal(
    rowValue(model, 'Identity', 'Datum'),
    'NAD 27 as published, not converted',
  );
  assert.equal(
    rowValue(model, 'Lifetime', 'Peak gas'),
    '205.0 MMcf/d · 2004-07',
  );
  assert.equal(rowValue(model, 'Lifetime', 'Cum. gas'), '1.23 Tcf');
  assert.equal(rowValue(model, 'Lifetime', 'Cum. oil'), '45.0 MMbbl');
  assert.equal(rowValue(model, 'Lifetime', 'Producing'), '280 months');
  // 120,000 now against a 205,000 peak.
  assert.equal(
    rowValue(model, 'Lifetime', 'From peak'),
    '−41.5 % gas vs the peak month',
  );
});

test('the chart is the raw series with the current month at its right edge', () => {
  const snap = snapshot([
    structure('251-1', { series: SERIES, lifetime: LIFETIME }),
  ]);
  const model = buildGulfDossierModel(snap.rows[0], { snapshot: snap });
  assert.equal(model.chart.months.length, 24);
  assert.equal(model.chart.currentIndex, 23);
  assert.equal(model.chart.gas[23], 120_000);
  assert.equal(model.chart.gas[5], null, 'an unfiled month stays a gap');
  assert.equal(model.chart.oil[23], 9_000);
});

test('sources name the current-month rule, the filling months and the regions not on the map', () => {
  const snap = snapshot([
    structure('251-1', { series: SERIES, lifetime: LIFETIME }),
  ]);
  const model = buildGulfDossierModel(snap.rows[0], { snapshot: snap });
  assert.equal(
    rowValue(model, 'Sources', 'Current month'),
    '2026-06 is the newest complete reporting month · still filling: jul 47 % reported · aug 1 %',
  );
  assert.equal(
    rowValue(model, 'Sources', 'Coverage'),
    '1 Gulf structures producing gas · Alaska: 1 in the file, not on this map',
  );
  assert.match(
    model.footer,
    /^as of 2026-06 · BSEE · US Department of the Interior · public domain$/,
  );
});

test('an idle structure gets an honest dossier: no chart, no invented numbers', () => {
  const snap = snapshot([structure('251-1')]);
  const model = buildGulfDossierModel(snap.rows[0], { snapshot: snap });
  assert.equal(
    model.kicker,
    'installed · no production filed · as of 2026-06 · BSEE',
  );
  assert.equal(model.chart, null);
  assert.equal(model.stats[0].value, 'none');
  assert.equal(model.stats[0].note, 'no production filed');
  assert.equal(
    rowValue(model, 'Lifetime', 'Production'),
    'none filed for this structure',
  );
  assert.equal(rowValue(model, 'This month', 'Gas'), null);
  assert.equal(JSON.stringify(model).includes('undefined'), false);
  assert.equal(JSON.stringify(model).includes('NaN'), false);
});

test('a filed BOE is shown as filed, never recomputed', () => {
  const series = { ...SERIES, boe: new Array(24).fill(30_000) };
  const snap = snapshot([structure('251-1', { series, lifetime: LIFETIME })]);
  const model = buildGulfDossierModel(snap.rows[0], { snapshot: snap });
  assert.equal(rowValue(model, 'This month', 'BOE'), '30,000 BOE/d · as filed');
  assert.equal(model.stats[1].note, '30,000 BOE/d');
});
