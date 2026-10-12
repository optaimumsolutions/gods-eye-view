import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PORT_SOURCE_FILE,
  PORT_CAMERA_ID_RE,
  loadPortSourcesFromCatalog,
  normalizePortCameraRow,
  portImageOrigin,
} from '../../server/providers/cctv/portSources.js';
import { validateSeed } from '../layers/ports/dossier.js';

const ROOT = new URL('../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);

function haversineKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function row(overrides = {}) {
  return {
    id: 'port-example-1',
    portid: 'port1',
    name: 'Example harbour',
    provider: 'Example Port Authority',
    sourceKind: 'port-webcam',
    feedType: 'image',
    url: 'https://cams.example.org/harbour.jpg',
    lat: 51.9,
    lon: 4.2,
    license: 'Example Port Authority public webcam; frames shown as published.',
    ...overrides,
  };
}

test('portImageOrigin accepts only bare http or https origins', () => {
  assert.equal(
    portImageOrigin('https://cams.example.org/a.jpg?x=1'),
    'https://cams.example.org',
  );
  assert.equal(
    portImageOrigin('http://cams.example.org/a.jpg'),
    'http://cams.example.org',
  );
  assert.equal(portImageOrigin('ftp://cams.example.org/a.jpg'), null);
  assert.equal(portImageOrigin('https://user:pw@cams.example.org/a.jpg'), null);
  assert.equal(portImageOrigin('https://cams.example.org:8443/a.jpg'), null);
  assert.equal(portImageOrigin('https://localhost/a.jpg'), null);
  assert.equal(portImageOrigin('not a url'), null);
  assert.equal(portImageOrigin(42), null);
});

test('normalizePortCameraRow forces the pack identity and keeps pose fields', () => {
  const { camera, reason } = normalizePortCameraRow(
    row({
      headingDeg: 200,
      poseSource: 'curated',
      snapshotUrl: 'https://cams.example.org/harbour.jpg?size=l',
    }),
  );
  assert.equal(reason, null);
  assert.equal(camera.sourceKind, 'port-webcam');
  assert.equal(camera.feedType, 'image');
  assert.equal(camera.cityId, 'port1');
  assert.equal(camera.city, 'Example harbour');
  assert.equal(camera.headingDeg, 200);
  assert.equal(camera.poseSource, 'curated');
  assert.equal(
    camera.snapshotUrl,
    'https://cams.example.org/harbour.jpg?size=l',
  );
});

test('normalizePortCameraRow keeps the road-camera kind and defaults everything else to port-webcam', () => {
  assert.equal(
    normalizePortCameraRow(row({ sourceKind: 'port-road-camera' })).camera
      .sourceKind,
    'port-road-camera',
  );
  assert.equal(
    normalizePortCameraRow(row({ sourceKind: 'municipal-webcam' })).camera
      .sourceKind,
    'port-webcam',
  );
});

test('normalizePortCameraRow names the reason a row is rejected', () => {
  const cases = [
    [row({ id: 'warendorf-marktplatz' }), /not a port camera id/],
    [row({ url: 'ftp://cams.example.org/harbour.jpg' }), /bare http\(s\) origin/],
    [
      row({ url: 'https://u:p@cams.example.org/harbour.jpg' }),
      /bare http\(s\) origin/,
    ],
    [
      row({ snapshotUrl: 'https://other.example.net/harbour.jpg' }),
      /leaves the row's origin/,
    ],
    [row({ lat: '51.9', lon: '4.2' }), /implausible coordinates/],
    [row({ license: '' }), /required/],
    [row({ provider: '' }), /required/],
    [row({ portid: 'nope' }), /required/],
    [null, /not an object/],
  ];
  for (const [input, expected] of cases) {
    const { camera, reason } = normalizePortCameraRow(input);
    assert.equal(camera, null);
    assert.match(reason, expected);
  }
});

test('port camera loader tolerates a missing catalog file', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(
    loadPortSourcesFromCatalog({ sourceRoot: '/nonexistent' }),
    [],
  );
});

test('port camera loader skips malformed and duplicate rows without throwing', (t) => {
  t.mock.method(console, 'log', () => {});
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-port-cams-'));
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(
    path.join(dir, DEFAULT_PORT_SOURCE_FILE),
    JSON.stringify([
      row(),
      row({ id: 'port-example-1', url: 'https://cams.example.org/dupe.jpg' }),
      row({ id: 'port-example-2', url: 'ftp://cams.example.org/b.jpg' }),
      row({ id: 'port-example-3', lat: 'x' }),
      'not a row',
    ]),
  );
  const cameras = loadPortSourcesFromCatalog({ sourceRoot: dir });
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['port-example-1'],
  );
  assert.equal(warnings.length, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the committed port camera catalog is hand-verified, https, licensed and matched to the seed', (t) => {
  t.mock.method(console, 'log', () => {});
  const cameras = loadPortSourcesFromCatalog({ sourceRoot: ROOT_PATH });
  const rawRows = JSON.parse(
    fs.readFileSync(new URL(DEFAULT_PORT_SOURCE_FILE, ROOT), 'utf8'),
  );
  assert.equal(cameras.length, rawRows.length, 'every committed row loads');
  const seed = validateSeed(
    JSON.parse(
      fs.readFileSync(new URL('config/port_dossiers.seed.json', ROOT), 'utf8'),
    ),
  );
  const seedByPort = new Map(seed.map((entry) => [entry.portid, entry]));
  const referenced = new Map(
    seed.flatMap((entry) => entry.cameraIds.map((id) => [id, entry.portid])),
  );
  const index = JSON.parse(
    fs.readFileSync(
      new URL('src/data/local_data/port_dossiers/index.json', ROOT),
      'utf8',
    ),
  );
  const portRow = new Map(index.ports.map((port) => [port.portid, port]));
  for (const camera of cameras) {
    assert.match(camera.id, PORT_CAMERA_ID_RE);
    assert.match(camera.url, /^https?:\/\//);
    assert.ok(
      ['port-webcam', 'port-road-camera'].includes(camera.sourceKind),
      camera.id,
    );
    assert.equal(camera.feedType, 'image');
    assert.ok(
      camera.license.length > 20,
      `${camera.id} carries the operator terms`,
    );
    if (camera.sourceKind === 'port-webcam')
      assert.equal(
        referenced.get(camera.id),
        camera.portid,
        `${camera.id} is referenced by its port's seed entry`,
      );
    else
      assert.ok(
        !referenced.has(camera.id),
        `${camera.id} is a road camera and not a dossier frame candidate`,
      );
    assert.ok(seedByPort.has(camera.portid));
    const port = portRow.get(camera.portid);
    assert.ok(port, `${camera.portid} is in the bundle index`);
    const km = haversineKm(port.lat, port.lon, camera.lat, camera.lon);
    const limit = camera.sourceKind === 'port-road-camera' ? 3 : 15;
    assert.ok(
      km <= limit,
      `${camera.id} is ${km.toFixed(1)} km from ${port.name}; limit ${limit} km`,
    );
  }
  for (const id of referenced.keys()) {
    assert.ok(
      cameras.some((camera) => camera.id === id),
      `seed camera ${id} exists in the catalog`,
    );
  }
});
