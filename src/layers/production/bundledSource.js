import { normaliseGulfDataset } from './records.js';
import { normaliseContributors } from './contributorsView.js';

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

/** Row 14: the Gulf's main contributors, built beside the platforms. */
export const GULF_CONTRIBUTORS_URL = new URL(
  '../../data/local_data/bsee_gulf/contributors.json',
  import.meta.url,
).href;

export function createBundledGulfSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = GULF_PLATFORMS_URL,
  contributorsUrl = GULF_CONTRIBUTORS_URL,
  now = () => Date.now(),
} = {}) {
  let _snapshot = null;

  /** Optional: without contributors the layer keeps its platforms and no region card. */
  async function readContributors(signal) {
    if (!contributorsUrl) return null;
    try {
      const response = await fetchImpl(contributorsUrl, { signal });
      return response.ok ? await response.json() : null;
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  }

  return {
    label: 'BSEE',
    freshnessClass: 'published',
    async getSnapshot({ signal } = {}) {
      if (_snapshot) return _snapshot;
      signal?.throwIfAborted();
      const [payload, contributorsRaw] = await Promise.all([
        fetchImpl(url, { signal }).then((response) => {
          if (!response.ok)
            throw new Error(`Gulf platforms HTTP ${response.status}`);
          return response.json();
        }),
        readContributors(signal),
      ]);
      signal?.throwIfAborted();
      const snapshot = normaliseGulfDataset(payload, { fetchedAt: now() });
      if (!snapshot) throw new Error('Malformed Gulf platforms dataset');
      const contributors = normaliseContributors(contributorsRaw);
      _snapshot = Object.freeze({
        ...snapshot,
        contributors:
          contributors?.currentMonth === snapshot.currentMonth
            ? contributors
            : null,
      });
      return _snapshot;
    },
  };
}
