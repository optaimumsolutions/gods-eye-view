/**
 * Live dossier assembly (docs/COMMODITIES-PLAN.md §9.6.3 and §9.6.4): pure
 * functions that turn the bundled dossier plus whatever live inputs have
 * arrived into frozen section records. Every section carries its own status
 * (`pending` while a request is in flight, `ready`, `partial` when a stale
 * copy is shown, `unavailable` with the reason) and its own stamp, so no
 * section ever blocks another (R3). Descriptive only (R11): counts,
 * deviations, dates and quoted headlines with their source. No Cesium, no
 * DOM.
 */
import {
  PORT_BASELINE_DAYS,
  PORT_RECENT_DAYS,
  deviationStatus,
  formatDeviation,
  shiftIsoDate,
} from './records.js';

import {
  createObservation,
  formatAge,
  formatAsOf,
  freshnessClassFor,
} from '../commodities/observation.js';

// Row 1's shared observation contract (src/layers/commodities/observation.js)
// was lifted from the interim copy this module carried at milestone 6; the
// copy is gone and the names are re-exported so `dossier.js` and the tests
// keep importing them from here.
export { createObservation, formatAge, formatAsOf, freshnessClassFor };
export const PORT_HISTORY_MAX_ROWS = 120;
export const PORT_HISTORY_DAYS = 90;
export const PORT_ROAD_CAMERA_MAX_KM = 3;
export const PORT_CAMERA_LIVE_MS = 15 * 60_000;
/** NASA GIBS true-colour layers, in fallback order; both publish on Level9. */
export const PORT_SATELLITE_LAYERS = Object.freeze([
  'VIIRS_SNPP_CorrectedReflectance_TrueColor',
  'MODIS_Terra_CorrectedReflectance_TrueColor',
]);
export const PORT_SATELLITE_TILE_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

export const PROVENANCE = Object.freeze({
  portwatch: 'IMF PortWatch · IMF terms of use',
  openMeteo: 'Open-Meteo · CC BY 4.0',
  wikipedia: 'Wikipedia · CC BY-SA 4.0',
  gibs: 'NASA GIBS · NASA imagery, no restrictions',
  seed: 'Port dossier seed · this repository',
});

const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const CALL_CLASSES = Object.freeze([
  {
    key: 'tanker',
    label: 'Tanker',
    field: 'portcalls_tanker',
    trade: 'tanker',
  },
  {
    key: 'container',
    label: 'Container',
    field: 'portcalls_container',
    trade: 'container',
  },
  {
    key: 'dryBulk',
    label: 'Dry bulk',
    field: 'portcalls_dry_bulk',
    trade: 'dry_bulk',
  },
  {
    key: 'generalCargo',
    label: 'General cargo',
    field: 'portcalls_general_cargo',
    trade: 'general_cargo',
  },
  { key: 'roro', label: 'Ro-ro', field: 'portcalls_roro', trade: 'roro' },
]);

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }
  return value;
}

function finite(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  if (typeof value === 'string') {
    const trimmed = value.slice(0, 10);
    return DATE_RE.test(trimmed) ? trimmed : null;
  }
  const number = finite(value);
  if (number == null || number <= 0 || number > 8640000000000000) return null;
  return new Date(number).toISOString().slice(0, 10);
}

