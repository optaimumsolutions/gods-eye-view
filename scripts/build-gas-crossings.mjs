/**
 * Build src/data/local_data/eia_energy/gas-crossings.json — the border-crossing
 * gazetteer for row 4 (docs/COMMODITIES-PLAN.md §10.7, R4.10 to R4.13, R4.21 to R4.26).
 *
 * Source: NACEI layer 2, "Natural Gas Pipeline" crossing points.
 *   https://geoappext.nrcan.gc.ca/arcgis/rest/services/NACEI/
 *     energy_infrastructure_of_north_america_en/MapServer/2
 *
 * These 99 points supply **coordinates and nothing else**. Identity, volume,
 * direction, colour and size all come from EIA's monthly filings, which are a
 * different build and a different milestone. The programme that produced this
 * layer is dead — the NACEI FTP carries exactly three vintage stamps, 201606,
 * 201701 and 201708, and nothing after — so it sits below the 24-month vintage
 * gate and may place a mark without carrying a number.
 *
 * What this build proves, and re-proves on every run:
 *   · the 29 blank `Vol_MMcfd` records stay blank and never become zeros
 *   · filings pair only across the border, and only 1:1
 *   · the two filings on a paired mark are kept verbatim and never summed
 *   · every design magnitude leaves as a string with `design (2017)` inside it
 *
 * Usage:
 *   node scripts/build-gas-crossings.mjs
 *   node scripts/build-gas-crossings.mjs --raw <dir> | --replay <dir>
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchAllFeatures, readArgs } from './arcgis-paging.mjs';
import {
  PAIR_RADIUS_M,
  groupNaceiByCell,
} from '../src/layers/gasFlows/naceiCells.js';
import { parseNumericField } from '../src/layers/gasFlows/coerce.js';

const LAYER_URL =
  'https://geoappext.nrcan.gc.ca/arcgis/rest/services/NACEI/energy_infrastructure_of_north_america_en/MapServer/2';

const ORDER_FIELD = 'OBJECTID';

/** 2017, and the programme is dead. Below the 24-month gate: geometry only (R4.11). */
const VINTAGE = Object.freeze({
  period: '2017',
  label: 'NACEI 2017',
  evidence:
    'Period field holds 2017 (71 records) and 201706 (28, the Canadian NEB/ONÉ filings); ' +
    'the NACEI FTP carries only 201606, 201701 and 201708',
  gate: 'older than 24 months — contributes coordinates only, never a number, a direction or a magnitude',
});

const MANIFEST = Object.freeze({
  featureCount: 99,
  blankVolume: 29,
  blankDiameter: 53,
  blankPressure: 59,
  cells: 60,
  multiFilingCells: 39,
  filedBy: { Mexico: 20, Canada: 28, 'United States': 51 },
});

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'src', 'data', 'local_data', 'eia_energy');
const OUT_FILE = path.join(OUT_DIR, 'gas-crossings.json');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function auditRawFields(features) {
  const attrs = features.map((f) => f.attributes ?? f);
  const blank = (key) =>
    attrs.filter((a) => String(a[key] ?? '').trim() === '').length;
  const filedBy = {};
  for (const a of attrs) filedBy[a.Country] = (filedBy[a.Country] ?? 0) + 1;

  // The blank-to-zero trap, asserted on the real population rather than trusted.
  const blanksThatWouldBecomeZero = attrs.filter(
    (a) =>
      String(a.Vol_MMcfd ?? '').trim() === '' &&
      parseNumericField(a.Vol_MMcfd) === 0,
  ).length;

  return {
    blankVolume: blank('Vol_MMcfd'),
    blankDiameter: blank('Diam_Inch'),
    blankPressure: blank('MaxOP_psi'),
    blanksThatWouldBecomeZero,
    multiValueDiameters: [
      ...new Set(
        attrs
          .map((a) => String(a.Diam_Inch ?? '').trim())
          .filter((v) => v !== '' && parseNumericField(v) === null),
      ),
    ].sort(),
    periods: [...new Set(attrs.map((a) => String(a.Period)))].sort(),
    filedBy,
  };
}

