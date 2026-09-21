/**
 * Build the commodity-lng bundle (docs/COMMODITIES-PLAN.md §12.6.1): GEM
 * terminals with the EIA train table joined on, DOE cargoes, the GIIGNL
 * matrix, searoute-ts routes, the provenance manifest and the README.
 *
 *   node scripts/build-lng-bundle.mjs                 # rebuild from .gev-cache/lng/
 *   node scripts/build-lng-bundle.mjs --fetch         # re-download DOE, EIA and the GEM feed first
 *   node scripts/build-lng-bundle.mjs --check         # rebuild in memory; exit 1 unless byte-identical
 *   node scripts/build-lng-bundle.mjs --no-route-cache
 *
 * Run as `npm run build:lng`. Manifest counts are asserted so an upstream
 * change fails the build rather than moving the map.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OUT_DIR,
  RAW,
  ROOT,
  fetchInputs,
  fileDigest,
  rawPath,
  readRetrieved,
  readSheetRows,
  requireRaw,
  sha256,
} from './lng/inputs.mjs';
import {
  joinUsTrains,
  readEiaTrains,
  readGemFeed,
  readGemXlsxRows,
  rollUpTerminals,
} from './lng/terminals.mjs';
import { DOE_SHEET, buildCargoes, readDoeCargoes } from './lng/cargoes.mjs';
import { buildMatrix } from './lng/matrix.mjs';
import {
  RED_SEA_CLOSED_FROM,
  ROUTE_ENGINE,
  VIA_RADIUS_KM,
  buildRoutes,
  variantForPeriod,
} from './lng/routes.mjs';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const FETCH = argv.includes('--fetch');
const NO_ROUTE_CACHE = argv.includes('--no-route-cache');
const ROUTE_CACHE_FILE = rawPath('routes-cache.json');
const CROSSWALK_FILE = path.join(OUT_DIR, 'crosswalk.json');
const MATRIX_CSV = path.join(OUT_DIR, 'giignl-2025-matrix.csv');

/** Pinned so a moved upstream fails here, with the number named. */
const EXPECTED = Object.freeze({
  gemRelease: 'September 2025',
  eiaRelease: '2026-Q2',
  doeLatestMonth: '2026-06',
  giignlYear: 2025,
  giignlWorldMt: 427.9,
});

const log = (line) => {
  if (!CHECK) console.log(line);
};

