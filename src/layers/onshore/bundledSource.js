import { normaliseOnshoreDataset } from './records.js';
import { APPALACHIA_BUNDLE } from './appalachiaBundle.js';

/**
 * Row 14 contributors files: operators, counties and volumes, no
 * coordinates. They ship even where a region's well layer is withheld, so
 * the US supply board and the store keep the region's figures.
 */
export const ONSHORE_CONTRIBUTORS = Object.freeze({
  williston: new URL(
    '../../data/local_data/onshore/williston/contributors.json',
    import.meta.url,
  ).href,
  appalachia: new URL(
    '../../data/local_data/onshore/appalachia/contributors.json',
    import.meta.url,
  ).href,
  'permian-delaware': new URL(
    '../../data/local_data/onshore/permian-delaware/contributors.json',
    import.meta.url,
  ).href,
  'permian-midland': new URL(
    '../../data/local_data/onshore/permian-midland/contributors.json',
    import.meta.url,
  ).href,
  'permian-platform': new URL(
    '../../data/local_data/onshore/permian-platform/contributors.json',
    import.meta.url,
  ).href,
});

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
    contributors: ONSHORE_CONTRIBUTORS.williston,
  }),
  // Row 14 M3: absent from the hosted build until DEP confirms the coordinates.
  ...(APPALACHIA_BUNDLE
    ? {
        appalachia: Object.freeze({
          ...APPALACHIA_BUNDLE,
          contributors: ONSHORE_CONTRIBUTORS.appalachia,
        }),
      }
    : {}),
  // Row 14 M3, region 3: the Permian's Texas side in three layers (RRC; shown
  // on the hosted site by the founder's 2026-09-28 decision, docs/LICENCES.md).
  'permian-delaware': Object.freeze({
    index: new URL(
      '../../data/local_data/onshore/permian-delaware/index.json',
      import.meta.url,
    ).href,
    clusters: new URL(
      '../../data/local_data/onshore/permian-delaware/clusters.json',
      import.meta.url,
    ).href,
    contributors: ONSHORE_CONTRIBUTORS['permian-delaware'],
  }),
  'permian-midland': Object.freeze({
    index: new URL(
      '../../data/local_data/onshore/permian-midland/index.json',
      import.meta.url,
    ).href,
    clusters: new URL(
      '../../data/local_data/onshore/permian-midland/clusters.json',
      import.meta.url,
    ).href,
    contributors: ONSHORE_CONTRIBUTORS['permian-midland'],
  }),
  'permian-platform': Object.freeze({
    index: new URL(
      '../../data/local_data/onshore/permian-platform/index.json',
      import.meta.url,
    ).href,
    clusters: new URL(
      '../../data/local_data/onshore/permian-platform/clusters.json',
      import.meta.url,
    ).href,
    contributors: ONSHORE_CONTRIBUTORS['permian-platform'],
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
      const [index, clusters, contributors] = await Promise.all([
        readJson(urls.index, signal, 'index'),
        readJson(urls.clusters, signal, 'clusters'),
        // Row 14 contributors are optional: without them the card keeps
        // its totals and the region mark flies in instead.
        urls.contributors
          ? readJson(urls.contributors, signal, 'contributors').catch(
              (error) => {
                if (signal?.aborted) throw error;
                return null;
              },
            )
          : null,
      ]);
      signal?.throwIfAborted();
      const snapshot = normaliseOnshoreDataset(index, {
        clusters,
        contributors,
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
