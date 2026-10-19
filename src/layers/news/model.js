import * as Cesium from 'cesium';
import { formatAge } from '../commodities/observation.js';

export const NEWS_LAYER_ID = 'commodity-news';
export const NEWS_OVERLAY_SOURCE_ID = 'commodity-news';
export const NEWS_OVERLAY_COHORT_LIMIT = 16;
export const NEWS_OVERLAY_COLLISION_CAPACITY = 16;
export const NEWS_CARD_HEADLINES = 6;

/**
 * Count to accent: one headline is a note (blue), a cluster is flagged
 * (amber), a pile-on is a flare (red) — the layer-panel legend vocabulary,
 * reused loosely so the eye keeps one colour language.
 */
const COUNT_CSS = Object.freeze({
  one: '#39d5ff',
  cluster: '#ffb347',
  surge: '#ff3b5c',
});

export function badgeCss(count) {
  if (count >= 5) return COUNT_CSS.surge;
  if (count >= 2) return COUNT_CSS.cluster;
  return COUNT_CSS.one;
}

export function badgeColor(count) {
  return Cesium.Color.fromCssColorString(badgeCss(count));
}

/** Marker size grows with the count and stops: a pile-on must not swallow a port. */
export function badgePixelSize(count) {
  return 7 + Math.min(Math.max(count, 1), 8);
}

export function newsPosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
}

function seenAge(row, now = Date.now()) {
  const stamp = Date.parse(row.latestAt ?? '');
  if (!Number.isFinite(stamp)) return 'n/a';
  return formatAge(now - stamp);
}

/** Ambient badge: name and headline count, ranked so the busiest assets win collisions. */
export function createNewsOverlayEntry(row, position) {
  return {
    id: String(row.id),
    position,
    variant: 'label',
    title: `📰 ${row.name.toUpperCase()} · ${row.count}`,
    accent: badgeCss(row.count),
    priority: row.count * 100,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
  };
}

/** Selected detail card: the window's headlines with domain and age, stamped unverified. */
export function buildSelectedNewsCard(row, position, now = Date.now()) {
  const details = row.articles.slice(0, NEWS_CARD_HEADLINES).map((article) => {
    const published = Date.parse(article.publishedAt ?? '');
    const age = Number.isFinite(published)
      ? ` · ${formatAge(now - published)} ago`
      : '';
    return `“${article.title.slice(0, 90)}” — ${article.domain || 'unknown source'}${age}`;
  });
  details.push(
    `GDELT DOC · UNVERIFIED WIRE · ${row.windowDays ?? 3}d window · seen ${seenAge(row, now)} ago`,
  );
  return {
    id: `selected-news:${row.id}`,
    position,
    accent: badgeCss(row.count),
    title: `${row.name.toUpperCase()} · ${row.count} headline${row.count === 1 ? '' : 's'}`,
    details,
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the busiest assets, with stable identity as the tie-break. */
export function selectNewsOverlayCohort(
  entries,
  limit = NEWS_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries
    .slice()
    .sort(
      (a, b) =>
        b.priority - a.priority || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, cap);
}

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    group: String(row.group),
    lat: Number.isFinite(row.lat) ? row.lat : null,
    lon: Number.isFinite(row.lon) ? row.lon : null,
    headlineCount: row.count,
    latestAt: row.latestAt ?? null,
    headlines: row.articles.slice(0, 3).map((article) => ({
      title: article.title,
      domain: article.domain || null,
      url: article.url,
      publishedAt: article.publishedAt ?? null,
    })),
  };
}
