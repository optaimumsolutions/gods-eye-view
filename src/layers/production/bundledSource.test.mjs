import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createBundledGulfSource } from './bundledSource.js';
import { classifyMonths } from './completeness.js';

const dataDir = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'data',
  'local_data',
  'bsee_gulf',
);
const readBundle = (name) => readFileSync(path.join(dataDir, name), 'utf8');
const manifest = JSON.parse(readBundle('source.json'));
const payload = JSON.parse(readBundle('platforms.json'));

const diskFetch = (url) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => JSON.parse(readBundle(String(url).split('/').pop())),
  });

test('source.json sha256, byte count and gzip budget hold for the committed bytes', () => {
  const text = readBundle('platforms.json');
  const entry = manifest.files.find((f) => f.path === 'platforms.json');
  assert.ok(entry);
  assert.equal(createHash('sha256').update(text).digest('hex'), entry.sha256);
  assert.equal(Buffer.byteLength(text), entry.bytes);
  // G3: the layer must not cost more than the rest of the bundled data. The
  // budget was restated from 600 to 640 KB when BSEE's filed BOE joined the
  // series (their rounding cannot be reproduced, so it is carried, not derived).
  assert.ok(
    gzipSync(text).length <= 640 * 1024,
    `gzip ${gzipSync(text).length} B over budget`,
  );
});

test('the committed bundle is the measured one: installed structures with coordinates, 2026-06 current', () => {
  assert.equal(payload.current.month, '2026-06');
  assert.equal(payload.months.length, 120);
  assert.equal(payload.months.at(-1), '2026-06');
  assert.ok(
    payload.counts.installed >= 1200 && payload.counts.installed <= 1500,
  );
  assert.equal(payload.structures.length, payload.counts.placed);
  assert.ok(
    payload.counts.producingCurrent >= 300 &&
      payload.counts.producingCurrent <= 400,
  );
  assert.ok(payload.counts.gasMcfdCurrent > 2_000_000, 'well over 2 Bcf/d');
  for (const s of payload.structures) {
    assert.equal(s.removed, null, `${s.id} is removed`);
    assert.ok(
      Number.isFinite(s.lat) && Number.isFinite(s.lon),
      `${s.id} has no coordinates`,
    );
    if (s.series) {
      for (const key of ['gas', 'oil', 'water', 'boe', 'wells'])
        assert.equal(s.series[key].length, 120, `${s.id} ${key} length`);
    }
  }
  // The map's total is a subset of what was filed, and the bundle says by how much.
  const c = payload.counts;
  assert.ok(c.gasMcfdFiled >= c.gasMcfdCurrent);
  assert.equal(
    c.unbundled.removed.gasMcfd +
      c.unbundled.unplaced.gasMcfd +
      c.unbundled.unknown.gasMcfd,
    c.gasMcfdFiled - c.gasMcfdCurrent,
    'unbundled Gulf gas accounts for the whole gap',
  );
  // Measured 2026-06: Alaska (Northstar) and thirteen Pacific platforms are in
  // the file and outside this layer; they must be counted, never drawn.
  assert.ok(c.outOfRegion.Y?.gasMcfd > 100_000, 'Alaska is counted');
  assert.ok(c.outOfRegion.P?.structures >= 10, 'the Pacific is counted');
  for (const s of payload.structures) assert.notEqual(s.region, 'P');
});

test('the bundled completeness table reproduces the verdict from the rule', () => {
  const table = payload.completeness.table;
  assert.ok(table.length >= 3);
  // Re-run the rule on the bundled tail with the bundled median as the seed.
  const seed = [];
  for (let i = 0; i < 12; i += 1) {
    seed.push({
      month: `2000-${String(i + 1).padStart(2, '0')}`,
      reporters: payload.completeness.medianReporters,
    });
  }
  const verdict = classifyMonths([
    ...seed,
    ...table.map((r) => ({ month: r.month, reporters: r.reporters })),
  ]);
  assert.equal(verdict.current, payload.current.month);
  for (const row of table) {
    const again = verdict.months.find((m) => m.month === row.month);
    assert.equal(again.complete, row.complete, `${row.month} complete flag`);
  }
});

test('the source reads once, caches, and refuses a malformed bundle', async () => {
  let calls = 0;
  const source = createBundledGulfSource({
    fetchImpl: (url) => {
      calls += 1;
      return diskFetch(url);
    },
    now: () => Date.parse('2026-09-21T18:00:00Z'),
  });
  const first = await source.getSnapshot();
  const second = await source.getSnapshot();
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(first.counts.producing, payload.counts.producingCurrent);
  assert.equal(first.rows[0].rank, 1);
  assert.ok(first.rows[0].current.gasMcfd >= first.rows[1].current.gasMcfd);
  assert.equal(source.freshnessClass, 'published');

  const failing = createBundledGulfSource({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ nope: true }),
    }),
  });
  await assert.rejects(() => failing.getSnapshot(), /Malformed/);
  const http = createBundledGulfSource({
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  await assert.rejects(() => http.getSnapshot(), /HTTP 404/);
});

test('an abort propagates rather than being swallowed', async () => {
  const controller = new AbortController();
  controller.abort();
  const source = createBundledGulfSource({ fetchImpl: diskFetch });
  await assert.rejects(() => source.getSnapshot({ signal: controller.signal }));
});
