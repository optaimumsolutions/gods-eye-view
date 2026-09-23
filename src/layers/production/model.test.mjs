import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GULF_IDLE_PX,
  GULF_LOCAL_HEIGHT_M,
  GULF_MARK_MAX_PX,
  GULF_MARK_MIN_PX,
  GULF_REGIONAL_HEIGHT_M,
  GULF_TIER_GLOBAL,
  GULF_TIER_LOCAL,
  GULF_TIER_REGIONAL,
  YOY_CSS,
  buildHoverPlatformCard,
  buildSelectedPlatformCard,
  createPlatformOverlayEntry,
  detailTierForHeight,
  headlineLine,
  legendEntries,
  markerPixelSize,
  markerStyle,
  operationsLine,
  selectPlatformOverlayCohort,
  yoyCss,
} from './model.js';
import { normaliseGulfDataset } from './records.js';

const NOW = Date.parse('2026-09-21T18:00:00Z');

function months() {
  const out = [];
  for (let i = 23; i >= 0; i -= 1) {
    const total = 2026 * 12 + 5 - i;
    out.push(
      `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`,
    );
  }
  return out;
}

function series(gasNow, gasLastYear) {
  const gas = new Array(24).fill(1000);
  gas[23] = gasNow;
  gas[11] = gasLastYear;
  return {
    gas,
    oil: new Array(24).fill(200),
    water: new Array(24).fill(50),
    boe: new Array(24).fill(null),
    wells: new Array(24).fill(4),
  };
}

function structure(id, overrides = {}) {
  return {
    id,
    complexId: id.split('-')[0],
    structureNumber: '1',
    name: `P ${id}`,
    area: 'GC',
    block: '254',
    lease: 'G07049',
    field: 'GC254',
    operator: 'Operator LLC',
    type: 'FIXED',
    major: true,
    waterDepthFt: 3300,
    lat: 27.5,
    lon: -90.5,
    installed: '1999-08-19',
    removed: null,
    incidents: 3,
    series: null,
    lifetime: null,
    ...overrides,
  };
}

function snapshot(structures) {
  return normaliseGulfDataset(
    {
      retrieved: '2026-09-21',
      months: months(),
      current: { month: '2026-06', index: 23 },
      completeness: { table: [] },
      counts: { installed: structures.length },
      structures,
    },
    { fetchedAt: NOW },
  );
}

test('tiers split at the datacenters heights and an unknown height is global', () => {
  assert.equal(GULF_LOCAL_HEIGHT_M, 300_000);
  assert.equal(GULF_REGIONAL_HEIGHT_M, 2_500_000);
  assert.equal(detailTierForHeight(1_000), GULF_TIER_LOCAL);
  assert.equal(detailTierForHeight(299_999), GULF_TIER_LOCAL);
  assert.equal(detailTierForHeight(300_000), GULF_TIER_REGIONAL);
  assert.equal(detailTierForHeight(2_500_000), GULF_TIER_GLOBAL);
  assert.equal(detailTierForHeight(undefined), GULF_TIER_GLOBAL);
});

test('marks size by the square root of the gas share, idle pips stay fixed', () => {
  const snap = snapshot([
    structure('1-1', { series: series(40_000, 40_000) }),
    structure('2-1', { series: series(10_000, 10_000) }),
    structure('3-1', { series: series(0, 500) }),
    structure('4-1'),
  ]);
  const [top, quarter, idle, never] = snap.rows;
  assert.equal(markerPixelSize(top, snap.gasMaxMcfd), GULF_MARK_MAX_PX);
  // A quarter of the gas is half the size range above the minimum.
  assert.equal(
    markerPixelSize(quarter, snap.gasMaxMcfd),
    Math.round(GULF_MARK_MIN_PX + (GULF_MARK_MAX_PX - GULF_MARK_MIN_PX) * 0.5),
  );
  assert.equal(markerPixelSize(idle, snap.gasMaxMcfd), GULF_IDLE_PX);
  assert.equal(markerPixelSize(never, snap.gasMaxMcfd), GULF_IDLE_PX);
  assert.ok(
    markerPixelSize(top, snap.gasMaxMcfd, { hovered: true }) > GULF_MARK_MAX_PX,
  );
  assert.ok(
    markerPixelSize(top, snap.gasMaxMcfd, { tier: GULF_TIER_LOCAL }) >
      GULF_MARK_MAX_PX,
  );
  // Producing marks are solid; idle pips are hollow in their own grey.
  assert.equal(markerStyle(top).fillAlpha, 1);
  assert.equal(markerStyle(idle).fillAlpha, 0);
  assert.equal(markerStyle(idle).outlineCss, YOY_CSS.quiet);
  assert.equal(markerStyle(never).outlineCss, YOY_CSS.unknown);
});

