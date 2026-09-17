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
- Retrieved: 2026-09-17. Vintage stamped in `datacenters.json`.
- Selection: the five largest US sites by current IT power (MW) in the
  tracker on the retrieval date. Planned figures are Epoch projections.
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
