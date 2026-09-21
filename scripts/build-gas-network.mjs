/**
 * Build src/data/local_data/eia_energy/gas-network.json — the US interstate and
 * intrastate gas transmission substrate for row 4
 * (docs/COMMODITIES-PLAN.md §10.7, R4.14 to R4.20).
 *
 * Source: EIA public-domain linework, republished as an ArcGIS FeatureServer.
 *   https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/
 *     Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0
 *
 * ── The vintage is a constant, because the service lies about it ──────────
 *
 * The service advertises `editingInfo.dataLastEditDate = 1751382528245`, which
 * is 2025-07-01 — a re-upload stamp, not a data date. The data is the January
 * 2020 shapefile `NaturalGas_Pipelines_US_202001`, whose `.shp.xml` CreaDate is
 * 20200427. So the vintage below is hard-coded and cites its evidence, and the
 * service's own timestamps are read only to be recorded and rejected.
 *
 * ── What this layer is allowed to be ─────────────────────────────────────
 *
 * Six fields, and nothing else: FID, TYPEPIPE, Operator, Status, Shape_Leng,
 * Shape__Length. No name, diameter, capacity, pressure, direction or
 * in-service date. `Status` has exactly one distinct value. `Operator` is a
 * company, not a pipeline, and several of the strings name companies that have
 * since dissolved or been absorbed. Feature density is a digitizing artifact.
 *
 * Every one of those is a reason this bundle carries no per-feature magnitude,
 * and the manifest below fails the build if any of them stops being true —
 * because if a diameter field ever appears, that is a decision for a human,
 * not a silently widened line.
 *
 * Usage:
 *   node scripts/build-gas-network.mjs                    # fetch, archive, build
 *   node scripts/build-gas-network.mjs --raw <dir>        # archive pages to <dir>
 *   node scripts/build-gas-network.mjs --replay <dir>     # rebuild from an archive
 *   node scripts/build-gas-network.mjs --precision 5      # emitted decimals
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchAllFeatures, readArgs } from './arcgis-paging.mjs';

const LAYER_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0';

/** The OID field on this layer is FID. `orderByFields=OBJECTID` returns an error object under HTTP 200. */
const ORDER_FIELD = 'FID';
const OUT_FIELDS = 'FID,TYPEPIPE,Operator,Status';

/**
 * Emitted coordinate precision, in decimal places.
 *
 * Fetched at 5 (~1.1 m) so the archive is faithful; emitted at 4 (~11 m),
 * because the closest zoom tier this layer draws at resolves roughly 100 m to
 * the pixel and the line is 1 px wide at every tier, so 11 m is a tenth of a
 * pixel. Measured over the same 32,892 features:
 *
 *   decimals   ~resolution   bundle raw   gzip      vertices   parts dropped
 *      5           1.1 m       4.15 MB    1.15 MB    193,169         11
 *      4          11   m       3.69 MB    0.93 MB    189,287         86   ← chosen
 *      3         111   m       2.93 MB    0.65 MB    167,022        546
 *
 * "Parts dropped" are runs that collapse below two distinct points at that
 * rounding — real geometry deleted — out of **32,971 source parts**. Those
 * figures are measured by replaying the archived pages through `cleanPart`
 * from the source geometry, which is what the build does; an earlier version
 * of this table measured the 4- and 3-decimal rows against already-rounded
 * 5-decimal output and so under-reported both by exactly 11. The emitted
 * `counts.droppedDegenerateParts` is the same measurement and must agree with
 * the chosen row.
 *
 * 3 decimals is the only setting that meets the PRD's 3 MB figure and it does
 * so by deleting 546 of 32,971 parts, which is a worse trade than restating
 * the budget. Recorded rather than resolved silently: on disk this is 3.69 MB;
 * over the wire it is 0.93 MB gzipped.
 */
const DEFAULT_PRECISION = 4;

