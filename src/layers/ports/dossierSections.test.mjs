import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PORT_ROAD_CAMERA_MAX_KM,
  assemblePortDossier,
  chokepointKeyword,
  createObservation,
  formatAge,
  formatAsOf,
  freshnessClassFor,
  normalizePortHistoryRows,
  normalizePortWeather,
  portLayerObservation,
  satelliteTileUrl,
  selectPortDisruptions,
  summarizePortHistory,
  tileForCoordinate,
} from './dossierSections.js';

const NOW = Date.parse('2026-09-17T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function dossierFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    portid: 'port1201',
    slug: 'singapore',
    name: 'Singapore',
    fullname: 'Singapore, Singapore',
    country: 'Singapore',
    locode: 'SG SIN',
    lat: 1.27,
    lon: 103.7,
    role: 'Bunkering, refining and trading hub',
    roleNotes: 'Largest bunkering port on the Malacca Strait.',
    linkedSystems: [
      { id: 'chokepoint5', name: 'Malacca Strait', kind: 'chokepoint' },
      { id: 'chokepoint6', name: 'Strait of Hormuz', kind: 'chokepoint' },
    ],
    aliases: ['Port of Singapore'],
    authority: { name: 'MPA', url: 'https://www.mpa.gov.sg/' },
    terminals: [
      { name: 'Jurong Island', operator: 'JTC', product: 'products' },
    ],
    annualCalls: {
      total: 40000,
      tanker: 26277,
      container: 9000,
      dryBulk: 1000,
      generalCargo: 3000,
      roro: 700,
    },
    industries: ['Mineral Products'],
    countryShare: { importPct: 99.5, exportPct: 99.1 },
    wikipedia: {
      title: 'Port of Singapore',
      url: 'https://en.wikipedia.org/wiki/Port_of_Singapore',
      description: 'Port in Singapore',
      extract: 'The Port of Singapore is a collection of facilities.',
      thumbnail: null,
      revision: '1300000000',
      timestamp: '2026-08-01T10:20:30Z',
      licence: 'CC BY-SA 4.0',
    },
    links: {
      authority: 'https://www.mpa.gov.sg/',
      portwatch: 'https://portwatch.imf.org/datasets/abc',
      wikipedia: 'https://en.wikipedia.org/wiki/Port_of_Singapore',
    },
    cameraIds: [],
    satelliteZoom: 9,
    ...overrides,
  };
}

function historyPayload(
  days = 100,
  tankerPerDay = (index) => 50 + (index % 5),
) {
  const features = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(Date.parse('2026-09-11T00:00:00Z') - index * DAY)
      .toISOString()
      .slice(0, 10);
    features.push({
      attributes: {
        date,
        portcalls_tanker: tankerPerDay(index),
        portcalls_container: 30,
        portcalls_dry_bulk: 3,
        portcalls_general_cargo: 10,
        portcalls_roro: 3,
        portcalls: 96,
        import_tanker: 300000,
        export_tanker: 200000,
        import_container: 1000,
        export_container: 2000,
        import_dry_bulk: null,
        export_dry_bulk: null,
        import_general_cargo: 10,
        export_general_cargo: 20,
        import_roro: 1,
        export_roro: 2,
        import: 301011,
        export: 202022,
      },
    });
  }
  return { features };
}

function rowFixture(overrides = {}) {
  return {
    id: 'port1201',
    name: 'Singapore',
    status: 'normal',
    deviationPct: 4.2,
    recentAvg: 54.1,
    baselineAvg: 51.9,
    recentDays: 7,
    baselineDays: 90,
    recentContainers: 30,
    latestDate: '2026-09-11',
    ...overrides,
  };
}

test('formatAge buckets into s, m, h and d', () => {
  assert.equal(formatAge(38_000), '38s');
  assert.equal(formatAge(5 * 60_000), '5m');
  assert.equal(formatAge(3 * HOUR), '3h');
  assert.equal(formatAge(4 * DAY + HOUR), '4d');
  assert.equal(formatAge(-1), 'n/a');
});

