/**
 * Headless check for `production-permian-platform` (row 14 M3, region 3 of
 * plan §14.10: the Permian's Texas side outside the Delaware and Midland
 * Basin counties — the Central Basin Platform, the shelves and Val Verde —
 * per RRC lease) on the shared onshore harness, with the row 14 contributors
 * checks.
 *
 * Run against a FRESH dev server from the tree under test:
 *   npx vite --port 4174 --strictPort --host 127.0.0.1
 *   node scripts/qa-onshore-permian-platform.mjs --url http://127.0.0.1:4174
 * Visual proof saved to qa-shots/ (git-ignored).
 */

import { runOnshoreQa } from './onshore/qa-harness.mjs';

await runOnshoreQa({
  regionId: 'permian-platform',
  layerId: 'production-permian-platform',
  bundleDir: 'src/data/local_data/onshore/permian-platform',
  views: {
    /** [lon, lat, height m] */
    global: [-102.6, 32.3, 14_000_000],
    regional: [-102.6, 32.3, 1_400_000],
    /** The harness centres the local view on the top lease; only the height is read. */
    local: [-102.6, 32.3, 120_000],
  },
});
