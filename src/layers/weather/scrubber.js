/**
 * The forecast-window scrubber (docs/COMMODITIES-PLAN.md §11.8.13): one
 * time control on the globe that every weather surface reads. `D+0` to
 * `D+7` is the fine segment (0.25° models, 240 h); `D+8` to `D+16` is the
 * tail, drawn hatched. Slots past the active run's horizon are disabled
 * with the reason on hover (A-6: AIFS ENS answers 15 days, so `D+15` and
 * `D+16` light up only when a 16-day model is on). It never fetches and
 * never animates.
 *
 * DOM only at call time — nothing touches `document` at import — so the
 * pure logic (`clampLead`, `segmentFor`) loads under Node for the tests.
 */
export const MAX_LEAD = 16;
export const FINE_MAX_LEAD = 7;
export const DEFAULT_LEAD = 1;
export const SCRUBBER_STYLE_ID = 'wx-scrubber-styles';

export const SCRUBBER_CSS = `
.wx-scrubber{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:110;display:flex;flex-direction:column;gap:4px;padding:8px 12px 6px;background:var(--glass-bg,rgba(12,12,20,.72));border:1px solid var(--glass-border,rgba(255,255,255,.08));border-radius:var(--panel-radius,14px);backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4);color:var(--text-primary,#e8eaed);font-family:var(--font-mono,monospace);user-select:none}
.wx-scrubber[hidden]{display:none}
.wx-scrubber__head{display:flex;justify-content:space-between;gap:12px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim,rgba(232,234,237,.35))}
.wx-scrubber__head b{color:var(--accent,#00d4ff);letter-spacing:1px}
.wx-scrubber__track{display:flex;gap:2px;align-items:flex-end}
.wx-scrubber__slot{width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--text-secondary,rgba(232,234,237,.55));font-size:8.5px;font-family:inherit;cursor:pointer;padding:0;line-height:1}
.wx-scrubber__slot--tail{background:repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 3px,rgba(255,255,255,.1) 3px 4px);height:16px;font-size:7.5px}
.wx-scrubber__slot[aria-pressed="true"]{background:var(--accent,#00d4ff);color:#08131a;border-color:var(--accent,#00d4ff);font-weight:600}
.wx-scrubber__slot:disabled{opacity:.28;cursor:not-allowed}
.wx-scrubber__gap{width:6px;border-left:1px dashed rgba(255,255,255,.25);height:18px;margin:0 3px}
.wx-scrubber__foot{display:flex;justify-content:space-between;font-size:8px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-dim,rgba(232,234,237,.3))}
@media (max-width:900px){.wx-scrubber{bottom:150px;padding:6px 8px 4px}.wx-scrubber__slot{width:16px}}
`;

/** `now` for D+0 (the init date), `+n` after; a label, not a glyph. */
export function slotLabel(lead) {
  return lead === 0 ? 'now' : `+${lead}`;
}

export function segmentFor(lead) {
  return lead <= FINE_MAX_LEAD ? 'fine' : 'tail';
}

export function clampLead(lead, horizon = MAX_LEAD) {
  const n = Number.isFinite(lead) ? Math.round(lead) : DEFAULT_LEAD;
  return Math.max(0, Math.min(n, Math.min(MAX_LEAD, horizon)));
}

/**
 * Shared scrubber: one per document, first caller creates it. `horizon` is
 * the last lead the active run answers (14 for AIFS ENS's 15 days); the
 * `horizonLabel` names the model for the disabled slots' tooltip.
 */
