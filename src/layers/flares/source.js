import {
  buildFlaresSnapshot,
  normalizeFlaresPayload,
  normalizeSitesBundle,
} from './records.js';

/** The proxy route (server/providers/flares.js); same origin, no key. */
export const FLARES_ROUTE = '/api/flares';
export const FLARES_REGION = 'williston';

/**
 * The bundled site gazetteers (FR-F1). Static assets with their own README
 * and source notes; Vite rewrites the URLs for production base paths, which
 * is why each region's file is named here as a literal.
 */
const SITES_URLS = Object.freeze({
  williston: new URL(
    '../../data/local_data/flares/williston/sites.json',
    import.meta.url,
  ).href,
});

/**
 * Read the nightly flare readings from the local proxy and join them onto
 * the bundled site gazetteer. The proxy owns every upstream concern (FIRMS
 * pacing, the rolling night store, sealed summaries, sky cover); the browser
 * only ever asks its own origin, so the layer works identically on the
 * laptop and the hosted site. The gazetteer never changes at runtime: read
 * once per source lifetime and cached.
 */
export function createFlaresSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  region = FLARES_REGION,
  sitesUrl = SITES_URLS[region],
} = {}) {
  if (!sitesUrl) throw new TypeError(`No flare-site bundle for ${region}`);
  let _bundle = null;
  async function readBundle(signal) {
    if (_bundle) return _bundle;
    const response = await fetchImpl(sitesUrl, { signal });
    if (!response.ok) throw new Error(`Flare sites HTTP ${response.status}`);
    const bundle = normalizeSitesBundle(await response.json());
    if (!bundle) throw new Error('Malformed flare-site bundle');
    _bundle = bundle;
    return bundle;
  }
  return {
    label: 'NASA FIRMS VIIRS NRT',
    region,
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const [bundle, response] = await Promise.all([
        readBundle(signal),
        fetchImpl(`${FLARES_ROUTE}?region=${encodeURIComponent(region)}`, {
          signal,
        }),
      ]);
      if (!response.ok) throw new Error(`Flares HTTP ${response.status}`);
      const payload = normalizeFlaresPayload(await response.json());
      signal?.throwIfAborted();
      if (!payload) throw new Error('Malformed flares payload');
      return buildFlaresSnapshot(payload, bundle);
    },
  };
}
