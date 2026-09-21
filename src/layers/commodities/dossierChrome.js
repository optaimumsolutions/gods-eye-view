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
