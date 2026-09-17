import * as Cesium from 'cesium';
import {
  DATACENTER_LAYER_ID,
  formatCount,
  formatInt,
  formatMmcfd,
  formatMw,
  formatUsdB,
} from './records.js';

export { DATACENTER_LAYER_ID };
export const DATACENTER_OVERLAY_SOURCE_ID = 'energy-datacenters';
export const DATACENTER_OVERLAY_COHORT_LIMIT = 24;
export const DATACENTER_OVERLAY_COLLISION_CAPACITY = 24;

/**
 * Detail tiers by camera height. Above the threshold the ambient entry is a
 * bare label (name and IT power); below it the entry becomes a short card
 * with the owner, the expansion path and the power story. Clicking gives
 * the full card at any height.
 */
export const DATACENTER_DETAIL_HEIGHT_M = 2_000_000;
export const DATACENTER_TIER_GLOBAL = 'global';
export const DATACENTER_TIER_REGIONAL = 'regional';

export function detailTierForHeight(cameraHeightM) {
  return Number.isFinite(cameraHeightM) &&
    cameraHeightM < DATACENTER_DETAIL_HEIGHT_M
    ? DATACENTER_TIER_REGIONAL
    : DATACENTER_TIER_GLOBAL;
}

/** Status to accent: the shared commodity vocabulary (blue steady, green growing). */
const STATUS_CSS = Object.freeze({
  operating: '#39d5ff',
  expanding: '#7cff9b',
  unknown: '#9aa4b2',
});

export function statusCss(status) {
  return STATUS_CSS[status] || STATUS_CSS.unknown;
}

export function statusColor(status) {
  return Cesium.Color.fromCssColorString(statusCss(status));
}

