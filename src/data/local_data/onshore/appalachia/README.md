# Appalachian Basin onshore production (PA)

Bundled facility-level production for the `production-appalachia` layer (row 12,
region `appalachia`). Static asset, rebuilt by
`npm run build:onshore -- --region appalachia`; nothing is fetched at
runtime except the history shards, which are built alongside and served from
`public/data/onshore/appalachia/history/` (not committed — O1).

- Sources: Pennsylvania DEP Oil and Gas Production Report (GreenPort extract), unconventional wells (well grain, monthly, https://greenport.pa.gov/ReportExtracts/OG/ExportOGProdReport (POST, one monthly period per request)).
- Licence: Public record of the Pennsylvania Department of Environmental Protection; GreenPort states no licence and the pa.gov disclaimer covers warranty only; figures as reported by operators.
- Retrieved: 2026-09-28. Per-file sha256 and byte counts in `source.json`.
- Datum: NAD83 (DEP decimal degrees); none — NAD83 and WGS84 agree within two metres in Pennsylvania; coordinates rounded to six decimals.
- Finality: a live report: DEP notes values may change between generations of reports, so --refresh re-reads every month.
- **Current month = newest complete month.** Reporters are unconventional wells present in the month’s extract (filed a report); a month is complete when its count is at least 90 % of the median over the 12 preceding months, that median itself at least 50 % of the median over the 12 before those. This build: **2026-07** is current (13,580 reporters at the median); still filling: none.

## `index.json` — 14,664 facilities

- 12,450 wells filed for 2026-07; 12,357 produced (21.04 Bcf/d gas, 0.01 MMbbl/d oil, 0 MMcf/d flared); 93 filed with no production; 2,214 wells appear earlier in the window but not in the current file (plugged, inactive or confidential); 0 have no coordinates and are counted only.
- Per facility: identity (API well number, NDIC file number, well name, operator, county, field, pools), surface location, `status`, and three readings — `current`, `prior` and `lastYear` — as arrays in the order `oil, water, days, runs, gas, gasSold, flared` (monthly volumes: bbl, bbl, days, bbl, Mcf, Mcf, Mcf; null = not filed), plus a ten-year `summary` over the 120 months (first and last producing month, months producing, peak gas and oil per calendar day with their months, cumulative gas, oil, water and flared).
- Rates on the map are per calendar day (volume ÷ days in the month); the dossier also shows per producing day where days were filed.

## `clusters.json` — 374 fields, 36 counties

Monthly sums of gas, oil, water and flared and the count of producing wells per field and per county over the window, with a centroid of the member wells. The regional tier draws the fields.

## `contributors.json` and `aggregates.json` — main contributors (row 14)

- `contributors.json` (read by the layer): the last 24 months to 2026-07, every operator with production in them (75), each with its gas, oil and producing wells per month, its top fields this month and the names it filed under; and the change against last month and last year split into operators and into continuing wells, new wells, wells filed with no gas, wells absent from the file and operator changes (buyer credited, seller debited). The parts sum to the change; the build prints any month where they do not.
- `aggregates.json` (read by the Oil Oracle store, FR-N14): operator × county × month over the whole window, gas, oil and producing wells, with the region totals. The same numbers as the card: one parse.
- The operator is the one filed for each month. `scripts/operator-aliases.json` merges spellings of one company only; parents, subsidiaries and buyers stay as filed.

## History shards — 1024 files, 6.6 MB gzip

`public/data/onshore/appalachia/history/<xx>.json`, `xx` = FNV-1a hash of the facility id mod 1024 in hex (`src/layers/onshore/shards.js`): the full 120-month series per facility. Fetched when a dossier opens. Not committed; rebuilt from the archive.

## Reconciliation (EIA)

2026-06: region gas 633.7 Bcf against EIA gross withdrawals 634.2 Bcf (100 %) and marketed production 634.2 Bcf (100 %); oil 0.31 MMbbl against EIA 0.40 MMbbl (78 %). State filings are gross gas at the wellhead as reported by operators; EIA gross withdrawals include estimates for wells the state file omits (confidential wells, late filers), marketed production excludes gas flared, vented and used for repressuring. Region totals exclude nothing the files carry.

Anomalies recorded this build: none.

Refresh: `npm run build:onshore -- --region appalachia` (`--refresh` re-downloads every file; `--replay` never touches the network; `--check` diffs against the committed bytes). Column names are asserted on every read, so a renamed upstream column fails by name.
