/**
 * Build src/data/local_data/gas_overlay/ — the static half of row 17, the gas
 * pipeline overlay (docs/COMMODITIES-PLAN.md §19, phase P1).
 *
 * Run as `npm run build:gas-overlay`. Three inputs, no new linework source:
 *
 *   1. Lines. Each pipeline's geometry is taken from the row 4 bundle
 *      (`eia_energy/gas-network.json`, EIA January 2020, R4.14), never
 *      refetched, so the overlay and the network can never disagree. Parts
 *      are clustered at 50 km (single linkage); the largest cluster is drawn
 *      and every other cluster is listed in the manifest as excluded, with its
 *      length and bounding box. A pipeline the 2020 data predates (Gulf Run)
 *      reads a hand-traced file from `manual/` instead (D17.3) and says so.
 *   2. Compressor stations. HIFLD's own service is gone (§19.6); the stations
 *      come from the full re-host that survives, filtered by `OPERATOR`, and
 *      each is cross-checked against EPA GHGRP 2023 transmission compression
 *      facilities (W-NGTC, public domain) within GHGRP_MATCH_KM. A station's
 *      distance to its pipeline's drawn line is measured and recorded; one
 *      further than STATION_LINE_KM is kept but flagged `offLine`.
 *   3. LNG anchors. Read from the row 10 bundle (`lng/terminals.json`, GEM).
 *
 * Every upstream response is archived verbatim; `--replay <dir>` rebuilds from
 * the archive instead of the network.
 *
 *   node scripts/build-gas-overlay.mjs
 *   node scripts/build-gas-overlay.mjs --raw .gev-cache/gas-overlay-raw
 *   node scripts/build-gas-overlay.mjs --replay .gev-cache/gas-overlay-raw
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readArgs } from './arcgis-paging.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'src', 'data', 'local_data');
const OUT_DIR = path.join(DATA, 'gas_overlay');
const MANUAL_DIR = path.join(OUT_DIR, 'manual');

/** The date the upstream station sources were retrieved. */
const RETRIEVED = '2026-10-01';
const UA = 'gods-eye-view build-gas-overlay (contact jack@optaimum.com)';

const HIFLD_COPY =
  'https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Natural_Gas_Compressor_Stations/FeatureServer/0';
const GHGRP_URL = (state) =>
  `https://data.epa.gov/efservice/pub_dim_facility/year/2023/state/${state}/reported_industry_types/CONTAINING/W-NGTC/JSON`;

/** A station matches a GHGRP facility when they sit this close. */
export const GHGRP_MATCH_KM = 2;
/** A station further than this from its pipeline's drawn line is flagged.
 *  Not the founder PRD's 1 km: the 2020 linework averages ~9 km between
 *  vertices on Gulf South (9,727 km over ~1,040 segments), so its chords cut
 *  corners by kilometres while HIFLD and GHGRP place stations to tens of
 *  metres. Measured 2026-10-01: see source.json checks.lineKm. */
export const STATION_LINE_KM = 5;
/** A GHGRP facility on the same pipeline whose name carries the station's name
 *  pairs within this (Clarence: HIFLD and GHGRP sit 15 km apart). A pair
 *  further apart than GHGRP_MATCH_KM is listed in checks.positionDisagree for
 *  a human to settle; the HIFLD coordinate is kept until then. */
export const GHGRP_NAME_MATCH_KM = 20;
/** Parts closer than this belong to one drawn network (founder PRD P1 check). */
export const CLUSTER_KM = 50;

/**
 * The pipelines of v1 (D17.1). Adding one is an entry here plus, when the
 * 2020 linework predates it, a traced file in `manual/` (G17.6).
 *   network:  the row 4 `systems[].operator` string, or null for a trace
 *   trace:    the `manual/` GeoJSON used when network is null
 *   manualStations: a `manual/` GeoJSON of stations the HIFLD copy lacks
 *   hifld:    a SQL LIKE pattern on the HIFLD copy's OPERATOR
 *   ghgrpName: a regex on the GHGRP facility name that ties it to the pipeline
 *              (never the parent company: Loews/Boardwalk also owns Texas Gas)
 */
export const PIPELINES = {
  gulf_south: {
    name: 'Gulf South Pipeline',
    operator: 'Boardwalk Pipelines',
    network: 'Gulf South Pipeline Co',
    hifld: "OPERATOR LIKE '%GULF SOUTH%'",
    ghgrpName: /GULF SOUTH/i,
    states: ['TX', 'LA', 'MS', 'AL', 'FL'],
  },
  gulf_run: {
    name: 'Gulf Run Pipeline',
    operator: 'Energy Transfer',
    network: null,
    trace: 'gulf-run-route.geojson',
    manualStations: 'gulf-run-stations.geojson',
    hifld: null,
    ghgrpName: /GULF RUN/i,
    states: ['LA', 'TX'],
  },
};

