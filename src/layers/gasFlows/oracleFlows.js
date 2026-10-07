/**
 * LNG feedgas pins for `commodity-gas-flows` (globe row 18 item 2, #71;
 * founder decision 2026-10-07, plan §10 R4.29 amendment).
 *
 * The first numbers this layer carries: the five LNG **feedgas** signals the
 * Oil Oracle store reads from interstate pipeline postings (FERC 18 CFR
 * 284.13), served by `GET /api/oracle/flows?days=15`. They are scheduled
 * quantities — nominations, not meter readings — and the card says so on
 * every pin. The three receipt signals stay on the supply board card and are
 * dropped here; the bundled network and the NACEI crossings still carry no
 * number.
 *
 * Coordinates come from the row 10 LNG bundle (`commodity-lng`'s
 * `terminals.json`, GEM ids as in `lng/crosswalk.json`), read through the LNG
 * layer's own URL and normaliser, never hardcoded here.
 *
 * Portable: no Cesium, no DOM. The card entry takes its position from the
 * caller.
 */
import {
  createSharedFetch,
  sharedOracleFetch,
} from '../../data/sharedFetch.js';
import { createObservation } from '../commodities/observation.js';
import { LNG_TERMINALS_URL } from '../lng/source.js';
import { normalizeTerminals } from '../lng/records.js';
import {
  FEEDGAS_LATE_CSS,
  FEEDGAS_OK_CSS,
  FEEDGAS_STALE_CSS,
} from './model.js';

export const ORACLE_FLOWS_URL = '/api/oracle/flows?days=15';

/** Feedgas signal id -> its LNG terminal (GEM id, `lng/crosswalk.json`). */
export const FEEDGAS_TERMINALS = Object.freeze({
  NG_FLOW_SABINE_FEEDGAS_CREOLE: Object.freeze({
    gemId: 'T100000130240',
    name: 'Sabine Pass',
  }),
  NG_FLOW_CORPUS_FEEDGAS_CCPL: Object.freeze({
    gemId: 'T100000130216',
    name: 'Corpus Christi',
  }),
  NG_FLOW_GOLDEN_PASS_GULF_RUN: Object.freeze({
    gemId: 'T100000130227',
    name: 'Golden Pass',
  }),
  NG_FLOW_CAMERON_FEEDGAS_CIP: Object.freeze({
    gemId: 'T100000130214',
    name: 'Cameron',
  }),
  NG_FLOW_FREEPORT_FEEDGAS_GS: Object.freeze({
    gemId: 'T100000130224',
    name: 'Freeport',
  }),
});

export const FEEDGAS_SIGNAL_IDS = Object.freeze(Object.keys(FEEDGAS_TERMINALS));

/**
 * The fallback age rule when the route sends no verdict, mirroring the
 * oracle's `daily` tier (tools/freshness.py, 72 h): within 3 gas days ok, up
 * to twice that late, beyond that stale.
 */
export const FEEDGAS_TOL_DAYS = 3;

/** The source line every card carries, verbatim. */
export const FEEDGAS_PROVENANCE_LINE =
  'interstate pipeline postings — scheduled quantities (nominations, not meter readings)';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function finite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function day(value) {
  const text = typeof value === 'string' ? value.slice(0, 10) : '';
  return DATE_RE.test(text) && Number.isFinite(Date.parse(text)) ? text : null;
}

function dayMs(isoDay) {
  return Date.parse(`${isoDay}T00:00:00Z`);
}

function shiftDay(isoDay, days) {
  return new Date(dayMs(isoDay) + days * DAY_MS).toISOString().slice(0, 10);
}

function routeState(signal) {
  const state = signal?.freshness?.state;
  return state === 'ok' || state === 'late' || state === 'stale' ? state : null;
}

/** ok | late | stale from the gas day alone (the fallback tier). */
export function feedgasAgeVerdict(gasDay, now = Date.now()) {
  const age = (now - dayMs(gasDay)) / DAY_MS;
  if (!Number.isFinite(age)) return 'stale';
  return age <= FEEDGAS_TOL_DAYS
    ? 'ok'
    : age <= 2 * FEEDGAS_TOL_DAYS
      ? 'late'
      : 'stale';
}

