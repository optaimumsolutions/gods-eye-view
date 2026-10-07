import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createGasFlowsLayer } from './index.js';
import {
  FEEDGAS_LATE_CSS,
  FEEDGAS_OK_CSS,
  FEEDGAS_PIN_PIXEL_SIZE,
  FEEDGAS_STALE_CSS,
} from './model.js';
import { FEEDGAS_TERMINALS, normaliseFlows } from './oracleFlows.js';

/**
 * Row 18 / #71 through the layer: the five feedgas pins appear at their
 * terminals, re-read on every update, carry hover and click cards, and a
 * failed route leaves the substrate exactly as it was.
 */

const NOW = Date.parse('2026-10-07T12:00:00Z');

function event() {
  const listeners = new Set();
  return {
    addEventListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function fakeViewer() {
  const scene = {
    canvas: { style: {} },
    picked: null,
    pick() {
      return scene.picked;
    },
    requestRender() {},
    groundPrimitives: { add() {}, remove() {} },
    postRender: event(),
  };
  return {
    dataSources: { add() {}, remove() {} },
    scene,
    camera: {
      positionCartographic: { height: 20_000_000 },
      moveEnd: event(),
      changed: event(),
    },
  };
}

const SNAPSHOT = {
  crossings: {
    crossings: [{ cellId: 'cell-1', latitude: 49, longitude: -100 }],
    vintage: { label: 'NACEI 2017' },
  },
  network: null,
  feed: 'nominal',
  networkError: null,
};

function flowsPayload(states) {
  const ids = Object.keys(FEEDGAS_TERMINALS);
  return {
    signals: ids.map((id, i) => ({
      id,
      label: `${FEEDGAS_TERMINALS[id].name} feedgas`,
      fetchedAt: '2026-10-06T15:21:00Z',
      freshness: { state: states[i] ?? 'ok' },
      series: [
        ['2026-09-28', 0, 1.0 + i],
        ['2026-10-05', 0, 1.5 + i],
      ],
    })),
  };
}

function terminalsMap() {
  return new Map(
    Object.entries(FEEDGAS_TERMINALS).map(([signalId, t], i) => [
      signalId,
      { signalId, gemId: t.gemId, name: t.name, lat: 28 + i * 0.3, lon: -95 },
    ]),
  );
}

function setup({ oracleFlows } = {}) {
  const overlay = { entries: [], cleared: 0 };
  const handlers = new Map();
  const viewer = fakeViewer();
  const layer = createGasFlowsLayer({
    source: { getSnapshot: async () => SNAPSHOT },
    overlayHost: {
      setEntries(_id, entries) {
        overlay.entries = entries;
      },
      clearSource() {
        overlay.cleared += 1;
        overlay.entries = [];
      },
    },
    requestRender: () => {},
    oracleFlows,
    screenSpaceEventHandlerFactory: () => ({
      setInputAction(fn, type) {
        handlers.set(type, fn);
      },
      destroy() {
        handlers.clear();
      },
    }),
  });
  layer.init(viewer);
  layer.enable(viewer);
  return { layer, viewer, overlay, handlers };
}

test('five fixed-size pins at their terminals, coloured by verdict', async (t) => {
  t.mock.method(console, 'log', () => {});
  let states = ['ok', 'late', 'stale', 'ok', 'ok'];
  let reads = 0;
  const oracleFlows = {
    getTerminals: async () => terminalsMap(),
    getFlows: async () => {
      reads += 1;
      return normaliseFlows(flowsPayload(states), { now: NOW });
    },
  };
  const added = [];
  const original = Cesium.EntityCollection.prototype.add;
  t.mock.method(Cesium.EntityCollection.prototype, 'add', function (e) {
    const entity = original.call(this, e);
    added.push(entity);
    return entity;
  });
  const { layer } = setup({ oracleFlows });
  assert.equal(layer.updateInterval, 30 * 60_000);
  assert.equal(await layer.update(), true);
  assert.equal(layer.getStats().feedgas.pins, 5);
  const pins = added.filter((e) => e.__gasFeedgasId);
  assert.equal(pins.length, 5);
  const at = Cesium.JulianDate.now();
  const css = (id) =>
    pins
      .find((e) => e.__gasFeedgasId === id)
      .point.color.getValue(at)
      .toCssHexString();
  assert.equal(css('NG_FLOW_SABINE_FEEDGAS_CREOLE'), FEEDGAS_OK_CSS);
  assert.equal(css('NG_FLOW_CORPUS_FEEDGAS_CCPL'), FEEDGAS_LATE_CSS);
  assert.equal(css('NG_FLOW_GOLDEN_PASS_GULF_RUN'), FEEDGAS_STALE_CSS);
  for (const pin of pins)
    assert.equal(pin.point.pixelSize.getValue(at), FEEDGAS_PIN_PIXEL_SIZE);
  // The route is re-read on every update; the bundle is not.
  states = ['stale', 'ok', 'ok', 'ok', 'ok'];
  await layer.update();
  assert.equal(reads, 2);
  assert.equal(added.filter((e) => e.__gasFeedgasId).length, 5, 'restyled');
  assert.equal(css('NG_FLOW_SABINE_FEEDGAS_CREOLE'), FEEDGAS_STALE_CSS);
  assert.match(layer.getStats().source, /LNG FEEDGAS 5 PINS/);
  assert.deepEqual(
    { ...layer.getStats().feedgas, error: null },
    { pins: 5, ok: 4, late: 0, stale: 1, error: null },
  );
});

test('hover shows a card, click pins it, empty space clears it', async (t) => {
  t.mock.method(console, 'log', () => {});
  const added = [];
  const original = Cesium.EntityCollection.prototype.add;
  t.mock.method(Cesium.EntityCollection.prototype, 'add', function (e) {
    const entity = original.call(this, e);
    added.push(entity);
    return entity;
  });
  const { layer, viewer, overlay, handlers } = setup({
    oracleFlows: {
      getTerminals: async () => terminalsMap(),
      getFlows: async () =>
        normaliseFlows(flowsPayload(['ok', 'ok', 'stale']), { now: NOW }),
    },
  });
  await layer.update();
  const sabine = added.find(
    (e) => e.__gasFeedgasId === 'NG_FLOW_SABINE_FEEDGAS_CREOLE',
  );
  viewer.scene.picked = { id: sabine };
  handlers.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)({
    endPosition: { x: 1, y: 1 },
  });
  assert.equal(overlay.entries.length, 1);
  assert.equal(overlay.entries[0].title, 'Sabine Pass feedgas');
  assert.equal(
    overlay.entries[0].details[0],
    'scheduled 1.50 Bcf/d on gas day 10-05',
  );
  assert.equal(viewer.scene.canvas.style.cursor, 'pointer');
  handlers.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)({
    position: { x: 1, y: 1 },
  });
  assert.equal(overlay.entries.length, 1);
  assert.equal(overlay.entries[0].selected, true);
  // A stale pin's card carries no number.
  const golden = added.find(
    (e) => e.__gasFeedgasId === 'NG_FLOW_GOLDEN_PASS_GULF_RUN',
  );
  viewer.scene.picked = { id: golden };
  handlers.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)({
    position: { x: 2, y: 2 },
  });
  const selected = () => overlay.entries.filter((entry) => entry.selected);
  assert.equal(selected().length, 1);
  assert.equal(selected()[0].details[0], 'stale — last gas day 10-05');
  // A crossing pip is a sibling pick, not empty space.
  viewer.scene.picked = { id: { id: 'commodity-gas-flows:cell-1' } };
  handlers.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)({
    position: { x: 3, y: 3 },
  });
  assert.equal(selected().length, 1);
  viewer.scene.picked = null;
  handlers.get(Cesium.ScreenSpaceEventType.LEFT_CLICK)({
    position: { x: 4, y: 4 },
  });
  assert.equal(selected().length, 0, 'empty space clears the pinned card');
  // Hover off every pin: no card at all.
  await new Promise((resolve) => setTimeout(resolve, 130));
  handlers.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)({
    endPosition: { x: 5, y: 5 },
  });
  assert.equal(overlay.entries.length, 0);
  assert.equal(viewer.scene.canvas.style.cursor, '');
  layer.disable();
  assert.equal(handlers.size, 0, 'handlers released on disable');
});

