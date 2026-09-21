/**
 * North Dakota reader for the onshore production family
 * (docs/COMMODITIES-PLAN.md §14, R12.7): the DMR Oil and Gas Division's
 * Monthly Production Report, one keyless workbook per month at
 * https://www.dmr.nd.gov/oilgas/mpr/YYYY_MM.xlsx, released about 45 days after
 * the month ends.
 *
 * What the workbook is (inspected 2026-09-21): sheet `Oil`, one row per well
 * and pool for the month — `ReportDate`, `API_WELLNO`, `FileNo`, `Company`,
 * `WellName`, `Quarter`, `Section`, `Township`, `Range`, `County`, `FieldName`,
 * `Pool`, `Oil` (bbl), `Wtr` (bbl), `Days`, `Runs` (bbl), `Gas` (Mcf),
 * `GasSold` (Mcf), `Flared` (Mcf), `Lat`, `Long` — 22,479 rows for 2026-06,
 * 22,402 wells, every row with coordinates. A second sheet,
 * `SkimmedCrudeRecovery`, lists disposal facilities with no coordinates and no
 * gas; it is counted and skipped. Confidential wells are absent from the file
 * by DMR policy. A few cells carry text where a number belongs (`NR`, `NA`):
 * they are read as "not filed", never as zero.
 *
 * The facility is the well (R12.1): pool rows are summed per well and month,
 * days is the largest pool's, and the pools are listed. The datum is not
 * stated by DMR; the coordinates are used as NAD83, which is within a metre
 * of WGS84 here (R12.2, O7), and the assumption is recorded in the manifest.
 *
 * Each workbook is archived verbatim under `.gev-cache/onshore/nd/` with a
 * `.retrieved` sidecar, and its normalised rows are cached beside it under
 * `parsed/` keyed by the workbook's sha256, so a rebuild reads 120 small JSON
 * files instead of parsing 120 workbooks.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

export const ND_SOURCE = Object.freeze({
  state: 'ND',
  id: 'nd-dmr-mpr',
  name: 'North Dakota DMR Oil and Gas Division, Monthly Production Report',
  short: 'ND DMR',
  url: 'https://www.dmr.nd.gov/oilgas/mpr/',
  filePattern: 'https://www.dmr.nd.gov/oilgas/mpr/YYYY_MM.xlsx',
  grain: 'well',
  cadence: 'monthly',
  lagDays: 45,
  datum: 'NAD83 (assumed; the workbook does not state a datum)',
  transform: 'none — NAD83 and WGS84 agree within a metre in North Dakota',
  license:
    'Public record of the North Dakota Industrial Commission; no licence text, state disclaimer applies',
  /**
   * A month's workbook is not re-cut after publication (its Last-Modified
   * header is the first release: 2026-06 on 2026-08-17, 2026-07 on
   * 2026-09-15); late filings reach the PDF report only. The newest workbook
   * is therefore final as published, and a light month stays light.
   */
  finality:
    'workbooks are final as published; late filings reach the PDF report only',
  /** Six decimals kept of the thirteen filed (11 cm), below any survey. */
  precision: 'coordinates rounded to six decimals',
  /** Months of history the completeness baseline looks back over (R12.3). */
  lookback: 12,
  /** Reporters are wells present in the month's workbook: the question is who has filed. */
  reporterRule: 'wells present in the month’s workbook (filed a report)',
});

export const ND_COLUMNS = Object.freeze([
  'ReportDate',
  'API_WELLNO',
  'FileNo',
  'Company',
  'WellName',
  'County',
  'FieldName',
  'Pool',
  'Oil',
  'Wtr',
  'Days',
  'Runs',
  'Gas',
  'GasSold',
  'Flared',
  'Lat',
  'Long',
]);

const SHEET = 'Oil';
const SKIPPED_SHEET = 'SkimmedCrudeRecovery';
const PARSED_VERSION = 1;

function monthFile(month) {
  return `${month.slice(0, 4)}_${month.slice(5, 7)}.xlsx`;
}

export function ndWorkbookUrl(month) {
  return `https://www.dmr.nd.gov/oilgas/mpr/${monthFile(month)}`;
}

/** Excel serial day → `YYYY-MM-DD` (1900 date system). */
export function excelSerialToIso(serial) {
  if (!Number.isFinite(serial)) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s || null;
}

async function fetchWorkbook(month, target, { replay }) {
  if (replay) throw new Error(`--replay: ${monthFile(month)} is not cached`);
  const url = ndWorkbookUrl(month);
  const response = await fetch(url);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(target, bytes);
  writeFileSync(
    `${target}.retrieved`,
    `${new Date().toISOString().slice(0, 10)}\n`,
  );
  return true;
}

function retrievedDate(file) {
  const sidecar = `${file}.retrieved`;
  if (existsSync(sidecar)) return readFileSync(sidecar, 'utf8').trim();
  return statSync(file).mtime.toISOString().slice(0, 10);
}

/**
 * Whether a month's workbook exists upstream (or in the cache). Used to find
 * the newest published month: the DMR index page is not machine-readable.
 */
export async function ndMonthAvailable(month, { cacheDir, replay = false }) {
  const target = path.join(cacheDir, monthFile(month));
  if (existsSync(target)) return true;
  if (replay) return false;
  const response = await fetch(ndWorkbookUrl(month), { method: 'HEAD' });
  return response.ok;
}

/**
 * Read one month. Returns null when the workbook is not published. Rows are
 * per well (pools summed); `anomalies` names what the file got wrong.
 */
