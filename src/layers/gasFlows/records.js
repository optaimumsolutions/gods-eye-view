/**
 * Bundled gas-infrastructure records: normalization, the vintage stamps and
 * the guards that make the vintage gate structural rather than remembered
 * (docs/COMMODITIES-PLAN.md §10.7, R4.11 to R4.20, R4.34 to R4.35).
 *
 * Portable: no Cesium, no browser globals, so the panel, the cards, the build
 * scripts and the tests all read the same numbers the same way.
 *
 * The organising rule of this layer is a hard partition between what is
 * **measured** and what is **merely mapped**. Exactly one thing in row 4 is a
 * real, current, directional number: EIA's monthly volume at a named point of
 * entry or exit. January 2020 geometry and 2017 NACEI attributes place marks
 * and nothing else.
 *
 * That partition is not enforced by convention here. It is enforced twice:
 * the magnitudes are deleted at build time, so there is no variable in scope
 * to bind an encoding to; and `assertEiaVolumeRecord` **throws** when handed
 * anything that is not a current EIA volume, so wiring a 2017 capacity to a
 * pixel is a failing test rather than a review catch.
 */

import { createObservation } from '../commodities/observation.js';

export const GAS_FLOWS_LAYER_ID = 'commodity-gas-flows';

/** The three epistemic grades. Nothing outside `ink` may vary in size (R4.34). */
export const GRADE = Object.freeze({
  INK: 'ink',
  GRAPHITE: 'graphite',
  PENCIL: 'pencil',
});

/**
 * Vintages, hard-coded with their evidence, never read from a service.
 *
 * The pipeline service advertises `dataLastEditDate` 2025-07-01 and that is a
 * re-upload stamp, not a data date — believing it would present five-year-old
 * geometry as three months old.
 */
export const NETWORK_VINTAGE = Object.freeze({
  period: '2020-01',
  label: 'JAN-2020',
  observedAt: '2020-01-01T00:00:00Z',
  publishedAt: '2020-04-27T00:00:00Z',
  evidence:
    'shapefile NaturalGas_Pipelines_US_202001, .shp.xml CreaDate 20200427',
  rejected:
    'service editingInfo.dataLastEditDate 2025-07-01 is a re-upload stamp and is ignored',
});

export const CROSSINGS_VINTAGE = Object.freeze({
  period: '2017',
  label: 'NACEI 2017',
  observedAt: '2017-01-01T00:00:00Z',
  publishedAt: '2017-08-01T00:00:00Z',
  evidence: 'Period field 2017 and 201706; NACEI FTP stamps stop at 201708',
});

/** Anything older than this contributes geometry only (R4.11). */
export const VINTAGE_GATE_MONTHS = 24;

/** The stamp that is on screen whenever network geometry is (R4.39). */
export const NETWORK_STAMP = `NETWORK · EIA TRANSMISSION · ${NETWORK_VINTAGE.label} · GEOMETRY ONLY · NO FLOW`;

/** Months between two instants, used to apply the gate rather than assume it. */
export function monthsOld(observedAt, now = Date.now()) {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return Infinity;
  return (now - observed) / (30.436875 * 86_400_000);
}

/** True when a dataset is old enough that it may place a mark and carry no number. */
export function isGeometryOnly(observedAt, now = Date.now()) {
  return monthsOld(observedAt, now) > VINTAGE_GATE_MONTHS;
}

/**
 * The guard. Throws unless the record is a current EIA point-of-entry volume.
 *
 * Every function that turns a record into a pixel size, a pupil size or a band
 * status calls this first. Handed a NACEI filing or a network system it
 * throws, which is what makes "capacity must never drive a magnitude" a
 * failing test instead of a comment.
 */
export function assertEiaVolumeRecord(record, context = 'encode') {
  if (!record || typeof record !== 'object') {
    throw new TypeError(
      `${context}: expected an EIA volume record, received ${record === null ? 'null' : typeof record}`,
    );
  }
  if (record.source !== 'eia') {
    throw new TypeError(
      `${context}: refusing to encode a magnitude from source "${record.source ?? 'unknown'}" — ` +
        'only a current EIA point-of-entry volume may vary size or hue (R4.34)',
    );
  }
  if (typeof record.period !== 'string' || !record.period) {
    throw new TypeError(
      `${context}: an EIA volume record must carry the period it was filed for`,
    );
  }
  const { inMMcf, outMMcf } = record;
  const filed = [inMMcf, outMMcf].filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
  if (!filed.length) {
    throw new TypeError(
      `${context}: no filed volume on ${record.duoarea ?? 'record'} for ${record.period} — ` +
        'a null is not a zero and must not be encoded as one (R4.6)',
    );
  }
  return record;
}

const frozen = (value) => Object.freeze(value);

