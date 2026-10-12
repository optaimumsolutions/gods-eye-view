import fs from 'node:fs';
import path from 'node:path';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { coalesceProxyRequest } from './common/http.js';
import { fetchRegionalJson, fetchRegionalText } from './regional/http.js';
import { normalizeRegionalArticles } from '../../src/data/regionalModel.js';

/**
 * Headlines for one commodity port (docs/COMMODITIES-PLAN.md §9.6.3).
 *
 *   GET /api/port-news?portid=port1201
 *
 * The aliases come from the committed seed, never from the client, so the
 * route can only ask upstream about a port that has a dossier. Google News
 * RSS is asked first, GDELT DOC second, both over the seven-day window; only
 * items whose title contains one of the port's aliases are kept, at most ten.
 * Every item is marked UNVERIFIED WIRE: a headline is quoted as published
 * and nothing about it is checked. One upstream query per port per cache
 * window; a failed refresh serves the stale copy for an hour; errors reach
 * the client as fixed strings, never upstream text.
 */
export const PORT_NEWS_ROUTE = '/api/port-news';
export const PORT_NEWS_CACHE_MS = 15 * 60_000;
export const PORT_NEWS_STALE_MS = 60 * 60_000;
export const PORT_NEWS_WINDOW_DAYS = 7;
export const PORT_NEWS_MAX_ITEMS = 10;
export const PORT_NEWS_VERIFICATION = 'UNVERIFIED WIRE';
export const PORT_NEWS_NOTICE =
  'UNVERIFIED WIRE: headlines are quoted as published by their source and are not verified.';
