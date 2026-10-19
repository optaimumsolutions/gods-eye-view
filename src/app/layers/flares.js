import * as Cesium from 'cesium';
import {
  createFlaresDossier,
  createFlaresLayer,
} from '../../layers/flares/index.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * The drawer's buttons call back into the layer, so the drawer never touches
 * the camera or the store itself. Without a document (unit tests) the layer
 * runs without a drawer.
 */
export function createApplicationFlares(options) {
  let layer = null;
  const dossier =
    typeof document !== 'undefined'
      ? createFlaresDossier({
          document,
          onClose: () => layer?.clearSite(),
          onFlyTo: (id) => layer?.flyToSite(id),
          onZoomOut: (id) => layer?.zoomOutFromSite(id),
          onZoomRegion: () => layer?.zoomToRegion(),
        })
      : null;
  layer = createFlaresLayer({
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
