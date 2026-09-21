import { normaliseGasCrossings, normaliseGasNetwork } from './records.js';

/**
 * The bundled gas substrate: EIA transmission linework and NACEI border
 * crossings. Static assets under `src/data/local_data/eia_energy/` with their
 * own README and source notes; Vite rewrites the URLs for production base
 * paths. Each bundle is read once per layer lifetime and cached, so repeated
 * update ticks cost nothing.
 *
 * Nothing in here is current, and nothing in here carries a number. The
 * volumes arrive separately, at runtime, from the server-side EIA provider —
 * this module exists so the map has somewhere to put them.
 */

export const GAS_NETWORK_URL = new URL(
  '../../data/local_data/eia_energy/gas-network.json',
  import.meta.url,
).href;

export const GAS_CROSSINGS_URL = new URL(
  '../../data/local_data/eia_energy/gas-crossings.json',
  import.meta.url,
).href;

async function readBundle(url, { fetchImpl, signal, label, normalise }) {
  signal?.throwIfAborted();
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  const payload = await response.json();
  signal?.throwIfAborted();
  const snapshot = normalise(payload);
  if (!snapshot) throw new Error(`Malformed ${label} dataset`);
  return snapshot;
}

/**
 * Read the two bundles as normalized snapshots.
 *
 * The network and the crossings are cached independently and fetched
 * independently, because the layer must still render the crossings when the
 * 3.7 MB network fails — R4.29's "degrade, never fail" applies to the
 * substrate as much as to the key.
 */
export function createBundledGasSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  networkUrl = GAS_NETWORK_URL,
  crossingsUrl = GAS_CROSSINGS_URL,
} = {}) {
  let _network = null;
  let _crossings = null;

  const source = {
    label: 'EIA · NACEI',
    freshnessClass: 'published',

    async getNetwork({ signal } = {}) {
      if (_network) return _network;
      _network = await readBundle(networkUrl, {
        fetchImpl,
        signal,
        label: 'Gas transmission network',
        normalise: normaliseGasNetwork,
      });
      return _network;
    },

    async getCrossings({ signal } = {}) {
      if (_crossings) return _crossings;
      _crossings = await readBundle(crossingsUrl, {
        fetchImpl,
        signal,
        label: 'Gas border crossings',
        normalise: normaliseGasCrossings,
      });
      return _crossings;
    },

    /**
     * Both bundles, with the network's failure isolated. A missing network
     * degrades the layer to crossings-only and says so; a missing crossings
     * bundle is fatal, because without it there is nothing to draw a number on.
     */
    async getSnapshot({ signal } = {}) {
      // Called through the closure, not through `this`: a caller that
      // destructures the source — `const { getSnapshot } = createBundledGasSource()`
      // — would otherwise get a TypeError on the first read.
      const crossings = await source.getCrossings({ signal });
      let network = null;
      let networkError = null;
      try {
        network = await source.getNetwork({ signal });
      } catch (error) {
        if (signal?.aborted) throw error;
        networkError = error instanceof Error ? error.message : String(error);
      }
      return {
        crossings,
        network,
        // 'partial' when the network fails but the crossings load (R4.55).
        feed: networkError ? 'partial' : 'nominal',
        networkError,
      };
    },
  };

  return source;
}
