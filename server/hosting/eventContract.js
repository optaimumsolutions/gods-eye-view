/**
 * The M4 event contract (plan §15.12, frozen 2026-09-25): the frames the hub
 * sends on /api/events and the body the oracle posts to the publish
 * listener. Both repos code against this; a change bumps EVENT_VERSION and is
 * recorded in the plan first.
 */

export const EVENT_VERSION = 1;
export const EVENTS_PATH = '/api/events';
export const PUBLISH_PATH = '/publish';
export const PUBLISH_MAX_ITEMS = 200;
export const PUBLISH_MAX_BYTES = 64 * 1024;
export const HEALTH_STATES = Object.freeze(['live', 'stale', 'offline']);

const iso = (ms) => new Date(ms).toISOString();

/** Milliseconds for an ISO string or a SQLite `YYYY-MM-DD HH:MM:SS` (UTC). */
export function parseUtc(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(text)
    ? text
    : `${text.replace(' ', 'T')}Z`;
  const ms = Date.parse(withZone);
  return Number.isFinite(ms) ? ms : null;
}

/** ISO form of a store timestamp, or null. */
export function isoOrNull(value) {
  const ms = parseUtc(value);
  return ms === null ? null : iso(ms);
}

/** One freshness record (from /api/oracle/freshness) with its deadline. */
export function sourceRecord(entry) {
  const fetched = parseUtc(entry?.fetchedAt);
  const tolerance = Number(entry?.toleranceHours);
  const grace = Number(entry?.graceHours);
  const window =
    (Number.isFinite(tolerance) ? tolerance : 0) +
    (Number.isFinite(grace) ? grace : 0);
  return {
    source: String(entry?.source ?? ''),
    observedAt: entry?.observedAt ?? null,
    fetchedAt: fetched === null ? null : iso(fetched),
    lastRunAt: isoOrNull(entry?.lastRunAt),
    lastRunRows: Number.isFinite(Number(entry?.lastRunRows))
      ? Number(entry.lastRunRows)
      : null,
    toleranceHours: Number.isFinite(tolerance) ? tolerance : null,
    graceHours: Number.isFinite(grace) ? grace : null,
    critical: entry?.critical === true,
    state: ['live', 'stale'].includes(entry?.state) ? entry.state : 'unknown',
    deadline:
      fetched === null || window <= 0
        ? null
        : iso(fetched + window * 3_600_000),
  };
}

export function snapshotFrame({ sources, health, at }) {
  return {
    v: EVENT_VERSION,
    type: 'snapshot',
    sources,
    health,
    at: iso(at),
  };
}

export function sourceUpdatedFrame({
  source,
  observedAt = null,
  publishedAt = null,
  rows = null,
  runAt = null,
  at,
}) {
  return {
    v: EVENT_VERSION,
    type: 'source.updated',
    source,
    observedAt,
    publishedAt,
    rows,
    runAt,
    at: iso(at),
  };
}

export function healthFrame({ component, state, since, detail = null, at }) {
  return {
    v: EVENT_VERSION,
    type: 'health',
    component,
    state,
    since: iso(since),
    detail,
    at: iso(at),
  };
}

export function heartbeatFrame(at) {
  return { v: EVENT_VERSION, type: 'heartbeat', at: iso(at) };
}

const SOURCE_NAME = /^[a-z0-9][a-z0-9_:.-]{0,63}$/;

/**
 * Validate a publish body `{items: [{source, runAt, rows}]}`. Returns the
 * cleaned items or throws a TypeError whose message is safe to send back.
 */
export function parsePublishBody(body) {
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0)
    throw new TypeError('items must be a non-empty array');
  if (items.length > PUBLISH_MAX_ITEMS)
    throw new TypeError(`at most ${PUBLISH_MAX_ITEMS} items`);
  return items.map((item, index) => {
    const source = String(item?.source ?? '');
    if (!SOURCE_NAME.test(source))
      throw new TypeError(`items[${index}].source is not a source name`);
    const rows = item?.rows;
    if (rows !== null && rows !== undefined && !Number.isInteger(rows))
      throw new TypeError(`items[${index}].rows must be an integer or null`);
    return {
      source,
      runAt: isoOrNull(item?.runAt),
      rows: Number.isInteger(rows) ? rows : null,
    };
  });
}
