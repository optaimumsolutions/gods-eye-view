import * as Cesium from 'cesium';
import { formatAge } from '../commodities/observation.js';
import { mcfPerDay } from './records.js';

export const FLARES_LAYER_ID = 'commodity-flares';
export const FLARES_OVERLAY_SOURCE_ID = 'commodity-flares';
export const FLARES_OVERLAY_COHORT_LIMIT = 12;
export const FLARES_OVERLAY_COLLISION_CAPACITY = 16;

export const FLARES_TIER_GLOBAL = 'global';
export const FLARES_TIER_REGIONAL = 'regional';
/** Below this camera height the site marks replace the region card. */
export const FLARES_REGIONAL_HEIGHT_M = 2_500_000;
export const FLARES_ZOOM_TO_REGION_HEIGHT_M = 1_200_000;
/** A site is a pad; 12 km keeps its neighbours in frame (the onshore rule). */
export const FLARES_FLY_TO_SITE_HEIGHT_M = 12_000;
export const FLARES_FLY_DURATION_S = 2.0;
/** Hover picks are event-driven and throttled; a still pointer costs nothing. */
export const FLARES_HOVER_THROTTLE_MS = 120;

export const REGION_MARK_PX = 16;
export const LIT_MARK_MIN_PX = 5;
export const LIT_MARK_MAX_PX = 14;
export const RING_PX = 3.5;
export const PIP_PX = 3;
const LINE_MAX = 96;

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return FLARES_TIER_GLOBAL;
  return cameraHeightM < FLARES_REGIONAL_HEIGHT_M
    ? FLARES_TIER_REGIONAL
    : FLARES_TIER_GLOBAL;
}

/**
 * Persistence ramp (FR-F6): a lit site is coloured by how many of the last
 * 30 clear nights it burned. Steady flarers are the basin's baseline and
 * read hot; a site the norm has never seen reads lime — new heat is the
 * anomaly the eye should catch. No clear nights yet means no norm: grey.
 */
export const PERSISTENCE_CSS = Object.freeze({
  steady: '#ff3b5c', // lit ≥ 80 % of clear nights
  frequent: '#ffb347', // ≥ 50 %
  occasional: '#39d5ff', // ≥ 20 %
  rare: '#b4ff39', // under 20 %: new or newly-lit heat
  unknown: '#9aa0a6', // no clear nights in the window yet
});

export function persistenceClass(litNights, clearNights) {
  if (!(clearNights > 0)) return 'unknown';
  const share = litNights / clearNights;
  if (share >= 0.8) return 'steady';
  if (share >= 0.5) return 'frequent';
  if (share >= 0.2) return 'occasional';
  return 'rare';
}

export function flareCss(row, clearNights) {
  return PERSISTENCE_CSS[persistenceClass(row.litNights, clearNights)];
}

export function flareColor(row, clearNights, alpha = 0.95) {
  return Cesium.Color.fromCssColorString(flareCss(row, clearNights)).withAlpha(
    alpha,
  );
}

/** Marker size grows with the night's max FRP against the basin's largest. */
export function litPixelSize(maxFrp, frpMax, { hovered = false } = {}) {
  const share = frpMax > 0 ? Math.sqrt(Math.max(maxFrp, 0) / frpMax) : 0;
  const px = LIT_MARK_MIN_PX + (LIT_MARK_MAX_PX - LIT_MARK_MIN_PX) * share;
  return hovered ? px + 3 : px;
}

/** Unlit sites are faint rings: a known flare site, dark last clear night. */
export const RING_STYLE = Object.freeze({
  fillCss: '#5f7f98',
  fillAlpha: 0.04,
  outlineCss: '#5f7f98',
  outlineAlpha: 0.3,
});

/** Unlisted-well and other heat: grey pips, never counted as sites. */
export const PIP_STYLE = Object.freeze({
  unlisted: Object.freeze({ css: '#9aa0a6', alpha: 0.8 }),
  other: Object.freeze({ css: '#9aa0a6', alpha: 0.55 }),
});

