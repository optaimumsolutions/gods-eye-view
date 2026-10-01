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
  It is drawn from `manual/gulf-run-route.geojson`, a hand trace from the
  public FERC filings (D17.3), marked `manual_ferc_trace` with its stated
  accuracy. Until that file exists the pipeline is `missing` and nothing is
  drawn.
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
- **LNG anchors:** from the row 10 bundle (`lng/terminals.json`, Global
  Energy Monitor, CC BY 4.0).
