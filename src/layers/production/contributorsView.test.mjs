import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildContributorsDossierModel,
  changeLine,
  CONTRIBUTOR_CHART_SERIES,
  contributorCardLines,
  contributorStats,
  formatGasDelta,
  formatGasRate,
  formatSignedIn,
  normaliseContributors,
  topOperatorsLine,
} from './contributorsView.js';
import {
  createContributorsDossier,
  renderStackedColumns,
} from './contributorsDossier.js';
import { createGulfRegionOverlayEntry } from './model.js';
import { createRegionOverlayEntry } from '../onshore/model.js';

const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const williston = read(
  '../../data/local_data/onshore/williston/contributors.json',
);
const willistonIndex = read(
  '../../data/local_data/onshore/williston/index.json',
);
const gulf = read('../../data/local_data/bsee_gulf/contributors.json');
const gulfPlatforms = read('../../data/local_data/bsee_gulf/platforms.json');
const aliases = read('../../../scripts/operator-aliases.json').aliases;

test('rates and signed changes read the way the cards write them', () => {
  assert.equal(formatGasRate(3_429_700), '3.43 Bcf/d');
  assert.equal(formatGasRate(412_600), '412.6 MMcf/d');
  assert.equal(formatGasRate(845), '845 Mcf/d');
  assert.equal(formatGasDelta(27_500), '+27.5 MMcf/d');
  assert.equal(formatGasDelta(-120_000), '−0.12 Bcf/d');
  assert.equal(formatSignedIn(20, 'MMcf/d'), '±0.0');
});

test('Williston: operators reconcile to the headline and to their wells (G14.2)', () => {
  const c = normaliseContributors(williston);
  assert.ok(c, 'the committed file normalises');
  assert.equal(c.currentMonth, willistonIndex.current.month);
  const headline = willistonIndex.counts.gasMcfdTotal;
  assert.ok(
    Math.abs(c.totalMcfd - headline) <= 0.001 * headline,
    `${c.totalMcfd} vs headline ${headline}`,
  );
  // The top five operators' volumes equal the same operators' per-well
  // totals in the index within 0.1 % (they are exact: one parse).
  const gasAt = willistonIndex.readingColumns.indexOf('gas');
  const days = 31;
  for (const op of c.producingOperators.slice(0, 5)) {
    let wells = 0;
    for (const f of willistonIndex.facilities) {
      const filed = aliases[f.operator] ?? f.operator;
      if (filed === op.id && f.current && f.current[gasAt] > 0)
        wells += f.current[gasAt];
    }
    const mine = op.currentMcfd * days;
    assert.ok(
      Math.abs(mine - wells) <= 0.001 * wells,
      `${op.short}: ${mine} vs ${wells}`,
    );
  }
  // Shares of the region sum to one.
  const shares = c.producingOperators.reduce((s, o) => s + o.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9);
  // Both spans reconcile and their operator changes sum to the region's.
  for (const span of ['mom', 'yoy']) {
    assert.equal(c[span].reconciles, true, span);
    const sum = c.operators.reduce((s, o) => s + (o[span]?.deltaMcfd ?? 0), 0);
    assert.ok(
      Math.abs(sum - c[span].region.deltaMcfd) <= 1,
      `${span}: ${sum} vs ${c[span].region.deltaMcfd}`,
    );
  }
});

test('the Gulf total is what the Gulf filed', () => {
  const c = normaliseContributors(gulf);
  assert.equal(c.currentMonth, gulfPlatforms.current.month);
  const filed = gulfPlatforms.counts.gasMcfdFiled;
  assert.ok(Math.abs(c.totalMcfd - filed) <= 0.001 * filed);
  assert.equal(c.facilityLabel, 'structure');
  assert.equal(c.groupLabel, 'area');
});

test('the card names the top operators and who moved the region', () => {
  const c = normaliseContributors(williston);
  const lines = contributorCardLines(c);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Top operators: \S.* \d+ % · .* \d+ % · .* \d+ %$/);
  assert.match(lines[1], /^vs [A-Z]{3}: [+−±][\d.]+ (MMcf|Bcf)\/d, led by /);
  assert.equal(topOperatorsLine(null), null);
  assert.deepEqual(contributorCardLines(null), []);
  // The onshore region card carries both lines under its headline.
  const entry = createRegionOverlayEntry(
    {
      regionId: 'williston',
      region: { name: 'Williston Basin' },
      counts: { producing: 19663, gasMcfdTotal: 3.43e6, oilBbldTotal: 1.01e6 },
      asOf: 'as of 2026-07 · ND DMR',
      contributors: c,
    },
    { x: 0, y: 0, z: 0 },
  );
  assert.equal(entry.details[1], lines[0]);
  assert.ok(entry.details.every((line) => line.length <= 110));
  assert.match(entry.details.at(-1), /click the mark for contributors/);
});

test('the card says so when a file is light or the parts do not sum', () => {
  const c = normaliseContributors(williston);
  const light = {
    ...c,
    mom: {
      ...c.mom,
      reconciles: false,
      region: { ...c.mom.region, notFiled: -0.05 * c.mom.region.baseMcfd },
    },
  };
  const line = changeLine(light, 'mom');
  assert.match(line, /not in the file/);
  assert.match(line, /parts do not sum \(late filings\)/);
});

