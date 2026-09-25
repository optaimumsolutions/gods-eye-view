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

const NOW = Date.parse('2026-09-24T16:00:00Z');

/** The /api/oracle/basins payload shape (oracle tools/oracle_api.py). */
function payload({ observed = '2026-09-20', init = '2026-09-23' } = {}) {
  return {
    source: 'Oil Oracle store',
    basins: [
      {
        region: 'Bakken',
        observed: { observedAt: observed, tminF: 52.0, series: [[observed, 52.0]] },
        forecast: {
          model: 'AIFS_ENS',
          publishedAt: init,
          observedAt: init,
          frzdd14: 0,
          tminF: [],
          frzdd: [],
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

test('currentBasinReading drops halves older than five days', () => {
  const fresh = normaliseBasinWeather(payload()).get('Bakken');
  assert.equal(currentBasinReading(fresh, { now: NOW }).tminF, 52);
  const oldObs = normaliseBasinWeather(payload({ observed: '2026-09-04' })).get('Bakken');
  const partial = currentBasinReading(oldObs, { now: NOW });
  assert.equal(partial.tminF, null);
  assert.equal(partial.frzdd14, 0);
  const allOld = normaliseBasinWeather(
    payload({ observed: '2026-09-04', init: '2026-09-04' }),
  ).get('Bakken');
  assert.equal(currentBasinReading(allOld, { now: NOW }), null);
});

test('basinWeatherLine states the reading, labelled as the oracle store', () => {
  const reading = currentBasinReading(normaliseBasinWeather(payload()).get('Bakken'), {
    now: NOW,
  });
  assert.equal(
    basinWeatherLine(reading),
    'Bakken weather (Oil Oracle) · low 52°F on 09-20 · 14d freeze 0.0 °F·d, AIFS 09-23',
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
