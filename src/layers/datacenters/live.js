/**
 * Live readings that sit alongside the bundled Epoch AI facts
 * (docs/COMMODITIES-PLAN.md §8): the grid each campus draws from, and the
 * weather it has to reject heat into. Both sources are keyless and send
 * permissive CORS headers, so the layer reads them browser-direct with no
 * proxy, exactly as the chokepoints and ports layers read PortWatch.
 *
 * Portable by rule: no Cesium, no DOM, no browser globals. Every reading is
 * stamped through the row-1 observation contract
 * (`src/layers/commodities/observation.js`), so a card can show a published
 * estimate, a daily grid figure and a live temperature side by side and each
 * says how old it is.
 *
 * Nothing here is metered at the building. Grid demand is the balancing
 * authority's whole load; the site's share of it is arithmetic we show as
 * arithmetic (R11, descriptive never signals).
 */
import { createObservation } from '../commodities/observation.js';

export const EIA_930_SERIES_URL =
  'https://www.eia.gov/electricity/930-api/region_data/series_data';
export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** The six EIA balancing authorities the bundled campuses sit in. */
export const BALANCING_AUTHORITIES = Object.freeze({
  ERCO: 'ERCOT',
  MISO: 'MISO',
  PJM: 'PJM',
  SOCO: 'Southern Company',
  SWPP: 'Southwest Power Pool',
  TVA: 'Tennessee Valley Authority',
});

function pad(n) {
  return String(n).padStart(2, '0');
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** EIA wants `MMDDYYYY HH24:MI:SS`; anything else is a 500. */
export function eiaTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new TypeError('invalid EIA timestamp');
  return `${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${d.getUTCFullYear()} ${pad(d.getUTCHours())}:00:00`;
}

/** `MM/DD/YYYY HH:MM:SS` in UTC, as the series rows report it. */
export function parseEiaDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    String(text ?? '').trim(),
  );
  if (!m) return null;
  const ms = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Hourly demand (`D`) and day-ahead demand forecast (`DF`) for the given
 * balancing authorities. One request covers every authority, so fifteen
 * campuses cost one call, not fifteen.
 *
 * The window runs forward as well as back: `DF` only has points ahead of now,
 * so an end of `now` returns demand but never a forecast.
 */
export function eiaGridUrl(
  respondents,
  { now = Date.now(), hours = 48, aheadHours = 24 } = {},
) {
  const ids = [...new Set(respondents)].filter(Boolean).sort();
  if (!ids.length) return null;
  const end = new Date(now + aheadHours * 3_600_000);
  const start = new Date(now - hours * 3_600_000);
  const params = new URLSearchParams();
  params.append('type[]', 'D');
  params.append('type[]', 'DF');
  for (const id of ids) params.append('respondent[]', id);
  params.append('start', eiaTimestamp(start));
  params.append('end', eiaTimestamp(end));
  return `${EIA_930_SERIES_URL}?${params}`;
}

function latestPoint(values) {
  const dates = Array.isArray(values?.DATES) ? values.DATES : [];
  const data = Array.isArray(values?.DATA) ? values.DATA : [];
  for (let i = Math.min(dates.length, data.length) - 1; i >= 0; i -= 1) {
    const mw = num(data[i]);
    const at = parseEiaDate(dates[i]);
    if (mw !== null && at !== null) return { mw, at };
  }
  return null;
}

/** Furthest-ahead forecast point, which is what `validAt` on the stamp means. */
function furthestForecast(values, now) {
  const dates = Array.isArray(values?.DATES) ? values.DATES : [];
  const data = Array.isArray(values?.DATA) ? values.DATA : [];
  let best = null;
  for (let i = 0; i < Math.min(dates.length, data.length); i += 1) {
    const mw = num(data[i]);
    const at = parseEiaDate(dates[i]);
    if (mw === null || at === null || at <= now) continue;
    if (!best || at > best.at) best = { mw, at };
  }
  return best;
}

/**
 * Series payload → one reading per balancing authority. Demand is the newest
 * reported hour; the forecast is the furthest-ahead day-ahead hour, carried as
 * an observation with `validAt` so it stamps as `issued … · valid …`.
 */
