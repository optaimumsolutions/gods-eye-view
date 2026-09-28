/**
 * Headless check for `production-appalachia` (row 14 M3, region 2 of plan
 * §14.10; Pennsylvania's unconventional wells) on the shared onshore harness,
 * with the row 14 contributors checks.
 *
 * Run against a FRESH dev server from the tree under test (the hosted build
 * withholds this layer until PA DEP confirms the coordinates):
 *   npx vite --port 4174 --strictPort --host 127.0.0.1
 *   node scripts/qa-onshore-appalachia.mjs --url http://127.0.0.1:4174
 * Visual proof saved to qa-shots/ (git-ignored).
 */

import { runOnshoreQa } from './onshore/qa-harness.mjs';

await runOnshoreQa({
  regionId: 'appalachia',
  layerId: 'production-appalachia',
  bundleDir: 'src/data/local_data/onshore/appalachia',
  views: {
    /** [lon, lat, height m] */
    global: [-78.0, 41.1, 14_000_000],
    regional: [-78.0, 41.1, 1_200_000],
    /** The harness centres the local view on the top well; only the height is read. */
    local: [-78.0, 41.1, 120_000],
  },
});