export function flarePosition(row) {
  return Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
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

function formatMw(mw) {
  if (!Number.isFinite(mw)) return 'n/a';
  return `${mw >= 100 ? Math.round(mw) : mw.toFixed(1)} MW`;
}

/** `ELKHORN RANCH · WHITE ROCK OIL & GAS, LLC` — the field and its lead operator. */
export function siteTitle(row) {
  return joinParts([row.field.toUpperCase() || row.id, row.operators[0]]);
}

function nightAge(night, now = Date.now()) {
  const ms = Date.parse(`${night}T09:00:00Z`); // the VIIRS passes sit 06–11Z
  if (!Number.isFinite(ms)) return null;
  return formatAge(Math.max(0, now - ms));
}

/** The lit line every site surface leads with. */
export function litLine(row, now = Date.now()) {
  if (row.lit)
    return joinParts([
      `lit · ${formatMw(row.maxFrp)}`,
      `${row.detections} detection${row.detections === 1 ? '' : 's'}`,
      row.satellites.join('+'),
    ]);
  if (row.lastLit)
    return `dark · last lit ${row.lastLit.night} (${nightAge(row.lastLit.night, now)} ago)`;
  return 'dark · not lit in the served window';
}

/** The norm line: persistence against the clear-night window. */
export function normLine(row, clearNights) {
  if (!(clearNights > 0)) return 'no clear nights in the window yet';
  return `lit ${row.litNights} of the last ${clearNights} clear night${clearNights === 1 ? '' : 's'}`;
}

/** The state-filing line: what the pad filed in the current month (FR-F1). */
export function filedLine(row, currentMonth) {
  if (!(row.flaredMcfCurrent > 0))
    return joinParts([
      `no flared gas filed ${currentMonth}`,
      row.lastFlaredMonth ? `last filed ${row.lastFlaredMonth}` : null,
    ]);
  return joinParts([
    `filed ${formatInt(Math.round(mcfPerDay(row.flaredMcfCurrent, currentMonth)))} Mcf/d flared (${currentMonth})`,
    `${row.wells} well${row.wells === 1 ? '' : 's'}`,
  ]);
}

function fetchedStamp(snapshot, now = Date.now()) {
  const fetched = Date.parse(snapshot.retrievedAt ?? '');
  return Number.isFinite(fetched)
    ? `fetched ${formatAge(Math.max(0, now - fetched))} ago`
    : null;
}

/** The observation stamp a card carries (R2/R3): the night, then the fetch. */
export function nightStamp(snapshot, now = Date.now()) {
  const night = snapshot.displayNight;
  if (!night) return 'no nights in the store yet';
  return joinParts([
    `night ${night.night} (${night.cloud.state}${night.suspect ? ', suspect' : ''})`,
    fetchedStamp(snapshot, now),
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

/** Global tier: the region card (FR-F6), the whole basin in five lines. */
export function createRegionOverlayEntry(snapshot, position, now = Date.now()) {
  const night = snapshot.displayNight;
  const details = [];
  if (night) {
    details.push(
      joinParts([
        `${formatInt(night.litSites)} sites lit · ${formatMw(night.siteFrpMw)}`,
        night.satellites.length ? `${night.satellites.length} passes` : null,
      ]),
    );
    const base = snapshot.baseline;
    if (base?.clearNights > 0 && Number.isFinite(base.litMedian))
      details.push(
        `median ${formatInt(Math.round(base.litMedian))} lit · ${formatMw(base.frpMedian)} over ${base.clearNights} clear nights`,
      );
    details.push(
      `split ${night.counts.site} site · ${night.counts.unlisted} unlisted well · ${night.counts.other} other`,
    );
    if (!night.isClear)
      details.push('no trusted clear night in the window — showing the newest');
    else if (snapshot.latestNight && snapshot.latestNight.night !== night.night)
      details.push(
        `newest night ${snapshot.latestNight.night} is ${snapshot.latestNight.cloud.state}${snapshot.latestNight.suspect ? ' (suspect)' : ''} — showing the last clear`,
      );
  } else {
    details.push('no nights in the store yet — give the feed a refresh');
  }
  const filed = snapshot.bundleCounts;
  if (filed?.flaredMmcfdCurrent > 0)
    details.push(
      `state filings ${snapshot.currentMonth}: ${formatInt(filed.sitesFlaringCurrent)} sites flared ${filed.flaredMmcfdCurrent.toFixed(1)} MMcf/d`,
    );
  details.push(nightStamp(snapshot, now));
  details.push('zoom in for the sites');
  return {
    ...baseEntry(
      `region:${snapshot.region.id}`,
      position,
      PERSISTENCE_CSS.frequent,
      Number.MAX_SAFE_INTEGER - 2,
    ),
    variant: 'card',
    title: `🔥 ${snapshot.regionName.toUpperCase()} · GAS FLARES`,
    details: details.map(clampLine),
  };
}

/** Regional tier: a label for the hottest lit sites, ranked by FRP. */
export function createLitSiteOverlayEntry(row, position, clearNights) {
  if (!row.lit) return null;
  return {
    ...baseEntry(
      `site:${row.id}`,
      position,
      flareCss(row, clearNights),
      Math.round(row.maxFrp * 100),
    ),
    variant: 'label',
    title: `${(row.field || row.id).toUpperCase()} · ${formatMw(row.maxFrp)}`,
  };
}

/** The hover card (R5): name, the lit line with age, the norm (compact). */
export function buildHoverSiteCard(row, position, snapshot, now = Date.now()) {
  return {
    id: `hover-site:${row.id}`,
    position,
    accent: flareCss(row, snapshot.clearNights),
    title: siteTitle(row),
    details: [
      joinParts([
        litLine(row, now),
        row.lit && snapshot.displayNight
          ? `night ${snapshot.displayNight.night}`
          : null,
      ]),
      normLine(row, snapshot.clearNights),
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

/** Selected card: the site's night reading, norm, filing and provenance. */
export function buildSelectedSiteCard(
  row,
  position,
  snapshot,
  now = Date.now(),
) {
  const details = [
    litLine(row, now),
    normLine(row, snapshot.clearNights),
    filedLine(row, snapshot.currentMonth),
    joinParts([
      row.county ? `${row.county} county` : null,
      row.siteCloud && row.siteCloud !== 'unknown'
        ? `site sky ${row.siteCloud}`
        : null,
    ]),
    joinParts(['NASA FIRMS VIIRS NRT', nightStamp(snapshot, now)]),
  ]
    .filter(Boolean)
    .map(clampLine);
  return {
    id: `selected-site:${row.id}`,
    position,
    accent: flareCss(row, snapshot.clearNights),
    title: siteTitle(row),
    details,
    selected: true,
    priority: Number.MAX_SAFE_INTEGER,
    horizonCull: true,
    terrainOcclusion: false,
  };
}

/** Keep the hottest sites, with stable identity as the tie-break. */
export function selectOverlayCohort(
  entries,
  limit = FLARES_OVERLAY_COHORT_LIMIT,
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

/** The panel row's colour legend: the persistence ramp, one swatch each. */
export function legendEntries(snapshot) {
  if (!snapshot) return [];
  const clearNights = snapshot.clearNights;
  const litRows = snapshot.rows.filter((row) => row.lit);
  const counts = { steady: 0, frequent: 0, occasional: 0, rare: 0, unknown: 0 };
  for (const row of litRows)
    counts[persistenceClass(row.litNights, clearNights)] += 1;
  const labels = {
    steady: 'steady (lit ≥80% of clear nights)',
    frequent: 'frequent (≥50%)',
    occasional: 'occasional (≥20%)',
    rare: 'new or rare (<20%)',
    unknown: 'no norm yet',
  };
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n], index) => ({
      label: labels[key],
      color: PERSISTENCE_CSS[key],
      count: n,
      blurb:
        index === 0
          ? 'nights lit over the last 30 clear nights · mark size is the night’s max FRP'
          : 'nights lit over the last 30 clear nights',
    }));
}
