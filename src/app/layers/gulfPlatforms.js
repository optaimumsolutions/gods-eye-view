import * as Cesium from 'cesium';
import {
  createGulfDossier,
  createGulfPlatformsLayer,
} from '../../layers/production/index.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * Wire the bundled Gulf platform records to the application overlay host,
 * context store and the dossier drawer. The drawer's buttons call back into
 * the layer, so the drawer never touches the camera or the store itself.
 * Without a document (unit tests) the layer runs without a drawer.
 */
export function createApplicationGulfPlatforms(options) {
  let layer = null;
  const dossier =
    typeof document !== 'undefined'
      ? createGulfDossier({
          document,
          onClose: () => layer?.clearPlatform(),
          onFlyTo: (row) => layer?.flyToPlatform(row?.id),
          onZoomOut: (row) => layer?.zoomOutFromPlatform(row?.id),
          onStep: (delta) => layer?.stepPlatform(delta),
        })
      : null;
  layer = createGulfPlatformsLayer({
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
