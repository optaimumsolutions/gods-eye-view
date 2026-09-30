#!/usr/bin/env node
/**
 * Row 3 (docs/COMMODITIES-PLAN.md §11.8.1): bundle the weather gazetteer.
 *
 * Reads the Oil Oracle's sample-point yamls (`corpus/wx_basins.yaml`,
 * `corpus/wx_regions.yaml`, `corpus/wx_stations.yaml`, and for the M7 demand
 * markers `corpus/wx_divisions.yaml` + `corpus/gwdd_weights.yaml`) from
 * `optaimumsolutions/commodities` at a PINNED commit through `gh api` — build
 * time only; nothing in the read path touches GitHub — and writes
 * `src/data/local_data/weather/gazetteer.json` + `source.json`, so the globe
 * and the oracle name the same places with the same weights.
 *
 *   node scripts/build-weather-gazetteer.mjs            # fetch + write
 *   node scripts/build-weather-gazetteer.mjs --check    # byte-identical?
 *   node scripts/build-weather-gazetteer.mjs --local ../commodities   # read a
 *       checkout instead of gh api (same pinned commit via `git show`)
 *
 * The oracle's yaml is flow-style (`{name: X, lat: 1, w: 2}`); the small
 * parser below covers exactly that grammar and fails loudly on anything else,
 * so a yaml change upstream cannot silently mis-bundle.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'local_data', 'weather');
const REPO = 'optaimumsolutions/commodities';
/** Pinned oracle commit the yamls are read at (bump deliberately, re-run). */
const COMMIT = '28c27e30d43a029e76aa04cef16bfad9ab8f05be';
const FILES = [
  'corpus/wx_basins.yaml',
  'corpus/wx_regions.yaml',
  'corpus/wx_stations.yaml',
  'corpus/wx_divisions.yaml',
  'corpus/gwdd_weights.yaml',
];

/**
 * A-1 (§11.8.1.3): the two Gulf entries are not in the oracle's yaml.
 * Hand-placed, founder-editable, recorded in source.json as such.
 */
const GULF = [
  {
    id: 'gulf-offshore',
    kind: 'gulf',
    name: 'Gulf offshore production',
    points: [{ name: 'Mississippi Canyon', lat: 28.2, lon: -89.8, w: 1 }],
  },
  {
    id: 'gulf-lng',
    kind: 'gulf',
    name: 'Gulf LNG coast',
    points: [{ name: 'Sabine Pass', lat: 29.73, lon: -93.87, w: 1 }],
  },
];

const BASIN_IDS = {
  Appalachia: 'appalachia',
  Permian: 'permian',
  Haynesville: 'haynesville',
  Anadarko: 'anadarko',
  EagleFord: 'eagleford',
  Bakken: 'bakken',
};
const REGION_IDS = { SouthCentral: 'southcentral', Texas: 'texas' };
const BASIN_NAMES = { EagleFord: 'Eagle Ford', SouthCentral: 'South Central' };

// ---------------------------------------------------------------- yaml ----

