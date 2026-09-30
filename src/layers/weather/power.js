/**
 * Row 3 M7 (docs/COMMODITIES-PLAN.md §11.8.15 D7.3): the power-demand line
 * of a census-division marker reads the EIA-930 REGIONAL aggregates (CAL …
 * TEX) — demand now and the day-ahead forecast — through the same keyless,
 * CORS-open series endpoint the data-center cards read, one request per
 * refresh for every division. A division that maps to two regions carries
 * both readings and the card names each; nothing is summed into a fake
 * division total.
 *
 * Portable by rule: no Cesium, no DOM, no browser globals.
 */
import { eiaGridUrl, normalizeGridDemand } from '../datacenters/live.js';

export const POWER_SOURCE_LABEL = 'EIA-930 Hourly Electric Grid Monitor';

/** The EIA-930 regions the rows quote, deduplicated and sorted. */
export function regionsOf(rows) {
  const ids = new Set();
  for (const row of rows || [])
    for (const id of Array.isArray(row?.eia930) ? row.eia930 : [])
      if (typeof id === 'string' && id) ids.add(id);
  return [...ids].sort();
}

/**
 * Attach `row.power = [{ id, name, demandMw, observedAt, forecastMw,
 * forecastValidAt }]` to every division row from one series payload.
 * Regions the payload lacks are left out (the card prints what it has).
 */
export function attachPower(rows, payload, { fetchedAt = Date.now() } = {}) {
  const grid = normalizeGridDemand(payload, { fetchedAt });
  let attached = 0;
  for (const row of rows || []) {
    if (!Array.isArray(row?.eia930)) continue;
    row.power = row.eia930
      .map((id) => grid.get(id))
      .filter(Boolean)
      .map((g) => ({
        id: g.id,
        name: g.name,
        demandMw: g.demandMw,
        observedAt: g.observedAt,
        forecastMw: g.forecastMw,
        forecastValidAt: g.forecastValidAt,
        source: POWER_SOURCE_LABEL,
      }));
    attached += row.power.length;
  }
  return attached;
}

/**
 * Read the regions' demand once and attach it; a failure leaves the rows
 * untouched and is returned as a message so the layer can record it.
 */
export async function readPower(
  rows,
  {
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = Date.now(),
    signal,
  } = {},
) {
  const regions = regionsOf(rows);
  if (!regions.length) return { attached: 0, error: null, requests: 0 };
  const url = eiaGridUrl(regions, { now });
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`EIA-930 HTTP ${response.status}`);
    const payload = await response.json();
    signal?.throwIfAborted();
    return {
      attached: attachPower(rows, payload, { fetchedAt: now }),
      error: null,
      requests: 1,
    };
  } catch (e) {
    if (signal?.aborted) throw e;
    return {
      attached: 0,
      error: e?.message || 'EIA-930 unavailable',
      requests: 1,
    };
  }
}
