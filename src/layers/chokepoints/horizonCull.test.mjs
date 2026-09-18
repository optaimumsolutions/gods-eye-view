import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createChokepointsLayer } from './index.js';

/**
 * Regression: the strait markers are always-on-top
 * (`disableDepthTestDistance: INFINITY`) so terrain beside a strait cannot
 * swallow them. Nothing then writes far-side depth, so before the occluder
 * pass every strait on the opposite side of the planet painted straight
 * through it as a bare unlabelled dot — the rings and discs are clamped to
 * ground and the ambient labels already horizon-cull, so only the dots leaked.
 */

/** Camera height used for the repro: the whole globe is in frame. */
const GLOBE_HEIGHT_M = 20_000_000;
const ATLANTIC = { lon: -30, lat: 20 };
const PACIFIC = { lon: 120, lat: 10 };

const MALACCA = 'chokepoint:chokepoint5';
const GIBRALTAR = 'chokepoint:chokepoint8';

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
  const layer = createChokepointsLayer({
    source: { getSnapshot: async () => ({ rows: [], latestDate: null }) },
    overlayHost: {
      setEntries() {},
      setVisible() {},
      clearSource() {},
    },
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

function moveCamera(viewer, { lon, lat }) {
  viewer.camera.positionWC = Cesium.Cartesian3.fromDegrees(
    lon,
    lat,
    GLOBE_HEIGHT_M,
  );
  viewer.camera.changed.raise();
}

test('enable hides the straits beyond the horizon and keeps the near side', () => {
  const viewer = fakeViewer(ATLANTIC);
  const { layer, entities } = fakeLayer(viewer);

  // Before the pass every pin paints, which is the defect itself.
  assert.equal(shown(entities, MALACCA), true);

  layer.enable(viewer);

  assert.equal(
    shown(entities, MALACCA),
    false,
    'Malacca is behind the Earth from mid-Atlantic and must not paint through it',
  );
  assert.equal(
    shown(entities, GIBRALTAR),
    true,
    'Gibraltar is on the visible hemisphere and must still paint',
  );
  layer.destroy(viewer);
});

test('a camera move flips which straits paint', () => {
  const viewer = fakeViewer(ATLANTIC);
  const { layer, entities } = fakeLayer(viewer);
  layer.enable(viewer);

  moveCamera(viewer, PACIFIC);

  assert.equal(shown(entities, MALACCA), true);
  assert.equal(shown(entities, GIBRALTAR), false);

  // moveEnd drives the same pass, so a drag settle recovers the Atlantic view.
  viewer.camera.positionWC = Cesium.Cartesian3.fromDegrees(
    ATLANTIC.lon,
    ATLANTIC.lat,
    GLOBE_HEIGHT_M,
  );
  viewer.camera.moveEnd.raise();
  assert.equal(shown(entities, MALACCA), false);
  assert.equal(shown(entities, GIBRALTAR), true);
  layer.destroy(viewer);
});

test('disable and destroy release the camera listeners', () => {
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
