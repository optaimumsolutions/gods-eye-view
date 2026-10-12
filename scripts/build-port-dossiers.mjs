#!/usr/bin/env node
/**
 * Build the bundled port dossiers (docs/COMMODITIES-PLAN.md §9.6.2).
 *
 *   node scripts/build-port-dossiers.mjs           rebuild the bundle
 *   node scripts/build-port-dossiers.mjs --check   rebuild in memory, report drift, exit 1 on any
 *   node scripts/build-port-dossiers.mjs --probe   fetch every port camera twice, print the review sheet
 *
 * Reads `config/port_dossiers.seed.json`, pulls each port's IMF PortWatch
 * registry row and English Wikipedia summary, validates every field through
 * `src/layers/ports/dossier.js`, and writes `src/data/local_data/port_dossiers/`
 * (`<portid>.json`, `index.json`, `source.json`, `README.md`). Any missing
 * seed field or unreachable source aborts before a byte is written; the
 * finished bundle replaces the old directory in one rename. Fetch dates in
 * `source.json` carry over while a source's content hash is unchanged, so a
 * rerun on unchanged sources reproduces the committed files byte for byte.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PORTWATCH_REGISTRY_FIELDS,
  buildPortDossierIndex,
  buildPortDossierRecord,
  normalizePortWatchRegistryRow,
  normalizeWikipediaSummary,
  validateSeed,
} from '../src/layers/ports/dossier.js';
import { normalizePortCameraRow } from '../server/providers/cctv/portSources.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SEED_FILE = 'config/port_dossiers.seed.json';
export const BUNDLE_DIR = 'src/data/local_data/port_dossiers';
export const CAMERA_CATALOG_FILE = 'config/cctv_sources.ports.json';
const PROBE_WAIT_MS = 60_000;
const PROBE_MAX_BYTES = 5 * 1024 * 1024;
const PROBE_MIN_BYTES = 1024;
const PORTWATCH_REGISTRY_URL =
  'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_ports_database/FeatureServer/0/query';
const PORTWATCH_TERMS = 'https://www.imf.org/external/terms.htm';
const WIKIPEDIA_SUMMARY_URL =
  'https://en.wikipedia.org/api/rest_v1/page/summary/';
/** Wikimedia asks every client to identify itself and its contact point. */
const USER_AGENT =
  'GodsEyeView/0.1 (https://github.com/optaimumsolutions/gods-eye-view; port dossier build)';
const FETCH_TIMEOUT_MS = 20_000;
const WIKIPEDIA_CONCURRENCY = 4;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function fetchJson(url, label, { fetchImpl = fetch, headers = {} } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...headers,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`${label}: ${error?.message || error}`);
  }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.error)
    throw new Error(
      `${label}: service error ${payload.error.code ?? ''} ${payload.error.message ?? ''}`.trim(),
    );
  return payload;
}

/** Read every seed port's registry row in one query; a missing or duplicated port aborts. */
export async function fetchRegistryRows(portids, { fetchImpl } = {}) {
  const where = `portid IN (${portids.map((id) => `'${id}'`).join(',')})`;
  const query = new URLSearchParams({
    where,
    outFields: PORTWATCH_REGISTRY_FIELDS.join(','),
    returnGeometry: 'false',
    orderByFields: 'portid',
    resultRecordCount: String(Math.max(portids.length, 1)),
    f: 'json',
  });
  const url = `${PORTWATCH_REGISTRY_URL}?${query}`;
  const payload = await fetchJson(url, 'PortWatch registry', { fetchImpl });
  if (!Array.isArray(payload?.features))
    throw new Error('PortWatch registry: malformed response');
  const rows = new Map();
  for (const feature of payload.features) {
    const row = normalizePortWatchRegistryRow(feature?.attributes, 'registry');
    if (rows.has(row.portid))
      throw new Error(`PortWatch registry: duplicate row for ${row.portid}`);
    rows.set(row.portid, row);
  }
  const missing = portids.filter((id) => !rows.has(id));
  if (missing.length)
    throw new Error(`PortWatch registry: no row for ${missing.join(', ')}`);
  return { url, rows };
}

