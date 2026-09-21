# PLAN — Commodities Globe: rules, features and layout for rows 1 to 8

**Version:** 1.3 · **Date:** 2026-09-21 · **Status:** decisions locked in the
2026-09-17 grill; built so far — rows 0a, 0b, 1 (milestone 1), 4 (substrate)
and 8 (v3), see the §0 ledger for commits; row 3 re-specced in the
2026-09-21 weather grill (§11)
**Owner:** Jack Gewirz
**Companions:** [`COMMODITIES.md`](COMMODITIES.md) (verified endpoints, source
notes), [`../UPGRADE.md`](../UPGRADE.md) (paid enhancement per stream)

This plan does what the oracle's PRDs do: §0 is the ledger and the ledger is
the lock. Claim a row before touching its files. Two sessions share this
clone; the session in the worktree owns row 1, the session in the main tree
owns layers. Re-check `git status` before every edit to a shared file.

---

## 0. Status ledger

| Row | Work item                                        | Lane                                 | Status (2026-09-21)                                                                                 |
| --- | ------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 0a  | `commodity-chokepoints` layer                    | layers                               | **BUILT** — commit `7400360`, pushed to origin and mirror; markers pinned to a bundled gazetteer in `f238b66` (merged here as `fa8132f`, not pushed) |
| 0b  | `commodity-ports` layer                          | layers                               | **BUILT** — commit `f042155`, merged into `commodities`, pushed to origin and mirror; markers pinned in `f238b66` (merged here as `fa8132f`, not pushed); retrofit to the row-1 contract pending |
| 1   | Shell, observation contract, hover, class groups | shell (worktree `commodities-shell`) | CLAIMED 2026-09-17 — PRD §7; worktree `commodities-shell` on `feat/commodities-shell`; milestone 1 (observation contract) BUILT 2026-09-18, four gates green; next: milestone 2, retrofit 0a and 0b |
| 2   | `commodity-tankers`                              | layers                               | BLOCKED — AISStream rejects the saved key; verify or rotate on the Account page, enter via POWER UP |
| 3   | Weather forecast and overlays (`weather-forecast` first) | layers                               | **SPECCED 2026-09-21** — PRD §11 from the weather grill (W1 to W9): AIFS ENS via Open-Meteo at the six basins, two market regions and the Gulf, browser-direct, keyless, token `3`; six milestones (point layer → asset-card lines → WN2 challenger → AIFS field → truth overlays → beyond the US). Not claimed; cut `feat/weather-forecast` from `feat/commodities-shell`; needs no key |
| 4   | `commodity-gas-flows`, gas cross-border crossings | layers                               | **BUILT (substrate) 2026-09-21** — PRD §10. Data layer `f665031`: `scripts/build-gas-bundle.mjs` + `src/data/local_data/eia_energy/` (32,892 features to 234 systems; 99 filings to 60 marks) and the `src/layers/gasFlows/` pure modules. Render layer `4919e03`: PENCIL pips and hairline, token `l`, GRID off by default after the milestone-5 gate breached (~500 MiB to draw; `scripts/qa-gas-flows.mjs` 18/18). Four gates green at every commit. Open: no UI chip calls `setNetworkEnabled` yet. Volumes: decided 2026-09-21 to bundle EIA's keyless dnav monthly point-of-entry series (POE1 imports, POE2 exports, 1973 → 2026-06, verified) instead of waiting for an API key, which becomes the refresh path; milestone 1 is re-scoped accordingly and follows row 11's first slice |
| 5   | News pinned to assets                            | layers + server                      | OPEN — needs the assets from row 4                                                                  |
| 6   | Trade-flow arcs                                  | layers + server                      | OPEN                                                                                                |
| 7   | Episode scene packs                              | content                              | OPEN — the only oracle bridge, offline and per episode                                              |
| 8   | `energy-datacenters`, US power load, bundled   | layers (worktree `commodities-datacenters`) | **BUILT** — v1 (five sites) `4ab9c96` on `feat/energy-datacenters`, PRD §8; v2 cards `76a334e`/`8f758b3`; v3 `1ccf37f` (2026-09-21, on `feat/commodities-shell`): fifteen sites, live EIA-930 grid and Open-Meteo weather on the cards and dossier, `/api/epoch/` proxy (no consumer yet — the refresh script is still open) |
| 9   | Port dossier: camera + data panel, 20 ports   | layers + server + content (worktree `commodities-ports-dossier`) | OPEN — PRD §9 written 2026-09-17 from the grill (G1 to G6); not claimed; cut `feat/port-dossier` from `feat/commodities-shell` |
| 10  | `commodity-lng`: LNG terminals, tiered cards, sea-routed cargo arcs | layers (worktree `commodities-lng`) | **CLAIMED 2026-09-21** — PRD §12 (mirror: Project Brain `05-prd.md`), decided in the 2026-09-21 grill (13 questions, all on the recommended branch). Worktree `commodities-lng` on `feat/commodity-lng`, cut from `feat/commodities-shell` at `a7245f2`; dev server 4175. Next: milestone 1 (bundle: GEM Sept 2025 terminals, EIA 2026-Q2 train table, DOE cargoes to Jun 2026, GIIGNL 2025 matrix, `searoute-ts` routes). Merges into `feat/commodities-shell`; `commodities` moves with row 1 m2 |
| 11  | Gas production facilities: Gulf platforms (BSEE) first | layers + content (shell worktree, `feat/commodities-shell`) | **BUILT (first slice) 2026-09-21** — PRD §13 from the founder's pivot and grill; on `feat/commodities-shell` (founder's instruction: every update on the shell branch, no row worktree), token `2`. Milestone 1 `c6c92b2`: `scripts/build-gulf-platforms.mjs` + `src/data/local_data/bsee_gulf/` (1,315 installed structures, 120-month series, 608 KB gzip), the completeness rule and the one record shape. Milestone 2 `1e685f0`: marks sized by gas share and coloured by change against last year, three tiers, hover and selected cards, the panel line, `scripts/qa-gulf-platforms.mjs`. Milestone 3 `af342d1`: the dossier (ten-year chart, this-month ledger, identity, lifetime, sources) and the drawer chrome shared with the datacenters; QA 20 checks green (layer activation 755 ms apart from the bundle fetch, heap +50 MiB). Milestone 4 is the commit carrying this line. Four gates green at every commit. Next: milestone 5 (EIA regional backdrop, short grill first) |

Definition of usable, pending founder confirmation of question 13: rows 1
through 4. Rows 5 to 7 are context and content.

---

## 1. Purpose

The globe is a **live view of the systems that affect the commodities market**,
oil and gas first, running **locally for one user** inside a **SaaS-shaped,
multi-page dashboard**. The globe is the physical page. The Oil Oracle's
console pages (market, gas, weather, trades, chat) are sibling pages under the
same origin. No number is duplicated between pages: the globe computes its own
readings from its own live sources, and the oracle's numbers live on the
oracle's pages.

---

## 2. Rules

Every rule below was decided in the grill. The question number is the
provenance; change a rule by re-opening its question, not by drifting.

### 2.1 Product rules

| #   | Rule                                                                                                                                                                                                                                                                      | From     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | Local host, one user, SaaS-shaped interface. No tenancy, billing or public deployment in v1. Free-tier and non-commercial sources are therefore legal; the swap list for a second user is `UPGRADE.md`.                                                                   | Q1, Q8   |
| R2  | Every layer declares one **freshness class**: `live` (observation under 15 minutes old), `daily` (under 24 hours), `published` (older, including static reference datasets, whose "as of" is their vintage). All classes go on the map; none is hidden.                   | Q2       |
| R3  | Every observation carries its own timestamps: `observedAt` (when the thing happened or was measured), `validAt` (forecasts only), `publishedAt` (when the source released it), `fetchedAt` (when we read it). Cards show the observation time, never only the fetch time. | Q2       |
| R4  | Hover cards exist on **commodity layers only**. Upstream layers keep their click cards.                                                                                                                                                                                   | Q3       |
| R5  | **Hover is the quick look**: name, observation timestamp with age, headline number. **Click is the full card**, as today. Hover stays silent while a tool or the cockpit owns the pointer, the same rule click follows.                                                   | Q6       |
| R6  | The shared observation contract and hover service are built **before any further layer**, and rows 0a and 0b are retrofitted to it.                                                                                                                                       | Q5       |
| R7  | The globe is **physical only**. Oracle prices, risk indices and briefs appear on their own pages, never on the map. The one bridge is row 7: dated episodes exported once each as scene packs.                                                                            | Q7       |
| R8  | **This repo is the shell.** The Vite dev server proxies the console's pages under one origin; a shared navigation strip appears on every page. The console-side change (relative links plus the strip) gets its own ledger row in the oracle repo before anyone edits it. | Q9       |
| R9  | The layer panel shows freshness as **three class-named groups**: `Commodities · Live`, `Commodities · Daily`, `Commodities · Published`. Every row's meta line is its "as of" stamp.                                                                                      | Q11      |
| R10 | Tankers are a **separate commodity layer** reading the same AIS snapshot; upstream Live Vessels is untouched. Enabling both draws tankers twice, and the panel says so.                                                                                                   | Q12      |
| R11 | Descriptive, never signals. Cards show counts, deviations, percentiles and timestamps. No panel recommends anything. Matches the oracle's standing mission gate.                                                                                                          | standing |
| R12 | Free first. Each stream ships on a keyless or free-key source; paid providers slot in behind the same source contract per `UPGRADE.md`. Keys are server-side only, entered through POWER UP, never pasted into chat.                                                      | standing |
| R13 | Additive to upstream. New code lives in new layer families, new panel groups and new providers so `git pull upstream main` merges clean. Upstream layer internals are not edited.                                                                                         | standing |

### 2.2 Engineering rules (what CI and the tests actually enforce)

- Adding a layer touches, in this order: `src/layers/<family>/`,
  `src/app/layers/<family>.js`, `src/sources/reference.js` or
  `src/standalone/layerSources.js`, `src/app/constructCatalog.js`,
  `src/data/layerState.js` (alphabetical, single-character token),
  `src/ui/layerPanel.js`, `scripts/package-boundaries.json` (insert lines
  textually in `application-components`, `application-layer-construction`,
  and `reference-sources`), `DATA_SOURCES.md`, `src/data/dataCredits.js`.
- Three tests pin counts and must move with each layer:
  `constructCatalog.test.mjs` (layer count), `layerState.test.mjs` (registry
  count and alphabetical order), `reference.test.mjs` (source keys).
- Gates before any commit: `npm run format`, `npm run check:boundaries`,
  `npm test` (about 3.5 minutes), `npm run build`.
- Portable modules (`source.js`, `records.js`) never import Cesium or touch
  browser globals; `index.js` and `model.js` may.
- ArcGIS feature services cap a page at 1,000 rows regardless of the request;
  follow `exceededTransferLimit`. Cesium drops outlines on terrain-clamped
  ellipses; draw rings as clamped polylines.
- Markers are pinned at a fixed height (`HeightReference.NONE` with the depth
  test disabled), never `CLAMP_TO_GROUND`: a clamped point re-seats itself on
  every terrain refinement and visibly hops under a tilted camera while the
  ground-draped ring stays put. Fixed reference geometry (the chokepoint
  gazetteer) is created once at init; a refresh only restyles it.
- Every layer ships with a headless render check (the pattern in
  `.gev-logs/render-chokepoints.mjs`): dismiss the first-run dialog, pin the
  camera, enable the layer, wait for `getStats().count`, screenshot, click.
- The voice tool enums are hash-pinned; adding commodity layer ids to voice is
  one deliberate change that updates the digest, not part of any layer row.

---

## 3. Layout

### 3.1 The shell

One origin, `http://localhost:4173`. A fixed navigation strip at the top of
every page:

```
GLOBE   MARKET   GAS   WEATHER   TRADES   CHAT ▾            mirror as of 13:02Z · LIVE
```

| Route                                    | Served by                         | Page                                                           |
| ---------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `/`                                      | this app                          | the globe, full-screen, HUD as today                           |
| `/market`                                | console `/` on port 8011, proxied | price strip, situation brief, causal market map, driver panels |
| `/gas`                                   | console `/gas`                    | gas fundamentals                                               |
| `/weather`                               | console `/weather`                | weather terminal, GWDD hero, Windy panel, basin band           |
| `/trades`                                | console `/trades`                 | trade tracker                                                  |
| `/ask`, `/logs.json`, `/trade`, `/grill` | console, proxied                  | chat and live ops endpoints the console pages call             |

The strip is the only shared chrome. Each page keeps its own theme: the globe
stays dark, the console keeps its light LEDGER sheet. The right end of the
strip shows the oracle mirror age from `/logs.json` so every page states how
old its numbers are. `oracle.cmd` in the oracle repo gains one line so the
whole dashboard is one command: pull, tunnel, console, globe, browser.

### 3.2 The globe page

- **Data Layers panel.** Three commodity groups first, in class order, then the
  upstream groups untouched:

  ```
  Commodities · Live         🛢 Tankers               observed 38s ago
                             📰 News on assets         seen 4m ago
  Commodities · Daily        🌩 Storms & alerts        issued 12:00Z
                             ☁ Satellite & radar      frame 12:50Z
                             🌡 Basin forecasts        issued 06Z · valid 15d
  Commodities · Published    ⚓ Chokepoints            as of 2026-09-13 · 4d lag
                             🚢 Ports                  as of 2026-09-11 · 6d lag
                             🛢 Pipelines & plants     vintage 2025
                             ⇄ Trade flows            period 2026-07
  ```

- **Hover card** (compact, R5), anchored above the thing, drawn on the shared
  overlay canvas in the layer's status colour:

  ```
  STRAIT OF HORMUZ
  as of 2026-09-13 · published 4d ago
  1.4 tankers/day · -65% vs 90d
  ```

  For a live object the second line reads `observed 12:04:31Z · 38s ago`; for a
  forecast, `issued 00Z 09-17 · valid 09-18`.

- **Click card** (full, as today): title with headline number, every field the
  layer holds, provenance line with source and lag, plus what the layer adds
  (history for a chokepoint, track for a tanker, headline list for news).

- **Legend chip** in the panel footer for the shared status colours: red
  collapse, amber down, blue normal, green up, lime surge, grey unknown.

- **Time control** (row 3 only): a small scrubber in the radar and satellite
  row controls stepping through the available frames; the frame time is the
  card timestamp.

### 3.3 Status colours and rings

Shared by every commodity layer so the eye learns one vocabulary: a ring or
marker sized by the baseline, a filled share for what is moving now, a colour
for the deviation band (collapse ≤ -40, down ≤ -20, normal, up ≥ +20, surge
≥ +40, unknown when no baseline).

---

## 4. Features by row

### Row 1 — Shell, observation contract, hover, class groups (FR-G1)

**Files.** `src/layers/commodities/observation.js` (pure), `src/app/hoverCards.js`,
`src/ui/layerPanel.js` (groups), `server/standalone/vite.config.js` (proxy),
`index.html` and `src/shell/nav.js` (strip). Retrofit: chokepoints and ports.

**Contract.** `createObservation({ observedAt, validAt, publishedAt, fetchedAt, freshnessClass, source, headline, fields })`
returns a frozen record; `freshnessClassFor(observedAt, now)` derives the class
from age; `formatAsOf(observation)` renders the stamp used by the panel, the
hover card and the click card so the three can never disagree. Layers expose
`freshnessClass` and `getStats().asOf`; context records carry `observation`.

**Hover.** One service, installed once by the app: picks at most ten times a
second on pointer move, resolves the entity to a commodity context record,
publishes one compact overlay entry under source id `commodity-hover`, clears
on leave, yields while the pointer is owned.

**Shell.** Vite `server.proxy` forwards the console routes in §3.1 to
`http://127.0.0.1:8011`. The strip is plain HTML and CSS, no framework.
Console-side: links relative, strip rendered, one ledger row in
`PRD-market-console.md`.

**Acceptance.** Unit tests for the contract and stamp formatting; a headless
render shows the hover card on a chokepoint and the full card on click; the
panel shows the three groups with "as of" stamps; `/market` renders through
the proxy with the strip; all CI gates green.

### Row 2 — Tankers (FR-G2)

**Layer.** `commodity-tankers`, class `live`. Source: the existing AISStream
snapshot through `/api/ais-live`, filtered to ship types 80 to 89 (crude,
product, chemical, LNG and LPG carriers). One websocket, shared with upstream.

**Draws.** A chevron per tanker oriented by course, coloured by speed band
(underway, slow, stopped), sized by nothing (hulls are hulls). Each tanker is
tagged with the chokepoint ring or port it is inside or the one it is
approaching within a set distance.

**Adds.** A live count per chokepoint: tankers inside the ring now versus the
published baseline rate, shown as a second line on the chokepoint card. This
is the reading the oracle cannot make.

**Cards.** Hover: name, observed time and age, speed and course. Click: MMSI,
IMO, type, destination, draught when present, position history from the
server's track endpoint, nearest chokepoint or port.

**Blocked on** a working AISStream key. Double-draw note in the panel meta.

### Row 3 — Weather forecast and overlays (FR-G3)

Re-specced 2026-09-21; the PRD is §11. The forecast point layer ships first;
the observational overlays follow as milestone 5.

| Layer id            | Shows                                                                                                                                                                                                                                                                                       | Source                                                                                                                                                                           | Class                                | Milestone |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------- |
| `weather-forecast`  | six basins, two market regions and the Gulf as pinned markers: 15-day minimum-temperature ensemble p10, p50, p90 and spread, a labelled freeze-day count, region degree days, Gulf gusts and waves; colour by anomaly against bundled ERA5 normals, ring by spread, disc by threshold share; a lead-day stepper | Open-Meteo ensemble API `ecmwf_aifs025_ensemble` (51 members), the model metadata file for the issue time, the marine API for the Gulf; gazetteer built from the oracle's yaml | daily                                | 1         |
| asset-card lines    | one forecast line on the campus, crossing and US port cards through a shared service                                                                                                                                                                                                        | the same request                                                                                                                                                                 | daily                                | 2         |
| `WN2` row control   | Google WeatherNext 2 as a challenger ring and a `vs WN2` card line, off by default                                                                                                                                                                                                          | Open-Meteo `google_weathernext2_ensemble` (64 members)                                                                                                                           | daily                                | 3         |
| `weather-field`     | CONUS AIFS ENS field: p50 minimum, spread, freeze share, gust per lead day as an imagery overlay under the same stepper                                                                                                                                                                       | dynamical.org Zarr copy of AIFS ENS, reduced nightly by a Node script, served from the cache                                                                                     | daily                                | 4         |
| `weather-storms`    | hurricane forecast cones, tracks, wind radii                                                                                                                                                                                                                                                | NHC ArcGIS layers                                                                                                                                                                | daily (advisory cadence)             | 5         |
| `weather-alerts`    | active watches and warnings as polygons                                                                                                                                                                                                                                                     | NWS API, User-Agent required                                                                                                                                                     | live                                 | 5         |
| `weather-satellite` | GOES GeoColor clouds, IMERG precipitation rate                                                                                                                                                                                                                                              | NASA GIBS WMTS tiles                                                                                                                                                             | live (frames every 10 to 30 minutes) | 5         |
| `weather-radar`     | composite radar, 13 past frames                                                                                                                                                                                                                                                             | RainViewer tiles                                                                                                                                                                 | live                                 | 5         |
| `weather-official`  | optional: NWS NDFD temperature grids as an ArcGIS imagery layer, labelled the official forecast                                                                                                                                                                                             | `mapservices.weather.noaa.gov/raster/…/NDFD/NDFD_temp`, browser-direct                                                                                                            | daily                                | 5         |

**Mechanism.** Point readings are browser-direct and keyless; the field is a
cached bundle behind a provider; imagery overlays own a Cesium imagery layer
above the basemap, the precedent being the Nepal event pack. Every reading
carries `observedAt` (issue), `publishedAt` (availability), `validAt` (the
selected day) and `fetchedAt`; the stepper sets which day is shown and never
triggers a fetch.

**Cards.** Hover on a basin: name, issued and valid stamp, p10 and p50
minimum, the freeze-day count with its heuristic threshold. Click: the
fifteen-day fan with the threshold and the normal, a table by day,
provenance. Hover on a cone: storm name, advisory time, category. Alerts:
event type, effective and expires.

### Row 4 — Gas cross-border flows on the bundled pipeline network (FR-G4)

**Superseded.** This row read "Pipelines and plants, bundled" — two static,
vintage-stamped layers covering gas and crude together. The 2026-09-18 grill
replaced it with a gas-first row whose headline objects are live, and a
same-day live-probe pass built the PRD out. Reversal and reasoning in the
Project Brain's `20-decisions.md`.

**Scope.** The named US border gas crossings, Canadian and Mexican, carrying
EIA's monthly point-of-entry volumes in both directions, drawn on the US
transmission network bundled from EIA as deliberately inert context. Plants
are milestone 9, the crude sibling milestone 10. The row is not widened into
the wellhead-to-burner-tip chain.

| Layer id             | Shows                                                                  | Class     |
| -------------------- | ---------------------------------------------------------------------- | --------- |
| `commodity-gas-flows` | ~40–50 named crossings: area = gross MMcf, ink = direction, colour = five-year same-month band; on a 1 px, unclickable January-2020 network | published |

**The organising principle.** A hard partition between what is *measured*
(EIA monthly volumes, the only current directional number in the row) and
what is *merely mapped* (NACEI 2017 crossings, the January 2020 network).
Only a measured volume may vary anything on screen — enforced by deleting the
stale attribute fields at ingest and by encode functions that throw on a
non-EIA-volume record, not by convention.

**Built so far.** The data layer — the build scripts, the bundled geometry and
the portable transforms with their tests — landed as `f665031`; the PENCIL
render substrate (pips, hairline, GRID off by default) as `4919e03`, both on
`feat/commodities-shell` with the four gates green at each commit.
Everything from the EIA provider onward is blocked on milestone 1, a free API
key.

**Read §10 before touching this row.** It carries the corrections table, the
full visual and interaction specification, the eleven milestones and the
blocking risks.

### Row 5 — News pinned to assets (FR-G5)

**Server.** `server/providers/gdelt.js`: GDELT DOC queries per asset keyword
group, 15-minute cache, one query per minute ceiling, body cap, sanitized
errors. `server/providers/gdacs.js` optional; PortWatch's GDACS point layer
covers disasters keylessly.

**Gazetteer.** `src/layers/news/gazetteer.js`: keyword sets per asset id
(chokepoints, ports, terminals, refineries, basins, pipelines), built from the
row 0 and row 4 datasets. Headlines pin to the asset they name; unmatched
headlines are not drawn.

**Layer.** `commodity-news`, class `live` (15-minute cadence). A badge on the
asset with the headline count for the window; badge intensity by count.

**Cards.** Hover: latest headline and when GDELT saw it. Click: the window's
headlines with domain and link, marked UNVERIFIED WIRE as the oracle does.

### Row 6 — Trade-flow arcs (FR-G6)

**Data.** EIA crude imports by origin country (monthly, free EIA key entered
through POWER UP), EIA natural gas trade by point of entry, UN Comtrade
preview (annual, numeric partner codes, through a proxy with an M49 table),
ENTSOG EU interconnection flows.

**Layer.** `commodity-flows`, class `published`. Great-circle arcs from origin
centroid to destination port or border point, width by volume, colour by
product. Period stamped on every arc.

**Cards.** Hover: origin, destination, period, volume. Click: twelve-month
history for that pair.

### Row 7 — Episode scene packs (FR-G7)

**Source.** The oracle's reviewed episodes. A one-time export per episode in
the oracle repo, `tools/globe_episode_export.py`, writes a Director scene
document plus GeoJSON data packs of the physical state for that window:
chokepoint rings with that week's deviation, disruption polygons, storm
tracks, and the episode's PRICE FINGERPRINT as a text card. Assets land under
`public/scene-assets/episodes/<episode-id>/` with attribution.

**First four.** Hormuz closure 2026, Red Sea 2023, Colonial Pipeline 2021,
Uri freeze 2021. Each is a camera flight: overview, the constrained system,
the physical layers frozen to the date, the fingerprint card.

**Class.** Replay. Scene playback already stamps shot time; the packs carry
`observedAt` for the window they represent.

### Row 9 — Port dossier: camera and data panel for 20 ports (FR-G9)

