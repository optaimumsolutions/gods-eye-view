# Commodities globe

The `commodities` branch of this fork makes the globe a planet-scale reference
for the physical movement of oil and gas: what is moving, where it is
constrained, what infrastructure carries it, what weather threatens it, and
what news is acting on it. It is the geographic twin of the market console in
`optaimumsolutions/commodities` (the Oil Oracle), which owns the numeric store
and the causal market map.

Principles:

- **Free first.** Every stream ships on a keyless public source. Paid
  enhancements are catalogued per stream in [`UPGRADE.md`](../UPGRADE.md).
- **One layer at a time.** Each system that affects oil and gas becomes one
  visible, toggleable layer with its own attribution and freshness stamp.
- **Descriptive, never signals.** Cards show counts, deviations, and
  percentiles. Nothing on the globe is a recommendation. This matches the
  oracle's standing mission gate.
- **Additive to upstream.** New code lives in new layer families and new
  panel groups so `git pull upstream main` keeps merging cleanly.

## Layer roadmap

| Order | Layer id | Shows | Free source (verified 2026-09-16) | Mechanism | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `commodity-chokepoints` | 28 maritime chokepoints, ring sized by baseline tanker rate, inner disc = share still flowing, label with 7-day vs 90-day deviation, detail card on click | IMF PortWatch ArcGIS: `PortWatch_chokepoints_database`, `Daily_Chokepoints_Data` | geometry pinned from a bundled gazetteer (`src/layers/chokepoints/gazetteer.js`), markers at a fixed height, only the daily feed fetched browser-direct and joined onto the pins | **BUILT** |
| 2 | vessels row control | tankers only, destination labels | AISStream (already integrated; AIS type 80 to 89 is TANKER) | row control on the existing vessels layer | planned |
| 3 | `commodity-ports` | 2,065 ports as markers sized by annual tanker visits and coloured by 7-day vs 90-day tanker-call deviation (ports under 0.5 tankers/day read as thin, not moving), ground rings and labels for disruptions open or closed within 90 days, detail card on click | PortWatch `PortWatch_ports_database`, `Daily_Ports_Data` (means grouped by port, computed server-side), `portwatch_disruptions_database` | browser-direct source; five requests per refresh instead of a quarter-million daily rows | **BUILT** |
| 4 | `energy-pipelines` | US gas, crude, and HGL pipeline lines with operator | EIA public-domain copies (32,892 gas segments, 236 crude trunk, 133 HGL) | bundled GeoJSON under `src/data/local_data/`, LOD like datacenters | planned |
| 5 | `energy-plants` | refineries with capacity, gas processing plants, LNG terminals, storage fields, product terminals, shale plays | EIA copies plus EIA-owned shale play and basin services; OGIM and Global Energy Monitor for the rest of the world | bundled GeoJSON | planned |
| 6 | `weather-*` overlays | GOES clouds, precipitation, radar, hurricane cones, NWS alerts, basin ensemble cards | NASA GIBS WMTS, RainViewer, NHC ArcGIS, NWS API, Open-Meteo ensemble | imagery-layer modules (precedent: Nepal event pack) plus browser-direct point sources | planned |
| 7 | `commodity-news` | headlines pinned to the asset they name, disaster events | GDELT DOC through the server proxy with a keyword gazetteer, GDACS via PortWatch `gdacs_events` | proxy + gazetteer; the GDELT GEO API is dead | planned |
| 8 | `commodity-flows` | origin-to-destination arcs by monthly volume | EIA crude imports, EIA gas trade lanes, UN Comtrade preview, ENTSOG | exporter from the oracle store plus Comtrade proxy | planned |
| 9 | oracle state | prices, chokepoint deviations, episode scene packs | `tools/globe_export.py` in the oracle repo | static JSON served by a provider, Director data packs | planned |

## Verified endpoints

Everything below answered a live probe on 2026-09-16. "Browser-direct" means
the host sends permissive CORS headers so no proxy is needed.

