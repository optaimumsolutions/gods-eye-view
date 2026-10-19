import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegionDossierModel,
  buildSiteDossierModel,
  nightChartDomain,
} from './dossier.js';
import {
  buildFlaresSnapshot,
  normalizeFlaresPayload,
  normalizeSitesBundle,
} from './records.js';

function night(n, overrides = {}) {
  return {
    night: n,
    final: true,
    cloud: { state: 'clear', stations: 4, covered: 0 },
    suspect: false,
    counts: { site: 2, unlisted: 1, other: 1 },
    litSites: 1,
    siteFrpMw: 4.2,
    satellites: ['N20'],
    sites: [
      { id: 's1', detections: 2, maxFrp: 4.2, satellites: ['N20'], cloud: 'clear' },
    ],
    overpasses: [],
    pips: [],
    ...overrides,
  };
}

const BUNDLE = normalizeSitesBundle({
  region: {
    id: 'williston',
    name: 'Williston Basin',
    center: { lat: 47.85, lon: -103.1 },
  },
  counts: { sitesFlaringCurrent: 2, flaredMmcfdCurrent: 1.2 },
  months: ['2026-06', '2026-07'],
  source: {
    name: 'North Dakota DMR',
    retrieved: '2026-09-27',
    currentMonth: '2026-07',
  },
  sites: [
    {
      id: 's1',
      lat: 48.0,
      lon: -103.0,
      field: 'ELKHORN RANCH',
      county: 'BIL',
      operators: ['WHITE ROCK'],
      wells: ['w1', 'w2'],
      flared: [100, 310],
      lastFlaredMonth: '2026-07',
      monthsFlared: 12,
      gas: 566,
      oil: 751,
    },
    {
      id: 's2',
      lat: 47.5,
      lon: -102.5,
      field: 'CHARLSON',
      county: 'MCK',
      operators: ['PETRO-HUNT'],
      wells: ['w3'],
      flared: [50, 0],
      lastFlaredMonth: '2026-06',
      monthsFlared: 3,
      gas: 10,
      oil: 20,
    },
  ],
});

const SNAPSHOT = buildFlaresSnapshot(
  normalizeFlaresPayload({
    region: 'williston',
    name: 'Williston Basin',
    retrievedAt: '2026-10-19T12:00:00Z',
    source: 'NASA FIRMS',
    windowNights: 90,
    nights: [
      night('2026-10-19', {
        cloud: { state: 'obscured', stations: 4, covered: 3 },
        sites: [],
        litSites: 0,
        siteFrpMw: 0,
      }),
      night('2026-10-18'),
      night('2026-10-17'),
    ],
    baseline: {
      clearNights: 2,
      litMedian: 1,
      litP10: 1,
      litP90: 1,
      frpMedian: 4.2,
    },
  }),
  BUNDLE,
);

test('the site model charts every served night and the bundle months', () => {
  const row = SNAPSHOT.rows.find((r) => r.id === 's1');
  const model = buildSiteDossierModel(row, SNAPSHOT);
  assert.equal(model.mode, 'site');
  assert.equal(model.title, 'ELKHORN RANCH');
  // One night-chart entry per served night, in date order; the obscured
  // night is hatched and reads FRP 0 (dark).
  assert.deepEqual(
    model.nightChart.series.map((n) => [n.night, n.frp, n.hatched]),
    [
      ['2026-10-17', 4.2, false],
      ['2026-10-18', 4.2, false],
      ['2026-10-19', 0, true],
    ],
  );
  // One month bar per bundle month, straight from the site's filed series.
  assert.deepEqual(model.monthChart.months, ['2026-06', '2026-07']);
  assert.deepEqual(model.monthChart.values, [100, 310]);
  // Filed flared is per calendar day of the month: 310 Mcf over July's 31 days.
  assert.equal(model.stats[2].value, '10 Mcf/d');
  assert.equal(model.stats[1].value, '2 of 2');
});

test('the region model carries the clear-night band and the region total', () => {
  const model = buildRegionDossierModel(SNAPSHOT);
  assert.equal(model.mode, 'region');
  assert.deepEqual(model.nightChart.band, { p10: 1, median: 1, p90: 1 });
  assert.deepEqual(
    model.nightChart.series.map((n) => [n.night, n.litSites, n.hatched]),
    [
      ['2026-10-17', 1, false],
      ['2026-10-18', 1, false],
      ['2026-10-19', 0, true],
    ],
  );
  assert.deepEqual(model.monthChart.values, [150, 310]);
  assert.equal(model.stats[0].value, '1 lit');
  assert.equal(model.stats[3].value, '1.2 MMcf/d');
});

test('the night domain spans the window and ends at the newest night', () => {
  const domain = nightChartDomain(
    [{ night: '2026-10-17' }, { night: '2026-10-19' }],
    90,
  );
  assert.equal(domain.days, 90);
  assert.equal(domain.endMs, Date.parse('2026-10-19T00:00:00Z'));
  assert.equal(domain.endMs - domain.startMs, 89 * 86_400_000);
  assert.equal(nightChartDomain([], 90), null);
});
