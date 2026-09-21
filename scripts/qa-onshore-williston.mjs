/**
 * Headless check for `production-williston` (row 12, region 1,
 * docs/COMMODITIES-PLAN.md §14.10 milestone 1) on the shared onshore harness.
 *
 * Run against a FRESH dev server from the tree under test — a long-lived
 * server fails the activation gate for reasons that have nothing to do with
 * the layer (see the project gotchas):
 *   npx vite --port 4174 --strictPort --host 127.0.0.1
 *   node scripts/qa-onshore-williston.mjs --url http://127.0.0.1:4174
 * Visual proof saved to qa-shots/ (git-ignored).
 */

import { runOnshoreQa } from './onshore/qa-harness.mjs';

await runOnshoreQa({
  regionId: 'williston',
  layerId: 'production-williston',
  bundleDir: 'src/data/local_data/onshore/williston',
  views: {
    /** [lon, lat, height m] */
    global: [-103.1, 47.85, 14_000_000],
    regional: [-103.1, 47.85, 1_200_000],
    /** The harness centres the local view on the top well; only the height is read. */
    local: [-103.1, 47.85, 120_000],
  },
});
