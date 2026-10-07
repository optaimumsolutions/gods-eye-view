import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_REFRESH_LAYERS, installLiveRefresh } from './liveRefresh.js';

function updated(target, detail) {
  target.dispatchEvent(new CustomEvent('gev:source-updated', { detail }));
}

test('a store write refreshes the layers fed by that source, once per burst', () => {
  const target = new EventTarget();
  const refreshed = [];
  const timers = [];
  let invalidated = 0;
  const uninstall = installLiveRefresh(
    { refreshLayer: async (id) => refreshed.push(id) },
    {
      target,
      setTimeoutImpl: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimeoutImpl: () => {},
      invalidate: () => (invalidated += 1),
    },
  );
  updated(target, { source: 'portwatch', rows: 28 });
  updated(target, { source: 'portwatch', rows: 28 });
  updated(target, { source: 'wx_aifs', rows: 12 });
  updated(target, { source: 'wx_ghcn', rows: 6 });
  updated(target, { source: 'quotes', rows: 4 });
  updated(target, { source: 'portwatch', rows: 0 });
  assert.equal(timers.length, 7, 'one pending refresh per layer');
  assert.equal(
    invalidated,
    4,
    'every mapped write drops the shared oracle memo; unmapped and empty ones do not',
  );
  for (const timer of timers) timer.fn();
  assert.deepEqual(refreshed.sort(), [
    'commodity-chokepoints',
    'production-appalachia',
    'production-permian-delaware',
    'production-permian-midland',
    'production-permian-platform',
    'production-williston',
    'weather-forecast',
  ]);
  // After it ran, a new write schedules again.
  updated(target, { source: 'portwatch', rows: 28 });
  assert.equal(timers.length, 8);
  // Row 14: a store write the supply board reads refreshes it in place.
  updated(target, { source: 'ng_pipeline_flows', rows: 392 });
  updated(target, { source: 'ng_storage', rows: 8 });
  assert.equal(timers.length, 9, 'one pending refresh for the board');
  timers.at(-1).fn();
  assert.equal(refreshed.at(-1), 'gas-supply-us');
  uninstall();
  updated(target, { source: 'wx_aifs', rows: 12 });
  assert.equal(timers.length, 9, 'uninstalled: no more refreshes');
});

test('the mapped sources are the ones the globe reads through /api/oracle/', () => {
  assert.deepEqual(Object.keys(LIVE_REFRESH_LAYERS).sort(), [
    'duc_build',
    'ng_monthly',
    'ng_pipeline_flows',
    'ng_regional',
    'ng_storage',
    'portwatch',
    'steo',
    'wx_aifs',
    'wx_ghcn',
  ]);
});

test('FR-D29: steo and duc_build refresh the supply board; wx_aifs also redraws the basin forecast', () => {
  assert.deepEqual(LIVE_REFRESH_LAYERS.steo, ['gas-supply-us']);
  assert.deepEqual(LIVE_REFRESH_LAYERS.duc_build, ['gas-supply-us']);
  assert.ok(LIVE_REFRESH_LAYERS.wx_aifs.includes('weather-forecast'));
  assert.equal(
    LIVE_REFRESH_LAYERS.wx_aifs.length,
    6,
    'five onshore layers + the forecast',
  );
  assert.ok(!LIVE_REFRESH_LAYERS.wx_ghcn.includes('weather-forecast'));
  assert.ok(Object.isFrozen(LIVE_REFRESH_LAYERS.wx_aifs));
});