function stableJson(value, pretty) {
  return `${pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)}\n`;
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function readRouteCache() {
  if (NO_ROUTE_CACHE || !existsSync(ROUTE_CACHE_FILE)) return new Map();
  return new Map(
    Object.entries(JSON.parse(readFileSync(ROUTE_CACHE_FILE, 'utf8'))),
  );
}

function writeRouteCache(cache) {
  if (NO_ROUTE_CACHE) return;
  mkdirSync(path.dirname(ROUTE_CACHE_FILE), { recursive: true });
  writeFileSync(ROUTE_CACHE_FILE, stableJson(Object.fromEntries(cache), false));
}

async function build() {
  if (FETCH) {
    log('fetching DOE, EIA and the GEM feed…');
    await fetchInputs();
  }
  const retrieved = readRetrieved();
  const crosswalk = JSON.parse(readFileSync(CROSSWALK_FILE, 'utf8'));

  // 1. Terminals -----------------------------------------------------------
  const gemXlsx = rawPath(RAW.gemXlsx);
  const gemFromXlsx = existsSync(gemXlsx);
  const gemFile = gemFromXlsx
    ? gemXlsx
    : requireRaw(
        RAW.gemFeed,
        'place the GEM LNG-terminals xlsx there as gem-lng-terminals.xlsx, or run with --fetch to pull the public feed',
      );
  const gemSource = {
    name: 'Global Energy Monitor, Global Gas Infrastructure Tracker, LNG terminals',
    release: EXPECTED.gemRelease,
    license: 'CC BY 4.0',
    retrieved:
      retrieved[gemFromXlsx ? RAW.gemXlsx : RAW.gemFeed]?.retrieved ?? null,
    file: gemFromXlsx
      ? 'xlsx download (email form)'
      : 'public tracker-map feed, LNG units',
  };
  const units = gemFromXlsx
    ? readGemXlsxRows(readSheetRows(gemFile, 'LNG Terminals'))
    : readGemFeed(gemFile);
  const { terminals, skipped: skippedUnits } = rollUpTerminals(units, {
    source: gemSource,
  });
  const eiaFile = requireRaw(RAW.eia, 'run with --fetch');
  const trains = readEiaTrains(
    readSheetRows(eiaFile, 'Existing & Under Construction'),
  );
  const join = joinUsTrains(terminals, trains, crosswalk);
  const terminalsById = new Map(terminals.map((t) => [t.id, t]));
  const countBy = (pick) => {
    const out = {};
    for (const t of terminals) out[pick(t)] = (out[pick(t)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort());
  };
  const terminalCounts = {
    terminals: terminals.length,
    byKind: countBy((t) => t.kind),
    byKindStatus: countBy((t) => `${t.kind}:${t.status}`),
    countries: new Set(terminals.map((t) => t.country)).size,
    usExport: join.usExports,
    eiaTrains: join.trainsTotal,
    eiaTrainsJoined: join.trainsJoined,
    gemUnitsRead: units.length,
    unitsWithoutFacilityType: skippedUnits,
  };
  log(`terminals: ${JSON.stringify(terminalCounts)}`);

  // 2. Cargoes ---------------------------------------------------------------
  const doeFile = requireRaw(RAW.doe, 'run with --fetch');
  const cargoRows = readDoeCargoes(readSheetRows(doeFile, DOE_SHEET));
  const cargoes = buildCargoes(cargoRows, { terminals, crosswalk });
  // The file's own publication date, so the panel can state the lag honestly.
  cargoes.published = retrieved[RAW.doe]?.lastModified
    ? new Date(retrieved[RAW.doe].lastModified).toISOString().slice(0, 10)
    : null;
  cargoes.source = {
    name: 'DOE Office of Fossil Energy and Carbon Management, U.S. LNG Exports and Re-Exports Details',
    license: 'US public domain',
    retrieved: retrieved[RAW.doe]?.retrieved ?? null,
  };
  if (cargoes.latestMonth !== EXPECTED.doeLatestMonth)
    throw new Error(
      `DOE latest month is ${cargoes.latestMonth}; the build pins ${EXPECTED.doeLatestMonth} — update EXPECTED and the tests together`,
    );
  log(
    `cargoes: ${JSON.stringify(cargoes.counts)} span ${cargoes.span.from}..${cargoes.span.to}`,
  );

  // 3. Matrix ----------------------------------------------------------------
  const matrix = buildMatrix(readFileSync(MATRIX_CSV, 'utf8'), {
    terminals,
    crosswalk,
    year: EXPECTED.giignlYear,
  });
  if (Math.abs(matrix.world - EXPECTED.giignlWorldMt) > 0.05)
    throw new Error(
      `GIIGNL world total is ${matrix.world}; the build pins ${EXPECTED.giignlWorldMt}`,
    );
  log(`matrix: ${JSON.stringify(matrix.counts)} world ${matrix.world} MT`);

  // 4. Routes ----------------------------------------------------------------
  const pairs = [];
  const destinationByCountry = new Map(
    cargoes.destinations.map((d) => [d.doeCountry, d]),
  );
  for (const p of cargoes.pairs) {
    const dest = destinationByCountry.get(p.country);
    if (!dest.terminalId) continue;
    pairs.push({
      id: `doe:${p.terminalId}:${slug(p.country)}`,
      grade: 'doe',
      period: `${cargoes.span.from} to ${cargoes.span.to}`,
      originId: p.terminalId,
      destinationId: dest.terminalId,
      originCountry: terminalsById.get(p.terminalId).country,
      destinationCountry: dest.country,
      doeCountry: p.country,
      endpointRule: { origin: 'doe-point-of-exit', destination: dest.rule },
      volume: { cargoes: p.cargoes, mmcf: p.mmcf, months: p.months },
    });
  }
  const exporterByColumn = new Map(matrix.exporters.map((e) => [e.column, e]));
  const importerByMarket = new Map(matrix.importers.map((i) => [i.market, i]));
  for (const cell of matrix.cells) {
    const e = exporterByColumn.get(cell.exporter);
    const i = importerByMarket.get(cell.importer);
    if (!i.terminalId || e.terminalId === i.terminalId) continue;
    if (e.column === 'USA') continue; // the DOE grade owns every US pair
    pairs.push({
      id: `giignl:${e.terminalId}:${i.terminalId}`,
      grade: 'giignl',
      period: matrix.period,
      originId: e.terminalId,
      destinationId: i.terminalId,
      originCountry: e.country,
      destinationCountry: i.country,
      exporterColumn: e.column,
      importerMarket: i.market,
      endpointRule: { origin: e.rule, destination: i.rule },
      volume: { mt: cell.mt },
    });
  }
  pairs.sort((a, b) => a.id.localeCompare(b.id));
  const cache = readRouteCache();
  log(
    `routing ${pairs.length} pairs${cache.size ? ` (${cache.size} cached variants)` : ''}…`,
  );
  let routed;
  try {
    routed = buildRoutes(pairs, terminalsById, { cache, log });
  } finally {
    writeRouteCache(cache);
  }
  const routes = routed.routes.map((r) => ({
    ...r,
    variantInUse: variantForPeriod(
      r,
      r.grade === 'doe' ? cargoes.span.to : String(matrix.year),
    ),
  }));
  const routeCounts = {
    routes: routes.length,
    byGrade: {
      doe: routes.filter((r) => r.grade === 'doe').length,
      giignl: routes.filter((r) => r.grade === 'giignl').length,
    },
    redSeaExposed: routes.filter((r) => r.redSeaExposed).length,
    drawnClosed: routes.filter((r) => r.variantInUse === 'redSeaClosed').length,
    noSeaRoute: routed.unrouted.length,
    unroutedDoePairs:
      cargoes.pairs.length - routes.filter((r) => r.grade === 'doe').length,
    unroutedGiignlCells:
      matrix.cells.filter((c) => c.exporter !== 'USA').length -
      routes.filter((r) => r.grade === 'giignl').length,
    maxVertices: Math.max(
      ...routes.flatMap((r) => [
        r.variants.open.coords.length,
        r.variants.redSeaClosed?.coords.length ?? 0,
      ]),
    ),
  };
  log(`routes: ${JSON.stringify(routeCounts)}`);
  for (const u of routed.unrouted)
    log(
      `  no sea route: ${u.id} ${u.origin} → ${u.destination} ${JSON.stringify(u.volume)}`,
    );

  // 5. Files ------------------------------------------------------------------
  const files = {
    'terminals.json': stableJson(
      {
        schema: 'lng-terminals/1',
        gem: gemSource,
        eia: {
          name: 'EIA U.S. Liquefaction Capacity workbook',
          release: EXPECTED.eiaRelease,
          retrieved: retrieved[RAW.eia]?.retrieved ?? null,
        },
        counts: terminalCounts,
        terminals,
      },
      true,
    ),
    'cargoes.json': stableJson(cargoes, false),
    'matrix.json': stableJson(matrix, false),
    'routes.json': stableJson(
      {
        schema: 'lng-routes/1',
        engine: ROUTE_ENGINE,
        policy: {
          redSeaClosedFrom: RED_SEA_CLOSED_FROM,
          viaRadiusKm: VIA_RADIUS_KM,
        },
        counts: routeCounts,
        unrouted: routed.unrouted,
        routes,
      },
      false,
    ),
  };
  const manifestFiles = Object.entries(files).map(([name, text]) => {
    const buffer = Buffer.from(text);
    return {
      path: name,
      format: 'JSON',
      sha256: sha256(buffer),
      bytes: buffer.length,
      gzip_bytes: gzipSync(buffer).length,
    };
  });
  const totalBytes = manifestFiles.reduce((s, f) => s + f.bytes, 0);
  if (totalBytes > 8 * 1024 * 1024)
    throw new Error(`bundle is ${totalBytes} bytes, over the 8 MB gate`);

  const input = (name) => {
    const entry = retrieved[name] ?? {};
    const file = rawPath(name);
    return {
      file: name,
      ...(existsSync(file) ? fileDigest(file) : {}),
      url: entry.url ?? null,
      retrieved: entry.retrieved ?? null,
      lastModified: entry.lastModified ?? null,
    };
  };
  const manifest = {
    id: 'commodity-lng',
    name: 'LNG terminals, US cargoes, the GIIGNL import matrix and modelled sea routes',
    category: 'infrastructure',
    description:
      "Bundle for the commodity-lng layer: every operating and under-construction LNG terminal in GEM's tracker, " +
      'the EIA train table joined onto US export plants, DOE cargo-level US exports, the GIIGNL annual country matrix, ' +
      'and searoute-ts shortest sea routes between the terminals that the trade files pair.',
    vintage: {
      terminals: `GEM ${EXPECTED.gemRelease}`,
      trains: `EIA ${EXPECTED.eiaRelease}`,
      cargoes: `DOE through ${cargoes.latestMonth}`,
      matrix: `GIIGNL annual ${matrix.year}`,
    },
    span: cargoes.span,
    inputs: {
      gem: {
        ...input(gemFromXlsx ? RAW.gemXlsx : RAW.gemFeed),
        release: EXPECTED.gemRelease,
        license: 'CC BY 4.0',
        via: gemSource.file,
      },
      eia: {
        ...input(RAW.eia),
        release: EXPECTED.eiaRelease,
        license: 'US public domain',
      },
      doe: {
        ...input(RAW.doe),
        release: `through ${cargoes.latestMonth}`,
        license: 'US public domain',
      },
      giignl: {
        file: path.basename(MATRIX_CSV),
        pdfSha256: matrix.pdfSha256,
        release: 'Annual Report 2026 edition',
        license: 'cited; public PDF, re-typed matrix',
      },
      routes: { ...ROUTE_ENGINE, license: 'MIT (code); Eurostat network' },
    },
    counts: {
      terminals: terminalCounts,
      cargoes: cargoes.counts,
      matrix: matrix.counts,
      routes: routeCounts,
    },
    assumptions: [
      'Terminal kind is export when GEM lists any operating or under-construction export unit, else import; a plant with both keeps its regas capacity as regasMtpa.',
      "Mtpa and Bcf/d for US plants are the EIA workbook's own paired columns per train, summed over trains in commercial operation; GEM-only terminals carry Mtpa alone.",
      "One arc per pair ends at the importing country's largest operating regas terminal by GEM capacity (fallbacks named in endpointRule); it does not split a country's volume across its terminals.",
      `Routes are searoute-ts shortest paths; redSeaClosed blocks Bab el-Mandeb and is the variant drawn for periods from ${RED_SEA_CLOSED_FROM} on pairs whose open route uses the strait.`,
      'US pairs come from the DOE grade only; the USA column of the GIIGNL matrix is not drawn a second time.',
      `A route lists a chokepoint in via[] when its line passes within ${VIA_RADIUS_KM} km of the PortWatch pin: measured over every lane, threaded passages sit 1 to 27 km off (Hormuz and Malacca at 26.9 km, pinned mid-strait) and the nearest merely-passed pin is 45 km off, so the PRD's 25 km is widened to 40 km.`,
    ],
    files: manifestFiles,
    total_bytes: totalBytes,
    reproduce: {
      command: 'npm run build:lng',
      check: 'node scripts/build-lng-bundle.mjs --check',
      raw: '.gev-cache/lng/ (git-ignored): GEM xlsx or feed subset, DOE and EIA workbooks, GIIGNL PDF, retrieved.json',
    },
  };
  files['source.json'] = stableJson(manifest, true);
  files['README.md'] = readme({
    manifest,
    terminalCounts,
    cargoes,
    matrix,
    routeCounts,
    gemFromXlsx,
  });
  return files;
}

function readme({
  manifest,
  terminalCounts,
  cargoes,
  matrix,
  routeCounts,
  gemFromXlsx,
}) {
  const n = (v) => Number(v).toLocaleString('en-US');
  return `# LNG terminals, cargoes, matrix and routes

Bundle for the \`commodity-lng\` layer (row 10, \`docs/COMMODITIES-PLAN.md\` §12).
Static assets: nothing here is fetched at runtime. Every number carries its
source's own date (R2, R3): GEM ${manifest.vintage.terminals.replace('GEM ', '')} for terminals,
EIA ${manifest.vintage.trains.replace('EIA ', '')} for US trains, DOE cargoes through ${cargoes.latestMonth},
GIIGNL annual ${matrix.year} for the non-US matrix.

## Files

- \`terminals.json\` — ${n(terminalCounts.terminals)} terminals (${JSON.stringify(terminalCounts.byKindStatus)})
  in ${terminalCounts.countries} countries, rolled up from ${n(terminalCounts.gemUnitsRead)} GEM units; the
  ${terminalCounts.usExport} US export plants carry \`us.trains\` from the EIA workbook (${terminalCounts.eiaTrainsJoined} of ${terminalCounts.eiaTrains} rows joined).
- \`cargoes.json\` — DOE vessel exports: ${n(cargoes.counts.detailRows)} per-cargo rows from ${cargoes.detailFrom},
  ${n(cargoes.counts.monthlyRows)} monthly terminal-by-country rows since ${cargoes.firstMonth}; span
  ${cargoes.span.from} to ${cargoes.span.to} holds ${n(cargoes.counts.cargoesInWindow)} cargoes, ${n(cargoes.counts.mmcfInWindow)} MMcf, ${cargoes.counts.pairsInWindow} pairs.
- \`matrix.json\` — GIIGNL ${matrix.year}: ${matrix.counts.exporters} exporters × ${matrix.counts.importers} markets, ${matrix.counts.cells} cells, world ${matrix.world} MT.
- \`routes.json\` — ${routeCounts.routes} pairs (${routeCounts.byGrade.doe} DOE, ${routeCounts.byGrade.giignl} GIIGNL); ${routeCounts.redSeaExposed} pass Bab el-Mandeb when open and
  ${routeCounts.drawnClosed} draw the Cape variant for the current period; longest line ${routeCounts.maxVertices} vertices.
- \`source.json\` — the manifest: inputs, retrieval dates, sha256 per file, counts, assumptions.
- \`crosswalk.json\` — hand-kept: GEM id ↔ EIA project ↔ DOE point of exit ↔ EIA API code, country aliases, endpoint overrides.
- \`giignl-${matrix.year}-matrix.csv\` — the re-typed report table with the PDF's sha256 in its first line.

## Sources and licences

- Global Energy Monitor, Global Gas Infrastructure Tracker, LNG terminals, ${manifest.vintage.terminals.replace('GEM ', '')} release, CC BY 4.0.
  ${gemFromXlsx ? 'Read from the xlsx download (email form, no API).' : "Read from GEM's public tracker-map feed (the same release; it lacks the Operator column, so cards show owner and parent until the xlsx is placed)."}
- EIA, U.S. Liquefaction Capacity, ${manifest.vintage.trains.replace('EIA ', '')} workbook, sheet "Existing & Under Construction". Public domain.
- DOE Office of Fossil Energy and Carbon Management, "3. U.S. LNG Exports and Re-Exports Details", monthly. Public domain.
- GIIGNL Annual Report ${matrix.year + 1} edition, "LNG Quantities (in MT) received in ${matrix.year}", public PDF, re-typed once by
  \`scripts/extract-giignl-matrix.mjs\` and reconciled to its printed subtotals. Cited, not redistributed as a workbook.
- searoute-ts ${manifest.inputs.routes.version} (MIT) over the Eurostat maritime network for the modelled routes.

## Refresh

1. \`node scripts/build-lng-bundle.mjs --fetch\` re-downloads DOE (found through the article page, the href suffix moves monthly),
   the EIA workbook and the GEM feed into \`.gev-cache/lng/\` and stamps \`retrieved.json\`.
2. Manual: place the GEM xlsx as \`.gev-cache/lng/gem-lng-terminals.xlsx\` (preferred over the feed when present);
   for a new GIIGNL edition run \`node scripts/extract-giignl-matrix.mjs <pdf> --year <yyyy>\`.
3. Update \`EXPECTED\` in \`scripts/build-lng-bundle.mjs\` and the pinned counts in \`src/layers/lng/*.test.mjs\` together.
4. \`node scripts/build-lng-bundle.mjs --check\` must exit 0 against the committed bundle.

## How the layer reads the bundle

\`src/layers/lng/source.js\` fetches the four JSON files; \`records.js\` normalizes and freezes them and derives the
twelve-month figures, utilization (span MMcf ÷ baseload Bcf/d × 365 × 1,000, labelled arithmetic) and the card lines.
`;
}

async function main() {
  const files = await build();
  mkdirSync(OUT_DIR, { recursive: true });
  if (CHECK) {
    const drift = [];
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(OUT_DIR, name);
      if (!existsSync(file)) drift.push(`${name}: missing`);
      else if (readFileSync(file, 'utf8') !== text)
        drift.push(
          `${name}: differs (${readFileSync(file).length} committed vs ${Buffer.byteLength(text)} rebuilt bytes)`,
        );
    }
    if (drift.length) {
      console.error(
        `build-lng-bundle --check: bundle drift\n  ${drift.join('\n  ')}`,
      );
      process.exit(1);
    }
    console.log(
      `build-lng-bundle --check: ${Object.keys(files).length} files byte-identical`,
    );
    return;
  }
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(OUT_DIR, name);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
    writeFileSync(file, text);
    const state =
      before === null ? 'new' : before === text ? 'unchanged' : 'changed';
    console.log(
      `  ${state.padEnd(9)} ${path.relative(ROOT, file)} (${Buffer.byteLength(text).toLocaleString('en-US')} bytes)`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