function parseTime(value) {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The ports layer's latest reading as an observation (row 1 §7.6.5): the
 * newest published day is both observedAt and publishedAt, the fetch time
 * is fetchedAt, and the class is always published. The layer's
 * getStats().asOf and the dossier's flow section both stamp from this one
 * record, so the panel row and the panel header can never disagree.
 */
export function portLayerObservation(latestDate, fetchedAt = Date.now()) {
  if (typeof latestDate !== 'string' || !DATE_RE.test(latestDate)) return null;
  return createObservation({
    observedAt: `${latestDate}T00:00:00Z`,
    publishedAt: `${latestDate}T00:00:00Z`,
    fetchedAt,
    freshnessClass: 'published',
    source: 'IMF PortWatch',
  });
}

/** Validate one page of `Daily_Ports_Data` rows for a single port; newest first in, oldest first out. */
export function normalizePortHistoryRows(payload) {
  if (!Array.isArray(payload?.features)) return null;
  const rows = [];
  const dates = new Set();
  for (const feature of payload.features) {
    const attributes = feature?.attributes ?? feature?.properties;
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    )
      return null;
    const date = isoDate(attributes.date);
    if (!date || dates.has(date)) return null;
    dates.add(date);
    const row = { date, calls: {}, imports: {}, exports: {} };
    for (const cls of CALL_CLASSES) {
      row.calls[cls.key] = finite(attributes[cls.field]);
      row.imports[cls.key] = finite(attributes[`import_${cls.trade}`]);
      row.exports[cls.key] = finite(attributes[`export_${cls.trade}`]);
    }
    row.calls.total = finite(attributes.portcalls);
    row.imports.total = finite(attributes.import);
    row.exports.total = finite(attributes.export);
    rows.push(row);
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

function mean(values) {
  const list = values.filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function sum(values) {
  const list = values.filter((value) => Number.isFinite(value));
  return list.length ? list.reduce((total, value) => total + value, 0) : null;
}

/**
 * Windowed means anchored on the newest published day in the rows, the same
 * rule the layer applies, plus the tanker series the sparkline draws.
 */
export function summarizePortHistory(
  rows,
  { recentDays = PORT_RECENT_DAYS, baselineDays = PORT_BASELINE_DAYS } = {},
) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const latestDate = rows[rows.length - 1].date;
  const recentFrom = shiftIsoDate(latestDate, -(recentDays - 1));
  const baselineFrom = shiftIsoDate(latestDate, -(baselineDays - 1));
  const recent = rows.filter((row) => row.date >= recentFrom);
  const baseline = rows.filter((row) => row.date >= baselineFrom);
  const recentMean = mean(recent.map((row) => row.calls.tanker));
  const baselineMean = mean(baseline.map((row) => row.calls.tanker));
  const deviationPct =
    recentMean != null && baselineMean
      ? ((recentMean - baselineMean) / baselineMean) * 100
      : null;
  const classes = CALL_CLASSES.map((cls) => ({
    key: cls.key,
    label: cls.label,
    recentPerDay: mean(recent.map((row) => row.calls[cls.key])),
    baselinePerDay: mean(baseline.map((row) => row.calls[cls.key])),
    importTonnes: sum(recent.map((row) => row.imports[cls.key])),
    exportTonnes: sum(recent.map((row) => row.exports[cls.key])),
  }));
  return {
    latestDate,
    firstDate: baseline[0]?.date ?? latestDate,
    days: baseline.length,
    recentDays: recent.length,
    recentMean,
    baselineMean,
    deviationPct,
    status: deviationStatus(deviationPct, baselineMean),
    series: baseline.map((row) => ({
      date: row.date,
      tanker: row.calls.tanker,
    })),
    classes,
  };
}

/** A chokepoint's headline word: 'Strait of Hormuz' matches an event named 'HORMUZ-26'. */
export function chokepointKeyword(name) {
  const words = String(name || '')
    .split(/\s+/)
    .filter((word) => !/^(?:strait|of|the|canal|channel|passage)$/i.test(word));
  return (words[0] || String(name || '')).toLowerCase();
}

function namesPort(text, dossier) {
  const value = String(text || '').toLowerCase();
  if (!value) return false;
  const candidates = [dossier.name, dossier.fullname, dossier.slug]
    .filter(Boolean)
    .map((name) =>
      String(name)
        .toLowerCase()
        .replace(/\s*\(.*\)$/, ''),
    );
  return candidates.some((name) => value === name || value.startsWith(name));
}

/** The shortest keyword worth matching inside an event name; 'bab' would hit 'Zimbabwe'. */
const MIN_KEYWORD_LENGTH = 4;

/** Whole-word containment: 'hormuz' matches 'HORMUZ-26' but 'bab' never matches 'Zimbabwe-2019'. */
function containsWord(haystack, needle) {
  if (!needle) return false;
  for (let from = 0; from <= haystack.length - needle.length; from += 1) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return false;
    const before = index === 0 ? '' : haystack[index - 1];
    const after = haystack[index + needle.length] || '';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = index;
  }
  return false;
}

/**
 * Events touching this port or one of its linked systems.
 *
 * PortWatch publishes `affectedports` as a semicolon-separated list of its own
 * ids ("port824; chokepoint4"), not names, so the id match is the one that
 * carries the feed; the name and event-name matches stay as fallbacks for rows
 * that spell a port out, and the event-name match needs a whole word so a
 * drought named for a country cannot borrow a chokepoint's first syllable.
 */
export function selectPortDisruptions(dossier, events) {
  if (!Array.isArray(events)) return [];
  const ids = new Set(
    [
      dossier.portid,
      ...(dossier.linkedSystems || []).map((system) => system.id),
    ].filter(Boolean),
  );
  const keywords = (dossier.linkedSystems || [])
    .filter((system) => system.kind === 'chokepoint')
    .map((system) => chokepointKeyword(system.name))
    .filter((keyword) => keyword.length >= MIN_KEYWORD_LENGTH);
  return events
    .filter((event) => {
      const ports = Array.isArray(event?.affectedPorts)
        ? event.affectedPorts
        : [];
      if (ports.some((port) => ids.has(String(port).trim()))) return true;
      if (ports.some((port) => namesPort(port, dossier))) return true;
      const name = String(event?.name || '').toLowerCase();
      return keywords.some((keyword) => containsWord(name, keyword));
    })
    .sort((a, b) => {
      const openA = a.to == null ? 0 : 1;
      const openB = b.to == null ? 0 : 1;
      if (openA !== openB) return openA - openB;
      return String(b.from || '').localeCompare(String(a.from || ''));
    });
}

/** Slippy-map tile indices for a coordinate at a zoom level. */
export function tileForCoordinate(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  );
  return {
    x: Math.min(n - 1, Math.max(0, x)),
    y: Math.min(n - 1, Math.max(0, y)),
    z: zoom,
  };
}

