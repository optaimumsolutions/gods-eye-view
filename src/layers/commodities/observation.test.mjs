import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObservation,
  formatAge,
  formatAsOf,
  freshnessClassFor,
} from './observation.js';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The four §7.6.3 example stamps are pinned against these instants. */
const LIVE_AT = Date.parse('2026-09-17T12:04:31Z');
const DAILY_AT = Date.parse('2026-09-17T12:00:00Z');
const ISSUE_AT = Date.parse('2026-09-17T00:00:00Z');
const PUBLISHED_AT = Date.parse('2026-09-13T00:00:00Z');

test('freshnessClassFor splits live, daily and published at the R2 thresholds', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  assert.equal(freshnessClassFor(now, now), 'live');
  assert.equal(freshnessClassFor(now - 14 * MINUTE, now), 'live');
  // The boundaries are exclusive: exactly 15 minutes is no longer live.
  assert.equal(freshnessClassFor(now - 15 * MINUTE, now), 'daily');
  assert.equal(freshnessClassFor(now - 23 * HOUR, now), 'daily');
  assert.equal(freshnessClassFor(now - 24 * HOUR, now), 'published');
  assert.equal(freshnessClassFor(now - 400 * DAY, now), 'published');
});

test('freshnessClassFor reads a date string and falls back to published', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  assert.equal(freshnessClassFor('2026-09-17T11:55:00Z', now), 'live');
  assert.equal(freshnessClassFor('not a date', now), 'published');
  assert.equal(freshnessClassFor(null, now), 'published');
});

test('formatAge reports one unit per bucket', () => {
  assert.equal(formatAge(0), '0s');
  assert.equal(formatAge(38_000), '38s');
  assert.equal(formatAge(59_999), '59s');
  assert.equal(formatAge(MINUTE), '1m');
  assert.equal(formatAge(90 * MINUTE), '1h');
  assert.equal(formatAge(3 * HOUR), '3h');
  assert.equal(formatAge(DAY), '1d');
  assert.equal(formatAge(4 * DAY), '4d');
});

test('formatAge rejects negative and non-finite input', () => {
  assert.equal(formatAge(-1), 'n/a');
  assert.equal(formatAge(Number.NaN), 'n/a');
  assert.equal(formatAge(Number.POSITIVE_INFINITY), 'n/a');
  assert.equal(formatAge(undefined), 'n/a');
});

test('createObservation returns a frozen record with normalized timestamps', () => {
  const observation = createObservation({
    observedAt: '2026-09-13T00:00:00Z',
    publishedAt: PUBLISHED_AT,
    fetchedAt: '2026-09-17T09:30:00Z',
    freshnessClass: 'published',
    source: 'IMF PortWatch',
    headline: '1.4 tankers/day',
  });
  assert.equal(Object.isFrozen(observation), true);
  assert.equal(observation.observedAt, '2026-09-13T00:00:00.000Z');
  assert.equal(observation.publishedAt, '2026-09-13T00:00:00.000Z');
  assert.equal(observation.fetchedAt, '2026-09-17T09:30:00.000Z');
  assert.equal(observation.validAt, null);
  assert.equal(observation.freshnessClass, 'published');
  assert.equal(observation.source, 'IMF PortWatch');
  assert.equal(observation.headline, '1.4 tankers/day');
  assert.throws(() => {
    observation.observedAt = '2026-01-01T00:00:00Z';
  }, TypeError);
});

test('createObservation requires observedAt and rejects unparseable dates', () => {
  assert.throws(() => createObservation({}), TypeError);
  assert.throws(() => createObservation({ observedAt: null }), TypeError);
  assert.throws(() => createObservation({ observedAt: 'never' }), TypeError);
  const observedAt = '2026-09-17T00:00:00Z';
  assert.throws(
    () => createObservation({ observedAt, validAt: 'soon' }),
    TypeError,
  );
  assert.throws(
    () => createObservation({ observedAt, publishedAt: 'later' }),
    TypeError,
  );
  assert.throws(
    () => createObservation({ observedAt, fetchedAt: 'just now' }),
    TypeError,
  );
});

test('createObservation defaults fetchedAt to now and derives the class from it', () => {
  const before = Date.now();
  const observation = createObservation({ observedAt: before - 30_000 });
  const fetched = Date.parse(observation.fetchedAt);
  assert.ok(fetched >= before && fetched <= Date.now());
  assert.equal(observation.freshnessClass, 'live');
});

test('an explicit freshnessClass wins over the derived one', () => {
  // A static dataset fetched a minute ago is still published, not live (R2).
  const observation = createObservation({
    observedAt: Date.now(),
    freshnessClass: 'published',
  });
  assert.equal(observation.freshnessClass, 'published');
  assert.equal(
    createObservation({ observedAt: Date.now() }).freshnessClass,
    'live',
  );
});

test('formatAsOf stamps a live reading with the observation time and age', () => {
  const observation = createObservation({
    observedAt: LIVE_AT,
    fetchedAt: LIVE_AT,
  });
  assert.equal(observation.freshnessClass, 'live');
  assert.equal(
    formatAsOf(observation, LIVE_AT + 38_000),
    'observed 12:04:31Z · 38s ago',
  );
});

test('formatAsOf stamps a daily reading with the issue time and age', () => {
  const now = DAILY_AT + 3 * HOUR;
  const observation = createObservation({
    observedAt: DAILY_AT,
    fetchedAt: now,
  });
  assert.equal(observation.freshnessClass, 'daily');
  assert.equal(formatAsOf(observation, now), 'issued 12:00Z · 3h ago');
});

test('formatAsOf stamps a forecast with its valid date instead of an age', () => {
  const observation = createObservation({
    observedAt: ISSUE_AT,
    validAt: '2026-09-18T00:00:00Z',
    freshnessClass: 'daily',
  });
  assert.equal(
    formatAsOf(observation, ISSUE_AT + 6 * HOUR),
    'issued 00Z 09-17 · valid 09-18',
  );
});

test('formatAsOf stamps a published reading with its vintage and whole-day lag', () => {
  const now = Date.parse('2026-09-17T00:00:00Z');
  const observation = createObservation({
    observedAt: PUBLISHED_AT,
    publishedAt: PUBLISHED_AT,
    fetchedAt: now,
    freshnessClass: 'published',
  });
  assert.equal(formatAsOf(observation, now), 'as of 2026-09-13 · 4d lag');
  // A lag rounds down to whole days and never reads negative.
  assert.equal(
    formatAsOf(observation, PUBLISHED_AT + 4 * DAY + 23 * HOUR),
    'as of 2026-09-13 · 4d lag',
  );
  assert.equal(
    formatAsOf(observation, PUBLISHED_AT - HOUR),
    'as of 2026-09-13 · 0d lag',
  );
});

test('formatAsOf degrades to a readable stamp without a usable record', () => {
  assert.equal(formatAsOf(null), 'as of n/a');
  assert.equal(formatAsOf({}), 'as of n/a');
  assert.equal(formatAsOf({ observedAt: 'never' }), 'as of n/a');
  // An unknown class falls through to the published shape rather than throwing.
  assert.equal(
    formatAsOf(
      { observedAt: '2026-09-13T00:00:00.000Z', freshnessClass: 'weekly' },
      Date.parse('2026-09-17T00:00:00Z'),
    ),
    'as of 2026-09-13 · 4d lag',
  );
});
