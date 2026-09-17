# Upgrade paths: paid data for the commodities globe

This fork turns God's Eye View into a planet-scale reference for the physical
movement of oil and gas: chokepoints, ports, tankers, pipelines, plants,
storage, weather, and the news that moves them. Every stream ships first on a
**free, keyless source** so the globe works with nothing configured. This file
records, per stream, what the free source cannot show and which **paid
providers** slot in behind the same layer to enhance the data stream.

Rules that hold for every upgrade:

- The free source stays as the fallback. A missing or expired key degrades the
  layer to the free feed and reports `stats.keyRequired`; it never blanks the
  map.
- Keys are server-side only. They enter through the in-app POWER UP panel and
  land in the gitignored `.env`; the browser talks to a same-origin proxy.
- The map stays descriptive. Paid data sharpens counts, cargoes, and timing.
  It never turns a panel into a trade signal, matching the oracle's mission
  boundary in `optaimumsolutions/commodities`.
- Pricing below is deliberately unstated. Every vendor listed sells on
  enterprise quotes that change with seat count, refresh rate, and
  redistribution rights. Confirm terms with the vendor before budgeting.

## How a paid provider is wired in

1. **Register the key.** Add an entry to the key registry in
   `src/keySetupCore.mjs` (id, label, environment variable), mirror it in
   `scripts/setup-doctor.mjs`, and document the variable in `.env.example`.
   The POWER UP panel and `npm run doctor` pick it up from there.
2. **Proxy it.** Add `server/providers/<vendor>.js` modelled on
   `server/providers/gbfs.js`: host allowlist, upstream timeout, streamed body
   cap, `redirect: 'manual'`, sanitized errors, per-client rate limit. Register
   the plugin in `localProviderPlugins()` in `server/providers/local.js`.
3. **Second source, same contract.** Give the layer a second source module that
   returns the same snapshot shape as the free one. Select it in
   `src/standalone/layerSources.js` when the key is present. The layer code
   does not change.
4. **Attribute it.** Add the license row to `DATA_SOURCES.md` and the credit to
   `src/data/dataCredits.js`. Check redistribution rights: most paid feeds
   forbid showing raw data to anonymous viewers, which rules out public
   deployments.
5. **Gate it.** Run `npm run format:check`, `npm run check:boundaries`,
   `npm test`, and `npm run build` before merging.

## Stream by stream

Status legend: **BUILT** ships on the `commodities` branch today, **PLANNED**
has a verified free endpoint and a slot in `docs/COMMODITIES.md`.

### 1. Chokepoint tanker transits (BUILT)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| IMF PortWatch daily transit counts for 28 chokepoints, roughly five-day lag, counts only | Same-day data, cargo type and grade, laden versus ballast, destination | **Kpler** (cargo tracking, Ships and Flows), **Vortexa** (freight and cargo analytics API), **Windward** (maritime AI, dark activity), **Lloyd's List Intelligence Seasearcher** | Rings sized by barrels rather than hulls, laden and ballast split, same-day deviation, diversions drawn as reroute arcs |

### 2. Live vessels (BUILT upstream, tanker filter PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| AISStream terrestrial AIS, free key, one connection, beta terms | Open-ocean coverage between coastal receivers, historical tracks beyond the session, cargo and draft history, ship particulars | **Spire Maritime** (satellite AIS, global), **MarineTraffic API** (Kpler), **VesselFinder API**, **Datalastic**, **exactEarth** (Spire) | No mid-ocean gaps, full voyage history on click, laden state from draft changes, fleet-level filters by owner or class |

### 3. Ports and container throughput (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| IMF PortWatch ports database (2,065 ports with vessel counts by class), daily port calls, import and export estimates, container metrics | Berth-level congestion, waiting times, terminal-level throughput, same-day data | **Kpler port and congestion data**, **Linerlytica**, **project44 Ocean Visibility**, **Sea-Intelligence**, **Xeneta** (container rates) | Port markers pulse with queue length, container rate context on the Suez and Panama cards, terminal-level drilldown |

### 4. Cargo flows: crude, products, LNG (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| EIA crude imports by origin (monthly, US only), EIA natural gas trade routes, UN Comtrade preview (annual, codes only), JODI monthly balances, ENTSOG EU pipeline flows | Vessel-level cargoes, floating storage, grade and quality, non-US destinations, weekly cadence | **Kpler** (flows by grade and route), **Vortexa** (flows, floating storage, freight), **S&P Global Commodities at Sea**, **ICIS LNG Edge**, **Spark Commodities** (LNG freight and netbacks), **Argus Media** | Flow arcs by grade with weekly widths, floating storage highlighted off Singapore and the Gulf, LNG cargoes tracked from terminal to terminal |

