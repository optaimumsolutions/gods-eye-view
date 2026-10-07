import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basinWeatherLine,
  createOracleBasinWeatherSource,
  currentBasinReading,
  normaliseBasinWeather,
  pickBasinReading,
} from './basinWeather.js';
import { createRegionOverlayEntry } from './model.js';
import { createSharedFetch } from '../../data/sharedFetch.js';

const NOW = Date.parse('2026-09-24T16:00:00Z');

/** The /api/oracle/basins payload shape (oracle tools/oracle_api.py). */
function payload({
  observed = '2026-09-20',
  init = '2026-09-23',
  obsFreshness,
  fcFreshness,
} = {}) {
  return {
    source: 'Oil Oracle store',
    basins: [
      {
        region: 'Bakken',
        observed: {
          observedAt: observed,
          tminF: 52.0,
          series: [[observed, 52.0]],
          ...(obsFreshness ? { freshness: obsFreshness } : {}),
        },
        forecast: {
          model: 'AIFS_ENS',
          publishedAt: init,
          observedAt: init,
          frzdd14: 0,
          tminF: [],
          frzdd: [],
          ...(fcFreshness ? { freshness: fcFreshness } : {}),
        },
      },
      { region: 'Permian', observed: null, forecast: null },
    ],
  };
}

test('normaliseBasinWeather reads the route into readings by basin', () => {
  const readings = normaliseBasinWeather(payload());
  assert.deepEqual(readings.get('Bakken'), {
    basin: 'Bakken',
    observedAt: '2026-09-20',
    tminF: 52,
    forecastInit: '2026-09-23',
    frzdd14: 0,
    model: 'AIFS_ENS',
    observedState: null,
    forecastState: null,
  });
  assert.equal(readings.get('Permian').tminF, null);
  assert.equal(normaliseBasinWeather({}), null);
  assert.equal(normaliseBasinWeather({ basins: [{ region: '' }] }), null);
});

test('pickBasinReading takes the first of the region basins the store knows', () => {
  const readings = normaliseBasinWeather(payload());
  assert.equal(pickBasinReading(readings, ['Three Forks', 'Bakken']).basin, 'Bakken');
  assert.equal(pickBasinReading(readings, ['Marcellus']), null);
  assert.equal(pickBasinReading(null, ['Bakken']), null);
});

test('globe row 18: each half gets ok / late / stale by the oracle tiers (TMIN 3 d, run 2 d)', () => {
  const at = (observed, init) =>
    currentBasinReading(normaliseBasinWeather(payload({ observed, init })).get('Bakken'), {
      now: NOW,
    });
  const fresh = at('2026-09-23', '2026-09-23');
  assert.equal(fresh.observedState, 'ok');
  assert.equal(fresh.observedAgeDays, 1);
  assert.equal(fresh.tminF, 52);
  assert.equal(at('2026-09-20', '2026-09-23').observedState, 'late');
  const stale = at('2026-09-04', '2026-09-04');
  assert.equal(stale.observedState, 'stale');
  assert.equal(stale.tminF, null, 'a stale low is not shown as a value');
  assert.equal(stale.observedAt, '2026-09-04', 'but its date is kept to name it');
  assert.equal(stale.forecastState, 'stale');
  assert.equal(stale.frzdd14, null);
  assert.equal(
    basinWeatherLine(stale),
    'Bakken weather (Oil Oracle) · low: stale, last 09-04 (20 d ago) · 14d freeze: stale, AIFS 09-04',
    'named, not dropped',
  );
  assert.equal(at('2026-09-23', '2026-09-21').forecastState, 'late');
});

test("globe row 18: the route's own freshness verdict wins over the age rule", () => {
  const reading = currentBasinReading(
    normaliseBasinWeather(
      payload({
        observed: '2026-09-04',
        obsFreshness: { state: 'late', ageHours: 480 },
        fcFreshness: { state: 'stale', ageHours: 30 },
      }),
    ).get('Bakken'),
    { now: NOW },
  );
  assert.equal(reading.observedState, 'late');
  assert.equal(reading.tminF, 52);
  assert.equal(reading.forecastState, 'stale');
  assert.equal(reading.frzdd14, null);
  const none = normaliseBasinWeather(payload({ obsFreshness: { state: 'none' } })).get('Bakken');
  assert.equal(none.observedState, null, "'none' falls back to the age rule");
});

