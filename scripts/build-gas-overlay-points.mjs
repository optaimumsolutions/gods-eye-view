/**
 * Build src/data/local_data/gas_overlay/points.csv — a coordinate for every
 * physical posted point of the row 17 pipelines (docs/COMMODITIES-PLAN.md §19,
 * phase P2). Run after `npm run build:gas-overlay` (it reads lines.json and
 * stations.json) as `npm run build:gas-overlay-points`.
 *
 * Which points. A point master lists paper locations too (Gulf Run: 236 of
 * 290 active rows are pooling points), so the physical set is the points in
 * the pipeline's capacity posting with a design capacity, snapshotted here.
 * Each is keyed by the pipeline's own location code (`loc`); FR-N15 rows join
 * on it (Gulf South suffixes the flow, `<loc>-R|D`).
 *
 * No posting publishes coordinates, so every point is placed by rules, first
 * hit wins (the founder PRD's join order, widened to the sources that exist):
 *   1. station_match   0.9  the name carries a compressor station of the same
 *                           pipeline (stations.json) in the same county
 *   2. lng_terminal    0.9  an LNG point or counterparty naming a terminal
 *                           within LNG_MAX_KM of the drawn line
 *   3. ghgrp_facility  0.8  a GHGRP 2023 facility in the same county sharing a
 *                           distinctive word of the point's own name (END, PLT,
 *                           STR, LNG and untyped points only: power plants,
 *                           refineries, chemical plants)
 *   4. interconnect    0.7  the counterparty is a row 4 system whose line comes
 *                           within INTERCONNECT_KM of ours inside the county
 *   5. place_snap      0.5  the name starts with a Census place in that county;
 *                           its internal point, snapped to our line
 *   6. snap_to_line    0.4  the middle of our line inside the county
 *   7. unresolved           written to unresolved.csv for a human
 * A row whose method is `manual` is never recomputed: a human fix survives
 * every rebuild.
 *
 *   node scripts/build-gas-overlay-points.mjs
 *   node scripts/build-gas-overlay-points.mjs --replay .gev-cache/gas-overlay-points-raw
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readArgs } from './arcgis-paging.mjs';
import { haversineKm, pointSegmentKm } from './build-gas-overlay.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'src', 'data', 'local_data');
const OUT_DIR = path.join(DATA, 'gas_overlay');
const UA = 'gods-eye-view build-gas-overlay-points (contact jack@optaimum.com)';

export const LNG_MAX_KM = 25;
export const INTERCONNECT_KM = 2;
export const PLACE_SNAP_MAX_KM = 15;

const STATE_FIPS = { TX: '48', LA: '22', MS: '28', AL: '01', FL: '12', OK: '40', AR: '05' };
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const BW = 'https://reporting.prod.bwpmlp.org/infopost';
const ET = 'https://pipelines.energytransfer.com/ipost';

/** Per-pipeline posting sources (the same platforms FR-N15 reads). */
export const POSTINGS = {
  gulf_south: { kind: 'boardwalk', tsp: 1 },
  gulf_run: { kind: 'et', asset: 'GR' },
};

const LNG_WORDS = /golden pass|sabine|cameron|calcasieu|freeport|corpus christi|port arthur|plaquemines/i;
const GENERIC = new Set(
  ('city gate gates station sta meter mtr del rec receipt delivery interconnect intercon ic pipeline pipe line gas ' +
    'natural company co inc llc lp l p corp corporation energy transmission services service plant power ' +
    'generating generation facility facilities the of and at to from transfer lateral header north south east ' +
    'west new old no nos tap taps loop system sys pool zone resources partners operating midstream holdings ' +
    'mississippi louisiana texas alabama florida ' +
    // Measured false matches (2026-10-01 audit): area words and pipeline names
    // shared across unrelated facilities in one county.
    'gulf run bayou gathering management petroleum investment field fields exchange aggregate hub crossover ' +
    'legacy expansion plt ind etx cmp storage common treating compression operations products').split(' '),
);
/** Location types with no physical place: virtual transfers and pooling points. */
export const PAPER_TYPES = new Set(['VIR', 'PPT']);
/** Types whose counterparty is the facility owner, so its name may place the point. */
const OWNER_TYPES = new Set(['END', 'PLT', 'STR', 'LNG']);
/** A station's own name: "Gulf South Pipeline - Wilson Station" → "Wilson Station". */
const stationName = (s) => s.replace(/^.*\s-\s/, '');

