import * as Cesium from 'cesium';
import {
  PORT_MIN_BASELINE_TANKERS_PER_DAY,
  formatDeviation,
} from './records.js';

export const PORT_LAYER_ID = 'commodity-ports';
export const PORT_OVERLAY_SOURCE_ID = 'commodity-ports';
export const PORT_OVERLAY_COHORT_LIMIT = 24;
export const PORT_OVERLAY_COLLISION_CAPACITY = 24;

/** Deviation band to accent: the same vocabulary as the chokepoints layer, plus a muted 'thin'. */
const STATUS_CSS = Object.freeze({
  collapse: '#ff3b5c',
  down: '#ffb347',
  normal: '#39d5ff',
  up: '#7cff9b',
  surge: '#c3ff5b',
  thin: '#6f7a88',
  unknown: '#9aa4b2',
});

/** GDACS event classes as PortWatch codes them; 'OT' covers geopolitical closures. */
const EVENT_CSS = Object.freeze({
  TC: '#ffb347',
  EQ: '#ff3b5c',
  FL: '#39d5ff',
  WF: '#ff7a3b',
  DR: '#e6d35b',
  VO: '#ff5b3b',
  OT: '#ff5bd6',
});
const EVENT_LABELS = Object.freeze({
  TC: 'Tropical cyclone',
  EQ: 'Earthquake',
  FL: 'Flood',
  WF: 'Wildfire',
  DR: 'Drought',
  VO: 'Volcano',
  OT: 'Disruption',
});

export function statusCss(status) {
  return STATUS_CSS[status] || STATUS_CSS.unknown;
}

export function statusColor(status) {
  return Cesium.Color.fromCssColorString(statusCss(status));
}

export function eventCss(type) {
  return EVENT_CSS[type] || EVENT_CSS.OT;
}

export function eventColor(type) {
  return Cesium.Color.fromCssColorString(eventCss(type));
}

export function eventLabel(type) {
  return EVENT_LABELS[type] || EVENT_LABELS.OT;
}

/**
 * Marker size in pixels. A floor keeps every port visible; growth with the
 * square root of annual tanker visits keeps Singapore from swallowing the map.
 */
export function portPixelSize(annualTankers) {
  const visits = Number.isFinite(annualTankers)
    ? Math.max(0, annualTankers)
    : 0;
  return Math.min(16, 4 + Math.sqrt(visits) * 0.06);
}

export function portPosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
}

export function disruptionPosition(event) {
  return Cesium.Cartesian3.fromDegrees(event.lon, event.lat);
}

/** A terrain-clamped polyline ring; Cesium drops outlines on clamped polygons. */
export function groundRingPositions(ring) {
  return Cesium.Cartesian3.fromDegreesArray(ring.flat());
}

function formatRate(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
}

function formatCount(value) {
  return Number.isFinite(value)
    ? Math.round(value).toLocaleString('en-US')
    : 'n/a';
}

/** A deviation is shown only where the baseline makes it meaningful. */
export function showsDeviation(row) {
  return row?.status !== 'thin' && row?.status !== 'unknown';
}

const AMBIENT_LABEL_FLAGS = Object.freeze({
  variant: 'label',
  collisionGroup: 'ambient-label',
  paintLane: 'ambient-label',
  interactive: false,
  edgeFade: 'keyhole',
  horizonCull: true,
  terrainOcclusion: false,
  gapPx: 14,
  verticalOnly: true,
  placement: 'above',
});

/** Ambient label: name plus deviation, ranked so busy tanker ports and large moves win collisions. */
export function createPortOverlayEntry(row, position) {
  const deviation = showsDeviation(row)
    ? ` ${formatDeviation(row.deviationPct)}`
    : '';
  const move = showsDeviation(row) ? Math.abs(row.deviationPct) * 50 : 0;
  return {
    ...AMBIENT_LABEL_FLAGS,
    id: `port:${row.id}`,
    position,
    title: `${row.name.toUpperCase()}${deviation}`,
    accent: statusCss(row.status),
    priority: Math.round((row.annualTankers ?? 0) + move),
  };
}

