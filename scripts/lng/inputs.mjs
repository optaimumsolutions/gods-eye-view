/**
 * Raw inputs for the LNG bundle: where they live, how they are fetched, and
 * how their retrieval is recorded (docs/COMMODITIES-PLAN.md §12.6.1).
 *
 * Everything under `.gev-cache/lng/` is git-ignored. Two inputs are manual:
 * the GEM LNG-terminals xlsx sits behind an email form, and the GIIGNL
 * matrix comes from a public PDF that `scripts/extract-giignl-matrix.mjs`
 * turns into a committed CSV once per edition. The rest is fetched with
 * `--fetch`; without it the cached copies are used so `--check` runs offline.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

export const ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
export const RAW_DIR = path.join(ROOT, '.gev-cache', 'lng');
export const OUT_DIR = path.join(ROOT, 'src', 'data', 'local_data', 'lng');

export const RAW = Object.freeze({
  gemXlsx: 'gem-lng-terminals.xlsx',
  gemFeed: 'gem-lng-units.geojson',
  doe: 'doe-lng-exports.xlsx',
  eia: 'eia-liquefaction.xlsx',
  retrieved: 'retrieved.json',
});

/** The DOE article that links the monthly workbook; the href suffix moves. */
export const DOE_ARTICLE_URL =
  'https://www.energy.gov/hgeo/articles/natural-gas-imports-and-exports-monthly-2026';
export const DOE_FILE_PATTERN =
  /href="(\/sites\/default\/files\/[^"]*3\.%20U\.S\.%20LNG%20Exports%20and%20Re-Exports%20Details[^"]*\.xlsx)"/;
export const EIA_WORKBOOK_URL =
  'https://www.eia.gov/naturalgas/importsexports/liquefactioncapacity/U.S.liquefactioncapacity_2026_Q2.xlsx';
/** GEM's own public CDN feed behind the GGIT tracker map (same release as the form download). */
export const GEM_FEED_URL =
  'https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/interim_maps/ggit-lng_map_2025-11.geojson';

const UA =
  'gods-eye-view commodity-lng bundle build (https://github.com/optaimumsolutions/gods-eye-view)';

export function rawPath(name) {
  return path.join(RAW_DIR, name);
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function readRetrieved() {
  const file = rawPath(RAW.retrieved);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function recordRetrieved(name, entry) {
  mkdirSync(RAW_DIR, { recursive: true });
  const all = readRetrieved();
  all[name] = entry;
  writeFileSync(rawPath(RAW.retrieved), `${JSON.stringify(all, null, 2)}\n`);
}

async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, lastModified: response.headers.get('last-modified') };
}

/** Fetch DOE (via the article page), EIA and the GEM feed into the raw folder. */
export async function fetchInputs({ gem = true } = {}) {
  mkdirSync(RAW_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  const article = await download(DOE_ARTICLE_URL);
  const match = article.buffer.toString('utf8').match(DOE_FILE_PATTERN);
  if (!match)
    throw new Error(
      `DOE: no "3. U.S. LNG Exports and Re-Exports Details" xlsx link on ${DOE_ARTICLE_URL}`,
    );
  const doeUrl = `https://www.energy.gov${match[1]}`;
  const doe = await download(doeUrl);
  writeFileSync(rawPath(RAW.doe), doe.buffer);
  recordRetrieved(RAW.doe, {
    url: doeUrl,
    retrieved: today,
    lastModified: doe.lastModified,
    sha256: sha256(doe.buffer),
    bytes: doe.buffer.length,
  });

  const eia = await download(EIA_WORKBOOK_URL);
  writeFileSync(rawPath(RAW.eia), eia.buffer);
  recordRetrieved(RAW.eia, {
    url: EIA_WORKBOOK_URL,
    retrieved: today,
    lastModified: eia.lastModified,
    sha256: sha256(eia.buffer),
    bytes: eia.buffer.length,
  });

  if (gem) {
    // 196 MB with the pipeline linework; keep only the LNG terminal units.
    const feed = await download(GEM_FEED_URL);
    const parsed = JSON.parse(feed.buffer.toString('utf8'));
    // Pipelines in the same feed also carry tracker-custom "GGIT-LNG"; the
    // terminal units are the ones the tracker acronym and unit name mark as LNG.
    const features = parsed.features.filter(
      (f) =>
        f.properties?.['tracker-acro'] === 'LNG' &&
        /mtpa/i.test(f.properties?.['units-of-m'] ?? ''),
    );
    const subset = Buffer.from(
      JSON.stringify({ type: 'FeatureCollection', features }),
    );
    writeFileSync(rawPath(RAW.gemFeed), subset);
    recordRetrieved(RAW.gemFeed, {
      url: GEM_FEED_URL,
      retrieved: today,
      lastModified: feed.lastModified,
      upstreamSha256: sha256(feed.buffer),
      upstreamBytes: feed.buffer.length,
      sha256: sha256(subset),
      bytes: subset.length,
      features: features.length,
      note: 'LNG units only; the pipeline features of the same feed are dropped',
    });
  }
  return readRetrieved();
}

/** Read a sheet as row arrays; dates come back as Date objects. */
export function readSheetRows(file, sheetName) {
  const workbook = XLSX.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new Error(
      `${path.basename(file)}: no sheet "${sheetName}" (has ${workbook.SheetNames.join(', ')})`,
    );
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
}

export function requireRaw(name, hint) {
  const file = rawPath(name);
  if (!existsSync(file))
    throw new Error(`missing raw input ${path.relative(ROOT, file)}: ${hint}`);
  return file;
}

export function fileDigest(file) {
  const buffer = readFileSync(file);
  return { sha256: sha256(buffer), bytes: buffer.length };
}

export function removeIfExists(file) {
  if (existsSync(file)) unlinkSync(file);
}
