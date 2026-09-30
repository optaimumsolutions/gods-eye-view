import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  localCardLines,
  regionalCardLines,
} from '../layers/datacenters/model.js';
import { buildSelectedPortCard } from '../layers/ports/model.js';
import { isUsPort } from '../layers/ports/records.js';
import {
  FIXTURE_ENTRIES,
  FIXTURE_META,
  fixtureFetch,
  fixtureNormals,
  fixturePayload,
  fixtureSkill,
} from '../layers/weather/fixtures.mjs';
import {
  blocksByEntry,
  flattenPoints,
  normalizeMeta,
} from '../layers/weather/live.js';
import { buildWeatherSnapshot } from '../layers/weather/records.js';
import { createOpenMeteoEnsembleSource } from '../layers/weather/source.js';
import {
  FORECAST_MAX_KM,
  createWeatherForecastService,
  formatForecastLine,
  haversineKm,
  nearestRow,
  readingFor,
} from './weatherForecast.js';

const rows = () => {
  const { points, slices } = flattenPoints(FIXTURE_ENTRIES);
  return buildWeatherSnapshot({
    entries: FIXTURE_ENTRIES,
    blocksByEntry: blocksByEntry(fixturePayload(), slices, points.length),
    meta: normalizeMeta(FIXTURE_META),
    normals: fixtureNormals(),
    skill: fixtureSkill(),
    fetchedAt: Date.UTC(2026, 8, 30, 15, 31),
  }).rows;
};

test('nearest entry within 500 km, with its distance; nothing beyond it', () => {
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.2) < 0.5);
  const r = rows();
  // Midland TX (31.99, -102.08) → the Permian fixture at (32, -103): ~87 km
  const near = nearestRow(r, 31.99, -102.08);
  assert.equal(near.row.id, 'permian');
  assert.ok(near.km > 80 && near.km < 95, `km ${near.km}`);
  // Seattle is more than 500 km from every fixture entry
  assert.equal(nearestRow(r, 47.6, -122.3), null);
  assert.equal(nearestRow(r, 47.6, -122.3, 5000).row.id, 'permian');
  assert.equal(FORECAST_MAX_KM, 500);
});

test('the card line names the entry, its distance, the heuristic and the stamp, per kind', () => {
  const r = rows();
  const basin = formatForecastLine(readingFor(r, 31.99, -102.08, 3));
  assert.match(
    basin,
    /^forecast D\+3 · min p10 -?\d+°F · \d+ freeze days \(heuristic 25°F\) · Permian \d+ km · issued 00Z 09-30$/,
  );
  const region = formatForecastLine(readingFor(r, 32.78, -96.8, 2)); // Dallas → the Texas region (~210 km)
  assert.match(
    region,
    /^forecast D\+2 · HDD14 \d+ · CDD14 \d+ · Texas \d+ km · issued 00Z 09-30$/,
  );
  const gulf = formatForecastLine(readingFor(r, 29.7, -93.9, 1)); // Sabine Pass → Gulf LNG coast
  assert.match(
    gulf,
    /^forecast D\+1 · wind p90 \d+ mph · wave (n\/a|\d+\.\d) m · \d+ gale days \(≥ 39 mph\) · Gulf LNG coast \d+ km · issued 00Z 09-30$/,
  );
  assert.equal(formatForecastLine(null), null);
  assert.equal(readingFor(r, 47.6, -122.3, 1), null);
});

test('the service loads once per TTL, follows the lead, and never throws into a card', async () => {
  const fx = fixtureFetch();
  let t = 0;
  const source = createOpenMeteoEnsembleSource({
    fetchImpl: fx.fetchImpl,
    now: () => t,
  });
  const service = createWeatherForecastService({
    source,
    now: () => t,
    ttlMs: 1000,
  });
  assert.equal(
    service.lineFor(31.99, -102.08),
    null,
    'nothing before the first refresh',
  );
  const changes = [];
  service.subscribe(() => changes.push(service.getLead()));
  await service.refresh();
  const upstream = () =>
    fx.calls.filter((u) => u.includes('open-meteo.com')).length;
  const n1 = upstream();
  await service.refresh();
  assert.equal(upstream(), n1, 'inside the TTL no request is made');
  t = 2000;
  await service.refresh();
  assert.equal(
    upstream(),
    n1 + 1,
    'past the TTL only the metadata is re-read (same run)',
  );
  const d1 = service.lineFor(31.99, -102.08);
  assert.match(d1, /^forecast D\+1 · /);
  service.setLead(5);
  assert.match(service.lineFor(31.99, -102.08), /^forecast D\+5 · /);
  assert.deepEqual(
    changes,
    [1, 5],
    'a change is emitted on load and on a lead step',
  );
  // a failing source keeps the last snapshot
  const failing = createWeatherForecastService({
    source: {
      label: 'x',
      async getSnapshot() {
        throw new Error('down');
      },
    },
  });
  assert.equal(await failing.refresh(), null);
  assert.equal(failing.lineFor(31.99, -102.08), null);
});

test('campus cards carry the forecast line after grid and weather; port cards only for US ports', () => {
  const row = {
    status: 'operating',
    rank: 1,
    itPowerMw: 100,
    plannedItPowerMw: null,
    owner: 'x',
    users: [],
    h100e: null,
    facilityPowerMw: null,
    power: { gridUtility: 'ERCOT', onSiteGeneration: { type: null } },
    plannedFacilityPowerMw: null,
    assets: [],
  };
  const live = {
    grid: null,
    weather: null,
    forecastLine:
      'forecast · D+1 HDD14 0 · CDD14 62 (Texas 45 km) · issued 00Z 09-30 · valid 10-01',
  };
  assert.ok(localCardLines(row, live).includes(live.forecastLine));
  assert.ok(regionalCardLines(row, live).includes(live.forecastLine));
  assert.ok(!localCardLines(row, null).some((l) => /forecast/.test(l)));
  const port = {
    id: 'p1',
    name: 'Houston',
    lat: 29.73,
    lon: -95.27,
    status: 'thin',
    recentAvg: 1,
    recentDays: 7,
    baselineAvg: 1,
    baselineDays: 90,
    recentContainers: 2,
    annualTankers: 300,
    country: 'United States',
    latestDate: '2026-09-25',
  };
  const line =
    'forecast · D+1 HDD14 0 · CDD14 62 (Texas 45 km) · issued 00Z 09-30 · valid 10-01';
  assert.equal(buildSelectedPortCard(port, null, line).details.at(-1), line);
  assert.equal(buildSelectedPortCard(port, null, null).details.length, 3);
  assert.equal(isUsPort(port), true);
  assert.equal(isUsPort({ lat: 51.9, lon: 4.1 }), false, 'Rotterdam');
  assert.equal(
    isUsPort({ lat: 21.3, lon: -157.9 }),
    false,
    'Honolulu is outside the gazetteer box',
  );
});
