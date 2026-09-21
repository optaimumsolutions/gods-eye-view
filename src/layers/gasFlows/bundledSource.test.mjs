import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBundledGasSource } from './bundledSource.js';
import {
  assertEiaVolumeRecord,
  normaliseGasCrossings,
  normaliseGasNetwork,
} from './records.js';

const dataDir = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'data',
  'local_data',
  'eia_energy',
);
const readBundle = (name) => readFileSync(path.join(dataDir, name), 'utf8');
const manifest = JSON.parse(readBundle('source.json'));
const entryFor = (name) => manifest.files.find((file) => file.path === name);

/** A fetch that serves the committed bundles from disk. */
const diskFetch = (url) => {
  const name = String(url).split('/').pop();
  try {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => JSON.parse(readBundle(name)),
    });
  } catch {
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }
};

test('source.json sha256 matches the committed bytes', () => {
  // Goal 7: the manifest is checkable, not decorative. A hand-edited bundle
  // or a partial rebuild fails here rather than at a demo.
  for (const name of ['gas-network.json', 'gas-crossings.json']) {
    const text = readBundle(name);
    const entry = entryFor(name);
    assert.ok(entry, `${name} is missing from source.json`);
    assert.equal(
      createHash('sha256').update(text).digest('hex'),
      entry.sha256,
      `${name} sha256 drifted`,
    );
    assert.equal(
      Buffer.byteLength(text),
      entry.bytes,
      `${name} byte count drifted`,
    );
  }
});

test('every bundled file records its vintage, its evidence and its host', () => {
  for (const file of manifest.files) {
    assert.ok(file.vintage, `${file.path} has no vintage`);
    assert.ok(
      file.vintage_evidence,
      `${file.path} states no evidence for its vintage`,
    );
    assert.ok(file.hosted_by, `${file.path} does not record who hosts it`);
    assert.ok(
      file.upstream_sha256,
      `${file.path} has no upstream archive hash`,
    );
  }
  // The pipeline copy is an ArcGIS hosted view, not an eia.gov endpoint, and
  // the manifest names the actual owner rather than guessing at one.
  assert.match(
    entryFor('gas-network.json').hosted_by,
    /Federal_User_Community/,
  );
  assert.match(
    entryFor('gas-network.json').vintage_claim_rejected,
    /2025-07-01/,
  );
  // The view filters out the 69 Gathering features the source shapefile carries.
  assert.match(entryFor('gas-network.json').coverage_hole, /69 Gathering/);
});

test('the committed network bundle is the measured one', () => {
  const snapshot = normaliseGasNetwork(
    JSON.parse(readBundle('gas-network.json')),
  );
  assert.equal(snapshot.counts.sourceFeatures, 32892);
  // Derived from what survived, with the upstream figure kept beside it so a
  // card can never name more operators than the map draws.
  assert.equal(snapshot.counts.upstreamOperators, 230);
  assert.equal(snapshot.counts.operators, 229);
  assert.equal(snapshot.counts.droppedAtNormalise, 0);
  // 235 distinct Operator|TYPEPIPE|Status keys, of which one — Tallgrass
  // Interstate Gas Transmission, a single feature — has no geometry left at
  // 11 m rounding. It is dropped and named rather than emitted empty.
  assert.equal(snapshot.counts.dissolvedKeys, 235);
  assert.equal(snapshot.counts.systems, 234);
  assert.equal(snapshot.systems.length, 234);
  assert.equal(snapshot.counts.emptiedSystems.length, 1);
  assert.equal(
    snapshot.counts.emptiedSystems[0].operator,
    'Tallgrass Interstate Gas Transmission',
  );
  assert.equal(snapshot.vintage.period, '2020-01');
  assert.equal(snapshot.pickable, false);
});

test('the committed network bundle carries exactly one status and two pipe types', () => {
  const payload = JSON.parse(readBundle('gas-network.json'));
  // If either of these ever gains a value, this layer could finally say
  // something about change — and that is a design decision for a person.
  assert.deepEqual(payload.statuses, ['Operating']);
  assert.deepEqual(payload.typePipes, ['Interstate', 'Intrastate']);
});

test('the committed crossings bundle resolves 99 filings to 60 marks', () => {
  const snapshot = normaliseGasCrossings(
    JSON.parse(readBundle('gas-crossings.json')),
  );
  assert.equal(snapshot.counts.filings, 99);
  assert.equal(snapshot.counts.cells, 60);
  assert.equal(snapshot.counts.multiFilingCells, 39);
  assert.equal(snapshot.crossings.length, 60);
  assert.equal(snapshot.join.radiusMetres, 1500);
  assert.equal(snapshot.join.method, 'mutual nearest cross-border neighbour');
  assert.equal(snapshot.counts.droppedAtNormalise, 0);
});

