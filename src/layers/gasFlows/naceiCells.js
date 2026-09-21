/**
 * Resolve the 99 NACEI border-crossing filings into marks
 * (docs/COMMODITIES-PLAN.md §10.7, R4.21 to R4.24).
 *
 * The defect being repaired is not naming, it is **double filing**: each
 * government files the same crossing separately, under a different name, with
 * a different volume and often the opposite direction. At (31.334, −109.819)
 * Mexico files `Naco` (PEMEX, CRE, MX→US, 109.926 MMcf/d) and the United
 * States files `El Paso Natural Gas Pipeline` (US→MX, 57). Two marks there
 * would let the same crossing be counted twice.
 *
 * ── Why this is mutual cross-border pairing, and not distance clustering ──
 *
 * The obvious instrument is a proximity cluster, and it is the wrong one.
 * Measured over the live 99 records on 2026-09-18:
 *
 *   · 22 pairs of filings sit within 3 km of each other **under the same
 *     government**. Those are necessarily distinct crossings — a government
 *     does not file one crossing twice. The closest are 13 m apart (Mexico's
 *     `Reynosa- TETCO` at 350 MMcf/d and `Reynosa - TENNESSE` at 140) and
 *     26 m (the US `Cascade Natural Gas` and `Puget Sound Energy`).
 *   · Genuine cross-border duplicate pairs run from 15 m (`ANG Mainline` /
 *     `Gas Transmission Northwest`) out to at least 1,467 m
 *     (`Detroit River/Windsor 1 And 2` / `Panhandle Eastern PL`).
 *
 * Those two ranges overlap across two orders of magnitude, so **no radius
 * separates them** and any single-link cluster gets it wrong in both
 * directions at once. A 300 m single-link pass merged six groups of
 * same-government filings — collapsing four distinct US points of entry at
 * Sumas into one mark — while still drawing `Vector` / `Vector Pipeline Co`
 * (409 m) and `Bluewater` / `Bluewater` (439 m) twice.
 *
 * The asymmetry that settles the design: **over-merging is destructive and
 * under-merging is safe.** Identity comes exclusively from EIA (R4.23), and
 * the `duoarea → cellId` crosswalk is hand-verified (R4.25). If two crossings
 * wrongly share a cell, several EIA volumes resolve to one mark and are either
 * lost or summed, and R4.24 forbids summing. If one crossing wrongly keeps two
 * marks, the crosswalk simply pins the EIA volume to one of them and the other
 * stays an unjoined NACEI-only dot, which R4.26 already draws and labels.
 *
 * So the rule is deliberately conservative and structural rather than
 * threshold-tuned:
 *
 *   1. Only filings from **different governments** may pair. Same-government
 *      proximity is never merged, at any distance.
 *   2. Pairing is **mutual nearest neighbour** — A pairs with B only when B is
 *      A's nearest cross-border filing and A is B's. That makes it 1:1 by
 *      construction, so there is no transitive chaining and no cell can ever
 *      grow past two filings.
 *
 * Measured yield, mutual cross-border pairs by radius:
 *
 *     radius     pairs   marks   widest pair
 *      300 m       16      83        299 m
 *      500 m       26      73        487 m
 *     1000 m       37      62        968 m
 *     1500 m       39      60      1,467 m   ← chosen
 *     3000 m       42      57      2,971 m
 *
 * 1,500 m is where the pair list stops adding obviously-correct matches: every
 * pair it admits reads as one pipe filed twice, several confirmed by shared
 * operator names (Kinder Morgan / Kinder Morgan at 337 m, Bluewater /
 * Bluewater at 439 m, Rosarito / North Baja at 578 m, Ojinaga-El Encino /
 * Trans-Pecos at 711 m). The sweep is pinned by a test so upstream drift that
 * moves it fails the build instead of quietly changing the map.
 *
 * Portable by rule: no Cesium, no DOM, no Node built-ins.
 */

import {
  formatDesignAttributes,
  repairMojibake,
  trimToNull,
} from './coerce.js';

/** Chosen from the measured sweep above. Widest admitted pair is 1,467 m. */
export const PAIR_RADIUS_M = 1500;

