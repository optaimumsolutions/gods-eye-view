import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PORT_WEATHER_CACHE_MS,
  bearingDeg,
  createPortDossierLiveHooks,
  haversineKm,
  nearestRoadCamera,
} from './portDossierLive.js';

const NOW = Date.parse('2026-09-17T12:00:00Z');
const dossier = {
  portid: 'port1201',
  name: 'Singapore',
  lat: 1.272,
  lon: 103.707,
  cameraIds: ['port-singapore-1', 'port-singapore-2'],
  satelliteZoom: 9,
};

function response({
  ok = true,
  status = 200,
  headers = {},
  json = null,
  blob = null,
} = {}) {
  const map = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok,
    status,
    headers: { get: (name) => map.get(String(name).toLowerCase()) ?? null },
    json: async () => {
      if (json instanceof Error) throw json;
      return json;
    },
    blob: async () => blob,
  };
}

function forecastPayload() {
  return {
    hourly_units: { wind_speed_10m: 'kn' },
    hourly: {
      time: ['2026-09-17T11:00', '2026-09-17T12:00', '2026-09-17T13:00'],
      wind_speed_10m: [10, 12, 14],
      wind_gusts_10m: [15, 18, 20],
      wind_direction_10m: [90, 100, 110],
      visibility: [20000, 15000, 10000],
      precipitation: [0, 0.2, 0.5],
    },
  };
}

test('haversineKm and bearingDeg agree with known geometry', () => {
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.19) < 0.1);
  assert.ok(Math.abs(bearingDeg(0, 0, 1, 0) - 0) < 1e-9);
  assert.ok(Math.abs(bearingDeg(0, 0, 0, 1) - 90) < 1e-9);
});

test('nearestRoadCamera skips port webcams and video feeds and enforces the 3 km limit', () => {
  const sources = [
    {
      id: 'far',
      name: 'Far',
      provider: 'DOT',
      lat: 1.4,
      lon: 103.707,
      feedType: 'image',
      sourceKind: 'txdot-its',
    },
    {
      id: 'near',
      name: 'Near',
      provider: 'DOT',
      lat: 1.28,
      lon: 103.71,
      feedType: 'image',
      sourceKind: 'txdot-its',
    },
    {
      id: 'nearer-port',
      name: 'Port cam',
      provider: 'Port',
      lat: 1.273,
      lon: 103.708,
      feedType: 'image',
      sourceKind: 'port-webcam',
    },
    {
      id: 'nearer-video',
      name: 'Video',
      provider: 'DOT',
      lat: 1.273,
      lon: 103.708,
      feedType: 'hls',
      sourceKind: 'configured',
    },
  ];
  const road = nearestRoadCamera(sources, dossier);
  assert.equal(road.cameraId, 'near');
  assert.ok(road.distanceKm < 3);
  assert.equal(road.src, '/api/cctv/frame/near');
  assert.equal(nearestRoadCamera([], dossier), null);
  assert.equal(nearestRoadCamera(null, dossier), null);
});

