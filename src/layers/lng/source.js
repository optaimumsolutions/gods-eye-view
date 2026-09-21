import {
  buildLngSnapshot,
  normalizeCargoes,
  normalizeMatrix,
  normalizeRoutes,
  normalizeTerminals,
} from './records.js';

/**
 * The bundled LNG set: four static JSON files under
 * `src/data/local_data/lng/` with their own README and manifest; Vite
 * rewrites the URLs for production base paths. The bundle is read once per
 * layer lifetime and cached, so repeated update ticks cost nothing.
 *
 * Nothing here is live. Every number carries its source's own date — GEM's
 * release, the DOE file's latest month, GIIGNL's report year — and the
 * snapshot's `asOf` line says so (R2, R3).
 */

export const LNG_TERMINALS_URL = new URL(
  '../../data/local_data/lng/terminals.json',
  import.meta.url,
).href;
export const LNG_CARGOES_URL = new URL(
  '../../data/local_data/lng/cargoes.json',
  import.meta.url,
).href;
export const LNG_MATRIX_URL = new URL(
  '../../data/local_data/lng/matrix.json',
  import.meta.url,
).href;
export const LNG_ROUTES_URL = new URL(
  '../../data/local_data/lng/routes.json',
  import.meta.url,
).href;

async function readJson(url, { fetchImpl, signal, label }) {
  signal?.throwIfAborted();
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`LNG ${label} HTTP ${response.status}`);
  const payload = await response.json();
  signal?.throwIfAborted();
  return payload;
}

/** Read the four bundle files as one normalized snapshot. */
export function createBundledLngSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  terminalsUrl = LNG_TERMINALS_URL,
  cargoesUrl = LNG_CARGOES_URL,
  matrixUrl = LNG_MATRIX_URL,
  routesUrl = LNG_ROUTES_URL,
} = {}) {
  let _snapshot = null;

  return {
    label: 'GEM · DOE · EIA · GIIGNL',
    freshnessClass: 'published',
    async getSnapshot({ signal } = {}) {
      if (_snapshot) return _snapshot;
      const [terminals, cargoes, matrix, routes] = await Promise.all([
        readJson(terminalsUrl, { fetchImpl, signal, label: 'terminals' }),
        readJson(cargoesUrl, { fetchImpl, signal, label: 'cargoes' }),
        readJson(matrixUrl, { fetchImpl, signal, label: 'matrix' }),
        readJson(routesUrl, { fetchImpl, signal, label: 'routes' }),
      ]);
      const snapshot = buildLngSnapshot({
        terminals: normalizeTerminals(terminals),
        cargoes: normalizeCargoes(cargoes),
        matrix: normalizeMatrix(matrix),
        routes: normalizeRoutes(routes),
      });
      if (!snapshot) throw new Error('Malformed LNG bundle');
      _snapshot = snapshot;
      return snapshot;
    },
  };
}
