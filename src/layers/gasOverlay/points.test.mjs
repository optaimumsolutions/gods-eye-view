import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PAPER_TYPES,
  countyKey,
  midpointOf,
  parseCsv,
  physicalPoints,
  pointInGeometry,
  resolvePoint,
  snapToParts,
  toCsv,
} from '../../../scripts/build-gas-overlay-points.mjs';

const readCsv = (name) =>
  parseCsv(readFileSync(fileURLToPath(new URL(`../../data/local_data/gas_overlay/${name}`, import.meta.url)), 'utf8'));

// A square county around a north-south line at -93.
const square = { type: 'Polygon', coordinates: [[[-93.5, 30], [-92.5, 30], [-92.5, 31], [-93.5, 31], [-93.5, 30]]] };
const line = [[[-93, 29.5], [-93, 31.5]]];
const ctx = (extra = {}) => ({
  lines: { test: line },
  counties: [{ state: 'LA', key: 'acadia', name: 'Acadia', geometry: square }],
  stations: [],
  lng: [],
  network: [],
  places: [],
  placeWords: new Set(),
  ghgrp: [],
  ...extra,
});
const point = (over) => ({ pipeline: 'test', loc: '1', name: 'X', type: '', county: 'Acadia', state: 'LA', counterparty: '', ...over });

test('csv round-trips quotes and commas, and collapses the doubled spaces in posting headers', () => {
  const rows = parseCsv('Loc,Loc  Name\r\n1,"Smith, ""Jr"" Gate"\r\n');
  assert.deepEqual(rows, [{ Loc: '1', 'Loc Name': 'Smith, "Jr" Gate' }]);
  assert.equal(toCsv(['a'], [{ a: 'x,y' }]), 'a\n"x,y"\n');
});

test('county names normalise across posting and TIGER spellings, misspellings included', () => {
  assert.equal(countyKey('St Bernard'), countyKey('St. Bernard Parish'));
  assert.equal(countyKey('ST. CHARLES PARISH'), countyKey('Saint Charles'));
  assert.equal(countyKey('Terrebone'), countyKey('Terrebonne'));
});

test('geometry: inside the county, snapping onto the line, the middle of a piece', () => {
  assert.ok(pointInGeometry([-93, 30.5], square));
  assert.ok(!pointInGeometry([-94, 30.5], square));
  const s = snapToParts([-92.9, 30.5], line);
  assert.deepEqual(s.at.map((v) => +v.toFixed(4)), [-93, 30.5]);
  assert.deepEqual(midpointOf([[[-93, 30], [-93, 31]]]).map((v) => +v.toFixed(4)), [-93, 30.5]);
});

test('paper points (virtual, pooling) and zero-design rows never become physical points', () => {
  const master = [
    { Loc: '1', 'Loc Name': 'Real', 'Loc Type Ind': 'INT', 'Loc Cnty': 'Acadia', 'Loc St Abbrev': 'LA' },
    { Loc: '2', 'Loc Name': 'Pool', 'Loc Type Ind': 'PPT' },
    { Loc: '3', 'Loc Name': 'Transfer', 'Loc Type Ind': 'VIR' },
  ];
  const capacity = [
    { Loc: '1', 'Flow Ind': 'R', 'Design Capacity': '1,000' },
    { Loc: '1', 'Flow Ind': 'D', 'Design Capacity': '2,000' },
    { Loc: '2', 'Flow Ind': 'R', 'Design Capacity': '500' },
    { Loc: '3', 'Flow Ind': 'D', 'Design Capacity': '500' },
    { Loc: '4', 'Flow Ind': 'D', 'Design Capacity': '0' },
  ];
  const pts = physicalPoints('test', capacity, master);
  assert.deepEqual(pts.map((p) => [p.loc, p.flows, p.designDth]), [['1', 'DR', 2000]]);
  assert.ok(PAPER_TYPES.has('PPT') && PAPER_TYPES.has('VIR'));
});

