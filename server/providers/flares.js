import fs from 'node:fs';
import path from 'node:path';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { coalesceProxyRequest } from './common/http.js';
import { fetchRegionalJson, fetchRegionalText } from './regional/http.js';
import {
  FIRMS_NRT_FEEDS,
  FLARE_REGIONS,
  clearBaseline,
  firmsNrtUrl,
  inBox,
  mergeDetections,
  nightIsFinal,
  nightMetrics,
  nightOf,
  nightOverpasses,
  nightPips,
  parseIemAsos,
  parseNwsObservations,
  parseViirsCsv,
  pointIndex,
  suspectNight,
} from '../../src/data/flares.js';

/**
 * Row 15 M2 (plan §17, FR-F2 to F5): nightly VIIRS flare heat per region.
 *
 *   GET /api/flares?region=williston
 *
 * Reads the keyless FIRMS VIIRS CSVs for SNPP, NOAA-20 and NOAA-21
 * (single-flight, cached per file for 30 minutes), keeps night detections
 * inside the region's box and appends them to a rolling store under
 * `.gev-cache/flares/<region>/<night>.json` (git-ignored) so history
 * accumulates from the first run; a night file is final 36 h after its date
 * and is never rewritten. The 24 h files ride every refresh; the 7 d files
 * are read only while one of the last seven nights is missing from the store
 * (first run, gap repair), which keeps the steady-state pull at three small
 * files per half hour. Cloud state per night comes from IEM ASOS sky cover
 * at the overpasses, falling back to api.weather.gov for recent nights the
 * archive has not caught up with; a final night's cloud is persisted with
 * its file. Errors reach the client as fixed strings, never upstream text.
 */
export const FLARES_ROUTE = '/api/flares';
export const FLARES_FILE_CACHE_MS = 30 * 60_000;
export const FLARES_NIGHTS_SERVED = 60;
/** The 7 d files backfill only while the store misses one of these nights. */
export const FLARES_GAP_WINDOW_NIGHTS = 7;
const NWS_FALLBACK_WINDOW_MS = 48 * 3_600_000;
const FIRMS_TIMEOUT_MS = 120_000;
const FIRMS_24H_MAX_BYTES = 16_000_000;
const FIRMS_7D_MAX_BYTES = 80_000_000;
const IEM_TIMEOUT_MS = 30_000;
const IEM_MAX_BYTES = 4_000_000;
const USER_AGENT = 'GodsEyeView/0.1';
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function reply(res, status, payload, extra = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...extra });
  res.end(JSON.stringify(payload));
}

/** The IEM ASOS archive request the probe validated (sky cover, UTC). */
export function iemAsosUrl(stations, fromNight, toNight) {
  const [y1, m1, d1] = fromNight.split('-').map(Number);
  const [y2, m2, d2] = toNight.split('-').map(Number);
  const q = new URLSearchParams();
  for (const s of stations) q.append('station', s);
  for (const f of ['skyc1', 'skyc2', 'skyc3']) q.append('data', f);
  Object.entries({
    year1: y1,
    month1: m1,
    day1: d1,
    year2: y2,
    month2: m2,
    day2: d2 + 1,
    tz: 'Etc/UTC',
    format: 'onlycomma',
    latlon: 'no',
    missing: 'M',
    trace: 'T',
    direct: 'no',
    report_type: '3',
  }).forEach(([k, v]) => q.append(k, String(v)));
  return `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${q}`;
}

/** Regions a dossier-grade sites bundle exists for (M1: Williston). */
function regionBundlePath(sourceRoot, regionId) {
  return path.resolve(
    sourceRoot,
    'src/data/local_data/flares',
    regionId,
    'sites.json',
  );
}

/**
 * Vite plugin: the flare-heat provider. `fetchText`/`fetchJson` default to
 * the bounded regional readers; a test hands in stubs and its own `now`.
 */
