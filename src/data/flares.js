/**
 * Row 15 (`commodity-flares`, plan §17): nightly VIIRS flare heat matched to
 * wells. Pure functions only — no Cesium, DOM or network — shared by the
 * server provider (`server/providers/flares.js`), the build and probe scripts
 * and the layer.
 *
 * Upstream CSV (keyless, verified 2026-09-28):
 *   https://firms.modaps.eosdis.nasa.gov/data/active_fire/<dir>/csv/<prefix>_VIIRS_C2_USA_contiguous_and_Hawaii_{24h,7d}.csv
 *   latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
 *   confidence,version,bright_ti5,frp,daynight
 * `acq_time` is HHMM UTC, zero-padded in these files but not in the area API,
 * so it is padded here. `scan` and `track` are the pixel size in km.
 *
 * Cloud state comes from ASOS sky cover (IEM archive, keyless):
 *   station,valid,skyc1,skyc2,skyc3   (valid = "YYYY-MM-DD HH:MM" UTC)
 */

/** The keyless FIRMS files, one per VIIRS satellite (§17.2). */
export const FIRMS_NRT_FEEDS = Object.freeze([
  Object.freeze({
    satellite: 'SNPP',
    dir: 'suomi-npp-viirs-c2',
    prefix: 'SUOMI_VIIRS_C2',
  }),
  Object.freeze({
    satellite: 'NOAA-20',
    dir: 'noaa-20-viirs-c2',
    prefix: 'J1_VIIRS_C2',
  }),
  Object.freeze({
    satellite: 'NOAA-21',
    dir: 'noaa-21-viirs-c2',
    prefix: 'J2_VIIRS_C2',
  }),
]);

/**
 * @param {{dir: string, prefix: string}} feed
 * @param {'24h'|'48h'|'7d'} window
 * @returns {string}
 */
export function firmsNrtUrl(feed, window) {
  return `https://firms.modaps.eosdis.nasa.gov/data/active_fire/${feed.dir}/csv/${feed.prefix}_USA_contiguous_and_Hawaii_${window}.csv`;
}

/**
 * The flare regions. `box` bounds the detections kept; `stations` are the
 * ASOS sites whose sky cover decides a night's cloud state (FR-F4).
 */
export const FLARE_REGIONS = Object.freeze({
  williston: Object.freeze({
    id: 'williston',
    name: 'Williston Basin',
    /** North Dakota only, as the row 12 bundle is: Montana joins with its reader; 49° N is the border. */
    box: Object.freeze({
      south: 45.94,
      west: -104.05,
      north: 48.999,
      east: -101.5,
    }),
    stations: Object.freeze(['XWA', 'ISN', 'DIK', 'MOT', 'SDY']),
    /** The row 12 onshore bundle whose wells become the flare sites. */
    onshore: 'williston',
    center: Object.freeze({ lat: 47.85, lon: -103.1 }),
  }),
  permian: Object.freeze({
    id: 'permian',
    name: 'Permian Basin',
    box: Object.freeze({
      south: 30.5,
      west: -104.8,
      north: 33.8,
      east: -100.5,
    }),
    stations: Object.freeze(['MAF', 'HOB', 'CNM', 'PEQ', 'FST']),
    center: Object.freeze({ lat: 31.9, lon: -102.6 }),
  }),
});

const REQUIRED = ['latitude', 'longitude', 'acq_date', 'acq_time', 'frp'];

/**
 * Parse a FIRMS VIIRS CSV. Returns null when the payload is not CSV (FIRMS
 * answers errors as HTML or text), so "no detections" and "upstream failed"
 * stay distinct.
 * @param {string} text
 * @returns {?Array<{lat: number, lon: number, frp: number, scanKm: number,
 *   trackKm: number, brightTi4: number, brightTi5: number, acqDate: string,
 *   acqTime: string, satellite: string, confidence: string, daynight: string}>}
 */
