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
/** Pipeline postings are daily; older than this and the flow lines are dropped. */
export const FLOWS_MAX_AGE_DAYS = 5;
/** Short names for the store's flow signals (row 14 M4, FR-N15). */
export const FLOW_SHORT = Object.freeze({
  NG_FLOW_SABINE_FEEDGAS_CREOLE: 'Sabine',
  NG_FLOW_CORPUS_FEEDGAS_CCPL: 'Corpus',
  NG_FLOW_GOLDEN_PASS_GULF_RUN: 'Golden Pass',
  NG_FLOW_HAYNESVILLE_GULF_RUN_REC: 'Haynesville on Gulf Run',
  NG_FLOW_APPALACHIA_ROVER_REC: 'Appalachia on Rover',
  NG_FLOW_CAMERON_FEEDGAS_CIP: 'Cameron',
  NG_FLOW_FREEPORT_FEEDGAS_GS: 'Freeport',
  NG_FLOW_HAYNESVILLE_LEG_CIP_REC: 'LEG on Cameron',
});
const FEEDGAS = [
  'NG_FLOW_SABINE_FEEDGAS_CREOLE',
  'NG_FLOW_CORPUS_FEEDGAS_CCPL',
  'NG_FLOW_GOLDEN_PASS_GULF_RUN',
  'NG_FLOW_CAMERON_FEEDGAS_CIP',
  'NG_FLOW_FREEPORT_FEEDGAS_GS',
];
const SUPPLY_FLOWS = [
  'NG_FLOW_HAYNESVILLE_GULF_RUN_REC',
  'NG_FLOW_APPALACHIA_ROVER_REC',
  'NG_FLOW_HAYNESVILLE_LEG_CIP_REC',
];
/**
 * STEO's DUC series end about a month before each release and releases are
 * 4-5 weeks apart, so the newest month is ~70 days old just before a release
 * (oracle PRD-duc-tracker G9); older than this and the DUC lines are dropped.
 */
export const DUCS_MAX_AGE_DAYS = 100;
/** Short names for the STEO regions on the card. */
const DUC_SHORT = Object.freeze({ R48: 'rest L48' });
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

/**
 * ok | late | stale for one part (oracle DATA-MAP P1.1): the oracle's one
 * staleness rule wins when the payload carries it (`freshness.state`); an
 * older payload falls back to this file's age limits.
 */
function verdict(row, observedAt, maxDays, now) {
  const st = row?.freshness?.state;
  if (typeof st === 'string' && st !== 'none') return st;
  return ageDays(observedAt, now) > maxDays ? 'stale' : 'ok';
}

/**
 * The store's payload with the stale parts held back (named in `held`, so the
 * card says so instead of dropping them silently) and late ones marked;
 * null when the store sent nothing at all.
 */
export function normaliseBoard(payload, { now = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || payload.error) return null;
  const held = [];
  const monthly = new Map();
  for (const row of Array.isArray(payload.monthly) ? payload.monthly : []) {
    const bcfd = finite(row?.bcfd);
    if (!row?.label || bcfd === null || !row.observedAt) continue;
    const mv = verdict(row, row.observedAt, MONTHLY_MAX_AGE_DAYS, now);
    if (mv === 'stale') {
      held.push(`${row.label} (${monthAbbrev(String(row.month))})`);
      continue;
    }
    monthly.set(String(row.label), {
      label: String(row.label),
      month: String(row.month),
      bcfd,
      yoyBcfd: finite(row.yoyBcfd),
      late: mv === 'late',
    });
  }
  const s = payload.storage;
  const sv =
    s && finite(s.l48Bcf) !== null
      ? verdict(s, s.observedAt, STORAGE_MAX_AGE_DAYS, now)
      : null;
  if (sv === 'stale')
    held.push(`storage (wk ${String(s.weekEnding).slice(5)})`);
  const storage =
    sv && sv !== 'stale'
      ? {
          late: sv === 'late',
          weekEnding: String(s.weekEnding),
          l48Bcf: finite(s.l48Bcf),
          weeklyBuildBcf: finite(s.weeklyBuildBcf),
          yoyBcf: finite(s.yoyBcf),
          avg5yrBcf: finite(s.avg5yrBcf),
          bandPositionPct: finite(s.bandPositionPct),
        }
      : null;
  const flows = new Map();
  let staleGasDay = null;
  for (const row of Array.isArray(payload.flows) ? payload.flows : []) {
    const bcfd = finite(row?.bcfd);
    if (!row?.id || bcfd === null || !row.gasDay) continue;
    if (verdict(row, row.gasDay, FLOWS_MAX_AGE_DAYS, now) === 'stale') {
      const gd = String(row.gasDay).slice(0, 10);
      if (!staleGasDay || gd > staleGasDay) staleGasDay = gd;
      continue;
    }
    flows.set(String(row.id), {
      id: String(row.id),
      gasDay: String(row.gasDay).slice(0, 10),
      bcfd,
      chg7Bcfd: finite(row.chg7Bcfd),
    });
  }
  if (staleGasDay)
    held.push(`pipeline flows (gas day ${staleGasDay.slice(5)})`);
  const ducs = normaliseDucs(payload.ducs, now, held);
  if (!monthly.size && !storage && !flows.size && !ducs && !held.length)
    return null;
  return { asOf: payload.asOf ?? null, monthly, storage, flows, ducs, held };
}

