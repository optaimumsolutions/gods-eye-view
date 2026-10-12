/**
 * Port dossier panel (docs/COMMODITIES-PLAN.md §9.6.4): a right-rail panel
 * beside CONTEXT and CCTV that renders the assembled dossier sections in
 * the PRD's order. The DOM is created here and appended to the rail, so the
 * shell templates stay untouched; the rail's layout controller picks the
 * panel up through its `data-panel-id`. Every string is written with
 * `textContent`: headlines and extracts are untrusted text, never markup.
 */
import { statusCss } from '../layers/ports/model.js';

export const PORT_DOSSIER_PANEL_ID = 'port-dossier-panel';
const SPARKLINE_WIDTH = 300;
const SPARKLINE_HEIGHT = 64;
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(doc, tag, attributes = {}, text = null) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = String(text);
  return node;
}

function svg(doc, tag, attributes = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value != null) node.setAttribute(key, String(value));
  }
  return node;
}

function httpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function link(doc, label, url, className = 'port-dossier-link') {
  const href = httpUrl(url);
  if (!href) return el(doc, 'span', { class: className }, label);
  return el(
    doc,
    'a',
    { class: className, href, target: '_blank', rel: 'noopener noreferrer' },
    label,
  );
}

function number(value, digits = 0) {
  if (!Number.isFinite(value)) return 'n/a';
  return digits
    ? value.toFixed(digits)
    : Math.round(value).toLocaleString('en-US');
}