export function normalizeGridDemand(payload, { fetchedAt = Date.now() } = {}) {
  const series = Array.isArray(payload) ? payload : [];
  const byId = new Map();
  for (const block of series) {
    for (const row of Array.isArray(block?.data) ? block.data : []) {
      const id =
        typeof row?.RESPONDENT_ID === 'string' ? row.RESPONDENT_ID : null;
      if (!id) continue;
      const entry = byId.get(id) ?? {
        id,
        name: BALANCING_AUTHORITIES[id] ?? row.RESPONDENT_NAME ?? id,
        demandMw: null,
        observedAt: null,
        forecastMw: null,
        forecastValidAt: null,
        observation: null,
        forecastObservation: null,
      };
      if (row.TYPE_ID === 'D') {
        const point = latestPoint(row.VALUES);
        if (point) {
          entry.demandMw = point.mw;
          entry.observedAt = new Date(point.at).toISOString();
          entry.observation = createObservation({
            observedAt: point.at,
            fetchedAt,
            source: 'EIA Hourly Electric Grid Monitor',
            headline: `${entry.name} demand ${Math.round(point.mw).toLocaleString('en-US')} MW`,
          });
        }
      } else if (row.TYPE_ID === 'DF') {
        const point = furthestForecast(row.VALUES, fetchedAt);
        if (point) {
          entry.forecastMw = point.mw;
          entry.forecastValidAt = new Date(point.at).toISOString();
          entry.forecastObservation = createObservation({
            observedAt: fetchedAt,
            validAt: point.at,
            fetchedAt,
            freshnessClass: 'daily',
            source: 'EIA Hourly Electric Grid Monitor',
            headline: `${entry.name} day-ahead ${Math.round(point.mw).toLocaleString('en-US')} MW`,
          });
        }
      }
      byId.set(id, entry);
    }
  }
  for (const entry of byId.values()) Object.freeze(entry);
  return byId;
}

/** One batched request for every campus: latitudes and longitudes in order. */
export function openMeteoUrl(sites) {
  const rows = (Array.isArray(sites) ? sites : []).filter(
    (s) => num(s?.lat) !== null && num(s?.lon) !== null,
  );
  if (!rows.length) return null;
  const params = new URLSearchParams({
    latitude: rows.map((s) => s.lat).join(','),
    longitude: rows.map((s) => s.lon).join(','),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
  });
  return `${OPEN_METEO_FORECAST_URL}?${params}`;
}

/**
 * Batched forecast payload → one reading per site, matched back by the order
 * the request was built in. Open-Meteo returns a bare object for a single
 * location and an array for several.
 */
export function normalizeSiteWeather(
  payload,
  sites,
  { fetchedAt = Date.now() } = {},
) {
  const rows = (Array.isArray(sites) ? sites : []).filter(
    (s) => num(s?.lat) !== null && num(s?.lon) !== null,
  );
  const blocks = Array.isArray(payload) ? payload : payload ? [payload] : [];
  const bySite = new Map();
  for (let i = 0; i < rows.length && i < blocks.length; i += 1) {
    const current = blocks[i]?.current;
    const tempF = num(current?.temperature_2m);
    const at = current?.time ? Date.parse(`${current.time}Z`) : null;
    if (tempF === null || !Number.isFinite(at)) continue;
    const humidity = num(current.relative_humidity_2m);
    const windMph = num(current.wind_speed_10m);
    bySite.set(
      rows[i].id,
      Object.freeze({
        id: rows[i].id,
        tempF,
        humidityPct: humidity,
        windMph,
        observedAt: new Date(at).toISOString(),
        observation: createObservation({
          observedAt: at,
          fetchedAt,
          source: 'Open-Meteo',
          headline: `${Math.round(tempF)}°F at the campus`,
        }),
      }),
    );
  }
  return bySite;
}

/**
 * The campus load as a share of its balancing authority's current demand.
 * Arithmetic on two published numbers, never a claim that the site is metered.
 */
export function gridSharePct(facilityMw, demandMw) {
  const site = num(facilityMw);
  const grid = num(demandMw);
  if (site === null || grid === null || grid <= 0) return null;
  return (site / grid) * 100;
}

/** Card line: `ERCOT 79,477 MW now · site 0.46% · day-ahead 81,020 MW`. */
export function gridLine(row, grid) {
  if (!grid || grid.demandMw === null) return null;
  const share = gridSharePct(row?.facilityPowerMw, grid.demandMw);
  return [
    `${grid.name} ${Math.round(grid.demandMw).toLocaleString('en-US')} MW now`,
    share === null ? null : `site ${share.toFixed(2)}%`,
    grid.forecastMw === null
      ? null
      : `day-ahead ${Math.round(grid.forecastMw).toLocaleString('en-US')} MW`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Card line: `96°F · 36% RH · 3 mph`. */
export function weatherLine(weather) {
  if (!weather) return null;
  return [
    `${Math.round(weather.tempF)}°F`,
    weather.humidityPct === null
      ? null
      : `${Math.round(weather.humidityPct)}% RH`,
    weather.windMph === null ? null : `${Math.round(weather.windMph)} mph`,
  ]
    .filter(Boolean)
    .join(' · ');
}
