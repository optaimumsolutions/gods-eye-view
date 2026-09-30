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
import {
  createBundledGulfSource,
  GULF_CONTRIBUTORS_URL,
} from '../layers/production/bundledSource.js';
import { createBundledLngSource } from '../layers/lng/source.js';
import {
  createBundledOnshoreSource,
  ONSHORE_CONTRIBUTORS,
} from '../layers/onshore/bundledSource.js';
import { createSupplyBoardSource } from '../layers/supplyBoard/source.js';
import { createOpenMeteoEnsembleSource } from '../layers/weather/source.js';
import {
  createOracleWeatherSource,
  createPreferredWeatherSource,
} from '../layers/weather/oracleSource.js';
import { createWithheldSource, isWithheld } from '../hosting/withheld.js';

/** Why the hosted site shows no PortWatch layer (docs/LICENCES.md). */
export const PORTWATCH_WITHHELD_MESSAGE =
  'Withheld on the hosted site until the IMF permits commercial reuse of PortWatch data (docs/LICENCES.md)';

/** Why the hosted site shows no Appalachia wells (docs/LICENCES.md). */
export const PA_WELLS_WITHHELD_MESSAGE =
  'Withheld on the hosted site until PA DEP confirms its well coordinates may be shown (docs/LICENCES.md)';

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
    onshoreAppalachia: isWithheld('pa-dep-wells')
      ? createWithheldSource('PA DEP', PA_WELLS_WITHHELD_MESSAGE)
      : createBundledOnshoreSource({ region: 'appalachia' }),
    // Row 14 M3, region 3 (Texas RRC; hosted by the founder's decision)
    onshorePermianDelaware: createBundledOnshoreSource({
      region: 'permian-delaware',
    }),
    onshorePermianMidland: createBundledOnshoreSource({
      region: 'permian-midland',
    }),
    onshorePermianPlatform: createBundledOnshoreSource({
      region: 'permian-platform',
    }),
    // Row 14 M2: the built regions' contributors + the store's supply board
    supplyBoard: createSupplyBoardSource({
      regions: [
        { label: 'Appalachia', url: ONSHORE_CONTRIBUTORS.appalachia },
        // The Permian's three Texas layers print as one region.
        {
          label: 'Delaware',
          group: 'Permian TX',
          url: ONSHORE_CONTRIBUTORS['permian-delaware'],
        },
        {
          label: 'Midland',
          group: 'Permian TX',
          url: ONSHORE_CONTRIBUTORS['permian-midland'],
        },
        {
          label: 'Permian platform',
          group: 'Permian TX',
          url: ONSHORE_CONTRIBUTORS['permian-platform'],
        },
        { label: 'Williston', url: ONSHORE_CONTRIBUTORS.williston },
        { label: 'Gulf', url: GULF_CONTRIBUTORS_URL },
      ],
    }),
    // Row 3: AIFS ENS through Open-Meteo, browser-direct, keyless; the free
    // API is non-commercial, so the hosted profile withholds it (LICENCES.md)
    // Hosted: the oracle store alone (ECMWF open data ingested nightly; a
    // stale run still shows, stamped). Laptop: the oracle route first when
    // a console is proxied and fresh, else Open-Meteo browser-direct.
    weatherForecast: isWithheld('open-meteo')
      ? createOracleWeatherSource({ maxLagDays: Infinity })
      : createPreferredWeatherSource({
          primary: createOracleWeatherSource(),
          fallback: createOpenMeteoEnsembleSource(),
        }),
  };
}
