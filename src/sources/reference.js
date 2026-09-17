import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';
import { createPortWatchChokepointSource } from '../layers/chokepoints/source.js';
import { createPortWatchPortSource } from '../layers/ports/source.js';
import { createBundledDatacenterSource } from '../layers/datacenters/source.js';

/** Construct the existing reference feeds independently of application setup. */
export function createReferenceSources() {
  return {
    earthquakes: createUsgsEarthquakeSource(),
    cables: createBundledCableSource(),
    chokepoints: createPortWatchChokepointSource(),
    ports: createPortWatchPortSource(),
    datacenters: createBundledDatacenterSource(),
  };
}
