import * as Cesium from 'cesium';
import { createWeatherForecastLayer } from '../../layers/weather/index.js';
import { createWeatherDossier } from '../../layers/weather/dossier.js';
import { getForecastScrubber } from '../../layers/weather/scrubber.js';
import { createWeatherForecastService } from '../../services/weatherForecast.js';
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

/**
 * The shared forecast service the campus and port cards read (row 3 M2),
 * built on the same source as the layer so it never adds a request; it
 * follows the shared scrubber when a document exists.
 */
export function createApplicationWeatherService(source) {
  return createWeatherForecastService({
    source,
    scrubber:
      typeof document !== 'undefined'
        ? getForecastScrubber({ document })
        : null,
  });
}
