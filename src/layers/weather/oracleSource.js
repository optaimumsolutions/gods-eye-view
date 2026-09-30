/**
 * The basin forecast from the Oil Oracle store (row 3, hosted path; plan
 * §11.13). The oracle reads ECMWF's AIFS ENS open data (CC BY 4.0) every
 * night with eccodes at the same basins and demand regions this layer's
 * gazetteer mirrors, and keeps ensemble stats per lead in `weather_forecast`.
 * The hosted site proxies `/api/oracle/weather-forecast` to the console, so
 * the globe draws the oracle's own numbers without Open-Meteo's
 * non-commercial free API (H6: store numbers on the globe, labelled as the
 * oracle's). On the laptop this source is tried first and Open-Meteo is the
 * fallback (`createPreferredWeatherSource`).
 *
 * What the store has: TMIN + FRZDD at the six basins, HDD + CDD at the
 * demand regions; no Gulf points, no wind, precipitation or TMAX, and the
 * ensemble mean stands in for p50. Missing readings are null and the cards
 * print `n/a`; the Gulf markers wait for an oracle sample (open, §11.13).
 *
 * Portable by rule: no Cesium, no DOM, no browser globals.
 */
import { createObservation } from '../commodities/observation.js';
import {
  DEFAULT_MODEL,
  MODEL_LABELS,
  anomalyBand,
  confidenceFor,
  dayOfYear,
} from './records.js';
import { loadWeatherBundles } from './source.js';

export const ORACLE_WEATHER_URL = '/api/oracle/weather-forecast';
export const ORACLE_WEATHER_SOURCE_LABEL =
  'ECMWF AIFS ENS (open data) via Oil Oracle store';
/** The oracle's model key for each Open-Meteo id this layer knows. */
export const ORACLE_MODEL_KEYS = Object.freeze({
  ecmwf_aifs025_ensemble: 'AIFS_ENS',
  ncep_gefs025: 'GEFS',
  ncep_aigefs025: 'GEFS',
});
/** Gazetteer id → the oracle's region name (its yaml keys). */
export const ORACLE_REGION_NAMES = Object.freeze({
  appalachia: 'Appalachia',
  permian: 'Permian',
  haynesville: 'Haynesville',
  anadarko: 'Anadarko',
  eagleford: 'EagleFord',
  bakken: 'Bakken',
  southcentral: 'SouthCentral',
  texas: 'Texas',
});
/** A run older than this (a laptop's stale mirror) loses to live Open-Meteo. */
export const ORACLE_MAX_LAG_DAYS = 3;

