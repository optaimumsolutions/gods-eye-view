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
  const uninstall = installLiveRefresh(
    { refreshLayer: async (id) => refreshed.push(id) },
    {
      target,
      setTimeoutImpl: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimeoutImpl: () => {},
    },
  );
  updated(target, { source: 'portwatch', rows: 28 });
  updated(target, { source: 'portwatch', rows: 28 });
  updated(target, { source: 'wx_aifs', rows: 12 });
  updated(target, { source: 'wx_ghcn', rows: 6 });
  updated(target, { source: 'quotes', rows: 4 });
  updated(target, { source: 'portwatch', rows: 0 });
  assert.equal(timers.length, 2, 'one pending refresh per layer');
  for (const timer of timers) timer.fn();
  assert.deepEqual(refreshed.sort(), [
    'commodity-chokepoints',
    'production-williston',
  ]);
  // After it ran, a new write schedules again.
  updated(target, { source: 'portwatch', rows: 28 });
  assert.equal(timers.length, 3);
  uninstall();
  updated(target, { source: 'wx_aifs', rows: 12 });
  assert.equal(timers.length, 3, 'uninstalled: no more refreshes');
});

test('the mapped sources are the ones the globe reads through /api/oracle/', () => {
  assert.deepEqual(Object.keys(LIVE_REFRESH_LAYERS).sort(), [
    'portwatch',
    'wx_aifs',
    'wx_ghcn',
  ]);
});
