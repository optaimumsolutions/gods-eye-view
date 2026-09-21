import { createGasFlowsLayer } from '../../layers/gasFlows/index.js';
import { governorRequestRender } from '../../renderGovernor.js';
import { overlayHost } from './overlayHost.js';

/**
 * Wire the bundled gas substrate to the application overlay host and the
 * render governor.
 *
 * Deliberately thinner than its neighbours: there is no context store, no
 * dossier and no `ScreenSpaceEventHandler`, because nothing in this layer is
 * pickable yet. Every mark it draws is PENCIL — mapped only, carrying no
 * measured value — so there is nothing a card could truthfully say. The
 * handlers arrive with the EIA provider, alongside the marks that have a
 * number to show.
 *
 * `governorRequestRender` is passed in rather than reached for, so the layer
 * can be constructed headlessly without the governor.
 */
export function createApplicationGasFlows(options) {
  return createGasFlowsLayer({
    overlayHost,
    requestRender: governorRequestRender,
    ...options,
  });
}
