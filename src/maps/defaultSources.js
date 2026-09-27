import { MAP_STACKS } from './catalog.js';
import { photorealUnavailableReason } from './availability.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import {
  createOsmImagery,
  createEsriImagery,
  createUsgsImagery,
  createIonImagery,
  ESRI_ATTRIBUTION_HTML,
} from './imagery.js';
import { createWorldTerrain, createKeylessTerrain } from './terrain.js';
import { isWithheld } from '../hosting/withheld.js';

/** Why the hosted site offers no Esri stack (docs/LICENCES.md). */
export const ESRI_WITHHELD_MESSAGE =
  'Esri Satellite is withheld on the hosted site: keyless World Imagery needs an ArcGIS account for commercial use (docs/LICENCES.md)';

/** Keyless imagery factories by stack kind. */
const KEYLESS_IMAGERY = {
  osm: createOsmImagery,
  'esri-imagery': createEsriImagery,
  'usgs-imagery': createUsgsImagery,
};

/**
 * The keyless landing stack: Esri imagery, or USGS imagery where the hosted
 * licence profile withholds keyless Esri (plan §16.4, D14.1). OSM is never the
 * landing stack; it stays a stack the user can pick.
 */
export function keylessStackId() {
  return isWithheld('esri-world-imagery') ? 'usgs-imagery' : 'esri-imagery';
}

/** Select sources and setup guidance without putting provider branches in the controller. */
export function createDefaultMapSources({
  googleTileset = null,
  cesiumToken = '',
  googleApiKey = '',
} = {}) {
  const ionToken = String(cesiumToken || '').trim();
  const hasIon = Boolean(ionToken);
  const hasGoogle = Boolean(String(googleApiKey || '').trim());
  const esriWithheld = isWithheld('esri-world-imagery');
  const terrain = {
    id: hasIon ? 'world' : 'keyless',
    create: hasIon
      ? (request) => createWorldTerrain(ionToken, request)
      : createKeylessTerrain,
  };
  return {
    defaultId: googleTileset ? 'photoreal' : keylessStackId(),
    unknownId: 'photoreal',
    recoveryId: googleTileset ? 'photoreal' : null,
    state: { hasCesiumIonToken: hasIon },
    sources: MAP_STACKS.map((descriptor) => {
      const common =
        esriWithheld && descriptor.id === 'esri-imagery'
          ? {
              descriptor,
              available: false,
              unavailableReason: ESRI_WITHHELD_MESSAGE,
            }
          : {
              descriptor,
              available: !descriptor.requiresIon || hasIon,
              unavailableReason: descriptor.requiresIon
                ? keySetupRequirement('cesium-ion')
                : null,
            };
      if (descriptor.kind === 'photoreal')
        return {
          ...common,
          available: Boolean(googleTileset),
          unavailableReason: photorealUnavailableReason(hasIon || hasGoogle),
          tileset: googleTileset,
        };
      const imagery =
        descriptor.kind === 'ion'
          ? () => createIonImagery(descriptor.style, ionToken)
          : KEYLESS_IMAGERY[descriptor.kind];
      return {
        ...common,
        imagery,
        terrain,
        ...(descriptor.id === 'esri-imagery'
          ? {
              credit: ESRI_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Esri Satellite is unavailable; using OSM',
              },
              tileFailureFallback: {
                id: 'osm',
                threshold: 2,
                message: 'Esri Satellite tile requests failed; using OSM',
              },
            }
          : {}),
      };
    }),
  };
}
