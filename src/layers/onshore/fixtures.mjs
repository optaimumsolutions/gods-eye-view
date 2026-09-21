import { READING_COLUMNS } from './records.js';

/**
 * Shared fixtures for the onshore tests. They live outside any `*.test.mjs`
 * file on purpose: importing a test file registers its tests in the importer,
 * so the milestone-0 budget test in `records.test.mjs` once ran three times,
 * twice inside the parallel batch where it starved and failed.
 */

/** Twenty-four months ending 2026-07, so "a year ago" is index 11. */
export function months() {
  const out = [];
  for (let i = 23; i >= 0; i -= 1) {
    const total = 2026 * 12 + 6 - i;
    out.push(
      `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`,
    );
  }
  return out;
}

/** A reading array in READING_COLUMNS order: oil, water, days, runs, gas, gasSold, flared. */
export function reading({
  oil = 459,
  water = 1189,
  days = 26,
  runs = 260,
  gas = 2532,
  gasSold = 1940,
  flared = 592,
} = {}) {
  return [oil, water, days, runs, gas, gasSold, flared];
}

export function facility(id, overrides = {}) {
  return {
    id,
    state: 'ND',
    fileNo: 22023,
    name: `WELL ${id.slice(-4)}`,
    operator: 'DEVON ENERGY WILLISTON, L.L.C',
    county: 'MCK',
    field: 'ALEXANDER',
    pools: ['BAKKEN'],
    lat: 47.9075,
    lon: -103.5804,
    status: 'producing',
    firstSeen: '2024-08',
    lastSeen: '2026-07',
    current: reading(),
    prior: reading({ gas: 2400, oil: 420 }),
    lastYear: reading({ gas: 3100, oil: 600 }),
    summary: {
      firstMonth: '2024-08',
      lastMonth: '2026-07',
      monthsProducing: 24,
      peakGasMcfd: 210.5,
      peakGasMonth: '2024-09',
      peakOilBopd: 55.2,
      peakOilMonth: '2024-09',
      cumGasMcf: 90_000,
      cumOilBbl: 20_000,
      cumWaterBbl: 30_000,
      cumFlaredMcf: 9_000,
    },
    ...overrides,
  };
}

export function payload(facilities, overrides = {}) {
  return {
    id: 'onshore-williston',
    version: 1,
    retrieved: '2026-09-21',
    region: {
      id: 'williston',
      layerId: 'production-williston',
      name: 'Williston Basin',
      basins: ['Bakken', 'Three Forks'],
      states: ['ND'],
      center: { lat: 47.85, lon: -103.1 },
    },
    sources: [
      {
        state: 'ND',
        id: 'nd-dmr-mpr',
        name: 'North Dakota DMR Oil and Gas Division, Monthly Production Report',
        short: 'ND DMR',
        url: 'https://www.dmr.nd.gov/oilgas/mpr/',
        grain: 'well',
        cadence: 'monthly',
        lagDays: 45,
        datum: 'NAD83 (assumed)',
        transform: 'none',
        license: 'Public record',
        reporterRule: 'wells present in the workbook',
        newestMonth: '2026-07',
      },
    ],
    readingColumns: READING_COLUMNS,
    months: months(),
    current: { month: '2026-07', index: 23 },
    completeness: {
      rule: 'test',
      threshold: 0.9,
      lookback: 12,
      floor: 0.5,
      medianReporters: 22071,
      table: [
        { month: '2026-07', reporters: 20231, share: 0.917, complete: true },
        { month: '2026-06', reporters: 22402, share: 1.015, complete: true },
      ],
    },
    reconciliation: {
      source: 'EIA',
      states: ['ND'],
      series: ['N9010ND2', 'N9050ND2', 'MCRFPND1'],
      latest: {
        month: '2026-06',
        regionGasMcf: 102_066_847,
        regionOilBbl: 30_379_983,
        eiaGrossMcf: 108_108_000,
        eiaMarketedMcf: 102_268_000,
        eiaOilBbl: 34_745_000,
        gasToGross: 0.9441,
        gasToMarketed: 0.998,
        oilToEia: 0.8744,
      },
      note: 'test',
    },
    counts: { facilities: facilities.length, unplaced: 0, operators: 3 },
    shards: { count: 1024, path: 'data/onshore/williston/history/' },
    facilities,
    ...overrides,
  };
}

export function clusters() {
  const n = months().length;
  const series = (gasNow, gasLastYear, producing) => ({
    gas: new Array(n)
      .fill(50_000)
      .map((v, i) => (i === n - 1 ? gasNow : i === n - 13 ? gasLastYear : v)),
    oil: new Array(n).fill(10_000),
    water: new Array(n).fill(5_000),
    flared: new Array(n).fill(1_000),
    producing: new Array(n).fill(producing),
  });
  return {
    months: months(),
    fields: [
      {
        id: 'ALEXANDER',
        name: 'ALEXANDER',
        county: 'MCK',
        lat: 47.9,
        lon: -103.6,
        wells: 120,
        reported: 110,
        producing: 100,
        series: series(80_000, 60_000, 100),
      },
      {
        id: 'ZION',
        name: 'ZION',
        county: 'BOT',
        lat: 48.9,
        lon: -100.9,
        wells: 5,
        reported: 4,
        producing: 0,
        series: series(0, 0, 0),
      },
    ],
    counties: [
      {
        id: 'MCK',
        name: 'MCK',
        county: null,
        lat: 47.9,
        lon: -103.6,
        wells: 5000,
        reported: 4800,
        producing: 4500,
        series: series(1_000_000, 900_000, 4500),
      },
    ],
  };
}
