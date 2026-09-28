/**
 * Pennsylvania reader for the onshore production bundle (docs/COMMODITIES-PLAN.md
 * §14.4, §14.10 region 2; row 14 M3): DEP's Oil and Gas Production Report
 * extract on GreenPort, unconventional wells, one monthly period per request.
 *
 * The form (probed 2026-09-28): an ASP.NET Core page that sets an antiforgery
 * cookie and embeds `__RequestVerificationToken`; the export is a form POST to
 * `ExportOGProdReport` with `RptPeriodsid` (one per period), a blank
 * `Operator` and `perNum`, the token and the cookie, answering `text/csv`.
 * Period ids are not sequential, so they are read from the form's list by
 * label ("Jul 2026 (PRODUCTION: Unconventional wells)"). Unconventional wells
 * report monthly since January 2015; conventional wells only annually, so
 * they are not read here. The extract carries operator (`CLIENT`), permit
 * number, farm and well number, county, municipality and NAD83 decimal
 * coordinates on every row: no join is needed.
 *
 * Every month's CSV is archived verbatim under `.gev-cache/onshore/pa/` with
 * a `.retrieved` sidecar; its normalised rows are cached beside it under
 * `parsed/`, keyed by the file's sha256. DEP notes that "values may change
 * between generations of reports": `--refresh` re-reads every month.
 * Licence (docs/LICENCES.md): ALLOWED-WITH-CONDITIONS for the production
 * figures (credit PA DEP, as reported by operators, no warranty); the well
 * coordinates are ASK-FIRST until DEP confirms, so the hosted site withholds
 * this layer.
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

export const PA_SOURCE = Object.freeze({
  state: 'PA',
  id: 'pa-dep-greenport',
  name: 'Pennsylvania DEP Oil and Gas Production Report (GreenPort extract), unconventional wells',
  short: 'PA DEP',
  url: 'https://greenport.pa.gov/ReportExtracts/OG/OilGasWellProdReport',
  filePattern:
    'https://greenport.pa.gov/ReportExtracts/OG/ExportOGProdReport (POST, one monthly period per request)',
  grain: 'well',
  cadence: 'monthly',
  lagDays: 55,
  datum: 'NAD83 (DEP decimal degrees)',
  transform: 'none — NAD83 and WGS84 agree within two metres in Pennsylvania',
  license:
    'Public record of the Pennsylvania Department of Environmental Protection; GreenPort states no licence and the pa.gov disclaimer covers warranty only; figures as reported by operators',
  finality:
    'a live report: DEP notes values may change between generations of reports, so --refresh re-reads every month',
  precision: 'coordinates rounded to six decimals',
  lookback: 12,
  reporterRule:
    'unconventional wells present in the month’s extract (filed a report)',
});

export const PA_FORM_URL =
  'https://greenport.pa.gov/ReportExtracts/OG/OilGasWellProdReport';
export const PA_EXPORT_URL =
  'https://greenport.pa.gov/ReportExtracts/OG/ExportOGProdReport';

/** The columns the reader needs; a renamed column fails the build by name. */
export const PA_COLUMNS = Object.freeze([
  'COUNTY',
  'MUNIC',
  'PERMIT_NUM',
  'FARM',
  'WELL_NO',
  'CLIENT',
  'PRODUCTION_PERIOD_START_DATE',
  'LATITUDE_DECIMAL',
  'LONGITUDE_DECIMAL',
  'GAS_QUANTITY',
  'GAS_OPERATING_DAYS',
  'OIL_QUANTITY',
  'CONDENSATE_QUANTITY',
  'UNCONVENTIONAL_IND',
]);

const PARSED_VERSION = 3;
const MONTHS = Object.freeze([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]);
const TIMEOUT_MS = 90_000;
const TRIES = 4;

function monthFile(month) {
  return `${month.replace('-', '_')}.csv`;
}

function num(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s || null;
}

/** `Jul 2026 (PRODUCTION: Unconventional wells)` → `2026-07`; anything else → null. */
export function periodMonth(label) {
  const m =
    /^\s*([A-Z][a-z]{2})\s+(\d{4})\s*\(PRODUCTION:\s*Unconventional wells\)\s*$/.exec(
      String(label ?? ''),
    );
  if (!m) return null;
  const at = MONTHS.indexOf(m[1]);
  return at < 0 ? null : `${m[2]}-${String(at + 1).padStart(2, '0')}`;
}