const EARTH_RADIUS_M = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMetres(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * An id derived from the mark's own position, so it does not depend on
 * iteration order or on an upstream OBJECTID that a re-upload can renumber.
 *
 * It is **content-addressed, not permanent**: the id of a paired mark is taken
 * from the midpoint of its two filings, so if upstream nudges a coordinate or
 * the pairing changes, the id changes with it. That is the intended trade —
 * an id that silently keeps pointing at a moved crossing would be worse — but
 * it means ids must not be persisted anywhere outside a rebuild, and the
 * hand-verified crosswalk (R4.25) has to be re-checked whenever the manifest
 * counts move.
 */
export function cellIdFor(latitude, longitude) {
  const ns = latitude >= 0 ? 'n' : 's';
  const ew = longitude >= 0 ? 'e' : 'w';
  return `gx${ns}${Math.abs(latitude).toFixed(4)}${ew}${Math.abs(longitude).toFixed(4)}`;
}

/** Country strings arrive spelled out; normalise for keys, keep the original for display. */
export function normaliseCountry(value) {
  const text = String(value ?? '')
    .trim()
    .toUpperCase();
  if (text === 'UNITED STATES' || text === 'USA' || text === 'US') return 'US';
  if (text === 'CANADA' || text === 'CA') return 'CA';
  if (text === 'MEXICO' || text === 'MÉXICO' || text === 'MX') return 'MX';
  return text || null;
}

/** Direction-insensitive pair key, because the two governments file opposite directions. */
export function countryPairKey(fromCountry, toCountry) {
  const pair = [normaliseCountry(fromCountry), normaliseCountry(toCountry)]
    .filter(Boolean)
    .sort();
  return pair.length ? pair.join('|') : null;
}

/** Collapse runs of whitespace — several Owner strings carry embedded newlines. */
const flatten = (value) => {
  const text = trimToNull(value);
  return text === null ? null : text.replace(/\s+/g, ' ');
};

/**
 * `Number(null)` is `0` and `Number('')` is `0`, so the obvious coercion puts a
 * missing crossing on null island off the coast of Ghana — a coordinate that
 * is finite, plottable, and wrong. A missing coordinate must stay missing so
 * R4.7 can list it as OFF-MAP with its number intact.
 */
function toCoordinate(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * One NACEI record, reduced to what a mark is allowed to know.
 *
 * All four 2017 magnitudes — `Diam_Inch`, `MaxOP_psi`, `Vol_MMcfd` and
 * `NumPipes` — leave this function as pre-formatted strings only (R4.12).
 * None survives as a number, so there is no numeric variable in scope for a
 * renderer to bind a size or a colour to. `NumPipes` is included in that rule
 * because pipe count correlates with crossing size: a mark sized by it would
 * look entirely plausible and be eight years stale.
 */
export function normaliseFiling(attributes, geometry = null) {
  const latitude = toCoordinate(attributes.Latitude);
  const longitude = toCoordinate(attributes.Longitude);
  if (latitude === null || longitude === null) return null;
  // No North American land border runs through 0°N 0°E.
  if (latitude === 0 && longitude === 0) return null;
  const owner = repairMojibake(flatten(attributes.Owner) ?? '');
  const pipeline = repairMojibake(flatten(attributes.Pipeline) ?? '');
  return {
    objectId: attributes.OBJECTID ?? null,
    filedBy: normaliseCountry(attributes.Country),
    filedByLabel: trimToNull(attributes.Country),
    pipeline: pipeline.text || null,
    pipelineRaw: pipeline.repaired ? pipeline.raw : null,
    owner: owner.text || null,
    ownerRaw: owner.repaired ? owner.raw : null,
    city: flatten(attributes.City),
    county: flatten(attributes.County),
    stateProv: flatten(attributes.StateProv),
    fromCountry: normaliseCountry(attributes.FrmCountry),
    fromState: flatten(attributes.FrmState),
    toCountry: normaliseCountry(attributes.ToCountry),
    toState: flatten(attributes.ToState),
    source: flatten(attributes.Source),
    period: attributes.Period == null ? null : String(attributes.Period),
    latitude,
    longitude,
    geometryAgrees:
      geometry == null
        ? null
        : Math.abs(geometry.y - latitude) < 1e-4 &&
          Math.abs(geometry.x - longitude) < 1e-4,
    design: formatDesignAttributes(attributes),
  };
}

/**
 * Codepoint comparison, never `localeCompare`: collation under ICU's default
 * locale varies by machine, and this order decides an emitted byte stream.
 */
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Deterministic order inside a mark: filing country, then pipeline, then id.
 *
 * Fields are compared one at a time rather than joined with a separator
 * character. A separator has to be something that cannot occur in the data,
 * which pushes towards a control character — and a literal control byte in a
 * source file is exactly what made this repo's build script register as binary
 * to Git once already.
 */
const filingOrder = (a, b) =>
  byCodepoint(String(a.filedBy), String(b.filedBy)) ||
  byCodepoint(String(a.pipeline), String(b.pipeline)) ||
  (a.objectId ?? 0) - (b.objectId ?? 0);

/**
 * Pair each filing with its mutual nearest cross-border neighbour.
 *
 * Returns an array of groups of one or two filings. Two filings group only
 * when each is the other's nearest filing from a different government and they
 * are within `radiusMetres`. Mutuality makes the relation 1:1, so a group can
 * never exceed two members and the result does not depend on input order.
 */
export function pairCrossBorderFilings(
  filings,
  { radiusMetres = PAIR_RADIUS_M } = {},
) {
  const nearest = filings.map((filing, index) => {
    let best = null;
    filings.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      // A government does not file the same crossing twice.
      if (other.filedBy === filing.filedBy) return;
      const metres = haversineMetres(filing, other);
      if (metres > radiusMetres) return;
      if (
        !best ||
        metres < best.metres ||
        // Deterministic tie-break, so an exact distance tie cannot depend on
        // which record happened to arrive first.
        (metres === best.metres &&
          (other.objectId ?? 0) < (filings[best.index].objectId ?? 0))
      ) {
        best = { index: otherIndex, metres };
      }
    });
    return best;
  });

  const groups = [];
  const taken = new Set();
  filings.forEach((filing, index) => {
    if (taken.has(index)) return;
    const candidate = nearest[index];
    const mutual =
      candidate &&
      nearest[candidate.index] &&
      nearest[candidate.index].index === index;
    if (mutual && !taken.has(candidate.index)) {
      taken.add(index);
      taken.add(candidate.index);
      groups.push([filing, filings[candidate.index]]);
    } else {
      taken.add(index);
      groups.push([filing]);
    }
  });
  return groups;
}

