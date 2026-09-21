import * as Cesium from 'cesium';
import {
  LNG_GRADES,
  arcWidthPx,
  formatBcfd,
  formatCount,
  formatMmcf,
  formatMonth,
  formatMt,
  formatMtpa,
  formatNm,
} from './records.js';

/**
 * Cesium-aware presentation for the `commodity-lng` layer: tiers, marker
 * sizes, colours, and the overlay cards at each depth
 * (docs/COMMODITIES-PLAN.md §12.6.2 items 11 to 17). Pure functions over
 * frozen records; the layer in `index.js` owns the entities.
 */

export const LNG_OVERLAY_SOURCE_ID = 'commodity-lng';
export const LNG_OVERLAY_COHORT_LIMIT = 28;
export const LNG_OVERLAY_COLLISION_CAPACITY = 40;
export const LNG_REGIONAL_HEIGHT_M = 2_500_000;
export const LNG_LOCAL_HEIGHT_M = 300_000;
export const LNG_TIER_GLOBAL = 'global';
export const LNG_TIER_REGIONAL = 'regional';
export const LNG_TIER_LOCAL = 'local';
/** Above this height a click flies the camera down to the plant first. */
export const LNG_FLY_FROM_HEIGHT_M = 400_000;
/** Where a click lands: the plant, its jetty and the ring in one view. */
export const LNG_FLY_TO_HEIGHT_M = 25_000;
export const LNG_ZOOM_OUT_HEIGHT_M = 2_500_000;
export const LNG_FLY_DURATION_S = 2.0;
/** Hover picks are event-driven and throttled; a still pointer costs nothing. */
export const LNG_HOVER_THROTTLE_MS = 120;
/** GIIGNL lines are dashed; a short solid arrow at the destination end carries direction. */
export const LNG_ARROW_TAIL_POINTS = 3;

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return LNG_TIER_GLOBAL;
  if (cameraHeightM < LNG_LOCAL_HEIGHT_M) return LNG_TIER_LOCAL;
  if (cameraHeightM < LNG_REGIONAL_HEIGHT_M) return LNG_TIER_REGIONAL;
  return LNG_TIER_GLOBAL;
}

const KIND_CSS = Object.freeze({
  export: '#ffb347',
  import: '#5fb3ff',
});
const GRADE_CSS = Object.freeze({
  doe: '#ffd27a',
  giignl: '#8fd3ff',
});
const LINE_MAX = 110;

export function kindCss(kind) {
  return KIND_CSS[kind] ?? KIND_CSS.import;
}

export function kindColor(kind) {
  return Cesium.Color.fromCssColorString(kindCss(kind));
}

export function gradeCss(grade) {
  return GRADE_CSS[grade] ?? GRADE_CSS.doe;
}

export function gradeColor(grade) {
  return Cesium.Color.fromCssColorString(gradeCss(grade));
}

/** Export markers `8 + 0.9 × √Mtpa` px; import markers smaller (§12.6.2 items 11, 12). */
export function markerPixelSize(row, { tier, hovered = false } = {}) {
  const mtpa = Math.max(0, row.capacityMtpa || row.underConstructionMtpa || 0);
  let size =
    row.kind === 'export'
      ? 8 + 0.9 * Math.sqrt(mtpa)
      : 5 + 0.5 * Math.sqrt(mtpa);
  if (tier === LNG_TIER_LOCAL) size *= 1.25;
  if (hovered) size *= 1.35;
  return Math.round(size);
}

/** Ring of `3 km + 400 m × √Mtpa` round an export plant. */
export function ringRadiusMeters(row) {
  const mtpa = Math.max(0, row.capacityMtpa || row.underConstructionMtpa || 0);
  return 3_000 + 400 * Math.sqrt(mtpa);
}