/** The GIBS WMTS tile URL for a layer, day and tile (Level9 matrix set). */
export function satelliteTileUrl({ layer, date, x, y, z }) {
  return `${PORT_SATELLITE_TILE_URL}/${layer}/default/${date}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
}

/** Normalize Open-Meteo hourly forecast and marine payloads into the berth reading nearest to now. */
export function normalizePortWeather({ forecast, marine, now = Date.now() }) {
  const hours = forecast?.hourly;
  if (!Array.isArray(hours?.time) || !hours.time.length) return null;
  const index = nearestHourIndex(hours.time, now);
  if (index < 0) return null;
  const pick = (block, key) => {
    const list = block?.[key];
    return Array.isArray(list) ? finite(list[index]) : null;
  };
  const marineHours = marine?.hourly;
  const marineIndex = Array.isArray(marineHours?.time)
    ? nearestHourIndex(marineHours.time, now)
    : -1;
  const pickMarine = (key) => {
    const list = marineHours?.[key];
    return marineIndex >= 0 && Array.isArray(list)
      ? finite(list[marineIndex])
      : null;
  };
  return {
    validAt: `${hours.time[index]}${/Z$|[+-]\d\d:?\d\d$/.test(hours.time[index]) ? '' : 'Z'}`,
    windKn: pick(hours, 'wind_speed_10m'),
    gustKn: pick(hours, 'wind_gusts_10m'),
    windDirectionDeg: pick(hours, 'wind_direction_10m'),
    visibilityM: pick(hours, 'visibility'),
    precipitationMm: pick(hours, 'precipitation'),
    waveHeightM: pickMarine('wave_height'),
    wavePeriodS: pickMarine('wave_period'),
    waveDirectionDeg: pickMarine('wave_direction'),
    units: {
      wind: hours && forecast?.hourly_units?.wind_speed_10m,
      wave: marine?.hourly_units?.wave_height,
    },
  };
}

function nearestHourIndex(times, now) {
  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < times.length; index += 1) {
    const raw = String(times[index]);
    const ms = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
    if (!Number.isFinite(ms)) continue;
    const distance = Math.abs(ms - now);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function section(id, title, fields) {
  return {
    id,
    title,
    status: 'pending',
    stamp: null,
    observation: null,
    provenance: null,
    reason: null,
    ...fields,
  };
}

function ready(
  base,
  { observation, now, provenance, ...data },
  status = 'ready',
) {
  return {
    ...base,
    ...data,
    status,
    observation,
    stamp: observation ? formatAsOf(observation, now) : null,
    provenance,
  };
}

function unavailable(base, reason, provenance = null) {
  return { ...base, status: 'unavailable', reason, provenance };
}

function inputState(input) {
  if (input === null || input === undefined) return 'pending';
  if (input && typeof input === 'object' && input.error) return 'error';
  return 'ready';
}

function formatRate(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
}

function formatCount(value) {
  return Number.isFinite(value)
    ? Math.round(value).toLocaleString('en-US')
    : 'n/a';
}

/**
 * Assemble every section from the bundled dossier and the live inputs that
 * have arrived. An input that is `null`/`undefined` is still pending; an
 * object with `error` is unavailable with that reason; a `stale` flag on an
 * input makes its section `partial`.
 *
 * @returns {{portid:string, asOf:string|null, sections:Array<object>}} frozen
 */
export function assemblePortDossier({
  dossier,
  row = null,
  history = null,
  disruptions = null,
  weather = null,
  news = null,
  cameras = null,
  vintage = null,
  now = Date.now(),
} = {}) {
  if (!dossier?.portid) throw new TypeError('A bundled dossier is required');
  const sections = [];

  // Camera slot (§9.4 goal 3): a registered frame, else the satellite tile.
  const cameraBase = section('camera', 'CAMERA', {});
  if (inputState(cameras) === 'pending') sections.push(cameraBase);
  else if (inputState(cameras) === 'error')
    sections.push(unavailable(cameraBase, cameras.error));
  else if (cameras.frame && parseTime(cameras.frame.frameAt) == null)
    sections.push(unavailable(cameraBase, 'camera frame has no timestamp'));
  else if (cameras.frame) {
    const observation = createObservation({
      observedAt: cameras.frame.frameAt,
      fetchedAt: cameras.frame.fetchedAt ?? now,
      freshnessClass:
        now - parseTime(cameras.frame.frameAt) < PORT_CAMERA_LIVE_MS
          ? 'live'
          : 'daily',
      source: cameras.frame.operator,
    });
    sections.push(
      ready(
        cameraBase,
        {
          observation,
          now,
          provenance: `${cameras.frame.operator} · ${cameras.frame.licence || 'operator terms'}`,
          kind: 'camera',
          frame: cameras.frame,
          road:
            cameras.road && cameras.road.distanceKm <= PORT_ROAD_CAMERA_MAX_KM
              ? cameras.road
              : null,
        },
        cameras.stale ? 'partial' : 'ready',
      ),
    );
  } else if (cameras.satellite) {
    const observation = createObservation({
      observedAt: `${cameras.satellite.date}T00:00:00Z`,
      fetchedAt: now,
      freshnessClass: 'daily',
      source: 'NASA GIBS',
    });
    sections.push(
      ready(cameraBase, {
        observation,
        now,
        provenance: PROVENANCE.gibs,
        kind: 'satellite',
        satellite: cameras.satellite,
        road:
          cameras.road && cameras.road.distanceKm <= PORT_ROAD_CAMERA_MAX_KM
            ? cameras.road
            : null,
      }),
    );
  } else sections.push(unavailable(cameraBase, 'no camera or satellite tile'));

  // Flow: the layer's current row for this port.
  const flowBase = section('flow', 'FLOW', {});
  if (inputState(row) === 'pending') sections.push(flowBase);
  else if (inputState(row) === 'error')
    sections.push(unavailable(flowBase, row.error, PROVENANCE.portwatch));
  else if (!row.latestDate)
    sections.push(
      unavailable(
        flowBase,
        'daily port calls unavailable',
        PROVENANCE.portwatch,
      ),
    );
  else {
    const observation = portLayerObservation(
      row.latestDate,
      row.fetchedAt ?? now,
    );
    sections.push(
      ready(flowBase, {
        observation,
        now,
        provenance: PROVENANCE.portwatch,
        band: row.status,
        deviation: formatDeviation(row.deviationPct),
        deviationPct: row.deviationPct ?? null,
        recentPerDay: row.recentAvg ?? null,
        baselinePerDay: row.baselineAvg ?? null,
        recentDays: row.recentDays ?? null,
        baselineDays: row.baselineDays ?? null,
        line:
          row.status === 'thin'
            ? `${formatRate(row.recentAvg)} tankers/day · below the ${formatRate(0.5)}/day noise floor, deviation not shown`
            : `${formatRate(row.recentAvg)} tankers/day · last ${row.recentDays}d · baseline ${formatRate(row.baselineAvg)} over ${row.baselineDays}d`,
      }),
    );
  }

  // 90-day history: one Daily_Ports_Data page for this port.
  const historyBase = section(
    'history',
    `${PORT_HISTORY_DAYS}-DAY HISTORY`,
    {},
  );
  const summary =
    inputState(history) === 'ready' ? summarizePortHistory(history.rows) : null;
  if (inputState(history) === 'pending') sections.push(historyBase);
  else if (inputState(history) === 'error')
    sections.push(
      unavailable(historyBase, history.error, PROVENANCE.portwatch),
    );
  else if (!summary)
    sections.push(
      unavailable(historyBase, 'no daily rows published', PROVENANCE.portwatch),
    );
  else {
    const observation = createObservation({
      observedAt: `${summary.latestDate}T00:00:00Z`,
      publishedAt: `${summary.latestDate}T00:00:00Z`,
      fetchedAt: history.fetchedAt ?? now,
      freshnessClass: 'published',
      source: 'IMF PortWatch',
    });
    sections.push(
      ready(
        historyBase,
        {
          observation,
          now,
          provenance: PROVENANCE.portwatch,
          band: summary.status,
          series: summary.series,
          recentMean: summary.recentMean,
          baselineMean: summary.baselineMean,
          deviation: formatDeviation(summary.deviationPct),
          days: summary.days,
          firstDate: summary.firstDate,
          latestDate: summary.latestDate,
        },
        history.stale ? 'partial' : 'ready',
      ),
    );
  }

  // Calls by class: annual registry counts, plus the recent window from history.
  const callsBase = section('calls', 'CALLS BY CLASS', {});
  const annual = dossier.annualCalls || {};
  const classes = CALL_CLASSES.map((cls) => {
    const live =
      summary?.classes.find((entry) => entry.key === cls.key) || null;
    return {
      key: cls.key,
      label: cls.label,
      annual: annual[cls.key] ?? null,
      recentPerDay: live?.recentPerDay ?? null,
      importTonnes: live?.importTonnes ?? null,
      exportTonnes: live?.exportTonnes ?? null,
    };
  });
  sections.push(
    ready(
      callsBase,
      {
        observation: summary
          ? createObservation({
              observedAt: `${summary.latestDate}T00:00:00Z`,
              fetchedAt: history.fetchedAt ?? now,
              freshnessClass: 'published',
              source: 'IMF PortWatch',
            })
          : null,
        now,
        provenance: PROVENANCE.portwatch,
        classes,
        annualTotal: annual.total ?? null,
        recentDays: summary?.recentDays ?? null,
      },
      summary ? (history.stale ? 'partial' : 'ready') : 'partial',
    ),
  );

  // Trade role: registry shares and industries, seed role and terminals.
  sections.push(
    ready(section('trade', 'TRADE ROLE', {}), {
      observation:
        typeof vintage === 'string' && DATE_RE.test(vintage)
          ? createObservation({
              observedAt: `${vintage}T00:00:00Z`,
              fetchedAt: now,
              freshnessClass: 'published',
              source: 'Port dossier bundle',
            })
          : null,
      now,
      provenance: `${PROVENANCE.portwatch} · ${PROVENANCE.seed}`,
      role: dossier.role,
      roleNotes: dossier.roleNotes,
      importSharePct: dossier.countryShare?.importPct ?? null,
      exportSharePct: dossier.countryShare?.exportPct ?? null,
      industries: dossier.industries || [],
      terminals: dossier.terminals || [],
      linkedSystems: dossier.linkedSystems || [],
    }),
  );

  // Disruptions from the layer snapshot.
  const disruptionsBase = section('disruptions', 'DISRUPTIONS', {});
  if (inputState(disruptions) === 'pending') sections.push(disruptionsBase);
  else if (inputState(disruptions) === 'error')
    sections.push(
      unavailable(disruptionsBase, disruptions.error, PROVENANCE.portwatch),
    );
  else {
    const list = Array.isArray(disruptions) ? disruptions : disruptions.events;
    const events = selectPortDisruptions(dossier, list).map((event) => ({
      id: event.id,
      name: event.name,
      type: event.type,
      severity: event.severity ?? null,
      alertLevel: event.alertLevel ?? null,
      from: event.from ?? null,
      to: event.to ?? null,
      affectedPortCount: event.affectedPortCount ?? null,
    }));
    const newest = events
      .map((event) => event.from)
      .filter(Boolean)
      .sort()
      .at(-1);
    sections.push(
      ready(disruptionsBase, {
        observation: newest
          ? createObservation({
              observedAt: `${newest}T00:00:00Z`,
              fetchedAt: disruptions.fetchedAt ?? now,
              freshnessClass: 'published',
              source: 'IMF PortWatch (GDACS)',
            })
          : null,
        now,
        provenance: 'IMF PortWatch disruptions (GDACS) · IMF terms of use',
        events,
        line: events.length
          ? `${events.length} event${events.length === 1 ? '' : 's'} touching this port or its linked chokepoints in the last 90 days`
          : 'no disruption touching this port or its linked chokepoints in the last 90 days',
      }),
    );
  }

  // Weather at the berth.
  const weatherBase = section('weather', 'WEATHER AT THE BERTH', {});
  if (inputState(weather) === 'pending') sections.push(weatherBase);
  else if (inputState(weather) === 'error')
    sections.push(
      unavailable(weatherBase, weather.error, PROVENANCE.openMeteo),
    );
  else if (!weather.reading)
    sections.push(
      unavailable(weatherBase, 'no forecast hour', PROVENANCE.openMeteo),
    );
  else {
    // Open-Meteo publishes no model issue time here, so the stamp names the
    // hour the reading describes rather than the wall clock we fetched it at.
    const observation = createObservation({
      observedAt: weather.reading.validAt ?? weather.fetchedAt ?? now,
      validAt: weather.reading.validAt,
      fetchedAt: weather.fetchedAt ?? now,
      freshnessClass: 'daily',
      source: 'Open-Meteo',
    });
    sections.push(
      ready(
        weatherBase,
        {
          observation,
          now,
          provenance: PROVENANCE.openMeteo,
          reading: weather.reading,
        },
        weather.stale ? 'partial' : 'ready',
      ),
    );
  }

  // Headlines through the port news proxy.
  const newsBase = section('headlines', 'HEADLINES', {});
  if (inputState(news) === 'pending') sections.push(newsBase);
  else if (inputState(news) === 'error')
    sections.push(
      unavailable(
        newsBase,
        news.error,
        news.source || 'Google News RSS / GDELT',
      ),
    );
  else {
    const articles = Array.isArray(news.articles) ? news.articles : [];
    const seenAt = news.retrievedAt || news.fetchedAt || now;
    sections.push(
      ready(
        newsBase,
        {
          observation: createObservation({
            observedAt: seenAt,
            fetchedAt: news.fetchedAt ?? now,
            freshnessClass: 'live',
            source: news.source,
          }),
          now,
          provenance: `${news.source || 'Google News RSS / GDELT'} · ${news.notice || 'UNVERIFIED WIRE'}`,
          articles,
          verification: 'UNVERIFIED WIRE',
          windowDays: news.query?.windowDays ?? 7,
        },
        news.status === 'stale' ? 'partial' : 'ready',
      ),
    );
  }

  // About: the Wikipedia summary with attribution.
  const wiki = dossier.wikipedia;
  sections.push(
    ready(section('about', 'ABOUT', {}), {
      observation: createObservation({
        observedAt: wiki.timestamp,
        fetchedAt: now,
        freshnessClass: 'published',
        source: 'Wikipedia',
      }),
      now,
      provenance: `${PROVENANCE.wikipedia} · "${wiki.title}", revision ${wiki.revision}`,
      extract: wiki.extract,
      description: wiki.description,
      thumbnail: wiki.thumbnail,
      url: wiki.url,
      attribution: `Text from Wikipedia, "${wiki.title}", ${wiki.licence}`,
    }),
  );

  // Links.
  sections.push(
    ready(section('links', 'LINKS', {}), {
      observation: null,
      now,
      provenance: null,
      links: [
        { label: dossier.authority.name, url: dossier.links.authority },
        { label: 'IMF PortWatch port page', url: dossier.links.portwatch },
        { label: `Wikipedia: ${wiki.title}`, url: dossier.links.wikipedia },
      ],
    }),
  );

  // The header stamp is the newest observation among the ready sections
  // (§9.6.5). A forecast is not an observation: its hour can sit in the future,
  // and letting it win would make the header claim the panel is fresher than
  // anything actually measured, so sections carrying a validAt are skipped.
  // The trade section's stamp is the bundle vintage, the day the static facts
  // were read; right after a rebuild it is today, so it is skipped for the
  // same reason.
  let newest = null;
  for (const entry of sections) {
    if (!entry.observation || entry.status === 'unavailable') continue;
    if (entry.observation.validAt || entry.id === 'trade') continue;
    const ms = parseTime(entry.observation.observedAt);
    if (ms != null && (newest == null || ms > parseTime(newest.observedAt)))
      newest = entry.observation;
  }
  const header = ready(section('header', dossier.name.toUpperCase(), {}), {
    observation: newest,
    now,
    provenance: null,
    name: dossier.name,
    country: dossier.country,
    locode: dossier.locode,
    role: dossier.role,
    authority: dossier.authority,
    linkedSystems: dossier.linkedSystems,
    line: [dossier.country, dossier.locode].filter(Boolean).join(' · '),
  });

  return deepFreeze({
    portid: dossier.portid,
    asOf: header.stamp,
    sections: [header, ...sections],
  });
}

export function formatDossierNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return 'n/a';
  return digits ? value.toFixed(digits) : formatCount(value);
}
