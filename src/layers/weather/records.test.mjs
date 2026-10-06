import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIXTURE_ENTRIES,
  FIXTURE_META,
  fixtureBlock,
  fixtureNormals,
  fixturePayload,
  fixtureSkill,
} from './fixtures.mjs';
import {
  blocksByEntry,
  ensembleUrl,
  flattenPoints,
  marineUrl,
  metaUrl,
  normalizeMeta,
} from './live.js';
import {
  aggregateEntry,
  alphaLead,
  alphaSpread,
  anomalyBand,
  buildEntryReadings,
  buildWeatherSnapshot,
  confidenceFor,
  dayOfYear,
  mapAnalystRecord,
  memberColumns,
  percentile,
  percentileRank,
} from './records.js';

const snapshot = () => {
  const { points, slices } = flattenPoints(FIXTURE_ENTRIES);
  return buildWeatherSnapshot({
    entries: FIXTURE_ENTRIES,
    blocksByEntry: blocksByEntry(fixturePayload(), slices, points.length),
    meta: normalizeMeta(FIXTURE_META),
    normals: fixtureNormals(),
    skill: fixtureSkill(),
    fetchedAt: Date.UTC(2026, 8, 30, 15, 31),
  });
};

test('live URLs: one ensemble GET for every point, metadata per model, marine for the Gulf', () => {
  const { points, slices } = flattenPoints(FIXTURE_ENTRIES);
  assert.equal(points.length, 4);
  assert.deepEqual(slices.get('permian'), [0, 2]);
  assert.deepEqual(slices.get('gulf-lng'), [3, 4]);
  const url = new URL(ensembleUrl(points));
  assert.equal(url.searchParams.get('latitude'), '32,32.5,29.76,29.73');
  assert.equal(url.searchParams.get('models'), 'ecmwf_aifs025_ensemble');
  assert.equal(url.searchParams.get('forecast_days'), '15');
  assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.match(
    url.searchParams.get('daily'),
    /temperature_2m_min,temperature_2m_max/,
  );
  assert.equal(
    metaUrl(),
    'https://ensemble-api.open-meteo.com/data/ecmwf_aifs025_ensemble/static/meta.json',
  );
  assert.match(
    marineUrl([{ lat: 1, lon: 2 }]),
    /marine-api\.open-meteo\.com\/v1\/marine\?latitude=1&longitude=2/,
  );
  const meta = normalizeMeta(FIXTURE_META);
  assert.equal(meta.initialisedAt, '2026-09-30T00:00:00.000Z');
  assert.equal(meta.availableAt, '2026-09-30T09:36:00.000Z');
  assert.equal(normalizeMeta({}), null);
  assert.equal(
    blocksByEntry(fixturePayload().slice(0, 3), slices, 4),
    null,
    'a short block list is malformed',
  );
});

test('members: control + _memberNN in a stable order; percentiles are linear', () => {
  const block = fixtureBlock({ members: 5 });
  const cols = memberColumns(block.daily, 'temperature_2m_min');
  assert.deepEqual(cols, [
    'temperature_2m_min',
    'temperature_2m_min_member01',
    'temperature_2m_min_member02',
    'temperature_2m_min_member03',
    'temperature_2m_min_member04',
  ]);
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 10), 1.4);
  assert.equal(percentile([], 50), null);
  assert.equal(percentileRank([1, 2, 3, 4], 3), 0.625);
  assert.equal(
    dayOfYear('2026-03-01'),
    61,
    'leap calendar: 02-29 has its own slot',
  );
});

test('aggregation is point-then-weight per member, then percentiles across members', () => {
  const entry = FIXTURE_ENTRIES[0];
  const blocks = fixturePayload().slice(0, 2);
  const agg = aggregateEntry(entry, blocks);
  assert.equal(agg.n, 51);
  assert.equal(agg.days.length, 15);
  // member 25 (the median member) on D+0: 0.75*30 + 0.25*34 = 31
  assert.equal(agg.members.tmin[0][25], 31);
  const readings = buildEntryReadings(entry, agg, {
    normals: fixtureNormals(),
  });
  const d0 = readings.days[0];
  assert.equal(d0.tmin.p50, 31);
  assert.ok(d0.tmin.p10 < d0.tmin.p50 && d0.tmin.p50 < d0.tmin.p90);
  assert.ok(
    readings.days[14].tmin.spread > d0.tmin.spread,
    'spread widens with lead in the fixture',
  );
  // normal is 40 in the fixture → D+0 anomaly −9 → colder; by D+14 (p50 17) → much colder
  assert.equal(d0.anomalyF, -9);
  assert.equal(d0.band, 'colder');
  assert.equal(readings.days[14].band, 'much-colder');
  // freeze count by p10 (below 25°F from D+2: 31 − d − 4(1 + d/7)) vs by p50 (31 − d < 25 from D+7)
  assert.equal(readings.window.freezeDays, 13);
  assert.equal(readings.window.freezeDaysP50, 8);
  assert.ok(
    readings.days[2].freezeShare > 0 && readings.days[2].freezeShare < 0.5,
  );
  assert.equal(readings.window.heatingDays, 15);
});

