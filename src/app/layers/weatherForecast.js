import * as Cesium from 'cesium';
import { createWeatherForecastLayer } from '../../layers/weather/index.js';
import { createWeatherDossier } from '../../layers/weather/dossier.js';
import { getForecastScrubber } from '../../layers/weather/scrubber.js';
import { overlayHost } from './overlayHost.js';
import {
  clearSelectedEntityContextForLayer,
  registerEntityContext,
  removeEntityContextsForLayer,
  selectEntityContext,
} from '../../data/contextStore.js';

/**
 * Wire the Open-Meteo ensemble readings (row 3) to the application overlay
 * host, context store, the shared forecast scrubber and the dossier drawer.
 * Without a document (unit tests) the layer runs with neither drawer nor
 * scrubber and steps the lead through `setSelectedLead` alone.
 */
export function createApplicationWeatherForecast(options) {
  let layer = null;
  const hasDocument = typeof document !== 'undefined';
  const dossier = hasDocument
    ? createWeatherDossier({ document, onClose: () => layer?.clearSelection() })
    : null;
  layer = createWeatherForecastLayer({
    overlayHost,
    context: {
      registerEntityContext,
      selectEntityContext,
      clearSelectedEntityContextForLayer,
      removeEntityContextsForLayer,
    },
    scrubber: hasDocument ? getForecastScrubber({ document }) : null,
    dossier,
    screenSpaceEventHandlerFactory: (canvas) =>
      new Cesium.ScreenSpaceEventHandler(canvas),
    ...options,
  });
  return layer;
}