// ------------------------------------------------------------- text ----

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = (rows.shift() ?? []).map((h) => h.replace(/\s+/g, ' ').trim());
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

/** Misspellings found in the postings, mapped to the TIGER name. */
const COUNTY_ALIASES = { terrebone: 'terrebonne' };

/** County names as the postings and TIGER write them differ ("St Bernard", "ST. BERNARD PARISH"). */
export const countyKey = (s) => {
  const k = (s ?? '').toLowerCase().replace(/\b(parish|county)\b/g, '').replace(/\bsaint\b/g, 'st').replace(/[^a-z]/g, '');
  return COUNTY_ALIASES[k] ?? k;
};

export const tokens = (s) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !GENERIC.has(t) && !/^\d+$/.test(t));

// --------------------------------------------------------- geometry ----

export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygon or MultiPolygon rings → point inside (holes honoured by parity per polygon). */
export function pointInGeometry(p, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.some((rings) => rings.reduce((inside, ring) => (pointInRing(p, ring) ? !inside : inside), false));
}

/** Nearest point on a set of parts to p, with its distance in km. */
export function snapToParts(p, parts) {
  let best = { km: Infinity, at: null };
  for (const part of parts) {
    for (let i = 1; i < part.length; i += 1) {
      const a = part[i - 1], b = part[i];
      const km = pointSegmentKm(p, a, b);
      if (km < best.km) {
        const k = Math.cos(p[1] * Math.PI / 180);
        const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (((p[0] - a[0]) * k) * dx + (p[1] - a[1]) * dy) / len2));
        best = { km, at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
      }
    }
  }
  return best;
}

/** The pieces of `parts` inside a county, densified to ~1 km so short crossings are not missed. */
export function partsInside(parts, geom) {
  const out = [];
  for (const part of parts) {
    let run = [];
    for (let i = 0; i < part.length; i += 1) {
      const pts = [part[i]];
      if (i > 0) {
        const steps = Math.ceil(haversineKm(part[i - 1], part[i]));
        pts.length = 0;
        for (let s = 1; s <= steps; s += 1) {
          const t = s / steps;
          pts.push([part[i - 1][0] + t * (part[i][0] - part[i - 1][0]), part[i - 1][1] + t * (part[i][1] - part[i - 1][1])]);
        }
      }
      for (const v of pts) {
        if (pointInGeometry(v, geom)) run.push(v);
        else if (run.length) { out.push(run); run = []; }
      }
    }
    if (run.length) out.push(run);
  }
  return out;
}

/** The middle (by length) of a set of in-county pieces. */
export function midpointOf(pieces) {
  const segs = [];
  let total = 0;
  for (const p of pieces) {
    for (let i = 1; i < p.length; i += 1) {
      const km = haversineKm(p[i - 1], p[i]);
      segs.push([p[i - 1], p[i], km]);
      total += km;
    }
  }
  if (!segs.length) return pieces[0]?.[0] ?? null;
  let half = total / 2;
  for (const [a, b, km] of segs) {
    if (half <= km) {
      const t = km === 0 ? 0 : half / km;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    half -= km;
  }
  return segs.at(-1)[1];
}

/** Closest approach between two sets of pieces: the midpoint of the closest vertex pair. */
export function closestApproach(a, b) {
  let best = { km: Infinity, at: null };
  for (const pa of a) for (const va of pa) for (const pb of b) for (const vb of pb) {
    const km = haversineKm(va, vb);
    if (km < best.km) best = { km, at: [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2] };
  }
  return best;
}

// ------------------------------------------------------------- fetch ----

async function get(url, name, io, init = {}) {
  if (io.replayDir) return readFileSync(path.join(io.replayDir, name), 'utf8');
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  mkdirSync(io.rawDir, { recursive: true });
  writeFileSync(path.join(io.rawDir, name), text);
  await new Promise((r) => setTimeout(r, 1000));
  return text;
}

const b64csv = (text) => {
  try { return Buffer.from(text.trim(), 'base64').toString('utf8').replace(/^﻿/, ''); } catch { return text; }
};

async function boardwalkLatest(tsp, infoPostID, name, io) {
  const list = JSON.parse(
    await get(`${BW}/infopostdetails`, `${name}-list.json`, io, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ infoPostID, tspId: tsp, pageNumber: 1, pageSize: 20, sortBy: 'datetimePostingEffective', sortDescending: true, groupCode: 'INFOPOST' }),
    }),
  );
  const posting = (list.postings ?? []).find((p) => (p.reportFiles ?? []).some((f) => /\.csv$/i.test(f.fileName)));
  if (!posting) throw new Error(`${name}: no CSV posting`);
  const file = posting.reportFiles.find((f) => /\.csv$/i.test(f.fileName));
  const text = await get(`${BW}/postings?postingsDocumentId=${file.infoPostTrackerID}`, `${name}.b64`, io);
  return { rows: parseCsv(b64csv(text)), posting: posting.description };
}

