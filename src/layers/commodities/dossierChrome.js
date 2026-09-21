/**
 * The dossier drawer's chrome, shared by the commodity layers that open one
 * (data centers, Gulf platforms). One stylesheet, injected once by id, and
 * the two DOM helpers every drawer uses. The class names keep the `dc-`
 * prefix the first drawer shipped with so a stylesheet override written for
 * one drawer styles the other.
 *
 * DOM only at call time: nothing here touches `document` at import, so the
 * module loads under Node for the pure model tests.
 */

export const DOSSIER_STYLE_ID = 'dc-dossier-styles';

export const DOSSIER_CSS = `
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
.dc-dossier__stats--pairs{grid-template-columns:repeat(2,1fr)}
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
.dc-chart__area{fill:var(--accent,#00d4ff);opacity:.22}
.dc-chart__line{fill:none;stroke:var(--accent,#00d4ff);stroke-width:1.25}
.dc-chart__line--secondary{fill:none;stroke:rgba(255,179,71,.85);stroke-width:1;stroke-dasharray:2 2}
.dc-chart__point{fill:transparent}
.dc-chart__point:hover{fill:var(--accent,#00d4ff)}
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

/** Inject the drawer stylesheet once per document. */
export function ensureDossierStyles(doc) {
  if (doc.getElementById(DOSSIER_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = DOSSIER_STYLE_ID;
  style.textContent = DOSSIER_CSS;
  doc.head.appendChild(style);
}

/** An element with an optional class and text. */
export function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes set as given. */
export function svgEl(doc, tag, attributes = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined)
      node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * A monthly series as a filled area with a secondary series as a dashed line
 * on its own scale, one invisible-until-hovered point per filed month
 * carrying a `<title>`. Runs of filed months are drawn; a null is a gap, so a
 * month not filed reads as a gap. The newest month is the right edge. Shared
 * by the production dossiers (Gulf platforms, onshore wells).
 *
 * `chart`: `{ months, primary: (number|null)[], secondary: (number|null)[]|null,
 *   formatPrimaryAxis(max) → string, secondaryAxisLines(max) → string[],
 *   pointTitle(index) → string }`.
 */
export function renderSeriesChart(doc, chart) {
  const width = 400;
  const height = 110;
  // Gutters sized for the axis labels: "201.3 MMcf" left, "101,234" right.
  const padL = 58;
  const padR = 50;
  const padT = 10;
  const padB = 22;
  const svg = svgEl(doc, 'svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'dc-chart',
    role: 'img',
    'aria-label': chart.ariaLabel ?? 'Monthly series',
  });
  const n = chart.months.length;
  const primary = chart.primary;
  const secondary = chart.secondary ?? null;
  const primaryMax = Math.max(0, ...primary.filter((v) => v !== null));
  const secondaryMax = secondary
    ? Math.max(0, ...secondary.filter((v) => v !== null))
    : 0;
  if (!n || primaryMax <= 0) return svg;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const x = (i) => padL + (plotW * i) / Math.max(1, n - 1);
  const yPrimary = (v) => padT + plotH - (v / primaryMax) * plotH;
  const ySecondary = (v) =>
    padT + plotH - (secondaryMax > 0 ? (v / secondaryMax) * plotH : 0);

  // Primary scale on the left, secondary on the right.
  for (const [v, label] of [
    [0, '0'],
    [primaryMax, chart.formatPrimaryAxis(primaryMax)],
  ]) {
    const t = svgEl(doc, 'text', {
      x: padL - 4,
      y: yPrimary(v) + 3,
      'text-anchor': 'end',
      class: 'dc-chart__label',
    });
    t.textContent = label;
    svg.appendChild(t);
  }
  if (secondaryMax > 0) {
    chart.secondaryAxisLines(secondaryMax).forEach((label, line) => {
      const t = svgEl(doc, 'text', {
        x: width - padR + 4,
        y: padT + 3 + line * 10,
        'text-anchor': 'start',
        class: 'dc-chart__label',
      });
      t.textContent = label;
      svg.appendChild(t);
    });
  }

  // Area under the primary series: runs of filed months, so a gap in filing is a gap on the chart.
  let area = '';
  let line = '';
  let open = false;
  primary.forEach((v, i) => {
    if (v === null) {
      if (open)
        area += ` L${x(i - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
      open = false;
      return;
    }
    const px = x(i).toFixed(1);
    const py = yPrimary(v).toFixed(1);
    if (!open) {
      area += ` M${px},${(padT + plotH).toFixed(1)} L${px},${py}`;
      line += ` M${px},${py}`;
      open = true;
    } else {
      area += ` L${px},${py}`;
      line += ` L${px},${py}`;
    }
  });
  if (open) area += ` L${x(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
  svg.appendChild(
    svgEl(doc, 'path', { d: area.trim(), class: 'dc-chart__area' }),
  );
  svg.appendChild(
    svgEl(doc, 'path', { d: line.trim(), class: 'dc-chart__line' }),
  );

  if (secondaryMax > 0) {
    let path = '';
    let openSecondary = false;
    secondary.forEach((v, i) => {
      if (v === null) {
        openSecondary = false;
        return;
      }
      path += `${openSecondary ? ' L' : ' M'}${x(i).toFixed(1)},${ySecondary(v).toFixed(1)}`;
      openSecondary = true;
    });
    svg.appendChild(
      svgEl(doc, 'path', {
        d: path.trim(),
        class: 'dc-chart__line dc-chart__line--secondary',
      }),
    );
  }

  primary.forEach((v, i) => {
    if (v === null) return;
    const point = svgEl(doc, 'circle', {
      cx: x(i).toFixed(1),
      cy: yPrimary(v).toFixed(1),
      r: 2.2,
      class: 'dc-chart__point',
      'data-point': chart.months[i],
    });
    const title = svgEl(doc, 'title');
    title.textContent = chart.pointTitle(i);
    point.appendChild(title);
    svg.appendChild(point);
  });

  // Year ticks along the bottom; the left edge is only labelled when the
  // first January sits far enough right (a label is ~20 units wide) not to
  // overprint it.
  const firstJanuary = chart.months.findIndex((m) => m.endsWith('-01'));
  chart.months.forEach((month, i) => {
    if (!month.endsWith('-01') && i !== 0) return;
    if (i === 0 && firstJanuary > 0 && x(firstJanuary) - x(0) < 26) return;
    const t = svgEl(doc, 'text', {
      x: x(i).toFixed(1),
      y: height - 10,
      'text-anchor': 'middle',
      class: 'dc-chart__label',
    });
    t.textContent = month.slice(0, 4);
    svg.appendChild(t);
  });
  return svg;
}
