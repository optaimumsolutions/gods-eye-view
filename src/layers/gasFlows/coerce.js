/**
 * Field hygiene for the 2017 NACEI border-crossing records
 * (docs/COMMODITIES-PLAN.md §10.7, R4.13).
 *
 * Two traps live in this file, both measured rather than imagined:
 *
 *   1. NACEI declares `Diam_Inch`, `MaxOP_psi` and `Vol_MMcfd` as
 *      `esriFieldTypeString`, and 29 of the 99 records carry the **empty
 *      string** in `Vol_MMcfd`. `Number('')` is `0`, so the obvious coercion
 *      invents a zero-capacity crossing out of a blank. An absence must stay
 *      an absence all the way to the card.
 *   2. Some owner strings can arrive double-encoded — `Sempra Gasoductos
 *      MÃ©xico` for `Sempra Gasoductos México`. The repair is a latin1→utf8
 *      reinterpretation, but a repair that silently replaces the original is
 *      indistinguishable from a repair that corrupts it, so **both strings are
 *      kept** and the raw form is shown as a dim suffix wherever they differ.
 *      Measured 2026-09-18: 0 of 99 records are mojibaked on the `f=json`
 *      route, so this is currently a no-op. It stays because a different route
 *      or a re-host can reintroduce the fault.
 *
 * Portable by rule: no Cesium, no DOM, no Node built-ins. The byte
 * reinterpretation goes through `TextDecoder`, which exists in both runtimes,
 * rather than `Buffer`, which does not.
 */

/**
 * Coerce an Esri string-typed numeric field.
 *
 * Returns `null` — never `0` — for a blank, and `null` for anything that is
 * not a single plain number, because NACEI stores multi-pipe crossings as
 * `"30/36"` and a crossing with two diameters has no one diameter. The raw
 * string survives separately for display.
 */
export function parseNumericField(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/,(?=\d{3}\b)/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Code units that only appear together when utf-8 has been read as latin1: a
 * lead byte in U+00C2–U+00C3 followed by a continuation byte in U+0080–U+00BF.
 *
 * Built from an escaped string rather than written as a regex literal because
 * the continuation range starts at U+0080, an invisible C1 control character.
 * As a literal it sits in the file as raw bytes that a later edit, re-encode
 * or copy-paste can silently mangle into something that matches nothing.
 */
const MOJIBAKE_HINT = new RegExp('[\\u00c2-\\u00c3][\\u0080-\\u00bf]');

/**
 * Undo a latin1-read-as-utf8 round trip, keeping the original either way.
 *
 * Returns `{ text, raw, repaired }`. `text` is what a card shows; `raw` is
 * what the source actually sent; `repaired` says whether they differ, which is
 * what drives the dim suffix. A string that is not mojibake, or that does not
 * survive a strict decode, comes back untouched — a failed repair must look
 * like no repair, not like a different name.
 */
export function repairMojibake(value) {
  const raw =
    typeof value === 'string' ? value : value == null ? '' : String(value);
  if (!raw || !MOJIBAKE_HINT.test(raw))
    return { text: raw, raw, repaired: false };
  for (let index = 0; index < raw.length; index += 1) {
    // A code unit above 0xff was never a byte, so the reinterpretation is meaningless.
    if (raw.charCodeAt(index) > 0xff)
      return { text: raw, raw, repaired: false };
  }
  try {
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!decoded || decoded === raw) return { text: raw, raw, repaired: false };
    return { text: decoded, raw, repaired: true };
  } catch {
    return { text: raw, raw, repaired: false };
  }
}

/** Trim a string field to `null` rather than to an empty string. */
export function trimToNull(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The 2017 design attributes, pre-formatted for display and nothing else
 * (R4.12).
 *
 * The numbers are deliberately **not** returned as numbers. The vintage gate
 * says a dataset this old may place a mark and may not carry a magnitude, and
 * the way that rule is enforced is by never putting the value in scope as a
 * number a renderer could bind to.
 *
 * `NumPipes` is here with the other three because pipe count is a physical
 * magnitude that correlates with crossing size — a mark sized by it would look
 * entirely plausible and be eight years stale. Its `0` means "not filed", not
 * "no pipes": every US-filed record carries 0 alongside a blank diameter and
 * pressure, and a crossing with zero pipes does not exist.
 *
 * What the label does and does not buy: deletion of the numeric field is the
 * real defence, and this is the second line. Each string carries
 * `design (2017)` inside it so the vintage cannot be dropped by a formatter
 * that takes the value alone, and so a number that reaches a card arrives
 * already dated. It does **not** make the magnitude unrecoverable —
 * `parseFloat('409.65 MMcf/d design (2017)')` is `409.65`. Recovering it takes
 * a deliberate parse of a string that says what it is, which is the line
 * between a mistake and a decision.
 */
export function formatDesignAttributes(attributes = {}) {
  const parts = {};
  const diameter = trimToNull(attributes.Diam_Inch);
  const pressure = trimToNull(attributes.MaxOP_psi);
  const volume = trimToNull(attributes.Vol_MMcfd);
  const pipes = Number.isFinite(attributes.NumPipes)
    ? Number(attributes.NumPipes)
    : null;
  if (diameter) parts.diameter = `${diameter} in design (2017)`;
  if (pressure) parts.maxPressure = `${pressure} psi design (2017)`;
  if (volume) parts.capacity = `${volume} MMcf/d design (2017)`;
  if (pipes !== null && pipes > 0) {
    parts.pipes = `${pipes} ${pipes === 1 ? 'pipe' : 'pipes'} filed (2017)`;
  }
  return parts;
}
