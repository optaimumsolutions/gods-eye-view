import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasCandidates,
  attributeChange,
  buildContributors,
  nameWords,
  shortOperatorNames,
  spellingKey,
  UNFILED_OPERATOR,
} from './contributors.js';

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('names lose their trailing legal form only', () => {
  assert.deepEqual(nameWords('CONTINENTAL RESOURCES, INC.'), [
    'CONTINENTAL',
    'RESOURCES',
  ]);
  assert.deepEqual(nameWords('BURLINGTON RESOURCES OIL & GAS COMPANY LP'), [
    'BURLINGTON',
    'RESOURCES',
    'OIL',
    '&',
    'GAS',
  ]);
  assert.deepEqual(nameWords('DEVON ENERGY WILLISTON, L.L.C'), [
    'DEVON',
    'ENERGY',
    'WILLISTON',
  ]);
  assert.deepEqual(nameWords('Chevron U.S.A. Inc.'), ['Chevron', 'U.S.A.']);
  assert.deepEqual(nameWords('LLC'), ['LLC'], 'a name is never emptied');
  assert.equal(
    spellingKey('Whiting Oil and Gas Corp.'),
    spellingKey('WHITING OIL AND GAS CORPORATION'),
  );
});

test('short names are the fewest leading words that tell operators apart', () => {
  const shorts = shortOperatorNames([
    'CONTINENTAL RESOURCES, INC.',
    'DEVON ENERGY WILLISTON, L.L.C',
    'PETRO-HUNT, L.L.C.',
    'PETRO-HUNT DAKOTA, LLC',
    'LIME ROCK RESOURCES V-A, L.P.',
    'LIME ROCK RESOURCES III-A, L.P.',
    'XYZ OPERATING INC',
    'XYZ OPERATING LLC',
  ]);
  assert.equal(shorts.get('CONTINENTAL RESOURCES, INC.'), 'CONTINENTAL');
  assert.equal(shorts.get('DEVON ENERGY WILLISTON, L.L.C'), 'DEVON');
  assert.equal(shorts.get('PETRO-HUNT, L.L.C.'), 'PETRO-HUNT');
  assert.equal(shorts.get('PETRO-HUNT DAKOTA, LLC'), 'PETRO-HUNT DAKOTA');
  assert.equal(
    shorts.get('LIME ROCK RESOURCES V-A, L.P.'),
    'LIME ROCK RESOURCES V-A',
  );
  // Two filed entities that read the same keep their filed names.
  assert.equal(shorts.get('XYZ OPERATING INC'), 'XYZ OPERATING INC');
  assert.equal(shorts.get('XYZ OPERATING LLC'), 'XYZ OPERATING LLC');
});

test('alias candidates are colliding spellings the table does not merge yet', () => {
  const names = [
    'WHITING OIL AND GAS CORPORATION',
    'Whiting Oil and Gas Corp.',
    'OASIS PETROLEUM NORTH AMERICA LLC',
  ];
  assert.deepEqual(aliasCandidates(names), [
    ['WHITING OIL AND GAS CORPORATION', 'Whiting Oil and Gas Corp.'],
  ]);
  assert.deepEqual(
    aliasCandidates(names, {
      'Whiting Oil and Gas Corp.': 'WHITING OIL AND GAS CORPORATION',
    }),
    [],
  );
});

// Two months of 30 and 31 days: 2026-06 (base) and 2026-07 (current).
const MONTHS = ['2026-06', '2026-07'];
const unit = (id, operators, gas, filed) => ({
  id,
  operators,
  gas,
  oil: [0, 0],
  ...(filed ? { filed } : {}),
});