export function wikipediaSummaryUrl(title) {
  return `${WIKIPEDIA_SUMMARY_URL}${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

async function fetchWikipediaSummary(title, { fetchImpl } = {}) {
  const url = wikipediaSummaryUrl(title);
  const payload = await fetchJson(url, `Wikipedia summary for ${title}`, {
    fetchImpl,
  });
  return {
    url,
    summary: normalizeWikipediaSummary(payload, title, `wikipedia(${title})`),
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function readPreviousSources(bundleDir) {
  const file = path.join(bundleDir, 'source.json');
  if (!fs.existsSync(file)) return new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Map((parsed?.sources ?? []).map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

/** Keep the previous fetch date while the content hash is unchanged (byte-for-byte reruns). */
function retrievedDate(previous, id, hash, today) {
  const prior = previous.get(id);
  return prior && prior.sha256 === hash && typeof prior.retrieved === 'string'
    ? prior.retrieved
    : today;
}

function readme({ count, vintage }) {
  return [
    '# Port dossiers',
    '',
    'Static facts for the commodity ports of docs/COMMODITIES-PLAN.md §9.6.1,',
    'bundled for the port dossier panel. Built by `scripts/build-port-dossiers.mjs`',
    'from `config/port_dossiers.seed.json`; nothing here is fetched at runtime.',
    'The panel stamps the about section with its Wikipedia revision time and the',
    'trade-role section with the `vintage` below, never with the fetch time. Live',
    'sections (camera, flow, history, weather, headlines) are fetched on click and',
    'are not part of this bundle.',
    '',
    '- Sources: IMF PortWatch ports database (identity, LOCODE, annual calls by',
    "  vessel class, top industries, share of the country's maritime trade),",
    `  under the IMF terms of use (${PORTWATCH_TERMS}); English Wikipedia REST`,
    '  summaries (title, extract, thumbnail, page URL), text CC BY-SA 4.0 with',
    '  attribution on the panel; the hand-written seed (role, terminals,',
    '  authority, aliases, cameras, satellite zoom).',
    `- Count: ${count} ports (\`index.json\`).`,
    `- Vintage: ${vintage} (newest source fetch; per-source dates and content`,
    '  hashes are in `source.json`).',
    '- Runtime files: `index.json`, one `<portid>.json` per port, `source.json`.',
    '',
    'Refresh: `node scripts/build-port-dossiers.mjs` rebuilds every file;',
    '`--check` rebuilds in memory and reports drift against the committed bundle.',
    'Growing the set is one seed entry plus a rebuild; the schema test in',
    '`src/layers/ports/dossier.test.mjs` pins the launch set.',
    '',
  ].join('\n');
}

/** Assemble every output file in memory; nothing touches disk here. */
export async function buildBundleFiles({ root = ROOT, today, fetchImpl } = {}) {
  const seedPath = path.join(root, SEED_FILE);
  const seedText = fs.readFileSync(seedPath, 'utf8');
  const seed = validateSeed(JSON.parse(seedText));
  const bundleDir = path.join(root, BUNDLE_DIR);
  const previous = readPreviousSources(bundleDir);
  const date = today ?? new Date().toISOString().slice(0, 10);

  const registry = await fetchRegistryRows(
    seed.map((entry) => entry.portid),
    { fetchImpl },
  );
  // Hash in the seed's order: the byte-for-byte rerun must not depend on the
  // order ArcGIS happens to return the rows in.
  const registryHash = sha256(
    stableJson(seed.map((entry) => registry.rows.get(entry.portid))),
  );
  const sources = [
    {
      id: 'portwatch-registry',
      name: 'IMF PortWatch ports database',
      url: registry.url,
      licence: `IMF terms of use (${PORTWATCH_TERMS})`,
      retrieved: retrievedDate(
        previous,
        'portwatch-registry',
        registryHash,
        date,
      ),
      sha256: registryHash,
    },
  ];

  const summaries = await mapWithConcurrency(
    seed,
    WIKIPEDIA_CONCURRENCY,
    (entry) => fetchWikipediaSummary(entry.wikipediaTitle, { fetchImpl }),
  );

  const files = new Map();
  const records = seed.map((entry, index) => {
    const { url, summary } = summaries[index];
    const hash = sha256(stableJson(summary));
    const id = `wikipedia:${entry.portid}`;
    sources.push({
      id,
      name: `Wikipedia, ${summary.title}`,
      url,
      licence: 'CC BY-SA 4.0',
      retrieved: retrievedDate(previous, id, hash, date),
      revision: summary.revision,
      sha256: hash,
    });
    const record = buildPortDossierRecord({
      seed: entry,
      registry: registry.rows.get(entry.portid),
      wikipedia: summary,
    });
    files.set(`${record.portid}.json`, stableJson(record));
    return record;
  });

  const vintage = sources
    .map((source) => source.retrieved)
    .sort()
    .at(-1);
  files.set(
    'index.json',
    stableJson(buildPortDossierIndex(records, { vintage })),
  );
  files.set(
    'source.json',
    stableJson({
      bundle: 'port_dossiers',
      vintage,
      seed: { file: SEED_FILE, sha256: sha256(seedText) },
      sources,
    }),
  );
  files.set('README.md', readme({ count: records.length, vintage }));
  return { files, vintage, count: records.length };
}

