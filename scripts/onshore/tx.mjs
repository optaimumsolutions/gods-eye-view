/**
 * Texas reader for the onshore production bundle (docs/COMMODITIES-PLAN.md
 * §14.4, §14.10 region 3; row 14 M3): the Railroad Commission's Production
 * Data Query dump for the volumes and its well layers by county for the
 * locations. One reader, sliced by RRC district per region (§14.9: "Texas is
 * one reader sliced by district into five regions"); Permian first.
 *
 * Sources (probed 2026-09-28):
 * - `PDQ_DSV.zip` (3.85 GB, replaced monthly on the last Saturday) on RRC's
 *   GoAnywhere share: sixteen `}`-delimited tables with headers, 1993 to the
 *   newest production month. `OG_COUNTY_LEASE_CYCLE_DATA_TABLE.dsv` (12.8 GB
 *   inflated) carries one row per lease, county and month with the operator,
 *   lease, field and county names inline. Oil is reported per lease (many
 *   wells), gas per gas well (RRC's gas well id is its "lease" number), so a
 *   facility here is an RRC lease: `OIL_GAS_CODE + DISTRICT + LEASE_NO`
 *   (R12.1). Gas = gas-well gas + casinghead gas; oil = oil + condensate; no
 *   water and no days produced are filed in PDQ.
 * - `well<county>.zip` (one per RRC county code, refreshed twice a week) on a
 *   second share: `well<county>s.dbf` holds every surface location keyed by
 *   the 8-digit API (county + unique number) with RRC's own NAD83 columns
 *   (`LAT83`, `LONG83`) beside the NAD27 originals, so no datum transform is
 *   done here (O7). `OG_WELL_COMPLETION_DATA_TABLE.dsv` in the dump maps each
 *   lease to its wells; a lease is drawn at the centroid of its placed wells.
 * - The share pages are PrimeFaces: a GET sets the session and lists up to
 *   250 files, an AJAX POST pages the table, a form POST on a file's link
 *   answers 302 to `/link/godrivedownload`, which streams the file. Scripted
 *   with the session cookie; no browser needed (O3).
 *
 * District names are RRC's (`08`, `8A`, `7C`); the dump's `DISTRICT_NO` is an
 * internal code (`10` is district 08), so the slice filters on
 * `DISTRICT_NAME`.
 *
 * Every download is archived verbatim under `.gev-cache/onshore/tx/` (the dump
 * named by the share's date, the county zips under `wells/<date>/`), with a
 * `.retrieved` sidecar. One streaming pass per slice writes the parsed months
 * under `parsed/<slice>/`, keyed by the dump's sha256 and the well-layer date,
 * so `--replay` and `--check` never touch the network or re-read the dump.
 * Without `--refresh` the newest archived dump and well layers are used;
 * `--refresh` asks the shares for newer ones.
 *
 * Licence (docs/LICENCES.md): RRC's site policies grant permission "for
 * noncommercial use" (ASK-FIRST); the founder overrode that on 2026-09-28 and
 * the Texas regions ship on the hosted site.
 */

import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateRawSync } from 'node:zlib';
import { listZipEntries, openZipEntry } from '../zip-entry.mjs';

export const RRC_PDQ_LINK =
  'https://mft.rrc.texas.gov/link/1f5ddb8d-329a-4459-b7f8-177b4f5ee60d';
export const RRC_WELLS_LINK =
  'https://mft.rrc.texas.gov/link/d551fb20-442e-4b67-84fa-ac3f23ecabb4';
const SHARE_ACTION = '/webclient/godrive/PublicGoDrive.xhtml';
const USER_AGENT = 'gods-eye-view onshore builder (build-onshore.mjs)';
const TIMEOUT_MS = 90_000;
const TRIES = 4;
const PARSED_VERSION = 1;

export const PDQ_TABLES = Object.freeze({
  dateRange: 'GP_DATE_RANGE_CYCLE_DATA_TABLE.dsv',
  countyLease: 'OG_COUNTY_LEASE_CYCLE_DATA_TABLE.dsv',
  wells: 'OG_WELL_COMPLETION_DATA_TABLE.dsv',
});

/** The columns the reader needs; a renamed column fails the build by name. */
export const COUNTY_LEASE_COLUMNS = Object.freeze([
  'OIL_GAS_CODE',
  'LEASE_NO',
  'CYCLE_YEAR_MONTH',
  'GAS_WELL_NO',
  'PROD_REPORT_FILED_FLAG',
  'CNTY_LSE_OIL_PROD_VOL',
  'CNTY_LSE_GAS_PROD_VOL',
  'CNTY_LSE_COND_PROD_VOL',
  'CNTY_LSE_CSGD_PROD_VOL',
  'DISTRICT_NAME',
  'LEASE_NAME',
  'OPERATOR_NAME',
  'FIELD_NAME',
  'COUNTY_NO',
  'COUNTY_NAME',
]);

