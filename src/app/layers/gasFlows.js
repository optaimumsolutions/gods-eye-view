import * as Cesium from 'cesium';
import {
  createGasFlowsLayer,
  createOracleFlowsSource,
} from '../../layers/gasFlows/index.js';
import { governorRequestRender } from '../../renderGovernor.js';
import { overlayHost } from './overlayHost.js';

/**
 * Wire the bundled gas substrate to the application overlay host and the
 * render governor.
 *
 * Deliberately thinner than its neighbours: there is no context store and no
 * dossier. The bundled network and crossings are PENCIL — mapped only,
 * carrying no measured value — so nothing there can be clicked. The one
 * exception (row 18 / #71) is the five LNG feedgas pins from the Oil Oracle
 * store's `/api/oracle/flows`, read through the shared oracle memo; they get
 * a `ScreenSpaceEventHandler` for their hover and click cards and nothing
 * else.
 *
 * `governorRequestRender` is passed in rather than reached for, so the layer
 * can be constructed headlessly without the governor.
 */
export function createApplicationGasFlows(options) {
  return createGasFlowsLayer({
    overlayHost,
    requestRender: governorRequestRender,
    oracleFlows: createOracleFlowsSource(),
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    ...options,
  });
}
