import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createPortsLayer } from './index.js';

/**
 * Regression (row 9, 2026-10-12): with the photorealistic 3D tiles as the
 * basemap, `scene.pick` on bare ground returns the tileset (`{ primitive }`,
 * no `id`). The click handler read any pick as "a sibling layer's object",
 * so a ground click never cleared the port selection and the port dossier
 * panel, which closes on `gev:entity-selection-cleared`, stayed open. A pick
 * with no id is nothing any layer can select: it is empty space.
 */

const ROTTERDAM = {
  id: 'port1',
  name: 'Rotterdam',
  lon: 4.4,
  lat: 51.9,
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

function event() {
  const listeners = new Set();
  return {
    addEventListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

async function harness() {
  const dataSources = [];
  let nextPick;
  const viewer = {
    dataSources: {
      add(dataSource) {
        dataSources.push(dataSource);
      },
      remove() {},
    },
    scene: { canvas: {}, pick: () => nextPick },
    clock: { currentTime: Cesium.JulianDate.now() },
    camera: {
      positionWC: Cesium.Cartesian3.fromDegrees(0, 45, 20_000_000),
      moveEnd: event(),
      changed: event(),
    },
    selectedEntity: undefined,
    isDestroyed: () => false,
  };
  let onClick = null;
  const cleared = [];
  const layer = createPortsLayer({
    source: {
      getSnapshot: async () => ({
        rows: [ROTTERDAM],
        disruptions: [],
        latestDate: '2026-09-11',
      }),
    },
    overlayHost: { setEntries() {}, setVisible() {}, clearSource() {} },
    context: {
      registerEntityContext() {},
      selectEntityContext() {},
      clearSelectedEntityContextForLayer(layerId) {
        cleared.push(layerId);
      },
      removeEntityContextsForLayer() {},
    },
    screenSpaceEventHandlerFactory: () => ({
      setInputAction(fn) {
        onClick = fn;
      },
      destroy() {},
    }),
  });
  layer.init(viewer);
  layer.enable(viewer);
  await layer.update();
  const port = dataSources[0].entities.getById('port:port1');
  const click = (picked) => {
    nextPick = picked;
    onClick({ position: { x: 1, y: 1 } });
  };
  return { layer, viewer, port, click, cleared };
}

test('a click on the 3D-tiles basemap (a pick with no id) clears the port selection', async () => {
  const { layer, viewer, port, click, cleared } = await harness();
  click({ id: port });
  assert.equal(viewer.selectedEntity, port);
  click({ primitive: { constructor: { name: 'Cesium3DTileset' } } });
  assert.deepEqual(cleared, ['commodity-ports']);
  assert.equal(viewer.selectedEntity, undefined);
  layer.destroy(viewer);
});

test('a click on bare globe with no tiles (no pick at all) still clears', async () => {
  const { layer, viewer, port, click, cleared } = await harness();
  click({ id: port });
  click(undefined);
  assert.deepEqual(cleared, ['commodity-ports']);
  layer.destroy(viewer);
});

test("a click on a sibling layer's object keeps the port selected", async () => {
  const { layer, viewer, port, click, cleared } = await harness();
  click({ id: port });
  click({ id: { name: 'another layer entity' } });
  assert.deepEqual(cleared, []);
  assert.equal(viewer.selectedEntity, port);
  layer.destroy(viewer);
});
