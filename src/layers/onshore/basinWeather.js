/**
 * Basin weather from the Oil Oracle store for the onshore region card
 * (row 13 M3, docs/COMMODITIES-PLAN.md §15 R13.14). The hosted site proxies
 * `/api/oracle/*` to the oracle console, whose `basins` route serves the six
 * supply basins' observed daily minimum and the AIFS ensemble's 14-day
 * freeze forecast — the same numbers the console's weather page shows, so
 * the card and the console agree (G13.5). Optional by design: with no
 * console, an older console without the route, or a stale store, the card
 * simply has no weather line. Portable: no Cesium, no DOM.
 */
import {
  createSharedFetch,
  sharedOracleFetch,
} from '../../data/sharedFetch.js';

export const ORACLE_BASINS_URL = '/api/oracle/basins';
/**
 * Globe row 18 (oracle DATA-MAP P3.4): how old each half may be, mirroring the
 * oracle's one staleness rule (tools/freshness.py: `daily` 72 h for observed
 * TMIN, `init` 48 h for a model run). Within the limit a reading is ok, up to
 * twice it late, beyond that stale. The route's own `freshness.state` wins
 * when it sends one; these cover an older payload.
 */
export const OBSERVED_TOL_DAYS = 3;
export const FORECAST_TOL_DAYS = 2;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function finite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function day(value) {
  const text = typeof value === 'string' ? value.slice(0, 10) : '';
  return DATE_RE.test(text) ? text : null;
}

/**
 * The route payload as a Map of basin name to its reading. A basin without
 * an observation or a forecast keeps whichever half it has; a payload
 * without a `basins` array is rejected.
 */
export function normaliseBasinWeather(payload) {
  if (!Array.isArray(payload?.basins)) return null;
  const out = new Map();
  for (const basin of payload.basins) {
    const name = typeof basin?.region === 'string' ? basin.region.trim() : '';
    if (!name) return null;
    const observed = basin.observed ?? null;
    const forecast = basin.forecast ?? null;
    const st = (half) => {
      const v = half?.freshness?.state;
      return v === 'ok' || v === 'late' || v === 'stale' ? v : null;
    };
    out.set(
      name,
      Object.freeze({
        basin: name,
        observedAt: day(observed?.observedAt),
        tminF: finite(observed?.tminF),
        forecastInit: day(forecast?.publishedAt),
        frzdd14: finite(forecast?.frzdd14),
        model: typeof forecast?.model === 'string' ? forecast.model : null,
        observedState: st(observed),
        forecastState: st(forecast),
      }),
    );
  }
  return out;
}

/** The first of a region's basins the store has a reading for. */
export function pickBasinReading(readings, basins) {
  if (!readings) return null;
  for (const name of basins ?? []) {
    const reading = readings.get(name);
    if (reading) return reading;
  }
  return null;
}

function ageDays(isoDay, now) {
  return (now - Date.parse(`${isoDay}T00:00:00Z`)) / 86_400_000;
}

function verdict(state, isoDay, tolDays, now) {
  if (state) return state;
  const age = ageDays(isoDay, now);
  return age <= tolDays ? 'ok' : age <= 2 * tolDays ? 'late' : 'stale';
}

/**
 * Each half with its verdict and age. A stale half keeps its date but not its
 * value, so the line can NAME it (TMIN lags: the ACIS fill runs nightly)
 * instead of dropping it silently; null only when neither half exists.
 */
export function currentBasinReading(reading, { now = Date.now() } = {}) {
  if (!reading) return null;
  const hasObs = Boolean(reading.observedAt && reading.tminF !== null);
  const hasFc = Boolean(reading.forecastInit && reading.frzdd14 !== null);
  if (!hasObs && !hasFc) return null;
  const obsState = hasObs
    ? verdict(reading.observedState, reading.observedAt, OBSERVED_TOL_DAYS, now)
    : null;
  const fcState = hasFc
    ? verdict(
        reading.forecastState,
        reading.forecastInit,
        FORECAST_TOL_DAYS,
        now,
      )
    : null;
  return Object.freeze({
    ...reading,
    observedAt: hasObs ? reading.observedAt : null,
    observedAgeDays: hasObs
      ? Math.max(0, Math.floor(ageDays(reading.observedAt, now)))
      : null,
    observedState: obsState,
    tminF: obsState && obsState !== 'stale' ? reading.tminF : null,
    forecastInit: hasFc ? reading.forecastInit : null,
    forecastState: fcState,
    frzdd14: fcState && fcState !== 'stale' ? reading.frzdd14 : null,
  });
}

/**
 * `Bakken weather (Oil Oracle) · low 52°F on 09-20 (1 d ago) · 14d freeze
 * 0.0 °F·d, AIFS 09-23`; a late half says `late`, a stale one is named
 * (`low: stale, last 09-12 (9 d ago)`) — descriptive, never a signal (R11).
 */
export function basinWeatherLine(reading) {
  if (!reading) return null;
  const parts = [`${reading.basin} weather (Oil Oracle)`];
  if (reading.observedAt) {
    // globe row 18: the low says how old it is, and a stale one is named
    const age = reading.observedAgeDays;
    const ago = age == null ? null : age < 1 ? 'today' : `${age} d ago`;
    const day = reading.observedAt.slice(5);
    if (reading.observedState === 'stale')
      parts.push(`low: stale, last ${day}${ago ? ` (${ago})` : ''}`);
    else if (reading.tminF !== null) {
      const note = [ago, reading.observedState === 'late' ? 'late' : null]
        .filter(Boolean)
        .join(', ');
      parts.push(
        `low ${Math.round(reading.tminF)}°F on ${day}${note ? ` (${note})` : ''}`,
      );
    }
  }
  if (reading.forecastInit) {
    const model =
      reading.model === 'AIFS_ENS' ? 'AIFS' : (reading.model ?? 'fcst');
    const init = reading.forecastInit.slice(5);
    if (reading.forecastState === 'stale')
      parts.push(`14d freeze: stale, ${model} ${init}`);
    else if (reading.frzdd14 !== null)
      parts.push(
        `14d freeze ${reading.frzdd14.toFixed(1)} °F·d, ${model} ${init}${reading.forecastState === 'late' ? ' (late)' : ''}`,
      );
  }
  return parts.length > 1 ? parts.join(' · ') : null;
}

/**
 * The five onshore layers each own one of these; with the default fetch they
 * all read through `sharedOracleFetch`, so a refresh tick costs one request
 * (FR-D29). An injected `fetchImpl` gets a private, uncached reader unless
 * `shared` is passed too, so tests never see another source's body.
 */
export function createOracleBasinWeatherSource({
  fetchImpl,
  url = ORACLE_BASINS_URL,
  shared = fetchImpl
    ? createSharedFetch({ fetchImpl, ttlMs: 0 })
    : sharedOracleFetch,
} = {}) {
  return {
    label: 'Oil Oracle store',
    async getReadings({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await shared.getJson(url, { signal });
      if (!response.ok)
        throw new Error(`Oil Oracle basins HTTP ${response.status}`);
      const readings = normaliseBasinWeather(response.body);
      signal?.throwIfAborted();
      if (!readings) throw new Error('Malformed Oil Oracle basins');
      return readings;
    },
  };
}
