import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createPortsLayer } from './index.js';

/**
 * Regression: the port markers are always-on-top
 * (`disableDepthTestDistance: INFINITY`) so the quay a port sits on cannot
 * swallow them. Nothing then writes far-side depth, so before the occluder
 * pass all two thousand ports painted through the planet as a haze of dots.
 * Unlike the chokepoints layer these entities are rebuilt on every refresh,
 * so the rebuild has to re-cull or each poll flashes the far side back on.
 */

const GLOBE_HEIGHT_M = 20_000_000;
const ATLANTIC = { lon: -30, lat: 20 };
const PACIFIC = { lon: 120, lat: 10 };

const ROTTERDAM = { id: 'port1', name: 'Rotterdam', lon: 4.4, lat: 51.9 };
const SINGAPORE = { id: 'port2', name: 'Singapore', lon: 103.8, lat: 1.3 };

function row(port) {
  return {
    ...port,
    country: 'Testland',
    status: 'normal',
    deviationPct: 0,
    recentAvg: 1,
    baselineAvg: 1,
    recentDays: 7,
    baselineDays: 90,
    annualTankers: 100,
    latestDate: '2026-09-11',
  };
}

/** Cesium Event-shaped stub that hands back a remover, as the real one does. */
function event() {
  const listeners = new Set();
  return {
    addEventListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    raise() {
      for (const fn of [...listeners]) fn();
    },
    get size() {
      return listeners.size;
    },
  };
}

function fakeViewer({ lon, lat }) {
  const dataSources = [];
  return {
    dataSources: {
      add(dataSource) {
        dataSources.push(dataSource);
      },
      remove() {},
    },
    scene: { canvas: {} },
    clock: { currentTime: Cesium.JulianDate.now() },
    camera: {
      positionWC: Cesium.Cartesian3.fromDegrees(lon, lat, GLOBE_HEIGHT_M),
      moveEnd: event(),
      changed: event(),
    },
    selectedEntity: undefined,
    isDestroyed: () => false,
    _dataSources: dataSources,
  };
}

function fakeLayer(viewer) {
  const layer = createPortsLayer({
    source: {
      getSnapshot: async () => ({
        rows: [row(ROTTERDAM), row(SINGAPORE)],
        disruptions: [],
        latestDate: '2026-09-11',
      }),
    },
    overlayHost: { setEntries() {}, setVisible() {}, clearSource() {} },
    context: {
      registerEntityContext() {},
      selectEntityContext() {},
      clearSelectedEntityContextForLayer() {},
      removeEntityContextsForLayer() {},
    },
    screenSpaceEventHandlerFactory: () => ({
      setInputAction() {},
      destroy() {},
    }),
  });
  layer.init(viewer);
  return { layer, entities: viewer._dataSources[0].entities };
}

/** A marker is shown unless the cull has explicitly written `show = false`. */
function shown(entities, id) {
  const show = entities.getById(id)?.point?.show;
  return show == null || show.getValue() === true;
}

test('a refresh hands back markers already culled to the visible hemisphere', async () => {
  const viewer = fakeViewer(ATLANTIC);
  const { layer, entities } = fakeLayer(viewer);
  layer.enable(viewer);

  assert.equal(await layer.update(), true);

  assert.equal(
    shown(entities, 'port:port2'),
    false,
    'Singapore is behind the Earth from mid-Atlantic and must not paint through it',
  );
  assert.equal(
    shown(entities, 'port:port1'),
    true,
    'Rotterdam is on the visible hemisphere and must still paint',
  );
  layer.destroy(viewer);
});

test('a camera move flips which ports paint', async () => {
  const viewer = fakeViewer(ATLANTIC);
  const { layer, entities } = fakeLayer(viewer);
  layer.enable(viewer);
  await layer.update();

  viewer.camera.positionWC = Cesium.Cartesian3.fromDegrees(
    PACIFIC.lon,
    PACIFIC.lat,
    GLOBE_HEIGHT_M,
  );
  viewer.camera.changed.raise();

  assert.equal(shown(entities, 'port:port2'), true);
  assert.equal(shown(entities, 'port:port1'), false);
  layer.destroy(viewer);
});

test('disable and destroy release the camera listeners', async () => {
  const viewer = fakeViewer(ATLANTIC);
  const { layer } = fakeLayer(viewer);

  layer.enable(viewer);
  assert.equal(viewer.camera.moveEnd.size, 1);
  assert.equal(viewer.camera.changed.size, 1);

  layer.disable();
  assert.equal(viewer.camera.moveEnd.size, 0);
  assert.equal(viewer.camera.changed.size, 0);

  // Re-enabling re-arms exactly one listener per event, never a second copy.
  layer.enable(viewer);
  layer.enable(viewer);
  assert.equal(viewer.camera.moveEnd.size, 1);
  assert.equal(viewer.camera.changed.size, 1);

  layer.destroy(viewer);
  assert.equal(viewer.camera.moveEnd.size, 0);
  assert.equal(viewer.camera.changed.size, 0);
});