export function flaresProxy({
  sourceRoot = process.cwd(),
  fetchText = fetchRegionalText,
  fetchJson = fetchRegionalJson,
  now = () => Date.now(),
} = {}) {
  /** Per-region lazy state: indexes + the in-memory view of the night store. */
  const _regions = new Map();
  /** Upstream file cache: url -> {fetchedAtMs, detections} (parsed, night only). */
  const _files = new Map();
  const _inFlight = new Map();
  let _skyCache = null; // {fetchedAtMs, key, reports}
  const _rateLimiter = makeRateLimiter({
    windowMs: 60_000,
    max: 30,
    globalMax: 90,
  });

  function regionState(regionId) {
    let state = _regions.get(regionId);
    if (state) return state;
    const region = FLARE_REGIONS[regionId];
    const bundleFile = regionBundlePath(sourceRoot, regionId);
    if (!region || !fs.existsSync(bundleFile)) return null;
    const bundle = JSON.parse(fs.readFileSync(bundleFile, 'utf8'));
    const onshoreIndex = JSON.parse(
      fs.readFileSync(
        path.resolve(
          sourceRoot,
          'src/data/local_data/onshore',
          region.onshore ?? regionId,
          'index.json',
        ),
        'utf8',
      ),
    );
    const wells = onshoreIndex.facilities.filter((f) => Number.isFinite(f.lat));
    state = {
      region,
      sites: pointIndex(bundle.sites),
      wells: pointIndex(wells),
      storeDir: path.resolve(sourceRoot, '.gev-cache/flares', regionId),
      /** @type {Map<string, {night: string, final: boolean, cloud: ?object, detections: object[]}>} */
      nights: new Map(),
      loaded: false,
    };
    _regions.set(regionId, state);
    return state;
  }

  function loadStore(state) {
    if (state.loaded) return;
    fs.mkdirSync(state.storeDir, { recursive: true });
    for (const name of fs.readdirSync(state.storeDir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
      try {
        const file = JSON.parse(
          fs.readFileSync(path.join(state.storeDir, name), 'utf8'),
        );
        if (file?.night) state.nights.set(file.night, file);
      } catch {
        // A truncated file from a killed process re-accumulates from the feeds.
      }
    }
    state.loaded = true;
  }

  function writeNight(state, record) {
    const file = path.join(state.storeDir, `${record.night}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
  }

  async function readFirmsFile(feed, window) {
    const url = firmsNrtUrl(feed, window);
    const at = now();
    const cached = _files.get(url);
    if (cached && at - cached.fetchedAtMs <= FLARES_FILE_CACHE_MS)
      return cached.detections;
    const request = coalesceProxyRequest(_inFlight, url, async () => {
      const text = await fetchText(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeoutMs: FIRMS_TIMEOUT_MS,
        maxBytes: window === '7d' ? FIRMS_7D_MAX_BYTES : FIRMS_24H_MAX_BYTES,
        redirect: 'follow',
      });
      const rows = parseViirsCsv(text);
      if (!rows) throw new Error('FIRMS answered non-CSV');
      const night = rows.filter((d) => d.daynight === 'N');
      _files.set(url, { fetchedAtMs: now(), detections: night });
      return night;
    });
    return request.promise;
  }

  /** The nights the gap check wants in the store: the newest 7 UTC dates ending yesterday. */
  function wantedNights(atMs) {
    const out = [];
    for (let back = 1; back <= FLARES_GAP_WINDOW_NIGHTS; back += 1)
      out.push(new Date(atMs - back * 86_400_000).toISOString().slice(0, 10));
    return out;
  }

  async function refreshDetections(state) {
    loadStore(state);
    const useSevenDay = wantedNights(now()).some(
      (night) => !state.nights.has(night),
    );
    const results = await Promise.allSettled(
      FIRMS_NRT_FEEDS.flatMap((feed) => [
        readFirmsFile(feed, '24h'),
        ...(useSevenDay ? [readFirmsFile(feed, '7d')] : []),
      ]),
    );
    const fresh = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .filter((d) => inBox(d, state.region.box));
    const failures = results.filter((r) => r.status === 'rejected').length;
    const byNight = new Map();
    for (const d of fresh) {
      const night = nightOf(d);
      let list = byNight.get(night);
      if (!list) byNight.set(night, (list = []));
      list.push(d);
    }
    for (const [night, detections] of byNight) {
      const existing = state.nights.get(night);
      if (existing?.final) continue; // a final night never changes
      const record = {
        night,
        final: false,
        detections: mergeDetections(existing?.detections, detections),
      };
      state.nights.set(night, record);
      writeNight(state, record);
    }
    return { failures, fetched: results.length - failures };
  }

  async function readSky(state, fromNight, toNight) {
    const key = `${state.region.id}|${fromNight}|${toNight}`;
    const at = now();
    if (
      _skyCache &&
      _skyCache.key === key &&
      at - _skyCache.fetchedAtMs <= FLARES_FILE_CACHE_MS
    )
      return _skyCache.reports;
    const text = await fetchText(
      iemAsosUrl(state.region.stations, fromNight, toNight),
      {
        headers: { 'User-Agent': USER_AGENT },
        timeoutMs: IEM_TIMEOUT_MS,
        maxBytes: IEM_MAX_BYTES,
        redirect: 'follow',
      },
    );
    const reports = parseIemAsos(text);
    if (!reports) throw new Error('IEM answered non-CSV');
    _skyCache = { key, fetchedAtMs: at, reports };
    return reports;
  }

  /** Live-night fallback: api.weather.gov observations for one station. */
  async function readNwsStation(station, startMs, endMs) {
    const params = new URLSearchParams({
      start: new Date(startMs).toISOString().replace(/\.\d+Z$/, 'Z'),
      end: new Date(endMs).toISOString().replace(/\.\d+Z$/, 'Z'),
      limit: '60',
    });
    const payload = await fetchJson(
      `https://api.weather.gov/stations/K${station}/observations?${params}`,
      {
        headers: {
          'User-Agent': `${USER_AGENT} (flares cloud fallback)`,
          Accept: 'application/geo+json',
        },
        timeoutMs: IEM_TIMEOUT_MS,
        maxBytes: IEM_MAX_BYTES,
        redirect: 'follow',
      },
    );
    return parseNwsObservations(payload, station) ?? [];
  }

  async function assemble(state) {
    const refresh = await refreshDetections(state);
    const nights = [...state.nights.values()].sort((a, b) =>
      a.night < b.night ? 1 : -1,
    );
    const served = nights.slice(0, FLARES_NIGHTS_SERVED);
    // A sealed night's summary is the record of truth: the IEM span only ever
    // covers the nights still waiting on a verdict, so recomputing a sealed
    // night here would misread it as `unknown`.
    const needsSky = served.filter((n) => !(n.final && n.summary));
    let reports = [];
    if (needsSky.length) {
      const span = needsSky.map((n) => n.night).sort();
      try {
        reports = await readSky(state, span[0], span.at(-1));
      } catch {
        reports = []; // nights read `unknown`; never a fabricated clear
      }
    }
    const at = now();
    const metrics = [];
    for (const record of served) {
      if (record.final && record.summary) {
        metrics.push({ night: record.night, ...record.summary });
        continue;
      }
      const m = nightMetrics({
        night: record.night,
        detections: record.detections,
        sites: state.sites,
        wells: state.wells,
        reports,
      });
      // FR-F4: a recent night the archive has not caught up with asks NWS.
      if (
        m.cloud.state === 'unknown' &&
        m.overpasses.length &&
        at - Date.parse(`${record.night}T00:00:00Z`) < NWS_FALLBACK_WINDOW_MS
      ) {
        try {
          const windowStart = m.overpasses[0].ms - 2 * 3_600_000;
          const windowEnd = m.overpasses.at(-1).ms + 2 * 3_600_000;
          const fallback = (
            await Promise.all(
              state.region.stations.map((s) =>
                readNwsStation(s, windowStart, windowEnd).catch(() => []),
              ),
            )
          ).flat();
          if (fallback.length) {
            const retried = nightMetrics({
              night: record.night,
              detections: record.detections,
              sites: state.sites,
              wells: state.wells,
              reports: fallback,
            });
            metrics.push(retried);
            persistIfFinal(state, record, retried, at);
            continue;
          }
        } catch {
          // The night stays `unknown`.
        }
      }
      metrics.push(m);
      persistIfFinal(state, record, m, at);
    }
    // Two passes (G15.3): a clear-state dropout must not feed the norm it is
    // judged against.
    const base = clearBaseline(metrics.map((m) => ({ ...m, suspect: false })));
    // Overpass times and the unmatched grey pips (FR-F6) come from the stored
    // raw detections, which every night file keeps — sealed summaries carry
    // counts only, and both derivations are deterministic re-reads.
    const flagged = metrics.map((m) => {
      const record = state.nights.get(m.night);
      return {
        night: m.night,
        final: record?.final ?? false,
        cloud: m.cloud,
        suspect: suspectNight(m.litSites, base),
        counts: m.counts,
        litSites: m.litSites,
        siteFrpMw: m.siteFrpMw,
        satellites: m.satellites,
        sites: m.sites,
        overpasses: nightOverpasses(record?.detections ?? []),
        pips: nightPips(record?.detections ?? [], state.sites, state.wells),
      };
    });
    const baseline = clearBaseline(flagged);
    return {
      region: state.region.id,
      name: state.region.name,
      retrievedAt: new Date(at).toISOString(),
      source: 'NASA FIRMS VIIRS NRT (CC0) · IEM ASOS / NWS sky cover',
      upstream: refresh,
      windowNights: FLARES_NIGHTS_SERVED,
      nights: flagged,
      baseline,
    };
  }

  /** A night that just became final keeps its whole reading forever. */
  function persistIfFinal(state, record, m, atMs) {
    if ((record.final && record.summary) || !nightIsFinal(record.night, atMs))
      return;
    if (m.cloud.state === 'unknown') return; // wait for the archive
    const sealed = {
      ...record,
      final: true,
      summary: {
        cloud: m.cloud,
        counts: m.counts,
        litSites: m.litSites,
        siteFrpMw: m.siteFrpMw,
        satellites: m.satellites,
        sites: m.sites,
      },
    };
    state.nights.set(record.night, sealed);
    writeNight(state, sealed);
  }

  function install(middlewares) {
    middlewares.use(FLARES_ROUTE, async (req, res) => {
      if (req.method !== 'GET')
        return reply(res, 405, { error: 'Method Not Allowed' });
      if (!_rateLimiter(clientKey(req)))
        return reply(
          res,
          429,
          { error: 'Rate limit exceeded' },
          { 'Retry-After': '10' },
        );
      const url = new URL(req.url || '', 'http://localhost');
      const regionId = String(
        url.searchParams.get('region') || 'williston',
      ).trim();
      if (!/^[a-z-]+$/.test(regionId))
        return reply(res, 400, { error: 'A flare region id is required' });
      const state = regionState(regionId);
      if (!state)
        return reply(res, 404, {
          error: 'No flare-site bundle for that region',
        });
      const request = coalesceProxyRequest(
        _inFlight,
        `assemble:${regionId}`,
        () => assemble(state),
      );
      try {
        const payload = await request.promise;
        reply(res, 200, payload, {
          'Cache-Control': 'public, max-age=60',
          'X-Flares': request.shared ? 'INFLIGHT' : 'OK',
        });
      } catch {
        reply(res, 503, {
          error: 'Flare detections are temporarily unavailable',
        });
      }
    });
  }

  return {
    name: 'flares-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
