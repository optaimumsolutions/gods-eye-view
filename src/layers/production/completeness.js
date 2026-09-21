/**
 * Which month is "current" in a regulator's monthly production file
 * (docs/COMMODITIES-PLAN.md §13, R11.2).
 *
 * BSEE's platform file is not complete for its newest months: operators file
 * late, so the last two or three months carry a fraction of the structures
 * that will eventually report. Measured 2026-09-21: 2026-05 348 structures
 * with production, 2026-06 331, 2026-07 159, 2026-08 2. The newest month
 * with rows is therefore not the current month, and a card that read it as
 * current would show a platform at zero because its operator has not filed
 * yet.
 *
 * The rule: a month is complete when the number of structures reporting any
 * production is at least `threshold` of the median over the `lookback`
 * preceding months, and that baseline is itself at least `floor` of the
 * median over the `lookback` months before those. "Current" is the newest
 * complete month. The whole table is kept so the panel can say which months
 * are still filling.
 *
 * Why a rolling median over every preceding month, not only the complete
 * ones: the first draft froze its baseline on the months it had flagged, and
 * the real file broke it at once — reporters fell sharply in the 2008
 * hurricane season, those months were flagged, the baseline stayed at 1,843
 * forever, and "current" came out as 2008-08. The Gulf's reporter count has
 * declined structurally from ~1,800 to ~345 as shelf platforms were removed;
 * a baseline has to follow that. The floor guard covers the opposite
 * failure: a file that stops filling for a year would drag the median down
 * until a near-empty month passed the share test, so a month whose baseline
 * has halved within a year is never called complete.
 *
 * Portable by rule: no Cesium, no DOM, no Node built-ins.
 */

export const COMPLETENESS_THRESHOLD = 0.9;
export const COMPLETENESS_WINDOW = 12;
export const COMPLETENESS_BASELINE_FLOOR = 0.5;

/** Median of a non-empty numeric array. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** `YYYY-MM` strings compare correctly as text; guard the shape anyway. */
function assertMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month))) {
    throw new TypeError(`completeness: month "${month}" is not YYYY-MM`);
  }
  return String(month);
}

/**
 * Classify every month and name the newest complete one.
 *
 * @param {Array<{month: string, reporters: number}>} counts any order
 * @returns {{ current: string|null, medianReporters: number|null, months: Array<{month, reporters, baseline, share, complete}> }}
 */
export function classifyMonths(
  counts,
  {
    threshold = COMPLETENESS_THRESHOLD,
    lookback = COMPLETENESS_WINDOW,
    floor = COMPLETENESS_BASELINE_FLOOR,
  } = {},
) {
  const rows = (Array.isArray(counts) ? counts : [])
    .map((row) => ({
      month: assertMonth(row.month),
      reporters: Number.isFinite(row.reporters)
        ? Math.max(0, Math.floor(row.reporters))
        : 0,
    }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  const reporters = rows.map((row) => row.reporters);
  const months = [];
  let current = null;
  let medianReporters = null;
  rows.forEach((row, i) => {
    // The first `lookback` months seed the baseline and count as complete:
    // there is nothing earlier to compare them with.
    const baseline =
      i >= lookback ? median(reporters.slice(i - lookback, i)) : null;
    // Whatever history precedes the baseline lookback, up to a lookback of it.
    const earlierSlice = reporters.slice(
      Math.max(0, i - 2 * lookback),
      Math.max(0, i - lookback),
    );
    const earlier = earlierSlice.length ? median(earlierSlice) : null;
    const share = baseline ? row.reporters / baseline : null;
    const baselineSane = earlier === null || baseline >= floor * earlier;
    const isComplete =
      baseline === null
        ? true
        : baseline > 0 && share >= threshold && baselineSane;
    months.push({
      month: row.month,
      reporters: row.reporters,
      baseline,
      share,
      complete: isComplete,
    });
    if (isComplete) {
      current = row.month;
      medianReporters = baseline ?? median(reporters.slice(0, i + 1));
    }
  });
  return { current, medianReporters, months };
}

/**
 * The newest complete month plus the short table the bundle carries: the
 * `tail` newest months, newest first, each with its reporter count and share.
 */
export function newestCompleteMonth(counts, options = {}) {
  const { tail = 8, ...rest } = options;
  const { current, medianReporters, months } = classifyMonths(counts, rest);
  const table = months
    .slice(-tail)
    .reverse()
    .map((row) => ({
      month: row.month,
      reporters: row.reporters,
      share: row.share === null ? null : Math.round(row.share * 1000) / 1000,
      complete: row.complete,
    }));
  return { current, medianReporters, table };
}

/**
 * The months newer than `current` that are still filling, as a panel phrase:
 * `JUL 48 % REPORTED · AUG 1 %`. Empty when nothing is newer.
 */
export function fillingMonthsLine(table, current) {
  if (!Array.isArray(table) || !current) return '';
  const filling = table
    .filter((row) => row.month > current && !row.complete)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  return filling
    .map((row, index) => {
      const pct =
        row.share === null ? null : Math.max(0, Math.round(row.share * 100));
      const label = monthAbbrev(row.month);
      if (pct === null) return `${label} PARTIAL`;
      return index === 0 ? `${label} ${pct} % REPORTED` : `${label} ${pct} %`;
    })
    .join(' · ');
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/** `2026-07` → `JUL`. */
export function monthAbbrev(month) {
  const index = Number(String(month).slice(5, 7)) - 1;
  return MONTHS[index] ?? String(month);
}
