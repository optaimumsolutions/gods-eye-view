# PLAN — Commodities Globe: rules, features and layout for rows 1 to 8

**Version:** 1.4 · **Date:** 2026-09-23 · **Status:** decisions locked in the
2026-09-17 grill; built so far — rows 0a, 0b, 1 (milestone 1), 4 (substrate)
and 8 (v3), see the §0 ledger for commits; row 3 re-specced in the
2026-09-21 weather grill (§11); row 13 (hosting at commodities.optaimum.com)
specced in the 2026-09-23 hosting grill (§15), which supersedes R1 and R7
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
| 10  | `commodity-lng`: LNG terminals, tiered cards, sea-routed cargo arcs | layers (worktree `commodities-lng`) | **BUILT 2026-09-21** — PRD §12 (mirror: Project Brain `05-prd.md`), milestones 0 to 6. Bundle `8b5c5b4` (`npm run build:lng`, `--check` byte-identical; 308 GEM terminals, EIA 2026-Q2 trains on 14 US plants, DOE cargoes through 2026-06, GIIGNL 2025 matrix 427.9 MT, 470 searoute-ts routes); layer, dossier, chips, docs in the commit carrying this line. `scripts/qa-lng.mjs` green (41 checks; activation 666 ms warm, heap +31 MiB); four gates green. Deviations in §12.11: GEM read from GEM's public tracker-map feed until the form-gated xlsx is placed (no operator column), via radius 40 km, chips session-only, EIA API codes null until milestone 7. Landed on `feat/commodities-shell` per the founder's 2026-09-21 rule. Next: milestone 7 (EIA `poe2` refresh once row 4 lands the key path) |
| 11  | Gas production facilities: Gulf platforms (BSEE) first | layers + content (shell worktree, `feat/commodities-shell`) | **BUILT (first slice) 2026-09-21** — PRD §13 from the founder's pivot and grill; on `feat/commodities-shell` (founder's instruction: every update on the shell branch, no row worktree), token `2`. Milestone 1 `c6c92b2`: `scripts/build-gulf-platforms.mjs` + `src/data/local_data/bsee_gulf/` (1,315 installed structures, 120-month series, 608 KB gzip), the completeness rule and the one record shape. Milestone 2 `1e685f0`: marks sized by gas share and coloured by change against last year, three tiers, hover and selected cards, the panel line, `scripts/qa-gulf-platforms.mjs`. Milestone 3 `af342d1`: the dossier (ten-year chart, this-month ledger, identity, lifetime, sources) and the drawer chrome shared with the datacenters; QA 20 checks green (layer activation 755 ms apart from the bundle fetch, heap +50 MiB). Milestone 4 is the commit carrying this line. Four gates green at every commit. Next: milestone 5 (EIA regional backdrop, short grill first) |
| 12  | Onshore production facilities: wells, leases and rigs, region by region | layers + content (shell worktree, `feat/commodities-shell`) | **BUILT (milestones 0 and 1, Williston) 2026-09-21** — PRD §14 from the founder's direction the same day; five live sweeps probed some twenty regulators (§14.4); eleven regions ranked (§14.5). The founder's "build out the basins one at a time" started the ladder in the §14.5 order with O1 taken as recommended (option a: index and clusters committed, history shards built from the archive, not committed). Milestone 1a `c4ec135`: `scripts/build-onshore.mjs` + `scripts/onshore/{nd,eia,regions}.mjs`, `src/layers/onshore/{records,shards,bundledSource}.js`, `src/data/local_data/onshore/williston/` (24,154 North Dakota wells over 120 months, 17,915 producing in 2026-07 at 3.30 Bcf/d and 1.17 MMbbl/d; 518 fields; index 2.5 MB gzip; `--check` byte-identical; 94 % of EIA gross withdrawals, 100 % of marketed). Milestones 1b and 1c `f66463a`: `production-williston` (token `4`) — region card at global, 518 field marks at regional, 24,154 well points (`PointPrimitiveCollection`, clipped to the view) at local, hover and selected cards, the dossier with the ten-year chart from an on-demand shard, `scripts/qa-onshore-williston.mjs` on the shared harness (32 checks: activation 659 ms apart from the 16 MB fetch, heap +35 MiB, layer frame cost 1.8 ms). `836c325` fixes the second enable of the rows 4 and 11 layers (found by this QA). Build notes §14.13. Next: region 2, Appalachia (PA unconventional) |
| 13  | Hosted site: globe + console behind one login at `commodities.optaimum.com` | ops + shell + server (`feat/commodities-shell`; oracle twin FR-D17) | **M1 IN PROGRESS 2026-09-23 — M1a BUILT `9d61cd6`; M1b BUILT** (globe `b73db97` + `447bd8f`, four gates green 4,372 pass / 0 fail; oracle `2e46883` on main, not deployed; header forwarding came with FR-D19 `6b4a081`; §15.16). **Next: M1c** on the VPS per `docs/HOSTING.md` (deploy the console change with it). PHASE 0 DONE — PRD §15 (grill H1–H17). Phase 0: row 12 gated and pushed with the row 11 clock-drift test fix `d1fdf22` (four gates green, 4,337 pass); VPS probed; long-stream first byte OK. System validation §15.13 found V1–V12: full env template (V2), Node 24 from NodeSource not apt (V4), 85 MB shards not the 950 MB cache (V5), `X-Oracle-Proxy-Key` for stamping (V6), **natgas ingest unscheduled on the VPS, so FR-N5 moves ahead of M3 and the gas route becomes `gas-storage`** (V7), cadence table + `ingest_log` hook (V8, V9), per-source grace (V10). Remaining work and revised next steps: §15.14 |

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
| R1  | Local host, one user, SaaS-shaped interface. No tenancy, billing or public deployment in v1. Free-tier and non-commercial sources are therefore legal; the swap list for a second user is `UPGRADE.md`. **Superseded 2026-09-23 by §15 (H1, H4):** hosted privately on the VPS for the founder plus an allowlist; tenancy and billing stay out. | Q1, Q8   |
| R2  | Every layer declares one **freshness class**: `live` (observation under 15 minutes old), `daily` (under 24 hours), `published` (older, including static reference datasets, whose "as of" is their vintage). All classes go on the map; none is hidden.                   | Q2       |
| R3  | Every observation carries its own timestamps: `observedAt` (when the thing happened or was measured), `validAt` (forecasts only), `publishedAt` (when the source released it), `fetchedAt` (when we read it). Cards show the observation time, never only the fetch time. | Q2       |
| R4  | Hover cards exist on **commodity layers only**. Upstream layers keep their click cards.                                                                                                                                                                                   | Q3       |
| R5  | **Hover is the quick look**: name, observation timestamp with age, headline number. **Click is the full card**, as today. Hover stays silent while a tool or the cockpit owns the pointer, the same rule click follows.                                                   | Q6       |
| R6  | The shared observation contract and hover service are built **before any further layer**, and rows 0a and 0b are retrofitted to it.                                                                                                                                       | Q5       |
| R7  | The globe is **physical only**. Oracle prices, risk indices and briefs appear on their own pages, never on the map. The one bridge is row 7: dated episodes exported once each as scene packs. **Superseded 2026-09-23 by §15 (H6):** oracle store numbers appear on the globe through read-only routes, labelled as the oracle's; signals, briefs and theses stay off the map. | Q7       |
| R8  | **This repo is the shell.** The Vite dev server proxies the console's pages under one origin; a shared navigation strip appears on every page. The console-side change (relative links plus the strip) gets its own ledger row in the oracle repo before anyone edits it. **Extended 2026-09-23 by §15 (H2):** the preview server carries the same proxy in production. | Q9       |
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

- Tenancy, billing, public (login-free) hosting. Recorded in `UPGRADE.md` for
  later. Private hosting behind one login is row 13 (§15).
- Oracle signals, briefs or trade theses on the globe page. Store readings
  may appear through the §15 routes (R7 superseded).
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
  60-second reload and 15-second log poll. Checked 2026-09-23: the only
  absolute page link that moves is `href="/"`; the fetches (`/ask`,
  `/logs.json`, `/trade`, `/grill`, `/trade_close`) stay path-preserved (§15.7).
- **Row 13 open items** are in §15.11 (long `/grill` streams through
  Cloudflare, VPS load during gated deploys, the licence pass before invitees).
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

### 12.11 Build notes (2026-09-21, milestones 0 to 6)

What was built matches §12.6 except where a probe said otherwise; each
deviation is recorded in the bundle manifest (`lng/source.json`) as well.

- **GEM input.** The form-gated xlsx was not on disk, so the build reads the
  LNG units of GEM's own public tracker-map feed
  (`publicgemdata.nyc3.cdn.digitaloceanspaces.com/interim_maps/ggit-lng_map_2025-11.geojson`,
  same September 2025 release, CC BY 4.0, 1,198 units). It has owner and
  parent but no Operator column, so non-US cards show owner and parent. The
  xlsx path is implemented and asserts the PRD's column names but is
  **unverified** until a file is placed at `.gev-cache/lng/gem-lng-terminals.xlsx`;
  the build then prefers it. Two operating units without a facility type
  (Klaipeda small-scale, Tangshan phase 2) are recorded and not drawn.