export function parseViirsCsv(text) {
  if (typeof text !== 'string') return null;
  const lines = text.replace(/\r/g, '').split('\n');
  let h = 0;
  while (h < lines.length && !lines[h].trim()) h += 1;
  if (h >= lines.length || lines[h].trimStart().startsWith('<')) return null;
  const header = lines[h]
    .toLowerCase()
    .split(',')
    .map((f) => f.trim());
  if (!REQUIRED.every((name) => header.includes(name))) return null;
  const at = (name) => header.indexOf(name);
  const col = {
    lat: at('latitude'),
    lon: at('longitude'),
    frp: at('frp'),
    scan: at('scan'),
    track: at('track'),
    ti4: at('bright_ti4'),
    ti5: at('bright_ti5'),
    date: at('acq_date'),
    time: at('acq_time'),
    sat: at('satellite'),
    conf: at('confidence'),
    dn: at('daynight'),
  };
  const out = [];
  for (let i = h + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const p = line.split(',');
    if (p.length < header.length) continue;
    const lat = Number(p[col.lat]);
    const lon = Number(p[col.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      lat,
      lon,
      frp: num(p[col.frp]),
      scanKm: num(p[col.scan]),
      trackKm: num(p[col.track]),
      brightTi4: num(p[col.ti4]),
      brightTi5: num(p[col.ti5]),
      acqDate: str(p[col.date]),
      acqTime: str(p[col.time]).padStart(4, '0'),
      satellite: str(p[col.sat]),
      confidence: str(p[col.conf]),
      daynight: str(p[col.dn]).toUpperCase(),
    });
  }
  return out;
}

/** Overpass time of a detection, ms since the epoch (UTC). */
export function overpassMs(d) {
  const t = d.acqTime.padStart(4, '0');
  return Date.parse(`${d.acqDate}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`);
}

/** True when a detection lies inside a region box. */
export function inBox(d, box) {
  return (
    d.lat >= box.south &&
    d.lat <= box.north &&
    d.lon >= box.west &&
    d.lon <= box.east
  );
}

/**
 * The night a detection belongs to: its UTC acquisition date. Over the US the
 * night passes fall between about 06:00 and 11:00Z, all on one UTC date.
 */
export function nightOf(d) {
  return d.acqDate;
}

/**
 * Match radius (FR-F3): the pixel grows from 375 m at nadir to about 800 m at
 * the scan edge, so the radius grows with it, never below 750 m.
 * @returns {number} metres
 */
export function matchRadiusM(d) {
  const half = 0.5 * Math.hypot(d.scanKm || 0, d.trackKm || 0) * 1000;
  return Math.max(750, half + 375);
}

const EARTH_M = 6_371_000;
const RAD = Math.PI / 180;

/** Equirectangular distance in metres; exact to well under 1 % below 10 km. */
export function distanceM(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * RAD * Math.cos(((lat1 + lat2) / 2) * RAD);
  const y = (lat2 - lat1) * RAD;
  return EARTH_M * Math.hypot(x, y);
}

const CELL_DEG = 0.02;

/**
 * A grid index over points for nearest-within-radius queries (radius ≤ ~2 km).
 * @template {{lat: number, lon: number}} T
 * @param {T[]} points
 */
