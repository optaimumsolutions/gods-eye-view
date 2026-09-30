/**
 * The forecast service (docs/COMMODITIES-PLAN.md §11.8.8, row 3 M2): the
 * weather layer's snapshot source shared with the other commodity layers, so
 * a campus, a crossing or a port card can carry one forecast line without a
 * second request. Each layer edits only its own card (R13); this module
 * supplies the reading and the line.
 *
 * What a card gets is the reading of the NEAREST gazetteer entry (a basin, a
 * demand region or a Gulf point) within `maxKm`, named with its distance —
 * not a sample at the asset's own coordinates. The hosted site draws the
 * oracle store, which samples only the gazetteer's places (§11.13), so the
 * nearest-entry reading is the one that exists on both paths and costs no
 * extra request on either. Lines follow the shared scrubber (§11.8.13.4).
 *
 * Portable by rule: no Cesium, no DOM, no browser globals.
 */
import { GALE_MPH, dayAtLead } from '../layers/weather/records.js';
import { formatAsOf } from '../layers/commodities/observation.js';

export const FORECAST_MAX_KM = 500;
/** The oracle route is 40 KB and the run changes once a day; Open-Meteo caches per run. */
const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_LEAD = 1;

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** The nearest row within `maxKm`, or null. */
export function nearestRow(rows, lat, lon, maxKm = FORECAST_MAX_KM) {
  let best = null;
  for (const row of rows || []) {
    if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lon)) continue;
    // M7 division centroids are demand markers, not places a campus or port
    // sits in; the card line keeps reading the nearest basin, region or Gulf
    if (row.kind === 'division') continue;
    const km = haversineKm(lat, lon, row.lat, row.lon);
    if (km <= maxKm && (!best || km < best.km)) best = { row, km };
  }
  return best;
}

const f0 = (v) => (Number.isFinite(v) ? `${Math.round(v)}` : 'n/a');

/**
 * One reading for a card: the nearest entry's selected day plus its window,
 * `{ entry: { id, name, kind, distanceKm, freezeF }, day, window, source }`.
 */
export function readingFor(rows, lat, lon, lead, maxKm = FORECAST_MAX_KM) {
  const near = nearestRow(rows, lat, lon, maxKm);
  if (!near) return null;
  const day = dayAtLead(near.row, lead);
  if (!day) return null;
  return {
    entry: {
      id: near.row.id,
      name: near.row.name,
      kind: near.row.kind,
      distanceKm: Math.round(near.km),
      freezeF: near.row.kind === 'basin' ? near.row.freezeF : null,
    },
    day,
    window: near.row.window,
    marine: near.row.marine || null,
    source: near.row.source,
  };
}

/**
 * The one line a card carries (§11.8.8.2). Basins lead with the freeze count,
 * regions with degree days, the Gulf with wind and waves; every line names
 * the entry, its distance and the stamp, and thresholds print as heuristics.
 */
export function formatForecastLine(reading) {
  if (!reading?.day) return null;
  const { entry, day, window } = reading;
  const where = `${entry.name} ${entry.distanceKm} km`;
  // the stamp is the issue time only: D+n already names the valid day, and
  // the overlay card clamps long lines
  const issued = formatAsOf(day.observation).split(' · ')[0];
  let body;
  if (entry.kind === 'basin')
    body = `min p10 ${f0(day.tmin.p10)}°F · ${window.freezeDays ?? 0} freeze days (heuristic ${entry.freezeF}°F)`;
  else if (entry.kind === 'region')
    body = `HDD14 ${f0(window.hdd14)} · CDD14 ${f0(window.cdd14)}`;
  else {
    const wave = reading.marine?.find((m) => m.date === day.date)?.waveMax;
    body = `wind p90 ${f0(day.wind?.p90)} mph · wave ${Number.isFinite(wave) ? wave.toFixed(1) : 'n/a'} m · ${window.galeDays ?? 0} gale days (≥ ${GALE_MPH} mph)`;
  }
  return `forecast D+${day.lead} · ${body} · ${where} · ${issued}`;
}

/**
 * The service. `source` is the same snapshot source the weather layer uses
 * (Open-Meteo, the oracle store, or the preferred pair); `scrubber` is the
 * shared control (`getLead`, `subscribe`) when a document exists.
 */
export function createWeatherForecastService({
  source,
  scrubber = null,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
  maxKm = FORECAST_MAX_KM,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Forecast service requires a snapshot source');
  let _snapshot = null;
  let _fetchedAt = 0;
  let _inFlight = null;
  let _lead = scrubber?.getLead?.() ?? DEFAULT_LEAD;
  const listeners = new Set();

  function emit() {
    for (const fn of listeners) {
      try {
        fn();
      } catch (error) {
        console.warn('[Weather service] listener error:', error);
      }
    }
  }

  scrubber?.subscribe?.((lead) => {
    if (lead === _lead) return;
    _lead = lead;
    emit();
  });

  return {
    label: source.label,
    getLead: () => _lead,
    /** Without a scrubber (tests), step the lead here. */
    setLead(lead) {
      if (lead === _lead) return;
      _lead = lead;
      emit();
    },
    /** Load or refresh the snapshot; never throws (a card line is enrichment). */
    async refresh({ signal, force = false } = {}) {
      if (!force && _snapshot && now() - _fetchedAt < ttlMs) return _snapshot;
      if (_inFlight) return _inFlight;
      _inFlight = source
        .getSnapshot({ signal })
        .then((snapshot) => {
          const changed = snapshot !== _snapshot;
          _snapshot = snapshot;
          _fetchedAt = now();
          if (changed) emit();
          return snapshot;
        })
        .catch((error) => {
          if (signal?.aborted) throw error;
          return _snapshot;
        })
        .finally(() => {
          _inFlight = null;
        });
      return _inFlight;
    },
    /** Synchronous: the nearest entry's reading at the current lead, or null. */
    peekNear(lat, lon) {
      if (!_snapshot?.rows?.length) return null;
      return readingFor(_snapshot.rows, lat, lon, _lead, maxKm);
    },
    /** The line for a card at (lat, lon), or null when nothing is near or loaded. */
    lineFor(lat, lon) {
      return formatForecastLine(this.peekNear(lat, lon));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    peek: () => _snapshot,
  };
}