- **Counts.** GEM: 74 export (59 operating, 15 building) and 234 import (196,
  38) terminals in 74 countries; the EIA sheet has 39 train rows (the PRD said
  55; that was the sheet's row count including notes), 37 joined; Commonwealth
  LNG and Delfin are FID in EIA but proposed in GEM, so they have no marker
  yet. DOE: 1,868 vessel cargoes in Jul 2025 to Jun 2026 across 42 countries,
  220 terminal-to-country pairs, ten exit names (nine US plants plus DOE's
  "Altamira, Tamaulipas, MX", mapped to New Fortress's Altamira FLNG). GIIGNL:
  25 exporter columns × 47 markets, 293 cells, 427.9 MT, Sabine Pass has no
  operator field from the feed but 6 EIA trains at 27.0 Mtpa baseload.
- **Routes.** 470 pairs (218 DOE, 252 GIIGNL; the USA column of the matrix
  is not drawn a second time); 47 pairs use Bab el-Mandeb when open and draw
  the Cape variant; longest line 157 vertices. Two DOE pairs are unrouted and
  kept in the manifest: Altamira FLNG → Mexico (same port, no sea route) and
  cargoes to Bahamas and Israel, whose regas terminals GEM lists as neither
  operating nor under construction. `searoute-ts@2.3.0` runs offline under
  Node 24 (open question closed); a full rebuild routes in ~2 minutes and is
  byte-identical (`--check --no-route-cache` exit 0).
- **Via radius 40 km, not 25.** Measured over every lane: threaded passages
  sit 1 to 27 km from the PortWatch pin (Hormuz and Malacca 26.9 km, pinned
  mid-strait) and the nearest merely-passed pin is 45 km off (Mindoro), so
  25 km silently dropped Hormuz from every Qatar route.
- **Chips are session-only.** The options codec (`enabled+options`
  dispositions) can carry them, but adding an option owner touches the
  pinned codec tests; deferred, and the meta line says `chips session-only`.
- **`properties.observation`** on `registerEntityContext` is new with this
  layer; datacenters and ports pass flat records. Row 1 milestone 2 decides
  whether to adopt it.
- **Arcs are not ground-clamped entity polylines** (§12.6.2 item 13 said
  `clampToGround`). A probe with the real GPU showed the four ground-polyline
  batches (rings, DOE arrows, GIIGNL dashes, GIIGNL arrow tails) still not
  ready 30 s after activation: a clamped line of 20,000 km is a worker
  geometry job that never finished, and the rings queued behind it, so the
  first QA screenshots showed markers only. Plain entity polylines rendered
  but cost 118 MiB of heap against the 60 MiB gate. The arcs now live in one
  `PolylineCollection` (the §12.9 "one primitive per grade" fallback): the
  lane vertices are subdivided along the geodesic at 1° so no segment dips
  under the ellipsoid, the DOE grade takes the `PolylineArrow` material, the
  GIIGNL grade `PolylineDash` plus a three-vertex arrow tail, picking is by
  the collection id, and hover widens the line. Rings stay clamped.
- **Activation.** Subdividing 722 lines costs ~450 ms on this box, so the
  markers and rings are drawn in the activation tick and the arcs follow in
  chunks of 80 per macrotask (`getStats().arcsPending` reaches 0 within
  ~400 ms; the QA asserts it). Measured warm: 687 ms activation (380 ms bundle
  fetch, the rest entities) against the 900 ms gate; the first activation on
  a freshly started dev server measured 1,643 ms, dominated by the cold read
  of the 2.6 MB bundle. Heap +43 MiB against 60. 382 entities (308 markers,
  74 rings) and 722 polylines (470 lines, 252 GIIGNL arrow tails).
- **Activation gate split** (same day, same box as row 11's §13.10
  deviation). Against a fresh dev server the whole-activation number ranged
  666 ms to 2,420 ms across runs of the identical tree, and the swing was the
  dev server's read of the 2.6 MB bundle, not the layer. `scripts/qa-lng.mjs`
  now reads the four bundle fetches from `performance.getEntriesByType
  ('resource')` and gates the remainder at 900 ms, plus a 3,000 ms gate on
  the total including the fetch. The PRD's single 900 ms figure was written
  before the fetch variance was measured.
- **Cards.** "Ras Laffan" is `QatarEnergy LNG (N)` and `(S)` in GEM; the QA
  asserts the (N) card. Utilization prints 116.8 % for Sabine Pass because
  the window's MMcf exceeds baseload nameplate (peak is higher); labelled
  arithmetic, as specified.
- **EIA API terminal codes** (`crosswalk.json` `eiaApiTerminal`) are null
  until milestone 7, which needs the key path from row 4; the test asserts
  they are null by design rather than half-filled.
- **Render check.** No separate `.gev-logs/render-lng.mjs`; `scripts/qa-lng.mjs`
  takes the three-depth screenshots itself (`qa-shots/lng-global.png`,
  `lng-regional.png`, `lng-local.png`, `lng-dossier.png`) and asserts the
  card text at each depth through `getTerminalCard` / `getRouteCard`.
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

## 14. Row 12 PRD — Onshore production facilities: wells, leases and rigs, region by region (FR-G12)

Written 2026-09-21 from the founder's direction the same day: "build out the
same thing … for the on land rigs … this is more important than the wells on
the Gulf … go region by region … each region can have its own immense data
layer … lay out the entire plan first, do not build yet." Status: **PLAN.**
Nothing is built; ledger row 12 is CLAIMED for the plan only. Building starts
one region at a time on the founder's go, in the order of 14.5 unless the
founder reorders it. The reading of "on land rigs" here is onshore production
facilities — the wells and leases that produce, with drilling rigs and
completions as the activity signals around them — because that is the thread
row 11 started (real per-facility production, cards backed by filed numbers).

### 14.1 Summary

- A family of regional layers, `production-<region>`, one per producing basin
  cluster (14.5): Appalachia, Permian, Haynesville, Anadarko, Eagle Ford,
  Williston, Rockies, San Juan, Barnett, Alaska, California; then an
  international ladder. Each draws every producing facility in its basin from
  the state regulators' public bulk files — the well where the state reports
  per well, the lease where it reports per lease (Texas oil), the LUW in
  Louisiana, the PUN in Oklahoma — and gives each the card and balance sheet
  the Gulf platforms have (§13): this month against last month and last year,
  the trailing years, the lifetime.
- One onshore substrate, built once with the first region (milestone 0/1):
  the record shape extending row 11's, the location contract (id, datum,
  surface hole), the completeness rule per source, the level-of-detail
  contract for 10^4 to 10^5 facilities in one layer, the region bundle format
  (facility index plus history shards), the builder framework
  (`scripts/build-onshore.mjs --region <id>` with `--refresh`, `--replay`,
  `--check`), a shared QA harness.
- Two backdrops always on under the regions: EIA monthly production by state
  and by play, drawn on EIA's own play and basin polygons; the rig count by
  county (Baker Hughes, weekly). FracFocus completions of the last 90 days as
  the "new gas coming" marks.
- Every number on every surface is a filed number with its stamp (period,
  source, cadence, lag); regions never mix cadences silently (Pennsylvania's
  conventional wells are annual, Ohio's horizontals quarterly — the meta line
  says so).
- Regions are ranked in 14.5 by gas output × data quality × keyless-ness and
  built one at a time, each to its own ladder of gate-clean commits and its
  own QA script; `feat/commodities-shell` throughout (decision 2026-09-21).

### 14.2 Problem

- Row 11's Gulf platforms are ~2.6 Bcf/d. US gross withdrawals run ~125 Bcf/d
  (marketed ~115, dry ~105; EIA-914 / STEO, 2026-06). The founder's question —
  where the gas comes out of the ground, how much, changing how, by whom — is
  an onshore question: Appalachia ~36 Bcf/d, Permian ~26 (gross, most of it
  casinghead from oil wells), Haynesville ~16, Anadarko ~8, Eagle Ford ~7,
  the Rockies ~6, the Bakken ~3.6. (Magnitudes approximate here; the builders
  pin them from STEO Fig 43 and the state series.)
- Roughly 900,000 active wells in the United States; the globe shows none.
  The data is public and, for the big producers, monthly — but it sits with
  some twenty regulators under twenty schemas, three datums, four cadences and
  four reporting grains. The work is in the joins (production ↔ location),
  the datums, the cadences and the completeness rules, not in the drawing.
- What exists in the repo today is the substrate row 11 built for one region
  (§13): the completeness rule, the record shape, the tiers, the cards, the
  dossier chrome, the QA pattern and the activation gate. Row 12 generalises
  it rather than starting over.

### 14.3 Target user

The row 11 operator, asking onshore questions: "Haynesville this month —
which pads are up, which operators, against last year"; "what has the
Permian's gas done in twelve months, county by county"; "who is drilling where
right now" (rigs); "what comes on next" (completions). Descriptive, never a
signal (R11 of the shell PRD).

### 14.4 What the data actually is (probed 2026-09-21)

Five sweeps probed the sources live on 2026-09-21 (Texas and the Gulf Coast
states; the Mid-continent and Rockies; Appalachia and the Williston; the
national backdrop with Alaska and California; international). VERIFIED means
the URL answered and the payload or its listing was inspected; REPORTED means
read about, not fetched; UNVERIFIED means neither.

**Texas — Railroad Commission (RRC).** The bulk index
`https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/`
is keyless and free (VERIFIED). Production is the **PDQ Dump**
(`https://mft.rrc.texas.gov/link/1f5ddb8d-329a-4459-b7f8-177b4f5ee60d`): a
3.40 GB zip dated 2026-08-27 (VERIFIED listing), >25 GB uncompressed, sixteen
`}`-delimited `.dsv` tables with headers (schema in the 43-page PDQ Dump User
Manual, VERIFIED), monthly on the last Saturday, 1993 to current, keyed by
`OIL_GAS_CODE + DISTRICT_NO + LEASE_NO (+ GAS_WELL_NO)`: **oil is reported per
lease, gas per gas-well id**; total gas = `LEASE_GAS_PROD_VOL` (gas wells) +
`LEASE_CSGD_PROD_VOL` (casinghead from oil leases); no coordinates, no water,
no days produced. Locations are the **county well shapefiles**
(`https://mft.rrc.texas.gov/link/d551fb20-442e-4b67-84fa-ac3f23ecabb4`, 255
zips `well001`–`well499` by RRC county code, refreshed twice weekly, all dated
2026-09-21, 7.6 KB to 4.9 MB each, **NAD27** decimal degrees, API-keyed;
VERIFIED). The join: `OG_WELL_COMPLETION` gives `API_COUNTY_CODE` +
`API_UNIQUE_NO` per lease/well; prefix `42` to match the ten-digit API in the
shapefiles. Gotcha: `mft.rrc.texas.gov/link/…` pages are public but
JavaScript (GoAnywhere) — the underlying file endpoint must be captured once
from a browser. Scale (REPORTED): ~35 Bcf/d gross, ~250,000 producing wells
(~160,000 oil, ~90,000 gas). Public record, no formal licence.

**Louisiana — SONRIS.** Rebuilt in October 2025 as an Oracle APEX app
(`https://sonlite.dnr.state.la.us/ords/r/sonris_pub/sonris_public/home`,
VERIFIED 200, content JavaScript-rendered). Production is per **LUW**
(lease-unit-well code, one well or a unit) monthly (REPORTED); interactive
reports export CSV; no bulk link was found (UNVERIFIED). The DOTD mirror of
the wells (`https://maps.dotd.la.gov/ltrcserver/rest/services/LTRC_18_3GT/SONRIS/MapServer`)
is keyless GeoJSON but frozen at April 2018 (VERIFIED, stale). Scale
(REPORTED): ~10 Bcf/d, ~20,000 active wells, Haynesville dominant.

**Arkansas.** The AOGC site 403s and `aogc2` is dead DNS; the state GIS
office's wells layer (30,593 points, lat/lon, `TYPE`/`STATUS`/`PRODUCTION`
flags, metadata 2017 with a 2026-03 data update REPORTED) is the keyless
location path (VERIFIED metadata); production only as per-well XLS exports
(REPORTED). ~1 Bcf/d, Fayetteville declining.

**Mississippi, Alabama.** JavaScript apps, PDF production books, per-well
pages, no bulk export (VERIFIED as such). Minor gas (~0.1 and ~0.25 Bcf/d).

**North Dakota — DMR Oil & Gas Division.** The **Monthly Production Report**
per-well workbook `https://www.dmr.nd.gov/oilgas/mpr/YYYY_MM.xlsx` (2026-06
VERIFIED: 3.1 MB, sheet "Oil" 22,479 well × pool rows; columns `ReportDate`,
`API_WELLNO`, `FileNo`, `Company`, `WellName`, `County`, `FieldName`, `Pool`,
`Oil`, `Wtr`, `Days`, `Runs`, `Gas`, `GasSold`, `Flared`, **`Lat`, `Long`**),
released about 45 days after month end; index `mprindex.asp` 2003–2026;
Excel withheld for amended months (PDF canonical); confidential wells absent.
The DMR ArcGIS wells service is **token-gated** (499; VERIFIED). No licence,
state disclaimer. ~20,000 producing wells, ~3.5 Bcf/d, ~1.2 MMbbl/d.
The cleanest single source found anywhere: one keyless file, coordinates and
flaring inline, no join.

**Pennsylvania — DEP.** Production report extracts
(`https://greenport.pa.gov/ReportExtracts/OG/OilGasWellProdReport`, keyless
HTML form with CSV export, VERIFIED): **unconventional wells monthly, newest
Jul 2026** (~1.5–2 month lag); conventional wells **annual** (2025); history to
1980; at most 13 periods per pull unless filtered by operator or permit
(one request per period). Coordinates in the extract REPORTED; the sure join
is `WELL_PERMIT_NUM` → PASDA "Oil Gas Locations – Conventional Unconventional"
(monthly stamp `…2026_09.{zip,geojson,kmz}`, VERIFIED links). ~12–13,000
producing unconventional, ~30,000 conventional reporters, ~20–21 Bcf/d.

**West Virginia — DEP.** Annual per-well production 1985–2025 (`2025Production.xlsx`,
VERIFIED link) and **H6A horizontal-well quarterly files, cumulative from Q1
within each year** (newest 2026 Q1, VERIFIED pattern; difference the
quarters); no coordinates (join API to the Well Location ZIP / Open Data
Hub). ~2,500 horizontal + ~15,000 conventional, ~9 Bcf/d.

**Ohio — ODNR.** Statewide wells shapefile refreshed every Saturday
(`https://gis.ohiodnr.gov/geodata/Statewide/OGWells_statewide.zip`, VERIFIED
via the ArcGIS item; 267k+ wells since 1860). Production: horizontals
**quarterly**, verticals annual (Q1 2026 statewide 511 Bcf/quarter REPORTED)
— the download URL is **unverified** after a site restructure (every
`ohiodnr.gov` content page 404s to a fetcher). ~4,000 horizontal + ~40,000
conventional, ~6 Bcf/d.

**New York, Virginia, Kentucky, Michigan.** NY: Socrata wells with surface
lat/lon (VERIFIED metadata) and annual production zips released ~July 1 after a
six-month confidentiality (2025 posted 2026-07-01). VA: ASP.NET postback-only,
State Plane VA South feet. KY: a first-rate monthly well shapefile with explicit
redistribution rights (162,157 records, VERIFIED page) but production only per
search page. MI: 403 / JavaScript. All ≤ 0.2 Bcf/d — location-only layers.

**New Mexico — OCD.** Wells on ArcGIS REST
(`https://gis.emnrd.nm.gov/arcgis/rest/services/OCDView/Wells_Public/FeatureServer/0`,
keyless; 142,132 wells, 54,284 active — 25,274 gas, 24,948 oil, 2,621
injection; lat/lon **NAD83**; spud, TVD/MD, pools, last production date;
paginate at 6,000; VERIFIED counts). Production: the OCD anonymous FTP
(`ftp://164.64.106.6/Public/OCD/OCD Interface v1.1/`, the hostname shown only
as an image on the OCD page) — `volumes/wcproduction/wcproduction.zip`
(**971 MB** XML dataset, `T_WC_VOL` = C-115 monthly volumes per well
completion, files dated 2026-09-18/19, nightly refresh with a 45-day lag;
VERIFIED listing) and `core/wellhistory/wellhistory.zip` (44 MB). C-115B
venting and flaring per well-month sits on REST too. Gross withdrawals 2025
≈ 11.4 Bcf/d (EIA) — the Delaware core and the San Juan. Hub disclaimer, no
licence text.

**Oklahoma — OCC / OTC.** Wells:
`https://oklahoma.gov/content/dam/ok/en/occ/documents/og/ogdatafiles/rbdms-wells.csv`
(keyless, nightly, 126.9 MB, 456,782 rows, 129,507 active — 68,996 oil,
43,103 gas — `SH_LAT`/`SH_LON`, datum unstated; VERIFIED download) plus the
completions workbook (spud, formation). **Production is not mappable
keylessly:** OTC gross production is keyed by PUN inside the session-bound
OkTAP app — no bulk file, bulk history only by a request form to OTC — the
RBDMS file carries no PUN and no public PUN ↔ API crosswalk exists (vendors
sell it). ≈ 7.9 Bcf/d.

**Kansas — KGS.** `https://www.kgs.ku.edu/PRS/Ora_Archive/ks_wells.zip`
(44 MB → 205 MB CSV, 519,568 wells, **NAD27**, updated 2026-09-11) and the
lease masters with monthly **lease** production (`gas_leases_2020_present.zip`
9.7 MB → 1.2 M rows; newest May 2026, ~3.5-month lag; wells and volume only —
no water, no days; VERIFIED). Pre-1987 monthly history is IHS-licensed, no
redistribution. ≈ 0.34 Bcf/d, Hugoton declining.

**Colorado — ECMC.** `https://ecmc.state.co.us/documents/data/downloads/gis/WELLS_SHP.ZIP`
(15.8 MB, daily, **NAD83 UTM 13N**, all statuses; VERIFIED; the site wants a
browser User-Agent) and yearly production CSVs keyed by **receipt year**
(`…/production/2025_prod_reports.zip` 13.6 MB → 157 MB, 759,328
well-formation-month rows with days, gas, gas sales, flared/vented, water;
no 2026 file yet, so the bulk lags 9–20 months and the current months exist
only on COGIS web pages; VERIFIED). Metadata "no restrictions". ≈ 5.1 Bcf/d
(DJ, Piceance).

**Wyoming — WOGCC.** No verified keyless bulk: the Data Explorer is 404, the
legacy ColdFusion site (`pipeline.wyo.gov`) is alive with per-well pages but
no download menu was found, and WSGS's REST layer 12 is a raw well-header
snapshot of 2025-01-03 (207,791 records; VERIFIED count). ≈ 3.3 Bcf/d
(Pinedale/Jonah, Powder River). A browser session or a drop (R12.8).

