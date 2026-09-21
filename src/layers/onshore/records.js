/**
 * Bundled onshore production records (docs/COMMODITIES-PLAN.md §14, R12.1 to
 * R12.4): the one record shape every region layer's marks, cards, dossier,
 * panel line and analyst records read, extending row 11's.
 *
 * A region bundle is an `index.json` of facilities — the grain its state
 * files report production at (a well in North Dakota) — each with a surface
 * location, its current, prior and last-year monthly readings and a ten-year
 * summary, plus a `clusters.json` of field and county sums. "Current" is the
 * newest complete filing month by row 11's rule (`../production/completeness.js`),
 * never the newest file. Every reading is stamped through the row-1
 * observation contract with the month it describes and the day the files
 * were retrieved.
 *
 * Readings are monthly volumes as filed; rates are derived here, one way:
 * per calendar day (volume ÷ days in the month, the rate the map and the
 * panel use) and per producing day (volume ÷ days filed) for the dossier.
 *
 * Portable by rule: no Cesium, no DOM, no Node built-ins.
 */

import { createObservation, formatAsOf } from '../commodities/observation.js';
import { fillingMonthsLine } from '../production/completeness.js';
import {
  daysInMonth,
  formatBbld,
  formatBcfd,
  formatCumGas,
  formatCumOil,
  formatInt,
  formatMcfd,
  formatYoy,
  monthEndIso,
  yoyChange,
} from '../production/records.js';

export {
  daysInMonth,
  formatBbld,
  formatBcfd,
  formatCumGas,
  formatCumOil,
  formatInt,
  formatMcfd,
  formatYoy,
  monthEndIso,
  yoyChange,
};

export const ONSHORE_BUNDLE_VERSION = 1;

/**
 * The order of a reading array in the bundle: monthly volumes as the state
 * filed them — oil bbl, water bbl, days produced, oil runs bbl, gas Mcf, gas
 * sold Mcf, gas flared Mcf. Null is a month not filed, never zero. The builder
 * imports this so a column can only ever be read one way.
 */
export const READING_COLUMNS = Object.freeze([
  'oil',
  'water',
  'days',
  'runs',
  'gas',
  'gasSold',
  'flared',
]);

export const FACILITY_STATUSES = Object.freeze([
  'producing',
  'quiet',
  'absent',
]);

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

function safeDivide(a, b) {
  return a === null || !(b > 0) ? null : a / b;
}

/**
 * One month's reading from a bundle array, with both rates. `month` gives the
 * calendar days; null when nothing was filed for the month.
 */
export function readingFrom(values, month) {
  if (!Array.isArray(values)) return null;
  const get = (column) => num(values[READING_COLUMNS.indexOf(column)]);
  const oilBbl = get('oil');
  const waterBbl = get('water');
  const days = get('days');
  const runsBbl = get('runs');
  const gasMcf = get('gas');
  const gasSoldMcf = get('gasSold');
  const flaredMcf = get('flared');
  if (
    oilBbl === null &&
    waterBbl === null &&
    gasMcf === null &&
    days === null &&
    gasSoldMcf === null
  )
    return null;
  const calendarDays = daysInMonth(month);
  return Object.freeze({
    month,
    oilBbl,
    waterBbl,
    days,
    runsBbl,
    gasMcf,
    gasSoldMcf,
    flaredMcf,
    // Per calendar day: the rate the marks, the panel and the ranks use.
    gasMcfd: safeDivide(gasMcf, calendarDays),
    oilBopd: safeDivide(oilBbl, calendarDays),
    waterBwpd: safeDivide(waterBbl, calendarDays),
    flaredMcfd: safeDivide(flaredMcf, calendarDays),
    // Per producing day, where days were filed.
    gasMcfdProducing: safeDivide(gasMcf, days),
    oilBopdProducing: safeDivide(oilBbl, days),
    flaredShare:
      gasMcf > 0 && flaredMcf !== null ? Math.min(1, flaredMcf / gasMcf) : null,
  });
}

function normaliseSummary(raw) {
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
    cumWaterBbl: num(raw.cumWaterBbl),
    cumFlaredMcf: num(raw.cumFlaredMcf),
  });
}

