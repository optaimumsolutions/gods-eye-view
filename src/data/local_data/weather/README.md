# Weather forecast bundles (row 3)

Four static reference files for the `weather-forecast` and `weather-field` layers
(docs/COMMODITIES-PLAN.md §11). Nothing here is a forecast: the forecast is
fetched browser-direct from Open-Meteo at runtime. These files say *where*
to sample, *what normal is* at each place, and *how far to trust a lead*.

## gazetteer.json (§11.8.1) — `npm run build:weather-gazetteer`

The nineteen places the layer samples, mirrored from the Oil Oracle's own
sample-point yamls so the globe and the console name the same places with
the same weights:

- Source: `optaimumsolutions/commodities` (private) `corpus/wx_basins.yaml`,
  `corpus/wx_regions.yaml`, `corpus/wx_stations.yaml`, read at the commit in
  `source.json` through `gh api` at build time (nothing in the read path
  touches GitHub). File sha256s are in `source.json`.
- Entries: six production basins (`kind: basin`, with the oracle's
  winterization heuristic `freezeF` and rough production `share`), two
  demand regions (`kind: region`, metros weighted by population exactly as
  the oracle weights them), two Gulf points (`kind: gulf`, **hand-placed**,
  A-1: Mississippi Canyon 28.20, −89.80 and Sabine Pass 29.73, −93.87), and
  (M7, plan §11.8.15) the nine census divisions (`kind: division`: the
  oracle's `wx_stations.yaml` metro basket with pop weights, `gasShare` from
  `gwdd_weights.yaml` = the division's share of US residential + commercial
  gas deliveries, `eia930` = the EIA-930 regional aggregates the card's
  power line quotes by name, from `wx_divisions.yaml`).
- `lat`/`lon` is the weight-normalized centroid of `points[]`; weights are
  normalized to sum to 1 per entry.
- `--check` rebuilds and fails on any byte of drift.

## normals.json (§11.8.2) — `npm run build:weather-normals`

Day-of-year normal daily minimum and maximum (°F) per entry, 366 slots
(02-29 has its own), smoothed with a ±7-day window.

- Source: ERA5 through `archive-api.open-meteo.com/v1/archive`, one call per
  sample point (29), window 2016-01-01 to 2025-12-31 (A-2: ten trailing
  years, recomputed by re-running, never at runtime).
- Aggregation: per day, weighted mean over the entry's points (the same
  point-then-weight order the forecast uses), then the day-of-year mean.
- Licence: "Contains modified Copernicus Climate Change Service information"
  (the `attribution` field; `DATA_SOURCES.md`, `dataCredits.js`).
- Raw responses are cached under `.gev-cache/weather/normals/` (gitignored)
  so `--check` needs no network; the free tier 429s after ~12 ten-year
  pulls a minute and the script waits and retries.

## skill.json (§11.8.14.1) — `npm run build:weather-skill -- --from <json>`

The lead-time confidence curve, from the Oil Oracle's MEASURED forecast
skill, never a hand-drawn curve.

- Source: `tools/wx_skill.py --json` run read-only on the VPS (the command
  is in the script header); per model per lead day MAE / bias / band
  coverage against observed GWDD; maturity gate 30 realized inits.
- `confidence[lead]` = `MAE(D+1) / MAE(lead)` clamped to [0, 1]; D+0 = 1.
  This is decay relative to the model's own day-1 error. It becomes the
  standard skill score `1 − MAE/MAE_climatology` once `wx_skill.py`
  publishes a climatology baseline (an oracle FR-W change; §11.13).
- `provisional: true` until the gate is met; the layer prints the `label`
  (`provisional (17/30 inits)`) on every card. Leads past the last scored
  one hold the last value and carry `extrapolated: true`. A model with no
  oracle score (WeatherNext 2) gets a flat 1.0 labelled
  `no skill measured yet`.
- Vintage is the `--vintage` date (the day the VPS JSON was read).

## population.json (§11.8.15 D7.5) — `npm run build:weather-population -- --from <asc>`

GPWv4.11 population count, 2020, 15 arc-minute (NASA SEDAC / CIESIN,
CC BY 4.0), cut to the field's 105 × 241 CONUS grid: each field grid point
takes the quarter-weighted sum of the four 0.25° GPW cells meeting at it
(the people within ±0.125° of the point), whole people, NODATA read as 0.
The `HDD × people` / `CDD × people` chips multiply the oracle's degree-day
field by it and normalize to the day's CONUS maximum; the legend prints the
vintage and that maximum. The SEDAC download needs an Earthdata login, so
the `.asc` is a manual input (like the GEM spreadsheet for the LNG bundle):
place `gpw_v4_population_count_rev11_2020_15_min.asc` under
`.gev-cache/weather/` and run the build; `--check` compares byte for byte.
Built 2026-09-30 from the zip at
`data.earthdata.nasa.gov/nasa-earth/human-dimensions/sedac-root/downloads/data/gpw-v4/gpw-v4-population-count-rev11/`
(the old `sedac.ciesin.columbia.edu` host is gone; the new one wants an
Earthdata bearer token — `curl -H "Authorization: Bearer <token>"`): window
total 402,238,849 people (24–50 N includes northern Mexico and southern
Canada), densest cell New York 2,814,131. Without the bundle the two chips
are disabled and say why.

Rebuild order after an oracle yaml change: gazetteer → normals → skill;
population only when SEDAC publishes a new revision.