/** A date as the extract writes it (`07/01/2026`, `2026-07-01`, with or without a time) → `2026-07`. */
export function isoMonthOf(value) {
  const s = String(value ?? '').trim();
  let m = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  m = /^(\d{1,2})\/\d{1,2}\/(\d{4})/.exec(s);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return null;
}

/** RFC 4180 CSV to rows of fields (quoted fields may hold commas, quotes and newlines). */
export function parseCsv(textIn) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(textIn).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

/** `YUTE UNIT 4H` + `4H` → `YUTE UNIT 4H` (farms often carry the well number already). */
export function wellName(farm, wellNo) {
  const f = text(farm);
  const w = text(wellNo);
  if (!f) return w;
  if (!w) return f;
  return f.toUpperCase().endsWith(` ${w.toUpperCase()}`) ||
    f.toUpperCase() === w.toUpperCase()
    ? f
    : `${f} ${w}`;
}

/**
 * Pure: one month's extract → per-well rows. A file whose period dates name
 * another month is refused (the lesson of North Dakota's 2026-07 workbook).
 */
export function parseExtract(csvText, month) {
  const table = parseCsv(csvText);
  const header = (table[0] ?? []).map((h) => String(h).trim());
  const missing = PA_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length)
    throw new Error(
      `pa ${month}: upstream columns have moved — missing ${missing.join(', ')}`,
    );
  const col = Object.fromEntries(PA_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const wells = new Map();
  const periods = new Map();
  let poolRows = 0;
  let textCells = 0;
  let unplaced = 0;
  let conventional = 0;
  for (let i = 1; i < table.length; i += 1) {
    const r = table[i];
    const id = text(r[col.PERMIT_NUM]);
    if (!id) continue;
    if (text(r[col.UNCONVENTIONAL_IND]) === 'No') {
      conventional += 1;
      continue;
    }
    poolRows += 1;
    const period = isoMonthOf(r[col.PRODUCTION_PERIOD_START_DATE]);
    if (period) periods.set(period, (periods.get(period) ?? 0) + 1);
    const volumes = {};
    for (const [key, column] of [
      ['gas', 'GAS_QUANTITY'],
      ['days', 'GAS_OPERATING_DAYS'],
      ['oilOnly', 'OIL_QUANTITY'],
      ['condensate', 'CONDENSATE_QUANTITY'],
    ]) {
      const raw = r[col[column]];
      const value = num(raw);
      if (value === null && raw !== undefined && String(raw).trim() !== '')
        textCells += 1;
      volumes[key] = value;
    }
    const lat = num(r[col.LATITUDE_DECIMAL]);
    const lon = num(r[col.LONGITUDE_DECIMAL]);
    let well = wells.get(id);
    if (!well) {
      well = {
        id,
        fileNo: null,
        operator: text(r[col.CLIENT]),
        name: wellName(r[col.FARM], r[col.WELL_NO]),
        county: text(r[col.COUNTY]),
        // Pennsylvania files no field: the municipality (township) stands in.
        field: text(r[col.MUNIC]),
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
      wells.set(id, well);
    }
    if (
      lat !== null &&
      lon !== null &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180 &&
      lat !== 0 &&
      well.lat === null
    ) {
      well.lat = Math.round(lat * 1e6) / 1e6;
      well.lon = Math.round(lon * 1e6) / 1e6;
    }
    if (volumes.gas !== null) well.gas = (well.gas ?? 0) + volumes.gas;
    if (volumes.oilOnly !== null || volumes.condensate !== null)
      well.oil =
        (well.oil ?? 0) + (volumes.oilOnly ?? 0) + (volumes.condensate ?? 0);
    if (volumes.days !== null)
      well.days = Math.max(well.days ?? 0, volumes.days);
  }
  const dominant = [...periods].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (dominant && dominant !== month)
    throw new Error(
      `pa ${month}: the extract's periods start in ${dominant}, so it holds another month's filings`,
    );
  const rows = [...wells.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  for (const row of rows) if (row.lat === null) unplaced += 1;
  // Conventional rows (one or two a month in 2017-2022) are counted in
  // skippedRows, which source.json carries per file; they are not anomalies.
  const anomalies = [];
  return {
    sheet: 'csv',
    poolRows,
    wells: rows.length,
    unplaced,
    reportDate: dominant ? `${dominant}-01` : null,
    skippedRows: conventional,
    skippedSheet: null,
    textCells,
    anomalies,
    rows,
  };
}

/* ------------------------------------------------------------------ *
 * The form and the export
 * ------------------------------------------------------------------ */

async function withRetry(what, fn, log) {
  let last = null;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      log?.(
        `  ${what}: attempt ${attempt} failed (${error?.message ?? error})`,
      );
    }
  }
  throw last;
}

