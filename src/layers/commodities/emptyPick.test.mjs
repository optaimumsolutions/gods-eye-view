import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isEmptySpacePick } from './emptyPick.js';

test('no pick, or a pick with no id (the 3D-tiles basemap), is empty space', () => {
  assert.equal(isEmptySpacePick(undefined), true);
  assert.equal(isEmptySpacePick(null), true);
  assert.equal(
    isEmptySpacePick({ primitive: { constructor: { name: 'Cesium3DTileset' } } }),
    true,
  );
  assert.equal(isEmptySpacePick({ primitive: {}, id: null }), true);
});

test("a pick carrying an id belongs to some layer and is not empty space", () => {
  assert.equal(isEmptySpacePick({ id: { name: 'an entity' } }), false);
  assert.equal(isEmptySpacePick({ id: 'route:12', primitive: {} }), false);
  assert.equal(isEmptySpacePick({ id: 0 }), false);
});

// Issue #74: every commodity layer must decide "empty space" the same way.
// A bare `if (picked) return;` in front of the deselect is the defect.
const LAYERS = [
  'chokepoints',
  'datacenters',
  'gasFlows',
  'lng',
  'onshore',
  'ports',
  'production',
  'weather',
];

for (const layer of LAYERS) {
  test(`the ${layer} layer deselects on a basemap click through isEmptySpacePick`, () => {
    const source = fs.readFileSync(
      new URL(`../${layer}/index.js`, import.meta.url),
      'utf8',
    );
    assert.match(source, /isEmptySpacePick\(picked\)/);
    assert.doesNotMatch(source, /if \(picked(\s*\|\||\))/);
  });
}
