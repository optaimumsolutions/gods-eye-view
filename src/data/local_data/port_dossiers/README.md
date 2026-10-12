# Port dossiers

Static facts for the commodity ports of docs/COMMODITIES-PLAN.md §9.6.1,
bundled for the port dossier panel. Built by `scripts/build-port-dossiers.mjs`
from `config/port_dossiers.seed.json`; nothing here is fetched at runtime.
The panel stamps the about section with its Wikipedia revision time and the
trade-role section with the `vintage` below, never with the fetch time. Live
sections (camera, flow, history, weather, headlines) are fetched on click and
are not part of this bundle.

- Sources: IMF PortWatch ports database (identity, LOCODE, annual calls by
  vessel class, top industries, share of the country's maritime trade),
  under the IMF terms of use (https://www.imf.org/external/terms.htm); English Wikipedia REST
  summaries (title, extract, thumbnail, page URL), text CC BY-SA 4.0 with
  attribution on the panel; the hand-written seed (role, terminals,
  authority, aliases, cameras, satellite zoom).
- Count: 20 ports (`index.json`).
- Vintage: 2026-10-12 (newest source fetch; per-source dates and content
  hashes are in `source.json`).
- Runtime files: `index.json`, one `<portid>.json` per port, `source.json`.

Refresh: `node scripts/build-port-dossiers.mjs` rebuilds every file;
`--check` rebuilds in memory and reports drift against the committed bundle.
Growing the set is one seed entry plus a rebuild; the schema test in
`src/layers/ports/dossier.test.mjs` pins the launch set.