export function pointIndex(points) {
  /** @type {Map<string, T[]>} */
  const cells = new Map();
  const key = (i, j) => `${i}:${j}`;
  for (const p of points) {
    const k = key(Math.floor(p.lat / CELL_DEG), Math.floor(p.lon / CELL_DEG));
    let list = cells.get(k);
    if (!list) cells.set(k, (list = []));
    list.push(p);
  }
  /** Calls `visit(point, distance)` for every point within the radius. */
  function scan(lat, lon, radiusM, visit) {
    const reachLat = Math.ceil(radiusM / (EARTH_M * RAD) / CELL_DEG);
    const reachLon = Math.ceil(
      radiusM / (EARTH_M * RAD * Math.cos(lat * RAD)) / CELL_DEG,
    );
    const ci = Math.floor(lat / CELL_DEG);
    const cj = Math.floor(lon / CELL_DEG);
    for (let i = ci - reachLat; i <= ci + reachLat; i += 1) {
      for (let j = cj - reachLon; j <= cj + reachLon; j += 1) {
        const list = cells.get(key(i, j));
        if (!list) continue;
        for (const p of list) {
          const dist = distanceM(lat, lon, p.lat, p.lon);
          if (dist <= radiusM) visit(p, dist);
        }
      }
    }
  }
  return {
    size: points.length,
    /**
     * @returns {?{point: T, distanceM: number}}
     */
    nearest(lat, lon, radiusM) {
      let best = null;
      scan(lat, lon, radiusM, (point, dist) => {
        if (!best || dist < best.distanceM) best = { point, distanceM: dist };
      });
      return best;
    },
    /** @returns {T[]} every point within the radius, in index order. */
    within(lat, lon, radiusM) {
      const out = [];
      scan(lat, lon, radiusM, (point) => out.push(point));
      return out;
    },
  };
}

/** Wells closer than this share a pad (FR-F1). */
export const PAD_LINK_M = 150;

/**
 * Group wells into pads by single linkage: two wells closer than `linkM` are
 * on one pad, and so is anything chained through them. Deterministic: pads
 * come out ordered by their smallest well id, wells within a pad by id.
 * @template {{id: string, lat: number, lon: number}} T
 * @param {T[]} wells
 * @param {number} [linkM]
 * @returns {T[][]}
 */
