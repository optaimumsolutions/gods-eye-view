/**
 * Paged reads from an ArcGIS FeatureServer, shared by the build scripts that
 * bundle EIA's public-domain energy geometry (docs/COMMODITIES-PLAN.md §10.7,
 * R4.18 to R4.20).
 *
 * Four things here are load-bearing, and each one is a defect we measured
 * rather than a preference:
 *
 *   1. ArcGIS reports failures as **HTTP 200 with an error object in the
 *      body**. The status line is not the check. Every response is parsed and
 *      inspected before it is believed.
 *   2. Offsets are stable only under a **total order**, so `orderByFields` is
 *      required, not defaulted. The order field is the layer's own OID field,
 *      whose name varies by layer — the gas pipeline layer calls it `FID`, and
 *      `orderByFields=OBJECTID` on that layer returns
 *      `{"error":{"code":400,...,"details":["'OBJECTID' parameter is invalid"]}}`
 *      under a 200. Callers pass the name the layer actually advertises.
 *   3. `geometryPrecision` and `outSR` are pinned by the caller. An unpinned
 *      precision is an unpinned byte stream, and these services default to
 *      wkid 102100 with their extent in metres.
 *   4. Byte-for-byte reproducibility on a paged source is impossible without a
 *      **raw archive**, because row order and content drift upstream. Every
 *      page is archived verbatim as fetched, and a build can be replayed from
 *      the archive instead of the network.
 */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/** Page size cap on these services. Measured: 2,000, not the usual 1,000. */
export const PAGE_SIZE = 2000;

/**
 * Parse an ArcGIS response body and reject the 200-with-error shape.
 * `context` names the request in the thrown message, because a build that
 * fails on page 11 of 17 must say which page.
 */
export function parseArcgisBody(text, context = 'arcgis request') {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `${context}: response was not JSON (${text.slice(0, 200)})`,
    );
  }
  if (body && typeof body === 'object' && body.error) {
    const { code, message, details } = body.error;
    const detail =
      Array.isArray(details) && details.length
        ? ` — ${details.join('; ')}`
        : '';
    throw new Error(
      `${context}: ArcGIS error ${code ?? '?'} ${message ?? ''}${detail}`,
    );
  }
  return body;
}

/** Build a query URL with stable parameter order, so archived page names are stable. */
export function buildQueryUrl(layerUrl, params) {
  const search = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  return `${layerUrl.replace(/\/+$/, '')}/query?${search.toString()}`;
}

