import * as Cesium from 'cesium';
import { createLngDossier, createLngLayer } from '../../layers/lng/index.js';
import { governorRequestRender } from '../../renderGovernor.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * Wire the bundled LNG records to the application overlay host, context
 * store, render governor and the dossier drawer. The drawer's buttons call
 * back into the layer, so the drawer never touches the camera or the store
 * itself. Without a document (unit tests) the layer runs without a drawer.
 */
export function createApplicationLng(options) {
  let layer = null;
  const dossier =
    typeof document !== 'undefined'
      ? createLngDossier({
          document,
          onClose: () => layer?.clearTerminal(),
          onFlyTo: (row) => layer?.flyToTerminal(row?.id),
          onZoomOut: (row) => layer?.zoomOutFromTerminal(row?.id),
          onStep: (delta) => layer?.stepTerminal(delta),
        })
      : null;
  layer = createLngLayer({
    overlayHost,
    requestRender: governorRequestRender,
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
