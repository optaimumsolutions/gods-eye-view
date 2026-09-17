import * as Cesium from 'cesium';
import { formatDeviation } from './records.js';

export const CHOKEPOINT_LAYER_ID = 'commodity-chokepoints';
export const CHOKEPOINT_OVERLAY_SOURCE_ID = 'commodity-chokepoints';
export const CHOKEPOINT_OVERLAY_COHORT_LIMIT = 32;
export const CHOKEPOINT_OVERLAY_COLLISION_CAPACITY = 32;

/** Deviation band to accent: the same amber/red vocabulary the vessels layer uses for tankers. */
const STATUS_CSS = Object.freeze({
  collapse: '#ff3b5c',
  down: '#ffb347',
  normal: '#39d5ff',
  up: '#7cff9b',
  surge: '#c3ff5b',
  unknown: '#9aa4b2',
});

export function statusCss(status) {
  return STATUS_CSS[status] || STATUS_CSS.unknown;
}

export function statusColor(status) {
  return Cesium.Color.fromCssColorString(statusCss(status));
}

/**
 * Ground-ring radius in metres. A floor keeps every strait visible at global
 * zoom; growth with the square root of the baseline tanker rate keeps Malacca
 * from swallowing the Bering Strait.
 */
export function ringRadiusMeters(baselineAvg) {
  const rate = Number.isFinite(baselineAvg) ? Math.max(0, baselineAvg) : 0;
  return 25_000 + Math.sqrt(rate) * 12_000;
}

/** Inner-disc scale: the share of baseline flow still moving, clamped for legibility. */
export function flowRatio(row) {
  if (!Number.isFinite(row?.recentAvg) || !row?.baselineAvg) return 1;
  return Math.max(0.15, Math.min(2, row.recentAvg / row.baselineAvg));
}

/**
 * Ground circle (64 segments) for a terrain-clamped polyline ring. Cesium drops
 * outlines on clamped ellipses with a one-time warning, so the visible ring is a
 * ground polyline and the translucent disc stays an ellipse fill.
 */
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

export function chokepointPosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
}

function formatRate(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
}

/** Ambient label: name plus deviation, ranked so the largest moves win collisions. */
export function createChokepointOverlayEntry(row, position) {
  return {
    id: String(row.id),
    position,
    variant: 'label',
    title: `${row.name.toUpperCase()} ${formatDeviation(row.deviationPct)}`,
    accent: statusCss(row.status),
    priority: Math.round(
      Math.abs(row.deviationPct ?? 0) * 100 + (row.baselineAvg ?? 0),
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

/** Selected detail card: the two numbers the deviation is made of, plus provenance. */
export function buildSelectedChokepointCard(row, position) {
  return {
    id: `selected-chokepoint:${row.id}`,
    position,
    accent: statusCss(row.status),
    title: `${row.name.toUpperCase()} · ${formatDeviation(row.deviationPct)} vs ${row.baselineDays}d`,
    details: [
      `${formatRate(row.recentAvg)} tankers/day · last ${row.recentDays}d · baseline ${formatRate(row.baselineAvg)}`,
      `latest ${row.latestDate ?? 'n/a'} · IMF PortWatch · AIS-derived, ~5-day lag`,
    ],
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the largest deviations, with stable identity as the tie-break. */
export function selectChokepointOverlayCohort(
  entries,
  limit = CHOKEPOINT_OVERLAY_COHORT_LIMIT,
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

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  const num = (value) => (Number.isFinite(value) ? value : null);
  return {
    id: String(row.id),
    name: String(row.name),
    lat: num(row.lat),
    lon: num(row.lon),
    tankersPerDayRecent: num(row.recentAvg),
    tankersPerDayBaseline: num(row.baselineAvg),
    deviationPct: num(row.deviationPct),
    status: String(row.status || 'unknown'),
    latestDate: row.latestDate ?? null,
  };
}
