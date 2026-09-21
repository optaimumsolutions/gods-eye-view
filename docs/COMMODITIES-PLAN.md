# PLAN — Commodities Globe: rules, features and layout for rows 1 to 8

**Version:** 1.3 · **Date:** 2026-09-21 · **Status:** decisions locked in the
2026-09-17 grill; built so far — rows 0a, 0b, 1 (milestone 1), 4 (substrate)
and 8 (v3), see the §0 ledger for commits
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
| 3   | Weather overlays and basin cards                 | layers                               | OPEN — after row 1                                                                                  |
| 4   | `commodity-gas-flows`, gas cross-border crossings | layers                               | **BUILT (substrate) 2026-09-21** — PRD §10. Data layer `f665031`: `scripts/build-gas-bundle.mjs` + `src/data/local_data/eia_energy/` (32,892 features to 234 systems; 99 filings to 60 marks) and the `src/layers/gasFlows/` pure modules. Render layer `4919e03`: PENCIL pips and hairline, token `l`, GRID off by default after the milestone-5 gate breached (~500 MiB to draw; `scripts/qa-gas-flows.mjs` 18/18). Four gates green at every commit. Open: no UI chip calls `setNetworkEnabled` yet. Next: milestone 1 (EIA key) — everything else is blocked on it |
| 5   | News pinned to assets                            | layers + server                      | OPEN — needs the assets from row 4                                                                  |
| 6   | Trade-flow arcs                                  | layers + server                      | OPEN                                                                                                |
| 7   | Episode scene packs                              | content                              | OPEN — the only oracle bridge, offline and per episode                                              |
| 8   | `energy-datacenters`, US power load, bundled   | layers (worktree `commodities-datacenters`) | **BUILT** — v1 (five sites) `4ab9c96` on `feat/energy-datacenters`, PRD §8; v2 cards `76a334e`/`8f758b3`; v3 `1ccf37f` (2026-09-21, on `feat/commodities-shell`): fifteen sites, live EIA-930 grid and Open-Meteo weather on the cards and dossier, `/api/epoch/` proxy (no consumer yet — the refresh script is still open) |
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
