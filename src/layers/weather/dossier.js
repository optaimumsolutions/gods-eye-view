/**
 * The weather dossier (docs/COMMODITIES-PLAN.md §11.8.7.2): the full card
 * for one marker in the shared commodity drawer — a fifteen-day fan (p10 to
 * p90 band, p50 line, the freeze threshold dashed, the ERA5 normal dotted),
 * a table by day, the confidence line and provenance. DOM only at call
 * time; `buildWeatherDossierModel` is pure and unit-tested.
 */
import {
  el,
  ensureDossierStyles,
  svgEl,
} from '../commodities/dossierChrome.js';
import { formatAsOf } from '../commodities/observation.js';
import { BAND_LABELS, confidenceLine } from './model.js';
import { GALE_MPH } from './records.js';

const f0 = (v) => (Number.isFinite(v) ? `${Math.round(v)}` : '–');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');

/** Pure: everything the drawer renders, from a row and the selected lead. */
export function buildWeatherDossierModel(row, lead) {
  const days = row.days || [];
  const day = days[Math.max(0, Math.min(lead, days.length - 1))] || null;
  const stats = [];
  if (row.kind === 'basin') {
    stats.push(
      {
        label: 'freeze days',
        value: `${row.window.freezeDays}`,
        note: `p10 below heuristic ${row.freezeF}°F · ${row.window.freezeDaysP50} by p50`,
      },
      {
        label: `D+${day?.lead ?? lead} p10`,
        value: `${f0(day?.tmin.p10)}°F`,
        note: `p50 ${f0(day?.tmin.p50)} · p90 ${f0(day?.tmin.p90)}`,
      },
    );
  } else if (row.kind === 'region') {
    stats.push(
      {
        label: 'HDD14',
        value: f0(row.window.hdd14),
        note: `HDD7 ${f0(row.window.hdd7)} · ${row.window.heatingDays} heating days`,
      },
      {
        label: 'CDD14',
        value: f0(row.window.cdd14),
        note: `CDD7 ${f0(row.window.cdd7)}`,
      },
    );
  } else {
    const wave = row.marine?.find((m) => m.date === day?.date)?.waveMax;
    stats.push(
      {
        label: 'gale days',
        value: `${row.window.galeDays}`,
        note: `p90 wind ≥ ${GALE_MPH} mph, next 7 d`,
      },
      {
        label: `D+${day?.lead ?? lead} wind p90`,
        value: `${f0(day?.wind.p90)} mph`,
        note: `wave ${Number.isFinite(wave) ? `${wave.toFixed(1)} m` : 'n/a'}`,
      },
    );
  }
  stats.push(
    {
      label: 'anomaly',
      value:
        day?.anomalyF == null
          ? '–'
          : `${day.anomalyF > 0 ? '+' : ''}${day.anomalyF}°F`,
      note: day ? BAND_LABELS[day.band] : '',
    },
    {
      label: 'confidence',
      value: day ? `${Math.round(day.confidence.alpha * 100)}%` : '–',
      note: day ? day.confidence.skillLabel : '',
    },
  );
  return {
    title: row.name,
    kicker: `${row.kind} · weather forecast`,
    sub: day
      ? `${formatAsOf(day.observation)} · D+${day.lead} · ${row.members} members`
      : 'awaiting run',
    stats,
    fan: {
      days: days.map((d) => d.date.slice(5)),
      p10: days.map((d) => d.tmin.p10),
      p50: days.map((d) => d.tmin.p50),
      p90: days.map((d) => d.tmin.p90),
      normal: days.map((d) => d.normalTmin),
      threshold: row.kind === 'basin' ? row.freezeF : null,
      selected: day?.lead ?? null,
    },
    table: days.map((d) => ({
      date: d.date.slice(5),
      lead: d.lead,
      p10: f0(d.tmin.p10),
      p50: f0(d.tmin.p50),
      p90: f0(d.tmin.p90),
      spread: f0(d.tmin.spread),
      freeze:
        d.freezeShare == null ? '–' : `${Math.round(d.freezeShare * 100)}%`,
      precip: f1(d.precip.p50),
      snow: f1(d.snow.p50),
      alpha: `${Math.round(d.confidence.alpha * 100)}%`,
    })),
    confidence: day ? confidenceLine(day) : 'confidence n/a',
    provenance: day
      ? `${row.source} · ${formatAsOf(day.observation)} · fetched ${new Date(day.observation.fetchedAt).toISOString().slice(11, 16)}Z · vs ERA5 normal 2016–2025 · thresholds are heuristics`
      : row.source,
  };
}

