import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../../../scripts/gas-overlay-csv.mjs';

// open-items.csv is the register `/comm` prints for the next session: every
// coordinate or line the bundle could not verify. These tests keep it honest
// against the data, so an item cannot be dropped while its gap remains, and a
// gap cannot appear without an item.

const file = (name) => fileURLToPath(new URL(`../../data/local_data/gas_overlay/${name}`, import.meta.url));
const csv = (name) => parseCsv(readFileSync(file(name), 'utf8'));
const items = csv('open-items.csv');
const open = items.filter((i) => i.status === 'open');

test('every item has an id, a kind, an issue and a next step; ids are unique', () => {
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const i of items) {
    assert.match(i.id, /^GO-\d{2,}$/);
    assert.ok(['open', 'resolved'].includes(i.status), i.id);
    assert.ok(['point', 'points', 'station', 'line', 'permission'].includes(i.kind), i.id);
    assert.ok(i.issue && i.next_step, `${i.id} needs an issue and a next step`);
    assert.match(i.opened, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('every unresolved point has an open item, and a point item stays open only while unresolved', () => {
  const unresolved = new Set(csv('unresolved.csv').map((r) => `${r.pipeline}:${r.loc}`));
  const pointItems = new Set(open.filter((i) => i.kind === 'point').map((i) => `${i.pipeline}:${i.ref}`));
  for (const u of unresolved) assert.ok(pointItems.has(u), `unresolved ${u} has no open item in open-items.csv`);
  for (const p of pointItems) assert.ok(unresolved.has(p), `${p} is placed now: mark its item resolved`);
});

test('every unverified station has an open item, and none is open once checked', () => {
  const { stations } = JSON.parse(readFileSync(file('stations.json'), 'utf8'));
  const unverified = new Set(stations.filter((s) => s.check?.verdict === 'unverified').map((s) => s.id));
  const stationItems = open.filter((i) => i.kind === 'station');
  for (const id of unverified) assert.ok(stationItems.some((i) => i.ref === id), `unverified ${id} has no open item`);
  for (const i of stationItems) {
    const s = stations.find((x) => x.id === i.ref);
    if (s) assert.equal(s.check?.verdict, 'unverified', `${i.id}: ${i.ref} is ${s.check?.verdict} now: resolve the item`);
  }
});

test('the low-confidence item counts the points the bundle actually snapped', () => {
  const snapped = csv('points.csv').filter((r) => r.method === 'snap_to_line').length;
  const item = open.find((i) => i.kind === 'points' && i.ref === 'method=snap_to_line');
  if (snapped === 0) return assert.equal(item, undefined);
  assert.ok(item, 'snap_to_line points exist but no open item says so');
  assert.match(item.name, new RegExp(`^${snapped} points`), `item says "${item.name}", bundle has ${snapped}`);
});