test('freshnessClassFor applies the 15-minute and 24-hour thresholds', () => {
  assert.equal(freshnessClassFor(NOW - 14 * 60_000, NOW), 'live');
  assert.equal(freshnessClassFor(NOW - 15 * 60_000, NOW), 'daily');
  assert.equal(freshnessClassFor(NOW - 23 * HOUR, NOW), 'daily');
  assert.equal(freshnessClassFor(NOW - 24 * HOUR, NOW), 'published');
  assert.equal(freshnessClassFor('garbage', NOW), 'published');
});

test('createObservation requires observedAt, derives the class and freezes', () => {
  const observation = createObservation({
    observedAt: NOW - 30_000,
    fetchedAt: NOW,
  });
  assert.equal(observation.freshnessClass, 'live');
  assert.equal(observation.observedAt, '2026-09-17T11:59:30.000Z');
  assert.ok(Object.isFrozen(observation));
  assert.equal(
    createObservation({
      observedAt: NOW - 30_000,
      fetchedAt: NOW,
      freshnessClass: 'published',
    }).freshnessClass,
    'published',
  );
  assert.throws(() => createObservation({}), TypeError);
  assert.throws(
    () => createObservation({ observedAt: NOW, validAt: 'never' }),
    TypeError,
  );
});

test('formatAsOf renders one string per freshness class', () => {
  assert.equal(
    formatAsOf(
      createObservation({ observedAt: NOW - 38_000, fetchedAt: NOW }),
      NOW,
    ),
    'observed 11:59:22Z · 38s ago',
  );
  assert.equal(
    formatAsOf(
      createObservation({ observedAt: NOW - 3 * HOUR, fetchedAt: NOW }),
      NOW,
    ),
    'issued 09:00Z · 3h ago',
  );
  assert.equal(
    formatAsOf(
      createObservation({
        observedAt: '2026-09-17T00:00:00Z',
        validAt: '2026-09-18T06:00:00Z',
        fetchedAt: NOW,
        freshnessClass: 'daily',
      }),
      NOW,
    ),
    'issued 00Z 09-17 · valid 09-18',
  );
  assert.equal(
    formatAsOf(
      createObservation({ observedAt: '2026-09-13T00:00:00Z', fetchedAt: NOW }),
      NOW,
    ),
    'as of 2026-09-13 · 4d lag',
  );
  assert.equal(formatAsOf(null, NOW), 'as of n/a');
});

test('normalizePortHistoryRows validates rows and returns them oldest first', () => {
  const rows = normalizePortHistoryRows(historyPayload(3));
  assert.deepEqual(
    rows.map((row) => row.date),
    ['2026-09-09', '2026-09-10', '2026-09-11'],
  );
  assert.equal(rows[2].calls.tanker, 50);
  assert.equal(rows[2].imports.tanker, 300000);
  assert.equal(rows[2].imports.dryBulk, null);
  assert.equal(rows[2].calls.total, 96);
  assert.equal(normalizePortHistoryRows({}), null);
  assert.equal(
    normalizePortHistoryRows({ features: [{ attributes: { date: 'nope' } }] }),
    null,
  );
  assert.equal(
    normalizePortHistoryRows({
      features: [
        { attributes: { date: '2026-09-11' } },
        { attributes: { date: '2026-09-11' } },
      ],
    }),
    null,
    'duplicate days reject the page',
  );
  assert.equal(
    normalizePortHistoryRows({
      features: [{ attributes: { date: Date.parse('2026-09-11T00:00:00Z') } }],
    })[0].date,
    '2026-09-11',
  );
});

test('summarizePortHistory anchors both windows on the newest published day', () => {
  const rows = normalizePortHistoryRows(
    historyPayload(100, (index) => (index < 7 ? 80 : 40)),
  );
  const summary = summarizePortHistory(rows);
  assert.equal(summary.latestDate, '2026-09-11');
  assert.equal(summary.recentDays, 7);
  assert.equal(summary.days, 90);
  assert.equal(summary.recentMean, 80);
  assert.ok(Math.abs(summary.baselineMean - (7 * 80 + 83 * 40) / 90) < 1e-9);
  assert.equal(summary.status, 'surge');
  assert.equal(summary.series.length, 90);
  assert.equal(summary.series[0].date, '2026-06-14');
  const tanker = summary.classes.find((cls) => cls.key === 'tanker');
  assert.equal(tanker.importTonnes, 7 * 300000);
  assert.equal(tanker.exportTonnes, 7 * 200000);
  assert.equal(
    summary.classes.find((cls) => cls.key === 'dryBulk').importTonnes,
    null,
  );
  assert.equal(summarizePortHistory([]), null);
});