export const WELL_COLUMNS = Object.freeze([
  'OIL_GAS_CODE',
  'DISTRICT_NO',
  'LEASE_NO',
  'API_COUNTY_CODE',
  'API_UNIQUE_NO',
  'DISTRICT_NAME',
]);

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function num(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s || null;
}

/** `202607` → `2026-07`; anything else → null. */
export function cycleMonth(value) {
  const m = /^(\d{4})(\d{2})$/.exec(String(value ?? '').trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

/** The facility id: `TX-08-O-012345` (district name, oil or gas, lease or gas well id). */
export function facilityId(district, oilGas, leaseNo) {
  return `TX-${district}-${oilGas}-${String(leaseNo).trim()}`;
}

/** Column positions for a DSV header; a missing column fails by name. */
export function columnIndex(headerLine, required, what) {
  const header = headerLine.replace(/\r$/, '').split('}');
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length)
    throw new Error(
      `tx ${what}: upstream columns have moved — missing ${missing.join(', ')}`,
    );
  return Object.fromEntries(required.map((c) => [c, header.indexOf(c)]));
}

/** The file rows of one share page (name, date, size and the link's row id). */
export function parseShareListing(html) {
  return [
    ...String(html).matchAll(
      /<a id="(fileTable:\d+:[^"]+)"[^>]*>([^<]+)<\/a><\/td><td[^>]*>([^<]+)<\/td><td[^>]*>([^<]+)</g,
    ),
  ].map((m) => ({ rowId: m[1], name: m[2], modified: m[3], size: m[4] }));
}

