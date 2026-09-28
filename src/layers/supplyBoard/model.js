/**
 * The US gas supply board (docs/COMMODITIES-PLAN.md §16, row 14 M2, R14.8):
 * one card at the national view and a panel line. Built regions come from
 * the globe's own contributors files (filed production by region, always
 * available); the national balance and working gas come from the Oil Oracle
 * store's `supply-board` route, labelled as the oracle's (H6), and are
 * optional: without the console the card keeps its region lines and says
 * the store is not reachable. Descriptive only (R11): filed and published
 * figures with their months, no forecast, no price until a licensed curve
 * exists (D14.2). Portable: no Cesium, no DOM.
 */

import { monthAbbrev } from '../production/completeness.js';
import { formatSignedIn } from '../production/contributorsView.js';

export const SUPPLY_BOARD_LAYER_ID = 'gas-supply-us';
/** The card hangs over the middle of the lower 48. */
export const SUPPLY_BOARD_ANCHOR = Object.freeze({ lat: 38.6, lon: -98.6 });
/** Shown at global depth only; closer in, the region layers speak. */
export const SUPPLY_BOARD_MIN_HEIGHT_M = 2_500_000;
/** Older than this and a store line is dropped rather than shown as current. */
export const STORAGE_MAX_AGE_DAYS = 21;
export const MONTHLY_MAX_AGE_DAYS = 160;
/** The onshore and offshore regions the plan names (§14.5 eleven + the Gulf). */
export const SUPPLY_REGIONS_PLANNED = 12;

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

function finite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ageDays(isoDay, now) {
  const t = Date.parse(`${String(isoDay).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? (now - t) / 86_400_000 : Infinity;
}

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** The store's payload with the too-old parts dropped; null when nothing is left. */
export function normaliseBoard(payload, { now = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || payload.error) return null;
  const monthly = new Map();
  for (const row of Array.isArray(payload.monthly) ? payload.monthly : []) {
    const bcfd = finite(row?.bcfd);
    if (!row?.label || bcfd === null || !row.observedAt) continue;
    if (ageDays(row.observedAt, now) > MONTHLY_MAX_AGE_DAYS) continue;
    monthly.set(String(row.label), {
      label: String(row.label),
      month: String(row.month),
      bcfd,
      yoyBcfd: finite(row.yoyBcfd),
    });
  }
  const s = payload.storage;
  const storage =
    s &&
    finite(s.l48Bcf) !== null &&
    ageDays(s.observedAt, now) <= STORAGE_MAX_AGE_DAYS
      ? {
          weekEnding: String(s.weekEnding),
          l48Bcf: finite(s.l48Bcf),
          weeklyBuildBcf: finite(s.weeklyBuildBcf),
          yoyBcf: finite(s.yoyBcf),
          avg5yrBcf: finite(s.avg5yrBcf),
          bandPositionPct: finite(s.bandPositionPct),
        }
      : null;
  if (!monthly.size && !storage) return null;
  return { asOf: payload.asOf ?? null, monthly, storage };
}

const signed = (n, digits = 1) =>
  n === null
    ? null
    : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

/** `Dry production 112.3 Bcf/d (EIA, JUN) · YoY +4.8 · consumption 81.1 · LNG exports 16.1 Bcf/d`. */
export function balanceLine(board) {
  const dry = board?.monthly.get('dry production');
  if (!dry) return null;
  const consumption = board.monthly.get('total consumption');
  const lng = board.monthly.get('LNG exports');
  return joinParts([
    `Dry production ${dry.bcfd.toFixed(1)} Bcf/d (EIA, ${monthAbbrev(dry.month)})`,
    dry.yoyBcfd !== null ? `YoY ${signed(dry.yoyBcfd)}` : null,
    consumption ? `consumption ${consumption.bcfd.toFixed(1)}` : null,
    lng ? `LNG exports ${lng.bcfd.toFixed(1)} Bcf/d` : null,
  ]);
}

/** `Storage 3,351 Bcf (wk 09-18) · +53 build · 76 % up the 5-yr band (avg 3,261) · YoY −148`. */
export function storageLine(board) {
  const s = board?.storage;
  if (!s) return null;
  return joinParts([
    `Storage ${INT.format(s.l48Bcf)} Bcf (wk ${s.weekEnding.slice(5)})`,
    s.weeklyBuildBcf !== null
      ? `${signed(s.weeklyBuildBcf, 0)} ${s.weeklyBuildBcf >= 0 ? 'build' : 'draw'}`
      : null,
    s.bandPositionPct !== null
      ? `${Math.round(s.bandPositionPct)} % up the 5-yr band${s.avg5yrBcf !== null ? ` (avg ${INT.format(s.avg5yrBcf)})` : ''}`
      : null,
    s.yoyBcf !== null ? `YoY ${signed(s.yoyBcf, 0)}` : null,
  ]);
}

/** `Filed: Williston 3.43 (JUL, +27.5 MoM) · Gulf 2.03 (JUN, +72.8) Bcf/d`. */
export function regionsLine(regions) {
  const built = (regions ?? []).filter((r) => r && r.totalMcfd > 0);
  if (!built.length) return null;
  return `Filed: ${built
    .map(
      (r, i) =>
        `${r.label} ${(r.totalMcfd / 1e6).toFixed(2)} (${monthAbbrev(r.currentMonth)}${
          r.mom
            ? `, ${formatSignedIn(r.mom.region.deltaMcfd, 'MMcf/d')}${i === 0 ? ' MoM' : ''}`
            : ''
        })`,
    )
    .join(' · ')} Bcf/d`;
}

/** The card's lines, store lines first when the store answered. */
export function supplyBoardLines({
  regions = [],
  board = null,
  boardError = null,
} = {}) {
  const built = regions.filter((r) => r && r.totalMcfd > 0).length;
  return [
    balanceLine(board),
    storageLine(board),
    regionsLine(regions),
    joinParts([
      `${built} of ${SUPPLY_REGIONS_PLANNED} regions built on filings; the rest are inside the EIA total`,
    ]),
    board
      ? 'Oil Oracle store (EIA) · state and BSEE filings · descriptive only'
      : `Oil Oracle store not reachable${boardError ? ` (${boardError})` : ''} · state and BSEE filings`,
  ]
    .filter(Boolean)
    .map(clampLine);
}

/** The panel line: `US GAS · 112.3 BCF/D DRY (JUN) · STORAGE 3,351 BCF (09-18) · 2 REGIONS FILED`. */
export function supplyBoardMetaLine({ regions = [], board = null } = {}) {
  const dry = board?.monthly.get('dry production');
  const s = board?.storage;
  const built = regions.filter((r) => r && r.totalMcfd > 0).length;
  return joinParts([
    'US GAS',
    dry ? `${dry.bcfd.toFixed(1)} BCF/D DRY (${monthAbbrev(dry.month)})` : null,
    s ? `STORAGE ${INT.format(s.l48Bcf)} BCF (${s.weekEnding.slice(5)})` : null,
    `${built} REGION${built === 1 ? '' : 'S'} FILED`,
  ]).toUpperCase();
}

/** The one ambient card at global depth. */
export function createSupplyBoardOverlayEntry(snapshot, position) {
  if (!snapshot || !position) return null;
  return {
    id: 'board:us',
    position,
    accent: '#39d5ff',
    priority: Number.MAX_SAFE_INTEGER - 3,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: false,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 14,
    verticalOnly: true,
    placement: 'above',
    variant: 'card',
    title: 'US NATURAL GAS SUPPLY',
    details: supplyBoardLines(snapshot),
  };
}
