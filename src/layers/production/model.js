/**
 * Presentation rules for the Gulf platform layer (docs/COMMODITIES-PLAN.md
 * §13, R11.3, R11.4, R11.6, R11.11): tiers, sizes, colours, the ambient
 * labels and cards, and the panel legend. Everything here reads the one
 * record shape `records.js` builds, so a card and a mark can never disagree
 * about a number.
 *
 * Portable by rule: no Cesium, no DOM. Colours are CSS strings; the layer
 * converts them at the edge.
 */

import {
  GULF_LAYER_ID,
  formatBbld,
  formatInt,
  formatMcfd,
  formatWaterDepth,
  formatYoy,
  platformStamp,
} from './records.js';

export { GULF_LAYER_ID };
export const GULF_OVERLAY_SOURCE_ID = 'production-gulf-platforms';
export const GULF_OVERLAY_COHORT_LIMIT = 24;
export const GULF_OVERLAY_COLLISION_CAPACITY = 32;

/**
 * Three depths at the datacenters heights (R11.9), so two commodity layers
 * never change depth at different altitudes in the same frame. Global: dots
 * only — 300-odd labels over the Gulf would be a smear. Regional: labels for
 * the largest producers in view. Local: cards.
 */
export const GULF_REGIONAL_HEIGHT_M = 2_500_000;
export const GULF_LOCAL_HEIGHT_M = 300_000;
export const GULF_TIER_GLOBAL = 'global';
export const GULF_TIER_REGIONAL = 'regional';
export const GULF_TIER_LOCAL = 'local';
/** Above this height a click flies the camera down to the platform first. */
export const GULF_FLY_FROM_HEIGHT_M = 400_000;
/** A platform is a point on open water; 30 km keeps its neighbours in frame. */
export const GULF_FLY_TO_HEIGHT_M = 30_000;
export const GULF_ZOOM_OUT_HEIGHT_M = 2_500_000;
export const GULF_FLY_DURATION_S = 2.0;
/** Hover picks are event-driven and throttled; a still pointer costs nothing. */
export const GULF_HOVER_THROTTLE_MS = 120;

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return GULF_TIER_GLOBAL;
  if (cameraHeightM < GULF_LOCAL_HEIGHT_M) return GULF_TIER_LOCAL;
  if (cameraHeightM < GULF_REGIONAL_HEIGHT_M) return GULF_TIER_REGIONAL;
  return GULF_TIER_GLOBAL;
}

/**
 * The change classes in the shared commodity colour vocabulary (the ports
 * and chokepoints layers use the same slots): green up, blue steady, amber
 * down, lime new, the two greys for quiet and unknown. Descriptive (R11):
 * a colour says how this month compares with the same month last year,
 * never what to do about it.
 */
export const YOY_CSS = Object.freeze({
  up: '#7cff9b',
  flat: '#39d5ff',
  down: '#ffb347',
  new: '#c3ff5b',
  quiet: '#6f7a88',
  unknown: '#9aa4b2',
});

export const YOY_LEGEND = Object.freeze([
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
    blurb: 'installed, no gas this month',
  }),
  Object.freeze({
    class: 'unknown',
    label: 'no filing',
    blurb: 'installed, no production ever filed',
  }),
]);

export function yoyCss(yoyClass) {
  return YOY_CSS[yoyClass] || YOY_CSS.unknown;
}

/**
 * Mark size (R11.3): producing structures between 5 and 22 px by the square
 * root of their share of the largest producer's gas, so the biggest platform
 * does not swallow the Gulf and a small one still reads as a mark. Installed
 * structures with no gas this month are a fixed 4 px pip. Hover and the
 * local tier scale up so the thing to click is never in doubt.
 */
export const GULF_MARK_MIN_PX = 5;
export const GULF_MARK_MAX_PX = 22;
export const GULF_IDLE_PX = 4;

export function markerPixelSize(
  row,
  gasMaxMcfd,
  { tier = GULF_TIER_GLOBAL, hovered = false } = {},
) {
  const gas = row?.current?.gasMcfd ?? 0;
  let size = GULF_IDLE_PX;
  if (gas > 0 && gasMaxMcfd > 0) {
    const share = Math.min(1, gas / gasMaxMcfd);
    size =
      GULF_MARK_MIN_PX +
      (GULF_MARK_MAX_PX - GULF_MARK_MIN_PX) * Math.sqrt(share);
  }
  if (tier === GULF_TIER_LOCAL) size *= 1.15;
  if (hovered) size *= 1.35;
  return Math.round(size);
}

