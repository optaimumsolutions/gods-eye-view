import * as Cesium from 'cesium';
import { GALE_MPH, dayAtLead } from './records.js';

export const WEATHER_LAYER_ID = 'weather-forecast';
export const WEATHER_OVERLAY_SOURCE_ID = 'weather-forecast';
export const WEATHER_OVERLAY_COHORT_LIMIT = 16;
export const WEATHER_OVERLAY_COLLISION_CAPACITY = 16;
/** §11.8.5.3: 30 km + 8 km per °F of spread, clamped to 200 km. */
export const RING_BASE_M = 30_000;
export const RING_PER_DEG_F_M = 8_000;
export const RING_MAX_M = 200_000;
/** §11.8.15 D7.1: a division's point scales with its share of US gas deliveries. */
export const MARKER_PX_BASE = 9;
export const MARKER_PX_PER_GAS_SHARE = 40;

/**
 * §11.8.5.2 / A-4: the shared six colour slots relabelled for weather, cold
 * first because a cold surprise is the supply shock and a warm one the
 * demand shock (the chokepoints' collapse → surge order).
 */
const BAND_CSS = Object.freeze({
  'much-colder': '#ff3b5c',
  colder: '#ffb347',
  'near-normal': '#39d5ff',
  warmer: '#7cff9b',
  'much-warmer': '#c3ff5b',
  unknown: '#9aa4b2',
});
export const BAND_LABELS = Object.freeze({
  'much-colder': 'much colder (≤ −15°F vs normal)',
  colder: 'colder (≤ −7°F)',
  'near-normal': 'near normal',
  warmer: 'warmer (≥ +7°F)',
  'much-warmer': 'much warmer (≥ +15°F)',
  unknown: 'no normal',
});

export function bandCss(band) {
  return BAND_CSS[band] || BAND_CSS.unknown;
}

/**
 * Colour with confidence applied (§11.8.14.3): alpha is the product of the
 * lead and spread components; saturation follows it toward the basemap grey
 * so the colour vocabulary keeps its hue and only loses weight.
 */
export function bandColor(band, alpha = 1) {
  const base = Cesium.Color.fromCssColorString(bandCss(band));
  const grey = Cesium.Color.fromCssColorString('#6b7280');
  const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const mixed = Cesium.Color.lerp(
    grey,
    base,
    0.4 + 0.6 * a,
    new Cesium.Color(),
  );
  return mixed.withAlpha(a);
}

export function ringRadiusMeters(spreadF) {
  const s = Number.isFinite(spreadF) ? Math.max(0, spreadF) : 0;
  return Math.min(RING_MAX_M, RING_BASE_M + s * RING_PER_DEG_F_M);
}

/** §11.8.5.4: the disc's filled share of the ring for the selected window. */
export function discShare(row) {
  const w = row?.window;
  if (!w) return 0;
  if (row.kind === 'basin') return (w.freezeDays ?? 0) / 15;
  if (row.kind === 'region') return (w.heatingDays ?? 0) / 15;
  if (row.kind === 'division') {
    // D7.2: heating season fills with HDD days, cooling season with CDD days
    const days = (row.days || []).length || 14;
    return heatingSeason(row)
      ? (w.heatingDays ?? 0) / days
      : (w.coolingDays ?? 0) / days;
  }
  return (w.galeDays ?? 0) / 7;
}

/** A division's window is a heating window when HDD14 ≥ CDD14. */
export function heatingSeason(row) {
  const w = row?.window || {};
  return (w.hdd14 ?? 0) >= (w.cdd14 ?? 0);
}

/** Point size in pixels: basins/regions/Gulf fixed; divisions by gas share. */
export function markerPixelSize(row) {
  if (row?.kind !== 'division') return MARKER_PX_BASE;
  const share = Number.isFinite(row.gasShare) ? Math.max(0, row.gasShare) : 0;
  return Math.round(MARKER_PX_BASE + MARKER_PX_PER_GAS_SHARE * share);
}

/** The spread that sizes a marker's ring: TMIN, else the division's TMEAN. */
export function ringSpread(day) {
  return day?.tmin?.spread ?? day?.tmean?.spread ?? day?.hdd?.spread ?? null;
}

/** Degree days rounded, `n/a` when the store has none. */
function dd(v) {
  return Number.isFinite(v) ? `${Math.round(v)}` : 'n/a';
}

