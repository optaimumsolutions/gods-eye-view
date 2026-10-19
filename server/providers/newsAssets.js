import fs from 'node:fs';
import path from 'node:path';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { fetchRegionalJson } from './regional/http.js';
import { normalizeRegionalArticles } from '../../src/data/regionalModel.js';
import { NEWS_GAZETTEER } from '../../src/layers/news/gazetteer.js';
import {
  NEWS_NOTICE,
  NEWS_WINDOW_DAYS,
  buildGroupQuery,
  buildNewsGroups,
  matchArticlesToAssets,
  mergeGroupCaches,
} from '../../src/layers/news/wire.js';

/**
 * Matched headlines for every news-layer asset (docs/COMMODITIES-PLAN.md §4
 * row 5).
 *
 *   GET /api/news-assets
 *
 * The asset list and every alias come from the bundled gazetteer and the
 * committed port-dossier seed, never from the client. GDELT DOC is the only
 * upstream (docs/LICENCES.md: commercial use allowed with citation). The
 * gazetteer is chunked into query groups; at most one upstream query leaves
 * per minute and each group's answer is cached for fifteen minutes, so the
 * route always answers from cache at once and the groups fill in behind it
 * (`status: warming` until every group has fetched). A failed group keeps its
 * stale copy; errors reach the client as fixed strings, never upstream text.
 */
export const NEWS_ASSETS_ROUTE = '/api/news-assets';
export const NEWS_ASSETS_CACHE_MS = 15 * 60_000;
/** The one-query-per-minute upstream ceiling (plan §4 row 5). */
export const NEWS_ASSETS_SPACING_MS = 61_000;
/** A failed group waits this long before its next attempt. */
export const NEWS_ASSETS_RETRY_MS = 2 * 60_000;
const SEED_FILE = 'config/port_dossiers.seed.json';
const UPSTREAM_TIMEOUT_MS = 12_000;
const UPSTREAM_MAX_BYTES = 1_500_000;
const UPSTREAM_FETCH_LIMIT = 60;
const USER_AGENT = 'GodsEyeView/0.1';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

/** The seed's aliases keyed by dossier slug (the gazetteer's port ids). */
function readSeedAliases(sourceRoot) {
  const resolved = path.resolve(sourceRoot, SEED_FILE);
  const aliases = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      const slug = String(entry?.slug || '').trim();
      if (!slug || !Array.isArray(entry.aliases)) continue;
      aliases.set(slug, entry.aliases);
    }
  } catch (error) {
    console.warn('[NewsAssets] seed unavailable:', error?.message || error);
  }
  return aliases;
}

function reply(res, status, payload, extra = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...extra });
  res.end(JSON.stringify(payload));
}

/**
 * Vite plugin: the news-asset headline proxy. `fetchJson` defaults to the
 * bounded regional reader (timeout covers the body, size capped); a test
 * hands in a stub.
 */
export function newsAssetsProxy({
  sourceRoot = process.cwd(),
  fetchJson = fetchRegionalJson,
  now = () => Date.now(),
} = {}) {
  let _groups = null;
  let _lastUpstreamAt = 0;
  const _rateLimiter = makeRateLimiter({
    windowMs: 60_000,
    max: 30,
    globalMax: 90,
  });

  function groups() {
    if (!_groups) {
      _groups = buildNewsGroups(
        NEWS_GAZETTEER,
        readSeedAliases(sourceRoot),
      ).map((group) => ({
        group,
        query: buildGroupQuery(group),
        byAsset: new Map(),
        fetchedAt: null,
        fetchedAtMs: 0,
        lastAttemptMs: 0,
        inFlight: null,
      }));
    }
    return _groups;
  }

  async function refreshGroup(entry) {
    const at = now();
    const seenAt = new Date(at).toISOString();
    const params = new URLSearchParams({
      query: entry.query,
      mode: 'artlist',
      format: 'json',
      maxrecords: String(UPSTREAM_FETCH_LIMIT),
      sort: 'datedesc',
      timespan: `${NEWS_WINDOW_DAYS}d`,
    });
    const payload = await fetchJson(
      `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
      {
        headers: { 'User-Agent': USER_AGENT },
        timeoutMs: UPSTREAM_TIMEOUT_MS,
        maxBytes: UPSTREAM_MAX_BYTES,
        redirect: 'error',
      },
    );
    const articles = normalizeRegionalArticles(payload, UPSTREAM_FETCH_LIMIT);
    entry.byAsset = matchArticlesToAssets(articles, entry.group, seenAt);
    entry.fetchedAt = seenAt;
    entry.fetchedAtMs = at;
  }

  /**
   * Kick at most one due group, fire-and-forget: the request that triggered
   * it is answered from cache at once and a later poll reads the result.
   */
  function maybeRefresh() {
    const at = now();
    if (at - _lastUpstreamAt < NEWS_ASSETS_SPACING_MS) return;
    const due = groups()
      .filter(
        (entry) =>
          entry.query &&
          !entry.inFlight &&
          at - entry.fetchedAtMs > NEWS_ASSETS_CACHE_MS &&
          at - entry.lastAttemptMs > NEWS_ASSETS_RETRY_MS,
      )
      .sort((a, b) => a.fetchedAtMs - b.fetchedAtMs)[0];
    if (!due) return;
    _lastUpstreamAt = at;
    due.lastAttemptMs = at;
    due.inFlight = refreshGroup(due)
      .catch((error) => {
        // The stale copy stays served; the group retries after the backoff.
        console.warn(
          `[NewsAssets] ${due.group.id} refresh failed:`,
          error?.message || error,
        );
      })
      .finally(() => {
        due.inFlight = null;
      });
  }

  function install(middlewares) {
    middlewares.use(NEWS_ASSETS_ROUTE, (req, res) => {
      if (req.method !== 'GET')
        return reply(res, 405, { error: 'Method Not Allowed' });
      if (!_rateLimiter(clientKey(req)))
        return reply(
          res,
          429,
          { error: 'Rate limit exceeded' },
          { 'Retry-After': '10' },
        );
      maybeRefresh();
      const payload = mergeGroupCaches(groups(), now());
      payload.notice = NEWS_NOTICE;
      reply(res, 200, payload, {
        'Cache-Control': 'public, max-age=60',
        'X-News-Assets': payload.status === 'ready' ? 'READY' : 'WARMING',
      });
    });
  }

  return {
    name: 'news-assets-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