test('mutual pairing never puts two filings from one government on a mark', () => {
  const snapshot = normaliseGasCrossings(
    JSON.parse(readBundle('gas-crossings.json')),
  );
  for (const crossing of snapshot.crossings) {
    assert.ok(
      crossing.filingCount <= 2,
      `${crossing.cellId} holds ${crossing.filingCount}`,
    );
    const countries = crossing.filings.map((f) => f.filedBy);
    assert.equal(
      new Set(countries).size,
      countries.length,
      `${crossing.cellId} pairs one government with itself`,
    );
    // The count in the header must equal the rows underneath it.
    assert.equal(crossing.filingCount, crossing.filings.length);
  }
});

test('the committed bundles are deeply immutable where the data lives', () => {
  const network = normaliseGasNetwork(
    JSON.parse(readBundle('gas-network.json')),
  );
  const crossings = normaliseGasCrossings(
    JSON.parse(readBundle('gas-crossings.json')),
  );
  const pair = network.systems[0].parts[0][0];
  assert.ok(
    Object.isFrozen(pair),
    'a coordinate pair must be frozen, not just its container',
  );
  assert.throws(() => {
    pair[0] = 999;
  }, TypeError);
  const design = crossings.crossings.find(
    (c) => Object.keys(c.filings[0].design ?? {}).length,
  )?.filings[0].design;
  assert.ok(
    design && Object.isFrozen(design),
    'the 2017 design strings must be frozen',
  );
  assert.throws(() => {
    design.capacity = '9999 MMcf/d';
  }, TypeError);
});

test('the committed crossings bundle preserved every blank as an absence', () => {
  const payload = JSON.parse(readBundle('gas-crossings.json'));
  assert.equal(payload.audit.blankVolume, 29);
  assert.equal(payload.audit.blanksThatWouldBecomeZero, 0);
  // No filing anywhere in the bundle carries a numeric magnitude.
  for (const cell of payload.cells) {
    for (const filing of cell.filings) {
      for (const key of [
        'Vol_MMcfd',
        'Diam_Inch',
        'MaxOP_psi',
        'NumPipes',
        'numPipes',
        'capacity',
        'volume',
      ]) {
        assert.equal(
          filing[key],
          undefined,
          `${cell.cellId} filing exposes ${key}`,
        );
      }
      // Nothing numeric survives on a 2017 filing except its own position.
      for (const [key, value] of Object.entries(filing)) {
        if (key === 'latitude' || key === 'longitude' || key === 'objectId')
          continue;
        assert.notEqual(
          typeof value,
          'number',
          `${cell.cellId} filing has numeric ${key}`,
        );
      }
      // Every design string names its own vintage, so a value that reaches a
      // card arrives already dated no matter which field it came from.
      for (const value of Object.values(filing.design ?? {})) {
        assert.equal(typeof value, 'string');
        assert.match(value, /\(2017\)$/);
      }
    }
  }
});

test('no bundled record can be encoded as a magnitude', () => {
  // The two bundles together are ~35k records; not one of them may vary a pixel.
  const network = normaliseGasNetwork(
    JSON.parse(readBundle('gas-network.json')),
  );
  const crossings = normaliseGasCrossings(
    JSON.parse(readBundle('gas-crossings.json')),
  );
  for (const system of network.systems)
    assert.throws(() => assertEiaVolumeRecord(system));
  for (const crossing of crossings.crossings)
    assert.throws(() => assertEiaVolumeRecord(crossing));
});

test('the source reads and caches each bundle once', async () => {
  let calls = 0;
  const source = createBundledGasSource({
    fetchImpl: (url) => {
      calls += 1;
      return diskFetch(url);
    },
  });
  const first = await source.getCrossings();
  const second = await source.getCrossings();
  assert.equal(calls, 1, 'the second read is served from cache');
  assert.equal(first, second);
  assert.equal(source.freshnessClass, 'published');
});

test('a missing network degrades to partial instead of failing the layer', async () => {
  const source = createBundledGasSource({
    fetchImpl: (url) =>
      String(url).includes('gas-network')
        ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        : diskFetch(url),
  });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.feed, 'partial');
  assert.equal(snapshot.network, null);
  assert.match(snapshot.networkError, /HTTP 500/);
  // The crossings still render, which is the point of splitting the two reads.
  assert.equal(snapshot.crossings.crossings.length, 60);
});

test('a healthy read reports a nominal feed', async () => {
  const source = createBundledGasSource({ fetchImpl: diskFetch });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.feed, 'nominal');
  assert.equal(snapshot.networkError, null);
  assert.equal(snapshot.network.systems.length, 234);
});

test('an abort propagates rather than being swallowed as a partial feed', async () => {
  const controller = new AbortController();
  controller.abort();
  const source = createBundledGasSource({ fetchImpl: diskFetch });
  await assert.rejects(() => source.getSnapshot({ signal: controller.signal }));
});
