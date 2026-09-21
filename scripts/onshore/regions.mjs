/**
 * The onshore regions (docs/COMMODITIES-PLAN.md §14.5): one layer, one bundle
 * and one ladder each. A region names the state readers that feed it and the
 * EIA state series it reconciles against. Regions are added here as their
 * ladders start; the layer ids and tokens are registered in
 * `src/data/layerState.js` at the same time.
 */

import { northDakotaReader } from './nd.mjs';

export const REGIONS = Object.freeze({
  williston: Object.freeze({
    id: 'williston',
    layerId: 'production-williston',
    name: 'Williston Basin',
    basins: ['Bakken', 'Three Forks'],
    /** The first slice is North Dakota; Montana joins as its own reader. */
    states: ['ND'],
    readers: [northDakotaReader],
    /** EIA state series reconciled on the panel line and in every dossier (G1). */
    reconcile: ['ND'],
    /** Where the global-tier mark sits and where a fly-to lands. */
    center: { lat: 47.85, lon: -103.1 },
    /** Region bundle paths. */
    bundleDir: 'src/data/local_data/onshore/williston',
    shardDir: 'public/data/onshore/williston/history',
  }),
});

export function regionById(id) {
  const region = REGIONS[String(id ?? '').toLowerCase()];
  if (!region) {
    throw new Error(
      `unknown region "${id}" — known: ${Object.keys(REGIONS).join(', ')}`,
    );
  }
  return region;
}
