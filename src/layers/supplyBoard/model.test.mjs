import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  balanceLine,
  createSupplyBoardOverlayEntry,
  normaliseBoard,
  regionsLine,
  storageLine,
  supplyBoardLines,
  supplyBoardMetaLine,
} from './model.js';
import { createSupplyBoardSource } from './source.js';
import { normaliseContributors } from '../production/contributorsView.js';

const NOW = Date.parse('2026-09-28T13:00:00Z');

/** The route's shape as the VPS store answered it on 2026-09-28. */
const BOARD = {
  source: 'Oil Oracle store',
  asOf: '2026-09-28',
  monthly: [
    {
      label: 'dry production',
      month: '2026-06',
      bcfd: 112.3,
      yoyBcfd: 4.8,
      observedAt: '2026-06-30',
    },
    {
      label: 'total consumption',
      month: '2026-06',
      bcfd: 81.1,
      yoyBcfd: 0.6,
      observedAt: '2026-06-30',
    },
    {
      label: 'LNG exports',
      month: '2026-06',
      bcfd: 16.1,
      yoyBcfd: 1.9,
      observedAt: '2026-06-30',
    },
  ],
  storage: {
    weekEnding: '2026-09-18',
    l48Bcf: 3351,
    weeklyBuildBcf: 53,
    yoyBcf: -148,
    avg5yrBcf: 3261,
    bandPositionPct: 76.3,
    observedAt: '2026-09-18',
  },
  regions: [],
};

const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const regions = [
  {
    ...normaliseContributors(
      read('../../data/local_data/onshore/williston/contributors.json'),
    ),
    label: 'Williston',
  },
  {
    ...normaliseContributors(
      read('../../data/local_data/bsee_gulf/contributors.json'),
    ),
    label: 'Gulf',
  },
];

test('the store lines: balance and storage, each with its month or week', () => {
  const board = normaliseBoard(BOARD, { now: NOW });
  assert.equal(
    balanceLine(board),
    'Dry production 112.3 Bcf/d (EIA, JUN) · YoY +4.8 · consumption 81.1 · LNG exports 16.1 Bcf/d',
  );
  assert.equal(
    storageLine(board),
    'Storage 3,351 Bcf (wk 09-18) · +53 build · 76 % up the 5-yr band (avg 3,261) · YoY −148',
  );
});

test('a stale or empty store drops its lines instead of showing them as current', () => {
  const late = Date.parse('2026-10-20T00:00:00Z');
  const board = normaliseBoard(BOARD, { now: late });
  assert.equal(
    board.storage,
    null,
    'a storage week older than 21 days is dropped',
  );
  assert.ok(board.monthly.has('dry production'), 'the monthly balance keeps');
  assert.equal(normaliseBoard({ error: 'no store' }), null);
  assert.equal(normaliseBoard({ monthly: [], storage: null }), null);
});

test('the filed regions line names each built region with its month', () => {
  const line = regionsLine(regions);
  assert.match(
    line,
    /^Filed: Williston 3\.43 \(JUL, \+27\.5 MoM\) · Gulf 2\.03 \(JUN, \+72\.8\) Bcf\/d$/,
  );
});

test('the card: store lines first, then the regions, the coverage and the stamp', () => {
  const board = normaliseBoard(BOARD, { now: NOW });
  const lines = supplyBoardLines({ regions, board });
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^Dry production/);
  assert.match(lines[1], /^Storage/);
  assert.match(lines[2], /^Filed: /);
  assert.equal(
    lines[3],
    '2 of 12 regions built on filings; the rest are inside the EIA total',
  );
  assert.match(lines[4], /descriptive only$/);
  assert.ok(lines.every((line) => line.length <= 110));
  const entry = createSupplyBoardOverlayEntry({ regions, board }, { x: 0 });
  assert.equal(entry.title, 'US NATURAL GAS SUPPLY');
  assert.deepEqual(entry.details, lines);
  assert.equal(
    supplyBoardMetaLine({ regions, board }),
    'US GAS · 112.3 BCF/D DRY (JUN) · STORAGE 3,351 BCF (09-18) · 2 REGIONS FILED',
  );
});

test('without the store the card keeps the regions and says why', () => {
  const lines = supplyBoardLines({
    regions,
    board: null,
    boardError: 'HTTP 502',
  });
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Filed: /);
  assert.match(lines[2], /^Oil Oracle store not reachable \(HTTP 502\)/);
  assert.equal(supplyBoardMetaLine({ regions }), 'US GAS · 2 REGIONS FILED');
});

test('the source reads the regions once, the store every time, and survives a dead store', async () => {
  const calls = [];
  const files = {
    'w.json': read('../../data/local_data/onshore/williston/contributors.json'),
    'g.json': read('../../data/local_data/bsee_gulf/contributors.json'),
  };
  let storeUp = true;
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === '/api/oracle/supply-board')
      return storeUp
        ? { ok: true, json: async () => BOARD }
        : { ok: false, status: 502, json: async () => ({}) };
    return { ok: true, json: async () => files[url] };
  };
  const source = createSupplyBoardSource({
    regions: [
      { label: 'Williston', url: 'w.json' },
      { label: 'Gulf', url: 'g.json' },
    ],
    fetchImpl,
    now: () => NOW,
  });
  const first = await source.getSnapshot();
  assert.equal(first.regions.length, 2);
  assert.ok(first.board);
  storeUp = false;
  const second = await source.getSnapshot();
  assert.equal(second.board, null);
  assert.equal(second.boardError, 'HTTP 502');
  assert.equal(
    calls.filter((u) => u.endsWith('.json') && !u.startsWith('/api')).length,
    2,
  );
  assert.equal(calls.filter((u) => u === '/api/oracle/supply-board').length, 2);
  assert.throws(
    () => createSupplyBoardSource({ regions: [] }),
    /requires its regions/,
  );
});