test('weather reads forecast and marine, tolerates a missing marine cell, caches and serves stale', async () => {
  let now = NOW;
  let marineFails = false;
  let forecastFails = false;
  const calls = [];
  const hooks = createPortDossierLiveHooks({
    now: () => now,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith('https://api.open-meteo.com/')) {
        if (forecastFails) return response({ ok: false, status: 500 });
        assert.match(url, /wind_speed_unit=kn/);
        return response({ json: forecastPayload() });
      }
      if (url.startsWith('https://marine-api.open-meteo.com/')) {
        if (marineFails) return response({ ok: false, status: 400 });
        return response({
          json: {
            hourly_units: { wave_height: 'm' },
            hourly: {
              time: ['2026-09-17T12:00'],
              wave_height: [0.6],
              wave_period: [4.5],
              wave_direction: [180],
            },
          },
        });
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const first = await hooks.weather(dossier, new AbortController().signal);
  assert.equal(first.reading.windKn, 12);
  assert.equal(first.reading.waveHeightM, 0.6);
  assert.equal(first.issuedAt, NOW);
  assert.equal(calls.length, 2);
  now += PORT_WEATHER_CACHE_MS - 1;
  const cached = await hooks.weather(dossier, new AbortController().signal);
  assert.equal(cached, first);
  assert.equal(calls.length, 2, 'cached within the window');
  now += 2;
  marineFails = true;
  const inland = await hooks.weather(dossier, new AbortController().signal);
  assert.equal(
    inland.reading.waveHeightM,
    null,
    'no marine cell reads as n/a, not a failure',
  );
  assert.equal(inland.reading.windKn, 12);
  now += PORT_WEATHER_CACHE_MS + 1;
  forecastFails = true;
  const stale = await hooks.weather(dossier, new AbortController().signal);
  assert.equal(stale.stale, true);
  assert.equal(stale.reading.windKn, 12);
});

test('news passes the proxy payload through and surfaces its sanitized error', async () => {
  let fail = false;
  const hooks = createPortDossierLiveHooks({
    now: () => NOW,
    fetchImpl: async (url) => {
      assert.equal(url, '/api/port-news?portid=port1201');
      if (fail)
        return response({
          ok: false,
          status: 503,
          json: { error: 'Port headlines are temporarily unavailable' },
        });
      return response({
        json: {
          status: 'ready',
          source: 'Google News RSS',
          retrievedAt: '2026-09-17T11:58:00Z',
          articles: [],
        },
      });
    },
  });
  const payload = await hooks.news(dossier, new AbortController().signal);
  assert.equal(payload.source, 'Google News RSS');
  assert.equal(payload.fetchedAt, NOW);
  fail = true;
  await assert.rejects(
    () => hooks.news(dossier, new AbortController().signal),
    /temporarily unavailable/,
  );
});

test('cameras prefer a registered upstream frame, skip proxy fallbacks, and attach the road camera', async () => {
  const revoked = [];
  const hooks = createPortDossierLiveHooks({
    now: () => NOW,
    createObjectUrl: (blob) => `blob:${blob.size}`,
    revokeObjectUrl: (url) => revoked.push(url),
    fetchImpl: async (url) => {
      if (url === '/api/cctv/frame/port-singapore-1')
        return response({
          headers: { 'X-CCTV-Source': 'streetview' },
          blob: { size: 10 },
        });
      if (url === '/api/cctv/frame/port-singapore-2')
        return response({
          headers: { 'X-CCTV-Source': 'upstream-image' },
          blob: { size: 4321 },
        });
      if (url === '/api/cctv/sources')
        return response({
          json: {
            sources: [
              {
                id: 'port-singapore-2',
                name: 'Harbour cam',
                provider: 'MPA',
                license: 'MPA public webcam',
                lat: 1.273,
                lon: 103.708,
                feedType: 'image',
                sourceKind: 'port-webcam',
              },
              {
                id: 'road-1',
                name: 'Road',
                provider: 'LTA',
                lat: 1.28,
                lon: 103.71,
                feedType: 'image',
                sourceKind: 'configured',
              },
            ],
          },
        });
      if (url === '/api/cctv/frame/road-1')
        return response({
          headers: { 'X-CCTV-Source': 'upstream-image' },
          blob: { size: 777 },
        });
      throw new Error(`unexpected ${url}`);
    },
  });
  const first = await hooks.cameras(dossier, new AbortController().signal, 0);
  assert.equal(
    first.frame.cameraId,
    'port-singapore-2',
    'the Street View fallback frame is not a camera frame',
  );
  assert.equal(first.frame.src, 'blob:4321');
  assert.equal(first.frame.operator, 'MPA');
  assert.equal(first.frame.licence, 'MPA public webcam');
  assert.equal(first.road.cameraId, 'road-1');
  assert.equal(
    first.road.src,
    'blob:777',
    'the road thumbnail is a verified upstream frame',
  );
  await hooks.cameras(dossier, new AbortController().signal, 1);
  assert.deepEqual(
    revoked.slice(0, 2).sort(),
    ['blob:4321', 'blob:777'],
    'the previous frame and road URLs are revoked on refresh',
  );
  hooks.dispose();
  assert.ok(revoked.length >= 3);
});

test('cameras fall back to the newest GIBS tile of the last two days when no frame exists', async () => {
  const tried = [];
  const hooks = createPortDossierLiveHooks({
    now: () => NOW,
    fetchImpl: async (url) => {
      if (url.startsWith('/api/cctv/frame/'))
        return response({
          headers: { 'X-CCTV-Source': 'synthetic' },
          blob: { size: 1 },
        });
      if (url === '/api/cctv/sources')
        return response({ json: { sources: [] } });
      if (url.startsWith('https://gibs.earthdata.nasa.gov/')) {
        tried.push(url);
        if (url.includes('2026-09-16'))
          return response({
            ok: false,
            status: 400,
            headers: { 'content-type': 'text/xml' },
          });
        return response({ headers: { 'content-type': 'image/jpeg' } });
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const result = await hooks.cameras(dossier, new AbortController().signal, 0);
  assert.equal(result.frame, undefined);
  assert.equal(result.satellite.date, '2026-09-15');
  assert.equal(
    result.satellite.layer,
    'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  );
  assert.equal(result.satellite.layerLabel, 'VIIRS SNPP');
  assert.match(
    result.satellite.url,
    /GoogleMapsCompatible_Level9\/9\/\d+\/\d+\.jpg$/,
  );
  assert.equal(result.road, null);
  assert.equal(
    tried.length,
    3,
    'both layers for yesterday, then the first layer for the day before',
  );
});

test('cameras report an error when neither a frame nor a tile exists', async () => {
  const hooks = createPortDossierLiveHooks({
    now: () => NOW,
    fetchImpl: async (url) => {
      if (url.startsWith('/api/cctv/frame/')) throw new Error('offline');
      if (url === '/api/cctv/sources') throw new Error('offline');
      return response({ ok: false, status: 404 });
    },
  });
  const result = await hooks.cameras(
    { ...dossier, cameraIds: [] },
    new AbortController().signal,
    0,
  );
  assert.match(result.error, /no camera frame and no satellite tile/);
});

test('the road thumbnail is dropped when the proxy answers with a fallback frame', async () => {
  const hooks = createPortDossierLiveHooks({
    now: () => NOW,
    createObjectUrl: (blob) => `blob:${blob.size}`,
    fetchImpl: async (url) => {
      if (url === '/api/cctv/frame/road-1')
        // The proxy answers 200 with a Street View image when the camera is down.
        return response({
          headers: { 'X-CCTV-Source': 'streetview' },
          blob: { size: 99 },
        });
      if (url.startsWith('/api/cctv/frame/'))
        return response({
          headers: { 'X-CCTV-Source': 'upstream-image' },
          blob: { size: 4321 },
        });
      if (url === '/api/cctv/sources')
        return response({
          json: {
            sources: [
              {
                id: 'road-1',
                name: 'Road',
                provider: 'LTA',
                lat: 1.28,
                lon: 103.71,
                feedType: 'image',
                sourceKind: 'configured',
              },
            ],
          },
        });
      throw new Error(`unexpected ${url}`);
    },
  });
  const result = await hooks.cameras(dossier, new AbortController().signal, 0);
  assert.equal(result.frame.cameraId, 'port-singapore-1');
  assert.equal(
    result.road,
    null,
    'a fallback frame is never captioned as the road camera',
  );
});
