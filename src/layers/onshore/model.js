/**
 * Presentation rules for the onshore region layers (docs/COMMODITIES-PLAN.md
 * §14, R12.5, R12.10, R12.11): the three depths, the sizes and colours of
 * region, field and well marks, the ambient labels and cards, and the panel
 * legend. Everything here reads the one record shape `records.js` builds, so
 * a card and a mark can never disagree about a number.
 *
 * Portable by rule: no Cesium, no DOM. Colours are CSS strings; the layer
 * converts them at the edge.
 */

import { YOY_CSS, yoyCss } from '../production/model.js';
import {
  facilityStamp,
  formatBbld,
  formatFlaredShare,
  formatInt,
  formatMcfd,
  formatYoy,
} from './records.js';

export { YOY_CSS, yoyCss };

export const ONSHORE_OVERLAY_COHORT_LIMIT = 24;
export const ONSHORE_OVERLAY_COLLISION_CAPACITY = 32;

/**
 * Three depths at the row 11 heights (R12.5), so the commodity layers never
 * change depth at different altitudes in the same frame. Global: one mark
 * per region. Regional: field clusters as marks with labels for the largest.
 * Local: every well as a point primitive with labels for the largest in view.
 */
export const ONSHORE_REGIONAL_HEIGHT_M = 2_500_000;
export const ONSHORE_LOCAL_HEIGHT_M = 300_000;
export const ONSHORE_TIER_GLOBAL = 'global';
export const ONSHORE_TIER_REGIONAL = 'regional';
export const ONSHORE_TIER_LOCAL = 'local';
/** Above this height a click flies the camera down to the well first. */
export const ONSHORE_FLY_FROM_HEIGHT_M = 400_000;
/** A well is a point on a pad; 12 km keeps the pad's neighbours in frame. */
export const ONSHORE_FLY_TO_WELL_HEIGHT_M = 12_000;
/** A field is tens of kilometres across. */
export const ONSHORE_FLY_TO_FIELD_HEIGHT_M = 120_000;
export const ONSHORE_ZOOM_OUT_HEIGHT_M = 1_200_000;
export const ONSHORE_FLY_DURATION_S = 2.0;
/** Hover picks are event-driven and throttled; a still pointer costs nothing. */
export const ONSHORE_HOVER_THROTTLE_MS = 120;
/** The local tier shows at most this many well points (R12.5), clipped to the view. */
export const ONSHORE_MAX_POINTS_IN_VIEW = 20_000;
/** The view rectangle is padded by this share on each side before clipping. */
export const ONSHORE_VIEW_PAD = 0.2;

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return ONSHORE_TIER_GLOBAL;
  if (cameraHeightM < ONSHORE_LOCAL_HEIGHT_M) return ONSHORE_TIER_LOCAL;
  if (cameraHeightM < ONSHORE_REGIONAL_HEIGHT_M) return ONSHORE_TIER_REGIONAL;
  return ONSHORE_TIER_GLOBAL;
}

/**
 * The legend in the shared change vocabulary (row 11's classes and colours),
 * with the two quiet classes worded for wells: `quiet` is a well that filed
 * with no gas this month, `unknown` a well the current month's file does not
 * list at all (plugged, inactive or confidential).
 */
export const ONSHORE_LEGEND = Object.freeze([
  Object.freeze({
    class: 'up',
    label: 'up',
    blurb: 'gas more than 10 % above the same month last year',
  }),
  Object.freeze({
    class: 'flat',
    label: 'flat',
    blurb: 'gas within 10 % of the same month last year',
  }),
  Object.freeze({
    class: 'down',
    label: 'down',
    blurb: 'gas more than 10 % below the same month last year',
  }),
  Object.freeze({
    class: 'new',
    label: 'new',
    blurb: 'producing gas now, none the same month last year',
  }),
  Object.freeze({
    class: 'quiet',
    label: 'quiet',
    blurb: 'filed, no gas this month',
  }),
  Object.freeze({
    class: 'unknown',
    label: 'not filed',
    blurb: "not in this month's file (plugged, inactive or confidential)",
  }),
]);

/* ------------------------------------------------------------------ *
 * Marks
 * ------------------------------------------------------------------ */

export const CLUSTER_MARK_MIN_PX = 6;
export const CLUSTER_MARK_MAX_PX = 24;
export const CLUSTER_IDLE_PX = 4;
export const REGION_MARK_PX = 16;
export const WELL_MARK_MIN_PX = 3;
export const WELL_MARK_MAX_PX = 10;
export const WELL_IDLE_PX = 2.5;

function sizeBetween(min, max, value, valueMax) {
  if (!(value > 0) || !(valueMax > 0)) return null;
  const share = Math.min(1, value / valueMax);
  return min + (max - min) * Math.sqrt(share);
}

