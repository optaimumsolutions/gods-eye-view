/**
 * @file One shared JSON fetch per URL for the `/api/oracle/*` routes several
 * layers read (FR-D29, docs/DATA-MAP.md §8 P4 item 7).
 *
 * The five onshore production layers each read `/api/oracle/basins`, and the
 * weather layer and the forecast service each read
 * `/api/oracle/weather-forecast`; without this one refresh tick fetched the
 * same payload up to five times. Concurrent callers share the in-flight
 * request, and a successful body is reused for `ttlMs`. A failure (network,
 * HTTP error, bad JSON, or a 200 body carrying `error`, which is how the
 * oracle routes say the store lacks a table) is never kept: callers waiting on it see it, the next
 * caller fetches again. A store write pushed by the event hub calls
 * `invalidate()` (src/hosting/liveRefresh.js) so the live refresh that
 * follows never reads a body from before the write.
 *
 * The request itself is not tied to any one caller's AbortSignal (one layer
 * switching off must not cancel its siblings' read); each caller's signal
 * only stops that caller from waiting.
 *
 * Portable by rule: no Cesium, no DOM, no Node core modules.
 *
 * @module data/sharedFetch
 */

/** @const {number} Ms a successful body is reused. */
export const SHARED_FETCH_TTL_MS = 60_000;

function defaultFetch(...args) {
  return globalThis.fetch(...args);
}

/** Wait for `promise`, rejecting early with the signal's reason on abort. */
function untilAborted(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * A memo of JSON reads keyed by URL.
 *
 * `getJson(url, { signal, headers })` resolves `{ ok, status, body }`: `body`
 * is the parsed JSON when `ok`, else null (the caller words its own HTTP
 * error). Only `ok` results without an `error` field are kept.
 *
 * @param {Object} [options]
 * @param {Function} [options.fetchImpl] - fetch seam for tests.
 * @param {number} [options.ttlMs] - How long a successful body is reused.
 * @param {() => number} [options.now] - Clock seam for tests.
 */
export function createSharedFetch({
  fetchImpl = defaultFetch,
  ttlMs = SHARED_FETCH_TTL_MS,
  now = () => Date.now(),
} = {}) {
  /** url -> { promise, settledAt|null } */
  const memo = new Map();
  let requests = 0;

  function start(url, headers) {
    requests += 1;
    const entry = { promise: null, settledAt: null };
    entry.promise = (async () => {
      const response = await fetchImpl(url, { headers });
      if (!response.ok)
        return Object.freeze({
          ok: false,
          status: response.status,
          body: null,
        });
      const body = await response.json();
      return Object.freeze({ ok: true, status: response.status, body });
    })();
    entry.promise.then(
      (result) => {
        // Invalidated (or replaced) while in flight: nothing to keep.
        if (memo.get(url) !== entry) return;
        if (result.ok && !result.body?.error) entry.settledAt = now();
        else memo.delete(url);
      },
      () => {
        if (memo.get(url) === entry) memo.delete(url);
      },
    );
    memo.set(url, entry);
    return entry;
  }

  return {
    async getJson(
      url,
      { signal, headers = { Accept: 'application/json' } } = {},
    ) {
      signal?.throwIfAborted();
      let entry = memo.get(url);
      if (entry && entry.settledAt !== null && now() - entry.settledAt >= ttlMs)
        entry = null;
      if (!entry) entry = start(url, headers);
      return untilAborted(entry.promise, signal);
    },
    /** Drop every kept body (a store write landed); in-flight reads are not kept. */
    invalidate() {
      memo.clear();
    },
    getStats() {
      return { requests, cached: memo.size };
    },
  };
}

/** The one memo the browser's default-fetch oracle sources share. */
export const sharedOracleFetch = createSharedFetch();

/** Drop the shared oracle memo; the live-refresh hook. */
export function invalidateSharedOracleFetch() {
  sharedOracleFetch.invalidate();
}