export function groundCirclePositions(lon, lat, radiusMeters, segments = 64) {
  const positions = [];
  const latRad = Cesium.Math.toRadians(lat);
  const dLat = radiusMeters / 111_320;
  const dLon = radiusMeters / (111_320 * Math.max(Math.cos(latRad), 0.05));
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(
      Cesium.Cartesian3.fromDegrees(
        lon + dLon * Math.cos(a),
        lat + dLat * Math.sin(a),
        0,
      ),
    );
  }
  return positions;
}

export function terminalPosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat, 0);
}

/** Geodesic spacing between rendered vertices: one degree, ~111 km. */
export const LNG_ROUTE_GRANULARITY_RAD = Cesium.Math.RADIANS_PER_DEGREE;

/**
 * Lane vertices subdivided along the geodesic so no rendered segment dips
 * below the ellipsoid (a 300 km chord sags 1.8 km and the globe would hide
 * it). PolylineCollection draws straight 3D segments, so the subdivision is
 * done here rather than by an entity's arcType.
 */
export function routePositions(
  coords,
  granularity = LNG_ROUTE_GRANULARITY_RAD,
) {
  const points = Cesium.Cartesian3.fromDegreesArray(
    coords.flatMap(([lon, lat]) => [lon, lat]),
  );
  if (points.length < 2) return points;
  const flat = Cesium.PolylinePipeline.generateArc({
    positions: points,
    granularity,
  });
  return Cesium.Cartesian3.unpackArray(flat);
}

/** The last few vertices of a line, for the direction arrow on a dashed grade. */
export function arrowTailCoords(coords, points = LNG_ARROW_TAIL_POINTS) {
  return coords.slice(-Math.max(2, Math.min(points, coords.length)));
}

export function routeWidthPx(route, scales, { hovered = false } = {}) {
  const grade = LNG_GRADES[route.grade];
  const volume = grade.id === 'doe' ? route.volume.mmcf : route.volume.mt;
  const width = arcWidthPx(volume, scales[grade.id] ?? { min: 0, max: 0 });
  return hovered ? width + 2 : width;
}