/** Hard-coded, with its evidence. Never read from the service (R4.14). */
const VINTAGE = Object.freeze({
  period: '2020-01',
  label: 'JANUARY 2020',
  evidence:
    'shapefile NaturalGas_Pipelines_US_202001; .shp.xml CreaDate 20200427; zip Last-Modified 2020-04-27',
  serviceClaimRejected:
    'the service advertises editingInfo.dataLastEditDate 2025-07-01, which is a re-upload stamp and is ignored here',
});

/** Fail loudly when the upstream stops being the thing this layer was designed around. */
const MANIFEST = Object.freeze({
  featureCount: 32892,
  operatorCount: 230,
  statusValues: ['Operating'],
  typePipeValues: ['Interstate', 'Intrastate'],
});

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'src', 'data', 'local_data', 'eia_energy');
const OUT_FILE = path.join(OUT_DIR, 'gas-network.json');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Round, drop consecutive duplicates, and drop a part that degenerates below two points. */
function cleanPart(points, decimals) {
  const out = [];
  for (const [x, y] of points) {
    const lon = Number(x.toFixed(decimals));
    const lat = Number(y.toFixed(decimals));
    const previous = out[out.length - 1];
    if (previous && previous[0] === lon && previous[1] === lat) continue;
    out.push([lon, lat]);
  }
  return out.length >= 2 ? out : null;
}

/**
 * A **total** order for parts inside a system, so the byte stream does not
 * follow page arrival.
 *
 * First coordinate plus length is not enough: measured over the real bundle,
 * 3,268 groups covering 7,264 of 32,885 parts compare equal on those keys
 * alone, and their emitted order then falls through to V8's stable-sort
 * tie-break, which is input order — exactly what this comparator exists to
 * remove. So ties walk the whole coordinate list.
 */
const partOrder = (a, b) => {
  if (a[0][0] !== b[0][0]) return a[0][0] - b[0][0];
  if (a[0][1] !== b[0][1]) return a[0][1] - b[0][1];
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 1; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0]) return a[i][0] - b[i][0];
    if (a[i][1] !== b[i][1]) return a[i][1] - b[i][1];
  }
  return 0;
};

function build(features, { decimals }) {
  const operators = new Set();
  const statuses = new Set();
  const typePipes = new Set();
  const groups = new Map();
  let droppedParts = 0;
  let sourceVertices = 0;

  for (const feature of features) {
    const { TYPEPIPE, Operator, Status } = feature.attributes ?? {};
    operators.add(Operator ?? '');
    statuses.add(Status ?? '');
    typePipes.add(TYPEPIPE ?? '');
    // Dissolve key. Built with JSON.stringify rather than joined on a
    // separator character: a separator must be something that cannot occur in
    // an operator name, which pushes towards a control byte, and a literal NUL
    // in the source made this file register as binary to Git and invisible to
    // every grep-based tool.
    const key = JSON.stringify([Operator ?? '', TYPEPIPE ?? '', Status ?? '']);
    if (!groups.has(key)) {
      groups.set(key, {
        operator: Operator ?? null,
        typePipe: TYPEPIPE ?? null,
        status: Status ?? null,
        parts: [],
        features: 0,
        sourcePaths: 0,
      });
    }
    const group = groups.get(key);
    group.features += 1;
    // Tracked separately so a system with no geometry in the source is not
    // reported as one whose geometry was rounded away. Measured: FID 30739
    // (Tallgrass Interstate Gas Transmission) carries attributes and no
    // `geometry` key at all.
    group.sourcePaths += (feature.geometry?.paths ?? []).length;
    for (const path_ of feature.geometry?.paths ?? []) {
      sourceVertices += path_.length;
      const part = cleanPart(path_, decimals);
      if (part) group.parts.push(part);
      else droppedParts += 1;
    }
  }

  // Codepoint order, not localeCompare. `localeCompare` with no locale uses
  // ICU's default, which on POSIX follows LC_COLLATE — and because sys-NNN ids
  // are assigned from this array's index, a CI container running under cs_CZ
  // would re-id 72 of the 234 systems and rewrite the whole 3.7 MB file
  // without a single coordinate changing.
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  // A system whose every part degenerated at this rounding would otherwise be
  // emitted with an empty geometry and simply not appear on the map. An
  // operator vanishing silently is the failure this layer exists to prevent,
  // so the loss is recorded by name and printed, not swallowed.
  const emptied = ordered
    .filter(([, group]) => !group.parts.length)
    .map(([, group]) => ({
      operator: group.operator,
      typePipe: group.typePipe,
      sourceFeatures: group.features,
      reason:
        group.sourcePaths === 0
          ? 'the source record carries no geometry at all'
          : `all ${group.sourcePaths} source part(s) degenerate at ${decimals} decimals`,
    }));

  const systems = ordered
    .filter(([, group]) => group.parts.length)
    .map(([, group], index) => {
      const parts = group.parts.sort(partOrder);
      return {
        id: `sys-${String(index).padStart(3, '0')}`,
        operator: group.operator,
        typePipe: group.typePipe,
        status: group.status,
        // Recorded so a card can say the number is a digitizing artifact,
        // never so anything can be sized or ranked by it.
        sourceFeatures: group.features,
        partCount: parts.length,
        parts,
      };
    });

  return {
    systems,
    emptied,
    stats: {
      operators: [...operators].sort(),
      statuses: [...statuses].sort(),
      typePipes: [...typePipes].sort(),
      droppedParts,
      sourceVertices,
      emittedVertices: systems.reduce(
        (sum, s) => sum + s.parts.reduce((n, p) => n + p.length, 0),
        0,
      ),
    },
  };
}