/** `33053039010000` → `33-053-03901`: the API-10 well number as the industry writes it. */
export function formatApi(id) {
  const digits = String(id ?? '').replace(/\D/g, '');
  if (digits.length < 10) return String(id ?? 'n/a');
  return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 10)}`;
}

/**
 * One facility. Returns null when the essentials (id, position) are missing
 * so a broken row cannot reach the map.
 */
export function normaliseFacility(raw, context) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id) ?? (raw.id !== undefined ? String(raw.id) : null);
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!id || lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const { currentMonth, priorMonth, lastYearMonth, observation, source } =
    context;
  const current = readingFrom(raw.current, currentMonth);
  const prior = priorMonth ? readingFrom(raw.prior, priorMonth) : null;
  const lastYear = lastYearMonth
    ? readingFrom(raw.lastYear, lastYearMonth)
    : null;
  const status = FACILITY_STATUSES.includes(raw.status)
    ? raw.status
    : current
      ? current.gasMcf > 0 || current.oilBbl > 0
        ? 'producing'
        : 'quiet'
      : 'absent';
  const producing = status === 'producing';
  const yoy = yoyChange(current, lastYear, { hasSeries: Boolean(current) });
  const summary = normaliseSummary(raw.summary);
  const name = text(raw.name) ?? formatApi(id);
  const headline = producing
    ? `${name} ${formatMcfd(current.gasMcfd)}`
    : status === 'quiet'
      ? `${name} filed, no production`
      : `${name} not in this month's file`;
  return Object.freeze({
    id,
    api: formatApi(id),
    state: text(raw.state),
    fileNo: num(raw.fileNo),
    name,
    operator: text(raw.operator),
    county: text(raw.county),
    field: text(raw.field),
    pools: Object.freeze(
      Array.isArray(raw.pools) ? raw.pools.map(String).filter(Boolean) : [],
    ),
    lat,
    lon,
    status,
    producing,
    firstSeen: text(raw.firstSeen),
    lastSeen: text(raw.lastSeen),
    grain: 'well',
    cadence: 'monthly',
    current,
    prior,
    lastYear,
    yoy,
    // Ten years, not a lifetime: the window is what the bundle carries.
    summary,
    declineFromPeakPct:
      summary?.peakGasMcfd > 0 && current?.gasMcfd !== null && current
        ? Math.round((1 - current.gasMcfd / summary.peakGasMcfd) * 1000) / 10
        : null,
    // One set of timestamps for the whole bundle; only the headline is the row's.
    observation: Object.freeze({ ...observation, source, headline }),
  });
}

function normaliseCluster(raw, context) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id);
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (!id || lat === null || lon === null) return null;
  const { months, currentIndex, currentMonth, priorMonth, lastYearMonth } =
    context;
  const series = raw.series ?? {};
  const at = (key, index) =>
    index === null || index < 0 || !Array.isArray(series[key])
      ? null
      : num(series[key][index]);
  const rate = (key, index, month) =>
    month ? safeDivide(at(key, index), daysInMonth(month)) : null;
  const priorIndex = priorMonth ? currentIndex - 1 : null;
  const lastYearIndex = lastYearMonth ? currentIndex - 12 : null;
  const current = Object.freeze({
    month: currentMonth,
    gasMcf: at('gas', currentIndex),
    oilBbl: at('oil', currentIndex),
    waterBbl: at('water', currentIndex),
    flaredMcf: at('flared', currentIndex),
    gasMcfd: rate('gas', currentIndex, currentMonth),
    oilBopd: rate('oil', currentIndex, currentMonth),
    flaredMcfd: rate('flared', currentIndex, currentMonth),
    producing: at('producing', currentIndex) ?? 0,
  });
  const lastYear = Object.freeze({
    gasMcfd: rate('gas', lastYearIndex, lastYearMonth),
    producing: at('producing', lastYearIndex),
  });
  return Object.freeze({
    id,
    name: text(raw.name) ?? id,
    county: text(raw.county),
    lat,
    lon,
    wells: num(raw.wells) ?? 0,
    reported: num(raw.reported) ?? 0,
    producing: current.producing,
    current,
    prior: Object.freeze({ gasMcfd: rate('gas', priorIndex, priorMonth) }),
    lastYear,
    yoy: yoyChange(current, lastYear),
    series: Object.freeze({
      months,
      gas: Object.freeze(Array.isArray(series.gas) ? series.gas : []),
      oil: Object.freeze(Array.isArray(series.oil) ? series.oil : []),
      producing: Object.freeze(
        Array.isArray(series.producing) ? series.producing : [],
      ),
    }),
  });
}

