import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUSTER_MARK_MAX_PX,
  ONSHORE_LOCAL_HEIGHT_M,
  ONSHORE_REGIONAL_HEIGHT_M,
  ONSHORE_TIER_GLOBAL,
  ONSHORE_TIER_LOCAL,
  ONSHORE_TIER_REGIONAL,
  WELL_IDLE_PX,
  WELL_MARK_MAX_PX,
  WELL_MARK_MIN_PX,
  YOY_CSS,
  buildHoverClusterCard,
  buildHoverWellCard,
  buildSelectedWellCard,
  clusterPixelSize,
  createClusterOverlayEntry,
  createRegionOverlayEntry,
  createWellOverlayEntry,
  detailTierForHeight,
  facilitiesInRectangle,
  headlineLine,
  identityLine,
  legendEntries,
  markerStyle,
  operationsLine,
  padRectangle,
  selectOverlayCohort,
  wellPixelSize,
} from './model.js';
import { normaliseOnshoreDataset } from './records.js';
import { clusters, facility, payload, reading } from './fixtures.mjs';

const NOW = Date.parse('2026-09-21T18:00:00Z');
const POSITION = { x: 1, y: 2, z: 3 };

function snapshotWith(rows) {
  return normaliseOnshoreDataset(payload(rows), {
    clusters: clusters(),
    fetchedAt: NOW,
  });
}

test('tiers switch at the row 11 heights', () => {
  assert.equal(ONSHORE_REGIONAL_HEIGHT_M, 2_500_000);
  assert.equal(ONSHORE_LOCAL_HEIGHT_M, 300_000);
  assert.equal(detailTierForHeight(14_000_000), ONSHORE_TIER_GLOBAL);
  assert.equal(detailTierForHeight(2_499_999), ONSHORE_TIER_REGIONAL);
  assert.equal(detailTierForHeight(299_999), ONSHORE_TIER_LOCAL);
  assert.equal(detailTierForHeight(NaN), ONSHORE_TIER_GLOBAL);
});

test('well points are small and field marks large, both by the square root of their gas share', () => {
  const snapshot = snapshotWith([
    facility('33053039010000', { current: reading({ gas: 9000 }) }),
    facility('33053039020000', { current: reading({ gas: 2250 }) }),
    facility('33053039030000', {
      status: 'quiet',
      current: reading({ gas: 0, oil: 0, days: 0 }),
    }),
  ]);
  const [top, half, quiet] = snapshot.rows;
  assert.equal(wellPixelSize(top, snapshot.gasMaxMcfd), WELL_MARK_MAX_PX);
  // A quarter of the gas is half the size range above the minimum.
  assert.equal(
    wellPixelSize(half, snapshot.gasMaxMcfd),
    Math.round(
      (WELL_MARK_MIN_PX + (WELL_MARK_MAX_PX - WELL_MARK_MIN_PX) * 0.5) * 2,
    ) / 2,
  );
  assert.equal(wellPixelSize(quiet, snapshot.gasMaxMcfd), WELL_IDLE_PX);
  assert.ok(
    wellPixelSize(top, snapshot.gasMaxMcfd, { hovered: true }) >
      WELL_MARK_MAX_PX,
  );
  const field = snapshot.clusters.fields[0];
  assert.equal(
    clusterPixelSize(field, snapshot.counts.clusterGasMaxMcfd),
    CLUSTER_MARK_MAX_PX,
  );
  assert.deepEqual(markerStyle(top), {
    fillCss: YOY_CSS.up,
    outlineCss: '#000000',
    outlineAlpha: 0.8,
    fillAlpha: 1,
  });
  assert.equal(markerStyle(quiet).fillAlpha, 0, 'a quiet well is a hollow pip');
  assert.equal(
    markerStyle(snapshot.clusters.fields[1]).fillAlpha,
    0,
    'a field with no producers is hollow',
  );
});

test('the card lines read from the one record shape', () => {
  const snapshot = snapshotWith([facility('33053039010000')]);
  const row = snapshot.rows[0];
  assert.equal(headlineLine(row), '82 Mcf/d · ▼ -18.3 % vs last year');
  assert.equal(
    operationsLine(row),
    'oil 15 bbl/d · water 38 bbl/d · 26 days on · 23.4 % flared',
  );
  assert.equal(
    identityLine(row),
    'operator DEVON ENERGY WILLISTON, L.L.C · BAKKEN · MCK county',
  );
  const hover = buildHoverWellCard(row, POSITION);
  assert.equal(hover.id, 'hover-well:33053039010000');
  assert.equal(hover.title, 'WELL 0000 · ALEXANDER');
  assert.equal(hover.details.length, 4);
  assert.match(hover.details[3], /^as of 2026-07-31 · \d+d lag$/);
  const selected = buildSelectedWellCard(row, POSITION);
  assert.equal(selected.selected, true);
  assert.ok(selected.details.some((line) => line.includes('API 33-053-03901')));
  assert.ok(selected.details.at(-1).endsWith('dossier open ▸'));
  const quiet = snapshotWith([
    facility('33053039030000', {
      status: 'quiet',
      current: reading({ gas: 0, oil: 0, days: 0 }),
    }),
  ]).rows[0];
  assert.equal(headlineLine(quiet), 'filed, no production this month');
  const absent = snapshotWith([
    facility('33053039040000', {
      status: 'absent',
      current: null,
      prior: null,
      lastYear: null,
    }),
  ]).rows[0];
  assert.equal(headlineLine(absent), "not in this month's file");
  assert.equal(operationsLine(absent), null);
});

