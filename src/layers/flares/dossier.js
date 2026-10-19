import {
  el,
  ensureDossierStyles,
  svgEl,
} from '../commodities/dossierChrome.js';
import {
  FLARES_NORM_WINDOW_NIGHTS,
  mcfPerDay,
  regionNightSeries,
  siteNightSeries,
} from './records.js';

/**
 * The flare dossiers (docs/COMMODITIES-PLAN.md §17, FR-F7), on the drawer
 * chrome shared with rows 8, 11 and 12.
 *
 * Site: the served nights of the site's max FRP with untrusted (obscured or
 * suspect) nights hatched, under it the monthly state flared bars from the
 * bundle and the pad's wells. Region: the nightly lit-site series with the
 * 30-clear-night band and the monthly state flared total. The night window
 * is drawn by date over `windowNights` (90), so six nights of store read as
 * six marks near the right edge, not six bars stretched across the chart.
 *
 * `buildSiteDossierModel` and `buildRegionDossierModel` are pure and tested;
 * `createFlaresDossier` owns the DOM and nothing else.
 */

function joinParts(parts, sep = ' · ') {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .join(sep);
}

function formatInt(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : 'n/a';
}

function formatMw(mw) {
  if (!Number.isFinite(mw)) return 'n/a';
  return `${mw >= 100 ? Math.round(mw) : mw.toFixed(1)} MW`;
}

function formatMcfd(mcfd) {
  if (!Number.isFinite(mcfd)) return 'n/a';
  return `${formatInt(Math.round(mcfd))} Mcf/d`;
}

/** The night chart's domain: `windowNights` ending at the newest served night. */
export function nightChartDomain(series, windowNights) {
  const newest = series.at(-1)?.night ?? null;
  if (!newest) return null;
  const end = Date.parse(`${newest}T00:00:00Z`);
  const days = Math.max(2, windowNights || FLARES_NORM_WINDOW_NIGHTS);
  return { endMs: end, days, startMs: end - (days - 1) * 86_400_000 };
}

/** Pure: the site dossier as data, so the layout and the tests share one shape. */
export function buildSiteDossierModel(row, snapshot) {
  const nightSeries = siteNightSeries(snapshot.nights, row.id);
  const display = snapshot.displayNight;
  const clearNights = snapshot.clearNights;
  const filedMcfd = mcfPerDay(row.flaredMcfCurrent, snapshot.currentMonth);
  const stats = [
    {
      label: display ? `Night ${display.night}` : 'Night',
      value: row.lit ? formatMw(row.maxFrp) : 'dark',
      note: row.lit
        ? joinParts([
            `${row.detections} detection${row.detections === 1 ? '' : 's'}`,
            row.satellites.join('+'),
          ])
        : row.lastLit
          ? `last lit ${row.lastLit.night}`
          : 'not lit in the served window',
    },
    {
      label: 'Nights lit',
      value: clearNights > 0 ? `${row.litNights} of ${clearNights}` : 'no norm',
      note: `the last ${FLARES_NORM_WINDOW_NIGHTS} clear nights served`,
    },
    {
      label: 'Filed flared',
      value: row.flaredMcfCurrent > 0 ? formatMcfd(filedMcfd) : 'none',
      note:
        row.flaredMcfCurrent > 0
          ? `${snapshot.currentMonth} · flared ${row.monthsFlared} of the last 12 filed months`
          : row.lastFlaredMonth
            ? `last filed ${row.lastFlaredMonth}`
            : '',
    },
    {
      label: 'Gas this month',
      value:
        row.gasMcfCurrent > 0
          ? formatMcfd(mcfPerDay(row.gasMcfCurrent, snapshot.currentMonth))
          : 'none',
      note:
        row.oilBblCurrent > 0
          ? `oil ${formatInt(Math.round(row.oilBblCurrent / 30))} bbl/d`
          : '',
    },
  ];
  const sections = [
    {
      title: 'Sky',
      rows: [
        [
          'This night',
          display
            ? joinParts([
                `${display.cloud.state}${display.suspect ? ' · suspect' : ''}`,
                row.siteCloud && row.siteCloud !== 'unknown'
                  ? `site station ${row.siteCloud}`
                  : null,
              ])
            : null,
        ],
        [
          'Hatched',
          'nights drawn hatched were obscured or failed the suspect backstop — left out of every norm',
        ],
      ],
    },
    {
      title: 'The pad',
      rows: [
        ['Field', row.field || null],
        ['County', row.county || null],
        ['Operators', row.operators.length ? row.operators.join(', ') : null],
        [
          'Wells',
          row.wellIds.length
            ? `${row.wells} on the pad: ${
                row.wellIds.length > 12
                  ? `${row.wellIds.slice(0, 12).join(', ')} +${row.wellIds.length - 12} more`
                  : row.wellIds.join(', ')
              }`
            : null,
        ],
        ['Location', `${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}`],
        ['Site id', row.id],
      ],
    },
    {
      title: 'Sources',
      rows: [
        ['Heat', 'NASA FIRMS VIIRS NRT (CC0), night detections, keyless'],
        [
          'Sky',
          'IEM ASOS / NWS observations at the overpasses (public domain)',
        ],
        [
          'Filings',
          joinParts([
            snapshot.sourceName || 'North Dakota DMR',
            `monthly per well, current ${snapshot.currentMonth}`,
          ]),
        ],
        ['Stamp', snapshotStamp(snapshot)],
      ],
    },
  ].map(filterSection);
  return {
    mode: 'site',
    id: row.id,
    kicker: joinParts([
      'flare site',
      snapshot.regionName,
      display ? `night ${display.night}` : null,
    ]),
    title: row.field || row.id,
    subtitle: joinParts([
      row.operators[0] ?? null,
      row.county ? `${row.county} county` : null,
      `${row.wells} well${row.wells === 1 ? '' : 's'}`,
    ]),
    stats,
    nightChart: {
      series: nightSeries,
      windowNights: snapshot.windowNights,
      band: null,
      valueOf: (n) => n.frp,
      axisLabel: 'MW',
      ariaLabel: 'Nightly max FRP',
    },
    monthChart: {
      months: snapshot.months,
      values: row.flaredMonthly,
      ariaLabel: 'Monthly state flared gas',
    },
    footer: joinParts([
      'NASA FIRMS VIIRS NRT · IEM ASOS / NWS',
      snapshot.sourceName || 'state filings',
    ]),
  };
}

