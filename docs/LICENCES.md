# Licence pass — who may see each source on the hosted site

Row 13 M2, requirement R13.12 of [`COMMODITIES-PLAN.md`](COMMODITIES-PLAN.md)
§15. Every source in [`DATA_SOURCES.md`](../DATA_SOURCES.md) and
[`UPGRADE.md`](../UPGRADE.md), plus the hosts the code calls that those files
do not list, judged for **viewers other than the founder** at
`commodities.optaimum.com`. Terms were read live on **2026-09-25** (archived
copies where a site refused automated reads; marked). This is a working
record for the founder, not legal advice.

**The use case judged.** Optaimum Solutions, a for-profit company, shows the
globe and the Oil Oracle console behind a Cloudflare Access login to the
founder and a short allowlist of invitees (teammates and pilot clients) with
the founder's rights (H4, H5). No fee today, but it is a company product shown
to prospective clients: every source was judged as **commercial use that
makes the data available to third parties**. Data is displayed; the server
proxies live feeds with short caches; nothing is offered for bulk download.

**Verdicts.** `ALLOWED` · `ALLOWED-WITH-CONDITIONS` (named; the code already
meets them unless the row says otherwise) · `ASK-FIRST` (commercial use needs
permission, or no reuse licence is stated, so copyright is reserved) ·
`NOT-ALLOWED`. ASK-FIRST and NOT-ALLOWED rows are **OFF** in the hosted build.

**The switch.** `GEV_LICENCE_PROFILE=hosted` in `/etc/gods-eye-view/globe.env`
(the deploy refuses to build without it) turns off every row in
[`server/hosting/licencePolicy.js`](../server/hosting/licencePolicy.js),
enforced by [`server/hosting/licences.js`](../server/hosting/licences.js): a
provider switch or blanked key, a stub module swapped in at build time (the
restricted data never enters the bundle), pruned public files, refused routes
(HTTP 451), or an `isWithheld()` check. Local development keeps every source.
When a licence or permission arrives, add the row's id to
`GEV_LICENCE_ON_FILE` (comma-separated) in `globe.env`, note the document in
the row below, and redeploy. `src/hosting/licences.test.mjs` fails if a row
marked **OFF** here is missing from the policy file or points at a file,
switch or check that does not exist.

## Summary

