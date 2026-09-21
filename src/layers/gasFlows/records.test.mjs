import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROSSINGS_VINTAGE,
  GRADE,
  NETWORK_STAMP,
  NETWORK_VINTAGE,
  VINTAGE_GATE_MONTHS,
  assertEiaVolumeRecord,
  geometryOnlyHeadline,
  isGeometryOnly,
  monthsOld,
  normaliseGasCrossings,
  normaliseGasNetwork,
} from './records.js';

const NOW = Date.parse('2026-09-18T00:00:00Z');

const NETWORK_PAYLOAD = {
  counts: { sourceFeatures: 32892, systems: 235, operators: 230 },
  systems: [
    {
      id: 'sys-000',
      operator: 'Iroquois Gas Trans Co',
      typePipe: 'Interstate',
      status: 'Operating',
      sourceFeatures: 2027,
      partCount: 2,
      parts: [
        [
          [-73.5, 41.2],
          [-73.4, 41.3],
        ],
        [
          [-73.3, 41.4],
          [-73.2, 41.5],
        ],
      ],
    },
    {
      id: 'sys-001',
      operator: 'Enable Gas Transmission',
      typePipe: 'Intrastate',
      status: 'Operating',
      sourceFeatures: 773,
      partCount: 1,
      parts: [
        [
          [-96.0, 35.0],
          [-95.9, 35.1],
        ],
      ],
    },
    // A system whose geometry degenerated; it must not reach the renderer.
    {
      id: 'sys-002',
      operator: 'Nowhere Pipe Co',
      typePipe: 'Interstate',
      status: 'Operating',
      parts: [[[-1, 1]]],
    },
  ],
};

const CROSSINGS_PAYLOAD = {
  join: {
    method: 'single-link clustering on great-circle distance',
    radiusMetres: 300,
  },
  counts: { filings: 99, cells: 71, multiFilingCells: 20 },
  cells: [
    {
      cellId: 'gxn31.3341w109.8191',
      latitude: 31.334087,
      longitude: -109.819073,
      countryPair: 'MX|US',
      filedBy: ['MX', 'US'],
      directionsFiled: ['MX->US', 'US->MX'],
      directionsDisagree: true,
      filingCount: 2,
      spreadMetres: 75.3,
      states: ['Arizona', 'Sonora'],
      cities: ['Naco'],
      filings: [
        {
          objectId: 2,
          pipeline: 'Naco',
          design: { capacity: '109.926 MMcf/d design (2017)' },
        },
        {
          objectId: 50,
          pipeline: 'El Paso Natural Gas Pipeline',
          design: { capacity: '57 MMcf/d design (2017)' },
        },
      ],
    },
    {
      cellId: 'gxn49.0005w116.1860',
      latitude: 49.000528,
      longitude: -116.186046,
      countryPair: 'CA|US',
      filedBy: ['CA', 'US'],
      directionsFiled: ['CA->US', 'US->CA'],
      directionsDisagree: true,
      filingCount: 2,
      spreadMetres: 15.1,
      states: ['British Columbia', 'Idaho'],
      cities: ['Eastport', 'Kingsgate'],
      filings: [
        { objectId: 22, pipeline: 'ANG Mainline' },
        { objectId: 57, pipeline: 'Gas Transmission Northwest LLC' },
      ],
    },
    { cellId: 'broken', latitude: null, longitude: null, filings: [] },
  ],
};

test('the vintage gate is applied, not assumed', () => {
  assert.equal(VINTAGE_GATE_MONTHS, 24);
  // Measured against the build date these records were bundled on.
  assert.ok(monthsOld(NETWORK_VINTAGE.observedAt, NOW) > 24);
  assert.ok(monthsOld(CROSSINGS_VINTAGE.observedAt, NOW) > 24);
  assert.equal(isGeometryOnly(NETWORK_VINTAGE.observedAt, NOW), true);
  assert.equal(isGeometryOnly(CROSSINGS_VINTAGE.observedAt, NOW), true);
  // A genuinely recent dataset would not be gated.
  assert.equal(isGeometryOnly('2026-06-01T00:00:00Z', NOW), false);
  assert.equal(isGeometryOnly('not a date', NOW), true);
});

test('the network vintage is hard-coded and names the claim it rejects', () => {
  assert.equal(NETWORK_VINTAGE.period, '2020-01');
  assert.match(NETWORK_VINTAGE.evidence, /NaturalGas_Pipelines_US_202001/);
  assert.match(NETWORK_VINTAGE.rejected, /2025-07-01/);
  assert.equal(
    NETWORK_STAMP,
    'NETWORK · EIA TRANSMISSION · JAN-2020 · GEOMETRY ONLY · NO FLOW',
  );
});

test('assertEiaVolumeRecord accepts a current EIA filing', () => {
  const record = {
    source: 'eia',
    duoarea: 'YSUMS-NCA',
    period: '2026-06',
    inMMcf: 27197,
    outMMcf: 125,
  };
  assert.equal(assertEiaVolumeRecord(record), record);
  // One direction filed is enough; the other being null is an absence, not a zero.
  assert.doesNotThrow(() =>
    assertEiaVolumeRecord({
      source: 'eia',
      period: '2026-06',
      inMMcf: null,
      outMMcf: 55042,
    }),
  );
});

