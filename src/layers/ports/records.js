/**
 * IMF PortWatch port records: pure normalization and window math.
 *
 * PortWatch publishes one row per port per day (AIS-derived port calls by
 * vessel class, roughly a five-day publication lag) for about two thousand
 * ports. Reading every daily row would cost hundreds of pages, so the source
 * asks the feature service for means grouped by port over two windows. Both
 * windows anchor on the newest published day, never on today, so the
 * publication lag can never read as a traffic collapse; this is the same
 * deviation rule the chokepoints layer and the commodities oracle apply.
 * This module validates the port registry, those aggregates, and the
 * disruption polygons, then joins them into display records.
 */
export const PORT_RECENT_DAYS = 7;
export const PORT_BASELINE_DAYS = 90;
/** Disruptions still open, or closed within this many days, are drawn. */
export const DISRUPTION_RECENT_DAYS = 90;
/**
 * Annual tanker visits a port must clear to be drawn — roughly one tanker call
 * every day and a half.
 *
 * PortWatch's registry is every port it tracks, not every tanker port: of its
 * 2,065 entries 297 see no tanker at all in a year and the median sees 51, so
 * drawing the whole registry buries the liquid-bulk traffic this layer exists
 * to show under a coastline of dots that mean nothing to it. Measured against
 * the live registry on 2026-09-18, this floor keeps 431 ports. Alternatives on
 * the same data if this reads too aggressive: 52/yr (one a week) keeps 1,035,
 * 365/yr (one a day) keeps about 330.
 */
export const PORT_MIN_ANNUAL_TANKER_VISITS = 250;
/**
 * Below this baseline a deviation is noise, not a move: one extra tanker at a
 * port that sees two a month reads as +1,400%. Such ports are 'thin'.
 */
export const PORT_MIN_BASELINE_TANKERS_PER_DAY = 0.5;

