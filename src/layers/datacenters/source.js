import { normalizeDatacenterDataset } from './records.js';

/**
 * The bundled US data center snapshot. Static asset under
 * `src/data/local_data/us_datacenters/` with its own README and source
 * notes; Vite rewrites the URL for production base paths. The bundle is
 * read once per layer lifetime and cached, so repeated update ticks cost
 * nothing.
 */
export const US_DATACENTERS_URL = new URL(
  '../../data/local_data/us_datacenters/datacenters.json',
  import.meta.url,
).href;

/** Read the bundled dataset as one normalized, ranked snapshot. */
export function createBundledDatacenterSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = US_DATACENTERS_URL,
} = {}) {
  let _snapshot = null;

  return {
    label: 'Epoch AI',
    async getSnapshot({ signal } = {}) {
      if (_snapshot) return _snapshot;
      signal?.throwIfAborted();
      const response = await fetchImpl(url, { signal });
      if (!response.ok)
        throw new Error(`US data centers HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const snapshot = normalizeDatacenterDataset(payload);
      if (!snapshot) throw new Error('Malformed US data center dataset');
      _snapshot = snapshot;
      return snapshot;
    },
  };
}