test('currentBasinReading is null only when neither half exists', () => {
  const empty = normaliseBasinWeather(payload()).get('Permian');
  assert.equal(currentBasinReading(empty, { now: NOW }), null);
  assert.equal(currentBasinReading(null), null);
});

test('basinWeatherLine states the reading and its age, labelled as the oracle store', () => {
  const reading = currentBasinReading(normaliseBasinWeather(payload()).get('Bakken'), {
    now: NOW,
  });
  assert.equal(
    basinWeatherLine(reading),
    'Bakken weather (Oil Oracle) · low 52°F on 09-20 (4 d ago, late) · 14d freeze 0.0 °F·d, AIFS 09-23',
  );
  const fresh = currentBasinReading(
    normaliseBasinWeather(payload({ observed: '2026-09-24', init: '2026-09-21' })).get('Bakken'),
    { now: NOW },
  );
  assert.equal(
    basinWeatherLine(fresh),
    'Bakken weather (Oil Oracle) · low 52°F on 09-24 (today) · 14d freeze 0.0 °F·d, AIFS 09-21 (late)',
  );
  assert.equal(basinWeatherLine(null), null);
  assert.equal(
    basinWeatherLine({ basin: 'X', tminF: null, observedAt: null, frzdd14: null }),
    null,
  );
});

test('the region card carries the weather line only when there is one', () => {
  const snapshot = {
    regionId: 'williston',
    region: { name: 'Williston Basin' },
    counts: { producing: 17915, gasMcfdTotal: 3.3e6, oilBbldTotal: 1.17e6 },
    asOf: 'as of 2026-07',
  };
  const plain = createRegionOverlayEntry(snapshot, null);
  assert.equal(plain.details.length, 3);
  const withLine = createRegionOverlayEntry(snapshot, null, 'Bakken weather (Oil Oracle) · low 52°F on 09-20');
  assert.equal(withLine.details.length, 4);
  assert.equal(withLine.details[2], 'Bakken weather (Oil Oracle) · low 52°F on 09-20');
  assert.equal(withLine.details[3], 'zoom in for fields, then wells');
});

test('the source reads the route and rejects HTTP errors and malformed bodies', async () => {
  const calls = [];
  const ok = createOracleBasinWeatherSource({
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => payload() };
    },
  });
  const readings = await ok.getReadings();
  assert.equal(calls[0], '/api/oracle/basins');
  assert.equal(readings.get('Bakken').tminF, 52);
  for (const [status, body] of [
    [502, {}],
    [404, { error: 'no route' }],
    [200, { nope: true }],
  ]) {
    const source = createOracleBasinWeatherSource({
      fetchImpl: async () => ({ ok: status === 200, status, json: async () => body }),
    });
    await assert.rejects(source.getReadings());
  }
});

test('FR-D29: the five onshore layers share one basins request per tick', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const fetchImpl = async (url) => {
    calls += 1;
    await gate;
    return { ok: true, status: 200, json: async () => payload() };
  };
  const shared = createSharedFetch({ fetchImpl });
  const sources = Array.from({ length: 5 }, () =>
    createOracleBasinWeatherSource({ fetchImpl, shared }),
  );
  const reads = sources.map((source) => source.getReadings());
  release();
  const all = await Promise.all(reads);
  assert.equal(calls, 1, 'one request for five layers');
  for (const readings of all) assert.equal(readings.get('Bakken').tminF, 52);
  await sources[2].getReadings();
  assert.equal(calls, 1, 'the next layer inside the TTL reuses the body');
  shared.invalidate(); // a wx_ghcn / wx_aifs store write (liveRefresh)
  await sources[0].getReadings();
  assert.equal(calls, 2, 'a store write forces a fresh read');
});

test('FR-D29: an injected fetchImpl alone reads uncached, never the shared memo', async () => {
  let calls = 0;
  const source = createOracleBasinWeatherSource({
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => payload() };
    },
  });
  await source.getReadings();
  await source.getReadings();
  assert.equal(calls, 2);
});