/** Deviation bands in percent versus the baseline mean. */
export const PORT_DEVIATION_BANDS = Object.freeze({
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

function text(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/** Accept an ISO date string or an ArcGIS epoch-millisecond date field. */
function isoDate(value) {
  if (typeof value === 'string') {
    const trimmed = value.slice(0, 10);
    return DATE_RE.test(trimmed) ? trimmed : null;
  }
  const number = finite(value);
  if (number == null || number <= 0 || number > 8640000000000000) return null;
  return new Date(number).toISOString().slice(0, 10);
}

function validCoordinate(lon, lat) {
  return (
    lon != null && Math.abs(lon) <= 180 && lat != null && Math.abs(lat) <= 90
  );
}

/** Shift an ISO date by whole UTC days; a malformed date yields null. */
export function shiftIsoDate(date, days) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** Validate one page of the port registry (ArcGIS `f=json` attributes carrying lat/lon fields). */
export function normalizePortRows(payload) {
  if (!Array.isArray(payload?.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const feature of payload.features) {
    const attributes = feature?.attributes ?? feature?.properties;
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    )
      return null;
    const id = text(attributes.portid);
    const name = text(attributes.portname);
    const lon = finite(attributes.lon);
    const lat = finite(attributes.lat);
    if (!id || !name || !validCoordinate(lon, lat)) return null;
    if (ids.has(id)) return null;
    ids.add(id);
    rows.push({
      id,
      name,
      lon,
      lat,
      country: text(attributes.country),
      iso3: text(attributes.ISO3),
      locode: text(attributes.LOCODE),
      industry: text(attributes.industry_top1),
      annualVessels: finite(attributes.vessel_count_total),
      annualTankers: finite(attributes.vessel_count_tanker),
      annualContainers: finite(attributes.vessel_count_container),
      importShare: finite(attributes.share_country_maritime_import),
      exportShare: finite(attributes.share_country_maritime_export),
    });
  }
  return rows;
}

/** Validate one page of grouped window statistics: mean calls per day by port. */
export function normalizePortStatRows(payload) {
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
    const id = text(attributes.portid);
    if (!id) return null;
    rows.push({
      id,
      tankers: finite(attributes.avg_tanker),
      containers: finite(attributes.avg_container),
      days: finite(attributes.days),
    });
  }
  return rows;
}

/** Read the newest published day from a `max(date)` statistics response. */
export function latestPublishedDate(payload) {
  const features = payload?.features;
  if (!Array.isArray(features) || features.length !== 1) return null;
  const attributes = features[0]?.attributes ?? features[0]?.properties;
  return isoDate(attributes?.latest);
}

function normalizeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const out = [];
  for (const vertex of ring) {
    const lon = finite(vertex?.[0]);
    const lat = finite(vertex?.[1]);
    if (!validCoordinate(lon, lat)) return null;
    out.push([lon, lat]);
  }
  return out;
}

function ringCentroid(ring) {
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return { lon: lon / ring.length, lat: lat / ring.length };
}

/** Validate the disruption polygons (GeoJSON); one malformed feature rejects the feed. */
export function normalizeDisruptionFeatures(geojson) {
  if (!Array.isArray(geojson?.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const feature of geojson.features) {
    const properties = feature?.properties;
    const geometry = feature?.geometry;
    if (
      !properties ||
      typeof properties !== 'object' ||
      Array.isArray(properties) ||
      !geometry
    )
      return null;
    const id = text(properties.eventid);
    const name = text(properties.eventname);
    if (!id || !name || ids.has(id)) return null;
    let rawRings = null;
    if (geometry.type === 'Polygon') rawRings = geometry.coordinates;
    else if (
      geometry.type === 'MultiPolygon' &&
      Array.isArray(geometry.coordinates)
    )
      rawRings = geometry.coordinates.flat(1);
    if (!Array.isArray(rawRings) || rawRings.length === 0) return null;
    const rings = [];
    for (const raw of rawRings) {
      const ring = normalizeRing(raw);
      if (!ring) return null;
      rings.push(ring);
    }
    let lon = finite(properties.long);
    let lat = finite(properties.lat);
    if (!validCoordinate(lon, lat)) ({ lon, lat } = ringCentroid(rings[0]));
    const affectedPorts = (text(properties.affectedports) ?? '')
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
    ids.add(id);
    rows.push({
      id,
      name,
      type: text(properties.eventtype) ?? 'OT',
      alertLevel: text(properties.alertlevel),
      severity: text(properties.severitytext),
      country: text(properties.country),
      from: isoDate(properties.fromdate),
      to: isoDate(properties.todate),
      lon,
      lat,
      affectedPorts,
      affectedPortCount:
        finite(properties.n_affectedports) ?? affectedPorts.length,
      rings,
    });
  }
  return rows;
}

/**
 * Band a percent deviation. A baseline under the noise floor is 'thin' even
 * when a deviation exists; a missing deviation is 'unknown', never 'normal'.
 */
export function deviationStatus(deviationPct, baselineAvg) {
  if (
    Number.isFinite(baselineAvg) &&
    baselineAvg < PORT_MIN_BASELINE_TANKERS_PER_DAY
  )
    return 'thin';
  if (!Number.isFinite(deviationPct)) return 'unknown';
  if (deviationPct <= PORT_DEVIATION_BANDS.collapse) return 'collapse';
  if (deviationPct <= PORT_DEVIATION_BANDS.down) return 'down';
  if (deviationPct >= PORT_DEVIATION_BANDS.surge) return 'surge';
  if (deviationPct >= PORT_DEVIATION_BANDS.up) return 'up';
  return 'normal';
}

export function formatDeviation(deviationPct) {
  if (!Number.isFinite(deviationPct)) return 'n/a';
  const rounded = Math.round(deviationPct);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded)}%`;
}

/**
 * Join the port registry with the two window aggregates and the disruptions.
 * A port absent from an aggregate keeps null rates and reads as 'unknown'.
 * @returns {{rows: Array<object>, disruptions: Array<object>, latestDate: string|null}}
 */
export function buildPortSnapshot({
  ports,
  recentStats,
  baselineStats,
  latestDate = null,
  disruptions = [],
  minAnnualTankers = PORT_MIN_ANNUAL_TANKER_VISITS,
}) {
  const recentById = new Map(recentStats.map((row) => [row.id, row]));
  const baselineById = new Map(baselineStats.map((row) => [row.id, row]));
  // A missing count is not evidence of traffic: an unrated port is dropped.
  const tankerPorts = ports.filter(
    (port) =>
      (Number.isFinite(port.annualTankers) ? port.annualTankers : 0) >=
      minAnnualTankers,
  );
  const rows = tankerPorts.map((port) => {
    const recent = recentById.get(port.id) ?? null;
    const baseline = baselineById.get(port.id) ?? null;
    const recentAvg = recent?.tankers ?? null;
    const baselineAvg = baseline?.tankers ?? null;
    const deviationPct =
      recentAvg != null && baselineAvg
        ? ((recentAvg - baselineAvg) / baselineAvg) * 100
        : null;
    return {
      ...port,
      recentAvg,
      baselineAvg,
      recentContainers: recent?.containers ?? null,
      baselineContainers: baseline?.containers ?? null,
      recentDays: recent?.days ?? 0,
      baselineDays: baseline?.days ?? 0,
      deviationPct,
      status: deviationStatus(deviationPct, baselineAvg),
      latestDate: recent ? latestDate : null,
    };
  });
  return {
    rows,
    disruptions: disruptions.slice(),
    latestDate,
    registryCount: ports.length,
  };
}