async function readUrl(url, { fetchImpl = fetch, context = url } = {}) {
  const response = await fetchImpl(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${context}: HTTP ${response.status} ${response.statusText}`,
    );
  }
  return { text, body: parseArcgisBody(text, context) };
}

/** The authoritative record count, used to prove the paged pull is complete. */
export async function countFeatures(
  layerUrl,
  { where = '1=1', fetchImpl = fetch } = {},
) {
  const url = buildQueryUrl(layerUrl, {
    where,
    returnCountOnly: true,
    f: 'json',
  });
  const { body } = await readUrl(url, { fetchImpl, context: 'count query' });
  if (!Number.isInteger(body?.count)) {
    throw new Error(
      `count query: no integer count in response (${JSON.stringify(body).slice(0, 200)})`,
    );
  }
  return body.count;
}

const pageName = (index) => `page-${String(index).padStart(3, '0')}.json`;

/**
 * Pull every feature, archiving each page verbatim.
 *
 * `orderByFields` is required. `rawDir`, when given, receives the exact bytes
 * of each page; `replayDir` reads them back instead of going to the network,
 * which is what makes a rebuild reproducible.
 */
export async function fetchAllFeatures(
  layerUrl,
  {
    outFields,
    orderByFields,
    geometryPrecision,
    outSR,
    returnGeometry = true,
    where = '1=1',
    pageSize = PAGE_SIZE,
    rawDir = null,
    replayDir = null,
    fetchImpl = fetch,
    onPage = () => {},
  } = {},
) {
  if (!orderByFields) {
    throw new Error(
      'fetchAllFeatures: orderByFields is required — offsets are stable only under a total order',
    );
  }
  if (returnGeometry && (geometryPrecision == null || outSR == null)) {
    throw new Error(
      'fetchAllFeatures: geometryPrecision and outSR must be pinned when geometry is returned',
    );
  }

  if (replayDir) {
    const names = readdirSync(replayDir)
      .filter((n) => /^page-\d+\.json$/.test(n))
      .sort();
    if (!names.length)
      throw new Error(`replay: no archived pages in ${replayDir}`);
    // Page names are zero-padded so lexical order is numeric order, but a gap
    // still means the archive is incomplete and a replay would silently build
    // a short bundle.
    names.forEach((name, index) => {
      const expectedName = pageName(index);
      if (name !== expectedName) {
        throw new Error(
          `replay: archive is not contiguous — expected ${expectedName}, found ${name}`,
        );
      }
    });
    const features = [];
    const upstream = createHash('sha256');
    let expected = null;
    names.forEach((name, index) => {
      const text = readFileSync(path.join(replayDir, name), 'utf8');
      upstream.update(text);
      const body = parseArcgisBody(text, `replay ${name}`);
      if (expected === null) expected = body.fields;
      features.push(...(body.features ?? []));
      onPage({
        index,
        count: body.features?.length ?? 0,
        total: features.length,
        replayed: true,
      });
    });
    return {
      features,
      fields: expected,
      pages: names.length,
      replayed: true,
      upstreamSha256: upstream.digest('hex'),
    };
  }

  const expectedCount = await countFeatures(layerUrl, { where, fetchImpl });
  if (rawDir) {
    mkdirSync(rawDir, { recursive: true });
    // Clear stale pages first. A shorter pull into a directory still holding a
    // longer one leaves the surplus pages behind, and a later --replay reads
    // the union: two upstream vintages welded into one bundle, with a feature
    // count that can still satisfy the manifest.
    for (const name of readdirSync(rawDir)) {
      if (/^page-\d+\.json$/.test(name)) rmSync(path.join(rawDir, name));
    }
  }

  const features = [];
  const upstream = createHash('sha256');
  let fields = null;
  let index = 0;
  for (let offset = 0; offset < expectedCount; offset += pageSize) {
    const url = buildQueryUrl(layerUrl, {
      where,
      outFields,
      returnGeometry,
      geometryPrecision,
      outSR,
      orderByFields,
      resultOffset: offset,
      resultRecordCount: pageSize,
      f: 'json',
    });
    const { text, body } = await readUrl(url, {
      fetchImpl,
      context: `page ${index} (offset ${offset})`,
    });
    const page = body.features ?? [];
    // `exceededTransferLimit` is true on every page but the last while paging —
    // it says "more records remain", not "this page was truncated". The failure
    // worth catching is the server capping a page BELOW the size we asked for
    // while it still has records to give, which silently shortens the pull.
    const remaining = expectedCount - offset;
    const wanted = Math.min(pageSize, remaining);
    if (page.length < wanted) {
      throw new Error(
        `page ${index}: server returned ${page.length} of a requested ${wanted} — the page cap is below ${pageSize}`,
      );
    }
    if (!page.length) {
      throw new Error(
        `page ${index}: empty page at offset ${offset} of an expected ${expectedCount}`,
      );
    }
    if (rawDir) writeFileSync(path.join(rawDir, pageName(index)), text);
    upstream.update(text);
    if (fields === null) fields = body.fields;
    features.push(...page);
    onPage({
      index,
      count: page.length,
      total: features.length,
      replayed: false,
    });
    index += 1;
  }

  if (features.length !== expectedCount) {
    throw new Error(
      `paged pull is incomplete: fetched ${features.length} against a reported ${expectedCount}`,
    );
  }
  return {
    features,
    fields,
    pages: index,
    expectedCount,
    replayed: false,
    upstreamSha256: upstream.digest('hex'),
  };
}

/**
 * Read `--flag value`, `--flag=value` and bare `--flag` switches from argv.
 *
 * The `=` form is not a nicety. Without it `--replay=<dir>` parses as the bare
 * switch `replay=<dir>`, the `replay` option stays undefined, and a command
 * the operator wrote to read from an archive instead performs a live pull —
 * overwriting that archive on the way through. An unrecognised flag is louder
 * than a misread one, so anything that is not a known form throws.
 */
export function readArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(
        `unexpected argument "${token}" — options are --flag, --flag value or --flag=value`,
      );
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    if (equals !== -1) {
      args[body.slice(0, equals)] = body.slice(equals + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[body] = next;
      i += 1;
    } else {
      args[body] = true;
    }
  }
  return args;
}
