/**
 * The onshore regions (docs/COMMODITIES-PLAN.md §14.5): one layer, one bundle
 * and one ladder each. A region names the state readers that feed it and the
 * EIA state series it reconciles against. Regions are added here as their
 * ladders start; the layer ids and tokens are registered in
 * `src/data/layerState.js` at the same time.
 */

import { northDakotaReader } from './nd.mjs';
import { pennsylvaniaReader } from './pa.mjs';
import {
  delawareTexasReader,
  midlandTexasReader,
  platformTexasReader,
} from './tx.mjs';

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
  /**
   * Row 14 M3, region 2 (plan §16.4 D14.5): Pennsylvania's unconventional
   * wells first (Marcellus and Utica); Ohio and West Virginia join as their
   * readers land. `Appalachia` matches the Oil Oracle store's basin name.
   */
  appalachia: Object.freeze({
    id: 'appalachia',
    layerId: 'production-appalachia',
    name: 'Appalachian Basin',
    basins: ['Appalachia', 'Marcellus', 'Utica'],
    states: ['PA'],
    readers: [pennsylvaniaReader],
    reconcile: ['PA'],
    center: { lat: 41.1, lon: -78.0 },
    bundleDir: 'src/data/local_data/onshore/appalachia',
    shardDir: 'public/data/onshore/appalachia/history',
  }),
  /**
   * Row 14 M3, region 3 (founder, 2026-09-28: Haynesville waits on
   * Louisiana, so the Permian comes next): the Texas side, RRC districts 08,
   * 8A and 7C, in two layers by county (one layer of 76,000 leases broke the
   * G3/G4 budgets; founder's choice). New Mexico joins the Delaware Basin as
   * its own reader. A facility is an RRC lease (an oil lease or a gas well),
   * not a well (R12.1). `Permian` matches the Oil Oracle store's basin name.
   */
  'permian-delaware': Object.freeze({
    id: 'permian-delaware',
    layerId: 'production-permian-delaware',
    name: 'Delaware Basin (Permian)',
    basins: ['Permian', 'Delaware'],
    states: ['TX'],
    readers: [delawareTexasReader],
    reconcile: ['TX'],
    /** The EIA series is all of Texas; the region is a few of its counties. */
    reconcileScope:
      'the Delaware Basin counties of RRC district 08, part of Texas',
    facility: Object.freeze({ one: 'lease', many: 'leases' }),
    center: { lat: 31.55, lon: -103.55 },
    bundleDir: 'src/data/local_data/onshore/permian-delaware',
    shardDir: 'public/data/onshore/permian-delaware/history',
  }),
  'permian-midland': Object.freeze({
    id: 'permian-midland',
    layerId: 'production-permian-midland',
    name: 'Midland Basin (Permian)',
    basins: ['Permian', 'Midland'],
    states: ['TX'],
    readers: [midlandTexasReader],
    reconcile: ['TX'],
    reconcileScope:
      'the Midland Basin counties of RRC districts 08 and 7C, part of Texas',
    facility: Object.freeze({ one: 'lease', many: 'leases' }),
    center: { lat: 31.95, lon: -101.75 },
    bundleDir: 'src/data/local_data/onshore/permian-midland',
    shardDir: 'public/data/onshore/permian-midland/history',
  }),
  'permian-platform': Object.freeze({
    id: 'permian-platform',
    layerId: 'production-permian-platform',
    name: 'Central Platform & Shelves (Permian)',
    basins: ['Permian', 'Central Basin Platform', 'Val Verde'],
    states: ['TX'],
    readers: [platformTexasReader],
    reconcile: ['TX'],
    reconcileScope:
      'RRC districts 08, 8A and 7C less the Delaware and Midland Basin counties, part of Texas',
    facility: Object.freeze({ one: 'lease', many: 'leases' }),
    center: { lat: 32.3, lon: -102.6 },
    bundleDir: 'src/data/local_data/onshore/permian-platform',
    shardDir: 'public/data/onshore/permian-platform/history',
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
