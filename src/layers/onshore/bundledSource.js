import { normaliseOnshoreDataset } from './records.js';

/**
 * The bundled region snapshots. Static assets under
 * `src/data/local_data/onshore/<region>/` with their own README and source
 * notes; Vite rewrites the URLs for production base paths, which is why each
 * region's files are named here as literals rather than built from the id.
 * Read once per layer lifetime and cached, so repeated update ticks cost
 * nothing. Refresh is a rebuild (`npm run build:onshore -- --region <id>`),
 * never a runtime fetch of a state regulator.
 */
const BUNDLES = Object.freeze({
  williston: Object.freeze({
    index: new URL(
      '../../data/local_data/onshore/williston/index.json',
      import.meta.url,
    ).href,
    clusters: new URL(
      '../../data/local_data/onshore/williston/clusters.json',
      import.meta.url,
    ).href,
  }),
});

export const ONSHORE_REGION_IDS = Object.freeze(Object.keys(BUNDLES));

export function onshoreBundleUrls(regionId) {
  const urls = BUNDLES[regionId];
  if (!urls) throw new Error(`no onshore bundle for region "${regionId}"`);
  return urls;
}

export function createBundledOnshoreSource({
  region,
  fetchImpl = (...args) => globalThis.fetch(...args),
  urls = onshoreBundleUrls(region),
  now = () => Date.now(),
} = {}) {
  if (!region) throw new TypeError('onshore source requires a region id');
  let _snapshot = null;

  async function readJson(url, signal, what) {
    const response = await fetchImpl(url, { signal });
    if (!response.ok)
      throw new Error(`Onshore ${what} HTTP ${response.status}`);
    return response.json();
  }

  return {
    label: 'state filings',
    region,
    freshnessClass: 'published',
    async getSnapshot({ signal } = {}) {
      if (_snapshot) return _snapshot;
      signal?.throwIfAborted();
      const [index, clusters] = await Promise.all([
        readJson(urls.index, signal, 'index'),
        readJson(urls.clusters, signal, 'clusters'),
      ]);
      signal?.throwIfAborted();
      const snapshot = normaliseOnshoreDataset(index, {
        clusters,
        fetchedAt: now(),
      });
      if (!snapshot) throw new Error('Malformed onshore dataset');
      if (snapshot.regionId !== region)
        throw new Error(
          `Onshore bundle is for ${snapshot.regionId}, expected ${region}`,
        );
      _snapshot = snapshot;
      return snapshot;
    },
  };
}
