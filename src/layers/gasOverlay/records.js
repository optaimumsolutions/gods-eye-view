/**
 * Gas pipeline overlay records (docs/COMMODITIES-PLAN.md §19, row 17 P4):
 * pure payload validation and the join between the committed P1/P2 bundles
 * (linework, stations, the meter-to-coordinate lookup) and the oracle's
 * daily overlay route (`/api/oracle/pipeline-overlay`, FR-N18 P3) — the
 * newest gas day's scheduled quantity against design capacity per posted
 * point, and the unexpired critical notices.
 *
 * Portable: no Cesium, no DOM. The route being absent (the desk preview has
 * no console) degrades to bundle-only: geometry and placement draw, every
 * reading is `nodata`, and the snapshot says why.
 */

export const GAS_OVERLAY_PIPELINES = Object.freeze({
  gulf_south: 'Gulf South',
  gulf_run: 'Gulf Run',
});

/** Utilization bands (scheduled ÷ design, the day's binding direction). */
export const UTILIZATION_CLASSES = Object.freeze([
  'nodata',
  'low',
  'normal',
  'elevated',
  'tight',
  'over',
]);

export function utilizationClass(u) {
  if (!Number.isFinite(u)) return 'nodata';
  if (u >= 1) return 'over';
  if (u >= 0.9) return 'tight';
  if (u >= 0.7) return 'elevated';
  if (u >= 0.4) return 'normal';
  return 'low';
}

/** Minimal RFC-4180 CSV: quoted fields with embedded commas and quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    push();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') push();
    else if (c === '\n') endRow();
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) endRow();
  if (!rows.length) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .map((cells) =>
      Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])),
    );
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Validate the committed lookup (P2): one placed row per pipeline × loc. */
export function normalizePoints(csvText) {
  const out = [];
  for (const row of parseCsv(csvText)) {
    const lon = Number(row.lon);
    const lat = Number(row.lat);
    if (
      !row.pipeline ||
      !row.loc ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    )
      continue;
    out.push({
      pipeline: row.pipeline,
      loc: String(row.loc),
      name: row.name || row.loc,
      type: row.type || null,
      flows: row.flows || null,
      county: row.county || null,
      state: row.state || null,
      counterparty: row.counterparty || null,
      designDthLookup: finiteOr(row.design_dth, null),
      method: row.method || null,
      confidence: finiteOr(row.confidence, null),
      lon,
      lat,
    });
  }
  return out;
}

/** Validate the P1 bundles; null rejects (the layer cannot draw without them). */
export function normalizeBundles({ lines, stations, pointsCsv }) {
  if (!Array.isArray(lines?.pipelines) || !Array.isArray(stations?.stations))
    return null;
  const points = normalizePoints(pointsCsv);
  if (!points.length) return null;
  return {
    retrieved: String(lines.retrieved || ''),
    pipelines: lines.pipelines.map((p) => ({
      id: String(p.id),
      name: String(p.name || p.id),
      method: p.method || null,
      accuracyKm: finiteOr(p.accuracyKm, null),
      km: finiteOr(p.km, null),
      parts: (p.parts || []).filter((part) => part.length >= 2),
    })),
    stations: stations.stations
      .filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat))
      .map((s) => ({
        id: String(s.id),
        name: String(s.name || s.id),
        pipeline: String(s.pipeline || ''),
        lon: s.lon,
        lat: s.lat,
        county: s.county || null,
        state: s.state || null,
        certHp: finiteOr(s.certHp, null),
        method: s.method || null,
        offLine: s.offLine === true,
      })),
    lng: (stations.lng || []).filter(
      (t) => Number.isFinite(t.lon) && Number.isFinite(t.lat),
    ),
    points,
  };
}