function renderFan(doc, fan) {
  const width = 400;
  const height = 120;
  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'dc-chart',
    role: 'img',
    'aria-label': 'Fifteen-day minimum temperature fan',
  });
  const n = fan.days.length;
  const all = [...fan.p10, ...fan.p90, ...fan.normal, fan.threshold].filter(
    (v) => Number.isFinite(v),
  );
  if (!n || !all.length) return svg;
  const min = Math.min(...all) - 2;
  const max = Math.max(...all) + 2;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const x = (i) => padL + (plotW * i) / Math.max(1, n - 1);
  const y = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;
  const path = (series) =>
    series
      .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');
  // band
  const upper = fan.p90
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const lower = fan.p10
    .map(
      (v, i) =>
        `L${x(n - 1 - i).toFixed(1)},${y(fan.p10[n - 1 - i]).toFixed(1)}`,
    )
    .join(' ');
  svg.appendChild(
    svgEl(doc, 'path', { d: `${upper} ${lower} Z`, class: 'dc-chart__area' }),
  );
  svg.appendChild(
    svgEl(doc, 'path', { d: path(fan.p50), class: 'dc-chart__line' }),
  );
  if (fan.normal.every((v) => Number.isFinite(v)))
    svg.appendChild(
      svgEl(doc, 'path', {
        d: path(fan.normal),
        class: 'dc-chart__line--secondary',
        style: 'stroke-dasharray:1 3',
      }),
    );
  if (Number.isFinite(fan.threshold))
    svg.appendChild(
      svgEl(doc, 'line', {
        x1: padL,
        x2: width - padR,
        y1: y(fan.threshold),
        y2: y(fan.threshold),
        class: 'dc-chart__fac',
        style: 'stroke-dasharray:4 3;stroke:#ff3b5c',
      }),
    );
  if (Number.isFinite(fan.selected))
    svg.appendChild(
      svgEl(doc, 'line', {
        x1: x(fan.selected),
        x2: x(fan.selected),
        y1: padT,
        y2: padT + plotH,
        class: 'dc-chart__fac',
      }),
    );
  for (const v of [min + 2, max - 2]) {
    const t = svgEl(doc, 'text', {
      x: 2,
      y: y(v) + 3,
      class: 'dc-chart__value',
    });
    t.textContent = `${Math.round(v)}°F`;
    svg.appendChild(t);
  }
  [0, 7, n - 1].forEach((i) => {
    const t = svgEl(doc, 'text', {
      x: x(i),
      y: height - 4,
      class: 'dc-chart__label',
      'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
    });
    t.textContent = `D+${i}`;
    svg.appendChild(t);
  });
  return svg;
}

function renderModel(doc, root, model) {
  root.textContent = '';
  const head = el(doc, 'div', 'dc-dossier__head');
  const kicker = el(doc, 'div', 'dc-dossier__kicker');
  kicker.append(el(doc, 'span', null, model.kicker));
  const close = el(doc, 'button', 'dc-dossier__close', '×');
  close.type = 'button';
  close.dataset.action = 'close';
  close.setAttribute('aria-label', 'Close');
  kicker.append(close);
  head.append(
    kicker,
    el(doc, 'div', 'dc-dossier__title', model.title),
    el(doc, 'div', 'dc-dossier__sub', model.sub),
  );
  const stats = el(doc, 'div', 'dc-dossier__stats');
  for (const s of model.stats) {
    const box = el(doc, 'div', 'dc-stat');
    box.append(
      el(doc, 'div', 'dc-stat__label', s.label),
      el(doc, 'div', 'dc-stat__value', s.value),
      el(doc, 'div', 'dc-stat__note', s.note),
    );
    stats.append(box);
  }
  const body = el(doc, 'div', 'dc-dossier__body');
  const fanSec = el(doc, 'div', 'dc-section');
  fanSec.append(
    el(
      doc,
      'div',
      'dc-section__title',
      'daily minimum · p10–p90 band · p50 · normal dotted · threshold dashed',
    ),
  );
  fanSec.append(renderFan(doc, model.fan));
  fanSec.append(el(doc, 'div', 'dc-legend', model.confidence));
  const tableSec = el(doc, 'div', 'dc-section');
  tableSec.append(el(doc, 'div', 'dc-section__title', 'by day'));
  const table = el(doc, 'table', 'dc-table');
  const thead = el(doc, 'thead');
  const hr = el(doc, 'tr');
  for (const h of [
    'day',
    'p10',
    'p50',
    'p90',
    'spr',
    'frz',
    'pcp',
    'snw',
    'conf',
  ])
    hr.append(el(doc, 'th', null, h));
  thead.append(hr);
  const tbody = el(doc, 'tbody');
  for (const r of model.table) {
    const tr = el(doc, 'tr');
    tr.append(el(doc, 'td', null, `${r.date} +${r.lead}`));
    for (const k of [
      'p10',
      'p50',
      'p90',
      'spread',
      'freeze',
      'precip',
      'snow',
      'alpha',
    ])
      tr.append(el(doc, 'td', 'num', r[k]));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  tableSec.append(table);
  body.append(fanSec, tableSec, el(doc, 'div', 'dc-note', model.provenance));
  root.append(head, stats, body);
}

export function createWeatherDossier({
  document: doc = globalThis.document,
  onClose,
} = {}) {
  if (!doc?.createElement) throw new TypeError('Dossier requires a document');
  let root = null;
  let current = null;
  function ensureRoot() {
    if (root) return root;
    ensureDossierStyles(doc);
    root = doc.createElement('aside');
    root.id = 'wx-dossier';
    root.className = 'dc-dossier';
    root.hidden = true;
    root.setAttribute('role', 'complementary');
    root.setAttribute('aria-label', 'Weather forecast dossier');
    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-action="close"]')) {
        event.preventDefault();
        onClose?.(current);
      }
    });
    doc.body.appendChild(root);
    return root;
  }
  return {
    show(row, lead) {
      if (!row) return;
      const node = ensureRoot();
      current = row;
      renderModel(doc, node, buildWeatherDossierModel(row, lead));
      node.hidden = false;
      const body = node.querySelector('.dc-dossier__body');
      if (body) body.scrollTop = 0;
    },
    hide() {
      current = null;
      if (root) root.hidden = true;
    },
    isOpen: () => Boolean(root && !root.hidden),
    current: () => current,
  };
}
