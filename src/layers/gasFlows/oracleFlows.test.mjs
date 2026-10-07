import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FEEDGAS_PROVENANCE_LINE,
  FEEDGAS_SIGNAL_IDS,
  FEEDGAS_TERMINALS,
  ORACLE_FLOWS_URL,
  createFeedgasCardEntry,
  createOracleFlowsSource,
  feedgasAgeVerdict,
  feedgasCardLines,
  feedgasPinCss,
  normaliseFlows,
  resolveFeedgasTerminals,
} from './oracleFlows.js';
import {
  FEEDGAS_LATE_CSS,
  FEEDGAS_OK_CSS,
  FEEDGAS_STALE_CSS,
  NETWORK_COLOR_CSS,
} from './model.js';
import { GAS_FLOWS_LAYER_ID } from './records.js';
import { normalizeTerminals } from '../lng/records.js';
import { createSharedFetch } from '../../data/sharedFetch.js';
import { LIVE_REFRESH_LAYERS } from '../../hosting/liveRefresh.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');

/** 15 gas days ending 2026-10-05, `[gasDay, dth, bcfdApprox]`. */
function series(values, end = '2026-10-05') {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return values.map((bcfd, i) => {
    const gasDay = new Date(endMs - (values.length - 1 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return [gasDay, Math.round(bcfd * 1.038e6), bcfd];
  });
}

const SABINE = [
  1.4, 1.41, 1.42, 1.43, 1.44, 1.45, 1.46, 1.43, 1.44, 1.45, 1.44, 1.43, 1.44,
  1.45, 1.454,
];

function signal(id, values, extra = {}) {
  return {
    id,
    label: `${id} label`,
    observedAt: '2026-10-05',
    publishedAt: null,
    fetchedAt: '2026-10-06T15:21:00Z',
    freshness: { state: 'ok', ageHours: 62.8 },
    series: series(values),
    ...extra,
  };
}

/** The /api/oracle/flows payload shape (oracle tools/oracle_api.py `flows`). */
function payload(signals) {
  return {
    source: 'Oil Oracle store',
    dataset:
      'interstate pipeline postings (FERC 18 CFR 284.13), scheduled quantities',
    columns: ['gasDay', 'dth', 'bcfdApprox'],
    dthPerMcf: 1.038,
    signals,
  };
}

const ALL = () =>
  payload([
    signal('NG_FLOW_SABINE_FEEDGAS_CREOLE', SABINE, {
      label: 'Sabine Pass feedgas via Creole Trail',
    }),
    signal('NG_FLOW_HAYNESVILLE_GULF_RUN_REC', SABINE),
    signal('NG_FLOW_CORPUS_FEEDGAS_CCPL', SABINE),
    signal('NG_FLOW_APPALACHIA_ROVER_REC', SABINE),
    signal('NG_FLOW_GOLDEN_PASS_GULF_RUN', SABINE),
    signal('NG_FLOW_CAMERON_FEEDGAS_CIP', SABINE),
    signal('NG_FLOW_FREEPORT_FEEDGAS_GS', SABINE),
    signal('NG_FLOW_HAYNESVILLE_LEG_CIP_REC', SABINE),
  ]);

test('the route is the 15-day flows window and the five feedgas ids are mapped', () => {
  assert.equal(ORACLE_FLOWS_URL, '/api/oracle/flows?days=15');
  assert.deepEqual(FEEDGAS_SIGNAL_IDS, [
    'NG_FLOW_SABINE_FEEDGAS_CREOLE',
    'NG_FLOW_CORPUS_FEEDGAS_CCPL',
    'NG_FLOW_GOLDEN_PASS_GULF_RUN',
    'NG_FLOW_CAMERON_FEEDGAS_CIP',
    'NG_FLOW_FREEPORT_FEEDGAS_GS',
  ]);
});

test('normaliseFlows keeps only the five feedgas signals, in order', () => {
  const flows = normaliseFlows(ALL(), { now: NOW });
  assert.deepEqual(
    flows.map((reading) => reading.id),
    FEEDGAS_SIGNAL_IDS,
  );
  for (const receipt of [
    'NG_FLOW_HAYNESVILLE_GULF_RUN_REC',
    'NG_FLOW_APPALACHIA_ROVER_REC',
    'NG_FLOW_HAYNESVILLE_LEG_CIP_REC',
  ])
    assert.ok(!flows.some((reading) => reading.id === receipt));
  assert.ok(Object.isFrozen(flows));
});

test('newest, 7-day mean and 7-day change come from the series', () => {
  const [sabine] = normaliseFlows(ALL(), { now: NOW });
  assert.equal(sabine.label, 'Sabine Pass feedgas via Creole Trail');
  assert.equal(sabine.terminal, 'Sabine Pass');
  assert.equal(sabine.gemId, 'T100000130240');
  assert.equal(sabine.gasDay, '2026-10-05');
  assert.equal(sabine.bcfd, 1.454);
  const last7 = SABINE.slice(-7);
  assert.ok(
    Math.abs(sabine.avg7 - last7.reduce((s, v) => s + v, 0) / 7) < 1e-12,
  );
  // 2026-09-28 is index 7 of the 15-day window (1.43).
  assert.ok(Math.abs(sabine.chg7 - (1.454 - 1.43)) < 1e-12);
  assert.equal(sabine.state, 'ok');
  assert.equal(sabine.fetchedAt, '2026-10-06T15:21:00Z');
  assert.equal(sabine.observation.freshnessClass, 'published');
  assert.equal(sabine.observation.observedAt, '2026-10-05T00:00:00.000Z');
  assert.equal(sabine.observation.source, 'Oil Oracle store');
});

test('series order does not matter; the newest gas day wins', () => {
  const p = ALL();
  p.signals[0].series.reverse();
  const [sabine] = normaliseFlows(p, { now: NOW });
  assert.equal(sabine.gasDay, '2026-10-05');
  assert.equal(sabine.bcfd, 1.454);
});

test('a missing week-ago point or a short series leaves the change or mean null', () => {
  const p = payload([
    signal('NG_FLOW_SABINE_FEEDGAS_CREOLE', [1.4, 1.41, 1.42, 1.43]),
  ]);
  const [short] = normaliseFlows(p, { now: NOW });
  assert.equal(short.avg7, null, 'fewer than seven points is no 7-day mean');
  assert.equal(short.chg7, null);
  const gap = ALL();
  gap.signals[0].series = gap.signals[0].series.filter(
    ([d]) => d !== '2026-09-28',
  );
  assert.equal(normaliseFlows(gap, { now: NOW })[0].chg7, null);
});

test('bcfd falls back to dth over dthPerMcf when bcfdApprox is absent', () => {
  const p = payload([
    {
      ...signal('NG_FLOW_CAMERON_FEEDGAS_CIP', [1]),
      series: [['2026-10-05', 1509741, null]],
    },
  ]);
  const [cameron] = normaliseFlows(p, { now: NOW });
  assert.ok(Math.abs(cameron.bcfd - 1509741 / 1.038 / 1e6) < 1e-12);
});

test('malformed payloads and the route error body are rejected', () => {
  assert.equal(normaliseFlows(null), null);
  assert.equal(normaliseFlows('nope'), null);
  assert.equal(normaliseFlows({}), null);
  assert.equal(normaliseFlows({ signals: {} }), null);
  assert.equal(
    normaliseFlows({
      source: 'Oil Oracle store',
      signals: [],
      error: 'no table',
    }),
    null,
  );
  assert.equal(normaliseFlows(payload([{ label: 'no id' }])), null);
  assert.equal(normaliseFlows(payload([null])), null);
  // A feedgas signal with no usable point is dropped, not fatal.
  const empty = normaliseFlows(
    payload([
      {
        ...signal('NG_FLOW_SABINE_FEEDGAS_CREOLE', [1]),
        series: [['x', 1, 2]],
      },
    ]),
    { now: NOW },
  );
  assert.deepEqual(empty, []);
});

test("the route's freshness verdict wins over the age rule", () => {
  const stale = normaliseFlows(
    payload([
      signal('NG_FLOW_SABINE_FEEDGAS_CREOLE', SABINE, {
        freshness: { state: 'stale', ageHours: 10 },
      }),
    ]),
    { now: NOW },
  );
  assert.equal(stale[0].state, 'stale', 'fresh by age, stale by the route');
  const ok = normaliseFlows(
    payload([
      signal('NG_FLOW_SABINE_FEEDGAS_CREOLE', SABINE, {
        freshness: { state: 'ok' },
      }),
    ]),
    { now: Date.parse('2026-10-30T00:00:00Z') },
  );
  assert.equal(ok[0].state, 'ok', 'old by age, ok by the route');
  const none = normaliseFlows(
    payload([
      signal('NG_FLOW_SABINE_FEEDGAS_CREOLE', SABINE, {
        freshness: { state: 'none' },
      }),
    ]),
    { now: Date.parse('2026-10-15T00:00:00Z') },
  );
  assert.equal(none[0].state, 'stale', "'none' falls back to the age rule");
});

test('fallback tiers mirror the oracle daily tier: ok ≤ 3 d, late ≤ 6 d, stale beyond', () => {
  const at = (iso) => feedgasAgeVerdict('2026-10-05', Date.parse(iso));
  assert.equal(at('2026-10-05T12:00:00Z'), 'ok');
  assert.equal(at('2026-10-08T00:00:00Z'), 'ok');
  assert.equal(at('2026-10-08T01:00:00Z'), 'late');
  assert.equal(at('2026-10-11T00:00:00Z'), 'late');
  assert.equal(at('2026-10-11T01:00:00Z'), 'stale');
  const p = ALL();
  for (const s of p.signals) delete s.freshness;
  const flows = normaliseFlows(p, { now: Date.parse('2026-10-09T12:00:00Z') });
  assert.ok(flows.every((reading) => reading.state === 'late'));
});

test('pin colours: ok accent, late amber, stale the thin grey — all distinct', () => {
  assert.equal(feedgasPinCss('ok'), FEEDGAS_OK_CSS);
  assert.equal(feedgasPinCss('late'), FEEDGAS_LATE_CSS);
  assert.equal(feedgasPinCss('stale'), FEEDGAS_STALE_CSS);
  assert.equal(FEEDGAS_STALE_CSS, NETWORK_COLOR_CSS);
  assert.equal(
    new Set([FEEDGAS_OK_CSS, FEEDGAS_LATE_CSS, FEEDGAS_STALE_CSS]).size,
    3,
  );
});

test('the ok card states the number, its gas day, the week and the source', () => {
  const [sabine] = normaliseFlows(ALL(), { now: NOW });
  assert.deepEqual(feedgasCardLines(sabine), [
    'Sabine Pass feedgas via Creole Trail',
    'scheduled 1.45 Bcf/d on gas day 10-05',
    '7-day avg 1.44 · Δ7d +0.02 Bcf/d',
    'interstate pipeline postings — scheduled quantities (nominations, not meter readings)',
    'Oil Oracle store · fetched 10-06 15:21Z',
  ]);
  const entry = createFeedgasCardEntry(sabine, { x: 1 });
  assert.equal(entry.id, 'hover-feedgas:NG_FLOW_SABINE_FEEDGAS_CREOLE');
  assert.equal(entry.title, 'Sabine Pass feedgas via Creole Trail');
  assert.equal(entry.details.length, 4);
  assert.equal(entry.accent, FEEDGAS_OK_CSS);
  const pinned = createFeedgasCardEntry(sabine, { x: 1 }, { selected: true });
  assert.equal(pinned.id, 'selected-feedgas:NG_FLOW_SABINE_FEEDGAS_CREOLE');
  assert.equal(pinned.selected, true);
  assert.equal(createFeedgasCardEntry(sabine, null), null);
});

test('the late card says late; a missing change says n/a with units kept', () => {
  const late = {
    ...normaliseFlows(ALL(), { now: NOW })[0],
    state: 'late',
    chg7: -0.031,
  };
  const lines = feedgasCardLines(late);
  assert.equal(lines[1], 'scheduled 1.45 Bcf/d on gas day 10-05 · late');
  assert.equal(lines[2], '7-day avg 1.44 · Δ7d -0.03 Bcf/d');
  assert.equal(
    feedgasCardLines({ ...late, chg7: null })[2],
    '7-day avg 1.44 Bcf/d · Δ7d n/a',
  );
  assert.equal(createFeedgasCardEntry(late, { x: 1 }).accent, FEEDGAS_LATE_CSS);
});

test('a stale card shows no number, only the last gas day', () => {
  const p = payload([
    signal('NG_FLOW_FREEPORT_FEEDGAS_GS', [], {
      label: 'Freeport feedgas',
      freshness: undefined,
      series: series(SABINE.slice(0, 9), '2026-09-29'),
    }),
  ]);
  const stale = normaliseFlows(p, { now: NOW });
  assert.equal(stale[0].state, 'stale', '8 days old by the fallback rule');
  assert.equal(stale[0].gasDay, '2026-09-29');
  const lines = feedgasCardLines(stale[0]);
  assert.deepEqual(lines, [
    'Freeport feedgas',
    'stale — last gas day 09-29',
    FEEDGAS_PROVENANCE_LINE,
    'Oil Oracle store · fetched 10-06 15:21Z',
  ]);
  assert.ok(
    !lines.some((line) => /\d\.\d{2}/.test(line) || /Bcf/.test(line)),
    'no number on a stale pin',
  );
  assert.equal(
    createFeedgasCardEntry(stale[0], { x: 1 }).accent,
    FEEDGAS_STALE_CSS,
  );
});

test('every feedgas pin resolves to its terminal in the real row 10 LNG bundle', () => {
  const raw = JSON.parse(
    readFileSync(
      new URL('../../data/local_data/lng/terminals.json', import.meta.url),
      'utf8',
    ),
  );
  const crosswalk = JSON.parse(
    readFileSync(
      new URL('../../data/local_data/lng/crosswalk.json', import.meta.url),
      'utf8',
    ),
  );
  const pins = resolveFeedgasTerminals(normalizeTerminals(raw));
  assert.equal(pins.size, 5);
  for (const [signalId, { gemId, name }] of Object.entries(FEEDGAS_TERMINALS)) {
    const pin = pins.get(signalId);
    assert.ok(pin, `${signalId} resolves`);
    assert.equal(pin.gemId, gemId);
    const row = raw.terminals.find((t) => t.id === gemId);
    assert.equal(pin.lat, row.lat);
    assert.equal(pin.lon, row.lon);
    // Gulf Coast LNG: Texas and Louisiana.
    assert.ok(pin.lat > 27 && pin.lat < 31, `${name} latitude`);
    assert.ok(pin.lon > -98 && pin.lon < -93, `${name} longitude`);
    const cw = crosswalk.usExportTerminals.find((t) => t.gemId === gemId);
    assert.ok(cw, `${gemId} is in the crosswalk`);
    assert.equal(cw.name, name);
  }
  assert.equal(resolveFeedgasTerminals(null).size, 0);
});

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

test('an injected fetch gets a private, uncached reader', async () => {
  const calls = [];
  const source = createOracleFlowsSource({
    fetchImpl: async (url) => {
      calls.push(url);
      return okResponse(ALL());
    },
    now: () => NOW,
  });
  const flows = await source.getFlows();
  assert.equal(flows.length, 5);
  await source.getFlows();
  assert.deepEqual(calls, [ORACLE_FLOWS_URL, ORACLE_FLOWS_URL]);
});

test('with a shared memo the flows read is one request across readers', async () => {
  let requests = 0;
  const shared = createSharedFetch({
    fetchImpl: async () => {
      requests += 1;
      return okResponse(ALL());
    },
    now: () => NOW,
  });
  const a = createOracleFlowsSource({ shared, now: () => NOW });
  const b = createOracleFlowsSource({ shared, now: () => NOW });
  await Promise.all([a.getFlows(), b.getFlows()]);
  await a.getFlows();
  assert.equal(requests, 1);
});

test('HTTP errors, the error body and a malformed body throw', async () => {
  const of = (response) =>
    createOracleFlowsSource({ fetchImpl: async () => response });
  await assert.rejects(
    of({ ok: false, status: 404, json: async () => ({}) }).getFlows(),
    /Oil Oracle flows HTTP 404/,
  );
  await assert.rejects(
    of(okResponse({ signals: [], error: 'no flows table' })).getFlows(),
    /Oil Oracle flows: no flows table/,
  );
  await assert.rejects(
    of(okResponse({ nope: true })).getFlows(),
    /Malformed Oil Oracle flows/,
  );
});

test('the terminals bundle is read once through the same fetch', async () => {
  const raw = JSON.parse(
    readFileSync(
      new URL('../../data/local_data/lng/terminals.json', import.meta.url),
      'utf8',
    ),
  );
  const calls = [];
  const source = createOracleFlowsSource({
    fetchImpl: async (url) => {
      calls.push(url);
      return okResponse(raw);
    },
    terminalsUrl: 'terminals.json',
  });
  const pins = await source.getTerminals();
  await source.getTerminals();
  assert.equal(pins.size, 5);
  assert.deepEqual(calls, ['terminals.json']);
  await assert.rejects(
    createOracleFlowsSource({
      fetchImpl: async () => ({ ok: false, status: 404 }),
    }).getTerminals(),
    /LNG terminals HTTP 404/,
  );
});

test('a pipeline-flows store write refreshes this layer', () => {
  assert.ok(LIVE_REFRESH_LAYERS.ng_pipeline_flows.includes(GAS_FLOWS_LAYER_ID));
});
