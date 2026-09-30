/**
 * Row 3 records (docs/COMMODITIES-PLAN.md §11.8.4, §11.8.14): turn one
 * Open-Meteo ensemble response into per-entry, per-day readings.
 *
 * Portable by rule: no Cesium, no DOM, no browser globals. The order of
 * operations is the oracle's — aggregate each MEMBER to the entry first
 * (weight-normalized mean over sample points), then take percentiles across
 * members — so the two pages compute freeze days and degree days the same way.
 * Never HDD of the mean temperature: the oracle measured a 15× understatement.
 */
import { createObservation } from '../commodities/observation.js';

export const WEATHER_SOURCE_LABEL = 'ECMWF AIFS ENS via Open-Meteo';
export const MODEL_LABELS = Object.freeze({
  ecmwf_aifs025_ensemble: 'ECMWF AIFS ENS via Open-Meteo',
  google_weathernext2_ensemble: 'Google WeatherNext 2 via Open-Meteo',
  ncep_aigefs025: 'NOAA AIGEFS via Open-Meteo',
  ncep_gefs025: 'NOAA GEFS via Open-Meteo',
});
export const DEFAULT_MODEL = 'ecmwf_aifs025_ensemble';
export const FORECAST_DAYS = 15;
/**
 * Beaufort 8 on SUSTAINED wind, printed as `gale ≥ 39 mph` wherever the count
 * appears. AIFS ENS answers `wind_gusts_10m_max` as null (probed 2026-09-30),
 * so the Gulf reading is the daily maximum 10 m wind speed, which is what
 * Beaufort is defined on anyway.
 */
export const GALE_MPH = 39;
/** A-3 (§11.8.4.6): anomaly bands in °F, cold first because cold is the supply shock. */
export const WEATHER_ANOMALY_BANDS = Object.freeze([
  { band: 'much-colder', max: -15 },
  { band: 'colder', max: -7 },
  { band: 'near-normal', max: 7 },
  { band: 'warmer', max: 15 },
  { band: 'much-warmer', max: Infinity },
]);
/** A-7: the least-skilled lead stays legible. */
export const ALPHA_LEAD_FLOOR = 0.35;
/** A-8: a cell at the 100th percentile of disagreement renders at 0.4. */
export const ALPHA_SPREAD_SLOPE = 0.6;
const DAILY_VARS = Object.freeze({
  tmin: 'temperature_2m_min',
  tmax: 'temperature_2m_max',
  precip: 'precipitation_sum',
  snow: 'snowfall_sum',
  wind: 'wind_speed_10m_max',
});

function num(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Linear-interpolated percentile of a finite sample (p in 0..100). */
export function percentile(values, p) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const rank = ((xs.length - 1) * p) / 100;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (rank - lo);
}

export function anomalyBand(anomalyF) {
  if (!Number.isFinite(anomalyF)) return 'unknown';
  for (const { band, max } of WEATHER_ANOMALY_BANDS)
    if (anomalyF < max) return band;
  return 'much-warmer';
}

/** Day-of-year slot (1..366) on a leap calendar, matching the normals bundle. */
export function dayOfYear(iso) {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return (
    Math.round((Date.UTC(2000, m - 1, d) - Date.UTC(2000, 0, 1)) / 86_400_000) +
    1
  );
}

/**
 * Member columns of one variable in one point block: the unsuffixed control
 * plus every `<var>_memberNN`. Returned in a stable order so the k-th column
 * is the same member across points.
 */
export function memberColumns(daily, variable) {
  const names = Object.keys(daily || {})
    .filter((k) => k === variable || k.startsWith(`${variable}_member`))
    .sort((a, b) =>
      a === variable ? -1 : b === variable ? 1 : a.localeCompare(b),
    );
  return names;
}

/**
 * Normalize the ensemble payload: an array of point blocks in request order
 * (Open-Meteo returns a bare object for one point). Null when malformed.
 */
export function normalizeEnsemblePayload(payload) {
  const blocks = Array.isArray(payload) ? payload : payload ? [payload] : [];
  if (!blocks.length) return null;
  for (const b of blocks) if (!Array.isArray(b?.daily?.time)) return null;
  return blocks;
}

/**
 * Aggregate one entry's sample points, per member per day, to the entry:
 * `{ days: [iso], members: { tmin: [day][member], tmax, precip, snow, gust }, n }`.
 * A missing member column at some point shortens the member set (recorded,
 * never padded).
 */
export function aggregateEntry(entry, blocks) {
  const days = blocks[0].daily.time.slice(0, FORECAST_DAYS);
  const out = { days, members: {}, n: 0, memberCounts: {} };
  for (const [key, variable] of Object.entries(DAILY_VARS)) {
    const perPoint = blocks.map((b) => memberColumns(b.daily, variable));
    const count = Math.min(...perPoint.map((cols) => cols.length));
    out.memberCounts[key] = count;
    if (!count) continue;
    const grid = days.map(() => new Array(count).fill(0));
    for (let d = 0; d < days.length; d++) {
      for (let m = 0; m < count; m++) {
        let acc = 0;
        let ok = true;
        blocks.forEach((b, k) => {
          const v = num(b.daily[perPoint[k][m]]?.[d]);
          if (v === null) ok = false;
          else acc += v * entry.points[k].w;
        });
        grid[d][m] = ok ? acc : null;
      }
    }
    out.members[key] = grid;
  }
  out.n = out.memberCounts.tmin || 0;
  return out;
}

