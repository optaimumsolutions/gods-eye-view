import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  createBundledOnshoreSource,
  ONSHORE_REGION_IDS,
} from './bundledSource.js';
import { READING_COLUMNS } from './records.js';
import { classifyMonths } from '../production/completeness.js';
import { shardFor } from './shards.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = path.join(
  here,
  '..',
  '..',
  'data',
  'local_data',
  'onshore',
  'williston',
);
const shardDir = path.join(
  here,
  '..',
  '..',
  '..',
  'public',
  'data',
  'onshore',
  'williston',
  'history',
);
const readBundle = (name) => readFileSync(path.join(dataDir, name), 'utf8');
const manifest = JSON.parse(readBundle('source.json'));
const index = JSON.parse(readBundle('index.json'));
const clusters = JSON.parse(readBundle('clusters.json'));

const diskFetch = (url) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => JSON.parse(readBundle(String(url).split('/').pop())),
  });

test('source.json sha256, byte counts and the gzip budgets hold for the committed bytes (G3)', () => {
  for (const [name, budget] of [
    ['index.json', 3 * 1024 * 1024],
    ['clusters.json', 1024 * 1024],
  ]) {
    const text = readBundle(name);
    const entry = manifest.files.find((f) => f.path === name);
    assert.ok(entry, name);
    assert.equal(
      createHash('sha256').update(text).digest('hex'),
      entry.sha256,
      name,
    );
    assert.equal(Buffer.byteLength(text), entry.bytes, name);
    const gzip = gzipSync(text).length;
    assert.equal(gzip, entry.gzip_bytes, name);
    assert.ok(gzip <= budget, `${name} gzip ${gzip} B over budget`);
  }
  assert.equal(manifest.shards.committed, false);
  assert.ok(
    manifest.shards.max_gzip_bytes <= 64 * 1024,
    'largest shard within 64 KB gzip',
  );
});

test('the committed bundle is the measured one: North Dakota wells, 2026-07 current, 120 months', () => {
  assert.deepEqual([...ONSHORE_REGION_IDS], ['williston']);
  assert.equal(index.region.id, 'williston');
  assert.equal(index.region.layerId, 'production-williston');
  assert.deepEqual(index.region.states, ['ND']);
  assert.deepEqual(index.readingColumns, [...READING_COLUMNS]);
  assert.equal(index.months.length, 120);
  assert.equal(index.current.month, '2026-07');
  assert.equal(index.months.at(-1), '2026-07');
  assert.equal(index.current.index, 119);
  // Measured 2026-09-21: 24,154 wells in the window, 20,231 filed for July,
  // 17,915 producing at 3.30 Bcf/d and 1.17 MMbbl/d.
  assert.ok(
    index.facilities.length >= 20_000 && index.facilities.length <= 30_000,
  );
  assert.equal(index.facilities.length, index.counts.placed);
  assert.equal(index.counts.unplaced, 0);
  assert.ok(index.counts.reported >= 18_000 && index.counts.reported <= 25_000);
  assert.ok(
    index.counts.producing >= 15_000 && index.counts.producing <= 22_000,
  );
  assert.ok(index.counts.gasMcfdTotal > 2_500_000, 'well over 2.5 Bcf/d');
  assert.ok(index.counts.oilBbldTotal > 900_000, 'well over 0.9 MMbbl/d');
  assert.equal(
    index.counts.producing + index.counts.quiet + index.counts.absent,
    index.counts.facilities,
  );
  const statuses = new Map();
  for (const f of index.facilities) {
    assert.ok(
      Number.isFinite(f.lat) && Number.isFinite(f.lon),
      `${f.id} has no coordinates`,
    );
    assert.ok(
      f.lat > 45.9 && f.lat < 49.1 && f.lon > -104.1 && f.lon < -96.5,
      `${f.id} is outside North Dakota`,
    );
    assert.match(f.id, /^33\d{12}$/, `${f.id} is not a North Dakota API-14`);
    statuses.set(f.status, (statuses.get(f.status) ?? 0) + 1);
    if (f.current) assert.equal(f.current.length, READING_COLUMNS.length);
    if (f.status === 'absent') assert.equal(f.current, null);
  }
  assert.equal(statuses.get('producing'), index.counts.producing);
  assert.equal(statuses.get('quiet'), index.counts.quiet);
  assert.equal(statuses.get('absent'), index.counts.absent);
  // Clusters: every field and county carries the whole window.
  assert.equal(clusters.months.length, 120);
  assert.equal(clusters.fields.length, index.counts.fields);
  assert.equal(clusters.counties.length, index.counts.counties);
  assert.ok(clusters.fields.length >= 400 && clusters.fields.length <= 700);
  assert.equal(clusters.counties.length, 16);
  for (const c of [...clusters.fields, ...clusters.counties]) {
    for (const key of ['gas', 'oil', 'water', 'flared', 'producing'])
      assert.equal(c.series[key].length, 120, `${c.id} ${key} length`);
  }
  // The sum of the field clusters' current gas is the index's total.
  const fieldGas = clusters.fields.reduce(
    (s, c) => s + (c.series.gas[119] ?? 0),
    0,
  );
  assert.ok(
    Math.abs(fieldGas - index.counts.gasMcfTotal) < 1,
    'fields sum to the region',
  );
});

