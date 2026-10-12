/**
 * Live inputs for the port dossier (docs/COMMODITIES-PLAN.md §9.6.3): the
 * weather at the berth from Open-Meteo (forecast plus marine, browser-direct,
 * cached fifteen minutes per port), the headlines from the port news proxy,
 * and the camera slot: a registered camera's frame through the CCTV proxy
 * when the proxy reports an upstream image, otherwise the newest NASA GIBS
 * true-colour tile over the port, plus the nearest road camera from the CCTV
 * catalog within three kilometres. Every request takes the controller's
 * abort signal; a failed refresh returns the stale copy as `partial`.
 */
import {
  PORT_ROAD_CAMERA_MAX_KM,
  PORT_SATELLITE_LAYERS,
  normalizePortWeather,
  satelliteTileUrl,
  tileForCoordinate,
} from '../layers/ports/dossier.js';
import {
  FRAME_ENDPOINT,
  SOURCE_ENDPOINT,
} from '../layers/cctv/sourcePolicy.js';

export const PORT_WEATHER_CACHE_MS = 15 * 60_000;
export const PORT_WEATHER_STALE_MS = 3 * 60 * 60_000;
export const PORT_SOURCES_CACHE_MS = 30 * 60_000;
export const PORT_NEWS_ENDPOINT = '/api/port-news';
const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const SATELLITE_LAYER_LABELS = Object.freeze({
  VIIRS_SNPP_CorrectedReflectance_TrueColor: 'VIIRS SNPP',
  MODIS_Terra_CorrectedReflectance_TrueColor: 'MODIS Terra',
});

export function haversineKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function bearingDeg(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const y = Math.sin((bLon - aLon) * rad) * Math.cos(bLat * rad);
  const x =
    Math.cos(aLat * rad) * Math.sin(bLat * rad) -
    Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLon - aLon) * rad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function readJson(fetchImpl, url, signal, label) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  return response.json();
}

/** The nearest image-feed road camera in the CCTV catalog within the limit, or null. */
export function nearestRoadCamera(
  sources,
  dossier,
  limitKm = PORT_ROAD_CAMERA_MAX_KM,
) {
  let best = null;
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!source || source.sourceKind === 'port-webcam') continue;
    if (source.feedType && source.feedType !== 'image') continue;
    if (!Number.isFinite(source.lat) || !Number.isFinite(source.lon)) continue;
    const distanceKm = haversineKm(
      dossier.lat,
      dossier.lon,
      source.lat,
      source.lon,
    );
    if (distanceKm > limitKm) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = {
        cameraId: source.id,
        name: source.name || source.id,
        operator: source.provider || '',
        distanceKm,
        bearingDeg: bearingDeg(
          dossier.lat,
          dossier.lon,
          source.lat,
          source.lon,
        ),
        src: `${FRAME_ENDPOINT}/${encodeURIComponent(source.id)}`,
      };
    }
  }
  return best;
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {(blob: Blob) => string} [options.createObjectUrl] blob URL factory for frames
 * @param {(url: string) => void} [options.revokeObjectUrl]
 */
