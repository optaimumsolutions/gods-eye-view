import { CHOKEPOINT_GAZETTEER } from './gazetteer.js';
import { buildChokepointSnapshot } from './records.js';

/**
 * Chokepoint transits from the Oil Oracle store (row 13 M3, plan §15 R13.14).
 * The hosted site proxies `/api/oracle/*` to the oracle console, whose
 * `chokepoints` route serves the same IMF PortWatch daily rows the oracle
 * ingests weekly. Reading them here puts the oracle's own numbers on the
 * globe, so the card and the console agree (G13.5). Live PortWatch stays the
 * fallback: with no console, an older console without the route, or a store
 * whose newest day is too old, the layer reads PortWatch directly.
 */
export const ORACLE_CHOKEPOINTS_URL = '/api/oracle/chokepoints';
export const ORACLE_SOURCE_LABEL = 'IMF PortWatch via Oil Oracle store';
/** Same window the direct PortWatch source reads. */
const WINDOW_DAYS = 120;
/**
 * PortWatch publishes with about a five-day lag and the oracle ingests it
 * weekly, so a healthy store is at most about twelve days behind. Older than
 * this (a laptop's stale mirror) and live PortWatch wins.
 */
export const ORACLE_MAX_LAG_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function finite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * The route's `chokepoints[].series` rows (`[date, nTotal, nTanker]`) as the
 * daily rows `buildChokepointSnapshot` takes. One malformed entry rejects the
 * payload, like the PortWatch normalizer.
 */
export function normalizeOracleChokepoints(payload) {
  if (!Array.isArray(payload?.chokepoints)) return null;
  const rows = [];
  for (const point of payload.chokepoints) {
    const id = String(point?.id ?? '').trim();
    if (!id || !Array.isArray(point.series)) return null;
    for (const entry of point.series) {
      if (!Array.isArray(entry) || !DATE_RE.test(String(entry[0]))) return null;
      rows.push({
        id,
        date: entry[0],
        tankers: finite(entry[2]),
        tankerCapacity: null,
        total: finite(entry[1]),
      });
    }
  }
  return rows;
}

export function createOracleChokepointSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  points = CHOKEPOINT_GAZETTEER,
  url = ORACLE_CHOKEPOINTS_URL,
  maxLagDays = ORACLE_MAX_LAG_DAYS,
} = {}) {
  return {
    label: ORACLE_SOURCE_LABEL,
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(`${url}?days=${WINDOW_DAYS}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok)
        throw new Error(`Oil Oracle chokepoints HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeOracleChokepoints(payload);
      if (!rows?.length) throw new Error('Malformed Oil Oracle chokepoints');
      const snapshot = buildChokepointSnapshot(points, rows);
      const lagDays =
        (now() - Date.parse(`${snapshot.latestDate}T00:00:00Z`)) / 86_400_000;
      if (!(lagDays <= maxLagDays))
        throw new Error(
          `Oil Oracle chokepoints stale: newest day ${snapshot.latestDate}`,
        );
      return { ...snapshot, source: ORACLE_SOURCE_LABEL };
    },
  };
}

/**
 * Try `primary`, then `fallback`. The snapshot names whichever answered in
 * `source`, so the card says where its numbers came from. An abort is never
 * swallowed into the fallback.
 */
export function createPreferredChokepointSource({
  primary,
  fallback,
  onFallback = (error) =>
    console.info(
      `[Data:Chokepoints] Oil Oracle route unavailable, using PortWatch: ${error.message}`,
    ),
}) {
  let warned = false;
  return {
    label: fallback.label,
    async getSnapshot(options = {}) {
      try {
        return await primary.getSnapshot(options);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (!warned) {
          warned = true;
          onFallback(error);
        }
      }
      const snapshot = await fallback.getSnapshot(options);
      return { ...snapshot, source: snapshot.source ?? fallback.label };
    },
  };
}