/** Pure: the region dossier as data. */
export function buildRegionDossierModel(snapshot) {
  const nightSeries = regionNightSeries(snapshot.nights);
  const display = snapshot.displayNight;
  const base = snapshot.baseline;
  const filed = snapshot.bundleCounts;
  const stats = [
    {
      label: display ? `Night ${display.night}` : 'Night',
      value: display ? `${formatInt(display.litSites)} lit` : 'n/a',
      note: display
        ? joinParts([
            formatMw(display.siteFrpMw),
            `${display.cloud.state}${display.suspect ? ' · suspect' : ''}`,
          ])
        : '',
    },
    {
      label: 'Clear-night norm',
      value:
        base?.clearNights > 0 && Number.isFinite(base.litMedian)
          ? `${formatInt(Math.round(base.litMedian))} lit`
          : 'no norm yet',
      note:
        base?.clearNights > 0
          ? `median over ${base.clearNights} clear nights · ${formatMw(base.frpMedian)}`
          : `needs clear nights in the ${FLARES_NORM_WINDOW_NIGHTS}-night window`,
    },
    {
      label: 'Split',
      value: display ? `${display.counts.site} site` : 'n/a',
      note: display
        ? `${display.counts.unlisted} unlisted well · ${display.counts.other} other`
        : '',
    },
    {
      label: 'State filed',
      value:
        filed?.flaredMmcfdCurrent > 0
          ? `${filed.flaredMmcfdCurrent.toFixed(1)} MMcf/d`
          : 'n/a',
      note:
        filed?.flaredMmcfdCurrent > 0
          ? `${formatInt(filed.sitesFlaringCurrent)} sites flared · ${snapshot.currentMonth}`
          : '',
    },
  ];
  const sections = [
    {
      title: 'Reading the charts',
      rows: [
        [
          'Band',
          base?.clearNights > 0
            ? `the 10th–90th percentile of lit sites over the last ${base.clearNights} clear nights; the dashed line is the median`
            : 'appears once the window holds clear nights',
        ],
        [
          'Hatched',
          'nights drawn hatched were obscured or failed the suspect backstop — left out of every norm',
        ],
      ],
    },
    {
      title: 'Sources',
      rows: [
        ['Heat', 'NASA FIRMS VIIRS NRT (CC0), night detections, keyless'],
        [
          'Sky',
          'IEM ASOS / NWS observations at the overpasses (public domain)',
        ],
        [
          'Filings',
          joinParts([
            snapshot.sourceName || 'North Dakota DMR',
            `monthly per well, current ${snapshot.currentMonth}`,
          ]),
        ],
        ['Stamp', snapshotStamp(snapshot)],
      ],
    },
  ].map(filterSection);
  return {
    mode: 'region',
    id: snapshot.region.id,
    kicker: joinParts([
      'flare region',
      display ? `night ${display.night} (${display.cloud.state})` : null,
    ]),
    title: snapshot.regionName,
    subtitle: joinParts([
      `${formatInt(snapshot.rows.length)} flare sites bundled`,
      `${snapshot.nights.length} night${snapshot.nights.length === 1 ? '' : 's'} in the store`,
    ]),
    stats,
    nightChart: {
      series: nightSeries,
      windowNights: snapshot.windowNights,
      band:
        base?.clearNights > 0 && Number.isFinite(base.litMedian)
          ? { p10: base.litP10, median: base.litMedian, p90: base.litP90 }
          : null,
      valueOf: (n) => n.litSites,
      axisLabel: 'lit',
      ariaLabel: 'Lit sites per night',
    },
    monthChart: {
      months: snapshot.months,
      values: snapshot.regionFlaredMonthly,
      ariaLabel: 'Monthly state flared gas, region total',
    },
    footer: joinParts([
      'NASA FIRMS VIIRS NRT · IEM ASOS / NWS',
      snapshot.sourceName || 'state filings',
    ]),
  };
}