| Category | Endpoint | Auth | Browser-direct |
| --- | --- | --- | --- |
| Chokepoints, ports, disruptions, shipping routes, maritime connections | `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/<service>/FeatureServer/0/query` | none | yes |
| US gas pipelines (32,892 lines) | `https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0` | none | yes |
| US crude trunk pipelines | `.../FiaPA4ga0iQKduv3/.../Crude_Oil_Trunk_Pipelines_1/FeatureServer/0` | none | yes |
| Refineries with capacity | `https://services.arcgis.com/GL0fWlNkwysZaKeV/arcgis/rest/services/US_Petroleum_Refineries/FeatureServer/0` | none | yes |
| Gas processing plants, LNG terminals | `https://services2.arcgis.com/wdQEqhSQSuYA89VW/arcgis/rest/services/{NaturalGas_ProcessingPlants_US_EIA,Lng_ImportExportTerminals_US_EIA}/FeatureServer/0` | none | yes |
| HGL pipelines, underground gas storage | `https://services2.arcgis.com/ZOdjAzAQ2B0f85zi/arcgis/rest/services/{HGL_Pipelines_US_EIA,NaturalGas_UndergroundStorage_US_EIA}/FeatureServer/0` | none | yes |
| Shale plays, basins, PADDs, storage regions (EIA-owned) | `https://services7.arcgis.com/FGr1D95XCGALKXqM/arcgis/rest/services/{TightOil_ShaleGas_Plays_Lower48_EIA,SedimentaryBasins_US_EIA,PADD_EIA,Natural_Gas_Storage_Regions}` | none | yes |
| Weather point forecasts and 30-member ensemble | `https://api.open-meteo.com/v1/forecast`, `https://ensemble-api.open-meteo.com/v1/ensemble?models=gfs025` | none | yes |
| Satellite and precipitation tiles | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/<layer>/default/<time>/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png` | none | yes |
| Radar tiles | `https://api.rainviewer.com/public/weather-maps.json` then `{host}{path}/256/{z}/{x}/{y}/2/1_1.png` | none | yes |
| Hurricane cones and tracks | `https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer` (layers 7 and 8 for the first Atlantic storm) | none | yes |
| US weather alerts | `https://api.weather.gov/alerts/active` (User-Agent required) | none | yes |
| Headlines | `https://api.gdeltproject.org/api/v2/doc/doc` | none, rate limited | no, proxy |
| Trade by partner | `https://comtradeapi.un.org/public/v1/preview/C/A/HS` | none, codes only | no, proxy |

Known dead or locked: the GDELT GEO API returns 404; the official EIA atlas
infrastructure services require a token and the atlas download endpoint
errors, which is why the public-domain copies above are used; both public
Overpass mirrors timed out under load during the probe, so OpenStreetMap
queries must keep using the cached server proxy.

## Bridge to the oracle

The Oil Oracle already stores the geographic series this globe needs:
`chokepoint_transits`, `crude_imports`, natural gas trade lanes, weather by
basin, sanctions, OPEC decisions, and 51 dated episodes. The planned bridge is
a read-only exporter in that repo, `tools/globe_export.py`, writing GeoJSON and
a `state.json` after each refresh tier, served here by a provider that reads a
`COMMODITIES_DATA_DIR` or proxies the VPS over the existing port 8014 tunnel.
Nothing in the globe's read path depends on Neon or any cloud service, matching
the oracle's own rule.

## Licensing

PortWatch data falls under IMF terms of use. EIA data is US public domain even
when hosted by third parties; the copies used here are recorded with their
service URLs so they can be re-verified or replaced. OGIM is CC-BY-4.0. GIBS
imagery requires NASA attribution. TeleGeography cables remain
non-commercial. Every source gets a row in `DATA_SOURCES.md` and a credit in
`src/data/dataCredits.js` before it ships.

## Follow-ups

- Voice control: the layer ids are not yet in the Realtime tool enums because
  `src/voice/actionSchemas.js` is hash-pinned by its test; add it in a
  deliberate change that updates the digest.
- First-run experience and scene policy lists do not mention the new layer;
  both are optional and additive.