function clampLine(line) {
  const s = String(line ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > LINE_MAX ? `${s.slice(0, LINE_MAX - 1)}…` : s;
}

function joinParts(parts, separator = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(separator);
}

function ownerLine(row) {
  if (row.operator) return `${row.operator}`;
  const owners = row.owners.map((o) => o.name);
  if (owners.length)
    return (
      owners.slice(0, 2).join(', ') +
      (owners.length > 2 ? ` +${owners.length - 2}` : '')
    );
  return 'owner n/a';
}

function statusLine(row) {
  if (row.status === 'operating') {
    const parts = [
      `operating${row.startYear ? ` since ${row.startYear}` : ''}`,
    ];
    if (row.underConstructionMtpa > 0)
      parts.push(
        `+${formatMtpa(row.underConstructionMtpa)} building${row.expectedYear ? ` (${row.expectedYear})` : ''}`,
      );
    return parts.join(', ');
  }
  return `under construction${row.expectedYear ? `, expected ${row.expectedYear}` : ''}`;
}

/** What the card calls the data behind it (§12.4 goal 4, R2). */
export function gradeLine(row) {
  if (row.us && !row.us.smallScale)
    return `EIA ${row.us.trains.length ? 'train table' : ''} · DOE cargoes · GEM ${row.source.release ?? ''}`.replace(
      /\s+·/g,
      ' ·',
    );
  return `GEM · ${row.source.release ?? 'release n/a'}`;
}

function capacityLabel(row) {
  const cap =
    row.capacityMtpa > 0
      ? formatMtpa(row.capacityMtpa)
      : row.underConstructionMtpa > 0
        ? `${formatMtpa(row.underConstructionMtpa)} building`
        : 'capacity n/a';
  return cap;
}

function baseEntry(row, position) {
  return {
    id: String(row.id),
    position,
    accent: kindCss(row.kind),
    priority:
      Math.round((row.capacityMtpa || row.underConstructionMtpa || 0) * 10) +
      (row.kind === 'export' ? 1000 : 0),
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

function titleOf(row) {
  const name = row.name
    .replace(/\s+LNG Terminal$/i, '')
    .replace(/\s+Terminal$/i, '');
  return `${name.toUpperCase()} · ${capacityLabel(row)}`;
}

/** Three-line card at the regional tier (§12.6.2 item 15). */
export function regionalCardLines(row) {
  const d = row.derived ?? {};
  if (row.kind === 'export') {
    return [
      joinParts([
        row.us && !row.us.smallScale ? null : row.country,
        ownerLine(row),
        statusLine(row),
      ]),
      row.us && !row.us.smallScale
        ? `${formatCount(d.cargoes ?? 0)} cargoes · ${formatMmcf(d.mmcf ?? 0)} · trailing 12 months · DOE`
        : d.matrixRow?.length
          ? `${formatMt(d.matrixRow.reduce((s, m) => s + m.mt, 0))} shipped 2025 · GIIGNL`
          : `no cargo data · ${gradeLine(row)}`,
      row.us && !row.us.smallScale
        ? d.topDestination
          ? `top: ${d.topDestination.country} · ${formatCount(d.topDestination.cargoes)} cargoes`
          : 'no cargoes in the window'
        : d.matrixRow?.[0]
          ? `top: ${d.matrixRow[0].market} · ${formatMt(d.matrixRow[0].mt)} · ${gradeLine(row)}`
          : gradeLine(row),
    ];
  }
  return [
    joinParts([row.country, ownerLine(row)]),
    statusLine(row),
    d.inbound?.length
      ? `${d.inbound.length} inbound pair${d.inbound.length === 1 ? '' : 's'} · ${gradeLine(row)}`
      : gradeLine(row),
  ];
}

/** The plant card at the local tier: the regional lines, the trains, the hint. */
export function localCardLines(row) {
  const lines = regionalCardLines(row);
  if (row.us?.trains?.length) {
    const t = row.us;
    lines.push(
      `trains: ${t.trainsOperating} operating · ${t.trainsCommissioning} commissioning · ${t.trainsBuilding} building · ${formatBcfd(t.baseloadBcfd)} baseload`,
    );
    for (const train of t.trains.slice(0, 6)) {
      lines.push(
        `${train.train}: ${formatMtpa(train.baseloadMtpa) ?? 'n/a'} · ${train.status}${train.inService ? ` · ${train.inService.slice(0, 7)}` : ''}`,
      );
    }
    if (t.trains.length > 6)
      lines.push(`+${t.trains.length - 6} more trains in the dossier`);
    lines.push('click the marker for the dossier');
  } else if (row.regasMtpa) {
    lines.push(`GEM also lists ${formatMtpa(row.regasMtpa)} regas`);
  }
  if (row.kind === 'import' && row.derived?.inbound?.length) {
    for (const pair of row.derived.inbound.slice(0, 4)) {
      const vol =
        pair.grade === 'doe'
          ? `${formatCount(pair.volume.cargoes)} cargoes · ${formatMmcf(pair.volume.mmcf)}`
          : `${formatMt(pair.volume.mt)} · annual 2025`;
      lines.push(`← ${pair.origin} (${pair.originCountry}) · ${vol}`);
    }
  }
  return lines;
}

/** Ambient entry for the terminal at the current depth. */
export function createTerminalOverlayEntry(row, position, tier) {
  const base = baseEntry(row, position);
  if (tier === LNG_TIER_LOCAL) {
    return {
      ...base,
      variant: 'card',
      title: titleOf(row),
      details: localCardLines(row).map(clampLine),
    };
  }
  if (tier === LNG_TIER_REGIONAL) {
    if (row.kind === 'import')
      return { ...base, variant: 'label', title: titleOf(row) };
    return {
      ...base,
      variant: 'card',
      title: titleOf(row),
      details: regionalCardLines(row).map(clampLine),
    };
  }
  if (row.kind !== 'export') return null;
  return { ...base, variant: 'label', title: titleOf(row) };
}

/** The selected terminal's card: every depth, on top. */
export function buildSelectedTerminalCard(row, position) {
  return {
    id: `selected-lng:${row.id}`,
    position,
    accent: kindCss(row.kind),
    title: titleOf(row),
    details: localCardLines(row).map(clampLine),
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Route hover and click cards (§12.6.2 item 17). */
export function routeCardLines(route, { selected = false } = {}) {
  const grade = LNG_GRADES[route.grade];
  const line = route.line;
  const volume =
    grade.id === 'doe'
      ? `${formatCount(route.volume.cargoes)} cargoes · ${formatMmcf(route.volume.mmcf)}`
      : `${formatMt(route.volume.mt)}`;
  const lines = [
    `${route.originCountry} → ${route.destinationCountry}`,
    `${volume} · ${route.period ?? grade.period}`,
    `${grade.label}${grade.dashed ? ' (dashed)' : ''} · modelled shortest sea route`,
  ];
  if (selected) {
    lines.push(
      `${formatNm(line.nm)} · ${route.variantInUse === 'redSeaClosed' ? 'Red Sea closed variant (Cape routing from 2024-01)' : 'open variant'}`,
    );
    lines.push(
      line.via.length
        ? `via ${line.via.join(', ')}`
        : 'no gazetteer chokepoint within 40 km',
    );
    if (route.redSeaExposed && route.variantInUse === 'redSeaClosed')
      lines.push(
        `open route would be ${formatNm(route.variants.open.nm)} via ${route.variants.open.via.join(', ') || 'Bab el-Mandeb'}`,
      );
    lines.push(
      `endpoints: ${route.endpointRule.origin} → ${route.endpointRule.destination}`,
    );
  }
  return lines;
}

export function buildRouteCard(
  route,
  position,
  { selected = false, monthly = null } = {},
) {
  const lines = routeCardLines(route, { selected });
  if (selected && monthly?.length) {
    const max = Math.max(...monthly.map((m) => m.mmcf), 1);
    for (const m of monthly)
      lines.push(
        `${formatMonth(m.month)} ${'▮'.repeat(Math.max(1, Math.round((m.mmcf / max) * 12)))} ${formatCount(m.cargoes)} · ${formatMmcf(m.mmcf)}`,
      );
  }
  return {
    id: selected
      ? `selected-lng-route:${route.id}`
      : `hover-lng-route:${route.id}`,
    position,
    accent: gradeCss(route.grade),
    title: `${route.originName.replace(/\s+LNG Terminal$/i, '').toUpperCase()} → ${route.destinationName.replace(/\s+LNG Terminal$/i, '').toUpperCase()}`,
    details: lines.map(clampLine),
    selected,
    priority: Number.MAX_SAFE_INTEGER - (selected ? 0 : 1),
    horizonCull: true,
    terrainOcclusion: false,
    interactive: false,
  };
}

/** Largest terminals first, up to the cohort limit. */
export function selectLngOverlayCohort(
  entries,
  limit = LNG_OVERLAY_COHORT_LIMIT,
) {
  return [...entries]
    .sort(
      (a, b) =>
        b.priority - a.priority || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, limit);
}

/** The panel meta line: the sources' own dates, then anything switched off. */
export function lngMetaLine(snapshot, chips) {
  const parts = [
    snapshot.asOf,
    snapshot.matrixYear ? `GIIGNL ${snapshot.matrixYear}` : null,
  ];
  const off = Object.entries(chips)
    .filter(([, on]) => !on)
    .map(([id]) => `${id.toUpperCase()} OFF`);
  if (off.length) parts.push(off.join(' · '));
  parts.push('chips session-only');
  return parts.filter(Boolean).join(' · ');
}
