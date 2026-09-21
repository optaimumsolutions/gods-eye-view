/**
 * Build one onshore region's production bundle (docs/COMMODITIES-PLAN.md §14,
 * R12.1 to R12.7): `src/data/local_data/onshore/<region>/` (the facility
 * index, the field and county clusters, the manifest, a README) and the
 * on-demand history shards under `public/data/onshore/<region>/history/`.
 *
 * ── How a region is assembled ────────────────────────────────────────────
 *
 * 1. Each state reader (`scripts/onshore/<state>.mjs`) finds the newest month
 *    it has published and reads the trailing window of months, one file at a
 *    time, into a normalised per-facility row set; the raw files are archived
 *    under `.gev-cache/onshore/<state>/` and parsed once.
 * 2. Reporters per month (facilities that filed) feed row 11's completeness
 *    rule with the reader's own lookback: "current" is the newest month whose
 *    filing count is at least 90 % of the trailing median (R12.3).
 * 3. Every facility seen in the window gets an index row — identity, surface
 *    location, its current, prior and last-year readings, and a ten-year
 *    summary — and a place in one of 256 history shards keyed by a hash of
 *    its id (`src/layers/onshore/shards.js`), so the browser and this script
 *    agree on where a series lives.
 * 4. Fields and counties are summed per month into the clusters file the
 *    regional tier draws.
 * 5. The region's monthly totals are set against EIA's state series (gross
 *    withdrawals, marketed production, crude production) for the newest
 *    month both report; the ratios travel in the bundle for the panel line
 *    and every dossier (G1, O8).
 *
 * The index and clusters are committed; the shards are not (O1, option a:
 * ~20 MB gzip a region a month would sink the repository) — a checkout
 * without them shows the index and the dossier says the history is not
 * built here. `--check` reproduces every committed byte and, when the shards
 * are on disk, theirs too.
 *
 * Usage:
 *   node scripts/build-onshore.mjs --region williston            # fetch what is missing, build
 *   node scripts/build-onshore.mjs --region williston --refresh  # re-download every file
 *   node scripts/build-onshore.mjs --region williston --replay   # never touch the network
 *   node scripts/build-onshore.mjs --region williston --check    # rebuild and diff against the committed bytes
 *   --months 120 (24 to 240)   --newest 2026-07 (pin the window's newest month)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readArgs } from './arcgis-paging.mjs';
import { regionById } from './onshore/regions.mjs';
import { readEiaStateSeries } from './onshore/eia.mjs';
import {
  COMPLETENESS_BASELINE_FLOOR,
  COMPLETENESS_THRESHOLD,
  newestCompleteMonth,
} from '../src/layers/production/completeness.js';
import { daysInMonth } from '../src/layers/production/records.js';
import { SHARD_COUNT, shardFor } from '../src/layers/onshore/shards.js';
import {
  ONSHORE_BUNDLE_VERSION,
  READING_COLUMNS,
} from '../src/layers/onshore/records.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WINDOW_MONTHS = 120;
const TABLE_TAIL = 8;
const NEWEST_PROBE_MONTHS = 8;
const OIL_INDEX = READING_COLUMNS.indexOf('oil');
const WATER_INDEX = READING_COLUMNS.indexOf('water');
const DAYS_INDEX = READING_COLUMNS.indexOf('days');
const GAS_INDEX = READING_COLUMNS.indexOf('gas');
const FLARED_INDEX = READING_COLUMNS.indexOf('flared');

const log = (line) => process.stdout.write(`${line}\n`);

/* ------------------------------------------------------------------ *
 * Month arithmetic
 * ------------------------------------------------------------------ */

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function thisMonthUtc() {
  return new Date().toISOString().slice(0, 7);
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function round(value, places) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/* ------------------------------------------------------------------ *
 * Reading the window
 * ------------------------------------------------------------------ */

/** The newest month a reader has published, walking back from this month. */
async function newestPublishedMonth(reader, cacheDir, { replay, pinned }) {
  if (pinned) return pinned;
  let month = thisMonthUtc();
  for (let i = 0; i < NEWEST_PROBE_MONTHS; i += 1) {
    if (await reader.monthAvailable(month, { cacheDir, replay })) return month;
    month = shiftMonth(month, -1);
  }
  throw new Error(
    `${reader.source.id}: no workbook found in the last ${NEWEST_PROBE_MONTHS} months`,
  );
}

/**
 * Fold one reader's window into the facility table. A facility is a
 * Float64Array of READING_COLUMNS × months (NaN = not filed) plus identity
 * from the newest month it appears in.
 */
async function readWindow(reader, months, cacheDir, options) {
  const width = READING_COLUMNS.length;
  const facilities = new Map();
  const files = [];
  const reporters = [];
  const missing = [];
  const anomalies = [];
  const textCells = { total: 0, min: Infinity, max: 0, months: 0 };
  for (let at = 0; at < months.length; at += 1) {
    const month = months[at];
    const result = await reader.readMonth(month, { cacheDir, ...options });
    if (!result) {
      missing.push(month);
      reporters.push({ month, reporters: 0 });
      continue;
    }
    files.push({
      month,
      file: result.file,
      url: result.url,
      bytes: result.bytes,
      sha256: result.sha256,
      retrieved: result.retrieved,
      rows: result.poolRows,
      wells: result.wells,
      unplaced: result.unplaced,
      skippedRows: result.skippedRows,
    });
    for (const note of result.anomalies ?? [])
      anomalies.push(`${month}: ${note}`);
    if (result.textCells) {
      textCells.total += result.textCells;
      textCells.min = Math.min(textCells.min, result.textCells);
      textCells.max = Math.max(textCells.max, result.textCells);
      textCells.months += 1;
    }
    reporters.push({ month, reporters: result.rows.length });
    for (const row of result.rows) {
      let facility = facilities.get(row.id);
      if (!facility) {
        facility = {
          id: row.id,
          state: reader.source.state,
          series: new Float64Array(width * months.length).fill(NaN),
          firstSeen: month,
          lastSeen: month,
        };
        facilities.set(row.id, facility);
      }
      // Identity follows the newest filing: operators change, names are corrected.
      facility.lastSeen = month;
      facility.fileNo = row.fileNo ?? facility.fileNo ?? null;
      facility.name = row.name ?? facility.name ?? null;
      facility.operator = row.operator ?? facility.operator ?? null;
      facility.county = row.county ?? facility.county ?? null;
      facility.field = row.field ?? facility.field ?? null;
      facility.pools = row.pools?.length ? row.pools : (facility.pools ?? []);
      if (row.lat !== null && row.lon !== null) {
        facility.lat = row.lat;
        facility.lon = row.lon;
      }
      const base = at * width;
      READING_COLUMNS.forEach((column, i) => {
        const value = row[column];
        if (value !== null && value !== undefined)
          facility.series[base + i] = value;
      });
    }
    log(
      `  ${month}: ${result.rows.length.toLocaleString()} wells filed (${result.poolRows.toLocaleString()} rows)`,
    );
  }
  if (textCells.months) {
    anomalies.push(
      `${textCells.total.toLocaleString()} numeric cells hold text (NR/NA) across ${textCells.months} months (${textCells.min} to ${textCells.max} a month) and are read as not filed, never as zero`,
    );
  }
  return { facilities, files, reporters, missing, anomalies };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

function readingAt(facility, at) {
  const width = READING_COLUMNS.length;
  const base = at * width;
  let any = false;
  const out = new Array(width);
  for (let i = 0; i < width; i += 1) {
    const value = facility.series[base + i];
    if (Number.isNaN(value)) out[i] = null;
    else {
      out[i] = value;
      any = true;
    }
  }
  return any ? out : null;
}

function producingAt(facility, at) {
  const width = READING_COLUMNS.length;
  const gas = facility.series[at * width + GAS_INDEX];
  const oil = facility.series[at * width + OIL_INDEX];
  return (gas > 0 && !Number.isNaN(gas)) || (oil > 0 && !Number.isNaN(oil));
}

/** Ten-year summary of one facility over the window, rates per calendar day. */
function tenYearSummary(facility, months) {
  const width = READING_COLUMNS.length;
  const summary = {
    firstMonth: null,
    lastMonth: null,
    monthsProducing: 0,
    peakGasMcfd: 0,
    peakGasMonth: null,
    peakOilBopd: 0,
    peakOilMonth: null,
    cumGasMcf: 0,
    cumOilBbl: 0,
    cumWaterBbl: 0,
    cumFlaredMcf: 0,
  };
  let any = false;
  for (let at = 0; at < months.length; at += 1) {
    if (!producingAt(facility, at)) continue;
    any = true;
    const month = months[at];
    const days = daysInMonth(month);
    const base = at * width;
    const gas = facility.series[base + GAS_INDEX];
    const oil = facility.series[base + OIL_INDEX];
    const water = facility.series[base + WATER_INDEX];
    const flared = facility.series[base + FLARED_INDEX];
    summary.firstMonth ??= month;
    summary.lastMonth = month;
    summary.monthsProducing += 1;
    if (!Number.isNaN(gas)) {
      summary.cumGasMcf += gas;
      const rate = gas / days;
      if (rate > summary.peakGasMcfd) {
        summary.peakGasMcfd = round(rate, 1);
        summary.peakGasMonth = month;
      }
    }
    if (!Number.isNaN(oil)) {
      summary.cumOilBbl += oil;
      const rate = oil / days;
      if (rate > summary.peakOilBopd) {
        summary.peakOilBopd = round(rate, 1);
        summary.peakOilMonth = month;
      }
    }
    if (!Number.isNaN(water)) summary.cumWaterBbl += water;
    if (!Number.isNaN(flared)) summary.cumFlaredMcf += flared;
  }
  return any ? summary : null;
}

/** Field and county clusters: monthly sums and producing counts, a centroid. */
function buildClusters(facilities, months, currentIndex, key) {
  const groups = new Map();
  for (const facility of facilities) {
    const name = facility[key];
    if (!name) continue;
    let group = groups.get(name);
    if (!group) {
      group = {
        id: name,
        name,
        county: key === 'field' ? facility.county : null,
        members: [],
        gas: new Array(months.length).fill(null),
        oil: new Array(months.length).fill(null),
        water: new Array(months.length).fill(null),
        flared: new Array(months.length).fill(null),
        producing: new Array(months.length).fill(0),
      };
      groups.set(name, group);
    }
    group.members.push(facility);
  }
  const width = READING_COLUMNS.length;
  const clusters = [];
  for (const group of groups.values()) {
    group.members.sort(byId);
    let latSum = 0;
    let lonSum = 0;
    let placed = 0;
    let reported = 0;
    let producingNow = 0;
    for (const facility of group.members) {
      if (facility.lat !== undefined && facility.lat !== null) {
        latSum += facility.lat;
        lonSum += facility.lon;
        placed += 1;
      }
      if (readingAt(facility, currentIndex)) reported += 1;
      if (producingAt(facility, currentIndex)) producingNow += 1;
      for (let at = 0; at < months.length; at += 1) {
        const base = at * width;
        for (const [series, index] of [
          ['gas', GAS_INDEX],
          ['oil', OIL_INDEX],
          ['water', WATER_INDEX],
          ['flared', FLARED_INDEX],
        ]) {
          const value = facility.series[base + index];
          if (Number.isNaN(value)) continue;
          group[series][at] = (group[series][at] ?? 0) + value;
        }
        if (producingAt(facility, at)) group.producing[at] += 1;
      }
    }
    if (!placed) continue;
    clusters.push({
      id: group.id,
      name: group.name,
      county: group.county,
      lat: round(latSum / placed, 5),
      lon: round(lonSum / placed, 5),
      wells: group.members.length,
      reported,
      producing: producingNow,
      series: {
        gas: group.gas,
        oil: group.oil,
        water: group.water,
        flared: group.flared,
        producing: group.producing,
      },
    });
  }
  return clusters.sort(byId);
}

/** Region totals per month against the EIA state series (G1, O8). */
function buildReconciliation(facilities, months, eiaByState, states) {
  const width = READING_COLUMNS.length;
  const regionGas = new Array(months.length).fill(0);
  const regionOil = new Array(months.length).fill(0);
  for (const facility of facilities) {
    for (let at = 0; at < months.length; at += 1) {
      const gas = facility.series[at * width + GAS_INDEX];
      const oil = facility.series[at * width + OIL_INDEX];
      if (!Number.isNaN(gas)) regionGas[at] += gas;
      if (!Number.isNaN(oil)) regionOil[at] += oil;
    }
  }
  const rows = months.map((month, at) => {
    let gross = null;
    let marketed = null;
    let oil = null;
    for (const state of states) {
      const eia = eiaByState[state]?.series;
      const g = eia?.gross?.values?.[month];
      const m = eia?.marketed?.values?.[month];
      const o = eia?.oil?.values?.[month];
      if (typeof g === 'number') gross = (gross ?? 0) + g * 1000;
      if (typeof m === 'number') marketed = (marketed ?? 0) + m * 1000;
      if (typeof o === 'number') oil = (oil ?? 0) + o * 1000;
    }
    return {
      month,
      regionGasMcf: regionGas[at],
      regionOilBbl: regionOil[at],
      eiaGrossMcf: gross,
      eiaMarketedMcf: marketed,
      eiaOilBbl: oil,
    };
  });
  const latest = [...rows]
    .reverse()
    .find((row) => row.eiaGrossMcf !== null && row.regionGasMcf > 0);
  const ratio = (a, b) => (a && b ? round(a / b, 4) : null);
  return {
    source: 'EIA',
    states,
    series: states.flatMap((state) =>
      Object.values(eiaByState[state]?.series ?? {}).map((s) => s.sourceKey),
    ),
    newestEiaMonth: latest?.month ?? null,
    latest: latest
      ? {
          month: latest.month,
          regionGasMcf: latest.regionGasMcf,
          regionOilBbl: latest.regionOilBbl,
          eiaGrossMcf: latest.eiaGrossMcf,
          eiaMarketedMcf: latest.eiaMarketedMcf,
          eiaOilBbl: latest.eiaOilBbl,
          gasToGross: ratio(latest.regionGasMcf, latest.eiaGrossMcf),
          gasToMarketed: ratio(latest.regionGasMcf, latest.eiaMarketedMcf),
          oilToEia: ratio(latest.regionOilBbl, latest.eiaOilBbl),
        }
      : null,
    note: 'State filings are gross gas at the wellhead as reported by operators; EIA gross withdrawals include estimates for wells the state file omits (confidential wells, late filers), marketed production excludes gas flared, vented and used for repressuring. Region totals exclude nothing the files carry.',
    months: rows,
  };
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

function readme(region, payload, manifest) {
  const c = payload.counts;
  const r = payload.reconciliation.latest;
  const filling = payload.completeness.table
    .filter((row) => !row.complete)
    .map(
      (row) =>
        `${row.month} ${row.reporters.toLocaleString()} (${Math.round((row.share ?? 0) * 100)} %)`,
    )
    .join(', ');
  return `# ${region.name} onshore production (${region.states.join(', ')})

Bundled facility-level production for the \`${region.layerId}\` layer (row 12,
region \`${region.id}\`). Static asset, rebuilt by
\`npm run build:onshore -- --region ${region.id}\`; nothing is fetched at
runtime except the history shards, which are built alongside and served from
\`public/data/onshore/${region.id}/history/\` (not committed — O1).

- Sources: ${payload.sources.map((s) => `${s.name} (${s.grain} grain, ${s.cadence}, ${s.filePattern})`).join('; ')}.
- Licence: ${payload.sources.map((s) => s.license).join('; ')}.
- Retrieved: ${payload.retrieved}. Per-file sha256 and byte counts in \`source.json\`.
- Datum: ${payload.sources.map((s) => `${s.datum}; ${s.transform}${s.precision ? `; ${s.precision}` : ''}`).join('; ')}.
- Finality: ${payload.sources.map((s) => s.finality ?? 'not stated').join('; ')}.
- **Current month = newest complete month.** Reporters are ${payload.sources[0].reporterRule}; a month is complete when its count is at least ${Math.round(payload.completeness.threshold * 100)} % of the median over the ${payload.completeness.lookback} preceding months, that median itself at least ${Math.round(payload.completeness.floor * 100)} % of the median over the ${payload.completeness.lookback} before those. This build: **${payload.current.month}** is current (${payload.completeness.medianReporters.toLocaleString()} reporters at the median); still filling: ${filling || 'none'}.

## \`index.json\` — ${c.facilities.toLocaleString()} facilities

- ${c.reported.toLocaleString()} wells filed for ${payload.current.month}; ${c.producing.toLocaleString()} produced (${(c.gasMcfdTotal / 1e6).toFixed(2)} Bcf/d gas, ${(c.oilBbldTotal / 1e6).toFixed(2)} MMbbl/d oil, ${(c.flaredMcfd / 1e3).toFixed(0)} MMcf/d flared); ${c.quiet.toLocaleString()} filed with no production; ${c.absent.toLocaleString()} wells appear earlier in the window but not in the current file (plugged, inactive or confidential); ${c.unplaced} have no coordinates and are counted only.
- Per facility: identity (API well number, NDIC file number, well name, operator, county, field, pools), surface location, \`status\`, and three readings — \`current\`, \`prior\` and \`lastYear\` — as arrays in the order \`${READING_COLUMNS.join(', ')}\` (monthly volumes: bbl, bbl, days, bbl, Mcf, Mcf, Mcf; null = not filed), plus a ten-year \`summary\` over the ${payload.months.length} months (first and last producing month, months producing, peak gas and oil per calendar day with their months, cumulative gas, oil, water and flared).
- Rates on the map are per calendar day (volume ÷ days in the month); the dossier also shows per producing day where days were filed.

## \`clusters.json\` — ${payload.clusterCounts.fields} fields, ${payload.clusterCounts.counties} counties

Monthly sums of gas, oil, water and flared and the count of producing wells per field and per county over the window, with a centroid of the member wells. The regional tier draws the fields.

## History shards — ${manifest.shards.count} files, ${(manifest.shards.gzip_bytes / 1e6).toFixed(1)} MB gzip

\`public/data/onshore/${region.id}/history/<xx>.json\`, \`xx\` = FNV-1a hash of the facility id mod ${manifest.shards.count} in hex (\`src/layers/onshore/shards.js\`): the full ${payload.months.length}-month series per facility. Fetched when a dossier opens. Not committed; rebuilt from the archive.

## Reconciliation (EIA)

${
  r
    ? `${r.month}: region gas ${(r.regionGasMcf / 1e6).toFixed(1)} Bcf against EIA gross withdrawals ${(r.eiaGrossMcf / 1e6).toFixed(1)} Bcf (${Math.round(r.gasToGross * 100)} %) and marketed production ${(r.eiaMarketedMcf / 1e6).toFixed(1)} Bcf (${Math.round(r.gasToMarketed * 100)} %); oil ${(r.regionOilBbl / 1e6).toFixed(2)} MMbbl against EIA ${(r.eiaOilBbl / 1e6).toFixed(2)} MMbbl (${Math.round(r.oilToEia * 100)} %).`
    : 'no month common to the state files and the EIA series.'
} ${payload.reconciliation.note}

Anomalies recorded this build: ${payload.anomalies.length ? payload.anomalies.join('; ') : 'none'}.

Refresh: \`npm run build:onshore -- --region ${region.id}\` (\`--refresh\` re-downloads every file; \`--replay\` never touches the network; \`--check\` diffs against the committed bytes). Column names are asserted on every read, so a renamed upstream column fails by name.
`;
}

async function main() {
  const args = readArgs();
  const region = regionById(args.region);
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
  const pinnedNewest =
    typeof args.newest === 'string' && /^\d{4}-\d{2}$/.test(args.newest)
      ? args.newest
      : null;
  const outDir = path.join(root, region.bundleDir);
  const shardDir = path.join(root, region.shardDir);
  const options = { refresh, replay, log };

  // One reader per state for now (Williston = ND); a second reader's window
  // is folded into the same facility table when Montana joins.
  const facilities = new Map();
  const sources = [];
  const upstream = [];
  const reporters = new Map();
  const missingMonths = [];
  const anomalies = [];
  let months = null;
  for (const reader of region.readers) {
    const cacheDir = path.join(
      root,
      '.gev-cache',
      'onshore',
      reader.source.state.toLowerCase(),
    );
    mkdirSync(cacheDir, { recursive: true });
    const newest = await newestPublishedMonth(reader, cacheDir, {
      replay,
      pinned: pinnedNewest,
    });
    const window = [];
    for (let i = windowMonths - 1; i >= 0; i -= 1)
      window.push(shiftMonth(newest, -i));
    months ??= window;
    if (months[0] !== window[0] || months.length !== window.length) {
      throw new Error(
        `${reader.source.id}: window ${window[0]}…${newest} does not match the region's ${months[0]}…${months.at(-1)}`,
      );
    }
    log(
      `${reader.source.name}: ${window[0]} to ${newest} (${window.length} months)`,
    );
    const read = await readWindow(reader, window, cacheDir, options);
    for (const [id, facility] of read.facilities) facilities.set(id, facility);
    for (const row of read.reporters)
      reporters.set(row.month, (reporters.get(row.month) ?? 0) + row.reporters);
    missingMonths.push(...read.missing);
    anomalies.push(...read.anomalies.map((a) => `${reader.source.state} ${a}`));
    sources.push({ ...reader.source, newestMonth: newest });
    upstream.push({
      state: reader.source.state,
      source: reader.source.id,
      files: read.files,
    });
  }

  // 2. Completeness.
  const lookback = Math.max(...sources.map((s) => s.lookback ?? 12));
  const counts = [...reporters].map(([month, count]) => ({
    month,
    reporters: count,
  }));
  const verdict = newestCompleteMonth(counts, {
    threshold: COMPLETENESS_THRESHOLD,
    lookback,
    floor: COMPLETENESS_BASELINE_FLOOR,
    tail: TABLE_TAIL,
  });
  if (!verdict.current) throw new Error('no complete month found');
  const currentIndex = months.indexOf(verdict.current);
  log(
    `current month ${verdict.current} (median ${verdict.medianReporters.toLocaleString()} reporters); ${facilities.size.toLocaleString()} facilities in the window`,
  );
  for (const row of verdict.table) {
    log(
      `    ${row.month}: ${row.reporters.toLocaleString()} reporters${row.share === null ? '' : ` (${Math.round(row.share * 100)} %)`}${row.complete ? '' : ' — still filling'}`,
    );
  }

  // 3. Reconciliation.
  const eiaByState = {};
  const eiaFiles = [];
  for (const state of region.reconcile) {
    const eia = await readEiaStateSeries(state, {
      cacheDir: path.join(root, '.gev-cache', 'onshore', 'eia'),
      ...options,
    });
    eiaByState[state] = eia;
    eiaFiles.push(...eia.files.map((f) => ({ state, ...f })));
  }
  const all = [...facilities.values()].sort(byId);
  const reconciliation = buildReconciliation(
    all,
    months,
    eiaByState,
    region.reconcile,
  );

  // 4. The index.
  const priorIndex = currentIndex - 1;
  const lastYearIndex = currentIndex - 12;
  const tally = {
    reported: 0,
    producing: 0,
    quiet: 0,
    absent: 0,
    unplaced: 0,
    gasMcf: 0,
    oilBbl: 0,
    waterBbl: 0,
    gasSoldMcf: 0,
    flaredMcf: 0,
  };
  const operators = new Set();
  const days = daysInMonth(verdict.current);
  const rows = [];
  for (const facility of all) {
    const current = readingAt(facility, currentIndex);
    const producing = producingAt(facility, currentIndex);
    const status = producing ? 'producing' : current ? 'quiet' : 'absent';
    tally[status] += 1;
    if (current) tally.reported += 1;
    if (facility.lat === undefined || facility.lat === null) {
      tally.unplaced += 1;
      continue;
    }
    if (producing) {
      tally.gasMcf += current[GAS_INDEX] ?? 0;
      tally.oilBbl += current[OIL_INDEX] ?? 0;
      tally.waterBbl += current[WATER_INDEX] ?? 0;
      tally.gasSoldMcf += current[READING_COLUMNS.indexOf('gasSold')] ?? 0;
      tally.flaredMcf += current[FLARED_INDEX] ?? 0;
      if (facility.operator) operators.add(facility.operator);
    }
    rows.push({
      id: facility.id,
      state: facility.state,
      fileNo: facility.fileNo ?? null,
      name: facility.name ?? null,
      operator: facility.operator ?? null,
      county: facility.county ?? null,
      field: facility.field ?? null,
      pools: facility.pools ?? [],
      lat: facility.lat,
      lon: facility.lon,
      status,
      firstSeen: facility.firstSeen,
      lastSeen: facility.lastSeen,
      current,
      prior: priorIndex >= 0 ? readingAt(facility, priorIndex) : null,
      lastYear: lastYearIndex >= 0 ? readingAt(facility, lastYearIndex) : null,
      summary: tenYearSummary(facility, months),
    });
  }
  const placed = all.filter((f) => f.lat !== undefined && f.lat !== null);

  // 5. Clusters.
  const fields = buildClusters(placed, months, currentIndex, 'field');
  const counties = buildClusters(placed, months, currentIndex, 'county');

  const retrieved = [
    ...upstream.flatMap((u) => u.files.map((f) => f.retrieved)),
    ...eiaFiles.map((f) => f.retrieved),
  ]
    .sort()
    .pop();
  const header = {
    id: `onshore-${region.id}`,
    version: ONSHORE_BUNDLE_VERSION,
    name: `${region.name} onshore production, monthly per facility`,
    freshnessClass: 'published',
    retrieved,
    region: {
      id: region.id,
      layerId: region.layerId,
      name: region.name,
      basins: region.basins,
      states: region.states,
      center: region.center,
    },
    sources,
    readingColumns: READING_COLUMNS,
    months,
    current: { month: verdict.current, index: currentIndex },
    completeness: {
      rule: 'newest month whose count of facilities that filed is at least the threshold share of the median over the preceding lookback of months, that median being at least the floor share of the median over the lookback before it',
      reporterRule: sources.map((s) => s.reporterRule).join('; '),
      threshold: COMPLETENESS_THRESHOLD,
      lookback,
      floor: COMPLETENESS_BASELINE_FLOOR,
      medianReporters: verdict.medianReporters,
      table: verdict.table,
    },
    missingMonths,
    anomalies,
  };
  const payload = {
    ...header,
    counts: {
      facilities: all.length,
      placed: placed.length,
      unplaced: tally.unplaced,
      reported: tally.reported,
      producing: tally.producing,
      quiet: tally.quiet,
      absent: tally.absent,
      operators: operators.size,
      fields: fields.length,
      counties: counties.length,
      gasMcfTotal: tally.gasMcf,
      oilBblTotal: tally.oilBbl,
      waterBblTotal: tally.waterBbl,
      gasSoldMcfTotal: tally.gasSoldMcf,
      flaredMcfTotal: tally.flaredMcf,
      gasMcfdTotal: round(tally.gasMcf / days, 1),
      oilBbldTotal: round(tally.oilBbl / days, 1),
      flaredMcfd: round(tally.flaredMcf / days, 1),
    },
    reconciliation: {
      ...reconciliation,
      months: undefined,
    },
    shards: {
      count: SHARD_COUNT,
      path: `data/onshore/${region.id}/history/`,
      hash: 'fnv1a32(id) mod count, two hex digits',
    },
    clusterCounts: { fields: fields.length, counties: counties.length },
    facilities: rows,
  };
  delete payload.reconciliation.months;
  const clustersPayload = {
    id: `onshore-${region.id}-clusters`,
    version: ONSHORE_BUNDLE_VERSION,
    region: header.region,
    months,
    current: header.current,
    series: ['gas', 'oil', 'water', 'flared', 'producing'],
    units: {
      gas: 'Mcf per month',
      oil: 'bbl per month',
      water: 'bbl per month',
      flared: 'Mcf per month',
      producing: 'wells producing in the month',
    },
    reconciliation: reconciliation.months,
    fields,
    counties,
  };

  // 6. Shards.
  const shards = new Map();
  for (const facility of placed) {
    const shard = shardFor(facility.id, SHARD_COUNT);
    let entry = shards.get(shard);
    if (!entry) {
      entry = {};
      shards.set(shard, entry);
    }
    const series = {};
    const width = READING_COLUMNS.length;
    READING_COLUMNS.forEach((column, i) => {
      const values = new Array(months.length);
      for (let at = 0; at < months.length; at += 1) {
        const value = facility.series[at * width + i];
        values[at] = Number.isNaN(value) ? null : value;
      }
      series[column] = values;
    });
    entry[facility.id] = series;
  }
  const shardFiles = [];
  let shardBytes = 0;
  let shardGzip = 0;
  const shardHash = createHash('sha256');
  for (const shard of [...shards.keys()].sort(byText)) {
    const ids = Object.keys(shards.get(shard)).sort(byText);
    const facilitiesOut = {};
    for (const id of ids) facilitiesOut[id] = shards.get(shard)[id];
    const text = `${JSON.stringify({
      region: region.id,
      shard,
      months,
      columns: READING_COLUMNS,
      facilities: facilitiesOut,
    })}\n`;
    const sha = createHash('sha256').update(text).digest('hex');
    shardHash.update(sha);
    shardBytes += Buffer.byteLength(text);
    shardGzip += gzipSync(text).length;
    shardFiles.push({ shard, text, sha256: sha, facilities: ids.length });
  }

  const indexJson = `${JSON.stringify(payload)}\n`;
  const clustersJson = `${JSON.stringify(clustersPayload)}\n`;
  const manifest = {
    id: `onshore-${region.id}`,
    name: payload.name,
    category: 'production',
    description: `Facility-level monthly production for the ${region.layerId} layer: every well the state files reported in the trailing ${months.length} months, with surface coordinates, current, prior and last-year readings, a ten-year summary, field and county clusters, and on-demand history shards. Current = the newest complete filing month, by rule.`,
    downloaded_at: retrieved,
    license_note: sources.map((s) => s.license).join('; '),
    files: [
      {
        path: 'index.json',
        format: 'JSON',
        facilities: rows.length,
        window_months: months.length,
        sha256: createHash('sha256').update(indexJson).digest('hex'),
        bytes: Buffer.byteLength(indexJson),
        gzip_bytes: gzipSync(indexJson).length,
      },
      {
        path: 'clusters.json',
        format: 'JSON',
        fields: fields.length,
        counties: counties.length,
        sha256: createHash('sha256').update(clustersJson).digest('hex'),
        bytes: Buffer.byteLength(clustersJson),
        gzip_bytes: gzipSync(clustersJson).length,
      },
    ],
    shards: {
      path: `${region.shardDir}/`,
      count: shardFiles.length,
      facilities: placed.length,
      bytes: shardBytes,
      gzip_bytes: shardGzip,
      max_gzip_bytes: Math.max(
        ...shardFiles.map((s) => gzipSync(s.text).length),
      ),
      sha256_of_sha256s: shardHash.digest('hex'),
      committed: false,
      note: 'Built alongside the index from the archived workbooks (O1, option a); a checkout without them shows the index and says so in the dossier.',
    },
    upstream,
    eia: eiaFiles,
    current_month: verdict.current,
    completeness: header.completeness,
    reconciliation: payload.reconciliation,
    assumptions: sources.map((s) => ({
      state: s.state,
      datum: s.datum,
      transform: s.transform,
      precision: s.precision ?? null,
      grain: s.grain,
      reporterRule: s.reporterRule,
      finality: s.finality ?? null,
    })),
    anomalies,
    missing_months: missingMonths,
    reproduce: {
      command: `npm run build:onshore -- --region ${region.id}`,
      raw_archive: `Every workbook is archived verbatim under .gev-cache/onshore/<state>/ (git-ignored) with a .retrieved sidecar; parsed rows are cached beside it keyed by sha256; --replay rebuilds from the archive, --check diffs against the committed bytes.`,
    },
  };

  if (check) {
    const results = [];
    const compare = (file, text) => {
      const committed = existsSync(file) ? readFileSync(file, 'utf8') : '';
      const same = committed === text;
      results.push(same);
      log(
        same
          ? `check: ${path.relative(root, file)} matches the committed bytes (${Buffer.byteLength(text).toLocaleString()} B)`
          : `check: ${path.relative(root, file)} DIFFERS (${committed.length.toLocaleString()} vs ${text.length.toLocaleString()} chars)`,
      );
    };
    compare(path.join(outDir, 'index.json'), indexJson);
    compare(path.join(outDir, 'clusters.json'), clustersJson);
    if (existsSync(shardDir)) {
      let same = 0;
      for (const shard of shardFiles) {
        const file = path.join(shardDir, `${shard.shard}.json`);
        if (existsSync(file) && readFileSync(file, 'utf8') === shard.text)
          same += 1;
      }
      log(
        `check: ${same} of ${shardFiles.length} history shards match on disk`,
      );
      results.push(same === shardFiles.length);
    } else {
      log('check: no history shards on disk (not committed; skipped)');
    }
    process.exitCode = results.every(Boolean) ? 0 : 1;
    return;
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(shardDir, { recursive: true });
  writeFileSync(path.join(outDir, 'index.json'), indexJson);
  writeFileSync(path.join(outDir, 'clusters.json'), clustersJson);
  writeFileSync(
    path.join(outDir, 'source.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    path.join(outDir, 'README.md'),
    readme(region, payload, manifest),
  );
  for (const shard of shardFiles)
    writeFileSync(path.join(shardDir, `${shard.shard}.json`), shard.text);
  const r = reconciliation.latest;
  log(
    `\nwrote ${path.relative(root, outDir)}\n` +
      `  ${rows.length.toLocaleString()} facilities (${tally.reported.toLocaleString()} filed for ${verdict.current}, ${tally.producing.toLocaleString()} producing, ${tally.quiet.toLocaleString()} quiet, ${tally.absent.toLocaleString()} absent, ${tally.unplaced} unplaced)\n` +
      `  ${(payload.counts.gasMcfdTotal / 1e6).toFixed(2)} Bcf/d gas · ${(payload.counts.oilBbldTotal / 1e6).toFixed(2)} MMbbl/d oil · ${(payload.counts.flaredMcfd / 1e3).toFixed(0)} MMcf/d flared · ${fields.length} fields · ${counties.length} counties · ${operators.size} operators\n` +
      (r
        ? `  EIA ${r.month}: ${Math.round(r.gasToGross * 100)} % of gross withdrawals, ${Math.round(r.gasToMarketed * 100)} % of marketed, oil ${Math.round(r.oilToEia * 100)} %\n`
        : '  EIA: no common month\n') +
      `  index ${(manifest.files[0].bytes / 1e6).toFixed(2)} MB raw · ${(manifest.files[0].gzip_bytes / 1e3).toFixed(0)} kB gzip · clusters ${(manifest.files[1].gzip_bytes / 1e3).toFixed(0)} kB gzip · shards ${shardFiles.length} files ${(shardGzip / 1e6).toFixed(1)} MB gzip (largest ${(manifest.shards.max_gzip_bytes / 1e3).toFixed(0)} kB)\n` +
      (anomalies.length ? `  anomalies: ${anomalies.join('; ')}\n` : ''),
  );
}

main().catch((error) => {
  process.stderr.write(
    `\nbuild-onshore failed: ${error.stack ?? error.message}\n`,
  );
  process.exitCode = 1;
});