test('ambient entries follow the tier: region at global, fields at regional, wells at local', () => {
  const snapshot = snapshotWith([facility('33053039010000')]);
  const row = snapshot.rows[0];
  const field = snapshot.clusters.fields[0];
  const region = createRegionOverlayEntry(snapshot, POSITION);
  assert.equal(region.variant, 'card');
  assert.equal(region.title, 'WILLISTON BASIN');
  assert.match(region.details[0], /^1 wells producing · 0\.00 Bcf\/d gas/);
  assert.equal(
    createClusterOverlayEntry(field, POSITION, ONSHORE_TIER_GLOBAL),
    null,
  );
  const fieldLabel = createClusterOverlayEntry(
    field,
    POSITION,
    ONSHORE_TIER_REGIONAL,
  );
  assert.equal(fieldLabel.variant, 'label');
  assert.equal(fieldLabel.title, 'ALEXANDER · 2.6 MMcf/d · 100 wells');
  assert.equal(
    createClusterOverlayEntry(
      snapshot.clusters.fields[1],
      POSITION,
      ONSHORE_TIER_REGIONAL,
    ),
    null,
    'no label for a field with no gas',
  );
  assert.equal(
    createWellOverlayEntry(row, POSITION, ONSHORE_TIER_REGIONAL),
    null,
  );
  const wellLabel = createWellOverlayEntry(row, POSITION, ONSHORE_TIER_LOCAL);
  assert.equal(wellLabel.title, 'WELL 0000 · 82 Mcf/d');
  assert.equal(wellLabel.priority, 82);
  const hoverField = buildHoverClusterCard(field, POSITION, snapshot);
  assert.equal(hoverField.title, 'ALEXANDER · MCK');
  assert.ok(hoverField.details[1].includes('100 of 120 wells producing'));
  assert.ok(hoverField.details[1].includes('#1 field by gas'));
});

test('the cohort keeps the largest producers with stable tie-breaks', () => {
  const entries = [
    { id: 'well:b', priority: 5 },
    { id: 'well:a', priority: 5 },
    { id: 'well:c', priority: 9 },
    null,
  ];
  assert.deepEqual(
    selectOverlayCohort(entries, 2).map((e) => e.id),
    ['well:c', 'well:a'],
  );
  assert.deepEqual(selectOverlayCohort(entries, 0), []);
});

test('the view rectangle is padded and clips wells by their surface location', () => {
  const rect = padRectangle(
    { west: -104, south: 47, east: -102, north: 48 },
    0.5,
  );
  assert.deepEqual(rect, { west: -105, south: 46.5, east: -101, north: 48.5 });
  const rows = [
    { id: 'in', lon: -103, lat: 47.5 },
    { id: 'west', lon: -106, lat: 47.5 },
    { id: 'north', lon: -103, lat: 49 },
  ];
  assert.deepEqual(
    facilitiesInRectangle(rows, rect).map((r) => r.id),
    ['in'],
  );
  assert.equal(facilitiesInRectangle(rows, null), rows);
  assert.equal(
    padRectangle({ west: -180, south: -90, east: 180, north: 90 }).west,
    -180,
  );
});

test('the legend counts wells by change class and explains size once', () => {
  const snapshot = snapshotWith([
    facility('33053039010000', { current: reading({ gas: 9000 }) }),
    facility('33053039020000', { current: reading({ gas: 2250 }) }),
    facility('33053039030000', {
      status: 'quiet',
      current: reading({ gas: 0, oil: 0, days: 0 }),
    }),
    facility('33053039040000', {
      status: 'absent',
      current: null,
      prior: null,
      lastYear: null,
    }),
  ]);
  const legend = legendEntries(snapshot);
  assert.deepEqual(
    legend.map((e) => [e.label, e.count]),
    [
      ['up', 1],
      ['down', 1],
      ['quiet', 1],
      ['not filed', 1],
    ],
  );
  assert.ok(legend[0].blurb.endsWith('mark size is gas per day this month'));
  assert.equal(
    legend[3].blurb,
    "not in this month's file (plugged, inactive or confidential)",
  );
  assert.deepEqual(legendEntries(null), []);
});