/** Anomaly with its sign and what it is measured on. */
function anomalyText(day) {
  if (day?.anomalyF == null) return 'no normal';
  return `${day.anomalyF > 0 ? '+' : ''}${day.anomalyF}°F vs ERA5 normal${day.anomalyOf ? ` (${day.anomalyOf})` : ''}`;
}

/**
 * §11.8.15 D7.2 / D7.3: the three sourced lines of a division card — degree
 * days, the direct mean temperature, and the EIA-930 region(s) it quotes by
 * name. Each line ends with its source; nothing is summed across regions.
 */
export function divisionCardLines(row, lead) {
  const day = selectedDay(row, lead);
  const w = row.window || {};
  const lines = [
    `HDD14 ${dd(w.hdd14)} · CDD14 ${dd(w.cdd14)} · ${heatingSeason(row) ? `${w.heatingDays ?? 0} heating` : `${w.coolingDays ?? 0} cooling`} days of ${(row.days || []).length} · ECMWF AIFS ENS via Oil Oracle`,
  ];
  if (day?.tmean?.p50 != null)
    lines.push(
      `mean temp D+${day.lead} p50 ${f0(day.tmean.p50)}°F [p10 ${f0(day.tmean.p10)} · p90 ${f0(day.tmean.p90)}] · ${anomalyText(day)} · ECMWF AIFS ENS via Oil Oracle`,
    );
  else if (day)
    lines.push(
      `mean temp D+${day.lead} n/a in this run · ${anomalyText(day)} · ECMWF AIFS ENS via Oil Oracle`,
    );
  lines.push(powerLine(row));
  return lines;
}

/**
 * The EIA-930 line: `power demand · TEX 74,392 MW at 18Z · day-ahead 63,440 · EIA-930`.
 * Names the region it quotes (D7.3); a division with two regions prints both;
 * no reading yet prints the regions it will quote.
 */
export function powerLine(row) {
  const regions = Array.isArray(row?.eia930) ? row.eia930 : [];
  const readings = (row?.power || []).filter((p) => p && p.demandMw != null);
  if (!readings.length)
    return `power demand · EIA-930 ${regions.join(' + ') || 'region'} · no reading yet`;
  const parts = readings.map((p) => {
    const at = p.observedAt ? `${String(p.observedAt).slice(11, 13)}Z` : '';
    const ahead =
      p.forecastMw == null
        ? ''
        : ` · day-ahead ${Math.round(p.forecastMw).toLocaleString('en-US')}`;
    return `${p.id} ${Math.round(p.demandMw).toLocaleString('en-US')} MW at ${at}${ahead}`;
  });
  return `power demand · ${parts.join(' · ')} · EIA-930`;
}

export function weatherPosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
}

/** Ground circle as a clamped polyline (Cesium drops clamped-ellipse outlines). */
export function groundCirclePositions(lon, lat, radiusMeters, segments = 64) {
  const metresPerDegLat = 111_320;
  const metresPerDegLon =
    metresPerDegLat * Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dLat = radiusMeters / metresPerDegLat;
  const dLon = radiusMeters / metresPerDegLon;
  const degrees = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    degrees.push(lon + Math.cos(angle) * dLon, lat + Math.sin(angle) * dLat);
  }
  return Cesium.Cartesian3.fromDegreesArray(degrees);
}

function f0(v) {
  return Number.isFinite(v) ? `${Math.round(v)}` : 'n/a';
}

/** The selected day's readings on a row, clamped to the run's horizon. */
export function selectedDay(row, lead) {
  return dayAtLead(row, lead);
}

/** §11.8.5.5 ambient label: `PERMIAN · d+3 · p10 18°F · 4 frz`. */
export function ambientLabel(row, lead) {
  const day = selectedDay(row, lead);
  const head = `${row.name.toUpperCase()} · D+${day?.lead ?? lead}`;
  if (!day) return `${head} · awaiting run`;
  if (row.kind === 'basin')
    return `${head} · p10 ${f0(day.tmin.p10)}°F · ${row.window.freezeDays ?? 0} frz`;
  if (row.kind === 'region') return `${head} · HDD14 ${f0(row.window.hdd14)}`;
  if (row.kind === 'division')
    return heatingSeason(row)
      ? `${head} · HDD14 ${f0(row.window.hdd14)} · gas ${Math.round((row.gasShare ?? 0) * 100)}%`
      : `${head} · CDD14 ${f0(row.window.cdd14)} · gas ${Math.round((row.gasShare ?? 0) * 100)}%`;
  return `${head} · wind p90 ${f0(day.wind.p90)}`;
}