test('the reconciliation with EIA is inside the recorded tolerance (G1, O8)', () => {
  const latest = index.reconciliation.latest;
  assert.ok(latest, 'a month common to the state file and EIA');
  assert.equal(latest.month, '2026-06');
  // Measured 2026-09-21: 94 % of gross withdrawals, 100 % of marketed
  // production, oil 87 % — state filings omit confidential wells and late
  // filers; EIA estimates them. The tolerance is the structural gap O8 names.
  assert.ok(
    latest.gasToGross >= 0.85 && latest.gasToGross <= 1.05,
    `gas to gross ${latest.gasToGross}`,
  );
  assert.ok(
    latest.gasToMarketed >= 0.9 && latest.gasToMarketed <= 1.1,
    `gas to marketed ${latest.gasToMarketed}`,
  );
  assert.ok(
    latest.oilToEia >= 0.8 && latest.oilToEia <= 1.05,
    `oil ${latest.oilToEia}`,
  );
  assert.deepEqual(index.reconciliation.series, [
    'N9010ND2',
    'N9050ND2',
    'MCRFPND1',
  ]);
  const eia = clusters.reconciliation.find((r) => r.month === latest.month);
  assert.equal(eia.eiaGrossMcf, latest.eiaGrossMcf);
  assert.equal(eia.regionGasMcf, latest.regionGasMcf);
});

test('the bundled completeness table reproduces the verdict from the rule', () => {
  const table = index.completeness.table;
  assert.ok(table.length >= 3);
  const seed = [];
  for (let i = 0; i < 12; i += 1) {
    seed.push({
      month: `2000-${String(i + 1).padStart(2, '0')}`,
      reporters: index.completeness.medianReporters,
    });
  }
  const verdict = classifyMonths([
    ...seed,
    ...table.map((r) => ({ month: r.month, reporters: r.reporters })),
  ]);
  assert.equal(verdict.current, index.current.month);
  for (const row of table) {
    const again = verdict.months.find((m) => m.month === row.month);
    assert.equal(again.complete, row.complete, `${row.month} complete flag`);
  }
  // The anomaly the file carries is recorded, never silently corrected.
  assert.ok(
    index.anomalies.some((a) => /ReportDate column reads 2023-07-01/.test(a)),
    'the 2026-07 ReportDate anomaly is recorded',
  );
});

test('history shards, when built, cover every well at the shard the hash names', (t) => {
  if (!existsSync(shardDir)) {
    t.diagnostic('history shards not built on this checkout (O1); skipped');
    return;
  }
  const files = readdirSync(shardDir).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, manifest.shards.count);
  assert.equal(index.shards.count, manifest.shards.count);
  // Spot-check: the top producer sits in the shard its id hashes to, with the whole window.
  const top = [...index.facilities]
    .filter((f) => f.current && f.current[READING_COLUMNS.indexOf('gas')] > 0)
    .sort((a, b) => b.current[4] - a.current[4])[0];
  const shard = JSON.parse(
    readFileSync(
      path.join(shardDir, `${shardFor(top.id, index.shards.count)}.json`),
      'utf8',
    ),
  );
  assert.equal(shard.months.length, 120);
  assert.deepEqual(shard.columns, [...READING_COLUMNS]);
  assert.ok(shard.facilities[top.id], 'the top producer is in its shard');
  assert.equal(shard.facilities[top.id].gas.length, 120);
  assert.equal(shard.facilities[top.id].gas[119], top.current[4]);
});

test('the source reads both files once, caches, and refuses a malformed bundle', async () => {
  let calls = 0;
  const source = createBundledOnshoreSource({
    region: 'williston',
    urls: { index: 'x/index.json', clusters: 'x/clusters.json' },
    fetchImpl: (url) => {
      calls += 1;
      return diskFetch(url);
    },
    now: () => Date.parse('2026-09-21T18:00:00Z'),
  });
  const first = await source.getSnapshot();
  const second = await source.getSnapshot();
  assert.equal(calls, 2);
  assert.equal(first, second);
  assert.equal(first.counts.producing, index.counts.producing);
  assert.equal(first.rows.length, index.facilities.length);
  assert.equal(first.clusters.fields.length, clusters.fields.length);
  assert.equal(first.rows[0].rank, 1);
  assert.ok(first.rows[0].current.gasMcfd >= first.rows[1].current.gasMcfd);
  assert.equal(source.freshnessClass, 'published');
  assert.match(first.asOf, /^as of 2026-07 · ND DMR$/);

  const failing = createBundledOnshoreSource({
    region: 'williston',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ nope: true }),
    }),
  });
  await assert.rejects(() => failing.getSnapshot(), /Malformed/);
  const http = createBundledOnshoreSource({
    region: 'williston',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  await assert.rejects(() => http.getSnapshot(), /HTTP 404/);
  assert.throws(
    () => createBundledOnshoreSource({ region: 'permian' }),
    /no onshore bundle/,
  );
});

test('an abort propagates rather than being swallowed', async () => {
  const controller = new AbortController();
  controller.abort();
  const source = createBundledOnshoreSource({
    region: 'williston',
    fetchImpl: diskFetch,
  });
  await assert.rejects(() => source.getSnapshot({ signal: controller.signal }));
});
