import {
  ensureDossierStyles,
  el,
  renderSeriesChart,
} from '../commodities/dossierChrome.js';
import { monthAbbrev } from '../production/completeness.js';
import {
  daysInMonth,
  facilityStamp,
  formatBbld,
  formatCumGas,
  formatCumOil,
  formatFlaredShare,
  formatInt,
  formatMcfd,
  formatYoy,
} from './records.js';

/**
 * The well dossier (docs/COMMODITIES-PLAN.md §14, R12.10): a scrollable
 * drawer with everything the region bundle holds about one facility, laid
 * out the way an analyst reads a production sheet — row 11's chrome and
 * sections with the onshore quantities (gas sold, flared, days on).
 *
 * The ten-year series lives in a history shard fetched when the drawer
 * opens (R12.6, O1): the drawer renders at once from the index and again
 * when the shard arrives, or says the history is not built on this
 * deployment. `buildOnshoreDossierModel` is pure and tested;
 * `createOnshoreDossier` owns the DOM and nothing else.
 */

export const HISTORY_STATES = Object.freeze([
  'idle',
  'loading',
  'loaded',
  'unavailable',
  'error',
]);

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `82 Mcf/d · +4.2 % vs Jun · ▲ +12.4 % vs last year` — one quantity, three moments, as arithmetic. */
function comparedLine(key, format, current, prior, lastYear, priorMonth) {
  const now = num(current?.[key]);
  if (now === null) return null;
  const parts = [format(now)];
  const then = num(prior?.[key]);
  if (then !== null && then > 0 && priorMonth) {
    const pct = (now / then - 1) * 100;
    parts.push(
      `${pct >= 0 ? '+' : ''}${pct.toFixed(1)} % vs ${monthAbbrev(priorMonth)}`,
    );
  }
  const year = num(lastYear?.[key]);
  if (year !== null && year > 0) {
    const pct = (now / year - 1) * 100;
    parts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(1)} % vs last year`);
  } else if (lastYear !== null && lastYear !== undefined) {
    parts.push('none last year');
  }
  return joinParts(parts);
}

/** The shard's monthly volumes as per-calendar-day rates for the chart. */
export function chartFromHistory(history) {
  if (!history?.months || !history?.series) return null;
  const months = history.months.map(String);
  const rate = (values) =>
    months.map((month, i) => {
      const v = num(values?.[i]);
      return v === null ? null : v / daysInMonth(month);
    });
  const gas = rate(history.series.gas);
  const oil = rate(history.series.oil);
  if (!gas.some((v) => v !== null && v > 0)) return null;
  return {
    months,
    gas,
    oil,
    filedMonths: gas.filter((v) => v !== null).length,
  };
}

/** Pure: the dossier as data, so the layout and the tests share one shape. */
export function buildOnshoreDossierModel(
  row,
  { snapshot = null, history = null, historyState = 'idle' } = {},
) {
  const months = snapshot?.months ?? [];
  const currentIndex = snapshot?.currentIndex ?? months.length - 1;
  const priorMonth = currentIndex > 0 ? months[currentIndex - 1] : null;
  const c = row.current;
  const w = row.summary;
  const producing = row.producing;
  const totalProducing = snapshot?.counts?.producing ?? null;
  const source = snapshot?.sources?.[0] ?? null;
  const region = snapshot?.region ?? null;
  const recon = snapshot?.reconciliation?.latest ?? null;

  const stats = [
    {
      label: 'Gas',
      value: c?.gasMcfd !== null && c ? formatMcfd(c.gasMcfd) : 'none',
      note: producing
        ? formatYoy(row.yoy)
        : row.status === 'quiet'
          ? 'filed, no production'
          : "not in this month's file",
    },
    {
      label: 'Oil',
      value: c?.oilBopd !== null && c ? formatBbld(c.oilBopd) : 'none',
      note:
        c?.runsBbl !== null && c
          ? `runs ${formatInt(c.runsBbl)} bbl in the month`
          : '',
    },
    {
      label: 'Days on',
      value:
        c?.days !== null && c
          ? `${formatInt(c.days)} of ${daysInMonth(c.month)}`
          : 'n/a',
      note:
        c?.gasMcfdProducing !== null && c
          ? `${formatMcfd(c.gasMcfdProducing)} per producing day`
          : '',
    },
    {
      label: 'Flared',
      value:
        c?.flaredMcfd !== null && c
          ? formatMcfd(c.flaredMcfd)
          : c
            ? 'not filed'
            : 'n/a',
      note: joinParts([
        formatFlaredShare(c?.flaredShare),
        c?.gasSoldMcf !== null && c
          ? `sold ${formatMcfd(c.gasSoldMcf / daysInMonth(c.month))}`
          : null,
      ]),
    },
  ];

  const chart = historyState === 'loaded' ? chartFromHistory(history) : null;
  const historyNote =
    historyState === 'loaded'
      ? chart
        ? `${formatInt(chart.filedMonths)} months filed in the window`
        : 'no gas filed in the window'
      : historyState === 'loading'
        ? 'loading the ten-year series…'
        : historyState === 'unavailable'
          ? `history shards are not built on this deployment — run npm run build:onshore -- --region ${region?.id ?? '<region>'}`
          : historyState === 'error'
            ? 'the ten-year series could not be read'
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
          'Gas sold',
          c?.gasSoldMcf !== null && c
            ? joinParts([
                `${formatInt(c.gasSoldMcf)} Mcf`,
                c.gasMcf > 0
                  ? `${Math.round((c.gasSoldMcf / c.gasMcf) * 100)} % of produced`
                  : null,
              ])
            : null,
        ],
        [
          'Flared',
          c?.flaredMcf !== null && c
            ? joinParts([
                `${formatInt(c.flaredMcf)} Mcf`,
                formatFlaredShare(c.flaredShare),
              ])
            : null,
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
          'Days on',
          comparedLine(
            'days',
            formatInt,
            c,
            row.prior,
            row.lastYear,
            priorMonth,
          ),
        ],
        ['Stamp', facilityStamp(row)],
      ],
    },
    {
      title: 'Identity',
      rows: [
        ['API', row.api],
        ['File no.', row.fileNo !== null ? String(row.fileNo) : null],
        ['Operator', row.operator],
        ['Field', row.field],
        ['County', row.county],
        ['Pools', row.pools.length ? row.pools.join(', ') : null],
        ['Grain', 'well · pools summed per month'],
        [
          'Filed',
          joinParts([
            row.firstSeen ? `first in this window ${row.firstSeen}` : null,
            row.lastSeen ? `last ${row.lastSeen}` : null,
          ]),
        ],
        [
          'Location',
          joinParts([
            `${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}`,
            source?.datum ?? null,
          ]),
        ],
      ],
    },
    {
      title: 'Ten years',
      rows: w
        ? [
            ['First month', w.firstMonth],
            ['Last month', w.lastMonth],
            ['Producing', `${formatInt(w.monthsProducing)} months`],
            [
              'Peak gas',
              w.peakGasMcfd !== null && w.peakGasMcfd > 0
                ? joinParts([formatMcfd(w.peakGasMcfd), w.peakGasMonth])
                : null,
            ],
            [
              'Peak oil',
              w.peakOilBopd !== null && w.peakOilBopd > 0
                ? joinParts([formatBbld(w.peakOilBopd), w.peakOilMonth])
                : null,
            ],
            ['Cum. gas', formatCumGas(w.cumGasMcf)],
            [
              'Cum. oil',
              w.cumOilBbl !== null && w.cumOilBbl > 0
                ? formatCumOil(w.cumOilBbl)
                : null,
            ],
            [
              'Cum. flared',
              w.cumFlaredMcf !== null && w.cumFlaredMcf > 0
                ? joinParts([
                    formatCumGas(w.cumFlaredMcf),
                    w.cumGasMcf > 0
                      ? `${((w.cumFlaredMcf / w.cumGasMcf) * 100).toFixed(1)} % of gas`
                      : null,
                  ])
                : null,
            ],
            [
              'From peak',
              row.declineFromPeakPct !== null
                ? `${row.declineFromPeakPct >= 0 ? '−' : '+'}${Math.abs(row.declineFromPeakPct).toFixed(1)} % gas vs the peak month`
                : null,
            ],
          ]
        : [['Production', 'none filed for this well in the window']],
    },
    {
      title: 'Sources',
      rows: [
        [
          'Production',
          source
            ? `${source.name}, ${source.cadence} per ${source.grain}, retrieved ${snapshot?.retrieved ?? 'n/a'}`
            : null,
        ],
        [
          'Current month',
          snapshot
            ? joinParts([
                `${snapshot.currentMonth} is the newest complete filing month`,
                lightMonthNote(snapshot),
                snapshot.fillingLine
                  ? `still filling: ${snapshot.fillingLine.toLowerCase()}`
                  : null,
              ])
            : null,
        ],
        [
          'EIA',
          recon
            ? `${recon.month}: ${region?.states?.join(', ') ?? 'state'} filings ${(recon.regionGasMcf / 1e6).toFixed(1)} Bcf gas = ${Math.round(recon.gasToGross * 100)} % of EIA gross withdrawals (${(recon.eiaGrossMcf / 1e6).toFixed(1)} Bcf), ${Math.round(recon.gasToMarketed * 100)} % of marketed; oil ${Math.round(recon.oilToEia * 100)} % of EIA`
            : null,
        ],
        ['History', historyNote],
        ['Datum', source?.transform ?? null],
        ['Licence', source?.license ?? null],
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
            ? `#${row.rank}${totalProducing ? ` of ${formatInt(totalProducing)}` : ''} by gas this month`
            : null,
          snapshot?.asOf ?? null,
        ])
      : joinParts([
          row.status === 'quiet'
            ? 'filed, no production'
            : "not in this month's file",
          snapshot?.asOf ?? null,
        ]),
    title: row.name,
    subtitle: joinParts([
      `API ${row.api}`,
      row.field ? `field ${row.field}` : null,
      row.operator ? `operator ${row.operator}` : null,
    ]),
    stats,
    chart,
    historyState,
    historyNote,
    sections,
    footer: joinParts([
      snapshot?.asOf ?? 'state filings',
      source?.license ? 'public record' : null,
    ]),
  };
}