const R_KM = 6371.0088;
const RAD = Math.PI / 180;

export function haversineKm(a, b) {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(x));
}

/** Point-to-segment distance in km on a local equirectangular plane (fine at < 100 km). */
export function pointSegmentKm(p, a, b) {
  const k = Math.cos(p[1] * RAD);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * RAD * R_KM;
}

export function distanceToPartsKm(p, parts) {
  let best = Infinity;
  for (const part of parts) {
    for (let i = 1; i < part.length; i += 1) {
      const d = pointSegmentKm(p, part[i - 1], part[i]);
      if (d < best) best = d;
    }
  }
  return best;
}

export function partKm(part) {
  let km = 0;
  for (let i = 1; i < part.length; i += 1) km += haversineKm(part[i - 1], part[i]);
  return km;
}

/**
 * Single-linkage clusters of parts: two parts join when any vertex of one is
 * within `km` of any vertex of the other. Largest (by part count) first.
 */
export function clusterParts(parts, km = CLUSTER_KM) {
  const parent = parts.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      if (find(i) === find(j)) continue;
      let hit = false;
      for (const a of parts[i]) {
        for (const b of parts[j]) {
          if (haversineKm(a, b) <= km) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  parts.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(parts[i]);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function bbox(parts) {
  const xs = parts.flat().map((v) => v[0]);
  const ys = parts.flat().map((v) => v[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => +n.toFixed(4));
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/#\s*/g, '#');

async function getText(url, name, { rawDir, replayDir }) {
  if (replayDir) return readFileSync(path.join(replayDir, name), 'utf8');
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  if (rawDir) {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(path.join(rawDir, name), text);
  }
  await new Promise((r) => setTimeout(r, 1000)); // one request a second
  return text;
}

async function hifldStations(spec, io) {
  const url =
    `${HIFLD_COPY}/query?where=${encodeURIComponent(spec.hifld)}` +
    '&outFields=NAME,COMPID,CITY,COUNTY,STATE,CERT_HP,STATUS,SOURCEDATE,LATITUDE,LONGITUDE' +
    '&orderByFields=OBJECTID&returnGeometry=false&f=json';
  const body = JSON.parse(await getText(url, `hifld-${slug(spec.name)}.json`, io));
  // ArcGIS reports failures as HTTP 200 with an error object (the HIFLD original did exactly this).
  if (body.error || !Array.isArray(body.features)) {
    throw new Error(`HIFLD copy: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  }
  return body.features.map((f) => f.attributes);
}

async function ghgrpFacilities(states, io) {
  const out = [];
  for (const st of states) {
    const rows = JSON.parse(await getText(GHGRP_URL(st), `ghgrp-ngtc-2023-${st}.json`, io));
    if (!Array.isArray(rows)) throw new Error(`GHGRP ${st}: not an array`);
    out.push(...rows);
  }
  return out;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function buildLines(id, spec, network) {
  if (spec.network) {
    const sys = network.systems.find((s) => s.operator === spec.network);
    if (!sys) throw new Error(`${id}: operator "${spec.network}" not in the row 4 bundle`);
    const clusters = clusterParts(sys.parts);
    const [main, ...rest] = clusters;
    return {
      method: 'eia_2020',
      source: `eia_energy/gas-network.json system ${sys.id} (${sys.sourceFeatures} EIA features, January 2020)`,
      parts: main,
      km: +main.reduce((s, p) => s + partKm(p), 0).toFixed(1),
      excluded: rest.map((c) => ({
        parts: c.length,
        km: +c.reduce((s, p) => s + partKm(p), 0).toFixed(1),
        bbox: bbox(c),
        reason: `more than ${CLUSTER_KM} km from the drawn network`,
      })),
    };
  }
  const file = path.join(MANUAL_DIR, spec.trace);
  if (!existsSync(file)) {
    return { method: 'missing', source: `manual/${spec.trace} not yet traced (D17.3)`, parts: [], km: 0, excluded: [] };
  }
  const gj = JSON.parse(readFileSync(file, 'utf8'));
  const parts = gj.features.flatMap((f) =>
    f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates,
  );
  return {
    method: 'manual_ferc_trace',
    source: `manual/${spec.trace}`,
    accuracyKm: Math.max(...gj.features.map((f) => f.properties.accuracy_km ?? Infinity)),
    // One entry per traced feature, in part order, so a card can state each piece's own accuracy.
    traced: gj.features.map((f) => ({
      name: f.properties.name,
      accuracyKm: f.properties.accuracy_km ?? null,
      certificatedMiles: f.properties.certificated_miles ?? null,
      parts: f.geometry.type === 'LineString' ? 1 : f.geometry.coordinates.length,
    })),
    parts,
    km: +parts.reduce((s, p) => s + partKm(p), 0).toFixed(1),
    excluded: [],
  };
}

/** Stations from a hand-sourced `manual/` file (D17.3): each carries its own source. */
export function manualStations(id, spec, lines) {
  if (!spec.manualStations) return [];
  const file = path.join(MANUAL_DIR, spec.manualStations);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')).features.map((f) => {
    const at = f.geometry.coordinates;
    const lineKm = lines.parts.length ? distanceToPartsKm(at, lines.parts) : null;
    return {
      id: `${id}-${slug(f.properties.name)}`,
      name: f.properties.name,
      pipeline: id,
      lon: +at[0].toFixed(5),
      lat: +at[1].toFixed(5),
      county: f.properties.county,
      state: f.properties.state,
      certHp: null,
      status: null,
      method: 'manual_ferc',
      source: f.properties.source,
      ghgrp: null,
      lineKm: lineKm === null ? null : +lineKm.toFixed(2),
      offLine: lineKm !== null && lineKm > STATION_LINE_KM,
    };
  });
}

export function buildStations(id, spec, lines, hifld, ghgrp) {
  const mine = ghgrp.filter((g) => spec.ghgrpName.test(g.facility_name ?? ''));
  const nameKey = (n) =>
    n.toUpperCase().replace(/\b(ELECTRIC|RECIP|COMP(RESSOR)?|STATION|STA|JCT)\b|#\s*\d+|[^A-Z ]/g, ' ').trim().split(/\s+/)[0];
  const used = new Set();
  const stations = hifld.map((h) => {
    const at = [h.LONGITUDE, h.LATITUDE];
    let match = null;
    const key = nameKey(h.NAME);
    for (const g of ghgrp) {
      const d = haversineKm(at, [g.longitude, g.latitude]);
      const named = key && new RegExp(`\\b${key}\\b`, 'i').test(g.facility_name ?? '');
      const ok = d <= GHGRP_MATCH_KM || (named && mine.includes(g) && d <= GHGRP_NAME_MATCH_KM);
      if (ok && (!match || (named && !match.named) || (named === match.named && d < match.km))) match = { g, km: d, named };
    }
    if (match) used.add(match.g.facility_id);
    const lineKm = lines.parts.length ? distanceToPartsKm(at, lines.parts) : null;
    return {
      id: `${id}-${slug(h.NAME)}`,
      name: titleCase(h.NAME),
      pipeline: id,
      lon: +at[0].toFixed(5),
      lat: +at[1].toFixed(5),
      county: titleCase(h.COUNTY ?? ''),
      state: h.STATE,
      certHp: h.CERT_HP ?? null,
      status: h.STATUS ?? null,
      method: 'hifld_copy',
      ghgrp: match
        ? { id: match.g.facility_id, name: match.g.facility_name, parent: match.g.parent_company, km: +match.km.toFixed(2) }
        : null,
      lineKm: lineKm === null ? null : +lineKm.toFixed(2),
      offLine: lineKm !== null && lineKm > STATION_LINE_KM,
    };
  });
  // GHGRP facilities tied to the pipeline that HIFLD (circa 2015) lacks.
  for (const g of mine) {
    if (used.has(g.facility_id)) continue;
    const at = [g.longitude, g.latitude];
    const lineKm = lines.parts.length ? distanceToPartsKm(at, lines.parts) : null;
    stations.push({
      id: `${id}-ghgrp-${g.facility_id}`,
      name: g.facility_name,
      pipeline: id,
      lon: +at[0].toFixed(5),
      lat: +at[1].toFixed(5),
      county: titleCase(g.county ?? ''),
      state: g.state,
      certHp: null,
      status: null,
      method: 'ghgrp_2023',
      ghgrp: { id: g.facility_id, name: g.facility_name, parent: g.parent_company, km: 0 },
      lineKm: lineKm === null ? null : +lineKm.toFixed(2),
      offLine: lineKm !== null && lineKm > STATION_LINE_KM,
    });
  }
  return stations;
}

export function lngAnchors(terminals) {
  const want = /Golden Pass|Freeport|Sabine Pass|Cameron LNG|Calcasieu Pass|Corpus Christi LNG|Port Arthur LNG|Plaquemines/i;
  return terminals.terminals
    .filter((t) => t.country === 'United States' && want.test(t.name))
    .map((t) => ({ id: t.id, name: t.name, status: t.status, lon: t.lon, lat: t.lat, source: 'lng/terminals.json (GEM, CC BY 4.0)' }));
}

const quantiles = (v) => {
  if (!v.length) return null;
  const a = [...v].sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { p50: q(0.5), p90: q(0.9), max: a[a.length - 1] };
};

const round = (parts, d = 4) => parts.map((p) => p.map(([x, y]) => [+x.toFixed(d), +y.toFixed(d)]));

async function main() {
  const args = readArgs();
  const io = { rawDir: args.raw ?? (args.replay ? null : path.join(root, '.gev-cache', 'gas-overlay-raw')), replayDir: args.replay ?? null };
  const networkText = readFileSync(path.join(DATA, 'eia_energy', 'gas-network.json'), 'utf8');
  const network = JSON.parse(networkText);
  const terminals = JSON.parse(readFileSync(path.join(DATA, 'lng', 'terminals.json'), 'utf8'));
  const states = [...new Set(Object.values(PIPELINES).flatMap((p) => p.states))].sort();
  const ghgrp = await ghgrpFacilities(states, io);

  const lines = [];
  const stations = [];
  const checks = [];
  for (const [id, spec] of Object.entries(PIPELINES)) {
    const l = buildLines(id, spec, network);
    lines.push({ id, name: spec.name, operator: spec.operator, method: l.method, source: l.source,
      accuracyKm: l.accuracyKm ?? null, traced: l.traced ?? null, km: l.km, excluded: l.excluded,
      parts: round(l.parts) });
    const hifld = spec.hifld ? await hifldStations(spec, io) : [];
    const st = [...buildStations(id, spec, l, hifld, ghgrp), ...manualStations(id, spec, l)];
    stations.push(...st);
    const off = st.filter((s) => s.offLine);
    checks.push({
      pipeline: id,
      drawn: l.method !== 'missing',
      km: l.km,
      excludedClusters: l.excluded.length,
      stations: st.length,
      ghgrpMatched: st.filter((s) => s.ghgrp).length,
      lineKm: quantiles(st.map((s) => s.lineKm).filter((v) => v !== null)),
      positionDisagree: st
        .filter((s) => s.ghgrp && s.ghgrp.km > GHGRP_MATCH_KM)
        .map((s) => `${s.name} vs ${s.ghgrp.name} ${s.ghgrp.km} km`),
      offLine: off.map((s) => `${s.name} ${s.lineKm} km`),
    });
  }

  const lng = lngAnchors(terminals);
  mkdirSync(OUT_DIR, { recursive: true });
  const linesOut = { id: 'gas-overlay-lines', retrieved: RETRIEVED, pipelines: lines };
  const stationsOut = { id: 'gas-overlay-stations', retrieved: RETRIEVED, stations, lng };
  writeFileSync(path.join(OUT_DIR, 'lines.json'), JSON.stringify(linesOut));
  writeFileSync(path.join(OUT_DIR, 'stations.json'), JSON.stringify(stationsOut, null, 1));
  writeFileSync(
    path.join(OUT_DIR, 'source.json'),
    JSON.stringify(
      {
        id: 'gas-overlay-static',
        plan: 'docs/COMMODITIES-PLAN.md §19 (row 17, P1)',
        retrieved: RETRIEVED,
        inputs: {
          lines: { file: 'eia_energy/gas-network.json', sha256: sha256(networkText), vintage: network.vintage?.label },
          stations: { url: HIFLD_COPY, note: 'third-party re-host of HIFLD (the DHS service is gone); sources circa 2015; public domain' },
          validation: { url: GHGRP_URL('<STATE>'), states, year: 2023, licence: 'public domain (EPA)' },
          lng: { file: 'lng/terminals.json', licence: 'CC BY 4.0 (Global Energy Monitor)' },
        },
        thresholds: { clusterKm: CLUSTER_KM, stationLineKm: STATION_LINE_KM, ghgrpMatchKm: GHGRP_MATCH_KM },
        checks,
      },
      null,
      2,
    ),
  );
  for (const c of checks) console.log(JSON.stringify(c));
  console.log(`lng anchors: ${lng.map((t) => t.name).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
