import * as Cesium from 'cesium';
import { createGulfPlatformsLayer } from '../../layers/production/index.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * Wire the bundled Gulf platform records to the application overlay host and
 * context store. The dossier drawer arrives with row 11 milestone 3; until
 * then a click selects, shows the card and flies, and opens nothing.
 */
export function createApplicationGulfPlatforms(options) {
  return createGulfPlatformsLayer({
    overlayHost,
    context: {
      registerEntityContext,
      selectEntityContext,
      clearSelectedEntityContextForLayer,
      removeEntityContextsForLayer,
    },
    dossier: null,
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    ...options,
  });
}
