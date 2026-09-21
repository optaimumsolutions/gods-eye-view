import * as Cesium from 'cesium';
import {
  createOnshoreDossier,
  createOnshoreLayer,
  createShardStore,
} from '../../layers/onshore/index.js';
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
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    ...options,
  });
  return layer;
}

export function createApplicationOnshoreWilliston(options) {
  return createApplicationOnshore({ region: ONSHORE_REGIONS[0], ...options });
}