**Utah — DOGM.** `https://oilgas.ogm.utah.gov/pub/Database/Wells.zip`
(2.3 MB, daily, 40,387 wells, 11,913 producing — 6,422 gas, 5,486 oil; 6,154
on federal leases; **NAD83**; first production, horizontal flag, lease type)
and `Production2025To2029.zip` (3 MB → 36 MB; per-well-formation monthly
days, oil, gas, water; **newest 08/2026**, ~1–1.5-month lag; sibling zips
back to 1984; VERIFIED). The cleanest of the seven. ≈ 0.93 Bcf/d (Uinta).

**Montana — MBOGC.** Wells shapefile (`Wells.zip` 4.3 MB, 2026-09-17,
VERIFIED) and a query-only Data Miner with CSV export per query — no bulk
production dump. ≈ 0.14 Bcf/d.

**Alaska — AOGCC.** Data Miner 4 (`http://aogweb.state.ak.us/DataMiner4/Forms/Production.aspx`,
VERIFIED 200, plain http) answers well × month oil, gas and water per query
with DataTables exports; the bulk page is DataDome-blocked (403). EIA's dnav
carries Alaska gross withdrawals, repressuring and marketed production — the
North Slope reinjects most of its gas. ~0.9 Bcf/d marketed.

**California — CalGEM.** WellSTAR wells on ArcGIS REST and data.ca.gov
(CC-BY, VERIFIED); the monthly per-well production bulk page is gone (404) and
no bulk file was found (UNVERIFIED). Oil-heavy; ~0.4 Bcf/d.

**National backdrop (all VERIFIED unless noted).** EIA API v2
`natural-gas/prod/sum` (series `N9010{ST}2` gross, `N9050{ST}2` marketed,
`N9070{ST}2` dry) and `petroleum/crd/crpdn` (`MCRFP{ST}2` kb/d): monthly,
newest 2026-06 released 2026-08-31 (~2-month lag), `Access-Control-Allow-Origin:
*`, `DEMO_KEY` works with a burst limit of 10 — register a free key for
anything scheduled. Keyless dnav XLS (`NG_PROD_SUM_DC_NUS_MMCF_M.xls` 88 KB,
`PET_CRD_CRPDN_ADC_MBBL_M.xls` 225 KB; no CORS header, read at build time).
Play production: the Drilling Productivity Report is **frozen** (`dpr-data.xlsx`
last modified 2024-05-13; standalone ended May 2024) — the current play and
region series are the STEO figure workbooks `Fig43.xlsx` (dry shale gas by
play, 97 KB, 2026-09-08), `Fig42.xlsx` (tight oil by play), `Fig44/45.xlsx`
(gas and crude by the seven former DPR regions), keyed by sheet title because
figure numbers shift between editions. Polygons: EIA ArcGIS
`TightOil_ShaleGas_Plays_Lower48_EIA/FeatureServer/0` (50 plays, geoJSON, CORS,
one query) and `SedimentaryBasins_US_EIA/FeatureServer/109` (JSON only), plus
per-play boundary services of 2015–2018 vintage. Rigs: Baker Hughes weekly
state/basin/county workbooks are free with attribution but **bot-protected**
(403 to non-browsers; REPORTED contents) — a browser-saved weekly drop.
FracFocus bulk: `https://www.fracfocusdata.org/digitaldownload/FracFocusCSV.zip`
441 MB, rebuilt daily (2026-09-21), per-disclosure lat/lon with a `Projection`
column (REPORTED fields), terms "may not be altered" — display as filed, link
back, publish no derived layer. ONRR OGOR-B federal and Indian production:
monthly by state/county (not lease), CC0 (catalog VERIFIED). USGS "Aggregated
Oil & Gas Drilling and Production History" v1.1: 1-mile well-count and 2-mile
production grids, public domain, frozen at 2022-09 (VERIFIED) — the only
licence-clean national "where wells exist" backdrop; HIFLD's wells layer is
gone from its portal (2025-08).

**International (for the later ladder).** Canada: Petrinex public monthly
volumetric extracts for Alberta and Saskatchewan
(`https://www.petrinex.gov.ab.ca/publicdata/API/Files/{AB|SK}/Vol/{YYYY-MM}/CSV`,
keyless GET, zip-in-zip CSV; SK 2026-06 = 39,718 wells; VERIFIED) with UWIs
but no coordinates — join AER **ST37** (GeoDB 1.23 GB / SHP 532 MB, monthly;
VERIFIED page) — under Crown copyright that allows non-commercial use with
attribution and asks commercial users to "arrange first"; BC Energy Regulator
per-well monthly `https://iris.bcogc.ca/download/prod_csv.zip` (123 MB,
2026-09-01) + well index + a keyless surface-hole ArcGIS layer (VERIFIED).
Argentina: Secretaría de Energía per-well monthly production (CC-BY-4.0,
keyless, HTTP-only host, 200–330 MB yearly CSVs, rows through 2026-05) and a
well-location CSV/SHP already in WGS84 with the same `idpozo` (VERIFIED) — the
cleanest open package outside the US. Colombia: ANH field-month crude and gas
on Socrata with inline lat/lon, CC BY-SA, tiny (VERIFIED). Brazil: ANP per-well
monthly (mostly offshore; gov.br WAF; 2024+ only via an APEX export) with a
coordinate master (VERIFIED header). Mexico: portals down or blocked. Norway
(Sodir field-month, 2026-06) and the UK (NSTA PPRS polygons, layer 6, 2026-06)
are offshore field-level, VERIFIED. Australia: no open per-well set (QLD
aggregates; SA and NL are single-page apps). Not public anywhere: Russia, the
Gulf states, China, most of Africa — GEM's Global Oil & Gas Extraction Tracker
(6,481 active areas, CC BY 4.0, form-gated) is the field-level substitute.

### 14.5 The regions — the sector split

One layer per region; each region is one ladder (14.10). States feed more
than one region (Texas five, New Mexico two, Louisiana two, Oklahoma two):
one reader per state, sliced by district, county or basin into the regions'
bundles.

| # | Layer id | Basins / plays | States → sources (grain, cadence) | Facilities (approx.) | Gas (approx.) | First slice | Why this rank |
|---|---|---|---|---|---|---|---|
| 1 | `production-williston` | Bakken, Three Forks | ND MPR (well × pool, monthly, lat/long inline); MT wells shapefile + Data Miner per query | ~20,000 ND | ~3.6 Bcf/d, ~1.2 MMbbl/d | ND | The one verified end-to-end file: the substrate's first customer, proves 10^4 facilities before 10^5 |
| 2 | `production-appalachia` | Marcellus, Utica | PA extracts (well: unconventional monthly Jul 2026, conventional annual) + PASDA locations; OH weekly wells ZIP + quarterly horizontals (URL to confirm); WV annual + H6A quarterly; NY annual | PA ~13,000 unconventional + ~30,000 conventional; OH ~4,000 + ~40,000; WV ~2,500 + ~15,000 | ~36 Bcf/d | PA unconventional | The largest gas region on earth, keyless monthly CSV for the wells that matter |
| 3 | `production-permian` | Delaware, Midland, Central Basin Platform | TX PDQ districts 8, 8A, 7C (lease/gas-well, monthly) + county shapefiles; NM OCD REST wells (NAD83) + FTP C-115 monthly per completion (971 MB, 45-day lag) | TX ~90,000; NM ~54,000 active statewide (Lea, Eddy the core) | ~26 Bcf/d gross, ~6.5 MMbbl/d | TX districts 8/8A/7C (Reeves, Loving, Midland, Martin first), then NM Lea/Eddy | Biggest oil basin, second gas; the Texas reader built here serves rows 4, 5, 7 and 9 of this table; NM is fully keyless |
| 4 | `production-haynesville` | Haynesville, Bossier | TX PDQ districts 5, 6 (Harrison, Panola, San Augustine, Shelby); LA SONRIS LUW (unverified export) | TX ~5,000 gas wells in the play; LA ~6,000 | ~16 Bcf/d | TX side | Pure gas; the LA half waits on the SONRIS export URL (O4) |
| 5 | `production-eagle-ford` | Eagle Ford, Austin Chalk, Gulf Coast onshore | TX PDQ districts 1–4; south LA onshore; MS, AL | TX ~40,000 | ~7 Bcf/d, ~1.1 MMbbl/d | TX districts 1–4 | Same reader, third slice |
| 6 | `production-rockies` | DJ-Niobrara, Piceance, Green River (Pinedale, Jonah), Powder River, Uinta | UT DOGM per-well monthly through 08/2026 (daily files); CO ECMC daily wells + receipt-year production CSVs (bulk lags 9–20 months; current months on web pages only); WY no verified bulk (2025-01 header snapshot; drop); MT per query | UT 11,913 producing; CO ~35,000; WY ~25,000 | ~9.4 Bcf/d gross 2025 (CO 5.1, WY 3.3, UT 0.9, MT 0.1) | UT, then CO | Two verified keyless states carry most of it; WY waits on a bulk path |
| 7 | `production-anadarko` | Anadarko, SCOOP/STACK, Arkoma, Granite Wash, Hugoton, Fayetteville | OK OCC wells CSV (129,507 active, keyless) but OK volumes PUN-locked in OkTAP (request/drop, no public crosswalk); KS KGS lease monthly (May 2026); TX PDQ district 10; AR GIS wells + XLS production | OK ~129,000 active; KS ~130,000 (mostly stripper) | ~8.3 Bcf/d gross 2025 (OK 7.9, KS 0.3) + AR ~1 | OK wells as locations with the EIA state series; TX 10 and KS leases with volumes; OK volumes when a drop exists | The largest gas state here has no keyless production path — locations first, volumes by request |
| 8 | `production-san-juan` | San Juan, Raton (CBM) | NM OCD (San Juan, Rio Arriba); CO ECMC (La Plata, Las Animas) | ~20,000 | ~2.5 Bcf/d, declining | NM | Small ladder on the NM and CO readers from rows 3 and 7 |
| 9 | `production-barnett` | Barnett / Fort Worth Basin | TX PDQ districts 5, 7B, 9 | ~15,000 | ~2 Bcf/d | TX | Same reader, a week's ladder |
| 10 | `production-alaska` | North Slope, Cook Inlet | AOGCC Data Miner (well × month, per query; bulk blocked) | ~3,000 | ~0.9 Bcf/d marketed (gross ~9, reinjected) | Cook Inlet + North Slope gross vs marketed | Gas is mostly reinjected; the gross/marketed story is the point |
| 11 | `production-california` | San Joaquin, Los Angeles basins | CalGEM WellSTAR locations (CC-BY); production bulk unverified | ~30,000 | ~0.4 Bcf/d | locations + EIA state series | Oil basin; last of the US ladders |
| — | location-only | NY, VA, KY, MI, AR, MS, AL | wells layers where keyless (NY Socrata, KY shapefile, AR GIS) | — | ≤ 0.2 Bcf/d each | — | Folded into their regions' late milestones as "wells exist here" marks with annual or no production |

Backdrops (built once, milestone 9; drawn under every region): the EIA play
polygons carrying STEO Fig 43 dry gas by play and Fig 42 tight oil, the state
series (API v2 with a free key; dnav XLS fallback), the county rig count, the
90-day FracFocus completions, the USGS 2022 well-density grid as the "wells
exist here" wash where no region is loaded.

International ladder (after the US regions; separate claims when reached):
Canada WCSB (Montney, Duvernay, Deep Basin — Petrinex per-well monthly for
AB/SK, BCER for BC; coordinates via ST37 and BC's surface-hole layer; the
Crown-copyright non-commercial clause settled first), Argentina Neuquén /
Vaca Muerta (per-well monthly + WGS84 locations, CC-BY-4.0), Colombia
(field-level, Socrata); then an offshore field-level companion to row 11
(Norway Sodir, UK NSTA, Brazil ANP); GEM GOGET as the world wash.

### 14.6 Goals (verifiable)

- **G1 Reconciliation.** Each region's current-month gas total is compared,
  on the panel line and in every dossier's Sources section, with the EIA
  series for the same month (state marketed / gross, play dry gas); the gap
  is printed with its reason (gross at the wellhead vs marketed; annual
  reporters excluded; confidential wells) and a committed check per region
  asserts it stays inside the tolerance the region's builder records.
- **G2 Fidelity.** Every number on a mark, card or dossier is a filed number
  or a stated derivation (rate = volume ÷ days) with its stamp: period,
  source, cadence class, lag. Nothing interpolated; a month not filed is a
  gap.
- **G3 Bytes.** `npm run build:onshore -- --region <id> --check` reproduces
  the committed bundle bytes from `.gev-cache/onshore/`; the region index
  ≤ 3 MB gzip; a history shard ≤ 64 KB gzip; committed data per region
  ≤ 12 MB gzip unless O1 moves shards out of git.
- **G4 Performance.** Layer activation ≤ 900 ms apart from the bundle fetch
  (the row 11 split), heap growth ≤ 150 MiB, frame time ≤ 16 ms at the local
  tier with 20,000 points in view, far side culled — measured by the region's
  QA on a fresh dev server.
- **G5 Coverage.** The panel's producing count equals the bundle's equals
  the source's current-month rows, less the classes the meta line names
  (confidential, unplaced, out of region, annual reporters).
- **G6 Keyless and open.** Every source is a public file read at build time;
  each is in `DATA_SOURCES.md` and the credits with its licence in
  `source.json`; FracFocus is displayed as filed and linked, never altered;
  Baker Hughes attributed; Petrinex's commercial clause resolved before any
  Canadian bundle ships.

### 14.7 Requirements (numbered R12.n)

Substrate (milestone 0, shared by every region):

- **R12.1 Facility grain and identity.** A facility is the finest unit its
  source reports production for: a well (API-10/14, NDIC file number, PA
  permit number, UWI), a lease (Texas oil: district + lease number), a gas
  well id (Texas gas), a LUW (Louisiana), a PUN (Oklahoma, mapped to wells
  where the completion list allows, else drawn at the unit). Pads are a
  display grouping (surface holes within 50 m under one operator), never a
  reporting unit; leases and units aggregate their wells in the dossier.
