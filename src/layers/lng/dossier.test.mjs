import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildLngDossierModel } from './dossier.js';
import {
  buildLngSnapshot,
  normalizeCargoes,
  normalizeMatrix,
  normalizeRoutes,
  normalizeTerminals,
  usDossierOrder,
} from './records.js';

/**
 * The dossier model over the committed bundle (docs/COMMODITIES-PLAN.md
 * §12.8 milestone 4): four tiles, a 24-month chart, five sections in order,
 * the zero-capacity guard and the utilization arithmetic.
 */

const bundle = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../data/local_data/lng/${name}`, import.meta.url),
      'utf8',
    ),
  );
const snapshot = buildLngSnapshot({
  terminals: normalizeTerminals(bundle('terminals.json')),
  cargoes: normalizeCargoes(bundle('cargoes.json')),
  matrix: normalizeMatrix(bundle('matrix.json')),
  routes: normalizeRoutes(bundle('routes.json')),
});
const order = usDossierOrder(snapshot.rows);
const sabinePass = snapshot.rows.find((t) => t.id === 'T100000130240');
const section = (model, title) => model.sections.find((s) => s.title === title);

test('Sabine Pass: four tiles, 24 bars with a baseline, five sections in order', () => {
  const model = buildLngDossierModel(sabinePass, { order });
  assert.equal(model.title, 'Sabine Pass LNG Terminal');
  assert.match(
    model.kicker,
    /^#1 of \d+ US export plants by baseload · operating$/,
  );
  assert.deepEqual(
    model.stats.map((s) => s.label),
    ['Baseload', 'Trains', 'Cargoes', 'Utilization'],
  );
  assert.equal(model.stats[0].value, '27.0 Mtpa');
  assert.equal(model.stats[1].value, '6 operating');
  assert.equal(model.stats[2].value, '436');
  assert.match(model.stats[3].value, /^\d+\.\d %$/);
  assert.match(model.stats[3].note, /arithmetic/);
  assert.equal(model.chart.length, 24);
  assert.equal(model.chart[23].month, '2026-06');
  assert.ok(model.baselineMmcfPerMonth > 0);
  assert.deepEqual(
    model.sections.map((s) => s.title),
    ['Trains', 'Destinations', 'Shipping', 'Regulatory', 'Sources'],
  );
  assert.equal(section(model, 'Trains').rows.length, 6);
  assert.equal(section(model, 'Destinations').rows.length, 10);
  assert.equal(section(model, 'Shipping').rows.length, 3);
  assert.ok(section(model, 'Regulatory').rows[0][1].includes('FTA'));
  assert.match(section(model, 'Sources').rows[0][1], /Global Energy Monitor/);
});

test('the utilization tile is the labelled arithmetic on the derived figures', () => {
  const model = buildLngDossierModel(sabinePass, { order });
  const expected =
    (sabinePass.derived.mmcf / (sabinePass.us.baseloadBcfd * 1000 * 365)) * 100;
  assert.equal(model.stats[3].value, `${expected.toFixed(1)} %`);
});

test('zero and null capacity yield n/a tiles and no baseline, never a throw', () => {
  const zero = Object.freeze({
    ...sabinePass,
    us: Object.freeze({
      ...sabinePass.us,
      baseloadBcfd: 0,
      baseloadMtpa: 0,
      trains: [],
    }),
    derived: Object.freeze({
      ...sabinePass.derived,
      utilizationPct: null,
      series: [],
    }),
  });
  const model = buildLngDossierModel(zero, { order: [] });
  assert.equal(model.stats[3].value, 'n/a');
  assert.equal(model.baselineMmcfPerMonth, null);
  assert.equal(model.chart.length, 0);
  assert.equal(section(model, 'Trains').rows.length, 0);
  assert.equal(model.kicker, 'operating');
  const bare = buildLngDossierModel(
    { ...sabinePass, us: null, derived: null },
    {},
  );
  assert.equal(bare.stats[0].value, 'n/a');
  assert.equal(bare.stats[2].value, '0');
});

test('the stepper order is the US export plants by baseload, largest first', () => {
  assert.equal(order[0].id, 'T100000130240');
  assert.ok(order.length >= 9);
  for (let i = 1; i < order.length; i += 1)
    assert.ok(
      (order[i - 1].us.baseloadBcfd ?? 0) >= (order[i].us.baseloadBcfd ?? 0),
    );
  assert.ok(order.every((t) => !t.us.smallScale));
});
