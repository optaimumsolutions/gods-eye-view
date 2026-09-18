/**
 * The shared observation contract for commodity layers
 * (docs/COMMODITIES-PLAN.md §7.6.1 to §7.6.3). One record type and one stamp,
 * so every commodity layer states the age of its numbers the same way: R3's
 * four timestamps, R2's three freshness classes, and exactly one formatted
 * string per class. Portable by rule — no Cesium, no DOM, no browser globals —
 * so the layers, the panel and the hover service can all import it.
 *
 * Lifted verbatim from the interim copy in `src/layers/ports/dossierSections.js`
 * (commit 2ad4132, row 9 milestone 6), which adopted these signatures ahead of
 * row 1 so the port dossier could stamp itself from one record. Same names,
 * same behaviour, so that copy collapses to an import of this module when the
 * branches meet and nothing else has to change.
 */

function parseTime(value) {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

/** Age in one unit, buckets s, m, h, d (§7.6.3). */
export function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

/** R2: live under 15 minutes, daily under 24 hours, else published. */
export function freshnessClassFor(observedAt, now = Date.now()) {
  const ms = parseTime(observedAt);
  if (ms == null) return 'published';
  const age = now - ms;
  if (age < 15 * 60_000) return 'live';
  if (age < 24 * 3_600_000) return 'daily';
  return 'published';
}

/**
 * One frozen reading with its own timestamps (R3). `observedAt` is required;
 * `fetchedAt` defaults to now; `validAt` is for forecasts only. An explicit
 * `freshnessClass` wins over the derived one, so a static dataset stays
 * `published` even when it was fetched a minute ago.
 */
export function createObservation({
  observedAt,
  validAt = null,
  publishedAt = null,
  fetchedAt = null,
  freshnessClass = null,
  source = null,
  headline = null,
} = {}) {
  const observed = parseTime(observedAt);
  if (observed == null) throw new TypeError('observedAt is required');
  const valid = validAt == null ? null : parseTime(validAt);
  const published = publishedAt == null ? null : parseTime(publishedAt);
  const fetched = fetchedAt == null ? Date.now() : parseTime(fetchedAt);
  if (
    (validAt != null && valid == null) ||
    (publishedAt != null && published == null) ||
    fetched == null
  )
    throw new TypeError('observation dates must parse');
  return Object.freeze({
    observedAt: new Date(observed).toISOString(),
    validAt: valid == null ? null : new Date(valid).toISOString(),
    publishedAt: published == null ? null : new Date(published).toISOString(),
    fetchedAt: new Date(fetched).toISOString(),
    freshnessClass: freshnessClass || freshnessClassFor(observed, fetched),
    source,
    headline,
  });
}

/** One string per class: `observed 12:04:31Z · 38s ago`, `issued 12:00Z · 3h ago`, `as of 2026-09-13 · 4d lag`. */
export function formatAsOf(observation, now = Date.now()) {
  const observed = parseTime(observation?.observedAt);
  if (observed == null) return 'as of n/a';
  const date = new Date(observed);
  const age = now - observed;
  switch (observation.freshnessClass) {
    case 'live':
      return `observed ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z · ${formatAge(age)} ago`;
    case 'daily': {
      if (observation.validAt) {
        const valid = new Date(parseTime(observation.validAt));
        return `issued ${pad(date.getUTCHours())}Z ${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} · valid ${pad(valid.getUTCMonth() + 1)}-${pad(valid.getUTCDate())}`;
      }
      return `issued ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z · ${formatAge(age)} ago`;
    }
    default: {
      const lagDays = Math.max(0, Math.floor(age / 86_400_000));
      return `as of ${date.toISOString().slice(0, 10)} · ${lagDays}d lag`;
    }
  }
}
