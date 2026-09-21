/**
 * Bundled Gulf of Mexico platform records: normalisation, the derived readings
 * every surface shares, and the formatters (docs/COMMODITIES-PLAN.md §13).
 *
 * One record shape feeds the marks, the ambient cards, the selected card, the
 * dossier, the panel line and the analyst engine, so a number can only ever
 * be computed one way. Portable by rule: no Cesium, no DOM, no Node built-ins.
 *
 * What is measured here is monthly production filed with BSEE per platform
 * structure; "current" is the newest complete reporting month, never the
 * newest month with rows (see completeness.js). Every reading is stamped
 * through the row-1 observation contract with the month it describes and
 * the day the file was retrieved.
 */

import { createObservation, formatAsOf } from '../commodities/observation.js';
import { fillingMonthsLine } from './completeness.js';

export const GULF_LAYER_ID = 'production-gulf-platforms';
export const GULF_SOURCE_NAME = 'BSEE';
export const GULF_SOURCE_LONG =
  'BSEE OGOR-A production by platform, data.bsee.gov';

/**
 * BSEE's barrel-of-oil-equivalent convention, 5.62 Mcf per BOE, measured from
 * the file. Used only as a fallback: the bundle carries BSEE's own BOE as
 * filed, because their rounding is not reproducible from the totals (17,785
 * bbl/d + 167,392 Mcf/d files as 47,571 BOE/d; the convention gives 47,570).
 */
export const MCF_PER_BOE = 5.62;

/**
 * The change classes against the same month a year earlier (R11.4). Bands are
 * descriptive: `up` and `down` are more than ten percent either way; `new` is
 * production where there was none a year ago; `quiet` is an installed
 * structure with no gas this month; `unknown` has no production rows at all.
 */
export const YOY_CLASSES = Object.freeze([
  'up',
  'flat',
  'down',
  'new',
  'quiet',
  'unknown',
]);
export const YOY_UP_PCT = 10;
export const YOY_DOWN_PCT = -10;

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Codepoint comparison, never `localeCompare`: rank order must not depend on the machine's locale. */
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function monthIndex(months, month) {
  const index = months.indexOf(month);
  return index >= 0 ? index : null;
}

/** Last instant of a `YYYY-MM` month, UTC — the moment the month's figure describes. */
export function monthEndIso(month) {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString();
}