test('the dossier model: stacked series sum to the region, a ranked table, both ledgers', () => {
  const c = normaliseContributors(williston);
  const model = buildContributorsDossierModel(c, {
    regionName: 'Williston Basin',
    asOf: 'as of 2026-07',
  });
  assert.equal(model.chart.series.length, CONTRIBUTOR_CHART_SERIES + 1);
  assert.match(model.chart.series.at(-1).label, /^Other \(\d+\)$/);
  model.chart.months.forEach((month, i) => {
    const sum = model.chart.series.reduce((s, x) => s + x.values[i], 0);
    assert.ok(
      Math.abs(sum - c.totalGasMcfd[i]) <= 1e-6 * c.totalGasMcfd[i],
      month,
    );
  });
  assert.equal(model.table.unit, 'MMcf/d');
  assert.equal(model.facilityLabel, 'well');
  assert.equal(model.table.rows[0].rank, 1);
  assert.equal(model.table.rows[0].id, c.producingOperators[0].id);
  assert.ok(model.table.rows.length <= 15);
  assert.ok(model.table.rest, 'the operators past the table fold into one row');
  const titles = model.sections.map((s) => s.title);
  assert.ok(titles.includes('Change vs JUN'));
  assert.ok(titles.includes('Change vs JUL 2025'));
  assert.ok(titles.includes('Names as filed'));
  const ledger = model.sections.find((s) => s.title === 'Change vs JUN');
  assert.deepEqual(ledger.rows.at(-1), ['Parts', 'sum to the change']);
  assert.match(model.footer, /descriptive only/);
});

test('the Gulf region card and the stats a QA reads', () => {
  const c = normaliseContributors(gulf);
  const entry = createGulfRegionOverlayEntry(
    { contributors: c, asOf: 'as of 2026-06 · BSEE' },
    { x: 0, y: 0, z: 0 },
  );
  assert.equal(entry.title, 'GULF OF MEXICO OCS');
  assert.match(
    entry.details[0],
    /structures with production · \d\.\d\d Bcf\/d gas/,
  );
  assert.match(entry.details[1], /^Top operators: Shell /);
  assert.equal(createGulfRegionOverlayEntry({ contributors: null }, {}), null);
  const stats = contributorStats(c, { isOpen: () => true });
  assert.equal(stats.top[0].short, 'Shell');
  assert.equal(stats.reconciles.mom, true);
  assert.equal(stats.open, true);
  assert.equal(contributorStats(null), null);
});

/* A document just big enough for the drawer. */
function fakeDocument() {
  const byId = new Map();
  const make = (tag) => {
    const node = {
      tagName: tag,
      children: [],
      attributes: {},
      style: {},
      dataset: {},
      hidden: false,
      textContent: '',
      set id(value) {
        this._id = value;
        byId.set(value, this);
      },
      get id() {
        return this._id;
      },
      classList: {
        set: new Set(),
        add(c) {
          this.set.add(c);
        },
        remove(c) {
          this.set.delete(c);
        },
        contains(c) {
          return this.set.has(c);
        },
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      addEventListener() {},
      removeEventListener() {},
      remove() {},
      querySelector() {
        return null;
      },
    };
    return node;
  };
  const doc = {
    head: make('head'),
    body: make('body'),
    createElement: make,
    createElementNS: (_ns, tag) => make(tag),
    createTextNode: (text) => ({ tagName: '#text', textContent: text }),
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: () => null,
  };
  return doc;
}

const walk = (node, out = []) => {
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
};

test('stacked columns: one hover title per month, segments in the series colours', () => {
  const doc = fakeDocument();
  const chart = {
    months: ['2026-05', '2026-06', '2026-07'],
    series: [
      { label: 'A', color: '#3987e5', values: [3000, 3100, 3200] },
      { label: 'Other', color: '#6f6e69', values: [1000, 900, 0] },
    ],
  };
  const svg = renderStackedColumns(doc, chart);
  const nodes = walk(svg);
  const titles = nodes.filter((n) => n.tagName === 'title');
  assert.equal(titles.length, 3);
  assert.match(
    titles[0].textContent,
    /^2026-05 · 4\.0 MMcf\/d\nA 3\.0 MMcf\/d\nOther/,
  );
  assert.doesNotMatch(
    titles[2].textContent,
    /Other/,
    'an empty segment is not listed',
  );
  const segments = nodes.filter(
    (n) => n.tagName === 'rect' && n.attributes.class === 'dc-stack__seg',
  );
  assert.equal(segments.length, 5);
  assert.ok(
    segments.every((s) => ['#3987e5', '#6f6e69'].includes(s.attributes.fill)),
  );
});

test('the drawer opens with the model and closes, owning only its own node', () => {
  const doc = fakeDocument();
  const events = [];
  const drawer = createContributorsDossier({
    document: doc,
    regionId: 'williston',
    onClose: () => events.push('close'),
    onZoom: () => events.push('zoom'),
  });
  assert.equal(drawer.show(null), false);
  assert.equal(
    drawer.show(normaliseContributors(williston), { asOf: 'x' }),
    true,
  );
  assert.equal(drawer.isOpen(), true);
  const root = doc.getElementById('contributors-dossier-williston');
  assert.ok(root && !root.hidden);
  assert.ok(doc.body.classList.contains('dc-dossier-open'));
  const text = walk(root)
    .map((n) => n.textContent)
    .join(' ');
  assert.match(text, /main contributors/);
  assert.match(text, /Operators · gas and changes in MMcf\/d/);
  drawer.hide();
  assert.equal(drawer.isOpen(), false);
  assert.equal(root.hidden, true);
});
