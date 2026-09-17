import {
  formatCount,
  formatInt,
  formatMmcfd,
  formatMw,
  formatUsdB,
} from './records.js';

/**
 * The site dossier: a scrollable drawer with everything the bundle holds
 * about one campus, laid out the way an analyst reads it. `buildDossierModel`
 * is pure and tested; `createDatacenterDossier` owns the DOM and nothing
 * else (no Cesium, no context store). The layer calls `show` and `hide`; the
 * drawer calls back for fly, zoom-out, previous, next and close.
 */

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

function mwOrNa(value) {
  return value === null || value === undefined ? 'n/a' : formatMw(value);
}

/** Pure: the dossier as data, so the layout and the tests share one shape. */
export function buildDossierModel(row, { total = null } = {}) {
  const gen = row.power.onSiteGeneration;
  const cooling = row.cooling;
  const expanding =
    row.plannedItPowerMw !== null && row.plannedItPowerMw > row.itPowerMw;

  const stats = [
    {
      label: 'IT power',
      value: formatMw(row.itPowerMw),
      note: row.asOf ? `as of ${row.asOf}` : 'now',
    },
    {
      label: 'Facility',
      value: mwOrNa(row.facilityPowerMw),
      note:
        row.facilityToItRatio !== null
          ? `${row.facilityToItRatio.toFixed(2)} × IT`
          : 'n/a',
    },
    {
      label: 'Planned IT',
      value: expanding ? formatMw(row.plannedItPowerMw) : 'no growth',
      note: expanding ? (row.plannedDate ?? 'projected') : 'tracked',
    },
    {
      label: 'Capex',
      value: row.capexUsdB !== null ? formatUsdB(row.capexUsdB) : 'n/a',
      note:
        row.capexPerItMwUsdM !== null
          ? `$${formatInt(row.capexPerItMwUsdM)}M per IT MW`
          : '',
    },
  ];

  const chart = row.timeline.map((t) => ({
    date: t.date,
    milestone: t.milestone,
    itPowerMw: t.itPowerMw ?? 0,
    facilityPowerMw: t.facilityPowerMw ?? 0,
    projected: t.projected,
  }));

  const sections = [
    {
      title: 'Supply',
      rows: [
        [
          'Grid',
          joinParts([
            row.power.gridUtility,
            row.power.gridOperator ? `(${row.power.gridOperator})` : null,
          ]),
        ],
        [
          'Interconnect',
          joinParts([
            row.power.interconnectionMw !== null
              ? formatMw(row.power.interconnectionMw)
              : null,
            row.power.interconnectionNote,
          ]),
        ],
        [
          'Substation',
          joinParts([
            row.power.substationMw !== null
              ? formatMw(row.power.substationMw)
              : null,
            row.power.substationNote,
          ]),
        ],
        ['On-site', gen.type],
        [
          'On-site MW',
          joinParts([
            gen.capacityMw !== null && gen.capacityMw > 0
              ? formatMw(gen.capacityMw)
              : gen.capacityMw === 0
                ? 'none'
                : null,
            gen.plannedCapacityMw !== null
              ? `→ ${formatMw(gen.plannedCapacityMw)}`
              : null,
            gen.plannedNote,
          ]),
        ],
        ['Units', gen.units],
        ['Note', gen.capacityNote],
        ['Permits', gen.permitStatus],
        ['Batteries', row.power.batteries],
        ['Backup', row.power.backupGenerators],
        [
          'Water',
          row.waterUseMgd !== null
            ? joinParts([`${row.waterUseMgd} MGD`, row.waterNote])
            : null,
        ],
        [
          'Gas-equiv.',
          row.gasEquivalentMmcfd !== null
            ? joinParts([
                `${formatMmcfd(row.gasEquivalentMmcfd)} now`,
                row.plannedGasEquivalentMmcfd !== null &&
                row.plannedGasEquivalentMmcfd !== row.gasEquivalentMmcfd
                  ? `${formatMmcfd(row.plannedGasEquivalentMmcfd)} at full build`
                  : null,
                'illustrative: facility MW × 24 h × 7.0 MMBtu/MWh, as if gas-fired around the clock',
              ])
            : null,
        ],
      ],
    },
    {
      title: 'Compute',
      rows: [
        [
          'H100 equiv.',
          joinParts([
            row.h100e !== null ? formatCount(row.h100e) : null,
            row.plannedH100e !== null && row.plannedH100e !== row.h100e
              ? `→ ${formatCount(row.plannedH100e)}`
              : null,
          ]),
        ],
        [
          'Chips now',
          row.chips.length
            ? row.chips
                .map((c) =>
                  joinParts(
                    [`${formatCount(c.count)} ${c.type}`, c.date],
                    ' · ',
                  ),
                )
                .join('; ')
            : null,
        ],
        [
          'Chips planned',
          row.plannedChips.length
            ? row.plannedChips
                .map((c) =>
                  c.count !== null
                    ? `${formatCount(c.count)} ${c.type}`
                    : c.type,
                )
                .join('; ')
            : null,
        ],
      ],
    },
    {
      title: 'Capital',
      rows: [
        [
          'Capex',
          joinParts([
            row.capexUsdB !== null ? formatUsdB(row.capexUsdB) : null,
            row.plannedCapexUsdB !== null &&
            row.plannedCapexUsdB !== row.capexUsdB
              ? `→ ${formatUsdB(row.plannedCapexUsdB)} at full build`
              : null,
          ]),
        ],
        [
          'Split',
          row.computeCostUsdB !== null
            ? `compute ${formatUsdB(row.computeCostUsdB)} · construction ${formatUsdB(row.constructionCostUsdB)}`
            : null,
        ],
        [
          'Opex',
          row.annualOpexUsdB !== null
            ? `${formatUsdB(row.annualOpexUsdB)} per year`
            : null,
        ],
        [
          'Per IT MW',
          row.capexPerItMwUsdM !== null
            ? `$${formatInt(row.capexPerItMwUsdM)}M`
            : null,
        ],
      ],
    },
    {
      title: 'Campus',
      rows: [
        [
          'Buildings',
          row.buildingsOperational !== null
            ? joinParts([
                `${formatInt(row.buildingsOperational)} operational`,
                row.buildingsPlanned !== null
                  ? `${formatInt(row.buildingsPlanned)} planned`
                  : null,
              ])
            : null,
        ],
        [
          'Land',
          joinParts([
            row.campusAcres !== null
              ? `${formatInt(row.campusAcres)} acres`
              : null,
            row.campusNote,
          ]),
        ],
        [
          'Floor area',
          joinParts([
            row.buildingSqFt !== null
              ? `${formatCount(row.buildingSqFt)} sq ft`
              : null,
            row.buildingSqFtNote,
          ]),
        ],
        ['Cooling', cooling.method],
        [
          'Chiller plant',
          joinParts([
            cooling.chillers !== null
              ? `${formatInt(cooling.chillers)} chillers`
              : null,
            cooling.chillerCapacityMw !== null
              ? `${formatMw(cooling.chillerCapacityMw)} cooling`
              : null,
            cooling.condensers !== null
              ? `${formatInt(cooling.condensers)} condensers`
              : null,
            cooling.plannedChillers !== null
              ? `→ ${formatInt(cooling.plannedChillers)} chillers planned`
              : null,
          ]),
        ],
        ['Address', row.address],
        ['Position', row.positionSource],
        ['First online', row.firstOperational],
      ],
    },
    {
      title: 'People',
      rows: [
        ['Owner', row.owner],
        ['Operator', row.operator],
        ['Users', row.users.length ? row.users.join(', ') : null],
        ['Investors', row.investors.length ? row.investors.join(', ') : null],
        ['Builders', row.builders.length ? row.builders.join(', ') : null],
        [
          'Energy',
          row.energyCompanies.length ? row.energyCompanies.join('; ') : null,
        ],
      ],
    },
  ].map((section) => ({
    title: section.title,
    rows: section.rows.filter(([, value]) => value !== null && value !== ''),
  }));

  return {
    id: row.id,
    kicker: joinParts([
      row.rank
        ? `#${row.rank}${total ? ` of ${total}` : ''} US by current IT power`
        : null,
      row.status,
    ]),
    title: row.name,
    subtitle: joinParts([
      joinParts([row.city, row.state], ', '),
      row.project ? `project ${row.project}` : null,
      row.owner ? `owner ${row.owner}` : null,
    ]),
    stats,
    chart,
    sections,
    timeline: row.timeline,
    sources: row.sources,
    notes: row.notes,
    footer: joinParts([
      row.asOf ? `site data as of ${row.asOf}` : null,
      'Epoch AI, AI Data Centers (CC BY 4.0)',
    ]),
  };
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

const STYLE_ID = 'dc-dossier-styles';
const CSS = `
.dc-dossier{position:fixed;top:96px;right:16px;bottom:96px;width:min(440px,38vw);z-index:120;display:flex;flex-direction:column;background:var(--glass-bg,rgba(12,12,20,.72));border:1px solid var(--glass-border,rgba(255,255,255,.08));border-radius:var(--panel-radius,16px);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4);box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.03) inset;color:var(--text-primary,#e8eaed);font-family:var(--font-sans,Inter,sans-serif);overflow:hidden;animation:dc-dossier-in 220ms cubic-bezier(.4,0,.2,1)}
.dc-dossier[hidden]{display:none}
@keyframes dc-dossier-in{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
.dc-dossier__head{padding:14px 16px 10px;border-bottom:1px solid var(--glass-border,rgba(255,255,255,.08))}
.dc-dossier__kicker{display:flex;justify-content:space-between;align-items:center;font-family:var(--font-mono,monospace);font-size:9px;letter-spacing:2.4px;color:var(--text-dim,rgba(232,234,237,.3));text-transform:uppercase}
.dc-dossier__close{width:22px;height:22px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:var(--text-dim,rgba(232,234,237,.3));font-family:var(--font-mono,monospace);font-size:13px;line-height:1;cursor:pointer}
.dc-dossier__close:hover{color:var(--text-primary,#e8eaed);border-color:var(--accent,#00d4ff)}
.dc-dossier__title{font-size:17px;font-weight:600;margin:6px 0 2px;letter-spacing:.2px}
.dc-dossier__sub{font-size:11px;color:var(--text-secondary,rgba(232,234,237,.5))}
.dc-dossier__stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 16px;border-bottom:1px solid var(--glass-border,rgba(255,255,255,.08))}
.dc-stat{background:rgba(255,255,255,.03);border:1px solid var(--glass-border,rgba(255,255,255,.08));border-radius:10px;padding:8px;min-width:0}
.dc-stat__label{font-family:var(--font-mono,monospace);font-size:8px;letter-spacing:2px;color:var(--text-dim,rgba(232,234,237,.3));text-transform:uppercase}
.dc-stat__value{font-family:var(--font-mono,monospace);font-size:14px;font-weight:600;color:var(--accent,#00d4ff);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-stat__note{font-size:9.5px;color:var(--text-secondary,rgba(232,234,237,.5));margin-top:2px;overflow-wrap:anywhere}
.dc-dossier__body{flex:1;overflow-y:auto;padding:6px 16px 12px;scrollbar-width:thin}
.dc-section{margin-top:12px}
.dc-section__title{font-family:var(--font-mono,monospace);font-size:9px;letter-spacing:2.4px;color:var(--text-secondary,rgba(232,234,237,.5));text-transform:uppercase;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:6px}
.dc-row{display:grid;grid-template-columns:96px 1fr;gap:10px;font-size:11.5px;line-height:1.45;padding:3px 0}
.dc-row__k{color:var(--text-secondary,rgba(232,234,237,.5));font-family:var(--font-mono,monospace);font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;padding-top:2px}
.dc-row__v{color:var(--text-primary,#e8eaed);overflow-wrap:anywhere}
.dc-chart{display:block;width:100%;height:110px}
.dc-chart__bar{fill:var(--accent,#00d4ff);opacity:.85}
.dc-chart__bar--projected{fill:none;stroke:var(--accent,#00d4ff);stroke-width:1;stroke-dasharray:3 2;opacity:.8}
.dc-chart__fac{fill:none;stroke:rgba(255,255,255,.35);stroke-width:1}
.dc-chart__label{font-family:var(--font-mono,monospace);font-size:8px;fill:var(--text-dim,rgba(232,234,237,.3))}
.dc-chart__value{font-family:var(--font-mono,monospace);font-size:8px;fill:var(--text-secondary,rgba(232,234,237,.5))}
.dc-legend{font-size:9.5px;color:var(--text-dim,rgba(232,234,237,.3));font-family:var(--font-mono,monospace);margin-top:2px}
.dc-table{width:100%;border-collapse:collapse;font-size:10.5px;font-family:var(--font-mono,monospace)}
.dc-table th,.dc-table td{text-align:left;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}
.dc-table th{color:var(--text-dim,rgba(232,234,237,.3));font-weight:500;font-size:8.5px;letter-spacing:1px;text-transform:uppercase}
.dc-table td.num{text-align:right;white-space:nowrap}
.dc-table tr.is-projected td{color:var(--text-secondary,rgba(232,234,237,.5));font-style:italic}
.dc-links a{color:var(--accent,#00d4ff);text-decoration:none;font-size:11px;display:block;padding:2px 0;overflow-wrap:anywhere}
.dc-links a:hover{text-decoration:underline}
.dc-note{font-size:10.5px;color:var(--text-secondary,rgba(232,234,237,.5));margin-top:4px;line-height:1.4}
.dc-dossier__foot{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--glass-border,rgba(255,255,255,.08))}
.dc-btn{flex:1;font-family:var(--font-mono,monospace);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-primary,#e8eaed);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:var(--btn-radius,10px);padding:8px 6px;cursor:pointer;transition:background 150ms,border-color 150ms;white-space:nowrap}
.dc-btn:hover{background:var(--accent-dim,rgba(0,212,255,.15));border-color:var(--accent,#00d4ff)}
.dc-btn--icon{flex:0 0 auto;padding:8px 10px}
.dc-dossier__foot-note{font-size:9px;color:var(--text-dim,rgba(232,234,237,.3));padding:0 16px 10px;font-family:var(--font-mono,monospace)}
@media (max-width:900px){.dc-dossier{left:16px;right:16px;width:auto;top:auto;bottom:110px;max-height:52vh}.dc-dossier__stats{grid-template-columns:repeat(2,1fr)}}
`;

function ensureStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** IT power per milestone as bars (built solid, projected dashed) with the facility line above. */
function renderChart(doc, points) {
  const width = 400;
  const height = 110;
  const padL = 34;
  const padR = 6;
  const padT = 10;
  const padB = 24;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'dc-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'IT power by milestone');
  const usable = points.filter((p) => p.itPowerMw > 0 || p.facilityPowerMw > 0);
  if (usable.length === 0) return svg;
  const max = Math.max(
    ...usable.map((p) => Math.max(p.itPowerMw, p.facilityPowerMw)),
  );
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const slot = plotW / usable.length;
  const barW = Math.max(6, Math.min(28, slot * 0.55));
  const y = (mw) => padT + plotH - (mw / max) * plotH;

  // Axis ticks: 0 and max.
  for (const [mw, label] of [
    [0, '0'],
    [max, formatMw(max)],
  ]) {
    const t = doc.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(padL - 4));
    t.setAttribute('y', String(y(mw) + 3));
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('class', 'dc-chart__label');
    t.textContent = label;
    svg.appendChild(t);
  }

  const facPath = [];
  usable.forEach((p, i) => {
    const cx = padL + slot * i + slot / 2;
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(cx - barW / 2));
    rect.setAttribute('y', String(y(p.itPowerMw)));
    rect.setAttribute('width', String(barW));
    rect.setAttribute(
      'height',
      String(Math.max(0, padT + plotH - y(p.itPowerMw))),
    );
    rect.setAttribute('rx', '2');
    rect.setAttribute(
      'class',
      p.projected ? 'dc-chart__bar dc-chart__bar--projected' : 'dc-chart__bar',
    );
    const title = doc.createElementNS(SVG_NS, 'title');
    title.textContent = `${p.date} · ${p.milestone} · ${formatMw(p.itPowerMw)} IT · ${formatMw(p.facilityPowerMw)} facility${p.projected ? ' (projected)' : ''}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    if (p.facilityPowerMw > 0)
      facPath.push(
        `${facPath.length ? 'L' : 'M'}${cx.toFixed(1)},${y(p.facilityPowerMw).toFixed(1)}`,
      );
    const value = doc.createElementNS(SVG_NS, 'text');
    value.setAttribute('x', String(cx));
    value.setAttribute('y', String(y(p.itPowerMw) - 3));
    value.setAttribute('text-anchor', 'middle');
    value.setAttribute('class', 'dc-chart__value');
    value.textContent = p.itPowerMw > 0 ? formatInt(p.itPowerMw) : '';
    svg.appendChild(value);
    const label = doc.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(cx));
    label.setAttribute('y', String(height - 12));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'dc-chart__label');
    label.textContent = p.date.slice(2, 7).replace('-', '/');
    svg.appendChild(label);
  });
  if (facPath.length > 1) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', facPath.join(' '));
    path.setAttribute('class', 'dc-chart__fac');
    svg.appendChild(path);
  }
  return svg;
}

function renderTimeline(doc, timeline) {
  const table = el(doc, 'table', 'dc-table');
  const thead = el(doc, 'thead');
  const hr = el(doc, 'tr');
  for (const [label, cls] of [
    ['Date', ''],
    ['Milestone', ''],
    ['Bldg', 'num'],
    ['IT MW', 'num'],
    ['Fac MW', 'num'],
  ]) {
    const th = el(doc, 'th', cls, label);
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el(doc, 'tbody');
  for (const t of timeline) {
    const tr = el(doc, 'tr', t.projected ? 'is-projected' : '');
    tr.appendChild(el(doc, 'td', '', t.date));
    tr.appendChild(
      el(
        doc,
        'td',
        '',
        t.projected ? `${t.milestone} (projected)` : t.milestone,
      ),
    );
    tr.appendChild(
      el(
        doc,
        'td',
        'num',
        t.buildingsOperational !== null
          ? formatInt(t.buildingsOperational)
          : '',
      ),
    );
    tr.appendChild(
      el(doc, 'td', 'num', t.itPowerMw !== null ? formatInt(t.itPowerMw) : ''),
    );
    tr.appendChild(
      el(
        doc,
        'td',
        'num',
        t.facilityPowerMw !== null ? formatInt(t.facilityPowerMw) : '',
      ),
    );
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderModel(doc, root, model) {
  root.textContent = '';

  const head = el(doc, 'div', 'dc-dossier__head');
  const kicker = el(doc, 'div', 'dc-dossier__kicker');
  kicker.appendChild(el(doc, 'span', '', model.kicker || 'data center'));
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

  const stats = el(doc, 'div', 'dc-dossier__stats');
  for (const stat of model.stats) {
    const tile = el(doc, 'div', 'dc-stat');
    tile.appendChild(el(doc, 'div', 'dc-stat__label', stat.label));
    tile.appendChild(el(doc, 'div', 'dc-stat__value', stat.value));
    tile.appendChild(el(doc, 'div', 'dc-stat__note', stat.note));
    stats.appendChild(tile);
  }
  root.appendChild(stats);

  const body = el(doc, 'div', 'dc-dossier__body');

  const power = el(doc, 'div', 'dc-section');
  power.appendChild(
    el(doc, 'div', 'dc-section__title', 'Power path · IT MW by milestone'),
  );
  power.appendChild(renderChart(doc, model.chart));
  power.appendChild(
    el(
      doc,
      'div',
      'dc-legend',
      'solid built · dashed projected · line facility MW',
    ),
  );
  body.appendChild(power);

  for (const section of model.sections) {
    if (!section.rows.length) continue;
    const box = el(doc, 'div', 'dc-section');
    box.appendChild(el(doc, 'div', 'dc-section__title', section.title));
    for (const [key, value] of section.rows) {
      const row = el(doc, 'div', 'dc-row');
      row.appendChild(el(doc, 'div', 'dc-row__k', key));
      row.appendChild(el(doc, 'div', 'dc-row__v', value));
      box.appendChild(row);
    }
    body.appendChild(box);
  }

  if (model.timeline.length) {
    const box = el(doc, 'div', 'dc-section');
    box.appendChild(el(doc, 'div', 'dc-section__title', 'Timeline'));
    box.appendChild(renderTimeline(doc, model.timeline));
    body.appendChild(box);
  }

  if (model.notes.length) {
    const box = el(doc, 'div', 'dc-section');
    box.appendChild(el(doc, 'div', 'dc-section__title', 'Notes'));
    for (const note of model.notes)
      box.appendChild(el(doc, 'div', 'dc-note', note));
    body.appendChild(box);
  }

  if (model.sources.length) {
    const box = el(doc, 'div', 'dc-section dc-links');
    box.appendChild(el(doc, 'div', 'dc-section__title', 'Sources'));
    for (const source of model.sources) {
      const a = el(doc, 'a', '', source.title);
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.appendChild(a);
    }
    body.appendChild(box);
  }
  root.appendChild(body);

  const foot = el(doc, 'div', 'dc-dossier__foot');
  for (const [action, label, icon] of [
    ['prev', '◂', true],
    ['fly', 'Fly to campus', false],
    ['zoom-out', 'Zoom out', false],
    ['next', '▸', true],
  ]) {
    const btn = el(
      doc,
      'button',
      icon ? 'dc-btn dc-btn--icon' : 'dc-btn',
      label,
    );
    btn.type = 'button';
    btn.dataset.action = action;
    if (action === 'prev') btn.title = 'Previous site by IT power';
    if (action === 'next') btn.title = 'Next site by IT power';
    foot.appendChild(btn);
  }
  root.appendChild(foot);
  root.appendChild(el(doc, 'div', 'dc-dossier__foot-note', model.footer));
}

/**
 * Own the drawer element. Idempotent show/hide; the caller decides what a
 * button means (fly, zoom out, step, close) so the drawer never touches the
 * camera or the context store itself.
 */
export function createDatacenterDossier({
  document: doc = globalThis.document,
  onClose,
  onFlyTo,
  onZoomOut,
  onStep,
} = {}) {
  if (!doc?.createElement) throw new TypeError('Dossier requires a document');
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
    root.id = 'dc-dossier';
    root.className = 'dc-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Data center dossier');
    root.addEventListener('click', handleClick);
    doc.body.appendChild(root);
    return root;
  }

  return {
    show(row, { total = null } = {}) {
      if (!row) return;
      const node = ensureRoot();
      current = row;
      renderModel(doc, node, buildDossierModel(row, { total }));
      node.hidden = false;
      node.scrollTop = 0;
      const body = node.querySelector('.dc-dossier__body');
      if (body) body.scrollTop = 0;
      doc.body.classList.add('dc-dossier-open');
    },
    hide() {
      current = null;
      if (!root) return;
      root.hidden = true;
      doc.body.classList.remove('dc-dossier-open');
    },
    isOpen() {
      return Boolean(root && !root.hidden);
    },
    current() {
      return current;
    },
    destroy() {
      current = null;
      if (root) {
        root.removeEventListener('click', handleClick);
        root.remove();
        root = null;
      }
      doc.body?.classList?.remove('dc-dossier-open');
    },
  };
}
