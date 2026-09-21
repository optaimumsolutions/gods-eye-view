import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARD_COUNT,
  createShardStore,
  fnv1a32,
  shardFor,
  shardPath,
} from './shards.js';

test('the hash and the shard name are pinned so the builder and the browser agree', () => {
  // FNV-1a 32-bit test vectors.
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  assert.equal(SHARD_COUNT, 1024);
  assert.match(shardFor('33053039010000'), /^[0-9a-f]{3}$/);
  assert.match(shardFor('33053039010000', 256), /^[0-9a-f]{2}$/);
  assert.equal(shardFor('33053039010000'), shardFor(33053039010000));
  assert.equal(
    shardPath('williston', shardFor('33053039010000')),
    `data/onshore/williston/history/${shardFor('33053039010000')}.json`,
  );
});

test('ten thousand well ids spread across the shards without a hot bucket', () => {
  const buckets = new Map();
  for (let i = 0; i < 10_000; i += 1) {
    const id = `3305${String(3000000 + i * 7).padStart(10, '0')}`;
    const shard = shardFor(id);
    buckets.set(shard, (buckets.get(shard) ?? 0) + 1);
  }
  const counts = [...buckets.values()];
  const mean = 10_000 / SHARD_COUNT;
  assert.ok(buckets.size > SHARD_COUNT * 0.95, `${buckets.size} shards used`);
  assert.ok(
    Math.max(...counts) < mean * 3,
    `hottest shard ${Math.max(...counts)}`,
  );
});

function fetchFrom(shardsOnDisk, log = []) {
  return async (url, { signal } = {}) => {
    log.push(url);
    signal?.throwIfAborted?.();
    const name = String(url)
      .split('/')
      .pop()
      .replace(/\.json$/, '');
    const payload = shardsOnDisk[name];
    if (!payload) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => payload };
  };
}

test('a shard is fetched once, shared by concurrent readers, and a missing shard reads as unavailable', async () => {
  const id = '33053039010000';
  const other = '33053039020000';
  const shard = shardFor(id);
  const log = [];
  const store = createShardStore({
    regionId: 'williston',
    baseUrl: '/app/',
    fetchImpl: fetchFrom(
      {
        [shard]: {
          months: ['2026-06', '2026-07'],
          facilities: { [id]: { gas: [1, 2], oil: [3, 4] } },
        },
      },
      log,
    ),
  });
  assert.equal(store.isAvailable(), null);
  const [a, b] = await Promise.all([
    store.getHistory(id),
    store.getHistory(id),
  ]);
  assert.deepEqual(a, {
    months: ['2026-06', '2026-07'],
    series: { gas: [1, 2], oil: [3, 4] },
  });
  // One fetch, two readers: the wrappers are fresh, the shard behind them is shared.
  assert.deepEqual(a, b);
  assert.equal(a.series, b.series);
  assert.equal(log.length, 1);
  assert.equal(log[0], `/app/data/onshore/williston/history/${shard}.json`);
  assert.equal(store.isAvailable(), true);
  // A facility the shard does not carry.
  if (shardFor(other) === shard) {
    assert.equal(await store.getHistory(other), null);
  }
  const empty = createShardStore({
    regionId: 'williston',
    fetchImpl: fetchFrom({}),
  });
  assert.equal(await empty.getHistory(id), null);
  assert.equal(empty.isAvailable(), false);
});

test('a malformed shard rejects and is not cached; an abort propagates', async () => {
  const id = '33053039010000';
  let calls = 0;
  const store = createShardStore({
    regionId: 'williston',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ nope: true }) };
    },
  });
  await assert.rejects(() => store.getHistory(id), /malformed/);
  await assert.rejects(() => store.getHistory(id), /malformed/);
  assert.equal(calls, 2, 'a failed shard is retried, not cached');
  const controller = new AbortController();
  controller.abort();
  const aborting = createShardStore({
    regionId: 'williston',
    fetchImpl: fetchFrom({}),
  });
  await assert.rejects(() =>
    aborting.getHistory(id, { signal: controller.signal }),
  );
  assert.throws(() => createShardStore({}), TypeError);
});
