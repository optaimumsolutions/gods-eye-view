# US gas transmission network and border crossings

Bundled geometry for the `commodity-gas-flows` layer (row 4). Static assets:
nothing here is fetched at runtime, and nothing here is current. Every number
that varies a pixel on this layer comes from EIA's monthly point-of-entry
filings, fetched server-side at runtime; these two files only say **where**.

- Sources: EIA public-domain transmission linework, republished as an ArcGIS
  hosted view at `services2.arcgis.com/FiaPA4ga0iQKduv3` (owner
  `Federal_User_Community`); NACEI layer 2 crossing points at
  `geoappext.nrcan.gc.ca` (Natural Resources Canada).
- License: US and Canadian government public-domain / open-licence data. Note
  that the ArcGIS item wraps an Esri Master License Agreement notice around
  EIA's public-domain data; the underlying shapefile is still at eia.gov.
- Retrieved: 2026-09-18. Vintages stamped per file in `source.json`.
- Vintage gate: both datasets are older than 24 months, so both contribute
  **geometry only**. Neither may carry a number, a capacity, a direction
  arrow, or drive any size or colour encoding. That is enforced by deleting
  the magnitudes at ingest rather than by remembering the rule — see
  `src/layers/gasFlows/coerce.js`.

## `gas-network.json` — 32,892 features, vintage JANUARY 2020

- Dissolved on `Operator | TYPEPIPE | Status` into
  **235 keys** across **230 upstream operator
  strings**, for draw count only — never for naming or ranking.
  **234 systems are actually emitted**, spanning
  229 operators: `Tallgrass Interstate Gas Transmission` (Interstate, 1 feature(s)) has no geometry left at this rounding and is dropped. The drop is also recorded in `counts.emptiedSystems`, because an operator
  disappearing from the map without a name is the failure this layer exists to
  prevent.
- 32,885 parts, 189,287 vertices,
  emitted at 4 decimals (~11 m) from a 5-decimal fetch.
  86 of 32,971 source parts collapsed below two
  distinct points at that rounding and were dropped.
- The service advertises `dataLastEditDate` 2025-07-01. That is a **re-upload
  stamp and it is false**; the data is the January 2020 shapefile
  `NaturalGas_Pipelines_US_202001`. The vintage is hard-coded and the
  service's own timestamps are read only to be recorded and rejected.
- Six fields exist and no others: `FID, TYPEPIPE, Operator, Status,
  Shape_Leng, Shape__Length`. No pipeline name, diameter, capacity, pressure,
  direction or in-service date. `Status` has exactly one value, "Operating",
  so nothing about change or new build can be drawn from it.
- `Operator` is a **company, not a pipeline**. Several strings name companies
  that have dissolved or been absorbed. It is never a map label.
- Feature density is a **digitizing artifact**: Iroquois carries 2,027
  features against Transcontinental's 1,118. `sourceFeatures` is recorded so a
  card can say so, never so anything can be sized or ranked by it.
- **A better source exists for the Gulf, and it is not bundled here.** BSEE
  publishes OCS pipelines at
  `services2.arcgis.com/FiaPA4ga0iQKduv3/.../Oil_And_Natural_Gas_Pipelines_Gulf_2024Q4`
  — **17,359 segments** with a real ten-value `STATUS_CODE`
  (`ACT, ABN, A/C, CNCL, COMB, OUT, PABN, PREM, PROP, REM`) where this layer's
  `Status` has one, plus `PROD_CODE` and `PPL_SIZE_CODE`. The authoritative
  flat file `data.bsee.gov/Pipeline/Files/pplmastdelimit.zip` carried
  `Last-Modified: 2026-09-17` when checked. It is **richer than this layer in
  every dimension except coverage, and still carries no volume** — so it would
  be a better PENCIL substrate offshore, not an INK one. Note the ArcGIS
  mirror's service name says `2024Q4` while its `editingInfo` claims a 2026
  edit date: bundle from `data.bsee.gov`, not from the mirror.
- **This view is not the whole shapefile.** It serves Interstate (17,996) and
  Intrastate (14,896) only, totalling 32,892. The EIA source shapefile holds
  **32,961** because it also carries **69 `Gathering` features**, which the view
  filters out — `TYPEPIPE='Gathering'` returns count 0 here. So the long-standing
  69-record discrepancy is a **dropped pipe class, not dropped geometry**, and
  this layer's "no gathering pipe" caveat is partly the republisher's doing and
  not only regulation.
- `Shape_Leng` and `Shape__Length` are **not** bundled. The first is decimal
  degrees and the second is Web-Mercator metres; neither is ground length, and
  summing the Mercator column overstates true geodesic mileage badly. Any
  mileage figure this layer ever shows must be computed geodesically or taken
  from PHMSA, never from these columns.
- Depth: geometry and four attributes. Nothing is hand-curated, and nothing
  is enriched from a second source.

## `gas-crossings.json` — 99 filings → 60 marks, vintage NACEI 2017

- The 99 filings resolve to **60 marks** by **mutual nearest
  cross-border neighbour** pairing within **1500 m**, because each government
  files the same crossing separately under a different name, with a different
  volume and often the opposite direction. **39** marks carry a paired
  filing from each side; on **21** of those the two governments
  disagree about which way the gas runs.
- **Why pairing and not clustering.** 22 pairs of filings sit within 3 km of
  each other under the *same* government — necessarily distinct crossings, the
  closest 13 m apart — while genuine cross-border duplicates run from 15 m to
  at least 1,467 m. Those ranges overlap, so no radius separates them. Only
  cross-border filings may pair, and only mutually, which makes pairing 1:1
  with no chaining. Over-merging is destructive (several EIA volumes would
  collide on one mark and R4.24 forbids summing them); under-merging is safe
  (the crosswalk pins the volume to one mark and the other stays a NACEI-only
  dot, which R4.26 already draws and labels).
- Paired filings are kept **verbatim and never summed**. Summing Naco's 109.926
  and El Paso's 57 would invent a 167 MMcf/d crossing that nobody filed.
- 29 of 99 records carry the **empty string** in `Vol_MMcfd`,
  53 in `Diam_Inch` and 59 in `MaxOP_psi`.
  `Number('')` is `0`, so the build asserts that none of them became a zero.
- US-filed records carry `NumPipes: 0`, which is this dataset's way of writing
  "not filed" — a crossing with zero pipes does not exist.
- All four 2017 magnitudes — diameter, pressure, capacity **and pipe count** —
  leave the build **only as strings** carrying `design (2017)`, so no numeric
  variable is in scope for a renderer to bind to. Pipe count is in that list
  because it correlates with crossing size: a mark sized by it would look
  entirely plausible and be eight years stale. The label is the second line of
  defence, not the first — deleting the number is the first. A deliberate
  `parseFloat` still recovers the magnitude, which is the line between a
  mistake and a decision.
- Depth: coordinates, filing identity and pre-formatted 2017 design strings.
  No hand-curation. The `duoarea → cellId` crosswalk to EIA is a separate,
  hand-verified artifact and is not in this file.

Refresh: `npm run build:gas-pipelines`. The manifest counts in each build
script are assertions — if upstream moves, the build fails rather than
quietly changing the map.