function tonnes(value) {
  if (!Number.isFinite(value)) return 'n/a';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} kt`;
  return `${Math.round(value)} t`;
}

function dateOnly(value) {
  if (!value) return 'n/a';
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : 'n/a';
}

function bearingText(deg) {
  if (!Number.isFinite(deg)) return '';
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** The tanker series as an SVG polyline with the 7-day and 90-day means. */
export function buildSparkline(doc, section) {
  const series = section.series || [];
  const values = series.map((point) => point.tanker).filter(Number.isFinite);
  const root = svg(doc, 'svg', {
    class: 'port-dossier-sparkline',
    viewBox: `0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`,
    role: 'img',
    'aria-label': `${series.length}-day tanker calls, ${section.deviation} vs baseline`,
  });
  if (!values.length) return root;
  const max = Math.max(...values, section.baselineMean ?? 0, 1);
  const y = (value) =>
    SPARKLINE_HEIGHT - 6 - (Math.max(0, value) / max) * (SPARKLINE_HEIGHT - 12);
  const x = (index) =>
    series.length > 1 ? (index / (series.length - 1)) * SPARKLINE_WIDTH : 0;
  const points = series
    .map((point, index) =>
      Number.isFinite(point.tanker)
        ? `${x(index).toFixed(1)},${y(point.tanker).toFixed(1)}`
        : null,
    )
    .filter(Boolean)
    .join(' ');
  if (Number.isFinite(section.baselineMean)) {
    root.append(
      svg(doc, 'line', {
        class: 'port-dossier-sparkline-baseline',
        x1: 0,
        x2: SPARKLINE_WIDTH,
        y1: y(section.baselineMean).toFixed(1),
        y2: y(section.baselineMean).toFixed(1),
      }),
    );
  }
  if (Number.isFinite(section.recentMean) && series.length > 7) {
    root.append(
      svg(doc, 'line', {
        class: 'port-dossier-sparkline-recent',
        x1: x(series.length - 7).toFixed(1),
        x2: SPARKLINE_WIDTH,
        y1: y(section.recentMean).toFixed(1),
        y2: y(section.recentMean).toFixed(1),
      }),
    );
  }
  root.append(
    svg(doc, 'polyline', {
      class: 'port-dossier-sparkline-series',
      points,
      style: `stroke:${statusCss(section.band)}`,
    }),
  );
  return root;
}

function renderCamera(doc, body, section) {
  if (section.kind === 'camera') {
    const frame = section.frame;
    const img = el(doc, 'img', {
      class: 'port-dossier-frame',
      alt: `${frame.name} camera frame`,
      src: frame.src,
    });
    body.append(img);
    body.append(
      el(
        doc,
        'div',
        { class: 'port-dossier-line' },
        `${frame.name} · ${frame.operator}`,
      ),
    );
  } else if (section.kind === 'satellite') {
    const sat = section.satellite;
    const img = el(doc, 'img', {
      class: 'port-dossier-frame port-dossier-frame-satellite',
      alt: `${sat.layerLabel || sat.layer} true colour, ${sat.date}`,
      src: sat.url,
    });
    body.append(img);
    body.append(
      el(
        doc,
        'div',
        { class: 'port-dossier-line' },
        `No public camera at this port · satellite ${sat.layerLabel || sat.layer} · ${sat.date} · zoom ${sat.zoom}`,
      ),
    );
  }
  if (section.road) {
    const road = section.road;
    const row = el(doc, 'div', { class: 'port-dossier-road' });
    row.append(
      el(doc, 'img', {
        class: 'port-dossier-road-thumb',
        alt: `${road.name} road camera`,
        src: road.src,
      }),
    );
    row.append(
      el(
        doc,
        'span',
        { class: 'port-dossier-line' },
        `Road camera ${road.name} · ${number(road.distanceKm, 1)} km ${bearingText(road.bearingDeg)} of the port · ${road.operator || ''}`,
      ),
    );
    body.append(row);
  }
}

function renderFlow(doc, body, section) {
  const head = el(doc, 'div', { class: 'port-dossier-flow' });
  const dot = el(doc, 'span', { class: 'port-dossier-band' });
  dot.style.background = statusCss(section.band);
  head.append(dot);
  head.append(
    el(
      doc,
      'strong',
      {},
      `${section.deviation} vs ${section.baselineDays ?? 90}d · ${section.band}`,
    ),
  );
  body.append(head);
  body.append(el(doc, 'div', { class: 'port-dossier-line' }, section.line));
}

function renderHistory(doc, body, section) {
  body.append(buildSparkline(doc, section));
  body.append(
    el(
      doc,
      'div',
      { class: 'port-dossier-line' },
      `${section.firstDate} to ${section.latestDate} · ${section.days} published days · 7d mean ${number(section.recentMean, 1)}/day · 90d mean ${number(section.baselineMean, 1)}/day · ${section.deviation}`,
    ),
  );
}

function renderCalls(doc, body, section) {
  const table = el(doc, 'table', { class: 'port-dossier-table' });
  const head = el(doc, 'tr');
  for (const label of [
    'Class',
    'Calls/yr',
    'Calls/day 7d',
    'Imports 7d',
    'Exports 7d',
  ])
    head.append(el(doc, 'th', {}, label));
  table.append(head);
  for (const cls of section.classes) {
    const row = el(doc, 'tr');
    row.append(el(doc, 'td', {}, cls.label));
    row.append(el(doc, 'td', {}, number(cls.annual)));
    row.append(el(doc, 'td', {}, number(cls.recentPerDay, 1)));
    row.append(el(doc, 'td', {}, tonnes(cls.importTonnes)));
    row.append(el(doc, 'td', {}, tonnes(cls.exportTonnes)));
    table.append(row);
  }
  body.append(table);
  body.append(
    el(
      doc,
      'div',
      { class: 'port-dossier-line' },
      `${number(section.annualTotal)} vessel calls/yr in the PortWatch registry${section.recentDays ? ` · imports and exports are AIS-estimated tonnage over the last ${section.recentDays} published days` : ' · daily rows pending'}`,
    ),
  );
}

function renderTrade(doc, body, section) {
  body.append(
    el(doc, 'div', { class: 'port-dossier-line' }, section.roleNotes),
  );
  body.append(
    el(
      doc,
      'div',
      { class: 'port-dossier-line' },
      `Share of the country's maritime trade · imports ${number(section.importSharePct, 1)}% · exports ${number(section.exportSharePct, 1)}%`,
    ),
  );
  if (section.industries.length)
    body.append(
      el(
        doc,
        'div',
        { class: 'port-dossier-line' },
        `Top industries · ${section.industries.join(' · ')}`,
      ),
    );
  if (section.terminals.length) {
    const list = el(doc, 'ul', { class: 'port-dossier-list' });
    for (const terminal of section.terminals)
      list.append(
        el(
          doc,
          'li',
          {},
          `${terminal.name} · ${terminal.operator} · ${terminal.product}`,
        ),
      );
    body.append(list);
  }
  if (section.linkedSystems.length) {
    const chips = el(doc, 'div', { class: 'port-dossier-chips' });
    for (const system of section.linkedSystems)
      chips.append(
        el(
          doc,
          'span',
          { class: `port-dossier-chip port-dossier-chip-${system.kind}` },
          system.name,
        ),
      );
    body.append(chips);
  }
}

function renderDisruptions(doc, body, section) {
  body.append(el(doc, 'div', { class: 'port-dossier-line' }, section.line));
  if (!section.events.length) return;
  const list = el(doc, 'ul', { class: 'port-dossier-list' });
  for (const event of section.events)
    list.append(
      el(
        doc,
        'li',
        {},
        `${event.name} · ${event.type} · ${event.severity || `${event.alertLevel ?? 'n/a'} alert`} · ${event.from ?? 'n/a'} to ${event.to ?? 'ongoing'} · ${number(event.affectedPortCount)} ports`,
      ),
    );
  body.append(list);
}

