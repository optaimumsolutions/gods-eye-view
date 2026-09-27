# Williston Basin onshore production (ND)

Bundled facility-level production for the `production-williston` layer (row 12,
region `williston`). Static asset, rebuilt by
`npm run build:onshore -- --region williston`; nothing is fetched at
runtime except the history shards, which are built alongside and served from
`public/data/onshore/williston/history/` (not committed — O1).

- Sources: North Dakota DMR Oil and Gas Division, Monthly Production Report (well grain, monthly, https://www.dmr.nd.gov/oilgas/mpr/YYYY_MM.xlsx).
- Licence: Public record of the North Dakota Industrial Commission; no licence text, state disclaimer applies.
- Retrieved: 2026-09-27. Per-file sha256 and byte counts in `source.json`.
- Datum: NAD83 (assumed; the workbook does not state a datum); none — NAD83 and WGS84 agree within a metre in North Dakota; coordinates rounded to six decimals.
- Finality: workbooks are final as published; late filings reach the PDF report only.
- **Current month = newest complete month.** Reporters are wells present in the month’s workbook (filed a report); a month is complete when its count is at least 90 % of the median over the 12 preceding months, that median itself at least 50 % of the median over the 12 before those. This build: **2026-07** is current (22,071 reporters at the median); still filling: none.

## `index.json` — 24,233 facilities

- 22,466 wells filed for 2026-07; 19,663 produced (3.43 Bcf/d gas, 1.01 MMbbl/d oil, 151 MMcf/d flared); 2,803 filed with no production; 1,767 wells appear earlier in the window but not in the current file (plugged, inactive or confidential); 0 have no coordinates and are counted only.
- Per facility: identity (API well number, NDIC file number, well name, operator, county, field, pools), surface location, `status`, and three readings — `current`, `prior` and `lastYear` — as arrays in the order `oil, water, days, runs, gas, gasSold, flared` (monthly volumes: bbl, bbl, days, bbl, Mcf, Mcf, Mcf; null = not filed), plus a ten-year `summary` over the 120 months (first and last producing month, months producing, peak gas and oil per calendar day with their months, cumulative gas, oil, water and flared).
- Rates on the map are per calendar day (volume ÷ days in the month); the dossier also shows per producing day where days were filed.

## `clusters.json` — 518 fields, 16 counties

Monthly sums of gas, oil, water and flared and the count of producing wells per field and per county over the window, with a centroid of the member wells. The regional tier draws the fields.

## `contributors.json` and `aggregates.json` — main contributors (row 14)

- `contributors.json` (read by the layer): the last 24 months to 2026-07, every operator with production in them (120), each with its gas, oil and producing wells per month, its top fields this month and the names it filed under; and the change against last month and last year split into operators and into continuing wells, new wells, wells filed with no gas, wells absent from the file and operator changes (buyer credited, seller debited). The parts sum to the change; the build prints any month where they do not.
- `aggregates.json` (read by the Oil Oracle store, FR-N14): operator × county × month over the whole window, gas, oil and producing wells, with the region totals. The same numbers as the card: one parse.
- The operator is the one filed for each month. `scripts/operator-aliases.json` merges spellings of one company only (8 applied here); parents, subsidiaries and buyers stay as filed.

## History shards — 1024 files, 25.2 MB gzip

`public/data/onshore/williston/history/<xx>.json`, `xx` = FNV-1a hash of the facility id mod 1024 in hex (`src/layers/onshore/shards.js`): the full 120-month series per facility. Fetched when a dossier opens. Not committed; rebuilt from the archive.

## Reconciliation (EIA)

2026-06: region gas 102.1 Bcf against EIA gross withdrawals 108.1 Bcf (94 %) and marketed production 102.3 Bcf (100 %); oil 30.38 MMbbl against EIA 34.74 MMbbl (87 %). State filings are gross gas at the wellhead as reported by operators; EIA gross withdrawals include estimates for wells the state file omits (confidential wells, late filers), marketed production excludes gas flared, vented and used for repressuring. Region totals exclude nothing the files carry.

Anomalies recorded this build: ND 79,670 numeric cells hold text (NR/NA) across 120 months (155 to 1275 a month) and are read as not filed, never as zero.

Refresh: `npm run build:onshore -- --region williston` (`--refresh` re-downloads every file; `--replay` never touches the network; `--check` diffs against the committed bytes). Column names are asserted on every read, so a renamed upstream column fails by name.