### 5. Pipelines and production plants (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| EIA public-domain layers (32,892 gas pipeline segments, crude trunk lines, refineries with capacity, processing plants, LNG terminals, storage fields, product terminals), OGIM global infrastructure (CC-BY-4.0), Global Energy Monitor trackers (free registration), OpenStreetMap via the existing Overpass proxy | Actual flows, nominations, outages, utilization, refinery run rates, well-level production | **Wood Mackenzie Genscape** (real-time pipeline flows, refinery and storage monitoring), **Criterion Research** (pipeline nominations), **IIR Energy** (planned and unplanned outages), **Enverus** (well-level production, permits, rigs), **Rystad Energy UCube** | Pipelines animate with nominated flow, refineries flash on outage with lost capacity, basins show live production not static boundaries |

### 6. Storage and inventories (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| EIA weekly stocks by PADD and Cushing, EIA weekly gas storage by region, GIE AGSI+ and ALSI (free key) for Europe | Daily tank-level measurements, non-reporting countries, same-day Cushing | **Ursa Space Systems** (SAR tank measurements), **Kayrros** (satellite crude inventories), **Orbital Insight**, **Genscape Cushing storage** (Wood Mackenzie) | Storage hubs sized by measured fill instead of reported weekly totals, China and Middle East inventories visible, Cushing changes days before the EIA print |

### 7. Weather forecasts (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| Open-Meteo forecast and 30-member ensemble, NASA GIBS satellite and precipitation tiles, RainViewer radar, NHC cones and tracks, NWS alerts, the oracle's GEFS and AIFS degree-day lanes | Energy-specific products (degree-day forecasts by basin at high resolution), vendor ensembles, 15-day hourly at 1 km, weather-desk commentary | **DTN** (energy weather desk), **Meteomatics API**, **Tomorrow.io**, **Spire Weather**, **Windy API**, **ECMWF licensed high-resolution products**, **StormGeo** | Basin freeze risk and Gulf hurricane impact rendered from vendor ensembles, weather-desk narrative on the card, higher refresh on radar and clouds |

### 8. Satellite imagery and analytics (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| Esri World Imagery basemap, Google Photorealistic 3D with a key, NASA GIBS daily true color, NASA FIRMS fires and flaring | Tasked or daily high-resolution scenes, radar through clouds, change detection over facilities | **Planet** (daily 3 m, tasking), **Maxar / Vantor** (30 cm), **Airbus OneAtlas**, **Capella Space** and **ICEYE** (SAR), **SkyFi** (marketplace), **Kayrros** and **Orbital Insight** (analytics) | Before-and-after scenes on any refinery, terminal, or strait, the same way the Nepal event pack shows a flood, plus automated activity counts |

### 9. News and events (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| GDELT DOC headlines pinned by keyword gazetteer, GDACS disasters, PortWatch disruption polygons, the oracle's GDELT wire, Polymarket odds, OFAC sanctions | Wire speed, curated energy desks, entity tagging by asset, analyst commentary | **LSEG Refinitiv News**, **Bloomberg B-PIPE**, **Dow Jones Factiva**, **Argus Media**, **S&P Global Commodity Insights (Platts)**, **Benzinga**, **Marketaux**, **ACLED** (conflict, free research license) | Headlines land on the asset they name within minutes, Platts assessments next to the price node, conflict events near pipelines and terminals |

### 10. Prices and curves (PLANNED)

| Free now | What it lacks | Paid upgrades | What the globe gains |
| --- | --- | --- | --- |
| EIA spot settles, FRED macro, delayed futures via the oracle's yfinance lane, CFTC positioning | Real-time futures and options, full curve, physical differentials, freight rates | **CME Market Data**, **ICE Data Services**, **LSEG Refinitiv**, **Bloomberg**, **Databento** (CME futures feed), **Barchart OnDemand**, **Polygon.io**, **Twelve Data**, **Baltic Exchange** (tanker freight) | Live price and curve on the commodity node, freight rates on the shipping-route cards, differentials at each export terminal |

## Connectors already attached to this workspace

The Claude Code environment used for this repo has **S&P Global** and
**Morningstar** connectors available. Both are data-side: the right place to
use them is the oracle's ingest lanes and the globe exporter in
`optaimumsolutions/commodities`, not the browser. Treat them as the first
candidates for stream 9 and stream 10 once their entitlements are confirmed.

## Suggested spend order

1. **Cargo-aware tanker tracking** (Kpler or Vortexa). The biggest single jump:
   hulls become barrels of a known grade heading somewhere specific.
2. **Satellite AIS** (Spire). Removes the open-ocean gaps in the free feed.
3. **Real-time midstream monitoring** (Wood Mackenzie Genscape). Pipelines and
   refineries start moving.
4. **Satellite storage measurement** (Ursa Space or Kayrros). Inventories
   become daily and global.
5. **Energy weather desk** (DTN or Meteomatics). Only after the oracle's free
   ensemble skill scores mature; the free stack is already strong here.
6. **News terminal.** Last. GDELT plus the oracle's own narrative corpus covers
   most of the need at zero cost.