export function createPortDossierLiveHooks({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  createObjectUrl = (blob) => URL.createObjectURL(blob),
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
  newsEndpoint = PORT_NEWS_ENDPOINT,
} = {}) {
  const weatherCache = new Map();
  let sourcesCache = null;
  let frameUrl = null;
  let roadUrl = null;

  function releaseFrame() {
    if (frameUrl) revokeObjectUrl(frameUrl);
    if (roadUrl) revokeObjectUrl(roadUrl);
    frameUrl = null;
    roadUrl = null;
  }

  /**
   * One frame from the CCTV proxy, but only when the proxy says it came from
   * the camera's own upstream. The proxy answers HTTP 200 for a Street View or
   * a synthetic placeholder too, and a placeholder captioned as the port's
   * camera is exactly the lie §9.4's third goal forbids.
   */
  async function upstreamFrameBlobUrl(cameraId, signal) {
    const response = await fetchImpl(
      `${FRAME_ENDPOINT}/${encodeURIComponent(cameraId)}`,
      { signal, cache: 'no-store' },
    );
    const source = response.headers?.get?.('x-cctv-source') || '';
    if (!response.ok || source !== 'upstream-image') return null;
    const blob = await response.blob();
    if (!blob || !blob.size) return null;
    return createObjectUrl(blob);
  }

  async function weather(dossier, signal) {
    const cached = weatherCache.get(dossier.portid);
    const at = now();
    if (cached && at - cached.fetchedAt <= PORT_WEATHER_CACHE_MS) return cached;
    try {
      const point = new URLSearchParams({
        latitude: String(dossier.lat),
        longitude: String(dossier.lon),
        timezone: 'UTC',
        forecast_days: '2',
      });
      const forecastParams = new URLSearchParams(point);
      forecastParams.set(
        'hourly',
        'wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,precipitation',
      );
      forecastParams.set('wind_speed_unit', 'kn');
      const marineParams = new URLSearchParams(point);
      marineParams.set('hourly', 'wave_height,wave_period,wave_direction');
      const [forecast, marine] = await Promise.all([
        readJson(
          fetchImpl,
          `${OPEN_METEO_FORECAST}?${forecastParams}`,
          signal,
          'Open-Meteo forecast',
        ),
        // The marine model has no cell over an inland berth (Houston): waves read n/a, the rest stands.
        readJson(
          fetchImpl,
          `${OPEN_METEO_MARINE}?${marineParams}`,
          signal,
          'Open-Meteo marine',
        ).catch(() => null),
      ]);
      const reading = normalizePortWeather({ forecast, marine, now: at });
      if (!reading) throw new Error('Open-Meteo returned no hourly forecast');
      const value = { reading, issuedAt: at, fetchedAt: at };
      weatherCache.set(dossier.portid, value);
      return value;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (cached && at - cached.fetchedAt <= PORT_WEATHER_STALE_MS)
        return { ...cached, stale: true };
      throw error;
    }
  }

  async function news(dossier, signal) {
    const response = await fetchImpl(
      `${newsEndpoint}?portid=${encodeURIComponent(dossier.portid)}`,
      { signal },
    );
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok)
      throw new Error(
        payload?.error || `Port headlines HTTP ${response.status}`,
      );
    if (!payload || !Array.isArray(payload.articles))
      throw new Error('Port headlines: malformed response');
    return { ...payload, fetchedAt: now() };
  }

  async function sources(signal) {
    const at = now();
    if (sourcesCache && at - sourcesCache.fetchedAt <= PORT_SOURCES_CACHE_MS)
      return sourcesCache.list;
    const payload = await readJson(
      fetchImpl,
      SOURCE_ENDPOINT,
      signal,
      'CCTV sources',
    );
    const list = Array.isArray(payload?.sources) ? payload.sources : [];
    sourcesCache = { list, fetchedAt: at };
    return list;
  }

  async function registeredFrame(dossier, signal) {
    for (const cameraId of dossier.cameraIds || []) {
      try {
        const url = await upstreamFrameBlobUrl(cameraId, signal);
        if (!url) continue;
        releaseFrame();
        frameUrl = url;
        const camera = (await sources(signal).catch(() => [])).find(
          (entry) => entry.id === cameraId,
        );
        return {
          cameraId,
          name: camera?.name || cameraId,
          operator: camera?.provider || 'registered camera',
          licence: camera?.license || '',
          frameAt: now(),
          fetchedAt: now(),
          src: frameUrl,
        };
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    return null;
  }

  async function satelliteTile(dossier, signal) {
    const zoom = dossier.satelliteZoom;
    const tile = tileForCoordinate(dossier.lat, dossier.lon, zoom);
    const at = now();
    for (const daysBack of [1, 2]) {
      const date = isoDay(at - daysBack * 86_400_000);
      for (const layer of PORT_SATELLITE_LAYERS) {
        const url = satelliteTileUrl({ layer, date, ...tile });
        try {
          const response = await fetchImpl(url, { signal, method: 'GET' });
          const type = response.headers?.get?.('content-type') || '';
          if (!response.ok || !type.startsWith('image/')) continue;
          return {
            date,
            layer,
            layerLabel: SATELLITE_LAYER_LABELS[layer] || layer,
            url,
            zoom,
            tile,
          };
        } catch (error) {
          if (signal?.aborted) throw error;
        }
      }
    }
    return null;
  }

  /**
   * The nearby road camera, resolved to a frame the proxy actually got from
   * that camera. A thumbnail the panel captions with a road's name must not
   * quietly be the proxy's Street View or placeholder fallback.
   */
  async function resolveRoadCamera(list, dossier, signal) {
    const nearest = nearestRoadCamera(list, dossier);
    if (!nearest) return null;
    try {
      const url = await upstreamFrameBlobUrl(nearest.cameraId, signal);
      if (!url) return null;
      if (roadUrl) revokeObjectUrl(roadUrl);
      roadUrl = url;
      return { ...nearest, src: roadUrl };
    } catch (error) {
      if (signal?.aborted) throw error;
      return null;
    }
  }

  async function cameras(dossier, signal) {
    const [frame, list] = await Promise.all([
      registeredFrame(dossier, signal),
      sources(signal).catch(() => []),
    ]);
    const road = await resolveRoadCamera(list, dossier, signal);
    if (frame) return { frame, road };
    const satellite = await satelliteTile(dossier, signal);
    if (satellite) return { satellite, road };
    return {
      error: 'no camera frame and no satellite tile for the last two days',
      road,
    };
  }

  return Object.freeze({
    weather,
    news,
    cameras,
    dispose: releaseFrame,
  });
}
