import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PORT_DOSSIER_HISTORY_CACHE_MS,
  installPortDossier,
  portidFromContextRecord,
} from './portDossier.js';

const NOW = Date.parse('2026-09-17T12:00:00Z');

function dossierFixture(portid = 'port1201', name = 'Singapore') {
  return {
    schemaVersion: 1,
    portid,
    slug: name.toLowerCase(),
    name,
    fullname: `${name}, ${name}`,
    country: 'Singapore',
    locode: 'SG SIN',
    lat: 1.27,
    lon: 103.7,
    role: 'Hub',
    roleNotes: 'Hub.',
    linkedSystems: [
      { id: 'chokepoint5', name: 'Malacca Strait', kind: 'chokepoint' },
    ],
    aliases: [name],
    authority: { name: 'MPA', url: 'https://www.mpa.gov.sg/' },
    terminals: [],
    annualCalls: {
      total: 1,
      tanker: 1,
      container: 0,
      dryBulk: 0,
      generalCargo: 0,
      roro: 0,
    },
    industries: [],
    countryShare: { importPct: null, exportPct: null },
    wikipedia: {
      title: name,
      url: 'https://en.wikipedia.org/wiki/Port',
      description: null,
      extract: 'Extract.',
      thumbnail: null,
      revision: '1',
      timestamp: '2026-08-01T10:20:30Z',
      licence: 'CC BY-SA 4.0',
    },
    links: {
      authority: 'https://www.mpa.gov.sg/',
      portwatch: 'https://portwatch.imf.org/datasets/abc',
      wikipedia: 'https://en.wikipedia.org/wiki/Port',
    },
    cameraIds: [],
    satelliteZoom: 9,
  };
}

