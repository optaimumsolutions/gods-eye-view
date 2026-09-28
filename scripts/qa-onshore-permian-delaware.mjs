/**
 * Headless check for `production-permian-delaware` (row 14 M3, region 3 of
 * plan §14.10: the Permian's Texas side, Delaware Basin counties, per RRC
 * lease) on the shared onshore harness, with the row 14 contributors checks.
 *
 * Run against a FRESH dev server from the tree under test:
 *   npx vite --port 4174 --strictPort --host 127.0.0.1
 *   node scripts/qa-onshore-permian-delaware.mjs --url http://127.0.0.1:4174
 * Visual proof saved to qa-shots/ (git-ignored).
 */

import { runOnshoreQa } from './onshore/qa-harness.mjs';

await runOnshoreQa({
  regionId: 'permian-delaware',
  layerId: 'production-permian-delaware',
  bundleDir: 'src/data/local_data/onshore/permian-delaware',
  views: {
    /** [lon, lat, height m] */
    global: [-103.55, 31.55, 14_000_000],
    regional: [-103.55, 31.55, 900_000],
    /** The harness centres the local view on the top lease; only the height is read. */
    local: [-103.55, 31.55, 120_000],
  },
});