test('colours follow the shared commodity vocabulary and every class has one', () => {
  for (const cls of ['up', 'flat', 'down', 'new', 'quiet', 'unknown'])
    assert.match(yoyCss(cls), /^#[0-9a-f]{6}$/);
  assert.equal(yoyCss('nonsense'), YOY_CSS.unknown);
  assert.equal(YOY_CSS.up, '#7cff9b');
  assert.equal(YOY_CSS.down, '#ffb347');
  assert.equal(YOY_CSS.flat, '#39d5ff');
});

test('ambient text: nothing at global, labels for producers at regional, cards at local, never for idle pips', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW }); // the card's lag stamp reads the clock
  const snap = snapshot([
    structure('1-1', { series: series(40_000, 30_000) }),
    structure('3-1', { series: series(0, 500) }),
  ]);
  const [producer, idle] = snap.rows;
  const position = { x: 1, y: 2, z: 3 };
  assert.equal(
    createPlatformOverlayEntry(producer, position, GULF_TIER_GLOBAL),
    null,
  );
  const label = createPlatformOverlayEntry(
    producer,
    position,
    GULF_TIER_REGIONAL,
  );
  assert.equal(label.variant, 'label');
  assert.equal(label.title, 'P 1-1 · GC 254 · 40.0 MMcf/d');
  assert.equal(label.priority, 40_000);
  assert.equal(label.accent, YOY_CSS.up);
  const card = createPlatformOverlayEntry(producer, position, GULF_TIER_LOCAL);
  assert.equal(card.variant, 'card');
  assert.deepEqual(card.details, [
    '40.0 MMcf/d · ▲ +33.3 % vs last year',
    'oil 200 bbl/d · water 50 bbl/d · 7,317 BOE/d · 4 wells',
    'operator Operator LLC · fixed · 3,300 ft water · installed 1999',
    'as of 2026-06-30 · 82d lag',
    'click the marker for the dossier',
  ]);
  for (const tier of [GULF_TIER_GLOBAL, GULF_TIER_REGIONAL, GULF_TIER_LOCAL])
    assert.equal(createPlatformOverlayEntry(idle, position, tier), null);
});

test('the hover card answers for any structure, and says when there is no gas', () => {
  const snap = snapshot([
    structure('1-1', { series: series(40_000, 30_000) }),
    structure('3-1', { series: series(0, 500) }),
    structure('4-1'),
  ]);
  const [producer, quiet, never] = snap.rows;
  const hover = buildHoverPlatformCard(producer, {});
  assert.equal(hover.id, 'hover-platform:1-1');
  assert.equal(hover.details[0], headlineLine(producer));
  assert.equal(headlineLine(quiet), 'no gas this month');
  assert.equal(headlineLine(never), 'no production filed');
  assert.equal(operationsLine(never), null);
  assert.ok(hover.priority < buildSelectedPlatformCard(producer, {}).priority);
});

test('the selected card carries the identity the dossier expands and marks itself selected', () => {
  const snap = snapshot([structure('1-1', { series: series(40_000, 30_000) })]);
  const card = buildSelectedPlatformCard(snap.rows[0], {});
  assert.equal(card.selected, true);
  assert.equal(card.title, 'P 1-1 · GC 254');
  assert.ok(
    card.details.some((line) => line.startsWith('lease G07049 · field GC254')),
  );
  assert.ok(card.details.at(-1).endsWith('dossier open ▸'));
  assert.ok(card.details.at(-1).startsWith('#1 by gas this month'));
});

test('the cohort keeps the largest producers with stable ties', () => {
  const entries = [
    { id: 'b', priority: 10 },
    { id: 'a', priority: 10 },
    { id: 'c', priority: 30 },
    null,
  ];
  assert.deepEqual(
    selectPlatformOverlayCohort(entries, 2).map((e) => e.id),
    ['c', 'a'],
  );
  assert.deepEqual(selectPlatformOverlayCohort(entries, 0), []);
});

test('the legend counts installed structures per class and explains size once', () => {
  const snap = snapshot([
    structure('1-1', { series: series(40_000, 30_000) }),
    structure('2-1', { series: series(9_000, 10_000) }),
    structure('3-1', { series: series(0, 500) }),
    structure('4-1'),
  ]);
  const legend = legendEntries(snap);
  assert.deepEqual(
    legend.map((e) => [e.label, e.count]),
    [
      ['up', 1],
      ['flat', 1],
      ['quiet', 1],
      ['no filing', 1],
    ],
  );
  assert.match(legend[0].blurb, /mark size is gas per day/);
  assert.equal(legend[0].color, YOY_CSS.up);
  assert.deepEqual(legendEntries(null), []);
});