function stats(values) {
  const p10 = percentile(values, 10);
  const p50 = percentile(values, 50);
  const p90 = percentile(values, 90);
  return {
    p10,
    p50,
    p90,
    spread: p10 == null || p90 == null ? null : p90 - p10,
    n: values.filter((v) => Number.isFinite(v)).length,
  };
}

/**
 * Per-day readings for one entry from its aggregated members, plus the
 * window summaries the disc and the labels use (§11.8.4.3 to .6).
 */
export function buildEntryReadings(entry, aggregate, { normals } = {}) {
  const { days, members } = aggregate;
  const normal = normals?.entries?.[entry.id] || null;
  const daysOut = days.map((iso, d) => {
    const tmin = stats(members.tmin?.[d] || []);
    const tmax = stats(members.tmax?.[d] || []);
    const mean = (members.tmin?.[d] || []).map((a, m) => {
      const b = members.tmax?.[d]?.[m];
      return a == null || b == null ? null : (a + b) / 2;
    });
    const hdd = stats(
      mean.map((t) => (t == null ? null : Math.max(0, 65 - t))),
    );
    const cdd = stats(
      mean.map((t) => (t == null ? null : Math.max(0, t - 65))),
    );
    // M7: the daily mean per member, the demand markers' direct reading
    const tmean = stats(mean);
    const wind = stats(members.wind?.[d] || []);
    const precip = stats(members.precip?.[d] || []);
    const snow = stats(members.snow?.[d] || []);
    const frozen =
      entry.kind === 'basin' && Number.isFinite(entry.freezeF)
        ? (members.tmin?.[d] || []).filter(
            (t) => t != null && t < entry.freezeF,
          )
        : [];
    const doy = dayOfYear(iso);
    const normalTmin = normal ? normal.tmin[doy - 1] : null;
    let anomalyF =
      tmin.p50 == null || normalTmin == null
        ? null
        : Number((tmin.p50 - normalTmin).toFixed(1));
    let anomalyOf = anomalyF == null ? null : 'TMIN';
    if (entry.kind === 'division' && tmean.p50 != null && normal) {
      // demand markers read the mean-temperature anomaly (§11.8.15 D7.2)
      const normalMean = (normal.tmin[doy - 1] + normal.tmax[doy - 1]) / 2;
      anomalyF = Number((tmean.p50 - normalMean).toFixed(1));
      anomalyOf = 'mean (TMIN+TMAX)/2';
    }
    return {
      date: iso,
      lead: d,
      tmin,
      tmax,
      tmean,
      hdd,
      cdd,
      wind,
      precip,
      snow,
      freezeShare: tmin.n ? frozen.length / tmin.n : null,
      normalTmin,
      normalMean: normal
        ? (normal.tmin[doy - 1] + normal.tmax[doy - 1]) / 2
        : null,
      anomalyF,
      anomalyOf,
      band: anomalyBand(anomalyF),
    };
  });
  const freezeDays = daysOut.filter(
    (x) => x.tmin.p10 != null && x.tmin.p10 < entry.freezeF,
  ).length;
  const freezeDaysP50 = daysOut.filter(
    (x) => x.tmin.p50 != null && x.tmin.p50 < entry.freezeF,
  ).length;
  const sum = (key, count) =>
    daysOut.slice(0, count).reduce((s, x) => s + (x[key].p50 ?? 0), 0);
  return {
    days: daysOut,
    window: {
      freezeDays: entry.kind === 'basin' ? freezeDays : null,
      freezeDaysP50: entry.kind === 'basin' ? freezeDaysP50 : null,
      heatingDays: daysOut.filter((x) => x.hdd.p50 > 0).length,
      coolingDays: daysOut.filter((x) => x.cdd.p50 > 0).length,
      hdd7: Number(sum('hdd', 7).toFixed(1)),
      hdd14: Number(sum('hdd', 14).toFixed(1)),
      cdd7: Number(sum('cdd', 7).toFixed(1)),
      cdd14: Number(sum('cdd', 14).toFixed(1)),
      galeDays: daysOut
        .slice(0, 7)
        .filter((x) => x.wind.p90 != null && x.wind.p90 >= GALE_MPH).length,
    },
  };
}

// --------------------------------------------------- confidence (§11.8.14) --

/** Lead-time alpha from the bundled skill curve; 1 when the model has no curve. */
export function alphaLead(skill, model, lead) {
  const curve = skill?.models?.[model]?.leads;
  const row = curve?.[Math.max(0, Math.min(lead, (curve?.length || 1) - 1))];
  const c = Number.isFinite(row?.confidence) ? row.confidence : 1;
  return ALPHA_LEAD_FLOOR + (1 - ALPHA_LEAD_FLOOR) * c;
}

