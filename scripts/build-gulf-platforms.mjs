/**
 * Build src/data/local_data/bsee_gulf/ — the Gulf of Mexico platform
 * production bundle for row 11 (docs/COMMODITIES-PLAN.md §13, R11.1 to R11.8).
 *
 * Sources, both public-domain bulk files from BSEE's data center:
 *   https://www.data.bsee.gov/Production/Files/ProdByPlatformRawData.zip
 *     one row per platform structure per month since 1957 (1.7 M rows,
 *     218 MB of text inside a 20 MB zip): gas, oil, water, BOE, producing
 *     wells, operator, install and removal dates
 *   https://www.data.bsee.gov/Platform/Files/PlatStrucRawData.zip
 *     every structure with latitude/longitude, water depth, type, major flag,
 *     install and removal dates, and the incidents-of-non-compliance count
 *
 * ── The current month is a rule, not the newest row ─────────────────────
 *
 * Operators file late, so the newest months hold a fraction of the structures
 * that will report (2026-09-21: 2026-06 331 structures, 2026-07 159, 2026-08
 * 2). `src/layers/production/completeness.js` picks the newest month whose
 * reporter count is at least 90 % of the trailing-twelve median; the table
 * behind that verdict travels in the bundle so the panel can say which months
 * are still filling.
 *
 * ── What the bundle carries ──────────────────────────────────────────────
 *
 * Installed structures only (no removal date) with coordinates: identity, a
 * trailing 120-month series of gas, oil, water and producing wells, and a
 * lifetime summary (first month, peak, cumulative volumes, months producing).
 * Removed structures are counted, never bundled. BOE is carried as BSEE filed
 * it, because their rounding cannot be reproduced from the totals.
 *
 * Two passes over the production text: the first counts reporters per month
 * and accumulates lifetimes, the second fills the window once the current
 * month is known. The text is streamed both times; nothing holds it whole.
 *
 * Usage:
 *   node scripts/build-gulf-platforms.mjs            # download if absent, build
 *   node scripts/build-gulf-platforms.mjs --refresh  # re-download both zips
 *   node scripts/build-gulf-platforms.mjs --replay   # never touch the network
 *   node scripts/build-gulf-platforms.mjs --check    # rebuild and diff against the committed bytes
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { openZipEntry } from './zip-entry.mjs';
import { readArgs } from './arcgis-paging.mjs';
import {
  COMPLETENESS_BASELINE_FLOOR,
  COMPLETENESS_THRESHOLD,
  COMPLETENESS_WINDOW,
  newestCompleteMonth,
} from '../src/layers/production/completeness.js';
import { daysInMonth } from '../src/layers/production/records.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'src', 'data', 'local_data', 'bsee_gulf');
const CACHE_DIR = path.join(root, '.gev-cache', 'bsee');

const UPSTREAM = Object.freeze({
  production: {
    url: 'https://www.data.bsee.gov/Production/Files/ProdByPlatformRawData.zip',
    file: 'ProdByPlatformRawData.zip',
    entry: 'ProdByPlatformRawData/mv_prod_by_platform_all.txt',
  },
  structures: {
    url: 'https://www.data.bsee.gov/Platform/Files/PlatStrucRawData.zip',
    file: 'PlatStrucRawData.zip',
    entry: 'PlatStrucRawData/mv_platstruc_structures.txt',
    incidents: 'PlatStrucRawData/mv_platstruc_inccount.txt',
  },
});

/** The columns each file must carry; a renamed column fails the build by name. */
const PRODUCTION_COLUMNS = [
  'COMPLEX_ID_NUM',
  'STRUCTURE_NUMBER',
  'AREA_CODE',
  'BLOCK_NUMBER',
  'LEASE_NUMBER',
  'STRUCTURE_NAME',
  'INSTALL_DATE',
  'REMOVAL_DATE',
  'PF_OPERATOR',
  'PF_OPERATOR_NUM',
  'PRODUCTION_DATE',
  'PRODUCING_WELLS',
  'BOPD',
  'MCFPD',
  'BOEPD',
  'BWPD',
  'REGION_CODE',
];
const STRUCTURE_COLUMNS = [
  'AREA_CODE',
  'BLOCK_NUMBER',
  'FIELD_NAME_CODE',
  'STRUCTURE_NAME',
  'STRUCTURE_NUMBER',
  'STRUC_TYPE_CODE',
  'BUS_ASC_NAME',
  'COMPLEX_ID_NUM',
  'MAJ_STRUC_FLAG',
  'INSTALL_DATE',
  'REMOVAL_DATE',
  'DISTRICT_CODE',
  'HELIPORT_FLAG',
  'LEASE_NUMBER',
  'WATER_DEPTH',
  'LATITUDE',
  'LONGITUDE',
  'NAD_YEAR_CD',
];

