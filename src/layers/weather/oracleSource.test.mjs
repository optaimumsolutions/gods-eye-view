import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURE_ENTRIES, fixtureFetch } from './fixtures.mjs';
import {
  ORACLE_WEATHER_SOURCE_LABEL,
  buildOracleWeatherSnapshot,
  createOracleWeatherSource,
  createPreferredWeatherSource,
} from './oracleSource.js';
import { createOpenMeteoEnsembleSource } from './source.js';

/** The route's shape as rehearsed on the VPS 2026-09-30 (AIFS_ENS, 14 valid days after the init). */
function routePayload(initDate = '2026-09-29') {
  const day = (i) =>
    new Date(Date.parse(`${initDate}T00:00:00Z`) + i * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const series = (mean, step, spread) =>
    Array.from({ length: 14 }, (_, i) => ({
      validAt: day(i + 1),
      mean: mean + step * i,
      p10: mean + step * i - spread,
      p90: mean + step * i + spread,
      spread: spread / 1.3,
      n: 51,
    }));
  return {
    source: 'Oil Oracle store',
    model: 'AIFS_ENS',
    initDate,
    observedAt: `${initDate}T00:00:00Z`,
    publishedAt: `${initDate}T00:00:00Z`,
    fetchedAt: `${initDate}T23:06:39Z`,
    entries: {
      Permian: { TMIN: series(30, -1, 3), FRZDD: series(0, 0.2, 0.1) },
      Texas: { HDD: series(0, 0.5, 1), CDD: series(8, -0.5, 1) },
      // M7: a division carries HDD/CDD and the direct TMEAN (FR-W12)
      'East North Central': {
        HDD: series(12, 0.5, 2),
        CDD: series(0, 0, 0),
        TMEAN: series(53, -0.5, 4),
      },
      CONUS: { GWDD: series(3, 0.1, 0.5) },
    },
  };
}

const DIVISION_ENTRY = {
  id: 'east-north-central',
  kind: 'division',
  name: 'East North Central',
  lat: 41.39,
  lon: -85.49,
  points: [{ name: 'Chicago', lat: 41.85, lon: -87.65, w: 1 }],
  gasShare: 0.239614,
  eia930: ['MIDW'],
  commodities: ['natgas'],
  country: 'US',
};

const bundles = () => ({
  entries: [...FIXTURE_ENTRIES, DIVISION_ENTRY],
  normals: {
    entries: {
      permian: { tmin: new Array(366).fill(40), tmax: new Array(366).fill(60) },
      texas: { tmin: new Array(366).fill(60), tmax: new Array(366).fill(80) },
      'east-north-central': {
        tmin: new Array(366).fill(40),
        tmax: new Array(366).fill(60),
      },
    },
  },
  skill: { vintage: '2026-09-30', models: {} },
});

test('the route payload becomes the layer snapshot: leads from D+1, mean as p50, ring spread = p90 − p10', () => {
  const snap = buildOracleWeatherSnapshot(routePayload(), {
    ...bundles(),
    fetchedAt: Date.UTC(2026, 8, 30, 12),
  });
  assert.equal(snap.source, ORACLE_WEATHER_SOURCE_LABEL);
  assert.equal(snap.meta.initialisedAt, '2026-09-29T00:00:00.000Z');
  const ids = snap.rows.map((r) => r.id);
  assert.deepEqual(
    ids,
    ['permian', 'texas', 'east-north-central'],
    'the Gulf entry has no oracle sample and is left out',
  );
  // M7 (§11.8.15 D7.2 B): the division's anomaly is the direct TMEAN against
  // the ERA5 mean normal (50), never back-derived from degree days
  const enc = snap.rows[2];
  assert.equal(enc.kind, 'division');
  assert.equal(enc.days[0].tmean.p50, 53);
  assert.equal(
    enc.days[0].tmean.spread,
    8,
    'p90 − p10 of TMEAN sizes the ring',
  );
  assert.equal(enc.days[0].anomalyF, 3);
  assert.equal(enc.days[0].anomalyOf, 'TMEAN');
  assert.equal(enc.days[0].normalMean, 50);
  assert.equal(enc.window.hdd14, 213.5);
  assert.equal(enc.window.heatingDays, 14);
  assert.equal(enc.window.coolingDays, 0);
  assert.equal(enc.members, 51);
  assert.equal(enc.gasShare, 0.239614);
  assert.deepEqual(enc.eia930, ['MIDW']);
  const permian = snap.rows[0];
  assert.equal(permian.days.length, 14);
  assert.equal(permian.days[0].lead, 1, 'the oracle keeps no D+0 row');
  assert.equal(permian.days[13].lead, 14);
  assert.equal(permian.days[0].tmin.p50, 30);
  assert.equal(
    permian.days[0].tmin.spread,
    6,
    "p90 − p10, not the store's standard deviation",
  );
  assert.equal(permian.members, 51);
  // anomaly vs the ERA5 TMIN normal (40): D+1 −10 → colder
  assert.equal(permian.days[0].anomalyF, -10);
  assert.equal(permian.days[0].band, 'colder');
  assert.equal(permian.days[0].anomalyOf, 'TMIN');
  // p10 = 27 − i is below the 25°F heuristic from i = 3 (D+4) → 11 of 14 days
  assert.equal(permian.window.freezeDays, 11);
  assert.equal(permian.window.freezeDaysP50, 8);
  const texas = snap.rows[1];
  assert.equal(
    texas.days[0].tmin.p50,
    null,
    'regions carry degree days, not TMIN',
  );
  assert.equal(texas.days[0].cdd.p50, 8);
  // mean T = 65 − 0 + 8 = 73 vs normal (60+80)/2 = 70 → +3 near normal, labelled as derived
  assert.equal(texas.days[0].anomalyF, 3);
  assert.equal(texas.days[0].anomalyOf, 'mean (from degree days)');
  assert.equal(texas.window.cdd14, 66.5);
  assert.equal(
    permian.window.hdd14,
    null,
    'the store scores no degree days at basins',
  );
  assert.equal(texas.window.galeDays, null);
  assert.equal(permian.days[0].observation.freshnessClass, 'daily');
  assert.equal(permian.days[0].observation.validAt, '2026-09-30T00:00:00.000Z');
  assert.equal(permian.days[0].observation.source, ORACLE_WEATHER_SOURCE_LABEL);
  assert.equal(buildOracleWeatherSnapshot({ entries: {} }, bundles()), null);
});

test('the oracle source re-reads the route each update and rebuilds only on a new init; stale runs lose', async () => {
  const fx = fixtureFetch();
  let payload = routePayload('2026-09-29');
  let calls = 0;
  const fetchImpl = async (url, opts) => {
    if (String(url).startsWith('/api/oracle/weather-forecast')) {
      calls += 1;
      assert.match(String(url), /model=AIFS_ENS$/);
      return { ok: true, status: 200, json: async () => payload };
    }
    return fx.fetchImpl(url, opts);
  };
  const now = () => Date.UTC(2026, 8, 30, 12);
  const source = createOracleWeatherSource({ fetchImpl, now });
  const a = await source.getSnapshot();
  const b = await source.getSnapshot();
  assert.equal(a, b, 'same init → cached snapshot');
  assert.equal(calls, 2, 'the route is cheap and is read every update');
  payload = routePayload('2026-09-30');
  const c = await source.getSnapshot();
  assert.notEqual(c, a);
  assert.equal(c.meta.initialisedAt, '2026-09-30T00:00:00.000Z');
  payload = routePayload('2026-09-20');
  await assert.rejects(
    () => source.getSnapshot(),
    /stale: newest run 2026-09-20/,
  );
  const lenient = createOracleWeatherSource({
    fetchImpl,
    now,
    maxLagDays: Infinity,
  });
  assert.equal(
    (await lenient.getSnapshot()).meta.initialisedAt,
    '2026-09-20T00:00:00.000Z',
  );
});

test('preferred: the oracle answers first; without a console Open-Meteo answers and the snapshot names it', async () => {
  const fx = fixtureFetch();
  let oracleUp = false;
  const fetchImpl = async (url, opts) => {
    if (String(url).startsWith('/api/oracle/'))
      return oracleUp
        ? {
            ok: true,
            status: 200,
            json: async () => routePayload('2026-09-30'),
          }
        : { ok: false, status: 502, json: async () => ({}) };
    return fx.fetchImpl(url, opts);
  };
  const now = () => Date.UTC(2026, 8, 30, 12);
  const fallbacks = [];
  const source = createPreferredWeatherSource({
    primary: createOracleWeatherSource({ fetchImpl, now }),
    fallback: createOpenMeteoEnsembleSource({ fetchImpl, now }),
    onFallback: (e) => fallbacks.push(e.message),
  });
  const viaOpenMeteo = await source.getSnapshot();
  assert.equal(viaOpenMeteo.rows[0].source, 'ECMWF AIFS ENS via Open-Meteo');
  assert.equal(
    viaOpenMeteo.rows.length,
    3,
    'the Gulf entry is present from Open-Meteo',
  );
  assert.deepEqual(fallbacks, ['Oil Oracle weather-forecast HTTP 502']);
  oracleUp = true;
  const viaOracle = await source.getSnapshot();
  assert.equal(viaOracle.source, ORACLE_WEATHER_SOURCE_LABEL);
  assert.equal(fallbacks.length, 1, 'the fallback notice prints once');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => source.getSnapshot({ signal: controller.signal }));
});
