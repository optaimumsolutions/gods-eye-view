# Williston Basin onshore production (ND)

Bundled facility-level production for the `production-williston` layer (row 12,
region `williston`). Static asset, rebuilt by
`npm run build:onshore -- --region williston`; nothing is fetched at
runtime except the history shards, which are built alongside and served from
`public/data/onshore/williston/history/` (not committed — O1).

- Sources: North Dakota DMR Oil and Gas Division, Monthly Production Report (well grain, monthly, https://www.dmr.nd.gov/oilgas/mpr/YYYY_MM.xlsx).
- Licence: Public record of the North Dakota Industrial Commission; no licence text, state disclaimer applies.
- Retrieved: 2026-09-21. Per-file sha256 and byte counts in `source.json`.
- Datum: NAD83 (assumed; the workbook does not state a datum); none — NAD83 and WGS84 agree within a metre in North Dakota; coordinates rounded to six decimals.
- Finality: workbooks are final as published; late filings reach the PDF report only.
- **Current month = newest complete month.** Reporters are wells present in the month’s workbook (filed a report); a month is complete when its count is at least 90 % of the median over the 12 preceding months, that median itself at least 50 % of the median over the 12 before those. This build: **2026-07** is current (22,071 reporters at the median); still filling: none.

## `index.json` — 24,154 facilities

- 20,231 wells filed for 2026-07; 17,915 produced (3.30 Bcf/d gas, 1.17 MMbbl/d oil, 150 MMcf/d flared); 2,316 filed with no production; 3,923 wells appear earlier in the window but not in the current file (plugged, inactive or confidential); 0 have no coordinates and are counted only.
- Per facility: identity (API well number, NDIC file number, well name, operator, county, field, pools), surface location, `status`, and three readings — `current`, `prior` and `lastYear` — as arrays in the order `oil, water, days, runs, gas, gasSold, flared` (monthly volumes: bbl, bbl, days, bbl, Mcf, Mcf, Mcf; null = not filed), plus a ten-year `summary` over the 120 months (first and last producing month, months producing, peak gas and oil per calendar day with their months, cumulative gas, oil, water and flared).
- Rates on the map are per calendar day (volume ÷ days in the month); the dossier also shows per producing day where days were filed.

## `clusters.json` — 518 fields, 16 counties

Monthly sums of gas, oil, water and flared and the count of producing wells per field and per county over the window, with a centroid of the member wells. The regional tier draws the fields.

## History shards — 1024 files, 25.2 MB gzip

`public/data/onshore/williston/history/<xx>.json`, `xx` = FNV-1a hash of the facility id mod 1024 in hex (`src/layers/onshore/shards.js`): the full 120-month series per facility. Fetched when a dossier opens. Not committed; rebuilt from the archive.

## Reconciliation (EIA)

2026-06: region gas 102.1 Bcf against EIA gross withdrawals 108.1 Bcf (94 %) and marketed production 102.3 Bcf (100 %); oil 30.38 MMbbl against EIA 34.74 MMbbl (87 %). State filings are gross gas at the wellhead as reported by operators; EIA gross withdrawals include estimates for wells the state file omits (confidential wells, late filers), marketed production excludes gas flared, vented and used for repressuring. Region totals exclude nothing the files carry.

Anomalies recorded this build: ND 2026-07: ReportDate column reads 2023-07-01 in a file named for 2026-07; the file name is taken as the month; ND 78,550 numeric cells hold text (NR/NA) across 120 months (155 to 1140 a month) and are read as not filed, never as zero.

Refresh: `npm run build:onshore -- --region williston` (`--refresh` re-downloads every file; `--replay` never touches the network; `--check` diffs against the committed bytes). Column names are asserted on every read, so a renamed upstream column fails by name.