- **R12.2 Location contract.** Surface-hole latitude/longitude converted to
  WGS84 at build with a real transform (NAD27 → WGS84 moves tens of metres in
  Texas; State Plane feet in Virginia; UTM in Arkansas and Louisiana; datum
  unstated in North Dakota and Pennsylvania — assumed NAD83 and checked
  against imagery); bottom hole and lateral where published, drawn at the
  local tier; the datum and transform recorded per source in `source.json`;
  a QA check places ten known pads per region on their imagery.
- **R12.3 Production contract.** Monthly gas (Mcf), oil (bbl), water (bbl)
  and days produced where filed; rates per calendar day and per producing
  day both carried; row 11's completeness rule (rolling median with a floor
  guard) with a per-source lookback chooses the current month per region;
  annual and quarterly reporters contribute to lifetime and annual views and
  are stamped by cadence — never folded into a monthly total silently;
  cumulative quarterly files (WV H6A) differenced at build.
- **R12.4 One record shape.** Extends row 11's (`current`, `prior`,
  `lastYear`, `yoy`, `rank`, `declineFromPeakPct`, `observation`) with `grain`
  (well/lease/unit), `kind` (horizontal/vertical/directional), `lateralFt`,
  `formation`/`pool`, `firstProduction`, `status`, `pad`, `lease`/`unit`,
  `operatorRank`, `cadence`, `flared` where filed (ND). Marks, cards, dossier,
  panel line and analyst records all read this one shape (§13's rule).
- **R12.5 Level-of-detail contract.** Global tier: one mark per region
  (producing count, gas, yoy) on the EIA play silhouette. Regional tier
  (< 2,500 km): county or field clusters — count and gas per month, sized and
  coloured like row 11, ≤ 2,000 marks, the row 11 horizon pass at cluster
  level. Local tier (< 300 km): pads, then wells, as a
  `PointPrimitiveCollection` — not the Entity API, which row 11 measured at
  ~0.45 ms per entity (100,000 entities would be 45 s) — labels for the top N
  in view, hover card for any point, click → dossier; ≤ 20,000 points in
  view by clipping to the viewport rectangle; laterals as polylines at
  < 30 km.
- **R12.6 Bundles.** Per region: `index.json` (facilities: location,
  identity, current reading, yoy, rank; ≤ 3 MB gzip), `clusters.json`
  (county/field aggregates, 120 months), `history/<shard>.json` (256 shards by
  id hash; 120-month series for the shard's facilities; fetched on demand
  when a dossier opens), `source.json` (files, sha256, rows, fetched,
  licence, completeness table, transforms). Index and clusters under
  `src/data/local_data/onshore/<region>/` as today; shards under
  `public/data/onshore/<region>/history/` (copied verbatim, dynamic paths)
  — or out of git per O1.
- **R12.7 Builders.** `scripts/build-onshore.mjs --region <id>` runs the
  state readers `scripts/onshore/<state>.mjs` a region needs (each downloads
  or replays from `.gev-cache/onshore/<state>/`, stream-parses, emits a
  normalised facility-month table and a location table), then assembles
  (join, transform datums, completeness, clusters, shards, manifest);
  `--check` reproduces bytes, `--refresh` pulls the newest files, `--replay`
  reads the cache only. No reader loads a file over 200 MB into memory; the
  Texas reader streams the 3.4 GB PDQ zip entry by entry with row 11's
  `scripts/zip-entry.mjs`, keeping the trailing 120 cycle months for the
  region's districts.
- **R12.8 Browser-blocked sources.** Baker Hughes, AOGCC bulk, Michigan,
  Mexico and any GoAnywhere endpoint that moves: a `drops/` convention — a
  browser-saved file with URL, date and sha256 recorded in `source.json`;
  the builder refuses to run a source without a fresh drop and the panel line
  dates it ("RIGS AS OF 2026-09-12").
- **R12.9 Backdrops.** EIA state series through API v2 with a registered free
  key at build time (`DEMO_KEY` is for probes), dnav XLS as the fallback;
  play and region series from the STEO workbooks keyed by sheet title; play
  and basin polygons from the two EIA ArcGIS services; the county rig count
  from the weekly drop; FracFocus jobs of the last 90 days as small marks
  (as filed, linked); the USGS grid as a static wash. Each backdrop is its
  own row control with its own stamp.
- **R12.10 Cards and dossier.** Row 11's chrome (`src/layers/commodities/dossierChrome.js`)
  and model pattern: tiles (gas with yoy, oil with BOE, wells or days,
  depth or lateral), the ten-year chart with one point per filed month, the
  this-month ledger against the prior month and last year, identity,
  lifetime, sources with the reconciliation line, prev / fly / zoom out /
  next; pad, lease and unit dossiers aggregate their facilities and list
  them.
- **R12.11 Panel.** One row per region in the Commodities group with its own
  token; meta line `12,431 PRODUCING · 21.4 BCF/D · AS OF 2026-07 ·
  UNCONVENTIONAL MONTHLY · CONVENTIONAL 2025 · AUG 38 % REPORTED · EIA
  MARCELLUS 27.9 BCF/D`; legend by yoy class as row 11.
- **R12.12 QA per region.** `scripts/qa-onshore-<region>.mjs` from a shared
  harness: counts equal the bundle, far side zero, tiers switch, hover and
  click resolve the top facility, dossier opens with one point per filed
  month, activation split gate, heap, frame time, reconciliation, no page
  errors; screenshots at three tiers.
- **R12.13 Attribution and licence.** `DATA_SOURCES.md` and `dataCredits.js`
  entries per source; licence text and any clause (FracFocus, Baker Hughes,
  Petrinex) in `source.json` and honoured in the UI.
- **R12.14 Invariants inherited.** Keyless first (R12 of the shell PRD),
  descriptive never signals (R11), the observation contract stamps on every
  surface, `feat/commodities-shell`, ledger claim before code, four gates per
  commit, count pins, format scope, package boundaries (portable modules
  never touch browser globals — `lookback`, not `window`).

### 14.8 Non-goals

- Paid data (Enverus, S&P, Wood Mackenzie, Rextag) and rig-level rig
  locations (paid at Baker Hughes) — county counts only.
- Real-time or SCADA readings; forecasts, type curves, decline modelling,
  EUR — descriptive only.
- Gathering and pipeline connections (row 4), processing plants (row 5),
  emissions and satellite flaring (a later overlay), permits and DUC counts
  beyond what FracFocus shows.
- A national "every well at once" layer — the region is the unit, the
  backdrop is the whole.
- International regions inside this row — they are the ladder after the US
  regions, each with its own claim.

### 14.9 Constraints and invariants

- §13.8 applies unchanged: keyless-first, build-time reads, descriptive
  never signals, observation stamps, one worktree (`~/commodities-shell` on
  `feat/commodities-shell`), ledger claim before code, four gates, the
  activation gate split (layer apart from the bundle fetch; cold total
  3,000 ms), count pins, format scope, package boundaries.
- No region bundle exceeds G3 before O1 is settled; every reader streams;
  no more than 2,000 entities per layer — the rest are primitives.
- Regions never alter a filed number; a month not filed is a gap; cadences
  never mix silently.
- Texas is one reader sliced by district into five regions — never five
  copies of the PDQ pipeline.

### 14.10 Milestones (smallest shippable first; each region its own ladder)

Each region ladder is four commits, gate-clean: **a** bundle + reconciliation
(reader, assembler, `--check`, tests); **b** marks, tiers, panel, QA;
**c** cards, dossier, history shards; **d** ledger, docs, credits.

0. **Substrate** — `src/layers/onshore/{records,completeness,lod,shards,model}.js`,
   `scripts/build-onshore.mjs`, `scripts/onshore/` reader contract, the QA
   harness. Verify: unit tests; a synthetic 100,000-facility bundle renders
   at the local tier inside G4 on a fresh server. Lands with milestone 1.
   BUILT 2026-09-21 with milestone 1 (`c4ec135`, `f66463a`) as
   `src/layers/onshore/{records,shards,model,bundledSource,dossier,index}.js`
   — row 11's completeness module is reused as is, and the level-of-detail
   rules live in `model.js` (§14.13); the synthetic 100,000-well bundle is
   normalised in `records.test.mjs` under the budget, and the local tier is
   measured on the real 24,154 wells by the QA.
1. **Williston (ND).** Verify: `npm run build:onshore -- --region williston
   --check` reproduces bytes from the archived `2026_06.xlsx` (and the
   trailing 120 months); the well count and gas equal the workbook's; the
   panel line reconciles with EIA North Dakota marketed production; QA green.
   BUILT 2026-09-21 — `c4ec135` (bundle, 2026-07 newest), `f66463a` (layer,
   dossier, QA 32 checks green twice on a fresh 4174), `836c325` (the re-enable
   fix), docs in the commit carrying this line. Reconciled against EIA gross
   and marketed (94 % / 100 % for 2026-06), not marketed alone (§14.13).
2. **Appalachia (PA unconventional first).** Verify: monthly extract for the
   newest period reproduced; unconventional count and gas equal the extract;
   reconciliation with EIA Pennsylvania and STEO Marcellus; OH and WV added as
   their download URLs are confirmed (O5) and stamped by cadence.
3. **Permian (TX districts 8/8A/7C).** Verify: the Texas reader streams the
   PDQ zip and keeps only the cycle rows for the districts; gas = gas-well +
   casinghead; leases drawn at the lease centroid with wells listed; NAD27
   transform checked on ten pads; reconciliation with EIA Texas and STEO
   Permian. The NM reader (REST wells + the FTP C-115 volumes, streamed) is
   the ladder's second bundle commit; reconciliation with EIA New Mexico.
4. **Haynesville (TX districts 5/6).** Verify as 3; LA joins when the SONRIS
   export is confirmed in a browser session (O4).
5. **Eagle Ford / Gulf Coast (TX districts 1–4).** Verify as 3.
6. **Rockies (UT, CO, then WY, MT).** Verify per state as 1 (Utah's three
   daily files first; Colorado's receipt-year files with the lag stated on
   the meta line); reconciliation with EIA and STEO Niobrara.
7. **Anadarko / Mid-continent (OK, KS, TX 10, AR).** Verify: Oklahoma wells
   drawn from the OCC file with the EIA state series as their only volume
   until an OTC drop exists (O6), and the meta line says so; Kansas leases
   and TX district 10 with volumes; reconciliation with STEO Anadarko.
8. **San Juan (NM, CO) and Barnett (TX 5/7B/9).** Small ladders on the
   existing readers.
9. **Backdrops.** EIA play/state series and polygons, rigs drop, FracFocus,
   USGS wash. Verify: play polygons carry the STEO month; the rig drop's date
   on the panel; FracFocus marks link to their disclosure.
10. **Alaska and California; location-only states.**
11. **International ladder** — Canada, Argentina, Colombia (per-well/field
    monthly), then the offshore field-level companion (Norway, UK, Brazil),
    then GEM GOGET as the world wash. Each claims its own ledger line.

Before milestone 1 starts, the founder settles O1 (where shards live) and
confirms the order above or reorders it.

### 14.11 Risks and open questions

- **O1 Repository weight (decide before milestone 1).** Twelve regions × up
  to 12 MB gzip of history shards, refreshed monthly, would add ~1 GB a year
  to `.git` (97 MB today; 16 MB of bundled data). Options: (a) commit index
  and clusters only (≤ 3 MB gzip per region) and build shards at deploy from
  the `.gev-cache` archives, reproducible by `--check`, the dossier degrading
  to index-only when shards are absent; (b) an orphan `data` branch; (c) Git
  LFS; (d) object storage with a manifest. Recommendation: (a).
- **O2 Licences.** FracFocus "may not be altered" (display as filed); Baker
  Hughes free with attribution (REPORTED — confirm the terms page from a
  browser); Petrinex Crown copyright non-commercial (settle before Canada).
- **O3 Texas automation.** The `mft.rrc.texas.gov/link/…` pages are
  JavaScript; the file endpoint is captured once from a browser and recorded;
  if it rotates monthly the drop convention (R12.8) applies.
- **O4 Louisiana.** SONRIS is an APEX app since 2025-10; no bulk LUW export
  verified; half of Haynesville waits on it.
- **O5 Ohio and West Virginia.** Ohio's production download URL unverified
  after the site restructure; WV's quarterly files are cumulative.
- **O6 Oklahoma volumes.** OTC gross production is PUN-keyed inside a
  session-bound app with no bulk file; bulk history only by a request form;
  no public PUN ↔ API crosswalk. Oklahoma enters as locations with the EIA
  state series, and its volumes only through a requested extract handled as
  a drop (R12.8). Kansas is lease-grain with a 3.5-month lag and an IHS
  clause on pre-1987 history.
- **O7 Datums.** NAD27 Texas shapefiles, State Plane Virginia, UTM Arkansas /
  Louisiana, unstated ND/PA/NY; proj4 at build; the ten-pad imagery check.
- **O8 Reconciliation tolerance.** State filings are gross at the wellhead;
  EIA marketed excludes reinjection, vented and flared; expect structural
  gaps of −10 to −20 % in some states — recorded per region, never hidden.
- **O9 Per-period exports** (PA 13-period cap, AK and KY per query): one
  polite request per period, cached; never scripted against a login.
- **O10 Confidential and tight-hole wells** (ND, TX, PA): absent from the
  files, counted on the meta line as "not filed".
- **Risk — the local tier at 20,000 points with labels and hover**: budget by
  measurement in milestone 0 (a synthetic bundle), not by hope; the Entity
  API is out for wells.
- **Risk — the Texas PDQ dump** (3.4 GB monthly): a one-time monthly pull
  archived in `.gev-cache/onshore/tx/`; the reader keeps ~1 % of it.

### 14.12 Bootstrap from a fresh Claude Code session

```text
cd ~/commodities-shell && git branch --show-current   # feat/commodities-shell
git pull --ff-only
git status --porcelain                # another session may hold uncommitted docs; never stage what is not yours
npm run doctor
npx vite --port 4174 --strictPort --host 127.0.0.1   # a fresh server for timing gates
claude
```

Prompt: "Row 12, milestones 0 and 1 (PRD §14): build the onshore substrate
`src/layers/onshore/` and `scripts/build-onshore.mjs` with the North Dakota
reader, from `https://www.dmr.nd.gov/oilgas/mpr/YYYY_MM.xlsx` archived in
`.gev-cache/onshore/nd/` (trailing 120 months; re-download if absent); the
completeness rule picks the current month; reconcile with EIA North Dakota;
the index bundle under 3 MB gzipped; shards per O1's decision. Gates in
order; commit on `feat/commodities-shell`, guarded by `git branch
--show-current`; push origin and mirror; ledger row 12 milestone 1 BUILT with
the SHA."

Milestones 0 and 1 are built (§14.13). The next region's prompt: "Row 12,
milestone 2 (PRD §14.5 row 2): add the Pennsylvania reader
`scripts/onshore/pa.mjs` (DEP production report extracts, unconventional
wells monthly, one request per period, cached under `.gev-cache/onshore/pa/`;
locations joined by `WELL_PERMIT_NUM` from the PASDA monthly file) and the
`appalachia` region in `scripts/onshore/regions.mjs`; register
`production-appalachia` (next free token); reconcile with EIA Pennsylvania;
`scripts/qa-onshore-appalachia.mjs` on the shared harness; the same ladder."

### 14.13 Build notes (2026-09-21, milestones 0 and 1 — Williston)

What was built, and where it departs from the text above:

- **The go and O1.** The founder's "build out the basins one at a time in
  the same method as the other data layers" started the ladder in the §14.5
  order. O1 was taken as recommended (option a): `index.json` and
  `clusters.json` are committed under `src/data/local_data/onshore/williston/`;
  the history shards are written to `public/data/onshore/williston/history/`
  (git-ignored), rebuilt from the archive by `npm run build:onshore -- --region
  williston`, checked by `--check`, and the dossier says "history shards are
  not built on this deployment" when they are absent. Measured: the shards
  weigh 25.2 MB gzip for one region, which is why they are not in `.git`.
- **1,024 shards, not 256.** The largest of 256 shards weighed 125 KB gzip
  and of 512 still 71 KB against R12.6's 64 KB; 1,024 keeps the largest at
  44 KB. The count travels in the bundle (`shards.count`), so a bigger basin
  can raise it without touching the module.
- **The substrate files.** `records.js` (the one record shape; readings are
  monthly volumes in the fixed column order `oil, water, days, runs, gas,
  gasSold, flared`, rates derived one way: per calendar day for the map and
  the ranks, per producing day for the dossier), `shards.js` (FNV-1a shard
  hash, the memoising store), `model.js` (tiers, sizes, cards, legend, the
  view rectangle), `bundledSource.js`, `dossier.js`, `index.js`. Row 11's
  `completeness.js` is reused unchanged with the reader's own lookback; no
  separate `lod.js`. The ten-year summary is the `summary` key (the first
  name, `window`, trips the package-boundary checker's browser-global scan —
  a known gotcha).
- **North Dakota, as read.** 120 workbooks (2016-08 to 2026-07, 3 MB each)
  archived with `.retrieved` sidecars and parsed once into a sha256-keyed
  cache (first parse about nine minutes, rebuilds 30 s). Sheet `Oil` only;
  `SkimmedCrudeRecovery` (disposal facilities, no coordinates) is counted and
  skipped. Pool rows are summed per well and month; identity follows the
  newest filing; coordinates are rounded to six decimals and used as NAD83
  (unstated by DMR; within a metre of WGS84 here). Two anomalies are
  recorded in `source.json`, never corrected silently: the 2026-07 workbook's
  `ReportDate` column reads 2023-07-01 (the file name is the month), and
  78,550 numeric cells over the window hold `NR`/`NA` and are read as not
  filed, never as zero.
- **Reporters and the light month.** Reporters are wells present in the
  month's workbook. 2026-07 filed 20,231 wells against a trailing median of
  22,071 (92 %), inside the 90 % rule, so it is current; DMR does not re-cut
  a month's workbook after publication (Last-Modified is the first release),
  so a light month stays light and the panel line says so: `20,231 FILED
  (92 % OF USUAL)`. The rule's filling line still names any month under
  90 %.
- **Reconciliation.** Against EIA's keyless dnav workbooks at build time
  (`N9010ND2` gross withdrawals, `N9050ND2` marketed production, `MCRFPND1`
  crude), for the newest month both report (2026-06): the state file's gas
  is 94 % of EIA gross withdrawals and 100 % of marketed production, its oil
  87 % of EIA's — the structural gap O8 expected (confidential wells and late
  filers are estimated by EIA, absent from the file). The ratios are pinned
  by `bundledSource.test.mjs` inside [0.85, 1.05] for gross and travel to the
  panel line (`94 % OF EIA GROSS (JUN)`) and every dossier's Sources section.
