import {
  formatBcfd,
  formatCount,
  formatMmcf,
  formatMonth,
  formatMtpa,
} from './records.js';

/**
 * The US export facility dossier (docs/COMMODITIES-PLAN.md §12.6.2 item 16):
 * a pure model so the layout and the tests share one shape, and a drawer
 * that renders it. Zero and null capacity must not throw — the row 8 dossier
 * did — so every tile degrades to `n/a` and utilization to null.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_ID = 'lng-dossier-styles';
const DAYS_PER_MONTH = 365 / 12;

function joinParts(parts, separator = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(separator);
}

const pct = (value) =>
  value === null || value === undefined ? null : `${value.toFixed(1)} %`;

/** Pure: the dossier as data. */
export function buildLngDossierModel(row, { order = [] } = {}) {
  const us = row.us ?? {};
  const d = row.derived ?? {};
  const trains = us.trains ?? [];
  const rank = order.findIndex((t) => t.id === row.id);
  const baseloadBcfd = us.baseloadBcfd ?? null;
  const baselineMmcfPerMonth =
    baseloadBcfd && baseloadBcfd > 0
      ? baseloadBcfd * 1000 * DAYS_PER_MONTH
      : null;

  const stats = [
    {
      label: 'Baseload',
      value: formatMtpa(us.baseloadMtpa) ?? 'n/a',
      note: joinParts([formatBcfd(baseloadBcfd), 'nameplate · EIA']),
    },
    {
      label: 'Trains',
      value: `${formatCount(us.trainsOperating ?? 0)} operating`,
      note: joinParts([
        `${formatCount(us.trainsCommissioning ?? 0)} commissioning`,
        `${formatCount(us.trainsBuilding ?? 0)} building`,
      ]),
    },
    {
      label: 'Cargoes',
      value: formatCount(d.cargoes ?? 0),
      note: joinParts([
        d.span
          ? `${formatMonth(d.span.from)} to ${formatMonth(d.span.to)}`
          : 'trailing 12 months',
        formatMmcf(d.mmcf ?? 0),
        'DOE',
      ]),
    },
    {
      label: 'Utilization',
      value: pct(d.utilizationPct) ?? 'n/a',
      note: 'window MMcf ÷ baseload Bcf/d × 365 × 1,000 · arithmetic',
    },
  ];

  const chart = (d.series ?? []).map((m) => ({
    month: m.month,
    mmcf: m.mmcf,
    cargoes: m.cargoes,
  }));

  const projects = [...new Set(trains.map((t) => t.project))];
  const regulatory = [];
  for (const project of projects) {
    const first = trains.find((t) => t.project === project);
    regulatory.push([
      project,
      joinParts([
        first.ftaDocket
          ? `FTA ${first.ftaDocket}${first.ftaBcfd ? ` · ${formatBcfd(first.ftaBcfd)}` : ''}`
          : null,
        first.nonFtaDocket
          ? `non-FTA ${first.nonFtaDocket}${first.nonFtaBcfd ? ` · ${formatBcfd(first.nonFtaBcfd)}` : ''}`
          : null,
        first.fercDocket ? `FERC ${first.fercDocket}` : null,
      ]),
    ]);
  }

  const sections = [
    {
      title: 'Trains',
      rows: trains.map((t) => [
        `${t.project === row.name ? '' : `${t.project} · `}${t.train}`,
        joinParts([
          formatMtpa(t.baseloadMtpa)
            ? `${formatMtpa(t.baseloadMtpa)} baseload`
            : null,
          formatMtpa(t.peakMtpa) ? `${formatMtpa(t.peakMtpa)} peak` : null,
          t.status,
          t.inService ? `in service ${t.inService.slice(0, 7)}` : null,
        ]),
      ]),
    },
    {
      title: 'Destinations',
      rows: (d.destinations ?? [])
        .slice(0, 10)
        .map((p) => [
          p.country,
          `${formatCount(p.cargoes)} cargoes · ${formatMmcf(p.mmcf)}`,
        ]),
    },
    {
      title: 'Shipping',
      rows: [
        ['Distinct tankers', formatCount(d.distinctTankers)],
        ['Mean cargo', formatMmcf(d.meanCargoMmcf)],
        [
          'Cargoes per month',
          d.cargoesPerMonth == null ? null : String(d.cargoesPerMonth),
        ],
      ],
    },
    { title: 'Regulatory', rows: regulatory },
    {
      title: 'Sources',
      rows: [
        [
          'Terminal',
          `${row.source.name ?? 'Global Energy Monitor'}${row.source.release ? `, ${row.source.release}` : ''} (${row.source.license ?? 'CC BY 4.0'})`,
        ],
        ['Trains', 'EIA, U.S. Liquefaction Capacity workbook'],
        [
          'Cargoes',
          'DOE, U.S. LNG Exports and Re-Exports Details (public domain)',
        ],
        [
          'Routes',
          'searoute-ts over the Eurostat maritime network (modelled shortest paths)',
        ],
      ],
    },
  ].map((section) => ({
    title: section.title,
    rows: section.rows.filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  }));

  return {
    id: row.id,
    kicker: joinParts([
      rank >= 0
        ? `#${rank + 1}${order.length ? ` of ${order.length}` : ''} US export plants by baseload`
        : null,
      row.status === 'operating' ? 'operating' : 'under construction',
    ]),
    title: row.name,
    subtitle: joinParts([
      joinParts([row.subnational, row.country], ', '),
      row.operator ?? us.operator,
      row.startYear ? `since ${row.startYear}` : null,
    ]),
    stats,
    chart,
    baselineMmcfPerMonth,
    sections,
    footer: joinParts([
      d.span
        ? `cargoes ${formatMonth(d.span.from)} to ${formatMonth(d.span.to)}`
        : null,
      'utilization is arithmetic on published figures',
    ]),
  };
}