async function capacityAndMaster(id, spec, io) {
  if (spec.kind === 'boardwalk') {
    const master = await boardwalkLatest(spec.tsp, 9, `${id}-locations`, io);
    const cap = await boardwalkLatest(spec.tsp, 1, `${id}-capacity`, io);
    return { master: master.rows, capacity: cap.rows, capacityLabel: cap.posting };
  }
  const master = parseCsv(await get(`${ET}/locations/index?asset=${spec.asset}&gasDay=&f=csv&extension=csv`, `${id}-locations.csv`, io));
  // Yesterday's gas day, whose last cycle is final (FR-N15 reads the same file).
  const day = new Date(Date.now() - 86400000);
  const gasDay = `${String(day.getUTCMonth() + 1).padStart(2, '0')}/${String(day.getUTCDate()).padStart(2, '0')}/${day.getUTCFullYear()}`;
  const capText = await get(
    `${ET}/capacity/operationally-available-by-location?asset=${spec.asset}&f=csv&extension=csv&gasDay=${encodeURIComponent(gasDay)}`,
    `${id}-capacity.csv`, io,
  );
  return { master, capacity: parseCsv(capText.replace(/^﻿/, '')), capacityLabel: gasDay };
}

async function counties(stateCodes, io) {
  const out = [];
  for (const st of stateCodes) {
    const fips = STATE_FIPS[st];
    const text = await get(
      `${TIGER}/State_County/MapServer/1/query?where=${encodeURIComponent(`STATE='${fips}'`)}&outFields=GEOID,BASENAME,STATE&outSR=4326&maxAllowableOffset=0.002&f=geojson`,
      `counties-${st}.geojson`, io,
    );
    for (const f of JSON.parse(text).features) out.push({ state: st, key: countyKey(f.properties.BASENAME), name: f.properties.BASENAME, geometry: f.geometry });
  }
  return out;
}

async function places(stateCodes, io) {
  const out = [];
  for (const st of stateCodes) {
    for (const layer of [4, 5]) {
      const text = await get(
        `${TIGER}/Places_CouSub_ConCity_SubMCD/MapServer/${layer}/query?where=${encodeURIComponent(`STATE='${STATE_FIPS[st]}'`)}&outFields=BASENAME,INTPTLAT,INTPTLON&returnGeometry=false&f=json`,
        `places-${layer}-${st}.json`, io,
      );
      for (const f of JSON.parse(text).features ?? []) {
        out.push({ state: st, name: f.attributes.BASENAME, at: [+f.attributes.INTPTLON, +f.attributes.INTPTLAT] });
      }
    }
  }
  return out;
}

async function ghgrpAll(stateCodes, io) {
  const out = [];
  for (const st of stateCodes) {
    const rows = JSON.parse(await get(`https://data.epa.gov/efservice/pub_dim_facility/year/2023/state/${st}/JSON`, `ghgrp-all-2023-${st}.json`, io));
    out.push(...rows.filter((r) => r.latitude && r.longitude));
  }
  return out;
}

// ----------------------------------------------------------- resolve ----

/** Fold a capacity posting into one physical point per location code. */
export function physicalPoints(id, capacity, master) {
  const byLoc = new Map(master.map((m) => [m['Loc'], m]));
  const points = new Map();
  for (const r of capacity) {
    const loc = r['Loc'];
    const design = Number(String(r['Design Capacity'] ?? r['DC'] ?? '').replace(/,/g, ''));
    if (!loc || !(design > 0)) continue;
    const m = byLoc.get(loc) ?? {};
    if (PAPER_TYPES.has(m['Loc Type Ind'])) continue;
    const prev = points.get(loc);
    points.set(loc, {
      pipeline: id,
      loc,
      name: (m['Loc Name'] || r['Loc Name'] || '').trim(),
      type: m['Loc Type Ind'] ?? '',
      county: m['Loc Cnty'] || r['County'] || '',
      state: m['Loc St Abbrev'] || r['State'] || '',
      counterparty: m['Up/Dn Name'] || r['Operator'] || '',
      flows: [...new Set([...(prev?.flows ?? []), r['Flow Ind']].filter(Boolean))].sort().join(''),
      designDth: Math.max(design, prev?.designDth ?? 0),
    });
  }
  return [...points.values()];
}