- **Tiers, lazily.** The region card is the only entity at activation; the
  518 field entities are created on the first visit to the regional tier
  and the 24,154 well points on the first visit to the local tier. Measured
  by the QA on a fresh server: activation 659 ms apart from the two bundle
  fetches (16 MB, 0.4 to 1.2 s on this box), cold total 1.1 s, heap
  +35 MiB, field marks built in the regional pass, points clipped to the
  padded view (17,148 of 24,154 shown at 120 km over the top pad), the
  layer's own median frame cost 1.8 ms (measured as the same view with the
  layer minus without it, after the globe's tiles load — the whole scene
  runs at ~105 ms a frame on this box's iGPU with or without the layer, so
  G4's 16 ms is held as the layer's cost, not the scene's).
- **Picks on a pad and between fields.** Surface holes on one pad are
  metres apart and share a pixel at every tier, so a hover raises one of the
  pad's wells; the QA accepts a well within 60 m of the top producer, then
  selects and opens the dossier of the well it hovered. Field centroids of
  adjacent fields overlap at 1,200 km; the QA accepts the field mark within
  30 px of the pointer. Pads as a display grouping (R12.1) remain open.
- **A defect found by the QA in rows 4 and 11.** The data manager treats an
  `update()` that returns `false` as a rejected enable and runs the disable
  cleanup; the bundled layers of rows 4 and 11 (and the first draft here)
  returned `false` once their snapshot was loaded, so a second enable left
  their marks hidden. All three now answer `true`; the LNG layer already
  did.
- **Tokens.** `production-williston` took `4`; the registry allows one
  character from `[a-z0-9]` and six remain (`0`, `5` to `9`) for ten more
  regions — the registry's token alphabet needs widening before region 7.
- **Not built here:** Montana's reader (per-query Data Miner), pads as a
  grouping, laterals, county clusters as a tier (they are in the bundle and
  the analyst records only), the EIA play polygon under the region mark
  (milestone 9).

---

## 15. Row 13 PRD — Hosted commodities site: globe and console behind one login at commodities.optaimum.com (FR-G13)

**Status:** SPECCED 2026-09-23 from the founder's hosting grill (H1 to H17
below). Not built. Oracle-side twin: `optaimumsolutions/commodities`
`PRD-market-console.md` ledger row FR-D17, which points here.

### 15.1 The grill (2026-09-23), H1 to H17

| #   | Question                          | Decision                                                                                                   | Rejected                                                                  |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| H1  | Where the globe runs              | The OVH VPS, as a second systemd service beside `console.service`, through the existing tunnel `oracle`   | Cloudflare Pages + Workers (17 Node providers to port, 25 MB file cap); another Node host |
| H2  | Screen layout                     | One site, top nav strip: globe at `/`, console pages proxied at `/market`, `/gas`, `/weather`, `/trades`  | Split screen; strip plus docked pane; two subdomains                     |
| H3  | Hostname strategy                 | A new hostname; `oracle.optaimum.com` keeps serving the console alone until the new site is proven       | Taking over `oracle.optaimum.com`; the apex (held by the dead `optaimum` tunnel) |
| H4  | Audience                          | The founder plus a named allowlist of emails                                                               | Founder only; multi-tenant SaaS with sign-up and billing                  |
| H5  | Invitee rights                    | **Parity with the founder**, including trade submit and close, chat, grill and voice                      | Read-only; chat without trades; trades hidden                             |
| H6  | What feeds the globe              | The oracle store through a read-only API, beside each layer's own live feeds                              | Keep them separate (row 1 as planned); store plus model signals on the map |
| H7  | Who serves that API               | Curated JSON routes in `tools/market_map.py`; the oracle owns the contract                                | Datasette on :8001 (raw schema, arbitrary SQL); Node reading SQLite directly |
| H8  | Deploy path                       | A git checkout on the VPS, built there; laptop build caches copied up once                               | Build on the laptop and rsync; GitHub Actions over SSH                    |
| H9  | Release gate                      | The four gates run on the VPS in a staging release; only a green release goes live                       | Laptop gates then tag; build-only                                          |
| H10 | Provider keys                     | Separate production keys, Google key referrer-locked to the hostname, budget caps on each                 | Reusing the laptop `.env`; keyless first                                   |
| H11 | Trade book with several users     | One shared book; every submit, close and grill stamped with the verified email                          | Per-user books; unstamped                                                  |
| H12 | Origin trust                      | The globe server verifies the Cloudflare Access JWT on every request and fails closed                    | Trusting the email header; Access alone                                    |
| H13 | Login                             | Email one-time PIN, 24-hour session, invitees as an Access group                                        | Google SSO; 1-week session                                                 |
| H14 | Liveness and monitoring           | Founder: "eventually avoid the use of crons … websockets for events". Push now over a WebSocket hub; the ingest crons stay until phase 2 folds them into one scheduler daemon | A 5-minute health cron; external uptime checker; crons forever |
| H15 | Browser on an update event        | Globe layers refresh in place; console pages show a "new data · refresh" pill                           | Auto-reloading console pages; badge only                                   |
| H16 | First shippable slice             | Hosted shell, founder-only (M1), then invitees, then oracle data, then events                           | Invitees in the first launch; finish row 1 first                           |
| H17 | Hostname                          | `commodities.optaimum.com`                                                                                 | `globe.optaimum.com`; `app.optaimum.com`                                   |

### 15.2 Summary

The globe and the Oil Oracle console become one private web product at
`https://commodities.optaimum.com`. Both run on the VPS that already holds the
canonical store; Cloudflare Tunnel publishes them and Cloudflare Access gates
them, and the globe server re-checks every login itself. The globe shows the
oracle's own numbers through curated read-only routes, and a WebSocket hub
pushes "source updated" and health events to every open page.

### 15.3 Problem

- The globe runs only on the laptop (`npm run dev`), so it is invisible away
  from the desk and to anyone else. The console is already hosted
  (FR-D5, `oracle.optaimum.com`), so the two halves of the product live on
  different machines and different URLs.
- The globe cannot show the oracle's numbers: rule R7 kept them apart, and the
  store lives on the VPS.
- Freshness is polled: the console reloads every 60 seconds and polls logs
  every 15; the planned strip polls `/logs.json` every 60. Nobody is told when
  a feed stops.

### 15.4 Target users

- **The founder**, daily, on any device, as the operator of both halves.
- **Invitees**: a short allowlist of teammates or pilot clients, by email,
  with the founder's full rights (H5).

### 15.5 Goals (verifiable)

- **G13.1 One login, one origin.** After one Access login, the globe and all
  five console pages load under `commodities.optaimum.com` with the strip; an
  anonymous request to any path, including `/api/*` and the WebSocket
  upgrade, gets the Access login redirect, never content.
- **G13.2 Fail closed.** A request that reaches the globe server without a
  valid Access JWT for this application's audience gets 403. Checked by
  `curl http://127.0.0.1:<port>/` on the VPS, which must return 403.
- **G13.3 Safe deploys.** A commit that fails any of the four gates never
  goes live; rolling back to the previous release takes under one minute.
- **G13.4 Attribution.** From M2 on, every trade submit, close and grill in
  the store carries the verified email of the person who made it, and the
  Slack page names them.
- **G13.5 Same numbers.** From M3 on, a globe card fed by an oracle route
  shows the same value and observation time as the console for that source.
- **G13.6 Pushed freshness.** From M4 on, a completed ingest write reaches an
  open browser as an event within 5 seconds; a stopped service or a missed
  source heartbeat turns the strip STALE or OFFLINE and pages Slack once, and
  pages again once on recovery.

### 15.6 Non-goals

- Sign-up, billing, tenancy, per-user trade books, per-user usage caps.
- Replacing the ingest and backup crons: that is phase 2, its own PRD.
- Porting the globe to Cloudflare Pages or Workers.
- Model signals, briefs or trade theses drawn on the globe (H6 rejected).
- A mobile layout beyond "loads and is usable".
- Any public page without login.

### 15.7 Requirements (R13.n)

**Hosting (M1)**

1. **Service.** `globe.service` (systemd) runs the production build with
   `vite preview` from `/srv/gods-eye-view/current` on `127.0.0.1:8020` as a
   dedicated system user `globe` that cannot read `~/oracle/.env`. Node 24 LTS
   per `package.json` engines, from NodeSource `node_24.x` (Ubuntu 26.04's apt
   ships Node 22, which fails the engines range; §15.13 V4).
2. **Preview config.** The preview server keeps every provider middleware
   (they already register `configurePreviewServer`), sets `allowedHosts` to
   include `commodities.optaimum.com` (today only `localhost`, `127.0.0.1`,
   `.local`), and carries the row 1 proxy in `preview.proxy`: `/market` to
   the console root, and `/gas`, `/weather`, `/trades`, `/ask`, `/grill`,
   `/trade`, `/trade_close`, `/logs.json` path-preserved to
   `127.0.0.1:8011`. With the console down, `/` still renders and proxied
   routes answer a plain 502 page.
