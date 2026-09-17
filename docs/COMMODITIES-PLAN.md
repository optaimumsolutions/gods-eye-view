# PLAN — Commodities Globe: rules, features and layout for rows 1 to 7

**Version:** 1.1 · **Date:** 2026-09-17 · **Status:** decisions locked in the
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
| 0a  | `commodity-chokepoints` layer                    | layers                               | **BUILT** — commit `7400360`, pushed to origin and mirror                                           |
| 0b  | `commodity-ports` layer                          | layers                               | **BUILT** — commit `f042155`, merged into `commodities`, pushed to origin and mirror; retrofit to the row-1 contract pending |
| 1   | Shell, observation contract, hover, class groups | shell (worktree `commodities-shell`) | CLAIMED 2026-09-17 — PRD §7; worktree `commodities-shell` on `feat/commodities-shell`; next: milestone 1, observation contract |
| 2   | `commodity-tankers`                              | layers                               | BLOCKED — AISStream rejects the saved key; verify or rotate on the Account page, enter via POWER UP |
| 3   | Weather overlays and basin cards                 | layers                               | OPEN — after row 1                                                                                  |
| 4   | Pipelines and plants, bundled                    | layers                               | OPEN — after row 3                                                                                  |
| 5   | News pinned to assets                            | layers + server                      | OPEN — needs the assets from row 4                                                                  |
| 6   | Trade-flow arcs                                  | layers + server                      | OPEN                                                                                                |
| 7   | Episode scene packs                              | content                              | OPEN — the only oracle bridge, offline and per episode                                              |

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
