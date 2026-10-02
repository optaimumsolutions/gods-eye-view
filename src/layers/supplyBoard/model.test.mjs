import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  balanceLine,
  ducsLines,
  createSupplyBoardOverlayEntry,
  feedgasLines,
  normaliseBoard,
  pipeSupplyLines,
  foldRegionGroups,
  regionsLine,
  regionsLines,
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
  flows: [
    {
      id: 'NG_FLOW_SABINE_FEEDGAS_CREOLE',
      gasDay: '2026-09-27',
      bcfd: 1.44,
      chg7Bcfd: 0.03,
    },
    {
      id: 'NG_FLOW_CORPUS_FEEDGAS_CCPL',
      gasDay: '2026-09-27',
      bcfd: 2.43,
      chg7Bcfd: 0.11,
    },
    {
      id: 'NG_FLOW_GOLDEN_PASS_GULF_RUN',
      gasDay: '2026-09-27',
      bcfd: 0.75,
      chg7Bcfd: 0.03,
    },
    {
      id: 'NG_FLOW_HAYNESVILLE_GULF_RUN_REC',
      gasDay: '2026-09-27',
      bcfd: 2.69,
      chg7Bcfd: 0.11,
    },
    {
      id: 'NG_FLOW_APPALACHIA_ROVER_REC',
      gasDay: '2026-09-27',
      bcfd: 3.59,
      chg7Bcfd: -0.03,
    },
    {
      id: 'NG_FLOW_CAMERON_FEEDGAS_CIP',
      gasDay: '2026-09-27',
      bcfd: 1.38,
      chg7Bcfd: -0.06,
    },
    {
      id: 'NG_FLOW_HAYNESVILLE_LEG_CIP_REC',
      gasDay: '2026-09-27',
      bcfd: 0.21,
      chg7Bcfd: -0.0,
    },
    {
      id: 'NG_FLOW_FREEPORT_FEEDGAS_GS',
      gasDay: '2026-09-27',
      bcfd: 1.41,
      chg7Bcfd: 0.0,
    },
  ],
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