function assertManifest(features, audit, cells) {
  const problems = [];
  const multi = cells.filter((cell) => cell.filingCount > 1).length;
  if (features.length !== MANIFEST.featureCount)
    problems.push(
      `feature count ${features.length} ≠ ${MANIFEST.featureCount}`,
    );
  if (audit.blankVolume !== MANIFEST.blankVolume)
    problems.push(
      `blank Vol_MMcfd ${audit.blankVolume} ≠ ${MANIFEST.blankVolume}`,
    );
  if (audit.blankDiameter !== MANIFEST.blankDiameter)
    problems.push(
      `blank Diam_Inch ${audit.blankDiameter} ≠ ${MANIFEST.blankDiameter}`,
    );
  if (audit.blankPressure !== MANIFEST.blankPressure)
    problems.push(
      `blank MaxOP_psi ${audit.blankPressure} ≠ ${MANIFEST.blankPressure}`,
    );
  if (cells.length !== MANIFEST.cells)
    problems.push(
      `cell count ${cells.length} ≠ ${MANIFEST.cells} at ${PAIR_RADIUS_M} m`,
    );
  if (multi !== MANIFEST.multiFilingCells)
    problems.push(`multi-filing cells ${multi} ≠ ${MANIFEST.multiFilingCells}`);
  if (audit.blanksThatWouldBecomeZero !== 0) {
    problems.push(
      `${audit.blanksThatWouldBecomeZero} blank volumes coerced to 0 — the absence-as-zero guard has failed`,
    );
  }
  for (const [country, expected] of Object.entries(MANIFEST.filedBy)) {
    if (audit.filedBy[country] !== expected) {
      problems.push(
        `${country} filings ${audit.filedBy[country]} ≠ ${expected}`,
      );
    }
  }
  if (problems.length)
    throw new Error(`upstream has moved:\n  - ${problems.join('\n  - ')}`);
}

export async function buildGasCrossings(args = readArgs()) {
  const rawDir = args.raw
    ? path.resolve(String(args.raw))
    : path.join(root, '.gev-cache', 'gas-crossings-raw');
  const replayDir = args.replay ? path.resolve(String(args.replay)) : null;

  process.stdout.write(
    replayDir ? `replaying ${replayDir}\n` : `fetching ${LAYER_URL}\n`,
  );
  const { features, pages, upstreamSha256 } = await fetchAllFeatures(
    LAYER_URL,
    {
      outFields: '*',
      orderByFields: ORDER_FIELD,
      geometryPrecision: 7,
      outSR: 4326,
      rawDir: replayDir ? null : rawDir,
      replayDir,
    },
  );
  process.stdout.write(`  ${features.length} filings over ${pages} page(s)\n`);

  const audit = auditRawFields(features);
  const { cells, dropped } = groupNaceiByCell(features);
  assertManifest(features, audit, cells);

  const multiFiling = cells.filter((cell) => cell.filingCount > 1);
  const disagreeing = cells.filter((cell) => cell.directionsDisagree);

  const payload = {
    id: 'nacei-gas-border-crossings',
    name: 'North American gas pipeline border crossings',
    freshnessClass: 'published',
    vintage: VINTAGE,
    upstream: { url: LAYER_URL, pages, sha256: upstreamSha256 },
    join: {
      method: 'mutual nearest cross-border neighbour',
      radiusMetres: PAIR_RADIUS_M,
      note:
        'Not proximity clustering. Measured on these 99 records, 22 pairs of filings sit within 3 km ' +
        'of each other under the SAME government — necessarily distinct crossings, the closest 13 m ' +
        'apart — while genuine cross-border duplicates run from 15 m to at least 1,467 m. Those ranges ' +
        'overlap, so no radius separates them. Only filings from different governments may pair, and ' +
        'only as mutual nearest neighbours, which makes pairing 1:1 with no chaining. Over-merging is ' +
        'destructive (several EIA volumes would collide on one mark) and under-merging is safe (the ' +
        'hand-verified crosswalk pins the volume to one mark and the other stays a NACEI-only dot).',
    },
    encodingRules: {
      identity:
        'EIA only — NACEI contributes the coordinate and nothing else (R4.23)',
      magnitudes:
        'none; Diam_Inch, MaxOP_psi, Vol_MMcfd and NumPipes exist only as display strings carrying design (2017)',
      aggregation:
        'filings are never summed, averaged or reconciled to a best value (R4.24)',
    },
    counts: {
      filings: features.length,
      cells: cells.length,
      multiFilingCells: multiFiling.length,
      directionDisagreementCells: disagreeing.length,
      droppedWithoutCoordinates: dropped.length,
      widestCellSpreadMetres: Math.max(
        ...cells.map((cell) => cell.spreadMetres),
      ),
    },
    audit,
    cells,
  };

  const json = `${JSON.stringify(payload)}\n`;
  if (args.write !== false) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, json);
  }
  const bytes = Buffer.byteLength(json);
  const gz = gzipSync(json).length;

  process.stdout.write(
    `\n${args.write === false ? 'built' : 'wrote'} ${path.relative(root, OUT_FILE)}\n` +
      `  ${features.length} filings → ${cells.length} marks · ${multiFiling.length} paired across the border\n` +
      `  ${disagreeing.length} pairs where the two governments file opposite directions\n` +
      `  ${audit.blankVolume} blank volumes preserved as absences · 0 turned into zeros\n` +
      `  ${(bytes / 1e3).toFixed(0)} kB raw · ${(gz / 1e3).toFixed(0)} kB gzip\n`,
  );

  return {
    file: {
      path: 'gas-crossings.json',
      bytes,
      gzipBytes: gz,
      sha256: sha256(json),
      json,
    },
    payload,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  buildGasCrossings().catch((error) => {
    process.stderr.write(`\nbuild-gas-crossings failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