/** Field marks between 6 and 24 px by the square root of their share of the largest field's gas. */
export function clusterPixelSize(
  cluster,
  gasMaxMcfd,
  { hovered = false } = {},
) {
  let size =
    sizeBetween(
      CLUSTER_MARK_MIN_PX,
      CLUSTER_MARK_MAX_PX,
      cluster?.current?.gasMcfd ?? 0,
      gasMaxMcfd,
    ) ?? CLUSTER_IDLE_PX;
  if (hovered) size *= 1.3;
  return Math.round(size);
}

/**
 * Well points between 3 and 10 px by the square root of their share of the
 * largest well's gas; quiet and absent wells a 2.5 px pip. Small on purpose:
 * twenty thousand points share one screen.
 */
export function wellPixelSize(row, gasMaxMcfd, { hovered = false } = {}) {
  let size =
    sizeBetween(
      WELL_MARK_MIN_PX,
      WELL_MARK_MAX_PX,
      row?.current?.gasMcfd ?? 0,
      gasMaxMcfd,
    ) ?? WELL_IDLE_PX;
  if (hovered) size *= 1.6;
  return Math.round(size * 2) / 2;
}

/** Producing marks are solid in their class colour; idle pips are hollow grey. */
export function markerStyle(item) {
  const css = yoyCss(item?.yoy?.class);
  const active = item?.producing === true || (item?.producing ?? 0) > 0;
  return active
    ? { fillCss: css, outlineCss: '#000000', outlineAlpha: 0.8, fillAlpha: 1 }
    : { fillCss: css, outlineCss: css, outlineAlpha: 0.85, fillAlpha: 0 };
}

/* ------------------------------------------------------------------ *
 * Labels and cards
 * ------------------------------------------------------------------ */

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

/** `BILL 14-23 1H · ALEXANDER` — the well and its field. */
export function wellTitle(row) {
  return joinParts([row.name.toUpperCase(), row.field]);
}

/** The headline every surface leads with: gas now and how it compares. */
export function headlineLine(row) {
  if (!row.producing) {
    return row.status === 'quiet'
      ? 'filed, no production this month'
      : "not in this month's file";
  }
  return joinParts([formatMcfd(row.current.gasMcfd), formatYoy(row.yoy)]);
}

/** Oil, water, days on and the flared share for the month, as filed. */
export function operationsLine(row) {
  const c = row.current;
  if (!c) return null;
  return joinParts([
    c.oilBopd !== null ? `oil ${formatBbld(c.oilBopd)}` : null,
    c.waterBwpd !== null ? `water ${formatBbld(c.waterBwpd)}` : null,
    c.days !== null ? `${formatInt(c.days)} days on` : null,
    formatFlaredShare(c.flaredShare),
  ]);
}

/** Who runs it and what it produces from. */
export function identityLine(row) {
  return joinParts([
    row.operator ? `operator ${row.operator}` : null,
    row.pools.length ? row.pools.join(' / ') : null,
    row.county ? `${row.county} county` : null,
  ]);
}