- **OFF on the hosted site (20 rows):** PortWatch (chokepoints, ports and the
  oracle's `/api/oracle/chokepoints`), OpenSky, Open-Meteo, Google News RSS,
  keyless Esri World Imagery, Cesium ion (Community plan), TomTom (free plan),
  adsbdb, the overpass-api.de instances, TeleGeography, the Bhote Koshi event
  pack, the GIIGNL matrix, TxDOT, Tallinn, Warendorf, Ontario 511 and Tark Tee
  cameras, TfL cameras until an app key is set, DriveBC cameras credited to a
  partner, and Metro Transit (Minneapolis).
- **What the invitee sees instead:** flights from adsb.lol only; chokepoint
  and port layers report "withheld" in the panel; OSM as the keyless basemap
  (Google Photorealistic 3D once the founder's key is in); no weather line on
  the data-center cards and no cockpit weather; GDELT headlines only; LNG
  terminals, US cargoes and routes without GIIGNL's country matrix.
- **Not switchable in the globe build: the console pages.** The same invitees
  see the console through the proxy, and three of its sources are not cleared:
  **Yahoo Finance via yfinance** (quotes, the NG curve, trade marks:
  NOT-ALLOWED), **Polymarket** odds (ASK-FIRST), **PortWatch** chokepoint
  tiles (ASK-FIRST); FRED series owned by third parties need their owners'
  permission. **Founder decision needed before the first invitee** (§D).
- **Founder actions that switch rows back on:** email copyright@imf.org
  (PortWatch), OpenSky, GIIGNL, TxDOT; buy Open-Meteo API Professional or keep
  weather off; a Cesium ion Commercial plan before putting a token in
  `globe.env`; register a TfL app key (`TFL_APP_KEY`, lapses its row by
  itself). Keys already planned (§15.12 step 4) carry conditions: Google's
  end-user terms notice, Geocoding and Places only over Google's own map.

## A. Live sources on the globe (DATA_SOURCES.md, live table)

| Source | id | Used for | Terms, and the decisive words | Verdict | Hosted build |
| --- | --- | --- | --- | --- | --- |
| IMF PortWatch | `portwatch` | Chokepoint transits and the Ports layer (browser-direct), and the oracle store's copy (`chokepoint_transits`, `/api/oracle/chokepoints`) | [IMF copyright and terms](https://www.imf.org/en/about/copyright-and-terms) (Wayback copy of 2026-06-25; imf.org refuses automated reads): "For any potential commercial reuse of IMF Data, please email copyright@imf.org to request permission." | ASK-FIRST | **OFF** |
| OpenSky Network | `opensky` | Primary live-flight snapshot | [OpenSky terms of use](https://opensky-network.org/about/terms-of-use): "Any use by a for-profit or commercial entity requires written permission and a license granted by the OpenSky Network." | ASK-FIRST | **OFF** |
| Open-Meteo (free API) | `open-meteo` | Weather line on the data-center cards (browser-direct); cockpit Local Info weather and weather effects (server) | [Open-Meteo terms](https://open-meteo.com/en/terms): "You may only use the free API services for non-commercial purposes"; commercial includes "Integrating our service into commercial products". Paid plans use `customer-api.open-meteo.com` with a key (ensembles need Professional) | NOT-ALLOWED | **OFF** |
| Google News RSS | `google-news` | Cockpit regional headlines (primary) | The feed's own copyright element: "made available solely for the purpose of rendering Google News results within a personal feed reader for personal, non-commercial use." | NOT-ALLOWED | **OFF** |
| Esri World Imagery (keyless) | `esri-world-imagery` | Default keyless basemap, "Esri Satellite" stack | World Imagery item under the Esri Master License Agreement; [terms summary](https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf): "If you do not have Esri software, you must purchase an ArcGIS Online subscription." Revenue-generating apps must authenticate | NOT-ALLOWED | **OFF** |
| Cesium ion (Community plan) | `cesium-ion` | Optional ion terrain and imagery with `CESIUM_ION_TOKEN` | [Cesium pricing](https://cesium.com/pricing): the free account is for "Non-commercial personal projects, or Exploratory commercial or government development" | NOT-ALLOWED (free plan) | **OFF** |
| TomTom Traffic | `tomtom` | Optional live traffic flow (`TOMTOM_API_KEY`) | [TomTom terms](https://docs.tomtom.com/legal/terms-and-conditions/): the free plan is "for Evaluation Use only"; §11.4: no "caching for the purpose of scaling results to serve multiple clients or users" | NOT-ALLOWED (free plan) | **OFF** |
| City of Austin Open Data | — | CCTV catalog and frames, Austin | [Austin open data terms](https://data.austintexas.gov/stories/s/ranj-cccq): "offered free and without restriction"; dataset licensed public domain | ALLOWED | on |
| TxDOT ITS cameras | `cctv-txdot` | CCTV, Texas districts | No reuse licence for camera images on its.txdot.gov, txdot.gov or drivetexas.org; only "Copyright 2026, Texas Department of Transportation" | ASK-FIRST | **OFF** |
| City of Tallinn ristmikud | `cctv-tallinn` | CCTV, Tallinn intersections | No licence text for the images on ristmikud.tallinn.ee | ASK-FIRST | **OFF** |
| Transpordiamet / Tark Tee | `cctv-tarktee` | CCTV, Estonia road-weather cameras | [Teekaamerate pildid](https://andmed.eesti.ee/api/datasets/slug/teekaamerate-pildid): CC BY, but access "requires registration … a unique API key" (translated); our calls are keyless | ALLOWED-WITH-CONDITIONS (key not registered) | **OFF** |
| Stadt Warendorf webcam | `cctv-warendorf` | Webcam, Marktplatz | [Warendorf Impressum](https://www.warendorf.de/de/impressum/): content may not be "vervielfältigt, verbreitet … oder Dritten zugänglich gemacht werden" without written permission | ASK-FIRST | **OFF** |
| Live Traffic NSW | — | CCTV, New South Wales | [TfNSW data licence](https://opendata.transport.nsw.gov.au/datalicence): "licensed under a Creative Commons Attribution 4.0 License". Condition: attribution (in the credits). Recommended: the licensed `api.transport.nsw.gov.au` camera API instead of the website feed, which also removes the browser User-Agent the image host needs | ALLOWED-WITH-CONDITIONS | on |
| Caltrans CWWP2 | — | CCTV, California | [Caltrans conditions of use](https://dot.ca.gov/conditions-of-use): "considered in the public domain"; the portal is for "commercial, media Information Service Providers" | ALLOWED | on |
| TfL JamCams | `cctv-tfl` | CCTV, London | [TfL transport data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) (Wayback 2026-09-16): registered users may "Exploit the Information commercially". Conditions: an app key, "Powered by TfL Open Data" and OS attribution (in the credits). The row lapses by itself once `TFL_APP_KEY` is set | ALLOWED-WITH-CONDITIONS (no key) | **OFF** |
| Ontario 511 | `cctv-ontario` | CCTV, Ontario | [511on developer resources](https://511on.ca/developers/resources): Open Government Licence, but an approved token is required and the application must name "any third parties that will receive, redistribute, display" the data | ALLOWED-WITH-CONDITIONS (no token) | **OFF** |
| Fintraffic Digitraffic weathercams | — | CCTV, Finland | [Digitraffic terms](https://www.digitraffic.fi/en/terms-of-service/): CC BY 4.0; "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY" (in the credits; `Digitraffic-User` header sent) | ALLOWED-WITH-CONDITIONS | on |
| DriveBC | `cctv-drivebc-partners` | CCTV, British Columbia | [OGL-BC](https://www2.gov.bc.ca/gov/content/data/open-data/open-government-licence-bc): commercial use allowed with the attribution statement, but third-party rights are excluded: cameras whose feed credit names a partner are dropped (`CCTV_DRIVEBC_THIRD_PARTY=0`); the others stay on | ALLOWED-WITH-CONDITIONS (partner cameras) | **OFF** |
| Open Calgary | — | CCTV, Calgary | [Open Government Licence – City of Calgary](https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa): licence "to use the Information, including for commercial purposes" with the attribution statement | ALLOWED-WITH-CONDITIONS | on |
| GBFS: Lyft systems | — | Bike share (Citi Bike, Bay Wheels, Divvy, Bluebikes, Biketown, CoGo) | [Divvy data licence](https://divvybikes.com/data-license-agreement): "distribute in your product or service and use the Data for any lawful purpose"; no Lyft marks or logos, no stand-alone republication of the raw feed (the proxy serves only the layer) | ALLOWED-WITH-CONDITIONS | on |
| GBFS: BCycle and PBSC systems | — | Bike share (Austin and others) | Feeds carry no licence fields; [GBFS spec](https://github.com/MobilityData/gbfs/blob/v3.0/gbfs.md): blank licence fields mean "the Creative Commons Universal Public Domain Dedication" | ALLOWED | on |
| MBTA / MassDOT | — | Transit vehicles, Boston | MassDOT Developers License Agreement (Wayback 2025-12): rights "to use, reproduce, and redistribute the Data"; no logos | ALLOWED-WITH-CONDITIONS | on |
| CapMetro | — | Transit vehicles, Austin | [CapMetro developer tools](https://www.capmetro.org/developertools): rights "to use, reproduce, and redistribute CMTA Data"; no marks | ALLOWED-WITH-CONDITIONS | on |
| Metro Transit (Metropolitan Council) | `transit:metrotransit-msp` | Transit vehicles, Minneapolis–St Paul | No licence on the realtime feed page; the Council's posted terms allow "personal, non-commercial use" only | ASK-FIRST | **OFF** |
| OVapi | — | Transit vehicles, Netherlands | [gtfs.ovapi.nl README](https://gtfs.ovapi.nl/README): "You are free to use this data"; identify, do not claim to represent an agency | ALLOWED-WITH-CONDITIONS | on |
| Entur | — | Transit vehicles, Norway | [Entur developer docs](https://developer.entur.org/pages-intro-setup-and-access): NLOD; `ET-Client-Name` header (sent) and "Data made available by Entur" | ALLOWED-WITH-CONDITIONS | on |
| TransLink (Queensland) | — | Transit vehicles, SE Queensland | [TransLink open data terms](https://translink.com.au/about-translink/open-data/terms-and-conditions): "licensed under the Creative Commons (CC BY)" | ALLOWED-WITH-CONDITIONS | on |
| HSL | — | Transit vehicles, Helsinki | Digitransit terms (official source repo): CC BY 4.0 with author and retrieval date | ALLOWED-WITH-CONDITIONS | on |
| adsb.lol | — | Flight fallback, military flights, traces | [adsb.lol API](https://api.adsb.lol/api/openapi.json): ODbL; "If you want to use the API for production purposes, please contact me" (courtesy: tell the operator) | ALLOWED-WITH-CONDITIONS | on |
| AISStream.io | — | Live vessels (blocked on the key, row 2) | [AISStream documentation](https://aisstream.io/documentation): no terms page; "Connect from your own server and proxy" (the proxy does) | ALLOWED-WITH-CONDITIONS | on |
| CelesTrak | — | Satellite TLEs | [CelesTrak usage policy](https://celestrak.org/usage-policy.php): "only download data once per update" (server-cached). Note: five-digit catalog numbers ran out on 2026-07-11; new objects need the CSV/JSON formats | ALLOWED-WITH-CONDITIONS | on |
| Launch Library 2 | — | Space missions | [LL2 FAQ](https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_LL2.md): 15 calls/hour; "a cache … that serves data to your clients" (15-minute server cache) | ALLOWED-WITH-CONDITIONS | on |
| USGS | — | Earthquakes | [USGS copyrights](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits): "considered to be in the U.S. Public Domain" | ALLOWED | on |
| OpenStreetMap via Overpass (main instances) | `overpass-main` | Roads, installations, ALPR locations | [Overpass commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html): "If you use the service in a commercial setting, please look for alternatives"; the community mirrors in the next row stay on | NOT-ALLOWED (operator policy) | **OFF** |
| OpenStreetMap data | — | The same layers, through overpass.private.coffee (formerly kumi.systems) | [OSM copyright](https://www.openstreetmap.org/copyright), ODbL: attribution; the mirror (listed on the [OSM wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)): "Feel free to use our service in any project … Please notify us in advance if you intend to use our service in a large scale project" | ALLOWED-WITH-CONDITIONS | on |
| Photon (komoot) | — | Keyless place search | [photon.komoot.io](https://photon.komoot.io): "please be fair - extensive usage will be throttled" | ALLOWED-WITH-CONDITIONS | on |
| Nominatim | — | Reverse geocode, last-resort search | [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/): end-user-triggered use is fine "provided that your number of users is moderate"; 1 req/s, identifying User-Agent (enforced) | ALLOWED-WITH-CONDITIONS | on |
| OSRM on FOSSGIS | — | Directions layer, voice routes | [FOSSGIS Nutzungsbedingungen](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/): commercial use allowed where routing is not "a substantial part of an online offering" (it is a minor tool here) | ALLOWED-WITH-CONDITIONS | on |
| EIA Hourly Electric Grid Monitor | — | Data-center demand lines | [EIA copyrights and reuse](https://www.eia.gov/about/copyrights_reuse.php): "You may use and/or distribute any of our data" | ALLOWED | on |
| GDELT DOC 2.0 | — | Cockpit headlines (now the only source) | [GDELT terms](https://www.gdeltproject.org/about.html): "unlimited and unrestricted use for any academic, commercial, or governmental use" with citation and link | ALLOWED-WITH-CONDITIONS | on |
| Google Map Tiles, Places, Geocoding | — | Photorealistic 3D globe, place search, nearby context (founder's key, §15.12 step 4) | [Maps Platform terms](https://cloud.google.com/maps-platform/terms): licence "to use the Services in Customer Application(s)". Conditions: logo and attributions shown; the site's terms point users to Google's end-user terms and privacy policy; Geocoding and Places results only over a Google map | ALLOWED-WITH-CONDITIONS | on (no key yet) |
| Radio Browser | — | Radio directory | [api.radio-browser.info](https://api.radio-browser.info): "You may use it in free and non free software"; streams are the broadcasters' | ALLOWED-WITH-CONDITIONS | on |
| Re:Earth Terrain / Mapterhorn | — | Keyless terrain | [terrain.reearth.land](https://terrain.reearth.land): CC BY 4.0, best effort | ALLOWED-WITH-CONDITIONS | on |
| NASA FIRMS | — | Active fires (`FIRMS_MAP_KEY`) | [NASA data use](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance): NASA mission data "are licensed as Creative Commons Zero (CC0)" | ALLOWED-WITH-CONDITIONS | on |
| OpenStreetMap ALPR locations (DeFlock mapping) | — | ALPR layer | ODbL, as the OSM data row | ALLOWED-WITH-CONDITIONS | on |

## B. Bundled datasets (DATA_SOURCES.md, bundled table)

| Source | id | Used for | Terms, and the decisive words | Verdict | Hosted build |
| --- | --- | --- | --- | --- | --- |
| TeleGeography Submarine Cable Map | `telegeography` | Submarine cables layer | Bundled under CC BY-NC-SA 3.0; the [licence page](https://www2.telegeography.com/license-telegeography-map) now says "Access to the underlying databases remains restricted to paying subscribers" | NOT-ALLOWED | **OFF** |
| Bhote Koshi event pack (Vantor crops, GeoPera centreline) | `bhote-koshi` | Nepal flood scene | CC BY-NC 4.0: "NonCommercial means not primarily intended for or directed towards commercial advantage" | NOT-ALLOWED | **OFF** |
| GIIGNL Annual Report matrix | `giignl` | LNG country-to-country arcs | Report p. 2: "Under no circumstances shall they be regarded as data or maps intended for commercial use. Reproduction … prohibited without prior consent" | ASK-FIRST | **OFF** |
| GEM Global Gas Infrastructure Tracker | — | LNG terminals | [GEM licence](https://globalenergymonitor.org/creative-commons-public-license/): CC BY 4.0, cite "Global Gas Infrastructure Tracker, Global Energy Monitor, [release date]" | ALLOWED-WITH-CONDITIONS | on |
| EIA LNG trains, DOE cargoes | — | LNG plants and US cargoes | [DOE web policies](https://www.energy.gov/about-us/web-policies): "in the public domain" | ALLOWED | on |
| searoute-ts, Eurostat network | — | Modelled LNG routes | MIT; [Eurostat reuse](https://ec.europa.eu/eurostat/en/help/copyright-notice): "commercial or non-commercial purposes is authorised provided the source is acknowledged" | ALLOWED-WITH-CONDITIONS | on |
| Epoch AI Data Centers | — | US data centers | [epoch.ai](https://epoch.ai/data/data-centers): "free to use, distribute, and reproduce provided the source and authors are credited" | ALLOWED-WITH-CONDITIONS | on |
| EIA gas network, NACEI crossings | — | Gas pipelines and border crossings | EIA linework is public domain; the ArcGIS copy is wrapped in the Esri MLA, so re-source from EIA's Energy Atlas at the next rebuild; NACEI under [OGL-Canada](https://open.canada.ca/en/open-government-licence-canada) "including for commercial purposes" | ALLOWED-WITH-CONDITIONS | on |
| BSEE platform production | — | Gulf platforms | [BSEE disclaimer](https://www.bsee.gov/disclaimer): "public information and may be distributed or copied" | ALLOWED | on |
| NDIC DMR monthly production | — | Williston wells | [DMR disclaimer](https://www.dmr.nd.gov/oilgas/disclaimer.asp): free workbooks; only the paid subscription is restricted (do not duplicate it) | ALLOWED | on |
| OSM extracts (datacenters, dams) | — | Data centers, dams | ODbL: "Publicly … means to Persons other than You"; attribution, and the derived database offered under ODbL (it is, in this public repository) | ALLOWED-WITH-CONDITIONS | on |
| Natural Earth | — | Named regions for voice | [Terms](https://www.naturalearthdata.com/about/terms-of-use/): "No permission is needed" | ALLOWED | on |
| DataSF Analysis Neighborhoods | — | SF neighborhoods for voice | PDDL: "imposes no restrictions on your use" | ALLOWED | on |
| CCTV ground heights | — | Camera placement | Derived by this project from Google tiles at build time; heights only, no Google content | ALLOWED | on |

## C. UPGRADE.md free tier and planned sources (none built yet)

A planned source enters §A or §B, with its row in `licencePolicy.js` if it
is not cleared, **before** it ships to the hosted site.

| Source | id | Planned for | Terms, and the decisive words | Verdict | Hosted build |
| --- | --- | --- | --- | --- | --- |
| FracFocus | — | Row 12 completions | [FracFocus terms](https://fracfocus.org/terms): bulk data "may be used without restriction" but "may not be altered in any way"; no scraping of disclosure search (site terms bar commercial use of the site) | ALLOWED-WITH-CONDITIONS (bulk file, shown as filed) | not built |
| Petrinex (Alberta, Saskatchewan) | — | Row 12 Canada | [Petrinex terms](https://www.petrinex.ca/terms): "for commercial purposes, arrange first for consent" | ASK-FIRST | not built |
| AER ST37 well list | — | Row 12 Canada | [AER copyright](https://www.aer.ca/copyright-and-disclaimer): commercial redistribution "prohibited except with prior written permission" | ASK-FIRST | not built |
| BC Energy Regulator | — | Row 12 Canada | [BC-ER terms](https://www.bc-er.ca/terms); well layers "Access Only": "reproduction is not permitted without written permission" | ASK-FIRST | not built |
| Texas RRC | — | Row 12 Texas | [RRC site policies](https://www.rrc.texas.gov/site-policies): permission "for noncommercial use" only | ASK-FIRST | not built |
| Baker Hughes rig count | — | Row 12 rigs | FAQ (search snippet only; the site blocked every read): use permitted "provided that Baker Hughes and this website are cited" | ALLOWED-WITH-CONDITIONS (unverified) | not built |
| ONRR production | — | Row 12 backdrop | CC0 (catalog.data.gov) | ALLOWED | not built |
| USGS aggregated drilling history | — | Row 12 backdrop | ScienceBase metadata: use constraints "None" | ALLOWED | not built |
| Argentina Secretaría de Energía | — | Later ladder | datos.gob.ar: CC BY 4.0 | ALLOWED-WITH-CONDITIONS | not built |
| Colombia ANH | — | Later ladder | datos.gov.co: CC BY-SA 4.0 (share-alike reaches derived datasets) | ALLOWED-WITH-CONDITIONS | not built |
| UN Comtrade (free tier) | — | Stream 4 flows | [Comtrade FAQ](https://uncomtrade.org/docs/faqs-on-use-and-re-dissemination): a paid licence is required for "For-profit data visualization and/or analytics applications" | NOT-ALLOWED | not built |
| JODI | — | Stream 4 balances | [JODI terms](https://www.jodidata.org/terms-of-use.aspx): "All such rights are reserved" | ASK-FIRST | not built |
| ENTSOG Transparency Platform | — | Stream 4 EU flows | T&C TRA0394-16: use "in good faith"; dated citation "ENTSOG TP [DD-MM-YYYY]" | ALLOWED-WITH-CONDITIONS | not built |
| OGIM (EDF) | — | Stream 5 infrastructure | Zenodo: CC BY 4.0 (not a way around "Access Only" upstream layers) | ALLOWED-WITH-CONDITIONS | not built |
| GIE AGSI+ / ALSI | — | Stream 6 EU storage | API manual: "can be used or repackaged in any way … a clear indication on GIE as data source is mandatory"; free key | ALLOWED-WITH-CONDITIONS | not built |
| EIA API v2 | — | Streams 6 and 10 | As the EIA row: public domain; free key | ALLOWED-WITH-CONDITIONS | not built |
| NASA GIBS | — | Stream 7 overlays | [GIBS docs](https://nasa-gibs.github.io/gibs-api-docs/): open, acknowledgement requested | ALLOWED | not built |
| RainViewer | — | Row 3 radar | [RainViewer API](https://www.rainviewer.com/api.html): "available for personal and educational use only" | NOT-ALLOWED | not built |
| NOAA NHC, NWS alerts | — | Row 3 overlays | [NWS disclaimer](https://www.weather.gov/disclaimer): public domain | ALLOWED | not built |
| GDACS | — | Stream 9 | GDACS terms plus the EU CC BY 4.0 default; credit and disclaimer | ALLOWED-WITH-CONDITIONS | not built |
| ACLED | — | Stream 9 | [ACLED EULA](https://acleddata.com/eula): commercial entities need "a corporate license" | NOT-ALLOWED | not built |
| Windy API | — | Stream 7 | [Windy API terms](https://account.windy.com/agreements/windy-api-map-and-point-forecast-terms-of-use): the trial is "for development purposes only"; paid private apps cover the user and employees only | NOT-ALLOWED | not built |
| S&P Global, Morningstar connectors | — | Oracle ingest | Licensed per user; showing invitees needs display rights in the contract | NOT-ALLOWED until the contract says so | not built |
| Paid vendors in UPGRADE.md (Kpler … Baltic Exchange) | — | Upgrades | Any contract must name display to named third-party users (pilot clients), not only employees | — | not built |

## D. Oracle console sources seen through the proxy (outside the globe build)

The console pages (`/market`, `/gas`, `/weather`, `/trades`) are served to
the same invitees. The globe build cannot switch these off; the console
(oracle FR-D17) or the founder must decide before the first invitee: hide the
uncleared panels for viewers other than the founder (the proxy already sends
the verified email as `X-Oracle-User`), license the feeds, or keep invitees
off the console pages.

| Source | id | Console use | Terms, and the decisive words | Verdict | Hosted build |
| --- | --- | --- | --- | --- | --- |
| Yahoo Finance via yfinance | — | Delayed CL/BZ/NG quotes, the NG curve, trade marks | [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html): no automated collection "without our express, prior permission"; yfinance: "intended for personal use only" | NOT-ALLOWED | console: decide |
| Polymarket | — | Oil event odds | [Polymarket terms](https://polymarket.com/tos) (11 Aug 2026): no commercial exploitation of the data toward any "Capital Market Client" (includes financial technology companies) | ASK-FIRST | console: decide |
| IMF PortWatch (store copy) | — | Chokepoint tiles and brief lines | As the PortWatch row in §A | ASK-FIRST | console: decide |
| FRED | — | Macro covariates | [FRED API terms](https://fred.stlouisfed.org/docs/api/terms_of_use.html): series owned by third parties need the owner's permission for use beyond personal use | ALLOWED-WITH-CONDITIONS (check each series' notes) | console: check |
| ECMWF AIFS ENS (GRIB direct) | — | GWDD fan, basin freeze; the globe's Williston basin line | [ECMWF open data](https://www.ecmwf.int/en/forecasts/datasets/open-data): "may be redistributed and used commercially, subject to appropriate attribution" (credit ECMWF) | ALLOWED-WITH-CONDITIONS | on |
| NOAA GEFS, GHCN, CPC | — | Degree days, basin observations | Public domain | ALLOWED | on |
| GDELT (oracle wire) | — | Headline wire | As the GDELT row in §A | ALLOWED-WITH-CONDITIONS | on |
| CFTC COT, EIA, OFAC, BSEE | — | Positioning, stocks, sanctions, shut-ins | Public domain | ALLOWED | on |

Not covered by this pass (console-only, not listed in DATA_SOURCES.md or
UPGRADE.md): the Windy embed on `/weather`, the GPR index, arXiv metadata.
They belong to the oracle's own `SOURCES.md` review.

## E. Hosts the code calls that DATA_SOURCES.md does not list

| Source | id | Used for | Terms, and the decisive words | Verdict | Hosted build |
| --- | --- | --- | --- | --- | --- |
| adsbdb.com | `adsbdb` | Aircraft type and callsign-route enrichment (`/api/adsbdb`) | No data licence; route data "may not be copied, published, or incorporated into other databases without the explicit permission of David J Taylor" | ASK-FIRST | **OFF** |
| OSM standard tiles (tile.openstreetmap.org) | — | The "OSM" map stack, now the keyless default | [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/): allowed with visible attribution and a real User-Agent/Referer (browser-direct), no bulk or offline use; "access may be withdrawn at any point" | ALLOWED-WITH-CONDITIONS | on |
| overpass.private.coffee / overpass.kumi.systems | — | Overpass mirrors | See the OSM data row in §A | ALLOWED-WITH-CONDITIONS | on |
