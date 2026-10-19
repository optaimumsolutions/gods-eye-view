import * as Cesium from 'cesium';
import { formatAge } from '../commodities/observation.js';
import { UTILIZATION_CLASSES, utilizationClass } from './records.js';

export const GAS_OVERLAY_LAYER_ID = 'gas-pipeline-overlay';
export const GAS_OVERLAY_SOURCE_ID = 'gas-pipeline-overlay';
export const GAS_OVERLAY_COHORT_LIMIT = 12;
export const GAS_OVERLAY_COLLISION_CAPACITY = 16;

export const GAS_OVERLAY_TIER_GLOBAL = 'global';
export const GAS_OVERLAY_TIER_REGIONAL = 'regional';
/** Below this camera height the point marks join the lines. */
export const GAS_OVERLAY_REGIONAL_HEIGHT_M = 2_500_000;
export const GAS_OVERLAY_HOVER_THROTTLE_MS = 120;
export const LINE_WIDTH_PX = 3;
export const POINT_MIN_PX = 3.5;
export const POINT_MAX_PX = 11;
export const STATION_PX = 6;
export const NOTICE_RING_EXTRA_PX = 5;
const LINE_MAX = 96;

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return GAS_OVERLAY_TIER_GLOBAL;
  return cameraHeightM < GAS_OVERLAY_REGIONAL_HEIGHT_M
    ? GAS_OVERLAY_TIER_REGIONAL
    : GAS_OVERLAY_TIER_GLOBAL;
}

/**
 * The utilization ramp (scheduled ÷ design, the binding direction): cool
 * below 40 %, the house blue through normal running, amber from 70 %, red
 * from 90 %, and lime for over-design — a nomination above the book figure
 * is the anomaly the eye should catch. No reading (no route, a point the
 * capacity posting skipped, design 0) is grey.
 */
export const UTILIZATION_CSS = Object.freeze({
  nodata: '#6b7680',
  low: '#2f7fa8',
  normal: '#39d5ff',
  elevated: '#ffb347',
  tight: '#ff3b5c',
  over: '#b4ff39',
});
export const STATION_CSS = '#e8eaed';
export const NOTICE_RING_CSS = '#ffb347';

export function utilizationCss(utilization) {
  return UTILIZATION_CSS[utilizationClass(utilization)];
}

export function utilizationColor(utilization, alpha = 0.95) {
  return Cesium.Color.fromCssColorString(utilizationCss(utilization)).withAlpha(
    alpha,
  );
}

/** Line parts carry the ramp faintly; `nodata` stretches stay a hairline. */
export function partColor(utilization) {
  const css = utilizationCss(utilization);
  return Cesium.Color.fromCssColorString(css).withAlpha(
    Number.isFinite(utilization) ? 0.75 : 0.3,
  );
}

/** Marker size grows with design capacity against the overlay's largest. */
export function pointPixelSize(designDth, designMax, { hovered = false } = {}) {
  const share =
    designMax > 0 ? Math.sqrt(Math.max(designDth, 0) / designMax) : 0;
  const px = POINT_MIN_PX + (POINT_MAX_PX - POINT_MIN_PX) * share;
  return hovered ? px + 3 : px;
}

function clampLine(line) {
  const s = String(line).replace(/\s+/g, ' ').trim();
  return s.length > LINE_MAX ? `${s.slice(0, LINE_MAX - 1)}…` : s;
}

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

function formatInt(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : 'n/a';
}

function formatDth(dth) {
  if (!Number.isFinite(dth)) return 'n/a';
  if (dth >= 1e6) return `${(dth / 1e6).toFixed(2)}M Dth/d`;
  return `${formatInt(Math.round(dth))} Dth/d`;
}

export function formatUtilization(u) {
  return Number.isFinite(u) ? `${Math.round(u * 100)} %` : 'no reading';
}

/** The reading line every point surface leads with. */
export function readingLine(row, pipeline) {
  if (!Number.isFinite(row.utilization))
    return pipeline?.gasDay
      ? 'no reading in the capacity posting'
      : 'no live reading (route unavailable)';
  return joinParts([
    `${formatUtilization(row.utilization)} of design`,
    `${formatDth(row.scheduledDth)} scheduled`,
    `${formatDth(row.designDth)} design`,
  ]);
}

/** The gas-day stamp (R2/R3): the day, its cycle, then the fetch age. */
export function gasDayStamp(pipeline, now = Date.now()) {
  if (!pipeline?.gasDay) return 'no gas day served';
  const fetched = Date.parse(pipeline.fetchedAt ?? '');
  return joinParts([
    `gas day ${pipeline.gasDay}`,
    pipeline.cycle ? `cycle ${pipeline.cycle}` : null,
    Number.isFinite(fetched)
      ? `fetched ${formatAge(Math.max(0, now - fetched))} ago`
      : null,
  ]);
}

