# LNG terminals, cargoes, matrix and routes

Bundle for the `commodity-lng` layer (row 10, `docs/COMMODITIES-PLAN.md` §12).
Static assets: nothing here is fetched at runtime. Every number carries its
source's own date (R2, R3): GEM September 2025 for terminals,
EIA 2026-Q2 for US trains, DOE cargoes through 2026-06,
GIIGNL annual 2025 for the non-US matrix.

## Files

- `terminals.json` — 308 terminals ({"export:construction":15,"export:operating":59,"import:construction":38,"import:operating":196})
  in 74 countries, rolled up from 1,198 GEM units; the
  14 US export plants carry `us.trains` from the EIA workbook (37 of 39 rows joined).
- `cargoes.json` — DOE vessel exports: 3,365 per-cargo rows from 2024-07,
  5,408 monthly terminal-by-country rows since 2016-02; span
  2025-07 to 2026-06 holds 1,868 cargoes, 6,103,865 MMcf, 220 pairs.
- `matrix.json` — GIIGNL 2025: 25 exporters × 47 markets, 293 cells, world 427.9 MT.
- `routes.json` — 470 pairs (218 DOE, 252 GIIGNL); 47 pass Bab el-Mandeb when open and
  47 draw the Cape variant for the current period; longest line 157 vertices.
- `source.json` — the manifest: inputs, retrieval dates, sha256 per file, counts, assumptions.
- `crosswalk.json` — hand-kept: GEM id ↔ EIA project ↔ DOE point of exit ↔ EIA API code, country aliases, endpoint overrides.
- `giignl-2025-matrix.csv` — the re-typed report table with the PDF's sha256 in its first line.

## Sources and licences

- Global Energy Monitor, Global Gas Infrastructure Tracker, LNG terminals, September 2025 release, CC BY 4.0.
  Read from GEM's public tracker-map feed (the same release; it lacks the Operator column, so cards show owner and parent until the xlsx is placed).
- EIA, U.S. Liquefaction Capacity, 2026-Q2 workbook, sheet "Existing & Under Construction". Public domain.
- DOE Office of Fossil Energy and Carbon Management, "3. U.S. LNG Exports and Re-Exports Details", monthly. Public domain.
- GIIGNL Annual Report 2026 edition, "LNG Quantities (in MT) received in 2025", public PDF, re-typed once by
  `scripts/extract-giignl-matrix.mjs` and reconciled to its printed subtotals. Cited, not redistributed as a workbook.
- searoute-ts 2.3.0 (MIT) over the Eurostat maritime network for the modelled routes.

## Refresh

1. `node scripts/build-lng-bundle.mjs --fetch` re-downloads DOE (found through the article page, the href suffix moves monthly),
   the EIA workbook and the GEM feed into `.gev-cache/lng/` and stamps `retrieved.json`.
2. Manual: place the GEM xlsx as `.gev-cache/lng/gem-lng-terminals.xlsx` (preferred over the feed when present);
   for a new GIIGNL edition run `node scripts/extract-giignl-matrix.mjs <pdf> --year <yyyy>`.
3. Update `EXPECTED` in `scripts/build-lng-bundle.mjs` and the pinned counts in `src/layers/lng/*.test.mjs` together.
4. `node scripts/build-lng-bundle.mjs --check` must exit 0 against the committed bundle.

## How the layer reads the bundle

`src/layers/lng/source.js` fetches the four JSON files; `records.js` normalizes and freezes them and derives the
twelve-month figures, utilization (span MMcf ÷ baseload Bcf/d × 365 × 1,000, labelled arithmetic) and the card lines.
