import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETENESS_BASELINE_FLOOR,
  COMPLETENESS_THRESHOLD,
  COMPLETENESS_WINDOW,
  classifyMonths,
  fillingMonthsLine,
  monthAbbrev,
  newestCompleteMonth,
} from './completeness.js';

/**
 * The measured tail of BSEE's platform file on 2026-09-21: a stable ~345
 * reporters a month, then the late-filing cliff. Earlier months are seeded at
 * the same level so the twelve-month median is what the real file gives.
 */
function measuredCounts() {
  const counts = [];
  for (let i = 0; i < 13; i += 1) {
    const month = `${2025 + Math.floor((3 + i) / 12)}-${String(((3 + i) % 12) + 1).padStart(2, '0')}`;
    counts.push({ month, reporters: 345 });
  }
  counts.push({ month: '2026-05', reporters: 348 });
  counts.push({ month: '2026-06', reporters: 331 });
  counts.push({ month: '2026-07', reporters: 159 });
  counts.push({ month: '2026-08', reporters: 2 });
  return counts;
}

test('the rule is pinned to the measured file: 2026-06 is current, July and August are filling', () => {
  assert.equal(COMPLETENESS_THRESHOLD, 0.9);
  assert.equal(COMPLETENESS_WINDOW, 12);
  assert.equal(COMPLETENESS_BASELINE_FLOOR, 0.5);
  const verdict = newestCompleteMonth(measuredCounts());
  assert.equal(verdict.current, '2026-06');
  assert.equal(verdict.medianReporters, 345);
  const byMonth = Object.fromEntries(verdict.table.map((r) => [r.month, r]));
  assert.equal(byMonth['2026-06'].complete, true);
  assert.equal(byMonth['2026-07'].complete, false);
  assert.equal(byMonth['2026-08'].complete, false);
  // Shares are against the median of complete months, never of the cliff.
  assert.ok(Math.abs(byMonth['2026-07'].share - 159 / 345) < 0.002);
  assert.ok(Math.abs(byMonth['2026-08'].share - 2 / 345) < 0.002);
  // Newest first, eight rows.
  assert.equal(verdict.table.length, 8);
  assert.equal(verdict.table[0].month, '2026-08');
});

test('a month just under the threshold is filling; at the threshold it is complete', () => {
  // The thirteen seed months only (2025-04 to 2026-04), then one month under test.
  const base = measuredCounts().slice(0, 13);
  const under = classifyMonths([...base, { month: '2026-05', reporters: 310 }]);
  assert.equal(under.months.at(-1).complete, false);
  const at = classifyMonths([...base, { month: '2026-05', reporters: 311 }]);
  assert.equal(at.months.at(-1).complete, true);
  assert.equal(at.current, '2026-05');
});

test('a year-long dead tail cannot drag the baseline down to itself', () => {
  const counts = [...measuredCounts()];
  // Twelve near-empty months after the real cliff: the rolling median would
  // fall to 5 and a 5-reporter month would pass the share test, so the floor
  // guard (baseline at least half of the year before) has to refuse it.
  for (let i = 0; i < 12; i += 1) {
    counts.push({
      month: `2027-${String(i + 1).padStart(2, '0')}`,
      reporters: 5,
    });
  }
  const verdict = newestCompleteMonth(counts, { tail: 20 });
  assert.equal(verdict.current, '2026-06');
  assert.equal(verdict.medianReporters, 345);
});

test('the baseline follows a structural decline instead of freezing on a bad season', () => {
  // The real file: ~1,800 reporters in the mid-2000s falling to ~345 today,
  // with a hurricane season in between where a third of the shelf shut in.
  // The first draft froze on that season and named 2008-08 as current.
  const counts = [];
  let month = 2004 * 12;
  const push = (reporters) => {
    counts.push({
      month: `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`,
      reporters,
    });
    month += 1;
  };
  for (let i = 0; i < 56; i += 1) push(1843);
  for (let i = 0; i < 3; i += 1) push(1200); // Gustav and Ike, 2008-09 to 2008-11
  let level = 1800;
  for (let i = 0; i < 200; i += 1) {
    level = Math.max(345, Math.round(level * 0.992)); // a slow structural decline
    push(level);
  }
  const verdict = newestCompleteMonth(counts);
  assert.equal(verdict.current, counts.at(-1).month);
  assert.ok(
    verdict.medianReporters < 400,
    `baseline followed the decline: ${verdict.medianReporters}`,
  );
});

test('input order does not matter and the shape is guarded', () => {
  const shuffled = [...measuredCounts()].reverse();
  assert.equal(newestCompleteMonth(shuffled).current, '2026-06');
  assert.throws(
    () => classifyMonths([{ month: '202606', reporters: 1 }]),
    TypeError,
  );
  assert.equal(newestCompleteMonth([]).current, null);
});

test('the filling line names only the months newer than current', () => {
  const verdict = newestCompleteMonth(measuredCounts());
  assert.equal(
    fillingMonthsLine(verdict.table, verdict.current),
    'JUL 46 % REPORTED · AUG 1 %',
  );
  assert.equal(fillingMonthsLine(verdict.table, '2026-08'), '');
  assert.equal(monthAbbrev('2026-07'), 'JUL');
});