function renderWeather(doc, body, section) {
  const reading = section.reading;
  const grid = el(doc, 'div', { class: 'port-dossier-grid' });
  const cells = [
    [
      'Wind',
      `${number(reading.windKn)} ${reading.units?.wind || 'kn'} ${bearingText(reading.windDirectionDeg)}`,
    ],
    ['Gusts', `${number(reading.gustKn)} ${reading.units?.wind || 'kn'}`],
    [
      'Visibility',
      Number.isFinite(reading.visibilityM)
        ? `${(reading.visibilityM / 1000).toFixed(1)} km`
        : 'n/a',
    ],
    ['Precipitation', `${number(reading.precipitationMm, 1)} mm/h`],
    [
      'Waves',
      Number.isFinite(reading.waveHeightM)
        ? `${reading.waveHeightM.toFixed(1)} m · ${number(reading.wavePeriodS, 1)} s ${bearingText(reading.waveDirectionDeg)}`
        : 'n/a',
    ],
    ['Valid', reading.validAt || 'n/a'],
  ];
  for (const [label, value] of cells) {
    grid.append(el(doc, 'span', { class: 'port-dossier-grid-label' }, label));
    grid.append(el(doc, 'span', {}, value));
  }
  body.append(grid);
}

function renderHeadlines(doc, body, section) {
  if (!section.articles.length) {
    body.append(
      el(
        doc,
        'div',
        { class: 'port-dossier-line' },
        `No headline naming this port in the last ${section.windowDays} days`,
      ),
    );
    return;
  }
  const list = el(doc, 'ul', {
    class: 'port-dossier-list port-dossier-headlines',
  });
  for (const article of section.articles) {
    const item = el(doc, 'li');
    item.append(link(doc, article.title, article.url, 'port-dossier-headline'));
    item.append(
      el(
        doc,
        'span',
        { class: 'port-dossier-line' },
        `${article.domain || 'source n/a'} · ${dateOnly(article.publishedAt)} · ${article.verification || section.verification}`,
      ),
    );
    list.append(item);
  }
  body.append(list);
}

function renderAbout(doc, body, section) {
  if (section.thumbnail?.url) {
    body.append(
      el(doc, 'img', {
        class: 'port-dossier-thumb',
        alt: '',
        src: section.thumbnail.url,
        width: section.thumbnail.width,
        height: section.thumbnail.height,
      }),
    );
  }
  body.append(el(doc, 'p', { class: 'port-dossier-extract' }, section.extract));
  const attribution = el(doc, 'div', { class: 'port-dossier-line' });
  attribution.append(link(doc, section.attribution, section.url));
  body.append(attribution);
}

function renderLinks(doc, body, section) {
  const list = el(doc, 'ul', { class: 'port-dossier-list' });
  for (const entry of section.links) {
    const item = el(doc, 'li');
    item.append(link(doc, entry.label, entry.url));
    list.append(item);
  }
  body.append(list);
}

const RENDERERS = Object.freeze({
  camera: renderCamera,
  flow: renderFlow,
  history: renderHistory,
  calls: renderCalls,
  trade: renderTrade,
  disruptions: renderDisruptions,
  weather: renderWeather,
  headlines: renderHeadlines,
  about: renderAbout,
  links: renderLinks,
});

/** One section element: title row with status and stamp, the body, the provenance line. */
export function renderSection(doc, section) {
  const root = el(doc, 'section', {
    class: 'port-dossier-section',
    'data-section': section.id,
    'data-status': section.status,
  });
  const head = el(doc, 'div', { class: 'port-dossier-section-head' });
  head.append(
    el(doc, 'span', { class: 'port-dossier-section-title' }, section.title),
  );
  head.append(
    el(
      doc,
      'span',
      { class: `port-dossier-status port-dossier-status-${section.status}` },
      section.status,
    ),
  );
  if (section.stamp)
    head.append(
      el(doc, 'span', { class: 'port-dossier-section-stamp' }, section.stamp),
    );
  root.append(head);
  const body = el(doc, 'div', { class: 'port-dossier-section-body' });
  if (section.status === 'pending')
    body.append(
      el(
        doc,
        'div',
        { class: 'port-dossier-line port-dossier-pending' },
        'loading…',
      ),
    );
  else if (section.status === 'unavailable')
    body.append(
      el(
        doc,
        'div',
        { class: 'port-dossier-line port-dossier-unavailable' },
        `unavailable · ${section.reason}`,
      ),
    );
  else RENDERERS[section.id]?.(doc, body, section);
  root.append(body);
  if (section.provenance)
    root.append(
      el(doc, 'div', { class: 'port-dossier-provenance' }, section.provenance),
    );
  return root;
}

/**
 * @param {object} options
 * @param {Document} [options.document]
 * @param {Element|null} [options.rail] the right rail; the panel is inserted after the CONTEXT panel
 */
