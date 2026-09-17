# PLAN — Commodities Globe: rules, features and layout for rows 1 to 8

**Version:** 1.2 · **Date:** 2026-09-17 · **Status:** decisions locked in the
2026-09-17 grill; build not started beyond rows 0a and 0b
**Owner:** Jack Gewirz
**Companions:** [`COMMODITIES.md`](COMMODITIES.md) (verified endpoints, source
notes), [`../UPGRADE.md`](../UPGRADE.md) (paid enhancement per stream)

This plan does what the oracle's PRDs do: §0 is the ledger and the ledger is
the lock. Claim a row before touching its files. Two sessions share this
clone; the session in the worktree owns row 1, the session in the main tree
owns layers. Re-check `git status` before every edit to a shared file.

---

## 0. Status ledger

| Row | Work item                                        | Lane                                 | Status (2026-09-17)                                                                                 |
| --- | ------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 0a  | `commodity-chokepoints` layer                    | layers                               | **BUILT** — commit `7400360`, pushed to origin and mirror; markers pinned to a bundled gazetteer in `f238b66` (merged here as `fa8132f`, not pushed) |
| 0b  | `commodity-ports` layer                          | layers                               | **BUILT** — commit `f042155`, merged into `commodities`, pushed to origin and mirror; markers pinned in `f238b66` (merged here as `fa8132f`, not pushed); retrofit to the row-1 contract pending |
| 1   | Shell, observation contract, hover, class groups | shell (worktree `commodities-shell`) | CLAIMED 2026-09-17 — PRD §7; worktree `commodities-shell` on `feat/commodities-shell`; next: milestone 1, observation contract |
| 2   | `commodity-tankers`                              | layers                               | BLOCKED — AISStream rejects the saved key; verify or rotate on the Account page, enter via POWER UP |
| 3   | Weather overlays and basin cards                 | layers                               | OPEN — after row 1                                                                                  |
| 4   | Pipelines and plants, bundled                    | layers                               | OPEN — after row 3                                                                                  |
| 5   | News pinned to assets                            | layers + server                      | OPEN — needs the assets from row 4                                                                  |
| 6   | Trade-flow arcs                                  | layers + server                      | OPEN                                                                                                |
| 7   | Episode scene packs                              | content                              | OPEN — the only oracle bridge, offline and per episode                                              |
| 8   | `energy-datacenters`, US power load, bundled   | layers (worktree `commodities-datacenters`) | **BUILT** 2026-09-17 — first five sites on `feat/energy-datacenters`, PRD §8, not merged; next tier and refresh script open |
| 9   | Port dossier: camera + data panel, 20 ports   | layers + server + content (worktree `commodities-ports-dossier`) | OPEN — PRD §9 written 2026-09-17 from the grill (G1 to G6); not claimed; cut `feat/port-dossier` from `feat/commodities-shell` |

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
                             🌡 Basin forecasts        issued 00Z · valid 7d
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

### Row 3 — Weather overlays and basin cards (FR-G3)

| Layer id            | Shows                                                                                                                                                | Source                                                                                            | Class                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `weather-satellite` | GOES GeoColor clouds, IMERG precipitation rate                                                                                                       | NASA GIBS WMTS tiles                                                                              | live (frames every 10 to 30 minutes) |
| `weather-radar`     | composite radar, 13 past frames                                                                                                                      | RainViewer tiles                                                                                  | live                                 |
| `weather-storms`    | hurricane forecast cones, tracks, wind radii                                                                                                         | NHC ArcGIS layers                                                                                 | daily (advisory cadence)             |
| `weather-alerts`    | active watches and warnings as polygons                                                                                                              | NWS API, User-Agent required                                                                      | live                                 |
| `weather-basins`    | six shale basins and the Gulf: 7-day minimum-temperature ensemble p10, p50, p90 and a freeze flag against each basin's threshold; Gulf wind and wave | Open-Meteo forecast and 30-member ensemble at the basin points from the oracle's `wx_basins.yaml` | daily                                |