test('chokepointKeyword keeps the headline word of a chokepoint name', () => {
  assert.equal(chokepointKeyword('Strait of Hormuz'), 'hormuz');
  assert.equal(chokepointKeyword('Malacca Strait'), 'malacca');
  assert.equal(chokepointKeyword('Bab el-Mandeb Strait'), 'bab');
  assert.equal(chokepointKeyword('Cape of Good Hope'), 'cape');
});

test('selectPortDisruptions keeps events naming the port or a linked chokepoint, open ones first', () => {
  const events = [
    {
      id: 'a',
      name: 'Typhoon near Ningbo',
      affectedPorts: ['Ningbo'],
      from: '2026-09-01',
      to: '2026-09-03',
    },
    {
      id: 'b',
      name: 'HORMUZ-26',
      affectedPorts: ['Ras Tanura'],
      from: '2026-08-20',
      to: null,
    },
    {
      id: 'c',
      name: 'Haze',
      affectedPorts: ['Singapore', 'Johor'],
      from: '2026-09-05',
      to: '2026-09-06',
    },
    {
      id: 'd',
      name: 'Fog',
      affectedPorts: ['singapore'],
      from: '2026-09-10',
      to: null,
    },
  ];
  assert.deepEqual(
    selectPortDisruptions(dossierFixture(), events).map((event) => event.id),
    ['d', 'b', 'c'],
  );
  assert.deepEqual(selectPortDisruptions(dossierFixture(), null), []);
});

test('tileForCoordinate and satelliteTileUrl address the Level9 matrix set', () => {
  assert.deepEqual(tileForCoordinate(1.3, 103.8, 8), { x: 201, y: 127, z: 8 });
  assert.deepEqual(tileForCoordinate(89.9, 179.9, 1), { x: 1, y: 0, z: 1 });
  assert.equal(
    satelliteTileUrl({
      layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      date: '2026-09-16',
      x: 201,
      y: 127,
      z: 8,
    }),
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-09-16/GoogleMapsCompatible_Level9/8/127/201.jpg',
  );
});

test('normalizePortWeather picks the hour nearest to now from both payloads', () => {
  const forecast = {
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
  const marine = {
    hourly_units: { wave_height: 'm' },
    hourly: {
      time: ['2026-09-17T12:00'],
      wave_height: [0.6],
      wave_period: [4.5],
      wave_direction: [180],
    },
  };
  const reading = normalizePortWeather({
    forecast,
    marine,
    now: NOW + 20 * 60_000,
  });
  assert.equal(reading.validAt, '2026-09-17T12:00Z');
  assert.equal(reading.windKn, 12);
  assert.equal(reading.gustKn, 18);
  assert.equal(reading.visibilityM, 15000);
  assert.equal(reading.waveHeightM, 0.6);
  assert.equal(reading.units.wind, 'kn');
  assert.equal(normalizePortWeather({ forecast: {}, marine, now: NOW }), null);
  assert.equal(
    normalizePortWeather({ forecast, marine: null, now: NOW }).waveHeightM,
    null,
  );
});

test('assemblePortDossier marks every section pending on the click frame and freezes the result', () => {
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    now: NOW,
  });
  assert.ok(Object.isFrozen(assembled));
  const byId = Object.fromEntries(
    assembled.sections.map((section) => [section.id, section]),
  );
  assert.deepEqual(Object.keys(byId), [
    'header',
    'camera',
    'flow',
    'history',
    'calls',
    'trade',
    'disruptions',
    'weather',
    'headlines',
    'about',
    'links',
  ]);
  for (const id of [
    'camera',
    'flow',
    'history',
    'disruptions',
    'weather',
    'headlines',
  ])
    assert.equal(byId[id].status, 'pending', id);
  assert.equal(
    byId.calls.status,
    'partial',
    'annual counts show before the history arrives',
  );
  assert.equal(byId.trade.status, 'ready');
  assert.equal(byId.about.status, 'ready');
  assert.equal(byId.about.stamp, 'as of 2026-08-01 · 47d lag');
  assert.equal(byId.links.links.length, 3);
  assert.equal(byId.header.title, 'SINGAPORE');
  assert.equal(
    assembled.asOf,
    byId.about.stamp,
    'the header stamp is the newest ready observation',
  );
});