/**
 * The store's `ducs` section (oracle PRD-duc-tracker G9): EIA STEO's DUC
 * count per basin for every viewer, plus the well-level reconstruction only
 * when the route included it (the founder; the oracle withholds it from
 * invitees while the FracFocus licence question is open).
 */
function normaliseDucs(d, now, held = []) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.basins)) return null;
  const basins = [];
  for (const b of d.basins) {
    const duc = finite(b?.duc);
    if (!b?.basin || duc === null || !b.observedAt) continue;
    if (verdict(b, b.observedAt, DUCS_MAX_AGE_DAYS, now) === 'stale') {
      if (!held.some((h) => h.startsWith('DUCs')))
        held.push(
          `DUCs (${monthAbbrev(String(d.month ?? b.observedAt).slice(0, 7))})`,
        );
      continue;
    }
    basins.push({
      code: String(b.code ?? ''),
      basin: String(b.basin),
      duc,
      vs12mo: finite(b.vs12mo),
      drilled: finite(b.drilled),
      completed: finite(b.completed),
    });
  }
  const reconstruction = [];
  for (const r of Array.isArray(d.reconstruction) ? d.reconstruction : []) {
    const duc = finite(r?.duc);
    if (!r?.label || duc === null || !r.observedAt) continue;
    if (verdict(r, r.observedAt, DUCS_MAX_AGE_DAYS, now) === 'stale') continue;
    reconstruction.push({
      label: String(r.label),
      month: String(r.month),
      duc,
      rangeLow: finite(r.rangeLow),
      provisional: Boolean(r.provisional),
      trackMedianPct: finite(r.track?.median_pct),
    });
  }
  if (!basins.length && !reconstruction.length) return null;
  return {
    release: d.release ? String(d.release) : null,
    month: d.month ? String(d.month) : null,
    fiveBasins: finite(d.fiveBasins),
    usTotal: finite(d.usTotal),
    basins,
    reconstruction,
  };
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
    `Dry production ${dry.bcfd.toFixed(1)} Bcf/d (EIA, ${monthAbbrev(dry.month)}${dry.late ? ', late' : ''})`,
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
    `Storage ${INT.format(s.l48Bcf)} Bcf (wk ${s.weekEnding.slice(5)}${s.late ? ', late' : ''})`,
    s.weeklyBuildBcf !== null
      ? `${signed(s.weeklyBuildBcf, 0)} ${s.weeklyBuildBcf >= 0 ? 'build' : 'draw'}`
      : null,
    s.bandPositionPct !== null
      ? `${Math.round(s.bandPositionPct)} % up the 5-yr band${s.avg5yrBcf !== null ? ` (avg ${INT.format(s.avg5yrBcf)})` : ''}`
      : null,
    s.yoyBcf !== null ? `YoY ${signed(s.yoyBcf, 0)}` : null,
  ]);
}

/**
 * `head part · part · … part Bcf/d`, wrapped onto continuation lines so no
 * line passes LINE_MAX (a part never splits; the first always joins `head`).
 */
