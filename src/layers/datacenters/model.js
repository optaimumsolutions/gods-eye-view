import * as Cesium from 'cesium';
import {
  DATACENTER_LAYER_ID,
  formatCount,
  formatMw,
  formatUsdB,
} from './records.js';

export { DATACENTER_LAYER_ID };
export const DATACENTER_OVERLAY_SOURCE_ID = 'energy-datacenters';
export const DATACENTER_OVERLAY_COHORT_LIMIT = 24;
export const DATACENTER_OVERLAY_COLLISION_CAPACITY = 32;

/**
 * Three depths, by camera height. Global: a bare label per site. Regional:
 * a short card. Local: the campus itself, with its footprint, its on-site
 * plants and a hint that the marker opens the dossier. Clicking at any depth
 * opens the dossier; from far away the click also flies the camera down.
 */
export const DATACENTER_REGIONAL_HEIGHT_M = 2_500_000;
export const DATACENTER_LOCAL_HEIGHT_M = 300_000;
export const DATACENTER_TIER_GLOBAL = 'global';
export const DATACENTER_TIER_REGIONAL = 'regional';
export const DATACENTER_TIER_LOCAL = 'local';
/** Above this height a click flies the camera down to the campus first. */
export const DATACENTER_FLY_FROM_HEIGHT_M = 400_000;
/** Where a click lands the camera: low enough to read a campus footprint and its plants. */
export const DATACENTER_FLY_TO_HEIGHT_M = 18_000;
export const DATACENTER_ZOOM_OUT_HEIGHT_M = 2_500_000;
export const DATACENTER_FLY_DURATION_S = 2.0;
/** Hover picks are event-driven and throttled; a still pointer costs nothing. */
export const DATACENTER_HOVER_THROTTLE_MS = 120;

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return DATACENTER_TIER_GLOBAL;
  if (cameraHeightM < DATACENTER_LOCAL_HEIGHT_M) return DATACENTER_TIER_LOCAL;
  if (cameraHeightM < DATACENTER_REGIONAL_HEIGHT_M)
    return DATACENTER_TIER_REGIONAL;
  return DATACENTER_TIER_GLOBAL;
}

/** Status to accent: the shared commodity vocabulary (blue steady, green growing). */
const STATUS_CSS = Object.freeze({
  operating: '#39d5ff',
  expanding: '#7cff9b',
  unknown: '#9aa4b2',
});
const ASSET_CSS = '#ffb347';

export function statusCss(status) {
  return STATUS_CSS[status] || STATUS_CSS.unknown;
}

export function statusColor(status) {
  return Cesium.Color.fromCssColorString(statusCss(status));
}

export function assetColor() {
  return Cesium.Color.fromCssColorString(ASSET_CSS);
}

/**
 * Marker size grows with the square root of IT power so a gigawatt does not
 * swallow the map; the local tier and a hover each scale it up so the thing
 * to click is never in doubt.
 */
export function markerPixelSize(itPowerMw, { tier, hovered = false } = {}) {
  const mw = Number.isFinite(itPowerMw) ? Math.max(0, itPowerMw) : 0;
  let size = 8 + Math.sqrt(mw) * 0.35;
  if (tier === DATACENTER_TIER_LOCAL) size *= 1.25;
  if (hovered) size *= 1.35;
  return Math.round(size);
}

/** Ground-ring radius in metres: a campus-scale ring that reads at regional zoom. */
export function ringRadiusMeters(itPowerMw) {
  const mw = Number.isFinite(itPowerMw) ? Math.max(0, itPowerMw) : 0;
  return 3_000 + Math.sqrt(mw) * 350;
}

/**
 * Ground circle (64 segments) for a terrain-clamped polyline ring. Cesium
 * drops outlines on clamped ellipses, so the ring is a ground polyline.
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

export function datacenterPosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
}

export function assetPosition(asset) {
  return Cesium.Cartesian3.fromDegrees(asset.lon, asset.lat);
}

/** A campus footprint ring as world positions; closed so the outline joins. */
export function footprintPositions(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const flat = [];
  for (const [lon, lat] of ring) flat.push(lon, lat);
  const [lon0, lat0] = ring[0];
  const [lonN, latN] = ring[ring.length - 1];
  if (lon0 !== lonN || lat0 !== latN) flat.push(lon0, lat0);
  return Cesium.Cartesian3.fromDegreesArray(flat);
}

const LINE_MAX = 110;

function clampLine(line) {
  const s = String(line).replace(/\s+/g, ' ').trim();
  return s.length > LINE_MAX ? `${s.slice(0, LINE_MAX - 1)}…` : s;
}

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

export function onSiteSummary(row) {
  const gen = row.power.onSiteGeneration;
  if (!gen.type) return 'on-site n/a';
  if (gen.capacityMw === 0) return 'grid only';
  const now = gen.capacityMw !== null ? formatMw(gen.capacityMw) : null;
  const planned =
    gen.plannedCapacityMw !== null
      ? `→ ${formatMw(gen.plannedCapacityMw)}`
      : null;
  return joinParts(['on-site gas', now, planned], ' ');
}

