/**
 * Pure wire plumbing for the news layer (docs/COMMODITIES-PLAN.md §4 row 5):
 * GDELT query construction, upstream pacing groups, title-to-asset matching
 * and the per-asset selection the proxy serves. No fetch, no Cesium, no
 * browser globals — the server proxy and the tests import this directly.
 */
export const NEWS_WINDOW_DAYS = 3;
export const NEWS_MAX_ITEMS = 6;
export const NEWS_VERIFICATION = 'UNVERIFIED WIRE';
export const NEWS_NOTICE =
  'UNVERIFIED WIRE: headlines are quoted as published by their source and are not verified.';
/** GDELT phrases per upstream query; more phrases risk truncated matching. */
export const NEWS_GROUP_PHRASE_LIMIT = 14;
/** Aliases per asset inside a query; matching still uses every alias. */
export const NEWS_QUERY_ALIAS_LIMIT = 3;

function cleanAlias(alias) {
  return String(alias || '')
    .replace(/["\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The alias list an asset is queried and matched by: keywords, seed aliases, name. */
export function assetAliases(asset, seedAliases = null) {
  const aliases = [
    ...(Array.isArray(asset?.keywords) ? asset.keywords : []),
    ...(Array.isArray(seedAliases) ? seedAliases : []),
  ];
  if (!aliases.length && asset?.name) aliases.push(asset.name);
  return [...new Set(aliases.map(cleanAlias).filter(Boolean))];
}

/**
 * Chunk the gazetteer into upstream query groups of at most `phraseLimit`
 * quoted phrases, in gazetteer order. One group is one GDELT DOC query, so
 * the group count bounds upstream traffic: with the 15-minute cache and the
 * one-query-per-minute ceiling the whole wire refreshes in about one minute
 * per group.
 */
export function buildNewsGroups(
  assets,
  aliasesByAssetId = new Map(),
  phraseLimit = NEWS_GROUP_PHRASE_LIMIT,
) {
  const groups = [];
  let current = null;
  for (const asset of assets) {
    const aliases = assetAliases(asset, aliasesByAssetId.get(asset.id));
    if (!aliases.length) continue;
    const queryAliases = aliases.slice(0, NEWS_QUERY_ALIAS_LIMIT);
    if (!current || current.phrases + queryAliases.length > phraseLimit) {
      current = { id: `group${groups.length + 1}`, phrases: 0, assets: [] };
      groups.push(current);
    }
    current.phrases += queryAliases.length;
    current.assets.push({ id: asset.id, aliases, queryAliases });
  }
  return groups.map((group) =>
    Object.freeze({
      id: group.id,
      assets: group.assets.map((asset) => Object.freeze(asset)),
    }),
  );
}

/** One GDELT DOC query string for a group: every query alias quoted, joined by OR. */
export function buildGroupQuery(group) {
  const phrases = [
    ...new Set(
      group.assets.flatMap((asset) =>
        asset.queryAliases.map((alias) => `"${alias}"`),
      ),
    ),
  ];
  if (!phrases.length) return null;
  return phrases.length > 1 ? `(${phrases.join(' OR ')})` : phrases[0];
}

/** True when the headline names the asset by one of its aliases (case- and whitespace-insensitive). */
export function titleMatchesAsset(title, aliases) {
  const haystack = String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return (aliases || []).some((alias) => {
    const needle = cleanAlias(alias).toLowerCase();
    return needle && haystack.includes(needle);
  });
}

/**
 * Pin a group's articles to the assets they name. A headline that names two
 * assets pins to both; one that names none is not drawn (row 5 rule). Each
 * kept item is stamped as unverified wire copy.
 */
export function matchArticlesToAssets(
  articles,
  group,
  seenAt,
  limit = NEWS_MAX_ITEMS,
) {
  const byAsset = new Map();
  for (const asset of group.assets) {
    const matched = (Array.isArray(articles) ? articles : [])
      .filter((article) => titleMatchesAsset(article?.title, asset.aliases))
      .slice(0, limit)
      .map((article) => ({
        title: String(article.title || '').slice(0, 180),
        url: String(article.url || ''),
        domain: String(article.domain || ''),
        publishedAt: article.publishedAt ?? null,
        seenAt,
        verification: NEWS_VERIFICATION,
      }));
    if (matched.length) byAsset.set(asset.id, matched);
  }
  return byAsset;
}

/** Merge per-group caches into the one payload the route serves. */
export function mergeGroupCaches(groupCaches, now) {
  const assets = [];
  let retrievedAt = null;
  let fetched = 0;
  for (const cache of groupCaches) {
    if (!cache?.fetchedAt) continue;
    fetched += 1;
    if (!retrievedAt || cache.fetchedAt > retrievedAt)
      retrievedAt = cache.fetchedAt;
    for (const [id, articles] of cache.byAsset) {
      const latest = articles.reduce(
        (newest, article) =>
          article.publishedAt && (!newest || article.publishedAt > newest)
            ? article.publishedAt
            : newest,
        null,
      );
      assets.push({
        id,
        count: articles.length,
        latestAt: latest ?? cache.fetchedAt,
        articles,
      });
    }
  }
  return {
    status: fetched === groupCaches.length ? 'ready' : 'warming',
    retrievedAt: retrievedAt ?? new Date(now).toISOString(),
    windowDays: NEWS_WINDOW_DAYS,
    source: 'GDELT DOC',
    notice: NEWS_NOTICE,
    assets,
  };
}
