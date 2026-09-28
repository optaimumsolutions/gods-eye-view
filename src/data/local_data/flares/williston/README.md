# Williston Basin flare sites

Bundled flare-site gazetteer for the `commodity-flares` layer (row 15, plan
§17). Derived from the row 12 onshore bundle `onshore-williston`
(retrieved 2026-09-27); rebuilt by
`npm run build:flares -- --region williston` (`--check` diffs against the
committed bytes). Needs the onshore history shards on disk.

- **Rule:** a pad (wells within 150 m, single linkage) with flared gas in any of the 12 months to 2026-07.
- **Current month:** 2026-07. Series: 2024-08 to 2026-07, flared Mcf per month per site.
- **Wells:** 24233 with coordinates, in 11089 pads (4523 with more than one well; the largest holds 30).
- **Sites:** 7493 pads, 19921 wells; 5593 flared in 2026-07.
- **Nothing dropped:** in each of the 12 lookback months the sites hold every Mcf the wells filed as flared (2026-07: 4679037 Mcf, 150.9 MMcf/d); the build fails otherwise.
- **Largest flare sites in 2026-07:** CHARLSON (PETRO-HUNT, L.L.C., 3156 Mcf/d); SKABO (Phoenix Operating LLC, 1364 Mcf/d); EAST TIOGA (PETRO-HUNT, L.L.C., 1225 Mcf/d); SKABO (Phoenix Operating LLC, 1218 Mcf/d); ANTELOPE CREEK (KRAKEN OPERATING, LLC, 1114 Mcf/d).

Per site: `id` (region + smallest well id), centroid, field and county (the
most common among its wells), `operators` (as filed for 2026-07, largest gas
first), `wells`, `flared` (24 months), `lastFlaredMonth`, `monthsFlared`
(of the last 12), `gas` and `oil` this month.