/** Marker size grows with the square root of IT power so a gigawatt does not swallow the map. */
export function markerPixelSize(itPowerMw) {
  const mw = Number.isFinite(itPowerMw) ? Math.max(0, itPowerMw) : 0;
  return Math.round(8 + Math.sqrt(mw) * 0.35);
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

const LINE_MAX = 150;

function clampLine(line) {
  const s = String(line).replace(/\s+/g, ' ').trim();
  return s.length > LINE_MAX ? `${s.slice(0, LINE_MAX - 1)}…` : s;
}

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

function onSiteSummary(row) {
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

function expansionLine(row) {
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

/** Ambient entry: a bare label at global zoom, a short card once the camera is regional. */
export function createDatacenterOverlayEntry(row, position, tier) {
  const title = `${row.name.toUpperCase()} · ${formatMw(row.itPowerMw)} IT`;
  const base = {
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
  if (tier !== DATACENTER_TIER_REGIONAL)
    return { ...base, variant: 'label', title };
  return {
    ...base,
    variant: 'card',
    title,
    details: shortCardLines(row).map(clampLine),
  };
}

/** The three lines that make the regional card: who, where it is going, how it is powered. */
export function shortCardLines(row) {
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

/** Every reading the layer holds, ordered the way an analyst reads a site. */
export function fullCardLines(row) {
  const gen = row.power.onSiteGeneration;
  const cooling = row.cooling;
  const lines = [
    joinParts([
      joinParts([row.city, row.state], ', '),
      row.project ? `project ${row.project}` : null,
      row.status,
      row.rank ? `#${row.rank} US by current IT power` : null,
    ]),
    joinParts([
      row.owner ? `owner ${row.owner}` : null,
      row.operator ? `operator ${row.operator}` : null,
    ]),
    joinParts([
      row.users.length ? `users ${row.users.join(', ')}` : null,
      row.investors.length ? `investors ${row.investors.join(', ')}` : null,
      row.builders.length ? `builder ${row.builders.join(', ')}` : null,
    ]),
    joinParts([expansionLine(row), row.plannedNote]),
    joinParts([
      row.h100e !== null ? `compute ${formatCount(row.h100e)} H100e` : null,
      row.plannedH100e !== null && row.plannedH100e !== row.h100e
        ? `→ ${formatCount(row.plannedH100e)}`
        : null,
      row.chips.length
        ? `chips ${row.chips.map((c) => `${formatCount(c.count)} ${c.type}`).join(', ')}`
        : null,
    ]),
    joinParts([
      row.capexUsdB !== null ? `capex ${formatUsdB(row.capexUsdB)}` : null,
      row.computeCostUsdB !== null
        ? `(compute ${formatUsdB(row.computeCostUsdB)}, build ${formatUsdB(row.constructionCostUsdB)})`
        : null,
      row.plannedCapexUsdB !== null && row.plannedCapexUsdB !== row.capexUsdB
        ? `→ ${formatUsdB(row.plannedCapexUsdB)}`
        : null,
      row.annualOpexUsdB !== null
        ? `opex ${formatUsdB(row.annualOpexUsdB)}/yr`
        : null,
      row.capexPerItMwUsdM !== null
        ? `$${formatInt(row.capexPerItMwUsdM)}M per IT MW`
        : null,
    ]),
    joinParts([
      row.buildingsOperational !== null
        ? `buildings ${formatInt(row.buildingsOperational)}${row.buildingsPlanned !== null ? ` of ${formatInt(row.buildingsPlanned)}` : ''}`
        : null,
      row.campusAcres !== null
        ? `campus ${formatInt(row.campusAcres)} acres`
        : null,
      row.buildingSqFt !== null
        ? `${formatCount(row.buildingSqFt)} sq ft`
        : null,
      row.facilityToItRatio !== null
        ? `facility/IT ${row.facilityToItRatio.toFixed(2)}`
        : null,
    ]),
    joinParts([
      cooling.method ? `cooling ${cooling.method}` : null,
      cooling.chillers !== null
        ? `${formatInt(cooling.chillers)} chillers${cooling.chillerCapacityMw !== null ? ` (${formatMw(cooling.chillerCapacityMw)})` : ''}`
        : null,
      cooling.condensers !== null
        ? `${formatInt(cooling.condensers)} condensers`
        : null,
    ]),
    joinParts([
      row.power.gridUtility ? `grid ${row.power.gridUtility}` : null,
      row.power.gridOperator ? `(${row.power.gridOperator})` : null,
      row.power.interconnectionMw !== null
        ? `interconnect ${formatMw(row.power.interconnectionMw)}`
        : null,
      row.power.substationMw !== null
        ? `substation ${formatMw(row.power.substationMw)}`
        : null,
    ]),
    joinParts([
      gen.type ? `on-site ${gen.type}` : null,
      gen.capacityMw !== null && gen.capacityMw > 0
        ? formatMw(gen.capacityMw)
        : null,
      gen.plannedCapacityMw !== null
        ? `→ ${formatMw(gen.plannedCapacityMw)}`
        : null,
    ]),
    joinParts([gen.units, gen.capacityNote]),
    gen.permitStatus ? `permit ${gen.permitStatus}` : null,
    joinParts([
      row.power.batteries ? `batteries ${row.power.batteries}` : null,
      row.power.backupGenerators
        ? `backup ${row.power.backupGenerators}`
        : null,
      row.waterUseMgd !== null ? `water ${row.waterUseMgd} MGD` : null,
    ]),
    joinParts([
      row.gasEquivalentMmcfd !== null
        ? `gas-equivalent ${formatMmcfd(row.gasEquivalentMmcfd)} now`
        : null,
      row.plannedGasEquivalentMmcfd !== null &&
      row.plannedGasEquivalentMmcfd !== row.gasEquivalentMmcfd
        ? `${formatMmcfd(row.plannedGasEquivalentMmcfd)} at full build`
        : null,
      'illustrative, 7.0 MMBtu/MWh around the clock',
    ]),
    joinParts([
      row.latestMilestone
        ? `latest ${row.latestMilestone.date} ${row.latestMilestone.milestone}`
        : null,
      row.nextMilestone
        ? `next ${row.nextMilestone.date} ${row.nextMilestone.milestone}`
        : null,
    ]),
    joinParts([
      row.asOf ? `site data as of ${row.asOf}` : null,
      'Epoch AI (CC BY 4.0)',
      row.positionSource ? `position ${row.positionSource}` : null,
    ]),
  ];
  return lines.filter(Boolean).map(clampLine);
}

/** Selected detail card: the whole record, pinned above the marker. */
export function buildSelectedDatacenterCard(row, position) {
  return {
    id: `selected-datacenter:${row.id}`,
    position,
    accent: statusCss(row.status),
    title: `${row.name.toUpperCase()} · ${formatMw(row.itPowerMw)} IT · ${formatMw(row.facilityPowerMw)} FACILITY`,
    details: fullCardLines(row),
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
