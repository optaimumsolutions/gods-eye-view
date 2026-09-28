import * as Cesium from 'cesium';
import {
  createOnshoreDossier,
  createOnshoreLayer,
  createOracleBasinWeatherSource,
  createShardStore,
} from '../../layers/onshore/index.js';
import { createContributorsDossier } from '../../layers/production/contributorsDossier.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * The onshore production regions the application registers (row 12,
 * docs/COMMODITIES-PLAN.md §14.5), one layer each over the one substrate.
 * A region joins this list when its bundle lands; its id and token are
 * registered in `src/data/layerState.js` in the same commit.
 */
export const ONSHORE_REGIONS = Object.freeze([
  Object.freeze({
    id: 'williston',
    layerId: 'production-williston',
    name: 'Gas · Williston Wells (ND DMR)',
    icon: '⛽',
    sourceKey: 'onshoreWilliston',
  }),
  // Row 14 M3 (plan §16.4 D14.5): Pennsylvania's unconventional wells first.
  Object.freeze({
    id: 'appalachia',
    layerId: 'production-appalachia',
    name: 'Gas · Appalachia Wells (PA DEP)',
    icon: '⛽',
    sourceKey: 'onshoreAppalachia',
  }),
  // Row 14 M3, region 3: the Permian's Texas side per RRC lease, in three
  // layers (Delaware, Midland, Central Platform & Shelves) to stay inside
  // the size budgets.
  Object.freeze({
    id: 'permian-delaware',
    layerId: 'production-permian-delaware',
    name: 'Gas · Permian Delaware Leases (Texas RRC)',
    icon: '⛽',
    sourceKey: 'onshorePermianDelaware',
  }),
  Object.freeze({
    id: 'permian-midland',
    layerId: 'production-permian-midland',
    name: 'Gas · Permian Midland Leases (Texas RRC)',
    icon: '⛽',
    sourceKey: 'onshorePermianMidland',
  }),
  Object.freeze({
    id: 'permian-platform',
    layerId: 'production-permian-platform',
    name: 'Gas · Permian Platform & Shelves Leases (Texas RRC)',
    icon: '⛽',
    sourceKey: 'onshorePermianPlatform',
  }),
]);

/**
 * Wire one region's bundled records to the application overlay host, the
 * context store, the history shard store and the dossier drawer. The
 * drawer's buttons call back into the layer, so the drawer never touches the
 * camera or the store itself. Without a document (unit tests) the layer
 * runs without a drawer.
 */
export function createApplicationOnshore({ region, source, ...options } = {}) {
  let layer = null;
  const dossier =
    typeof document !== 'undefined'
      ? createOnshoreDossier({
          document,
          onClose: () => layer?.clearWell(),
          onFlyTo: (row) => layer?.flyToWell(row?.id),
          onZoomOut: (row) => layer?.zoomOutFromWell(row?.id),
          onStep: (delta) => layer?.stepWell(delta),
        })
      : null;
  // Row 14 M1: the region mark opens the main contributors.
  const contributorsDossier =
    typeof document !== 'undefined'
      ? createContributorsDossier({
          document,
          regionId: region.id,
          onClose: () => layer?.closeContributors(),
          onZoom: () => layer?.zoomToRegion(),
        })
      : null;
  layer = createOnshoreLayer({
    region,
    source,
    shards: createShardStore({
      regionId: region.id,
      baseUrl: import.meta.env?.BASE_URL || '/',
    }),
    overlayHost,
    context: {
      registerEntityContext,
      selectEntityContext,
      clearSelectedEntityContextForLayer,
      removeEntityContextsForLayer,
    },
    dossier,
    contributorsDossier,
    // Row 13 M3: the region card's basin line from the Oil Oracle store
    basinWeather: createOracleBasinWeatherSource(),
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    ...options,
  });
  return layer;
}

export function createApplicationOnshoreWilliston(options) {
  return createApplicationOnshore({ region: ONSHORE_REGIONS[0], ...options });
}

export function createApplicationOnshoreAppalachia(options) {
  return createApplicationOnshore({ region: ONSHORE_REGIONS[1], ...options });
}

export function createApplicationOnshorePermianDelaware(options) {
  return createApplicationOnshore({ region: ONSHORE_REGIONS[2], ...options });
}

export function createApplicationOnshorePermianMidland(options) {
  return createApplicationOnshore({ region: ONSHORE_REGIONS[3], ...options });
}

export function createApplicationOnshorePermianPlatform(options) {
  return createApplicationOnshore({ region: ONSHORE_REGIONS[4], ...options });
}