/** Disruption label: always above the port cohort so an open event is never hidden by a busy port. */
export function createDisruptionOverlayEntry(event, position) {
  return {
    ...AMBIENT_LABEL_FLAGS,
    id: `disruption:${event.id}`,
    position,
    title: `${eventLabel(event.type).toUpperCase()} · ${event.name.toUpperCase()}`,
    accent: eventCss(event.type),
    priority: 1_000_000 + (event.affectedPortCount ?? 0),
  };
}

/** Selected port card: the two numbers the deviation is made of, the port's scale, and provenance. */
export function buildSelectedPortCard(row, position) {
  let flow;
  if (showsDeviation(row))
    flow = `${formatRate(row.recentAvg)} tankers/day · last ${row.recentDays}d · baseline ${formatRate(row.baselineAvg)}`;
  else if (row.status === 'thin')
    flow = `${formatRate(row.recentAvg)} tankers/day · under ${PORT_MIN_BASELINE_TANKERS_PER_DAY}/day baseline, deviation not shown`;
  else flow = 'daily port calls unavailable';
  return {
    id: `selected-port:${row.id}`,
    position,
    accent: statusCss(row.status),
    title: showsDeviation(row)
      ? `${row.name.toUpperCase()} · ${formatDeviation(row.deviationPct)} vs ${row.baselineDays}d`
      : row.name.toUpperCase(),
    details: [
      flow,
      `${formatRate(row.recentContainers)} container calls/day · ${formatCount(row.annualTankers)} tanker visits/yr · ${row.country ?? 'n/a'}`,
      `latest ${row.latestDate ?? 'n/a'} · IMF PortWatch · AIS-derived, ~5-day lag`,
    ],
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

function pluralPorts(count) {
  const n = Number.isFinite(count) ? count : 0;
  return `${n} port${n === 1 ? '' : 's'}`;
}

/** Selected disruption card: what it is, when, and how many ports it touches. */
export function buildSelectedDisruptionCard(event, position) {
  return {
    id: `selected-disruption:${event.id}`,
    position,
    accent: eventCss(event.type),
    title: `${eventLabel(event.type).toUpperCase()} · ${event.name.toUpperCase()}`,
    details: [
      event.severity || `${event.alertLevel ?? 'n/a'} alert`,
      `${event.from ?? 'n/a'} to ${event.to ?? 'ongoing'} · ${pluralPorts(event.affectedPortCount)} affected`,
      'IMF PortWatch disruptions · GDACS',
    ],
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the highest priorities, with stable identity as the tie-break. */
export function selectPortOverlayCohort(
  entries,
  limit = PORT_OVERLAY_COHORT_LIMIT,
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

/** JSON-safe port record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  const num = (value) => (Number.isFinite(value) ? value : null);
  return {
    kind: 'port',
    id: String(row.id),
    name: String(row.name),
    country: row.country ?? null,
    lat: num(row.lat),
    lon: num(row.lon),
    tankerCallsPerDayRecent: num(row.recentAvg),
    tankerCallsPerDayBaseline: num(row.baselineAvg),
    deviationPct: num(row.deviationPct),
    status: String(row.status || 'unknown'),
    annualTankerVisits: num(row.annualTankers),
    latestDate: row.latestDate ?? null,
  };
}

/** JSON-safe disruption record for the analyst query engine. */
export function mapDisruptionAnalystRecord(event) {
  const num = (value) => (Number.isFinite(value) ? value : null);
  return {
    kind: 'disruption',
    id: String(event.id),
    name: String(event.name),
    type: eventLabel(event.type),
    severity: event.severity ?? null,
    country: event.country ?? null,
    from: event.from ?? null,
    to: event.to ?? null,
    lat: num(event.lat),
    lon: num(event.lon),
    affectedPortCount: num(event.affectedPortCount),
  };
}