test('a city gate is never placed on a plant that shares its town; it snaps to the line', () => {
  const c = ctx({
    ghgrp: [{ state: 'LA', county: 'ACADIA PARISH', facility_name: 'Crowley Rice Mill', parent_company: '', latitude: 30.2, longitude: -92.6 }],
    places: [{ state: 'LA', name: 'Crowley', at: [-92.9, 30.2] }],
    placeWords: new Set(['LA:crowley']),
  });
  const r = resolvePoint(point({ name: 'Crowley City Gate', type: 'LDC' }), c);
  assert.equal(r.method, 'place_snap');
  assert.deepEqual([r.lon, r.lat], [-93, 30.2]);
});

test('an end user lands on its own GHGRP facility by a word of its own name', () => {
  const c = ctx({
    ghgrp: [{ state: 'LA', county: 'Acadia Parish', facility_name: 'Rayburn Energy Station', parent_company: 'X', latitude: 30.4, longitude: -92.8 }],
  });
  const r = resolvePoint(point({ name: 'Rayburn Energy Station', type: 'END' }), c);
  assert.equal(r.method, 'ghgrp_facility');
  assert.deepEqual([r.lon, r.lat], [-92.8, 30.4]);
});

test('a town named like an LNG terminal is not an LNG delivery', () => {
  const c = ctx({ lng: [{ name: 'Cameron LNG Terminal', lon: -93.01, lat: 30.1 }] });
  assert.notEqual(resolvePoint(point({ name: 'Cameron #1 City Gate', type: 'LDC' }), c).method, 'lng_terminal');
  assert.equal(resolvePoint(point({ name: 'Cameron LNG Delivery', type: 'LNG' }), c).method, 'lng_terminal');
});

test('an interconnect sits where the counterparty system meets our line inside the county', () => {
  const c = ctx({ network: [{ operator: 'Texas Eastern Trans Co', parts: [[[-93.5, 30.6], [-92.5, 30.6]]] }] });
  const r = resolvePoint(point({ name: 'Tetco Del', type: 'INT', counterparty: 'Texas Eastern Transmission, LP' }), c);
  assert.equal(r.method, 'interconnect');
  assert.ok(Math.abs(r.lat - 30.6) < 0.01 && Math.abs(r.lon + 93) < 0.02);
});

test('a county the line never crosses is unresolved, never invented', () => {
  const c = ctx({ lines: { test: [[[-95, 29], [-95, 29.5]]] } });
  assert.equal(resolvePoint(point({ name: 'Somewhere', type: 'WHD' }), c).method, 'unresolved');
});

test('bundle: every physical point has a coordinate and a method; the two reference points are pinned', () => {
  const rows = readCsv('points.csv');
  assert.ok(rows.length > 600);
  for (const r of rows) {
    assert.ok(Number.isFinite(+r.lon) && Number.isFinite(+r.lat), `${r.pipeline}:${r.loc}`);
    assert.ok(['station_match', 'lng_terminal', 'ghgrp_facility', 'interconnect', 'place_snap', 'snap_to_line', 'manual'].includes(r.method));
    if (r.method === 'manual') assert.match(r.why, /^manual \d{4}-\d{2}-\d{2}: /);
  }
  const freeport = rows.find((r) => r.pipeline === 'gulf_south' && r.loc === '24329');
  assert.ok(Math.abs(+freeport.lat - 28.98494) < 1e-4 && freeport.method === 'manual');
  const goldenPass = rows.find((r) => r.pipeline === 'gulf_run' && r.loc === '808311');
  assert.ok(Math.abs(+goldenPass.lat - 30.3595) < 1e-4 && goldenPass.method === 'manual');
  assert.ok(rows.filter((r) => r.pipeline === 'gulf_run').length >= 40);
  for (const u of readCsv('unresolved.csv')) assert.ok(u.why.length > 0);
});
