/**
 * History shards for the onshore production family (docs/COMMODITIES-PLAN.md
 * §14, R12.6, O1). A region's index carries every facility's current, prior
 * and last-year readings and a ten-year summary; the full monthly series live
 * in 256 shard files keyed by a hash of the facility id, fetched on demand
 * when a dossier opens. The builder and the browser share this module so the
 * shard a facility lands in can only be computed one way.
 *
 * Per O1 (decided with milestone 1, option a): shards are built from the
 * archived upstream files and are not committed — a deployment without them
 * degrades to the index (the dossier says so), and `--check` reproduces them.
 *
 * Portable by rule: no Cesium, no DOM, no Node built-ins.
 */

/**
 * 1,024 rather than the plan's 256: with 24,154 Williston wells over 120
 * months the largest of 256 shards weighed 125 KB gzip and of 512 still
 * 71 KB, against the 64 KB budget (R12.6); 1,024 keeps the largest near
 * 40 KB. A region carries its own count in the bundle, so a bigger basin
 * can go further without touching this file.
 */
export const SHARD_COUNT = 1024;

/** FNV-1a, 32 bit, over the UTF-16 code units of the id. */
export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** `33053039010000` → `1a7`: the hex shard name for a facility id, zero-padded to the count's width. */
export function shardFor(id, count = SHARD_COUNT) {
  const n = Math.max(1, Math.floor(count));
  const width = Math.max(2, (n - 1).toString(16).length);
  return (fnv1a32(id) % n).toString(16).padStart(width, '0');
}

/** `data/onshore/williston/history/a7.json` relative to the app base. */
export function shardPath(regionId, shard) {
  return `data/onshore/${regionId}/history/${shard}.json`;
}

/**
 * A memoising shard reader. `getHistory(id)` resolves to the facility's series
 * `{ months, series: { oil, water, days, gas, gasSold, flared, runs } }`, or
 * null when the shard is absent (404) or does not carry the facility. Shards
 * are fetched once; concurrent requests for one shard share the fetch.
 */
export function createShardStore({
  regionId,
  baseUrl = '/',
  fetchImpl = (...args) => globalThis.fetch(...args),
  count = SHARD_COUNT,
} = {}) {
  if (!regionId) throw new TypeError('shard store requires a region id');
  const base = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  const shards = new Map();
  let available = null;

  async function loadShard(shard, signal) {
    if (shards.has(shard)) return shards.get(shard);
    const pending = (async () => {
      const response = await fetchImpl(`${base}${shardPath(regionId, shard)}`, {
        signal,
      });
      if (response.status === 404) {
        available = available === null ? false : available;
        return null;
      }
      if (!response.ok)
        throw new Error(`history shard HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || !payload.facilities)
        throw new Error('malformed history shard');
      available = true;
      return payload;
    })();
    shards.set(shard, pending);
    try {
      return await pending;
    } catch (error) {
      shards.delete(shard);
      throw error;
    }
  }

  return {
    shardFor: (id) => shardFor(id, count),
    /** null = not yet known; false = the first shard asked for was missing. */
    isAvailable: () => available,
    async getHistory(id, { signal } = {}) {
      const payload = await loadShard(shardFor(id, count), signal);
      const entry = payload?.facilities?.[String(id)];
      if (!entry) return null;
      return { months: payload.months, series: entry };
    },
  };
}