test('assemblePortDossier reports errors as unavailable with the reason and stale inputs as partial', () => {
  const history = {
    rows: normalizePortHistoryRows(historyPayload(100)),
    fetchedAt: NOW,
    stale: true,
  };
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    row: { error: 'ports layer has no row yet' },
    history,
    disruptions: { error: 'layer disabled' },
    weather: { error: 'Open-Meteo HTTP 500' },
    news: { error: 'Port headlines are temporarily unavailable' },
    cameras: { error: 'frame unavailable' },
    now: NOW,
  });
  const byId = Object.fromEntries(
    assembled.sections.map((section) => [section.id, section]),
  );
  assert.equal(byId.flow.status, 'unavailable');
  assert.equal(byId.flow.reason, 'ports layer has no row yet');
  assert.equal(byId.history.status, 'partial');
  assert.equal(byId.history.series.length, 90);
  assert.equal(byId.history.stamp, 'as of 2026-09-11 · 6d lag');
  assert.equal(byId.calls.status, 'partial');
  assert.equal(byId.calls.classes[0].annual, 26277);
  assert.equal(byId.calls.classes[0].importTonnes, 7 * 300000);
  assert.equal(byId.disruptions.reason, 'layer disabled');
  assert.equal(byId.weather.reason, 'Open-Meteo HTTP 500');
  assert.equal(byId.headlines.status, 'unavailable');
  assert.equal(byId.camera.status, 'unavailable');
  assert.equal(assembled.asOf, 'as of 2026-09-11 · 6d lag');
});

test('assemblePortDossier renders every live section ready with its own stamp and provenance', () => {
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    row: rowFixture({ fetchedAt: NOW }),
    history: {
      rows: normalizePortHistoryRows(historyPayload(100)),
      fetchedAt: NOW,
    },
    disruptions: {
      events: [
        {
          id: 'd',
          name: 'Fog',
          type: 'MH',
          affectedPorts: ['Singapore'],
          from: '2026-09-10',
          to: null,
          affectedPortCount: 1,
        },
      ],
      fetchedAt: NOW,
    },
    weather: {
      issuedAt: '2026-09-17T06:00:00Z',
      fetchedAt: NOW,
      reading: {
        validAt: '2026-09-17T12:00Z',
        windKn: 12,
        gustKn: 18,
        windDirectionDeg: 100,
        visibilityM: 15000,
        precipitationMm: 0.2,
        waveHeightM: 0.6,
        wavePeriodS: 4.5,
        waveDirectionDeg: 180,
        units: {},
      },
    },
    news: {
      status: 'ready',
      source: 'Google News RSS',
      retrievedAt: '2026-09-17T11:58:00Z',
      notice: 'UNVERIFIED WIRE: headlines are quoted as published.',
      query: { windowDays: 7 },
      articles: [
        {
          title: 'Port of Singapore story',
          url: 'https://example.wire/1',
          domain: 'Example',
          publishedAt: null,
          verification: 'UNVERIFIED WIRE',
        },
      ],
    },
    cameras: {
      frame: {
        cameraId: 'port-singapore-1',
        name: 'Harbour cam',
        operator: 'MPA',
        frameAt: NOW - 90_000,
        fetchedAt: NOW,
        licence: 'MPA public webcam',
      },
      road: {
        cameraId: 'road-1',
        name: 'Road cam',
        distanceKm: 2.4,
        bearingDeg: 45,
      },
    },
    now: NOW,
  });
  const byId = Object.fromEntries(
    assembled.sections.map((section) => [section.id, section]),
  );
  assert.equal(byId.camera.status, 'ready');
  assert.equal(byId.camera.kind, 'camera');
  assert.equal(byId.camera.observation.freshnessClass, 'live');
  assert.equal(byId.camera.stamp, 'observed 11:58:30Z · 1m ago');
  assert.equal(byId.camera.road.cameraId, 'road-1');
  assert.equal(byId.flow.band, 'normal');
  assert.equal(byId.flow.deviation, '+4%');
  assert.equal(byId.flow.stamp, 'as of 2026-09-11 · 6d lag');
  assert.match(byId.flow.provenance, /IMF PortWatch/);
  assert.equal(byId.history.status, 'ready');
  assert.equal(byId.calls.status, 'ready');
  assert.equal(byId.disruptions.events.length, 1);
  assert.match(byId.disruptions.line, /1 event touching/);
  // The stamp names the hour the reading describes, not the hour we fetched it.
  assert.equal(byId.weather.stamp, 'issued 12Z 09-17 · valid 09-17');
  assert.equal(byId.headlines.observation.freshnessClass, 'live');
  assert.equal(byId.headlines.verification, 'UNVERIFIED WIRE');
  assert.match(byId.headlines.provenance, /UNVERIFIED WIRE/);
  assert.equal(
    assembled.asOf,
    byId.camera.stamp,
    'the newest observation is the camera frame',
  );
});

