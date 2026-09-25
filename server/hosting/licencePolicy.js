/**
 * Sources the hosted site switches off (plan §15.7 R13.12). One row per source
 * that docs/LICENCES.md marks **OFF**, with the licence clause that forbids
 * showing it to viewers other than the founder and what would have to be on
 * file to switch it back on (`GEV_LICENCE_ON_FILE`). server/hosting/licences.js
 * enforces the rows when `GEV_LICENCE_PROFILE=hosted`;
 * src/hosting/licences.test.mjs checks every file, switch, check and table row
 * named here exists.
 *
 * Row fields (see licences.js): `env` switches ('0') or keys ('') forced at
 * config load; `modules` module -> stub at build time; `publicPaths` under
 * public/, pruned and refused; `routes` refused; `code` {file, check}: where
 * an isWithheld() call enforces the row; `unlessEnv` the row lapses while
 * that variable is set.
 */
const row = (fields) =>
  Object.freeze({
    ...fields,
    ...(fields.env ? { env: Object.freeze(fields.env) } : {}),
    ...(fields.modules ? { modules: Object.freeze(fields.modules) } : {}),
  });

export const HOSTED_WITHHELD = Object.freeze([
  // Bundled datasets
  row({
    id: 'telegeography',
    licence:
      'CC BY-NC-SA 3.0 bundle; the data is now licensed to paying subscribers only',
    permit: 'a TeleGeography data licence',
    modules: {
      'src/layers/submarineCables/bundledSource.js':
        'src/hosting/withheld/submarineCables.js',
    },
  }),
  row({
    id: 'bhote-koshi',
    licence: 'CC BY-NC 4.0 (Vantor crops, GeoPera centreline)',
    permit: 'commercial permission from Vantor and GeoPera',
    modules: {
      'src/data/bhoteKoshiFloodPath.js':
        'src/hosting/withheld/bhoteKoshiFloodPath.js',
    },
    publicPaths: ['events/bhote-koshi-2026'],
  }),
  row({
    id: 'giignl',
    licence:
      'GIIGNL Annual Report: reproduction prohibited without prior consent; not for commercial use',
    permit: "GIIGNL's written consent",
    modules: {
      'src/layers/lng/matrixUrl.js': 'src/hosting/withheld/lngMatrixUrl.js',
    },
  }),
  // Live feeds
  row({
    id: 'portwatch',
    licence:
      'IMF terms: commercial reuse of IMF data needs permission (copyright@imf.org)',
    permit: 'written permission from the IMF',
    code: {
      file: 'src/sources/reference.js',
      check: "isWithheld('portwatch')",
    },
    routes: ['api/oracle/chokepoints'],
  }),
  row({
    id: 'opensky',
    licence:
      'OpenSky terms: for-profit use needs written permission and a licence',
    permit: 'a written OpenSky licence',
    env: { OPENSKY_ENABLED: '0' },
  }),
  row({
    id: 'open-meteo',
    licence: 'Open-Meteo terms: the free API is non-commercial only',
    permit:
      'an Open-Meteo API subscription (Professional for ensembles) wired to customer-api',
    env: { OPEN_METEO_ENABLED: '0' },
    code: {
      file: 'src/layers/datacenters/liveSource.js',
      check: "isWithheld('open-meteo')",
    },
  }),
  row({
    id: 'google-news',
    licence: 'Google News RSS: personal, non-commercial feed readers only',
    permit: 'written permission from Google',
    env: { GOOGLE_NEWS_RSS_ENABLED: '0' },
  }),
  row({
    id: 'esri-world-imagery',
    licence:
      'Esri Master License Agreement: keyless World Imagery needs Esri software or an ArcGIS subscription',
    permit: 'an ArcGIS Location Platform key and code that sends it',
    code: {
      file: 'src/maps/defaultSources.js',
      check: "isWithheld('esri-world-imagery')",
    },
  }),
  row({
    id: 'cesium-ion',
    licence:
      'Cesium ion Community plan: non-commercial or exploratory use only',
    permit: 'a Cesium ion Commercial plan',
    env: { CESIUM_ION_TOKEN: '' },
  }),
  row({
    id: 'tomtom',
    licence:
      'TomTom free plan: evaluation use only; no shared cache across users',
    permit: 'a billed TomTom plan and a per-viewer tile cache',
    env: { TOMTOM_API_KEY: '' },
  }),
  row({
    id: 'adsbdb',
    licence:
      "adsbdb: no data licence; route data may not be published without David J Taylor's permission",
    permit: 'written permission from the adsbdb operator and David J Taylor',
    routes: ['api/adsbdb'],
  }),
  row({
    id: 'overpass-main',
    licence:
      'overpass-api.de: operators ask commercial users to self-host or use a provider',
    permit: 'a self-hosted or commercial Overpass endpoint',
    env: { OVERPASS_MAIN_ENABLED: '0' },
  }),
  // Cameras (no reuse licence stated, so copyright is reserved)
  row({
    id: 'cctv-txdot',
    licence: 'TxDOT: no licence for camera images ("Copyright 2026, TxDOT")',
    permit: 'written permission from TxDOT',
    env: { CCTV_TXDOT_ENABLED: '0' },
  }),
  row({
    id: 'cctv-tallinn',
    licence: 'City of Tallinn ristmikud: no licence for camera images',
    permit: 'written permission from the City of Tallinn',
    env: { CCTV_TALLINN_ENABLED: '0' },
  }),
  row({
    id: 'cctv-warendorf',
    licence:
      'Stadt Warendorf Impressum: no reproduction or third-party access without written permission',
    permit: 'written permission from Stadt Warendorf',
    env: { CCTV_WARENDORF_ENABLED: '0' },
  }),
  row({
    id: 'cctv-ontario',
    licence:
      'Ontario 511: API token required; the application names the third parties who see the data',
    permit: 'an approved Ontario 511 token and code that sends it',
    env: { CCTV_ONTARIO_ENABLED: '0' },
  }),
  row({
    id: 'cctv-tarktee',
    licence:
      'Transpordiamet DATEX II terms: CC BY, but access requires a registered API key',
    permit: 'a registered Tark Tee API key and code that sends it',
    env: { CCTV_TARKTEE_ENABLED: '0' },
  }),
  row({
    id: 'cctv-tfl',
    licence:
      'TfL transport data terms: commercial use allowed for registered users (app key)',
    permit: 'TFL_APP_KEY set (the row lapses by itself)',
    env: { CCTV_TFL_ENABLED: '0' },
    unlessEnv: 'TFL_APP_KEY',
  }),
  row({
    id: 'cctv-drivebc-partners',
    licence:
      'OGL-BC excludes third-party rights: cameras credited to a partner',
    permit: "each partner's permission",
    env: { CCTV_DRIVEBC_THIRD_PARTY: '0' },
  }),
  // Transit
  row({
    id: 'transit:metrotransit-msp',
    licence:
      'Metro Transit: no licence on the realtime feed; posted terms are personal, non-commercial',
    permit: 'written permission from the Metropolitan Council',
    code: {
      file: 'src/data/transitFeeds.js',
      check: 'isWithheld(`transit:${feed.id}`)',
    },
  }),
]);
