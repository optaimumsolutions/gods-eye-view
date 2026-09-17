import * as Cesium from 'cesium';
import {
  createDatacenterDossier,
  createDatacentersLayer,
} from '../../layers/datacenters/index.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * Wire the bundled US data center records to the application overlay host,
 * context store and the dossier drawer. The drawer's buttons call back into
 * the layer, so the drawer never touches the camera or the store itself.
 * Without a document (unit tests) the layer runs without a drawer.
 */
export function createApplicationDatacenters(options) {
  let layer = null;
  const dossier =
    typeof document !== 'undefined'
      ? createDatacenterDossier({
          document,
          onClose: () => layer?.clearSite(),
          onFlyTo: (row) => layer?.flyToSite(row?.id),
          onZoomOut: (row) => layer?.zoomOutFromSite(row?.id),
          onStep: (delta) => layer?.stepSite(delta),
        })
      : null;
  layer = createDatacentersLayer({
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
