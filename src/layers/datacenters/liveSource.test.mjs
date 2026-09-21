import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatacenterLiveSource } from './liveSource.js';

const SITES = [
  {
    id: 'coreweave-denton',
    lat: 33.21927,
    lon: -97.17472,
    balancingAuthority: 'ERCO',
  },
  {
    id: 'colossus-1',
    lat: 35.06008,
    lon: -90.15641,
    balancingAuthority: 'TVA',
  },
];

const GRID = [
  {
    data: [
      {
        RESPONDENT_ID: 'ERCO',
        TYPE_ID: 'D',
        VALUES: { DATES: ['09/18/2026 19:00:00'], DATA: [79477] },
      },
    ],
  },
];
const WEATHER = [
  {
    current: {
      time: '2026-09-18T20:15',
      temperature_2m: 95,
      relative_humidity_2m: 30,
      wind_speed_10m: 9,
    },
  },
  {
    current: {
      time: '2026-09-18T20:15',
      temperature_2m: 96,
      relative_humidity_2m: 36,
      wind_speed_10m: 3,
    },
  },
];

function stub({ gridFails = false, weatherFails = false } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      const isGrid = url.includes('930-api');
      if (isGrid && gridFails) return { ok: false, status: 503 };
      if (!isGrid && weatherFails) throw new Error('network down');
      return { ok: true, json: async () => (isGrid ? GRID : WEATHER) };
    },
  };
}

test('one refresh makes exactly two requests for every campus', async () => {
  const s = stub();
  const source = createDatacenterLiveSource({ fetchImpl: s.fetchImpl });
  const reading = await source.getReadings(SITES);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls.filter((u) => u.includes('930-api')).length, 1);
  assert.equal(s.calls.filter((u) => u.includes('open-meteo')).length, 1);
  assert.equal(reading.grid.get('ERCO').demandMw, 79477);
  assert.equal(reading.weather.get('colossus-1').tempF, 96);
  assert.equal(reading.errors.grid, null);
});

test('readings are cached until the ttl expires', async () => {
  const s = stub();
  let clock = 1_000_000;
  const source = createDatacenterLiveSource({
    fetchImpl: s.fetchImpl,
    ttlMs: 60_000,
    now: () => clock,
  });
  await source.getReadings(SITES);
  await source.getReadings(SITES);
  assert.equal(s.calls.length, 2, 'second call served from cache');
  clock += 61_000;
  await source.getReadings(SITES);
  assert.equal(s.calls.length, 4, 'refetched after the ttl');
});

test('a failed grid request still yields the weather line', async () => {
  const s = stub({ gridFails: true });
  const source = createDatacenterLiveSource({ fetchImpl: s.fetchImpl });
  const reading = await source.getReadings(SITES);
  assert.equal(reading.grid.size, 0);
  assert.match(reading.errors.grid, /HTTP 503/);
  assert.equal(reading.weather.get('coreweave-denton').tempF, 95);
  assert.equal(reading.errors.weather, null);
});

test('a failed weather request still yields the grid line', async () => {
  const s = stub({ weatherFails: true });
  const source = createDatacenterLiveSource({ fetchImpl: s.fetchImpl });
  const reading = await source.getReadings(SITES);
  assert.equal(reading.weather.size, 0);
  assert.match(reading.errors.weather, /network down/);
  assert.equal(reading.grid.get('ERCO').demandMw, 79477);
});

test('a total outage keeps the last good reading rather than blanking it', async () => {
  let fail = false;
  const source = createDatacenterLiveSource({
    fetchImpl: async (url) => {
      if (fail) throw new Error('offline');
      return {
        ok: true,
        json: async () => (url.includes('930-api') ? GRID : WEATHER),
      };
    },
    ttlMs: 0,
  });
  const first = await source.getReadings(SITES);
  assert.equal(first.grid.get('ERCO').demandMw, 79477);
  fail = true;
  const second = await source.getReadings(SITES);
  assert.equal(
    second.grid.get('ERCO').demandMw,
    79477,
    'served the warm reading',
  );
  assert.equal(source.peek().grid.get('ERCO').demandMw, 79477);
});

test('no sites means no requests at all', async () => {
  const s = stub();
  const source = createDatacenterLiveSource({ fetchImpl: s.fetchImpl });
  const reading = await source.getReadings([]);
  assert.equal(s.calls.length, 0);
  assert.equal(reading.grid.size, 0);
  assert.equal(reading.fetchedAt, null);
});
