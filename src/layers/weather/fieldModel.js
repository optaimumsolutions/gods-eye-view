/**
 * The CONUS forecast field's paint model (docs/COMMODITIES-PLAN.md
 * §11.8.10.3, §11.8.14.2): a stat grid and the spread grid → RGBA pixels.
 * Portable by rule: no Cesium, no DOM; the canvas is the caller's.
 *
 * Alpha per cell = alphaLead(lead) × alphaSpread(percentile of the cell's
 * spread within this lead's CONUS distribution): where the 51 members
 * disagree the colour fades, even at short leads. Colour is the stat's own
 * ramp; saturation follows alpha toward grey, as the markers do.
 */
import { alphaLead, alphaSpread } from './records.js';

export const FIELD_STATS = Object.freeze({
  p50: { label: 'p50 TMIN', unit: '°F', ramp: 'temperature' },
  p10: { label: 'p10 TMIN', unit: '°F', ramp: 'temperature' },
  p90: { label: 'p90 TMIN', unit: '°F', ramp: 'temperature' },
  tmax: { label: 'p50 TMAX', unit: '°F', ramp: 'temperature' },
  spread: { label: 'spread (p90 − p10)', unit: '°F', ramp: 'spread' },
  freeze: {
    label: 'freeze share',
    unit: '% of members < 32°F',
    ramp: 'freeze',
  },
  // M7 (§11.8.15 D7.4 / D7.5): degree days per cell, and the demand-weighted
  // product with the bundled population grid (normalized to the day's max)
  hdd: {
    label: 'HDD',
    unit: 'degree days, base 65°F, member p50',
    ramp: 'degreeDays',
  },
  cdd: {
    label: 'CDD',
    unit: 'degree days, base 65°F, member p50',
    ramp: 'degreeDays',
  },
  hddPop: {
    label: 'HDD × people',
    unit: "HDD × population per cell, share of the day's CONUS max",
    ramp: 'people',
    base: 'hdd',
  },
  cddPop: {
    label: 'CDD × people',
    unit: "CDD × population per cell, share of the day's CONUS max",
    ramp: 'people',
    base: 'cdd',
  },
});
/** The stats derived on the globe from a base grid and the population bundle. */
export const POPULATION_STATS = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_STATS)
      .filter(([, spec]) => spec.base)
      .map(([id, spec]) => [id, spec.base]),
  ),
);
export const DEFAULT_FIELD_STAT = 'p50';
/** Nearest-neighbour upscale so a 0.25° cell is a crisp block, not a blur. */
export const FIELD_UPSCALE = 4;

/** Temperature ramp in °F: deep cold → freezing → mild → hot. */
const TEMPERATURE_STOPS = [
  [-20, [120, 40, 200]],
  [0, [60, 80, 220]],
  [20, [40, 150, 240]],
  [32, [120, 220, 255]],
  [45, [180, 240, 200]],
  [60, [250, 240, 120]],
  [75, [250, 160, 60]],
  [90, [230, 60, 40]],
  [105, [150, 0, 40]],
];
const SPREAD_STOPS = [
  [0, [40, 40, 60]],
  [5, [80, 140, 220]],
  [12, [250, 200, 80]],
  [20, [255, 60, 90]],
];
const FREEZE_STOPS = [
  [0, [40, 40, 60]],
  [0.25, [120, 200, 255]],
  [0.5, [80, 120, 240]],
  [1, [200, 80, 255]],
];
/** Degree days 0 → 40 (D7.5: the plain chips keep the physics). */
const DEGREE_DAY_STOPS = [
  [0, [40, 40, 60]],
  [5, [70, 110, 200]],
  [15, [250, 220, 90]],
  [25, [250, 130, 50]],
  [40, [220, 40, 60]],
];
/** Dark → hot for the demand-weighted product, 0 → 1 of the day's max. */
const PEOPLE_STOPS = [
  [0, [30, 30, 45]],
  [0.15, [90, 60, 140]],
  [0.4, [210, 80, 120]],
  [0.7, [255, 150, 60]],
  [1, [255, 245, 170]],
];
const RAMPS = {
  temperature: TEMPERATURE_STOPS,
  spread: SPREAD_STOPS,
  freeze: FREEZE_STOPS,
  degreeDays: DEGREE_DAY_STOPS,
  people: PEOPLE_STOPS,
};
const GREY = [107, 114, 128];

/** Piecewise-linear colour for `value` on `ramp`. */
export function rampColor(ramp, value) {
  const stops = RAMPS[ramp] || TEMPERATURE_STOPS;
  if (!Number.isFinite(value)) return GREY;
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i];
    if (value <= v1) {
      const [v0, c0] = stops[i - 1];
      const t = (value - v0) / (v1 - v0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t));
    }
  }
  return stops[stops.length - 1][1];
}

