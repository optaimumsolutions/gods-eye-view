/**
 * The CONUS forecast field from the Oil Oracle store (row 3 M4, plan
 * §11.8.10.2): `/api/oracle/weather-field` — the manifest, then one grid
 * per (lead, stat). The oracle's FR-W11 reduce writes it in the nightly
 * AIFS pass from ECMWF open data (CC BY 4.0). Portable by rule.
 */
import { decodeGrid } from './fieldModel.js';

export const ORACLE_FIELD_URL = '/api/oracle/weather-field';
export const FIELD_SOURCE_LABEL =
  'ECMWF AIFS ENS (open data) via Oil Oracle store';

export function normalizeFieldManifest(payload) {
  if (!payload || payload.error || !payload.init || !payload.grid) return null;
  const grid = payload.grid;
  if (
    ![grid.rows, grid.cols, grid.lat0, grid.lon0, grid.latS, grid.lonE].every(
      Number.isFinite,
    )
  )
    return null;
  return {
    init: payload.init,
    initialisedAt: new Date(
      Date.parse(payload.observedAt || `${payload.init}T00:00:00Z`),
    ).toISOString(),
    fetchedAt: payload.fetchedAt || null,
    days: payload.days || [],
    leads: payload.leads || [],
    stats: payload.stats || [],
    scale: payload.scale || {},
    units: payload.units || {},
    members: payload.members ?? null,
    freezeF: payload.freezeF ?? 32,
    grid: {
      rows: grid.rows,
      cols: grid.cols,
      north: grid.lat0,
      west: grid.lon0,
      south: grid.latS,
      east: grid.lonE,
      di: grid.di,
    },
    provider: payload.provider || null,
  };
}

export function createOracleFieldSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = ORACLE_FIELD_URL,
} = {}) {
  let _manifest = null;
  const _grids = new Map();
  let _requests = 0;

  async function readJson(u, signal, label) {
    signal?.throwIfAborted();
    _requests += 1;
    const response = await fetchImpl(u, { signal });
    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
    const payload = await response.json();
    signal?.throwIfAborted();
    if (payload?.error) throw new Error(`${label}: ${payload.error}`);
    return payload;
  }

  return {
    label: FIELD_SOURCE_LABEL,
    /** The manifest; a new init empties the grid cache. */
    async getManifest({ signal } = {}) {
      const manifest = normalizeFieldManifest(
        await readJson(url, signal, 'Oil Oracle weather-field'),
      );
      if (!manifest)
        throw new Error('Malformed Oil Oracle weather-field manifest');
      if (_manifest?.init !== manifest.init) _grids.clear();
      _manifest = manifest;
      return manifest;
    },
    /** One grid (Float32Array in the unit) for a lead and stat, cached per init. */
    async getGrid(lead, stat, { signal } = {}) {
      const key = `${_manifest?.init}:${lead}:${stat}`;
      if (_grids.has(key)) return _grids.get(key);
      const payload = await readJson(
        `${url}?day=D%2B${lead}&stat=${encodeURIComponent(stat)}`,
        signal,
        'Oil Oracle weather-field grid',
      );
      const values = decodeGrid(payload);
      if (
        !values ||
        values.length !==
          (_manifest?.grid.rows ?? 0) * (_manifest?.grid.cols ?? 0)
      )
        throw new Error('Malformed Oil Oracle weather-field grid');
      const grid = {
        values,
        lead: payload.lead,
        day: payload.day,
        stat,
        min: payload.min * (payload.scale || 1),
        max: payload.max * (payload.scale || 1),
      };
      _grids.set(key, grid);
      return grid;
    },
    getStats: () => ({
      requests: _requests,
      init: _manifest?.init ?? null,
      cached: _grids.size,
    }),
  };
}