test('every facility lands in one part and the parts sum to the change', () => {
  const facilities = [
    unit('continuing', ['A', 'A'], [3000, 3720]), // 100 → 120 Mcf/d
    unit('new', [null, 'B'], [null, 620]), // 0 → 20
    unit('stopped', ['A', 'A'], [600, 0]), // 20 → 0, filed
    unit('late', ['B', null], [900, null], [true, false]), // 30 → not in the file
    unit('sold', ['A', 'C'], [1500, 1860]), // 50 under A → 60 under C
    unit('quiet', ['C', 'C'], [0, 0]),
  ];
  const result = attributeChange(facilities, {
    months: MONTHS,
    baseIndex: 0,
    currentIndex: 1,
    operatorOf: (name) => name ?? UNFILED_OPERATOR,
  });
  const r = result.region;
  close(r.base, 100 + 20 + 30 + 50);
  close(r.current, 120 + 20 + 60);
  close(r.delta, 0);
  close(r.continuing, 20);
  close(r.newWells, 20);
  close(r.stopped, -20);
  close(r.notFiled, -30);
  close(r.acquired, 60);
  close(r.divested, -50);
  assert.deepEqual(r.counts, {
    newWells: 1,
    stopped: 1,
    notFiled: 1,
    transferred: 1,
  });
  assert.equal(result.reconciles, true);
  const byName = Object.fromEntries(result.operators.map((o) => [o.name, o]));
  close(byName.A.delta, 20 - 20 - 50);
  close(byName.B.delta, 20 - 30);
  close(byName.C.delta, 60);
  close(
    result.operators.reduce((sum, o) => sum + o.delta, 0),
    r.delta,
  );
  // Ranked by the size of the change, largest first.
  assert.deepEqual(
    result.operators.map((o) => o.name),
    ['C', 'A', 'B'],
  );
});

test('a region folds into contributors and aggregates that agree with each other', () => {
  const months = Array.from(
    { length: 14 },
    (_, i) => `2025-${String(i + 1).padStart(2, '0')}`,
  ).map((m, i) => (i < 12 ? m : `2026-${String(i - 11).padStart(2, '0')}`));
  const series = (fn) => months.map((_, i) => fn(i));
  const facilities = [
    {
      id: 'w1',
      group: 'MCKENZIE',
      field: 'BANKS',
      operators: series(() => 'CONTINENTAL RESOURCES, INC.'),
      gas: series((i) => 1000 + i * 10),
      oil: series(() => 500),
    },
    {
      id: 'w2',
      group: 'MCKENZIE',
      field: 'BANKS',
      operators: series((i) => (i < 10 ? 'Continental Resources Inc' : 'HESS')),
      gas: series(() => 2000),
      oil: series(() => 0),
    },
    {
      id: 'w3',
      group: 'WILLIAMS',
      field: 'TIOGA',
      operators: series((i) => (i >= 12 ? null : 'HESS')),
      gas: series((i) => (i >= 12 ? 300 : null)),
      oil: series(() => null),
    },
  ];
  const { contributors, aggregates, candidates, checks } = buildContributors({
    facilities,
    months,
    currentIndex: 13,
    region: { id: 'test', name: 'Test' },
    source: { name: 'Test filings', grain: 'well' },
    aliases: { 'Continental Resources Inc': 'CONTINENTAL RESOURCES, INC.' },
    chartMonths: 6,
  });
  assert.deepEqual(candidates, []);
  assert.deepEqual(checks, { mom: true, yoy: true });
  assert.equal(contributors.months.length, 6);
  assert.equal(contributors.current.month, months[13]);
  assert.equal(contributors.current.index, 5);
  const [first, second, third] = contributors.operators;
  assert.equal(first.id, 'HESS');
  assert.equal(second.id, 'CONTINENTAL RESOURCES, INC.');
  assert.deepEqual(second.filedNames, [
    'CONTINENTAL RESOURCES, INC.',
    'Continental Resources Inc',
  ]);
  assert.equal(second.short, 'CONTINENTAL');
  assert.equal(third.id, UNFILED_OPERATOR);
  assert.deepEqual(first.fields, [{ name: 'BANKS', gas: 2000, producing: 1 }]);
  // Operators sum to the region every month of the chart window.
  contributors.total.gas.forEach((value, i) => {
    const sum = contributors.operators.reduce((s, o) => s + o.gas[i], 0);
    assert.equal(sum, value);
  });
  // The aggregates carry the same totals, month by month.
  const gasAt = new Array(months.length).fill(0);
  for (const [, , at, gas] of aggregates.rows) gasAt[at] += gas;
  assert.deepEqual(gasAt, aggregates.total.gas);
  assert.equal(aggregates.groupLabel, 'county');
  assert.deepEqual(aggregates.groups, ['MCKENZIE', 'WILLIAMS']);
  assert.deepEqual(aggregates.columns, [
    'operator',
    'county',
    'month',
    'gas',
    'oil',
    'producing',
  ]);
  // The year-on-year split names the transfer and the late well's return.
  const yoy = contributors.attribution.yoy;
  assert.equal(yoy.reconciles, true);
  assert.equal(yoy.region.counts.transferred, 1);
  assert.equal(yoy.region.counts.newWells, 1);
  assert.deepEqual(contributors.aliases, [
    ['Continental Resources Inc', 'CONTINENTAL RESOURCES, INC.'],
  ]);
});
