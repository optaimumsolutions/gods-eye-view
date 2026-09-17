/**
 * IMF PortWatch chokepoint records: pure normalization and window math.
 *
 * PortWatch publishes one row per maritime chokepoint per day (AIS-derived
 * transit calls, roughly a five-day publication lag). The globe mirrors the
 * commodities oracle's deviation rule: the mean of the newest RECENT_DAYS
 * published days against the mean of the newest BASELINE_DAYS. Both windows
 * are anchored on each chokepoint's newest published day, never on today, so
 * the publication lag can never read as a traffic collapse.
 */
export const CHOKEPOINT_RECENT_DAYS = 7;
export const CHOKEPOINT_BASELINE_DAYS = 90;
export const CHOKEPOINT_HISTORY_DAYS = 30;

/** Deviation bands in percent versus the baseline mean. */
export const CHOKEPOINT_DEVIATION_BANDS = Object.freeze({
  collapse: -40,
  down: -20,
  up: 20,
  surge: 40,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function finite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Accept an ISO date string or an ArcGIS epoch-millisecond date field. */
function isoDate(value) {
  if (typeof value === 'string') {
    const text = value.slice(0, 10);
    return DATE_RE.test(text) ? text : null;
  }
  const number = finite(value);
  if (number == null || number <= 0 || number > 8640000000000000) return null;
  return new Date(number).toISOString().slice(0, 10);
}

/** Validate the complete chokepoint geometry feed; one malformed feature rejects the snapshot. */
export function normalizeChokepointPoints(geojson) {
  if (!Array.isArray(geojson?.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const feature of geojson.features) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties) ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      (feature.geometry.type != null && feature.geometry.type !== 'Point')
    )
      return null;
    const id = String(properties.portid ?? '').trim();
    const name = String(properties.portname ?? '').trim();
    const lon = finite(coordinates[0]);
    const lat = finite(coordinates[1]);
    if (
      !id ||
      !name ||
      lon == null ||
      Math.abs(lon) > 180 ||
      lat == null ||
      Math.abs(lat) > 90
    )
      return null;
    if (ids.has(id)) return null;
    ids.add(id);
    rows.push({ id, name, lon, lat });
  }
  return rows;
}

/** Validate one page of daily transit rows (ArcGIS `f=json` attributes or GeoJSON properties). */
export function normalizeChokepointDailyRows(payload) {
  if (!Array.isArray(payload?.features)) return null;
  const rows = [];
  for (const feature of payload.features) {
    const attributes = feature?.attributes ?? feature?.properties;
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    )
      return null;
    const id = String(attributes.portid ?? '').trim();
    const date = isoDate(attributes.date);
    if (!id || !date) return null;
    rows.push({
      id,
      date,
      tankers: finite(attributes.n_tanker),
      tankerCapacity: finite(attributes.capacity_tanker),
      total: finite(attributes.n_total),
    });
  }
  return rows;
}

function mean(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

/** Band a percent deviation; a missing baseline is 'unknown', never 'normal'. */
export function deviationStatus(deviationPct) {
  if (!Number.isFinite(deviationPct)) return 'unknown';
  if (deviationPct <= CHOKEPOINT_DEVIATION_BANDS.collapse) return 'collapse';
  if (deviationPct <= CHOKEPOINT_DEVIATION_BANDS.down) return 'down';
  if (deviationPct >= CHOKEPOINT_DEVIATION_BANDS.surge) return 'surge';
  if (deviationPct >= CHOKEPOINT_DEVIATION_BANDS.up) return 'up';
  return 'normal';
}

export function formatDeviation(deviationPct) {
  if (!Number.isFinite(deviationPct)) return 'n/a';
  const rounded = Math.round(deviationPct);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded)}%`;
}

/**
 * Join chokepoint geometry with daily rows into display records.
 * @param {Array<{id:string,name:string,lon:number,lat:number}>} points
 * @param {Array<{id:string,date:string,tankers:number|null}>} dailyRows
 * @returns {{rows: Array<object>, latestDate: string|null}}
 */
export function buildChokepointSnapshot(
  points,
  dailyRows,
  {
    recentDays = CHOKEPOINT_RECENT_DAYS,
    baselineDays = CHOKEPOINT_BASELINE_DAYS,
    historyDays = CHOKEPOINT_HISTORY_DAYS,
  } = {},
) {
  const byId = new Map();
  let latestDate = null;
  for (const row of dailyRows) {
    let series = byId.get(row.id);
    if (!series) {
      series = new Map();
      byId.set(row.id, series);
    }
    // A republished day replaces the earlier copy instead of double counting.
    series.set(row.date, row);
    if (!latestDate || row.date > latestDate) latestDate = row.date;
  }
  const rows = points.map((point) => {
    const series = [...(byId.get(point.id)?.values() ?? [])].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const baseline = series.slice(-baselineDays);
    const recent = baseline.slice(-recentDays);
    const recentAvg = mean(recent.map((row) => row.tankers));
    const baselineAvg = mean(baseline.map((row) => row.tankers));
    const deviationPct =
      recentAvg != null && baselineAvg
        ? ((recentAvg - baselineAvg) / baselineAvg) * 100
        : null;
    return {
      ...point,
      recentAvg,
      baselineAvg,
      recentDays: recent.length,
      baselineDays: baseline.length,
      deviationPct,
      status: deviationStatus(deviationPct),
      latestDate: series.length ? series[series.length - 1].date : null,
      history: series
        .slice(-historyDays)
        .map((row) => ({ date: row.date, tankers: row.tankers })),
    };
  });
  return { rows, latestDate };
}
