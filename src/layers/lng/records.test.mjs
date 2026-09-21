import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LNG_GRADES,
  arcWidthPx,
  buildLngSnapshot,
  formatMmcf,
  formatMonth,
  formatMtpa,
  lngAsOf,
  mapAnalystRecord,
  monthsBetween,
  normalizeCargoes,
  normalizeMatrix,
  normalizeRoutes,
  normalizeTerminals,
  routeLine,
  usDossierOrder,
  utilizationPct,
} from './records.js';

const terminal = (over = {}) => ({
  id: 'T1',
  name: 'Plant A',
  country: 'United States',
  kind: 'export',
  status: 'operating',
  owners: [{ name: 'Owner A', pct: 100 }],
  capacityMtpa: 10,
  underConstructionMtpa: 0,
  startYear: 2020,
  lat: 29.75,
  lon: -93.87,
  source: { name: 'GEM', release: 'September 2025' },
  us: {
    eiaProjects: ['Plant A'],
    doeNames: ['Plant A, LA'],
    trains: [{ train: 'Train 1' }],
    trainsOperating: 1,
    baseloadBcfd: 1.0,
    baseloadMtpa: 7.5,
    dockets: {},
  },
  ...over,
});

const fixture = () => {
  const terminals = normalizeTerminals({
    gem: { release: 'September 2025', retrieved: '2026-09-21' },
    eia: { release: '2026-Q2' },
    terminals: [
      terminal(),
      terminal({
        id: 'T2',
        name: 'Plant B',
        country: 'Qatar',
        capacityMtpa: 40,
        us: null,
      }),
      terminal({
        id: 'T3',
        name: 'Regas C',
        country: 'Japan',
        kind: 'import',
        capacityMtpa: 30,
        us: null,
      }),
      terminal({ id: 'bad', name: 'No coords', lat: null }),
    ],
  });
  const cargoes = normalizeCargoes({
    latestMonth: '2026-06',
    published: '2026-08-24',
    span: { from: '2025-07', to: '2026-06' },
    pairs: [
      {
        terminalId: 'T1',
        country: 'Japan',
        cargoes: 12,
        mmcf: 43800,
        months: 12,
      },
    ],
    monthly: [
      {
        month: '2025-07',
        terminalId: 'T1',
        country: 'Japan',
        cargoes: 6,
        mmcf: 21900,
      },
      {
        month: '2026-06',
        terminalId: 'T1',
        country: 'Japan',
        cargoes: 6,
        mmcf: 21900,
      },
      {
        month: '2024-01',
        terminalId: 'T1',
        country: 'Japan',
        cargoes: 1,
        mmcf: 3000,
      },
    ],
    cargoes: [
      {
        date: '2026-06-01',
        terminalId: 'T1',
        country: 'Japan',
        tanker: 'Ship 1',
        mmcf: 3650,
      },
    ],
    destinations: [],
  });
  const matrix = normalizeMatrix({
    year: 2025,
    world: 427.9,
    exporters: [{ column: 'Qatar', country: 'Qatar', terminalId: 'T2' }],
    importers: [{ market: 'Japan', country: 'Japan', terminalId: 'T3' }],
    cells: [{ exporter: 'Qatar', importer: 'Japan', mt: 3.4 }],
  });
  const routes = normalizeRoutes({
    engine: { name: 'searoute-ts', version: '2.3.0' },
    policy: { redSeaClosedFrom: '2024-01', viaRadiusKm: 40 },
    unrouted: [],
    routes: [
      {
        id: 'doe:T1:japan',
        grade: 'doe',
        period: '2025-07 to 2026-06',
        originId: 'T1',
        destinationId: 'T3',
        endpointRule: {
          origin: 'doe-point-of-exit',
          destination: 'largest-operating-import',
        },
        redSeaExposed: false,
        variantInUse: 'open',
        variants: {
          open: {
            nm: 9324,
            passages: ['panama'],
            via: ['Panama Canal'],
            coords: [
              [-93.87, 29.75],
              [-79.7, 9.1],
              [139.9, 35.4],
            ],
          },
          redSeaClosed: null,
        },
        volume: { cargoes: 12, mmcf: 43800, months: 12 },
      },
      {
        id: 'giignl:T2:T3',
        grade: 'giignl',
        period: 'annual 2025',
        originId: 'T2',
        destinationId: 'T3',
        endpointRule: {
          origin: 'largest-operating-export',
          destination: 'largest-operating-import',
        },
        redSeaExposed: true,
        variantInUse: 'redSeaClosed',
        variants: {
          open: {
            nm: 6000,
            passages: ['babelmandeb'],
            via: ['Bab el-Mandeb Strait'],
            coords: [
              [51.6, 25.9],
              [43.3, 12.8],
              [139.9, 35.4],
            ],
          },
          redSeaClosed: {
            nm: 10000,
            passages: [],
            via: ['Cape of Good Hope'],
            coords: [
              [51.6, 25.9],
              [20.9, -34.9],
              [139.9, 35.4],
            ],
          },
        },
        volume: { mt: 3.4 },
      },
      {
        id: 'giignl:T2:missing',
        grade: 'giignl',
        originId: 'T2',
        destinationId: 'nope',
        variants: {
          open: {
            nm: 1,
            coords: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      },
    ],
  });
  return { terminals, cargoes, matrix, routes };
};

test('normalizers freeze rows and drop records without a position or a kind', () => {
  const { terminals } = fixture();
  assert.equal(terminals.rows.length, 3);
  assert.ok(Object.isFrozen(terminals.rows[0]));
  assert.ok(Object.isFrozen(terminals.rows[0].owners));
  assert.equal(normalizeTerminals({ terminals: [] }), null);
  assert.equal(normalizeCargoes({ pairs: [] }), null);
  assert.equal(normalizeRoutes({ routes: [{ id: 'x' }] }), null);
});

test('the snapshot derives the twelve-month readings from the monthly rows, not the pairs', () => {
  const snapshot = buildLngSnapshot(fixture());
  const a = snapshot.rows.find((t) => t.id === 'T1');
  assert.equal(a.derived.cargoes, 12);
  assert.equal(a.derived.mmcf, 43800);
  assert.equal(a.derived.months, 12);
  assert.equal(a.derived.topDestination.country, 'Japan');
  assert.equal(a.derived.distinctTankers, 1);
  assert.equal(a.derived.series.length, 24);
  assert.equal(a.derived.series[23].month, '2026-06');
  assert.equal(a.derived.series[0].month, '2024-07');
  // The 2024-01 row lies outside the 24-month chart and must not leak in.
  assert.equal(
    a.derived.series.reduce((s, m) => s + m.mmcf, 0),
    43800,
  );
  // 43,800 MMcf over 365 days against 1.0 Bcf/d is exactly 12 %.
  assert.ok(Math.abs(a.derived.utilizationPct - 12) < 1e-9);
  const c = snapshot.rows.find((t) => t.id === 'T3');
  assert.equal(c.derived.inbound.length, 2);
  assert.equal(c.derived.inbound[0].origin, 'Plant A');
  assert.equal(
    snapshot.routes.length,
    2,
    'a route to a missing terminal is dropped',
  );
  assert.equal(snapshot.lagMonths, 2);
  assert.equal(
    snapshot.asOf,
    'Jul 2025 to Jun 2026 · DOE · 2-month lag · GEM September 2025',
  );
});

test('utilization is null, never NaN or a throw, on zero or missing capacity', () => {
  assert.equal(utilizationPct(1000, 0), null);
  assert.equal(utilizationPct(1000, null), null);
  assert.equal(utilizationPct(null, 1), null);
  assert.equal(utilizationPct(-1, 1), null);
  assert.ok(Math.abs(utilizationPct(365_000, 1) - 100) < 1e-9);
  const snapshot = buildLngSnapshot({
    ...fixture(),
    terminals: normalizeTerminals({
      gem: {},
      eia: {},
      terminals: [terminal({ us: { trains: [], baseloadBcfd: 0 } })],
    }),
  });
  assert.equal(snapshot.rows[0].derived.utilizationPct, null);
});

test('the drawn line follows the variant in use and widths scale by log within a grade', () => {
  const { routes } = fixture();
  const closed = routes.rows.find((r) => r.id === 'giignl:T2:T3');
  assert.equal(routeLine(closed).via[0], 'Cape of Good Hope');
  const open = routes.rows.find((r) => r.id === 'doe:T1:japan');
  assert.equal(routeLine(open).via[0], 'Panama Canal');
  assert.equal(arcWidthPx(1, { min: 1, max: 1000 }), 1.5);
  assert.equal(arcWidthPx(1000, { min: 1, max: 1000 }), 8);
  assert.ok(
    Math.abs(arcWidthPx(Math.sqrt(1000), { min: 1, max: 1000 }) - 4.75) < 1e-9,
  );
  assert.equal(arcWidthPx(0, { min: 1, max: 1000 }), 1.5);
  assert.equal(LNG_GRADES.giignl.dashed, true);
  assert.equal(LNG_GRADES.doe.dashed, false);
});

test('formatters and the analyst record are JSON-safe and labelled', () => {
  assert.equal(formatMonth('2026-06'), 'Jun 2026');
  assert.equal(monthsBetween('2025-07', '2026-06'), 11);
  assert.equal(formatMtpa(29.5), '29.5 Mtpa');
  assert.equal(formatMtpa(0.08), '0.08 Mtpa');
  assert.equal(formatMmcf(6_103_865), '6.10 Tcf');
  assert.equal(formatMmcf(120_755), '120.8 Bcf');
  assert.equal(formatMmcf(3650), '3,650 MMcf');
  assert.equal(
    lngAsOf({
      span: { from: '2025-07', to: '2026-06' },
      lagMonths: null,
      gemRelease: null,
    }),
    'Jul 2025 to Jun 2026 · DOE',
  );
  const snapshot = buildLngSnapshot(fixture());
  const record = mapAnalystRecord(snapshot.rows[0]);
  assert.equal(JSON.parse(JSON.stringify(record)).grade, 'EIA · DOE · GEM');
  assert.equal(record.utilizationPct, 12);
  assert.equal(mapAnalystRecord(snapshot.rows[1]).grade, 'GEM');
  assert.deepEqual(
    usDossierOrder(snapshot.rows).map((t) => t.id),
    ['T1'],
  );
});
