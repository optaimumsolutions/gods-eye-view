import * as Cesium from 'cesium';
import { createPortsLayer } from '../../layers/ports/index.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';
import { installPortDossier } from '../portDossier.js';
import { createPortDossierPanel } from '../../ui/portDossierPanel.js';
import { createPortDossierLiveHooks } from '../portDossierLive.js';

/**
 * Row 9: the dossier panel rides on the ports layer's lifetime. It is
 * installed when the layer initializes in a browser and torn down with the
 * layer, so the catalog can still be constructed in Node (tests) where no
 * document exists. The bundle module is a dynamic import so its JSON graph
 * never loads outside the browser.
 */
export function attachPortDossier(
  layer,
  {
    hasDocument = () => typeof document !== 'undefined' && Boolean(document),
    loadBundle = () => import('../portDossierBundle.js'),
    createPanel = createPortDossierPanel,
    createLive = createPortDossierLiveHooks,
    install = installPortDossier,
  } = {},
) {
  const originalInit = layer.init;
  const originalDestroy = layer.destroy;
  let dossier = null;
  let pending = null;
  layer.init = function init(viewer, ...rest) {
    const result = originalInit.call(layer, viewer, ...rest);
    if (hasDocument() && !dossier && !pending) {
      pending = Promise.resolve()
        .then(loadBundle)
        .then((bundle) => {
          if (!pending) return;
          dossier = install({
            layer,
            panel: createPanel(),
            index: bundle.PORT_DOSSIER_INDEX,
            loadDossier: bundle.loadBundledPortDossier,
            live: createLive(),
          });
        })
        .catch((error) => {
          console.warn(
            '[Data:Ports] Dossier panel unavailable:',
            error?.message || error,
          );
        })
        .finally(() => {
          pending = null;
        });
    }
    return result;
  };
  layer.destroy = function destroy(...args) {
    pending = null;
    dossier?.destroy();
    dossier = null;
    return originalDestroy.call(layer, ...args);
  };
  layer.getPortDossier = () => dossier;
  return layer;
}

/** Wire PortWatch port and disruption records to the application overlay host and context store. */
export function createApplicationPorts(options) {
  const layer = createPortsLayer({
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
  return attachPortDossier(layer);
}
