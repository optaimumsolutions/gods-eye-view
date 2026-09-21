import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GULF_LAYER_ID,
  MCF_PER_BOE,
  boePerDay,
  daysInMonth,
  formatBcfd,
  formatCumGas,
  formatMcfd,
  formatYoy,
  gulfMetaLine,
  mapAnalystRecord,
  monthEndIso,
  normaliseGulfDataset,
  platformStamp,
  yoyChange,
} from './records.js';

const NOW = Date.parse('2026-09-21T18:00:00Z');

/** Twenty-four months ending 2026-06, so "a year ago" is index 11. */
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

function series(
  gasNow,
  gasLastYear,
  { oil = 100, water = 50, wells = 3, boe = null } = {},
) {
  const gas = new Array(24).fill(1000);
  gas[23] = gasNow;
  gas[11] = gasLastYear;
  return {
    gas,
    oil: new Array(24).fill(oil),
    water: new Array(24).fill(water),
    boe: new Array(24).fill(boe),
    wells: new Array(24).fill(wells),
  };
}

function structure(id, overrides = {}) {
  return {
    id,
    complexId: id.split('-')[0],
    structureNumber: id.split('-')[1],
    name: `Platform ${id}`,
    area: 'GC',
    block: '254',
    lease: 'G07049',
    field: 'GC254',
    operator: 'Operator LLC',
    type: 'FIXED',
    major: true,
    waterDepthFt: 3300,
    lat: 27.5,
    lon: -90.5,
    nad: '27',
    installed: '1999-08-19',
    removed: null,
    district: '2',
    region: 'G',
    incidents: 12,
    series: null,
    lifetime: null,
    ...overrides,
  };
}

function payload(structures) {
  return {
    retrieved: '2026-09-21',
    license: 'US Government public domain',
    months: months(),
    current: { month: '2026-06', index: 23 },
    completeness: {
      rule: 'test',
      threshold: 0.9,
      window: 12,
      medianReporters: 345,
      table: [
        { month: '2026-08', reporters: 2, share: 0.006, complete: false },
        { month: '2026-07', reporters: 159, share: 0.461, complete: false },
        { month: '2026-06', reporters: 331, share: 0.959, complete: true },
      ],
    },
    counts: { structuresEver: 6184, installed: 1315, unplaced: 8 },
    structures,
  };
}

test('the month axis and the BOE convention are what BSEE files', () => {
  assert.equal(daysInMonth('2026-06'), 30);
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(monthEndIso('2026-06'), '2026-06-30T23:59:59.000Z');
  assert.equal(MCF_PER_BOE, 5.62);
  // Measured from the file: 17,785 bbl/d + 167,392 Mcf/d files as 47,571
  // BOE/d; the convention lands within a barrel, which is why the filed
  // figure is carried and the convention only fills a blank.
  assert.ok(Math.abs(boePerDay(17785, 167392) - 47571) < 1.5);
  assert.equal(boePerDay(null, null), null);
});

test('yoyChange bands are descriptive and never print a number for a non-number', () => {
  assert.deepEqual(yoyChange({ gasMcfd: 1200 }, { gasMcfd: 1000 }), {
    class: 'up',
    pct: 20,
  });
  assert.deepEqual(yoyChange({ gasMcfd: 850 }, { gasMcfd: 1000 }), {
    class: 'down',
    pct: -15,
  });
  assert.deepEqual(yoyChange({ gasMcfd: 1050 }, { gasMcfd: 1000 }), {
    class: 'flat',
    pct: 5,
  });
  assert.deepEqual(yoyChange({ gasMcfd: 500 }, { gasMcfd: 0 }), {
    class: 'new',
    pct: null,
  });
  assert.deepEqual(yoyChange({ gasMcfd: 500 }, null), {
    class: 'new',
    pct: null,
  });
  assert.deepEqual(yoyChange({ gasMcfd: 0 }, { gasMcfd: 900 }), {
    class: 'quiet',
    pct: null,
  });
  assert.deepEqual(yoyChange(null, null), { class: 'quiet', pct: null });
  assert.deepEqual(yoyChange(null, null, { hasSeries: false }), {
    class: 'unknown',
    pct: null,
  });
  assert.equal(formatYoy({ class: 'up', pct: 12.4 }), '▲ +12.4 % vs last year');
  assert.equal(
    formatYoy({ class: 'down', pct: -8.1 }),
    '▼ -8.1 % vs last year',
  );
  assert.equal(formatYoy({ class: 'new', pct: null }), 'new vs last year');
  assert.equal(formatYoy({ class: 'quiet', pct: null }), 'no gas this month');
});

