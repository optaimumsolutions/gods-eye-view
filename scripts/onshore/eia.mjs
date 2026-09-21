/**
 * EIA state series for the onshore reconciliation line (docs/COMMODITIES-PLAN.md
 * §14, G1, R12.9): natural gas gross withdrawals and marketed production by
 * state, and crude oil field production by state, from EIA's keyless dnav
 * monthly XLS downloads (the same series the API serves; the workbook needs no
 * key and is read at build time, so R12 of the shell PRD holds).
 *
 * Files (probed 2026-09-21, last modified 2026-08-27; newest period 2026-06):
 *   https://www.eia.gov/dnav/ng/xls/NG_PROD_SUM_A_EPG0_FGW_MMCF_M.xls  gross withdrawals, MMcf
 *   https://www.eia.gov/dnav/ng/xls/NG_PROD_SUM_A_EPG0_VGM_MMCF_M.xls  marketed production, MMcf
 *   https://www.eia.gov/dnav/pet/xls/PET_CRD_CRPDN_ADC_MBBL_M.xls      crude field production, Mbbl
 * Sheet `Data 1`: row 2 carries the source keys (`N9010ND2`, `N9050ND2`,
 * `MCRFPND1`), row 3 the descriptions, rows 4+ an Excel serial date (mid
 * month) followed by the values. `Data 2` holds the smaller states.
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
import { excelSerialToIso } from './nd.mjs';

export const EIA_FILES = Object.freeze({
  gross: {
    url: 'https://www.eia.gov/dnav/ng/xls/NG_PROD_SUM_A_EPG0_FGW_MMCF_M.xls',
    file: 'NG_PROD_SUM_A_EPG0_FGW_MMCF_M.xls',
    unit: 'MMcf',
    what: 'natural gas gross withdrawals',
    key: (state) => `N9010${state}2`,
  },
  marketed: {
    url: 'https://www.eia.gov/dnav/ng/xls/NG_PROD_SUM_A_EPG0_VGM_MMCF_M.xls',
    file: 'NG_PROD_SUM_A_EPG0_VGM_MMCF_M.xls',
    unit: 'MMcf',
    what: 'natural gas marketed production',
    key: (state) => `N9050${state}2`,
  },
  oil: {
    url: 'https://www.eia.gov/dnav/pet/xls/PET_CRD_CRPDN_ADC_MBBL_M.xls',
    file: 'PET_CRD_CRPDN_ADC_MBBL_M.xls',
    unit: 'Mbbl',
    what: 'crude oil field production',
    key: (state) => `MCRFP${state}1`,
  },
});

async function ensureFile(spec, cacheDir, { refresh, replay, log }) {
  mkdirSync(cacheDir, { recursive: true });
  const target = path.join(cacheDir, spec.file);
  if (existsSync(target) && !refresh) return target;
  if (replay) throw new Error(`--replay: ${spec.file} is not in ${cacheDir}`);
  log(`fetching ${spec.url}`);
  const response = await fetch(spec.url);
  if (!response.ok) throw new Error(`${spec.url}: HTTP ${response.status}`);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  writeFileSync(
    `${target}.retrieved`,
    `${new Date().toISOString().slice(0, 10)}\n`,
  );
  return target;
}

function retrievedDate(file) {
  const sidecar = `${file}.retrieved`;
  if (existsSync(sidecar)) return readFileSync(sidecar, 'utf8').trim();
  return statSync(file).mtime.toISOString().slice(0, 10);
}

/** Pure: workbook bytes + a source key → `{ month: value }` and the description. */
export function seriesFromWorkbook(bytes, sourceKey) {
  const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  for (const name of workbook.SheetNames) {
    if (!/^Data \d+$/.test(name)) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
    });
    const keyRow = rows.find((r) => r && r[0] === 'Sourcekey');
    if (!keyRow) continue;
    const column = keyRow.indexOf(sourceKey);
    if (column < 0) continue;
    const descriptionRow = rows.find((r) => r && r[0] === 'Date');
    const values = {};
    let newest = null;
    for (const row of rows) {
      if (!row || typeof row[0] !== 'number') continue;
      const iso = excelSerialToIso(row[0]);
      if (!iso) continue;
      const month = iso.slice(0, 7);
      const value = typeof row[column] === 'number' ? row[column] : null;
      if (value === null) continue;
      values[month] = value;
      if (!newest || month > newest) newest = month;
    }
    return {
      sourceKey,
      description: descriptionRow ? String(descriptionRow[column]) : null,
      sheet: name,
      newest,
      values,
    };
  }
  throw new Error(`EIA workbook: no series ${sourceKey}`);
}

/**
 * The three state series, each `{ values: {YYYY-MM: number}, newest, unit }`,
 * with the files' sha256 and retrieval dates for the manifest.
 */
export async function readEiaStateSeries(
  state,
  { cacheDir, refresh = false, replay = false, log = () => {} } = {},
) {
  const out = { state, series: {}, files: [] };
  for (const [name, spec] of Object.entries(EIA_FILES)) {
    const file = await ensureFile(spec, cacheDir, { refresh, replay, log });
    const bytes = readFileSync(file);
    const series = seriesFromWorkbook(bytes, spec.key(state));
    out.series[name] = {
      ...series,
      unit: spec.unit,
      what: spec.what,
      file: spec.file,
    };
    out.files.push({
      name,
      url: spec.url,
      file: spec.file,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      retrieved: retrievedDate(file),
      sourceKey: spec.key(state),
      description: series.description,
      newest: series.newest,
      unit: spec.unit,
    });
  }
  return out;
}