function noticeLine(row, snapshot) {
  if (!row.noticeIds.length) return null;
  const first = snapshot.noticeById.get(row.noticeIds[0]);
  return joinParts([
    `${row.noticeIds.length} critical notice${row.noticeIds.length === 1 ? '' : 's'}`,
    first ? `“${first.subject}”` : null,
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

/** Global tier: one card per pipeline over its linework. */
export function createPipelineOverlayEntry(
  pipeline,
  position,
  now = Date.now(),
) {
  const details = [
    pipeline.gasDay
      ? joinParts([
          `${pipeline.litPoints} point${pipeline.litPoints === 1 ? '' : 's'} read`,
          pipeline.medianUtilization !== null
            ? `median ${formatUtilization(pipeline.medianUtilization)} of design`
            : null,
          pipeline.overDesign > 0 ? `${pipeline.overDesign} over design` : null,
        ])
      : 'no live reading — geometry and placement only',
    pipeline.notices.length
      ? `${pipeline.notices.length} critical notice${pipeline.notices.length === 1 ? '' : 's'} (${pipeline.pipelineWideNotices} pipeline-wide)`
      : null,
    gasDayStamp(pipeline, now),
    'zoom in for the points',
  ]
    .filter(Boolean)
    .map(clampLine);
  return {
    ...baseEntry(
      `pipeline:${pipeline.id}`,
      position,
      pipeline.medianUtilization !== null
        ? utilizationCss(pipeline.medianUtilization)
        : UTILIZATION_CSS.nodata,
      Number.MAX_SAFE_INTEGER - 2,
    ),
    variant: 'card',
    title: `⛽ ${pipeline.name.toUpperCase()}`,
    details,
  };
}

/** Regional tier: a label for the tightest read points. */
export function createPointOverlayEntry(row) {
  if (!Number.isFinite(row.utilization)) return null;
  return {
    ...baseEntry(
      `point:${row.id}`,
      null, // the caller owns the position
      utilizationCss(row.utilization),
      Math.round(row.utilization * 1e6) + (row.noticeIds.length ? 1e6 : 0),
    ),
    variant: 'label',
    title: `${(row.name || row.loc).toUpperCase()} · ${formatUtilization(row.utilization)}`,
  };
}

/** The hover card (R5): the P4 gate's five facts in three lines. */
export function buildHoverPointCard(row, position, snapshot, now = Date.now()) {
  const pipeline = snapshot.pipelines.find((p) => p.id === row.pipeline);
  return {
    id: `hover-point:${row.id}`,
    position,
    accent: utilizationCss(row.utilization),
    title: joinParts([row.name.toUpperCase(), `Loc ${row.loc}`]),
    details: [
      readingLine(row, pipeline),
      noticeLine(row, snapshot),
      gasDayStamp(pipeline, now),
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

export function buildHoverStationCard(station, position, snapshot) {
  return {
    id: `hover-station:${station.id}`,
    position,
    accent: STATION_CSS,
    title: `${station.name.toUpperCase()} · COMPRESSOR`,
    details: [
      joinParts([
        station.county ? `${station.county} county` : null,
        station.state,
        station.certHp ? `${formatInt(station.certHp)} hp certificated` : null,
      ]),
      noticeLine(station, snapshot),
      joinParts([
        `placed by ${station.method ?? 'bundle'}`,
        station.offLine
          ? 'off the 2020 linework (coarse line, not the station)'
          : null,
      ]),
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

/** Selected card: the reading, each posted direction, notices, provenance. */
export function buildSelectedPointCard(
  row,
  position,
  snapshot,
  now = Date.now(),
) {
  const pipeline = snapshot.pipelines.find((p) => p.id === row.pipeline);
  const details = [readingLine(row, pipeline)];
  for (const d of row.directions)
    details.push(
      joinParts([
        d.direction === 'R'
          ? 'receipt'
          : d.direction === 'D'
            ? 'delivery'
            : d.direction,
        `${formatDth(d.scheduledDth)} of ${formatDth(d.designDth)}`,
        Number.isFinite(d.utilization)
          ? formatUtilization(d.utilization)
          : null,
      ]),
    );
  details.push(
    joinParts([
      row.type,
      row.county ? `${row.county} county` : null,
      row.state,
      row.counterparty,
    ]),
  );
  for (const id of row.noticeIds.slice(0, 3)) {
    const notice = snapshot.noticeById.get(id);
    if (notice)
      details.push(
        joinParts([
          `⚠ ${notice.subject}`,
          notice.upcoming
            ? `from ${String(notice.effectiveAt).slice(0, 10)}`
            : null,
        ]),
      );
  }
  details.push(
    joinParts([
      `placed by ${row.method ?? 'lookup'}`,
      Number.isFinite(row.confidence) ? `confidence ${row.confidence}` : null,
    ]),
  );
  details.push(
    joinParts(['pipeline postings (FERC)', gasDayStamp(pipeline, now)]),
  );
  return {
    id: `selected-point:${row.id}`,
    position,
    accent: utilizationCss(row.utilization),
    title: joinParts([row.name.toUpperCase(), `Loc ${row.loc}`]),
    details: details.filter(Boolean).map(clampLine),
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the tightest points, with stable identity as the tie-break. */
export function selectOverlayCohort(entries, limit = GAS_OVERLAY_COHORT_LIMIT) {
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

/** The panel row's colour legend: the utilization ramp with counts. */
export function legendEntries(snapshot) {
  if (!snapshot) return [];
  const counts = Object.fromEntries(UTILIZATION_CLASSES.map((c) => [c, 0]));
  for (const row of snapshot.points) counts[row.class] += 1;
  const labels = {
    over: 'over design (scheduled > design)',
    tight: 'tight (≥90 %)',
    elevated: 'elevated (≥70 %)',
    normal: 'normal (≥40 %)',
    low: 'low (<40 %)',
    nodata: 'no reading',
  };
  return ['over', 'tight', 'elevated', 'normal', 'low', 'nodata']
    .filter((key) => counts[key] > 0)
    .map((key, index) => ({
      label: labels[key],
      color: UTILIZATION_CSS[key],
      count: counts[key],
      blurb:
        index === 0
          ? 'scheduled ÷ design on the newest gas day · mark size is design capacity'
          : 'scheduled ÷ design on the newest gas day',
    }));
}
