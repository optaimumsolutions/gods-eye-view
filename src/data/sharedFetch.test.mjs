import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_FETCH_TTL_MS,
  createSharedFetch,
  sharedOracleFetch,
} from './sharedFetch.js';

/** A fetch whose responses resolve when the test says so. */
function deferredFetch() {
  const calls = [];
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      calls.push({ url, init, resolve, reject });
    });
  const reply = (i, body, { status = 200 } = {}) =>
    calls[i].resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  return { calls, fetchImpl, reply };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('concurrent callers share one in-flight request per URL', async () => {
  const fx = deferredFetch();
  const shared = createSharedFetch({ fetchImpl: fx.fetchImpl });
  const reads = Array.from({ length: 5 }, () =>
    shared.getJson('/api/oracle/basins'),
  );
  const other = shared.getJson('/api/oracle/weather-forecast?model=AIFS_ENS');
  assert.equal(fx.calls.length, 2, 'one request per URL');
  assert.deepEqual(fx.calls[0].init.headers, { Accept: 'application/json' });
  assert.equal(
    fx.calls[0].init.signal,
    undefined,
    'no caller owns the request',
  );
  fx.reply(0, { basins: [] });
  fx.reply(1, { initDate: '2026-10-07' });
  const results = await Promise.all(reads);
  for (const result of results) {
    assert.equal(result.ok, true);
    assert.deepEqual(result.body, { basins: [] });
  }
  assert.equal(results[0].body, results[4].body, 'the same parsed body');
  assert.equal((await other).body.initDate, '2026-10-07');
});

test('a success is reused for the TTL, then fetched again', async () => {
  let clock = 1_000;
  let n = 0;
  const shared = createSharedFetch({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ n: ++n }),
    }),
    now: () => clock,
  });
  assert.equal(SHARED_FETCH_TTL_MS, 60_000);
  assert.equal((await shared.getJson('/u')).body.n, 1);
  await flush();
  clock += SHARED_FETCH_TTL_MS - 1;
  assert.equal((await shared.getJson('/u')).body.n, 1, 'inside the TTL');
  clock += 1;
  assert.equal((await shared.getJson('/u')).body.n, 2, 'at the TTL: fresh');
  assert.equal(shared.getStats().requests, 2);
});

test('failures are shared while in flight but never kept', async () => {
  let mode = 'http';
  let calls = 0;
  const shared = createSharedFetch({
    fetchImpl: async () => {
      calls += 1;
      if (mode === 'throw') throw new Error('network down');
      if (mode === 'http')
        return { ok: false, status: 502, json: async () => ({}) };
      if (mode === 'json')
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('bad json');
          },
        };
      if (mode === 'error-body')
        return {
          ok: true,
          status: 200,
          json: async () => ({ error: 'no table' }),
        };
      return { ok: true, status: 200, json: async () => ({ fine: true }) };
    },
  });
  const [a, b] = await Promise.all([
    shared.getJson('/u'),
    shared.getJson('/u'),
  ]);
  assert.equal(calls, 1, 'concurrent callers share the failing request too');
  assert.deepEqual([a.ok, a.status, a.body], [false, 502, null]);
  assert.equal(a, b);
  await flush();
  mode = 'throw';
  await assert.rejects(shared.getJson('/u'), /network down/);
  assert.equal(calls, 2, 'the HTTP error was not kept');
  await flush();
  mode = 'json';
  await assert.rejects(shared.getJson('/u'), /bad json/);
  assert.equal(calls, 3, 'the network error was not kept');
  await flush();
  mode = 'error-body';
  assert.equal((await shared.getJson('/u')).body.error, 'no table');
  await flush();
  mode = 'ok';
  assert.equal((await shared.getJson('/u')).body.fine, true);
  assert.equal(calls, 5, 'neither bad JSON nor an error body was kept');
  await flush();
  await shared.getJson('/u');
  assert.equal(calls, 5, 'the success is kept');
});

test('invalidate drops kept bodies and a read in flight across it is not kept', async () => {
  const fx = deferredFetch();
  const shared = createSharedFetch({ fetchImpl: fx.fetchImpl });
  const first = shared.getJson('/u');
  fx.reply(0, { v: 1 });
  await first;
  await flush();
  shared.getJson('/u');
  assert.equal(fx.calls.length, 1, 'kept');
  shared.invalidate();
  const second = shared.getJson('/u');
  assert.equal(fx.calls.length, 2, 'invalidate forces a fresh read');
  shared.invalidate(); // a store write lands while that read is in flight
  fx.reply(1, { v: 2 });
  assert.equal((await second).body.v, 2);
  await flush();
  const third = shared.getJson('/u');
  assert.equal(fx.calls.length, 3, 'the pre-write read was not kept');
  fx.reply(2, { v: 3 });
  assert.equal((await third).body.v, 3);
});

test("one caller's abort stops only that caller; the others still get the body", async () => {
  const fx = deferredFetch();
  const shared = createSharedFetch({ fetchImpl: fx.fetchImpl });
  const controller = new AbortController();
  const aborted = shared.getJson('/u', { signal: controller.signal });
  const kept = shared.getJson('/u');
  controller.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
  fx.reply(0, { v: 1 });
  assert.equal((await kept).body.v, 1);
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(shared.getJson('/u', { signal: pre.signal }), {
    name: 'AbortError',
  });
  assert.equal(fx.calls.length, 1, 'an aborted caller starts no request');
});

test('the browser-wide oracle memo exists and can be invalidated', () => {
  assert.equal(typeof sharedOracleFetch.getJson, 'function');
  sharedOracleFetch.invalidate();
  assert.equal(sharedOracleFetch.getStats().cached, 0);
});