test('assemblePortDossier uses the satellite tile when no camera frame exists and drops a far road camera', () => {
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    cameras: {
      satellite: {
        date: '2026-09-16',
        layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
        url: 'https://gibs.example/tile.jpg',
        zoom: 9,
      },
      road: {
        cameraId: 'road-far',
        name: 'Far cam',
        distanceKm: PORT_ROAD_CAMERA_MAX_KM + 0.1,
        bearingDeg: 10,
      },
    },
    now: NOW,
  });
  const camera = assembled.sections.find((section) => section.id === 'camera');
  assert.equal(camera.kind, 'satellite');
  assert.equal(camera.observation.freshnessClass, 'daily');
  assert.equal(camera.road, null);
  assert.match(camera.provenance, /NASA GIBS/);
  assert.throws(() => assemblePortDossier({}), TypeError);
});

test('portLayerObservation builds the published-class reading the layer and the dossier both stamp from', () => {
  assert.equal(portLayerObservation(null, NOW), null);
  assert.equal(portLayerObservation('2026-9-11', NOW), null);
  const observation = portLayerObservation('2026-09-11', NOW);
  assert.equal(observation.freshnessClass, 'published');
  assert.equal(observation.observedAt, '2026-09-11T00:00:00.000Z');
  assert.equal(observation.publishedAt, '2026-09-11T00:00:00.000Z');
  assert.equal(observation.fetchedAt, '2026-09-17T12:00:00.000Z');
  assert.equal(observation.source, 'IMF PortWatch');
  // The layer panel row (getStats().asOf) and the dossier's flow section render the same string.
  const layerStamp = formatAsOf(observation, NOW);
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    row: rowFixture({ fetchedAt: NOW }),
    now: NOW,
  });
  const flow = assembled.sections.find((section) => section.id === 'flow');
  assert.equal(flow.stamp, layerStamp);
  assert.equal(flow.stamp, 'as of 2026-09-11 · 6d lag');
});