function wrapParts(head, parts) {
  const lines = [];
  let line = head;
  parts.forEach((part, i) => {
    const tail = i === parts.length - 1 ? ' Bcf/d' : ' ·';
    const next = `${line} ${part}${tail}`;
    if (next.length > LINE_MAX && line !== head) {
      lines.push(line);
      line = `${part}${tail}`;
    } else line = next;
  });
  lines.push(line);
  return lines;
}

function flowsLines(board, ids, lead) {
  const rows = ids.map((id) => board?.flows?.get(id)).filter(Boolean);
  if (!rows.length) return [];
  const day = rows
    .map((r) => r.gasDay)
    .sort()
    .at(-1);
  return wrapParts(
    `${lead} (scheduled, gas day ${day.slice(5)}):`,
    rows.map((r) => `${FLOW_SHORT[r.id] ?? r.id} ${r.bcfd.toFixed(2)}`),
  );
}

/** `LNG feedgas (scheduled, gas day 09-27): Sabine 1.44 · Corpus 2.43 · …`, wrapped. */
export function feedgasLines(board) {
  return flowsLines(board, FEEDGAS, 'LNG feedgas');
}

/** `Pipes (scheduled, gas day 09-27): Haynesville on Gulf Run 2.69 · Appalachia on Rover 3.59 Bcf/d`. */
export function pipeSupplyLines(board) {
  return flowsLines(board, SUPPLY_FLOWS, 'Pipes');
}

/**
 * The built regions as the board counts them: entries sharing a `group` (the
 * Permian's three Texas layers, split by county for size) fold into one item,
 * summed at the newest month every member has filed so no month is mixed, its
 * change against the month before taken from the same series. Entries
 * without a group pass through unchanged.
 */
export function foldRegionGroups(regions) {
  const items = [];
  const groups = new Map();
  for (const r of regions ?? []) {
    if (!r || !(r.totalMcfd > 0)) continue;
    if (!r.group) {
      items.push(r);
      continue;
    }
    let group = groups.get(r.group);
    if (!group) {
      group = { label: r.group, members: [] };
      groups.set(r.group, group);
      items.push(group);
    }
    group.members.push(r);
  }
  return items.map((item) => {
    if (!item.members) return item;
    const month = item.members.map((m) => m.currentMonth).sort()[0];
    let total = 0;
    let prior = 0;
    let priorFiled = true;
    for (const m of item.members) {
      const at = m.months.indexOf(month);
      total += m.totalGasMcfd?.[at] ?? 0;
      const before = at > 0 ? m.totalGasMcfd?.[at - 1] : null;
      if (before === null || before === undefined) priorFiled = false;
      else prior += before;
    }
    return {
      label: item.label,
      totalMcfd: total,
      currentMonth: month,
      mom: priorFiled ? { region: { deltaMcfd: total - prior } } : null,
      members: item.members.length,
    };
  });
}

function regionParts(regions) {
  return foldRegionGroups(regions).map(
    (r, i) =>
      `${r.label} ${(r.totalMcfd / 1e6).toFixed(2)} (${monthAbbrev(r.currentMonth)}${
        r.mom
          ? `, ${formatSignedIn(r.mom.region.deltaMcfd, 'MMcf/d')}${i === 0 ? ' MoM' : ''}`
          : ''
      })`,
  );
}

/** `Filed: Williston 3.43 (JUL, +27.5 MoM) · Gulf 2.03 (JUN, +72.8) Bcf/d`. */
export function regionsLine(regions) {
  const parts = regionParts(regions);
  if (!parts.length) return null;
  return `Filed: ${parts.join(' · ')} Bcf/d`;
}

/**
 * The same regions packed onto as many card lines as they need, so a long
 * list wraps instead of being cut at the card width.
 */
export function regionsLines(regions) {
  const parts = regionParts(regions);
  if (!parts.length) return [];
  return wrapParts('Filed:', parts);
}

/** `head part · part · … part`, wrapped onto continuation lines at LINE_MAX. */
function wrapPlain(head, parts) {
  const lines = [];
  let line = head;
  parts.forEach((part, i) => {
    const tail = i === parts.length - 1 ? '' : ' ·';
    const next = `${line} ${part}${tail}`;
    if (next.length > LINE_MAX && line !== head) {
      lines.push(line);
      line = `${part}${tail}`;
    } else line = next;
  });
  lines.push(line);
  return lines;
}

