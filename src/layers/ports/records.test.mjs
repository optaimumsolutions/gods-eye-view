import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortSnapshot,
  deviationStatus,
  formatDeviation,
  latestPublishedDate,
  normalizeDisruptionFeatures,
  normalizePortRows,
  normalizePortStatRows,
  shiftIsoDate,
} from './records.js';
import { createPortWatchPortSource } from './source.js';

function port(portid, portname, lon, lat, extra = {}) {
  return {
    attributes: {
      portid,
      portname,
      lon,
      lat,
      country: 'Singapore',
      ISO3: 'SGP',
      vessel_count_total: 44369,
      vessel_count_tanker: 26277,
      vessel_count_container: 13921,
      ...extra,
    },
  };
}

function stat(portid, avg_tanker, avg_container = 1, days = 7) {
  return { attributes: { portid, avg_tanker, avg_container, days } };
}

function polygon(
  eventid,
  eventname,
  extra = {},
  coordinates = [[[56, 26], [57, 26], [57, 27], [56, 26]]],
) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates },
    properties: {
      eventid,
      eventname,
      eventtype: 'OT',
      fromdate: Date.UTC(2026, 2, 1),
      todate: null,
      lat: 26.3,
      long: 56.86,
      n_affectedports: 1,
      affectedports: 'chokepoint6',
      ...extra,
    },
  };
}

test('port registry pages are validated as complete feeds', () => {
  const rows = normalizePortRows({
    features: [port('port1201', 'Singapore', 103.7, 1.27)],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'port1201');
  assert.equal(rows[0].name, 'Singapore');
  assert.equal(rows[0].lon, 103.7);
  assert.equal(rows[0].lat, 1.27);
  assert.equal(rows[0].iso3, 'SGP');
  assert.equal(rows[0].annualTankers, 26277);
  assert.equal(rows[0].locode, null);
  assert.equal(normalizePortRows(null), null);
  assert.equal(normalizePortRows({ features: [port('x', 'Bad lon', 181, 0)] }), null);
  assert.equal(normalizePortRows({ features: [port('x', '', 0, 0)] }), null);
  assert.equal(
    normalizePortRows({ features: [port('dup', 'A', 0, 0), port('dup', 'B', 1, 1)] }),
    null,
  );
  // An empty page is valid: the server may answer with zero rows past the end.
  assert.deepEqual(normalizePortRows({ features: [] }), []);
});

test('window statistics and the newest published day are read from statistics payloads', () => {
  assert.deepEqual(
    normalizePortStatRows({
      features: [stat('port1', 2.5, 0.5, 7), stat('port2', null, null, 90)],
    }),
    [
      { id: 'port1', tankers: 2.5, containers: 0.5, days: 7 },
      { id: 'port2', tankers: null, containers: null, days: 90 },
    ],
  );
  assert.equal(normalizePortStatRows({ features: [{ attributes: { avg_tanker: 1 } }] }), null);
  assert.equal(normalizePortStatRows({}), null);
  assert.equal(
    latestPublishedDate({ features: [{ attributes: { latest: '2026-09-11' } }] }),
    '2026-09-11',
  );
  assert.equal(
    latestPublishedDate({ features: [{ attributes: { latest: Date.UTC(2026, 8, 11) } }] }),
    '2026-09-11',
  );
  assert.equal(latestPublishedDate({ features: [] }), null);
  assert.equal(latestPublishedDate({ features: [{ attributes: { latest: 'soon' } }] }), null);
});

test('shiftIsoDate moves whole UTC days and rejects malformed dates', () => {
  assert.equal(shiftIsoDate('2026-09-11', -6), '2026-09-05');
  assert.equal(shiftIsoDate('2026-09-11', -89), '2026-06-14');
  assert.equal(shiftIsoDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftIsoDate('nope', -1), null);
});

test('disruption polygons keep every ring, parse epoch dates and affected ports', () => {
  const multi = {
    ...polygon('2', 'Fires', {
      eventtype: 'WF',
      todate: Date.UTC(2026, 7, 1),
      lat: null,
      long: null,
      affectedports: null,
      n_affectedports: null,
    }),
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[2, 2], [3, 2], [3, 3], [2, 2]]],
      ],
    },
  };
  const rows = normalizeDisruptionFeatures({
    features: [polygon('1', 'HORMUZ-26'), multi],
  });
  assert.equal(rows.length, 2);
  const [hormuz, fires] = rows;
  assert.equal(hormuz.type, 'OT');
  assert.equal(hormuz.from, '2026-03-01');
  assert.equal(hormuz.to, null);
  assert.equal(hormuz.lat, 26.3);
  assert.equal(hormuz.lon, 56.86);
  assert.deepEqual(hormuz.affectedPorts, ['chokepoint6']);
  assert.equal(hormuz.affectedPortCount, 1);
  assert.equal(hormuz.rings.length, 1);
  assert.equal(hormuz.rings[0].length, 4);
  assert.equal(fires.type, 'WF');
  assert.equal(fires.to, '2026-08-01');
  assert.equal(fires.rings.length, 2);
  // No centroid attributes: fall back to the first ring's vertex mean.
  assert.equal(fires.lon, 0.5);
  assert.equal(fires.lat, 0.25);
  assert.deepEqual(fires.affectedPorts, []);
  assert.equal(fires.affectedPortCount, 0);

  assert.equal(normalizeDisruptionFeatures(null), null);
  assert.equal(normalizeDisruptionFeatures({ features: [polygon('', 'No id')] }), null);
  assert.equal(
    normalizeDisruptionFeatures({ features: [polygon('1', 'A'), polygon('1', 'B')] }),
    null,
  );
  assert.equal(
    normalizeDisruptionFeatures({ features: [polygon('3', 'Short ring', {}, [[[0, 0], [1, 0]]])] }),
    null,
  );
  assert.equal(
    normalizeDisruptionFeatures({
      features: [polygon('4', 'Bad vertex', {}, [[[0, 0], [200, 0], [1, 1], [0, 0]]])],
    }),
    null,
  );
  const point = { ...polygon('5', 'Point'), geometry: { type: 'Point', coordinates: [0, 0] } };
  assert.equal(normalizeDisruptionFeatures({ features: [point] }), null);
});

