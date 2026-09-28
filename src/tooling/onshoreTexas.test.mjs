import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTY_LEASE_COLUMNS,
  centroid,
  columnIndex,
  countyFilter,
  createSliceFold,
  cycleMonth,
  facilityId,
  mainCounty,
  monthRows,
  parseShareListing,
  readSurfaceDbf,
  shareDate,
} from '../../scripts/onshore/tx.mjs';

test('cycle months, facility ids and share dates', () => {
  assert.equal(cycleMonth('202607'), '2026-07');
  assert.equal(cycleMonth('2026-07'), null);
  assert.equal(facilityId('08', 'O', ' 012345'), 'TX-08-O-012345');
  assert.equal(shareDate('9/27/26 6:01:52 AM'), '2026-09-27');
  assert.equal(shareDate('12/1/26 1:00:00 PM'), '2026-12-01');
  assert.equal(shareDate('yesterday'), null);
});

test('a renamed upstream column fails by name', () => {
  assert.throws(
    () =>
      columnIndex(
        'OIL_GAS_CODE}LEASE_NO',
        COUNTY_LEASE_COLUMNS,
        'county lease table',
      ),
    /missing CYCLE_YEAR_MONTH/,
  );
  const c = columnIndex('A}B}C\r', ['C', 'A'], 'x');
  assert.deepEqual(c, { C: 2, A: 0 });
});

test('the share listing yields every file row with its link id', () => {
  const html =
    '<tr><td role="gridcell" class="NameColumn"><a id="fileTable:0:j_id_2f" href="#" class="ui-commandlink">PDQ_DSV.zip</a></td><td role="gridcell" class="ModifiedOnColumn">9/27/26 6:01:52 AM</td><td role="gridcell" class="SizeColumn">3.58 GB</td></tr>' +
    '<tr><td><a id="fileTable:1:j_id_2f" href="#">well301.zip</a></td><td>9/28/26 2:31:10 AM</td><td>1.43 MB</td></tr>';
  assert.deepEqual(parseShareListing(html), [
    {
      rowId: 'fileTable:0:j_id_2f',
      name: 'PDQ_DSV.zip',
      modified: '9/27/26 6:01:52 AM',
      size: '3.58 GB',
    },
    {
      rowId: 'fileTable:1:j_id_2f',
      name: 'well301.zip',
      modified: '9/28/26 2:31:10 AM',
      size: '1.43 MB',
    },
  ]);
});

/** A DBF with the surface layer's columns (API C8, LAT83 N19, LONG83 N19). */
function surfaceDbf(records) {
  const fields = [
    ['API', 'C', 8],
    ['LAT83', 'N', 19],
    ['LONG83', 'N', 19],
  ];
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((n, f) => n + f[2], 0);
  const buffer = Buffer.alloc(
    headerLength + records.length * recordLength + 1,
    0x20,
  );
  buffer.fill(0, 0, headerLength);
  buffer.writeUInt8(3, 0);
  buffer.writeUInt32LE(records.length, 4);
  buffer.writeUInt16LE(headerLength, 8);
  buffer.writeUInt16LE(recordLength, 10);
  fields.forEach(([name, type, length], i) => {
    const at = 32 + i * 32;
    buffer.write(name, at, 'latin1');
    buffer.write(type, at + 11, 'latin1');
    buffer.writeUInt8(length, at + 16);
  });
  buffer.writeUInt8(0x0d, headerLength - 1);
  records.forEach(({ deleted, values }, r) => {
    let at = headerLength + r * recordLength;
    buffer.write(deleted ? '*' : ' ', at, 'latin1');
    at += 1;
    fields.forEach(([, type, length], i) => {
      const text = String(values[i] ?? '');
      const padded = type === 'N' ? text.padStart(length) : text.padEnd(length);
      buffer.write(padded.slice(0, length), at, 'latin1');
      at += length;
    });
  });
  buffer.writeUInt8(0x1a, buffer.length - 1);
  return buffer;
}

test('surface points come from the NAD83 columns, keyed by the 8-digit API', () => {
  const points = readSurfaceDbf(
    surfaceDbf([
      { values: ['30133099', '31.91381717', '-103.77950055'] },
      { values: ['30133144', '', '-103.4'] },
      { values: ['30100001', '31.5', '-103.5'], deleted: true },
      { values: ['3013', '31.5', '-103.5'] },
    ]),
  );
  assert.deepEqual([...points], [['30133099', [31.913817, -103.779501]]]);
});

const HEADER = [
  'OIL_GAS_CODE',
  'DISTRICT_NO',
  'LEASE_NO',
  'CYCLE_YEAR_MONTH',
  'GAS_WELL_NO',
  'PROD_REPORT_FILED_FLAG',
  'CNTY_LSE_OIL_PROD_VOL',
  'CNTY_LSE_GAS_PROD_VOL',
  'CNTY_LSE_COND_PROD_VOL',
  'CNTY_LSE_CSGD_PROD_VOL',
  'DISTRICT_NAME',
  'LEASE_NAME',
  'OPERATOR_NAME',
  'FIELD_NAME',
  'COUNTY_NO',
  'COUNTY_NAME',
].join('}');