/** Percentile rank (0..1) of `value` within `sample`. */
export function percentileRank(sample, value) {
  const xs = sample.filter((v) => Number.isFinite(v));
  if (!xs.length || !Number.isFinite(value)) return null;
  const below = xs.filter((v) => v < value).length;
  const equal = xs.filter((v) => v === value).length;
  return (below + equal / 2) / xs.length;
}

/** Spatial alpha: 1 − 0.6 × spread percentile (A-8); 1 when no distribution. */
export function alphaSpread(spreadPercentile) {
  if (!Number.isFinite(spreadPercentile)) return 1;
  return 1 - ALPHA_SPREAD_SLOPE * Math.max(0, Math.min(1, spreadPercentile));
}

/**
 * The two components and their product for one entry-day. The spread's
 * distribution for a marker is the entry's own spreads across the window
 * at that lead's neighbours (all 15 days of this run), the honest per-marker
 * stand-in for the trailing distribution until a run archive exists.
 */
export function confidenceFor({ skill, model, lead, spread, spreadSample }) {
  const lead_ = alphaLead(skill, model, lead);
  const pct = percentileRank(spreadSample || [], spread);
  const spread_ = alphaSpread(pct);
  const leadRow = skill?.models?.[model];
  return {
    alpha: Number((lead_ * spread_).toFixed(3)),
    alphaLead: Number(lead_.toFixed(3)),
    alphaSpread: Number(spread_.toFixed(3)),
    leadConfidence: leadRow?.leads?.[lead]?.confidence ?? 1,
    spreadPercentile: pct == null ? null : Number(pct.toFixed(2)),
    provisional: leadRow?.provisional ?? true,
    skillLabel: leadRow?.label || 'no skill measured yet',
    skillVintage: skill?.vintage || null,
  };
}

// ------------------------------------------------------------- snapshot --

/**
 * Assemble the layer snapshot: per entry, the readings for every day plus one
 * observation per day under the row-1 contract (`observedAt` = the run's
 * initialisation, `validAt` = the day, `publishedAt` = availability).
 */
export function buildWeatherSnapshot({
  entries,
  blocksByEntry,
  meta,
  model = DEFAULT_MODEL,
  normals = null,
  skill = null,
  fetchedAt = Date.now(),
}) {
  const rows = [];
  for (const entry of entries) {
    const blocks = blocksByEntry.get(entry.id);
    if (!blocks) continue;
    const aggregate = aggregateEntry(entry, blocks);
    const readings = buildEntryReadings(entry, aggregate, { normals });
    const spreadSample = readings.days.map((x) => x.tmin.spread);
    const days = readings.days.map((day) => ({
      ...day,
      confidence: confidenceFor({
        skill,
        model,
        lead: day.lead,
        spread: day.tmin.spread,
        spreadSample,
      }),
      observation: createObservation({
        observedAt: meta.initialisedAt,
        publishedAt: meta.availableAt,
        validAt: `${day.date}T00:00:00Z`,
        fetchedAt,
        freshnessClass: 'daily',
        source: MODEL_LABELS[model] || model,
      }),
    }));
    rows.push({
      ...entry,
      model,
      source: MODEL_LABELS[model] || model,
      members: aggregate.n,
      memberCounts: aggregate.memberCounts,
      days,
      window: readings.window,
    });
  }
  return { rows, model, meta, fetchedAt: new Date(fetchedAt).toISOString() };
}

/**
 * The day at a lead, by its `lead` field (a run may start at D+1, as the
 * oracle store's does), clamped to the nearest lead the run answers.
 */
export function dayAtLead(row, lead) {
  const days = row?.days;
  if (!days?.length) return null;
  const exact = days.find((d) => d.lead === lead);
  if (exact) return exact;
  return lead < days[0].lead ? days[0] : days[days.length - 1];
}

/** The last lead a run answers (the scrubber's horizon). */
export function horizonOf(rows) {
  let max = 0;
  for (const row of rows || [])
    for (const d of row.days || []) if (d.lead > max) max = d.lead;
  return max;
}

/** Flat row for the context service and the voice engine (§11.8.4.8). */
export function mapAnalystRecord(row, selectedDay = 1) {
  const day = dayAtLead(row, selectedDay);
  const n = (v) => (Number.isFinite(v) ? v : null);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    lat: n(row.lat),
    lon: n(row.lon),
    model: row.model,
    issued: row.days[0]?.observation.observedAt ?? null,
    valid: day?.date ?? null,
    lead: day?.lead ?? null,
    p10: n(day?.tmin.p10),
    p50: n(day?.tmin.p50),
    p90: n(day?.tmin.p90),
    spread: n(day?.tmin.spread),
    anomalyF: n(day?.anomalyF),
    band: day?.band ?? 'unknown',
    freezeDays: row.window.freezeDays,
    threshold: row.kind === 'basin' ? row.freezeF : null,
    hdd14: row.window.hdd14,
    cdd14: row.window.cdd14,
    tmeanP50: n(day?.tmean?.p50),
    gasShare: n(row.gasShare),
    windP90: n(day?.wind.p90),
    galeDays: row.window.galeDays,
    confidence: day?.confidence.alpha ?? null,
    source: row.source,
  };
}
