import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOnshoreDossierModel, chartFromHistory } from './dossier.js';
import { normaliseOnshoreDataset } from './records.js';
import { facility, months, payload, reading } from './fixtures.mjs';

const NOW = Date.parse('2026-09-21T18:00:00Z');

function snapshotWith(rows) {
  return normaliseOnshoreDataset(payload(rows), { fetchedAt: NOW });
}

function history() {
  const n = months().length;
  const gas = new Array(n).fill(3100);
  gas[n - 1] = 2532;
  gas[n - 2] = 2400;
  gas[5] = null; // a month not filed
  return {
    months: months(),
    series: {
      oil: new Array(n).fill(459),
      water: new Array(n).fill(1189),
      days: new Array(n).fill(26),
      runs: new Array(n).fill(260),
      gas,
      gasSold: new Array(n).fill(1940),
      flared: new Array(n).fill(592),
    },
  };
}

test('the model leads with the well, its rank and the four tiles', () => {
  const snapshot = snapshotWith([facility('33053039010000')]);
  const row = snapshot.rows[0];
  const model = buildOnshoreDossierModel(row, {
    snapshot,
    historyState: 'loading',
  });
  assert.equal(model.id, row.id);
  assert.equal(
    model.kicker,
    '#1 of 1 by gas this month · as of 2026-07 · ND DMR',
  );
  assert.equal(model.title, 'WELL 0000');
  assert.equal(
    model.subtitle,
    'API 33-053-03901 · field ALEXANDER · operator DEVON ENERGY WILLISTON, L.L.C',
  );
  assert.deepEqual(
    model.stats.map((s) => s.label),
    ['Gas', 'Oil', 'Days on', 'Flared'],
  );
  assert.equal(model.stats[0].value, '82 Mcf/d');
  assert.equal(model.stats[0].note, '▼ -18.3 % vs last year');
  assert.equal(model.stats[2].value, '26 of 31');
  assert.equal(model.stats[2].note, '97 Mcf/d per producing day');
  assert.equal(model.stats[3].value, '19 Mcf/d');
  assert.equal(model.stats[3].note, '23.4 % flared · sold 63 Mcf/d');
  assert.equal(model.chart, null);
  assert.equal(model.historyState, 'loading');
  assert.equal(model.historyNote, 'loading the ten-year series…');
  assert.deepEqual(
    model.sections.map((s) => s.title),
    ['This month · 2026-07', 'Identity', 'Ten years', 'Sources'],
  );
  const thisMonth = Object.fromEntries(model.sections[0].rows);
  // Per calendar day: June's 2,400 Mcf over 30 days is 80 Mcf/d against
  // July's 81.7, so the month-on-month change is +2.1 %, not the volumes' +5.5 %.
  assert.equal(
    thisMonth.Gas,
    '82 Mcf/d · +2.1 % vs JUN · -18.3 % vs last year',
  );
  assert.equal(thisMonth['Gas sold'], '1,940 Mcf · 77 % of produced');
  assert.equal(thisMonth.Flared, '592 Mcf · 23.4 % flared');
  assert.equal(
    thisMonth['Days on'],
    '26 · +0.0 % vs JUN · +0.0 % vs last year',
  );
  const identity = Object.fromEntries(model.sections[1].rows);
  assert.equal(identity.API, '33-053-03901');
  assert.equal(identity['File no.'], '22023');
  assert.equal(identity.Pools, 'BAKKEN');
  assert.equal(identity.Location, '47.90750, -103.58040 · NAD83 (assumed)');
  const tenYears = Object.fromEntries(model.sections[2].rows);
  assert.equal(tenYears['Peak gas'], '211 Mcf/d · 2024-09');
  assert.equal(tenYears['Cum. gas'], '90 MMcf');
  assert.equal(tenYears['Cum. flared'], '9 MMcf · 10.0 % of gas');
  assert.match(tenYears['From peak'], /^−\d+\.\d % gas vs the peak month$/);
  const sources = Object.fromEntries(model.sections[3].rows);
  assert.match(
    sources.Production,
    /^North Dakota DMR Oil and Gas Division, Monthly Production Report, monthly per well, retrieved 2026-09-21$/,
  );
  assert.equal(
    sources['Current month'],
    '2026-07 is the newest complete filing month · 92 % of the usual filers in its workbook',
  );
  assert.equal(
    sources.EIA,
    '2026-06: ND filings 102.1 Bcf gas = 94 % of EIA gross withdrawals (108.1 Bcf), 100 % of marketed; oil 87 % of EIA',
  );
  assert.equal(sources.History, 'loading the ten-year series…');
  assert.equal(model.footer, 'as of 2026-07 · ND DMR · public record');
});

test('the chart comes from the history shard as per-day rates, with gaps kept', () => {
  const chart = chartFromHistory(history());
  assert.equal(chart.months.length, 24);
  assert.equal(chart.filedMonths, 23);
  assert.equal(chart.gas[5], null);
  assert.ok(Math.abs(chart.gas[23] - 2532 / 31) < 1e-9);
  assert.ok(Math.abs(chart.oil[23] - 459 / 31) < 1e-9);
  assert.equal(chartFromHistory(null), null);
  assert.equal(
    chartFromHistory({
      months: months(),
      series: { gas: new Array(24).fill(0), oil: [] },
    }),
    null,
    'no gas filed is no chart',
  );
  const snapshot = snapshotWith([facility('33053039010000')]);
  const loaded = buildOnshoreDossierModel(snapshot.rows[0], {
    snapshot,
    history: history(),
    historyState: 'loaded',
  });
  assert.equal(loaded.chart.filedMonths, 23);
  assert.equal(loaded.historyNote, '23 months filed in the window');
});

test('an absent shard is named with the rebuild command; a quiet well reads as such', () => {
  const snapshot = snapshotWith([
    facility('33053039030000', {
      status: 'quiet',
      current: reading({ gas: 0, oil: 0, days: 0, gasSold: 0, flared: 0 }),
      summary: null,
    }),
  ]);
  const model = buildOnshoreDossierModel(snapshot.rows[0], {
    snapshot,
    historyState: 'unavailable',
  });
  assert.equal(model.kicker, 'filed, no production · as of 2026-07 · ND DMR');
  assert.equal(model.stats[0].value, '0 Mcf/d');
  assert.equal(model.stats[0].note, 'filed, no production');
  assert.equal(
    model.historyNote,
    'history shards are not built on this deployment — run npm run build:onshore -- --region williston',
  );
  assert.deepEqual(model.sections[2].rows, [
    ['Production', 'none filed for this well in the window'],
  ]);
  const errored = buildOnshoreDossierModel(snapshot.rows[0], {
    snapshot,
    historyState: 'error',
  });
  assert.equal(errored.historyNote, 'the ten-year series could not be read');
  const bare = buildOnshoreDossierModel(snapshot.rows[0]);
  assert.equal(bare.footer, 'state filings');
});