/** `[gasDay, bcfd]` points, oldest first, one per gas day. */
function seriesPoints(series, { gasDayAt, bcfdAt, dthAt, dthPerMcf }) {
  const byDay = new Map();
  for (const row of Array.isArray(series) ? series : []) {
    if (!Array.isArray(row)) continue;
    const gasDay = day(row[gasDayAt]);
    if (!gasDay) continue;
    let bcfd = bcfdAt >= 0 ? finite(row[bcfdAt]) : null;
    if (bcfd === null && dthAt >= 0 && dthPerMcf) {
      const dth = finite(row[dthAt]);
      if (dth !== null) bcfd = dth / dthPerMcf / 1e6;
    }
    if (bcfd === null) continue;
    byDay.set(gasDay, bcfd);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * The route payload as the five feedgas readings, in `FEEDGAS_SIGNAL_IDS`
 * order. Receipts and unknown ids are dropped; a feedgas signal with no
 * usable point is dropped. Null when the payload is malformed (no `signals`
 * array, a signal without an id) or carries the route's `error`.
 *
 * Per reading: the newest gas day and its Bcf/d, the mean of the last seven
 * points (`avg7`, null with fewer than seven), the change against the point
 * exactly seven gas days earlier (`chg7`, null when that day is missing), and
 * the verdict — the route's `freshness.state` when it sends ok|late|stale,
 * else the `daily`-tier age rule on the gas day.
 */
export function normaliseFlows(payload, { now = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || payload.error) return null;
  if (!Array.isArray(payload.signals)) return null;
  const columns = Array.isArray(payload.columns)
    ? payload.columns
    : ['gasDay', 'dth', 'bcfdApprox'];
  const layout = {
    gasDayAt: Math.max(0, columns.indexOf('gasDay')),
    bcfdAt: columns.indexOf('bcfdApprox'),
    dthAt: columns.indexOf('dth'),
    dthPerMcf: finite(payload.dthPerMcf),
  };
  const byId = new Map();
  for (const signal of payload.signals) {
    const id = typeof signal?.id === 'string' ? signal.id.trim() : '';
    if (!id) return null;
    if (!FEEDGAS_TERMINALS[id]) continue;
    const points = seriesPoints(signal.series, layout);
    if (!points.length) continue;
    const [gasDay, bcfd] = points.at(-1);
    const last7 = points.slice(-7);
    const avg7 =
      last7.length === 7
        ? last7.reduce((sum, [, value]) => sum + value, 0) / 7
        : null;
    const weekAgo = points.find(([d]) => d === shiftDay(gasDay, -7));
    const chg7 = weekAgo ? bcfd - weekAgo[1] : null;
    const fetchedAt =
      typeof signal.fetchedAt === 'string' &&
      Number.isFinite(Date.parse(signal.fetchedAt))
        ? signal.fetchedAt
        : null;
    const label =
      typeof signal.label === 'string' && signal.label.trim()
        ? signal.label.trim()
        : `${FEEDGAS_TERMINALS[id].name} feedgas`;
    let observation = null;
    try {
      observation = createObservation({
        observedAt: `${gasDay}T00:00:00Z`,
        publishedAt: day(signal.publishedAt)
          ? `${day(signal.publishedAt)}T00:00:00Z`
          : null,
        fetchedAt: fetchedAt ?? now,
        // Scheduled daily postings, read from the store: never LIVE.
        freshnessClass: 'published',
        source: 'Oil Oracle store',
        headline: label,
      });
    } catch {
      observation = null;
    }
    byId.set(
      id,
      Object.freeze({
        id,
        label,
        terminal: FEEDGAS_TERMINALS[id].name,
        gemId: FEEDGAS_TERMINALS[id].gemId,
        gasDay,
        bcfd,
        avg7,
        chg7,
        state: routeState(signal) ?? feedgasAgeVerdict(gasDay, now),
        fetchedAt,
        observation,
      }),
    );
  }
  return Object.freeze(
    FEEDGAS_SIGNAL_IDS.map((id) => byId.get(id)).filter(Boolean),
  );
}

/**
 * Signal id -> `{ signalId, gemId, name, lat, lon }` from the normalised LNG
 * terminals bundle. A terminal the bundle lacks is simply not pinned.
 */
export function resolveFeedgasTerminals(terminals) {
  const rows = new Map((terminals?.rows ?? []).map((row) => [row.id, row]));
  const out = new Map();
  for (const [signalId, { gemId, name }] of Object.entries(FEEDGAS_TERMINALS)) {
    const row = rows.get(gemId);
    if (!row) continue;
    out.set(
      signalId,
      Object.freeze({ signalId, gemId, name, lat: row.lat, lon: row.lon }),
    );
  }
  return out;
}

/** Pin colour by verdict: accent ok, amber late, the shared `thin` grey stale. */
export function feedgasPinCss(state) {
  if (state === 'ok') return FEEDGAS_OK_CSS;
  if (state === 'late') return FEEDGAS_LATE_CSS;
  return FEEDGAS_STALE_CSS;
}

const two = (value) => value.toFixed(2);

function signed(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded < 0 ? '-' : '+'}${Math.abs(rounded).toFixed(2)}`;
}

function fetchedLabel(fetchedAt) {
  const ms = Date.parse(fetchedAt ?? '');
  if (!Number.isFinite(ms)) return 'fetched n/a';
  const iso = new Date(ms).toISOString();
  return `fetched ${iso.slice(5, 10)} ${iso.slice(11, 16)}Z`;
}

/**
 * The card, label first. A stale reading shows no number — it names its last
 * gas day instead. Units are on every number line.
 */
export function feedgasCardLines(reading) {
  if (!reading) return [];
  const lines = [reading.label];
  const gasDay = reading.gasDay.slice(5);
  if (reading.state === 'stale') {
    lines.push(`stale — last gas day ${gasDay}`);
  } else {
    lines.push(
      `scheduled ${two(reading.bcfd)} Bcf/d on gas day ${gasDay}${reading.state === 'late' ? ' · late' : ''}`,
    );
    const avg = reading.avg7 === null ? 'n/a' : two(reading.avg7);
    lines.push(
      reading.chg7 === null
        ? `7-day avg ${avg} Bcf/d · Δ7d n/a`
        : `7-day avg ${avg} · Δ7d ${signed(reading.chg7)} Bcf/d`,
    );
  }
  lines.push(FEEDGAS_PROVENANCE_LINE);
  lines.push(`Oil Oracle store · ${fetchedLabel(reading.fetchedAt)}`);
  return lines;
}

/** The hover (or, `selected`, the pinned click) card for one feedgas pin. */
export function createFeedgasCardEntry(
  reading,
  position,
  { selected = false } = {},
) {
  if (!reading || !position) return null;
  const [title, ...details] = feedgasCardLines(reading);
  return {
    id: `${selected ? 'selected' : 'hover'}-feedgas:${reading.id}`,
    position,
    accent: feedgasPinCss(reading.state),
    title,
    details,
    selected,
    priority: Number.MAX_SAFE_INTEGER - (selected ? 0 : 1),
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
  };
}

/**
 * The route reader and the terminal lookup. With the default fetch the route
 * reads through `sharedOracleFetch` (one request per refresh tick across
 * layers, FR-D29); an injected `fetchImpl` gets a private, uncached reader
 * unless `shared` is passed too. The terminals bundle is a static asset, read
 * once and kept.
 */
export function createOracleFlowsSource({
  fetchImpl,
  url = ORACLE_FLOWS_URL,
  terminalsUrl = LNG_TERMINALS_URL,
  shared = fetchImpl
    ? createSharedFetch({ fetchImpl, ttlMs: 0 })
    : sharedOracleFetch,
  now = () => Date.now(),
} = {}) {
  const readAsset = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  let _terminals = null;
  return {
    label: 'Oil Oracle store',
    async getFlows({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await shared.getJson(url, { signal });
      if (!response.ok)
        throw new Error(`Oil Oracle flows HTTP ${response.status}`);
      if (response.body?.error)
        throw new Error(`Oil Oracle flows: ${response.body.error}`);
      const flows = normaliseFlows(response.body, { now: now() });
      signal?.throwIfAborted();
      if (!flows) throw new Error('Malformed Oil Oracle flows');
      return flows;
    },
    async getTerminals({ signal } = {}) {
      if (_terminals) return _terminals;
      signal?.throwIfAborted();
      const response = await readAsset(terminalsUrl, { signal });
      if (!response.ok)
        throw new Error(`LNG terminals HTTP ${response.status}`);
      const terminals = normalizeTerminals(await response.json());
      signal?.throwIfAborted();
      if (!terminals) throw new Error('Malformed LNG terminals');
      _terminals = resolveFeedgasTerminals(terminals);
      return _terminals;
    },
  };
}