/** Days in a `YYYY-MM` month. */
export function daysInMonth(month) {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Barrels of oil equivalent per day from BSEE's convention; null when both inputs are null. */
export function boePerDay(oilBopd, gasMcfd) {
  const oil = num(oilBopd);
  const gas = num(gasMcfd);
  if (oil === null && gas === null) return null;
  return (oil ?? 0) + (gas ?? 0) / MCF_PER_BOE;
}

/** One month's reading from the series arrays, or null when nothing was filed. */
function readingAt(series, index) {
  if (!series || index === null || index < 0) return null;
  const gas = num(series.gas[index]);
  const oil = num(series.oil[index]);
  const water = num(series.water[index]);
  const boe = num(series.boe[index]);
  const wells = num(series.wells[index]);
  if (gas === null && oil === null && water === null && wells === null)
    return null;
  return Object.freeze({
    gasMcfd: gas,
    oilBopd: oil,
    waterBwpd: water,
    // As filed; the convention only fills a blank.
    boepd: boe ?? boePerDay(oil, gas),
    boeFiled: boe !== null,
    wells,
  });
}

/**
 * Change class and percentage against the same month a year earlier. The
 * percentage is null whenever the class is not a comparison (`new`, `quiet`,
 * `unknown`), so a card never prints a number for a non-number.
 */
export function yoyChange(current, lastYear, { hasSeries = true } = {}) {
  const now = num(current?.gasMcfd);
  if (!hasSeries) return Object.freeze({ class: 'unknown', pct: null });
  if (now === null || now <= 0)
    return Object.freeze({ class: 'quiet', pct: null });
  const then = num(lastYear?.gasMcfd);
  if (then === null || then <= 0)
    return Object.freeze({ class: 'new', pct: null });
  const pct = (now / then - 1) * 100;
  const cls = pct > YOY_UP_PCT ? 'up' : pct < YOY_DOWN_PCT ? 'down' : 'flat';
  return Object.freeze({ class: cls, pct: Math.round(pct * 10) / 10 });
}

function normaliseSeries(raw, length) {
  if (!raw || typeof raw !== 'object') return null;
  const take = (key) => {
    const values = Array.isArray(raw[key]) ? raw[key] : [];
    const out = new Array(length);
    for (let i = 0; i < length; i += 1) out[i] = num(values[i]);
    return Object.freeze(out);
  };
  return Object.freeze({
    gas: take('gas'),
    oil: take('oil'),
    water: take('water'),
    boe: take('boe'),
    wells: take('wells'),
  });
}

function normaliseLifetime(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return Object.freeze({
    firstMonth: text(raw.firstMonth),
    lastMonth: text(raw.lastMonth),
    monthsProducing: num(raw.monthsProducing) ?? 0,
    peakGasMcfd: num(raw.peakGasMcfd),
    peakGasMonth: text(raw.peakGasMonth),
    peakOilBopd: num(raw.peakOilBopd),
    peakOilMonth: text(raw.peakOilMonth),
    cumGasMcf: num(raw.cumGasMcf),
    cumOilBbl: num(raw.cumOilBbl),
  });
}

/**
 * One platform structure. Returns null when the essentials (id, position)
 * are missing so a broken row cannot reach the map.
 */
export function normalisePlatform(raw, context) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id);
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!id || lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const {
    months,
    currentIndex,
    priorIndex,
    lastYearIndex,
    observedAt,
    publishedAt,
    fetchedAt,
  } = context;
  const series = normaliseSeries(raw.series, months.length);
  const current = readingAt(series, currentIndex);
  const prior = readingAt(series, priorIndex);
  const lastYear = readingAt(series, lastYearIndex);
  const yoy = yoyChange(current, lastYear, { hasSeries: Boolean(series) });
  const producing = (current?.gasMcfd ?? 0) > 0;
  const name =
    text(raw.name) ?? `Structure ${text(raw.structureNumber) ?? '?'}`;
  const area = text(raw.area);
  const block = text(raw.block);
  const lifetime = normaliseLifetime(raw.lifetime);
  const headline = producing
    ? `${name} ${formatMcfd(current.gasMcfd)}`
    : `${name} no gas this month`;
  return Object.freeze({
    id,
    complexId: text(raw.complexId),
    structureNumber: text(raw.structureNumber),
    name,
    area,
    block,
    areaBlock: area && block ? `${area} ${block}` : (area ?? block),
    lease: text(raw.lease),
    field: text(raw.field),
    operator: text(raw.operator),
    operatorNum: text(raw.operatorNum),
    type: text(raw.type),
    major: raw.major === true,
    waterDepthFt: num(raw.waterDepthFt),
    lat,
    lon,
    nad: text(raw.nad),
    installed: text(raw.installed),
    removed: text(raw.removed),
    district: text(raw.district),
    region: text(raw.region),
    incidents: num(raw.incidents),
    series,
    lifetime,
    current,
    prior,
    lastYear,
    yoy,
    producing,
    declineFromPeakPct:
      lifetime?.peakGasMcfd > 0 && current?.gasMcfd !== null && current
        ? Math.round((1 - current.gasMcfd / lifetime.peakGasMcfd) * 1000) / 10
        : null,
    observation: createObservation({
      observedAt,
      publishedAt,
      fetchedAt,
      freshnessClass: 'published',
      source: GULF_SOURCE_LONG,
      headline,
    }),
  });
}

/**
 * The whole bundled dataset: the month axis, the completeness verdict, the
 * counts and the platforms ranked by current gas (idle structures after the
 * producers, by name). Returns null when the payload is not the shape the
 * bundle promises.
 */