function row(o) {
  return [
    o.og,
    '10',
    o.lease,
    o.month,
    o.gasWell ?? '',
    o.filed ?? 'Y',
    o.oil ?? '',
    o.gas ?? '',
    o.cond ?? '',
    o.csgd ?? '',
    o.district ?? '08',
    o.name ?? 'UNIVERSITY 7',
    o.operator ?? 'PIONEER NATURAL RES. USA, INC.',
    o.field ?? 'SPRABERRY (TREND AREA)',
    o.countyNo ?? '329',
    o.county ?? 'MIDLAND',
  ];
}

test('the slice fold sums counties, keeps its districts and months, and skips unfiled rows', () => {
  const fold = createSliceFold({
    districts: ['08', '8A', '7C'],
    months: ['2026-06', '2026-07'],
    columns: columnIndex(HEADER, COUNTY_LEASE_COLUMNS, 'test'),
  });
  // An oil lease across two counties: oil + condensate, gas-well + casinghead.
  fold.add(
    row({
      og: 'O',
      lease: '012345',
      month: '202607',
      oil: '1000',
      cond: '10',
      csgd: '3000',
      county: 'MIDLAND',
    }),
  );
  fold.add(
    row({
      og: 'O',
      lease: '012345',
      month: '202607',
      oil: '200',
      csgd: '500',
      county: 'MARTIN',
    }),
  );
  fold.add(
    row({
      og: 'O',
      lease: '012345',
      month: '202606',
      oil: '900',
      csgd: '2800',
      county: 'MIDLAND',
      operator: 'OLD OPERATOR',
    }),
  );
  // A gas well: its name gains the gas well number.
  fold.add(
    row({
      og: 'G',
      lease: '998877',
      month: '202607',
      gas: '40000',
      cond: '5',
      gasWell: '2H',
      name: 'BLUE JAY',
    }),
  );
  // Outside the slice or the window, or not filed.
  fold.add(
    row({ og: 'O', lease: '555', month: '202607', oil: '1', district: '7B' }),
  );
  fold.add(row({ og: 'O', lease: '556', month: '202605', oil: '1' }));
  fold.add(
    row({ og: 'O', lease: '557', month: '202607', oil: '0', filed: 'N' }),
  );
  assert.equal(fold.stats.rows, 7);
  assert.equal(fold.stats.kept, 5);
  assert.equal(fold.stats.notFiled, 1);
  assert.deepEqual(
    [...fold.facilities.keys()],
    ['TX-08-O-012345', 'TX-08-G-998877'],
  );

  const lease = fold.facilities.get('TX-08-O-012345');
  assert.equal(mainCounty(lease.counties), 'MIDLAND');
  const places = new Map([
    ['TX-08-O-012345', { lat: 32.1, lon: -102.1, wells: 12 }],
  ]);
  const july = monthRows(fold, 1, places);
  assert.equal(july.length, 2);
  const [gasWell, oilLease] = july;
  assert.equal(oilLease.id, 'TX-08-O-012345');
  assert.equal(oilLease.oil, 1210);
  assert.equal(oilLease.gas, 3500);
  assert.equal(oilLease.county, 'MIDLAND');
  assert.equal(oilLease.grain, 'oil lease');
  assert.equal(oilLease.wells, 12);
  assert.equal(oilLease.operator, 'PIONEER NATURAL RES. USA, INC.');
  assert.equal(oilLease.water, null);
  assert.equal(gasWell.name, 'BLUE JAY 2H');
  assert.equal(gasWell.gas, 40000);
  assert.equal(gasWell.oil, 5);
  assert.equal(gasWell.grain, 'gas well');
  assert.equal(gasWell.lat, null, 'no well on file: unplaced');
  const june = monthRows(fold, 0, places);
  assert.equal(june.length, 1);
  assert.equal(
    june[0].operator,
    'OLD OPERATOR',
    'the operator is the one filed that month',
  );
});

test('a county split keeps each side its own counties and sums to the whole', () => {
  const columns = columnIndex(HEADER, COUNTY_LEASE_COLUMNS, 'test');
  const make = (counties) =>
    createSliceFold({
      districts: ['08'],
      counties,
      months: ['2026-07'],
      columns,
    });
  const west = make({ only: ['REEVES'] });
  const rest = make({ except: ['REEVES'] });
  const whole = make(undefined);
  const rows = [
    // A lease across the boundary: each side keeps its own county's volumes.
    row({
      og: 'O',
      lease: '7',
      month: '202607',
      csgd: '100',
      county: 'REEVES',
      countyNo: '389',
    }),
    row({
      og: 'O',
      lease: '7',
      month: '202607',
      csgd: '40',
      county: 'WARD',
      countyNo: '475',
    }),
    row({
      og: 'G',
      lease: '8',
      month: '202607',
      gas: '900',
      county: 'MIDLAND',
      countyNo: '329',
    }),
  ];
  for (const r of rows) for (const fold of [west, rest, whole]) fold.add(r);
  const gas = (fold) =>
    monthRows(fold, 0, new Map()).reduce((sum, r) => sum + (r.gas ?? 0), 0);
  assert.equal(gas(west), 100);
  assert.equal(gas(rest), 940);
  assert.equal(gas(west) + gas(rest), gas(whole));
  assert.deepEqual([...west.countyCodes], ['389']);
  assert.deepEqual([...rest.countyCodes].sort(), ['329', '475']);
  assert.equal(countyFilter(undefined)('ANY'), true);
});

test('a lease is drawn at the centroid of its placed wells', () => {
  assert.equal(centroid([]), null);
  assert.deepEqual(
    centroid([
      [32, -102],
      [32.2, -102.4],
    ]),
    [32.1, -102.2],
  );
});
