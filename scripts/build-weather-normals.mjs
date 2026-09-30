#!/usr/bin/env node
/**
 * Row 3 (docs/COMMODITIES-PLAN.md §11.8.2): bundle the ERA5 day-of-year
 * normals every weather marker's colour is measured against.
 *
 * For each gazetteer entry, ten calendar years (WINDOW) of daily
 * `temperature_2m_min` / `temperature_2m_max` per sample point from
 * `archive-api.open-meteo.com/v1/archive` (ERA5; keyless; one call per point),
 * aggregated to the entry's weighted centroid the way the forecast is
 * (point-then-weight), then reduced to 366 day-of-year means smoothed with a
 * ±7-day window. Written to `src/data/local_data/weather/normals.json` with the
 * window, vintage and the Copernicus attribution line. A-2: ten years
 * trailing, recomputed by re-running this script, never at runtime.
 *
 *   node scripts/build-weather-normals.mjs           # fetch + write
 *   node scripts/build-weather-normals.mjs --check   # byte-identical (uses
 *       the raw responses cached under .gev-cache/weather/normals/)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'local_data', 'weather');
const CACHE = join(ROOT, '.gev-cache', 'weather', 'normals');
const WINDOW = { start: '2016-01-01', end: '2025-12-31' };
const SMOOTH_DAYS = 7;
const ATTRIBUTION =
  'Contains modified Copernicus Climate Change Service information (ERA5, via Open-Meteo archive API), 2016-2025';

function dayOfYear(iso) {
  // 1..366 on a leap-year calendar so 02-29 has its own slot
  const [y, m, d] = iso.split('-').map(Number);
  const leap = 2000; // reference leap year
  const start = Date.UTC(leap, 0, 1);
  return Math.round((Date.UTC(leap, m - 1, d) - start) / 86_400_000) + 1;
}

async function fetchPoint(point, fetchImpl) {
  const key = `${point.lat}_${point.lon}.json`;
  const path = join(CACHE, key);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    start_date: WINDOW.start,
    end_date: WINDOW.end,
    daily: 'temperature_2m_min,temperature_2m_max',
    temperature_unit: 'fahrenheit',
    timezone: 'UTC',
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
  // A ten-year pull is weighted as many calls on the free tier; a 429 means
  // the minute budget is spent, not that the point is wrong — wait and retry.
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetchImpl(url);
    if (res.status !== 429 || attempt >= 6) break;
    const wait = 65_000;
    console.error(`  429 for ${point.name}; waiting ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res.ok) throw new Error(`archive ${res.status} for ${point.name}`);
  const json = await res.json();
  if (!json?.daily?.time?.length)
    throw new Error(`empty archive for ${point.name}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, JSON.stringify(json));
  return json;
}

/** Weighted mean over points per day, then day-of-year mean, then smoothing. */
export function reduceNormals(entry, payloads) {
  const days = payloads[0].daily.time;
  const sums = { tmin: new Array(367).fill(0), tmax: new Array(367).fill(0) };
  const counts = new Array(367).fill(0);
  days.forEach((iso, i) => {
    let tmin = 0;
    let tmax = 0;
    let ok = true;
    payloads.forEach((p, k) => {
      const a = p.daily.temperature_2m_min[i];
      const b = p.daily.temperature_2m_max[i];
      if (a == null || b == null) ok = false;
      tmin += a * entry.points[k].w;
      tmax += b * entry.points[k].w;
    });
    if (!ok) return;
    const doy = dayOfYear(iso);
    sums.tmin[doy] += tmin;
    sums.tmax[doy] += tmax;
    counts[doy] += 1;
  });
  const raw = (arr) =>
    arr.map((v, doy) => (counts[doy] ? v / counts[doy] : null));
  const smooth = (series) =>
    Array.from({ length: 366 }, (_, i) => {
      const doy = i + 1;
      let s = 0;
      let n = 0;
      for (let k = -SMOOTH_DAYS; k <= SMOOTH_DAYS; k++) {
        const d = ((doy - 1 + k + 366) % 366) + 1;
        if (series[d] == null) continue;
        s += series[d];
        n++;
      }
      return n ? Number((s / n).toFixed(2)) : null;
    });
  return { tmin: smooth(raw(sums.tmin)), tmax: smooth(raw(sums.tmax)) };
}

async function main() {
  const check = process.argv.includes('--check');
  const gaz = JSON.parse(readFileSync(join(OUT_DIR, 'gazetteer.json'), 'utf8'));
  const entries = {};
  for (const entry of gaz.entries) {
    const payloads = [];
    for (const point of entry.points) {
      payloads.push(await fetchPoint(point, globalThis.fetch));
      console.error(`  ${entry.id} · ${point.name} ok`);
    }
    entries[entry.id] = reduceNormals(entry, payloads);
  }
  const out =
    JSON.stringify(
      {
        window: WINDOW,
        vintage: 'ERA5 2016-2025',
        smoothDays: SMOOTH_DAYS,
        source: 'archive-api.open-meteo.com/v1/archive',
        attribution: ATTRIBUTION,
        entries,
      },
      null,
      1,
    ) + '\n';
  const path = join(OUT_DIR, 'normals.json');
  if (check) {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur !== out) {
      console.error('normals.json DRIFTS from a fresh build');
      process.exit(1);
    }
    console.log('normals.json byte-identical');
    return;
  }
  writeFileSync(path, out);
  console.log(
    `wrote normals for ${Object.keys(entries).length} entries → ${path}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  await main();
