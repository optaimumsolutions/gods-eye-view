import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCING_AUTHORITIES,
  eiaGridUrl,
  eiaTimestamp,
  gridLine,
  gridSharePct,
  normalizeGridDemand,
  normalizeSiteWeather,
  openMeteoUrl,
  parseEiaDate,
  weatherLine,
} from './live.js';

const NOW = Date.parse('2026-09-18T20:00:00Z');

/** The shape the 930-api actually returns: parallel DATES and DATA arrays. */
function series(respondent, typeId, dates, data) {
  return {
    RESPONDENT_ID: respondent,
    RESPONDENT_NAME: `${respondent} long name`,
    TYPE_ID: typeId,
    TYPE_NAME: typeId === 'D' ? 'Demand' : 'Day-ahead demand forecast',
    TIME_ZONE: 'UTC',
    FREQUENCY: 'hourly',
    VALUES: { DATES: dates, DATA: data },
  };
}

const GRID_PAYLOAD = [
  {
    data: [
      series(
        'ERCO',
        'D',
        ['09/18/2026 17:00:00', '09/18/2026 18:00:00', '09/18/2026 19:00:00'],
        [76582, 79477, null],
      ),
      series(
        'ERCO',
        'DF',
        ['09/18/2026 19:00:00', '09/18/2026 22:00:00', '09/19/2026 02:00:00'],
        [79000, 81020, 74500],
      ),
      series('TVA', 'D', ['09/18/2026 19:00:00'], [24310]),
    ],
  },
];

test('eiaTimestamp renders the MMDDYYYY format the 930-api demands', () => {
  assert.equal(eiaTimestamp(new Date(NOW)), '09182026 20:00:00');
  assert.equal(eiaTimestamp('2026-01-02T05:30:00Z'), '01022026 05:00:00');
  assert.throws(() => eiaTimestamp('not a date'), TypeError);
});

test('parseEiaDate reads the series date format as UTC', () => {
  assert.equal(
    parseEiaDate('09/18/2026 19:00:00'),
    Date.parse('2026-09-18T19:00:00Z'),
  );
  assert.equal(parseEiaDate('2026-09-18'), null);
  assert.equal(parseEiaDate(null), null);
});

test('eiaGridUrl asks for demand and forecast over one trailing window', () => {
  const url = eiaGridUrl(['PJM', 'ERCO', 'ERCO'], { now: NOW, hours: 48 });
  assert.ok(url.startsWith('https://www.eia.gov/electricity/930-api/'));
  const q = new URL(url).searchParams;
  assert.deepEqual(q.getAll('type[]'), ['D', 'DF']);
  // De-duplicated and sorted, so one request serves every campus.
  assert.deepEqual(q.getAll('respondent[]'), ['ERCO', 'PJM']);
  assert.equal(q.get('start'), '09162026 20:00:00');
  // The window runs a day ahead, or the day-ahead series comes back empty.
  assert.equal(q.get('end'), '09192026 20:00:00');
  assert.equal(eiaGridUrl([]), null);
});

test('normalizeGridDemand takes the newest reported hour, skipping gaps', () => {
  const grid = normalizeGridDemand(GRID_PAYLOAD, { fetchedAt: NOW });
  const erco = grid.get('ERCO');
  // 19:00 is present but null, so the newest usable reading is 18:00.
  assert.equal(erco.demandMw, 79477);
  assert.equal(erco.observedAt, '2026-09-18T18:00:00.000Z');
  assert.equal(erco.name, 'ERCOT');
  assert.equal(erco.observation.source, 'EIA Hourly Electric Grid Monitor');
  assert.equal(erco.observation.freshnessClass, 'daily');
  assert.equal(Object.isFrozen(erco), true);
  assert.equal(grid.get('TVA').demandMw, 24310);
  assert.equal(grid.get('TVA').name, BALANCING_AUTHORITIES.TVA);
});

test('the day-ahead forecast carries validAt so it stamps as a forecast', () => {
  const erco = normalizeGridDemand(GRID_PAYLOAD, { fetchedAt: NOW }).get(
    'ERCO',
  );
  // Furthest-ahead future hour wins; the 19:00 point is not in the future.
  assert.equal(erco.forecastMw, 74500);
  assert.equal(erco.forecastValidAt, '2026-09-19T02:00:00.000Z');
  assert.equal(erco.forecastObservation.validAt, '2026-09-19T02:00:00.000Z');
  assert.equal(erco.forecastObservation.freshnessClass, 'daily');
});