test('the flow lines: LNG feedgas and supply on the pipes, each with its gas day', () => {
  const board = normaliseBoard(BOARD, { now: NOW });
  // Past LINE_MAX a group wraps onto a continuation line, never mid-part.
  assert.deepEqual(feedgasLines(board), [
    'LNG feedgas (scheduled, gas day 09-27): Sabine 1.44 · Corpus 2.43 · Golden Pass 0.75 · Cameron 1.38 ·',
    'Freeport 1.41 Bcf/d',
  ]);
  assert.deepEqual(pipeSupplyLines(board), [
    'Pipes (scheduled, gas day 09-27): Haynesville on Gulf Run 2.69 · Appalachia on Rover 3.59 ·',
    'LEG on Cameron 0.21 Bcf/d',
  ]);
  for (const line of supplyBoardLines({ board })) {
    assert.ok(!line.endsWith('…'), `clamped: ${line}`);
  }
  // A week-old gas day is not shown as current.
  const stale = normaliseBoard(BOARD, {
    now: Date.parse('2026-10-05T00:00:00Z'),
  });
  assert.deepEqual(feedgasLines(stale), []);
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

test('layers of one region fold into one item at the month all have filed', () => {
  const permian = [
    'permian-delaware',
    'permian-midland',
    'permian-platform',
  ].map((id) => ({
    ...normaliseContributors(
      read(`../../data/local_data/onshore/${id}/contributors.json`),
    ),
    label: id,
    group: 'Permian TX',
  }));
  const all = [...permian, ...regions];
  const items = foldRegionGroups(all);
  assert.deepEqual(
    items.map((r) => r.label),
    ['Permian TX', 'Williston', 'Gulf'],
  );
  const group = items[0];
  // Delaware's newest complete month is later than the others': the group
  // is summed at the month all three have filed, never a mix of months.
  const month = permian.map((p) => p.currentMonth).sort()[0];
  assert.equal(group.currentMonth, month);
  const sum = permian.reduce(
    (s, p) => s + p.totalGasMcfd[p.months.indexOf(month)],
    0,
  );
  assert.ok(Math.abs(group.totalMcfd - sum) < 1e-6);
  assert.equal(group.members, 3);
  const line = regionsLine(all);
  assert.match(line, /^Filed: Permian TX \d+\.\d\d \([A-Z]{3}, [+−]/);
  assert.match(line, /· Williston 3\.43 .* · Gulf 2\.03 /);
  // With Appalachia too the list is longer than the card: it wraps, never cut.
  const appalachia = {
    ...normaliseContributors(
      read('../../data/local_data/onshore/appalachia/contributors.json'),
    ),
    label: 'Appalachia',
  };
  const lines = regionsLines([appalachia, ...all]);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 110, `${l.length} chars`);
  const joined = lines.join(' ');
  for (const name of ['Appalachia', 'Permian TX', 'Williston', 'Gulf'])
    assert.ok(joined.includes(`${name} `), name);
  assert.match(joined, /^Filed: .* Bcf\/d$/);
  assert.match(
    supplyBoardLines({ regions: all }).join('\n'),
    /3 of 12 regions built on filings/,
  );
});

test('the card: store lines first, then the regions, the coverage and the stamp', () => {
  const board = normaliseBoard(BOARD, { now: NOW });
  const lines = supplyBoardLines({ regions, board });
  assert.equal(lines.length, 9);
  assert.match(lines[0], /^Dry production/);
  assert.match(lines[1], /^Storage/);
  assert.match(lines[2], /^LNG feedgas/);
  assert.match(lines[3], /^Freeport /);
  assert.match(lines[4], /^Pipes/);
  assert.match(lines[5], /^LEG on Cameron /);
  assert.match(lines[6], /^Filed: /);
  assert.equal(
    lines[7],
    '2 of 12 regions built on filings; the rest are inside the EIA total',
  );
  assert.match(
    lines[8],
    /pipeline postings\) · state and BSEE filings · descriptive only$/,
  );
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

// Oracle PRD-duc-tracker G9: the DUC backlog rows. The route's `ducs` section as
// the scratch store answered on 2026-10-02 (STEO release 2026-09-09).
const STEO_BASINS = [
  ['PM', 'Permian', 839, -227, 500, 488],
  ['AP', 'Appalachia', 630, -145, 65, 91],
  ['HA', 'Haynesville', 547, -91, 57, 67],
  ['EF', 'Eagle Ford', 409, 57, 122, 118],
  ['BK', 'Bakken', 230, -104, 58, 69],
  ['R48', 'rest of L48', 2264, 57, 239, 239],
].map(([code, basin, duc, vs12mo, drilled, completed]) => ({
  code,
  basin,
  duc,
  vs3mo: null,
  vs12mo,
  drilled,
  completed,
  rigs: null,
  observedAt: '2026-08-31',
  publishedAt: '2026-09-09',
  fetchedAt: null,
}));
const DUCS_FOUNDER = {
  release: '2026-09-09',
  nextRelease: '2026-10-06',
  month: '2026-08',
  fiveBasins: 2655,
  usTotal: 4919,
  basins: STEO_BASINS,
  reconstructionWithheld: false,
  reconstruction: [
    {
      basin: 'Bakken',
      label: 'Bakken (ND only)',
      month: '2026-09',
      duc: 300,
      provisional: true,
      confidential: 139,
      rangeLow: 161,
      medianAgeMonths: 4,
      track: { median_pct: -11.5, n: 152, within15_pct: 53 },
      top3: null,
      observedAt: '2026-09-30',
      publishedAt: null,
      fetchedAt: null,
    },
  ],
};
const DUCS_INVITEE = {
  ...DUCS_FOUNDER,
  reconstructionWithheld: true,
  reconstruction: null,
};
const DUC_NOW = Date.parse('2026-10-02T15:00:00Z');

test('DUC rows: STEO headline for everyone, every basin, totals, release stamp', () => {
  const board = normaliseBoard(
    { ...BOARD, ducs: DUCS_INVITEE },
    { now: DUC_NOW },
  );
  const lines = ducsLines(board);
  const text = lines.join('\n');
  assert.match(
    lines[0],
    /^DUCs \(EIA STEO, AUG; released 09-09\): Permian 839 \(−227 y\/y\)/,
  );
  for (const part of [
    'Appalachia 630',
    'Haynesville 547',
    'Eagle Ford 409',
    'Bakken 230',
    'rest L48 2,264',
    '5 basins 2,655',
    'US 4,919',
  ])
    assert.ok(text.includes(part), `missing ${part}`);
  assert.match(text, /Drilled\/completed \(AUG\): Permian 500\/488/);
  assert.ok(
    !/rest of L48 239/.test(text),
    'R48 stays out of the drilled/completed line',
  );
  assert.ok(
    !/reconstruction|founder/i.test(text),
    'an invitee payload carries no reconstruction line',
  );
  for (const line of lines)
    assert.ok(line.length <= 110, `line too long: ${line}`);
});

test('DUC rows: the founder payload adds the labelled reconstruction with its range and track', () => {
  const board = normaliseBoard(
    { ...BOARD, ducs: DUCS_FOUNDER },
    { now: DUC_NOW },
  );
  const last = ducsLines(board).at(-1);
  assert.equal(
    last,
    'Bakken (ND only) reconstruction 300 (SEP, provisional; 161–300) · track −12% vs EIA · founder only',
  );
});

test('DUC rows: a STEO month past the age limit is dropped; nothing else breaks', () => {
  const old = {
    ...DUCS_INVITEE,
    basins: STEO_BASINS.map((b) => ({ ...b, observedAt: '2026-05-31' })),
  };
  const board = normaliseBoard({ ...BOARD, ducs: old }, { now: DUC_NOW });
  assert.equal(board.ducs, null);
  assert.deepEqual(ducsLines(board), []);
});

test('DUC rows: a store that only has DUCs still makes a board; the meta line names them', () => {
  const board = normaliseBoard(
    { asOf: '2026-10-02', ducs: DUCS_INVITEE },
    { now: DUC_NOW },
  );
  assert.ok(board && board.ducs.basins.length === 6);
  assert.match(
    supplyBoardMetaLine({ regions: [], board }),
    /DUCS 2,655 \(AUG\)/,
  );
  assert.match(
    supplyBoardLines({ regions: [], board }).join('\n'),
    /EIA incl\. STEO/,
  );
});