3. **Strip.** Row 1 R11 pulled forward: fixed top strip on the globe and on
   every console page, links GLOBE, MARKET, GAS, WEATHER, TRADES, CHAT, the
   right end showing `mirror as of HH:MMZ · LIVE | STALE | OFFLINE`. Until M4
   it polls `/logs.json` every 60 seconds.
4. **Console side (FR-D17a).** Console links become relative to the proxy
   (`href="/"` becomes `/market`; `/gas`, `/weather`, `/trades` stay),
   `fetch('/ask' | '/logs.json' | '/trade' | '/grill' | '/trade_close')`
   stay path-preserved, and each console page renders the strip. The console
   still works unchanged at `oracle.optaimum.com`.
5. **Tunnel and Access, in this order.** Create the Access application
   `Commodities` for `commodities.optaimum.com` with policy `Founder`
   (email one-time PIN, 24-hour session) **before** adding the public
   hostname `commodities.optaimum.com` to tunnel `oracle`, pointing at
   `http://localhost:8020`. Record the team domain and the application
   audience (AUD) tag in the service's env file.
6. **Origin check.** A new server module (outside upstream files, R13)
   verifies `Cf-Access-Jwt-Assertion` on every HTTP request and on the
   WebSocket upgrade: RS256 signature against
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cached, re-fetched
   on unknown `kid`), `aud` equal to the application tag, `exp` in the future.
   Failure answers 403. It removes any inbound `X-Oracle-User` header and sets
   `X-Oracle-User: <verified email>` on requests it proxies to the console.
7. **Production keys.** `/etc/gods-eye-view/globe.env` (root-owned, mode 0640,
   group `globe`) holds new Google Maps, Cesium ion and OpenAI keys. The Google
   key is HTTP-referrer-restricted to `https://commodities.optaimum.com/*`;
   each key has a budget alert and a hard cap. Laptop keys stay dev-only. Keys
   baked into the bundle at build time are read from this file by the deploy
   script, never committed. *Amended (§15.13 V2):* the template lists every
   variable the server reads (about 50), the Google key splits into a
   referrer-locked browser key and a VPS-IP-locked `GOOGLE_MAPS_SERVER_API_KEY`,
   and `GEV_RATELIMIT_OPENAI_PER_MIN` / `GEV_RATELIMIT_GOOGLE_PER_MIN` are set.
8. **Deploy.** `scripts/deploy-vps.sh <sha>` (new): fetch, check out `<sha>`
   into `/srv/gods-eye-view/releases/<sha>`, `npm ci`, run `format:check`,
   `check:boundaries`, `npm test` and `npm run build` under `nice`/`ionice`,
   then atomically repoint the `current` symlink and restart the service.
   Any failure leaves `current` untouched. Rollback repoints `current` to the
   previous release. The live release is the `production` tag.
9. **Bundles on the VPS.** *Amended (§15.13 V5):* the committed bundles need
   nothing; the only git-ignored runtime data is
   `public/data/onshore/<region>/history/` (85 MB for Williston), rsynced to
   `/srv/gods-eye-view/shards/` and linked into each release's `public/`
   before `build`. The 950 MB `.gev-cache/` stays on the laptop until a
   bundle has to be rebuilt on the VPS. `npm ci` runs with
   `PUPPETEER_SKIP_DOWNLOAD=true`.

**Invitees and attribution (M2)**

10. **Access group.** An Access group `Commodities invitees` (emails) is added
    to the `Commodities` application. `oracle.optaimum.com` stays
    Founder-only until the M5 cutover.
11. **Stamping.** askd adds `booked_by`, `closed_by` and `requested_by`
    columns (trades, closes, grills) filled from `X-Oracle-User`. A request
    that arrives with no `X-Oracle-User` came through `oracle.optaimum.com`,
    whose policy admits only the founder, and is stamped with the founder's
    email. The trade card shows the stamp; the Slack page names it.
   *Amended (§15.13 V6):* the globe also sends `X-Oracle-Proxy-Key`; the
   console forwards both headers on its upstream requests to askd, and askd
   honours `X-Oracle-User` only with a matching key, otherwise it stamps the
   founder.
12. **Licence pass.** Before the first invitee, every source in
    `DATA_SOURCES.md` and `UPGRADE.md` is marked allowed or not for viewing by
    people other than the founder (R1 assumed one user). Sources that are not
    allowed are switched off for the hosted build.

**Oracle data on the globe (M3)**

13. **Routes (FR-D17b).** `market_map.py` gains read-only JSON routes under
    `/api/oracle/`: `freshness` (per source: last observed, last published,
    expected cadence), `chokepoints` (transits by chokepoint and day),
    `basins` (the weather basin readings), ~~`gas-flows` (the natgas `move/*`
    series)~~ `gas-storage` (`storage_weekly`, `eu_storage`, `eu_lng`), which
    ships only after FR-N5 schedules the natgas ingest (§15.13 V7). Cadence
    comes from one table in the oracle repo (V8). Each record carries the row 1 observation fields (`observedAt`,
    `publishedAt`, `validAt` where a forecast). GET only; the routes open the
    store read-only.
14. **Proxy and layers.** The preview proxy forwards `/api/oracle/` to the
    console. The chokepoint, gas-flow and weather layers read these routes
    when present and label the source "Oil Oracle store" on their cards;
    their existing live feeds stay as the fallback.

**Events (M4)**

15. **Hub.** A WebSocket endpoint `/api/events` on the globe server (same
    origin, JWT-checked at upgrade) fans out JSON events:
    `source.updated {source, observedAt, publishedAt, rows}`,
    `health {component, state: live|stale|offline}`, and a 30-second
    `heartbeat`. On connect it sends the current state of every source.
16. **Publish side.** A second listener on `127.0.0.1:8021`, not routed by
    the tunnel, accepts `POST /publish`. `ingest/refresh.py` posts one
    `source.updated` after each source's successful write (read from the
    `ingest_log` rows the job wrote, §15.13 V9); `console.service`
    and `askd.service` are probed from the hub itself.
17. **Staleness.** The hub derives each source's deadline from its expected
    cadence (the `freshness` route) plus a per-source grace. A missed deadline
    emits `health stale`; only sources marked `critical` page (§15.13 V10); the first transition each way pages Slack through a small
    localhost endpoint on askd that reuses `refresh.slack()`, so the Slack
    token stays in the oracle's env.
18. **Browsers.** The strip switches from polling to the hub. Globe layers
    tied to a source re-fetch and restyle in place with no camera change.
    Console pages show a "new data · refresh" pill in the strip instead of
    reloading, and the market and gas pages drop their own 60-second reload
    while the hub is connected (§15.13 V11).

**Cutover (M5)**

19. After seven clean days on the new site, `oracle.optaimum.com` redirects
    (301) to `https://commodities.optaimum.com/market`, and the old Access
    application is removed after the redirect is verified.

### 15.8 Rules this row changes

- **R1** (local host, one user, no public deployment): superseded for this
  row. The product is hosted privately for the founder plus an allowlist.
  Tenancy and billing remain out.
- **R7** (no oracle number on the map): superseded by H6. Oracle numbers
  appear on the globe through the §15.7 routes, labelled as the oracle's.
  Model signals, briefs and theses stay off the map.
- **R8** (the Vite dev server proxies the console): extended to the preview
  server in production.
- §5 non-goals "Tenancy, login, billing, public hosting" and "Any oracle
  number on the globe page" narrow to "Tenancy, billing, public hosting" and
  "Oracle signals or briefs on the globe page".

### 15.9 Constraints and invariants

- Everything lands on `feat/commodities-shell` with a ledger claim first;
  commits are guarded by `git branch --show-current`; the four gates pass.
- R13 additive: the JWT check, hub, strip and deploy script are new modules;
  the only upstream-owned edits are `server/standalone/vite.config.js` and
  `build/vite.js` for `allowedHosts` and `preview.proxy`.
- Console-side changes go through the oracle ledger (FR-D17). The VPS
  `~/oracle` is not a git checkout and is sometimes ahead of git: diff with
  `--strip-trailing-cr` before any scp.
- Never run ingest from the desk (oracle rule). The hub only listens.
- Keys never in chat, never in git; the Access application exists before
  its public hostname.
- Gates and bundle builds must not overlap the daily (23:00Z) and slow
  (02:00Z) refresh tiers.

### 15.10 Milestones (smallest first, each with its check)

- **M0 Claim.** Ledger row 13 here and FR-D17 in the oracle. *Check:* both
  ledgers show the claim.
- **M1 Hosted shell, founder only** (R13.1 to R13.9, FR-D17a). *Check:*
  anonymous `curl -I https://commodities.optaimum.com/{,market,api/health}`
  all redirect to the Access login; `curl http://127.0.0.1:8020/` on the VPS
  returns 403; in the founder's browser the globe renders, every strip link
  loads its console page, and the strip badge matches `/logs.json`; a
  deliberately failing commit leaves `current` unchanged; rollback under one
  minute.
- **M2 Invitees and attribution** (R13.10 to R13.12). *Check:* one invitee
  logs in with a PIN and books then closes a throwaway trade; both rows carry
  their email; the Slack line names them; `oracle.optaimum.com` still
  refuses them; the licence pass is committed.
- **M3 Oracle data on the globe** (R13.13, R13.14, FR-D17b; `gas-storage`
  waits for FR-N5). *Check:* for one chokepoint and one basin, the globe card and the console show the same
  value and observation time; each route answers in under 500 ms.
- **M4 Events** (R13.15 to R13.18, FR-D17c). *Check:* a fast-tier refresh
  shows `source.updated` in an open browser within 5 seconds; stopping
  `console.service` turns the strip OFFLINE and pages Slack once, and
  starting it pages recovery once; no console page reloads itself while the
  hub is connected.
- **M5 Cutover** (R13.19). *Check:* `oracle.optaimum.com/gas` answers 301 to
  `/gas` on the new host after login.
- **Phase 2 (separate PRD).** One scheduler daemon replaces the fast, daily,
  slow, brief and backup crons and emits the same events.

### 15.11 Risks and open questions

- **Parity (H5).** Any invitee can book or close trades that page Slack and
  can start hour-long grills. Accepted by the founder; mitigated only by
  stamping (R13.11). Revisit before the allowlist grows past a handful.
- **Licences (R13.12).** Several sources were chosen under R1's one-user
  assumption (TxDOT cameras, Petrinex, FracFocus, CCTV feeds). Resolved by
  the M2 licence pass.
- **Keys in the bundle.** Google and Cesium tokens ship to every browser.
  Resolved by the referrer lock and caps (R13.7).
- **Long streams through Cloudflare.** `/ask` and `/grill` can run up to an
  hour. Cloudflare returns 524 if no response starts within 100 seconds.
  ~~*Phase 0:* headers flush immediately (first byte is not at risk); a
  194-second silent gap mid-answer completed without a tunnel error.~~
  **Wrong, corrected 2026-09-23:** the 13:42Z phone test FAILED with a
  Cloudflare 524 at 100 s, and the answer landed only in the VPS chat log
  (oracle ledger FR-D19). **Resolved by FR-D19 / FR-J1 (`6b4a081`, live
  15:41Z):** `/ask` and `/grill` answer a job id at once, and the page polls
  `GET /ask/<id>` every 10 s. The globe proxy carries both job routes (M1b).
- **One ask at a time.** askd holds a single lock over one CPU-bound model;
  a second ask or grill gets 409 "busy". With invitees at parity, one
  person's hour-long grill blocks everyone (§15.13 V12).
- **Natgas freshness.** The `ng_*` ingest is not scheduled on the VPS
  (FR-N5), so gas data is days to weeks old today; resolved by FR-N5 ahead of
  M3.
- **VPS load.** Tests and builds share eight cores with ingest and Ollama.
  Resolve by measuring one full gated deploy under `nice` in M1.
- **One box.** The VPS is a single point of failure for both halves. The
  store has daily backups; the globe is rebuildable from git plus the cache
  copy. Accepted for now.
- **Access details.** The team domain and AUD tag are read from the
  Cloudflare dashboard at M1; the founder does the dashboard steps.
- **Shared clone.** Other sessions build layers on this branch; the preview
  config edit and strip must be claimed in §0 before editing.

### 15.12 Bootstrap from a fresh Claude Code session

*Amended by §15.13 (2026-09-23): where they differ, §15.13 and §15.14 win.
Phase 0 below is done.*

Two prompts. The first builds M1 and lays the hooks the event system plugs
into; the second builds the events (M4) once M1 and the M3 `freshness` route
exist. Founder-only steps are marked **[founder]**: the session prepares them
and waits, it never performs them.

```text
cd ~/commodities-shell && git branch --show-current   # feat/commodities-shell
git status --porcelain     # other sessions share this tree; never stage what is not yours
git log --oneline origin/feat/commodities-shell..HEAD  # unpushed commits (row 12 + row 13 PRD)
claude
```

**Prompt 1 — Row 13 M1: hosted shell, founder only, event-ready**