const CSS = `
.lng-dossier{position:fixed;top:96px;right:16px;bottom:96px;width:min(440px,38vw);z-index:120;overflow:auto;background:rgba(8,12,18,.94);color:#e6edf3;border:1px solid rgba(255,179,71,.35);border-radius:10px;padding:14px 16px 18px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.lng-dossier[hidden]{display:none}
.lng-dossier__kicker{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#ffb347}
.lng-dossier__title{margin:4px 0 0;font-size:18px;font-weight:600}
.lng-dossier__subtitle{margin:2px 0 12px;color:#9aa4b2}
.lng-dossier__stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.lng-stat{padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.03)}
.lng-stat__label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9aa4b2}
.lng-stat__value{font-size:16px;font-weight:600;margin:2px 0}
.lng-stat__note{font-size:10px;color:#9aa4b2}
.lng-dossier__chart{width:100%;height:110px;margin-bottom:12px}
.lng-dossier h3{margin:12px 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#ffb347}
.lng-table{width:100%;border-collapse:collapse}
.lng-table td{padding:3px 0;border-top:1px solid rgba(255,255,255,.06);vertical-align:top}
.lng-table td:first-child{color:#9aa4b2;padding-right:10px;white-space:nowrap}
.lng-dossier__foot{display:flex;gap:8px;margin-top:14px}
.lng-dossier__footer{margin-top:10px;font-size:10px;color:#9aa4b2}
.lng-btn{flex:1;padding:6px 8px;border:1px solid rgba(255,179,71,.5);border-radius:6px;background:transparent;color:#ffb347;font:inherit;cursor:pointer}
.lng-btn--icon{flex:0 0 36px}
.lng-btn:hover{background:rgba(255,179,71,.12)}
`;

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function el(doc, tag, className, textContent) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function renderChart(doc, points, baseline) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'lng-dossier__chart');
  svg.setAttribute('viewBox', '0 0 240 110');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    '24 monthly export bars with the baseload line',
  );
  const max = Math.max(baseline ?? 0, ...points.map((p) => p.mmcf), 1);
  const width = 240 / Math.max(points.length, 1);
  points.forEach((p, i) => {
    const h = (p.mmcf / max) * 96;
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(i * width + 1));
    rect.setAttribute('y', String(100 - h));
    rect.setAttribute('width', String(Math.max(width - 2, 1)));
    rect.setAttribute('height', String(h));
    rect.setAttribute(
      'fill',
      i >= points.length - 12 ? '#ffb347' : 'rgba(255,179,71,.45)',
    );
    rect.setAttribute('data-month', p.month);
    const title = doc.createElementNS(SVG_NS, 'title');
    title.textContent = `${formatMonth(p.month)}: ${formatCount(p.cargoes)} cargoes, ${formatMmcf(p.mmcf)}`;
    rect.appendChild(title);
    svg.appendChild(rect);
  });
  if (baseline) {
    const y = 100 - (baseline / max) * 96;
    const line = doc.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', '240');
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#5fb3ff');
    line.setAttribute('stroke-dasharray', '4 3');
    line.setAttribute('data-baseline', 'true');
    svg.appendChild(line);
  }
  return svg;
}

