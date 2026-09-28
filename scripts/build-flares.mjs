#!/usr/bin/env node
/**
 * Row 15 M1 (plan §17.8 FR-F1): the flare-site gazetteer for a region.
 *
 * Reads the row 12 onshore bundle (index + the git-ignored history shards,
 * so run `npm run build:onshore -- --region <id>` first on a fresh clone),
 * merges wells closer than 150 m into pads, and keeps as sites the pads that
 * flared in any of the last 12 filed months. Writes
 * `src/data/local_data/flares/<region>/{sites.json,source.json,README.md}`.
 * No network; the output depends only on the onshore bundle.
 *
 *   node scripts/build-flares.mjs --region williston
 *   node scripts/build-flares.mjs --region williston --check   # rebuild and diff against the committed bytes
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { FLARE_REGIONS, PAD_LINK_M, clusterPads } from '../src/data/flares.js';

const SERIES_MONTHS = 24;
const LOOKBACK_MONTHS = 12;
const FLARED = 6; // index of `flared` in the onshore reading columns

const args = process.argv.slice(2);
const regionId = args.includes('--region')
  ? args[args.indexOf('--region') + 1]
  : null;
const check = args.includes('--check');
const region = FLARE_REGIONS[regionId];
if (!region?.onshore) {
  console.error(
    `usage: build-flares.mjs --region <${Object.values(FLARE_REGIONS)
      .filter((r) => r.onshore)
      .map((r) => r.id)
      .join('|')}> [--check]`,
  );
  process.exit(2);
}

const onshoreDir = `src/data/local_data/onshore/${region.onshore}`;
const shardDir = `public/data/onshore/${region.onshore}/history`;
const outDir = `src/data/local_data/flares/${region.id}`;

const indexBytes = readFileSync(`${onshoreDir}/index.json`);
const index = JSON.parse(indexBytes.toString('utf8'));
if (index.readingColumns?.[FLARED] !== 'flared')
  throw new Error(`reading column ${FLARED} is not flared`);
const months = index.months;
const current = index.current.month;
if (months[index.current.index] !== current)
  throw new Error('index.current does not point at its month');
const end = index.current.index + 1;
const seriesMonths = months.slice(end - SERIES_MONTHS, end);
const lookFrom = SERIES_MONTHS - LOOKBACK_MONTHS;

// The monthly series per well, from the history shards.
const shardNames = new Set(index.shards?.names ?? []);
const series = new Map();
let shardsRead = 0;
if (!existsSync(shardDir))
  throw new Error(
    `${shardDir} missing: run npm run build:onshore -- --region ${region.onshore}`,
  );
for (let i = 0; i < (index.shards?.count ?? 1024); i += 1) {
  const name = i.toString(16).padStart(3, '0');
  if (shardNames.size && !shardNames.has(name)) continue;
  const path = `${shardDir}/${name}.json`;
  if (!existsSync(path)) continue;
  const shard = JSON.parse(readFileSync(path, 'utf8'));
  if (shard.months.join() !== months.join())
    throw new Error(
      `${path}: months differ from the index; rebuild the onshore bundle`,
    );
  const col = shard.columns.indexOf('flared');
  const gasCol = shard.columns.indexOf('gas');
  const oilCol = shard.columns.indexOf('oil');
  for (const [id, row] of Object.entries(shard.facilities)) {
    const cols = Array.isArray(row) ? row : shard.columns.map((c) => row[c]);
    series.set(id, {
      flared: cols[col].slice(end - SERIES_MONTHS, end),
      gas: cols[gasCol].slice(end - SERIES_MONTHS, end),
      oil: cols[oilCol].slice(end - SERIES_MONTHS, end),
    });
  }
  shardsRead += 1;
}

const wells = index.facilities.filter(
  (f) => Number.isFinite(f.lat) && Number.isFinite(f.lon),
);
const missingSeries = wells.filter((w) => !series.has(w.id));
if (missingSeries.length)
  throw new Error(
    `${missingSeries.length} wells have no history shard row (e.g. ${missingSeries[0].id}); rebuild the onshore bundle`,
  );

const sum = (a) => a.reduce((s, v) => s + (v ?? 0), 0);
const flaredOf = (w) => series.get(w.id).flared;

const pads = clusterPads(wells, PAD_LINK_M);
const sites = [];
for (const pad of pads) {
  const flared = seriesMonths.map((_, m) =>
    sum(pad.map((w) => flaredOf(w)[m])),
  );
  if (!flared.slice(lookFrom).some((v) => v > 0)) continue;
  const lat = pad.reduce((s, w) => s + w.lat, 0) / pad.length;
  const lon = pad.reduce((s, w) => s + w.lon, 0) / pad.length;
  const gasNow = sum(pad.map((w) => series.get(w.id).gas.at(-1)));
  const oilNow = sum(pad.map((w) => series.get(w.id).oil.at(-1)));
  const operators = rank(
    pad,
    (w) => w.operator,
    (w) => series.get(w.id).gas.at(-1) ?? 0,
  );
  const lastFlared = flared.findLastIndex((v) => v > 0);
  sites.push({
    id: `${region.id}-${pad[0].id}`,
    lat: round(lat, 5),
    lon: round(lon, 5),
    field: mode(pad.map((w) => w.field)),
    county: mode(pad.map((w) => w.county)),
    operators,
    wells: pad.map((w) => w.id),
    flared,
    lastFlaredMonth: seriesMonths[lastFlared],
    monthsFlared: flared.slice(lookFrom).filter((v) => v > 0).length,
    gas: gasNow,
    oil: oilNow,
  });
}

// Nothing dropped: every Mcf any well flared in the lookback sits on a site.
const allFlared = seriesMonths.map((_, m) =>
  sum(wells.map((w) => flaredOf(w)[m])),
);
const siteFlared = seriesMonths.map((_, m) =>
  sum(sites.map((s) => s.flared[m])),
);
for (let m = lookFrom; m < SERIES_MONTHS; m += 1) {
  if (allFlared[m] !== siteFlared[m])
    throw new Error(
      `${seriesMonths[m]}: sites hold ${siteFlared[m]} Mcf of ${allFlared[m]} flared`,
    );
}
const indexFlared = sum(index.facilities.map((f) => f.current?.[FLARED] ?? 0));
if (indexFlared !== allFlared.at(-1))
  throw new Error(
    `current month: shards say ${allFlared.at(-1)} Mcf flared, the index ${indexFlared}`,
  );

const daysIn = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const siteWells = sites.reduce((s, x) => s + x.wells.length, 0);
const multiWellPads = pads.filter((p) => p.length > 1).length;
const counts = {
  wells: wells.length,
  pads: pads.length,
  multiWellPads,
  sites: sites.length,
  siteWells,
  sitesFlaringCurrent: sites.filter((s) => s.flared.at(-1) > 0).length,
  flaredMcfCurrent: allFlared.at(-1),
  flaredMmcfdCurrent: round(allFlared.at(-1) / 1000 / daysIn(current), 1),
  flaredMcfLookback: sum(allFlared.slice(lookFrom)),
  largestPadWells: Math.max(...pads.map((p) => p.length)),
};

const onshoreSource = JSON.parse(
  readFileSync(`${onshoreDir}/source.json`, 'utf8'),
);
const sitesJson = {
  id: `flares-${region.id}-sites`,
  version: 1,
  region: {
    id: region.id,
    name: region.name,
    center: region.center,
    box: region.box,
  },
  source: {
    bundle: onshoreSource.id,
    name: index.sources?.[0]?.name ?? onshoreSource.name,
    retrieved: onshoreSource.downloaded_at,
    currentMonth: current,
  },
  rule: {
    padLinkM: PAD_LINK_M,
    lookbackMonths: LOOKBACK_MONTHS,
    site: `a pad (wells within ${PAD_LINK_M} m, single linkage) with flared gas in any of the ${LOOKBACK_MONTHS} months to ${current}`,
    units: {
      flared: 'Mcf per month',
      gas: 'Mcf in the current month',
      oil: 'bbl in the current month',
    },
  },
  months: seriesMonths,
  counts,
  sites,
};

const sitesText = `${JSON.stringify(sitesJson)}\n`;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sourceJson = {
  id: `flares-${region.id}`,
  name: `${region.name} flare sites (pads that flared in the last ${LOOKBACK_MONTHS} months)`,
  category: 'production',
  description:
    'Flare-site gazetteer for the commodity-flares layer (row 15): wells from the row 12 onshore bundle grouped into pads, kept when the pad flared in the lookback. Derived; no network.',
  derived_from: {
    bundle: onshoreSource.id,
    'index.json sha256': sha(indexBytes),
    shards: shardsRead,
    retrieved: onshoreSource.downloaded_at,
  },
  license_note: onshoreSource.license_note,
  files: [
    {
      path: 'sites.json',
      format: 'JSON',
      bytes: Buffer.byteLength(sitesText),
      sha256: sha(sitesText),
    },
  ],
};
const sourceText = `${JSON.stringify(sourceJson, null, 2)}\n`;

const top = [...sites]
  .sort((a, b) => b.flared.at(-1) - a.flared.at(-1))
  .slice(0, 5);
const readme = `# ${region.name} flare sites

Bundled flare-site gazetteer for the \`commodity-flares\` layer (row 15, plan
§17). Derived from the row 12 onshore bundle \`${onshoreSource.id}\`
(retrieved ${onshoreSource.downloaded_at}); rebuilt by
\`npm run build:flares -- --region ${region.id}\` (\`--check\` diffs against the
committed bytes). Needs the onshore history shards on disk.

- **Rule:** ${sitesJson.rule.site}.
- **Current month:** ${current}. Series: ${seriesMonths[0]} to ${current}, flared Mcf per month per site.
- **Wells:** ${counts.wells} with coordinates, in ${counts.pads} pads (${counts.multiWellPads} with more than one well; the largest holds ${counts.largestPadWells}).
- **Sites:** ${counts.sites} pads, ${counts.siteWells} wells; ${counts.sitesFlaringCurrent} flared in ${current}.
- **Nothing dropped:** in each of the ${LOOKBACK_MONTHS} lookback months the sites hold every Mcf the wells filed as flared (${current}: ${counts.flaredMcfCurrent} Mcf, ${counts.flaredMmcfdCurrent} MMcf/d); the build fails otherwise.
- **Largest flare sites in ${current}:** ${top
  .map(
    (s) =>
      `${s.field} (${s.operators[0]}, ${Math.round(s.flared.at(-1) / daysIn(current))} Mcf/d)`,
  )
  .join('; ')}.

Per site: \`id\` (region + smallest well id), centroid, field and county (the
most common among its wells), \`operators\` (as filed for ${current}, largest gas
first), \`wells\`, \`flared\` (24 months), \`lastFlaredMonth\`, \`monthsFlared\`
(of the last ${LOOKBACK_MONTHS}), \`gas\` and \`oil\` this month.
`;

const outputs = [
  ['sites.json', sitesText],
  ['source.json', sourceText],
  ['README.md', readme],
];

console.log(
  `${region.name}: ${counts.wells} wells → ${counts.pads} pads → ${counts.sites} sites (${counts.siteWells} wells); ${current} flared ${counts.flaredMcfCurrent} Mcf (${counts.flaredMmcfdCurrent} MMcf/d), 100 % on sites in each of ${LOOKBACK_MONTHS} months; sites.json ${(Buffer.byteLength(sitesText) / 1e6).toFixed(2)} MB`,
);

if (check) {
  let drift = 0;
  for (const [name, text] of outputs) {
    const path = `${outDir}/${name}`;
    const committed = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (committed !== text) {
      drift += 1;
      console.error(`DRIFT ${path}`);
    }
  }
  if (drift) process.exit(1);
  console.log('check: byte-identical');
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of outputs) writeFileSync(`${outDir}/${name}`, text);
  console.log(`wrote ${outDir}/`);
}

function round(v, digits) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** The most common value; ties go to the alphabetically first. */
function mode(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return (
    [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0]?.[0] ?? null
  );
}

/** Distinct values ranked by their summed weight, then name. */
function rank(items, value, weight) {
  const totals = new Map();
  for (const it of items) {
    const v = value(it);
    if (v) totals.set(v, (totals.get(v) ?? 0) + weight(it));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([v]) => v);
}
