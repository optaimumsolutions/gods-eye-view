# Gulf of Mexico platform production (BSEE)

Bundled facility-level production for the `production-gulf-platforms` layer
(row 11). Static asset, rebuilt by `npm run build:gulf-platforms`; nothing is
fetched at runtime. Every figure is monthly production as filed with BSEE per
platform structure, stamped with the month it describes and the day the file
was retrieved.

- Sources: `ProdByPlatformRawData.zip` (production by platform, one row per
  structure per month since 1957) and `PlatStrucRawData.zip` (structures
  with coordinates; incidents of non-compliance), both from
  https://www.data.bsee.gov — Bureau of Safety and Environmental
  Enforcement, US Department of the Interior.
- License: US Government public domain.
- Retrieved: 2026-09-21. Manifest with sha256 and byte counts in
  `source.json`.
- **Current month = newest complete month.** Operators file late, so the
  newest months hold a fraction of the structures that will report. A month
  counts as complete when its reporter count is at least 90 % of the median
  over the 12 preceding months, and that median is itself at least
  50 % of the median over the 12 months before
  those (so a bad season does not freeze the bar and a dead tail cannot lower
  it). This build:
  **2026-06** is current (348 reporters at the median); still filling: 2026-08 2 (1 %), 2026-07 163 (47 %).

## `platforms.json` — 1,315 installed structures

- 1,315 structures carry no removal date; 1,315 of them have coordinates and are bundled (0 have none and are counted only). 6,184 structures appear in the production file overall; removed ones are not bundled.
- 317 bundled structures produced gas in 2026-06, 2.03 Bcf/d of the 2.03 Bcf/d the Gulf filed that month from 318 structures. Gulf gas not on the map: 0 structures since removed (0.00 Bcf/d), 0 without coordinates (0.00), 1 absent from the structures file (0.00). 997 bundled structures carry a series.
- The production file also carries BSEE's other regions, which the Gulf structures file cannot place and this layer does not draw: Alaska 1 structure at 0.55 Bcf/d; Pacific 12 structures at 0.03 Bcf/d (gross gas as filed, which for Alaska's Northstar includes gas reinjected).
- Per structure: identity (complex, structure, area/block, lease, field, operator, type, major flag, water depth, install date, datum year, incidents count), a trailing 120-month series of gas Mcf/d, oil bbl/d, water bbl/d and producing wells (null where no row was filed), and a lifetime summary (first and last producing month, months producing, peak gas and oil with their months, cumulative gas Mcf and oil bbl from daily rates × days in month).
- BOE is BSEE's own figure as filed (`BOEPD`), not derived: their rounding is not reproducible from the totals (17,785 bbl/d + 167,392 Mcf/d files as 47,571 BOE/d, where 5.62 Mcf per barrel gives 47,570). The 5.62 convention is used only where a month's BOE is blank.
- Coordinates are used as published; `nad` records the datum year and is shown, not converted.
- Depth: nothing is hand-curated and nothing is enriched from a second source.

Refresh: `npm run build:gulf-platforms` (`--refresh` re-downloads both
zips; `--replay` never touches the network; `--check` diffs against the
committed bytes). The raw zips are archived under `.gev-cache/bsee/`
(git-ignored). Column names are asserted on every build, so a renamed
upstream column fails by name.

Upstream byte counts this build: production text 218,165,545 bytes (1,695,490 rows), structures 1,517,546 bytes (7,091 rows).