function rankRows(rows) {
  return rows
    .sort(
      (a, b) =>
        (b.current?.gasMcfd ?? 0) - (a.current?.gasMcfd ?? 0) ||
        byCodepoint(a.name, b.name) ||
        byCodepoint(a.id, b.id),
    )
    .map((row, index) =>
      Object.freeze({ ...row, rank: row.producing ? index + 1 : null }),
    );
}

function normaliseReconciliation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latest =
    raw.latest && typeof raw.latest === 'object' ? raw.latest : null;
  return Object.freeze({
    source: text(raw.source) ?? 'EIA',
    states: Object.freeze(
      Array.isArray(raw.states) ? raw.states.map(String) : [],
    ),
    series: Object.freeze(
      Array.isArray(raw.series) ? raw.series.map(String) : [],
    ),
    note: text(raw.note),
    latest: latest
      ? Object.freeze({
          month: text(latest.month),
          regionGasMcf: num(latest.regionGasMcf),
          regionOilBbl: num(latest.regionOilBbl),
          eiaGrossMcf: num(latest.eiaGrossMcf),
          eiaMarketedMcf: num(latest.eiaMarketedMcf),
          eiaOilBbl: num(latest.eiaOilBbl),
          gasToGross: num(latest.gasToGross),
          gasToMarketed: num(latest.gasToMarketed),
          oilToEia: num(latest.oilToEia),
        })
      : null,
  });
}

/**
 * The whole bundled region: the month axis, the completeness verdict, the
 * reconciliation, the counts, the facilities ranked by current gas (quiet
 * and absent wells after the producers, by name) and the clusters. Returns
 * null when the payload is not the shape the bundle promises.
 */