export function clusterPads(wells, linkM = PAD_LINK_M) {
  const sorted = [...wells].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const slot = new Map(sorted.map((w, i) => [w, i]));
  const parent = sorted.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const index = pointIndex(sorted);
  for (const w of sorted) {
    for (const n of index.within(w.lat, w.lon, linkM)) {
      const a = find(slot.get(w));
      const b = find(slot.get(n));
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  /** @type {Map<number, T[]>} */
  const pads = new Map();
  sorted.forEach((w, i) => {
    const root = find(i);
    let list = pads.get(root);
    if (!list) pads.set(root, (list = []));
    list.push(w);
  });
  return [...pads.values()].sort((a, b) => (a[0].id < b[0].id ? -1 : 1));
}

/** The unlisted-well test radius (FR-F3). */
export const UNLISTED_RADIUS_M = 750;

/**
 * Classify one detection (FR-F3): `site` within the match radius of a flare
 * site, else `unlisted` within 750 m of any well, else `other`.
 * @param {object} d - A parsed detection.
 * @param {ReturnType<typeof pointIndex>} sites
 * @param {ReturnType<typeof pointIndex>} wells
 * @returns {{kind: 'site'|'unlisted'|'other', site: ?object, distanceM: ?number}}
 */
export function classifyDetection(d, sites, wells) {
  const hit = sites.nearest(d.lat, d.lon, matchRadiusM(d));
  if (hit) return { kind: 'site', site: hit.point, distanceM: hit.distanceM };
  const well = wells.nearest(d.lat, d.lon, UNLISTED_RADIUS_M);
  if (well) return { kind: 'unlisted', site: null, distanceM: well.distanceM };
  return { kind: 'other', site: null, distanceM: null };
}

/**
 * The night's unmatched heat for the layer's grey pips (FR-F6): every
 * detection that is not on a flare site, with its position and FRP.
 * Derived from the stored raw detections, so it works for sealed nights
 * (whose summaries carry counts only) exactly as for live ones.
 * @param {object[]} detections
 * @param {ReturnType<typeof pointIndex>} sites
 * @param {ReturnType<typeof pointIndex>} wells
 * @returns {Array<{lat: number, lon: number, frp: number, kind: 'unlisted'|'other'}>}
 */
export function nightPips(detections, sites, wells) {
  const out = [];
  for (const d of detections ?? []) {
    const hit = classifyDetection(d, sites, wells);
    if (hit.kind === 'site') continue;
    out.push({
      lat: d.lat,
      lon: d.lon,
      frp: Math.round((d.frp || 0) * 100) / 100,
      kind: hit.kind,
    });
  }
  return out;
}

/**
 * Parse an IEM ASOS CSV (`format=onlycomma`) into sky reports.
 * @param {string} text
 * @returns {?Array<{station: string, validMs: number, layers: string[]}>}
 */
export function parseIemAsos(text) {
  if (typeof text !== 'string') return null;
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const header = (lines[0] || '').split(',');
  if (header[0] !== 'station' || header[1] !== 'valid') return null;
  const sky = header
    .map((name, i) => (/^skyc\d$/.test(name) ? i : -1))
    .filter((i) => i >= 0);
  const out = [];
  for (const line of lines.slice(1)) {
    const p = line.split(',');
    const validMs = Date.parse(`${p[1]?.replace(' ', 'T')}:00Z`);
    if (!p[0] || !Number.isFinite(validMs)) continue;
    const layers = sky.map((i) => p[i]).filter((c) => c && c !== 'M');
    out.push({ station: p[0], validMs, layers });
  }
  return out;
}

const COVERING = new Set(['BKN', 'OVC', 'VV']);

/**
 * Cloud state of one night (FR-F4): for each station, the report nearest the
 * overpass (within 90 minutes); a station is covered when any layer is BKN,
 * OVC or VV. `obscured` when more than half the reporting stations are
 * covered, `partial` when any is, `clear` otherwise, `unknown` with no reports.
 * @param {Array<{station: string, validMs: number, layers: string[]}>} reports
 * @param {number} atMs - The overpass time.
 * @returns {{state: 'clear'|'partial'|'obscured'|'unknown', stations: number, covered: number}}
 */
export function skyState(reports, atMs) {
  /** @type {Map<string, {validMs: number, layers: string[]}>} */
  const nearest = new Map();
  for (const r of reports) {
    const gap = Math.abs(r.validMs - atMs);
    if (gap > 90 * 60_000) continue;
    const prev = nearest.get(r.station);
    if (!prev || gap < Math.abs(prev.validMs - atMs)) nearest.set(r.station, r);
  }
  const stations = nearest.size;
  let covered = 0;
  for (const r of nearest.values())
    if (r.layers.some((c) => COVERING.has(c))) covered += 1;
  let state = 'clear';
  if (stations === 0) state = 'unknown';
  else if (covered * 2 > stations) state = 'obscured';
  else if (covered > 0) state = 'partial';
  return { state, stations, covered };
}

/**
 * Parse api.weather.gov observations for one station into the IEM report
 * shape (FR-F4: live nights fall back to NWS when the IEM archive has not
 * caught up). Null when the payload is not an observation collection.
 * @param {object} json
 * @param {string} station - The ASOS id the reports are filed under.
 * @returns {?Array<{station: string, validMs: number, layers: string[]}>}
 */
export function parseNwsObservations(json, station) {
  if (!Array.isArray(json?.features)) return null;
  const out = [];
  for (const feature of json.features) {
    const p = feature?.properties;
    const validMs = Date.parse(p?.timestamp ?? '');
    if (!Number.isFinite(validMs)) continue;
    const layers = (Array.isArray(p.cloudLayers) ? p.cloudLayers : [])
      .map((layer) => str(layer?.amount).toUpperCase())
      .filter(Boolean);
    out.push({ station, validMs, layers });
  }
  return out;
}

/**
 * ASOS station coordinates (public airport facts, ~100 m) so a site can take
 * the cloud state of its nearest reporting station (FR-F4, per-site rule).
 */
export const FLARE_STATION_COORDS = Object.freeze({
  XWA: Object.freeze({ lat: 48.258, lon: -103.748 }),
  ISN: Object.freeze({ lat: 48.178, lon: -103.642 }),
  DIK: Object.freeze({ lat: 46.797, lon: -102.802 }),
  MOT: Object.freeze({ lat: 48.259, lon: -101.28 }),
  SDY: Object.freeze({ lat: 47.707, lon: -104.193 }),
  MAF: Object.freeze({ lat: 31.942, lon: -102.202 }),
  HOB: Object.freeze({ lat: 32.688, lon: -103.217 }),
  CNM: Object.freeze({ lat: 32.337, lon: -104.263 }),
  PEQ: Object.freeze({ lat: 31.382, lon: -103.511 }),
  FST: Object.freeze({ lat: 30.915, lon: -102.916 }),
});

/** A night file is final this long after its UTC date begins (FR-F2). */
export const NIGHT_FINAL_MS = 36 * 3_600_000;

/** True when the night's file may never change again. */
export function nightIsFinal(night, nowMs) {
  const start = Date.parse(`${night}T00:00:00Z`);
  return Number.isFinite(start) && nowMs - start > NIGHT_FINAL_MS;
}

/** Identity of one detection across the 24 h and 7 d files and reruns. */
export function detectionKey(d) {
  return `${d.satellite}|${d.acqDate}|${d.acqTime}|${d.lat.toFixed(5)}|${d.lon.toFixed(5)}`;
}

/**
 * Merge new detections into a night's stored list: duplicates (by
 * `detectionKey`) collapse, order is the key order so reruns are
 * byte-identical.
 */
export function mergeDetections(existing, incoming) {
  const byKey = new Map();
  for (const d of [...(existing ?? []), ...(incoming ?? [])])
    byKey.set(detectionKey(d), d);
  return [...byKey.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, d]) => d);
}