test('degree days are per member from (TMAX+TMIN)/2, never HDD of the mean; gale days from p90 wind', () => {
  const snap = snapshot();
  const texas = snap.rows.find((r) => r.id === 'texas');
  // fixture: TMIN 60, TMAX 80 for the median member → mean 70 → HDD 0, CDD 5 per day
  assert.equal(texas.days[0].hdd.p50, 0);
  assert.equal(texas.days[0].cdd.p50, 5);
  assert.equal(texas.window.cdd14, 70);
  assert.equal(texas.window.hdd14, 0);
  const gulf = snap.rows.find((r) => r.id === 'gulf-lng');
  // wind = 34 + m/5 → p90 ≈ 43 mph ≥ 39 every day of the 7-day window
  assert.equal(gulf.window.galeDays, 7);
  assert.equal(gulf.window.freezeDays, null, 'freeze days are a basin reading');
});

test('anomaly bands follow A-3 and the confidence product follows A-7 / A-8', () => {
  assert.equal(anomalyBand(-16), 'much-colder');
  assert.equal(anomalyBand(-7.1), 'colder');
  assert.equal(anomalyBand(0), 'near-normal');
  assert.equal(anomalyBand(7), 'warmer');
  assert.equal(anomalyBand(15), 'much-warmer');
  assert.equal(anomalyBand(null), 'unknown');
  const skill = fixtureSkill();
  assert.equal(alphaLead(skill, 'ecmwf_aifs025_ensemble', 0), 1);
  // confidence 0.65 at D+7 → 0.35 + 0.65*0.65 = 0.7725
  assert.ok(
    Math.abs(alphaLead(skill, 'ecmwf_aifs025_ensemble', 7) - 0.7725) < 1e-9,
  );
  assert.equal(alphaLead(skill, 'unknown-model', 9), 1, 'no curve → no fade');
  assert.equal(alphaSpread(1), 0.4);
  assert.equal(alphaSpread(0), 1);
  assert.equal(alphaSpread(null), 1);
  const c = confidenceFor({
    skill,
    model: 'ecmwf_aifs025_ensemble',
    lead: 7,
    spread: 10,
    spreadSample: [2, 4, 6, 8, 10],
  });
  assert.equal(c.spreadPercentile, 0.9);
  assert.equal(c.provisional, true);
  assert.match(c.skillLabel, /provisional/);
  assert.ok(Math.abs(c.alpha - 0.7725 * (1 - 0.6 * 0.9)) < 1e-3);
});

test('every day carries a daily-class observation stamped issued/valid/published, and the analyst record is flat', () => {
  const snap = snapshot();
  const permian = snap.rows.find((r) => r.id === 'permian');
  assert.equal(permian.days.length, 15);
  const d3 = permian.days[3];
  assert.equal(d3.observation.freshnessClass, 'daily');
  assert.equal(d3.observation.observedAt, '2026-09-30T00:00:00.000Z');
  assert.equal(d3.observation.publishedAt, '2026-09-30T09:36:00.000Z');
  assert.equal(d3.observation.validAt, '2026-10-03T00:00:00.000Z');
  assert.equal(d3.observation.source, 'ECMWF AIFS ENS via Open-Meteo');
  const rec = mapAnalystRecord(permian, 3);
  assert.equal(rec.lead, 3);
  assert.equal(rec.valid, '2026-10-03');
  assert.equal(rec.threshold, 25);
  assert.equal(typeof rec.confidence, 'number');
  assert.equal(rec.source, 'ECMWF AIFS ENS via Open-Meteo');
  for (const v of Object.values(rec))
    assert.ok(v === null || ['string', 'number'].includes(typeof v));
});

test('snapshotLabel: a self-naming source (the oracle) wins; else the Open-Meteo model label', async () => {
  const { snapshotLabel, MODEL_LABELS } = await import('./records.js');
  const oracle = 'ECMWF AIFS ENS (open data) via Oil Oracle store';
  assert.equal(
    snapshotLabel({ source: oracle, model: 'ecmwf_aifs025_ensemble' }, 'x'),
    oracle,
  );
  assert.equal(
    snapshotLabel({ model: 'ncep_gefs025' }, 'x'),
    MODEL_LABELS.ncep_gefs025,
  );
  assert.equal(snapshotLabel({ model: 'unknown' }, 'previous'), 'previous');
  assert.equal(
    snapshotLabel({ source: '  ', model: 'ncep_gefs025' }, 'x'),
    MODEL_LABELS.ncep_gefs025,
  );
  assert.ok(!snapshotLabel({ source: oracle }, '').includes('Open-Meteo'));
});