export function normaliseGulfDataset(payload, { fetchedAt = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload.months) || !Array.isArray(payload.structures))
    return null;
  const months = Object.freeze(payload.months.map(String));
  const currentMonth = text(payload.current?.month);
  const currentIndex = currentMonth ? monthIndex(months, currentMonth) : null;
  if (currentIndex === null) return null;
  const retrieved = text(payload.retrieved);
  if (!retrieved) return null;
  const observedAt = monthEndIso(currentMonth);
  const publishedAt = `${retrieved}T00:00:00Z`;
  const context = {
    months,
    currentIndex,
    priorIndex: currentIndex - 1 >= 0 ? currentIndex - 1 : null,
    lastYearIndex: currentIndex - 12 >= 0 ? currentIndex - 12 : null,
    observedAt,
    publishedAt,
    fetchedAt,
  };
  const rows = payload.structures
    .map((raw) => normalisePlatform(raw, context))
    .filter(Boolean)
    .sort(
      (a, b) =>
        (b.current?.gasMcfd ?? 0) - (a.current?.gasMcfd ?? 0) ||
        byCodepoint(a.name, b.name) ||
        byCodepoint(a.id, b.id),
    )
    .map((row, index) =>
      Object.freeze({ ...row, rank: row.producing ? index + 1 : null }),
    );
  const producing = rows.filter((row) => row.producing);
  const gasMcfdTotal = producing.reduce(
    (sum, row) => sum + row.current.gasMcfd,
    0,
  );
  const gasMaxMcfd = producing.length ? producing[0].current.gasMcfd : 0;
  const completeness = Object.freeze({
    rule: text(payload.completeness?.rule),
    threshold: num(payload.completeness?.threshold),
    lookback: num(payload.completeness?.lookback),
    medianReporters: num(payload.completeness?.medianReporters),
    table: Object.freeze(
      (Array.isArray(payload.completeness?.table)
        ? payload.completeness.table
        : []
      ).map((row) =>
        Object.freeze({
          month: String(row.month),
          reporters: num(row.reporters) ?? 0,
          share: num(row.share),
          complete: row.complete === true,
        }),
      ),
    ),
  });
  const unbundledRaw = payload.counts?.unbundled ?? {};
  const unbundledPart = (key) =>
    Object.freeze({
      structures: num(unbundledRaw[key]?.structures) ?? 0,
      gasMcfd: num(unbundledRaw[key]?.gasMcfd) ?? 0,
    });
  const counts = Object.freeze({
    structuresEver: num(payload.counts?.structuresEver),
    installed: num(payload.counts?.installed) ?? rows.length,
    placed: rows.length,
    unplaced: num(payload.counts?.unplaced) ?? 0,
    producing: producing.length,
    withSeries: rows.filter((row) => row.series).length,
    gasMcfdTotal,
    // Filed for the month by every structure, on the map or not; the map's
    // total is a subset and the panel says so (R11.11).
    gasMcfdFiled: num(payload.counts?.gasMcfdFiled) ?? gasMcfdTotal,
    producingFiled: num(payload.counts?.producingFiled) ?? producing.length,
    unbundled: Object.freeze({
      removed: unbundledPart('removed'),
      unplaced: unbundledPart('unplaced'),
      unknown: unbundledPart('unknown'),
    }),
    // The file's other OCS regions (Pacific, Alaska): filed, never drawn here.
    outOfRegion: Object.freeze(
      Object.entries(payload.counts?.outOfRegion ?? {}).map(([code, r]) =>
        Object.freeze({
          code,
          name: text(r?.name) ?? `region ${code}`,
          structures: num(r?.structures) ?? 0,
          gasMcfd: num(r?.gasMcfd) ?? 0,
        }),
      ),
    ),
    oilBopdTotal: producing.reduce(
      (sum, row) => sum + (row.current.oilBopd ?? 0),
      0,
    ),
  });
  const observation = createObservation({
    observedAt,
    publishedAt,
    fetchedAt,
    freshnessClass: 'published',
    source: GULF_SOURCE_LONG,
    headline: `${producing.length} platforms producing gas in ${currentMonth}`,
  });
  return Object.freeze({
    layerId: GULF_LAYER_ID,
    kind: 'platforms',
    freshnessClass: 'published',
    retrieved,
    license: text(payload.license),
    upstream: payload.upstream ?? null,
    months,
    currentMonth,
    currentIndex,
    completeness,
    counts,
    gasMaxMcfd,
    rows: Object.freeze(rows),
    byId: Object.freeze(new Map(rows.map((row) => [row.id, row]))),
    observation,
    asOf: gulfAsOf(currentMonth),
    fillingLine: fillingMonthsLine(completeness.table, currentMonth),
  });
}

/** The one "as of" stamp the panel, the cards and the dossier share. */
export function gulfAsOf(currentMonth) {
  return `as of ${currentMonth} · ${GULF_SOURCE_NAME}`;
}

/**
 * The panel meta line (R11.11):
 * `317 PRODUCING · 2.0 OF 2.6 BCF/D · AS OF 2026-06 · 1,315 INSTALLED · JUL 47 % REPORTED`.
 * The map's total is named against the month's filed total whenever they
 * differ, so gas from structures since removed is never silently dropped.
 */
