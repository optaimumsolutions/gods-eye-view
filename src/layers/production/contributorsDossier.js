import {
  ensureDossierStyles,
  el,
  svgEl,
} from '../commodities/dossierChrome.js';
import {
  buildContributorsDossierModel,
  formatGasRate,
} from './contributorsView.js';

/**
 * The Contributors dossier (docs/COMMODITIES-PLAN.md §16, R14.6): a drawer in
 * the shared dossier chrome that opens from a region's mark and shows who
 * produces the region's gas, a 24-month stacked chart of the top operators,
 * the ranked table and the change ledger. Used by the onshore regions and the
 * Gulf. `buildContributorsDossierModel` is pure and tested; this module owns
 * the DOM and nothing else.
 */

export const CONTRIBUTORS_STYLE_ID = 'dc-contributors-styles';

const CSS = `
.dc-stack{display:block;width:100%;height:132px}
.dc-stack__hit{fill:transparent}
.dc-stack__hit:hover{fill:rgba(255,255,255,.07)}
.dc-keys{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:4px;font-size:9.5px;font-family:var(--font-mono,monospace);color:var(--text-secondary,rgba(232,234,237,.5))}
.dc-key{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.dc-key__sw{flex:0 0 auto;width:8px;height:8px;border-radius:2px;display:inline-block}
.dc-table td .dc-key__sw{margin-right:5px;vertical-align:-1px}
.dc-table td.op{max-width:124px;overflow-wrap:normal;word-break:normal;hyphens:none}
`;