**Mechanism.** Imagery overlays are layer modules that own a Cesium imagery
layer above the basemap, the precedent being the Nepal event pack; the point
and polygon layers are browser-direct sources. Every frame and forecast
carries `observedAt` or `validAt`; the scrubber sets which frame is shown.

**Cards.** Hover on a basin: name, issued time, p50 minimum and freeze flag.
Click: the full ensemble spread by day. Hover on a cone: storm name, advisory
time, category. Alerts: event type, effective and expires.

### Row 4 — Pipelines and plants, bundled (FR-G4)

**Data.** Downloaded once from the verified public copies into
`src/data/local_data/eia_energy/` with `source.json` (URLs, dates, sha256) and
a README, EIA public domain: gas pipelines (32,892 segments), crude trunk
lines (236), HGL lines (133), refineries with capacity (127), processing
plants (478), LNG terminals (8 US, 15 North America), underground storage
(412), product terminals (1,476); EIA-owned shale plays, basins and PADDs
live-read since they are keyless.

| Layer id           | Shows                                                                                     | Class                      |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| `energy-pipelines` | lines by product, operator on hover; trunk lines at global zoom, all lines under 2,000 km | published, vintage stamped |
| `energy-plants`    | refineries scaled by capacity, terminals, processing, storage; shale play polygons faint  | published, vintage stamped |

**Mechanism.** The infrastructure-layer factory used by datacenters and dams,
with its label budgets and level-of-detail policy.

**Cards.** Hover: name, operator or company, capacity where known, vintage.
Click: every attribute the dataset carries.

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

---

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

**Written:** 2026-09-17 · **Status:** built for the first five sites on
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
generation, water, timeline, sources). The first five sites ship now; the
same bundle format grows to the next tier and, later, to global sites.

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
2. **Selection.** The five largest US sites by current IT power in the Epoch
   AI "AI Data Centers" tracker on the retrieval date: Colossus 2 (946 MW),
   Anthropic-Amazon New Carlisle (910), Microsoft Fairwater Atlanta (636),
   Meta Prometheus (562), OpenAI Stargate Abilene (421). (Assumption: rank by
   current, not planned, IT power; planned figures are on every card.)
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
7. **Ambient depth.** Above 2,000 km camera height the overlay entry is a
   label, `NAME · 946 MW IT`; below it a card with three lines: owner and
   users; facility MW and the planned path with its date; grid utility and
   on-site generation. The layer republishes on the camera's `moveEnd` when
   the tier changes.
8. **Full card.** On click, the selected card lists in order: place, project,
   status and rank; owner and operator; users, investors, builders; planned
   path and note; compute (H100 equivalents) and chips; capex, compute and
   construction cost, planned capex, annual opex, capex per IT MW; buildings,
   campus acres, square feet, facility/IT ratio; cooling and chiller plant;
   grid utility, operator, interconnection and substation; on-site
   generation, its units and permit status; batteries, backup and water;
   gas-equivalent demand now and at full build, labelled illustrative;
   latest and next milestone; the site's as-of date, licence and position
   source. Lines clamp at 150 characters.
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
13. **Render check.** `.gev-logs/render-datacenters.mjs` asserts five sites,
    the as-of stamp, the global and regional tiers, the Colossus 2 click, the
    analyst record on the context, and no page errors, with screenshots of
    all three depths.
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
4. **Next tier.** Sites 6 to 15 by current IT power (Fairwater Wisconsin,
   Google Pryor, Colossus 1, and on), same fields, same test. Verify: the
   global view stays legible under the 24-entry cohort cap.
5. **Hover retrofit.** After row 1, the hover card shows name, stamp, IT MW.
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
- **Card size.** Sixteen lines at 150 characters is wide; on a narrow window
  the right edge clips. → Row 1's hover keeps the quick look short; consider
  a two-column card in the full-card redesign.
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
