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
export const ORACLE_BASINS_URL = '/api/oracle/basins';
/**
 * The oracle ingests observations and forecasts daily; older than this (a
 * laptop's stale mirror) and the line is dropped rather than shown as current.
 */
export const BASIN_WEATHER_MAX_AGE_DAYS = 5;

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
    out.set(
      name,
      Object.freeze({
        basin: name,
        observedAt: day(observed?.observedAt),
        tminF: finite(observed?.tminF),
        forecastInit: day(forecast?.publishedAt),
        frzdd14: finite(forecast?.frzdd14),
        model: typeof forecast?.model === 'string' ? forecast.model : null,
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

/**
 * Drop the halves that are too old to call current; null when nothing
 * current is left.
 */
export function currentBasinReading(
  reading,
  { now = Date.now(), maxAgeDays = BASIN_WEATHER_MAX_AGE_DAYS } = {},
) {
  if (!reading) return null;
  const observedOk =
    reading.observedAt &&
    reading.tminF !== null &&
    ageDays(reading.observedAt, now) <= maxAgeDays;
  const forecastOk =
    reading.forecastInit &&
    reading.frzdd14 !== null &&
    ageDays(reading.forecastInit, now) <= maxAgeDays;
  if (!observedOk && !forecastOk) return null;
  return Object.freeze({
    ...reading,
    observedAt: observedOk ? reading.observedAt : null,
    tminF: observedOk ? reading.tminF : null,
    forecastInit: forecastOk ? reading.forecastInit : null,
    frzdd14: forecastOk ? reading.frzdd14 : null,
  });
}

/**
 * `Bakken weather (Oil Oracle) · low 52°F on 09-20 · 14d freeze 0.0 °F·d,
 * AIFS 09-23` — descriptive, never a signal (R11).
 */
export function basinWeatherLine(reading) {
  if (!reading) return null;
  const parts = [`${reading.basin} weather (Oil Oracle)`];
  if (reading.tminF !== null && reading.observedAt)
    parts.push(
      `low ${Math.round(reading.tminF)}°F on ${reading.observedAt.slice(5)}`,
    );
  if (reading.frzdd14 !== null && reading.forecastInit)
    parts.push(
      `14d freeze ${reading.frzdd14.toFixed(1)} °F·d, ${reading.model === 'AIFS_ENS' ? 'AIFS' : (reading.model ?? 'fcst')} ${reading.forecastInit.slice(5)}`,
    );
  return parts.length > 1 ? parts.join(' · ') : null;
}

export function createOracleBasinWeatherSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = ORACLE_BASINS_URL,
} = {}) {
  return {
    label: 'Oil Oracle store',
    async getReadings({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(url, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok)
        throw new Error(`Oil Oracle basins HTTP ${response.status}`);
      const readings = normaliseBasinWeather(await response.json());
      signal?.throwIfAborted();
      if (!readings) throw new Error('Malformed Oil Oracle basins');
      return readings;
    },
  };
}
