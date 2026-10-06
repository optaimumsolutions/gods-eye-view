# Gas pipeline overlay: static geometry

Bundled geometry for row 17, the gas pipeline overlay
(`docs/COMMODITIES-PLAN.md` §19). These files say only **where** the pipelines,
compressor stations and LNG anchors are. Every number the overlay colors or
sizes by (scheduled versus design capacity, per posted point, per gas day)
comes from the oracle's daily postings at runtime (FR-N18). So the row 4
vintage gate holds: the January 2020 linework contributes geometry only.

Rebuild with `npm run build:gas-overlay`. Upstream responses are archived to
`.gev-cache/gas-overlay-raw/`; `--replay <dir>` rebuilds from an archive.

## `lines.json`

- **Gulf South:** taken from the row 4 bundle (`eia_energy/gas-network.json`,
  EIA, January 2020), never refetched. Parts are clustered at 50 km; the
  largest cluster (575 parts, 9,727 km, Texas to the Florida panhandle) is
  drawn. Six small clusters (five offshore Gulf of Mexico pieces and one
  13 km piece in Colorado County, TX) are listed under `excluded` with
  their bounding boxes.
- **Gulf Run:** no public linework exists (it entered service in late 2022).
  It is drawn from `manual/gulf-run-route.geojson`, a hand trace from public
  FERC filings (D17.3, traced 2026-10-01), with per-vertex provenance in
  `manual/gulf-run-vertices.csv` (milepost, anchor, document and page). Three
  pieces, each with its own accuracy in `traced`:
  - **Mainline** (Westdale compressor station to the Golden Pass Pipeline
    meter near Starks, 134 certificated miles), ~0.5 km. Chained from the
    1:24,000 USGS topo route maps in Resource Report 1 (CP20-70, accession
    20200228-5231). Anchored on EPA FRS Westdale. Five parish-line crossings
    fall within 0.25 mi of the filed mileposts.
  - **Line CP** (Panola County, TX to Delhi, LA, 172 certificated miles; sold
    to Gulf Run under CP20-68), ~2.5 km. From the Final EA's Figure 1,
    georeferenced. This is why Gulf Run posts points in Texas and in
    Ouachita and Richland parishes.
  - **CP-3 west lateral** (Harrison County, TX), ~3 km. Ownership north of
    the CP-3 meter is uncertain.
  - Not used: the CP20-70 alignment sheets (stamped proprietary), the 2006
    Line CP maps (non-internet public), and OpenStreetMap (ODbL share-alike).
- Coordinates are emitted at 4 decimals (~11 m).

## `stations.json`

- **Compressor stations:** HIFLD's own service is gone. The stations come from
  the full re-host that survives
  (`services5.arcgis.com/HDRa0B57OVrv2E1q`, sources about 2015, public
  domain), filtered by `OPERATOR`. Each station is cross-checked against EPA
  GHGRP 2023 transmission compression facilities (W-NGTC, public domain).
  Facilities are tied to a pipeline by name, never by parent company, because
  Loews/Boardwalk also owns Texas Gas. A GHGRP facility that HIFLD lacks is
  added as `ghgrp_2023`.
- `lineKm` is each station's measured distance to its drawn line. The founder
  PRD asked for ≤ 1 km. The 2020 linework averages about 9 km between
  vertices on Gulf South, so its chords cut corners, and the flag is set at
  5 km (`offLine`). The median is about 1 km. Stations further than 5 km and
  HIFLD/GHGRP pairs more than 2 km apart are listed in `source.json` checks
  for a human to settle.
- **Gulf Run stations** (`manual/gulf-run-stations.geojson`, method
  `manual_ferc`): Westdale, Vernon and Panola, from EPA FRS, checked against
  the FERC EA figure. Alto is omitted because FRS gives it no coordinates.
- **LNG anchors (stations.json):** from the row 10 bundle (`lng/terminals.json`, Global
  Energy Monitor, CC BY 4.0).

## `points.csv` and `unresolved.csv`

One coordinate per physical posted point, keyed by the pipeline's own
location code (`loc`; FR-N15's Gulf South rows add `-R`/`-D`). Rebuild with
`npm run build:gas-overlay-points` after `build:gas-overlay`.

- Physical means a point in the capacity posting with a design capacity, and
  not a paper location: virtual transfers (`VIR`) and pooling points (`PPT`;
  236 of Gulf Run's 290 active rows) are dropped.
- No posting publishes coordinates. Points are placed by rules, and the first
  rule that hits wins. `method` and `confidence` say which rule:
  `station_match` 0.9, `lng_terminal` 0.9, `ghgrp_facility` 0.8,
  `interconnect` 0.7, `place_snap` 0.5, `snap_to_line` 0.4. `why` gives the
  evidence. Full rules are in the script header.
- **Human fixes.** Set `method` to `manual`, `confidence` to `1`, and start
  `why` with `manual <date>: ` followed by the reason. A rebuild never
  recomputes a manual row. Two are pinned today: the Freeport LNG feedgas
  delivery (Stratton Ridge, at the Pretreatment Facility, GHGRP 1013753) and
  Gulf Run's Golden Pass Pipeline delivery (the GPPL meter near Starks, the
  end of the FERC trace).
- **`unresolved.csv`** lists the points no rule could place, each with the
  reason, for a human to fill. Fill one by moving the row into `points.csv`
  as `manual`.
- **Snapshot.** The capacity and location postings are archived to
  `.gev-cache/gas-overlay-points-raw/`, together with the TIGER counties and
  places and GHGRP 2023 for each state touched. `--replay <dir>` rebuilds
  from that archive.

## Verification and open items

- **`manual/station-checks.csv`** records a human check per station:
  - Verdicts are `verified`, `moved` (with a new lon/lat) or `unverified`.
  - Each row carries its evidence. The build applies them, and a check
    naming an unknown station fails the build.
  - 2026-10-01: 15 stations checked against USGS orthoimagery (public
    domain, keyless, zoom 16 ≈ 2 m/px).
  - HIFLD sat on the station every time. Every GHGRP-only coordinate was an
    address geocode (crossroads, town centres, fields).
- **`open-items.csv`** is the register of everything not verified: points
  no rule could place, stations with only an address coordinate, missing
  linework, and external blockers.
  - Each row gives `id` (GO-nn), `status`, `kind`, `ref`, `issue`,
    `current`, `candidate` and `next_step`.
  - `/comm` prints its open rows at the start of every session.
  - `src/layers/gasOverlay/openItems.test.mjs` keeps it in step with the
    data. An unresolved point or unverified station without an open item
    fails, and so does an open item whose gap is already fixed.
  - To resolve an item, fix the data and set `status` to `resolved` in the
    same commit.
