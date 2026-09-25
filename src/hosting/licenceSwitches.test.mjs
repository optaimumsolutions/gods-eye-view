import test from 'node:test';
import assert from 'node:assert/strict';
import { openSkyProxy } from '../../server/providers/aircraft/opensky.js';
import { fetchRegionalNews } from '../../server/providers/regional/news.js';
import { fetchRegionalWeather } from '../../server/providers/regional/weather.js';
import { loadDriveBcSourcesFromOpenData } from '../../server/providers/cctv/sources.js';
import {
  OVERPASS_UPSTREAMS,
  activeOverpassUpstreams,
} from '../../server/providers/overpass/constants.js';
import { getTransitFeed } from '../data/transitFeeds.js';
import { createReferenceSources } from '../sources/reference.js';
import {
  createDefaultMapSources,
  keylessStackId,
} from '../maps/defaultSources.js';
import { createBundledLngSource } from '../layers/lng/source.js';
import { createDatacenterLiveSource } from '../layers/datacenters/liveSource.js';

/**
 * Each hosted-profile switch (server/hosting/licencePolicy.js) does what
 * docs/LICENCES.md says: the source is never called, and the feature falls
 * back the way it does in an outage.
 */

function environment(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const original = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  }
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [key, value] of Object.entries(headers))
        this.setHeader(key, value);
    },
    end(body) {
      this.body = body;
    },
  };
}

test('OPENSKY_ENABLED=0 answers from adsb.lol and never calls OpenSky', async (t) => {
  environment(t, { OPENSKY_ENABLED: '0', OPENSKY_AUTH_MODE: 'anon' });
  t.mock.method(console, 'log', () => {});
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return Response.json({ ac: [], now: Date.now(), total: 0 });
  });
  let handler;
  openSkyProxy().configureServer({
    middlewares: { use: (route, fn) => (handler = fn) },
  });
  const anchored = response();
  await handler({ url: '/?lat=30.1&lon=-97.2', method: 'GET' }, anchored);
  assert.ok(calls.length >= 1);
  assert.ok(
    calls.every((url) => !url.includes('opensky-network.org')),
    calls.join(' '),
  );
  assert.ok(
    calls.some((url) => url.includes('adsb.lol')),
    calls.join(' '),
  );
  assert.match(
    String(anchored.headers['x-opensky-auth-reason']),
    /opensky_disabled/,
  );
  assert.equal(anchored.headers['x-flight-source'], 'adsb.lol');
  const bare = response();
  await handler({ url: '/', method: 'GET' }, bare);
  assert.equal(bare.statusCode, 503);
  assert.ok(calls.every((url) => !url.includes('opensky-network.org')));
});

test('GOOGLE_NEWS_RSS_ENABLED=0 goes straight to GDELT', async (t) => {
  environment(t, { GOOGLE_NEWS_RSS_ENABLED: '0' });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return Response.json({ articles: [] });
  });
  const result = await fetchRegionalNews({ locality: 'Midland' });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.gdeltproject\.org/);
  assert.equal(result.source, 'GDELT fallback');
});

test('OPEN_METEO_ENABLED=0 reads no weather, the same as an outage', async (t) => {
  environment(t, { OPEN_METEO_ENABLED: '0' });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('must not fetch');
  });
  assert.equal(
    await fetchRegionalWeather({ latitude: 31.9, longitude: -102.1 }),
    null,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('CCTV_DRIVEBC_THIRD_PARTY=0 drops the cameras a partner is credited for', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const row = (id, credit) => ({
    id,
    name: `Camera ${id}`,
    is_on: true,
    should_appear: true,
    region_name: 'Lower Mainland',
    orientation: 'N',
    elevation: 12,
    location: { type: 'Point', coordinates: [-123.1, 49.26 + id / 1000] },
    credit,
  });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([row(1, ''), row(2, 'Courtesy of the City of Surrey')]),
  );
  environment(t, { CCTV_DRIVEBC_THIRD_PARTY: undefined });
  assert.deepEqual(
    (await loadDriveBcSourcesFromOpenData()).map((camera) => camera.id).sort(),
    ['drivebc-1', 'drivebc-2'],
  );
  environment(t, { CCTV_DRIVEBC_THIRD_PARTY: '0' });
  assert.deepEqual(
    (await loadDriveBcSourcesFromOpenData()).map((camera) => camera.id),
    ['drivebc-1'],
  );
});

