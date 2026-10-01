import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLUSTER_KM,
  PIPELINES,
  STATION_LINE_KM,
  buildLines,
  buildStations,
  clusterParts,
  distanceToPartsKm,
  haversineKm,
  pointSegmentKm,
} from '../../../scripts/build-gas-overlay.mjs';

const read = (name) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../data/local_data/gas_overlay/${name}`, import.meta.url)), 'utf8'),
  );

// ----------------------------------------------------------- geometry ----

test('haversine and point-to-segment agree on a one-degree meridian step', () => {
  const km = haversineKm([-93, 30], [-93, 31]);
  assert.ok(Math.abs(km - 111.2) < 0.2, `${km}`);
  // A point 0.1 degree of longitude east of a north-south segment at 30.5N.
  const d = pointSegmentKm([-92.9, 30.5], [-93, 30], [-93, 31]);
  assert.ok(Math.abs(d - 9.58) < 0.1, `${d}`);
  // Beyond the segment's end the distance is to the endpoint, not the line.
  assert.ok(Math.abs(pointSegmentKm([-93, 32], [-93, 30], [-93, 31]) - 111.2) < 0.3);
});

test('parts cluster by single linkage at the threshold, largest first', () => {
  const near = [[[-93, 30], [-93, 30.2]], [[-93, 30.5], [-93, 30.7]]]; // ~33 km apart
  const far = [[[-90, 28], [-90, 28.1]]];
  const clusters = clusterParts([...near, ...far], CLUSTER_KM);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].length, 2);
  assert.equal(clusters[1].length, 1);
});

test('a traced pipeline with no file yet is reported missing, never invented', () => {
  const l = buildLines('gulf_run', { ...PIPELINES.gulf_run, trace: 'does-not-exist.geojson' }, { systems: [] });
  assert.equal(l.method, 'missing');
  assert.deepEqual(l.parts, []);
});

test('GHGRP facilities attach by name, never by parent company (Loews also owns Texas Gas)', () => {
  const lines = { parts: [[[-93, 30], [-93, 31]]] };
  const ghgrp = [
    { facility_id: 1, facility_name: 'Texas Gas Transmission - Eunice Station', parent_company: 'LOEWS CORP (100%)', latitude: 30.5, longitude: -92.4 },
    { facility_id: 2, facility_name: 'Gulf South Pipeline - Foo Station', parent_company: 'LOEWS CORP (100%)', latitude: 30.5, longitude: -93.01 },
  ];
  const st = buildStations('gulf_south', PIPELINES.gulf_south, lines, [], ghgrp);
  assert.deepEqual(st.map((s) => s.ghgrp.id), [2]);
  assert.equal(st[0].offLine, false);
});

test('a HIFLD station pairs with the same-named GHGRP facility, so it is not listed twice', () => {
  const lines = { parts: [[[-93, 30], [-93, 31]]] };
  const hifld = [{ NAME: 'CLARENCE', COUNTY: 'NATCHITOCHES', STATE: 'LA', CERT_HP: 1, STATUS: 'IN SERVICE', LATITUDE: 30.5, LONGITUDE: -93 }];
  const ghgrp = [
    { facility_id: 9, facility_name: 'Gulf South Pipeline - Clarence Station', parent_company: 'x', latitude: 30.6, longitude: -93 },
  ];
  const st = buildStations('gulf_south', PIPELINES.gulf_south, lines, hifld, ghgrp);
  assert.equal(st.length, 1);
  assert.equal(st[0].ghgrp.id, 9);
  assert.ok(st[0].ghgrp.km > 10 && st[0].ghgrp.km < 12);
});

// ------------------------------------------------------------- bundle ----

test('lines: Gulf South is drawn as one network within the cluster threshold, outliers listed', () => {
  const { pipelines } = read('lines.json');
  const gs = pipelines.find((p) => p.id === 'gulf_south');
  assert.equal(gs.method, 'eia_2020');
  assert.ok(gs.km > 9000 && gs.km < 10500, `${gs.km}`);
  assert.equal(clusterParts(gs.parts, CLUSTER_KM).length, 1);
  for (const e of gs.excluded) assert.match(e.reason, /from the drawn network/);
  // Texas through Louisiana and Mississippi to the Florida panhandle.
  const xs = gs.parts.flat().map((v) => v[0]);
  assert.ok(Math.min(...xs) < -98 && Math.max(...xs) > -88);
});

test('stations: every one carries a source method, a pipeline and its measured distance to the line', () => {
  const { stations, lng } = read('stations.json');
  const { pipelines } = read('lines.json');
  assert.ok(stations.length >= 30);
  const ids = new Set();
  for (const s of stations) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    assert.ok(['hifld_copy', 'ghgrp_2023'].includes(s.method));
    assert.ok(PIPELINES[s.pipeline]);
    const parts = pipelines.find((p) => p.id === s.pipeline).parts;
    if (parts.length) {
      const d = distanceToPartsKm([s.lon, s.lat], parts);
      assert.ok(Math.abs(d - s.lineKm) < 0.05, `${s.name} ${d} vs ${s.lineKm}`);
      assert.equal(s.offLine, s.lineKm > STATION_LINE_KM);
    }
  }
  for (const name of ['Golden Pass', 'Freeport', 'Sabine Pass']) {
    assert.ok(lng.some((t) => t.name.includes(name)), name);
  }
});

test('source manifest records every input, the thresholds and the checks', () => {
  const src = read('source.json');
  assert.equal(src.inputs.lines.vintage, 'JANUARY 2020');
  assert.match(src.inputs.lines.sha256, /^[0-9a-f]{64}$/);
  assert.equal(src.thresholds.stationLineKm, STATION_LINE_KM);
  assert.deepEqual(src.checks.map((c) => c.pipeline), Object.keys(PIPELINES));
});