function filterSection(section) {
  return {
    title: section.title,
    rows: section.rows.filter(([, value]) => value !== null && value !== ''),
  };
}

function snapshotStamp(snapshot) {
  return joinParts([
    snapshot.displayNight
      ? `night ${snapshot.displayNight.night} (${snapshot.displayNight.cloud.state})`
      : null,
    snapshot.retrievedAt ? `fetched ${snapshot.retrievedAt}` : null,
    snapshot.retrieved ? `filings retrieved ${snapshot.retrieved}` : null,
  ]);
}

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

const HATCH_ID = 'flares-hatch';

function appendHatchDefs(doc, svg) {
  const defs = svgEl(doc, 'defs');
  const pattern = svgEl(doc, 'pattern', {
    id: HATCH_ID,
    width: 4,
    height: 4,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  });
  pattern.appendChild(
    svgEl(doc, 'line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 4,
      stroke: 'rgba(232,234,237,.45)',
      'stroke-width': 1.5,
    }),
  );
  defs.appendChild(pattern);
  svg.appendChild(defs);
}

/**
 * The nightly chart: one bar per served night placed by DATE over the full
 * window, untrusted nights hatched, one hoverable `[data-point]` per served
 * night (the M4 QA counts these against the API's nights).
 */
export function renderNightChart(doc, chart) {
  const width = 400;
  const height = 110;
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'dc-chart',
    role: 'img',
    'aria-label': chart.ariaLabel ?? 'Nightly series',
  });
  const domain = nightChartDomain(chart.series, chart.windowNights);
  if (!domain) return svg;
  appendHatchDefs(doc, svg);
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const values = chart.series.map((n) => chart.valueOf(n));
  const max = Math.max(1, ...values);
  const slotW = Math.max(1.5, (plotW / domain.days) * 0.75);
  const x = (night) =>
    padL +
    (plotW * (Date.parse(`${night}T00:00:00Z`) - domain.startMs)) /
      (domain.days - 1) /
      86_400_000;
  const y = (v) => padT + plotH - (v / max) * plotH;

  for (const [v, label] of [
    [0, '0'],
    [max, `${Math.round(max * 10) / 10} ${chart.axisLabel}`],
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

  // The clear-night band and its median, under the bars (region chart).
  if (chart.band && Number.isFinite(chart.band.median)) {
    const hi = Number.isFinite(chart.band.p90) ? chart.band.p90 : null;
    const lo = Number.isFinite(chart.band.p10) ? chart.band.p10 : null;
    if (hi !== null && lo !== null)
      svg.appendChild(
        svgEl(doc, 'rect', {
          x: padL,
          y: y(Math.min(hi, max)).toFixed(1),
          width: plotW,
          height: Math.max(
            0,
            y(Math.max(lo, 0)) - y(Math.min(hi, max)),
          ).toFixed(1),
          class: 'dc-chart__area',
          'data-band': '10-90',
        }),
      );
    svg.appendChild(
      svgEl(doc, 'path', {
        d: `M${padL},${y(Math.min(chart.band.median, max)).toFixed(1)} H${padL + plotW}`,
        class: 'dc-chart__line dc-chart__line--secondary',
      }),
    );
  }

  for (const nightRow of chart.series) {
    const v = chart.valueOf(nightRow);
    const px = x(nightRow.night);
    if (v > 0) {
      const bar = svgEl(doc, 'rect', {
        x: (px - slotW / 2).toFixed(1),
        y: y(v).toFixed(1),
        width: slotW.toFixed(1),
        height: Math.max(0.5, padT + plotH - y(v)).toFixed(1),
        class: 'dc-chart__bar',
      });
      if (nightRow.hatched) bar.setAttribute('fill', `url(#${HATCH_ID})`);
      svg.appendChild(bar);
    }
    const point = svgEl(doc, 'circle', {
      cx: px.toFixed(1),
      cy: y(v).toFixed(1),
      r: 2.4,
      class: 'dc-chart__point',
      'data-point': nightRow.night,
    });
    const title = svgEl(doc, 'title');
    title.textContent = joinParts([
      nightRow.night,
      `${Math.round(v * 100) / 100} ${chart.axisLabel}`,
      nightRow.cloud,
      nightRow.hatched ? 'hatched (not in the norm)' : null,
    ]);
    point.appendChild(title);
    svg.appendChild(point);
  }

  // Month ticks along the bottom, at most one per month boundary in view.
  let lastMonth = '';
  for (const nightRow of chart.series) {
    const month = nightRow.night.slice(0, 7);
    if (month === lastMonth) continue;
    lastMonth = month;
    const t = svgEl(doc, 'text', {
      x: x(nightRow.night).toFixed(1),
      y: height - 8,
      'text-anchor': 'middle',
      class: 'dc-chart__label',
    });
    t.textContent = nightRow.night.slice(5);
    svg.appendChild(t);
  }
  return svg;
}

/**
 * The monthly state-flared bars: one `[data-bar]` per bundle month (the M4
 * QA counts these against the bundle), drawn as Mcf per calendar day.
 */
export function renderMonthBars(doc, chart) {
  const width = 400;
  const height = 110;
  const padL = 52;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'dc-chart',
    role: 'img',
    'aria-label': chart.ariaLabel ?? 'Monthly series',
  });
  const months = chart.months ?? [];
  if (!months.length) return svg;
  const rates = months.map((month, i) =>
    mcfPerDay(chart.values?.[i] ?? null, month),
  );
  const max = Math.max(1, ...rates.filter((v) => v !== null));
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const slotW = (plotW / months.length) * 0.7;
  const x = (i) => padL + (plotW * (i + 0.5)) / months.length;
  const y = (v) => padT + plotH - (v / max) * plotH;

  for (const [v, label] of [
    [0, '0'],
    [max, formatMcfd(max)],
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

  months.forEach((month, i) => {
    const v = rates[i];
    const bar = svgEl(doc, 'rect', {
      x: (x(i) - slotW / 2).toFixed(1),
      y: (v !== null && v > 0 ? y(v) : padT + plotH - 0.5).toFixed(1),
      width: slotW.toFixed(1),
      height: (v !== null && v > 0
        ? Math.max(0.5, padT + plotH - y(v))
        : 0.5
      ).toFixed(1),
      class: 'dc-chart__bar',
      'data-bar': month,
    });
    const title = svgEl(doc, 'title');
    title.textContent = joinParts([
      month,
      v !== null ? formatMcfd(v) : 'not filed',
      `${formatInt(chart.values?.[i] ?? 0)} Mcf in the month`,
    ]);
    bar.appendChild(title);
    svg.appendChild(bar);
  });

  months.forEach((month, i) => {
    if (!month.endsWith('-01') && i !== 0) return;
    const t = svgEl(doc, 'text', {
      x: x(i).toFixed(1),
      y: height - 8,
      'text-anchor': 'middle',
      class: 'dc-chart__label',
    });
    t.textContent = month.slice(0, 4);
    svg.appendChild(t);
  });
  return svg;
}

function renderModel(doc, root, model) {
  root.textContent = '';

  const head = el(doc, 'div', 'dc-dossier__head');
  const kicker = el(doc, 'div', 'dc-dossier__kicker');
  kicker.appendChild(el(doc, 'span', '', model.kicker || 'flares'));
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

  const nights = el(doc, 'div', 'dc-section');
  nights.dataset.chart = 'nights';
  nights.appendChild(
    el(
      doc,
      'div',
      'dc-section__title',
      model.mode === 'site'
        ? 'Nightly heat · max FRP per night'
        : 'Nightly heat · lit sites per night',
    ),
  );
  nights.appendChild(renderNightChart(doc, model.nightChart));
  nights.appendChild(
    el(
      doc,
      'div',
      'dc-legend',
      model.mode === 'site'
        ? 'bars by night over the served window · hatched = obscured or suspect · hover a point'
        : 'bars by night · band = 10th–90th pct of clear nights, dashed median · hatched = obscured or suspect',
    ),
  );
  body.appendChild(nights);

  const monthsBox = el(doc, 'div', 'dc-section');
  monthsBox.dataset.chart = 'months';
  monthsBox.appendChild(
    el(
      doc,
      'div',
      'dc-section__title',
      model.mode === 'site'
        ? 'State filings · flared Mcf/d by month'
        : 'State filings · flared Mcf/d by month, region total',
    ),
  );
  monthsBox.appendChild(renderMonthBars(doc, model.monthChart));
  monthsBox.appendChild(
    el(
      doc,
      'div',
      'dc-legend',
      'as filed monthly with the state · hover a bar for the month',
    ),
  );
  body.appendChild(monthsBox);

  for (const section of model.sections ?? []) {
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
  const buttons =
    model.mode === 'site'
      ? [
          ['fly', 'Fly to site'],
          ['zoom-out', 'Zoom out'],
        ]
      : [['zoom-region', 'Zoom to the basin']];
  for (const [action, label] of buttons) {
    const btn = el(doc, 'button', 'dc-btn', label);
    btn.type = 'button';
    btn.dataset.action = action;
    foot.appendChild(btn);
  }
  root.appendChild(foot);
  root.appendChild(el(doc, 'div', 'dc-dossier__foot-note', model.footer));
}

/**
 * Own the drawer element. Idempotent show/hide; `refresh` re-renders
 * whatever is open from a fresh snapshot (a new night landed). The caller
 * decides what a button means, so the drawer never touches the camera or
 * the context store itself.
 */
export function createFlaresDossier({
  document: doc = globalThis.document,
  onClose,
  onFlyTo,
  onZoomOut,
  onZoomRegion,
} = {}) {
  if (!doc?.createElement) throw new TypeError('Dossier requires a document');
  let root = null;
  /** `{ mode: 'site'|'region', id }` while open. */
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
        onFlyTo?.(current.id);
        break;
      case 'zoom-out':
        onZoomOut?.(current.id);
        break;
      case 'zoom-region':
        onZoomRegion?.();
        break;
      default:
        break;
    }
  }

  function ensureRoot() {
    if (root) return root;
    ensureDossierStyles(doc);
    root = doc.createElement('aside');
    root.id = 'flares-dossier';
    root.className = 'dc-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Flare dossier');
    root.addEventListener('click', handleClick);
    doc.body.appendChild(root);
    return root;
  }

  function open(model) {
    const node = ensureRoot();
    renderModel(doc, node, model);
    current = { mode: model.mode, id: model.id };
    node.hidden = false;
    const body = node.querySelector('.dc-dossier__body');
    if (body) body.scrollTop = 0;
    doc.body.classList.add('dc-dossier-open');
  }

  return {
    show(row, snapshot) {
      if (!row || !snapshot) return;
      open(buildSiteDossierModel(row, snapshot));
    },
    showRegion(snapshot) {
      if (!snapshot) return;
      open(buildRegionDossierModel(snapshot));
    },
    /** Re-render whatever is open from a fresh snapshot; ignored when shut. */
    refresh(snapshot) {
      if (!current || !root || root.hidden || !snapshot) return false;
      if (current.mode === 'region') {
        open(buildRegionDossierModel(snapshot));
        return true;
      }
      const row = snapshot.rows.find((r) => r.id === current.id);
      if (!row) return false;
      const body = root.querySelector('.dc-dossier__body');
      const scrollTop = body ? body.scrollTop : 0;
      open(buildSiteDossierModel(row, snapshot));
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