/** Validate the oracle route's body; null means bundle-only (route absent). */
export function normalizeOverlayPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.error) return null;
  if (!Array.isArray(payload.pipelines)) return null;
  const pipelines = {};
  for (const p of payload.pipelines) {
    if (!p?.id) continue;
    const readings = new Map();
    for (const point of Array.isArray(p.points) ? p.points : []) {
      const loc = String(point.loc ?? point.point ?? '');
      if (!loc) continue;
      let entry = readings.get(loc);
      if (!entry) readings.set(loc, (entry = { loc, directions: [] }));
      entry.directions.push({
        point: String(point.point ?? loc),
        direction: point.direction || null,
        scheduledDth: finiteOr(point.scheduledDth, null),
        designDth: finiteOr(point.designDth, null),
        operatingDth: finiteOr(point.operatingDth, null),
        availableDth: finiteOr(point.availableDth, null),
        utilization: finiteOr(point.utilization, null),
      });
    }
    for (const entry of readings.values()) {
      // The mark reads the binding direction: the day's highest utilization,
      // with the largest design as the tie-break. Directions never sum — a
      // D and an R row at one meter describe the same molecules.
      const ranked = [...entry.directions].sort(
        (a, b) =>
          (b.utilization ?? -1) - (a.utilization ?? -1) ||
          (b.designDth ?? 0) - (a.designDth ?? 0),
      );
      entry.utilization = ranked[0]?.utilization ?? null;
      entry.designDth = Math.max(
        0,
        ...entry.directions.map((d) => d.designDth ?? 0),
      );
      entry.scheduledDth = ranked[0]?.scheduledDth ?? null;
    }
    pipelines[p.id] = {
      id: p.id,
      name: p.name || p.id,
      gasDay: p.gasDay || null,
      cycle: p.cycle || null,
      fetchedAt: p.fetchedAt || null,
      freshness: p.freshness || null,
      overDesign: finiteOr(p.overDesign, 0),
      pointCount: finiteOr(p.pointCount, 0),
      readings,
      notices: (Array.isArray(p.notices) ? p.notices : []).map((n) => ({
        id: String(n.id ?? ''),
        type: n.type || null,
        status: n.status || null,
        subject: n.subject || '',
        postedAt: n.postedAt || null,
        effectiveAt: n.effectiveAt || null,
        endsAt: n.endsAt || null,
        upcoming: n.upcoming === true,
        locs: (Array.isArray(n.locs) ? n.locs : []).map(String),
        stations: (Array.isArray(n.stations) ? n.stations : []).map(String),
        pipelineWide: n.pipelineWide === true,
        excerpt: n.excerpt || '',
      })),
    };
  }
  return { source: payload.source || null, pipelines };
}

const RAD = Math.PI / 180;
const EARTH_KM = 6371;

export function distanceKm(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * RAD * Math.cos(((lat1 + lat2) / 2) * RAD);
  const y = (lat2 - lat1) * RAD;
  return EARTH_KM * Math.hypot(x, y);
}

/** A segment with no posted point within this reach stays `nodata`. */
export const SEGMENT_REACH_KM = 60;
/** Vertices sampled per part when hunting the nearest posted point. */
const PART_SAMPLES = 5;

/**
 * The founder PRD's segment rule: a line part takes the utilization of the
 * nearest posted point with a reading, within reach. The 2020 linework has
 * ~9 km between vertices, so a handful of samples per part is enough.
 */
export function nearestUtilization(
  part,
  litPoints,
  reachKm = SEGMENT_REACH_KM,
) {
  if (!litPoints.length) return null;
  const step = Math.max(1, Math.floor(part.length / PART_SAMPLES));
  let best = null;
  let bestKm = Infinity;
  for (let i = 0; i < part.length; i += step) {
    const [lon, lat] = part[i];
    for (const point of litPoints) {
      const km = distanceKm(lat, lon, point.lat, point.lon);
      if (km < bestKm) {
        bestKm = km;
        best = point;
      }
    }
  }
  return best && bestKm <= reachKm ? best.utilization : null;
}

/** 'Vixen Compressor Station' -> 'vixen' (the bundle names drop the suffix). */
function stationKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+compressor(\s+station)?\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Join the bundles onto the live overlay. Always returns a snapshot; with no
 * payload (route absent or erroring) everything reads `nodata` and
 * `live` is false.
 */
