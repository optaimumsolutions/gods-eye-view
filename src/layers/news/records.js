/**
 * News asset records: pure payload validation and the gazetteer join.
 * The proxy serves matched headlines per asset id; this module joins them
 * onto the pinned gazetteer so a badge can never appear off an asset and an
 * unmatched headline is never drawn (docs/COMMODITIES-PLAN.md §4 row 5).
 */
import { NEWS_GAZETTEER } from './gazetteer.js';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

function isoStamp(value) {
  return typeof value === 'string' && ISO_RE.test(value) ? value : null;
}

/** Validate one article; a malformed item is dropped, never a thrown snapshot. */
function normalizeArticle(item) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  let url = null;
  try {
    const parsed = new URL(String(item.url || ''));
    if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.href;
  } catch {
    url = null;
  }
  if (!title || !url) return null;
  return {
    title,
    url,
    domain: String(item.domain || '').trim(),
    publishedAt: isoStamp(item.publishedAt),
    seenAt: isoStamp(item.seenAt),
    verification: String(item.verification || ''),
  };
}

/** Validate the proxy payload; null rejects the whole snapshot. */
export function normalizeNewsPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload.assets)) return null;
  const assets = new Map();
  for (const entry of payload.assets) {
    const id = String(entry?.id || '').trim();
    if (!id || assets.has(id)) continue;
    const articles = (Array.isArray(entry.articles) ? entry.articles : [])
      .map(normalizeArticle)
      .filter(Boolean);
    if (!articles.length) continue;
    assets.set(id, {
      id,
      count: articles.length,
      latestAt: isoStamp(entry.latestAt),
      articles,
    });
  }
  return {
    status: payload.status === 'ready' ? 'ready' : 'warming',
    retrievedAt: isoStamp(payload.retrievedAt),
    windowDays: Number.isFinite(payload.windowDays) ? payload.windowDays : null,
    notice: String(payload.notice || ''),
    assets,
  };
}

/**
 * Join the payload onto the gazetteer: one row per pinned asset, count 0
 * where the window holds no matched headline.
 * @returns {{rows: Array<object>, retrievedAt: string|null, status: string}}
 */
export function buildNewsSnapshot(payload, points = NEWS_GAZETTEER) {
  const rows = points.map((point) => {
    const matched = payload.assets.get(point.id);
    return {
      ...point,
      count: matched?.count ?? 0,
      latestAt: matched?.latestAt ?? null,
      articles: matched?.articles ?? [],
    };
  });
  return {
    rows,
    retrievedAt: payload.retrievedAt,
    status: payload.status,
    windowDays: payload.windowDays,
    notice: payload.notice,
  };
}