/**
 * `Object.freeze` is shallow, and the data this layer must not have rewritten
 * lives at the bottom: the `[lon, lat]` pairs inside a part, and the `design`
 * object that is the sole carrier of the 2017 strings. Freezing the container
 * and stopping one level above the values is decoration.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

/** One bundled network system: geometry, a count that is an artifact, and no magnitude. */
function normaliseSystem(system) {
  const parts = (system.parts ?? []).filter(
    (part) => Array.isArray(part) && part.length >= 2,
  );
  if (!parts.length) return null;
  return frozen({
    id: system.id,
    grade: GRADE.PENCIL,
    source: 'eia-geometry',
    // A company, not a pipeline name, and never a map label (R4.17).
    operator: system.operator ?? null,
    typePipe: system.typePipe ?? null,
    status: system.status ?? null,
    // Retained so a card can say the number is a digitizing artifact, never so
    // anything can be sized, widened or ranked by it (R4.16).
    sourceFeatures: system.sourceFeatures ?? null,
    partCount: parts.length,
    parts: deepFreeze(parts.map((part) => part.map((pair) => [...pair]))),
  });
}

export function normaliseGasNetwork(payload) {
  if (!payload || !Array.isArray(payload.systems)) return null;
  const systems = payload.systems.map(normaliseSystem).filter(Boolean);
  if (!systems.length) return null;
  // Anything normalisation refused is counted here rather than vanishing
  // between a payload count and a shorter array. A panel that prints
  // `counts.systems` must not be able to name more systems than exist.
  const droppedSystems = payload.systems.length - systems.length;
  return frozen({
    layerId: GAS_FLOWS_LAYER_ID,
    kind: 'network',
    grade: GRADE.PENCIL,
    vintage: NETWORK_VINTAGE,
    stamp: NETWORK_STAMP,
    geometryOnly: true,
    pickable: false,
    counts: frozen({
      ...payload.counts,
      // Derived from what survived, never trusted from the payload.
      systems: systems.length,
      operators: new Set(systems.map((system) => system.operator)).size,
      upstreamOperators: payload.counts?.operators ?? null,
      droppedAtNormalise: droppedSystems,
    }),
    systems: frozen(systems),
    observation: createObservation({
      observedAt: NETWORK_VINTAGE.observedAt,
      publishedAt: NETWORK_VINTAGE.publishedAt,
      freshnessClass: 'published',
      source: 'EIA transmission linework',
      headline: NETWORK_STAMP,
    }),
  });
}

/** One border crossing: a place, every filing verbatim, and no aggregate. */
function normaliseCrossing(cell) {
  if (!cell || typeof cell.cellId !== 'string') return null;
  if (!Number.isFinite(cell.latitude) || !Number.isFinite(cell.longitude))
    return null;
  return frozen({
    cellId: cell.cellId,
    // Until an EIA filing joins to it this is mapped-only, not silent-in-roster.
    grade: GRADE.PENCIL,
    source: 'nacei',
    latitude: cell.latitude,
    longitude: cell.longitude,
    countryPair: cell.countryPair ?? null,
    filedBy: frozen([...(cell.filedBy ?? [])]),
    directionsFiled: frozen([...(cell.directionsFiled ?? [])]),
    directionsDisagree: Boolean(cell.directionsDisagree),
    // Counted from the rows actually kept, never taken from the payload. This
    // is the one number a dossier header prints, and it must not be able to
    // disagree with the list underneath it.
    filingCount: (cell.filings ?? []).length,
    spreadMetres: cell.spreadMetres ?? 0,
    states: frozen([...(cell.states ?? [])]),
    cities: frozen([...(cell.cities ?? [])]),
    // Sibling rows, verbatim. Never summed, averaged, or resolved to a
    // preferred filing — two governments disagreeing about the direction of
    // one pipe is a fact to show, not a conflict to fix (R4.24).
    filings: deepFreeze((cell.filings ?? []).map((filing) => ({ ...filing }))),
  });
}

export function normaliseGasCrossings(payload) {
  if (!payload || !Array.isArray(payload.cells)) return null;
  const crossings = payload.cells.map(normaliseCrossing).filter(Boolean);
  if (!crossings.length) return null;
  const droppedCells = payload.cells.length - crossings.length;
  return frozen({
    layerId: GAS_FLOWS_LAYER_ID,
    kind: 'crossings',
    grade: GRADE.PENCIL,
    vintage: CROSSINGS_VINTAGE,
    geometryOnly: true,
    join: frozen({ ...payload.join }),
    counts: frozen({
      ...payload.counts,
      cells: crossings.length,
      filings: crossings.reduce(
        (sum, crossing) => sum + crossing.filingCount,
        0,
      ),
      droppedAtNormalise: droppedCells,
    }),
    crossings: frozen(crossings),
    byCellId: frozen(
      new Map(crossings.map((crossing) => [crossing.cellId, crossing])),
    ),
    observation: createObservation({
      observedAt: CROSSINGS_VINTAGE.observedAt,
      publishedAt: CROSSINGS_VINTAGE.publishedAt,
      freshnessClass: 'published',
      source: 'NACEI layer 2',
      headline: `GEOMETRY ONLY · ${CROSSINGS_VINTAGE.label} · NO EIA FILING`,
    }),
  });
}

/** The literal first line of a card for a crossing with no EIA filing (R4.26). */
export function geometryOnlyHeadline() {
  return `GEOMETRY ONLY · ${CROSSINGS_VINTAGE.label} · NO EIA FILING`;
}