const sameCounty = (p, state, county) => p.state === state && countyKey(p.county) === countyKey(county);

export function resolvePoint(p, ctx) {
  const lines = ctx.lines[p.pipeline];
  const county = ctx.counties.find((c) => c.state === p.state && c.key === countyKey(p.county));
  const done = (method, confidence, at, why) => ({ ...p, lon: +at[0].toFixed(5), lat: +at[1].toFixed(5), method, confidence, why });

  // 1. A compressor station of this pipeline named in the point name. Customer
  // points (END, LDC, PLT) are not at the station even when they share its town.
  const stationTypes = !['END', 'LDC', 'PLT'].includes(p.type);
  for (const s of stationTypes ? ctx.stations.filter((x) => x.pipeline === p.pipeline) : []) {
    const key = tokens(stationName(s.name))[0];
    if (key && !tokens(p.county).includes(key) && tokens(p.name).includes(key) && countyKey(s.county) === countyKey(p.county)) {
      return done('station_match', 0.9, [s.lon, s.lat], s.name);
    }
  }
  // 2. An LNG terminal named by the point, close enough to our line to be the delivery.
  // A terminal's name alone is a town or parish too (Cameron, Calcasieu), so the
  // point must be typed LNG or say LNG.
  const lngText = `${p.name} ${p.counterparty}`;
  if ((p.type === 'LNG' || /\blng\b/i.test(lngText)) && LNG_WORDS.test(lngText)) {
    const word = (lngText.match(LNG_WORDS) ?? [])[0];
    const t = ctx.lng.find((x) => word && x.name.toLowerCase().includes(word.toLowerCase()));
    if (t && snapToParts([t.lon, t.lat], lines).km <= LNG_MAX_KM) return done('lng_terminal', 0.9, [t.lon, t.lat], t.name);
  }
  // 3. A GHGRP facility in the same county sharing a distinctive token. Interconnects
  // skip it: a counterparty pipeline's name would land the point on its compressor.
  // City gates (LDC) and wellhead receipts (WHD) skip it too: their names carry
  // a town, and a town's name matches whatever plant sits there. A match needs
  // a word of the point's own name; county and Census place names never count
  // ("Eastman Chemical @ Tyler" once landed on Tyler Pipe Co).
  const notPlace = (t) => !tokens(p.county).includes(t) && !ctx.placeWords.has(`${p.state}:${t}`);
  const own = tokens(p.name).filter(notPlace);
  const ptoks = new Set([...own, ...(OWNER_TYPES.has(p.type) ? tokens(p.counterparty).filter(notPlace) : [])]);
  if (own.length && (OWNER_TYPES.has(p.type) || p.type === '')) {
    let best = null;
    for (const g of ctx.ghgrp) {
      if (!sameCounty({ state: g.state, county: g.county }, p.state, p.county)) continue;
      const shared = tokens(`${g.facility_name} ${g.parent_company}`).filter((t) => ptoks.has(t));
      if (!shared.some((t) => own.includes(t))) continue;
      if (!best || shared.length > best.shared.length) best = { g, shared };
    }
    if (best) return done('ghgrp_facility', 0.8, [best.g.longitude, best.g.latitude], `${best.g.facility_name} (${best.shared.join(' ')})`);
  }
  if (!county) return { ...p, method: 'unresolved', why: `county "${p.county}, ${p.state}" not found in TIGER` };
  const mine = partsInside(lines, county.geometry);
  // 4. Interconnect: the counterparty's row 4 system meets our line inside the county.
  const ctoks = tokens(p.counterparty);
  if (ctoks.length && mine.length) {
    let best = null;
    for (const sys of ctx.network) {
      const otoks = tokens(sys.operator);
      const shared = ctoks.filter((t) => otoks.includes(t)).length;
      if (!shared || shared / Math.min(ctoks.length, otoks.length) < 0.5) continue;
      const theirs = partsInside(sys.parts, county.geometry);
      if (!theirs.length) continue;
      const ca = closestApproach(mine, theirs);
      if (ca.km <= INTERCONNECT_KM && (!best || ca.km < best.km)) best = { ...ca, op: sys.operator };
    }
    if (best) return done('interconnect', 0.7, best.at, `${best.op} within ${best.km.toFixed(2)} km`);
  }
  // 5. A Census place the name starts with, snapped to our line.
  const head = (p.name.toLowerCase().match(/^[a-z .'-]+/) ?? [''])[0].trim();
  if (head) {
    const pl = ctx.places
      .filter((x) => x.state === p.state && head.startsWith(x.name.toLowerCase()) && x.name.length >= 4 && pointInGeometry(x.at, county.geometry))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (pl) {
      const snap = snapToParts(pl.at, lines);
      if (snap.km <= PLACE_SNAP_MAX_KM) return done('place_snap', 0.5, snap.at, `${pl.name} snapped ${snap.km.toFixed(1)} km`);
    }
  }
  // 6. The middle of our line in the county.
  if (mine.length) return done('snap_to_line', 0.4, midpointOf(mine), `middle of the line in ${county.name}`);
  return { ...p, method: 'unresolved', why: `the drawn line does not cross ${p.county}, ${p.state}` };
}

const COLS = ['pipeline', 'loc', 'name', 'type', 'flows', 'county', 'state', 'counterparty', 'design_dth', 'lon', 'lat', 'method', 'confidence', 'why'];

async function main() {
  const args = readArgs();
  const io = {
    rawDir: args.raw ?? path.join(root, '.gev-cache', 'gas-overlay-points-raw'),
    replayDir: args.replay ?? null,
  };
  const linesJson = JSON.parse(readFileSync(path.join(OUT_DIR, 'lines.json'), 'utf8'));
  const stationsJson = JSON.parse(readFileSync(path.join(OUT_DIR, 'stations.json'), 'utf8'));
  const network = JSON.parse(readFileSync(path.join(DATA, 'eia_energy', 'gas-network.json'), 'utf8')).systems;
  const lines = Object.fromEntries(linesJson.pipelines.map((p) => [p.id, p.parts]));

  const all = [];
  const snapshots = {};
  for (const [id, spec] of Object.entries(POSTINGS)) {
    const { master, capacity, capacityLabel } = await capacityAndMaster(id, spec, io);
    snapshots[id] = { capacity: capacityLabel, masterRows: master.length, capacityRows: capacity.length };
    all.push(...physicalPoints(id, capacity, master));
  }
  const states = [...new Set(all.map((p) => p.state).filter((s) => STATE_FIPS[s]))].sort();
  const ctx = {
    lines,
    stations: stationsJson.stations,
    lng: stationsJson.lng,
    network,
    counties: await counties(states, io),
    places: await places(states, io),
    ghgrp: await ghgrpAll(states, io),
  };
  ctx.placeWords = new Set(ctx.places.flatMap((pl) => tokens(pl.name).map((t) => `${pl.state}:${t}`)));

  const file = path.join(OUT_DIR, 'points.csv');
  const kept = existsSync(file) ? parseCsv(readFileSync(file, 'utf8')).filter((r) => r.method === 'manual') : [];
  const manual = new Map(kept.map((r) => [`${r.pipeline}:${r.loc}`, r]));
  const rows = all.map((p) => {
    const human = manual.get(`${p.pipeline}:${p.loc}`);
    if (human) return { ...human, design_dth: p.designDth };
    const r = resolvePoint(p, ctx);
    return { ...r, design_dth: p.designDth };
  });
  rows.sort((a, b) => a.pipeline.localeCompare(b.pipeline) || a.loc.localeCompare(b.loc, 'en', { numeric: true }));
  const resolved = rows.filter((r) => r.method !== 'unresolved');
  const unresolved = rows.filter((r) => r.method === 'unresolved');
  writeFileSync(file, toCsv(COLS, resolved));
  writeFileSync(path.join(OUT_DIR, 'unresolved.csv'), toCsv(COLS.filter((c) => !['lon', 'lat', 'confidence'].includes(c)), unresolved));

  const tally = {};
  for (const r of rows) {
    tally[r.pipeline] ??= {};
    tally[r.pipeline][r.method] = (tally[r.pipeline][r.method] ?? 0) + 1;
  }
  const src = JSON.parse(readFileSync(path.join(OUT_DIR, 'source.json'), 'utf8'));
  src.points = { snapshots, methods: tally, thresholds: { lngMaxKm: LNG_MAX_KM, interconnectKm: INTERCONNECT_KM, placeSnapMaxKm: PLACE_SNAP_MAX_KM } };
  writeFileSync(path.join(OUT_DIR, 'source.json'), JSON.stringify(src, null, 2));
  console.log(JSON.stringify({ snapshots, methods: tally }, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
