import { fetchRegionalJson } from './http.js';
import { normalizeRegionalWeather } from '../../../src/data/regionalModel.js';

const WEATHER_EFFECTS_MAX_RESPONSE_BYTES = 512 * 1024;

async function fetchRegionalWeather(point) {
  // OPEN_METEO_ENABLED=0 (the hosted licence profile, docs/LICENCES.md: the
  // free API is non-commercial only): no reading, the same as an outage.
  if (String(process.env.OPEN_METEO_ENABLED || '1').trim() === '0') return null;
  const params = new URLSearchParams({
    latitude: point.latitude.toFixed(5),
    longitude: point.longitude.toFixed(5),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility',
    timezone: 'UTC',
  });
  try {
    const payload = await fetchRegionalJson(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      {
        maxBytes: WEATHER_EFFECTS_MAX_RESPONSE_BYTES,
      },
    );
    return normalizeRegionalWeather(payload);
  } catch {
    return null;
  }
}

export { fetchRegionalWeather };