export function createPortDossierPanel({
  document: doc = globalThis.document,
  rail = doc?.getElementById('right-context-rail') ?? null,
} = {}) {
  if (!doc) throw new TypeError('Port dossier panel needs a document');
  const host = rail || doc.body;
  const panel = el(doc, 'div', {
    id: PORT_DOSSIER_PANEL_ID,
    class: 'panel-collapsible collapsed',
    'data-panel-id': PORT_DOSSIER_PANEL_ID,
    'aria-label': 'Port dossier',
  });
  panel.hidden = true;
  panel.append(el(doc, 'div', { class: 'panel-glow' }));
  const inner = el(doc, 'div', { class: 'port-dossier-inner' });
  const header = el(doc, 'div', { class: 'panel-header port-dossier-header' });
  const title = el(
    doc,
    'span',
    { class: 'panel-title port-dossier-title' },
    'PORT DOSSIER',
  );
  const stamp = el(doc, 'span', { class: 'port-dossier-stamp' }, '');
  const collapseBtn = el(
    doc,
    'button',
    {
      class: 'port-dossier-collapse-btn',
      type: 'button',
      title: 'Collapse panel',
      'aria-expanded': 'true',
    },
    '▶',
  );
  const closeBtn = el(
    doc,
    'button',
    {
      class: 'port-dossier-close-btn',
      type: 'button',
      title: 'Close dossier (keeps the port selected)',
      'aria-label': 'Close port dossier',
    },
    '✕',
  );
  header.append(
    title,
    el(doc, 'span', { class: 'panel-divider' }),
    stamp,
    collapseBtn,
    closeBtn,
  );
  const subtitle = el(doc, 'div', { class: 'port-dossier-subtitle' }, '');
  const body = el(doc, 'div', { class: 'port-dossier-body' });
  inner.append(header, subtitle, body);
  panel.append(inner);
  const contextPanel = doc.getElementById('global-context-panel');
  if (contextPanel && contextPanel.parentElement === host)
    contextPanel.after(panel);
  else host.append(panel);

  const closeHandlers = new Set();
  let open = false;
  let lastPortid = null;

  function setCollapsed(collapsed) {
    panel.classList.toggle('collapsed', collapsed);
    collapseBtn.textContent = collapsed ? '◀' : '▶';
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.title = collapsed ? 'Expand panel' : 'Collapse panel';
  }

  const onCollapse = () => setCollapsed(!panel.classList.contains('collapsed'));
  const onClose = () => {
    api.close();
    for (const handler of closeHandlers) handler();
  };
  collapseBtn.addEventListener('click', onCollapse);
  closeBtn.addEventListener('click', onClose);

  const api = {
    element: panel,
    isOpen: () => open,
    open(entry) {
      open = true;
      panel.hidden = false;
      setCollapsed(false);
      title.textContent = String(entry?.name || 'PORT DOSSIER').toUpperCase();
      subtitle.textContent = entry?.country
        ? `${entry.country}${entry.locode ? ` · ${entry.locode}` : ''}`
        : '';
      stamp.textContent = '';
      // A swap rewrites the header immediately; clear the old port's sections
      // rather than leaving them under the new port's name until it loads.
      if (entry?.portid !== lastPortid || !body.childElementCount) {
        lastPortid = entry?.portid ?? null;
        body.replaceChildren(
          el(
            doc,
            'div',
            { class: 'port-dossier-line port-dossier-pending' },
            'loading dossier…',
          ),
        );
      }
    },
    render(assembled) {
      lastPortid = assembled.portid;
      const [header, ...sections] = assembled.sections;
      title.textContent = header.title;
      subtitle.textContent = [header.line, header.role]
        .filter(Boolean)
        .join(' · ');
      stamp.textContent = assembled.asOf || '';
      body.replaceChildren(
        ...sections.map((section) => renderSection(doc, section)),
      );
    },
    renderError(entry, reason) {
      body.replaceChildren(
        el(
          doc,
          'div',
          { class: 'port-dossier-line port-dossier-unavailable' },
          `unavailable · ${reason}`,
        ),
      );
    },
    close() {
      open = false;
      panel.hidden = true;
      // layoutRightPanelRail counts every [data-panel-id] child, hidden or not,
      // so a closed panel that kept its expanded class would take the rail's
      // focus allocation away from CONTEXT and CCTV.
      setCollapsed(true);
      lastPortid = null;
      body.replaceChildren();
      stamp.textContent = '';
    },
    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    destroy() {
      collapseBtn.removeEventListener('click', onCollapse);
      closeBtn.removeEventListener('click', onClose);
      closeHandlers.clear();
      panel.remove();
    },
  };
  return api;
}