/**
 * The night's overpasses: per satellite, the median acquisition time (the
 * probe's rule — one pass per satellite per night over a basin).
 * @returns {Array<{satellite: string, ms: number}>}
 */
export function nightOverpasses(detections) {
  const bySat = new Map();
  for (const d of detections) {
    let list = bySat.get(d.satellite);
    if (!list) bySat.set(d.satellite, (list = []));
    list.push(overpassMs(d));
  }
  return [...bySat.entries()]
    .map(([satellite, times]) => {
      times.sort((a, b) => a - b);
      return { satellite, ms: times[times.length >> 1] };
    })
    .sort((a, b) => a.ms - b.ms);
}

const SKY_RANK = ['unknown', 'clear', 'partial', 'obscured'];

/** The night's region cloud state: the worst `skyState` across its overpasses. */
export function nightSky(reports, overpasses) {
  return overpasses
    .map(({ ms }) => skyState(reports, ms))
    .reduce(
      (worst, s) =>
        SKY_RANK.indexOf(s.state) > SKY_RANK.indexOf(worst.state) ? s : worst,
      { state: 'unknown', stations: 0, covered: 0 },
    );
}

/**
 * Which stations were covered at the night's overpasses (FR-F4 per-site
 * rule): per station, the report nearest each pass within 90 minutes;
 * covered at any pass counts as covered — conservative, so a site under a
 * passing deck is never read as a clear zero.
 * @returns {Map<string, boolean>} reporting stations only
 */
export function stationCoverage(reports, overpasses) {
  /** @type {Map<string, boolean>} */
  const covered = new Map();
  for (const { ms } of overpasses) {
    /** @type {Map<string, {validMs: number, layers: string[]}>} */
    const nearest = new Map();
    for (const r of reports) {
      const gap = Math.abs(r.validMs - ms);
      if (gap > 90 * 60_000) continue;
      const prev = nearest.get(r.station);
      if (!prev || gap < Math.abs(prev.validMs - ms)) nearest.set(r.station, r);
    }
    for (const [station, r] of nearest) {
      const isCovered = r.layers.some((c) => COVERING.has(c));
      covered.set(station, (covered.get(station) ?? false) || isCovered);
    }
  }
  return covered;
}

/**
 * One site's cloud state: its nearest reporting station's coverage
 * (`obscured` | `clear` | `unknown` with no reporting station).
 */
export function siteCloud(
  site,
  coverage,
  stationCoords = FLARE_STATION_COORDS,
) {
  let best = null;
  for (const [station, isCovered] of coverage) {
    const at = stationCoords[station];
    if (!at) continue;
    const dist = distanceM(site.lat, site.lon, at.lat, at.lon);
    if (!best || dist < best.dist) best = { dist, isCovered };
  }
  if (!best) return 'unknown';
  return best.isCovered ? 'obscured' : 'clear';
}