test('OVERPASS_MAIN_ENABLED=0 keeps only the community mirrors', () => {
  assert.equal(activeOverpassUpstreams({}), OVERPASS_UPSTREAMS);
  const mirrors = activeOverpassUpstreams({ OVERPASS_MAIN_ENABLED: '0' });
  assert.ok(mirrors.length >= 1);
  for (const url of mirrors)
    assert.doesNotMatch(new URL(url).hostname, /overpass-api\.de$/);
  assert.ok(mirrors.some((url) => url.includes('private.coffee')));
});

test('a withheld transit feed is unreachable through the proxy door', (t) => {
  assert.ok(getTransitFeed('metrotransit-msp'));
  environment(t, { GEV_WITHHELD: 'transit:metrotransit-msp' });
  assert.equal(getTransitFeed('metrotransit-msp'), null);
  assert.ok(getTransitFeed('mbta'), 'other feeds are untouched');
});

test('withheld PortWatch: both layers get a source that never fetches and says why', async (t) => {
  environment(t, { GEV_WITHHELD: 'portwatch' });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('must not fetch');
  });
  const sources = createReferenceSources();
  for (const name of ['chokepoints', 'ports']) {
    assert.equal(typeof sources[name].getSnapshot, 'function');
    await assert.rejects(
      sources[name].getSnapshot({}),
      /Withheld on the hosted site/,
    );
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('withheld Esri: the keyless globe lands on OSM and the Esri stack says why', (t) => {
  assert.equal(keylessStackId(), 'esri-imagery');
  assert.equal(createDefaultMapSources().defaultId, 'esri-imagery');
  environment(t, { GEV_WITHHELD: 'esri-world-imagery' });
  assert.equal(keylessStackId(), 'osm');
  const registry = createDefaultMapSources();
  assert.equal(registry.defaultId, 'osm');
  const esri = registry.sources.find(
    (source) => source.descriptor.id === 'esri-imagery',
  );
  assert.equal(esri.available, false);
  assert.match(esri.unavailableReason, /withheld on the hosted site/);
  const osm = registry.sources.find((source) => source.descriptor.id === 'osm');
  assert.equal(osm.available, true);
});

test('the LNG source without a matrix URL reads three files and draws no GIIGNL pairs', async () => {
  const read = [];
  const fetchImpl = async (url) => {
    read.push(String(url));
    const body = {
      terminals: { terminals: [] },
      cargoes: { cargoes: [] },
      routes: { routes: [] },
    }[String(url)];
    return Response.json(body ?? {});
  };
  const source = createBundledLngSource({
    fetchImpl,
    terminalsUrl: 'terminals',
    cargoesUrl: 'cargoes',
    routesUrl: 'routes',
    matrixUrl: null,
  });
  const snapshot = await source.getSnapshot().catch((error) => error);
  assert.deepEqual(read.sort(), ['cargoes', 'routes', 'terminals']);
  if (!(snapshot instanceof Error))
    assert.equal(snapshot.matrixYear ?? null, null);
});

test('withheld Open-Meteo: the data-center cards read the grid only', async (t) => {
  environment(t, { GEV_WITHHELD: 'open-meteo' });
  const read = [];
  const source = createDatacenterLiveSource({
    fetchImpl: async (url) => {
      read.push(String(url));
      return Response.json({ response: { data: [] } });
    },
  });
  const reading = await source.getReadings([
    { id: 'x', balancingAuthority: 'ERCO', lat: 32, lon: -97 },
  ]);
  assert.ok(read.length >= 1);
  assert.ok(
    read.every((url) => !url.includes('open-meteo')),
    read.join(' '),
  );
  assert.equal(reading.weather.size, 0);
});
