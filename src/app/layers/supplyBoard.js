import { createSupplyBoardLayer } from '../../layers/supplyBoard/index.js';
import { overlayHost } from './overlayHost.js';

/** Row 14 M2: the US gas supply board on the application overlay. */
export function createApplicationSupplyBoard(options) {
  return createSupplyBoardLayer({ overlayHost, ...options });
}