test('assertEiaVolumeRecord throws on anything that is merely mapped', () => {
  // This is the whole vintage gate: a 2017 capacity cannot reach a pixel,
  // because the function that turns a record into a size refuses the record.
  const nacei = {
    source: 'nacei',
    cellId: 'gxn31.3341w109.8191',
    design: { capacity: '109.926 MMcf/d design (2017)' },
  };
  const network = {
    source: 'eia-geometry',
    id: 'sys-000',
    sourceFeatures: 2027,
  };
  assert.throws(
    () => assertEiaVolumeRecord(nacei),
    /only a current EIA point-of-entry volume/,
  );
  assert.throws(
    () => assertEiaVolumeRecord(network),
    /only a current EIA point-of-entry volume/,
  );
  assert.throws(
    () => assertEiaVolumeRecord(null),
    /expected an EIA volume record/,
  );
  assert.throws(
    () => assertEiaVolumeRecord(undefined),
    /expected an EIA volume record/,
  );
  assert.throws(
    () => assertEiaVolumeRecord('55042'),
    /expected an EIA volume record/,
  );
});

test('assertEiaVolumeRecord refuses a filing with no period and a null-only volume', () => {
  assert.throws(
    () => assertEiaVolumeRecord({ source: 'eia', inMMcf: 1 }),
    /must carry the period/,
  );
  assert.throws(
    () =>
      assertEiaVolumeRecord({
        source: 'eia',
        duoarea: 'YNIA-NCA',
        period: '2026-06',
        inMMcf: null,
        outMMcf: null,
      }),
    /a null is not a zero/,
  );
});

test('normaliseGasNetwork grades everything pencil and refuses to be pickable', () => {
  const snapshot = normaliseGasNetwork(NETWORK_PAYLOAD);
  assert.equal(snapshot.grade, GRADE.PENCIL);
  assert.equal(snapshot.pickable, false);
  assert.equal(snapshot.geometryOnly, true);
  assert.equal(snapshot.observation.freshnessClass, 'published');
  assert.equal(snapshot.observation.observedAt, '2020-01-01T00:00:00.000Z');
  // The degenerate single-point system never reaches the renderer.
  assert.equal(snapshot.systems.length, 2);
  for (const system of snapshot.systems)
    assert.equal(system.grade, GRADE.PENCIL);
});

test('normaliseGasNetwork exposes no magnitude a renderer could bind to', () => {
  const [system] = normaliseGasNetwork(NETWORK_PAYLOAD).systems;
  for (const key of [
    'diameter',
    'capacity',
    'pressure',
    'throughput',
    'width',
    'volume',
    'length',
  ]) {
    assert.equal(
      system[key],
      undefined,
      `network system must not expose ${key}`,
    );
  }
  // The feature count survives so a card can call it an artifact — and the
  // guard makes it unusable as a magnitude anyway.
  assert.equal(system.sourceFeatures, 2027);
  assert.throws(() => assertEiaVolumeRecord(system));
});

test('normaliseGasNetwork freezes the snapshot so a later pass cannot enrich it', () => {
  const snapshot = normaliseGasNetwork(NETWORK_PAYLOAD);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.systems));
  assert.ok(Object.isFrozen(snapshot.systems[0]));
  assert.throws(() => {
    'use strict';
    snapshot.systems[0].operator = 'Somebody Else';
  }, TypeError);
});

test('normaliseGasCrossings keeps both filings and invents no total', () => {
  const snapshot = normaliseGasCrossings(CROSSINGS_PAYLOAD);
  assert.equal(
    snapshot.crossings.length,
    2,
    'the coordinate-less cell is dropped',
  );
  const naco = snapshot.byCellId.get('gxn31.3341w109.8191');
  assert.equal(naco.filingCount, 2);
  assert.equal(naco.directionsDisagree, true);
  assert.equal(naco.grade, GRADE.PENCIL);
  const serialised = JSON.stringify(naco);
  assert.ok(!serialised.includes('166.926'));
  for (const key of ['totalCapacity', 'capacity', 'netMMcf', 'volume']) {
    assert.equal(naco[key], undefined, `crossing must not expose ${key}`);
  }
});

test('normaliseGasCrossings stamps the published class and the geometry-only headline', () => {
  const snapshot = normaliseGasCrossings(CROSSINGS_PAYLOAD);
  assert.equal(snapshot.observation.freshnessClass, 'published');
  assert.equal(snapshot.observation.headline, geometryOnlyHeadline());
  assert.equal(
    geometryOnlyHeadline(),
    'GEOMETRY ONLY · NACEI 2017 · NO EIA FILING',
  );
});

test('both normalisers reject a malformed payload rather than rendering an empty layer', () => {
  for (const bad of [null, undefined, {}, { systems: null }, { systems: [] }]) {
    assert.equal(normaliseGasNetwork(bad), null);
  }
  for (const bad of [null, undefined, {}, { cells: null }, { cells: [] }]) {
    assert.equal(normaliseGasCrossings(bad), null);
  }
});