/**
 * One night's reading (FR-F3, F4, F5): the detection split, per-site
 * detections with the per-site-per-night MAXIMUM FRP (never the pixel sum —
 * bow-tie duplicates at scan edge), the region sky state and per-site cloud.
 */
export function nightMetrics({
  night,
  detections,
  sites,
  wells,
  reports,
  stationCoords = FLARE_STATION_COORDS,
}) {
  const overpasses = nightOverpasses(detections);
  const cloud = nightSky(reports ?? [], overpasses);
  const coverage = stationCoverage(reports ?? [], overpasses);
  const counts = { site: 0, unlisted: 0, other: 0 };
  /** @type {Map<string, object>} */
  const bySite = new Map();
  for (const d of detections) {
    const hit = classifyDetection(d, sites, wells);
    counts[hit.kind] += 1;
    if (hit.kind !== 'site') continue;
    let row = bySite.get(hit.site.id);
    if (!row)
      bySite.set(
        hit.site.id,
        (row = {
          id: hit.site.id,
          site: hit.site,
          detections: 0,
          maxFrp: 0,
          satellites: new Set(),
        }),
      );
    row.detections += 1;
    row.maxFrp = Math.max(row.maxFrp, d.frp || 0);
    row.satellites.add(d.satellite);
  }
  const siteRows = [...bySite.values()]
    .map((row) => ({
      id: row.id,
      detections: row.detections,
      maxFrp: Math.round(row.maxFrp * 100) / 100,
      satellites: [...row.satellites].sort(),
      cloud: siteCloud(row.site, coverage, stationCoords),
    }))
    .sort((a, b) => b.maxFrp - a.maxFrp || (a.id < b.id ? -1 : 1));
  return {
    night,
    overpasses,
    satellites: overpasses.map((o) => o.satellite),
    cloud,
    counts,
    litSites: siteRows.length,
    siteFrpMw:
      Math.round(siteRows.reduce((sum, row) => sum + row.maxFrp, 0) * 100) /
      100,
    sites: siteRows,
  };
}

/** Linear-interpolated percentile of an unsorted sample. */
export function percentileOf(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Suspect backstop (G15.3) needs at least this many clear nights to judge. */
export const BASELINE_MIN_CLEAR_NIGHTS = 5;
/** Lit sites under this share of the clear-night median mark a night `suspect`. */
export const SUSPECT_LIT_SHARE = 0.4;

/**
 * The norm (FR-F5): median and 10th/90th percentile of lit sites and site
 * FRP over the newest `window` nights whose region state is `clear` and that
 * are not themselves suspect. Pass nights newest-first.
 */
export function clearBaseline(nights, window = 30) {
  const clear = nights
    .filter((n) => n.cloud?.state === 'clear' && !n.suspect)
    .slice(0, window);
  const lit = clear.map((n) => n.litSites);
  const frp = clear.map((n) => n.siteFrpMw);
  return {
    clearNights: clear.length,
    litMedian: percentileOf(lit, 0.5),
    litP10: percentileOf(lit, 0.1),
    litP90: percentileOf(lit, 0.9),
    frpMedian: percentileOf(frp, 0.5),
    frpP10: percentileOf(frp, 0.1),
    frpP90: percentileOf(frp, 0.9),
  };
}

/**
 * G15.3 backstop: a night whose lit sites fall under 40 % of the clear-night
 * median is `suspect` (deep dropout the ceilometers missed), judged only
 * once enough clear nights exist.
 */
export function suspectNight(litSites, baseline) {
  return (
    baseline.clearNights >= BASELINE_MIN_CLEAR_NIGHTS &&
    Number.isFinite(baseline.litMedian) &&
    litSites < SUSPECT_LIT_SHARE * baseline.litMedian
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return v == null ? '' : String(v).trim();
}
