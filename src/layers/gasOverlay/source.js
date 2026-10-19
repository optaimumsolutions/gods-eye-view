import { sharedOracleFetch } from '../../data/sharedFetch.js';
import {
  buildGasOverlaySnapshot,
  normalizeBundles,
  normalizeOverlayPayload,
} from './records.js';

/** The oracle route the proxy relays (tools/oracle_api.py, FR-N18 P3). */
export const PIPELINE_OVERLAY_URL = '/api/oracle/pipeline-overlay';

/**
 * The committed P1/P2 bundles. Static assets with their own README and
 * source notes; Vite rewrites the URLs for production base paths.
 */
export const GAS_OVERLAY_URLS = Object.freeze({
  lines: new URL(
    '../../data/local_data/gas_overlay/lines.json',
    import.meta.url,
  ).href,
  stations: new URL(
    '../../data/local_data/gas_overlay/stations.json',
    import.meta.url,
  ).href,
  points: new URL(
    '../../data/local_data/gas_overlay/points.csv',
    import.meta.url,
  ).href,
});

/**
 * Read the committed geometry once and the oracle's daily overlay through
 * the shared memo on every poll. The route being absent (the desk preview
 * has no console; the hosted guard answers only signed-in traffic) is not an
 * error: the snapshot degrades to bundle-only and says why.
 */
export function createGasOverlaySource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  oracleFetch = sharedOracleFetch,
  urls = GAS_OVERLAY_URLS,
} = {}) {
  let _bundles = null;
  async function readBundles(signal) {
    if (_bundles) return _bundles;
    const [lines, stations, pointsCsv] = await Promise.all([
      fetchImpl(urls.lines, { signal }).then((r) => {
        if (!r.ok) throw new Error(`Gas overlay lines HTTP ${r.status}`);
        return r.json();
      }),
      fetchImpl(urls.stations, { signal }).then((r) => {
        if (!r.ok) throw new Error(`Gas overlay stations HTTP ${r.status}`);
        return r.json();
      }),
      fetchImpl(urls.points, { signal }).then((r) => {
        if (!r.ok) throw new Error(`Gas overlay points HTTP ${r.status}`);
        return r.text();
      }),
    ]);
    const bundles = normalizeBundles({ lines, stations, pointsCsv });
    if (!bundles) throw new Error('Malformed gas overlay bundle');
    _bundles = bundles;
    return bundles;
  }
  return {
    label: 'pipeline postings (FERC 18 CFR 284.13)',
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const bundles = await readBundles(signal);
      let payload = null;
      let error = null;
      try {
        const result = await oracleFetch.getJson(PIPELINE_OVERLAY_URL, {
          signal,
        });
        payload = result.ok ? normalizeOverlayPayload(result.body) : null;
        if (!payload)
          error = result.ok
            ? 'pipeline-overlay payload malformed'
            : `pipeline-overlay HTTP ${result.status}`;
      } catch (e) {
        if (signal?.aborted) throw e;
        error = e?.message || 'pipeline-overlay unreachable';
      }
      signal?.throwIfAborted();
      return buildGasOverlaySnapshot(bundles, payload, { error });
    },
  };
}
