# US data centers (power)

Curated snapshot of the largest United States data centers by current IT
power, bundled for the `energy-datacenters` layer. Static asset: nothing is
fetched at runtime beyond this file, and the "as of" stamp on every card is
the `vintage` below, never the fetch time.

- Source: Epoch AI, "AI Data Centers" (https://epoch.ai/data/ai-data-centers),
  downloadable bundle `data_centers.zip` (data_centers.csv,
  data_center_timelines.csv, data_center_chip_quantities.csv).
- License: Creative Commons Attribution 4.0 (CC BY 4.0). Citation: Epoch AI,
  'AI Data Centers'. Published online at epoch.ai.
- Retrieved: 2026-09-18. Vintage stamped in `datacenters.json`.
- Selection: the fifteen largest US sites by current IT power (MW) in the
  tracker on the retrieval date. Planned figures are Epoch projections.
  Ties on IT power are broken by current H100 equivalents, which is what
  separates Council Bluffs (East) from Omaha and Papillion, all three at
  237 MW. The layer itself re-ranks and breaks ties on `id`
  (`records.js`), so rank 13/14 read alphabetically.
- Depth: sites 1 to 5 carry hand-curated grid, cooling, on-site generation,
  footprint and asset detail from the supplementary sources below. Sites 6
  to 15 carry the tracker's own fields only (owner, users, power, chips,
  capex, timeline, sources) — no footprint, no on-site assets.
- Positions: OpenStreetMap polygon centroids where a mapped campus exists
  (Colossus 2, Project Rainier, Lancium Clean Campus), otherwise the street
  address or a campus landmark; each record says which in `positionSource`.
- Supplementary facts (campus acreage, utility, on-site generation, permit
  status) come from the sources listed on each record. Anything reported but
  not confirmed is labelled so in the record's notes.
- Derived readings (facility/IT ratio, capex per IT MW, gas-equivalent
  demand) are computed by `src/layers/datacenters/records.js` from the
  `assumptions` block; they are arithmetic, not statements of supply.

Refresh: re-download the Epoch bundle, re-rank by current IT power, update
`vintage`, `source.retrieved` and `source.json`, and re-verify positions.

## Footprints and on-site assets

- `footprint` is a simplified OpenStreetMap outline as `[lon, lat]` pairs
  (ODbL, © OpenStreetMap contributors) for campuses that OSM has mapped: the
  Colossus 2 building, the Project Rainier industrial parcel and the Lancium
  Clean Campus. `footprintSource` names the OSM object. Sites without one draw
  the campus ring instead. Outlines are simplified to a handful of points and
  are not survey geometry.
- `assets[]` are on-site plants or substations that get their own amber
  marker and label at the local zoom tier: Colossus 2's Southaven turbine
  plant, positioned and sized from Global Energy Monitor.

## How the layer reads the bundle

Three zoom tiers (label above 2,500 km, short card to 300 km, campus below),
hover highlight, click-to-fly, and a dossier drawer with every field above;
see `docs/COMMODITIES-PLAN.md` §8 for the requirements and
`src/layers/datacenters/` for the code.