test('a failed or absent route leaves the substrate alone and says so once', async (t) => {
  t.mock.method(console, 'log', () => {});
  const info = t.mock.method(console, 'info', () => {});
  const warn = t.mock.method(console, 'warn', () => {});
  let fail = false;
  const { layer } = setup({
    oracleFlows: {
      getTerminals: async () => terminalsMap(),
      getFlows: async () => {
        if (fail) throw new Error('Oil Oracle flows HTTP 404');
        return normaliseFlows(flowsPayload([]), { now: NOW });
      },
    },
  });
  await layer.update();
  assert.equal(layer.getStats().feedgas.pins, 5);
  fail = true;
  assert.equal(await layer.update(), true, 'the route never fails the layer');
  assert.equal(await layer.update(), true);
  const stats = layer.getStats();
  assert.equal(stats.feedgas.pins, 0, 'no stale pins left behind');
  assert.equal(stats.count, 1, 'crossings untouched');
  assert.equal(stats.error, null);
  assert.equal(stats.feedgas.error, 'Oil Oracle flows HTTP 404');
  assert.doesNotMatch(stats.source, /FEEDGAS/);
  assert.equal(info.mock.callCount(), 1, 'one console.info, no spam');
  assert.equal(warn.mock.callCount(), 0);

  const bare = setup({});
  assert.equal(bare.layer.updateInterval, 24 * 60 * 60_000);
  assert.equal(await bare.layer.update(), true);
  assert.equal(bare.layer.getStats().feedgas.pins, 0);
  assert.equal(bare.handlers.size, 0, 'no handler without the route');
});