function baseEntry(id, position, accent, priority) {
  return {
    id,
    position,
    accent,
    priority,
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

/**
 * Global tier: the region's one card. `weatherLine` is the optional basin
 * reading from the Oil Oracle store (row 13 M3, `basinWeather.js`).
 */
export function createRegionOverlayEntry(
  snapshot,
  position,
  weatherLine = null,
) {
  const c = snapshot.counts;
  const details = [
    `${formatInt(c.producing)} wells producing · ${(c.gasMcfdTotal / 1e6).toFixed(2)} Bcf/d gas · ${(c.oilBbldTotal / 1e6).toFixed(2)} MMbbl/d oil`,
    snapshot.asOf,
  ];
  if (weatherLine) details.push(weatherLine);
  details.push('zoom in for fields, then wells');
  return {
    ...baseEntry(
      `region:${snapshot.regionId}`,
      position,
      YOY_CSS.flat,
      Number.MAX_SAFE_INTEGER - 2,
    ),
    variant: 'card',
    title: snapshot.region.name.toUpperCase(),
    details: details.map(clampLine),
  };
}

/** Regional tier: a label per field for the largest in view. */
export function createClusterOverlayEntry(cluster, position, tier) {
  if (tier !== ONSHORE_TIER_REGIONAL || !(cluster.current.gasMcfd > 0))
    return null;
  return {
    ...baseEntry(
      `field:${cluster.id}`,
      position,
      yoyCss(cluster.yoy.class),
      Math.round(cluster.current.gasMcfd),
    ),
    variant: 'label',
    title: `${cluster.name.toUpperCase()} · ${formatMcfd(cluster.current.gasMcfd)} · ${formatInt(cluster.producing)} wells`,
  };
}

/** Local tier: a label per well for the largest in view. */
export function createWellOverlayEntry(row, position, tier) {
  if (tier !== ONSHORE_TIER_LOCAL || !row.producing) return null;
  return {
    ...baseEntry(
      `well:${row.id}`,
      position,
      yoyCss(row.yoy.class),
      Math.round(row.current.gasMcfd ?? 0),
    ),
    variant: 'label',
    title: `${row.name.toUpperCase()} · ${formatMcfd(row.current.gasMcfd)}`,
  };
}

/** The hover card for a well, at any depth the point is pickable. */
export function buildHoverWellCard(row, position) {
  return {
    id: `hover-well:${row.id}`,
    position,
    accent: yoyCss(row.yoy.class),
    title: wellTitle(row),
    details: [
      headlineLine(row),
      operationsLine(row),
      identityLine(row),
      facilityStamp(row),
    ]
      .filter(Boolean)
      .map(clampLine),
    priority: Number.MAX_SAFE_INTEGER - 1,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
  };
}

/** The hover card for a field mark at the regional tier. */
export function buildHoverClusterCard(cluster, position, snapshot) {
  const c = cluster.current;
  return {
    id: `hover-field:${cluster.id}`,
    position,
    accent: yoyCss(cluster.yoy.class),
    title: joinParts([cluster.name.toUpperCase(), cluster.county]),
    details: [
      joinParts([
        c.gasMcfd > 0 ? formatMcfd(c.gasMcfd) : 'no gas this month',
        formatYoy(cluster.yoy),
      ]),
      joinParts([
        c.oilBopd !== null ? `oil ${formatBbld(c.oilBopd)}` : null,
        `${formatInt(cluster.producing)} of ${formatInt(cluster.wells)} wells producing`,
        cluster.rank ? `#${cluster.rank} field by gas` : null,
      ]),
      snapshot?.asOf ?? null,
      'click to fly to the wells',
    ]
      .filter(Boolean)
      .map(clampLine),
    priority: Number.MAX_SAFE_INTEGER - 1,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
  };
}

/** Selected card: compact; the series and the summary live in the dossier. */
export function buildSelectedWellCard(row, position) {
  const details = [
    headlineLine(row),
    operationsLine(row),
    identityLine(row),
    joinParts([
      `API ${row.api}`,
      row.fileNo !== null ? `file ${row.fileNo}` : null,
      row.rank ? `#${row.rank} by gas this month` : null,
    ]),
    joinParts([facilityStamp(row), 'dossier open ▸']),
  ];
  return {
    id: `selected-well:${row.id}`,
    position,
    accent: yoyCss(row.yoy.class),
    title: wellTitle(row),
    details: details.filter(Boolean).map(clampLine),
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the largest producers, with stable identity as the tie-break. */
export function selectOverlayCohort(
  entries,
  limit = ONSHORE_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries
    .filter(Boolean)
    .slice()
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (String(a.id) < String(b.id)
          ? -1
          : String(a.id) > String(b.id)
            ? 1
            : 0),
    )
    .slice(0, cap);
}

/* ------------------------------------------------------------------ *
 * The view
 * ------------------------------------------------------------------ */

/**
 * Pad a view rectangle (degrees, `{west, south, east, north}`) by a share of
 * its own size on every side, clamped to the globe. Regions here never cross
 * the antimeridian, so west < east is assumed.
 */
export function padRectangle(rect, share = ONSHORE_VIEW_PAD) {
  const width = rect.east - rect.west;
  const height = rect.north - rect.south;
  return {
    west: Math.max(-180, rect.west - width * share),
    east: Math.min(180, rect.east + width * share),
    south: Math.max(-90, rect.south - height * share),
    north: Math.min(90, rect.north + height * share),
  };
}

/** The rows whose surface location lies inside a rectangle in degrees. */
export function facilitiesInRectangle(rows, rect) {
  if (!rect) return rows;
  const out = [];
  for (const row of rows) {
    if (
      row.lon >= rect.west &&
      row.lon <= rect.east &&
      row.lat >= rect.south &&
      row.lat <= rect.north
    )
      out.push(row);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

/**
 * The colour legend for the panel row (R12.11): one swatch per change class
 * with the count of wells in it, so the legend doubles as a summary. Size is
 * explained once, in the first entry's blurb.
 */
export function legendEntries(snapshot) {
  if (!snapshot) return [];
  const counts = new Map(ONSHORE_LEGEND.map((e) => [e.class, 0]));
  for (const row of snapshot.rows) {
    counts.set(row.yoy.class, (counts.get(row.yoy.class) ?? 0) + 1);
  }
  return ONSHORE_LEGEND.filter((entry) => counts.get(entry.class) > 0).map(
    (entry, index) => ({
      label: entry.label,
      color: YOY_CSS[entry.class],
      count: counts.get(entry.class),
      blurb:
        index === 0
          ? `${entry.blurb} · mark size is gas per day this month`
          : entry.blurb,
    }),
  );
}
