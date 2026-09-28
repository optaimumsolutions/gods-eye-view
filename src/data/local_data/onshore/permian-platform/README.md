# Central Platform & Shelves (Permian) onshore production (TX)

Bundled facility-level production for the `production-permian-platform` layer (row 12,
region `permian-platform`). Static asset, rebuilt by
`npm run build:onshore -- --region permian-platform`; nothing is fetched at
runtime except the history shards, which are built alongside and served from
`public/data/onshore/permian-platform/history/` (not committed — O1).

- Sources: Texas Railroad Commission Production Data Query dump, RRC districts 08, 8A, 7C except Brewster, Culberson, El Paso, Hudspeth, Jeff Davis, Loving, Pecos, Presidio, Reeves, Ward, Winkler, Borden, Dawson, Glasscock, Howard, Irion, Martin, Midland, Mitchell, Reagan, Sterling, Upton counties (Central Basin Platform, shelves and Val Verde); well locations from the RRC well layers by county (lease grain, monthly, https://mft.rrc.texas.gov/link/1f5ddb8d-329a-4459-b7f8-177b4f5ee60d PDQ_DSV.zip (monthly, last Saturday) + https://mft.rrc.texas.gov/link/d551fb20-442e-4b67-84fa-ac3f23ecabb4 well<county>.zip (twice weekly)).
- Licence: Public record of the Railroad Commission of Texas; RRC site policies grant permission for noncommercial use, and the founder decided on 2026-09-28 to show it on the hosted site (docs/LICENCES.md).
- Retrieved: 2026-09-28. Per-file sha256 and byte counts in `source.json`.
- Datum: NAD83 (RRC’s LAT83 / LONG83 columns in the well layers); none — RRC publishes NAD83 beside the NAD27 originals; an oil lease is drawn at the centroid of its wells, a gas well at its own surface location; well coordinates rounded to six decimals.
- Finality: a monthly snapshot: RRC revises earlier months as corrected reports arrive, so each dump can change past months; --refresh reads the newest dump.
- **Current month = newest complete month.** Reporters are oil leases and gas wells with a production report filed for the month (PROD_REPORT_FILED_FLAG Y); a month is complete when its count is at least 90 % of the median over the 12 preceding months, that median itself at least 50 % of the median over the 12 before those. This build: **2026-06** is current (24,543.5 reporters at the median); still filling: 2026-07 16,104 (66 %).

## `index.json` — 28,827 facilities

- 24,085 leases filed for 2026-06; 17,560 produced (1.37 Bcf/d gas, 0.48 MMbbl/d oil; the state files no flaring here); 6,525 filed with no production; 4,742 leases appear earlier in the window but not in the current file (plugged, inactive or confidential); 14 have no coordinates and are counted only.
- Per facility: identity (RRC id `TX-<district>-<O|G>-<lease or gas well number>`, lease name (with the gas well number for a gas well), operator, county, field; `grain` oil lease or gas well and `wells`, the wells on file it is drawn from), surface location, `status`, and three readings — `current`, `prior` and `lastYear` — as arrays in the order `oil, water, days, runs, gas, gasSold, flared` (monthly volumes: bbl, bbl, days, bbl, Mcf, Mcf, Mcf; null = not filed), plus a ten-year `summary` over the 120 months (first and last producing month, months producing, peak gas and oil per calendar day with their months, cumulative gas, oil, water and flared).
- Rates on the map are per calendar day (volume ÷ days in the month); the dossier also shows per producing day where days were filed.

## `clusters.json` — 2427 fields, 39 counties

Monthly sums of gas, oil, water and flared and the count of producing wells per field and per county over the window, with a centroid of the member wells. The regional tier draws the fields.

## `contributors.json` and `aggregates.json` — main contributors (row 14)

- `contributors.json` (read by the layer): the last 24 months to 2026-06, every operator with production in them (795), each with its gas, oil and producing leases per month, its top fields this month and the names it filed under; and the change against last month and last year split into operators and into continuing leases, new leases, leases filed with no gas, leases absent from the file and operator changes (buyer credited, seller debited). The parts sum to the change; the build prints any month where they do not.
- `aggregates.json` (read by the Oil Oracle store, FR-N14): operator × county × month over the whole window, gas, oil and producing wells, with the region totals. The same numbers as the card: one parse.
- The operator is the one filed for each month. `scripts/operator-aliases.json` merges spellings of one company only (2 applied here); parents, subsidiaries and buyers stay as filed.

## History shards — 1024 files, 7.8 MB gzip

`public/data/onshore/permian-platform/history/<xx>.json`, `xx` = FNV-1a hash of the facility id mod 1024 in hex (`src/layers/onshore/shards.js`): the full 120-month series per facility. Fetched when a dossier opens. Not committed; rebuilt from the archive.

## Reconciliation (EIA)

2026-06: region gas 41.1 Bcf against EIA gross withdrawals 1174.7 Bcf (4 %) and marketed production 1092.9 Bcf (4 %); oil 14.41 MMbbl against EIA 171.85 MMbbl (8 %). State filings are gross gas at the wellhead as reported by operators; EIA gross withdrawals include estimates for wells the state file omits (confidential wells, late filers), marketed production excludes gas flared, vented and used for repressuring. Region totals exclude nothing the files carry.

Anomalies recorded this build: none.

Refresh: `npm run build:onshore -- --region permian-platform` (`--refresh` re-downloads every file; `--replay` never touches the network; `--check` diffs against the committed bytes). Column names are asserted on every read, so a renamed upstream column fails by name.
