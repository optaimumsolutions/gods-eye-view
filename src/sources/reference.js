import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';
import { createPortWatchChokepointSource } from '../layers/chokepoints/source.js';
import { createPortWatchPortSource } from '../layers/ports/source.js';
import { createBundledDatacenterSource } from '../layers/datacenters/source.js';
import { createBundledGasSource } from '../layers/gasFlows/bundledSource.js';
import { createBundledGulfSource } from '../layers/production/bundledSource.js';
import { createBundledLngSource } from '../layers/lng/source.js';

/** Construct the existing reference feeds independently of application setup. */
export function createReferenceSources() {
  return {
    earthquakes: createUsgsEarthquakeSource(),
    cables: createBundledCableSource(),
    chokepoints: createPortWatchChokepointSource(),
    ports: createPortWatchPortSource(),
    datacenters: createBundledDatacenterSource(),
    gasFlows: createBundledGasSource(),
    gulfPlatforms: createBundledGulfSource(),
    lng: createBundledLngSource(),
  };
}