function historyPayload() {
  const features = [];
  for (let index = 0; index < 20; index += 1) {
    const date = new Date(
      Date.parse('2026-09-11T00:00:00Z') - index * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    features.push({
      attributes: { date, portcalls_tanker: 50, portcalls: 60 },
    });
  }
  return { features };
}

function fakePanel() {
  const calls = [];
  let closeHandler = null;
  return {
    calls,
    open: (entry) => calls.push(['open', entry.portid]),
    render: (assembled) =>
      calls.push([
        'render',
        assembled.portid,
        Object.fromEntries(
          assembled.sections.map((section) => [section.id, section.status]),
        ),
      ]),
    renderError: (entry, reason) => calls.push(['error', entry.portid, reason]),
    close: () => calls.push(['close']),
    onClose: (handler) => {
      closeHandler = handler;
    },
    destroy: () => calls.push(['destroy']),
    pressClose: () => closeHandler?.(),
  };
}

function harness({ fetchImpl, layer, live } = {}) {
  const windowRef = new EventTarget();
  const panel = fakePanel();
  const fetches = [];
  const controller = installPortDossier({
    layer: layer ?? {
      getDossierInputs: (portid) => ({
        row: {
          id: portid,
          name: 'Singapore',
          status: 'normal',
          deviationPct: 1,
          recentAvg: 2,
          baselineAvg: 2,
          recentDays: 7,
          baselineDays: 90,
          latestDate: '2026-09-11',
        },
        disruptions: [],
        latestDate: '2026-09-11',
        lastUpdate: NOW,
      }),
    },
    panel,
    index: {
      ports: [
        { portid: 'port1201', name: 'Singapore', country: 'Singapore' },
        { portid: 'port362', name: 'Fujairah', country: 'UAE' },
      ],
    },
    loadDossier: async (portid) =>
      dossierFixture(portid, portid === 'port362' ? 'Fujairah' : 'Singapore'),
    windowRef,
    fetchImpl:
      fetchImpl ??
      (async (url, options) => {
        fetches.push({ url, signal: options.signal });
        return { ok: true, json: async () => historyPayload() };
      }),
    now: () => NOW,
    setTimer: () => 1,
    clearTimer: () => {},
    live,
  });
  const select = (record) =>
    windowRef.dispatchEvent(
      new CustomEvent('gev:entity-selected', { detail: record }),
    );
  const clear = () =>
    windowRef.dispatchEvent(
      new CustomEvent('gev:entity-selection-cleared', { detail: null }),
    );
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { controller, panel, fetches, select, clear, settle, windowRef };
}

test('portidFromContextRecord accepts port markers only', () => {
  assert.equal(
    portidFromContextRecord({
      layerId: 'commodity-ports',
      id: 'commodity-ports:port1201',
    }),
    'port1201',
  );
  assert.equal(
    portidFromContextRecord({
      layerId: 'commodity-ports',
      id: 'commodity-ports:disruption:100',
    }),
    null,
  );
  assert.equal(
    portidFromContextRecord({
      layerId: 'commodity-chokepoints',
      id: 'commodity-chokepoints:chokepoint6',
    }),
    null,
  );
  assert.equal(portidFromContextRecord(null), null);
});

test('installPortDossier validates its inputs', () => {
  assert.throws(() => installPortDossier({}), TypeError);
});

test('a bundled port opens on the click frame, then fills from the layer and the history request', async () => {
  const h = harness();
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port1201' });
  assert.deepEqual(h.panel.calls[0], ['open', 'port1201']);
  await h.settle();
  await h.settle();
  const renders = h.panel.calls.filter((call) => call[0] === 'render');
  assert.ok(
    renders.length >= 2,
    'renders once with the layer inputs and once with the history',
  );
  assert.equal(renders[0][2].flow, 'ready');
  assert.equal(renders[0][2].history, 'pending');
  assert.equal(renders.at(-1)[2].history, 'ready');
  assert.equal(
    renders.at(-1)[2].weather,
    'pending',
    'live sections stay pending without hooks',
  );
  assert.equal(h.fetches.length, 1);
  assert.match(h.fetches[0].url, /Daily_Ports_Data\/FeatureServer\/0\/query\?/);
  assert.match(decodeURIComponent(h.fetches[0].url), /portid='port1201'/);
  assert.match(h.fetches[0].url, /resultRecordCount=120/);
  assert.deepEqual(h.controller.getState(), {
    portid: 'port1201',
    loaded: true,
    historyCached: ['port1201'],
  });
});

test('a port outside the launch set, a disruption or another layer opens nothing and closes an open dossier', async () => {
  const h = harness();
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port999' });
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:disruption:1' });
  h.select({
    layerId: 'commodity-chokepoints',
    id: 'commodity-chokepoints:chokepoint6',
  });
  await h.settle();
  assert.deepEqual(h.panel.calls, []);
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port1201' });
  await h.settle();
  h.select({
    layerId: 'commodity-chokepoints',
    id: 'commodity-chokepoints:chokepoint6',
  });
  assert.deepEqual(h.panel.calls.at(-1), ['close']);
  assert.equal(h.controller.getState().portid, null);
});

test('swapping ports aborts the previous request and deselect closes the panel', async () => {
  const h = harness();
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port1201' });
  await h.settle();
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port362' });
  await h.settle();
  await h.settle();
  assert.equal(h.fetches.length, 2);
  assert.equal(
    h.fetches[0].signal.aborted,
    true,
    'the Singapore history request was aborted',
  );
  assert.equal(h.fetches[1].signal.aborted, false);
  assert.equal(h.controller.getState().portid, 'port362');
  h.clear();
  assert.deepEqual(h.panel.calls.at(-1), ['close']);
  assert.equal(h.controller.getState().portid, null);
});

test('history is cached per port for thirty minutes and served stale after a failure', async () => {
  let now = NOW;
  let fail = false;
  const fetches = [];
  const windowRef = new EventTarget();
  const panel = fakePanel();
  const controller = installPortDossier({
    layer: { getDossierInputs: () => null },
    panel,
    index: { ports: [{ portid: 'port1201', name: 'Singapore' }] },
    loadDossier: async () => dossierFixture(),
    windowRef,
    fetchImpl: async (url) => {
      fetches.push(url);
      if (fail) throw new Error('boom');
      return { ok: true, json: async () => historyPayload() };
    },
    now: () => now,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await controller.openPort('port1201');
  await new Promise((resolve) => setTimeout(resolve, 0));
  let last = panel.calls.filter((call) => call[0] === 'render').at(-1);
  assert.equal(last[2].history, 'ready');
  assert.equal(
    last[2].flow,
    'unavailable',
    'no layer row yet reads as unavailable, not as an error',
  );
  controller.close();
  now += PORT_DOSSIER_HISTORY_CACHE_MS - 1000;
  await controller.openPort('port1201');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    fetches.length,
    1,
    'the cached page is reused inside the window',
  );
  controller.close();
  now += 2000;
  fail = true;
  await controller.openPort('port1201');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetches.length, 2);
  last = panel.calls.filter((call) => call[0] === 'render').at(-1);
  assert.equal(
    last[2].history,
    'partial',
    'a stale copy is shown as partial after a failed refresh',
  );
});

test('live hooks fill their sections and report failures as unavailable', async () => {
  const h = harness({
    live: {
      news: async () => ({
        status: 'ready',
        source: 'Google News RSS',
        retrievedAt: '2026-09-17T11:58:00Z',
        articles: [],
      }),
      weather: async () => {
        throw new Error('Open-Meteo HTTP 500');
      },
      cameras: async () => ({
        satellite: {
          date: '2026-09-16',
          layer: 'VIIRS',
          url: 'https://gibs.example/t.jpg',
          zoom: 9,
        },
      }),
    },
  });
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port1201' });
  await h.settle();
  await h.settle();
  const last = h.panel.calls.filter((call) => call[0] === 'render').at(-1);
  assert.equal(last[2].headlines, 'ready');
  assert.equal(last[2].weather, 'unavailable');
  assert.equal(last[2].camera, 'ready');
});

test("the panel's close button aborts without deselecting, and destroy detaches the listeners", async () => {
  const h = harness();
  let cleared = 0;
  h.windowRef.addEventListener('gev:entity-selection-cleared', () => {
    cleared += 1;
  });
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port1201' });
  await h.settle();
  h.panel.pressClose();
  assert.equal(cleared, 0, 'closing the panel never dispatches a deselect');
  assert.equal(h.controller.getState().portid, null);
  h.controller.destroy();
  assert.deepEqual(h.panel.calls.at(-1), ['destroy']);
  h.select({ layerId: 'commodity-ports', id: 'commodity-ports:port1201' });
  await h.settle();
  assert.ok(
    !h.panel.calls.slice(-1).some((call) => call[0] === 'open'),
    'a destroyed controller ignores selections',
  );
});