/** `92 % of the usual filers` when the current month's own count is light. */
function lightMonthNote(snapshot) {
  const row = snapshot.completeness?.table?.find(
    (r) => r.month === snapshot.currentMonth,
  );
  if (!row || row.share === null || row.share >= 0.98) return null;
  return `${Math.round(row.share * 100)} % of the usual filers in its workbook`;
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

function renderModel(doc, root, model) {
  root.textContent = '';

  const head = el(doc, 'div', 'dc-dossier__head');
  const kicker = el(doc, 'div', 'dc-dossier__kicker');
  kicker.appendChild(el(doc, 'span', '', model.kicker || 'well'));
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

  const box = el(doc, 'div', 'dc-section');
  box.appendChild(
    el(doc, 'div', 'dc-section__title', 'Ten years · gas per day, oil dashed'),
  );
  if (model.chart) {
    box.appendChild(
      renderSeriesChart(doc, {
        ariaLabel: 'Gas and oil per day by month',
        months: model.chart.months,
        primary: model.chart.gas,
        secondary: model.chart.oil,
        formatPrimaryAxis: (max) => formatMcfd(max).replace(/\/d$/, ''),
        secondaryAxisLines: (max) => ['oil', formatInt(max), 'bbl'],
        pointTitle: (i) =>
          joinParts([
            model.chart.months[i],
            formatMcfd(model.chart.gas[i]),
            model.chart.oil[i] !== null ? formatBbld(model.chart.oil[i]) : null,
          ]),
      }),
    );
    box.appendChild(
      el(
        doc,
        'div',
        'dc-legend',
        'area gas Mcf/d · dashed oil bbl/d on its own scale · gaps are months not filed · hover a point for the month',
      ),
    );
  } else {
    box.appendChild(
      el(doc, 'div', 'dc-note', model.historyNote || 'no series'),
    );
  }
  body.appendChild(box);

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
  for (const [action, label, icon] of [
    ['prev', '◂', true],
    ['fly', 'Fly to well', false],
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
    if (action === 'prev') btn.title = 'Previous well by gas';
    if (action === 'next') btn.title = 'Next well by gas';
    foot.appendChild(btn);
  }
  root.appendChild(foot);
  root.appendChild(el(doc, 'div', 'dc-dossier__foot-note', model.footer));
}

/**
 * Own the drawer element. Idempotent show/hide; `update` re-renders only
 * while the same well is open (the history arrives after the drawer). The
 * caller decides what a button means (fly, zoom out, step, close) so the
 * drawer never touches the camera or the context store itself.
 */
export function createOnshoreDossier({
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
    root.id = 'onshore-dossier';
    root.className = 'dc-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Well dossier');
    root.addEventListener('click', handleClick);
    doc.body.appendChild(root);
    return root;
  }

  function render(row, context) {
    const node = ensureRoot();
    renderModel(doc, node, buildOnshoreDossierModel(row, context));
    return node;
  }

  return {
    show(row, context = {}) {
      if (!row) return;
      const node = render(row, context);
      current = row;
      node.hidden = false;
      node.scrollTop = 0;
      const body = node.querySelector('.dc-dossier__body');
      if (body) body.scrollTop = 0;
      doc.body.classList.add('dc-dossier-open');
    },
    /** Re-render for the well already open (the history shard arrived); ignored otherwise. */
    update(row, context = {}) {
      if (!row || !current || current.id !== row.id || !root || root.hidden)
        return false;
      const body = root.querySelector('.dc-dossier__body');
      const scrollTop = body ? body.scrollTop : 0;
      render(row, context);
      const again = root.querySelector('.dc-dossier__body');
      if (again) again.scrollTop = scrollTop;
      return true;
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