test('selectPortDisruptions matches PortWatch ids, the shape the feed actually publishes', () => {
  // Real rows from portwatch_disruptions_database (2026-09-17): affectedports
  // is a semicolon-separated list of PortWatch ids, never port names.
  const redSea = {
    id: '1',
    name: 'RED SEA TENSIONS',
    affectedPorts: ['chokepoint4', 'chokepoint1', 'chokepoint7'],
    from: '2026-01-01',
    to: null,
  };
  const bavi = {
    id: '2',
    name: 'BAVI-26',
    affectedPorts: ['port2180', 'port824', 'port61'],
    from: '2026-09-02',
    to: '2026-09-05',
  };
  const hormuz = {
    id: '3',
    name: 'HORMUZ-26',
    affectedPorts: ['chokepoint6'],
    from: '2026-02-28',
    to: null,
  };
  const yanbu = dossierFixture({
    portid: 'port570',
    name: 'Yanbu (King Fahd Port)',
    linkedSystems: [
      { id: 'chokepoint4', name: 'Bab el-Mandeb Strait', kind: 'chokepoint' },
      { id: 'chokepoint1', name: 'Suez Canal', kind: 'chokepoint' },
      { id: 'hormuz-bypass', name: 'Hormuz bypass', kind: 'tag' },
    ],
  });
  const ningbo = dossierFixture({
    portid: 'port824',
    name: 'Ningbo',
    linkedSystems: [
      { id: 'chokepoint11', name: 'Taiwan Strait', kind: 'chokepoint' },
    ],
  });
  assert.deepEqual(
    selectPortDisruptions(yanbu, [redSea, bavi, hormuz]).map((e) => e.id),
    ['1'],
    'Yanbu matches RED SEA TENSIONS through chokepoint4',
  );
  assert.deepEqual(
    selectPortDisruptions(ningbo, [redSea, bavi, hormuz]).map((e) => e.id),
    ['2'],
    'Ningbo matches BAVI-26 through its own portid',
  );
  assert.deepEqual(
    selectPortDisruptions(dossierFixture(), [hormuz]).map((e) => e.id),
    ['3'],
    'Singapore still matches the Hormuz event through its linked chokepoint6',
  );
});

test('selectPortDisruptions will not borrow a chokepoint syllable from an unrelated event name', () => {
  // 'Bab el-Mandeb' once yielded the keyword 'bab', which matched 'Zimbabwe'.
  const zimbabwe = {
    id: 'z',
    name: 'Zimbabwe-2019',
    affectedPorts: [],
    from: '2019-01-01',
    to: '2019-02-01',
  };
  const yanbu = dossierFixture({
    portid: 'port570',
    linkedSystems: [
      { id: 'chokepoint4', name: 'Bab el-Mandeb Strait', kind: 'chokepoint' },
    ],
  });
  assert.deepEqual(selectPortDisruptions(yanbu, [zimbabwe]), []);
  // A real whole-word hit still lands.
  const malacca = dossierFixture({
    linkedSystems: [
      { id: 'chokepoint5', name: 'Malacca Strait', kind: 'chokepoint' },
    ],
  });
  assert.equal(
    selectPortDisruptions(malacca, [
      {
        id: 'm',
        name: 'MALACCA HAZE',
        affectedPorts: [],
        from: null,
        to: null,
      },
    ]).length,
    1,
  );
});

test('a camera frame with no usable timestamp reads unavailable instead of throwing', () => {
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    cameras: { frame: { operator: 'X', name: 'Cam' } },
    now: NOW,
  });
  const camera = assembled.sections.find((s) => s.id === 'camera');
  assert.equal(camera.status, 'unavailable');
  assert.match(camera.reason, /no timestamp/);
});

test('normalizePortHistoryRows rejects an out-of-range epoch rather than throwing', () => {
  assert.equal(
    normalizePortHistoryRows({ features: [{ attributes: { date: 9e15 } }] }),
    null,
  );
});

test('the trade section stamps the bundle vintage when one is supplied', () => {
  const without = assemblePortDossier({ dossier: dossierFixture(), now: NOW });
  assert.equal(without.sections.find((s) => s.id === 'trade').stamp, null);
  const withVintage = assemblePortDossier({
    dossier: dossierFixture(),
    vintage: '2026-09-17',
    now: NOW,
  });
  const trade = withVintage.sections.find((s) => s.id === 'trade');
  assert.equal(trade.status, 'ready');
  assert.equal(trade.stamp, 'as of 2026-09-17 · 0d lag');
  assert.equal(trade.observation.freshnessClass, 'published');
});

test('the bundle vintage never wins the header stamp', () => {
  // 2026-10-12 render check: a bundle rebuilt that morning made the header
  // read "as of <today> · 0d lag" over a flow ten days old. The vintage is
  // when the static facts were read, not a reading of the port.
  const assembled = assemblePortDossier({
    dossier: dossierFixture(),
    vintage: '2026-09-17',
    now: NOW,
  });
  const about = assembled.sections.find((s) => s.id === 'about');
  assert.equal(assembled.asOf, about.stamp);
  assert.notEqual(
    assembled.asOf,
    assembled.sections.find((s) => s.id === 'trade').stamp,
  );
});