test('normalizeGridDemand survives an empty or malformed payload', () => {
  assert.equal(normalizeGridDemand(null).size, 0);
  assert.equal(normalizeGridDemand([]).size, 0);
  assert.equal(normalizeGridDemand([{ data: [{}] }]).size, 0);
  const noPoints = normalizeGridDemand([
    { data: [series('PJM', 'D', [], [])] },
  ]);
  assert.equal(noPoints.get('PJM').demandMw, null);
  assert.equal(noPoints.get('PJM').observation, null);
});

test('openMeteoUrl batches every campus into one request', () => {
  const url = openMeteoUrl([
    { id: 'a', lat: 34.99752, lon: -90.03506 },
    { id: 'b', lat: 32.5, lon: -99.78 },
    { id: 'skip', lat: null, lon: -1 },
  ]);
  const q = new URL(url).searchParams;
  assert.equal(q.get('latitude'), '34.99752,32.5');
  assert.equal(q.get('longitude'), '-90.03506,-99.78');
  assert.equal(q.get('temperature_unit'), 'fahrenheit');
  assert.equal(openMeteoUrl([]), null);
});

test('normalizeSiteWeather matches blocks back to sites by request order', () => {
  const sites = [
    { id: 'colossus-2', lat: 34.99752, lon: -90.03506 },
    { id: 'stargate-abilene', lat: 32.5, lon: -99.78 },
  ];
  const payload = [
    {
      current: {
        time: '2026-09-18T20:15',
        temperature_2m: 96.5,
        relative_humidity_2m: 36,
        wind_speed_10m: 3.3,
      },
    },
    {
      current: {
        time: '2026-09-18T20:15',
        temperature_2m: 95.2,
        relative_humidity_2m: 29,
        wind_speed_10m: 8.6,
      },
    },
  ];
  const weather = normalizeSiteWeather(payload, sites, {
    fetchedAt: Date.parse('2026-09-18T20:20:00Z'),
  });
  assert.equal(weather.size, 2);
  const memphis = weather.get('colossus-2');
  assert.equal(memphis.tempF, 96.5);
  assert.equal(memphis.observedAt, '2026-09-18T20:15:00.000Z');
  // Five minutes old, so the contract derives the live class.
  assert.equal(memphis.observation.freshnessClass, 'live');
  assert.equal(weather.get('stargate-abilene').windMph, 8.6);
});

test('normalizeSiteWeather accepts the single-location object form', () => {
  const weather = normalizeSiteWeather(
    {
      current: {
        time: '2026-09-18T20:15',
        temperature_2m: 70,
        relative_humidity_2m: 50,
        wind_speed_10m: 4,
      },
    },
    [{ id: 'only', lat: 1, lon: 2 }],
    { fetchedAt: NOW },
  );
  assert.equal(weather.get('only').tempF, 70);
  assert.equal(
    normalizeSiteWeather(null, [{ id: 'x', lat: 1, lon: 2 }]).size,
    0,
  );
});

test('gridSharePct is plain arithmetic and null-safe', () => {
  assert.equal(gridSharePct(367, 79477).toFixed(3), '0.462');
  assert.equal(gridSharePct(null, 79477), null);
  assert.equal(gridSharePct(367, 0), null);
  assert.equal(gridSharePct(367, null), null);
});

test('card lines read the same way the static lines do', () => {
  const grid = normalizeGridDemand(GRID_PAYLOAD, { fetchedAt: NOW }).get(
    'ERCO',
  );
  assert.equal(
    gridLine({ facilityPowerMw: 367 }, grid),
    'ERCOT 79,477 MW now · site 0.46% · day-ahead 74,500 MW',
  );
  assert.equal(gridLine({ facilityPowerMw: 367 }, null), null);
  assert.equal(
    weatherLine({ tempF: 96.5, humidityPct: 36, windMph: 3.3 }),
    '97°F · 36% RH · 3 mph',
  );
  assert.equal(weatherLine(null), null);
});