/** Replace the bundle directory in one rename so a crash never leaves a partial bundle. */
export function writeBundle(files, { root = ROOT } = {}) {
  const target = path.join(root, BUNDLE_DIR);
  const parent = path.dirname(target);
  const staging = path.join(parent, `.port_dossiers-${process.pid}`);
  const retired = path.join(parent, `.port_dossiers-${process.pid}-old`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  let retiredTarget = false;
  try {
    for (const [name, text] of files)
      fs.writeFileSync(path.join(staging, name), text);
    if (fs.existsSync(target)) {
      fs.renameSync(target, retired);
      retiredTarget = true;
    }
    fs.renameSync(staging, target);
    retiredTarget = false;
  } catch (error) {
    // Leave the tree as it was: no staging copy, and the old bundle back.
    if (retiredTarget && !fs.existsSync(target)) fs.renameSync(retired, target);
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(retired, { recursive: true, force: true });
  }
}

/** Compare in-memory outputs with the committed bundle; returns the names that differ or are missing. */
export function bundleDrift(files, { root = ROOT } = {}) {
  const target = path.join(root, BUNDLE_DIR);
  const drift = [];
  for (const [name, text] of files) {
    const file = path.join(target, name);
    if (!fs.existsSync(file)) drift.push(`${name} (missing)`);
    else if (fs.readFileSync(file, 'utf8') !== text)
      drift.push(`${name} (differs)`);
  }
  if (fs.existsSync(target)) {
    for (const name of fs.readdirSync(target)) {
      if (!files.has(name)) drift.push(`${name} (stale)`);
    }
  }
  return drift;
}

/** One fetch of a camera still: status, type, size, content hash and the caching headers a reviewer reads. */
async function fetchStill(url) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GodsEyeView/0.1 port-camera-probe',
      Accept: 'image/*,*/*;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > PROBE_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error(`content-length ${declared} exceeds ${PROBE_MAX_BYTES}`);
  }
  // Trusting content-length is not a cap: a chunked answer declares none, and
  // one of these URLs is a stream host. Stop reading at the ceiling instead.
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.length;
    if (total > PROBE_MAX_BYTES) {
      await response.body?.cancel();
      throw new Error(`body exceeds ${PROBE_MAX_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    bytes: buffer.length,
    sha256: sha256(buffer),
    lastModified: response.headers.get('last-modified') || '',
    cacheControl: response.headers.get('cache-control') || '',
    finalUrl: response.url,
    ms: Date.now() - started,
  };
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Fetch every camera in the catalog twice, `waitMs` apart, and judge each:
 * HTTP 200 with an image/* body between the size bounds on both passes,
 * no redirect off the row's origin (the proxy refuses those), and whether
 * the two frames differ. The sheet is what goes in the commit message.
 */
export async function probeCameraCatalog({
  root = ROOT,
  waitMs = PROBE_WAIT_MS,
  fetchImpl = fetchStill,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const rows = JSON.parse(
    fs.readFileSync(path.join(root, CAMERA_CATALOG_FILE), 'utf8'),
  );
  if (!Array.isArray(rows) || !rows.length)
    throw new Error(`${CAMERA_CATALOG_FILE}: no camera rows`);
  // One retry on a 5xx: a shared origin (Port Houston sits behind Cloudflare)
  // answers a burst with 520 pages, so rows are fetched one at a time, spaced.
  // Judge each row the way the server will: a row the loader rejects must
  // never probe green, and the URL fetched is the one the proxy resolves.
  const checked = rows.map((row) => normalizePortCameraRow(row));
  const attempt = async (camera) => {
    if (!camera) return null;
    let last = null;
    for (let tries = 0; tries < 2; tries += 1) {
      try {
        last = await fetchImpl(camera.snapshotUrl);
        if (last.status < 500) return last;
      } catch (error) {
        last = { status: 0, error: error?.message || String(error) };
      }
      await sleep(5000);
    }
    return last;
  };
  const pass = async () => {
    const out = [];
    for (const { camera } of checked) {
      out.push(await attempt(camera));
      if (camera) await sleep(1500);
    }
    return out;
  };
  const first = await pass();
  await sleep(waitMs);
  const second = await pass();
  return rows.map((row, index) => {
    const { camera, reason } = checked[index];
    if (!camera) {
      return {
        id: typeof row?.id === 'string' ? row.id : '(no id)',
        name: typeof row?.name === 'string' ? row.name : '',
        portid: typeof row?.portid === 'string' ? row.portid : '',
        url: typeof row?.url === 'string' ? row.url : '',
        status: [0, 0],
        contentType: '',
        bytes: [null, null],
        lastModified: ['', ''],
        ms: [null, null],
        differs: false,
        ok: false,
        verdict: `FAIL the loader rejects this row: ${reason}`,
      };
    }
    const a = first[index];
    const b = second[index];
    const image = (pass) =>
      pass.status === 200 &&
      /^image\//i.test(pass.contentType || '') &&
      pass.bytes >= PROBE_MIN_BYTES &&
      pass.bytes <= PROBE_MAX_BYTES;
    const redirected =
      (a.finalUrl && !sameOrigin(a.finalUrl, camera.snapshotUrl)) ||
      (b.finalUrl && !sameOrigin(b.finalUrl, camera.snapshotUrl));
    const ok = image(a) && image(b) && !redirected;
    const differs = ok && a.sha256 !== b.sha256;
    let verdict;
    if (!ok)
      verdict =
        `FAIL ${a.error || b.error || `HTTP ${a.status}/${b.status} ${a.contentType || ''}`}${redirected ? ' (redirects off origin)' : ''}`.trim();
    else if (differs) verdict = 'live: frames differ';
    else verdict = `static: same bytes after ${Math.round(waitMs / 1000)} s`;
    return {
      id: camera.id,
      name: camera.name,
      portid: camera.portid,
      url: camera.snapshotUrl,
      status: [a.status, b.status],
      contentType: a.contentType || b.contentType || '',
      bytes: [a.bytes ?? null, b.bytes ?? null],
      lastModified: [a.lastModified || '', b.lastModified || ''],
      ms: [a.ms ?? null, b.ms ?? null],
      differs,
      ok,
      verdict,
    };
  });
}

/** The markdown review sheet for the commit message. */
export function probeSheet(results) {
  const lines = [
    `Port camera probe, ${results.length} rows, two fetches each:`,
    '',
    '| id | port | status | type | bytes (1st/2nd) | last-modified (1st) | verdict |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of results) {
    lines.push(
      `| ${row.id} | ${row.portid} | ${row.status.join('/')} | ${row.contentType} | ${row.bytes.map((n) => n ?? 'n/a').join('/')} | ${row.lastModified[0] || 'n/a'} | ${row.verdict} |`,
    );
  }
  const failed = results.filter((row) => !row.ok).length;
  lines.push('', `${results.length - failed} ok, ${failed} failed.`);
  return lines.join('\n');
}

async function main(argv) {
  const check = argv.includes('--check');
  const probe = argv.includes('--probe');
  const unknown = argv.filter((arg) => arg !== '--check' && arg !== '--probe');
  if (unknown.length) {
    console.error(
      `Unknown option ${unknown.join(' ')}. Use --check, --probe or no option.`,
    );
    return 2;
  }
  if (probe) {
    const results = await probeCameraCatalog();
    console.log(probeSheet(results));
    return results.every((row) => row.ok) ? 0 : 1;
  }
  const { files, vintage, count } = await buildBundleFiles();
  if (check) {
    const drift = bundleDrift(files);
    if (drift.length) {
      console.error(`Bundle drift in ${BUNDLE_DIR}:\n  ${drift.join('\n  ')}`);
      return 1;
    }
    console.log(
      `Bundle unchanged: ${count} dossiers, vintage ${vintage}, ${files.size} files.`,
    );
    return 0;
  }
  writeBundle(files);
  console.log(
    `Wrote ${files.size} files to ${BUNDLE_DIR}: ${count} dossiers, vintage ${vintage}.`,
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error?.message || error);
      process.exit(1);
    },
  );
}
