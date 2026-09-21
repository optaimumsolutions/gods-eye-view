import {
  ensureDossierStyles,
  el,
  renderSeriesChart,
} from '../commodities/dossierChrome.js';
import { monthAbbrev } from './completeness.js';
import {
  GULF_SOURCE_NAME,
  formatBbld,
  formatCumGas,
  formatCumOil,
  formatInt,
  formatMcfd,
  formatWaterDepth,
  formatYoy,
  platformStamp,
} from './records.js';

/**
 * The platform dossier (docs/COMMODITIES-PLAN.md §13, R11.7): a scrollable
 * drawer with everything the bundle holds about one structure, laid out the
 * way an analyst reads a production sheet. `buildGulfDossierModel` is pure
 * and tested; `createGulfDossier` owns the DOM and nothing else. The layer
 * calls `show` and `hide`; the drawer calls back for fly, zoom-out, previous,
 * next and close.
 */

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

/** `12.1 MMcf/d · +4.2 % vs May · ▲ +12.4 % vs last year` — one quantity, three moments, as arithmetic. */
function comparedLine(label, format, current, prior, lastYear, priorMonth) {
  const now = current?.[label] ?? null;
  if (now === null) return null;
  const parts = [format(now)];
  const then = prior?.[label] ?? null;
  if (then !== null && then > 0 && priorMonth) {
    const pct = (now / then - 1) * 100;
    parts.push(
      `${pct >= 0 ? '+' : ''}${pct.toFixed(1)} % vs ${monthAbbrev(priorMonth)}`,
    );
  }
  const year = lastYear?.[label] ?? null;
  if (year !== null && year > 0) {
    const pct = (now / year - 1) * 100;
    parts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(1)} % vs last year`);
  } else if (year === 0 || year === null) {
    parts.push('none last year');
  }
  return joinParts(parts);
}

/** Pure: the dossier as data, so the layout and the tests share one shape. */
export function buildGulfDossierModel(row, { snapshot = null } = {}) {
  const months = snapshot?.months ?? [];
  const currentIndex = snapshot?.currentIndex ?? months.length - 1;
  const priorMonth = currentIndex > 0 ? months[currentIndex - 1] : null;
  const c = row.current;
  const life = row.lifetime;
  const producing = row.producing;
  const totalProducing = snapshot?.counts?.producing ?? null;

  const stats = [
    {
      label: 'Gas',
      value: c?.gasMcfd !== null && c ? formatMcfd(c.gasMcfd) : 'none',
      note: producing
        ? formatYoy(row.yoy)
        : row.series
          ? 'no gas this month'
          : 'no production filed',
    },
    {
      label: 'Oil',
      value: c?.oilBopd !== null && c ? formatBbld(c.oilBopd) : 'none',
      note:
        c?.boepd !== null && c
          ? `${formatInt(c.boepd)} BOE/d${c.boeFiled ? '' : ' (5.62 Mcf/bbl)'}`
          : '',
    },
    {
      label: 'Wells',
      value: c?.wells !== null && c ? formatInt(c.wells) : 'n/a',
      note:
        c?.waterBwpd !== null && c ? `water ${formatBbld(c.waterBwpd)}` : '',
    },
    {
      label: 'Water depth',
      value: formatWaterDepth(row.waterDepthFt),
      note: joinParts([
        row.type ? row.type.toLowerCase() : null,
        row.major ? 'major structure' : null,
      ]),
    },
  ];

  const chart = row.series
    ? {
        months,
        currentIndex,
        gas: row.series.gas,
        oil: row.series.oil,
      }
    : null;

  const sections = [
    {
      title: `This month · ${snapshot?.currentMonth ?? 'n/a'}`,
      rows: [
        [
          'Gas',
          comparedLine(
            'gasMcfd',
            formatMcfd,
            c,
            row.prior,
            row.lastYear,
            priorMonth,
          ),
        ],
        [
          'Oil',
          comparedLine(
            'oilBopd',
            formatBbld,
            c,
            row.prior,
            row.lastYear,
            priorMonth,
          ),
        ],
        [
          'Water',
          comparedLine(
            'waterBwpd',
            formatBbld,
            c,
            row.prior,
            row.lastYear,
            priorMonth,
          ),
        ],
        [
          'BOE',
          c?.boepd !== null && c
            ? joinParts([
                `${formatInt(c.boepd)} BOE/d`,
                c.boeFiled ? 'as filed' : 'oil + gas ÷ 5.62, BSEE convention',
              ])
            : null,
        ],
        [
          'Wells',
          comparedLine(
            'wells',
            formatInt,
            c,
            row.prior,
            row.lastYear,
            priorMonth,
          ),
        ],
        ['Stamp', platformStamp(row)],
      ],
    },
    {
      title: 'Identity',
      rows: [
        [
          'Complex',
          row.complexId
            ? `${row.complexId} · structure ${row.structureNumber ?? '?'}`
            : null,
        ],
        ['Area · block', row.areaBlock],
        ['Lease', row.lease],
        ['Field', row.field],
        ['Operator', row.operator],
        ['Type', joinParts([row.type, row.major ? 'major' : null])],
        ['Installed', row.installed],
        [
          'Water depth',
          row.waterDepthFt !== null ? formatWaterDepth(row.waterDepthFt) : null,
        ],
        [
          'Datum',
          row.nad ? `NAD ${row.nad} as published, not converted` : null,
        ],
        ['District', row.district],
        [
          'Incidents',
          row.incidents !== null
            ? `${formatInt(row.incidents)} of non-compliance on record (BSEE INC)`
            : null,
        ],
      ],
    },
    {
      title: 'Lifetime',
      rows: life
        ? [
            ['First month', life.firstMonth],
            ['Last month', life.lastMonth],
            ['Producing', `${formatInt(life.monthsProducing)} months`],
            [
              'Peak gas',
              life.peakGasMcfd !== null
                ? joinParts([formatMcfd(life.peakGasMcfd), life.peakGasMonth])
                : null,
            ],
            [
              'Peak oil',
              life.peakOilBopd !== null && life.peakOilBopd > 0
                ? joinParts([formatBbld(life.peakOilBopd), life.peakOilMonth])
                : null,
            ],
            ['Cum. gas', formatCumGas(life.cumGasMcf)],
            [
              'Cum. oil',
              life.cumOilBbl !== null && life.cumOilBbl > 0
                ? formatCumOil(life.cumOilBbl)
                : null,
            ],
            [
              'From peak',
              row.declineFromPeakPct !== null
                ? `${row.declineFromPeakPct >= 0 ? '−' : '+'}${Math.abs(row.declineFromPeakPct).toFixed(1)} % gas vs the peak month`
                : null,
            ],
          ]
        : [['Production', 'none filed for this structure']],
    },
    {
      title: 'Sources',
      rows: [
        [
          'Production',
          `BSEE OGOR-A production by platform, monthly per structure, retrieved ${snapshot?.retrieved ?? 'n/a'}`,
        ],
        [
          'Structure',
          'BSEE platform structures (coordinates, water depth, install date) and incidents of non-compliance',
        ],
        [
          'Current month',
          snapshot
            ? joinParts([
                `${snapshot.currentMonth} is the newest complete reporting month`,
                snapshot.fillingLine
                  ? `still filling: ${snapshot.fillingLine.toLowerCase()}`
                  : null,
              ])
            : null,
        ],
        [
          'Coverage',
          snapshot?.counts
            ? joinParts([
                `${formatInt(snapshot.counts.producing)} Gulf structures producing gas`,
                ...snapshot.counts.outOfRegion.map(
                  (r) =>
                    `${r.name}: ${formatInt(r.structures)} in the file, not on this map`,
                ),
              ])
            : null,
        ],
        [
          'Licence',
          'US Government public domain (BSEE, US Department of the Interior)',
        ],
      ],
    },
  ].map((section) => ({
    title: section.title,
    rows: section.rows.filter(([, value]) => value !== null && value !== ''),
  }));

  return {
    id: row.id,
    kicker: producing
      ? joinParts([
          row.rank
            ? `#${row.rank}${totalProducing ? ` of ${totalProducing}` : ''} by gas this month`
            : null,
          snapshot?.asOf ?? null,
        ])
      : joinParts([
          'installed',
          row.series ? 'no gas this month' : 'no production filed',
          snapshot?.asOf ?? null,
        ]),
    title: row.name,
    subtitle: joinParts([
      row.areaBlock,
      row.complexId ? `complex ${row.complexId}` : null,
      row.operator ? `operator ${row.operator}` : null,
    ]),
    stats,
    chart,
    sections,
    // The stamp already names BSEE; without a snapshot the source name stands in.
    footer: joinParts([
      snapshot?.asOf ?? GULF_SOURCE_NAME,
      'US Department of the Interior · public domain',
    ]),
  };
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