/** `9/27/26 6:01:52 AM` → `2026-09-27`. */
export function shareDate(modified) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})\b/.exec(String(modified ?? ''));
  if (!m) return null;
  return `20${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * Surface locations from a well layer's DBF: 8-digit API → [lat, lon] in
 * NAD83 (RRC's own columns), six decimals. Rows without both are skipped.
 */
export function readSurfaceDbf(buffer) {
  const count = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  let offset = 1;
  for (let at = 32; buffer[at] !== 0x0d; at += 32) {
    const name = buffer
      .subarray(at, at + 11)
      .toString('latin1')
      .replace(/\0.*$/s, '');
    const length = buffer[at + 16];
    fields.push({ name, offset, length });
    offset += length;
  }
  const field = (name) => {
    const f = fields.find((x) => x.name === name);
    if (!f) throw new Error(`tx well layer: no ${name} column`);
    return f;
  };
  const api = field('API');
  const lat = field('LAT83');
  const lon = field('LONG83');
  const out = new Map();
  for (let r = 0; r < count; r += 1) {
    const base = headerLength + r * recordLength;
    if (buffer[base] === 0x2a) continue; // deleted record
    const read = (f) =>
      buffer
        .subarray(base + f.offset, base + f.offset + f.length)
        .toString('latin1')
        .trim();
    const id = read(api);
    const y = num(read(lat));
    const x = num(read(lon));
    if (!/^\d{8}$/.test(id) || y === null || x === null || !y || !x) continue;
    if (!out.has(id))
      out.set(id, [Math.round(y * 1e6) / 1e6, Math.round(x * 1e6) / 1e6]);
  }
  return out;
}

/**
 * Whether a county (RRC name, upper case) belongs to a slice: `only` lists
 * the slice's counties, `except` the ones another slice of the same
 * districts takes; neither means every county of the districts.
 */
export function countyFilter(counties) {
  if (counties?.only) {
    const only = new Set(counties.only);
    return (name) => only.has(name);
  }
  if (counties?.except) {
    const except = new Set(counties.except);
    return (name) => !except.has(name);
  }
  return () => true;
}

/**
 * Fold PDQ county-lease rows into facilities for one slice. `add` takes the
 * split fields of one row; rows outside the districts, the counties or the
 * months are ignored. Volumes of a lease that spans counties are summed over
 * the slice's counties only (a lease on a slice boundary shows its own share
 * on each side); the facility's county is the one with the most gas and oil
 * over the window.
 */
export function createSliceFold({ districts, counties, months, columns }) {
  const monthAt = new Map(months.map((m, i) => [m, i]));
  const wanted = new Set(districts);
  const inCounty = countyFilter(counties);
  const countyCodes = new Set();
  const facilities = new Map();
  const operators = [];
  const operatorId = new Map();
  const stats = { rows: 0, kept: 0, notFiled: 0 };
  const c = columns;
  const intern = (name) => {
    if (name === null) return -1;
    let id = operatorId.get(name);
    if (id === undefined) {
      id = operators.length;
      operators.push(name);
      operatorId.set(name, id);
    }
    return id;
  };
  function add(f) {
    stats.rows += 1;
    const district = f[c.DISTRICT_NAME];
    if (!wanted.has(district)) return;
    const at = monthAt.get(cycleMonth(f[c.CYCLE_YEAR_MONTH]));
    if (at === undefined) return;
    if (!inCounty(text(f[c.COUNTY_NAME]))) return;
    countyCodes.add(String(f[c.COUNTY_NO]).trim().padStart(3, '0'));
    stats.kept += 1;
    if (f[c.PROD_REPORT_FILED_FLAG] !== 'Y') {
      stats.notFiled += 1;
      return;
    }
    const oilGas = f[c.OIL_GAS_CODE];
    const id = facilityId(district, oilGas, f[c.LEASE_NO]);
    let facility = facilities.get(id);
    if (!facility) {
      facility = {
        id,
        district,
        oilGas,
        leaseNo: String(f[c.LEASE_NO]).trim(),
        gas: new Float64Array(months.length).fill(NaN),
        oil: new Float64Array(months.length).fill(NaN),
        operator: new Int32Array(months.length).fill(-1),
        counties: new Map(),
        newest: -1,
        name: null,
        field: null,
      };
      facilities.set(id, facility);
    }
    const oil = num(f[c.CNTY_LSE_OIL_PROD_VOL]);
    const cond = num(f[c.CNTY_LSE_COND_PROD_VOL]);
    const gas = num(f[c.CNTY_LSE_GAS_PROD_VOL]);
    const csgd = num(f[c.CNTY_LSE_CSGD_PROD_VOL]);
    if (oil !== null || cond !== null)
      facility.oil[at] =
        (Number.isNaN(facility.oil[at]) ? 0 : facility.oil[at]) +
        (oil ?? 0) +
        (cond ?? 0);
    if (gas !== null || csgd !== null)
      facility.gas[at] =
        (Number.isNaN(facility.gas[at]) ? 0 : facility.gas[at]) +
        (gas ?? 0) +
        (csgd ?? 0);
    facility.operator[at] = intern(text(f[c.OPERATOR_NAME]));
    const county = text(f[c.COUNTY_NAME]);
    if (county)
      facility.counties.set(
        county,
        (facility.counties.get(county) ?? 0) +
          (gas ?? 0) +
          (csgd ?? 0) +
          (oil ?? 0) +
          (cond ?? 0) +
          1e-9,
      );
    if (at >= facility.newest) {
      facility.newest = at;
      const lease = text(f[c.LEASE_NAME]);
      const gasWell = text(f[c.GAS_WELL_NO]);
      facility.name =
        oilGas === 'G' && gasWell && lease && !lease.endsWith(` ${gasWell}`)
          ? `${lease} ${gasWell}`
          : (lease ?? facility.name);
      facility.field = text(f[c.FIELD_NAME]) ?? facility.field;
    }
  }
  return { add, facilities, operators, stats, countyCodes };
}

/** The facility's county: the one carrying most of its volume in the window. */
export function mainCounty(counties) {
  let best = null;
  let most = -1;
  for (const [county, volume] of [...counties].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    if (volume > most) {
      best = county;
      most = volume;
    }
  }
  return best;
}

/** Mean of the placed wells, six decimals; null when none is placed. */
export function centroid(points) {
  if (!points.length) return null;
  let lat = 0;
  let lon = 0;
  for (const [y, x] of points) {
    lat += y;
    lon += x;
  }
  return [
    Math.round((lat / points.length) * 1e6) / 1e6,
    Math.round((lon / points.length) * 1e6) / 1e6,
  ];
}

/** One month of a folded slice as reader rows (the shape pa.mjs emits). */
export function monthRows(fold, at, places) {
  const rows = [];
  for (const facility of fold.facilities.values()) {
    const gas = facility.gas[at];
    const oil = facility.oil[at];
    const operator = facility.operator[at];
    if (Number.isNaN(gas) && Number.isNaN(oil) && operator < 0) continue;
    const place = places.get(facility.id) ?? null;
    rows.push({
      id: facility.id,
      fileNo: null,
      operator: operator >= 0 ? fold.operators[operator] : null,
      name: facility.name,
      county: facility.county ?? mainCounty(facility.counties),
      field: facility.field,
      pools: [],
      lat: place?.lat ?? null,
      lon: place?.lon ?? null,
      grain: facility.oilGas === 'G' ? 'gas well' : 'oil lease',
      wells: place?.wells ?? 0,
      oil: Number.isNaN(oil) ? null : oil,
      water: null,
      days: null,
      runs: null,
      gas: Number.isNaN(gas) ? null : gas,
      gasSold: null,
      flared: null,
    });
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* ------------------------------------------------------------------ *
 * Streaming
 * ------------------------------------------------------------------ */

/**
 * Call `onHeader(line)` once, then `onRow(fields)` for every data line of a
 * DSV entry, streamed (the county-lease table inflates to 12.8 GB).
 */
async function eachDsvLine(zipPath, entry, onHeader, onRow) {
  let header = null;
  let rest = '';
  const take = (raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line) return;
    if (header === null) {
      header = line;
      onHeader(line);
    } else onRow(line.split('}'));
  };
  for await (const chunk of openZipEntry(zipPath, entry)) {
    const lines = (rest + chunk.toString('latin1')).split('\n');
    rest = lines.pop();
    for (const raw of lines) take(raw);
  }
  if (rest) take(rest);
  if (header === null) throw new Error(`${zipPath}: ${entry} is empty`);
}

/** A small entry read whole (the date range table). */
async function readEntryText(zipPath, name) {
  const chunks = [];
  for await (const chunk of openZipEntry(zipPath, name)) chunks.push(chunk);
  return Buffer.concat(chunks).toString('latin1');
}

/* ------------------------------------------------------------------ *
 * The GoAnywhere shares
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

function createSession(link) {
  const jar = new Map();
  const take = (response) => {
    for (const c of response.headers.getSetCookie?.() ?? []) {
      const [k, v] = c.split(';')[0].split(/=(.*)/s);
      jar.set(k, v);
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const action = new URL(SHARE_ACTION, link).href;
  let viewState = null;
  let pageSize = 0;
  // The table page the server shows: a file link posts only from its page.
  let shown = 0;

  async function open() {
    const response = await fetch(link, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) throw new Error(`${link}: HTTP ${response.status}`);
    take(response);
    const html = await response.text();
    viewState = /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/.exec(
      html,
    )?.[1];
    if (!viewState) throw new Error(`${link}: no ViewState on the share page`);
    const files = parseShareListing(html);
    pageSize = Number(/rows:(\d+)/.exec(html)?.[1] ?? files.length);
    shown = 0;
    return {
      files,
      total: Number(/rowCount:(\d+)/.exec(html)?.[1] ?? files.length),
    };
  }

  /** PrimeFaces paging: an AJAX POST that re-renders the table from `first`. */
  async function showPage(first) {
    const response = await fetch(action, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: cookie(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Faces-Request': 'partial/ajax',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({
        'javax.faces.partial.ajax': 'true',
        'javax.faces.source': 'fileTable',
        'javax.faces.partial.execute': 'fileTable',
        'javax.faces.partial.render': 'fileTable',
        fileTable: 'fileTable',
        fileTable_pagination: 'true',
        fileTable_first: String(first),
        fileTable_rows: String(pageSize),
        fileTable_encodeFeature: 'true',
        fileList: 'fileList',
        fileList_SUBMIT: '1',
        'javax.faces.ViewState': viewState,
      }),
    });
    take(response);
    const page = parseShareListing(await response.text());
    if (!page.length) throw new Error(`${link}: page at ${first} is empty`);
    shown = first;
    return page;
  }

  return {
    /** Every file on the share, all pages. */
    async list() {
      const { files, total } = await open();
      for (let first = files.length; first < total; first += pageSize)
        files.push(...(await showPage(first)));
      return files;
    },
    /** Stream one listed file to `target` (via `.part`); returns its byte count. */
    async download(file, target) {
      if (!viewState) await open();
      const row = Number(file.rowId.split(':')[1]);
      const page = pageSize ? Math.floor(row / pageSize) * pageSize : 0;
      if (page !== shown) await showPage(page);
      const post = await fetch(action, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookie(),
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: link,
        },
        body: new URLSearchParams({
          fileList_SUBMIT: '1',
          'javax.faces.ViewState': viewState,
          [file.rowId]: file.rowId,
        }),
      });
      take(post);
      const location = post.headers.get('location');
      if (post.status !== 302 || !location) {
        viewState = null; // the next attempt reopens the share
        throw new Error(`${file.name}: the share answered ${post.status}`);
      }
      const response = await fetch(new URL(location, link), {
        headers: { 'User-Agent': USER_AGENT, Cookie: cookie(), Referer: link },
      });
      const disposition = response.headers.get('content-disposition') ?? '';
      if (!response.ok || !disposition.includes(file.name))
        throw new Error(
          `${file.name}: download answered ${response.status} (${disposition || 'no attachment'})`,
        );
      const expected = Number(response.headers.get('content-length'));
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(`${target}.part`),
      );
      const got = statSync(`${target}.part`).size;
      if (expected && got !== expected)
        throw new Error(`${file.name}: ${got} of ${expected} bytes`);
      renameSync(`${target}.part`, target);
      writeFileSync(
        `${target}.retrieved`,
        `${new Date().toISOString().slice(0, 10)}\n`,
      );
      return got;
    },
  };
}

/* ------------------------------------------------------------------ *
 * The archive
 * ------------------------------------------------------------------ */

const DUMP_PATTERN = /^PDQ_DSV_(\d{4}-\d{2}-\d{2})\.zip$/;

function newestArchived(dir, pattern) {
  if (!existsSync(dir)) return null;
  return (
    readdirSync(dir)
      .filter((name) => pattern.test(name))
      .sort()
      .pop() ?? null
  );
}

function retrievedDate(file) {
  const sidecar = `${file}.retrieved`;
  if (existsSync(sidecar)) return readFileSync(sidecar, 'utf8').trim();
  return statSync(file).mtime.toISOString().slice(0, 10);
}

/** sha256 of a large file, cached beside it (the dump takes ~15 s to hash). */
async function sha256Of(file) {
  const sidecar = `${file}.sha256`;
  const { size, mtimeMs } = statSync(file);
  if (existsSync(sidecar)) {
    const [hash, bytes, mtime] = readFileSync(sidecar, 'utf8')
      .trim()
      .split(' ');
    if (Number(bytes) === size && Number(mtime) === Math.round(mtimeMs))
      return hash;
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const hex = hash.digest('hex');
  writeFileSync(sidecar, `${hex} ${size} ${Math.round(mtimeMs)}\n`);
  return hex;
}

/** The dump to read: the newest archived one, or (refresh / none) the share's. */
async function ensureDump(cacheDir, { refresh = false, replay = false, log }) {
  mkdirSync(cacheDir, { recursive: true });
  const archived = newestArchived(cacheDir, DUMP_PATTERN);
  if (replay || (archived && !refresh))
    return archived ? path.join(cacheDir, archived) : null;
  const session = createSession(RRC_PDQ_LINK);
  const files = await withRetry('PDQ share', () => session.list(), log);
  const file = files.find((f) => f.name === 'PDQ_DSV.zip');
  if (!file) throw new Error('PDQ share: no PDQ_DSV.zip listed');
  const date = shareDate(file.modified);
  const target = path.join(cacheDir, `PDQ_DSV_${date}.zip`);
  if (!existsSync(target)) {
    log(`downloading PDQ_DSV.zip (${file.size}, ${date}); about an hour`);
    await withRetry(
      'PDQ_DSV.zip',
      async () => {
        await session.list();
        return session.download(file, target);
      },
      log,
    );
  }
  return target;
}

/** The county well layers for `counties` (RRC codes), archived by share date. */
async function ensureWellLayers(
  cacheDir,
  counties,
  { refresh = false, replay = false, log },
) {
  const root = path.join(cacheDir, 'wells');
  mkdirSync(root, { recursive: true });
  const dated = readdirSync(root)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  let dir = dated.length ? path.join(root, dated.at(-1)) : null;
  const missing = (d) =>
    counties.filter((c) => !existsSync(path.join(d, `well${c}.zip`)));
  if (replay) {
    if (!dir || missing(dir).length)
      throw new Error(
        `--replay: well layers ${dir ? missing(dir).join(', ') : 'all'} are not archived`,
      );
    return dir;
  }
  if (dir && !refresh && !missing(dir).length) return dir;
  const session = createSession(RRC_WELLS_LINK);
  const files = await withRetry('wells share', () => session.list(), log);
  const byName = new Map(files.map((f) => [f.name, f]));
  const date = files
    .map((f) => shareDate(f.modified))
    .sort()
    .pop();
  if (!dir || refresh) dir = path.join(root, date);
  mkdirSync(dir, { recursive: true });
  for (const county of missing(dir)) {
    const file = byName.get(`well${county}.zip`);
    if (!file) throw new Error(`wells share: no well${county}.zip`);
    log(`downloading well${county}.zip (${file.size})`);
    await withRetry(
      file.name,
      () => session.download(file, path.join(dir, file.name)),
      log,
    );
  }
  return dir;
}

/** 8-digit API → [lat, lon] for one county's surface layer. */
function readCountySurfaces(zipFile, county) {
  const name = `well${county}s.dbf`;
  const entry = listZipEntries(zipFile).get(name);
  if (!entry) throw new Error(`${zipFile}: no ${name}`);
  const bytes = readFileSync(zipFile);
  const at = entry.localOffset;
  const start =
    at + 30 + bytes.readUInt16LE(at + 26) + bytes.readUInt16LE(at + 28);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  return readSurfaceDbf(entry.method === 8 ? inflateRawSync(raw) : raw);
}

/* ------------------------------------------------------------------ *
 * The slice
 * ------------------------------------------------------------------ */

/** The dump's month range (`GP_DATE_RANGE_CYCLE_DATA_TABLE`). */
async function dumpRange(zipPath) {
  const sidecar = `${zipPath}.range.json`;
  if (existsSync(sidecar)) return JSON.parse(readFileSync(sidecar, 'utf8'));
  const table = (await readEntryText(zipPath, PDQ_TABLES.dateRange))
    .trim()
    .split(/\r?\n/);
  const c = columnIndex(
    table[0],
    ['OLDEST_PROD_CYCLE_YEAR_MONTH', 'NEWEST_PROD_CYCLE_YEAR_MONTH'],
    'date range',
  );
  const f = table[1].split('}');
  const range = {
    oldest: cycleMonth(f[c.OLDEST_PROD_CYCLE_YEAR_MONTH]),
    newest: cycleMonth(f[c.NEWEST_PROD_CYCLE_YEAR_MONTH]),
  };
  writeFileSync(sidecar, `${JSON.stringify(range)}\n`);
  return range;
}

function monthsBetween(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * One pass over the dump for a slice: fold the county-lease rows from
 * `firstMonth` to the dump's newest month, then map the slice's leases to
 * their wells (API county + unique number).
 */
async function scanSlice({
  slice,
  districts,
  counties,
  zipPath,
  firstMonth,
  log,
}) {
  const range = await dumpRange(zipPath);
  const months = monthsBetween(firstMonth, range.newest);
  log(
    `tx ${slice}: streaming ${PDQ_TABLES.countyLease} for districts ${districts.join(', ')}, ${months[0]} to ${months.at(-1)}`,
  );
  const started = Date.now();
  let fold = null;
  let lines = 0;
  await eachDsvLine(
    zipPath,
    PDQ_TABLES.countyLease,
    (header) => {
      fold = createSliceFold({
        districts,
        counties,
        months,
        columns: columnIndex(
          header,
          COUNTY_LEASE_COLUMNS,
          'county lease table',
        ),
      });
    },
    (fields) => {
      fold.add(fields);
      lines += 1;
      if (lines % 10_000_000 === 0)
        log(
          `  ${(lines / 1e6).toFixed(0)}M rows, ${fold.facilities.size.toLocaleString()} ${slice} leases so far (${Math.round((Date.now() - started) / 1000)} s)`,
        );
    },
  );
  log(
    `  ${fold.stats.rows.toLocaleString()} rows read, ${fold.stats.kept.toLocaleString()} in the slice (${fold.stats.notFiled.toLocaleString()} marked not filed), ${fold.facilities.size.toLocaleString()} leases (${Math.round((Date.now() - started) / 1000)} s)`,
  );
  for (const facility of fold.facilities.values())
    facility.county = mainCounty(facility.counties);

  // Leases to wells.
  const wellsOf = new Map();
  let c = null;
  await eachDsvLine(
    zipPath,
    PDQ_TABLES.wells,
    (header) => {
      c = columnIndex(header, WELL_COLUMNS, 'well completion table');
    },
    (f) => {
      const district = f[c.DISTRICT_NAME];
      if (!districts.includes(district)) return;
      const id = facilityId(district, f[c.OIL_GAS_CODE], f[c.LEASE_NO]);
      if (!fold.facilities.has(id)) return;
      const county = String(f[c.API_COUNTY_CODE]).trim().padStart(3, '0');
      const unique = String(f[c.API_UNIQUE_NO]).trim().padStart(5, '0');
      if (!/^\d{3}$/.test(county) || !/^\d{5}$/.test(unique)) return;
      let list = wellsOf.get(id);
      if (!list) wellsOf.set(id, (list = new Set()));
      list.add(`${county}${unique}`);
    },
  );
  // A lease on a slice boundary is drawn from its wells in the slice's
  // counties; one with none there keeps all its wells.
  for (const [id, apis] of wellsOf) {
    const inside = [...apis].filter((api) =>
      fold.countyCodes.has(api.slice(0, 3)),
    );
    if (inside.length && inside.length < apis.size)
      wellsOf.set(id, new Set(inside));
  }
  const wellCounties = [
    ...new Set(
      [...wellsOf.values()].flatMap((s) => [...s].map((a) => a.slice(0, 3))),
    ),
  ].sort();
  log(
    `  ${wellsOf.size.toLocaleString()} leases have wells on file, in ${wellCounties.length} counties`,
  );
  return { months, fold, wellsOf, counties: wellCounties };
}

function parsedKey(zipSha, wellsDate, districts, counties) {
  return createHash('sha256')
    .update(
      `${zipSha} ${wellsDate} ${districts.join(',')} ${JSON.stringify(counties ?? null)} v${PARSED_VERSION}`,
    )
    .digest('hex')
    .slice(0, 12);
}

/** `RRC districts 08, 8A, 7C except …` / `… counties …`, for the source line. */
function sliceWords(districts, counties) {
  const d = `RRC districts ${districts.join(', ')}`;
  const title = (name) =>
    name.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  if (counties?.only)
    return `${d}: ${counties.only.map(title).join(', ')} counties`;
  if (counties?.except)
    return `${d} except ${counties.except.map(title).join(', ')} counties`;
  return d;
}

/* ------------------------------------------------------------------ *
 * The reader
 * ------------------------------------------------------------------ */

/**
 * A Texas reader for one slice of RRC districts. The first `readMonth` of a
 * build triggers the slice pass (from that month to the dump's newest); every
 * later month is read from the parsed files it wrote.
 */
export function createTexasReader({ slice, districts, counties, name }) {
  const source = Object.freeze({
    state: 'TX',
    id: `tx-rrc-pdq-${slice}`,
    name: `Texas Railroad Commission Production Data Query dump, ${sliceWords(districts, counties)} (${name}); well locations from the RRC well layers by county`,
    short: 'Texas RRC',
    url: 'https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/',
    filePattern: `${RRC_PDQ_LINK} PDQ_DSV.zip (monthly, last Saturday) + ${RRC_WELLS_LINK} well<county>.zip (twice weekly)`,
    grain: 'lease',
    cadence: 'monthly',
    lagDays: 50,
    datum: 'NAD83 (RRC’s LAT83 / LONG83 columns in the well layers)',
    transform:
      'none — RRC publishes NAD83 beside the NAD27 originals; an oil lease is drawn at the centroid of its wells, a gas well at its own surface location',
    license:
      'Public record of the Railroad Commission of Texas; RRC site policies grant permission for noncommercial use, and the founder decided on 2026-09-28 to show it on the hosted site (docs/LICENCES.md)',
    finality:
      'a monthly snapshot: RRC revises earlier months as corrected reports arrive, so each dump can change past months; --refresh reads the newest dump',
    precision: 'well coordinates rounded to six decimals',
    lookback: 12,
    reporterRule:
      'oil leases and gas wells with a production report filed for the month (PROD_REPORT_FILED_FLAG Y)',
  });

  let state = null;

  async function prepare(month, { cacheDir, refresh, replay, log }) {
    // Settled once per build: the builder reads the window oldest first.
    if (state && state.first <= month) return state;
    const zipPath = await ensureDump(cacheDir, { refresh, replay, log });
    if (!zipPath) return null;
    const zipSha = await sha256Of(zipPath);
    const range = await dumpRange(zipPath);
    const parsedDir = path.join(cacheDir, 'parsed', slice);
    mkdirSync(parsedDir, { recursive: true });
    const indexFile = path.join(parsedDir, `${zipSha.slice(0, 12)}.index.json`);
    const cached = existsSync(indexFile)
      ? JSON.parse(readFileSync(indexFile, 'utf8'))
      : null;
    if (cached && cached.first <= month && !refresh) {
      state = { zipPath, zipSha, range, parsedDir, ...cached };
      return state;
    }
    if (replay)
      throw new Error(
        `--replay: no parsed ${slice} months for ${path.basename(zipPath)} from ${month}`,
      );
    const scan = await scanSlice({
      slice,
      districts,
      counties,
      zipPath,
      firstMonth: month,
      log,
    });
    const wellsDir = await ensureWellLayers(cacheDir, scan.counties, {
      refresh,
      replay,
      log,
    });
    const wellsDate = path.basename(wellsDir);
    const surfaces = new Map();
    for (const county of scan.counties) {
      for (const [api, point] of readCountySurfaces(
        path.join(wellsDir, `well${county}.zip`),
        county,
      ))
        surfaces.set(api, point);
    }
    const places = new Map();
    let unplacedWells = 0;
    for (const [id, apis] of scan.wellsOf) {
      const points = [];
      for (const api of apis) {
        const point = surfaces.get(api);
        if (point) points.push(point);
        else unplacedWells += 1;
      }
      const at = centroid(points);
      if (at) places.set(id, { lat: at[0], lon: at[1], wells: apis.size });
    }
    log(
      `  placed ${places.size.toLocaleString()} of ${scan.fold.facilities.size.toLocaleString()} leases (${unplacedWells.toLocaleString()} wells without a surface point in the ${wellsDate} layers)`,
    );
    const key = parsedKey(zipSha, wellsDate, districts, counties);
    scan.months.forEach((m, at) => {
      const rows = monthRows(scan.fold, at, places);
      writeFileSync(
        path.join(parsedDir, `${m.replace('-', '_')}.${key}.json`),
        JSON.stringify({
          month: m,
          rows,
          unplaced: rows.filter((r) => r.lat === null).length,
        }),
      );
    });
    const index = {
      first: scan.months[0],
      newest: range.newest,
      key,
      wellsDate,
      wellCounties: scan.counties,
      stats: scan.fold.stats,
      unplacedWells,
    };
    writeFileSync(indexFile, `${JSON.stringify(index)}\n`);
    state = { zipPath, zipSha, range, parsedDir, ...index };
    return state;
  }

  async function monthAvailable(month, { cacheDir, replay = false, log }) {
    const zipPath = await ensureDump(cacheDir, {
      replay,
      log: log ?? ((line) => process.stdout.write(`${line}\n`)),
    });
    if (!zipPath) return false;
    const range = await dumpRange(zipPath);
    return month >= range.oldest && month <= range.newest;
  }

  async function readMonth(
    month,
    { cacheDir, refresh = false, replay = false, log = () => {} } = {},
  ) {
    if (!/^\d{4}-\d{2}$/.test(month))
      throw new TypeError(`tx: month "${month}" is not YYYY-MM`);
    const s = await prepare(month, { cacheDir, refresh, replay, log });
    if (!s || month > s.newest) return null;
    const file = path.join(
      s.parsedDir,
      `${month.replace('-', '_')}.${s.key}.json`,
    );
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const zipName = path.basename(s.zipPath);
    return {
      month,
      file: zipName,
      url: RRC_PDQ_LINK,
      bytes: statSync(s.zipPath).size,
      sha256: s.zipSha,
      retrieved: retrievedDate(s.zipPath),
      sheet: PDQ_TABLES.countyLease,
      poolRows: parsed.rows.length,
      wells: parsed.rows.length,
      unplaced: parsed.unplaced,
      reportDate: `${month}-01`,
      skippedRows: 0,
      skippedSheet: null,
      textCells: 0,
      anomalies: [],
      rows: parsed.rows,
    };
  }

  return Object.freeze({ source, monthAvailable, readMonth });
}

/**
 * The Permian's Texas side (plan §14.10 region 3), split by county into
 * three layers (founder, 2026-09-28: one layer of 76,000 leases broke the
 * size and performance budgets, and a Delaware / rest split still left
 * 56,800 leases on one side). The Delaware Basin takes the far-west counties
 * of district 08, the Midland Basin its core counties, and the third layer
 * every other county of districts 08, 8A and 7C (the Central Basin Platform,
 * the Northwest and Eastern shelves, the Val Verde Basin and Ozona), so the
 * three always sum to the three districts.
 */
export const DELAWARE_COUNTIES = Object.freeze([
  'BREWSTER',
  'CULBERSON',
  'EL PASO',
  'HUDSPETH',
  'JEFF DAVIS',
  'LOVING',
  'PECOS',
  'PRESIDIO',
  'REEVES',
  'WARD',
  'WINKLER',
]);

export const MIDLAND_COUNTIES = Object.freeze([
  'BORDEN',
  'DAWSON',
  'GLASSCOCK',
  'HOWARD',
  'IRION',
  'MARTIN',
  'MIDLAND',
  'MITCHELL',
  'REAGAN',
  'STERLING',
  'UPTON',
]);

const PERMIAN_DISTRICTS = Object.freeze(['08', '8A', '7C']);

export const delawareTexasReader = createTexasReader({
  slice: 'permian-delaware',
  districts: PERMIAN_DISTRICTS,
  counties: { only: DELAWARE_COUNTIES },
  name: 'Delaware Basin',
});

export const midlandTexasReader = createTexasReader({
  slice: 'permian-midland',
  districts: PERMIAN_DISTRICTS,
  counties: { only: MIDLAND_COUNTIES },
  name: 'Midland Basin',
});

export const platformTexasReader = createTexasReader({
  slice: 'permian-platform',
  districts: PERMIAN_DISTRICTS,
  counties: { except: [...DELAWARE_COUNTIES, ...MIDLAND_COUNTIES] },
  name: 'Central Basin Platform, shelves and Val Verde',
});