**Panel, not a layer.** Clicking one of the twenty ports in §9.6.1 opens a
right-hand dossier panel: a camera still through the existing CCTV proxy (or
the day's NASA GIBS tile when no public camera exists), then flow versus
baseline with a 90-day chart, calls by class, trade role, disruptions,
weather at the berth, headlines and an "about". Static facts are built once
by `scripts/build-port-dossiers.mjs` into
`src/data/local_data/port_dossiers/`; live sections are fetched on click.

**Files.** `config/port_dossiers.seed.json`, `config/cctv_sources.ports.json`,
`server/providers/cctv/portSources.js` (one registration line upstream),
`server/providers/portNews.js`, `src/layers/ports/dossier.js` (pure),
`src/app/portDossier.js`, `src/ui/portDossierPanel.js`.

**Cards.** Hover unchanged (row 1). Click: the existing overlay card plus the
panel. Ports outside the twenty: unchanged.

**Acceptance.** PRD §9.4; headless check on Singapore (camera or satellite),
Ras Tanura (satellite) and a port outside the twenty (no panel).

### Row 10 — LNG terminals, tiered cards and sea-routed cargo arcs (FR-G10)

**Layer.** `commodity-lng`, class `published`, one panel row `LNG · Terminals
& Cargoes` with chips EXPORT, IMPORT, ROUTES. Liquefaction and regas
terminals worldwide (GEM, Sept 2025; operating and under construction only),
US export plants joined to the EIA quarterly train table and the DOE
cargo-level export file; arcs in two grades, US terminal to country over the
trailing twelve months (solid) and non-US country to country from the
GIIGNL 2025 matrix (dashed, stamped annual). The struck EIA and NACEI
terminal layers (R4.58) are never read; this row is the rebuilt LNG set row
4 milestone 9 owed.

**Draws.** Export markers sized by √Mtpa with ground rings, hollow while
under construction; smaller import markers; one modelled shortest sea route
per pair from `searoute-ts` precomputed at build (open and Red Sea-closed
variants, the closed one from 2024-01), `PolylineArrow` for direction, width
by volume, endpoints at each country's largest operating terminal, `via[]`
chokepoints stored per route. Static; nothing animates.

**Cards.** Label at global zoom, three-line card regional, dossier on click
for US export plants (nameplate, trains, cargoes, utilization as arithmetic,
24-month chart, Trains, Destinations, Shipping, Regulatory, Sources);
GEM-grade card elsewhere; route cards name grade, period, distance and via.

**Acceptance.** PRD §12.4; `scripts/qa-lng.mjs` and
`.gev-logs/render-lng.mjs` per milestone in §12.8.

---

### Row 11 — Gas production facilities: Gulf platforms first (FR-G11)

Real, published production per facility, stamped with its lag. First slice:
every installed platform structure on the federal Outer Continental Shelf,
from BSEE's public bulk files — monthly gas, oil, water, BOE and producing
wells since 1957, coordinates, operator, water depth, incidents — drawn where
it stands, sized by gas per day in the newest *complete* reporting month,
coloured by change against the same month a year earlier, with a card and a
dossier (ten-year chart, lifetime summary). EIA state and play series are the
backdrop in a later milestone; North Dakota wells and Texas leases follow.
PRD §13.

## 5. Non-goals

- Tenancy, login, billing, public hosting. Recorded in `UPGRADE.md` for later.
- Any oracle number on the globe page. Prices and briefs stay on their pages.
- Editing upstream layer internals for hover, filters or styling.
- Trade signals, alerts framed as entries or exits, recommendations.
- Commodities beyond oil and gas until the four systems rows are usable.

---

## 6. Open questions

- **Q13, definition of usable.** Recommended: rows 1 through 4. Unconfirmed.
- **AISStream key.** Saved and rejected identically to a fake key; verify or
  rotate on the Account page, enter via POWER UP. Row 2 waits on it.
- **Console proxy paths.** The console's root page maps to `/market`; confirm
  that the console's own absolute links can go relative without breaking its
  60-second reload and 15-second log poll.
- **Port cameras.** Which of the twenty ports publish a public still is
  unknown until the row 9 research pass; the satellite fallback keeps the
  panel complete either way.

---

## 7. Row 1 PRD — shell, observation contract, hover, class groups (FR-G1)

**Written:** 2026-09-17 · **Status:** current, build not started · **Mirror:**
Project Brain `gods-eye-view/05-prd.md`. Derived from the 2026-09-17 grill
(rules R1 to R13); anything not decided there is marked as an assumption.

### 7.1 Summary

Row 1 builds the three things every later commodity layer leans on: a pure
observation contract that stamps each reading with its own times and one
freshness class; one hover service that gives commodity layers the quick
look; and the SaaS-shaped shell (navigation strip plus Vite proxy) that puts
the globe and the Oil Oracle console under one origin. Chokepoints (0a) and
ports (0b) are retrofitted so the panel row, the hover card and the click
card all print the same "as of" stamp from one function.

### 7.2 Problem

- The two built layers each carry time their own way (`latestDate`,
  `lastUpdate`) and their cards show fetch time, not observation time. A
  third layer would add a third way. R3 is already being broken.
- Rows 2 to 6 all need hover. Without one service each layer would pick and
  draw its own; R6 says build it first.
- The globe and the console are two tabs on two ports and no page states how
  old its numbers are.
- Why now: R6 gates every further layer on this row, and row 2 is blocked on
  a key anyway, so row 1 is the critical path.

### 7.3 Target user

- Jack, the single local operator (R1), reading the globe beside the console
  during a session.
- The next build session, which implements rows 2 to 4 against this contract
  without re-deciding timestamps, hover or panel placement.

### 7.4 Goals (verifiable)

1. One stamp producer. `formatAsOf` is the only function that renders an "as
   of" string, and for one chokepoint the panel meta line, the hover card and
   the click card are string-identical in the headless render.
2. Hover on commodity layers only. The render check shows the compact card
   over a chokepoint and over a port, and no `commodity-hover` overlay entry
   over an upstream entity (an aircraft) or while the draw tool holds the
   pointer.
3. Three class-named groups. The panel shows `Commodities · Published` with
   both existing rows, each meta line ending in `as of YYYY-MM-DD · Nd lag`;
   empty class groups do not render.
4. One origin. `http://localhost:4173/market` returns the console page through
   the proxy with the strip on top, and the strip's right end shows the mirror
   age read from `/logs.json`.
5. Gates green with no count change. `format`, `check:boundaries`, `test`,
   `build` pass; the three count-pinning tests are untouched because row 1
   adds no layer.

### 7.5 Non-goals

- No new layer. Tankers, weather, pipelines and plants are rows 2 to 4.
- No hover on upstream layers (R4); no edits to upstream layer internals
  (R13); no styling changes to upstream panel groups.
- No oracle number on the globe (R7). The strip shows mirror age, never a
  price.
- No framework for the strip; no auth, tenancy or public hosting (R1).
- No voice enum change (§2.2); no AISStream key work (row 2).

### 7.6 Requirements

1. **Contract module.** `src/layers/commodities/observation.js` is portable:
   no Cesium, no browser globals. `createObservation({ observedAt, validAt,
   publishedAt, fetchedAt, freshnessClass, source, headline, fields })`
   returns a frozen record. `observedAt` is required; `fetchedAt` defaults to
   now; `validAt` is for forecasts only; invalid dates throw.
2. **Class derivation.** `freshnessClassFor(observedAt, now)` returns `live`
   under 15 minutes, `daily` under 24 hours, else `published` (R2). A layer
   may declare its class explicitly; a static dataset stays `published` even
   when fetched a minute ago. The derived class is the fallback.
3. **Stamp.** `formatAsOf(observation, now)` renders one string per class:
   live `observed 12:04:31Z · 38s ago`; daily `issued 12:00Z · 3h ago`, or
   `issued 00Z 09-17 · valid 09-18` when `validAt` is set; published
   `as of 2026-09-13 · 4d lag`. Age buckets are s, m, h, d.
4. **Layer surface.** Every commodity layer exposes `freshnessClass` and
   `getStats().asOf` (the formatted stamp) plus `getStats().observation`
   (the record for the layer's latest reading). Every record registered via
   `registerEntityContext` carries `properties.observation`.
5. **Retrofit 0a and 0b.** Chokepoints and ports build observations from
   PortWatch `latestDate` (`observedAt` and `publishedAt` = latest daily row,
   `fetchedAt` = fetch time), declare `freshnessClass: 'published'`, and
   their click cards show the observation line. Existing record tests still
   pass and gain observation assertions.
6. **Hover service.** `src/app/hoverCards.js`, installed once by the
   application. Picks at most ten times a second on pointer move; resolves
   the picked entity to a context record; acts only when that record carries
   `observation` (which is what makes a layer a commodity layer, R4);
   publishes exactly one overlay entry under source id `commodity-hover`;
   clears on leave and when the entity is removed; publishes nothing while
   `pointerOwner()` is set or the cockpit owns input (R5). Hover never
   changes selection.
7. **Hover card.** Three lines: name; `formatAsOf` stamp; headline number.
   Drawn on the shared overlay canvas in the layer's status colour, anchored
   above the entity. No history, no buttons (those stay on the click card).
8. **Panel groups.** `src/ui/layerPanel.js` replaces the single `Commodities`
   group with `Commodities · Live`, `Commodities · Daily`, `Commodities ·
   Published`; membership comes from each layer's `freshnessClass`; empty
   groups are skipped; the meta line ends with `stats.asOf` when present.
   Upstream groups are untouched (R9, R13).
9. **Legend chip.** Panel footer shows the six status colours (red collapse,
   amber down, blue normal, green up, lime surge, grey unknown) whenever at
   least one commodity layer is enabled (§3.3).
10. **Proxy.** `server.proxy` in `server/standalone/vite.config.js` forwards
    `/market` to the console root and `/gas`, `/weather`, `/trades`, `/ask`,
    `/logs.json`, `/trade`, `/grill` path-preserved to
    `http://127.0.0.1:8011`. With the console down, `/` still renders with
    the strip and proxied routes return Vite's proxy error, never a crash.
11. **Strip.** `index.html` plus `src/shell/nav.js`: fixed top strip, plain
    HTML and CSS; links GLOBE, MARKET, GAS, WEATHER, TRADES, CHAT ▾; current
    page highlighted; right end `mirror as of HH:MMZ · LIVE | STALE | OFFLINE`
    polled from `/logs.json` every 60 seconds. The globe stays dark and the
    HUD is offset by one CSS variable, `--gev-strip-height`, not by editing
    upstream rules.
12. **Console side** (oracle repo `optaimumsolutions/commodities`): links
    relative, strip rendered on each console page, `oracle.cmd` gains the
    globe line, and one ledger row is claimed in `PRD-market-console.md`
    before any edit (R8).
13. **Render check.** `.gev-logs/render-shell.mjs`, on the
    `render-chokepoints.mjs` pattern: dismiss the dialog, pin the camera on
    Hormuz, enable chokepoints, wait for `getStats().count`, move the pointer
    over the ring and assert the `commodity-hover` entry text equals the panel
    meta stamp, click and assert the full card, screenshot both; then fetch
    `/market` and assert the strip markup.
14. **Boundaries and tests.** New files inserted textually in
    `scripts/package-boundaries.json`, `observation.js` in a portable section;
    `observation.test.mjs` covers thresholds, all three stamp formats, the
    frozen record and invalid input.

### 7.7 Constraints and invariants

- Product rules R1 to R13 (§2.1), in particular R2, R3, R5, R6, R8, R9, R13.
- Engineering rules (§2.2): file order, count-pinning tests, four gates,
  portable modules, render check per layer.
- The ledger lock (§0): row 1 belongs to the worktree session; re-check
  `git status` before touching `layerPanel.js` or either retrofitted layer.

### 7.8 Milestones (smallest shippable first)

1. **Contract and tests.** `observation.js` and `observation.test.mjs`.
   Verify: `npm test` green; `check:boundaries` green with the file in a
   portable section.
2. **Retrofit 0a and 0b.** `stats.asOf`, `observation` on context records,
   observation line on click cards. Verify: `render-chokepoints.mjs` and
   `render-ports.mjs` still pass; panel meta reads `as of … · Nd lag`.
3. **Class groups and legend chip.** Verify: screenshot shows the single
   populated `Commodities · Published` heading with stamps and the chip.
4. **Hover service and card.** Verify: requirement 13's hover assertions;
   no entry over an aircraft; no entry while the draw tool is open.
5. **Proxy and strip, this repo.** Verify: `/` shows the strip and the HUD
   is not occluded; console off → strip says OFFLINE and `/market` returns a
   proxy error; console on 8011 → `/market` renders.
6. **Console side.** Verify: console pages load under 4173 with the strip;
   the 60-second reload and 15-second log poll still work (closes the §6
   proxy-paths question).
7. **Close the row.** Ledger row 1 → BUILT with the commit; gates green;
   merge into `commodities`; push origin and mirror.

### 7.9 Risks and open questions

- **Oracle repo is not on this machine** (checked 2026-09-17; it exists on
  GitHub, private). → Clone it before milestone 6. Milestones 1 to 5 need
  nothing from it.
- ~~**0b is unmerged and the worktree does not exist.**~~ Resolved
  2026-09-17: 0b fast-forwarded into `commodities` (`2ef8247`), pushed to
  origin and mirror; worktree `../commodities-shell` created on
  `feat/commodities-shell` off that commit.
- **Console absolute links and polling under the proxy** (§6). → Milestone
  6 test. Fallback: a proxy `rewrite` rule here instead of console edits.
- **Pick cost over 2,065 port markers.** → Single `scene.pick`, never
  `drillPick`, behind the 10/s throttle; measure frame time in the render
  check; if it jumps, pick only when the camera is idle.
- **Overlay entry replacement.** Confirm the overlay host can replace one
  entry under a source id rather than append. → Read
  `src/app/layers/overlayHost.js` at milestone 4.
- **Strip versus fixed HUD chrome** (cockpit, command dock, first-run
  dialog). → One CSS variable for the offset; the render check screenshots
  the first-run dialog before dismissing it.
- **Q13, definition of usable.** Unconfirmed; does not change row 1. →
  Confirm before row 4 planning.

---

## 8. Row 8 PRD — `energy-datacenters`, United States power load (FR-G8)

**Written:** 2026-09-17 · **Status:** built for sites 1 to 15; the first five on
`feat/energy-datacenters` (worktree `commodities-datacenters`), not merged ·
**Mirror:** Project Brain `gods-eye-view/05-prd.md`. Requested by the founder
on 2026-09-17 after reviewing the upstream data center layer; decisions not
covered by rules R1 to R13 are marked as assumptions.

### 8.1 Summary

A static, US-only data center layer that shows the largest sites by power,
sized by IT megawatts, with the depth of card an energy analyst would want:
a bare label at global zoom, a short card once the camera is regional, and
the full record on click (owner, users, IT and facility power, planned
build-out, chips, capex and operating cost, cooling, grid, on-site
generation, water, timeline, sources). Sites 1 to 15 ship now; the same
bundle format grows, later, to global sites.

### 8.2 Problem

- The upstream `local-datacenters` layer draws 4,351 OpenStreetMap footprints
  worldwide (1,617 in the US bounding box) and none of them carries a power,
  capacity or wattage tag. It cannot answer "how big" or "who".
- Data centers are now gigawatt-class electricity loads with on-site gas
  turbines and dedicated gas plants. For an oil and gas globe they are demand
  assets, and the layer has to say so in numbers.
- The founder wants US sites only for now, static assets built the way the
  upstream bundles are built, and cards that get richer as the camera gets
  closer.

### 8.3 Target user

- Jack, reading the physical globe beside the oracle console (R1).
- An analyst at an energy or infrastructure firm looking at one campus: who
  owns it, how much it draws today and at full build, what powers it, what
  it cost, and where each number came from.

### 8.4 Goals (verifiable)

1. US only. Every record's position is inside the contiguous United States
   bounding box, pinned by the unit test.
2. Static. Nothing is fetched at runtime beyond the bundled JSON; every card
   and the panel meta line show the bundle vintage (`as of 2026-09-17 ·
   Epoch AI`), never the fetch time.
3. Three depths. The render check shows a label at 7,000 km, a three-line
   card at 150 km, and a full card of at least twelve lines on click, and
   the layer's `getStats().tier` flips between `global` and `regional` at the
   2,000 km threshold.
4. Analyst-grade. Every site carries owner, users, current IT MW, facility
   MW, planned IT MW, capex, chips, cooling, grid utility and on-site
   generation, plus at least three cited sources, all asserted by the test.
5. Attributed and gated. Epoch AI (CC BY 4.0) is in `DATA_SOURCES.md` and the
   Data attribution popover; `format`, `check:boundaries`, `test` and `build`
   are green with the count pins moved from 23 to 24.

### 8.5 Non-goals

- Sites outside the United States. The bundle format already allows them;
  the founder deferred global coverage to a later row.
- Editing the upstream `local-datacenters` layer (R13). It stays as the
  global footprint layer; the new layer is additive.
- Live data. Utility interconnection queues, real-time load and outage feeds
  are candidates for `UPGRADE.md`, not this row.
- Signals (R11). Gas-equivalent demand is labelled illustrative arithmetic.
- Hover cards. They arrive with the row 1 hover service (R4, R6).

### 8.6 Requirements

1. **Bundle.** `src/data/local_data/us_datacenters/datacenters.json` with a
   `vintage`, `source` (name, URL, license, retrieval date), `selection`
   statement, `assumptions` for the gas arithmetic, and `sites[]`; a
   `README.md` and `source.json` record provenance and the refresh procedure.
2. **Selection.** The fifteen largest US sites by current IT power in the
   Epoch AI "AI Data Centers" tracker on the retrieval date: Colossus 2
   (946 MW), Anthropic-Amazon New Carlisle (910), Microsoft Fairwater Atlanta
   (636), Meta Prometheus (562), OpenAI Stargate Abilene (421), Microsoft
   Fairwater Wisconsin (369), Google Pryor North (368), Colossus 1 (340),
   Google New Albany (333), Google Columbus (303), Amazon Madison Mega Site
   (284), CoreWeave Denton TX (262), Google Bristow (238), QTS Richmond 1
   (238), Google Council Bluffs East (237). (Assumption: rank by current, not
   planned, IT power; planned figures are on every card. Ties on IT power are
   selected by current H100 equivalents — that is what picks Council Bluffs
   East over Omaha and Papillion, all three at 237 MW — while `records.js`
   breaks display ties on `id`.)
3. **Positions.** OpenStreetMap polygon centroids where a mapped campus
   exists, otherwise the street address or a campus landmark, with the method
   recorded per site in `positionSource`.
4. **Records module.** `src/layers/datacenters/records.js` is portable:
   normalizes and freezes each site, rejects rows missing id, name, position
   or IT power, ranks by IT power, derives facility/IT ratio, capex per IT MW,
   planned growth, gas-equivalent demand (facility MW × 24 h × 7.0 MMBtu/MWh
   ÷ 1.037 MMBtu/Mcf), latest and next milestone, and owns the formatters.
5. **Source.** `source.js` reads the bundle once through an injected fetch,
   caches the normalized snapshot, and fails loudly on HTTP or shape errors.
6. **Marker.** A pinned point sized by the square root of IT MW (8 px plus
   0.35 px per √MW) and a clamped ground-polyline ring of 3 km plus 350 m per
   √MW, coloured blue for `operating` and green for `expanding`.
7. **Ambient depth.** Three tiers by camera height. Above 2,500 km each
   site is a label, `NAME · 946 MW IT`. Between 300 km and 2,500 km it is a
   three-line card: owner and users; facility MW and the planned path with
   its date; grid utility and on-site generation. Under 300 km the campus
   itself appears: the mapped footprint (an OpenStreetMap outline where one
   exists, otherwise the ring), on-site plants as their own amber markers and
   labels (Colossus 2's Southaven turbines), and a campus card that ends with
   the hint that the marker opens the dossier. The layer republishes on the
   camera's `moveEnd` whenever the tier changes.
8. **Hover, click and the dossier.** Hovering a marker turns the cursor into
   a pointer, enlarges the marker and brightens its ring or outline (picks
   throttled to eight a second, skipped while the camera moves or a tool owns
   the pointer). Clicking opens the dossier drawer and, from above 400 km,
   flies the camera down to 45 km over the campus. The map card while
   selected is five headline lines; everything else lives in the drawer.
   `src/layers/datacenters/dossier.js` owns the drawer: fixed at the right
   edge above the panels and below the command dock, with rank and status,
   title, four stat tiles (IT power, facility, planned IT, capex), an SVG
   power-path chart of IT MW by milestone (solid built, dashed projected,
   facility line), five sections (Supply, Compute, Capital, Campus, People),
   the full timeline table, notes, source links, the licence line, and
   buttons for previous site, fly to campus, zoom out and next site. Closing
   the drawer, clicking empty map or selecting another layer's entity clears
   the selection. `buildDossierModel` is pure and unit-tested.
9. **Context.** Each marker registers a context record whose `properties` is
   the analyst record (32 fields); `getAnalystRecords()` exposes the same
   rows to the voice and analyst engines.
10. **Freshness surface.** The layer declares `freshnessClass: 'published'`
    and `getStats().asOf`, pre-adopting the row 1 contract; it joins the 0a
    and 0b retrofit when the observation module lands.
11. **Panel.** Listed in the Commodities group as `Data Centers · US Power`
    with the bundle vintage in its meta line; token `y` in the layer registry.
12. **Wiring.** `src/app/layers/datacenters.js`, `src/sources/reference.js`,
    `src/app/constructCatalog.js`, `src/data/layerState.js`,
    `src/ui/layerPanel.js`, `scripts/package-boundaries.json` (three
    sections), `DATA_SOURCES.md`, `src/data/dataCredits.js`,
    `docs/COMMODITIES.md`; the three count-pinning tests move to 24.
13. **Render check.** `.gev-logs/render-datacenters.mjs` asserts fifteen sites,
    the as-of stamp, the global and regional tiers, the Colossus 2 click, the
    analyst record on the context, and no page errors, with screenshots of
    all three depths. Known since 2026-09-21: at the 7,000 km tier Colossus 1
    and Colossus 2 (15 km apart) overlap, so the hover assertion resolves to
    `colossus-1`; hover at the regional tier or accept either id. The probe
    is git-ignored, so fix the fixture when it is next used.
14. **Refresh.** Re-download the Epoch bundle, re-rank, update `vintage` and
    `source.retrieved`, re-verify positions; a script for this is milestone 3.

### 8.7 Constraints and invariants

- R2 and R3: class `published`, stamp is the vintage. R11: descriptive only.
  R12: free source, CC BY 4.0. R13: additive; upstream layer untouched.
- R6 exception, recorded: this row was built before the row 1 contract at the
  founder's request; the layer pre-adopts the contract's surface and is in
  the retrofit list.
- Engineering rules §2.2 in full, including portable `records.js` and
  `source.js` with no Cesium import.

### 8.8 Milestones (smallest shippable first)

1. **Five largest US sites.** Built 2026-09-17. Verify: render check green,
   four gates green. Done.
2. **Merge.** Rebase `feat/energy-datacenters` onto `commodities` once the
   other lanes land; ledger row 8 → BUILT with the merge commit.
3. **Refresh script.** `scripts/refresh-us-datacenters.mjs` reads the Epoch
   ZIP, re-ranks, rewrites the bundle and prints a diff. Verify: running it
   on 2026-09-17 data reproduces the committed JSON.
4. **Next tier.** Built 2026-09-18 on `feat/commodities-shell`: sites 6 to 15
   by current IT power (Fairwater Wisconsin, Google Pryor North, Colossus 1,
   New Albany, Columbus, Madison, Denton, Bristow, Richmond 1, Council
   Bluffs East), same fields, same test, generated from the Epoch bundle
   retrieved that day. 15 entries stay under the 24-entry cohort cap. Done.
5. **Hover retrofit.** After row 1, the shared hover service replaces the
   layer's own hover highlight with the standard hover card.
6. **Global sites** (deferred by the founder): a `country` field and a panel
   sub-toggle `US only`; positions verified per site.

### 8.9 Risks and open questions

- **Estimates, not meter readings.** Epoch states an IT-power estimate is
  within a factor of 1.4 of truth about 80% of the time; planned figures are
  projections from satellite imagery. → Every card names Epoch and the site's
  as-of date; the selection text says so.
- **Reported but unconfirmed facts** (Socrates plant MW, Abilene on-site MW,
  Colossus 2 turbine counts) are flagged in the record notes. → Replace with
  filing-sourced numbers at milestone 3.
- **Positions.** Prometheus uses a campus landmark; New Albany's buildings
  spread across the business park. → Move to a polygon centroid once
  OpenStreetMap maps the campus.
- **Drawer versus the right rail.** The dossier covers the DISPLAY, CCTV and
  CONTEXT rows while it is open. → Acceptable for v1 because it closes with
  one click; revisit if the rail gains something a site reader needs.
- **Lane.** Built in a third worktree while the layers session works in the
  main tree. → Merge order and the ledger claim avoid a conflict; no shared
  file was edited by both.
- **Headless flakiness.** The render check fails with "Rendering has
  stopped" when the full test suite or a build runs at the same time. → Run
  it alone; it passes.

---

## 9. Row 9 PRD — Port dossier: live camera and data panel for 20 commodity ports (FR-G9)

**Written:** 2026-09-17 · **Status:** decided in the 2026-09-17 grill
(questions G1 to G6), build not started · **Mirror:** Project Brain
`gods-eye-view/05-prd.md`. Requested by the founder on 2026-09-17 after the
ports layer landed. Decisions the grill did not reach are marked as defaults
(D1 to D4) and change by re-opening them, not by drifting.

### 9.1 Summary

Clicking one of twenty commodity-critical ports opens a right-hand dossier
panel: a camera still refreshed every sixty seconds (or the day's satellite
tile when no public camera exists), then the port's tanker flow against its
baseline with a 90-day chart, calls by vessel class, its trade role, the
disruptions touching it, the weather at the berth, this week's headlines and
an encyclopaedic "about" with links. Facts that rarely change are built once
by a script into a bundled dossier per port; the live sections are fetched on
click. Hover is untouched and the existing overlay card stays as the headline.

### 9.2 Problem

- The ports layer answers "is it moving?" with a deviation and a two-line
  card. It cannot answer "what is this place, who runs it, what does it
  handle, what is happening there now, what does it look like?"
- The oracle's console has numbers without geography; the globe has
  geography without depth per asset. A port is the first asset where the two
  need to meet in one view.
- Why now: 0b is built and pinned, row 1 is about to give every reading a
  freshness stamp, and the dossier is the first place a user spends more than
  three seconds on the globe.

### 9.3 Target user

- Jack, reading the globe beside the console: during a Hormuz story he clicks
  Fujairah and wants the camera, the flow, the disruptions and the headlines
  in one place within two seconds.
- The next build session, which inherits a seed file, a build script and a
  panel contract so that adding port 21 is data entry, not code.

### 9.4 Goals (verifiable)

1. **Twenty dossiers bundled.** `src/data/local_data/port_dossiers/index.json`
   lists exactly the twenty ports in §9.6.1 and each has a dossier JSON that
   passes the schema test.
2. **Fast and stamped.** The panel opens on the click frame; on a warm cache
   every live section resolves within two seconds in the headless check, and
   every section shows its own "as of" stamp and status.
3. **The camera slot never lies.** A registered camera shows a frame from
   `/api/cctv/frame/:id` with the camera's name, operator and frame age;
   otherwise the daily satellite tile with its date; a nearby road camera
   appears only within 3 km, labelled with distance and bearing.
4. **Every fact carries its source.** Each section ends with a provenance
   line naming PortWatch, Open-Meteo, Google News or GDELT, Wikipedia, NASA
   GIBS, or the camera operator, with the licence recorded in
   `DATA_SOURCES.md`.
5. **Ports outside the twenty are unchanged.** No panel opens; the card is
   the same as today.
6. **Additive.** No upstream layer or provider internals are edited. The one
   upstream touch is a single registration line for the port camera loader.
7. **Gates green.** Format, boundaries, `npm test` and build pass; the
   headless check clicks Singapore and Ras Tanura and screenshots both panel
   states.

### 9.5 Non-goals

- Embedded video players (YouTube, Windy, EarthCam). Recorded in `UPGRADE.md`
  as the camera upgrade path (grill G3).
- All 2,065 ports. The seed format and build script support growth; the
  launch set is twenty (grill G6).
- Vessel lists or "ships in port now" (row 2), pipeline and plant joins
  (row 4), news badges on the globe (row 5). The dossier consumes those rows
  when they land; it does not build them.
- Any price, spread, curve or recommendation on the panel (R7, R11).
- Changing the CCTV layer's rendering or the regional briefing.

### 9.6 Requirements

#### 9.6.1 The twenty ports (grill G6)

Chosen by role, with the PortWatch annual tanker count as the tie-break only.
A pure count ranking is a list of Japanese refineries; the ports that move
the oil and gas market take few, huge calls.

| #   | portid      | Port                   | Country      | Role                                                     | Linked system               | Tanker calls/yr |
| --- | ----------- | ---------------------- | ------------ | -------------------------------------------------------- | --------------------------- | --------------: |
| 1   | `port1091`  | Ras Tanura             | Saudi Arabia | Saudi Aramco's main crude export terminal                | Hormuz                      |             672 |
| 2   | `port570`   | Yanbu (King Fahd Port) | Saudi Arabia | Red Sea outlet of the East-West pipeline, Hormuz bypass  | Bab el-Mandeb, Suez         |           1,323 |
| 3   | `port362`   | Fujairah               | UAE          | Gulf of Oman storage and bunkering hub outside Hormuz    | Hormuz bypass (ADCOP)       |           3,165 |
| 4   | `port1090`  | Ras Laffan             | Qatar        | Largest LNG export complex                               | Hormuz                      |           1,634 |
| 5   | `port2164`  | Kharg Island           | Iran         | Sanctioned crude export terminal                         | Hormuz, sanctions           |              75 |
| 6   | `port481`   | Houston                | United States| Largest US crude export and petrochemical complex        | US Gulf, PADD 3             |           5,014 |
| 7   | `port264`   | Corpus Christi         | United States| Largest US crude export port, LNG                        | US Gulf                     |           1,454 |
| 8   | `port2388`  | Sabine Pass            | United States| First and largest US LNG export terminal                 | US Gulf, Henry Hub          |             569 |
| 9   | `port933`   | Port Arthur            | United States| Gulf refining (Motiva), Sabine-Neches waterway           | US Gulf                     |             912 |
| 10  | `port1114`  | Rotterdam              | Netherlands  | Europe's crude and product hub (ARA), Gate LNG           | Dover, Suez                 |          16,990 |
| 11  | `port57`    | Antwerp                | Belgium      | ARA refining and chemicals                               | Dover, Suez                 |          13,486 |
| 12  | `port45`    | Amsterdam              | Netherlands  | ARA gasoline and product storage                         | Dover                       |           5,628 |
| 13  | `port740`   | Milford Haven          | UK           | UK LNG (South Hook, Dragon) and refining                 | Atlantic                    |           1,110 |
| 14  | `port833`   | Novorossiysk           | Russia       | Black Sea crude and CPC terminal                         | Bosporus, sanctions         |           1,578 |
| 15  | `port1020`  | Primorsk               | Russia       | Baltic crude outlet                                      | Oresund, sanctions          |             961 |
| 16  | `port1201`  | Singapore              | Singapore    | Bunkering, refining and trading hub                      | Malacca                     |          26,277 |
| 17  | `port824`   | Ningbo                 | China        | China's crude gateway (Ningbo-Zhoushan)                  | Taiwan Strait, Malacca      |           4,945 |
| 18  | `port1338`  | Ulsan                  | Korea        | SK Energy and S-Oil refining complex                     | Korea Strait                |           8,643 |
| 19  | `port239`   | Chiba                  | Japan        | Tokyo Bay refining                                       | Luzon, Malacca              |           9,275 |
| 20  | `port1199`  | Sikka                  | India        | Outlet of the Jamnagar refinery (Reliance)               | Hormuz                      |             462 |

Left out on purpose: Basrah (PortWatch counts zero calls at the offshore
buoys), Gladstone and Dampier (Australian LNG, less tied to oil and US gas),
Map Ta Phut and the Japanese secondary ports. Growth beyond twenty is a seed
entry and a build-script run.

#### 9.6.2 Static dossier, built once (grill G1, D1)

- **Seed.** `config/port_dossiers.seed.json`, hand-written, one entry per
  port: `portid`, `slug`, `aliases` for news queries (Houston carries
  "Port of Houston" and "Houston Ship Channel"), `role`, `roleNotes` (one
  descriptive sentence), `linkedSystems` (chokepoint ids and tags such as
  `hormuz-bypass`), `authority` `{ name, url }`, `terminals` (up to six
  `{ name, operator, product }`), `wikipediaTitle`, `cameraIds`,
  `satelliteZoom`.
- **Build script.** `scripts/build-port-dossiers.mjs` reads the seed, pulls
  the PortWatch registry row (identity, LOCODE, annual vessel counts by
  class, top industries, share of the country's maritime imports and
  exports), the Wikipedia REST summary (title, extract, thumbnail, page URL;
  User-Agent set; text CC BY-SA 4.0), validates every field, and writes
  `src/data/local_data/port_dossiers/<portid>.json`, `index.json`,
  `source.json` (URLs, fetch dates, sha256) and a `README.md` in the
  datacenters-bundle style (source, licence, count, refresh command). It
  fails loudly on a missing seed field or an unreachable source and never
  writes a partial bundle. Re-running it on unchanged sources reproduces the
  committed JSON byte for byte.
- **Camera catalog.** `config/cctv_sources.ports.json`, the same shape as
  `config/cctv_sources.warendorf.json` (id, name, provider, `sourceKind`
  `port-webcam`, `feedType` `image`, url, lat, lon, pose fields where known,
  licence text). Every entry is hand-verified before it ships (grill G4).
  The build script's `--probe` mode fetches each URL, checks an `image/*`
  content type and size, confirms two fetches sixty seconds apart differ,
  and prints a review sheet; the sheet goes in the commit message.
- **Loader.** `server/providers/cctv/portSources.js` exporting
  `loadPortSourcesFromCatalog`, modelled on `loadWarendorfSourcesFromCatalog`
  with an origin allowlist derived from the catalog's own hosts, registered
  by one line where the CCTV catalog aggregates its loaders. That line is
  the only edit to upstream server code (R13).
- **Discovery, later.** The script's `--discover` mode (Overpass query for
  tagged webcams within a few kilometres of a port, then probe) is the tool
  for growing coverage past twenty; it is not a launch requirement.

#### 9.6.3 Live sections, fetched on click (D2)

| Section             | Source                                                                                                   | Path                                  | Cache                                                                     | Stamp                |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- | -------------------- |
| Camera frame        | CCTV proxy `/api/cctv/frame/:id`                                                                         | server, existing                      | source cadence; the panel re-requests every 60 s while open               | frame age            |
| Satellite fallback  | NASA GIBS WMTS true colour (MODIS Terra, VIIRS SNPP) tile at the port, `satelliteZoom`                   | browser-direct                        | daily                                                                     | tile date            |
| Flow                | the ports layer's current row for the port                                                               | in memory                             | 30 min (layer refresh)                                                    | latest published day |
| 90-day history      | PortWatch `Daily_Ports_Data` for the one `portid`: port calls and imports/exports by class, ≤ 120 rows  | browser-direct, one request           | 30 min per port                                                           | published day        |
| Disruptions         | the ports layer's snapshot: events whose `affectedPorts` name the port or one of its linked chokepoints | in memory                             | 30 min                                                                    | event dates          |
| Weather at the berth| Open-Meteo forecast (wind, gusts, visibility, precipitation) and marine (wave height, period)            | browser-direct                        | 15 min                                                                    | issued and valid     |
| Headlines           | new `server/providers/portNews.js`: Google News RSS first, GDELT DOC second, using the seed aliases, 7-day window, ≤ 10 items, every item marked UNVERIFIED WIRE | server | 15 min; one upstream query per port per window; body cap; sanitized errors; per-client rate limit | seen time |

Every section renders its own status (`ready`, `partial` when a stale cache
is shown, `unavailable` with the reason) so no section blocks another (R3).

#### 9.6.4 The panel (grill G2, D3)

- **Placement.** A new panel `port-dossier-panel` registered by an additive
  entry in `src/ui/panelChrome.js`, in the right-hand column with the CONTEXT
  and CCTV panels. `src/app/portDossier.js` opens it on `gev:entity-selected`
  for a `commodity-ports` record whose `portid` has a bundled dossier, swaps
  content when another of the twenty is clicked, and closes it on deselect or
  the panel's close button (closing does not deselect).
- **Order, top to bottom.** Header (name, country, LOCODE, role, authority
  link, panel "as of"); camera slot (frame or satellite, name, operator, age;
  the nearby road camera thumbnail only within 3 km); flow (recent versus
  baseline, band colour, 90-day sparkline with the 7-day and 90-day means);
  calls by class (tanker, container, dry bulk, general cargo, ro-ro; imports
  versus exports); trade role (share of the country's maritime imports and
  exports, top industries, terminals from the seed); disruptions; weather;
  headlines; about (Wikipedia extract with attribution); links (authority,
  PortWatch port page, Wikipedia).
- **Pure assembly.** `src/layers/ports/dossier.js` exports
  `assemblePortDossier({ dossier, row, history, disruptions, weather, news,
  cameras, now })` returning frozen section records with status and stamp;
  no DOM, no Cesium; unit-tested with fixtures for every status.
- **Stamps.** From row 1's `formatAsOf` once it has landed; until then an
  interim helper with the same signature inside `dossier.js`, replaced at the
  retrofit (milestone 6).
- **Descriptive only (R11).** Counts, deviations, dates and quoted headlines
  with their source. The band colours are the shared vocabulary of §3.3 and
  mean nothing beyond deviation.

#### 9.6.5 Freshness classes (R2)

The header stamp is the newest observation among the sections; each section
keeps its own. Camera: `live` when the frame is under fifteen minutes old,
`daily` for the satellite tile. Flow and history: `published`. Weather:
`daily`. Headlines: `live`.

### 9.7 Constraints and invariants

- **Free first (R12).** Every source above is keyless. Windy Webcams (free
  key, their player, attribution) is the recorded camera upgrade; EarthCam
  and YouTube embeds are recorded as curated extras. None is built here.
- **Additive (R13).** New modules plus one loader registration line. The
  ports layer gains at most one accessor, `getRow(portid)`, if the panel
  needs it; its rendering is untouched.
- **R6, read for a panel.** The dossier is a panel on an existing layer, not
  a layer. Milestones 1 to 5 do not wait for row 1; milestone 6 adopts its
  contract.
- **Licensing.** Wikipedia text CC BY-SA 4.0 with attribution on the panel
  and in `DATA_SOURCES.md`; each camera carries its operator's terms in the
  catalog and on the panel; GIBS imagery credited to NASA; PortWatch under
  IMF terms; Open-Meteo CC BY 4.0.
- **Privacy.** Camera frames are public operator stills; the app displays
  them and does nothing else with them, the same statement the CCTV layer
  makes.
- **Performance.** Nothing is fetched before a click; every request aborts
  on deselect or port swap; one in-flight dossier at a time; the history
  request is one page of at most 120 rows.
- **Portable modules.** `dossier.js`, the build script's normalizers and the
  news provider never import Cesium or touch browser globals.
- **Shared clone.** Claim row 9 before the first edit; guard every commit
  with `git branch --show-current` in the same command; never a bare
  `git stash`.

### 9.8 Milestones (smallest shippable first)

1. **Seed and build script (D1).** Verify: twenty dossier files, `index.json`,
   `source.json`, `README.md`; the schema test is green; a second run
   reproduces the committed JSON.
2. **Camera catalog and loader.** Verify: `/api/cctv/sources` lists the port
   cameras; `/api/cctv/frame/<id>` returns an image for each in the headless
   check; the probe sheet is in the commit message. Expect eight to twelve
   of the twenty to have a public still; the rest use the satellite tile.
3. **News provider.** Verify: unit tests for query building, caching and
   error sanitizing; a manual call for Fujairah returns items marked
   UNVERIFIED WIRE.
4. **Panel with the static and PortWatch sections** (header, flow, history,
   calls, trade role, disruptions, about, links). Verify: the headless check
   clicks Singapore and screenshots the panel with the chart; clicking a port
   outside the twenty opens nothing.
5. **Camera slot, weather, headlines.** Verify: the headless check screenshots
   Rotterdam (camera) and Ras Tanura (satellite fallback).
6. **Row-1 retrofit.** Stamps via `formatAsOf`; hover unchanged. Verify: the
   header stamp string equals the panel row's stamp string.
7. **Ledger and docs.** Ledger row 9 to BUILT, `DATA_SOURCES.md`,
   `src/data/dataCredits.js`, the row in `docs/COMMODITIES.md`, the camera
   upgrade rows in `UPGRADE.md`; merge order agreed with rows 1 and 8.

### 9.9 Risks and open questions

- **Camera availability** is unknown until the research pass. → The
  satellite fallback keeps the panel complete at any coverage; coverage is
  reported per port in the ledger.
- **Operator cameras change URLs or forbid hotlinking.** → Health tracking
  in the CCTV proxy marks them and the slot falls back; `--probe` is the
  refresh tool.
- **Wikipedia extracts describe cities as often as ports** (Ningbo, Chiba).
  → The seed's `wikipediaTitle` names the port article where one exists.
- **News queries on common names drift** (Houston, Amsterdam). → Alias sets
  carry "Port of" phrasing and the provider keeps only items whose title
  contains an alias.
- **Row 1 timing.** → Milestone 6 waits; milestones 1 to 5 do not.
- **Google News RSS has no published API terms; GDELT rate-limits.** → Both
  already power the regional briefing under the same conditions; the cache
  and per-port ceiling keep the footprint small.
- **Open:** should the overlay card's title also open the panel, and should
  the analyst and voice tools be able to open it (the voice enums are
  hash-pinned, so that is its own deliberate change)?

### 9.10 Bootstrap from a fresh Claude Code session

Everything below assumes this PRD is committed on `feat/commodities-shell`,
the branch the new worktree is cut from.

**1. In a cleared PowerShell:**

```powershell
cd C:\Users\jgewi\gods-eye-view
git fetch --all --prune
git worktree add ..\commodities-ports-dossier -b feat/port-dossier feat/commodities-shell
cd ..\commodities-ports-dossier
npm ci            # a fresh worktree has no node_modules; Chrome for Puppeteer is already cached
npm run doctor    # confirms Node 24, keyless map and terrain; no key is needed for row 9
claude
```

Port 4173 belongs to the `commodities-shell` worktree's dev server. For
render checks this worktree runs its own server in a second window:
`npx vite --port 4174`.

**2. Paste this as the first message to Claude:**

```text
Work in C:\Users\jgewi\commodities-ports-dossier, a git worktree on branch
feat/port-dossier (cut from feat/commodities-shell). This is row 9 of
docs/COMMODITIES-PLAN.md. Read, in this order, before touching anything:
docs/COMMODITIES-PLAN.md §0 (ledger), §2 (rules R1-R13 and the engineering
rules), §9 (the row 9 PRD); docs/COMMODITIES.md; UPGRADE.md, the section
"How a paid provider is wired in"; src/layers/ports/ (the layer this
extends); src/layers/chokepoints/gazetteer.js (the pinned-reference
pattern); config/cctv_sources.warendorf.json and
loadWarendorfSourcesFromCatalog in server/providers/cctv/sources.js (the
camera catalog pattern); server/providers/gbfs.js (the provider pattern);
server/providers/regional/news.js (the news pattern);
src/data/local_data/datacenters/README.md (the bundle README pattern).

Then: (1) claim row 9 in the ledger, status "CLAIMED <today>, worktree
commodities-ports-dossier, branch feat/port-dossier, next: milestone 1", and
commit that change alone. (2) Execute §9.8 milestones in order, one commit
per milestone, with the verification evidence in each commit message.

Rules that bind you: free keyless sources only; descriptive, never signals;
additive to upstream (the one allowed upstream touch is the CCTV loader
registration line); portable modules never import Cesium; take the PRD's
defaults D1-D4 and note them in the commit rather than asking. Gates before
every commit: npm run format, npm run check:boundaries, npm test (four to
seven minutes, run it alone), npm run build. Never push. Shared clone: guard
every commit with git branch --show-current in the same command; never a
bare git stash. Headless render checks: copy
C:\Users\jgewi\gods-eye-view\.gev-logs\render-ports.mjs into this
worktree's gitignored .gev-logs\ and point its URL at
http://localhost:4174/ (start npx vite --port 4174 in a separate window).
If a render reports "Rendering has stopped" on the first load after adding
modules, run it again. Ask me only when a decision is genuinely missing
from §9.
```

---

## 10. Row 4 PRD — Gas cross-border flows on the bundled pipeline network (FR-G4)

<!-- Canonical copy for the build session. Mirror: Project Brain gods-eye-view/05-prd.md; keep both in sync via /prd. -->

**Scope:** Row 4 of `docs/COMMODITIES-PLAN.md`, **built out**. The
2026-09-18 grill replaced the ladder's "Pipelines and plants, bundled" with a
gas-first row whose headline objects are the named US border crossings, drawn
on the pipeline network that feeds them. This revision keeps that scope
exactly — crossings on a network — and adds the two things the first draft
did not have: a **visual and interaction specification** dense enough to build
from, and a **data specification that survives contact with the sources**.
Plants remain a late milestone; the crude sibling later still. The row is not
widened into the wellhead-to-burner-tip chain.

**Written:** 2026-09-18 · **Revised:** 2026-09-18 (same day, after a
live-probe pass over every source and a read of the layer construction in
`~/commodities-shell`) · **Status:** current; **the substrate is built and
committed** — milestone 2's transforms and milestone 5's bundle and build
script at `f665031`, the render half of milestone 5 at `4919e03` (both
`feat/commodities-shell`, 2026-09-21); everything downstream of the EIA key is
not started · **Mirror:** Project Brain `gods-eye-view/05-prd.md`, synced
2026-09-18 together with the §0 ledger row; the ledger row itself was
re-synced 2026-09-21.

**Provenance of every figure below:** live-probed 2026-09-18 unless marked
otherwise. `[LIVE]` means an HTTP response was read that day. `[UNVERIFIED]`
means it is documented but no probe returned it — and in this document that
mark is load-bearing, because **no probe obtained a single HTTP 200 from
`api.eia.gov` all session** (see R4.30 and Risk 1).

---

### 10.1 Corrections to the first draft

The first draft was written before the sources were probed end to end. Seven
of its statements are wrong in ways that would have shipped a defect. They are
listed here rather than quietly edited, because the reasoning is the asset.

The left column uses `FD-n` for the **first draft's** `R4.n`. Those ids were
reused by the revision and now mean something else entirely — `R4.5` is the
rollup denylist, `R4.8` the unit rule, `R4.16` the no-variation rule — so
quoting them here under their old numbers would make the document's own
reasoning asset resolve to the wrong requirements.

| First draft | Measured truth (2026-09-18) | Now |
|---|---|---|
| **FD-3** "Key every crossing by EIA `duoarea`. That code, not the display name, is the join key." | `duoarea` is **not unique**. `YSUMS-NCA` appears under both processes — Sumas WA filed 27,197 MMcf import **and** 125 MMcf export in the same month. St. Clair MI: 15,728 in / 38,029 out. | **R4.4** — primary key is `duoarea + process + period`. |
| **FD-1** "17 named import points, 30 export, union ≈ 40 distinct crossings" | Arithmetically right, semantically wrong. Those are the points that **filed a value in 2026-06**. The named import roster is ~32; Niagara Falls, Buffalo, Brownsville, Rio Grande, Ogilby, Otay Mesa, Sweetgrass, Detroit, Marysville, Port Huron and others were **null that month, not closed**. Membership changes month to month. | **R4.2** — the roster is a rolling 13-period union of distinct `duoarea` values. |
| **FD-10** "Deviation rule mirrors chokepoints: newest published month against the trailing 12." | Wrong for gas. US residential consumption swings **~7.7× between January and June** (974,032 → 126,314 MMcf). A trailing-12 badge prints `collapse` across the northern border every summer, from the calendar alone. | **R4.44–R4.46** — year-over-year same month plus a five-year same-month band. The anchor-on-newest-published-period half of the rule was right and survives as R4.43. |
| **FD-5** "A ~7-row hand alias table closes the rest… the known misses are border pairs." | The defect is not naming, it is **double filing**: each country files the same crossing separately, with different names, different volumes and opposite directions. At (31.334, −109.819): Mexico files "Naco" (PEMEX, source CRE, MX→US, 109.926 MMcf/d); the US files "El Paso Natural Gas Pipeline" (US→MX, 57), 75 m away. Measured, the 99 filings resolve to **60 marks, 39 paired**. (This cell previously read "~69 cells, 24 hold two or more" — those are the 2-decimal grid's numbers, and the draft specified a 3-decimal grid, which gives 95 and 4. See R4.21.) | **R4.21–R4.24** — mutual nearest cross-border pairing within 1,500 m, never on name and never same-government; both filings shown, never summed. |
| Risk: "The pipeline linework has **no vintage field at all** → cards say 'vintage unstated'." | It has a findable vintage: **January 2020**. The service republishes shapefile `NaturalGas_Pipelines_US_202001`, whose `.shp.xml` CreaDate is 20200427 and whose zip Last-Modified is 2020-04-27. Worse, the service advertises `dataLastEditDate 2025-07-01` — **a re-upload stamp that lies about the data**. | **R4.14** — the vintage is a hard-coded constant citing its evidence; service metadata is ignored in code. |
| **FD-8** "merge by `Operator` into 230 named MultiLineStrings" | 230 operator strings is right; "named" is not. `Operator` is **not a pipeline name**: "Northwestern Energy Co" (1,322 features) is a utility, "Enable Gas Transmission" (773) dissolved Dec 2021, "El Paso Texas Pipeline Co" (1,072) was absorbed in 2012, ONEOK appears as two near-identical strings. And the geometry is **shredded, not routed** — Iroquois, one of the smallest systems, carries **2,027 features** against Transcontinental's 1,118 and Tennessee Gas's 994, purely from finer digitizing; a 400-feature Iroquois sample was 100% two-vertex chords averaging 356 m. | **R4.15–R4.17** — no per-feature variation of any kind, no map label, dissolve is for draw-count only. |
| **FD-16** "keyboard token `l` — the only free letter left. A later oil layer must take a digit." | **`l` and `v` are both free**, and all ten digits are legal (`/^[a-z0-9]$/`, `layerState.js:463`). Radio's `v` is an *option* token in a per-layer namespace; `validateLayerStateRegistry` de-dupes only within `LAYER_STATE_REGISTRY`. | **R4.53** — `l` for this layer, `v` reserved for `energy-plants`. No layer is merged to save letters. |

Two first-draft figures were probed and **held exactly**: Canada pipeline
imports **226,798 MMcf** for 2026-06, and **Rio Grande TX 55,042 MMcf** to
Mexico. The 99 NACEI crossings and 32,892 pipeline segments also held. One new
fact fell out of the probe and became a shipped safety mechanism: the sixteen
Canadian import points sum to **226,797** against the published country total
of **226,798** — one MMcf of rounding (R4.9).

---

### 10.2 Summary

Row 4 answers one question the globe cannot answer today: how much gas
physically crossed the United States border last month, at which named point,
and in which direction. About forty to fifty named crossings — Canadian and
Mexican — carry EIA's monthly volumes in both directions, each drawn as a
fixed-height mark whose **area is gross volume**, whose **ink is direction**
(filled = into the US, hollow = out of it, a concentric pupil for genuinely
bidirectional points), and whose **colour is that point's position in its own
five-year same-month band**. They sit on the US transmission network, bundled
from EIA and drawn as a deliberately inert 1 px hairline that cannot be
clicked, cannot be labelled, and has no varying visual channel at all.

The layer's organising principle is a hard partition between **what is
measured** and **what is merely mapped**. Exactly one thing in this row is a
real, current, directional number: EIA's monthly volume at a named point of
entry or exit. Only that number is permitted to vary anything on screen.
January 2020 geometry and 2017 NACEI attributes place marks and nothing else —
enforced not by convention but by deleting those fields at ingest and by
encode functions that throw when handed a non-EIA-volume record.

Nothing animates. Processing plants, underground storage and a rebuilt LNG
terminal set are milestone 9; the crude and oil sibling milestone 10.

### 10.3 Problem

- The globe shows gas moving **by sea** (chokepoints 0a, ports 0b) and nothing
  of how it moves **by land**, although the US is simultaneously a large
  pipeline importer from Canada and exporter to Mexico. Measured 2026-06:
  **226,798 MMcf** imported from Canada (7.56 Bcf/d), **74,364 MMcf** exported
  to Canada (2.48 Bcf/d), and Rio Grande TX alone sent **55,042 MMcf** to
  Mexico. `[LIVE]`
- **Every free geometry source is stale, and the first draft had no mechanism
  to stop staleness reading as currency.** Measured: the gas pipeline copy is
  **January 2020**; NACEI crossings, processing plants and the NACEI LNG set
  are **2017 or older**; EIA's own underground storage layer is **Dec 2020**;
  its LNG terminal layer is **April 2020**. Shipping any of that as a current
  picture is the inversion that stopped the LNG terminals layer — the 2016
  NACEI copy lists Freeport, Cameron and Golden Pass as **import** terminals,
  and the EIA copy's liquefaction total sums to ~5.5 Bcf/d against the 16.06
  Bcf/d actually in service. `[LIVE]`
- The split that makes the row honest: **geometry is stale but stable**
  (border crossings and pipe do not move), while **the numbers must be
  current** — and EIA publishes exactly the numbers, by named point of entry,
  monthly.
- **Three defects in the sources are severe enough to be product
  requirements, not implementation notes**: the join key is not unique, the
  reporting roster changes month to month, and each border crossing is filed
  twice by two governments with opposite directions. A layer that does not
  handle all three double-counts the border.
- Why now: row 2 is blocked on the AIS key, row 5 is explicitly blocked on
  row 4's assets, and row 3 (weather) is independent. Pulling row 4 ahead of
  row 3 unblocks the most downstream work. R6 still gates it behind row 1.

### 10.4 Target user

- Jack, reading the globe beside the console. During a Canadian tariff story
  or a Mexican supply story he clicks a crossing and sees how much gas
  actually moved through it in the newest published month, which way, whether
  that is normal **for that crossing in that calendar month**, and how far
  behind the source is.
- The analyst who has been burned once. Every mark on this layer answers
  "how do you know?" before being asked — the period is in every card rung,
  the lag decays on screen, and the one unclickable thing is the one thing
  that carries no number.
- The next build session, which inherits a crossing gazetteer keyed by
  `duoarea`, a checked-in `duoarea → coordinate-cell` crosswalk with per-row
  join confidence, and a reproducible bundle script — so adding crossing 51 is
  data entry, not code.

### 10.5 Goals (verifiable)

1. **Every reported crossing is pinned or listed — never guessed.** For the
   newest published period, every `duoarea` EIA returns under the two
   admitted processes either resolves to a pinned coordinate or appears in
   the panel's `OFF-MAP` list with its number intact. Zero silent drops, zero
   guessed positions. Asserted by a unit test over the roster.
2. **Direction and bidirectionality are right.** The points that filed in both
   directions render a pupil whose **area** equals the minor direction's share
   of the disc's area. A unit test pins Sumas WA (27,197 in / 125 out → 0.46%
   minor share → the 2.5 px pupil floor) and St. Clair MI (15,728 / 38,029 →
   29.3% → a 14.1 px core inside a 26 px ring) at their measured 2026-06
   values.
3. **The border cannot be double-counted.** Country rollups are denylisted at
   ingest; the sixteen named Canadian import points reconcile to the published
   country total within 0.1% on every refresh; a failure drops the layer to
   `degraded` and suppresses every magnitude on screen.
4. **Nothing that is not a measured volume can vary in size or hue.**
   `crossingPixelSize`, `pupilPixelSize` and `bandStatus` throw on any record
   whose source is NACEI or the pipeline service, and the 2017 capacity,
   diameter and pressure fields are deleted before the renderer exists. An
   attempt to wire capacity to a pixel is a failing test, not a review catch.
5. **Nothing is undated, and the date decays.** Every card rung carries the
   period; the lag is recomputed from period end on every render and never
   stored, so `80d lag` becomes `81d lag` with nobody touching the code.
   Verified by a test that advances a clock and re-renders.
6. **The seasonal comparison is structurally honest.** `compare.js` exports
   only `compareSameMonth` and contains no code path that can compute a
   trailing window. The string "deviation" does not appear in this layer.
7. **The bundle is reproducible and its vintage is stated, not inherited.**
   `npm run build:gas-pipelines` regenerates the committed geometry
   byte-for-byte from an archived raw fetch; `source.json` carries URL, date
   and sha256 per file; a test recomputes the hash. The network's vintage is
   a hard-coded `2020-01` citing its evidence, and service `editingInfo` is
   ignored.
8. **The key never reaches the browser.** The EIA key is entered through
   POWER UP, lives server-side, and the client calls only our own endpoint
   (R12). Verified by grepping the built bundle for the key name.
9. **Contract-native and still.** The layer emits `observedAt` /
   `publishedAt` / `fetchedAt` from birth via
   `src/layers/commodities/observation.js` and declares freshness class
   `published` (R2, R3). It takes **no render hold** — asserted by a governor
   diagnostics test after activate, hover, select, dossier and deactivate.
10. **Additive, gates green.** New layer family only, no upstream layer
    internals edited (R13). `npm run format`, `npm run check:boundaries`,
    `npm test` and `npm run build` pass, and the headless check screenshots
    the layer at global and regional zoom with the far side of the globe
    clean.

### 10.6 Non-goals

- **The rest of the gas chain.** Production, consumption by sector, storage
  stocks, power burn and LNG export volumes are all available and all
  current — and all out of scope for this row. Row 4 is crossings on a
  network. Widening it is a new ladder row, not a milestone here.
- **Plants.** Processing (478 points, 2017), underground storage (412, Dec
  2020) and a **rebuilt** LNG terminal set are milestone 9. The circulating
  LNG layers are disqualified outright (see R4.58).
- **Crude and oil.** The 236-line crude trunk dataset and the 133-line HGL
  set are milestone 10, and only after verifying EIA publishes crude
  movements by point of entry — **not yet checked**.
- **Canadian and Mexican domestic linework.** NACEI's "pipeline" layers are
  *points*, not lines. NRCan CanVec `Res_MGT` is the most current Canadian
  geometry found (CKAN modified 2025-12-22) and is a research spike, not a
  requirement. Mexico's CENAGAS returned **403 on every probe**; the ArcGIS
  layer that dominates search results is 10 features in Chihuahua. Recorded
  in `UPGRADE.md`.
- **Canadian daily flow.** CER publishes daily throughput, capacity,
  direction and lat/lon per key point under an open licence — 275,486 rows
  across 8 gas systems, data through 2026-06-30. It is the best free flow
  dataset on the continent and it is **deliberately deferred**: it is a
  different geography (Canadian key points, not US border crossings), it is
  CORS-locked and needs its own provider, and adding it here would make the
  row about Canada. Recorded as the first candidate for the row that follows.
- **Daily or real-time US pipeline flow.** Scheduled quantities exist on ~121
  FERC-mandated posting sites across ~48 hosts, and four platforms cover 54
  of them — so "~180 separate sites, therefore infeasible" was wrong. It is
  still out of scope: a nomination is a contractual intention, not a
  measurement, intrastate pipelines are exempt from posting, and the legal
  terms on those pages have not been read. `UPGRADE.md`.
- **Any price, spread, curve, forecast or recommendation** (R7, R11). Note
  this cannot be achieved by avoiding price routes — see R4.31.
- **Motion of any kind.** See R4.40.

---

### 10.7 Requirements

#### 10.7.1 The crossings — what is measured

- **R4.1** Source both directions from EIA's monthly point-of-entry series:
  pipeline **imports** (process `IRP`) and pipeline **exports** (process
  `ENP`). Newest period **2026-06, published 2026-08-31** — an **80-day
  lag** `[LIVE]`. It rolls to 2026-07 around 2026-09-30.
- **R4.2** **The roster is a rolling union, not a snapshot.** Build the
  canonical crossing set from the distinct `duoarea` values appearing across
  the **newest 13 periods**, not from the points that filed in the newest
  one. Measured 2026-06: 17 points filed an import value (16 Canadian plus
  Galvan Ranch TX at 18 MMcf) and 30 filed an export value (11 Canada, 19
  Mexico) — but the named import roster is **~32**, and Niagara Falls,
  Buffalo, Brownsville, Rio Grande, Ogilby, Otay Mesa, Sweetgrass, Detroit,
  Marysville and Port Huron were all null that month. A hardcoded pin list
  silently gains and loses crossings the first time the month rolls.
- **R4.3** **Discover the newest published period at runtime.** Never
  hardcode a period, and never derive a window from the wall clock.
- **R4.4** **The primary key is `duoarea + process + period`.** `duoarea`
  alone is not unique — `YSUMS-NCA` appears under both processes.
  Codes are variable-width (`YELP` 4, `YGRAN` 5, `YBROWN` 6), so the country
  suffix is parsed by **splitting on the hyphen**, never by character offset.
- **R4.5** Drop the national rollups (`NUS-*`) **at ingest, not at draw
  time**. They are not a marker that is hidden; they never become a record.
- **R4.6** A **null is not a zero and not a closure**. `inMMcf` and `outMMcf`
  are `number | null`; `??` is confined to arithmetic and never reaches
  display; a point in the roster with no value renders as a hollow grey pip
  with the literal string `NO FILING <PERIOD> · POINT IN ROSTER`, is excluded
  from every sum, and gets no bar on the chart. A unit test asserts the digit
  `0` never stands in for an absence in any rendered string.
- **R4.7** A value with **no coordinate is never placed by guess**. It is
  excluded from the globe, surfaced as a panel chip `n OFF-MAP` opening a
  plain list, and carries a dossier row reading `no NACEI coordinate · not
  drawn`.
- **R4.8** Volumes are rendered in the unit EIA published (MMcf). A Bcf/d
  figure may appear beside it only with its divisor stated
  (`MMcf ÷ days-in-period ÷ 1000`). **No conversion between volume and
  energy anywhere in this layer** — the national heat-content factor
  (~1.037 MMBtu/Mcf, 2025) carries an ±5% state spread, and the industry
  transacts in energy while EIA reports volume.
- **R4.9** **The reconciliation invariant ships.** The sum of the named
  Canadian import points must equal the published `NUS-NCA` country total
  within 0.1%. Measured 2026-06: **226,797 against 226,798**, one MMcf of
  rounding. It runs at load, is printed in the dossier whether it passes or
  fails, and a failure flips the layer to `degraded` (R4.55).

#### 10.7.2 Geometry and the bundle — what is merely mapped

- **R4.10** Crossing coordinates come from **NACEI layer 2**, 99 gas crossing
  points with `Pipeline, Owner, City, StateProv, FrmCountry, ToCountry,
  Diam_Inch, MaxOP_psi, Vol_MMcfd, Latitude, Longitude` `[LIVE]`. Vintage
  **2017**; the programme is dead — the NACEI FTP carries exactly three
  vintage stamps, 201606 / 201701 / 201708, and nothing after.
- **R4.11** **The vintage gate.** Any dataset whose newest record is older
  than 24 months contributes **geometry only**. It may place a mark. It may
  not carry a number, a capacity, a direction arrow, or any size or colour
  encoding. This disqualifies NACEI `Vol_MMcfd` from driving any visual
  magnitude, and it is enforced by R4.12, not by memory.
- **R4.12** **`Vol_MMcfd`, `Diam_Inch`, `MaxOP_psi` and `NumPipes` are deleted
  from the record at ingest**, before the renderer exists, so there is no
  variable in scope to bind an encoding to. They survive only as pre-formatted
  display strings, each carrying `design (2017)` **inside the same string** so
  the vintage cannot be dropped by a formatter that takes the value alone.

  **`NumPipes` is the fourth magnitude and the draft missed it.** Pipe count
  is a physical quantity that correlates with crossing size, so a mark sized
  by it would look entirely plausible and be eight years stale. It is also a
  second absence-as-zero trap in a field that is genuinely numeric: **every
  US-filed record carries `NumPipes: 0`**, which means "not filed", because a
  crossing with zero pipes does not exist. It leaves the build as
  `"2 pipes filed (2017)"` or not at all.

  **What the label does and does not buy.** Deleting the number is the real
  defence; the string is the second line. It does **not** make the magnitude
  unrecoverable — `parseFloat('409.65 MMcf/d design (2017)')` is `409.65`.
  Recovering it takes a deliberate parse of a string that says what it is,
  which is the line between a mistake and a decision. Claiming more than that
  would be the kind of unearned assurance this row exists to avoid.
- **R4.13** **NACEI hygiene, in portable modules the build script imports.**
  (The draft said "all at build time"; the code lives in
  `src/layers/gasFlows/coerce.js` and `naceiCells.js` so the same functions
  run in the browser, in the build and in the tests — which is what makes the
  blank-versus-zero rule testable rather than asserted.) Numeric fields are
  `esriFieldTypeString`: coerce with an explicit parser where `''` → `null`
  (`Number('')` is `0` — the trap that would invent a zero-capacity
  crossing); `Vol_MMcfd` is the empty string on **29 of 99** records,
  `Diam_Inch` on 53 and `MaxOP_psi` on 59. The parser also refuses a
  multi-pipe string rather than picking one — measured values include
  `"30/36/48"`, `"36(2)"` and `"1440/1740/1019"`, and a crossing with three
  diameters has no one diameter. **Coordinates go through the same rule**:
  `Number(null)` is also `0`, so a missing coordinate would otherwise plot at
  0°N 0°E, and no North American land border runs through null island.

  Repair double-encoded UTF-8 (`Sempra Gasoductos MÃ©xico`) latin1→utf8 but
  **keep both strings**, showing the raw form as a dim dossier suffix when
  they differ, so a bad repair is visible rather than laundered. Measured
  2026-09-18: **0 of 99 records are mojibaked on the `f=json` route** —
  `NEB/ONÉ` and `Compañía` arrive clean — so the repair is currently a no-op.
  It stays because a different route or a re-host can reintroduce the fault,
  and because a silent repair is worse than none.
- **R4.14** **Linework: EIA interstate and intrastate transmission pipelines,
  32,892 features, vintage JANUARY 2020.** The vintage is a hard-coded
  constant citing shapefile `NaturalGas_Pipelines_US_202001` (`.shp.xml`
  CreaDate 20200427). The service's `dataLastEditDate 2025-07-01` is a
  re-upload stamp and is **ignored in code**, with a comment saying so.

  **The served layer is not the whole shapefile.** This is an ArcGIS hosted
  **view** that serves `TYPEPIPE` Interstate (17,996) and Intrastate (14,896)
  only — 32,892. The EIA source shapefile holds **32,961** because it also
  carries **69 `Gathering` features**, which the view filters out silently: a
  query for `TYPEPIPE='Gathering'` returns count 0. That closes the row's
  open question about the 69-feature discrepancy — it is **a dropped pipe
  class, not dropped geometry** — and it qualifies the legend line in R4.57:
  the missing gathering pipe is partly the republisher's doing, not only
  regulation.
- **R4.15** The layer carries **six fields** — `FID, TYPEPIPE, Operator,
  Status, Shape_Leng, Shape__Length` — and nothing else. No name, diameter,
  capacity, pressure, direction or in-service date. `Status` has exactly
  **one** distinct value, "Operating", so no "new infrastructure" or "changes"
  feature may be built on it.

  **And neither length field is a length.** `Shape_Leng` is in **decimal
  degrees** and `Shape__Length` is in **Web-Mercator metres**
  (`geometryProperties.units: esriMeters` on a wkid-102100 service), so
  summing the latter overstates true ground mileage badly and varies with
  latitude. Both are **excluded from the bundle**. Any mileage this layer ever
  prints must be computed geodesically or taken from PHMSA — and two
  independent passes over these same 32,892 features have produced geodesic
  totals **3,808.8 mi apart** (227,701.9 vs 223,893.1), so no mileage figure
  ships until one pass reconciles them.
- **R4.16** **No per-feature variation of any kind**, beyond a single alpha
  step between `Interstate` and `Intrastate`. Feature density is a digitizing
  artifact — Iroquois has 2,027 features against Transcontinental's 1,118 —
  so any width-by-length, colour-by-operator or density encoding would paint
  digitizing resolution as gas.
- **R4.17** **The network is never labelled on the map.** `Operator` appears
  only in a dossier section stating that it is not a pipeline name and that
  several of the 230 strings name dissolved or absorbed companies. A map
  label naming a dead company is the LNG failure in miniature.
- **R4.18** **Bundle the network offline.** Page the service once in a
  committed build script with **`orderByFields=FID`** (offsets are stable only
  under a total order), `geometryPrecision=5` (an unpinned precision is an
  unpinned byte stream), `outSR=4326` (the service defaults to wkid 102100 and
  its extent is in metres), and `resultRecordCount=2000` — the cap on this
  service is **2,000, not 1,000**, so the full pull is **17 pages, ~8.2 MB**
  `[LIVE]`.

  **The draft said `orderByFields=OBJECTID` and that fails — in exactly the
  way R4.20 warns about.** This layer's OID field is named `FID`, and
  `orderByFields=OBJECTID` returns
  `{"error":{"code":400,...,"details":["'OBJECTID' parameter is invalid"]}}`
  **under HTTP 200**. The order field is whatever the layer advertises as its
  OID, never a guessed name.

  Dissolve by the composite key of `Operator`, `TYPEPIPE` and `Status` —
  **built with `JSON.stringify([...])`, not joined on a separator character**.
  A separator has to be something that cannot occur in an operator name, which
  pushes towards a control byte, and a literal NUL in a source file makes it
  register as **binary to Git and invisible to every grep-based tool**. That
  key yields **235 distinct groups** across **230 operator strings** (five
  operators file as both Interstate and Intrastate), for draw-count only,
  never for naming or ranking.

  **`FID` is not a stable key and nothing may be persisted against it.** The
  view renumbers from scratch: FeatureServer `FID` 1 is Columbia Gas Trans Co
  while the shapefile's row 1 is a different operator entirely. It is a sort
  key for one pull and nothing else.
- **R4.19** **Reproducibility needs a raw archive.** Byte-for-byte on a paged
  ArcGIS source is impossible without one, because row order and content
  drift. Archive the 17 pages verbatim as fetched, take a `upstream_sha256`
  over the concatenation, and provide `--raw <dir>` / `--replay <dir>` flags.
  Flatten multi-part geometry into parts and sort parts within a group before
  emitting, or the output order depends on which page arrived first.

  Three things that only show up once it is built. **The part comparator must
  be a total order** — first coordinate plus length leaves 3,268 groups
  covering 7,264 of 32,885 parts comparing equal, and their order then falls
  through to the sort's input-order tie-break, which is the page arrival this
  requirement exists to remove; ties walk the whole coordinate list.
  **Collation must not be `localeCompare` with no locale** — system ids are
  assigned from the sorted array's index, and ICU's default locale follows
  `LC_COLLATE`, so the same build in a `cs_CZ` container re-ids 72 of the 234
  systems and rewrites 3.7 MB without a single coordinate changing; sort by
  codepoint. And **the archive directory must be cleared before a pull**, or a
  shorter pull leaves surplus pages behind and a later `--replay` reads the
  union — two upstream vintages welded into one bundle, with a feature count
  that can still satisfy the manifest.
- **R4.20** The bundle lands at `src/data/local_data/eia_energy/` with a
  payload, a `source.json` in the **telegeography variant** (the one with
  `sha256` per file), and a README in the `us_datacenters` style whose
  `Depth:` bullet states what is hand-curated. Assert that the fetched count
  equals a `returnCountOnly=true` count before writing; ArcGIS reports
  failures as **HTTP 200 with an error object**, so check the body, not the
  status.

  **Not `exceededTransferLimit`, which the draft asked for.** That flag is
  `true` on every page but the last while paging — it means "more records
  remain", not "this page was truncated", so asserting it false fails the
  build on page 1 of 17. The failure worth catching is a page **shorter than
  the size requested while records remain**, which silently shortens the pull.

  **Both datasets are built in full before anything is written.** A failure in
  the second build must not leave the first file rewritten beside a
  `source.json` that still describes the file it replaced.

  **The 3 MB budget does not survive contact with the data, and the honest
  answer is to restate it rather than delete geometry.** Fetched at 5 decimals
  and emitted at 4 (~11 m — a tenth of a pixel at the closest tier this layer
  draws, which resolves roughly 100 m to the pixel), measured over the same
  32,892 features:

  | decimals | ~resolution | bundle | gzip | vertices | parts dropped |
  |---|---|---|---|---|---|
  | 5 | 1.1 m | 4.15 MB | 1.15 MB | 193,169 | 11 |
  | **4** | **11 m** | **3.69 MB** | **0.93 MB** | **189,287** | **86** |
  | 3 | 111 m | 2.93 MB | 0.65 MB | 167,022 | 546 |

  "Parts dropped" are runs that collapse below two distinct points at that
  rounding — real geometry deleted — out of **32,971 source parts**. Only 3
  decimals meets 3 MB, and it gets there by deleting 546 parts. So the row
  ships **3.69 MB on disk, 0.93 MB over the wire**, and the budget line is
  amended here rather than met by quietly coarsening the map.

  **A system with no geometry is dropped by name, never emitted empty.** One
  exists: `Tallgrass Interstate Gas Transmission`, a single feature whose
  source record carries **no `geometry` key at all** — so 234 systems are
  emitted from 235 keys, and 229 operators from 230. The loss is printed by
  the build and recorded in `counts.emptiedSystems`, and the runtime counts
  are derived from what survived rather than copied from the payload, so a
  panel can never name more systems than the map draws.

#### 10.7.3 The join — one crossing, one mark, every filing

- **R4.21** **Pair NACEI filings across the border, never on name and never
  by proximity alone.** A pure function in `src/layers/gasFlows/naceiCells.js`
  pairs each filing with its **mutual nearest cross-border neighbour** within
  **1,500 m**: two filings pair only when each is the other's nearest filing
  from a *different* government. Measured on the live 99 records, that yields
  **60 marks, 39 of them paired**, with **21** carrying a direction
  contradiction between the two governments. Fixture for the test: the
  (31.334, −109.819) Naco / El Paso pair, 75 m apart.

  **This supersedes the coordinate grid the first draft specified, and the
  reason is load-bearing.** That draft asked for "a 3-decimal cell (~110 m)
  plus country pair" and claimed it collapses 99 records to ~69 cells of which
  24 hold two or more. Measured, those two halves disagree — the counts are
  the **2-decimal** result, not the 3-decimal one:

  | grid | cell size | cells | cells with 2+ |
  |---|---|---|---|
  | 4 decimals | ~11 m | 99 | 0 |
  | 3 decimals | ~111 m | **95** | **4** ← the specified grid |
  | 2 decimals | ~1,110 m | 69 | 24 ← the claimed counts |

  The country-pair half of that key is also **inert**: including it changes
  nothing at either precision. And a grid is the wrong instrument regardless,
  because it measures *shared address* where the fault needs *proximity*.

  **No radius separates the two populations.** 22 pairs of filings sit within
  3 km of each other under the **same** government — necessarily distinct
  crossings, the closest 13 m apart (Mexico's `Reynosa- TETCO` at 350 MMcf/d
  and `Reynosa - TENNESSE` at 140) — while genuine cross-border duplicates run
  from 15 m (`ANG Mainline` / `Gas Transmission Northwest`) to at least
  1,467 m (`Detroit River/Windsor 1 And 2` / `Panhandle Eastern PL`). A 300 m
  single-link pass merges six groups of same-government filings — collapsing
  four distinct US points of entry at Sumas into one mark — while still
  drawing `Vector` / `Vector Pipeline Co` (409 m) and `Bluewater` /
  `Bluewater` (439 m) twice.

  **The asymmetry that settles the design: over-merging is destructive,
  under-merging is safe.** Identity comes exclusively from EIA (R4.23) and the
  crosswalk is hand-verified (R4.25). Two crossings wrongly sharing a mark
  means several EIA volumes resolve to one mark and are lost or summed, and
  R4.24 forbids summing. One crossing wrongly keeping two marks means the
  crosswalk pins the volume to one and the other stays an unjoined NACEI-only
  dot, which R4.26 already draws and labels. So the rule is conservative by
  construction: same-government filings never merge at any distance, and
  mutual pairing is 1:1, so **no mark can ever hold more than two filings** —
  a property single-link cannot provide. Pinned by a test.
- **R4.22** **Exactly one marker per cell.** Never two at one pixel, never an
  offset jitter to "reveal" the second — that would let the analyst count the
  same crossing twice. No collar, no ring, no split arc: a symbol carrying
  neither magnitude nor direction is visual debt whose meaning is invisible
  until the dossier is open.
- **R4.23** **Identity comes exclusively from EIA.** NACEI contributes the
  coordinate and nothing else. The mark's title, number, colour, size and
  direction are all EIA. NACEI filing names never appear on a card —
  `El Paso Natural Gas Pipeline · US→MX · 57 MMcf/d` on a current-looking
  card is the LNG failure exactly. The card title carries the literal suffix
  `· 2 FILINGS` where the cell holds more than one.
- **R4.24** **Both filings appear in the dossier as sibling rows, verbatim,
  and are never summed, averaged, reconciled to a "best" value, or resolved
  by a "prefer the US filing" rule.** Summing Naco's 109.926 and El Paso's 57
  invents a 167 MMcf/d crossing nobody filed. The analyst is entitled to see
  that two governments disagree about the direction of the same pipe.
- **R4.25** **The `duoarea → cellId` crosswalk is a checked-in build
  artifact**, ~62 rows, hand-verified against NACEI `City` / `StateProv`,
  each row carrying `confidence: 'exact' | 'city-match' | 'manual'`. Measured
  match rate on city + state alone: **30 of 40**. Anything below `exact`
  appends `· join: manual` to the dossier subtitle and to the selected card,
  so the soft joint states its own softness.
- **R4.26** **NACEI-only cells** — a 2017 filing with no joining EIA point —
  render at local tier only, at floor size in `#9aa4b2`, **pickable**, with a
  card whose first line is literally `GEOMETRY ONLY · NACEI 2017 · NO EIA
  FILING`. A dot that cannot say what it is will eventually be read as a
  small flow.

#### 10.7.4 The provider and the live join

- **R4.27** EIA is a **server-side provider**, `server/providers/eia.js`,
  built as a Vite plugin factory registered by one import and one line in
  `localProviderPlugins()` (`server/providers/local.js`). This is the first
  commodity server provider in the fork and it is justified twice over: R12
  puts keys server-side, **and** `www.eia.gov` serves no CORS headers at all,
  so even the keyless file endpoints need a proxy.
- **R4.28** The key is read **lazily, per request** —
  `const apiKey = () => String(process.env.EIA_API_KEY || '').trim()` —
  because `loadEnv()` copies `.env` into `process.env` *after* provider
  modules are imported. Reading at import time silently sees an unset value
  forever. Entered through POWER UP; registered in `src/keySetupCore.mjs`
  `KEY_SETUP_KEYS`, `scripts/setup-doctor.mjs` `CREDENTIALS`, `.env.example`
  and `scripts/pinokio-environment.mjs`.
- **R4.29** **Degrade, never fail.** No key → the data route returns
  `503 {error:'no_key'}`, the status route returns `200 {hasKey:false, …}`,
  and the client maps that to `stats.keyRequired` so the panel shows the
  POWER UP tooltip. The layer still renders the bundled network and the
  roster pips and says the volumes are unavailable.
- **R4.30** **Every API v2 route, facet and field name is currently
  `[UNVERIFIED]`.** No probe obtained a 200 from `api.eia.gov` this session:
  keyless returns `403 API_KEY_MISSING` and DEMO_KEY returns
  `429 OVER_RATE_LIMIT` with `Retry-After: 12330` (3.4 h), reproduced on four
  independent passes from two egress paths — and a **prior session already
  burned it**, the 429s being cached in `.gev-logs/eia-imp.json` and
  `eia-exp.json`. The volumes quoted throughout this PRD were read from the
  **keyless `dnav` HTML tables**, which do work. Milestone 1 is therefore
  "register a key and capture dated fixtures", and nothing downstream may be
  written against a guessed route shape.
- **R4.31** **The no-price rule is enforced by a process-code allowlist at
  ingest**, `Object.freeze(['IRP','ENP'])`, plus a unit assertion that every
  accepted value carries MMcf and that a `$/Mcf` row can never become a
  record. This cannot be achieved by avoiding price routes: EIA publishes
  **"Pipeline Prices" in $/Mcf in rows directly adjacent to the 226,798 MMcf
  volume** on the same page `[LIVE]`. Stripping happens in the portable
  source module, which never imports Cesium, so no future card change can
  leak them.
- **R4.32** History for the five-year band is **one bulk series request**
  (~50 points × 2 processes × 72 periods), cached with a TTL keyed on the
  source's next release date rather than a fetch timestamp, and **never
  cached partially** — EIA re-estimates the two previous months on every
  release unconditionally, revises earlier months when a state crosses a 1–5%
  threshold, and replaces the two prior calendar years each October. Cold
  start is a legitimate state in which every band reads `unknown`.
- **R4.33** A **freshness watchdog** alarms when the newest available period
  stops advancing, independent of HTTP status. A 200 that keeps serving the
  same month forever is the exact shape of the discontinued Natural Gas
  Weekly Update, whose page still returns 200 and whose last issue was
  January 2026.

#### 10.7.5 The visual system — three epistemic grades

- **R4.34** **Every mark belongs to exactly one of three grades, and the
  grade is legible before the legend is read.**

  | Grade | Meaning | Form | Colour | Size | Picks |
  |---|---|---|---|---|---|
  | **INK** | EIA filed a value for the newest published period | filled disc or hollow ring, ± pupil | five-year band status ramp | `√gross` | yes → card + dossier |
  | **GRAPHITE** | named roster point, no value this period | hollow ring, transparent fill | `#9aa4b2` unknown | **fixed 7 px** | yes → dossier reading `no filing` |
  | **PENCIL** | mapped only — NACEI 2017 cell, 2020 network | hollow dot / 1 px hairline | `#6f7a88` thin | **fixed 6 px / 1 px** | dot yes, **network no** |

  **The invariant: nothing that is not a measured volume for the newest
  published period may vary in size.** Size variation is reserved,
  exclusively, for `IRP`/`ENP` MMcf.

- **R4.35** **Magnitude.** `crossingPixelSize(record, {tier, hovered})` calls
  `assertEiaVolumeRecord(record)` — which **throws** on a NACEI or network
  record — then returns
  `round(min(30, max(6, 6 + 2.7·√(gross/1000))) · tierFactor + (hovered ? 4 : 0))`
  with `tierFactor` `{local 1.00, regional 0.85, global 0.72}`. Worked:
  Rio Grande 55,042 → **26 px** local; Sumas gross 27,322 → **20 px**;
  St. Clair gross 53,757 → **26 px**; Galvan Ranch 18 → **6 px**, the floor —
  present, clickable, and not pretending to be nothing.

- **R4.36** **Direction is ink, not an arrow.** Filled area means gas **into**
  the United States; empty area means gas **out** of it. Net IN: status hex
  at 0.92 fill, `rgba(4,12,16,0.90)` outline, 1 px. Net OUT: `#0c0c14` at
  0.85 fill, status hex outline at full alpha, 2.5 px. No chevron and no
  bearing, because the border normal is unknowable from this data — it runs
  east–west at Sumas and north–south at Detroit — and direction is a
  *categorical* fact from a *current* field (the process code), so it gets a
  categorical channel. Across the northern border the eye sees a row of solid
  discs; along the southern border a row of rings. US–Mexico is effectively
  one-way out and it *looks* one-way. That is the single most useful
  three-second read this dataset supports.

- **R4.37** **Bidirectionality is a concentric pupil whose area is honest.**
  Drawn whenever both processes filed a value, with **no minimum share** —
  Sumas's 125 MMcf is a real published number and the map must be able to
  answer "which points have any counterflow at all".
  `pupilPixelSize = clamp(outerPx · √(min/(a+b)), 2.5, outerPx − 3)`, so the
  pupil's **area** is the minor direction's share of the disc's area, drawn
  in the opposite ink. Sumas → 0.46% minor share → the **2.5 px floor**, a
  solid disc with a pinprick. St. Clair → 29.3% → a **14.1 px core inside a
  26 px ring**, a 5.9 px annulus reading instantly as "big both ways, net
  out" — the case a single net arrow would destroy. Implemented as a
  **single composite glyph billboard** over a cached canvas keyed
  `${outerPx}|${pupilPx}|${fillHex}|${form}`, not two coincident points:
  draw order between depth-test-disabled coincident points is not guaranteed
  and a normal offset does not fix it. Plain marks stay `PointGraphics`.

- **R4.38** **The network is inert by construction.** One batched
  `GroundPolylinePrimitive` with `granularity: 0`,
  `classificationType: ClassificationType.BOTH`,
  **`PolylineColorAppearance({ translucent: true })`**, per-instance
  `color`/`show` so chip and tier changes never rebuild, `asynchronous: true`,
  and **`allowPicking: false`**.

  **Two corrections to the first draft of this requirement, both of which
  would have shipped a defect.**

  *The appearance.* The draft specified `PerInstanceColorAppearance({flat:
  true})`. That class does not drive a ground polyline: Cesium's own
  `GroundPolylinePrimitive` docs say *"Some appearances, like
  {@link PolylineColorAppearance} allow giving each instance unique
  properties"*, and the class's own worked example uses
  `new Cesium.PolylineColorAppearance()`. `grep -rn "PerInstanceColorAppearance" src/`
  returns three hits in this repo and **not one is on a ground polyline**.
  Built as written, the per-instance `color` attribute is ignored and the
  Interstate/Intrastate alpha step **silently collapses to one flat colour** —
  a layer that looks finished and is wrong.

  *The provenance.* "The primitive proven at 1,913 instances on submarine
  cables" names a path that does not exist. `src/layers/submarineCables/`
  constructs **no** `GroundPolylinePrimitive` at all — it loads a
  `GeoJsonDataSource`, and 1,913 is the MultiLineString **part** count rendered
  as entities. Two consequences follow. Entities are **pickable by default**
  (`interaction.js` already runs `viewer.scene.pick` on LEFT_CLICK), so
  "non-pickable by construction" requires the primitive path, not the entity
  path. And the real in-repo precedents are
  **`src/data/contactTrailRenderer.js:71`** — the only batched
  `GroundPolylinePrimitive` in the repo, with `allowPicking: false`,
  `asynchronous: true`, `classificationType: BOTH` and
  `PolylineColorAppearance({ translucent: true })` already in place — and
  `src/layers/satellites/rendering.js:56-68`, which pairs
  `PolylineColorAppearance.VERTEX_FORMAT` with a matching `depthFailAppearance`.
  Copy those, not the cables layer.

  One lesson from the cables layer does still apply: hiding a data source with
  `show = false` does **not** stop Cesium walking its visualizers every frame
  (`rendering.js releaseDataSources()` says so in a comment), so the `GRID`
  chip must toggle per-instance `show`, not layer visibility.

  | Property | Value | Why |
  |---|---|---|
  | Colour | `#6f7a88`, the shared `thin` token | `thin` already means "not enough data to say anything" across this console |
  | Alpha | Interstate 0.30 local / 0.18 regional; Intrastate 0.20 local, absent regional | one legible step, from the only field with real distinct values |
  | Width | **1.0 px, constant, every tier, every state** | varying width is the canonical quantity channel on a flow map; this dataset has no diameter, capacity, pressure or throughput |
  | Dash | **none, solid** | a dash along a line reads as direction of travel to a commodities analyst, and a static dash conventionally reads as "proposed" — both false |
  | Pattern | none, explicitly **not** the static chevron material | chevrons on a network with no direction field fabricate direction |
  | Picking | **off** | the load-bearing honesty decision: the network cannot be clicked, so it can never produce a card, so it can never assert a number — and it deletes the 2.5 px-line-against-3 px-pick-box problem outright |

- **R4.39** **The network's vintage is visible in five non-dismissible
  places**: a corner stamp whenever network geometry is on screen
  (`NETWORK · EIA TRANSMISSION · JAN-2020 · GEOMETRY ONLY · NO FLOW`); the
  chip label `GRID 2020`, not `GRID`; an amber `2020` panel badge that is a
  **badge, not a toggle, and not dismissible**, because a closable warning is
  exactly how stale-as-current happens again; a legend row; and a dossier
  section that names and rejects the false `dataLastEditDate`.

- **R4.40** **No motion. Not one animated pixel, and no render hold.**
  Asserted by a governor-diagnostics test after activate, hover, select,
  dossier and deactivate. Four independent reasons: **(1)** nothing here
  moved — the newest observation is a monthly total published eleven weeks
  ago, and **a `published`-class observation must not animate**, which is a
  rule for every future commodity layer, not just this one; **(2)** the lines
  carry no flow, and `GevRouteFlow` takes its direction from the order of the
  positions array, so scrolling dashes would animate a 356 m digitizing
  chord and call it gas; **(3)** it could not encode magnitude anyway —
  `repeat: 64.0`, `duty: 0.46`, `speed: 0.55` are hard-coded in
  `FlowMaterialProperty.getValue`, so 18 MMcf and 55,042 MMcf would flow
  identically, and making them per-entity means editing a shared upstream
  module and claiming an R13 exception to do it; **(4)** `isConstant === false`
  would pin `requestRenderMode = false` for the session — the GPU burn the
  governor exists to prevent — for a dataset that updates twelve times a
  year. What replaces it: **stillness as the freshness claim**, said once in
  words by a first-run toast, plus discrete one-frame
  `governorRequestRender()` restyles on hover and select, and the dossier's
  existing CSS entrance.

- **R4.41** **Zoom tiers**, reusing `detailTierForHeight` verbatim
  (`local < 300_000`, `regional < 2_500_000`, else global), recomputed on
  `moveEnd` only. Cohort budget 28, priority-sorted
  `gross desc → filed-but-small → silent roster → NACEI-only`, tie-broken by
  id so selection is deterministic frame to frame.

  | Tier | Drawn | Withheld, deliberately |
  |---|---|---|
  | **global** ≥2,500 km | top 28 crossings **that filed**, ×0.72; labels on the top 8 with a direction glyph; the period stamp | **the network** — 32,892 hairlines at this altitude is a continental smear that reads as "gas is everywhere", and its density is a digitizing artifact. Silent pips, NACEI-only cells, country rollups, and any line or arc between two countries |
  | **regional** | full roster in view including silent pips, ×0.85; pupils; network **Interstate only** at 0.18; 3-line cards | intrastate network; NACEI names and 2017 capacities; any chevron or arrow |
  | **local** <300 km | everything at ×1.00; network both classes; **NACEI-only cells**, pickable; 4-line cards | gathering and distribution pipe — absent from every free source by regulation; no placeholder, no halo, no "network ends here" guess |

- **R4.42** **Marks are horizon-culled.** Fixed-height points with
  `disableDepthTestDistance = POSITIVE_INFINITY` write no far-side depth.
  Because the layer takes no render hold it has no per-frame callback, so the
  cull recomputes on `moveEnd` and `cameraChanged` and a marker may be
  briefly wrong mid-fling. That is accepted; the alternative is a hold.

#### 10.7.6 Comparison to normal

- **R4.43** **Every window anchors on the newest published period, never on
  today.** With an 80-day lag, a "last 3 months" window computed from the
  wall clock covers three months EIA has not published and reads as a total
  collapse to zero.
- **R4.44** **Trailing-window deviation is refused structurally, not by
  convention.** `src/layers/gasFlows/compare.js` exports **only**
  `compareSameMonth(node, dir, period)` and contains no code path that can
  compute a trailing window. US residential demand swings ~7.7× between
  January and June; a trailing-12 badge would print `collapse` across the
  northern border every summer from the calendar alone, and an analyst who
  sees one false collapse stops reading the layer.
- **R4.45** **The five-year same-month band drives the colour; year-over-year
  is a printed number with its base.** Band inputs are the same calendar
  month in each of the five prior years. The status ladder is evaluated in
  this exact order, first match wins:

  ```
  1. unknown   value is null                                  #9aa4b2
  2. unknown   prior-year null OR fewer than 3 band years     #9aa4b2  "insufficient history"
  3. thin      value < 500 MMcf                               #6f7a88
  4. collapse  below band min AND YoY <= -50%                 #ff3b5c
  5. surge     above band max AND YoY >= +50%                  #c3ff5b
  6. down      below band min OR  YoY <= -15%                  #ffb347
  7. up        above band max OR  YoY >= +15%                  #7cff9b
  8. normal    otherwise                                       #39d5ff
  ```

  `unknown` precedes everything, so a missing value can never be coloured
  `normal`. `thin` precedes every ratio rung, so Galvan Ranch's 18 MMcf can
  never flash a `surge` off a ±300% swing on a rounding-scale number — its
  card shows the absolute only and drops the YoY part entirely.
- **R4.46** **A verdict is never shown without its band.** Every rendered
  verdict is accompanied by the min–max, and from rung 3 onward by the
  median, the percentile and the coverage count (`5/5 yrs`). A percentage is
  never rendered without its base: the formatter returns `''` when the
  prior-year value is null so `joinParts` drops the part rather than printing
  a bare `+12.4%`.
- **R4.47** For a bidirectional point the colour describes the **dominant
  direction only**, the card says `dominant IN` / `dominant OUT` so the
  analyst always knows which series the hue is about, and the minor
  direction's own comparison is stated separately in `#6f7a88`.

#### 10.7.7 Cards and the dossier

- **R4.48** **The five-rung ladder**, each rung a named pure function in
  `cards.js`, every line through a `clampLine` and a `joinParts`.

  **Neither of those is importable today, and the draft's signature is
  wrong.** `grep -rnE "export (function )?(clampLine|joinParts)" src/` returns
  **zero hits**. The real `clampLine` is module-private at
  `src/layers/datacenters/model.js:119`, takes **one argument**, and reads its
  110-character limit from a module constant — `clampLine(s, 110)` would
  silently ignore the second argument. `joinParts(parts, sep = ' · ')` is
  declared **twice, byte-identically**, at `model.js:126` and
  `dossier.js:19`, and the other three card modules (`cctv/cards.js`,
  `firms/cards.js`, `vessels/cards.js`) each carry their own helpers instead.
  **There is no shared card-primitives module in this repo.** So this row
  chooses explicitly: lift both into `src/layers/commodities/cardText.js` and
  re-point the two datacenters call sites. That touches a shipped layer, so it
  is an R13 shared-surface change and carries the datacenters regression check
  named in R4.52 — budgeted in milestone 6, not discovered during it.

  Title glyphs: `⇄` both directions filed, `▸`
  export-only, `◂` import-only, `○` in roster and silent, `·` geometry only.
  The rule per rung: **rung 2 is the raw figures, the seasonal verdict with
  its band, and where/when; rung 3 adds per-direction rates, the
  median/percentile/coverage and the publication calendar; rung 4 gives the
  reverse leg its own line and the filings their own line with the compound
  key.** Worked examples, literal — Sumas WA rung 3:

  ```
  title:  SUMAS WA ⇄ · GROSS 27,322 MMcf
  line 1: IN 27,197 MMcf (0.91 Bcf/d) · OUT 125 MMcf (<0.01 Bcf/d) · NET 27,072 IN
  line 2: YoY IN +12.4% (JUN-25 24,190) · 5Y JUN MED 25,610 · PCTL 62 · BAND NORMAL · 5/5 yrs
  line 3: PERIOD JUN-26 · 30 days · pub 31-AUG-26 · lag 80d · next JUL-26 ~30-SEP
  line 4: click the marker for the dossier
  ```

  Rio Grande TX rung 4:

  ```
  title:  RIO GRANDE TX ▸ · GROSS 55,042 MMcf · JUN-26
  line 1: OUT 55,042 MMcf · IN not filed · NET 55,042 OUT · dominant OUT · largest US→MX point
  line 2: 1.83 Bcf/d out over 30 days in JUN-26 · no reverse filing this period
  line 3: YoY OUT +8.9% (50,543) · 5Y JUN 38,110–57,402 · MED 49,880 · PCTL 78 · BAND NORMAL
  line 4: 1 FILING · ENP <duoarea> 55,042 · IRP roster member, no value JUN-26 · PK = duoarea+process+period
  line 5: EIA · pub 31-AUG-26 · fetched 18-SEP 09:14Z · lag 80d · join manual · descriptive only
  ```

  A silent roster point reads `NOT A ZERO · NOT A CLOSURE · last filed
  MAR-26 · silent 3 of last 12 periods`. **Only the measured figures above
  are contractual** — the YoY values, band bounds, percentiles and fetch
  clocks are runtime-derived and shown with illustrative digits; the
  **format** is the contract.
- **R4.49** **Killed from every card:** the per-crossing network-vintage
  boilerplate line. A line that never changes is not a card line — the fact
  lives on the chip, the corner stamp, the badge and the dossier. Also
  killed: any line that explains the renderer to the analyst.
- **R4.50** **The dossier** is a new module exporting a pure
  `buildGasCrossingDossierModel(...)` returning the proven
  `{kicker, title, subtitle, stats[4], chart, sections[5], timeline[],
  sources[], notes[], footer}` shape, so empty sections drop automatically
  and an uneven roster renders without holes. Five sections: **FILINGS THIS
  PERIOD** (the two rows with the same `duoarea` and different process, under
  a header reading `PK = duoarea + process + period` — the collision surfaced
  as evidence, not hidden as plumbing); **SEASONAL POSITION** (with a
  permanent note row stating why trailing-window is not used); **BORDER
  FILINGS (NACEI 2017)** (`GEOMETRY ONLY · TWO FILINGS · NOT SUMMED`);
  **PIPELINE CONTEXT (EIA, JAN-2020)** (`FEATURE COUNTS ARE DIGITIZING
  ARTIFACTS`, naming and rejecting the false timestamp); and **PROVENANCE &
  LIMITS** (scope, measure, exclusions, roster, off-map, join confidence,
  vintage gate, and the invariant with its measured delta). `timeline[]`
  carries the **publication calendar** — period end, publication, fetch, next
  expected — which is what actually defuses stale-as-current. Only the band
  stat tile takes a status hex; gross and net are facts, not judgements.
- **R4.51** **A new chart, not the existing one.** `renderChart` does not
  merely assume non-negative values — it **deletes** them before scaling.
  `src/layers/datacenters/dossier.js:433` is
  `const usable = points.filter((p) => p.itPowerMw > 0 || p.facilityPowerMw > 0);`
  followed by `if (usable.length === 0) return svg;`. Net flow crosses zero —
  permanently negative at every Mexican point under an IN-positive convention
  — so every column fails that filter and the chart returns an **empty SVG
  with no axis, no bars and no error**, indistinguishable from "no data"
  rather than obviously wrong. A silent blank is the worst of the three
  possible failures, and it is why this row builds its own.
  `renderGasChart` is a new
  hand-built inline SVG with its own class prefix, leaving `dc-chart`
  untouched: 24 columns ending on the **newest published period**, default
  view mirrored IN/OUT about a zero rule (imports above in `--accent`,
  exports below), a signed NET toggle with zero forced into the domain, a
  per-column five-year same-month whisker with a median tick — **a bar poking
  out of its own whisker is the entire point of the chart** — and, for an
  unfiled month, **no bar** plus a dot on the zero rule, because a
  zero-height bar sitting on the axis looks like a measured zero. Bars are
  never status-coloured: `up`/`down` mean "versus seasonal normal" and
  reusing them for the sign of a flow would collide two meanings in one hue.
- **R4.52** The dossier ships two fixes the existing drawer lacks:
  **keyboard** (`Escape` closes, `Tab` trapped, `role="dialog"`, focus
  returned to the marker's overlay entry) and **the right-rail overlap**,
  offset from the measured rail width rather than a fixed `right: 16px`. The
  second touches a shared drawer already shipped, so it carries a datacenters
  regression check.

#### 10.7.8 Panel, legend and chips

- **R4.53** Layer id `commodity-gas-flows`, name `Gas · Cross-Border Flows`,
  keyboard token **`l`** — with `v` reserved for a later `energy-plants`, and
  digits available beyond that, so no layer is ever merged to save letters.
  Inserted alphabetically in `layerState.js` between **`commodity-chokepoints`
  and `commodity-ports`** — not between `energy-datacenters` and `flights`, as
  an earlier draft of this requirement said; `commodity-gas-flows` sorts on
  `g` inside the `commodity-` prefix, and `layerState.test.mjs:164` asserts the
  registry is sorted, so the wrong slot fails the suite. In the `Commodities`
  panel group it is appended after `energy-datacenters`, because presentation
  order is a separate list from registry order (`PANEL_GROUPS`) and does not
  have to match it.
- **R4.54** **The visible row label overrides the registered name:**
  `Gas · Border Crossings (monthly)`. "Flows" is the wrong word on a control
  the analyst reads every session — it implies something continuous and
  current when the measure is a monthly total published 80 days in arrears.
  `PANEL_LABELS` exists for exactly this.
- **R4.55** **The meta line decays on its own.**
  `JUN-26 · pub 31-AUG · 80d lag · 47 PTS · 34 FILED · 13 NULL · 3 OFF-MAP · EIA`
  — where the lag is recomputed from period end on every render and **never
  stored as a string**, so it becomes `81d lag` tomorrow with nobody touching
  the code. **Only the format is contractual.** `47 / 34 / 13 / 3` are
  illustrative digits: no measured figure in this document yields them, and
  the roster size is still open (see the cardinality note below). They carry
  the same disclaimer R4.48 puts on its worked cards, and for the same reason
  — an unmarked number in a document about unmarked numbers is the sin it
  names. Feed states: `nominal` when the invariant holds; `partial` when
  the network fails but crossings load; **`degraded` when the invariant
  fails**, dropping every marker to floor size and `#9aa4b2` with the meta
  line reading `INVARIANT FAILED · MAGNITUDES SUPPRESSED` — a blank layer
  beats a doubled border; and `stale` only when the next period is **more
  than 20 days overdue**, never on a wall clock, because a permanently lit
  badge teaches the analyst to ignore badges. **The panel must resolve
  `freshnessClass: 'published'` to `PUBLISHED` and must never print `LIVE`
  for this layer** — that is a build blocker, not a styling preference.
- **R4.56** Chips: `BORDER [ALL] CAN MEX`, `SIZE [GROSS] NET`,
  `GRID 2020 [ON] OFF`, `SILENT [ON] OFF` — **hiding the silent points is the
  lie**, so they default on. `2017` and `2020` are badges, not toggles. There
  is **no `FLOW` chip** and no period stepper: the period is a readout and
  belongs in the meta line where the timestamp already lives.
- **R4.57** The legend is a **state legend**, not a colour key: it names the
  three grades, states that filled area is gas into the US and empty area is
  gas out, states that the network is 1 px everywhere **because width would
  imply a capacity this dataset does not have**, and closes with the two
  lines that stop a misread — that gathering and distribution are absent from
  every free source by regulation, and that the layer is descriptive only.
  Those lines are never collapsed behind a "more" affordance.

#### 10.7.9 Sources struck from the row

- **R4.58** **`Lng_ImportExportTerminals_US_EIA` and NACEI layer 5 are
  struck.** Both are disqualified, not merely stale. The EIA copy holds 8
  records all stamped "As of Apr 2020", lists Everett and Northeast Gateway
  as **Import**, omits Calcasieu Pass, Plaquemines, Golden Pass and Corpus
  Christi Stage 3 entirely, and its liquefaction column sums to ~5.5 Bcf/d
  against the **16.06 Bcf/d baseload actually in service** `[LIVE]`. NACEI
  layer 5 is worse: Freeport, Cameron, Golden Pass, Lake Charles and Cove
  Point all read **"Import"**. The structural reason is that those terminals
  were built to import and rebuilt to export, so a 2016–2020 dataset gets the
  arrows backwards on the largest gas flows in North America. Milestone 9
  rebuilds LNG from the quarterly liquefaction workbook with the producing
  sites hand-geocoded.

  **Recording the strike in `UPGRADE.md` and `docs/COMMODITIES.md` is owed,
  not done.** This requirement previously asserted in the present tense that
  both files carry it. Neither does: `docs/COMMODITIES.md` still lists
  `Lng_ImportExportTerminals_US_EIA` in its "Verified endpoints" table with no
  strike, no vintage and no host, and `UPGRADE.md` has not been touched since
  before this row was written. So the struck, import-mislabelled endpoint is
  still live and unannotated inside the document whose job is to prevent
  exactly that. Milestone 11 owns the edit; this requirement no longer claims
  it has happened.

  **And the reason for the strike has to change, because a vintage gate cannot
  catch it.** The 2016–2020 datasets are wrong *and* old, which made staleness
  look like the cause. It is not: **PHMSA's RY2025 LNG annual report — current
  by any gate — files Golden Pass as `FUNCTION_OF_FACILITY = "Marine Terminal
  - Import"`**, Freeport as non-terminal storage, and Corpus Christi's capacity
  as 0. A 24-month vintage test waves that straight through. The strike stands
  on the label being **wrong in the current operator filing**, and the general
  rule it implies is R4.60.
- **R4.59** **Record `hosted_by` per file, and back it with a manifest that
  fails the build.** Several of the gas services in the repo docs are hosted
  on **personal or university ArcGIS accounts** (`maloneao_app21`; a
  University of Kansas user account) rather than government infrastructure —
  they can be deleted, made private, or silently re-uploaded with different
  data and nothing in the app would notice.

  **The pipeline layer is not one of them, and the draft said it was.**
  Measured: item `9833ca6c8103490b8ad145a30f0522ee` is owned by
  **`Federal_User_Community`** (Esri's federal data community, created
  2020-04-30, 3.6M+ views), its `accessInformation` credits EIA, and its
  `licenseInfo` reads *"This work is licensed under the Esri Master License
  Agreement"* — an Esri MLA notice wrapped around public-domain federal data.
  It is a curated community host, not a personal account and not an eia.gov
  endpoint. The provenance says which, per file, because "third-party" covers
  two very different risks.

  Either way the mitigation is the same and it ships: a build-time manifest of
  expected record counts, field vocabularies and vintages that **fails loudly**
  when any of them moves — feature count, distinct `Status` values, distinct
  `TYPEPIPE` values, operator count, blank-field counts, and the resolved mark
  count.

- **R4.60** **The gate is a second measurement, not a date.** The 24-month
  vintage rule (R4.11) guards against one failure — a 2016 dataset labelling
  Freeport an import terminal — and the sources measured for this row say the
  *next* failure walks straight through it as a current, federally-filed
  number that is simply wrong. Measured instances: PHMSA's RY2025 filing calls
  Golden Pass an import terminal **today**; EIA's own 2020 shapefile converts
  47 null BTU readings into measured zeros; the Texas RRC's "transmission"
  subset contains records named `IRRIGATION DISTRIBUTION SYSTEM`; PHMSA and
  the Texas RRC disagree by 11.5% on Texas mileage with neither being stale.
  **In every one of those the date passes and the content lies.**

  So: where a number has an independent second measurement — a sum of parts
  against a published total, one agency against another, a Canadian-side
  throughput against the US-side filing at the same crossing — bind the
  encoding to it and drop to `degraded` on drift, exactly as the Canadian
  reconciliation invariant already does (R4.9). **Where a number has no second
  measurement, no vintage makes it INK.** This is a rule for every future
  commodity layer, not just this row.

---

### 10.8 Constraints and invariants

- **R2 / R9** — freshness class `published`; the panel meta line is the EIA
  published period, and the panel must not render it as `LIVE`.
- **R3 / R6** — observation contract from birth via
  `src/layers/commodities/observation.js`; row 4 starts only after row 1
  completes. Row 1 milestone 1 landed 2026-09-18; milestone 2 is open.
  `energy-datacenters` has since adopted the contract and added a
  **live-decoration subsystem** (`live.js`, `liveSource.js`, an independent
  second source joined per row, the layer keeping `freshnessClass:
  'published'` while each live line carries its own stamp) — **that is the
  pattern for a bundled substrate under current numbers, and row 4 copies it
  rather than inventing one.**
- **R11** — descriptive only: counts, volumes, directions, timestamps and a
  band position. No panel recommends anything. Enforced at ingest by the
  process allowlist, not at render.
- **R12** — free-tier source, key server-side via POWER UP.
- **R13** — additive; new layer family, new provider, no upstream layer
  internals edited. The one shared-surface change is the dossier's right-rail
  offset, which is claimed explicitly and carries a regression check. **The
  `GevRouteFlow` parameterisation exception is never claimed**, because the
  layer does not animate.
- **Sequencing** — pulled ahead of row 3, which is independent. Row 5 depends
  on this row's assets.
- Adding a layer moves **four** pinned assertions across three test files, and
  two of them are order-sensitive rather than counts. They move **in the same
  commit as the layer**, not after:
  - `src/app/constructCatalog.test.mjs:42` — `first.layers.length` is **24**.
  - `src/data/layerState.test.mjs:161` and `:162` — `REGISTERED_LAYER_IDS.length`
    **and** `new Set(REGISTERED_LAYER_IDS).size`, both **24**; plus `:164`,
    `assert.deepEqual(REGISTERED_LAYER_IDS, [...REGISTERED_LAYER_IDS].sort())`,
    so the id must be inserted in alphabetical position, not appended.
  - `src/sources/reference.test.mjs:15` — an **order-sensitive** `deepEqual` on
    `Object.keys(createReferenceSources())`, currently
    `['earthquakes','cables','chokepoints','ports','datacenters']`. A sixth
    source must be appended to the object literal in `src/sources/reference.js`
    **and** to that array, in the same position, or the test fails on ordering
    even when the count is right.

  `constructCatalog.test.mjs:44` also pins a contiguous construction-order
  slice from `traffic` to `directions`; appending after `datacenters` does not
  disturb it, but a mid-list insertion would.
  `constructCatalog.test.mjs` also pins a contiguous ordering slice that a
  mid-list insertion would break; appending after datacenters does not.
- **The roster size is not settled, and six different cardinalities appear in
  this document.** None is marked authoritative: `union ~ 40 distinct
  crossings` (§10.1), `about forty to fifty named crossings` (§10.2), `~62
  rows` and `30 of 40` city+state matches (R4.25), `~50 points` (R4.32), and
  `47 PTS` (R4.55). The NACEI side is now measured — **60 marks, 39 of them
  paired** — but that is a count of *places*, not of EIA points of entry, and
  the two need not agree. Roster size is a live build input: R4.41's cohort
  budget of 28 is sized against it, the `OFF-MAP` chip counts against it, and
  milestone 2's roster test asserts it. **Milestone 1 settles it from the real
  EIA response and every other figure is restated from that one**, rather than
  each section carrying its own estimate.

- **"The headless check" is not a committed thing, and every acceptance
  criterion below that names one has to say which script it means.** The
  render probes this project has been using — `render-datacenters.mjs`,
  `probe-chokepoints.mjs`, `probe-ports.mjs`, and the `GEV_W` / `GEV_H`
  overrides — all live under **`.gev-logs/`, which is line 8 of `.gitignore`**.
  They do not exist in a clean checkout and cannot be run by CI or by another
  session. What *is* committed: **`scripts/qa-infra-lod.mjs`** (puppeteer,
  asserts LOD budget and selection churn, exits non-zero on FAIL) and
  **`scripts/shot-sink.mjs`** (a screenshot sink on port 4399 that keeps image
  payloads out of an agent's context). Of the ~80 `qa-*.mjs` scripts in
  `scripts/`, only three are registered in `package.json`. So milestone 4's
  and milestone 6's checks must either be written as a new committed
  `scripts/qa-gas-flows.mjs` — budgeted in the milestone that needs it — or be
  stated as a manual check, not implied to be automated.
- **New files must be named for the boundary checker, and new tests must be
  registered for the formatter.** `scripts/check-import-directions.mjs` tests
  filenames against **closed sets**: a portable data reader must be
  `source.js`, `bundledSource.js` or `flowSource.js`; a renderer must be
  `index.js`, `rendering.js`, `snapshotRenderer.js`, `overlay.js`,
  `presentation.js`, `cards.js` or `controls.js`. Naming the bundle reader
  `pipelines.js` or `network.js` puts it in the wrong direction class and
  fails `npm run check:boundaries`. Separately, `scripts/format.mjs` **skips
  `*.test.mjs` during discovery**, so a new test file is invisible to
  `npm run format` until it is added to `scripts/format-scope.json` by hand —
  every existing commodities-layer test is unformatted today for exactly this
  reason.
- **Shared clone** — two sessions share this worktree. Claim row 4 in the §0
  ledger before the first edit, guard every commit with
  `git branch --show-current` in the same command, and **never a bare
  `git stash`**.

### 10.9 Milestones (smallest shippable first)

1. **EIA key and dated fixtures.** Blocking, and the reason it is first:
   nothing downstream may be written against a guessed route shape. Verify:
   a free key is registered and entered through POWER UP, `npm run doctor`
   audits it, and a dated fixture per route is committed capturing the
   `facets[]`, `frequency[]` and `data[]` arrays verbatim. The built client
   bundle contains no key.
2. **Crossing roster, gazetteer and border-pair pairing.** The NACEI half is
   **BUILT** (2026-09-18): `groupNaceiByCell` resolves the 99 filings to 60
   marks, 39 paired, with the (31.334, −109.819) Naco / El Paso pair as the
   fixture; the empty-string coercion returns `null` for all 29 blank
   `Vol_MMcfd` records and for `NumPipes: 0`; mojibake repair keeps both
   strings; pairing is proven order-independent and capped at two filings per
   mark. The EIA half is **blocked on milestone 1** — the 13-period rolling
   union and the `OFF-MAP` assertion need a key before they can be written
   against a real route shape.
3. **EIA provider and records.** Verify: unit tests for newest-period
   discovery, the compound key, the same-month band math and error
   sanitizing; the process allowlist rejects a `$/Mcf` row; the Canadian
   invariant passes at the measured 226,797 / 226,798 and a seeded drift
   flips the layer to `degraded`; manual calls return Sumas and Rio Grande at
   their measured 2026-06 values.
4. **Marks on the globe — no network yet.** The honest minimum, and shippable
   on its own. Verify: headless check at global and regional zoom with the
   far side clean; the pupil geometry matches goal 2 at both worked
   examples; silent pips render at fixed size in `unknown`; `getStats()`
   reports roster, filed, null and off-map counts; the governor test shows no
   hold.
5. **Network substrate and build script — BUILT 2026-09-18.** The data half
   is done and green: `npm run build:gas-pipelines` reproduces the committed
   bytes from a **full live refetch**, not merely from the archive;
   `source.json` sha256 and byte count recompute in a test; the bundle is
   **3.69 MB on disk, 0.93 MB gzipped** against a budget restated in R4.20.
   `npm run format`, `npm run check:boundaries`, `npm test` (4,252 pass) and
   `npm run build` are all green.

   **The Windows performance gate RAN, BREACHED, and the pre-committed
   fallback was applied — 2026-09-18, AMD Radeon 610M via ANGLE/D3D11.**
   `scripts/qa-gas-flows.mjs` is the committed check; it is the measurement
   deliverable of this milestone and it replaces the git-ignored probes.

   | Measured | Result | Gate |
   |---|---|---|
   | Activation at global | **745 ms** | < 900 ms — pass |
   | Network assembly, 32,885 parts | **168 ms** | — |
   | Heap, bundles parsed only | **+30 MiB** | < 250 MiB — pass |
   | Heap, ground primitive built | **+496 MiB** | **breach** |

   The split is the finding: **the data costs 31 MiB and the rendering costs
   496** — roughly 15 KiB per part, because `GroundPolylineGeometry` extrudes
   every polyline into its own volume. Against a combined static scene that
   already reaches 872 MiB, leaving that on by default would about double the
   heap for a layer carrying no measurement at all.

   So `GRID 2020` **ships off by default**, which is the branch this milestone
   pre-committed. The chip is `setNetworkEnabled()` on the layer module, the
   meta line reads `GRID JAN-2020 OFF · <NETWORK_DRAW_COST_MIB> MiB TO DRAW`
   (a dated constant in `model.js`, 514 MiB when re-measured on 2026-09-21,
   reported by `getStats()` with its date) so a dark grid says
   why it is dark rather than implying there are no pipelines, and the
   as-shipped layer costs 30 MiB. Reducing the drawn set was rejected as the
   first move because every non-geographic cap would be a ranking, and R4.16
   forbids ranking this dataset.

   **Follow-up, named rather than assumed:** the cost is per-polyline, not
   per-vertex, so the lever is fewer and longer polylines or a cheaper
   primitive — not coarser coordinates. Worth probing before the render layer
   grows: whether unclamped polylines are acceptable over this terrain, and
   what the 1,913-part cables layer actually costs per part for comparison.
6. **Cards and the seasonal comparison.** Verify: headless check clicks Sumas
   (bidirectional) and Rio Grande (export-only) and screenshots both; every
   line carries a period; `compare.js` exports only `compareSameMonth`; a
   test asserts the digit `0` never stands in for an absence and that a
   percentage never renders without its base; the layer's stamp is
   **string-identical** across the panel meta line, the hover card and the
   click card.
7. **Dossier and the signed chart.** Verify: the five sections render for a
   two-filing cell, a one-filing cell and a NACEI-only cell without holes;
   the chart places zero inside the domain and renders a gap — not a
   zero-height bar — for an unfiled month; `Escape` closes and focus returns;
   the drawer no longer overlaps the right rail, with the datacenters
   regression check green.
8. **Panel, legend, chips and the roster ledger.** Verify: the row label
   reads `Gas · Border Crossings (monthly)`; the meta line's lag advances
   when the clock does; the panel renders `PUBLISHED`, never `LIVE`; the
   ledger drawer lists the roster as a sortable monospace table with tabular
   figures.
9. **Plants.** Processing (478, 2017), underground storage (412, Dec 2020)
   and LNG **rebuilt from the quarterly liquefaction workbook** with the
   producing sites hand-geocoded — never from the struck terminal layers.
   Each vintage stamped per record where the source dates per record. Storage
   joins EIA's *regional* weekly series with the coarseness stated on the
   card, and the Alaska field rows are excluded from that join because the
   weekly report is Lower 48 only.
10. **Oil sibling.** Crude trunk lines (236, with a real `Pipename` field),
    after verifying whether EIA publishes crude by point of entry — **not
    yet checked**. If it does not, the oil layer is static-only and says so.
11. **Ledger and docs.** Ladder row 4 to BUILT; `DATA_SOURCES.md`;
    `src/data/dataCredits.js`; the row in `docs/COMMODITIES.md` — **with its
    owed corrections applied**: `SedimentaryBasins_US_EIA` is at
    `/FeatureServer/109` and returns 400 at `/0`; the ArcGIS page cap on
    these services is 2,000, not 1,000; the LNG, processing-plant and
    storage services need their real vintages and their real hosts
    annotated; and the LNG terminal layer is struck with its reason. Upgrade
    rows in `UPGRADE.md` for CER daily flow, FERC scheduled quantities and
    the paid aggregators. Merge order agreed with rows 1 and 8.

### 10.10 Risks and open questions

- **BLOCKING — the EIA API v2 is unverified end to end.** No probe returned a
  200 this session; DEMO_KEY is exhausted for this IP with a 3.4 h
  `Retry-After`, and a prior session already burned it. → Milestone 1 exists
  for this. Until it completes, every route path, facet name and field name
  in this PRD is `[UNVERIFIED]`, and the keyless `dnav` tables are the only
  probed source of the volumes quoted here.
- **The crosswalk is hand-maintained.** If EIA renames or adds a crossing it
  silently loses its pin. → The source warns on an unmatched `duoarea` by
  name, goal 1 makes it a test, and an unmatched point keeps its number in
  `OFF-MAP` rather than disappearing.
- **The Windows performance baseline does not exist.** `docs/PERFORMANCE.md`
  explicitly establishes only Apple M5 figures, and the combined static scene
  already reaches 872 MiB there. → Milestone 5 is gated on a measured
  baseline with a pre-committed fallback, decided before the code is written
  rather than after a slow demo.
- **Personal-account hosting.** Three of four gas services sit on accounts
  that can vanish. → R4.59's manifest fails the build when a count or vintage
  moves, and the bundle means a disappearance degrades the network layer, not
  the crossings.
- **The `SILENT` chip is a loaded gun.** Turning silent points off makes the
  border look cleaner and is exactly the misread this layer exists to
  prevent. → It defaults on, and the meta line always reports the null count
  whether or not they are drawn. Consider removing the chip entirely if it is
  ever found off in a screenshot.
- **Does EIA publish crude by point of entry?** **Not verified.** → Probe
  before committing milestone 10 to this architecture.
- **Mexico is invisible beyond the crossings.** CENAGAS returned 403 on every
  probe; the searchable ArcGIS layer is 10 features in Chihuahua. This is the
  destination for ~7.9 Bcf/d of US exports with no verified free source
  behind it. → Accepted for row 4, which measures the border, not the
  interior. Filed as a research spike.
- **Open:** should the roster ledger (milestone 8) become the layer's primary
  surface? For ~47 monthly figures a sortable table may be more useful than
  the globe, and the globe more useful as its index. Decide after a session
  of real use, not before.
- **Open:** the 69-feature discrepancy between the FeatureServer's 32,892 and
  the source shapefile's 32,961. Which were dropped, and does it matter for a
  layer that draws no individual feature?

### 10.11 Bootstrap from a fresh Claude Code session

Assumes this PRD is committed on `feat/commodities-shell`, row 1 is complete,
and row 4 is claimed in the §0 ledger.

```powershell
cd C:\Users\jgewi\gods-eye-view
git fetch --all --prune
git worktree add ..\commodities-gas-flows -b feat/gas-flows feat/commodities-shell
cd ..\commodities-gas-flows
npm ci            # a fresh worktree has no node_modules
npm run doctor    # confirms Node 24; row 4 needs a free EIA API key via POWER UP
npx vite --port 4175   # 4173 is another session's tree — never restart theirs
claude
```

---

## 11. Row 3 PRD — Weather forecast and overlays: the `weather-forecast` point layer first (FR-G3)

<!-- Canonical copy for the build session. Mirror: Project Brain gods-eye-view/05-prd.md; keep both in sync via /prd. -->

**Scope:** Row 3 of `docs/COMMODITIES-PLAN.md`, re-specced. The 2026-09-17
plan listed five observational overlays and one basin card layer. The
2026-09-21 grill (questions W1 to W9, §11.1) puts a **forecast point layer**
first, adds a **forecast line on the asset cards** the globe already draws, a
**challenger model** behind a row control, and a **gridded AIFS ENS field**
from a nightly reducer, and keeps the five overlays as a later milestone. The
globe consumes the best open AI weather models; it trains nothing and reads
nothing from the oracle's store.

**Written:** 2026-09-21 · **Status:** decided in the 2026-09-21 grill; build
not started; not claimed · **Mirror:** Project Brain `gods-eye-view/05-prd.md`,
synced the same day with the §0 ledger row. Decisions the grill did not reach
are marked `A-n` (assumption) and change by re-opening them, not by drifting.

**Provenance:** every figure below was live-probed on 2026-09-21 unless marked
otherwise. `[LIVE]` means an HTTP response was read that day.

**What already exists, and why this row is not a model build.** The Oil
Oracle (`optaimumsolutions/commodities`) has run the prediction pipeline this
row projects since 2026-09-11: a VPS cron pulls ECMWF AIFS ENS and NOAA GEFS
every night, samples them at 58 metros, six production basins and two market
regions (`corpus/wx_stations.yaml`, `wx_basins.yaml`, `wx_regions.yaml`),
stores ensemble mean, spread, p10 and p90 per lead day, derives freeze-off
degree days (FRZDD) and gas-weighted degree days (GWDD), and scores itself
against GHCN observations (`PRD-weather-model-ensemble.md`,
`PRD-weather-supply-basins.md`). Its 2026-09-15 grill pinned **AIFS ENS as the
single source of truth** and put NOAA data in a verification-only role. The
model is chosen and running. What the globe adds is the projection onto the
map and the join to the physical assets the oracle cannot see: crossings,
campuses, ports, chokepoints, pipelines.

---

### 11.1 The grill (2026-09-21), W1 to W9

| #  | Question                                     | Decision                                                                                                                                                                                                                                                                                                                                                                                      | Rejected                                                                                                                                                                                        |
| -- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 | Who owns the forecast numbers on the globe?  | The globe fetches its own AIFS ENS, browser-direct, pinned to the model the oracle pinned so the two pages never disagree on which model is truth. The globe shows raw fields and per-point readings; FRZDD sums, GWDD and skill stay on the oracle's pages (R7, §1 "no number duplicated").                                                                                                    | Rendering the oracle's `weather_forecast` rows through the unbuilt `globe_export.py` bridge (breaks R7; point aggregates only, no field). A split by quantity (two pipelines to keep in step). |
| W2 | Which layer first?                           | The point layer `weather-forecast`: basins, market regions and the Gulf from Open-Meteo's AIFS ENS. Zero new infrastructure; the chokepoints pattern.                                                                                                                                                                                                                                          | The gridded field first (new worker, provider and render path, latency unverified). The NWS NDFD raster first (official blend, not an ensemble, not AI).                                       |
| W3 | What is sampled, and who draws it?           | The layer draws only basin, region and Gulf markers from a bundled gazetteer that mirrors the oracle's yaml so both pages name the same places. The same portable source is exposed as a service; the campus, crossing and port cards each add one forecast line to their own card (R13 holds: each layer edits only its own card).                                                            | Basins only (the weather-to-asset bridge waits for another row). A weather ring at every asset (ninety-odd rings over markers other layers already draw; two layers own one place).            |
| W4 | What does a marker read?                     | Basins: daily-minimum temperature p10, p50, p90 and spread for 15 days, plus a count of days whose p10 sits below the basin's threshold, copied from the oracle's yaml and labelled `heuristic 25°F`. Regions: heating and cooling degree days computed per member then summarized (the oracle's convexity-safe order). Gulf: gust percentiles from AIFS and wave height from the marine endpoint, stamped separately. Precipitation and snow on the click card only. | Temperature only, no thresholds (the card cannot say "four freeze days"). The full variable set as fans on every marker (heaviest requests; the hover card no longer fits three lines).        |
| W5 | Which models?                                | AIFS ENS pinned for every marker, ring and stamp. One challenger, Google WeatherNext 2, behind a row control, off by default, drawn as a second thin ring with a `vs WN2` card line, fetched only when toggled. AIGEFS waits; the source takes a third id without new code.                                                                                                                      | AIFS only (the globe can never show where models disagree over a basin). All three always (triple budget, crowded rings at nine markers).                                                       |
| W6 | Time?                                        | Every 30 minutes read the model's metadata file; re-fetch data only when `last_run_availability_time` changes. A lead-day stepper (1 to 15) in the panel row; the ring summarizes the window, the label and disc show the selected day; the card stamps `issued 06Z 09-21 · valid 09-24`. Default day 1.                                                                                       | A fixed six-hour poll with no stepper. Animated playback (launches-replay style; competes with the Director's timing).                                                                          |
| W7 | Visual?                                      | Colour is the selected day's p50 minimum against a bundled ERA5 day-of-year normal, in the shared six colour slots relabelled for weather in the legend. Ring radius is ensemble spread. Disc fill is the freeze-day share of the window (basins), the heating-day share (regions) or the gale-day share (Gulf). Normals are built once by a script and bundled with a vintage, like the gazetteer. | Freeze-count colour with no climatology (regions and the Gulf fall to grey). An absolute temperature ramp (abandons the shared vocabulary; 30°F reads the same in Williston and Midland).       |
| W8 | Ledger?                                      | Row 3 re-specced as "Weather forecast and overlays": six milestones (§11.10), one PRD section, one ledger row.                                                                                                                                                                                                                                                                                 | A new row 10 (two rows would share the scrubber, the gazetteer and the panel group). Milestone 1 only, re-grill the rest later.                                                                |
| W9 | Write-up?                                    | This section, the §0 ledger row, the `COMMODITIES.md` roadmap and endpoint rows, the brain mirror and a decision record. No commit.                                                                                                                                                                                                                                                             | Chat summary only. Brain only.                                                                                                                                                                  |

### 11.2 Live probe log (2026-09-21)

| Probe                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open-Meteo ensemble ids   | `ecmwf_aifs025_ensemble` (50 perturbed members plus the unsuffixed control, 15 days), `ncep_aigefs025` (30 plus control, 16 days), `google_weathernext2_ensemble` (63 plus control, 16 days), `ncep_gefs025`. Mean-and-spread variants `ecmwf_aifs025_ensemble_mean` and `google_weathernext2_ensemble_mean`, archived since March 2026. `[LIVE]`                                                                                                                                                                                                             |
| Daily variables, AIFS ENS | `temperature_2m_min`, `temperature_2m_max`, `precipitation_sum`, `snowfall_sum`, `wind_speed_10m_max`, `wind_gusts_10m_max`; hourly `temperature_2m`, `precipitation`, `wind_speed_10m`. AIGEFS and WeatherNext 2 answer `temperature_2m_min`, `precipitation_sum`, `wind_speed_10m_max`. `[LIVE]`                                                                                                                                                                                                                                                             |
| Issue time                | `https://ensemble-api.open-meteo.com/data/<model>/static/meta.json`, keyless, CORS `*`: `last_run_initialisation_time`, `last_run_availability_time`, `update_interval_seconds` (21,600 for AIFS and AIGEFS, 43,200 for WeatherNext 2). Today: AIFS 06Z available 15:20Z (9 h 20 m after issue), AIGEFS 06Z at 15:07Z, WeatherNext 2 00Z at 10:54Z. `[LIVE]`                                                                                                                                                                                                  |
| CORS                      | `ensemble-api`, `archive-api`, `marine-api` and the metadata files all answer `access-control-allow-origin: *`; `api.open-meteo.com` is already read browser-direct by the data center cards. `[LIVE]`                                                                                                                                                                                                                                                                                                                                                       |
| Request cap               | 300 points in one GET: HTTP 200, 2.3 MB, 1.4 s; the next request answered `Minutely API request limit exceeded`. 1,500 points: HTTP 414 from nginx. Free tier: 600 calls a minute, 5,000 an hour, 10,000 a day, weighted per location, per ten variables and per two weeks. **A field cannot come from this API; ninety points four times a day can.** `[LIVE]`                                                                                                                                                                                                 |
| ERA5 normals              | `archive-api.open-meteo.com/v1/archive`: ten years of daily minimums at one point in one call, 3,653 days, 66 KB, CORS `*`; a small follow-up call was still allowed. `[LIVE]`                                                                                                                                                                                                                                                                                                                                                                                 |
| Marine                    | `marine-api.open-meteo.com/v1/marine` daily `wave_height_max`, `wind_wave_height_max`, `swell_wave_height_max`, 7 days, deterministic (no ensemble). `[LIVE]`                                                                                                                                                                                                                                                                                                                                                                                                 |
| ECMWF open data, direct   | `data.ecmwf.int/forecasts/<ymd>/00z/aifs-ens/0p25/enfo/` index present today; one 2 m temperature message is 618,968 bytes per member per step, 1,038,240 points, **CCSDS packing (data representation template 42)**, which no JavaScript decoder reads. The oracle's `ingest/wx/aifs.py` reads it with eccodes on the VPS. `[LIVE]`                                                                                                                                                                                                                       |
| dynamical.org AIFS ENS    | Icechunk v2 store `https://dynamical-ecmwf-aifs-ens.s3.us-west-2.amazonaws.com/ecmwf-aifs-ens-forecast/v0.1.0.icechunk`, anonymous, CORS `*`, CC BY 4.0 plus ECMWF terms; dimensions init_time × lead_time (61 six-hourly steps) × ensemble_member (51) × latitude × longitude at 0.25°; chunk shape (1, 61, 51, 32, 32) = 12.2 MiB uncompressed, shard 1.3 GiB; variables `temperature_2m`, `wind_u_10m`, `wind_v_10m`, `precipitation_surface` among 16. Readers on npm: `icechunk-js` 0.6.0 with `zarrita` 0.7.5 (pure JS), `@earthmover/icechunk` 2.2.2 (native, win32 and linux). Publication latency not stated. `[LIVE]` |
| NOAA AIGEFS, direct       | NOMADS `com/aigefs/prod/aigefs.20260921/{00,06,12}/mem000…` plus `ensstat/`; NOMADS only, no AWS open-data bucket (`noaa-aigefs-pds` and `noaa-aigfs-pds` do not exist). Operational since January 2026 alongside AIGFS and HGEFS. `[LIVE]`                                                                                                                                                                                                                                                                                                                  |
| NWS NDFD raster           | `mapservices.weather.noaa.gov/raster/rest/services/NDFD/NDFD_temp/MapServer`, CORS echoes the origin, updates every 30 minutes: temperature, apparent temperature and humidity at 3-hour steps to 24 h, max temperature days 1 to 3, min temperature days 1 to 2; sibling raster folders `precip`, `snow`, `hazards`, `outlooks`, `obs`, `air_quality`, `climate`. Cesium's `ArcGisMapServerImageryProvider` is already used for the Esri basemap. `[LIVE]`                                                                                                     |
| Registry                  | Layer tokens are `/^[a-z0-9]$/` (`layerState.js`); every letter but `v` is taken and `v` is reserved for `energy-plants` (§10.1). The count pins stand at 25 (`constructCatalog.test.mjs:42`, `layerState.test.mjs:161`). `[LIVE]`                                                                                                                                                                                                                                                                                                                         |
| Licences                  | Open-Meteo API output CC BY 4.0 on the non-commercial tier (R1 applies); ECMWF AIFS CC BY 4.0 with ECMWF credit; WeatherNext 2 real-time output under Google's experimental terms, historical output CC BY 4.0, relicensed CC BY 4.0 by Open-Meteo; ERA5 under the Copernicus licence ("Contains modified Copernicus Climate Change Service information"); NOAA public domain. `[documented]`                                                                                                                                                                 |

---

### 11.3 Summary

Nine markers appear on the globe: six production basins (Appalachia, Permian,
Haynesville, Anadarko, Eagle Ford, Bakken), two market demand regions (South
Central, Texas) and the Gulf (offshore production and the LNG coast). Each is
a pinned marker whose **colour is the forecast minimum against its own
climatology**, whose **ring is the ensemble's disagreement**, and whose
**disc is the share of the next fifteen days that cross a labelled
threshold**. A stepper in the panel row walks the forecast one day at a time;
the hover card names the day, the issue time and the three percentiles; the
click card draws the fan. Every reading comes from ECMWF's AIFS ENS through
Open-Meteo, browser-direct and keyless, stamped `issued 06Z 09-21 · valid
09-24` under the row-1 contract, class `daily`.

The same source is a service. Milestone 2 gives each campus, gas crossing and
dossier port one forecast line on the card it already has. Milestone 3 adds
Google WeatherNext 2 as a challenger ring. Milestone 4 turns the point layer
into a field: a nightly Node reducer over the dynamical.org copy of AIFS ENS
writes a CONUS bundle of ensemble mean, spread and freeze probability per lead
day, drawn as an imagery overlay under the same stepper. Milestone 5 is the
observational truth beside the forecast (NHC cones, NWS alerts, satellite,
radar). Milestone 6 grows the gazetteer past the United States.

### 11.4 Problem

- The globe shows what is moving and what carries it, and nothing of the
  weather that will constrain it. The cockpit reads current conditions and
  the data center cards read a current temperature; no forecast and no
  ensemble exists anywhere on the map.
- Freeze-offs are a first-order winter supply driver (Uri 2021: ~20 Bcf/d
  off) and ride the daily **minimum**, which a mean-temperature reading
  cannot see. Summer power burn rides cooling degree days in Texas. Gulf
  gales and waves stop tanker loading and shut in platforms. None of these is
  visible on the globe today.
- The oracle already forecasts these quantities with the strongest open
  models and has decided which model is truth. Building a second model on
  the globe would duplicate that work with a weaker result; rendering the
  oracle's rows would break R7. The row's shape follows: same model, own
  fetch, raw readings only, joined to the physical assets.
- Why now: rows 4 and 8 landed as commits on 2026-09-21, row 2 is blocked
  on the AIS key, row 5 waits on row 4's live join, and the observation
  contract already stamps forecasts (`validAt`, class `daily`) because row 8's
  grid day-ahead line uses it.

### 11.5 Target user

- Jack, reading the globe beside the oracle console during a cold snap: is
  the Permian going to freeze this week, how sure are the models, and which
  crossings, campuses and ports sit under the cold.
- A gas or power analyst reading one basin: the fan, the spread, the count of
  days below the winterization heuristic, and where the number came from.
- The next build session, which inherits a gazetteer, a normals bundle, a
  portable source and a service contract so that milestone 2 is card edits
  and milestone 4 is a reducer, not a redesign.

### 11.6 Goals (verifiable)

1. **Nine markers, one model.** `getStats().count` is 9 with the layer on;
   every reading's `source` names `ECMWF AIFS ENS via Open-Meteo`; the
   test asserts that no reading is built from any other model id unless the
   challenger control is on.
2. **Stamped under the contract.** Every marker's observation is created by
   `createObservation` with `observedAt` = the run's initialisation time,
   `validAt` = the selected day, `publishedAt` = the run's availability time,
   class `daily`; `formatAsOf` renders `issued 06Z 09-21 · valid 09-24`.
   When the newest run is older than 24 hours the panel meta line says so
   and the class falls to `published` by the contract's own rule.
3. **Descriptive (R11).** Cards show percentiles, spreads, counts, anomalies
   and timestamps; thresholds are printed with the word `heuristic` and their
   value; nothing is phrased as an action. Asserted by a string test over
   every card template.
4. **Cheap.** One refresh is at most four requests (one ensemble call for
   all points, one marine call, one metadata call per active model) and the
   layer re-fetches data only when the run changes; the unit test counts
   fetches across a simulated day at under 60.
5. **Baseline bundled.** `normals.json` carries a day-of-year minimum for
   every gazetteer point with a vintage and the Copernicus line; the build
   script reproduces it byte for byte from the same window.
6. **Gated.** Format, boundaries, `npm test` and build green; the count pins
   move from 25 to 26; the headless check enables the layer, steps to day 7,
   hovers the Permian, clicks it, screenshots the fan and reports no page
   errors.

### 11.7 Non-goals

- Training, fine-tuning or running a weather model. The models are AIFS ENS,
  WeatherNext 2 and, later, AIGEFS, consumed as published.
- Any oracle row, FRZDD sum, GWDD headline, skill score or covariate on the
  globe (R7). The globe's counts are its own arithmetic on its own fetch.
- GRIB decoding anywhere in this repo, and Python anywhere in the read path.
  The field (milestone 4) reads Zarr with JavaScript.
- WeatherNext 2 through BigQuery or Earth Engine (a Google Cloud account;
  R12). Open-Meteo carries it keyless.
- HRRR and other short-range mesoscale models; recorded in `UPGRADE.md` as
  the sub-day CONUS upgrade.
- Animated playback, the Director's timing, voice enums (hash-pinned; their
  own change).
- Hurricane shut-in risk from 2 m temperature. The Gulf marker reads gusts
  and waves; cones are milestone 5.

### 11.8 Requirements

#### 11.8.1 Gazetteer, bundled (W3)

1. `scripts/build-weather-gazetteer.mjs` reads `corpus/wx_basins.yaml`,
   `corpus/wx_regions.yaml` and `corpus/wx_stations.yaml` from
   `optaimumsolutions/commodities` at a pinned commit through `gh api`
   (build time only; nothing in the read path touches GitHub) and writes
   `src/data/local_data/weather/gazetteer.json`, `source.json` (repo, commit,
   retrieval date, sha256) and a `README.md` in the datacenters-bundle style.
2. Each entry: `id` (`appalachia`, `permian`, `haynesville`, `anadarko`,
   `eagleford`, `bakken`, `southcentral`, `texas`, `gulf-offshore`,
   `gulf-lng`), `kind` (`basin`, `region`, `gulf`), `name`, `lat`, `lon` (the
   weight-normalized centroid of the entry's sample points), `points[]`
   (`name`, `lat`, `lon`, `w`), `freezeF` (basins only, the oracle's value),
   `share` (basins only), `commodities` (`natgas`, `oil`), `country` (`US`
   for all ten; milestone 6 adds others).
3. **A-1.** The two Gulf entries are not in the oracle's yaml and are defined
   here: `gulf-offshore` at 28.20, −89.80 (Mississippi Canyon production
   area) and `gulf-lng` at 29.73, −93.87 (Sabine Pass); founder-editable,
   recorded in `source.json` as hand-placed.
4. Region entries resolve metro names against `wx_stations.yaml` plus the
   `extra_metros` block, weights normalized within the region, exactly the
   oracle's convention, so the two pages sample the same places.
5. The bundle is frozen at import (`gazetteer.js`, the chokepoints pattern)
   and the unit test pins ten entries, the contiguous-US bounding box and
   the presence of `freezeF` on every basin.

#### 11.8.2 Normals, bundled (W7)

1. `scripts/build-weather-normals.mjs` fetches ten calendar years
   (2016-01-01 to 2025-12-31) of daily `temperature_2m_min` and
   `temperature_2m_max` per sample point from
   `archive-api.open-meteo.com/v1/archive` (ERA5, one call per point, ~27
   calls), aggregates to the entry's weighted centroid the same way the
   forecast is aggregated, and writes `normals.json`: per entry, 366
   day-of-year values smoothed with a ±7-day window, plus `window`,
   `vintage`, `source` and the Copernicus attribution line.
2. **A-2.** Ten years trailing, recomputed by re-running the script, never at
   runtime; the oracle uses the same window for its anomaly series.
3. The unit test pins the entry count, the 366 slots and the absence of
   `null` after smoothing.

#### 11.8.3 Source (W1, W5, W6)

1. `src/layers/weather/source.js` exports
   `createOpenMeteoEnsembleSource({ fetchImpl, now, ttlMs, models })`,
   portable, no Cesium, no DOM, modelled on `createDatacenterLiveSource`.
   It owns three URL builders and their normalizers in `live.js`:
   - **Metadata.** `GET https://ensemble-api.open-meteo.com/data/<model>/static/meta.json`
     → `{ initialisedAt, availableAt, updateIntervalS }`.
   - **Ensemble.** One `GET https://ensemble-api.open-meteo.com/v1/ensemble`
     for every sample point of every entry (27 today, up to ~90 with the
     milestone-2 assets), `models=<id>`,
     `daily=temperature_2m_min,temperature_2m_max,precipitation_sum,snowfall_sum,wind_gusts_10m_max`,
     `forecast_days=15`, `temperature_unit=fahrenheit`,
     `wind_speed_unit=mph`, `timezone=UTC`. The response is one block per
     point in request order; `_memberNN` columns plus the unsuffixed control
     are the members.
   - **Marine.** One `GET https://marine-api.open-meteo.com/v1/marine` for
     the Gulf points, `daily=wave_height_max,wind_wave_height_max`,
     `forecast_days=7`.
2. **Refresh rule (W6).** On enable and every 30 minutes the source reads
   the metadata file for each active model. It fetches the ensemble and
   marine payloads only when `availableAt` differs from the cached run's, or
   when there is no cache. A failed fetch keeps the previous run and records
   the error per feed; the layer never blanks a marker it was already showing
   (the datacenters rule).
3. **Budget.** At most four requests per refresh; the unit test walks a
   simulated day with runs landing at four availability times and asserts
   fewer than 60 requests. GET only; the 414 limit is ~1,000 points and this
   row never exceeds 100.
4. **Stamp.** Every reading is a `createObservation` with `observedAt` =
   `initialisedAt`, `publishedAt` = `availableAt`, `validAt` = the selected
   day at 00Z, `fetchedAt` = the fetch, `freshnessClass: 'daily'`, `source`
   = `ECMWF AIFS ENS via Open-Meteo` (or the challenger's name).
5. **Models.** `models` defaults to `['ecmwf_aifs025_ensemble']`; the
   challenger control adds `'google_weathernext2_ensemble'`; a third id
   (`'ncep_aigefs025'`) is a config change. Readings are keyed by model and
   never mixed.

#### 11.8.4 Records (W4, W7)

`src/layers/weather/records.js`, portable, unit-tested with a fixture
response:

1. **Members.** For each point and day, the member set is the unsuffixed
   column plus every `_memberNN` column; the count is asserted (51 for AIFS,
   64 for WeatherNext 2) and a short member set is recorded, not padded.
2. **Aggregation to the entry.** Per member per day, the entry value is the
   weight-normalized mean over its sample points (the oracle's
   point-then-weight order); percentiles and spread are then taken across
   members: `p10`, `p50`, `p90`, `spread` (p90 − p10), `n`.
3. **Freeze count (basins).** Per member per day, `frozen` = TMIN < `freezeF`;
   the day's `freezeShare` is the member share frozen; the window's
   `freezeDays` is the count of days whose **p10 is below `freezeF`**, and
   `freezeDaysP50` the count by p50 (both on the card). The threshold is
   printed as `heuristic 25°F` wherever the count appears.
4. **Degree days (regions).** Per member per day, HDD = max(0, 65 − mean) and
   CDD = max(0, mean − 65) with mean = (TMAX + TMIN) / 2 in °F, then
   percentiles across members; `hdd7`, `hdd14`, `cdd7`, `cdd14` are p50 sums;
   `heatingDays` is the count of days with p50 HDD > 0. Never HDD of the mean
   temperature (the oracle measured a 15× understatement).
5. **Gulf.** `gustP50`, `gustP90` from `wind_gusts_10m_max`; `galeDays` is
   the count of days with p90 gust ≥ 39 mph (Beaufort 8, printed as
   `gale ≥ 39 mph`); `waveMax` from the marine payload, its own observation
   with the marine model's stamp.
6. **Anomaly.** `anomalyF` = p50 TMIN − the normal for that day of year.
   **A-3** bands, in °F: `much-colder` ≤ −15, `colder` ≤ −7, `near-normal`
   otherwise, `warmer` ≥ +7, `much-warmer` ≥ +15, `unknown` when the normal
   is missing. Exported as `WEATHER_ANOMALY_BANDS` next to
   `CHOKEPOINT_DEVIATION_BANDS` in spirit.
7. **Precipitation and snow.** `precipP50`, `snowP50` per day for the click
   card only.
8. **Analyst record.** `mapAnalystRecord(entry, selectedDay)` returns the
   flat row the context service and the voice engine receive (name, kind,
   model, issued, valid, p10, p50, p90, spread, anomaly, band, freezeDays,
   threshold, hdd14, cdd14, gustP90, waveMax, source).

#### 11.8.5 Marker and visual system (W7)

1. **Pinned geometry.** Ten markers created once at init at a fixed height
   (`HeightReference.NONE`, depth test off; §2.2) from the gazetteer; a
   refresh restyles, never recreates. A ground ring as a clamped polyline
   and an inner disc, the chokepoints pattern.
2. **Colour** is the selected day's anomaly band in the shared six slots,
   ordered by stress on supply and demand: `much-colder` red (the collapse
   slot), `colder` amber, `near-normal` blue, `warmer` green, `much-warmer`
   lime, `unknown` grey. The legend chip gains a second row with the weather
   labels. **A-4:** the slot order is cold-to-warm because a cold surprise is
   the supply shock and a warm one the demand shock; re-open if a reader
   finds red-for-cold wrong.
3. **Ring radius** = 30 km + 8 km per °F of the selected day's spread,
   clamped to 200 km, so a confident forecast is a tight ring and a
   disagreeing ensemble a wide one.
4. **Disc fill** = `freezeDays / 15` (basins), `heatingDays / 15` (regions),
   `galeDays / 7` (Gulf), drawn as the ring's inner filled share.
5. **Ambient label** at every zoom: `PERMIAN · d+3 · p10 18°F · 4 frz`;
   regions `TEXAS · d+3 · HDD14 62`; Gulf `GULF LNG · d+3 · gust p90 41`.
   Labels join the overlay host with the chokepoints' cohort limits.
6. **Challenger ring (milestone 3).** A second, thinner ring in a neutral
   stroke whose radius is the challenger's spread; no colour of its own.

#### 11.8.6 Time (W6)

1. **Lead-day stepper.** The panel row gains `‹ d+1 ›` controls (a range
   input, 1 to 15, the replay-speed slider's styling) that set the layer's
   `selectedDay`; the layer republishes labels, colours and discs without a
   fetch. Day 1 is the first valid day at or after the run's initialisation
   date. Default 1.
2. **Card stamp** = the selected day's observation:
   `issued 06Z 09-21 · valid 09-24`.
3. **Meta line** in the panel: `issued 06Z 09-21 · 9h ago · valid 15d`, or
   `issued 06Z 09-20 · 33h ago · stale` when no newer run has arrived; the
   class then reads `published` by `freshnessClassFor`.
4. **Refresh cadence** per §11.8.3; the stepper never triggers a fetch.

#### 11.8.7 Cards (R5)

1. **Hover** (three lines, the row-1 hover service; until it lands, the
   layer's own throttled pick, the datacenters pattern):
   `PERMIAN` / `issued 06Z 09-21 · valid 09-24` /
   `p10 18°F · p50 24°F · 4 freeze days (heuristic 25°F)`. Regions:
   `HDD14 62 · CDD14 0 · p50 mean 41°F`. Gulf:
   `gust p90 41 mph · wave 2.1 m · 2 gale days`.
2. **Click** (the full card on the overlay canvas, the chokepoints pattern):
   title with the headline number; a fan chart of fifteen days (SVG, the
   datacenters dossier's `renderChart` style): p10 to p90 band, p50 line,
   the threshold as a dashed horizontal, the normal as a dotted line, the
   challenger's p50 dashed when on; a table by day (p10, p50, p90, spread,
   freeze share, precip, snow); provenance: `ECMWF AIFS ENS v2 via Open-Meteo
   · issued 06Z 09-21 · fetched 15:31Z · vs ERA5 normal 2016–2025`. Hover
   on a cone or alert is milestone 5.
3. **Context.** Each marker registers a context record whose `properties`
   is the analyst record; `getAnalystRecords()` exposes the rows.

#### 11.8.8 Forecast service and the asset join (W3; milestone 2)

1. `src/services/weatherForecast.js` wraps the source as a service other
   commodity layers receive through the construct catalog:
   `getForecastAt(points, { model, signal })` returns, per point, the same
   frozen per-day record the layer uses, sampled at that point (no
   aggregation), and `subscribe(fn)` fires on a new run. Points are batched
   into the layer's own ensemble request; they never cause a second one.
2. **Which assets, which line** (each layer edits its own card, R13):
   - `energy-datacenters` (15 campuses): `forecast · TMAX p90 104°F Thu ·
     6 cooling days` — heat is what a campus rejects.
   - `commodity-gas-flows` (the ~40 US crossings): `forecast · TMIN p10 18°F
     Sat · 4 freeze days (heuristic 25°F, Permian)`, using the threshold of
     the nearest basin or 25°F when none is within 500 km, printed.
   - `commodity-ports` dossier ports in the US (Houston, Corpus Christi,
     Sabine Pass, Port Arthur): `forecast · gust p90 41 mph Tue · wave 2.1 m`.
   - Chokepoints and non-US ports: milestone 6.
3. Every joined line is its own observation with the layer's source string
   and stamps; a missing forecast leaves the line absent, never blank.
4. Budget: the join adds about 60 points to the one ensemble request; the
   §11.8.3 test covers it.

#### 11.8.9 Challenger model (W5; milestone 3)

1. A row control `WN2` (off by default) adds `google_weathernext2_ensemble`
   to `models`; a second metadata poll and a second ensemble request follow
   only while it is on.
2. The card gains `vs WN2 · p50 27°F (+3) · spread 9°F`; the second ring per
   §11.8.5.6. Numbers are never averaged across models.
3. Licence line on the card and in `DATA_SOURCES.md`: WeatherNext 2 via
   Open-Meteo, CC BY 4.0, real-time output under Google's experimental
   terms.

#### 11.8.10 The field (milestone 4)

1. `scripts/reduce-weather-field.mjs` (Node, `icechunk-js` + `zarrita`)
   opens the dynamical.org store, finds the newest `init_time`, reads the
   CONUS window (24°N to 50°N, 126°W to 66°W; about 32 chunks per variable,
   390 MiB uncompressed per variable per init) for `temperature_2m`,
   `wind_u_10m`, `wind_v_10m`, `precipitation_surface`, reduces each UTC
   day to per-member daily min and max, then to `p10`, `p50`, `p90`,
   `spread`, and `freezeShare` (members with TMIN below 32°F, the physical
   threshold, printed as such), and writes
   `.gev-cache/weather-field/<init>.json` (Float16-packed grids, ~3 MB) plus
   `latest.json`. Run by hand or by a cron on the desk; the VPS is not in
   the read path.
2. `server/providers/weatherField.js` serves `/api/weather-field/latest`
   and `/api/weather-field/<init>/<day>/<stat>` from the cache with the
   init's stamps in headers; no upstream fetch at request time.
3. `src/layers/weather/field.js` draws the selected stat as a
   `SingleTileImageryProvider` from a canvas (the Nepal precedent), under
   the same stepper, with a row control for the stat (`p50 TMIN`, `spread`,
   `freeze share`, `gust`), alpha 0.6, a colour bar in the legend chip and
   the field's own stamp in the meta line.
4. Latency after ECMWF publishes is measured at build time and recorded
   here before the milestone closes; if it exceeds twelve hours the
   reducer falls back to the previous init and says so.
5. **A-5.** The NDFD official raster is not part of this milestone; it is
   recorded in §11.8.11 as an optional truth overlay because it is
   browser-direct and needs no reducer.

#### 11.8.11 Truth overlays (milestone 5)

As specced on 2026-09-17, unchanged in substance: `weather-storms` (NHC
cones, tracks, wind radii; class `daily`), `weather-alerts` (NWS active
polygons, User-Agent required; `live`), `weather-satellite` (GIBS GOES
GeoColor, IMERG rate; `live`), `weather-radar` (RainViewer, 13 frames;
`live`), each an imagery or polygon module owning its own layer above the
basemap and sharing the stepper's frame semantics. Optional, same
milestone: `weather-official` drawing the NWS NDFD temperature grids as an
`ArcGisMapServerImageryProvider`, browser-direct, labelled `NWS official
forecast`, so the AIFS field can be read beside the official blend.

#### 11.8.12 Panel, registry, wiring, attribution

1. **Id and token.** `weather-forecast`, token `3` (the first digit; `v` is
   reserved for `energy-plants`). Registry entry alphabetical after
   `transit`.
2. **Panel.** In the Commodities group as `Weather · Basin Forecast` with
   the §11.8.6 meta line; in `Commodities · Daily` once row 1 milestone 2
   lands the class groups (R9). Row controls: the stepper, `WN2`
   (milestone 3), the field stat (milestone 4).
3. **Wiring** in §2.2 order: `src/layers/weather/` (`gazetteer.js`,
   `normals.js`, `live.js`, `source.js`, `records.js`, `model.js`,
   `index.js`), `src/app/layers/weatherForecast.js`,
   `src/sources/reference.js` (`weatherForecast`), `src/app/constructCatalog.js`,
   `src/data/layerState.js`, `src/ui/layerPanel.js`,
   `scripts/package-boundaries.json` (three sections), `DATA_SOURCES.md`,
   `src/data/dataCredits.js`, `docs/COMMODITIES.md`; the three count-pinning
   tests move from 25 to 26; every new `*.test.mjs` is listed in
   `scripts/format-scope.json` or `npm run format` will not see it.
4. **Attribution.** New `DATA_SOURCES.md` rows: ECMWF AIFS ENS via
   Open-Meteo (CC BY 4.0, credit ECMWF and Open-Meteo), ERA5 normals
   (Copernicus line, bundled), the oracle's yaml (private repo, bundled
   gazetteer, MIT-licensed globe code); milestone 3 adds WeatherNext 2,
   milestone 4 adds dynamical.org, milestone 5 adds NHC, NWS, GIBS,
   RainViewer. Credits registered in `dataCredits.js` before each ships.
5. **Render check.** `.gev-logs/render-weather.mjs`: dismiss first run, pin
   the camera over the south-central US at 3,000 km, enable the layer, wait
   for `getStats().count === 10`, step to day 7, hover Permian, click,
   screenshot, assert the stamp string and no page errors.

### 11.9 Constraints and invariants

- **R1, R12.** Open-Meteo's free tier is non-commercial; this is a local,
  one-user tool. The paid Open-Meteo tier and the Meteomatics AIFS-ENS
  endpoint are the recorded swaps in `UPGRADE.md`.
- **R2, R3.** Class `daily`; four timestamps on every reading; the meta line
  and every card show the issue time, never only the fetch time.
- **R7.** No oracle number. The globe's freeze counts are its own; the card
  names its own source and the oracle's pages name theirs.
- **R11.** Thresholds print as heuristics with their value; bands are
  anomalies, not risk grades; no card says what to do.
- **R13.** New layer family, new service, one line per asset card in our own
  layers; upstream untouched.
- **§2.2.** Portable `source.js`, `live.js`, `records.js`, `normals.js`,
  `gazetteer.js` never import Cesium; pinned markers; count pins moved; four
  gates before every commit; `format-scope.json` updated.
- **Same model, different pipeline.** Open-Meteo interpolates from its own
  AIFS grid copy and the oracle samples ECMWF's GRIB nearest-grid; the two
  pages may differ by a degree at the same point. Both name their pipeline;
  neither claims the other's number.
- **Shared clone.** Claim row 3 before the first edit; guard every commit
  with `git branch --show-current`; never a bare `git stash`.

### 11.10 Milestones (smallest shippable first)

1. **The point layer**, two commits. (a) `build-weather-gazetteer.mjs`,
   `build-weather-normals.mjs`, the two bundles, READMEs, unit tests; verify:
   ten entries, 366 normals per entry, a second run reproduces the JSON.
   (b) Source, records, model, index, panel row with the stepper, wiring,
   attribution, render check; verify: goals 1 to 4 and 6, `getStats()`
   reports the run's stamps, the card's fan matches a fixture. Ledger row 3
   to BUILT (M1) with both SHAs.
2. **Forecast lines on the asset cards.** The service; one line each on the
   campus, crossing and US port cards. Verify: a fixture run shows the line
   on Colossus 2, Sumas WA and Sabine Pass with their own stamps; the
   request count is unchanged.
3. **Challenger.** `WN2` control, second ring, `vs WN2` line, licence rows.
   Verify: toggled off, zero WN2 requests; on, one metadata and one ensemble
   request per run.
4. **The field.** Reducer, provider, `field.js`, stat control, colour bar,
   latency measured and recorded. Verify: `latest.json` for today's newest
   init; the overlay steps with the stepper; screenshot at day 1 and day 7.
5. **Truth overlays.** Cones, alerts, satellite, radar, the optional NDFD
   official raster; each overlay its own commit; the ledger row records
   which shipped.
6. **The gazetteer past the US.** `country` beyond `US` with Montney (AECO),
   the North Sea, Qatar, and the chokepoints and non-US dossier ports joined
   through the service. Verify: the bounding-box test becomes a per-entry
   country assertion; the render check adds one non-US marker.

### 11.11 Risks and open questions

- **Open-Meteo's copy differs from ECMWF's.** Interpolation and elevation
  correction move a point reading by up to a degree or two against the
  oracle's nearest-grid sample. → Both pages name their pipeline; the
  render check does not compare them; if the founder wants identity, the
  read path swaps to the field bundle (milestone 4), which is ECMWF's grid.
- **Latency.** The 06Z AIFS run reached Open-Meteo at 15:20Z today. → The
  metadata poll makes the wait visible; the meta line always says how old
  the run is.
- **Rate limits are shared with the data center cards and the cockpit.** →
  One ensemble request per run, metadata polls at 30 minutes, the budget
  test; if 429s appear the poll backs off to 60 minutes and the panel says
  `rate limited`.
- **WeatherNext 2 terms.** Real-time output is under Google's experimental
  terms; Open-Meteo relicenses its API output CC BY 4.0. → Recorded in
  `DATA_SOURCES.md` with both links; the control is off by default; drop
  the challenger if the terms change.
- **Thresholds are heuristics.** 25°F Permian and −10°F Bakken are the
  oracle's winterization guesses, unvalidated against production data. →
  Printed as heuristics; edited in the yaml and re-bundled, never in code.
- **UTC-day minimum runs warm.** A daily minimum over 6-hourly UTC steps
  undersamples the pre-dawn trough (the oracle measured it). → Open-Meteo's
  daily aggregate uses hourly steps, which is better, but the card still
  says `UTC day`.
- **The reducer's chunk cost.** 32 chunks per variable per init, roughly
  100 to 150 MB compressed, four variables. → Once per init on the desk,
  cached; if too slow, reduce `temperature_2m` alone first.
- **Red for cold** (A-4) may read wrong. → The legend labels the slots; one
  edit swaps the order.
- **Open:** should the stepper also drive the data center cards' forecast
  line (day-of-week) or should those lines always show the worst day of the
  window? Default: the worst day, named.

### 11.12 Bootstrap from a fresh Claude Code session

Assumes this PRD is committed on `feat/commodities-shell` and row 3 is
claimed in the §0 ledger.

```powershell
cd C:\Users\jgewi\gods-eye-view
git fetch --all --prune
git worktree add ..\commodities-weather -b feat/weather-forecast feat/commodities-shell
cd ..\commodities-weather
npm ci            # a fresh worktree has no node_modules
npm run doctor    # confirms Node 24; row 3 needs no key at all
npx vite --port 4176   # 4173 is another session's tree — never restart theirs
claude
```

**Paste this as the first message to Claude:**

```text
Work in C:\Users\jgewi\commodities-weather, a git worktree on branch
feat/weather-forecast (cut from feat/commodities-shell). This is row 3 of
docs/COMMODITIES-PLAN.md. Read, in this order, before touching anything:
docs/COMMODITIES-PLAN.md §0 (ledger), §2 (rules R1-R13 and the engineering
rules), §11 (the row 3 PRD, including the probe log); docs/COMMODITIES.md;
src/layers/commodities/observation.js (the stamp every reading uses);
src/layers/chokepoints/ (pinned markers, ring, disc, gazetteer);
src/layers/datacenters/live.js and liveSource.js (browser-direct Open-Meteo
with per-feed errors and the observation stamp); src/layers/datacenters/
dossier.js renderChart (the SVG chart precedent);
src/data/local_data/us_datacenters/README.md (the bundle README pattern);
scripts/build-gas-bundle.mjs (the build-script pattern).

Then: (1) claim row 3 in the ledger, status "CLAIMED <today>, worktree
commodities-weather, branch feat/weather-forecast, next: milestone 1", and
commit that change alone. (2) Execute §11.10 milestones in order, one commit
per milestone, with the verification evidence in each commit message.

Rules that bind you: free keyless sources only, browser-direct where CORS
allows; AIFS ENS is the only model until milestone 4; descriptive, never
signals — thresholds print as heuristics with their value; additive to
upstream; portable modules never import Cesium; take the PRD's assumptions
A-1 to A-5 and note them in the commit rather than asking. Gates before
every commit: npm run format, npm run check:boundaries, npm test (four to
seven minutes, run it alone), npm run build; list every new *.test.mjs in
scripts/format-scope.json. Never push. Shared clone: guard every commit
with git branch --show-current in the same command; never a bare git
stash. Headless render checks: copy .gev-logs/render-datacenters.mjs from
the commodities-shell worktree into this worktree's gitignored .gev-logs\
as render-weather.mjs, point it at http://localhost:4176/. If a render
reports "Rendering has stopped" on the first load after adding modules,
run it again. Ask me only when a decision is genuinely missing from §11.
```

---

## 12. Row 10 PRD — `commodity-lng`: LNG terminals, tiered cards and sea-routed cargo arcs (FR-G10)

<!-- Mirror: Project Brain gods-eye-view/05-prd.md, last section. Keep both in sync via /prd. -->

**Written:** 2026-09-21 · **Status:** decided in the 2026-09-21 grill (Q1 to
Q13, every answer the recommended branch), build not started · **Mirror:**
Project Brain `gods-eye-view/05-prd.md` · **Base:** cut from
`feat/commodities-shell` at the commit the other session pushes today (the
row 4 / row 8 landing), never earlier. Every source below was live-probed on
2026-09-21; anything not decided in the grill is marked **assumption**.

### 12.1 Summary

One new layer, `commodity-lng` ("LNG · Terminals & Cargoes"), puts LNG
liquefaction terminals on the globe with datacenter-depth cards, regas
terminals as the other end of the trade, and sea-routed cargo arcs between
them sized by volume and stamped with their period. US export facilities get
the full dossier (train-level capacity, monthly cargoes, destinations,
utilization); everything else gets a card that says what grade of data it
carries. This is the rebuilt LNG set that row 4 milestone 9 owed, and the
first sea-borne flow on the globe.

### 12.2 Problem

- The globe shows chokepoints and ports but nothing about **what** moves
  through them. LNG is the one seaborne gas trade, the US is now the largest
  exporter, and every free terminal layer in circulation labels Freeport,
  Cameron and Golden Pass as **import** (struck in R4.58; the strike stands).
- The founder wants to read three things off the map: where LNG is produced
  (which plant, how big, how busy), where it goes (which country, which regas
  terminal), and which straits and canals it passes on the way.
- The free data exists but is split by grade: cargo-level monthly for US
  origins (DOE), train-level capacity for US plants (EIA), operator and
  capacity for the world (GEM), and only an annual country matrix for
  non-US trade (GIIGNL). A layer that hides the seams would repeat the
  inversion that stopped the LNG terminals layer; this one shows them.

### 12.3 Target users

- Jack, reading the physical globe beside the oracle console (R1).
- An energy analyst asking of one plant: nameplate, trains in service and
  building, cargoes in the last twelve months, utilization, top
  destinations, and which source each number came from.

### 12.4 Goals (verifiable)

1. **Producers.** Every operating and under-construction liquefaction
   terminal in GEM's Sept 2025 tracker is a marker with operator, capacity,
   status and start year; the US ones carry EIA train-level capacity and
   in-service dates. The unit test pins the count per status and asserts
   zero US export terminals without a train table.
2. **Flows.** Every US terminal-to-country pair with at least one cargo in
   the trailing twelve months is a solid arc whose width is its MMcf, and
   every non-US exporter-to-importer pair in the GIIGNL 2025 matrix is a
   dashed arc whose width is its million tonnes. The QA script asserts both
   counts and that the two grades are visually distinct (dash pattern).
3. **Routes.** Every arc is a modelled sea route that never crosses land,
   passes real chokepoints, and stores its `via` list; a Sabine Pass to
   Japan route lists Panama on the open variant and Cape of Good Hope is
   absent from it; a 2026 US to India pair draws the Red Sea-closed variant.
   Asserted by unit tests on the bundle and by the QA script on the scene.
4. **Cards.** A label at 7,000 km, a three-line card at 150 km, and on
   click a dossier with four tiles, a 24-month chart and five sections for a
   US export facility; a GEM-grade card for Ras Laffan that names GEM and
   Sept 2025; a route card naming the grade, the period and the via list.
   Asserted by the render check.
5. **Honest and gated.** Every card and the panel meta line show the
   source's own date, never the fetch time (R2, R3); `format`,
   `check:boundaries`, `test` and `build` are green with the three count
   pins moved; the attribution popover carries GEM (CC BY 4.0), DOE and EIA
   (public domain), GIIGNL (cited) and Eurostat via searoute-ts (MIT).

### 12.5 Non-goals

- **Live LNG carrier positions.** Nothing keyless exists (AISStream needs a
  key, MarineCadastre ends 2024, GFW and AISHub are gated). Row 2 owns live
  hulls; Kpler, Vortexa, Spark and ICIS LNG Edge go in `UPGRADE.md`.
- **Modelled cargo dots or animated dashes** (grill Q10). Arcs are static
  with direction arrows. A cargo is a row in a card, not a guessed position.
- **Proposed projects** (Q8). GEM tracks 1,207 LNG terminal projects; only
  operating and under-construction get a marker.
- **Splitting a country's volume across its terminals** (Q4). One arc per
  pair to the largest operating terminal, labelled as such.
- **Feedgas pipelines.** No join from a plant to row 4's network in v1; the
  card names the state and the row 4 layer, nothing more.
- **Editing the chokepoint or port layers** (Q13). The build computes the
  `via` list now; surfacing "LNG through Hormuz" on the chokepoint card
  waits for row 1 milestone 2, which owns that code.
- **A month scrubber** (Q7). Trailing twelve months is the window; the
  scrubber is a later milestone once the shell has one for any layer.
- **Signals** (R11). Utilization is arithmetic on published numbers and is
  labelled so.

### 12.6 Requirements

#### 12.6.1 Data and bundle (`src/data/local_data/lng/`)

1. **Terminals** (`terminals.json`). One record per operating or
   under-construction LNG terminal from the GEM Global Gas Infrastructure
   Tracker, LNG terminals xlsx, **Sept 2025 release, CC BY 4.0** (download is
   an email form with no account, so the xlsx is placed by hand under a
   gitignored raw folder and the retrieval date recorded, as the Epoch
   bundle does). Fields: `id, name, country, iso3, kind (export|import),
   status (operating|construction), operator, owners[], capacityMtpa,
   startYear, lat, lon, positionSource, source{name,release,license,
   retrieved}`. GEM column names (Facility Type, Owner, Operator, Capacity
   (Mtpa), Status, Start Year, Latitude, Longitude, Location accuracy) are
   from prior use and are **asserted at build**, which fails on a rename.
2. **US train table.** The EIA quarterly workbook
   `U.S.liquefactioncapacity_2026_Q2.xlsx` (released 2026-06-30, next
   3Q2026), sheet `Existing & Under Construction` (55 rows): project, train,
   baseload and peak Bcf/d and Mtpa, status, in-service and commercial-start
   dates, DOE-authorized quantity, FTA and non-FTA dockets. Joined to the
   GEM record by a hand-kept `crosswalk.json` (GEM id, EIA project name, DOE
   point-of-exit name, EIA API terminal code such as `YSPL`). The test
   asserts every US export terminal resolves in all four columns.
3. **US cargoes** (`cargoes.json`). From the DOE monthly file
   `3. U.S. LNG Exports and Re-Exports Details (Jan 2016 - Jun 2026).xlsx`
   on `energy.gov/hgeo/articles/natural-gas-imports-and-exports-monthly-2026`
   (804 KB, Last-Modified 2026-08-24, no CORS, public domain). Sheet
   `By Vessel and ISO Container`, 12,094 rows, of which 9,654 are
   `Vessel` + `Exports`. Columns kept: departure date, terminal (Point of
   Entry or Exit), country, tanker, volume MMcf, docket term, supplier. The
   bundle carries (a) per-cargo rows for the trailing 24 months and (b) the
   full monthly terminal-by-country aggregate since 2016. The script scrapes
   the article page for the `3. ... Details` href because the filename
   suffix (`_0`, `_1`) moves monthly, and fails loudly if no match.
4. **Global matrix** (`matrix.json`). GIIGNL Annual Report 2026, public PDF,
   page 11 "LNG Quantities (in MT) received in 2025": importer rows by ~24
   exporter columns, world total 428 MT (Asia 271.0, China 67.0, Japan 65.9,
   South Korea 48.7, India 25.3). Extracted once with a position-aware PDF
   text pass (blank cells shift columns) into a CSV committed beside the
   bundle with the PDF's sha256; the build asserts the row and column sums
   against the report's printed totals. The members-only xlsx is the paid
   upgrade; the Energy Institute workbook is the manual fallback (Cloudflare
   blocks scripts; terms allow use with citation).
5. **Routes** (`routes.json`). One LineString per drawn pair, computed at
   build by `searoute-ts@2.3.0` (MIT, Eurostat 2025 marine network, explicit
   Suez, Panama, Bab-el-Mandeb and Kiel restrictions, returns nautical
   miles), **two variants per pair**: `open` and `redSeaClosed`
   (Bab-el-Mandeb blocked, so Cape routing). Each variant stores distance,
   `via[]` (chokepoints from the bundled gazetteer within 25 km of the
   line), and the variant in use per period: `redSeaClosed` for periods from
   2024-01 on any pair whose open route lists Bab-el-Mandeb, `open`
   otherwise. Endpoints (Q4): the exporting terminal for US pairs, otherwise
   the country's largest operating export terminal; and the importing
   country's largest operating regas terminal, recorded as `endpointRule`.
6. **Provenance.** `source.json` (per-input name, URL, release, licence,
   retrieval date, sha256, row counts) and `README.md` (the refresh
   procedure, including the two manual downloads) as the datacenters bundle
   does. `vintage` is the DOE file's latest month; the panel meta reads
   `Jul 2025 to Jun 2026 · DOE · 2-month lag`.
7. **Build script.** `scripts/build-lng-bundle.mjs` (`npm run build:lng`)
   downloads DOE and EIA, reads the GEM xlsx and the GIIGNL CSV from the raw
   folder, runs searoute-ts, writes the five files, and prints a diff;
   `--check` rebuilds in memory and exits non-zero unless byte-identical to
   the committed bundle. Manifest counts are asserted so an upstream change
   fails the build rather than moving the map.
8. **Size gate, pre-committed.** Bundle under 8 MB uncompressed; routes
   simplified to under 400 vertices each; activation under 900 ms and heap
   growth under 60 MB on this box, measured by the QA script.

#### 12.6.2 Layer (`src/layers/lng/`)

9. **Modules**, on the datacenters pattern: portable `records.js`
   (normalize, freeze, derive, formatters) and `source.js` (bundle fetch,
   cached); Cesium-aware `model.js` (tiers, sizes, colours, overlay cards)
   and `index.js` (entities, hover, click, chips, `getStats()`); `dossier.js`
   with a pure `buildLngDossierModel`; `src/app/layers/lng.js` wiring.
10. **Contract.** `freshnessClass: 'published'`; `getStats().asOf` and
    `getStats().observation` from `createObservation` in
    `src/layers/commodities/observation.js`, `observedAt` = the source's own
    date per record; every `registerEntityContext` record carries
    `properties.observation`. The hover service does not exist yet, so the
    layer keeps its own hover highlight like datacenters and joins the row 1
    retrofit list (R6 exception, recorded).
11. **Export markers.** Pinned point (`HeightReference.NONE`, depth test
    off) sized `8 + 0.9 × √Mtpa` px, clamped ground-polyline ring of
    `3 km + 400 m × √Mtpa`; operating filled, under construction hollow with
    the expected in-service year in the label. The horizon-occluder pass
    from the chokepoints fix (`87dcf19`) is applied so far-side markers do
    not paint through the planet.
12. **Import markers.** Smaller pinned point in a second colour, no ring,
    label only at regional tier and below.
13. **Arcs.** One polyline per pair, `clampToGround`, `PolylineArrow`
    material for direction, width 1.5 to 8 px by volume (log scale within
    each grade), solid for the DOE grade and dashed for the GIIGNL grade,
    drawn as one `GroundPolylinePrimitive` per grade if entity count costs
    the activation gate.
14. **Chips.** One panel row with chips `EXPORT`, `IMPORT`, `ROUTES`, all
    on, through the panel's existing row-controls contract; persistence in
    the layer-state string is an **assumption** to verify against the
    options codec at milestone 3, otherwise session-only and the meta line
    says so.
15. **Tiers.** Above 2,500 km: labels for export terminals only,
    `SABINE PASS · 30.0 Mtpa`. 300 to 2,500 km: three-line card (operator
    and status; cargoes and MMcf over the window; top destination). Under
    300 km: the plant card plus its train list, ending with the hint that the
    marker opens the dossier.
16. **Dossier** (US export facilities): kicker (rank by baseload, status),
    title, four tiles (nameplate baseload Mtpa with Bcf/d; trains operating
    and building; cargoes in the window; utilization = window MMcf ÷
    baseload Bcf/d × 365 × 1,000, labelled arithmetic), an SVG chart of 24
    monthly export bars with the baseload line, sections **Trains** (train,
    baseload, peak, status, in-service), **Destinations** (top ten countries
    with cargoes and MMcf), **Shipping** (distinct tankers, mean cargo
    MMcf, cargoes per month), **Regulatory** (dockets, FTA and non-FTA
    authorized quantities), **Sources**; buttons previous, fly to, zoom out,
    next. Zero and null capacity must not throw (the row 8 dossier did).
17. **Other cards.** Non-US export and every import terminal: name, country,
    operator, capacity, status, start year, `GEM · Sept 2025`, and for
    exporters their matrix row (top importers, MT); for importers their
    inbound arcs. Route hover: origin, destination, period, volume, grade.
    Route click: the same plus distance, via list, variant in use, and for
    the DOE grade a twelve-month bar list.
18. **Registration**, in the §2.2 order: `src/sources/reference.js`,
    `src/app/constructCatalog.js`, `src/data/layerState.js` (first free
    digit token; every letter but `v` is taken), `src/ui/layerPanel.js`
    Commodities group label `LNG · Terminals & Cargoes`,
    `scripts/package-boundaries.json` (three sections, inserted textually),
    `scripts/format-scope.json` for each new test, `DATA_SOURCES.md`,
    `src/data/dataCredits.js`, `docs/COMMODITIES.md`; the three count-pin
    tests move by one. No voice enum change.
19. **Checks.** Committed `scripts/qa-lng.mjs` on the `qa-gas-flows.mjs`
    pattern (registers, enables, counts per chip, activation and heap gate,
    a Sabine Pass click, no page errors, screenshots) and a gitignored
    `.gev-logs/render-lng.mjs` for the three depths.

### 12.7 Constraints & invariants

- Product rules R1 to R13 in `docs/COMMODITIES-PLAN.md` §2.1, especially
  R2 and R3 (own dates on every card), R11 (descriptive), R12 (free first,
  keys server-side), R13 (additive; upstream untouched).
- Engineering rules §2.2: file order, count pins, four gates, portable
  modules, render check per layer, markers pinned not clamped.
- R4.58 stands: the EIA `Lng_ImportExportTerminals_US_EIA` and NACEI layer 5
  services are never read; GEM plus the EIA workbook replace them.
- `20-decisions.md` 2026-09-21: `commodities` moves once, after row 1
  milestone 2; this row merges into `feat/commodities-shell` and rides
  (Q13/landing).
- Ledger lock: the other session owns `feat/commodities-shell` until its
  push lands; nothing is cut, staged or committed before that message.
- Gotchas already paid for: ArcGIS page caps, clamped-ellipse outlines,
  headless "Rendering has stopped" on first load after new modules (re-run),
  new tests invisible to `npm run format` until listed in
  `scripts/format-scope.json`, GPU-only render checks run alone.

### 12.8 Milestones (smallest shippable first)

0. **Claim and cut.** After the landing push: ledger row 10 CLAIMED and
   this PRD as §12 in `docs/COMMODITIES-PLAN.md`, one commit on a new
   worktree `~/commodities-lng`, branch `feat/commodity-lng`, dev server
   4175. *Verify:* `git worktree list` shows the tree at the pushed base;
   the ledger row names the worktree; no code touched, gates unaffected.
1. **Bundle and records.** Raw inputs placed, build script, five bundle
   files, `crosswalk.json`, `records.js`, `source.js`, tests. *Verify:*
   `node scripts/build-lng-bundle.mjs --check` exits 0; `npm test` green
   with pins for the count per kind and status, the DOE latest month
   `2026-06`, zero unmapped DOE terminal names in the window, the GIIGNL
   world total within 0.5 MT of 428, and three known routes within 5 % of
   published distances (Sabine Pass to Tokyo Bay via Panama, via Cape;
   Ras Laffan to Milford Haven via Suez).
2. **Terminals on the globe.** Registration, markers, rings, tiers, plant
   cards, credits. *Verify:* `scripts/qa-lng.mjs` passes registration,
   counts, the label at 7,000 km and the three-line card at 150 km over
   Sabine Pass; four gates green; count pins moved; attribution QA green.
3. **Arcs and chips.** Routes drawn in both grades with arrows, chips,
   hover highlight, route cards. *Verify:* QA asserts the route count per
   grade, that toggling `ROUTES` removes them and restores them, that a
   picked Sabine Pass to Japan arc's card lists Panama, that a 2026 pair to
   India lists Cape of Good Hope, activation under 900 ms, heap under 60 MB.
4. **Dossier.** Drawer for US export facilities. *Verify:* `dossier.test.mjs`
   covers the model, the zero-capacity guard and the utilization
   arithmetic; the render check clicks Sabine Pass and asserts four tiles,
   24 bars and five sections; previous and next step through the nine US
   plants in baseload order.
5. **World.** Non-US exporters, importers, GEM-grade cards, dashed annual
   arcs. *Verify:* Ras Laffan's card shows operator, Mtpa, status, start
   year and `GEM · Sept 2025`; the Qatar to China arc is dashed and stamped
   `annual 2025 · GIIGNL`; Sodegaura's card lists its inbound pairs.
6. **Docs and landing.** `DATA_SOURCES.md`, `dataCredits.js`,
   `docs/COMMODITIES.md` row, `UPGRADE.md` rows (AISStream, Kpler, Vortexa,
   Spark, ICIS, GIIGNL xlsx, GEM GIS), ledger row 10 BUILT with the SHA,
   merge into `feat/commodities-shell`, push origin and mirror. *Verify:*
   four gates on the merge commit; `git log origin/feat/commodities-shell`
   contains it; `/update-obsidian` run.
7. **EIA refresh** (after row 4 milestone 1 lands the key path). Join the
   293 `poe2` series `NGM_EPG0_ENG_Y{TERM}-N{CTRY}_MMCF` (CORS open, free
   key, latest period 2026-06) through the server proxy so widths and the
   meta stamp advance without a rebuild; the DOE bundle keeps the cargo
   detail. *Verify:* with a key the meta line shows the API period; without
   one the bundle stamp and a `bundle` note; a test pins the terminal-code
   crosswalk.
8. **Later, separate rows.** Chokepoint card line "LNG: n routes, x Mtpa
   modelled" (row 1 milestone 2); month scrubber; LNG carriers as a chip on
   row 2 once AISStream works (AIS ship type alone cannot identify an LNG
   carrier; needs an IMO allowlist from the DOE tanker column).

### 12.9 Risks & open questions

- **GEM columns are unverified today** (form-gated download). → Milestone 1
  asserts the schema; a rename is a build failure with the column named.
- **Terminal name crosswalk is hand-kept** across GEM, EIA workbook, DOE
  point-of-exit and EIA API codes. → The test asserts zero unmapped names in
  the window; a new plant (Golden Pass ramping, 3 cargoes YTD) fails loudly.
- **searoute-ts routes are shortest paths, not observed tracks.** Panama
  draft limits and slot auctions are not modelled. → Every card says
  "modelled shortest sea route"; the distance test catches gross errors;
  `seaRouteAlternatives` is the hook for a later "second route" toggle.
- **GIIGNL redistribution terms.** The public PDF is free to read; whether
  a re-typed matrix may ship in a repo is unread. → Read the report's terms
  at milestone 5; fallback is the Energy Institute workbook by manual
  download with its citation line.
- **Unit conversions.** Mtpa to Bcf/d is taken from the EIA workbook's own
  paired columns per row; GEM-only terminals show Mtpa alone. → Recorded in
  the bundle `assumptions`.
- **Chip persistence** in the layer-state string. → Verify against the
  options codec at milestone 3.
- **Perf.** Roughly 300 US pairs and up to 200 global pairs; entities may
  exceed the activation gate. → Fall back to one ground primitive per grade
  as the gas layer does.
- **Concurrency.** Two sessions share the clone; the landing push is in
  flight. → Milestone 0 waits for the message; `git branch --show-current`
  guards every commit.
- **Open:** does searoute-ts run under Node 24 with its bundled network
  offline (no CDN at build time)? Resolve at milestone 1 with a smoke run.
- **Open:** whether the DOE monthly and the EIA `poe2` monthly totals agree
  per terminal; if not, the dossier shows both with their names.

### 12.10 Bootstrap from a fresh Claude Code session

1. Wait for the landing push, then in `~/gods-eye-view`:
   `git fetch origin && git worktree add ../commodities-lng -b feat/commodity-lng origin/feat/commodities-shell`.
2. In `~/commodities-lng`: `npm ci`, then `npx vite --port 4175` in its own
   window; 4173 stays with `commodities-shell`.
3. Claim ledger row 10 and paste this PRD as §12 of
   `docs/COMMODITIES-PLAN.md`; commit with the branch guard.
4. Place the GEM xlsx and the GIIGNL CSV under the raw folder named in the
   bundle `README.md`; run `node scripts/build-lng-bundle.mjs`.
5. Work the milestones in order; each ends with the four gates and its
   verify line above.

---

## 13. Row 11 PRD — Gas production facilities: Gulf of Mexico platforms first (FR-G11)

**Written:** 2026-09-21 · **Status:** current, claimed, no code · **Branch:**
`feat/commodities-shell` in `~/commodities-shell` — the founder wants every
update on the shell branch, so this row has no worktree of its own ·
**Mirror:** Project Brain `gods-eye-view/05-prd.md` "Row 11 PRD (FR-G11)" ·
**Provenance:** the founder's pivot on 2026-09-21 ("map gas production
facilities with cards backed with real data … location, a visual card,
production and balance sheet of historical and current production") and a
three-question grill the same day; every source below live-probed
2026-09-21.

### 13.1 Summary

A layer of gas production facilities whose cards carry real, published
production — not capacity, not 2017 attributes. The first slice is every
installed platform structure on the federal Outer Continental Shelf, from
BSEE's public bulk files: monthly gas, oil, water, BOE and producing-well
counts per structure since 1957, with coordinates, operator, water depth,
install date and incidents of non-compliance. A platform is drawn where it
stands, sized by its gas in the newest *complete* reporting month, coloured by
its change against the same month a year earlier, and opens to a dossier with
a ten-year chart and a lifetime summary. EIA's regional series (state and
play, keyless) become the always-on backdrop in a later milestone; North
Dakota wells and Texas leases are the next slices.

### 13.2 Problem

- The gas layer that landed on 2026-09-21 is a substrate: places without
  numbers. The founder needs to evaluate production, not geometry.
- Row 4 milestone 9 ("plants") would draw processing plants from 2017
  capacity fields — exactly the static picture the founder rejected.
- Free data for per-facility, current gas production is uneven: nothing is
  real-time; regulators publish monthly with a one-to-three-month lag;
  onshore processing throughput is not published at all. The one national
  source with coordinates, history and monthly facility-level volumes in a
  single download is BSEE.

### 13.3 Target user

The founder as analyst: which facilities produce how much gas now, how that
compares with a year ago and with the facility's own history, and who
operates them. Descriptive, never a signal (product rule R11).

### 13.4 What the data actually is (probed 2026-09-21)

- `https://www.data.bsee.gov/Production/Files/ProdByPlatformRawData.zip`
  (20.8 MB zip → `mv_prod_by_platform_all.txt`, 218 MB, 1,695,490 rows): one
  row per platform structure per month — `COMPLEX_ID_NUM`,
  `STRUCTURE_NUMBER`, `AREA_CODE`, `BLOCK_NUMBER`, `LEASE_NUMBER`,
  `STRUCTURE_NAME`, `INSTALL_DATE`, `REMOVAL_DATE`, `PF_OPERATOR`,
  `PRODUCTION_DATE`, `PRODUCING_WELLS`, `BOPD`, `MCFPD`, `BOEPD`, `BWPD`,
  `REGION_CODE`. 6,184 structures ever; production from 1957-01.
- `https://www.data.bsee.gov/Platform/Files/PlatStrucRawData.zip` (1.8 MB):
  `mv_platstruc_structures.txt`, 7,091 structures with `LATITUDE` /
  `LONGITUDE` (7,083 filled), `WATER_DEPTH`, `STRUC_TYPE_CODE`,
  `MAJ_STRUC_FLAG`, `INSTALL_DATE`, `REMOVAL_DATE`, `BUS_ASC_NAME` (operator),
  `NAD_YEAR_CD`; 1,315 still installed. `mv_platstruc_inccount.txt`:
  incidents of non-compliance per structure.
- **Reporting is incomplete for the newest months.** Measured: 2026-05 348
  structures with gas (2,570 MMcf/d); 2026-06 331 (2,603 MMcf/d); 2026-07
  159 (1,270); 2026-08 2 (21). The newest month with rows is not the current
  month.
- Median producing history 136 months, maximum 846. In the partial 2026-08
  file the two reporters are B (Helix) GC 237 at 12.1 MMcf/d and A (Brutus)
  GC 158 at 8.8, both Talos, in 2,200–2,900 ft of water.
- Licence: US Government public domain (BSEE, Department of the Interior).
  No key and no CORS question: the bulk files are read at build time.
- EIA backdrop (milestone 5), all keyless: dnav XLS gross withdrawals by
  state `NG_PROD_SUM_A_EPG0_FGW_MMCF_M.xls` (169 KB) and marketed production
  `…VGM…` (174 KB); the Drilling Productivity Report `dpr-data.xlsx`
  (156 KB); API v2 `natural-gas/prod/sum` answers with `DEMO_KEY` (Texas
  gross withdrawals 2026-06: 1,174,698 MMcf).

### 13.5 Goals (verifiable)

- **G1** Every structure with gas in the newest complete month is on the map
  at its coordinates: `getStats().producing` equals the bundle's count, and
  the committed QA clicks the top producer and screenshots a dossier with a
  120-point chart.
- **G2** Every number on a card carries the row-1 stamp with its lag; the
  "current" month is the completeness rule's output (R11.2) and the panel
  names the months still reporting.
- **G3** The bundle is ≤ 640 KB gzipped (600 restated on 2026-09-21 when
  BSEE's filed BOE joined the series) and `npm run build:gulf-platforms`
  reproduces the committed bytes from the archived raw files; `source.json`
  sha256 and byte counts are asserted by a test.
- **G4** The four gates are green at every commit; the count-pinning tests
  move by one; `scripts/qa-gulf-platforms.mjs` passes — marks, tiers,
  dossier, no page errors, activation under 900 ms against a fresh server.

### 13.6 Requirements

- **R11.1** Facility = platform **structure** (`COMPLEX_ID_NUM` +
  `STRUCTURE_NUMBER`), because production is filed at that grain; a complex
  with several structures draws several marks; the id is
  `<complexId>-<structureNumber>`.
- **R11.2** **Current month = newest complete month**: the latest month whose
  count of structures reporting any production is at least 90 % of the
  median of the twelve preceding months, that median being at least half
  the median of the twelve before it (a bad season must not freeze the bar;
  a dead tail must not lower it). The bundle carries the
  counts table for the trailing eight months; the panel prints the months
  still filling (`AS OF 2026-06 · JUL 48 % REPORTED · AUG 1 %`). Pinned by a
  test on the measured counts (348 / 331 / 159 / 2).
- **R11.3** Drawn: installed structures only (`REMOVAL_DATE` blank; 1,315).
  Producing in the current month → an INK mark sized by √(MCF/d) between
  4 and 22 px; installed with no gas this month → a 4 px hollow grey pip.
  Removed structures are counted in the panel and never drawn.
- **R11.4** Colour is the change against the same month a year earlier, in
  classes and descriptive: up (> +10 %), flat, down (< −10 %), new (no
  prior-year row), quiet (no production in either month). Never a trend
  arrow, never a forecast.
- **R11.5** Every reading is a `createObservation` with `observedAt` = the
  production month's last day, `publishedAt` = the retrieval date, class
  `published`; stamps read `as of 2026-06 · N d lag`.
- **R11.6** Card (regional tier, hover and select): structure and complex
  name, area/block, operator, water depth; **gas MCF/d** headline with its
  YoY class; oil bbl/d, water bbl/d, BOE/d, producing wells; the stamp.
- **R11.7** Dossier (click): Identity (structure, complex, lease, field, type,
  installed, incidents of non-compliance); This month (all five quantities
  against the prior month and the same month last year, as arithmetic);
  Ten-year chart (gas headline, oil secondary, 120 monthly points, stamped);
  Lifetime (first month, peak month and value, cumulative gas and oil,
  months producing, decline from peak as a percentage); Sources (both BSEE
  files, retrieval date, the completeness table).
- **R11.8** Bundle `src/data/local_data/bsee_gulf/`: `platforms.json`
  (installed structures with identity, coordinates, lifetime summary and the
  trailing-120-month series for gas, oil, water, BOE and wells),
  `source.json` (upstream file names and sizes, sha256 of the raw text,
  retrieval date, newest complete month, counts table), `README.md`. Raw
  zips archived under `.gev-cache/bsee/` (git-ignored). Build:
  `scripts/build-gulf-platforms.mjs` as `npm run build:gulf-platforms`,
  replayable from the archive with a streamed parse — the 218 MB text is
  never held whole and never bundled.
- **R11.9** Portable modules `src/layers/production/{records,completeness,bundledSource}.js`
  import no Cesium; render in `src/layers/production/index.js`, model in
  `model.js`, dossier in `dossier.js`, following the datacenters layer
  (three tiers at the datacenters heights, overlay entries, context store,
  fly-to on click).
- **R11.10** Layer id `production-gulf-platforms`, token `2` (digits are
  free; `1` is LNG, `3` weather; every letter is taken), panel group
  Commodities, label `Gas · Gulf Platforms (BSEE)`; registered in
  `constructCatalog`, `layerState`, `reference`, `layerPanel`, both
  registries, `DATA_SOURCES.md` and `dataCredits.js` (BSEE, US public
  domain).
- **R11.11** Panel meta line
  `331 PRODUCING · 2.6 BCF/D · AS OF 2026-06 · 1,315 INSTALLED · JUL 48 % REPORTED`;
  legend: size = gas per day, colour = vs the same month last year.
- **R11.12** Coordinates are used as published; `NAD_YEAR_CD` is recorded per
  structure and shown in the dossier, not converted (the 27/83 datum shift
  is tens of metres in the Gulf, below the mark's footprint).

### 13.7 Non-goals

- Real-time or daily production (no free source). Interstate pipeline
  informational postings are the only near-real-time route — public under
  FERC rules but spread over ~40 bulletin boards with no API — named here,
  not attempted.
- Onshore facilities in v1: North Dakota wells and Texas leases are
  milestones 6 and 7 with their own addenda. Processing plants publish no
  throughput and are not a facility layer.
- Lease economics, ownership shares, royalties; incident details beyond the
  count; forecasts, decline modelling, type curves.
- Editing the row-4 layer: its border-crossing volumes are a separate,
  already-decided change (the keyless dnav bundle, §0 row 4).

### 13.8 Constraints and invariants

Product rules R11 (descriptive, never signals) and R12 (keyless — satisfied
at build time); the row-1 observation contract for every stamp; portable
modules import no Cesium; this row builds on `feat/commodities-shell` by the
founder's instruction (no row worktree) with the ledger claimed before code;
the count-pinning tests move with the layer; both registries and
the format scope in the same commit as the files; attribution lands with the
layer; never a bare `git stash`; the four gates at every commit
(`.gev-logs/gate-at.ps1` in the shell worktree proves one commit's tree).

### 13.9 Milestones (smallest shippable first)

1. **Bundle and records.** Verify: `npm run build:gulf-platforms` reproduces
   the committed bytes from `.gev-cache/bsee/`; `completeness.test.mjs` pins
   2026-06 as the newest complete month from the measured counts;
   `records.test.mjs` proves the 120-month window, the lifetime summary and
   the stamps; the bundle is ≤ 640 KB gzipped. BUILT 2026-09-21 `c6c92b2`.
2. **Marks, tiers, panel.** Verify: the QA at global and regional — the
   producing count equals the bundle, idle installed structures draw grey,
   removed ones do not draw, activation under 900 ms, heap growth under
   100 MiB, no page errors. BUILT 2026-09-21 `1e685f0` (17 checks, 867 ms,
   +78 MiB).
3. **Cards and dossier.** Verify: the QA hovers the top producer (card lines
   match the bundle), clicks it (five dossier sections, 120-point chart,
   lifetime block, sources) and screenshots all three tiers. BUILT
   2026-09-21 `af342d1` — the chart carries one point per _filed_ month (87
   of 120 for Whale) rather than a fixed 120, so a gap in filing reads as a
   gap; the activation gate was split, see 13.10.
4. **Ledger, docs, credits; push.** Verify: ledger row 11 BUILT with SHAs;
   `DATA_SOURCES.md` and the credits footer name BSEE; the QA script is
   committed. BUILT 2026-09-21 — credits and the QA script landed with
   milestone 2; the ledger and these notes are the commit after `af342d1`.
5. **EIA regional backdrop.** A short grill first, then state and play cards
   — gross withdrawals, marketed production, DPR rigs and new-well
   productivity, consumption by sector, storage, net trade: the state balance
   sheet — on the keyless play polygons.
6. **North Dakota wells** (DMR monthly per well, public CSV).
7. **Texas leases** (RRC PDQ bulk plus the well shapefiles for coordinates).

### 13.10 Risks and open questions

- **Completeness drifts** (a month fills late, a file is re-cut). → R11.2's
  rule plus a test on the counts table; the panel names the months still
  filling.
- **Structure vs complex identity** (several structures share a complex and
  names repeat: "A", "B"). → One mark per structure; the card shows both
  names.
- **"Current" is 60–90 days old.** → Said on every card and in the meta line;
  never hidden.
- **Resolved 2026-09-21 — Gulf only.** The production file carries three
  OCS regions but the structures file (and so every coordinate) is the
  Gulf's: in 2026-06, Alaska's Northstar filed 547 MMcf/d gross (gas
  reinjected counts as produced) and twelve Pacific platforms 25 MMcf/d,
  none placeable. The bundle counts them by region (`counts.outOfRegion`)
  and the Gulf's own unbundled gas by reason (removed / unplaced / absent
  from the structures file — one structure, SS 63 #15, at 0.0 Bcf/d), so
  the panel's Gulf total is honest without claiming the file's total.
- **Learned the same day, and pinned by tests:** the first draft of the
  completeness rule froze its baseline on the 2008 hurricane season and
  named 2008-08 as current — the Gulf's reporter count has declined
  structurally from ~1,800 to ~345 — hence the rolling median with a floor
  guard in R11.2. And BSEE's filed BOE is not exactly oil + gas / 5.62
  (47,571 filed where the convention gives 47,570), so BOE is carried as
  filed and the convention only fills a blank.
- **Deviation 2026-09-21 (milestone 3) — the activation gate measures the
  layer, not the dev server.** The same tree read 819, 990 and 1,077 ms
  cold against the 900 ms gate with nothing changed; profiled in the page,
  the 2.6 MB bundle fetch alone ranged 307 to 1,613 ms within an hour while
  parse (18 ms), records (43 ms) and the 1,315 entities (~600 ms, Cesium's
  Entity API) were steady. `scripts/qa-gulf-platforms.mjs` now reads the
  fetch from `performance.getEntriesByType('resource')`, gates the
  remainder at 900 ms (755 ms measured) and the cold total at 3,000 ms.
  Suspending collection events around the adds changed nothing measurable
  and was not kept.
- **Open:** datum conversion — no by default (R11.12); revisit only if a
  mark visibly misses its platform in imagery.

### 13.11 Bootstrap from a fresh Claude Code session

```powershell
cd C:\Users\jgewi\commodities-shell   # feat/commodities-shell — the founder wants every update here
git status --porcelain                # another session may hold uncommitted docs; never stage what is not yours
npm run doctor
npx vite --port 4174 --strictPort --host 127.0.0.1   # 4173 is usually another session's long-lived server; timing gates need a fresh one
claude
```

Prompt: "Row 11, milestone 1 (PRD §13): write scripts/build-gulf-platforms.mjs
and src/layers/production/{records,completeness,bundledSource}.js with tests,
from the BSEE files archived in .gev-cache/bsee/ (re-download if absent);
pin 2026-06 as the newest complete month; keep the bundle under 640 KB
gzipped. Gates in order; commit on feat/commodities-shell, guarded by
git branch --show-current; push origin and mirror."