export async function readNorthDakotaMonth(
  month,
  { cacheDir, refresh = false, replay = false, log = () => {} } = {},
) {
  if (!/^\d{4}-\d{2}$/.test(month))
    throw new TypeError(`nd: month "${month}" is not YYYY-MM`);
  mkdirSync(path.join(cacheDir, 'parsed'), { recursive: true });
  const file = path.join(cacheDir, monthFile(month));
  if (!existsSync(file) || refresh) {
    log(`fetching ${ndWorkbookUrl(month)}`);
    const found = await fetchWorkbook(month, file, { replay });
    if (!found) return null;
  }
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const retrieved = retrievedDate(file);
  const parsedFile = path.join(
    cacheDir,
    'parsed',
    `${monthFile(month).replace(/\.xlsx$/, '')}.${sha256.slice(0, 12)}.v${PARSED_VERSION}.json`,
  );
  let parsed = null;
  if (existsSync(parsedFile)) {
    parsed = JSON.parse(readFileSync(parsedFile, 'utf8'));
  } else {
    log(`parsing ${monthFile(month)}`);
    parsed = parseWorkbook(bytes, month);
    writeFileSync(parsedFile, JSON.stringify(parsed));
  }
  return {
    month,
    file: monthFile(month),
    url: ndWorkbookUrl(month),
    bytes: bytes.length,
    sha256,
    retrieved,
    ...parsed,
  };
}

/** Pure: workbook bytes → per-well rows for the month. Exported for the tests. */
export function parseWorkbook(bytes, month) {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet)
    throw new Error(
      `nd ${month}: no sheet "${SHEET}" (sheets: ${workbook.SheetNames.join(', ')})`,
    );
  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const header = (table[0] ?? []).map((h) => String(h ?? '').trim());
  const missing = ND_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length)
    throw new Error(
      `nd ${month}: upstream columns have moved — missing ${missing.join(', ')}`,
    );
  const col = Object.fromEntries(ND_COLUMNS.map((c) => [c, header.indexOf(c)]));

  const wells = new Map();
  const reportDates = new Map();
  let poolRows = 0;
  let textCells = 0;
  let unplaced = 0;
  for (let i = 1; i < table.length; i += 1) {
    const row = table[i];
    if (!row || row[col.API_WELLNO] === null) continue;
    const api = text(row[col.API_WELLNO]);
    if (!api) continue;
    poolRows += 1;
    const reportDate = excelSerialToIso(num(row[col.ReportDate]));
    if (reportDate)
      reportDates.set(reportDate, (reportDates.get(reportDate) ?? 0) + 1);
    const volumes = {};
    for (const [key, column] of [
      ['oil', 'Oil'],
      ['water', 'Wtr'],
      ['days', 'Days'],
      ['runs', 'Runs'],
      ['gas', 'Gas'],
      ['gasSold', 'GasSold'],
      ['flared', 'Flared'],
    ]) {
      const raw = row[col[column]];
      const value = num(raw);
      if (value === null && raw !== null && raw !== '') textCells += 1;
      volumes[key] = value;
    }
    const lat = num(row[col.Lat]);
    const lon = num(row[col.Long]);
    let well = wells.get(api);
    if (!well) {
      well = {
        id: api,
        fileNo: num(row[col.FileNo]),
        operator: text(row[col.Company]),
        name: text(row[col.WellName]),
        county: text(row[col.County]),
        field: text(row[col.FieldName]),
        pools: [],
        lat: null,
        lon: null,
        oil: null,
        water: null,
        days: null,
        runs: null,
        gas: null,
        gasSold: null,
        flared: null,
      };
      wells.set(api, well);
    }
    const pool = text(row[col.Pool]);
    if (pool && !well.pools.includes(pool)) well.pools.push(pool);
    if (
      lat !== null &&
      lon !== null &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180 &&
      well.lat === null
    ) {
      // Six decimals (11 cm) — the file carries thirteen, below any survey.
      well.lat = Math.round(lat * 1e6) / 1e6;
      well.lon = Math.round(lon * 1e6) / 1e6;
    }
    for (const key of ['oil', 'water', 'runs', 'gas', 'gasSold', 'flared']) {
      if (volumes[key] === null) continue;
      well[key] = (well[key] ?? 0) + volumes[key];
    }
    if (volumes.days !== null)
      well.days = Math.max(well.days ?? 0, volumes.days);
  }
  const rows = [...wells.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  for (const row of rows) if (row.lat === null) unplaced += 1;

  const skipped = workbook.Sheets[SKIPPED_SHEET]
    ? XLSX.utils
        .sheet_to_json(workbook.Sheets[SKIPPED_SHEET], { header: 1, raw: true })
        .filter((r, i) => i > 0 && r && r[col.API_WELLNO] !== null).length
    : 0;

  // The file's own ReportDate column, which the 2026-07 workbook filled with
  // 2023-07-01: the month is the file name's, and a disagreement is recorded.
  const dominantDate = [...reportDates].sort((a, b) => b[1] - a[1])[0]?.[0];
  const anomalies = [];
  if (dominantDate && dominantDate.slice(0, 7) !== month) {
    anomalies.push(
      `ReportDate column reads ${dominantDate} in a file named for ${month}; the file name is taken as the month`,
    );
  }
  return {
    sheet: SHEET,
    poolRows,
    wells: rows.length,
    unplaced,
    reportDate: dominantDate ?? null,
    skippedRows: skipped,
    skippedSheet: SKIPPED_SHEET,
    /** Numeric cells holding NR/NA, read as not filed; the builder sums them. */
    textCells,
    anomalies,
    rows,
  };
}

/**
 * The reader contract every state reader fulfils: the source description and
 * a month reader. `readMonth` returns null for an unpublished month.
 */
export const northDakotaReader = Object.freeze({
  source: ND_SOURCE,
  monthAvailable: ndMonthAvailable,
  readMonth: readNorthDakotaMonth,
});
