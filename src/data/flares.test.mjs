import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLARE_REGIONS,
  PAD_LINK_M,
  classifyDetection,
  clearBaseline,
  clusterPads,
  distanceM,
  firmsNrtUrl,
  FIRMS_NRT_FEEDS,
  inBox,
  matchRadiusM,
  mergeDetections,
  nightIsFinal,
  nightMetrics,
  nightOverpasses,
  nightPips,
  nightSky,
  overpassMs,
  parseIemAsos,
  parseViirsCsv,
  pointIndex,
  siteCloud,
  skyState,
  stationCoverage,
  suspectNight,
} from './flares.js';

const CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
48.80848,-103.32426,300.47,0.43,0.38,2026-09-22,0850,N20,nominal,2.0NRT,281.68,0.64,N
48.76387,-103.28286,308.91,0.79,0.78,2026-09-22,850,N20,nominal,2.0NRT,279.69,1.17,N
bad,row
32.1,-102.1,330.0,0.40,0.40,2026-09-22,1930,N,high,2.0NRT,300.0,5.5,D
`;

test('parseViirsCsv keeps pixel size, pads the time, skips bad rows', () => {
  const rows = parseViirsCsv(CSV);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].scanKm, 0.43);
  assert.equal(rows[1].acqTime, '0850');
  assert.equal(rows[2].daynight, 'D');
  assert.equal(overpassMs(rows[1]), Date.parse('2026-09-22T08:50:00Z'));
});

test('parseViirsCsv tells an upstream error from no detections', () => {
  assert.equal(parseViirsCsv('<html>Error</html>'), null);
  assert.equal(parseViirsCsv('Invalid MAP_KEY'), null);
  assert.deepEqual(parseViirsCsv(CSV.split('\n')[0] + '\n'), []);
});

test('the keyless URL names the satellite file and window', () => {
  assert.equal(
    firmsNrtUrl(FIRMS_NRT_FEEDS[1], '7d'),
    'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_7d.csv',
  );
});

test('the Williston box is North Dakota: Saskatchewan and Montana stay out', () => {
  const box = FLARE_REGIONS.williston.box;
  assert.equal(inBox({ lat: 48.5, lon: -103 }, box), true);
  assert.equal(inBox({ lat: 49.02, lon: -103.64 }, box), false);
  assert.equal(inBox({ lat: 47.8, lon: -104.3 }, box), false);
});

test('match radius never falls under 750 m and grows toward the scan edge', () => {
  assert.equal(matchRadiusM({ scanKm: 0.38, trackKm: 0.36 }), 750);
  const edge = matchRadiusM({ scanKm: 0.8, trackKm: 0.78 });
  assert.ok(edge > 900 && edge < 1000, String(edge));
});

test('distanceM is right to a fraction of a percent at basin scale', () => {
  // 0.01° of latitude is 1,111.95 m on a 6,371 km sphere.
  assert.ok(Math.abs(distanceM(48, -103, 48.01, -103) - 1111.95) < 1);
});

test('classifyDetection splits site, unlisted well and other', () => {
  const sites = pointIndex([{ id: 's1', lat: 48.0, lon: -103.0 }]);
  const wells = pointIndex([
    { id: 'w1', lat: 48.0, lon: -103.0 },
    { id: 'w2', lat: 48.1, lon: -103.0 },
  ]);
  const at = (lat, lon) => ({ lat, lon, scanKm: 0.4, trackKm: 0.4 });
  const a = classifyDetection(at(48.005, -103.0), sites, wells);
  assert.equal(a.kind, 'site');
  assert.equal(a.site.id, 's1');
  assert.equal(
    classifyDetection(at(48.104, -103.0), sites, wells).kind,
    'unlisted',
  );
  assert.equal(classifyDetection(at(48.3, -103.0), sites, wells).kind, 'other');
});

test('nightPips keeps only unmatched heat, with position, FRP and kind', () => {
  const sites = pointIndex([{ id: 's1', lat: 48.0, lon: -103.0 }]);
  const wells = pointIndex([
    { id: 'w1', lat: 48.0, lon: -103.0 },
    { id: 'w2', lat: 48.1, lon: -103.0 },
  ]);
  const at = (lat, lon, frp) => ({ lat, lon, frp, scanKm: 0.4, trackKm: 0.4 });
  const pips = nightPips(
    [at(48.005, -103.0, 9.1), at(48.104, -103.0, 2.345), at(48.3, -103.0, 0)],
    sites,
    wells,
  );
  assert.deepEqual(pips, [
    { lat: 48.104, lon: -103.0, frp: 2.35, kind: 'unlisted' },
    { lat: 48.3, lon: -103.0, frp: 0, kind: 'other' },
  ]);
  assert.deepEqual(nightPips(undefined, sites, wells), []);
});

test('pointIndex finds the nearest point across grid cells', () => {
  const idx = pointIndex([
    { id: 'a', lat: 47.9999, lon: -103.0001 },
    { id: 'b', lat: 48.006, lon: -103.0 },
  ]);
  assert.equal(idx.nearest(48.0001, -102.9999, 800).point.id, 'a');
  assert.equal(idx.nearest(48.5, -103, 800), null);
});

const IEM = `station,valid,skyc1,skyc2,skyc3
HOB,2026-09-24 08:55,SCT,OVC,M
CNM,2026-09-24 08:53,BKN,BKN,M
MAF,2026-09-24 08:53,CLR,M,M
MAF,2026-09-24 05:53,OVC,M,M
PEQ,2026-09-24 08:55,FEW,M,M
`;

test('parseIemAsos reads stations, UTC times and layers', () => {
  const r = parseIemAsos(IEM);
  assert.equal(r.length, 5);
  assert.deepEqual(r[0].layers, ['SCT', 'OVC']);
  assert.equal(r[0].validMs, Date.parse('2026-09-24T08:55:00Z'));
  assert.equal(parseIemAsos('<html>'), null);
});

test('skyState uses the report nearest the overpass per station', () => {
  const r = parseIemAsos(IEM);
  const at = Date.parse('2026-09-24T09:00:00Z');
  // HOB and CNM covered, MAF clear (its 05:53 OVC is too far), PEQ clear.
  assert.deepEqual(skyState(r, at), {
    state: 'partial',
    stations: 4,
    covered: 2,
  });
  const two = r.filter((x) => x.station !== 'PEQ' && x.station !== 'MAF');
  assert.equal(skyState(two, at).state, 'obscured');
  assert.equal(
    skyState(r, Date.parse('2026-09-25T09:00:00Z')).state,
    'unknown',
  );
});

test('clusterPads links wells under 150 m, chains through neighbours, sorts by id', () => {
  // 0.001° of latitude is about 111 m.
  const wells = [
    { id: 'c', lat: 48.002, lon: -103 }, // 111 m from b: same pad through b
    { id: 'b', lat: 48.001, lon: -103 },
    { id: 'a', lat: 48.0, lon: -103 },
    { id: 'z', lat: 48.01, lon: -103 }, // 900 m away: its own pad
  ];
  const pads = clusterPads(wells);
  assert.equal(PAD_LINK_M, 150);
  assert.deepEqual(
    pads.map((p) => p.map((w) => w.id)),
    [['a', 'b', 'c'], ['z']],
  );
  assert.equal(clusterPads(wells, 100).length, 4);
  assert.deepEqual(clusterPads([]), []);
});

test('clusterPads is independent of input order', () => {
  const wells = Array.from({ length: 40 }, (_, i) => ({
    id: String(i).padStart(3, '0'),
    lat: 48 + (i % 7) * 0.0009,
    lon: -103 + Math.floor(i / 7) * 0.003,
  }));
  const ids = (pads) => JSON.stringify(pads.map((p) => p.map((w) => w.id)));
  assert.equal(ids(clusterPads(wells)), ids(clusterPads([...wells].reverse())));
});

// --- M2 fixtures (FR-F2 to F5) ---

const det = (over = {}) => ({
  lat: 48.0,
  lon: -103.0,
  frp: 1.5,
  scanKm: 0.4,
  trackKm: 0.4,
  brightTi4: 300,
  brightTi5: 280,
  acqDate: '2026-10-18',
  acqTime: '0850',
  satellite: 'N20',
  confidence: 'nominal',
  daynight: 'N',
  ...over,
});

test('a night file is final 36 hours after its UTC date begins', () => {
  const night = '2026-10-18';
  assert.equal(
    nightIsFinal(night, Date.parse('2026-10-19T11:59:00Z')),
    false,
  );
  assert.equal(nightIsFinal(night, Date.parse('2026-10-19T12:01:00Z')), true);
  assert.equal(nightIsFinal('garbage', Date.parse('2026-10-19T12:01Z')), false);
});

test('mergeDetections deduplicates across the 24h and 7d files, deterministically', () => {
  const a = det();
  const b = det({ lon: -103.001 });
  const merged = mergeDetections([a], [b, { ...a }]);
  assert.equal(merged.length, 2);
  assert.equal(
    JSON.stringify(mergeDetections([b], [a])),
    JSON.stringify(mergeDetections([a, b], [])),
  );
});

test('nightOverpasses takes the median pass per satellite', () => {
  const passes = nightOverpasses([
    det({ acqTime: '0848' }),
    det({ acqTime: '0850' }),
    det({ acqTime: '0902' }),
    det({ satellite: 'N', acqTime: '0930' }),
  ]);
  assert.deepEqual(
    passes.map((p) => p.satellite),
    ['N20', 'N'],
  );
  assert.equal(passes[0].ms, Date.parse('2026-10-18T08:50:00Z'));
});

const OVC_NIGHT = `station,valid,skyc1,skyc2,skyc3
XWA,2026-10-18 08:53,OVC,M,M
ISN,2026-10-18 08:55,OVC,M,M
DIK,2026-10-18 08:56,BKN,M,M
MOT,2026-10-18 08:53,CLR,M,M
`;

test('an OVC night reads obscured for the region and the sites under it (G15.3)', () => {
  const reports = parseIemAsos(OVC_NIGHT);
  const passes = nightOverpasses([det()]);
  assert.equal(nightSky(reports, passes).state, 'obscured');
  const coverage = stationCoverage(reports, passes);
  assert.equal(coverage.get('XWA'), true);
  assert.equal(coverage.get('MOT'), false);
  // A site by Williston sits under the deck; one by Minot is clear.
  assert.equal(siteCloud({ lat: 48.2, lon: -103.7 }, coverage), 'obscured');
  assert.equal(siteCloud({ lat: 48.25, lon: -101.3 }, coverage), 'clear');
  assert.equal(siteCloud({ lat: 48, lon: -103 }, new Map()), 'unknown');
});

test('nightMetrics takes the per-site maximum FRP, never the pixel sum', () => {
  const sites = pointIndex([{ id: 's1', lat: 48.0, lon: -103.0 }]);
  const wells = pointIndex([{ id: 'w1', lat: 48.0, lon: -103.0 }]);
  const m = nightMetrics({
    night: '2026-10-18',
    detections: [
      det({ frp: 2.5 }),
      det({ frp: 1.0, lon: -103.001 }),
      det({ lat: 48.3, frp: 9 }), // near nothing: other
    ],
    sites,
    wells,
    reports: parseIemAsos(OVC_NIGHT),
  });
  assert.equal(m.litSites, 1);
  assert.equal(m.sites[0].maxFrp, 2.5);
  assert.equal(m.siteFrpMw, 2.5);
  assert.deepEqual(m.counts, { site: 2, unlisted: 0, other: 1 });
  assert.equal(m.cloud.state, 'obscured');
  assert.deepEqual(m.satellites, ['N20']);
});

test('a dropout night goes suspect only once enough clear nights exist (G15.3)', () => {
  const clearNight = (litSites) => ({
    cloud: { state: 'clear' },
    suspect: false,
    litSites,
    siteFrpMw: litSites * 2,
  });
  const few = clearBaseline([clearNight(100), clearNight(90)]);
  assert.equal(suspectNight(10, few), false); // 2 clear nights: no judgement
  const nights = [100, 95, 105, 98, 102, 101].map(clearNight);
  const base = clearBaseline(nights);
  assert.equal(base.clearNights, 6);
  assert.ok(Math.abs(base.litMedian - 100.5) < 0.6, String(base.litMedian));
  assert.equal(suspectNight(39, base), true); // under 40 % of the median
  assert.equal(suspectNight(45, base), false);
});

test('clearBaseline skips covered and suspect nights and caps the window', () => {
  const nights = [
    { cloud: { state: 'obscured' }, suspect: false, litSites: 3, siteFrpMw: 1 },
    { cloud: { state: 'clear' }, suspect: true, litSites: 5, siteFrpMw: 2 },
    ...Array.from({ length: 40 }, (_, i) => ({
      cloud: { state: 'clear' },
      suspect: false,
      litSites: 100 + i,
      siteFrpMw: 200,
    })),
  ];
  const base = clearBaseline(nights, 30);
  assert.equal(base.clearNights, 30);
  assert.ok(base.litMedian >= 100 && base.litMedian <= 139);
});