export function normaliseOnshoreDataset(
  payload,
  { clusters = null, fetchedAt = Date.now() } = {},
) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload.months) || !Array.isArray(payload.facilities))
    return null;
  if (!payload.region || typeof payload.region !== 'object') return null;
  const months = Object.freeze(payload.months.map(String));
  const currentMonth = text(payload.current?.month);
  const currentIndex = currentMonth ? months.indexOf(currentMonth) : -1;
  if (currentIndex < 0) return null;
  const retrieved = text(payload.retrieved);
  if (!retrieved) return null;
  const region = Object.freeze({
    id: text(payload.region.id),
    layerId: text(payload.region.layerId),
    name: text(payload.region.name) ?? 'Region',
    basins: Object.freeze(
      Array.isArray(payload.region.basins)
        ? payload.region.basins.map(String)
        : [],
    ),
    states: Object.freeze(
      Array.isArray(payload.region.states)
        ? payload.region.states.map(String)
        : [],
    ),
    center: Object.freeze({
      lat: num(payload.region.center?.lat),
      lon: num(payload.region.center?.lon),
    }),
  });
  if (!region.id || !region.layerId) return null;
  const sources = Object.freeze(
    (Array.isArray(payload.sources) ? payload.sources : []).map((s) =>
      Object.freeze({
        state: text(s.state),
        id: text(s.id),
        name: text(s.name),
        short: text(s.short) ?? text(s.state) ?? 'state',
        url: text(s.url),
        grain: text(s.grain) ?? 'well',
        cadence: text(s.cadence) ?? 'monthly',
        lagDays: num(s.lagDays),
        datum: text(s.datum),
        transform: text(s.transform),
        license: text(s.license),
        reporterRule: text(s.reporterRule),
        newestMonth: text(s.newestMonth),
      }),
    ),
  );
  const sourceName = sources.map((s) => s.short).join(' + ') || 'state files';
  const sourceLong =
    sources.map((s) => s.name).join('; ') || 'state production files';
  const observedAt = monthEndIso(currentMonth);
  const publishedAt = `${retrieved}T00:00:00Z`;
  const baseObservation = createObservation({
    observedAt,
    publishedAt,
    fetchedAt,
    freshnessClass: 'published',
    source: sourceLong,
  });
  const context = {
    months,
    currentIndex,
    currentMonth,
    priorMonth: currentIndex >= 1 ? months[currentIndex - 1] : null,
    lastYearMonth: currentIndex >= 12 ? months[currentIndex - 12] : null,
    observation: baseObservation,
    source: sourceLong,
  };
  const rows = rankRows(
    payload.facilities
      .map((raw) => normaliseFacility(raw, context))
      .filter(Boolean),
  );
  const producing = rows.filter((row) => row.producing);
  const gasMcfdTotal = producing.reduce(
    (sum, row) => sum + (row.current.gasMcfd ?? 0),
    0,
  );
  const oilBbldTotal = producing.reduce(
    (sum, row) => sum + (row.current.oilBopd ?? 0),
    0,
  );
  const flaredMcfd = producing.reduce(
    (sum, row) => sum + (row.current.flaredMcfd ?? 0),
    0,
  );
  const gasMaxMcfd = producing.reduce(
    (max, row) => Math.max(max, row.current.gasMcfd ?? 0),
    0,
  );
  const completeness = Object.freeze({
    rule: text(payload.completeness?.rule),
    reporterRule: text(payload.completeness?.reporterRule),
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
  const fieldRows = clusters?.fields
    ? clusters.fields
        .map((raw) => normaliseCluster(raw, context))
        .filter(Boolean)
    : [];
  const countyRows = clusters?.counties
    ? clusters.counties
        .map((raw) => normaliseCluster(raw, context))
        .filter(Boolean)
    : [];
  const rankClusters = (list) =>
    Object.freeze(
      list
        .sort(
          (a, b) =>
            (b.current.gasMcfd ?? 0) - (a.current.gasMcfd ?? 0) ||
            byCodepoint(a.id, b.id),
        )
        .map((c, index) => Object.freeze({ ...c, rank: index + 1 })),
    );
  const fields = rankClusters(fieldRows);
  const counties = rankClusters(countyRows);
  const counts = Object.freeze({
    facilities: num(payload.counts?.facilities) ?? rows.length,
    placed: rows.length,
    unplaced: num(payload.counts?.unplaced) ?? 0,
    reported:
      num(payload.counts?.reported) ?? rows.filter((r) => r.current).length,
    producing: producing.length,
    quiet: rows.filter((row) => row.status === 'quiet').length,
    absent: rows.filter((row) => row.status === 'absent').length,
    operators: num(payload.counts?.operators) ?? null,
    fields: fields.length || (num(payload.counts?.fields) ?? 0),
    counties: counties.length || (num(payload.counts?.counties) ?? 0),
    gasMcfdTotal,
    oilBbldTotal,
    flaredMcfd,
    gasMaxMcfd,
    clusterGasMaxMcfd: fields.length ? (fields[0].current.gasMcfd ?? 0) : 0,
  });
  const reconciliation = normaliseReconciliation(payload.reconciliation);
  const observation = Object.freeze({
    ...baseObservation,
    headline: `${producing.length} wells producing in ${region.name} in ${currentMonth}`,
  });
  return Object.freeze({
    layerId: region.layerId,
    regionId: region.id,
    region,
    kind: 'onshore',
    freshnessClass: 'published',
    retrieved,
    sources,
    sourceName,
    months,
    currentMonth,
    currentIndex,
    completeness,
    reconciliation,
    counts,
    gasMaxMcfd,
    rows: Object.freeze(rows),
    byId: Object.freeze(new Map(rows.map((row) => [row.id, row]))),
    clusters: Object.freeze({
      fields,
      counties,
      byId: Object.freeze(new Map(fields.map((c) => [c.id, c]))),
    }),
    shards: Object.freeze({
      count: num(payload.shards?.count) ?? 256,
      path: text(payload.shards?.path),
    }),
    anomalies: Object.freeze(
      Array.isArray(payload.anomalies) ? payload.anomalies.map(String) : [],
    ),
    observation,
    asOf: onshoreAsOf(currentMonth, sourceName),
    fillingLine: fillingMonthsLine(completeness.table, currentMonth),
  });
}

/** The one "as of" stamp the panel, the cards and the dossier share. */
export function onshoreAsOf(currentMonth, sourceName) {
  return `as of ${currentMonth} · ${sourceName}`;
}

/** `JUN` for the reconciliation month, from `2026-06`. */
function monthAbbrev(month) {
  const names = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return names[Number(String(month).slice(5, 7)) - 1] ?? String(month);
}

/** `94 % OF EIA GROSS (JUN)` — the panel's reconciliation phrase, or null. */
export function reconciliationPhrase(snapshot) {
  const latest = snapshot?.reconciliation?.latest;
  if (!latest?.gasToGross || !latest.month) return null;
  return `${Math.round(latest.gasToGross * 100)} % OF EIA GROSS (${monthAbbrev(latest.month)})`;
}

/**
 * The panel meta line (R12.11):
 * `17,963 PRODUCING · 3.30 BCF/D · 1.17 MMBBL/D · AS OF 2026-07 · 20,231 FILED · 94 % OF EIA GROSS (JUN)`,
 * with the months still filling when there are any.
 */
export function onshoreMetaLine(snapshot) {
  if (!snapshot) return 'state files · no bundle loaded';
  const c = snapshot.counts;
  // The current month's own filing count against the usual: a month the rule
  // calls complete can still be light (North Dakota 2026-07 filed 92 % of the
  // trailing median and its workbook is final as published), and the panel
  // says so rather than letting the count pass as the usual one.
  const current = snapshot.completeness.table.find(
    (row) => row.month === snapshot.currentMonth,
  );
  const light =
    current?.share !== null &&
    current?.share !== undefined &&
    current.share < 0.98
      ? ` (${Math.round(current.share * 100)} % OF USUAL)`
      : '';
  return [
    `${formatInt(c.producing)} PRODUCING`,
    `${(c.gasMcfdTotal / 1e6).toFixed(2)} BCF/D`,
    `${(c.oilBbldTotal / 1e6).toFixed(2)} MMBBL/D`,
    `AS OF ${snapshot.currentMonth}`,
    `${formatInt(c.reported)} FILED${light}`,
    snapshot.fillingLine || null,
    reconciliationPhrase(snapshot),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The observation stamp for a facility, `as of 2026-07-31 · 52d lag`. */
export function facilityStamp(row, now = Date.now()) {
  return row?.observation ? formatAsOf(row.observation, now) : 'as of n/a';
}

/** `12.3 %` of gas flared, or null. */
export function formatFlaredShare(share) {
  const n = num(share);
  return n === null ? null : `${(n * 100).toFixed(1)} % flared`;
}

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  return {
    id: String(row.id),
    api: row.api,
    name: String(row.name),
    rank: row.rank ?? null,
    fileNo: row.fileNo ?? null,
    operator: row.operator ?? null,
    county: row.county ?? null,
    field: row.field ?? null,
    pools: row.pools.join(', ') || null,
    lat: row.lat,
    lon: row.lon,
    status: row.status,
    producing: row.producing,
    gasMcfd: row.current?.gasMcfd ?? null,
    gasSoldMcf: row.current?.gasSoldMcf ?? null,
    flaredMcf: row.current?.flaredMcf ?? null,
    oilBopd: row.current?.oilBopd ?? null,
    waterBwpd: row.current?.waterBwpd ?? null,
    days: row.current?.days ?? null,
    yoyClass: row.yoy.class,
    yoyPct: row.yoy.pct,
    peakGasMcfd: row.summary?.peakGasMcfd ?? null,
    peakGasMonth: row.summary?.peakGasMonth ?? null,
    cumGasMcf: row.summary?.cumGasMcf ?? null,
    monthsProducing: row.summary?.monthsProducing ?? null,
    declineFromPeakPct: row.declineFromPeakPct,
    observedAt: row.observation.observedAt,
    source: row.observation.source,
  };
}

/** JSON-safe record for a field or county cluster. */
export function mapClusterAnalystRecord(cluster, kind = 'field') {
  return {
    id: String(cluster.id),
    kind,
    name: String(cluster.name),
    county: cluster.county ?? null,
    rank: cluster.rank ?? null,
    lat: cluster.lat,
    lon: cluster.lon,
    wells: cluster.wells,
    producing: cluster.producing,
    gasMcfd: cluster.current.gasMcfd ?? null,
    oilBopd: cluster.current.oilBopd ?? null,
    flaredMcfd: cluster.current.flaredMcfd ?? null,
    yoyClass: cluster.yoy.class,
    yoyPct: cluster.yoy.pct,
  };
}