const WINDOW_MONTHS = 120;
const TABLE_TAIL = 8;

/* ------------------------------------------------------------------ *
 * Small parsers
 * ------------------------------------------------------------------ */

/** One CSV line with double-quoted fields (`""` escapes a quote); no embedded newlines in these files. */
export function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/** `3/31/2002` or `8/1/2024 7:36:53 AM` → `2002-03-31`; blank → null. */
export function isoDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** `3/31/2002` → `2002-03`. */
function isoMonth(value) {
  const date = isoDate(value);
  return date ? date.slice(0, 7) : null;
}

function int(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function float(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function trimmed(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function assertColumns(header, expected, label) {
  const missing = expected.filter((column) => !header.includes(column));
  if (missing.length) {
    throw new Error(
      `${label}: upstream columns have moved — missing ${missing.join(', ')}`,
    );
  }
}

/** Twelve-month axis arithmetic on `YYYY-MM`. */
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const mon = (total % 12) + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Fetch / archive
 * ------------------------------------------------------------------ */

async function ensureArchive(spec, { refresh, replay }) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const target = path.join(CACHE_DIR, spec.file);
  if (existsSync(target) && !refresh) return target;
  if (replay) throw new Error(`--replay: ${spec.file} is not in ${CACHE_DIR}`);
  process.stdout.write(`fetching ${spec.url}\n`);
  const response = await fetch(spec.url);
  if (!response.ok) throw new Error(`${spec.url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);
  writeFileSync(
    path.join(CACHE_DIR, `${spec.file}.retrieved`),
    `${new Date().toISOString().slice(0, 10)}\n`,
  );
  process.stdout.write(`  ${bytes.length.toLocaleString()} bytes archived\n`);
  return target;
}

/** The day a zip was retrieved: the sidecar written at download, else the file's mtime. */
function retrievedDate(zipPath) {
  const sidecar = `${zipPath}.retrieved`;
  if (existsSync(sidecar)) return readFileSync(sidecar, 'utf8').trim();
  return statSync(zipPath).mtime.toISOString().slice(0, 10);
}

/** Read a whole (small) zip entry as text, hashing it on the way. */
async function readEntryText(zipPath, entryName) {
  const hash = createHash('sha256');
  const chunks = [];
  for await (const chunk of openZipEntry(zipPath, entryName)) {
    hash.update(chunk);
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return {
    text: buffer.toString('utf8'),
    bytes: buffer.length,
    sha256: hash.digest('hex'),
  };
}

/** Walk a (large) zip entry line by line, hashing the bytes; `onRow(fields, columns)` per data row. */
async function walkEntryRows(zipPath, entryName, expectedColumns, onRow) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = openZipEntry(zipPath, entryName);
  stream.on('data', (chunk) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let columns = null;
  let rows = 0;
  for await (const line of lines) {
    if (!line) continue;
    if (!columns) {
      columns = parseCsvLine(line).map((c) => c.trim());
      assertColumns(columns, expectedColumns, entryName);
      continue;
    }
    const fields = parseCsvLine(line);
    if (fields.length < columns.length) continue;
    rows += 1;
    onRow(fields, columns);
  }
  return { rows, bytes, sha256: hash.digest('hex') };
}

/* ------------------------------------------------------------------ *
 * Structures
 * ------------------------------------------------------------------ */

function parseTable(text, expectedColumns, label) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const columns = parseCsvLine(lines[0]).map((c) => c.trim());
  assertColumns(columns, expectedColumns, label);
  const index = new Map(columns.map((c, i) => [c, i]));
  const get = (fields, column) => fields[index.get(column)];
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return (column) => get(fields, column);
  });
}

function loadStructures(text) {
  const rows = parseTable(text, STRUCTURE_COLUMNS, 'structures');
  const byKey = new Map();
  for (const get of rows) {
    const complexId = trimmed(get('COMPLEX_ID_NUM'));
    const structureNumber = trimmed(get('STRUCTURE_NUMBER'));
    if (!complexId || !structureNumber) continue;
    const key = `${complexId}-${structureNumber}`;
    byKey.set(key, {
      id: key,
      complexId,
      structureNumber,
      name: trimmed(get('STRUCTURE_NAME')),
      area: trimmed(get('AREA_CODE')),
      block: trimmed(get('BLOCK_NUMBER')),
      field: trimmed(get('FIELD_NAME_CODE')),
      lease: trimmed(get('LEASE_NUMBER')),
      operator: trimmed(get('BUS_ASC_NAME')),
      type: trimmed(get('STRUC_TYPE_CODE')),
      major: trimmed(get('MAJ_STRUC_FLAG')) === 'Y',
      heliport: trimmed(get('HELIPORT_FLAG')) === 'Y',
      installed: isoDate(get('INSTALL_DATE')),
      removed: isoDate(get('REMOVAL_DATE')),
      district: trimmed(get('DISTRICT_CODE')),
      waterDepthFt: int(get('WATER_DEPTH')),
      lat: float(get('LATITUDE')),
      lon: float(get('LONGITUDE')),
      nad: trimmed(get('NAD_YEAR_CD')),
    });
  }
  return byKey;
}

function loadIncidents(text) {
  const rows = parseTable(
    text,
    ['ID_NUMBER', 'STRUCTURE_NUMBER', 'INC_COUNT'],
    'incidents',
  );
  const byKey = new Map();
  for (const get of rows) {
    const key = `${trimmed(get('ID_NUMBER'))}-${trimmed(get('STRUCTURE_NUMBER'))}`;
    byKey.set(key, (byKey.get(key) ?? 0) + (int(get('INC_COUNT')) ?? 0));
  }
  return byKey;
}

/* ------------------------------------------------------------------ *
 * Production, two passes
 * ------------------------------------------------------------------ */

function productionReader(columns) {
  const index = new Map(columns.map((c, i) => [c, i]));
  return (fields, column) => fields[index.get(column)];
}

/** Pass 1: reporters per month, the structure set, lifetimes. */
async function passOne(zipPath) {
  const reporters = new Map();
  const lifetimes = new Map();
  const seen = new Set();
  const regionOf = new Map();
  let reader = null;
  const stats = await walkEntryRows(
    zipPath,
    UPSTREAM.production.entry,
    PRODUCTION_COLUMNS,
    (fields, columns) => {
      reader ??= productionReader(columns);
      const get = (column) => reader(fields, column);
      const key = `${trimmed(get('COMPLEX_ID_NUM'))}-${trimmed(get('STRUCTURE_NUMBER'))}`;
      const month = isoMonth(get('PRODUCTION_DATE'));
      if (!month) return;
      seen.add(key);
      const gas = int(get('MCFPD')) ?? 0;
      const oil = int(get('BOPD')) ?? 0;
      if (gas > 0 || oil > 0) {
        reporters.set(month, (reporters.get(month) ?? 0) + 1);
        const days = daysInMonth(month);
        let life = lifetimes.get(key);
        if (!life) {
          life = {
            firstMonth: month,
            lastMonth: month,
            monthsProducing: 0,
            peakGasMcfd: 0,
            peakGasMonth: null,
            peakOilBopd: 0,
            peakOilMonth: null,
            cumGasMcf: 0,
            cumOilBbl: 0,
          };
          lifetimes.set(key, life);
        }
        if (month < life.firstMonth) life.firstMonth = month;
        if (month > life.lastMonth) life.lastMonth = month;
        life.monthsProducing += 1;
        life.cumGasMcf += gas * days;
        life.cumOilBbl += oil * days;
        if (
          gas > life.peakGasMcfd ||
          (gas === life.peakGasMcfd && month < (life.peakGasMonth ?? '9999'))
        ) {
          life.peakGasMcfd = gas;
          life.peakGasMonth = month;
        }
        if (oil > life.peakOilBopd) {
          life.peakOilBopd = oil;
          life.peakOilMonth = month;
        }
      }
      const region = trimmed(get('REGION_CODE'));
      if (region) regionOf.set(key, region);
    },
  );
  return { stats, reporters, lifetimes, seen, regionOf };
}

/** BSEE's OCS regions in the production file. The structures file is the Gulf's only. */
const GULF_REGION = 'G';
const REGION_NAMES = Object.freeze({
  G: 'Gulf of Mexico',
  P: 'Pacific',
  Y: 'Alaska',
});

/**
 * Pass 2: the window's series for the structures that will be bundled, plus
 * the current month's gas from every structure — bundled or not — so the
 * panel can say how much of what was filed is actually on the map.
 *
 * The production file spans three OCS regions but the structures file (and
 * this layer) is the Gulf's: measured 2026-06, Northstar in Alaska filed
 * 547 MMcf/d gross and thirteen Pacific platforms 25 MMcf/d, none placeable
 * here. They are counted by region, and Gulf gas from a structure since
 * removed, or one the structures file cannot place, is counted by reason —
 * nothing filed goes silently missing.
 */
async function passTwo(zipPath, months, wanted, structures) {
  const position = new Map(months.map((m, i) => [m, i]));
  const currentMonth = months[months.length - 1];
  const series = new Map();
  const filed = { structures: 0, gasMcfd: 0 };
  const unbundled = {
    removed: { structures: 0, gasMcfd: 0 },
    unplaced: { structures: 0, gasMcfd: 0 },
    unknown: { structures: 0, gasMcfd: 0 },
  };
  const outOfRegion = {};
  let reader = null;
  await walkEntryRows(
    zipPath,
    UPSTREAM.production.entry,
    PRODUCTION_COLUMNS,
    (fields, columns) => {
      reader ??= productionReader(columns);
      const get = (column) => reader(fields, column);
      const key = `${trimmed(get('COMPLEX_ID_NUM'))}-${trimmed(get('STRUCTURE_NUMBER'))}`;
      const month = isoMonth(get('PRODUCTION_DATE'));
      if (month === currentMonth) {
        const gas = int(get('MCFPD')) ?? 0;
        const region = trimmed(get('REGION_CODE')) ?? '?';
        if (gas > 0 && region !== GULF_REGION) {
          const bucket = (outOfRegion[region] ??= {
            name: REGION_NAMES[region] ?? `region ${region}`,
            structures: 0,
            gasMcfd: 0,
          });
          bucket.structures += 1;
          bucket.gasMcfd += gas;
        } else if (gas > 0) {
          filed.structures += 1;
          filed.gasMcfd += gas;
          if (!wanted.has(key)) {
            const known = structures.get(key);
            const reason = !known
              ? 'unknown'
              : known.removed
                ? 'removed'
                : 'unplaced';
            unbundled[reason].structures += 1;
            unbundled[reason].gasMcfd += gas;
          }
        }
      }
      if (!wanted.has(key)) return;
      const at = position.get(month);
      if (at === undefined) return;
      let entry = series.get(key);
      if (!entry) {
        entry = {
          gas: new Array(months.length).fill(null),
          oil: new Array(months.length).fill(null),
          water: new Array(months.length).fill(null),
          // BSEE's own BOE as filed: it is not exactly oil + gas / 5.62 (their
          // rounding is not reproducible from the totals), so it is carried,
          // not derived.
          boe: new Array(months.length).fill(null),
          wells: new Array(months.length).fill(null),
        };
        series.set(key, entry);
      }
      entry.gas[at] = int(get('MCFPD'));
      entry.oil[at] = int(get('BOPD'));
      entry.water[at] = int(get('BWPD'));
      entry.boe[at] = int(get('BOEPD'));
      entry.wells[at] = int(get('PRODUCING_WELLS'));
    },
  );
  return { series, filed, unbundled, outOfRegion };
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

function readme(payload, manifest) {
  const c = payload.counts;
  const filling = payload.completeness.table
    .filter((row) => !row.complete)
    .map(
      (row) =>
        `${row.month} ${row.reporters} (${Math.round((row.share ?? 0) * 100)} %)`,
    )
    .join(', ');
  return `# Gulf of Mexico platform production (BSEE)

Bundled facility-level production for the \`production-gulf-platforms\` layer
(row 11). Static asset, rebuilt by \`npm run build:gulf-platforms\`; nothing is
fetched at runtime. Every figure is monthly production as filed with BSEE per
platform structure, stamped with the month it describes and the day the file
was retrieved.

- Sources: \`ProdByPlatformRawData.zip\` (production by platform, one row per
  structure per month since 1957) and \`PlatStrucRawData.zip\` (structures
  with coordinates; incidents of non-compliance), both from
  https://www.data.bsee.gov — Bureau of Safety and Environmental
  Enforcement, US Department of the Interior.
- License: US Government public domain.
- Retrieved: ${payload.retrieved}. Manifest with sha256 and byte counts in
  \`source.json\`.
- **Current month = newest complete month.** Operators file late, so the
  newest months hold a fraction of the structures that will report. A month
  counts as complete when its reporter count is at least ${Math.round(
    payload.completeness.threshold * 100,
  )} % of the median
  over the ${payload.completeness.lookback} preceding months, and that median is itself at least
  ${Math.round(payload.completeness.floor * 100)} % of the median over the ${payload.completeness.lookback} months before
  those (so a bad season does not freeze the bar and a dead tail cannot lower
  it). This build:
  **${payload.current.month}** is current (${
    payload.completeness.medianReporters
  } reporters at the median); still filling: ${filling || 'none'}.

## \`platforms.json\` — ${c.placed.toLocaleString()} installed structures

- ${c.installed.toLocaleString()} structures carry no removal date; ${c.placed.toLocaleString()} of them have coordinates and are bundled (${c.unplaced} have none and are counted only). ${c.structuresEver.toLocaleString()} structures appear in the production file overall; removed ones are not bundled.
- ${c.producingCurrent} bundled structures produced gas in ${payload.current.month}, ${(c.gasMcfdCurrent / 1e6).toFixed(2)} Bcf/d of the ${(c.gasMcfdFiled / 1e6).toFixed(2)} Bcf/d the Gulf filed that month from ${c.producingFiled} structures. Gulf gas not on the map: ${c.unbundled.removed.structures} structures since removed (${(c.unbundled.removed.gasMcfd / 1e6).toFixed(2)} Bcf/d), ${c.unbundled.unplaced.structures} without coordinates (${(c.unbundled.unplaced.gasMcfd / 1e6).toFixed(2)}), ${c.unbundled.unknown.structures} absent from the structures file (${(c.unbundled.unknown.gasMcfd / 1e6).toFixed(2)}). ${c.withSeries} bundled structures carry a series.
- The production file also carries BSEE's other regions, which the Gulf structures file cannot place and this layer does not draw: ${
    Object.values(c.outOfRegion)
      .map(
        (r) =>
          `${r.name} ${r.structures} structure${r.structures === 1 ? '' : 's'} at ${(r.gasMcfd / 1e6).toFixed(2)} Bcf/d`,
      )
      .join('; ') || 'none this month'
  } (gross gas as filed, which for Alaska's Northstar includes gas reinjected).
- Per structure: identity (complex, structure, area/block, lease, field, operator, type, major flag, water depth, install date, datum year, incidents count), a trailing ${payload.months.length}-month series of gas Mcf/d, oil bbl/d, water bbl/d and producing wells (null where no row was filed), and a lifetime summary (first and last producing month, months producing, peak gas and oil with their months, cumulative gas Mcf and oil bbl from daily rates × days in month).
- BOE is BSEE's own figure as filed (\`BOEPD\`), not derived: their rounding is not reproducible from the totals (17,785 bbl/d + 167,392 Mcf/d files as 47,571 BOE/d, where 5.62 Mcf per barrel gives 47,570). The 5.62 convention is used only where a month's BOE is blank.
- Coordinates are used as published; \`nad\` records the datum year and is shown, not converted.
- Depth: nothing is hand-curated and nothing is enriched from a second source.

Refresh: \`npm run build:gulf-platforms\` (\`--refresh\` re-downloads both
zips; \`--replay\` never touches the network; \`--check\` diffs against the
committed bytes). The raw zips are archived under \`.gev-cache/bsee/\`
(git-ignored). Column names are asserted on every build, so a renamed
upstream column fails by name.

Upstream byte counts this build: production text ${manifest.upstream[0].entry_bytes.toLocaleString()} bytes (${manifest.upstream[0].rows.toLocaleString()} rows), structures ${manifest.upstream[1].entry_bytes.toLocaleString()} bytes (${manifest.upstream[1].rows.toLocaleString()} rows).
`;
}

async function main() {
  const args = readArgs();
  const refresh = args.refresh === true;
  const replay = args.replay === true;
  const check = args.check === true;
  const windowMonths = Number(args.months ?? WINDOW_MONTHS);
  if (
    !Number.isInteger(windowMonths) ||
    windowMonths < 24 ||
    windowMonths > 240
  ) {
    throw new Error(
      `--months must be an integer from 24 to 240 (received ${args.months})`,
    );
  }

  const productionZip = await ensureArchive(UPSTREAM.production, {
    refresh,
    replay,
  });
  const structuresZip = await ensureArchive(UPSTREAM.structures, {
    refresh,
    replay,
  });
  const retrieved = [retrievedDate(productionZip), retrievedDate(structuresZip)]
    .sort()
    .pop();

  process.stdout.write(`reading structures\n`);
  const structuresText = await readEntryText(
    structuresZip,
    UPSTREAM.structures.entry,
  );
  const incidentsText = await readEntryText(
    structuresZip,
    UPSTREAM.structures.incidents,
  );
  const structures = loadStructures(structuresText.text);
  const incidents = loadIncidents(incidentsText.text);

  process.stdout.write(`pass 1: reporters and lifetimes\n`);
  const one = await passOne(productionZip);
  const counts = [...one.reporters].map(([month, reporters]) => ({
    month,
    reporters,
  }));
  const verdict = newestCompleteMonth(counts, {
    threshold: COMPLETENESS_THRESHOLD,
    lookback: COMPLETENESS_WINDOW,
    floor: COMPLETENESS_BASELINE_FLOOR,
    tail: TABLE_TAIL,
  });
  if (!verdict.current) throw new Error('no complete month found');
  const months = [];
  for (let i = windowMonths - 1; i >= 0; i -= 1)
    months.push(shiftMonth(verdict.current, -i));
  process.stdout.write(
    `  ${one.stats.rows.toLocaleString()} rows · ${one.seen.size} structures ever · current month ${verdict.current} (median ${verdict.medianReporters} reporters)\n`,
  );
  for (const row of verdict.table) {
    process.stdout.write(
      `    ${row.month}: ${row.reporters} reporters${row.share === null ? '' : ` (${Math.round(row.share * 100)} %)`}${row.complete ? '' : ' — still filling'}\n`,
    );
  }

  // Installed and placed: what the map draws.
  const installed = [...structures.values()].filter((s) => !s.removed);
  const placed = installed.filter((s) => s.lat !== null && s.lon !== null);
  const wanted = new Set(placed.map((s) => s.id));

  process.stdout.write(
    `pass 2: ${months[0]} to ${months[months.length - 1]} for ${wanted.size} structures\n`,
  );
  const { series, filed, unbundled, outOfRegion } = await passTwo(
    productionZip,
    months,
    wanted,
    structures,
  );

  const currentIndex = months.length - 1;
  let producingCurrent = 0;
  let gasMcfdCurrent = 0;
  let incidentsJoined = 0;
  const bundled = placed
    .map((s) => {
      const entry = series.get(s.id) ?? null;
      const gasNow = entry ? entry.gas[currentIndex] : null;
      if (gasNow > 0) {
        producingCurrent += 1;
        gasMcfdCurrent += gasNow;
      }
      const inc = incidents.get(s.id) ?? null;
      if (inc !== null) incidentsJoined += 1;
      return {
        id: s.id,
        complexId: s.complexId,
        structureNumber: s.structureNumber,
        name: s.name,
        area: s.area,
        block: s.block,
        lease: s.lease,
        field: s.field,
        operator: s.operator,
        type: s.type,
        major: s.major,
        heliport: s.heliport,
        waterDepthFt: s.waterDepthFt,
        lat: s.lat,
        lon: s.lon,
        nad: s.nad,
        installed: s.installed,
        removed: null,
        district: s.district,
        region: one.regionOf.get(s.id) ?? null,
        incidents: inc,
        series: entry,
        lifetime: one.lifetimes.get(s.id) ?? null,
      };
    })
    // Codepoint order, not localeCompare: this order is the emitted byte stream.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const payload = {
    id: 'bsee-gulf-platforms',
    name: 'Gulf of Mexico OCS platform production, monthly per structure',
    freshnessClass: 'published',
    retrieved,
    license:
      'US Government public domain (BSEE, US Department of the Interior)',
    upstream: {
      production: {
        url: UPSTREAM.production.url,
        entry: UPSTREAM.production.entry,
      },
      structures: {
        url: UPSTREAM.structures.url,
        entry: UPSTREAM.structures.entry,
      },
    },
    completeness: {
      rule: 'newest month whose count of structures reporting any production is at least the threshold share of the median over the preceding lookback of months, that median being at least the floor share of the median over the lookback before it',
      threshold: COMPLETENESS_THRESHOLD,
      lookback: COMPLETENESS_WINDOW,
      floor: COMPLETENESS_BASELINE_FLOOR,
      medianReporters: verdict.medianReporters,
      table: verdict.table,
    },
    months,
    current: { month: verdict.current, index: currentIndex },
    counts: {
      structuresEver: one.seen.size,
      installed: installed.length,
      placed: placed.length,
      unplaced: installed.length - placed.length,
      producingCurrent,
      gasMcfdCurrent,
      // Everything the Gulf filed for the current month, on the map or not,
      // and what the file's other regions filed, which this layer cannot place.
      producingFiled: filed.structures,
      gasMcfdFiled: filed.gasMcfd,
      unbundled,
      outOfRegion,
      withSeries: bundled.filter((s) => s.series).length,
      incidentsJoined,
    },
    structures: bundled,
  };

  const json = `${JSON.stringify(payload)}\n`;
  const bytes = Buffer.byteLength(json);
  const gzipBytes = gzipSync(json).length;
  const sha256 = createHash('sha256').update(json).digest('hex');
  const manifest = {
    id: 'bsee-gulf-platforms',
    name: payload.name,
    category: 'production',
    description:
      'Facility-level monthly production for the production-gulf-platforms layer: every installed OCS platform structure with coordinates, a trailing 120-month series and a lifetime summary. Current = the newest complete reporting month, by rule.',
    downloaded_at: retrieved,
    license_note: payload.license,
    files: [
      {
        path: 'platforms.json',
        format: 'JSON',
        structures: bundled.length,
        window_months: months.length,
        sha256,
        bytes,
        gzip_bytes: gzipBytes,
      },
    ],
    upstream: [
      {
        url: UPSTREAM.production.url,
        archive: UPSTREAM.production.file,
        entry: UPSTREAM.production.entry,
        entry_bytes: one.stats.bytes,
        entry_sha256: one.stats.sha256,
        rows: one.stats.rows,
        hosted_by:
          'data.bsee.gov — Bureau of Safety and Environmental Enforcement, US Department of the Interior',
      },
      {
        url: UPSTREAM.structures.url,
        archive: UPSTREAM.structures.file,
        entry: UPSTREAM.structures.entry,
        entry_bytes: structuresText.bytes,
        entry_sha256: structuresText.sha256,
        rows: structures.size,
        incidents_entry: UPSTREAM.structures.incidents,
        incidents_sha256: incidentsText.sha256,
        hosted_by:
          'data.bsee.gov — Bureau of Safety and Environmental Enforcement, US Department of the Interior',
      },
    ],
    current_month: verdict.current,
    completeness: payload.completeness,
    reproduce: {
      command: 'npm run build:gulf-platforms',
      raw_archive:
        'Both zips are archived verbatim under .gev-cache/bsee/ (git-ignored); --replay rebuilds from them, --check diffs against the committed bytes.',
    },
  };

  const outFile = path.join(OUT_DIR, 'platforms.json');
  if (check) {
    const committed = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
    const same = committed === json;
    process.stdout.write(
      same
        ? `check: platforms.json matches the committed bytes (${bytes.toLocaleString()} B)\n`
        : `check: platforms.json DIFFERS from the committed bytes (${committed.length.toLocaleString()} vs ${bytes.toLocaleString()} B)\n`,
    );
    process.exitCode = same ? 0 : 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outFile, json);
  writeFileSync(
    path.join(OUT_DIR, 'source.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(path.join(OUT_DIR, 'README.md'), readme(payload, manifest));
  process.stdout.write(
    `\nwrote ${path.relative(root, outFile)}\n` +
      `  ${payload.counts.placed} structures bundled (${payload.counts.withSeries} with a series) · ${producingCurrent} producing in ${verdict.current} · ${(gasMcfdCurrent / 1e6).toFixed(2)} of ${(filed.gasMcfd / 1e6).toFixed(2)} Bcf/d filed on the map\n` +
      `  Gulf gas not on the map: removed ${unbundled.removed.structures} (${(unbundled.removed.gasMcfd / 1e6).toFixed(2)} Bcf/d) · unplaced ${unbundled.unplaced.structures} (${(unbundled.unplaced.gasMcfd / 1e6).toFixed(2)}) · unknown ${unbundled.unknown.structures} (${(unbundled.unknown.gasMcfd / 1e6).toFixed(2)})\n` +
      `  other regions in the file: ${
        Object.values(outOfRegion)
          .map(
            (r) =>
              `${r.name} ${r.structures} (${(r.gasMcfd / 1e6).toFixed(2)} Bcf/d)`,
          )
          .join(' · ') || 'none'
      }\n` +
      `  incidents joined for ${incidentsJoined} structures\n` +
      `  ${(bytes / 1e6).toFixed(2)} MB raw · ${(gzipBytes / 1e3).toFixed(0)} kB gzip · sha256 ${sha256.slice(0, 16)}…\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`\nbuild-gulf-platforms failed: ${error.message}\n`);
  process.exitCode = 1;
});