test('deviation bands treat a thin baseline as noise and a missing one as unknown', () => {
  assert.equal(deviationStatus(-50, 10), 'collapse');
  assert.equal(deviationStatus(-25, 10), 'down');
  assert.equal(deviationStatus(0, 10), 'normal');
  assert.equal(deviationStatus(25, 10), 'up');
  assert.equal(deviationStatus(50, 10), 'surge');
  assert.equal(deviationStatus(400, 0.2), 'thin');
  assert.equal(deviationStatus(null, 0), 'thin');
  assert.equal(deviationStatus(null, null), 'unknown');
  assert.equal(deviationStatus(NaN, 5), 'unknown');
  assert.equal(formatDeviation(12.4), '+12%');
  assert.equal(formatDeviation(-40.6), '-41%');
  assert.equal(formatDeviation(0.2), '0%');
  assert.equal(formatDeviation(null), 'n/a');
});

test('snapshot joins registry, windows and disruptions; a missing window reads as unknown', () => {
  const ports = normalizePortRows({
    features: [
      port('port1201', 'Singapore', 103.7, 1.27),
      port('port9', 'Quiet', 10, 10, { vessel_count_tanker: 3 }),
      port('port7', 'Silent', 20, 20),
    ],
  });
  const recent = normalizePortStatRows({
    features: [stat('port1201', 60, 30, 7), stat('port9', 1, 0, 7)],
  });
  const baseline = normalizePortStatRows({
    features: [stat('port1201', 75, 35, 90), stat('port9', 0.1, 0, 90)],
  });
  const disruptions = normalizeDisruptionFeatures({ features: [polygon('1', 'HORMUZ-26')] });
  const snapshot = buildPortSnapshot({
    ports,
    recentStats: recent,
    baselineStats: baseline,
    latestDate: '2026-09-11',
    disruptions,
    // This case is about the join, so keep the quiet ports the tanker floor
    // would otherwise drop; the floor itself is covered by its own test.
    minAnnualTankers: 0,
  });
  assert.equal(snapshot.latestDate, '2026-09-11');
  assert.equal(snapshot.disruptions.length, 1);
  const [singapore, quiet, silent] = snapshot.rows;
  assert.equal(singapore.recentAvg, 60);
  assert.equal(singapore.baselineAvg, 75);
  assert.equal(singapore.deviationPct, -20);
  assert.equal(singapore.status, 'down');
  assert.equal(singapore.recentDays, 7);
  assert.equal(singapore.baselineDays, 90);
  assert.equal(singapore.recentContainers, 30);
  assert.equal(singapore.latestDate, '2026-09-11');
  assert.equal(quiet.status, 'thin');
  assert.ok(quiet.deviationPct > 800);
  assert.equal(silent.status, 'unknown');
  assert.equal(silent.recentAvg, null);
  assert.equal(silent.recentDays, 0);
  assert.equal(silent.latestDate, null);
});