test('normaliseGulfDataset ranks producers by current gas and keeps idle structures after them', () => {
  const snapshot = normaliseGulfDataset(
    payload([
      structure('10-1', { series: series(5000, 4000) }),
      structure('20-1', { series: series(12000, 13000) }),
      structure('30-1', { series: series(0, 900) }),
      structure('40-1'),
      structure('50-1', { lat: null }),
    ]),
    { fetchedAt: NOW },
  );
  assert.equal(snapshot.layerId, GULF_LAYER_ID);
  assert.equal(snapshot.currentMonth, '2026-06');
  assert.equal(snapshot.currentIndex, 23);
  assert.equal(
    snapshot.rows.length,
    4,
    'the structure without coordinates is dropped',
  );
  // Producers by gas, then the idle structures by name.
  assert.deepEqual(
    snapshot.rows.map((r) => r.id),
    ['20-1', '10-1', '30-1', '40-1'],
  );
  assert.deepEqual(
    snapshot.rows.map((r) => r.rank),
    [1, 2, null, null],
  );
  assert.equal(snapshot.counts.producing, 2);
  assert.equal(snapshot.counts.gasMcfdTotal, 17000);
  assert.equal(snapshot.gasMaxMcfd, 12000);
  assert.equal(snapshot.counts.installed, 1315);
  assert.equal(snapshot.counts.placed, 4);
  assert.ok(snapshot.byId.get('20-1'));
  assert.ok(Object.isFrozen(snapshot.rows[0]));
});

test('each row carries current, prior and last-year readings, the change class and a stamp', () => {
  const snapshot = normaliseGulfDataset(
    payload([
      structure('20-1', {
        series: series(12000, 13000),
        lifetime: {
          firstMonth: '2002-03',
          lastMonth: '2026-06',
          monthsProducing: 280,
          peakGasMcfd: 20000,
          peakGasMonth: '2004-07',
          cumGasMcf: 1.5e9,
          cumOilBbl: 2e7,
        },
      }),
    ]),
    { fetchedAt: NOW },
  );
  const row = snapshot.rows[0];
  assert.equal(row.current.gasMcfd, 12000);
  assert.equal(row.current.oilBopd, 100);
  // No BOE filed in the fixture: the convention fills the blank and says so.
  assert.equal(Math.round(row.current.boepd), Math.round(100 + 12000 / 5.62));
  assert.equal(row.current.boeFiled, false);
  assert.equal(row.prior.gasMcfd, 1000);
  assert.equal(row.lastYear.gasMcfd, 13000);
  assert.deepEqual(row.yoy, { class: 'flat', pct: -7.7 });
  assert.equal(row.producing, true);
  assert.equal(row.declineFromPeakPct, 40);
  assert.equal(row.areaBlock, 'GC 254');
  assert.equal(row.observation.freshnessClass, 'published');
  assert.equal(row.observation.observedAt, '2026-06-30T23:59:59.000Z');
  assert.equal(row.observation.publishedAt, '2026-09-21T00:00:00.000Z');
  assert.equal(platformStamp(row, NOW), 'as of 2026-06-30 · 82d lag');
});

test("a filed BOE wins over the convention, so the card shows BSEE's number", () => {
  const snapshot = normaliseGulfDataset(
    payload([
      structure('20-1', { series: series(12000, 13000, { boe: 2240 }) }),
    ]),
    { fetchedAt: NOW },
  );
  assert.equal(snapshot.rows[0].current.boepd, 2240);
  assert.equal(snapshot.rows[0].current.boeFiled, true);
});

test('an installed structure with no rows is quiet-unknown, drawn but never ranked', () => {
  const snapshot = normaliseGulfDataset(payload([structure('40-1')]), {
    fetchedAt: NOW,
  });
  const row = snapshot.rows[0];
  assert.equal(row.series, null);
  assert.equal(row.current, null);
  assert.equal(row.yoy.class, 'unknown');
  assert.equal(row.producing, false);
  assert.equal(row.rank, null);
  assert.equal(row.declineFromPeakPct, null);
});

test('the panel line and the analyst record read from the same snapshot', () => {
  const snapshot = normaliseGulfDataset(
    payload([structure('10-1', { series: series(5000, 4000) })]),
    { fetchedAt: NOW },
  );
  assert.equal(
    gulfMetaLine(snapshot),
    '1 PRODUCING · 0.0 BCF/D · AS OF 2026-06 · 1,315 INSTALLED · JUL 46 % REPORTED · AUG 1 %',
  );
  const record = mapAnalystRecord(snapshot.rows[0]);
  assert.equal(record.gasMcfd, 5000);
  assert.equal(record.yoyClass, 'up');
  assert.equal(record.yoyPct, 25);
  assert.equal(record.observedAt, '2026-06-30T23:59:59.000Z');
  assert.equal(JSON.stringify(record).includes('undefined'), false);
});

test('formatters read the way the other commodity cards do', () => {
  assert.equal(formatMcfd(12100), '12.1 MMcf/d');
  assert.equal(formatMcfd(845), '845 Mcf/d');
  assert.equal(formatMcfd(null), 'n/a');
  assert.equal(formatBcfd(2_603_000), '2.6');
  assert.equal(formatCumGas(1.5e9), '1.50 Tcf');
  assert.equal(formatCumGas(250e6), '250.0 Bcf');
});

test('a malformed payload is refused rather than rendered empty', () => {
  for (const bad of [
    null,
    {},
    { months: [], structures: [] },
    { ...payload([]), current: { month: '1999-01' } },
    { ...payload([]), retrieved: '' },
  ]) {
    assert.equal(
      normaliseGulfDataset(bad),
      null,
      JSON.stringify(bad).slice(0, 60),
    );
  }
});
