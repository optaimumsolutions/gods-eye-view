/**
 * Epoch AI "AI Data Centers" proxy.
 *
 * The dataset is CC BY 4.0 and served over plain HTTPS, but epoch.ai sends no
 * `access-control-allow-origin` header, so the browser cannot read it
 * directly the way it reads PortWatch, EIA 930 or Open-Meteo. This proxy is
 * the whole reason the `energy-datacenters` bundle can refresh itself instead
 * of going stale between commits.
 *
 * It serves the raw CSV through `/api/epoch/data_centers.csv` (and the
 * timelines and chip quantities alongside it), cached in memory, so the layer
 * can re-rank without a rebuild. Upstream is polled at most once an hour; the
 * tracker publishes far less often than that.
 */
const UPSTREAM = 'https://epoch.ai/data/data_centers';
const TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;

/** Only these files are proxied; anything else is a 404, never a pass-through. */
const ALLOWED = new Map([
  ['data_centers.csv', 'text/csv; charset=utf-8'],
  ['data_center_timelines.csv', 'text/csv; charset=utf-8'],
  ['data_center_chip_quantities.csv', 'text/csv; charset=utf-8'],
]);

export function epochDatacentersProxy() {
  /** @type {Map<string, {at: number, body: string}>} */
  const cache = new Map();
  /** @type {Map<string, Promise<string>>} single-flight per file */
  const inflight = new Map();

  async function load(name) {
    const warm = cache.get(name);
    if (warm && Date.now() - warm.at < TTL_MS) return warm.body;
    const pending = inflight.get(name);
    if (pending) return pending;

    const run = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(`${UPSTREAM}/${name}`, {
          signal: controller.signal,
          headers: { accept: 'text/csv' },
        });
        if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
        const body = await response.text();
        cache.set(name, { at: Date.now(), body });
        return body;
      } finally {
        clearTimeout(timer);
        inflight.delete(name);
      }
    })();
    inflight.set(name, run);
    return run;
  }

  const installMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url || '';
      if (!url.startsWith('/api/epoch/')) return next();
      const name = url.split('?')[0].slice('/api/epoch/'.length);
      const contentType = ALLOWED.get(name);
      if (!contentType) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'unknown Epoch dataset file' }));
        return;
      }
      try {
        const body = await load(name);
        res.statusCode = 200;
        res.setHeader('content-type', contentType);
        // The upstream licence travels with the bytes.
        res.setHeader('x-source', 'Epoch AI, AI Data Centers (CC BY 4.0)');
        res.setHeader('cache-control', 'public, max-age=3600');
        res.end(body);
      } catch (err) {
        const stale = cache.get(name);
        if (stale) {
          // A refresh failure must not cost the caller the copy we hold.
          console.warn(
            `[epoch-datacenters-proxy] refresh failed for ${name} — serving cached copy`,
          );
          res.statusCode = 200;
          res.setHeader('content-type', contentType);
          res.setHeader('x-source', 'Epoch AI, AI Data Centers (CC BY 4.0)');
          res.setHeader('x-stale', '1');
          res.end(stale.body);
          return;
        }
        console.error(`[epoch-datacenters-proxy] request failed for ${name}`);
        res.statusCode = 502;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Epoch dataset unavailable' }));
      }
    });
  };

  return {
    name: 'epoch-datacenters-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