/** Separation between the filings on a mark; 0 for a single filing. */
export function spreadMetres(filings) {
  let widest = 0;
  for (let i = 0; i < filings.length; i += 1) {
    for (let j = i + 1; j < filings.length; j += 1) {
      widest = Math.max(widest, haversineMetres(filings[i], filings[j]));
    }
  }
  return widest;
}

/**
 * Group raw NACEI features into border marks — one mark per crossing we can
 * prove, every filing kept verbatim.
 *
 * Volumes are never summed, averaged, or reconciled to a "best" value (R4.24).
 * Summing Naco's 109.926 and El Paso's 57 would invent a 167 MMcf/d crossing
 * that nobody filed, and the analyst is entitled to see that two governments
 * disagree about the direction of the same pipe.
 */
export function groupNaceiByCell(
  features,
  { radiusMetres = PAIR_RADIUS_M } = {},
) {
  const filings = [];
  const dropped = [];
  for (const feature of features) {
    const attributes = feature?.attributes ?? feature;
    const filing = normaliseFiling(attributes, feature?.geometry ?? null);
    if (filing) filings.push(filing);
    else dropped.push(attributes?.OBJECTID ?? null);
  }

  const cells = pairCrossBorderFilings(filings, { radiusMetres }).map(
    (members) => {
      const ordered = [...members].sort(filingOrder);
      const latitude =
        ordered.reduce((sum, f) => sum + f.latitude, 0) / ordered.length;
      const longitude =
        ordered.reduce((sum, f) => sum + f.longitude, 0) / ordered.length;
      const countries = [
        ...new Set(ordered.map((f) => f.filedBy).filter(Boolean)),
      ].sort();
      const pairs = [
        ...new Set(
          ordered
            .map((f) => countryPairKey(f.fromCountry, f.toCountry))
            .filter(Boolean),
        ),
      ].sort();
      const directions = [
        ...new Set(ordered.map((f) => `${f.fromCountry}->${f.toCountry}`)),
      ].sort();
      // Only a contradiction BETWEEN governments counts. One government filing
      // two directions would be two different pipes, not a disagreement — and
      // mutual pairing means a mark never holds two filings from one country
      // anyway, so this is exactly "the two of them disagree".
      const contested = countries.length > 1 && directions.length > 1;
      return {
        cellId: cellIdFor(latitude, longitude),
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        countryPair: pairs.length === 1 ? pairs[0] : pairs.join(' / '),
        filedBy: countries,
        directionsFiled: directions,
        directionsDisagree: contested,
        filingCount: ordered.length,
        spreadMetres: Number(spreadMetres(ordered).toFixed(1)),
        states: [
          ...new Set(ordered.map((f) => f.stateProv).filter(Boolean)),
        ].sort(),
        cities: [...new Set(ordered.map((f) => f.city).filter(Boolean))].sort(),
        filings: ordered,
      };
    },
  );

  cells.sort((a, b) => byCodepoint(a.cellId, b.cellId));
  return { cells, dropped };
}