```text
Row 13, milestone 1 (PRD §15 in docs/COMMODITIES-PLAN.md; oracle twin FR-D17a
in ~/commodities/PRD-market-console.md). Run /obsidian first. Read §15 whole
before touching anything; the decisions H1–H17 are settled, do not re-open them.

Goal: the globe and the console live at https://commodities.optaimum.com for
the founder only, behind Cloudflare Access, with the origin verifying the
Access JWT, and with the seams the M4 event hub will plug into already in place.

0. Pre-flight (stop and report if any fails)
   a. The branch is ahead of origin with row 12 commits whose gates never
      finished. With the founder's go, run the gates for them
      (.gev-logs/gate-at.ps1 per the vault's 40-tooling.md), then push
      feat/commodities-shell to origin and mirror. The VPS clones from origin,
      so nothing below works until this is pushed.
   b. Long streams: read the /grill and /ask handlers in
      ~/commodities/tools/market_map.py and confirm response headers are sent
      before the upstream answers. [founder] Time one grill through
      https://oracle.optaimum.com and report time-to-first-byte; Cloudflare
      returns 524 after 100 s with no response.
   c. VPS read-only probe (ssh -i ~/.ssh/oil_oracle_laptop_ed25519
      ubuntu@15.204.118.186): free -h, df -h, ss -ltnp, crontab -l. Ports 8020
      and 8021 must be free. Never run ingest; never touch ~/oracle without
      diff --strip-trailing-cr against git first.

1. Claim: ledger row 13 → "M1 IN PROGRESS"; oracle FR-D17 → "FR-D17a IN
   PROGRESS". Commit each, guarded by git branch --show-current.

2. Globe repo (additive, R13; name every test file when running node --test):
   a. server/hosting/accessJwt.js + test: verifyAccessJwt(token, {teamDomain,
      aud, now}) with node:crypto only (JWK → createPublicKey, RSA-SHA256),
      certs cached from https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
      and re-fetched on an unknown kid; checks aud and exp. Export
      accessGuard(req, res, next) for HTTP and verifyUpgrade(req) for the
      WebSocket upgrade M4 will add. Fails closed with 403. Strips inbound
      X-Oracle-User and sets it from the verified email.
      Test with a locally generated RSA key and JWKS fixture; no network.
   b. Preview wiring: env-driven so dev is unchanged —
      GEV_ALLOWED_HOSTS adds commodities.optaimum.com to allowedHosts
      (build/vite.js is localhost-only today); GEV_ACCESS_TEAM and
      GEV_ACCESS_AUD enable the guard (absent = dev, guard off);
      preview.proxy maps /market to the console root and /gas, /weather,
      /trades, /ask, /grill, /trade, /trade_close, /logs.json path-preserved
      to http://127.0.0.1:8011, and reserves /api/oracle/ for M3. The guard
      runs before every provider middleware. With the console down, / still
      renders and proxied paths return a plain 502 page.
   c. src/shell/nav.js + index.html: the row 1 R11 strip (GLOBE, MARKET, GAS,
      WEATHER, TRADES, CHAT; right end "mirror as of HH:MMZ · LIVE | STALE |
      OFFLINE"), HUD offset by --gev-strip-height. All freshness reads go
      through ONE function, subscribeFreshness(callback), whose M1
      implementation polls /logs.json every 60 s. M4 swaps its body for the
      WebSocket; nothing else in the UI may poll.
   d. deploy/: globe.service (User=globe, WorkingDirectory
      /srv/gods-eye-view/current, EnvironmentFile /etc/gods-eye-view/globe.env,
      vite preview --host 127.0.0.1 --port 8020 --strictPort, Restart=always),
      globe.env.example (variable NAMES only, generated from every
      process.env name the server reads, grouped required/optional/tuning:
      GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_SERVER_API_KEY, CESIUM_ION_TOKEN,
      OPENAI_API_KEY, GEV_RATELIMIT_OPENAI_PER_MIN, GEV_RATELIMIT_GOOGLE_PER_MIN,
      GEV_ALLOWED_HOSTS, GEV_ACCESS_TEAM, GEV_ACCESS_AUD, GEV_PROXY_KEY,
      GEV_EVENTS_PUBLISH_PORT=8021 reserved for M4, plus the optional
      provider keys), and
      scripts/deploy-vps.sh <sha>: releases/<sha> checkout,
      PUPPETEER_SKIP_DOWNLOAD=true npm ci, link /srv/gods-eye-view/shards
      into public/data/onshore/<region>/history,
      format:check, check:boundaries, npm test, build, all under nice -n 10
      ionice -c3, refusing to start inside 22:45–23:30Z or 01:45–02:30Z; on
      green, atomic ln -sfn to current + systemctl restart globe + tag
      production; on red, current untouched. scripts/rollback-vps.sh repoints
      to the previous release.
   e. package-boundaries.json lines inserted textually; DATA_SOURCES and
      count pins untouched (no layer added). Four gates green; commit.

3. Oracle repo, FR-D17a: in tools/market_map.py, href="/" becomes /market and
   every page renders the same strip markup (a static copy is fine for M1;
   it reads /logs.json); the console forwards X-Oracle-User and
   X-Oracle-Proxy-Key on its upstream requests to askd (V6).
   oracle.optaimum.com must still work unchanged.
   Commit on main, then deploy per the FR-D5 recipe: diff the VPS copy
   with --strip-trailing-cr first, scp, sudo systemctl restart console.

4. VPS setup (show every command before running it): Node 24 LTS from
   NodeSource; system user globe (no shell, cannot read /home/ubuntu/oracle);
   /srv/gods-eye-view/{repo,releases,shards}; clone origin; rsync the
   laptop's public/data/onshore/*/history/ (85 MB) up to shards/; /etc/gods-eye-view/globe.env root:globe 0640 from
   the example. [founder] creates the new production keys (Google key
   referrer-locked to https://commodities.optaimum.com/*, budget caps on all
   three) and writes them into globe.env over ssh — never in chat.
   Run deploy-vps.sh on the pushed SHA; measure its wall time and peak memory.

5. Cloudflare, strictly in this order [founder, session writes the click path]:
   a. Access → Applications → self-hosted "Commodities" for
      commodities.optaimum.com, policy Founder (jack@optaimum.com, one-time
      PIN), session 24 h. Copy the team domain and the AUD tag into globe.env,
      restart globe.
   b. Only then: tunnel "oracle" → Public hostname commodities.optaimum.com →
      http://localhost:8020. Check the zone's Network → WebSockets switch is
      on (the default); the M4 hub needs it.

6. Verify (M1 checks, record results in plan §15.13 build notes):
   curl -I https://commodities.optaimum.com/, /market and any /api/ path →
   Access login redirect; on the VPS curl -i http://127.0.0.1:8020/ → 403; founder's
   browser: globe renders, every strip link loads, badge matches /logs.json;
   deploy a deliberately failing commit → current unchanged; rollback under
   one minute.

7. Close: ledger row 13 → "M1 BUILT <sha>", FR-D17a DONE; push origin and
   mirror, oracle main; /update-obsidian (decisions, gotchas, 40-tooling
   deploy recipe, STATE Next = M2).

Stop and ask only for: the gate/push go in 0a, the founder steps marked
[founder], or a change that would edit an upstream layer's internals.
```

**Prompt 2 — Row 13 M4: the web events (after M1, and after M3's
`/api/oracle/freshness` route exists)**

```text
Row 13, milestone 4 (PRD §15.7 R13.15–R13.18; oracle FR-D17c). Run /obsidian.
Prerequisites, verify first: M1 BUILT; GET /api/oracle/freshness returns each
source's last observedAt, publishedAt and expected cadence; the zone's
Network → WebSockets switch is on.

Event contract (freeze it in plan §15 before coding; both repos use it):
  source.updated {type, source, observedAt, publishedAt, rows, at}
  health         {type, component: console|askd|ingest:<source>|globe,
                  state: live|stale|offline, since, at}
  heartbeat      {type, at}                 every 30 s
  snapshot       {type, sources:[...], health:[...], at}   on connect

1. Globe repo:
   a. server/events/hub.js + tests: attaches to the preview server's
      httpServer on path /api/events; every upgrade passes
      accessJwt.verifyUpgrade or gets 403 before the handshake; fans out JSON
      to clients; sends snapshot on connect. Use the `ws` package (MIT,
      8.21.x): it is a devDependency today, so move it to dependencies in the
      same commit and say why.
   b. server/events/publish.js: a second http listener bound to
      127.0.0.1:${GEV_EVENTS_PUBLISH_PORT} (8021, never tunnelled) accepting
      POST /publish with a source.updated body; rejects anything not from
      127.0.0.1 and any body that fails the contract.
   c. server/events/deadlines.js + tests: reads /api/oracle/freshness at start
      and hourly; deadline = last observedAt + cadence × 1.5 (grace per source
      in one table); a missed deadline emits health stale; probes
      127.0.0.1:8011/logs.json and askd /health every 30 s for offline.
      Transitions only (not repeats) go to Slack via askd's relay (step 2b).
   d. Swap subscribeFreshness to the WebSocket with jittered reconnect and a
      fallback to the 60 s poll after three failed reconnects; the strip shows
      OFFLINE while disconnected.
   e. Layers: a small registry maps oracle sources to globe layers
      (chokepoints, basins/weather, and gas storage once FR-N5 is live); on
      source.updated the mapped layer
      re-fetches and restyles in place — no camera change, no re-enable.
   f. Console pages: the strip shows a "new data · refresh" pill on any
      source.updated; no automatic reload.

2. Oracle repo (FR-D17c; diff VPS vs git before every scp; never ingest
   desk-side):
   a. ingest/refresh.py: after each successful run(job), read the ingest_log
      rows with run_at at or after the job's start and POST one
      source.updated per row to http://127.0.0.1:8021/publish with a 2 s
      timeout; failure logs one line and never fails the ingest. No ingest
      script changes.
   b. askd: POST /notify on localhost only, body {text}, forwarded with
      refresh.slack(); rate-limited to one message per component per 10 min.
   c. market_map.py: drop the 60 s page reload while the page's hub socket
      is open (the strip script signals it).

3. Deploy both (deploy-vps.sh for the globe; FR-D5 recipe for the console),
   then verify the M4 checks: trigger one fast-tier refresh by waiting for
   the :00/:30 cron (do not run ingest by hand) and confirm an open browser
   receives source.updated within 5 s of the write; sudo systemctl stop
   console → strip OFFLINE and one Slack page; start → one recovery page; no
   console page reloads while connected; an unauthenticated
   wscat -c wss://commodities.optaimum.com/api/events is refused.

4. Close: ledger row 13 → "M4 BUILT <sha>", FR-D17c DONE; build notes in
   §15.13; /update-obsidian. Phase 2 (one scheduler daemon replacing the
   crons, emitting the same events) is a separate PRD — do not start it.
```

### 15.13 Build notes and system validation (2026-09-23, phase 0)

**Phase 0 result.** The row 12 commits were gated one by one with
`.gev-logs/gate-at.ps1`. `c4ec135`, `f66463a` and `912a5f7` each passed
format, boundaries and build, and each failed exactly two tests: row 11's
Gulf platform dossier and ambient-card tests, which pin `fetchedAt` but read
the lag stamp from the real clock ("82d lag" became "84d lag" two days after
they were written). Fixed in `d1fdf22` by mocking `Date` at the test's `NOW`
(gotcha card in the vault). Tip `d1fdf22`: four gates green, 4,337 pass,
10 skipped, 0 fail, build 8.7 s. Pushed to origin and mirror
(`bef7e1c..d1fdf22`). The suite now counts 4,347 tests instead of 4,365
because `ab697a4` stopped three onshore test files registering each other's
tests twice.

**Validation method.** Every §15.7 requirement was checked against the running
system: a production build served by `vite preview` on this laptop, read-only
probes of the VPS (services, ports, store schemas, `ingest_log`, cron logs),
Vite's own preview source, and the oracle code paths that row 13 touches.

**Confirmed as written**

- Providers run under `vite preview` (`/api/launches` answers 200 with data;
  only `server/standalone/key-setup.js` is dev-only, and `/api/setup/keys`
  answers 404 in preview). `/.env` returns the SPA page, never the file.
  `X-Frame-Options: DENY` and `frame-ancestors 'none'` are served in preview.
- Vite 6.4.3 applies `configurePreviewServer` middleware **before** its CORS,
  host check, proxy and static handlers, so the R13.6 guard covers every
  request, including static files and the proxied console.
- `preview.allowedHosts` must be set: a request with
  `Host: commodities.optaimum.com` gets 403 "Blocked request" today (R13.2).
- `/market` currently falls through to the SPA page (200), so the R13.2 proxy
  is required, as planned.
- The VPS copies of `market_map.py`, `ask_server.py`, `refresh.py` and
  `daily_brief.py` are byte-identical to git (CR-stripped md5), so FR-D17
  edits start from a clean base.
- Ports 8020 and 8021 are free; askd `/health` answers 200; `ws` 8.21.3 (MIT)
  is already installed as a devDependency.
- ~~Long streams: askd sends its headers before the model call and the console
  relays them at once, so there is no first-byte 524.~~ **Wrong: see §15.11;
  the 13:42Z test 524'd. FR-D19's async jobs replaced streaming.** A `/ask` at 13:53Z on
  2026-09-23 sat silent for at least 194 s inside the model call and completed
  with no cloudflared error. The founder still confirms it rendered.
- The store fits two of the three M3 routes: `chokepoint_transits`
  (`portid, name, date, n_total, n_tanker, capacity_tanker`; 28 chokepoints to
  2026-09-20, weekly via the slow tier) and `weather` / `weather_forecast`,
  whose basin regions (Anadarko, Appalachia, Bakken, EagleFord, Haynesville,
  Permian) are exactly row 12's onshore regions.

**Issues found, and what changes**

