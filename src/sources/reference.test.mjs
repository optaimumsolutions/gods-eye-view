import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceSources } from './reference.js';
import { createStandaloneReferenceSources } from '../standalone/layerSources.js';

test('reference factories retain compatibility without starting acquisition or sharing instances', (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    throw new Error('unexpected acquisition');
  });
  assert.equal(createReferenceSources, createStandaloneReferenceSources);
  const first = createReferenceSources();
  const second = createReferenceSources();
  assert.deepEqual(Object.keys(first), [
    'earthquakes',
    'cables',
    'chokepoints',
    'ports',
    'datacenters',
  ]);
  assert.notEqual(first.earthquakes, second.earthquakes);
  assert.notEqual(first.cables, second.cables);
  assert.notEqual(first.chokepoints, second.chokepoints);
  assert.notEqual(first.ports, second.ports);
  assert.notEqual(first.datacenters, second.datacenters);
  assert.equal(typeof first.earthquakes.getSnapshot, 'function');
  assert.equal(typeof first.cables.fetch, 'function');
  assert.equal(typeof first.chokepoints.getSnapshot, 'function');
  assert.equal(typeof first.ports.getSnapshot, 'function');
  assert.equal(typeof first.datacenters.getSnapshot, 'function');
  assert.equal(requests, 0);
});
