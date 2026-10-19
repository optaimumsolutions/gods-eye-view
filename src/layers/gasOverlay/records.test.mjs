import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGasOverlaySnapshot,
  nearestUtilization,
  normalizeBundles,
  normalizeOverlayPayload,
  parseCsv,
  utilizationClass,
} from './records.js';

const POINTS_CSV = `pipeline,loc,name,type,flows,county,state,counterparty,design_dth,lon,lat,method,confidence,why
gulf_south,24329,Stratton Ridge,PLT,D,BRAZORIA,TX,Freeport LNG,600000,-95.35,29.05,manual,0.9,"pretreatment, not the terminal"
gulf_south,9999,Dark Tap,LDC,D,ACADIA,LA,,1000,-92.3,30.2,snap_to_line,0.4,middle of the line
gulf_run,808311,Golden Pass PL,INT,D,CALCASIEU,LA,GPPL,200,-93.6024,30.3595,manual,0.9,trace end
`;

const BUNDLES = normalizeBundles({
  lines: {
    retrieved: '2026-10-01',
    pipelines: [
      {
        id: 'gulf_south',
        name: 'Gulf South Pipeline',
        accuracyKm: 9,
        km: 9727,
        parts: [
          [
            [-95.4, 29.0],
            [-95.3, 29.1],
          ],
          [
            [-80.0, 40.0],
            [-80.1, 40.1],
          ],
        ],
      },
      {
        id: 'gulf_run',
        name: 'Gulf Run Pipeline',
        accuracyKm: 0.5,
        km: 513,
        parts: [
          [
            [-93.6, 30.36],
            [-93.5, 30.5],
          ],
        ],
      },
    ],
  },
  stations: {
    stations: [
      {
        id: 'gulf_south-vixen',
        name: 'Vixen',
        pipeline: 'gulf_south',
        lon: -92.9,
        lat: 32.1,
        county: 'Jackson',
        state: 'LA',
        certHp: 30000,
        method: 'hifld_copy',
        offLine: false,
      },
    ],
    lng: [{ id: 'T1', name: 'Freeport LNG', status: 'operating', lon: -95.31, lat: 28.93 }],
  },
  pointsCsv: POINTS_CSV,
});

const PAYLOAD = normalizeOverlayPayload({
  source: 'Oil Oracle store',
  pipelines: [
    {
      id: 'gulf_south',
      name: 'Gulf South Pipeline (Boardwalk)',
      gasDay: '2026-10-18',
      cycle: 'ID3',
      fetchedAt: '2026-10-19T12:00:00Z',
      freshness: { state: 'ok', ageHours: 2 },
      pointCount: 2,
      overDesign: 1,
      points: [
        {
          point: '24329-D',
          loc: '24329',
          direction: 'D',
          scheduledDth: 493_140,
          designDth: 600_000,
          utilization: 0.8219,
        },
        {
          point: '24329-R',
          loc: '24329',
          direction: 'R',
          scheduledDth: 10,
          designDth: 100,
          utilization: 0.1,
        },
      ],
      notices: [
        {
          id: '5038853',
          type: 'Maintenance',
          status: 'Initiate',
          subject: 'Index 198 Pipeline Maintenance',
          effectiveAt: '2027-11-04 09:00:00',
          endsAt: '2027-12-16 09:00:00',
          upcoming: true,
          locs: ['24329'],
          stations: ['Vixen Compressor Station'],
          pipelineWide: false,
          excerpt: 'shut-in',
        },
        {
          id: '5038800',
          subject: 'System-wide OFO',
          locs: [],
          stations: [],
          pipelineWide: true,
        },
      ],
    },
    {
      id: 'gulf_run',
      gasDay: '2026-10-18',
      cycle: 'latest',
      points: [
        {
          point: '808311',
          loc: '808311',
          direction: 'D',
          scheduledDth: 78.5,
          designDth: 200,
          utilization: 0.3925,
        },
      ],
      notices: [],
    },
  ],
});

test('parseCsv handles quoted fields with embedded commas', () => {
  const rows = parseCsv(POINTS_CSV);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].why, 'pretreatment, not the terminal');
  assert.equal(rows[0].design_dth, '600000');
});

test('utilizationClass bins the ramp', () => {
  assert.equal(utilizationClass(null), 'nodata');
  assert.equal(utilizationClass(0.1), 'low');
  assert.equal(utilizationClass(0.5), 'normal');
  assert.equal(utilizationClass(0.8219), 'elevated');
  assert.equal(utilizationClass(0.95), 'tight');
  assert.equal(utilizationClass(1.5), 'over');
});

test('the payload joins by bare loc and the binding direction wins', () => {
  const gs = PAYLOAD.pipelines.gulf_south;
  const reading = gs.readings.get('24329');
  assert.equal(reading.utilization, 0.8219);
  assert.equal(reading.designDth, 600_000);
  assert.equal(reading.directions.length, 2);
  assert.equal(normalizeOverlayPayload({ error: 'nope' }), null);
});

test('the snapshot joins points, notices and stations; no payload degrades', () => {
  const snapshot = buildGasOverlaySnapshot(BUNDLES, PAYLOAD);
  assert.equal(snapshot.live, true);
  const freeport = snapshot.points.find((p) => p.id === 'gulf_south:24329');
  assert.equal(freeport.utilization, 0.8219);
  assert.equal(freeport.class, 'elevated');
  assert.deepEqual(freeport.noticeIds, ['5038853']);
  const dark = snapshot.points.find((p) => p.id === 'gulf_south:9999');
  assert.equal(dark.utilization, null);
  assert.equal(dark.class, 'nodata');
  assert.equal(dark.designDth, 1000); // the lookup's figure stands in
  const vixen = snapshot.stations.find((s) => s.id === 'gulf_south-vixen');
  assert.deepEqual(vixen.noticeIds, ['5038853']); // station name matched
  const gs = snapshot.pipelines.find((p) => p.id === 'gulf_south');
  assert.equal(gs.pipelineWideNotices, 1);
  assert.equal(gs.litPoints, 1);
  // The near part takes Freeport's reading; the far part stays nodata.
  assert.equal(gs.parts[0].utilization, 0.8219);
  assert.equal(gs.parts[1].utilization, null);
  assert.equal(snapshot.counts.flagged, 2);

  const bundleOnly = buildGasOverlaySnapshot(BUNDLES, null, { error: 'HTTP 503' });
  assert.equal(bundleOnly.live, false);
  assert.equal(bundleOnly.error, 'HTTP 503');
  assert.ok(bundleOnly.points.every((p) => p.class === 'nodata'));
});

test('nearestUtilization honours the reach', () => {
  const lit = [{ lat: 29.05, lon: -95.35, utilization: 0.5 }];
  assert.equal(
    nearestUtilization(
      [
        [-95.4, 29.0],
        [-95.3, 29.1],
      ],
      lit,
    ),
    0.5,
  );
  assert.equal(
    nearestUtilization(
      [
        [-80.0, 40.0],
        [-80.1, 40.1],
      ],
      lit,
    ),
    null,
  );
  assert.equal(nearestUtilization([[-95.4, 29.0]], []), null);
});