/** The legend's colour bar: `n` stops with their labels. */
export function rampLegend(stat, n = 5) {
  const spec = FIELD_STATS[stat] || FIELD_STATS[DEFAULT_FIELD_STAT];
  const stops = RAMPS[spec.ramp];
  const lo = stops[0][0];
  const hi = stops[stops.length - 1][0];
  return Array.from({ length: n }, (_, i) => {
    const v = lo + ((hi - lo) * i) / (n - 1);
    const [r, g, b] = rampColor(spec.ramp, v);
    const label =
      spec.ramp === 'freeze' || spec.ramp === 'people'
        ? `${Math.round(v * 100)}%`
        : spec.ramp === 'degreeDays'
          ? `${Math.round(v)}`
          : `${Math.round(v)}°F`;
    return { value: v, label, color: `rgb(${r},${g},${b})` };
  });
}

/** Percentile ranks (0..1) of every value within the grid, ignoring NaN. */
export function percentileRanks(values) {
  const idx = [];
  for (let i = 0; i < values.length; i++)
    if (Number.isFinite(values[i])) idx.push(i);
  idx.sort((a, b) => values[a] - values[b]);
  const out = new Float32Array(values.length).fill(NaN);
  const n = idx.length;
  for (let r = 0; r < n; r++) out[idx[r]] = n > 1 ? r / (n - 1) : 0.5;
  return out;
}

/**
 * Paint one stat grid (row-major from the north-west, `rows × cols`, already
 * scaled to the unit) with the spread grid for alpha into an RGBA buffer of
 * `(rows·upscale) × (cols·upscale)`. Returns `{ data, width, height, alphaLead }`.
 */
export function paintField({
  stat = DEFAULT_FIELD_STAT,
  values,
  spread,
  rows,
  cols,
  lead = 1,
  skill = null,
  model = 'ecmwf_aifs025_ensemble',
  upscale = FIELD_UPSCALE,
  baseAlpha = 1,
}) {
  if (!values || values.length !== rows * cols)
    throw new TypeError('field values do not match rows × cols');
  const spec = FIELD_STATS[stat] || FIELD_STATS[DEFAULT_FIELD_STAT];
  const aLead = alphaLead(skill, model, lead);
  const ranks =
    spread && spread.length === values.length ? percentileRanks(spread) : null;
  const width = cols * upscale;
  const height = rows * upscale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const v = values[i];
      const [cr, cg, cb] = rampColor(spec.ramp, v);
      const a = aLead * (ranks ? alphaSpread(ranks[i]) : 1) * baseAlpha;
      // desaturate toward grey as alpha falls (§11.8.14.3)
      const w = 0.4 + 0.6 * a;
      const R = Math.round(GREY[0] + (cr - GREY[0]) * w);
      const G = Math.round(GREY[1] + (cg - GREY[1]) * w);
      const B = Math.round(GREY[2] + (cb - GREY[2]) * w);
      const A = Number.isFinite(v) ? Math.round(255 * a) : 0;
      for (let dy = 0; dy < upscale; dy++) {
        let p = ((r * upscale + dy) * width + c * upscale) * 4;
        for (let dx = 0; dx < upscale; dx++) {
          data[p] = R;
          data[p + 1] = G;
          data[p + 2] = B;
          data[p + 3] = A;
          p += 4;
        }
      }
    }
  }
  return { data, width, height, alphaLead: aLead };
}

/**
 * D7.5: degree days × population per cell, normalized to the day's CONUS
 * maximum so the ramp always spans 0..1; returns the normalized grid and the
 * day's maximum product (the legend prints it with the bundle's vintage).
 * A cell with no population (or NaN) reads 0 and paints dark.
 */
export function weightByPopulation(values, population) {
  if (!values || !population || values.length !== population.length)
    throw new TypeError('population grid does not match the field');
  const product = new Float32Array(values.length);
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const p = population[i];
    const x = Number.isFinite(v) && Number.isFinite(p) ? v * p : 0;
    product[i] = x;
    if (x > max) max = x;
  }
  const out = new Float32Array(values.length);
  if (max > 0)
    for (let i = 0; i < values.length; i++) out[i] = product[i] / max;
  return { values: out, max };
}

/** Decode a route grid: int16 ints × scale → Float32Array in the unit. */
export function decodeGrid(payload) {
  const scale = Number(payload?.scale) || 1;
  const vals = payload?.values;
  if (!Array.isArray(vals)) return null;
  const out = new Float32Array(vals.length);
  for (let i = 0; i < vals.length; i++) out[i] = vals[i] * scale;
  return out;
}