function ensureStyles(doc) {
  ensureDossierStyles(doc);
  if (doc.getElementById?.(CONTRIBUTORS_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = CONTRIBUTORS_STYLE_ID;
  style.textContent = CSS;
  (doc.head ?? doc.body).appendChild(style);
}

function swatch(doc, color) {
  const sw = el(doc, 'span', 'dc-key__sw');
  sw.style.background = color;
  return sw;
}

/** Stacked columns, one per month, 2 px surface gaps between segments and columns. */
export function renderStackedColumns(doc, chart) {
  const width = 400;
  const height = 132;
  const padL = 46;
  const padR = 6;
  const padT = 8;
  const padB = 18;
  const GAP = 2;
  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'dc-stack',
    role: 'img',
    'aria-label': 'Gas per day by operator, month by month',
  });
  const n = chart.months.length;
  const totals = chart.months.map((_, i) =>
    chart.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
  const max = Math.max(0, ...totals);
  if (!n || max <= 0) return svg;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const colW = plotW / n;
  const y = (v) => padT + plotH - (v / max) * plotH;

  for (const [v, label] of [
    [0, '0'],
    [max, formatGasRate(max).replace(/\/d$/, '')],
  ]) {
    const t = svgEl(doc, 'text', {
      x: padL - 4,
      y: y(v) + 3,
      'text-anchor': 'end',
      class: 'dc-chart__label',
    });
    t.textContent = label;
    svg.appendChild(t);
  }
  svg.appendChild(
    svgEl(doc, 'line', {
      x1: padL,
      x2: width - padR,
      y1: y(0) + 0.5,
      y2: y(0) + 0.5,
      stroke: 'rgba(255,255,255,.12)',
      'stroke-width': 1,
    }),
  );

  for (let i = 0; i < n; i += 1) {
    const x = padL + i * colW + GAP / 2;
    const w = Math.max(1, colW - GAP);
    let base = 0;
    for (const s of chart.series) {
      const v = s.values[i] ?? 0;
      if (v <= 0) continue;
      const top = y(base + v);
      const bottom = y(base);
      const h = bottom - top - (base > 0 ? GAP : 0);
      base += v;
      if (h <= 0.5) continue;
      svg.appendChild(
        svgEl(doc, 'rect', {
          x,
          y: top,
          width: w,
          height: h,
          fill: s.color,
          class: 'dc-stack__seg',
        }),
      );
    }
    const hit = svgEl(doc, 'rect', {
      x: padL + i * colW,
      y: padT,
      width: colW,
      height: plotH,
      class: 'dc-stack__hit',
    });
    const title = svgEl(doc, 'title');
    title.textContent = [
      `${chart.months[i]} · ${formatGasRate(totals[i])}`,
      ...chart.series
        .filter((s) => (s.values[i] ?? 0) > 0)
        .map((s) => `${s.label} ${formatGasRate(s.values[i])}`),
    ].join('\n');
    hit.appendChild(title);
    svg.appendChild(hit);
  }

  const ticks = [0, Math.floor((n - 1) / 2), n - 1];
  for (const i of [...new Set(ticks)]) {
    const t = svgEl(doc, 'text', {
      x: padL + i * colW + colW / 2,
      y: height - 5,
      'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      class: 'dc-chart__label',
    });
    t.textContent = chart.months[i];
    svg.appendChild(t);
  }
  return svg;
}

function renderTable(doc, model) {
  const table = el(doc, 'table', 'dc-table');
  const head = el(doc, 'tr');
  for (const [label, numeric] of [
    ['#', true],
    ['Operator', false],
    ['Gas', true],
    ['Share', true],
    [model.stats[1].label, true],
    [model.stats[2].label, true],
    [`${model.facilityLabel}s`, true],
    ['Fields', true],
  ]) {
    const th = el(doc, 'th', numeric ? 'num' : '', label);
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const row of model.table.rows) {
    const tr = el(doc, 'tr');
    tr.appendChild(el(doc, 'td', 'num', String(row.rank)));
    const op = el(doc, 'td', 'op');
    if (row.color) op.appendChild(swatch(doc, row.color));
    op.appendChild(doc.createTextNode(row.short));
    op.title = row.filedNames.length
      ? `filed as ${row.filedNames.join(' / ')}`
      : row.name;
    tr.appendChild(op);
    for (const value of [row.gas, row.share, row.mom, row.yoy, row.producing])
      tr.appendChild(el(doc, 'td', 'num', value));
    const fields = el(doc, 'td', 'num', row.fields);
    fields.title = row.fieldTitle;
    tr.appendChild(fields);
    table.appendChild(tr);
  }
  if (model.table.rest) {
    const tr = el(doc, 'tr');
    tr.appendChild(el(doc, 'td', 'num', ''));
    tr.appendChild(el(doc, 'td', 'op', model.table.rest.label));
    tr.appendChild(el(doc, 'td', 'num', model.table.rest.gas));
    tr.appendChild(el(doc, 'td', 'num', model.table.rest.share));
    for (let i = 0; i < 4; i += 1) tr.appendChild(el(doc, 'td', 'num', ''));
    table.appendChild(tr);
  }
  return table;
}

function renderModel(doc, root, model) {
  root.textContent = '';
  const head = el(doc, 'div', 'dc-dossier__head');
  const kicker = el(doc, 'div', 'dc-dossier__kicker');
  kicker.appendChild(el(doc, 'span', '', model.kicker));
  const close = el(doc, 'button', 'dc-dossier__close', '×');
  close.type = 'button';
  close.title = 'Close dossier';
  close.setAttribute('aria-label', 'Close dossier');
  close.dataset.action = 'close';
  kicker.appendChild(close);
  head.appendChild(kicker);
  head.appendChild(el(doc, 'div', 'dc-dossier__title', model.title));
  head.appendChild(el(doc, 'div', 'dc-dossier__sub', model.subtitle));
  root.appendChild(head);

  const stats = el(doc, 'div', 'dc-dossier__stats dc-dossier__stats--pairs');
  for (const stat of model.stats) {
    const tile = el(doc, 'div', 'dc-stat');
    tile.appendChild(el(doc, 'div', 'dc-stat__label', stat.label));
    tile.appendChild(el(doc, 'div', 'dc-stat__value', stat.value));
    tile.appendChild(el(doc, 'div', 'dc-stat__note', stat.note));
    stats.appendChild(tile);
  }
  root.appendChild(stats);

  const body = el(doc, 'div', 'dc-dossier__body');
  const chartBox = el(doc, 'div', 'dc-section');
  chartBox.appendChild(
    el(
      doc,
      'div',
      'dc-section__title',
      `${model.chart.months.length} months · gas per day by operator`,
    ),
  );
  chartBox.appendChild(renderStackedColumns(doc, model.chart));
  const keys = el(doc, 'div', 'dc-keys');
  for (const s of model.chart.series) {
    const key = el(doc, 'span', 'dc-key');
    key.appendChild(swatch(doc, s.color));
    key.appendChild(doc.createTextNode(s.label));
    keys.appendChild(key);
  }
  chartBox.appendChild(keys);
  chartBox.appendChild(
    el(
      doc,
      'div',
      'dc-legend',
      'largest at the base · hover a month for every operator · the table below is the same data',
    ),
  );
  body.appendChild(chartBox);

  const tableBox = el(doc, 'div', 'dc-section');
  tableBox.appendChild(
    el(
      doc,
      'div',
      'dc-section__title',
      `Operators · gas and changes in ${model.table.unit} · hover a name for its filed names, fields for their gas`,
    ),
  );
  tableBox.appendChild(renderTable(doc, model));
  body.appendChild(tableBox);

  for (const section of model.sections) {
    if (!section.rows.length) continue;
    const node = el(doc, 'div', 'dc-section');
    node.appendChild(el(doc, 'div', 'dc-section__title', section.title));
    for (const [key, value] of section.rows) {
      const row = el(doc, 'div', 'dc-row');
      row.appendChild(el(doc, 'div', 'dc-row__k', key));
      row.appendChild(el(doc, 'div', 'dc-row__v', value));
      node.appendChild(row);
    }
    body.appendChild(node);
  }
  root.appendChild(body);

  const foot = el(doc, 'div', 'dc-dossier__foot');
  const zoom = el(doc, 'button', 'dc-btn', 'Zoom to region');
  zoom.type = 'button';
  zoom.dataset.action = 'zoom';
  foot.appendChild(zoom);
  root.appendChild(foot);
  root.appendChild(el(doc, 'div', 'dc-dossier__foot-note', model.footer));
}

/**
 * Own one region's Contributors drawer. `show(contributors, context)` renders
 * and opens it; the caller decides what "zoom" and "close" mean.
 */
export function createContributorsDossier({
  document: doc = globalThis.document,
  regionId = 'region',
  onClose,
  onZoom,
} = {}) {
  if (!doc?.createElement) throw new TypeError('Dossier requires a document');
  let root = null;
  let open = false;

  function handleClick(event) {
    const button = event.target?.closest?.('[data-action]');
    if (!button || !open) return;
    event.preventDefault();
    if (button.dataset.action === 'close') onClose?.();
    else if (button.dataset.action === 'zoom') onZoom?.();
  }

  function ensureRoot() {
    if (root) return root;
    ensureStyles(doc);
    root = doc.createElement('aside');
    root.id = `contributors-dossier-${regionId}`;
    root.className = 'dc-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Main contributors');
    root.addEventListener('click', handleClick);
    doc.body.appendChild(root);
    return root;
  }

  return {
    show(contributors, context = {}) {
      if (!contributors) return false;
      const node = ensureRoot();
      renderModel(
        doc,
        node,
        buildContributorsDossierModel(contributors, context),
      );
      open = true;
      node.hidden = false;
      node.scrollTop = 0;
      doc.body.classList.add('dc-dossier-open');
      return true;
    },
    hide() {
      if (!root || !open) return;
      open = false;
      root.hidden = true;
      if (!doc.querySelector?.('.dc-dossier:not([hidden])'))
        doc.body.classList.remove('dc-dossier-open');
    },
    isOpen() {
      return open;
    },
    destroy() {
      open = false;
      if (root) {
        root.removeEventListener('click', handleClick);
        root.remove();
        root = null;
      }
    },
  };
}