function renderModel(doc, root, model) {
  root.textContent = '';
  const kicker = el(doc, 'div', 'lng-dossier__kicker');
  kicker.appendChild(el(doc, 'span', null, model.kicker));
  const close = el(doc, 'button', 'lng-btn lng-btn--icon', '×');
  close.type = 'button';
  close.dataset.action = 'close';
  close.title = 'Close';
  kicker.appendChild(close);
  root.appendChild(kicker);
  root.appendChild(el(doc, 'h2', 'lng-dossier__title', model.title));
  root.appendChild(el(doc, 'div', 'lng-dossier__subtitle', model.subtitle));
  const stats = el(doc, 'div', 'lng-dossier__stats');
  for (const stat of model.stats) {
    const tile = el(doc, 'div', 'lng-stat');
    tile.dataset.stat = stat.label.toLowerCase();
    tile.appendChild(el(doc, 'div', 'lng-stat__label', stat.label));
    tile.appendChild(el(doc, 'div', 'lng-stat__value', stat.value));
    tile.appendChild(el(doc, 'div', 'lng-stat__note', stat.note));
    stats.appendChild(tile);
  }
  root.appendChild(stats);
  root.appendChild(renderChart(doc, model.chart, model.baselineMmcfPerMonth));
  for (const section of model.sections) {
    const h = el(doc, 'h3', null, section.title);
    h.dataset.section = section.title.toLowerCase();
    root.appendChild(h);
    const table = el(doc, 'table', 'lng-table');
    for (const [key, value] of section.rows) {
      const tr = doc.createElement('tr');
      tr.appendChild(el(doc, 'td', null, key));
      tr.appendChild(el(doc, 'td', null, value));
      table.appendChild(tr);
    }
    root.appendChild(table);
  }
  const foot = el(doc, 'div', 'lng-dossier__foot');
  for (const [action, label, icon, title] of [
    ['prev', '◂', true, 'Previous US plant by baseload'],
    ['fly', 'Fly to plant', false, 'Fly to the plant'],
    ['zoom-out', 'Zoom out', false, 'Zoom out to the region'],
    ['next', '▸', true, 'Next US plant by baseload'],
  ]) {
    const btn = el(
      doc,
      'button',
      icon ? 'lng-btn lng-btn--icon' : 'lng-btn',
      label,
    );
    btn.type = 'button';
    btn.dataset.action = action;
    btn.title = title;
    foot.appendChild(btn);
  }
  root.appendChild(foot);
  root.appendChild(el(doc, 'div', 'lng-dossier__footer', model.footer));
}

/** The drawer. Buttons call back into the layer; the drawer never touches the camera. */
export function createLngDossier({
  document: doc = globalThis.document,
  onClose,
  onFlyTo,
  onZoomOut,
  onStep,
} = {}) {
  if (!doc?.createElement)
    throw new TypeError('LNG dossier requires a document');
  let root = null;
  let current = null;

  function handleClick(event) {
    const button = event.target?.closest?.('[data-action]');
    if (!button || !current) return;
    event.preventDefault();
    switch (button.dataset.action) {
      case 'close':
        onClose?.(current);
        break;
      case 'fly':
        onFlyTo?.(current);
        break;
      case 'zoom-out':
        onZoomOut?.(current);
        break;
      case 'prev':
        onStep?.(-1, current);
        break;
      case 'next':
        onStep?.(1, current);
        break;
      default:
        break;
    }
  }

  function ensureRoot() {
    if (root) return root;
    ensureStyles(doc);
    root = doc.createElement('aside');
    root.id = 'lng-dossier';
    root.className = 'lng-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'LNG export facility dossier');
    root.addEventListener('click', handleClick);
    doc.body.appendChild(root);
    return root;
  }

  return {
    show(row, { order = [] } = {}) {
      current = row;
      const node = ensureRoot();
      renderModel(doc, node, buildLngDossierModel(row, { order }));
      node.hidden = false;
      doc.body.classList.add('lng-dossier-open');
    },
    hide() {
      current = null;
      if (root) root.hidden = true;
      doc.body.classList.remove('lng-dossier-open');
    },
    isOpen() {
      return Boolean(root && !root.hidden);
    },
    current() {
      return current;
    },
    destroy() {
      this.hide();
      root?.remove();
      root = null;
    },
  };
}