/** Producing marks are solid in their class colour; idle pips are hollow grey. */
export function markerStyle(row) {
  const css = yoyCss(row?.yoy?.class);
  return row?.producing
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

/** `B (HELIX) · GC 237` — the structure and where it stands. */
export function platformTitle(row) {
  return joinParts([row.name.toUpperCase(), row.areaBlock]);
}

/** The headline every surface leads with: gas now and how it compares. */
export function headlineLine(row) {
  if (!row.producing) {
    return row.series ? 'no gas this month' : 'no production filed';
  }
  return joinParts([formatMcfd(row.current.gasMcfd), formatYoy(row.yoy)]);
}

/** Oil, water, BOE and wells for the month, as filed. */
export function operationsLine(row) {
  const c = row.current;
  if (!c) return null;
  return joinParts([
    c.oilBopd !== null ? `oil ${formatBbld(c.oilBopd)}` : null,
    c.waterBwpd !== null ? `water ${formatBbld(c.waterBwpd)}` : null,
    c.boepd !== null ? `${formatInt(c.boepd)} BOE/d` : null,
    c.wells !== null ? `${formatInt(c.wells)} wells` : null,
  ]);
}

/** Who runs it and what it stands in. */
export function identityLine(row) {
  return joinParts([
    row.operator ? `operator ${row.operator}` : null,
    row.type ? row.type.toLowerCase() : null,
    row.waterDepthFt !== null
      ? `${formatWaterDepth(row.waterDepthFt)} water`
      : null,
    row.installed ? `installed ${row.installed.slice(0, 4)}` : null,
  ]);
}

function baseEntry(row, position) {
  return {
    id: String(row.id),
    position,
    accent: yoyCss(row.yoy.class),
    priority: Math.round(row.current?.gasMcfd ?? 0),
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
 * Ambient entry for a structure at the current depth, or null when the depth
 * draws no text for it: nothing at global, labels for producers at regional,
 * cards for producers at local. Idle pips never get ambient text — the
 * hover card and the dossier say what they are.
 */
export function createPlatformOverlayEntry(row, position, tier) {
  if (!row.producing || tier === GULF_TIER_GLOBAL) return null;
  const base = baseEntry(row, position);
  if (tier === GULF_TIER_LOCAL) {
    return {
      ...base,
      variant: 'card',
      title: platformTitle(row),
      details: localCardLines(row).map(clampLine),
    };
  }
  return {
    ...base,
    variant: 'label',
    title: `${platformTitle(row)} · ${formatMcfd(row.current.gasMcfd)}`,
  };
}

/** Local card: the month at a glance and the hint that the marker opens the dossier. */
export function localCardLines(row) {
  return [
    headlineLine(row),
    operationsLine(row),
    identityLine(row),
    platformStamp(row),
    'click the marker for the dossier',
  ].filter(Boolean);
}

/**
 * The hover card (R11.6): shown for whichever structure the pointer is on,
 * at any depth, so the 300-odd platforms that never earn an ambient label
 * still answer a hover. Same lines as the local card without the hint.
 */
export function buildHoverPlatformCard(row, position) {
  return {
    id: `hover-platform:${row.id}`,
    position,
    accent: yoyCss(row.yoy.class),
    title: platformTitle(row),
    details: [
      headlineLine(row),
      operationsLine(row),
      identityLine(row),
      platformStamp(row),
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

/**
 * Selected card: compact on purpose. The series, the lifetime and the sources
 * live in the dossier drawer; the map card carries the headline.
 */
export function buildSelectedPlatformCard(row, position) {
  const details = [
    headlineLine(row),
    operationsLine(row),
    joinParts([
      row.lease ? `lease ${row.lease}` : null,
      row.field ? `field ${row.field}` : null,
      row.complexId ? `complex ${row.complexId}` : null,
    ]),
    identityLine(row),
    joinParts([
      row.rank ? `#${row.rank} by gas this month` : null,
      platformStamp(row),
      'dossier open ▸',
    ]),
  ];
  return {
    id: `selected-platform:${row.id}`,
    position,
    accent: yoyCss(row.yoy.class),
    title: platformTitle(row),
    details: details.filter(Boolean).map(clampLine),
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the largest producers, with stable identity as the tie-break. */
export function selectPlatformOverlayCohort(
  entries,
  limit = GULF_OVERLAY_COHORT_LIMIT,
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
 * Panel
 * ------------------------------------------------------------------ */

/**
 * The colour legend for the panel row (R11.11): one swatch per change class
 * with the count of installed structures in it, so the legend doubles as a
 * summary. Size is explained once, in the first entry's blurb.
 */
export function legendEntries(snapshot) {
  if (!snapshot) return [];
  const counts = new Map(YOY_LEGEND.map((e) => [e.class, 0]));
  for (const row of snapshot.rows) {
    counts.set(row.yoy.class, (counts.get(row.yoy.class) ?? 0) + 1);
  }
  return YOY_LEGEND.filter((entry) => counts.get(entry.class) > 0).map(
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
