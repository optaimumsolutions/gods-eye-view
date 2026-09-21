import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDossierModel } from './dossier.js';
import { normalizeGridDemand } from './live.js';
import { normalizeDatacenterDataset } from './records.js';

const BUNDLE_URL = new URL(
  '../../data/local_data/us_datacenters/datacenters.json',
  import.meta.url,
);
const { rows } = normalizeDatacenterDataset(
  JSON.parse(readFileSync(BUNDLE_URL, 'utf8')),
);
/** A campus with both a facility figure and a balancing authority to join on. */
const row = rows.find(
  (r) => r.facilityPowerMw !== null && typeof r.balancingAuthority === 'string',
);
assert.ok(
  row,
  'the bundle needs a campus with a facility figure and a balancing authority',
);

/** One EIA demand reading for the row's authority, in the 930-api shape. */
function gridReading(demandMw) {
  return normalizeGridDemand(
    [
      {
        data: [
          {
            RESPONDENT_ID: row.balancingAuthority,
            TYPE_ID: 'D',
            VALUES: { DATES: ['09/21/2026 14:00:00'], DATA: [demandMw] },
          },
        ],
      },
    ],
    { fetchedAt: Date.parse('2026-09-21T15:00:00Z') },
  ).get(row.balancingAuthority);
}

const supplyRows = (model) =>
  model.sections.find((section) => section.title === 'Supply').rows;
const rowValue = (model, label) =>
  supplyRows(model).find(([name]) => name === label)?.[1] ?? null;

test('the dossier carries the live grid rows when a reading exists', () => {
  const model = buildDossierModel(row, {
    live: { grid: gridReading(79477), weather: null },
  });
  assert.match(rowValue(model, 'Region now'), /79,477 MW/);
  assert.match(
    rowValue(model, 'Site share'),
    /^\d+\.\d{2}% of .+ load · facility MW ÷ region MW$/,
  );
});

test('a zero or negative region load yields no share row rather than a throw', () => {
  // EIA can publish a 0 for an hour; `gridSharePct` reports that as null and
  // the row must vanish, not print NaN and not crash the drawer on click.
  for (const demandMw of [0, -5]) {
    const model = buildDossierModel(row, {
      live: { grid: gridReading(demandMw), weather: null },
    });
    assert.equal(rowValue(model, 'Site share'), null);
    assert.match(rowValue(model, 'Region now'), /MW/);
  }
});

test('no live reading leaves the static dossier untouched', () => {
  const cold = buildDossierModel(row);
  assert.equal(rowValue(cold, 'Region now'), null);
  assert.equal(rowValue(cold, 'Site share'), null);
  assert.equal(rowValue(cold, 'Day-ahead'), null);
  assert.equal(rowValue(cold, 'Campus weather'), null);
});