/** Parse one flow scalar: quoted string, number, or bare word(s). */
function scalar(raw) {
  const s = raw.trim();
  if (s === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(['"]).*\1$/.test(s)) return s.slice(1, -1);
  return s;
}

/** Split a flow body on commas that sit outside nested brackets. */
function splitTop(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Parse a flow value: `{k: v, ...}`, `[a, b]` or a scalar. */
function flow(raw) {
  const s = raw.trim();
  if (s.startsWith('{')) {
    if (!s.endsWith('}')) throw new Error(`unterminated flow map: ${s}`);
    const out = {};
    for (const part of splitTop(s.slice(1, -1))) {
      const i = part.indexOf(':');
      if (i < 0) throw new Error(`flow map entry without ':': ${part}`);
      out[part.slice(0, i).trim()] = flow(part.slice(i + 1));
    }
    return out;
  }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) throw new Error(`unterminated flow list: ${s}`);
    return splitTop(s.slice(1, -1)).map(flow);
  }
  return scalar(s);
}

/**
 * Parse the oracle's block-of-flow yaml: top-level keys whose values are
 * either a flow map/list (possibly wrapped over several lines), a block map
 * of `Name: {flow}` entries (again multi-line), or a block list of `- {flow}`.
 */
function parseYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+#.*$/, '').replace(/^#.*$/, ''))
    .filter((l) => l.trim() !== '');
  const doc = {};
  let i = 0;
  const indentOf = (l) => l.match(/^\s*/)[0].length;
  /** Gather a flow value that may continue on deeper-indented lines. */
  function gather(first, baseIndent) {
    let buf = first;
    const open = (buf.match(/[[{]/g) || []).length;
    const close = (buf.match(/[\]}]/g) || []).length;
    let depth = open - close;
    while (depth > 0 && i < lines.length && indentOf(lines[i]) > baseIndent) {
      const l = lines[i++];
      buf += ' ' + l.trim();
      depth +=
        (l.match(/[[{]/g) || []).length - (l.match(/[\]}]/g) || []).length;
    }
    if (depth !== 0) throw new Error(`unbalanced flow value near: ${first}`);
    return buf;
  }
  while (i < lines.length) {
    const line = lines[i++];
    const m = line.match(/^(\s*)([A-Za-z_][\w ]*):\s*(.*)$/);
    if (!m) throw new Error(`unexpected line: ${line}`);
    const [, ind, key, rest] = m;
    const indent = ind.length;
    if (rest.trim() !== '') {
      const value = flow(gather(rest, indent));
      setPath(doc, indent, key, value);
      continue;
    }
    // block value: either `- {..}` items or `Name: {..}` entries
    const items = [];
    const map = {};
    let isList = null;
    while (i < lines.length && indentOf(lines[i]) > indent) {
      const l = lines[i++];
      const t = l.trim();
      if (t.startsWith('- ')) {
        isList = true;
        items.push(flow(gather(t.slice(2), indentOf(l))));
      } else {
        const mm = t.match(/^([A-Za-z_][\w ]*):\s*(.*)$/);
        if (!mm) throw new Error(`unexpected block line: ${l}`);
        isList = false;
        if (mm[2].trim() === '') {
          // nested block (divisions: -> New England: -> - {...})
          const sub = [];
          while (i < lines.length && indentOf(lines[i]) > indentOf(l)) {
            const ll = lines[i++];
            const tt = ll.trim();
            if (!tt.startsWith('- '))
              throw new Error(`expected list item: ${ll}`);
            sub.push(flow(gather(tt.slice(2), indentOf(ll))));
          }
          map[mm[1]] = sub;
        } else {
          map[mm[1]] = flow(gather(mm[2], indentOf(l)));
        }
      }
    }
    setPath(doc, indent, key, isList ? items : map);
  }
  return doc;
}

function setPath(doc, indent, key, value) {
  if (indent !== 0) throw new Error(`nested top-level key unsupported: ${key}`);
  doc[key] = value;
}

// ------------------------------------------------------------- fetch ----

function ghApiFile(path) {
  const out = execFileSync(
    'gh',
    ['api', `repos/${REPO}/contents/${path}?ref=${COMMIT}`, '--jq', '.content'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return Buffer.from(out.replace(/\s/g, ''), 'base64').toString('utf8');
}

function localFile(checkout, path) {
  return execFileSync('git', ['-C', checkout, 'show', `${COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

// ------------------------------------------------------------- build ----

function normalizeWeights(points) {
  const total = points.reduce((s, p) => s + p.w, 0);
  return points.map((p) => ({ ...p, w: round(p.w / total, 6) }));
}

function centroid(points) {
  const lat = points.reduce((s, p) => s + p.lat * p.w, 0);
  const lon = points.reduce((s, p) => s + p.lon * p.w, 0);
  return { lat: round(lat, 4), lon: round(lon, 4) };
}

function round(v, d) {
  return Number(v.toFixed(d));
}

export function buildGazetteer({
  basins,
  regions,
  stations,
  divisions = null,
  weights = null,
}) {
  const entries = [];
  for (const [name, b] of Object.entries(basins.basins)) {
    const id = BASIN_IDS[name];
    if (!id) throw new Error(`unknown basin ${name} — add it to BASIN_IDS`);
    const points = normalizeWeights(
      b.points.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, w: p.w })),
    );
    entries.push({
      id,
      kind: 'basin',
      name: BASIN_NAMES[name] || name,
      ...centroid(points),
      points,
      freezeF: b.freeze_f,
      share: b.share,
      commodities: ['natgas', 'oil'],
      country: 'US',
    });
  }
  // metros resolve by name against wx_stations divisions + extra_metros
  const metros = new Map();
  for (const list of Object.values(stations.divisions))
    for (const m of list) metros.set(m.name, m);
  for (const m of regions.extra_metros || []) metros.set(m.name, m);
  for (const [name, r] of Object.entries(regions.regions)) {
    const id = REGION_IDS[name];
    if (!id) throw new Error(`unknown region ${name} — add it to REGION_IDS`);
    const points = normalizeWeights(
      r.metros.map((mn) => {
        const m = metros.get(mn);
        if (!m)
          throw new Error(
            `region ${name}: metro ${mn} not in stations/extra_metros`,
          );
        return { name: m.name, lat: m.lat, lon: m.lon, w: m.pop };
      }),
    );
    entries.push({
      id,
      kind: 'region',
      name: BASIN_NAMES[name] || name,
      ...centroid(points),
      points,
      commodities: ['natgas'],
      country: 'US',
    });
  }
  for (const g of GULF) {
    const points = normalizeWeights(g.points);
    entries.push({
      ...g,
      ...centroid(points),
      points,
      commodities: ['natgas', 'oil'],
      country: 'US',
    });
  }
  // §11.8.15 requirement 1 (M7, D7.1/D7.3): the nine census divisions as
  // demand markers — the oracle's own metro basket and pop weights, its gas
  // share (division share of US res+comm gas deliveries) and the EIA-930
  // regions the power-demand line quotes.
  if (divisions && weights) {
    for (const [name, d] of Object.entries(divisions.divisions)) {
      const list = stations.divisions[name];
      if (!list) throw new Error(`division ${name} not in wx_stations.yaml`);
      const gasShare = weights.weights[name];
      if (typeof gasShare !== 'number')
        throw new Error(`division ${name} has no weight in gwdd_weights.yaml`);
      const points = normalizeWeights(
        list.map((m) => ({ name: m.name, lat: m.lat, lon: m.lon, w: m.pop })),
      );
      entries.push({
        id: String(d.id),
        kind: 'division',
        name,
        ...centroid(points),
        points,
        gasShare: round(gasShare, 6),
        eia930: (Array.isArray(d.eia930) ? d.eia930 : [d.eia930]).map(String),
        commodities: ['natgas'],
        country: 'US',
      });
    }
  }
  return entries;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const localIdx = args.indexOf('--local');
  const checkout = localIdx >= 0 ? args[localIdx + 1] : null;
  const texts = {};
  for (const f of FILES)
    texts[f] = checkout ? localFile(checkout, f) : ghApiFile(f);
  const parsed = {
    basins: parseYaml(texts['corpus/wx_basins.yaml']),
    regions: parseYaml(texts['corpus/wx_regions.yaml']),
    stations: parseYaml(texts['corpus/wx_stations.yaml']),
    divisions: parseYaml(texts['corpus/wx_divisions.yaml']),
    weights: parseYaml(texts['corpus/gwdd_weights.yaml']),
  };
  const entries = buildGazetteer(parsed);
  const gazetteer = JSON.stringify({ entries }, null, 2) + '\n';
  const source = {
    repo: REPO,
    commit: COMMIT,
    files: Object.fromEntries(
      FILES.map((f) => [
        f,
        createHash('sha256').update(texts[f]).digest('hex'),
      ]),
    ),
    handPlaced: GULF.map((g) => g.id),
    retrievedVia: checkout ? 'git show (local checkout)' : 'gh api',
    // retrieval date is the one non-reproducible field: kept out of the
    // --check comparison by living in source.json, not gazetteer.json
    retrievedAt: new Date().toISOString().slice(0, 10),
  };
  const gazPath = join(OUT_DIR, 'gazetteer.json');
  if (check) {
    const cur = existsSync(gazPath) ? readFileSync(gazPath, 'utf8') : '';
    if (cur !== gazetteer) {
      console.error('gazetteer.json DRIFTS from a fresh build');
      process.exit(1);
    }
    console.log('gazetteer.json byte-identical');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(gazPath, gazetteer);
  writeFileSync(
    join(OUT_DIR, 'source.json'),
    JSON.stringify(source, null, 2) + '\n',
  );
  console.log(`wrote ${entries.length} entries → ${gazPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
export { parseYaml, flow };