export function createForecastScrubber({
  document: doc = globalThis.document,
} = {}) {
  if (!doc?.createElement) throw new TypeError('Scrubber requires a document');
  let root = null;
  let lead = DEFAULT_LEAD;
  let horizon = MAX_LEAD;
  let horizonLabel = '';
  let issuedLabel = '';
  const listeners = new Set();
  const users = new Set();
  const slots = [];

  function emit() {
    for (const fn of listeners) {
      try {
        fn(lead);
      } catch (error) {
        console.warn('[Weather scrubber] listener error:', error);
      }
    }
  }

  function render() {
    if (!root) return;
    slots.forEach((slot, i) => {
      const past = i > horizon;
      slot.disabled = past;
      slot.setAttribute('aria-pressed', i === lead ? 'true' : 'false');
      slot.title = past
        ? `${horizonLabel || 'this model'}: ${horizon + 1} days — D+${i} needs a 16-day model`
        : `D+${i} · ${segmentFor(i) === 'fine' ? '0.25° fine segment' : 'coarse tail'}`;
    });
    const head = root.querySelector('.wx-scrubber__head b');
    if (head) head.textContent = `D+${lead}`;
    const stamp = root.querySelector('.wx-scrubber__head span');
    if (stamp) stamp.textContent = issuedLabel || 'forecast window';
  }

  function ensureRoot() {
    if (root) return root;
    if (!doc.getElementById(SCRUBBER_STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = SCRUBBER_STYLE_ID;
      style.textContent = SCRUBBER_CSS;
      doc.head.appendChild(style);
    }
    root = doc.createElement('div');
    root.className = 'wx-scrubber';
    root.hidden = true;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Forecast window');
    root.tabIndex = 0;
    const head = doc.createElement('div');
    head.className = 'wx-scrubber__head';
    head.innerHTML = '<span>forecast window</span><b>D+1</b>';
    const track = doc.createElement('div');
    track.className = 'wx-scrubber__track';
    for (let i = 0; i <= MAX_LEAD; i++) {
      if (i === FINE_MAX_LEAD + 1) {
        const gap = doc.createElement('i');
        gap.className = 'wx-scrubber__gap';
        track.appendChild(gap);
      }
      const slot = doc.createElement('button');
      slot.type = 'button';
      slot.className = `wx-scrubber__slot wx-scrubber__slot--${segmentFor(i)}`;
      slot.textContent = slotLabel(i);
      slot.dataset.lead = String(i);
      slot.addEventListener('click', () => api.setLead(i));
      track.appendChild(slot);
      slots.push(slot);
    }
    const foot = doc.createElement('div');
    foot.className = 'wx-scrubber__foot';
    foot.innerHTML =
      '<span>fine · 0.25° · 240 h</span><span>tail · coarse · to D+16</span>';
    root.append(head, track, foot);
    root.addEventListener('keydown', (event) => {
      if (event.key === ']' || event.key === 'ArrowRight')
        api.setLead(lead + 1);
      else if (event.key === '[' || event.key === 'ArrowLeft')
        api.setLead(lead - 1);
      else if (event.key === 'Home') api.setLead(DEFAULT_LEAD);
      else return;
      event.preventDefault();
    });
    doc.body.appendChild(root);
    render();
    return root;
  }

  const api = {
    getLead: () => lead,
    setLead(next) {
      const clamped = clampLead(next, horizon);
      if (clamped === lead) return lead;
      lead = clamped;
      render();
      emit();
      return lead;
    },
    /** The active run's horizon (last answerable lead) and its labels. */
    setHorizon({ horizon: h = MAX_LEAD, label = '', issued = '' } = {}) {
      horizon = clampLead(h, MAX_LEAD);
      horizonLabel = label;
      issuedLabel = issued;
      if (lead > horizon) {
        lead = horizon;
        render();
        emit();
      } else render();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Reference-counted visibility: shown while any weather surface is on. */
    acquire(id) {
      users.add(id);
      ensureRoot().hidden = false;
      render();
    },
    release(id) {
      users.delete(id);
      if (!users.size && root) root.hidden = true;
    },
    isVisible: () => Boolean(root && !root.hidden),
    element: () => ensureRoot(),
  };
  return api;
}

let _shared = null;
/** The one scrubber every weather layer shares in a document. */
export function getForecastScrubber(options) {
  if (!_shared) _shared = createForecastScrubber(options);
  return _shared;
}
