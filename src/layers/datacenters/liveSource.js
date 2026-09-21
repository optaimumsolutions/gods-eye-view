/**
 * Live reading source for `energy-datacenters`: one EIA grid request and one
 * batched Open-Meteo request per refresh, both browser-direct and keyless.
 *
 * The two feeds are independent. A failed grid request must not cost the cards
 * their weather line, and neither failure may cost them the bundled Epoch
 * facts, which is why this source is separate from the bundled one and returns
 * partial results with per-feed errors rather than throwing.
 */
import {
  eiaGridUrl,
  normalizeGridDemand,
  normalizeSiteWeather,
  openMeteoUrl,
} from './live.js';

/** Grid data is hourly and weather moves slowly; ten minutes is plenty. */
export const DATACENTER_LIVE_TTL_MS = 10 * 60_000;

const EMPTY = Object.freeze({
  grid: new Map(),
  weather: new Map(),
  fetchedAt: null,
  errors: Object.freeze({ grid: null, weather: null }),
});

async function readJson(fetchImpl, url, signal) {
  const response = await fetchImpl(url, { signal });
  if (!response?.ok) {
    throw new Error(`HTTP ${response?.status ?? '?'}`);
  }
  return response.json();
}

/**
 * @param {object} options
 * @param {Function} [options.fetchImpl] injected for tests
 * @param {number} [options.ttlMs] how long a reading stays warm
 */
export function createDatacenterLiveSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  ttlMs = DATACENTER_LIVE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  let _cache = null;
  let _inFlight = null;

  async function load(sites, signal) {
    const fetchedAt = now();
    const authorities = sites
      .map((s) => s.balancingAuthority)
      .filter((id) => typeof id === 'string' && id);
    const gridUrl = eiaGridUrl(authorities, { now: fetchedAt });
    const weatherUrl = openMeteoUrl(sites);

    const [gridResult, weatherResult] = await Promise.allSettled([
      gridUrl ? readJson(fetchImpl, gridUrl, signal) : Promise.resolve(null),
      weatherUrl
        ? readJson(fetchImpl, weatherUrl, signal)
        : Promise.resolve(null),
    ]);

    const reading = Object.freeze({
      grid:
        gridResult.status === 'fulfilled'
          ? normalizeGridDemand(gridResult.value, { fetchedAt })
          : new Map(),
      weather:
        weatherResult.status === 'fulfilled'
          ? normalizeSiteWeather(weatherResult.value, sites, { fetchedAt })
          : new Map(),
      fetchedAt,
      errors: Object.freeze({
        grid:
          gridResult.status === 'rejected'
            ? String(gridResult.reason?.message ?? gridResult.reason)
            : null,
        weather:
          weatherResult.status === 'rejected'
            ? String(weatherResult.reason?.message ?? weatherResult.reason)
            : null,
      }),
    });
    return reading;
  }

  return {
    label: 'EIA 930 · Open-Meteo',

    /** Cached live readings for the given rows; never throws. */
    async getReadings(sites, { signal, force = false } = {}) {
      const rows = Array.isArray(sites) ? sites : [];
      if (!rows.length) return EMPTY;
      if (!force && _cache && now() - _cache.fetchedAt < ttlMs) return _cache;
      if (_inFlight) return _inFlight;
      _inFlight = load(rows, signal)
        .then((reading) => {
          // Keep the previous reading if this one came back entirely empty, so
          // a blip does not blank lines the operator was already reading.
          if (reading.grid.size === 0 && reading.weather.size === 0 && _cache) {
            return _cache;
          }
          _cache = reading;
          return reading;
        })
        .catch(() => _cache ?? EMPTY)
        .finally(() => {
          _inFlight = null;
        });
      return _inFlight;
    },

    /** The last successful reading without triggering a fetch. */
    peek() {
      return _cache ?? EMPTY;
    },
  };
}