function assertManifest(features, stats) {
  const problems = [];
  if (features.length !== MANIFEST.featureCount) {
    problems.push(
      `feature count is ${features.length}, manifest expects ${MANIFEST.featureCount}`,
    );
  }
  if (stats.operators.length !== MANIFEST.operatorCount) {
    problems.push(
      `distinct Operator count is ${stats.operators.length}, manifest expects ${MANIFEST.operatorCount}`,
    );
  }
  const statuses = stats.statuses.join(',');
  if (statuses !== MANIFEST.statusValues.join(',')) {
    problems.push(
      `Status values are [${statuses}], manifest expects [${MANIFEST.statusValues.join(',')}] — ` +
        'a second status would mean this layer can finally say something about change, which is a design decision, not a rebuild',
    );
  }
  const types = stats.typePipes.join(',');
  if (types !== MANIFEST.typePipeValues.join(',')) {
    problems.push(
      `TYPEPIPE values are [${types}], manifest expects [${MANIFEST.typePipeValues.join(',')}]`,
    );
  }
  if (problems.length) {
    throw new Error(`upstream has moved:\n  - ${problems.join('\n  - ')}`);
  }
}

export async function buildGasNetwork(args = readArgs()) {
  const decimals = Number(args.precision ?? DEFAULT_PRECISION);
  // `Number('4x')` is NaN and `toFixed(NaN)` throws, but `--precision 1` is a
  // perfectly valid number that silently deletes 95% of the geometry and exits
  // 0. Anything outside the measured sweep is a typo, not a choice.
  if (!Number.isInteger(decimals) || decimals < 3 || decimals > 7) {
    throw new Error(
      `--precision must be an integer from 3 to 7 (received ${JSON.stringify(args.precision)}); ` +
        'the measured sweep covers 3, 4 and 5, and 4 is the default',
    );
  }
  // The 8.2 MB verbatim archive stays out of the repo: `.gev-cache/` is already
  // ignored. Reproducibility travels as `upstream_sha256` over the concatenated
  // pages, which a rebuild recomputes and compares.
  const rawDir = args.raw
    ? path.resolve(String(args.raw))
    : path.join(root, '.gev-cache', 'gas-network-raw');
  const replayDir = args.replay ? path.resolve(String(args.replay)) : null;

  process.stdout.write(
    replayDir ? `replaying ${replayDir}\n` : `fetching ${LAYER_URL}\n`,
  );
  const { features, pages, replayed, upstreamSha256 } = await fetchAllFeatures(
    LAYER_URL,
    {
      outFields: OUT_FIELDS,
      orderByFields: ORDER_FIELD,
      geometryPrecision: 5,
      outSR: 4326,
      rawDir: replayDir ? null : rawDir,
      replayDir,
      onPage: ({ index, count, total }) =>
        process.stdout.write(
          `  page ${String(index + 1).padStart(2)} · ${count} features · ${total} total\r`,
        ),
    },
  );
  process.stdout.write(
    `\n  ${features.length} features over ${pages} pages${replayed ? ' (replayed)' : ''}\n`,
  );

  const { systems, emptied, stats } = build(features, { decimals });
  assertManifest(features, stats);
  for (const lost of emptied) {
    process.stdout.write(
      `  ! ${lost.operator} (${lost.typePipe}, ${lost.sourceFeatures} feature(s)) is not drawn — ` +
        `${lost.reason}; recorded in counts.emptiedSystems\n`,
    );
  }

  const payload = {
    id: 'eia-gas-transmission-network',
    name: 'US natural gas interstate and intrastate transmission pipelines',
    freshnessClass: 'published',
    vintage: VINTAGE,
    upstream: {
      url: LAYER_URL,
      pages,
      pageSize: 2000,
      orderByFields: ORDER_FIELD,
      sha256: upstreamSha256,
      note: 'sha256 over the concatenated verbatim pages; rebuild with --replay <dir> to reproduce byte-for-byte',
    },
    geometry: {
      outSR: 4326,
      fetchedPrecision: 5,
      emittedPrecision: decimals,
      note: 'Geometry is shredded, not routed: features are short chords from digitizing, not pipeline runs.',
    },
    encodingRules: {
      // Stated in the payload so the rule travels with the data, not only with the PRD.
      perFeatureVariation: 'none',
      width:
        '1.0 px constant at every tier — this dataset has no diameter, capacity, pressure or throughput',
      label:
        'never — Operator is a company, not a pipeline, and several strings name dissolved or absorbed companies',
      picking:
        'off — the network cannot be clicked, so it can never produce a card, so it can never assert a number',
    },
    counts: {
      sourceFeatures: features.length,
      systems: systems.length,
      dissolvedKeys: systems.length + emptied.length,
      operators: stats.operators.length,
      parts: systems.reduce((sum, s) => sum + s.partCount, 0),
      vertices: stats.emittedVertices,
      droppedDegenerateParts: stats.droppedParts,
      emptiedSystems: emptied,
    },
    statuses: stats.statuses,
    typePipes: stats.typePipes,
    systems,
  };

  const json = `${JSON.stringify(payload)}\n`;
  // The orchestrator passes write:false and commits every file at the end, so
  // a failure in the crossings build cannot leave gas-network.json rewritten
  // beside a source.json that still describes the file it replaced.
  if (args.write !== false) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, json);
  }

  const bytes = Buffer.byteLength(json);
  const gz = gzipSync(json).length;
  process.stdout.write(
    `\n${args.write === false ? 'built' : 'wrote'} ${path.relative(root, OUT_FILE)}\n` +
      `  ${systems.length} systems · ${payload.counts.parts} parts · ${payload.counts.vertices} vertices\n` +
      `  ${(bytes / 1e6).toFixed(2)} MB raw · ${(gz / 1e6).toFixed(2)} MB gzip · sha256 ${sha256(json).slice(0, 16)}…\n` +
      `  vintage ${VINTAGE.label} (${VINTAGE.evidence})\n`,
  );
  return {
    file: {
      path: 'gas-network.json',
      bytes,
      gzipBytes: gz,
      sha256: sha256(json),
      json,
    },
    payload,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  buildGasNetwork().catch((error) => {
    process.stderr.write(`\nbuild-gas-network failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
