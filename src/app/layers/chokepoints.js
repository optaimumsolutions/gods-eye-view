import * as Cesium from 'cesium';
import { createChokepointsLayer } from '../../layers/chokepoints/index.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/** Wire PortWatch chokepoint records to the application overlay host and context store. */
export function createApplicationChokepoints(options) {
  return createChokepointsLayer({
    overlayHost,
    context: {
      registerEntityContext,
      selectEntityContext,
      clearSelectedEntityContextForLayer,
      removeEntityContextsForLayer,
    },
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    ...options,
  });
}
