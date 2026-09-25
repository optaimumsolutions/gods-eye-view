import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';
import { createPortWatchChokepointSource } from '../layers/chokepoints/source.js';
import {
  createOracleChokepointSource,
  createPreferredChokepointSource,
} from '../layers/chokepoints/oracleSource.js';
import { createPortWatchPortSource } from '../layers/ports/source.js';
import { createBundledDatacenterSource } from '../layers/datacenters/source.js';
import { createBundledGasSource } from '../layers/gasFlows/bundledSource.js';
import { createBundledGulfSource } from '../layers/production/bundledSource.js';
import { createBundledLngSource } from '../layers/lng/source.js';
import { createBundledOnshoreSource } from '../layers/onshore/bundledSource.js';
import { createWithheldSource, isWithheld } from '../hosting/withheld.js';

/** Why the hosted site shows no PortWatch layer (docs/LICENCES.md). */
export const PORTWATCH_WITHHELD_MESSAGE =
  'Withheld on the hosted site until the IMF permits commercial reuse of PortWatch data (docs/LICENCES.md)';

/** Construct the existing reference feeds independently of application setup. */
export function createReferenceSources() {
  // Both PortWatch layers, and the oracle store's copy of the same series.
  const portWatchWithheld = isWithheld('portwatch');
  return {
    earthquakes: createUsgsEarthquakeSource(),
    cables: createBundledCableSource(),
    // Row 13 M3: the oracle store's copy when /api/oracle/ answers, else PortWatch
    chokepoints: portWatchWithheld
      ? createWithheldSource('IMF PortWatch', PORTWATCH_WITHHELD_MESSAGE)
      : createPreferredChokepointSource({
          primary: createOracleChokepointSource(),
          fallback: createPortWatchChokepointSource(),
        }),
    ports: portWatchWithheld
      ? createWithheldSource('IMF PortWatch', PORTWATCH_WITHHELD_MESSAGE)
      : createPortWatchPortSource(),
    datacenters: createBundledDatacenterSource(),
    gasFlows: createBundledGasSource(),
    gulfPlatforms: createBundledGulfSource(),
    lng: createBundledLngSource(),
    onshoreWilliston: createBundledOnshoreSource({ region: 'williston' }),
  };
}