/**
 * `DUCs (EIA STEO, AUG; released 09-09): Permian 839 (−227 y/y) · … · 5 basins
 * 2,655 · US 4,919`, then `Drilled/completed (AUG): Permian 500/488 · …`, then
 * the founder's reconstruction lines when the store sent them. A falling DUC
 * count means wells are being completed faster than drilled.
 */
export function ducsLines(board) {
  const d = board?.ducs;
  if (!d) return [];
  const lines = [];
  const mon = d.month ? monthAbbrev(d.month) : '';
  if (d.basins.length) {
    const parts = d.basins.map(
      (b) =>
        `${DUC_SHORT[b.code] ?? b.basin} ${INT.format(b.duc)}${
          b.vs12mo !== null ? ` (${signed(b.vs12mo, 0)} y/y)` : ''
        }`,
    );
    if (d.fiveBasins !== null)
      parts.push(`5 basins ${INT.format(d.fiveBasins)}`);
    if (d.usTotal !== null) parts.push(`US ${INT.format(d.usTotal)}`);
    lines.push(
      ...wrapPlain(
        `DUCs (EIA STEO, ${mon}${d.release ? `; released ${d.release.slice(5)}` : ''}):`,
        parts,
      ),
    );
    const flow = d.basins
      .filter(
        (b) => b.drilled !== null && b.completed !== null && b.code !== 'R48',
      )
      .map(
        (b) => `${b.basin} ${INT.format(b.drilled)}/${INT.format(b.completed)}`,
      );
    if (flow.length)
      lines.push(...wrapPlain(`Drilled/completed (${mon}):`, flow));
  }
  for (const r of d.reconstruction) {
    lines.push(
      joinParts([
        `${r.label} reconstruction ${INT.format(r.duc)} (${monthAbbrev(r.month)}${
          r.provisional ? ', provisional' : ''
        }${r.rangeLow !== null && r.rangeLow !== r.duc ? `; ${INT.format(r.rangeLow)}–${INT.format(r.duc)}` : ''})`,
        r.trackMedianPct !== null
          ? `track ${signed(r.trackMedianPct, 0)}% vs EIA`
          : null,
        'founder only',
      ]),
    );
  }
  return lines;
}

/** The card's lines, store lines first when the store answered. */
export function supplyBoardLines({
  regions = [],
  board = null,
  boardError = null,
} = {}) {
  const built = foldRegionGroups(regions).length;
  return [
    balanceLine(board),
    storageLine(board),
    ...feedgasLines(board),
    ...pipeSupplyLines(board),
    ...regionsLines(regions),
    ...ducsLines(board),
    board?.held?.length
      ? `Held back as stale: ${board.held.join(' · ')}`
      : null,
    joinParts([
      `${built} of ${SUPPLY_REGIONS_PLANNED} regions built on filings; the rest are inside the EIA total`,
    ]),
    board
      ? `Oil Oracle store (EIA${board.ducs ? ' incl. STEO' : ''}${board.flows?.size ? ', pipeline postings' : ''}) · state and BSEE filings · descriptive only`
      : `Oil Oracle store not reachable${boardError ? ` (${boardError})` : ''} · state and BSEE filings`,
  ]
    .filter(Boolean)
    .map(clampLine);
}

/** The panel line: `US GAS · 112.3 BCF/D DRY (JUN) · STORAGE 3,351 BCF (09-18) · 2 REGIONS FILED`. */
export function supplyBoardMetaLine({ regions = [], board = null } = {}) {
  const dry = board?.monthly.get('dry production');
  const s = board?.storage;
  const built = foldRegionGroups(regions).length;
  return joinParts([
    'US GAS',
    dry ? `${dry.bcfd.toFixed(1)} BCF/D DRY (${monthAbbrev(dry.month)})` : null,
    s ? `STORAGE ${INT.format(s.l48Bcf)} BCF (${s.weekEnding.slice(5)})` : null,
    board?.ducs?.fiveBasins != null
      ? `DUCS ${INT.format(board.ducs.fiveBasins)} (${monthAbbrev(board.ducs.month)})`
      : null,
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