test('the tanker floor drops registry ports that are not tanker ports', () => {
  const ports = normalizePortRows({
    features: [
      port('port1201', 'Singapore', 103.7, 1.27),
      port('port9', 'Quiet', 10, 10, { vessel_count_tanker: 3 }),
      port('port8', 'Just Under', 30, 30, { vessel_count_tanker: 249 }),
      port('port6', 'Just Over', 40, 40, { vessel_count_tanker: 250 }),
      port('port5', 'Unrated', 50, 50, { vessel_count_tanker: null }),
    ],
  });
  const snapshot = buildPortSnapshot({
    ports,
    recentStats: [],
    baselineStats: [],
    latestDate: '2026-09-11',
  });
  assert.deepEqual(
    snapshot.rows.map((row) => row.name),
    ['Singapore', 'Just Over'],
    'the floor is inclusive, and an unrated port is not assumed to have traffic',
  );
  // The registry count is what was offered, not what survived: the layer
  // reports both so the drop is visible rather than silent.
  assert.equal(snapshot.registryCount, 5);
});

test('source anchors both windows on the newest published day and follows the transfer-limit flag', async () => {
  const requests = [];
  const portPages = [
    { features: [port('port1', 'A', 0, 0)], exceededTransferLimit: true },
    { features: [port('port2', 'B', 1, 1)] },
  ];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    requests.push(u);
    let body;
    if (u.pathname.includes('PortWatch_ports_database')) {
      body = portPages[Number(u.searchParams.get('resultOffset')) === 0 ? 0 : 1];
    } else if (u.pathname.includes('portwatch_disruptions_database')) {
      body = { type: 'FeatureCollection', features: [polygon('1', 'HORMUZ-26')] };
    } else if (u.searchParams.get('outStatistics')?.includes('"max"')) {
      body = { features: [{ attributes: { latest: '2026-09-11' } }] };
    } else {
      const value = u.searchParams.get('where').includes('2026-09-05') ? 60 : 75;
      body = { features: [stat('port1', value), stat('port2', 0)] };
    }
    return { ok: true, json: async () => body };
  };
  const source = createPortWatchPortSource({
    fetchImpl,
    now: () => Date.UTC(2026, 8, 17),
  });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.rows.length, 2);
  assert.equal(snapshot.rows[0].deviationPct, -20);
  assert.equal(snapshot.rows[0].status, 'down');
  assert.equal(snapshot.rows[1].status, 'thin');
  assert.equal(snapshot.disruptions[0].name, 'HORMUZ-26');
  assert.equal(snapshot.latestDate, '2026-09-11');

  const wheres = requests.map((u) => u.searchParams.get('where'));
  assert.ok(
    wheres.includes("date >= DATE '2026-09-05'"),
    'recent window starts six days before the newest published day',
  );
  assert.ok(
    wheres.includes("date >= DATE '2026-06-14'"),
    'baseline window starts 89 days before the newest published day',
  );
  assert.ok(
    wheres.includes("todate IS NULL OR todate >= DATE '2026-06-19'"),
    'disruptions are filtered server-side to the recent window',
  );
  const portRequests = requests.filter((u) => u.pathname.includes('PortWatch_ports_database'));
  assert.deepEqual(
    portRequests.map((u) => u.searchParams.get('resultOffset')),
    ['0', '1'],
  );
  assert.equal(requests.length, 6);
  for (const u of requests) {
    if (!u.searchParams.get('groupByFieldsForStatistics')) continue;
    assert.equal(u.searchParams.get('maxRecordCountFactor'), '3');
    assert.equal(u.searchParams.get('orderByFields'), 'portid');
  }
});

test('source rejects HTTP failures, ArcGIS error envelopes and malformed pages', async () => {
  const http = createPortWatchPortSource({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(http.getSnapshot(), /HTTP 503/);
  const envelope = createPortWatchPortSource({
    fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: 400 } }) }),
  });
  await assert.rejects(envelope.getSnapshot(), /error 400/);
  const malformed = createPortWatchPortSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ features: [{ attributes: { portid: '' } }] }),
    }),
  });
  await assert.rejects(malformed.getSnapshot(), /Malformed/);
});

test('source honours an aborted signal before fetching', async () => {
  const controller = new AbortController();
  controller.abort();
  const source = createPortWatchPortSource({
    fetchImpl: async () => {
      throw new Error('should not fetch');
    },
  });
  await assert.rejects(
    source.getSnapshot({ signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
});