/**
 * Ten years of gas as a filled area with oil as a dashed line on its own
 * scale, drawn by the chrome's shared chart (`renderSeriesChart`, moved
 * there when the onshore wells needed the same picture). Gas Mcf/d on the
 * left axis, oil bbl/d on the right; one point per filed month.
 */
function renderGasOilChart(doc, chart) {
  return renderSeriesChart(doc, {
    ariaLabel: 'Gas and oil per day by month',
    months: chart.months,
    primary: chart.gas,
    secondary: chart.oil,
    formatPrimaryAxis: (max) => formatMcfd(max).replace(/\/d$/, ''),
    secondaryAxisLines: (max) => ['oil', formatInt(max), 'bbl'],
    pointTitle: (i) =>
      joinParts([
        chart.months[i],
        formatMcfd(chart.gas[i]),
        chart.oil[i] !== null ? formatBbld(chart.oil[i]) : null,
      ]),
  });
}

function renderModel(doc, root, model) {
  root.textContent = '';

  const head = el(doc, 'div', 'dc-dossier__head');
  const kicker = el(doc, 'div', 'dc-dossier__kicker');
  kicker.appendChild(el(doc, 'span', '', model.kicker || 'platform'));
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

  // Two tiles a row: "154.9 MMcf/d" and its change line need the width.
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

  if (model.chart) {
    const box = el(doc, 'div', 'dc-section');
    box.appendChild(
      el(
        doc,
        'div',
        'dc-section__title',
        `Ten years · gas per day, oil dashed`,
      ),
    );
    box.appendChild(renderGasOilChart(doc, model.chart));
    box.appendChild(
      el(
        doc,
        'div',
        'dc-legend',
        'area gas Mcf/d · dashed oil bbl/d on its own scale · gaps are months not filed · hover a point for the month',
      ),
    );
    body.appendChild(box);
  }

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
  root.appendChild(body);

  const foot = el(doc, 'div', 'dc-dossier__foot');
  for (const [action, label, icon] of [
    ['prev', '◂', true],
    ['fly', 'Fly to platform', false],
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
    if (action === 'prev') btn.title = 'Previous platform by gas';
    if (action === 'next') btn.title = 'Next platform by gas';
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
export function createGulfDossier({
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
    ensureDossierStyles(doc);
    root = doc.createElement('aside');
    root.id = 'gulf-dossier';
    root.className = 'dc-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Platform dossier');
    root.addEventListener('click', handleClick);
    doc.body.appendChild(root);
    return root;
  }

  return {
    show(row, { snapshot = null } = {}) {
      if (!row) return;
      const node = ensureRoot();
      current = row;
      renderModel(doc, node, buildGulfDossierModel(row, { snapshot }));
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
