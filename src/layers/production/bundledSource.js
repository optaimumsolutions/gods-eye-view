import { normaliseGulfDataset } from './records.js';

/**
 * The bundled Gulf platform snapshot. A static asset under
 * `src/data/local_data/bsee_gulf/` with its own README and source notes;
 * Vite rewrites the URL for production base paths. Read once per layer
 * lifetime and cached, so repeated update ticks cost nothing. Refresh is a
 * rebuild (`npm run build:gulf-platforms`), never a runtime fetch of BSEE.
 */
export const GULF_PLATFORMS_URL = new URL(
  '../../data/local_data/bsee_gulf/platforms.json',
  import.meta.url,
).href;

export function createBundledGulfSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = GULF_PLATFORMS_URL,
  now = () => Date.now(),
} = {}) {
  let _snapshot = null;

  return {
    label: 'BSEE',
    freshnessClass: 'published',
    async getSnapshot({ signal } = {}) {
      if (_snapshot) return _snapshot;
      signal?.throwIfAborted();
      const response = await fetchImpl(url, { signal });
      if (!response.ok)
        throw new Error(`Gulf platforms HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const snapshot = normaliseGulfDataset(payload, { fetchedAt: now() });
      if (!snapshot) throw new Error('Malformed Gulf platforms dataset');
      _snapshot = snapshot;
      return snapshot;
    },
  };
}