function finite(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function statsOf(row) {
  if (!row) return { p10: null, p50: null, p90: null, spread: null, n: 0 };
  const p10 = finite(row.p10);
  const p90 = finite(row.p90);
  return {
    p10,
    p50: finite(row.mean),
    p90,
    spread: p10 == null || p90 == null ? null : Number((p90 - p10).toFixed(2)),
    n: finite(row.n) || 0,
  };
}

const EMPTY = Object.freeze({
  p10: null,
  p50: null,
  p90: null,
  spread: null,
  n: 0,
});

/**
 * One gazetteer entry's day rows from the route's series lists. Basins
 * carry TMIN (anomaly against the ERA5 TMIN normal); regions carry HDD/CDD,
 * from which a mean-temperature anomaly is derived (mean T = 65 − HDD + CDD
 * for the ensemble mean, against the ERA5 (TMIN+TMAX)/2 normal) — printed
 * as such on the card.
 */
export function buildOracleEntryDays(entry, series, { normals, initDate }) {
  const normal = normals?.entries?.[entry.id] || null;
  const byValid = new Map();
  for (const [sid, rows] of Object.entries(series || {}))
    for (const r of rows) {
      if (!byValid.has(r.validAt)) byValid.set(r.validAt, {});
      byValid.get(r.validAt)[sid] = r;
    }
  const init = Date.parse(`${initDate}T00:00:00Z`);
  const days = [...byValid.keys()].sort().map((validAt) => {
    const s = byValid.get(validAt);
    const lead = Math.round(
      (Date.parse(`${validAt}T00:00:00Z`) - init) / 86_400_000,
    );
    const tmin = statsOf(s.TMIN);
    const hdd = statsOf(s.HDD);
    const cdd = statsOf(s.CDD);
    const doy = dayOfYear(validAt);
    const normalTmin = normal ? normal.tmin[doy - 1] : null;
    let anomalyF = null;
    let anomalyOf = null;
    if (tmin.p50 != null && normalTmin != null) {
      anomalyF = Number((tmin.p50 - normalTmin).toFixed(1));
      anomalyOf = 'TMIN';
    } else if ((hdd.p50 != null || cdd.p50 != null) && normal) {
      const meanT = 65 - (hdd.p50 ?? 0) + (cdd.p50 ?? 0);
      const normalMean = (normal.tmin[doy - 1] + normal.tmax[doy - 1]) / 2;
      anomalyF = Number((meanT - normalMean).toFixed(1));
      anomalyOf = 'mean (from degree days)';
    }
    const frz = s.FRZDD ? finite(s.FRZDD.mean) : null;
    return {
      date: validAt,
      lead,
      tmin,
      tmax: EMPTY,
      hdd,
      cdd,
      wind: EMPTY,
      precip: EMPTY,
      snow: EMPTY,
      frzddMean: frz,
      freezeShare: null,
      normalTmin,
      anomalyF,
      anomalyOf,
      band: anomalyBand(anomalyF),
    };
  });
  const freezeDays =
    entry.kind === 'basin'
      ? days.filter((d) => d.tmin.p10 != null && d.tmin.p10 < entry.freezeF)
          .length
      : null;
  const freezeDaysP50 =
    entry.kind === 'basin'
      ? days.filter((d) => d.tmin.p50 != null && d.tmin.p50 < entry.freezeF)
          .length
      : null;
  const has = (key) => days.some((d) => d[key].p50 != null);
  const sum = (key, count) =>
    has(key)
      ? Number(
          days
            .slice(0, count)
            .reduce((a, d) => a + (d[key].p50 ?? 0), 0)
            .toFixed(1),
        )
      : null;
  return {
    days,
    window: {
      freezeDays,
      freezeDaysP50,
      heatingDays: has('hdd') ? days.filter((d) => d.hdd.p50 > 0).length : null,
      hdd7: sum('hdd', 7),
      hdd14: sum('hdd', 14),
      cdd7: sum('cdd', 7),
      cdd14: sum('cdd', 14),
      galeDays: null,
    },
  };
}

/** The route payload → the layer's snapshot shape; null when malformed. */
export function buildOracleWeatherSnapshot(
  payload,
  { entries, normals, skill, model = DEFAULT_MODEL, fetchedAt = Date.now() },
) {
  if (!payload?.initDate || typeof payload.entries !== 'object') return null;
  const meta = {
    initialisedAt: new Date(
      Date.parse(payload.observedAt || `${payload.initDate}T00:00:00Z`),
    ).toISOString(),
    availableAt: new Date(
      Date.parse(
        payload.fetchedAt ||
          payload.publishedAt ||
          `${payload.initDate}T00:00:00Z`,
      ),
    ).toISOString(),
    updateIntervalS: 86_400,
  };
  const rows = [];
  for (const entry of entries) {
    const region = ORACLE_REGION_NAMES[entry.id];
    const series = region ? payload.entries[region] : null;
    if (!series) continue;
    const readings = buildOracleEntryDays(entry, series, {
      normals,
      initDate: payload.initDate,
    });
    const spreadSample = readings.days.map(
      (d) => d.tmin.spread ?? d.hdd.spread,
    );
    const days = readings.days.map((day) => ({
      ...day,
      confidence: confidenceFor({
        skill,
        model,
        lead: day.lead,
        spread: day.tmin.spread ?? day.hdd.spread,
        spreadSample,
      }),
      observation: createObservation({
        observedAt: meta.initialisedAt,
        publishedAt: meta.availableAt,
        validAt: `${day.date}T00:00:00Z`,
        fetchedAt,
        freshnessClass: 'daily',
        source: ORACLE_WEATHER_SOURCE_LABEL,
      }),
    }));
    rows.push({
      ...entry,
      model,
      source: ORACLE_WEATHER_SOURCE_LABEL,
      members: days[0]?.tmin.n || days[0]?.hdd.n || 0,
      memberCounts: {},
      days,
      window: readings.window,
    });
  }
  return {
    rows,
    model,
    meta,
    fetchedAt: new Date(fetchedAt).toISOString(),
    source: ORACLE_WEATHER_SOURCE_LABEL,
    errors: {},
  };
}

export function createOracleWeatherSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  model = DEFAULT_MODEL,
  url = ORACLE_WEATHER_URL,
  urls = {},
  maxLagDays = ORACLE_MAX_LAG_DAYS,
} = {}) {
  const oracleModel = ORACLE_MODEL_KEYS[model];
  let _bundles = null;
  let _run = null;
  let _requests = 0;
  return {
    label: ORACLE_WEATHER_SOURCE_LABEL,
    model,
    async getSnapshot({ signal } = {}) {
      if (!oracleModel) throw new Error(`Oil Oracle store has no ${model}`);
      if (!_bundles)
        _bundles = await loadWeatherBundles({ fetchImpl, urls, signal });
      signal?.throwIfAborted();
      _requests += 1;
      const response = await fetchImpl(`${url}?model=${oracleModel}`, {
        signal,
      });
      if (!response.ok)
        throw new Error(`Oil Oracle weather-forecast HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      if (payload?.error)
        throw new Error(`Oil Oracle weather-forecast: ${payload.error}`);
      if (!payload?.initDate)
        throw new Error('Oil Oracle weather-forecast: no run in the store');
      const lagDays =
        (now() - Date.parse(`${payload.initDate}T00:00:00Z`)) / 86_400_000;
      if (!(lagDays <= maxLagDays))
        throw new Error(
          `Oil Oracle weather-forecast stale: newest run ${payload.initDate}`,
        );
      if (_run && _run.initDate === payload.initDate) return _run.snapshot;
      const snapshot = buildOracleWeatherSnapshot(payload, {
        ..._bundles,
        model,
        fetchedAt: now(),
      });
      if (!snapshot)
        throw new Error('Malformed Oil Oracle weather-forecast response');
      _run = { initDate: payload.initDate, snapshot };
      return snapshot;
    },
    getStats() {
      return {
        requests: _requests,
        run: _run ? { initDate: _run.initDate } : null,
      };
    },
  };
}

/**
 * Try the oracle first, then Open-Meteo; the snapshot names whichever
 * answered. An abort is never swallowed into the fallback.
 */
export function createPreferredWeatherSource({
  primary,
  fallback,
  onFallback = (error) =>
    console.info(
      `[Data:Weather] Oil Oracle route unavailable, using Open-Meteo: ${error.message}`,
    ),
}) {
  let warned = false;
  return {
    label: fallback.label,
    model: fallback.model,
    async getSnapshot(options = {}) {
      try {
        return await primary.getSnapshot(options);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (!warned) {
          warned = true;
          onFallback(error);
        }
      }
      return fallback.getSnapshot(options);
    },
  };
}