export function expansionLine(row) {
  if (row.plannedItPowerMw === null || row.plannedItPowerMw <= row.itPowerMw)
    return 'no further expansion tracked';
  return joinParts([
    `planned ${formatMw(row.plannedItPowerMw)} IT`,
    row.plannedFacilityPowerMw !== null
      ? `${formatMw(row.plannedFacilityPowerMw)} facility`
      : null,
    row.plannedDate ? `by ${row.plannedDate}` : null,
  ]);
}

function baseEntry(row, position) {
  return {
    id: String(row.id),
    position,
    accent: statusCss(row.status),
    priority: Math.round(row.itPowerMw),
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

/** Ambient entry for the site at the current depth. */
export function createDatacenterOverlayEntry(row, position, tier) {
  const base = baseEntry(row, position);
  if (tier === DATACENTER_TIER_LOCAL) {
    return {
      ...base,
      variant: 'card',
      title: row.name.toUpperCase(),
      details: localCardLines(row).map(clampLine),
    };
  }
  if (tier === DATACENTER_TIER_REGIONAL) {
    return {
      ...base,
      variant: 'card',
      title: `${row.name.toUpperCase()} · ${formatMw(row.itPowerMw)} IT`,
      details: regionalCardLines(row).map(clampLine),
    };
  }
  return {
    ...base,
    variant: 'label',
    title: `${row.name.toUpperCase()} · ${formatMw(row.itPowerMw)} IT`,
  };
}

/** Regional card: who, where it is going, how it is powered. */
export function regionalCardLines(row) {
  return [
    joinParts([
      row.owner ? `owner ${row.owner}` : null,
      row.users.length ? `users ${row.users.join(', ')}` : null,
    ]),
    joinParts([
      row.facilityPowerMw !== null
        ? `facility ${formatMw(row.facilityPowerMw)}`
        : null,
      expansionLine(row),
    ]),
    joinParts([row.power.gridUtility, onSiteSummary(row)]),
  ];
}

/** Local card: the campus at a glance, and the hint that the marker opens the dossier. */
export function localCardLines(row) {
  return [
    joinParts([
      row.status,
      row.rank ? `#${row.rank} US` : null,
      `${formatMw(row.itPowerMw)} IT now`,
      row.plannedItPowerMw !== null && row.plannedItPowerMw > row.itPowerMw
        ? `→ ${formatMw(row.plannedItPowerMw)} ${row.plannedDate ? `by ${row.plannedDate}` : 'planned'}`
        : null,
    ]),
    joinParts([
      row.owner ? `owner ${row.owner}` : null,
      row.h100e !== null ? `${formatCount(row.h100e)} H100e` : null,
    ]),
    joinParts([row.power.gridUtility, onSiteSummary(row)]),
    'click the marker for the dossier',
  ];
}

/** Ambient label for an on-site asset (a turbine plant, a substation). */
export function createAssetOverlayEntry(row, asset, position) {
  const capacity = joinParts(
    [
      asset.capacityMw !== null ? formatMw(asset.capacityMw) : null,
      asset.plannedCapacityMw !== null
        ? `→ ${formatMw(asset.plannedCapacityMw)}`
        : null,
    ],
    ' ',
  );
  return {
    id: `asset:${row.id}:${asset.id}`,
    position,
    variant: 'label',
    title: joinParts([asset.name.toUpperCase(), capacity]),
    accent: ASSET_CSS,
    priority: Math.round((asset.capacityMw ?? 0) + 1),
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 12,
    verticalOnly: true,
    placement: 'above',
  };
}

/**
 * Selected card: compact on purpose. The full record, the timeline and the
 * sources live in the dossier drawer; the map card carries the headline.
 */
export function buildSelectedDatacenterCard(row, position) {
  const details = [
    joinParts([
      joinParts([row.city, row.state], ', '),
      row.project ? `project ${row.project}` : null,
      row.status,
      row.rank ? `#${row.rank} US by current IT power` : null,
    ]),
    joinParts([
      row.owner ? `owner ${row.owner}` : null,
      row.users.length ? `users ${row.users.join(', ')}` : null,
    ]),
    joinParts([
      row.facilityPowerMw !== null
        ? `facility ${formatMw(row.facilityPowerMw)}`
        : null,
      expansionLine(row),
    ]),
    joinParts([
      row.power.gridUtility,
      row.power.gridOperator ? `(${row.power.gridOperator})` : null,
      onSiteSummary(row),
    ]),
    joinParts([
      row.capexUsdB !== null ? `capex ${formatUsdB(row.capexUsdB)}` : null,
      row.h100e !== null ? `${formatCount(row.h100e)} H100e` : null,
      'dossier open ▸',
    ]),
  ];
  return {
    id: `selected-datacenter:${row.id}`,
    position,
    accent: statusCss(row.status),
    title: `${row.name.toUpperCase()} · ${formatMw(row.itPowerMw)} IT`,
    details: details.filter(Boolean).map(clampLine),
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the largest sites, with stable identity as the tie-break. */
export function selectDatacenterOverlayCohort(
  entries,
  limit = DATACENTER_OVERLAY_COHORT_LIMIT,
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
