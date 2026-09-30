#!/usr/bin/env node
/**
 * Row 3 M7 (docs/COMMODITIES-PLAN.md §11.8.15 D7.5): bundle the population
 * grid the `HDD × people` / `CDD × people` field chips multiply by.
 *
 * Source: NASA SEDAC, Gridded Population of the World v4.11, population
 * COUNT, 2020, 15 arc-minute (0.25°) — exactly the field's grid step —
 * CC BY 4.0. The download sits behind an Earthdata login, so the file is a
 * MANUAL input (as the GEM spreadsheet is for the LNG bundle): fetch
 * `gpw-v4-population-count-rev11_2020_15_min_asc.zip`, unzip, and point the
 * script at the `.asc` (ESRI ASCII grid, 1440 × 720, xllcorner −180,
 * yllcorner −90, cellsize 0.25):
 *
 *   node scripts/build-weather-population.mjs --from .gev-cache/weather/gpw_v4_population_count_rev11_2020_15_min.asc
 *   node scripts/build-weather-population.mjs --check      # byte-identical?
 *
 * The field's cells are GRID POINTS (lat0 50, lon0 −126, 0.25° step, 105 ×
 * 241) and its image spans half a cell beyond them, so each point takes the
 * quarter-weighted sum of the four GPW cells that meet at it — the count
 * living inside the point's ±0.125° square. Values are rounded to whole
 * people (int32); the CONUS total is printed and kept in the bundle.
 *
 * Output: `src/data/local_data/weather/population.json` with the vintage,
 * source, licence, grid box, total and the row-major values from the
 * north-west corner.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'local_data', 'weather');
const OUT = join(OUT_DIR, 'population.json');
/** The field's grid (oracle `ingest/wx/field.py` WINDOW): 24–50 N, 126–66 W. */
export const FIELD_GRID = Object.freeze({
  lat0: 50,
  lon0: -126,
  di: 0.25,
  rows: 105,
  cols: 241,
});
export const VINTAGE = 'GPWv4.11 population count 2020, 15 arc-minute';
export const SOURCE =
  'NASA SEDAC (CIESIN, Columbia University), Gridded Population of the World v4.11';
export const LICENCE = 'CC BY 4.0';

/** Parse an ESRI ASCII grid: header keys then rows from the north. */
export function parseAsciiGrid(text) {
  const lines = text.split(/\r?\n/);
  const header = {};
  let i = 0;
  while (i < lines.length && /^[A-Za-z]/.test(lines[i])) {
    const [k, v] = lines[i].trim().split(/\s+/);
    header[k.toLowerCase()] = Number(v);
    i++;
  }
  for (const k of ['ncols', 'nrows', 'xllcorner', 'yllcorner', 'cellsize'])
    if (!Number.isFinite(header[k])) throw new Error(`asc header lacks ${k}`);
  const nodata = Number.isFinite(header.nodata_value)
    ? header.nodata_value
    : -9999;
  const rows = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const row = t.split(/\s+/).map((x) => {
      const n = Number(x);
      return n === nodata ? 0 : n;
    });
    if (row.length !== header.ncols)
      throw new Error(
        `asc row ${rows.length} has ${row.length} cols, not ${header.ncols}`,
      );
    rows.push(row);
  }
  if (rows.length !== header.nrows)
    throw new Error(`asc has ${rows.length} rows, not ${header.nrows}`);
  return { ...header, nodata, rows };
}

/**
 * GPW cell (row, col) whose SOUTH-WEST corner is (lat, lon); the grid is
 * stored north-first, so the row index counts down from the top edge.
 */
function cellAt(grid, latSw, lonSw) {
  const top = grid.yllcorner + grid.nrows * grid.cellsize;
  const r = Math.round((top - (latSw + grid.cellsize)) / grid.cellsize);
  const c = Math.round((lonSw - grid.xllcorner) / grid.cellsize);
  if (r < 0 || r >= grid.nrows || c < 0 || c >= grid.ncols) return 0;
  return grid.rows[r][c];
}

/** Quarter-weighted sum of the four cells meeting at each field point. */
export function reduceToField(grid, field = FIELD_GRID) {
  if (Math.abs(grid.cellsize - field.di) > 1e-9)
    throw new Error(`cellsize ${grid.cellsize} is not the field's ${field.di}`);
  const values = new Array(field.rows * field.cols);
  let total = 0;
  for (let r = 0; r < field.rows; r++) {
    const lat = field.lat0 - r * field.di;
    for (let c = 0; c < field.cols; c++) {
      const lon = field.lon0 + c * field.di;
      const sum =
        cellAt(grid, lat, lon) + // NE quadrant of the point
        cellAt(grid, lat, lon - field.di) + // NW
        cellAt(grid, lat - field.di, lon) + // SE
        cellAt(grid, lat - field.di, lon - field.di); // SW
      const v = Math.round(sum / 4);
      values[r * field.cols + c] = v;
      total += v;
    }
  }
  return { values, total };
}

export function buildBundle(grid, { field = FIELD_GRID } = {}) {
  const { values, total } = reduceToField(grid, field);
  return {
    vintage: VINTAGE,
    source: SOURCE,
    licence: LICENCE,
    url: 'https://sedac.ciesin.columbia.edu/data/set/gpw-v4-population-count-rev11',
    note: 'quarter-weighted sum of the four 0.25° GPW cells meeting at each field grid point (the count within ±0.125° of the point); whole people; NODATA read as 0',
    grid: { ...field },
    total,
    values,
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const fromIdx = args.indexOf('--from');
  const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
  if (!from) {
    console.error(
      'usage: build-weather-population.mjs --from <gpw .asc> [--check]\n' +
        'the GPWv4.11 15-arc-minute ASCII grid is a manual download (Earthdata login)',
    );
    process.exit(2);
  }
  const grid = parseAsciiGrid(readFileSync(from, 'utf8'));
  const bundle = buildBundle(grid);
  const text = JSON.stringify(bundle) + '\n';
  if (check) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== text) {
      console.error('population.json DRIFTS from a fresh build');
      process.exit(1);
    }
    console.log('population.json byte-identical');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, text);
  console.log(
    `wrote ${bundle.values.length} cells, CONUS window total ${bundle.total.toLocaleString('en-US')} people → ${OUT}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
