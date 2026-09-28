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
  return {
    size: points.length,
    /**
     * @returns {?{point: T, distanceM: number}}
     */
    nearest(lat, lon, radiusM) {
      const reachLat = Math.ceil(radiusM / (EARTH_M * RAD) / CELL_DEG);
      const reachLon = Math.ceil(
        radiusM / (EARTH_M * RAD * Math.cos(lat * RAD)) / CELL_DEG,
      );
      const ci = Math.floor(lat / CELL_DEG);
      const cj = Math.floor(lon / CELL_DEG);
      let best = null;
      for (let i = ci - reachLat; i <= ci + reachLat; i += 1) {
        for (let j = cj - reachLon; j <= cj + reachLon; j += 1) {
          const list = cells.get(key(i, j));
          if (!list) continue;
          for (const p of list) {
            const dist = distanceM(lat, lon, p.lat, p.lon);
            if (dist <= radiusM && (!best || dist < best.distanceM))
              best = { point: p, distanceM: dist };
          }
        }
      }
      return best;
    },
  };
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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return v == null ? '' : String(v).trim();
}