export function buildGasOverlaySnapshot(
  bundles,
  payload,
  { error = null } = {},
) {
  const live = Boolean(payload);
  const byPipeline = payload?.pipelines ?? {};

  const points = bundles.points.map((point) => {
    const reading = byPipeline[point.pipeline]?.readings.get(point.loc) ?? null;
    return {
      ...point,
      id: `${point.pipeline}:${point.loc}`,
      utilization: reading?.utilization ?? null,
      class: utilizationClass(reading?.utilization ?? null),
      scheduledDth: reading?.scheduledDth ?? null,
      designDth: reading?.designDth || point.designDthLookup || 0,
      directions: reading?.directions ?? [],
      noticeIds: [],
    };
  });
  const pointById = new Map(points.map((p) => [p.id, p]));
  const designMax = Math.max(1, ...points.map((p) => p.designDth || 0));

  const stations = bundles.stations.map((station) => ({
    ...station,
    noticeIds: [],
  }));
  const stationByKey = new Map();
  for (const station of stations)
    stationByKey.set(
      `${station.pipeline}|${stationKey(station.name)}`,
      station,
    );

  // Notices attach to the points and stations their text names (P3 parsing);
  // a pipeline-wide notice attaches to nothing and rides the pipeline card.
  const pipelines = [];
  for (const [pid, label] of Object.entries(GAS_OVERLAY_PIPELINES)) {
    const livePipe = byPipeline[pid] ?? null;
    const bundleLine = bundles.pipelines.find((p) => p.id === pid) ?? null;
    const notices = livePipe?.notices ?? [];
    for (const notice of notices) {
      for (const loc of notice.locs) {
        const point = pointById.get(`${pid}:${loc}`);
        if (point) point.noticeIds.push(notice.id);
      }
      for (const name of notice.stations) {
        const station = stationByKey.get(`${pid}|${stationKey(name)}`);
        if (station) station.noticeIds.push(notice.id);
      }
    }
    const litPoints = points.filter(
      (p) => p.pipeline === pid && Number.isFinite(p.utilization),
    );
    pipelines.push({
      id: pid,
      label,
      name: livePipe?.name ?? bundleLine?.name ?? label,
      gasDay: livePipe?.gasDay ?? null,
      cycle: livePipe?.cycle ?? null,
      fetchedAt: livePipe?.fetchedAt ?? null,
      freshness: livePipe?.freshness ?? null,
      overDesign: livePipe?.overDesign ?? 0,
      medianUtilization: median(litPoints.map((p) => p.utilization)),
      litPoints: litPoints.length,
      accuracyKm: bundleLine?.accuracyKm ?? null,
      method: bundleLine?.method ?? null,
      km: bundleLine?.km ?? null,
      notices,
      pipelineWideNotices: notices.filter((n) => n.pipelineWide).length,
      parts: (bundleLine?.parts ?? []).map((part, index) => ({
        pipeline: pid,
        index,
        part,
        utilization: nearestUtilization(part, litPoints),
      })),
    });
  }
  const noticeById = new Map();
  for (const pipeline of pipelines)
    for (const notice of pipeline.notices) noticeById.set(notice.id, notice);

  return {
    live,
    error: live ? null : (error ?? 'pipeline-overlay route unavailable'),
    retrieved: bundles.retrieved,
    pipelines,
    points,
    stations,
    lng: bundles.lng,
    designMax,
    noticeById,
    counts: {
      points: points.length,
      withData: points.filter((p) => Number.isFinite(p.utilization)).length,
      stations: stations.length,
      notices: pipelines.reduce((sum, p) => sum + p.notices.length, 0),
      flagged:
        points.filter((p) => p.noticeIds.length).length +
        stations.filter((s) => s.noticeIds.length).length,
    },
  };
}

/** JSON-safe record for the analyst query engine; missing values are null. */
export function mapAnalystRecord(row) {
  return {
    id: row.id,
    pipeline: row.pipeline,
    loc: row.loc,
    name: row.name,
    county: row.county,
    state: row.state,
    lat: row.lat,
    lon: row.lon,
    designDth: row.designDth || null,
    scheduledDth: row.scheduledDth,
    utilization: row.utilization,
    class: row.class,
    notices: row.noticeIds.length,
    placement: row.method,
    confidence: row.confidence,
  };
}