export function gulfMetaLine(snapshot) {
  if (!snapshot) return `${GULF_SOURCE_NAME} · no bundle loaded`;
  const onMap = formatBcfd(snapshot.counts.gasMcfdTotal);
  const filed = formatBcfd(snapshot.counts.gasMcfdFiled);
  const parts = [
    `${formatInt(snapshot.counts.producing)} PRODUCING`,
    filed !== onMap ? `${onMap} OF ${filed} BCF/D` : `${onMap} BCF/D`,
    `AS OF ${snapshot.currentMonth}`,
    `${formatInt(snapshot.counts.installed)} INSTALLED`,
    snapshot.fillingLine || null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatInt(value) {
  const n = num(value);
  return n === null ? 'n/a' : INT.format(Math.round(n));
}

/** 12.1 MMcf/d above a million cubic feet a day, 845 Mcf/d below it. */
export function formatMcfd(value) {
  const n = num(value);
  if (n === null) return 'n/a';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)} MMcf/d`;
  return `${INT.format(Math.round(n))} Mcf/d`;
}

/** Billions of cubic feet a day, one decimal, from Mcf/d. */
export function formatBcfd(mcfd) {
  const n = num(mcfd);
  return n === null ? 'n/a' : (n / 1_000_000).toFixed(1);
}

export function formatBbld(value) {
  const n = num(value);
  return n === null ? 'n/a' : `${INT.format(Math.round(n))} bbl/d`;
}

/** Cumulative gas in Bcf or Tcf from Mcf. */
export function formatCumGas(mcf) {
  const n = num(mcf);
  if (n === null) return 'n/a';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Tcf`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Bcf`;
  return `${INT.format(Math.round(n / 1000))} MMcf`;
}

/** Cumulative oil in MMbbl from barrels. */
export function formatCumOil(bbl) {
  const n = num(bbl);
  if (n === null) return 'n/a';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MMbbl`;
  return `${INT.format(Math.round(n / 1000))} Mbbl`;
}

/** `▲ +12.4 %`, `▼ −8.1 %`, `new`, `quiet`, `unknown`, `flat +2.1 %`. */
export function formatYoy(yoy) {
  if (!yoy) return 'n/a';
  const pct =
    yoy.pct === null ? '' : `${yoy.pct > 0 ? '+' : ''}${yoy.pct.toFixed(1)} %`;
  switch (yoy.class) {
    case 'up':
      return `▲ ${pct} vs last year`;
    case 'down':
      return `▼ ${pct} vs last year`;
    case 'flat':
      return `flat ${pct} vs last year`;
    case 'new':
      return 'new vs last year';
    case 'quiet':
      return 'no gas this month';
    default:
      return 'no production filed';
  }
}

export function formatWaterDepth(feet) {
  const n = num(feet);
  return n === null ? 'n/a' : `${INT.format(Math.round(n))} ft`;
}

/** The observation stamp for a platform, `as of 2026-06-30 · 83d lag`. */
export function platformStamp(row, now = Date.now()) {
  return row?.observation ? formatAsOf(row.observation, now) : 'as of n/a';
}

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    rank: row.rank ?? null,
    complexId: row.complexId ?? null,
    structureNumber: row.structureNumber ?? null,
    areaBlock: row.areaBlock ?? null,
    lease: row.lease ?? null,
    field: row.field ?? null,
    operator: row.operator ?? null,
    type: row.type ?? null,
    waterDepthFt: row.waterDepthFt,
    lat: row.lat,
    lon: row.lon,
    installed: row.installed ?? null,
    incidents: row.incidents,
    producing: row.producing,
    gasMcfd: row.current?.gasMcfd ?? null,
    oilBopd: row.current?.oilBopd ?? null,
    waterBwpd: row.current?.waterBwpd ?? null,
    boepd: row.current?.boepd ?? null,
    wells: row.current?.wells ?? null,
    yoyClass: row.yoy.class,
    yoyPct: row.yoy.pct,
    peakGasMcfd: row.lifetime?.peakGasMcfd ?? null,
    peakGasMonth: row.lifetime?.peakGasMonth ?? null,
    cumGasMcf: row.lifetime?.cumGasMcf ?? null,
    monthsProducing: row.lifetime?.monthsProducing ?? null,
    declineFromPeakPct: row.declineFromPeakPct,
    observedAt: row.observation.observedAt,
    source: row.observation.source,
  };
}
