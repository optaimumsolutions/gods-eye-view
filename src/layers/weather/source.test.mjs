import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureFetch } from './fixtures.mjs';
import { createOpenMeteoEnsembleSource } from './source.js';

test('a refresh costs at most four requests and re-fetches data only on a new run (goal 4)', async () => {
  const fx = fixtureFetch();
  const source = createOpenMeteoEnsembleSource({
    fetchImpl: fx.fetchImpl,
    now: () => 0,
  });
  const first = await source.getSnapshot();
  assert.equal(first.rows.length, 3);
  // bundles (3) + meta + ensemble + marine on the first read
  assert.equal(fx.calls.length, 6);
  const dataCalls = () =>
    fx.calls.filter(
      (u) => u.includes('/v1/ensemble') || u.includes('/v1/marine'),
    ).length;
  assert.equal(dataCalls(), 2);
  // a simulated day: 48 half-hourly polls, four runs landing along the way
  for (let poll = 1; poll <= 48; poll++) {
    if (poll % 12 === 0) fx.newRun(6);
    await source.getSnapshot();
  }
  // upstream calls only: the three bundles are static assets, fetched once
  const upstream = fx.calls.filter((u) => u.includes('open-meteo.com')).length;
  assert.ok(upstream < 60, `upstream requests across a day: ${upstream}`);
  assert.equal(fx.calls.length - upstream, 3);
  // 4 new runs → 4 more ensemble + 4 more marine reads, nothing on the other 44 polls
  assert.equal(dataCalls(), 2 + 8);
  assert.equal(
    fx.calls.filter((u) => u.includes('/static/meta.json')).length,
    49,
  );
  assert.equal(source.getStats().run.initialisedAt, '2026-10-01T00:00:00.000Z');
});

test('a failed fetch keeps the previous run and records the error per feed', async () => {
  const fx = fixtureFetch();
  let failEnsemble = false;
  const fetchImpl = async (url) => {
    if (failEnsemble && String(url).includes('/v1/ensemble'))
      return { ok: false, status: 503, json: async () => ({}) };
    return fx.fetchImpl(url);
  };
  const source = createOpenMeteoEnsembleSource({ fetchImpl });
  const first = await source.getSnapshot();
  failEnsemble = true;
  fx.newRun(6);
  const second = await source.getSnapshot();
  assert.equal(second, first, 'the cached run is returned unchanged');
  assert.match(source.getStats().errors.ensemble, /HTTP 503/);
  failEnsemble = false;
  const third = await source.getSnapshot();
  assert.notEqual(third, first);
  assert.equal(source.getStats().errors.ensemble, undefined);
});

test('the first read fails loudly when there is no cache to fall back to', async () => {
  const source = createOpenMeteoEnsembleSource({
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  await assert.rejects(() => source.getSnapshot(), /HTTP 500/);
});

test('Gulf rows carry the marine days with their own stamp; readings name the model', async () => {
  const fx = fixtureFetch();
  const source = createOpenMeteoEnsembleSource({ fetchImpl: fx.fetchImpl });
  const snap = await source.getSnapshot();
  const gulf = snap.rows.find((r) => r.kind === 'gulf');
  assert.equal(gulf.marine.length, 7);
  assert.equal(gulf.marine[2].waveMax, 2.1);
  for (const row of snap.rows)
    assert.equal(row.source, 'ECMWF AIFS ENS via Open-Meteo');
  assert.equal(snap.rows.find((r) => r.kind === 'basin').marine, undefined);
});