/** §11.8.7.1 hover lines (three): title / stamp / headline. */
export function hoverLines(row, lead, formatAsOf) {
  const day = selectedDay(row, lead);
  if (!day) return [row.name.toUpperCase(), 'awaiting run', ''];
  let headline;
  if (row.kind === 'basin')
    headline = `p10 ${f0(day.tmin.p10)}°F · p50 ${f0(day.tmin.p50)}°F · ${row.window.freezeDays} freeze days (heuristic ${row.freezeF}°F)`;
  else if (row.kind === 'region')
    headline = `HDD14 ${f0(row.window.hdd14)} · CDD14 ${f0(row.window.cdd14)} · p50 mean ${f0((day.tmin.p50 + day.tmax.p50) / 2)}°F`;
  else if (row.kind === 'division')
    headline = `HDD14 ${f0(row.window.hdd14)} · CDD14 ${f0(row.window.cdd14)} · mean p50 ${f0(day.tmean?.p50)}°F · gas share ${Math.round((row.gasShare ?? 0) * 100)}%`;
  else {
    const wave = row.marine?.find((m) => m.date === day.date)?.waveMax;
    headline = `wind p90 ${f0(day.wind.p90)} mph · wave ${Number.isFinite(wave) ? wave.toFixed(1) : 'n/a'} m · ${row.window.galeDays} gale days (≥ ${GALE_MPH} mph)`;
  }
  return [
    row.name.toUpperCase(),
    `${formatAsOf(day.observation)} (D+${day.lead})`,
    headline,
  ];
}

/** Ambient overlay entry; the largest anomalies win collisions. */
export function createWeatherOverlayEntry(row, lead, position) {
  const day = selectedDay(row, lead);
  return {
    id: String(row.id),
    position,
    variant: 'label',
    title: ambientLabel(row, lead),
    accent: bandCss(day?.band),
    priority: Math.round(
      Math.abs(day?.anomalyF ?? 0) * 100 +
        (row.kind === 'basin' ? 50 : 0) +
        (row.kind === 'division' ? (row.gasShare ?? 0) * 100 : 0),
    ),
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
  };
}

/** The confidence line every card carries (§11.8.14.4). */
export function confidenceLine(day) {
  const c = day?.confidence;
  if (!c) return 'confidence n/a';
  const pct = Math.round(c.alpha * 100);
  const skill = `lead D+${day.lead} skill ${c.leadConfidence.toFixed(2)} (${c.skillLabel}${c.skillVintage ? `, vintage ${c.skillVintage}` : ''})`;
  const spread =
    c.spreadPercentile == null
      ? 'spread n/a'
      : `spread p${Math.round(c.spreadPercentile * 100)}`;
  return `confidence ${pct}% · ${skill} · ${spread}`;
}

/** Selected card on the overlay: headline, the day's percentiles, provenance, confidence. */
export function buildSelectedWeatherCard(row, lead, position, formatAsOf) {
  const day = selectedDay(row, lead);
  const [title, stamp, headline] = hoverLines(row, lead, formatAsOf);
  const details = [stamp, headline];
  if (day && row.kind === 'division') {
    details.push(...divisionCardLines(row, lead));
    details.push(confidenceLine(day));
    details.push(`${row.source} · ${row.members} members · click for the fan`);
  } else if (day) {
    details.push(
      `p10 ${f0(day.tmin.p10)} · p50 ${f0(day.tmin.p50)} · p90 ${f0(day.tmin.p90)}°F TMIN · spread ${f0(day.tmin.spread)}°F · ${day.anomalyF == null ? 'no normal' : `${day.anomalyF > 0 ? '+' : ''}${day.anomalyF}°F vs ERA5 normal`}`,
    );
    details.push(confidenceLine(day));
    details.push(`${row.source} · ${row.members} members · click for the fan`);
  }
  return {
    id: `selected-weather:${row.id}`,
    position,
    accent: bandCss(day?.band),
    title: `${title} · ${day ? BAND_LABELS[day.band] : 'awaiting run'}`,
    details,
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

export function selectWeatherOverlayCohort(
  entries,
  limit = WEATHER_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries
    .slice()
    .sort(
      (a, b) =>
        b.priority - a.priority || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, cap);
}
