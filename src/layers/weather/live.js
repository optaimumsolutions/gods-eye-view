/**
 * Row 3 live feeds (docs/COMMODITIES-PLAN.md §11.8.3): the three Open-Meteo
 * URL builders and their normalizers. Keyless, CORS `*`, read browser-direct
 * exactly as the data center cards read `api.open-meteo.com`.
 *
 * Portable by rule: no Cesium, no DOM, no browser globals.
 */
import {
  DEFAULT_MODEL,
  FORECAST_DAYS,
  normalizeEnsemblePayload,
} from './records.js';

export const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble';
export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
export const META_URL_BASE = 'https://ensemble-api.open-meteo.com/data';
export const DAILY_VARIABLES =
  'temperature_2m_min,temperature_2m_max,precipitation_sum,snowfall_sum,wind_speed_10m_max';
export const MARINE_VARIABLES = 'wave_height_max,wind_wave_height_max';

/** `GET <base>/<model>/static/meta.json` — run times, keyless, CORS `*`. */
export function metaUrl(model = DEFAULT_MODEL) {
  return `${META_URL_BASE}/${encodeURIComponent(model)}/static/meta.json`;
}

/** `{ initialisedAt, availableAt, updateIntervalS }` in ISO, or null when malformed. */
export function normalizeMeta(payload) {
  const init = Number(payload?.last_run_initialisation_time);
  const avail = Number(payload?.last_run_availability_time);
  if (!Number.isFinite(init) || !Number.isFinite(avail)) return null;
  return {
    initialisedAt: new Date(init * 1000).toISOString(),
    availableAt: new Date(avail * 1000).toISOString(),
    updateIntervalS: Number(payload?.update_interval_seconds) || null,
  };
}

/**
 * One ensemble GET for every sample point of every entry (27 today, ~90 with
 * the milestone-2 assets). Points are flattened in entry order and the
 * response comes back one block per point in the same order, so the caller
 * re-slices by `pointsByEntry`.
 */
export function ensembleUrl(
  points,
  { model = DEFAULT_MODEL, days = FORECAST_DAYS } = {},
) {
  if (!points.length) return null;
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    models: model,
    daily: DAILY_VARIABLES,
    forecast_days: String(days),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
  });
  return `${ENSEMBLE_URL}?${params}`;
}

/** Flatten entries to one point list and remember each entry's slice. */
export function flattenPoints(entries) {
  const points = [];
  const slices = new Map();
  for (const entry of entries) {
    slices.set(entry.id, [points.length, points.length + entry.points.length]);
    points.push(...entry.points);
  }
  return { points, slices };
}

/** Re-slice the block list per entry; null when the count does not match. */
export function blocksByEntry(payload, slices, expectedPoints) {
  const blocks = normalizeEnsemblePayload(payload);
  if (!blocks || blocks.length !== expectedPoints) return null;
  const map = new Map();
  for (const [id, [start, end]] of slices)
    map.set(id, blocks.slice(start, end));
  return map;
}

/** One marine GET for the Gulf points, 7 days, deterministic (no ensemble). */
export function marineUrl(points, { days = 7 } = {}) {
  if (!points.length) return null;
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
    daily: MARINE_VARIABLES,
    forecast_days: String(days),
    timezone: 'UTC',
  });
  return `${MARINE_URL}?${params}`;
}

/** `{ days: [{ date, waveMax, windWaveMax }] }` per point block, or null. */
export function normalizeMarine(payload) {
  const blocks = Array.isArray(payload) ? payload : payload ? [payload] : [];
  if (!blocks.length) return null;
  return blocks.map((b) => {
    const t = Array.isArray(b?.daily?.time) ? b.daily.time : [];
    return {
      days: t.map((date, i) => ({
        date,
        waveMax: Number.isFinite(b.daily.wave_height_max?.[i])
          ? b.daily.wave_height_max[i]
          : null,
        windWaveMax: Number.isFinite(b.daily.wind_wave_height_max?.[i])
          ? b.daily.wind_wave_height_max[i]
          : null,
      })),
    };
  });
}
