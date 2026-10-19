import { NEWS_GAZETTEER } from './gazetteer.js';
import { buildNewsSnapshot, normalizeNewsPayload } from './records.js';

/** The proxy route (server/providers/newsAssets.js); same origin, no key. */
export const NEWS_ASSETS_ROUTE = '/api/news-assets';

/**
 * Read the matched-headline snapshot from the local proxy and join it onto
 * the pinned gazetteer. The proxy owns every upstream concern (GDELT pacing,
 * the 15-minute cache, sanitized errors); the browser only ever asks its own
 * origin, so the layer works identically on the laptop and the hosted site.
 */
export function createNewsAssetsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  points = NEWS_GAZETTEER,
} = {}) {
  return {
    label: 'GDELT DOC',
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(NEWS_ASSETS_ROUTE, { signal });
      if (!response.ok) throw new Error(`News assets HTTP ${response.status}`);
      const payload = normalizeNewsPayload(await response.json());
      signal?.throwIfAborted();
      if (!payload) throw new Error('Malformed news assets payload');
      return buildNewsSnapshot(payload, points);
    },
  };
}