function cookiesFrom(response) {
  const all =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  return all.map((c) => c.split(';')[0]).join('; ');
}

let _form = null;

/** The form's token, cookie and period list, read once per build. */
export async function openForm({ log } = {}) {
  if (_form) return _form;
  _form = await withRetry(
    'GreenPort form',
    async () => {
      const response = await fetch(PA_FORM_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'gods-eye-view onshore builder (build-onshore.mjs)',
        },
      });
      if (!response.ok)
        throw new Error(`${PA_FORM_URL}: HTTP ${response.status}`);
      const html = await response.text();
      const token =
        /name="__RequestVerificationToken"[^>]*value="([^"]+)"/.exec(
          html,
        )?.[1] ??
        /value="([^"]+)"[^>]*name="__RequestVerificationToken"/.exec(html)?.[1];
      if (!token)
        throw new Error('GreenPort: no __RequestVerificationToken on the form');
      const periods = new Map();
      for (const m of html.matchAll(
        /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g,
      )) {
        const month = periodMonth(m[2].replace(/&amp;/g, '&'));
        if (month) periods.set(month, m[1]);
      }
      if (!periods.size)
        throw new Error('GreenPort: no unconventional periods on the form');
      return { token, cookie: cookiesFrom(response), periods };
    },
    log,
  );
  return _form;
}

async function fetchExtract(month, target, { log }) {
  const first = await openForm({ log });
  const id = first.periods.get(month);
  if (!id) return false;
  const csv = await withRetry(
    `GreenPort ${month}`,
    async () => {
      // A 400 is usually a stale antiforgery token: the next attempt reopens the form.
      const form = await openForm({ log });
      const body = new URLSearchParams({
        __RequestVerificationToken: form.token,
        RptPeriodsid: id,
        Operator: '',
        perNum: '',
      });
      const response = await fetch(PA_EXPORT_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: form.cookie,
          'User-Agent': 'gods-eye-view onshore builder (build-onshore.mjs)',
        },
      });
      if (!response.ok) {
        if (response.status === 400) _form = null;
        throw new Error(`export ${month}: HTTP ${response.status}`);
      }
      const out = await response.text();
      if (!/^﻿?"?COUNTY"?,/.test(out))
        throw new Error(
          `export ${month}: not the CSV extract (${out.slice(0, 60)})`,
        );
      return out;
    },
    log,
  );
  writeFileSync(target, csv);
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

/** Whether a month's extract exists upstream (or in the cache). */
export async function paMonthAvailable(month, { cacheDir, replay = false }) {
  if (existsSync(path.join(cacheDir, monthFile(month)))) return true;
  if (replay) return false;
  const form = await openForm();
  return form.periods.has(month);
}

/** Read one month; null when the month is not published. */
export async function readPennsylvaniaMonth(
  month,
  { cacheDir, refresh = false, replay = false, log = () => {} } = {},
) {
  if (!/^\d{4}-\d{2}$/.test(month))
    throw new TypeError(`pa: month "${month}" is not YYYY-MM`);
  mkdirSync(path.join(cacheDir, 'parsed'), { recursive: true });
  const file = path.join(cacheDir, monthFile(month));
  if (!existsSync(file) || refresh) {
    if (replay) {
      if (!existsSync(file)) return null;
    } else {
      log(`fetching GreenPort ${month}`);
      const found = await fetchExtract(month, file, { log });
      if (!found) return null;
    }
  }
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const parsedFile = path.join(
    cacheDir,
    'parsed',
    `${monthFile(month).replace(/\.csv$/, '')}.${sha256.slice(0, 12)}.v${PARSED_VERSION}.json`,
  );
  let parsed = null;
  if (existsSync(parsedFile)) {
    parsed = JSON.parse(readFileSync(parsedFile, 'utf8'));
  } else {
    log(`parsing ${monthFile(month)}`);
    parsed = parseExtract(bytes.toString('utf8'), month);
    writeFileSync(parsedFile, JSON.stringify(parsed));
  }
  return {
    month,
    file: monthFile(month),
    url: PA_EXPORT_URL,
    bytes: bytes.length,
    sha256,
    retrieved: retrievedDate(file),
    ...parsed,
  };
}

export const pennsylvaniaReader = Object.freeze({
  source: PA_SOURCE,
  monthAvailable: paMonthAvailable,
  readMonth: readPennsylvaniaMonth,
});
