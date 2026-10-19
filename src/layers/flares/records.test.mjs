import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlaresSnapshot,
  displayNightOf,
  lastLitBySite,
  litNightCounts,
  mapAnalystRecord,
  normalizeFlaresPayload,
  normalizeSitesBundle,
} from './records.js';

/** A served night, newest-first order left to the normalizer. */
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
    sites: [{ id: 's1', detections: 2, maxFrp: 4.2, satellites: ['N20'], cloud: 'clear' }],
    overpasses: [{ satellite: 'N20', ms: Date.parse(`${n}T08:50:00Z`) }],
    pips: [{ lat: 48.3, lon: -103.0, frp: 1.1, kind: 'other' }],
    ...overrides,
  };
}

const BUNDLE = {
  region: {
    id: 'williston',
    name: 'Williston Basin',
    center: { lat: 47.85, lon: -103.1 },
  },
  counts: { sitesFlaringCurrent: 2, flaredMmcfdCurrent: 1.2 },
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
      flared: [100, 300],
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
};

test('normalizeFlaresPayload validates nights and re-asserts newest-first', () => {
  const payload = normalizeFlaresPayload({
    region: 'williston',
    name: 'Williston Basin',
    retrievedAt: '2026-10-19T12:00:00Z',
    source: 'NASA FIRMS',
    windowNights: 60,
    nights: [night('2026-10-17'), { night: 'bad' }, night('2026-10-18')],
    baseline: { clearNights: 2, litMedian: 1, frpMedian: 4.2 },
  });
  assert.equal(payload.nights.length, 2);
  assert.equal(payload.nights[0].night, '2026-10-18');
  assert.equal(payload.baseline.clearNights, 2);
  assert.equal(payload.baseline.litP10, null);
  // A payload from a provider without pips/overpasses still normalizes.
  const bare = normalizeFlaresPayload({
    nights: [{ ...night('2026-10-18'), pips: undefined, overpasses: undefined }],
  });
  assert.deepEqual(bare.nights[0].pips, []);
  assert.deepEqual(bare.nights[0].overpasses, []);
  assert.equal(normalizeFlaresPayload({ error: 'nope' }), null);
});

test('normalizeSitesBundle keeps positions, the filed figures and the counts', () => {
  const bundle = normalizeSitesBundle(BUNDLE);
  assert.equal(bundle.sites.length, 2);
  assert.equal(bundle.sites[0].wells, 2);
  assert.equal(bundle.sites[0].flaredMcfCurrent, 300);
  assert.equal(bundle.counts.flaredMmcfdCurrent, 1.2);
  assert.equal(bundle.currentMonth, '2026-07');
  assert.equal(normalizeSitesBundle({ sites: [] }), null);
});

test('displayNightOf prefers the newest trusted clear night', () => {
  const nights = [
    night('2026-10-19', { cloud: { state: 'obscured', stations: 4, covered: 3 } }),
    night('2026-10-18', { suspect: true }),
    night('2026-10-17'),
  ];
  const display = displayNightOf(nights);
  assert.equal(display.night, '2026-10-17');
  assert.equal(display.isClear, true);
  // No clear night at all: the newest serves, flagged not clear.
  const fallback = displayNightOf([
    night('2026-10-19', { cloud: { state: 'obscured', stations: 4, covered: 3 } }),
  ]);
  assert.equal(fallback.night, '2026-10-19');
  assert.equal(fallback.isClear, false);
  assert.equal(displayNightOf([]), null);
});

test('litNightCounts and lastLitBySite read the clear window and the full store', () => {
  const nights = [
    night('2026-10-19', {
      cloud: { state: 'obscured', stations: 4, covered: 3 },
      sites: [{ id: 's2', detections: 1, maxFrp: 2.0, satellites: ['N21'], cloud: 'obscured' }],
    }),
    night('2026-10-18'),
    night('2026-10-17'),
  ];
  const counts = litNightCounts(nights);
  // s2's obscured night is outside the norm; s1 counts twice.
  assert.equal(counts.get('s1'), 2);
  assert.equal(counts.has('s2'), false);
  const last = lastLitBySite(nights);
  assert.equal(last.get('s2').night, '2026-10-19');
  assert.equal(last.get('s1').night, '2026-10-18');
});

test('buildFlaresSnapshot joins the display night onto every bundled site', () => {
  const payload = normalizeFlaresPayload({
    region: 'williston',
    name: 'Williston Basin',
    retrievedAt: '2026-10-19T12:00:00Z',
    source: 'NASA FIRMS',
    windowNights: 60,
    nights: [
      night('2026-10-19', { cloud: { state: 'partial', stations: 4, covered: 1 } }),
      night('2026-10-18'),
      night('2026-10-17'),
    ],
    baseline: { clearNights: 2, litMedian: 1 },
  });
  const snapshot = buildFlaresSnapshot(payload, normalizeSitesBundle(BUNDLE));
  assert.equal(snapshot.displayNight.night, '2026-10-18');
  assert.equal(snapshot.latestNight.night, '2026-10-19');
  assert.equal(snapshot.clearNights, 2);
  assert.equal(snapshot.rows.length, 2);
  const [s1, s2] = snapshot.rows;
  assert.equal(s1.lit, true);
  assert.equal(s1.maxFrp, 4.2);
  assert.equal(s1.litNights, 2);
  assert.equal(snapshot.frpMax, 4.2);
  assert.equal(s2.lit, false);
  assert.equal(s2.lastLit, null);
  const record = mapAnalystRecord(s1);
  assert.equal(record.operator, 'WHITE ROCK');
  // Last lit counts any sky state: the newer partial night wins the age line.
  assert.equal(record.lastLitNight, '2026-10-19');
  assert.equal(record.flaredMcfCurrent, 300);
});