| #   | Finding                                                                                                                                                                                                                                                                  | Change                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Two row 11 tests were clock-dependent and failed at every commit from 2026-09-23.                                                                                                                                                                                        | Fixed in `d1fdf22`. New tests asserting a lag or age string pin the clock.                                                                                                                                                                                                                         |
| V2  | The server reads about 50 environment variables, not 3: `GOOGLE_MAPS_SERVER_API_KEY` (server-only, IP-restrictable), `AISSTREAM_API_KEY`, `FIRMS_MAP_KEY`, `OPENSKY_*`, `TOMTOM_API_KEY`, `TFL_APP_KEY`, `LL2_API_TOKEN`, the `CCTV_*` family, and the rate limits `GEV_RATELIMIT_OPENAI_PER_MIN` / `GEV_RATELIMIT_GOOGLE_PER_MIN`. | R13.7: `globe.env.example` is generated from the variable names the server reads, grouped as required / optional / tuning. Production sets the two `GEV_RATELIMIT_*` limits, which is the cost cap for invitees at founder parity. The Google key splits into a browser key (referrer-locked) and a server key (VPS IP-locked). |
| V3  | No local tree holds Cesium or OpenAI keys any more; only `AISSTREAM_API_KEY` is configured (and AISStream rejects it, row 2).                                                                                                                                             | The founder sources new keys before M1's browser check. Until then the hosted globe runs on the keyless imagery with voice off. M1 does not wait for keys.                                                                                                                                             |
| V4  | Ubuntu 26.04's apt offers Node 22.22, which fails `engines` (`>=24.14 <25 \|\| >=26 <27`).                                                                                                                                                                                | R13.1: install Node 24 from NodeSource `node_24.x` (nodistro carries 24.21.0) or the nodejs.org 24.21.0 tarball. Never apt's `nodejs`.                                                                                                                                                              |
| V5  | The only git-ignored runtime data is the Williston history (85 MB). The 950 MB `.gev-cache/` is build input, and the gates pass without the shards.                                                                                                                   | R13.9: rsync `public/data/onshore/*/history/` (85 MB) to `/srv/gods-eye-view/shards/` and link it into each release's `public/` before `build`. `.gev-cache/` stays on the laptop until a bundle must be rebuilt on the VPS. `npm ci` runs with `PUPPETEER_SKIP_DOWNLOAD=true`.                                     |
| V6  | The stamping chain has two gaps: the console builds fresh upstream requests to askd with only `Content-Type`, so `X-Oracle-User` never reaches askd; and Cloudflare forwards client-set headers, so anyone past the `oracle.optaimum.com` policy could send their own `X-Oracle-User`. | R13.6 and R13.11: the globe adds `X-Oracle-Proxy-Key` (a random secret shared through both env files) next to `X-Oracle-User`. The console forwards both to askd, and askd honours `X-Oracle-User` only with a matching key; otherwise it stamps the founder (the only person the old host admits). |
| V7  | No gas-flow table exists: `oracle_natgas.db` holds storage, prices, COT, EU storage and LNG, and JODI. The natgas ingest is **not scheduled on the VPS** (FR-N5 open: "refresh-tier cron for ng_* still manual"): spot to 2026-09-09, storage to 2026-09-04, `futures_curve` frozen at 2024-04-05. The console's `/gas` page is stale today for the same reason. | R13.13: the third route becomes `gas-storage` (`storage_weekly` + `eu_storage` + `eu_lng`), and it ships only after FR-N5 schedules the `ng_*` jobs. M3 ships `chokepoints` and `basins` first. FR-N5 moves ahead of M3.                                                                   |
| V8  | `/logs.json` carries `run_at` and `rows` per source but no expected cadence. Freshness lives in `ingest_log (source, run_at, rows_written, raw_path, note)`.                                                                                                              | R13.13: `freshness` gets its cadence from ONE table in the oracle repo (fast 30 min; daily 24 h; slow per due-rule: PortWatch weekly on Wednesday, COT Saturday, GPR Monday, monthlies on the 2nd), plus a per-source grace.                                                                            |
| V9  | `refresh.py` runs each job as a subprocess; the jobs write `ingest_log`.                                                                                                                                                                                                  | R13.16: the publish hook lives in `refresh.py` after each successful `run(job)`. It reads the `ingest_log` rows with `run_at` at or after the job's start and posts one `source.updated` per row. No ingest script changes.                                                                            |
| V10 | `gdelt_news` is rate-limited (429 waits of 240 to 360 s) and last wrote 12:01Z while the fast tier ran every 30 minutes, so a source can legitimately skip runs.                                                                                                            | R13.17: grace is per source, and only sources marked `critical` in the cadence table page Slack. Everything else only turns the strip amber.                                                                                                                                                       |
| V11 | Only the market page auto-reloads (a 60 s JS interval guarded by an in-flight ask or a draft). `/weather` and `/trades` never reload by design.                                                                                                                            | R13.18: the "drop the reload while connected" change applies to the market and gas pages only.                                                                                                                                                                                                      |
| V12 | askd serves one ask or grill at a time (`LOCK`; a second gets 409 "busy") on one CPU-bound Ollama model.                                                                                                                                                                 | Risk added under H5: with invitees at parity, one person's hour-long grill blocks everyone's chat. Stamping shows who holds the lock. Revisit before the allowlist grows.                                                                                                                             |

### 15.14 Remaining work (whole PRD) and the next steps

**Remaining work, in dependency order**

| Step | What                                                                                                      | Where                     | Blocks        | Who                    |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------------------- | ------------- | ---------------------- |
| 0    | Confirm the 13:53Z answer rendered in the browser (long-stream check)                                     | browser                   | M1 sign-off   | founder                |
| 1    | Claims: row 13 M1 IN PROGRESS; FR-D17a IN PROGRESS                                                         | both ledgers              | M1            | session                |
| 2    | ~~M1a~~ **BUILT `9d61cd6` (§15.15)**, laptop only: `accessJwt` + tests, preview wiring (allowedHosts, proxy, guard), strip with `subscribeFreshness`, `deploy/` with the generated env template, `deploy-vps.sh` / `rollback-vps.sh`. Verified with `vite preview` and a locally signed JWT. | globe repo                | M1c           | session                |
| 3    | ~~M1b~~ **BUILT (§15.16)**: console `href="/"` to `/market`, the strip, forwarding of `X-Oracle-User` + `X-Oracle-Proxy-Key` to askd | oracle repo               | M1 verify, M2 | session                |
| 4    | M1c, VPS: Node 24 from NodeSource, user `globe`, `/srv/gods-eye-view`, clone, shards rsync, first gated deploy on Linux | VPS                       | M1 verify     | session (commands shown first) |
| 5    | Keys: new browser + server Google keys, Cesium ion, OpenAI, budget caps                                    | provider consoles         | full M1 look  | founder                |
| 6    | Cloudflare: Access app `Commodities` first, then the public hostname                                       | Cloudflare dashboard      | M1 verify     | founder                |
| 7    | M1 verify and close                                                                                        | all                       | M2            | session + founder      |
| 8    | **FR-N5 (oracle): schedule the `ng_*` ingest in the refresh tiers** — also fixes today's stale `/gas` page | oracle repo + VPS crontab | M3 gas route  | session                |
| 9    | M2: invitee group, askd stamp columns and key check, licence pass                                          | both + dashboard          | M3            | session + founder      |
| 10   | M3: `freshness` (cadence table), `chokepoints`, `basins` routes; layers prefer them; then `gas-storage` after step 8 | both                      | M4            | session                |
| 11   | M4: hub, publish listener, `refresh.py` hook via `ingest_log`, deadlines with per-source grace, strip and layer wiring | both                      | M5            | session                |
| 12   | M5: 301 from `oracle.optaimum.com` after seven clean days                                                  | dashboard                 | —             | founder                |
| 13   | Phase 2 PRD: one scheduler daemon replaces the crons                                                       | new PRD                   | —             | grill first            |

**Next steps (revised).** The order stays M1 first. It changes in three ways:

1. M1 splits into a laptop-only part (step 2, testable end to end with
   `vite preview` and a locally signed token) and a VPS part (step 4). The
   code can land and be verified before any VPS or Cloudflare change.
2. The header forwarding and proxy key (V6) move into M1's console work,
   because the M1 proxy is where the header is first set.
3. FR-N5 (step 8) moves ahead of M3, because the gas route and the console's
   own `/gas` page both depend on it. It can run in parallel with M1 in the
   oracle lane.

### 15.15 Build notes: M1a, laptop-only code (2026-09-23)

Built as `9d61cd6` on `feat/commodities-shell`; how-to in
[`HOSTING.md`](HOSTING.md).

- **Access guard** (`server/hosting/accessJwt.js`, `accessGuard.js`): RS256
  against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cached;
  re-fetched on an unknown `kid` at most once a minute), audience, issuer,
  `exp`/`nbf`/`iat` with 60 s leeway, email required. Token from
  `Cf-Access-Jwt-Assertion`, then the `CF_Authorization` cookie. Modes: `off`
  (no `GEV_ACCESS_*`, development), `verify`, and `deny` when
  `GEV_REQUIRE_ACCESS=1` or only one of team/audience is set (fail closed).
  Installed with `enforce: 'pre'` and `order: 'pre'` in dev and preview.
  `verifyUpgrade()` is ready for the M4 hub.
- **Console proxy** (`server/hosting/consoleProxy.js`): **deviation from
  R13.2**: its own streaming `node:http` middleware, not Vite's
  `preview.proxy`. Vite installs `preview.proxy` after plugin middleware, so
  `api-not-found` would answer 404 for `/api/oracle/*` first, and the proxy
  must set identity headers. It forwards `X-Oracle-User` (the verified email)
  and `X-Oracle-Proxy-Key` (`GEV_PROXY_KEY`, only with a user), and never
  forwards cookies, the Access token or client-set identity headers. It
  never buffers or times out. When the console is down it answers 502.
  `GEV_CONSOLE_URL`, `GEV_CONSOLE_PROXY=0`.
- **Strip** (`public/gev-shell/strip.mjs`, `server/hosting/navStrip.js`):
  **deviation from R13.3** (was `src/shell/nav.js`). One plain module served
  from the globe's public directory, so console pages proxied under the same
  origin load the same file (FR-D17a adds one `<script type="module">` tag).
  It is injected into the globe page only when `GEV_NAV_STRIP=1` at build
  time, so dev and the headless QA scripts keep the upstream layout. The
  globe's absolutely positioned chrome shifts as one block: the body gets
  `top` plus `transform`, and the strip sits outside `<body>`. Freshness
  reuses the console's own rule: `/logs.json` already carries per-source
  tolerance hours (`tol` = `SRC_TOL_H`, which **corrects §15.13 V8**: a
  cadence table exists; M3's `freshness` route reuses it). A source is stale
  past 2× its tolerance, the store is stale with no ingest for 75 minutes,
  and a failed fetch is OFFLINE. All reads go through `subscribeFreshness()`.
- **Allowed hosts**: `build/vite.js` gains `extraAllowedHosts`, fed from
  `GEV_ALLOWED_HOSTS` by `server/standalone/vite.config.js`. Preview inherits
  `server.allowedHosts`.
- **Rate limits** (new, V13): behind the tunnel every request comes from
  loopback, so the per-IP `GEV_RATELIMIT_*` limiters would be one shared
  bucket. `clientKey()` now prefers `req.gevUser` (set only by the guard).
- **Deploy**: `deploy/globe.service` (hardened, loopback `:8020`), the
  generated `deploy/globe.env.example` (drift-tested), and
  `scripts/deploy-vps.sh`. The deploy runs the gates in a clean environment,
  builds with the production file, refuses the ingest windows, swaps
  atomically, and rolls back unless an unauthenticated local GET answers 403.
  Plus `scripts/rollback-vps.sh`.
- **Upstream-owned edits** (R13): `build/vite.js`,
  `server/standalone/vite.config.js`, `server/providers/common/rate-limit.js`,
  and `src/tooling/viteBuild.test.mjs` (the plugin-order pin now expects the
  three hosting plugins first).
- **Verified**: 34 new tests, including `src/tooling/hostingPreview.test.mjs`,
  a real build served by `vite preview` with a locally signed token. Every
  route answers 403 without it, the identity reaches the console,
  `/api/oracle/*` beats `api-not-found`, and the hosted name passes the host
  check while any other name is refused. Visual check
  `.gev-logs/render-strip.mjs` against the desk console on 8011: strip 30 px
  at the top, `#cesiumContainer` and canvas at top 30 / height 870 of 900, no
  page errors, badge `mirror as of 21:49Z · STALE (7)` (the 09-04 snapshot),
  and MARKET loads the real console page through the proxy.
- **Next (M1b, oracle repo FR-D17a)**: add the strip script tag to the
  console pages, change `href="/"` to `/market`, and forward
  `X-Oracle-User` + `X-Oracle-Proxy-Key` on the upstream requests to askd.
  Then M1c on the VPS per `HOSTING.md`.

### 15.16 Build notes: M1b, the console inside the shell (2026-09-23)

- **Coordination.** Another session built FR-D19 / FR-J1 (async ask:
  `asks` table, askd jobs, `GET /ask/<id>` polled every 10 s,
  `POST /ask/<id>/cancel`) in `tools/market_map.py` and `ask_server.py` at
  the same time. FR-D17a waited for its commit (`6b4a081`, live on the VPS
  since 15:41Z). At this session's request, that commit already forwards
  `X-Oracle-User` and `X-Oracle-Proxy-Key` from the console's upstream
  helpers (`_poll_job`, `_relay_json`) to askd; askd ignores them until
  FR-D17b (M2).
- **Globe** (`b73db97`): the proxy carries `GET /ask/<id>` and
  `POST /ask/<id>/cancel`, never caches (the console's `Cache-Control:
  no-store` passes through), and sets `X-Gev-Shell: 1` on every proxied
  request, stripping any client-sent copy. (`447bd8f`): the strip's CHAT
  link (`/market#ask`) opens the console chat drawer (`#chatbtn` / `#chatbox`
  / `#chatq`) on load and on `hashchange`. The flow layout moves the drawer
  below the strip.
- **Console** (oracle `2e46883`, FR-D17a): `/market` and `/market/` serve the
  root, so the renamed link works on both hosts. The nav `map` link points
  to `/market`. The strip tag goes before `</head>` only when
  `X-Gev-Shell: 1` is present, so direct `oracle.optaimum.com` pages are
  byte-identical. **Not deployed:** it has no effect until the globe is
  hosted, so it ships with M1c.
- **Verified.** A second console on `:8012` from the edited file:
  `/`, `/market`, `/market/`, `/gas`, `/weather` and `/trades` carry the tag
  only with the header, and all share the renamed nav. A local globe
  preview proxied to it with `.gev-logs/render-strip.mjs`: the strip is on
  all four console pages with its own link current, the body is offset
  30 px, and `/market#ask` opens the drawer at top 30 with `#chatq`
  focused. Four gates green on `447bd8f` (4,372 pass / 0 fail).
- **Found, not fixed (console, pre-existing):** `/market` throws
  `TypeError: Cannot read properties of null (reading 'addEventListener')`
  at `.strip .tile .pin`, because a price tile has no pin button. It happens
  identically on the old desk console and without the strip; reported to the
  console lane.