const SEED_FILE = 'config/port_dossiers.seed.json';
const UPSTREAM_TIMEOUT_MS = 12_000;
const UPSTREAM_MAX_BYTES = 1_500_000;
const UPSTREAM_FETCH_LIMIT = 40;
const PORTID_RE = /^port[0-9]+$/;
const USER_AGENT = 'GodsEyeView/0.1';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function cleanAlias(alias) {
  return String(alias || '')
    .replace(/["\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The two upstream query strings for a port's aliases: every alias quoted, joined by OR. */
export function buildPortNewsQuery(aliases) {
  const phrases = [
    ...new Set((aliases || []).map(cleanAlias).filter(Boolean)),
  ].map((alias) => `"${alias}"`);
  if (!phrases.length) return null;
  const group = phrases.join(' OR ');
  return {
    rss: `${phrases.length > 1 ? `(${group})` : group} when:${PORT_NEWS_WINDOW_DAYS}d`,
    gdelt: phrases.length > 1 ? `(${group})` : group,
  };
}

/** True when the headline names the port by one of its aliases (case- and whitespace-insensitive). */
export function titleMatchesAlias(title, aliases) {
  const haystack = String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return (aliases || []).some((alias) => {
    const needle = cleanAlias(alias).toLowerCase();
    return needle && haystack.includes(needle);
  });
}

function decodeRssText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rssTag(block, tag) {
  return decodeRssText(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(
      block,
    )?.[1] || '',
  );
}

/** Parse Google News RSS items into the shared article shape; duplicates by title and source collapse. */
export function parseGoogleNewsRss(xml, limit = UPSTREAM_FETCH_LIMIT) {
  const seen = new Set();
  const articles = [];
  for (const match of String(xml || '').matchAll(
    /<item>([\s\S]*?)<\/item>/gi,
  )) {
    const item = match[1];
    const title = rssTag(item, 'title').slice(0, 180);
    let parsedUrl;
    try {
      parsedUrl = new URL(rssTag(item, 'link'));
    } catch {
      continue;
    }
    if (!title || !['http:', 'https:'].includes(parsedUrl.protocol)) continue;
    const source = rssTag(item, 'source');
    const signature = `${title.toLowerCase()}|${source.toLowerCase() || parsedUrl.hostname}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const rawDate = rssTag(item, 'pubDate');
    articles.push({
      title,
      url: parsedUrl.href,
      domain: source || parsedUrl.hostname.replace(/^www\./, ''),
      publishedAt: Number.isNaN(Date.parse(rawDate))
        ? null
        : new Date(rawDate).toISOString(),
      sourceCountry: null,
    });
    if (articles.length >= limit) break;
  }
  return articles;
}

/** Keep only headlines that name the port, cap the list, and stamp each item as unverified wire copy. */
export function selectPortHeadlines(
  articles,
  aliases,
  seenAt,
  limit = PORT_NEWS_MAX_ITEMS,
) {
  return articles
    .filter((article) => titleMatchesAlias(article.title, aliases))
    .slice(0, limit)
    .map((article) => ({
      ...article,
      seenAt,
      verification: PORT_NEWS_VERIFICATION,
    }));
}

function readSeedPorts(sourceRoot) {
  const resolved = path.resolve(sourceRoot, SEED_FILE);
  const ports = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    for (const entry of Array.isArray(parsed) ? parsed : []) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !PORTID_RE.test(String(entry.portid))
      )
        continue;
      const aliases = Array.isArray(entry.aliases)
        ? entry.aliases.map(cleanAlias).filter(Boolean)
        : [];
      if (!aliases.length) continue;
      ports.set(entry.portid, {
        portid: entry.portid,
        slug: String(entry.slug || ''),
        aliases,
      });
    }
  } catch (error) {
    console.warn('[PortNews] seed unavailable:', error?.message || error);
  }
  return ports;
}

function reply(res, status, payload, extra = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...extra });
  res.end(JSON.stringify(payload));
}

/**
 * Vite plugin: the port headline proxy. `fetchText` and `fetchJson` default to
 * the bounded regional readers (timeout covers the body, size capped); a test
 * hands in stubs.
 */
export function portNewsProxy({
  sourceRoot = process.cwd(),
  fetchText = fetchRegionalText,
  fetchJson = fetchRegionalJson,
  now = () => Date.now(),
} = {}) {
  let _ports = null;
  const _cache = new Map();
  const _inFlight = new Map();
  const _rateLimiter = makeRateLimiter({
    windowMs: 60_000,
    max: 30,
    globalMax: 90,
  });

  function ports() {
    if (!_ports) _ports = readSeedPorts(sourceRoot);
    return _ports;
  }

  async function refresh(port) {
    const query = buildPortNewsQuery(port.aliases);
    const seenAt = new Date(now()).toISOString();
    let articles = [];
    let source = null;
    let failures = 0;
    try {
      const rssParams = new URLSearchParams({
        q: query.rss,
        hl: 'en-US',
        gl: 'US',
        ceid: 'US:en',
      });
      const xml = await fetchText(
        `https://news.google.com/rss/search?${rssParams}`,
        {
          headers: { 'User-Agent': USER_AGENT },
          timeoutMs: UPSTREAM_TIMEOUT_MS,
          maxBytes: UPSTREAM_MAX_BYTES,
        },
      );
      articles = selectPortHeadlines(
        parseGoogleNewsRss(xml),
        port.aliases,
        seenAt,
      );
      source = 'Google News RSS';
    } catch {
      failures += 1;
    }
    if (!articles.length) {
      try {
        const params = new URLSearchParams({
          query: query.gdelt,
          mode: 'artlist',
          format: 'json',
          maxrecords: String(UPSTREAM_FETCH_LIMIT),
          sort: 'datedesc',
          timespan: `${PORT_NEWS_WINDOW_DAYS}d`,
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
        const candidates = normalizeRegionalArticles(
          payload,
          UPSTREAM_FETCH_LIMIT,
        );
        const kept = selectPortHeadlines(candidates, port.aliases, seenAt);
        if (kept.length || !source) {
          articles = kept;
          source = 'GDELT DOC';
        }
      } catch {
        failures += 1;
      }
    }
    if (failures === 2) throw new Error('both upstream sources failed');
    const payload = {
      status: articles.length ? 'ready' : 'empty',
      portid: port.portid,
      query: { aliases: port.aliases, windowDays: PORT_NEWS_WINDOW_DAYS },
      source,
      retrievedAt: seenAt,
      notice: PORT_NEWS_NOTICE,
      articles,
    };
    _cache.set(port.portid, { payload, cachedAt: now() });
    return payload;
  }

  function install(middlewares) {
    middlewares.use(PORT_NEWS_ROUTE, async (req, res) => {
      if (req.method !== 'GET')
        return reply(res, 405, { error: 'Method Not Allowed' });
      if (!_rateLimiter(clientKey(req)))
        return reply(
          res,
          429,
          { error: 'Rate limit exceeded' },
          { 'Retry-After': '10' },
        );
      const url = new URL(req.url || '', 'http://localhost');
      const portid = String(url.searchParams.get('portid') || '').trim();
      if (!PORTID_RE.test(portid))
        return reply(res, 400, { error: 'A PortWatch portid is required' });
      const port = ports().get(portid);
      if (!port) return reply(res, 404, { error: 'No dossier for that port' });
      const at = now();
      const cached = _cache.get(portid);
      if (cached && at - cached.cachedAt <= PORT_NEWS_CACHE_MS) {
        return reply(
          res,
          200,
          {
            ...cached.payload,
            status: cached.payload.articles.length ? 'cached' : 'empty',
          },
          { 'Cache-Control': 'public, max-age=60', 'X-Port-News': 'HIT' },
        );
      }
      const request = coalesceProxyRequest(_inFlight, portid, () =>
        refresh(port),
      );
      try {
        const payload = await request.promise;
        reply(res, 200, payload, {
          'Cache-Control': 'public, max-age=60',
          'X-Port-News': request.shared ? 'INFLIGHT' : 'MISS',
        });
      } catch {
        if (cached && at - cached.cachedAt <= PORT_NEWS_STALE_MS) {
          return reply(
            res,
            200,
            { ...cached.payload, status: 'stale' },
            { 'X-Port-News': 'STALE' },
          );
        }
        reply(res, 503, {
          error: 'Port headlines are temporarily unavailable',
        });
      }
    });
  }

  return {
    name: 'port-news-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
