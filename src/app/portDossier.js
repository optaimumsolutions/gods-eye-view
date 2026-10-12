/**
 * Port dossier controller (docs/COMMODITIES-PLAN.md §9.6.4).
 *
 * Opens the dossier panel when one of the bundled ports is selected on the
 * globe (`gev:entity-selected` for a `commodity-ports` port record), swaps
 * the content when another bundled port is clicked, and closes it on
 * deselect or on the panel's own close button (closing never deselects).
 * Nothing is fetched before a click; every request aborts on deselect or
 * swap; one dossier is in flight at a time; the history request is one page
 * of at most 120 rows, cached for 30 minutes per port and shown as `partial`
 * when only a stale copy exists. Live sections (camera, weather, headlines)
 * are supplied by the `live` hooks so this module stays testable without a
 * network or DOM.
 */
import { PORT_LAYER_ID } from '../layers/ports/model.js';
import { PORTWATCH_SERVICES_URL } from '../layers/ports/source.js';
import {
  PORT_HISTORY_MAX_ROWS,
  assemblePortDossier,
  normalizePortHistoryRows,
} from '../layers/ports/dossier.js';

export const PORT_DOSSIER_HISTORY_CACHE_MS = 30 * 60_000;
export const PORT_DOSSIER_HISTORY_STALE_MS = 6 * 60 * 60_000;
/** The camera slot re-requests its frame and the stamps re-age on this cadence while open. */
export const PORT_DOSSIER_TICK_MS = 60_000;
const HISTORY_URL = `${PORTWATCH_SERVICES_URL}/Daily_Ports_Data/FeatureServer/0/query`;
const HISTORY_FIELDS = [
  'date',
  'portcalls_tanker',
  'portcalls_container',
  'portcalls_dry_bulk',
  'portcalls_general_cargo',
  'portcalls_roro',
  'portcalls',
  'import_tanker',
  'export_tanker',
  'import_container',
  'export_container',
  'import_dry_bulk',
  'export_dry_bulk',
  'import_general_cargo',
  'export_general_cargo',
  'import_roro',
  'export_roro',
  'import',
  'export',
].join(',');
const PORTID_RE = /^port[0-9]+$/;

/** The PortWatch port id behind a context record, or null for anything that is not a port marker. */
export function portidFromContextRecord(record) {
  if (!record || record.layerId !== PORT_LAYER_ID) return null;
  const id = String(record.id || '');
  const prefix = `${PORT_LAYER_ID}:`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return PORTID_RE.test(rest) ? rest : null;
}

/**
 * @param {object} options
 * @param {object} options.layer the ports layer module (`getDossierInputs`)
 * @param {object} options.panel `{ open(entry), render(assembled), close(), onClose(handler), destroy() }`
 * @param {object} options.index the bundle index (`ports[]`)
 * @param {(portid:string)=>Promise<object|null>} options.loadDossier
 * @param {object} [options.live] `{ weather, news, cameras }` hooks: `(dossier, signal, tick) => Promise<input>`
 */
export function installPortDossier({
  layer,
  panel,
  index,
  loadDossier,
  windowRef = globalThis.window,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  live = null,
} = {}) {
  if (!panel || !index?.ports || typeof loadDossier !== 'function')
    throw new TypeError('Port dossier needs a panel, an index and a loader');
  const bundled = new Map(index.ports.map((entry) => [entry.portid, entry]));
  const historyCache = new Map();
  /** @type {{portid:string, dossier:object|null, controller:AbortController, inputs:object}|null} */
  let current = null;
  let timer = null;
  let disposed = false;

  function isCurrent(controller) {
    return (
      !disposed &&
      current?.controller === controller &&
      !controller.signal.aborted
    );
  }

  function render() {
    if (!current?.dossier) return;
    panel.render(
      assemblePortDossier({
        dossier: current.dossier,
        ...current.inputs,
        vintage: index.vintage ?? null,
        now: now(),
      }),
    );
  }

  function layerInputs(portid) {
    const inputs =
      typeof layer?.getDossierInputs === 'function'
        ? layer.getDossierInputs(portid)
        : null;
    if (!inputs?.row)
      return {
        row: { error: 'ports layer has no row for this port yet' },
        disruptions: { error: 'ports layer has no snapshot yet' },
      };
    const fetchedAt = inputs.lastUpdate ?? now();
    return {
      row: { ...inputs.row, fetchedAt },
      disruptions: { events: inputs.disruptions ?? [], fetchedAt },
    };
  }

  async function loadHistory(portid, signal) {
    const cached = historyCache.get(portid);
    const at = now();
    if (cached && at - cached.fetchedAt <= PORT_DOSSIER_HISTORY_CACHE_MS)
      return { rows: cached.rows, fetchedAt: cached.fetchedAt };
    try {
      const query = new URLSearchParams({
        where: `portid='${portid}'`,
        outFields: HISTORY_FIELDS,
        orderByFields: 'date DESC',
        resultRecordCount: String(PORT_HISTORY_MAX_ROWS),
        returnGeometry: 'false',
        f: 'json',
      });
      const response = await fetchImpl(`${HISTORY_URL}?${query}`, { signal });
      if (!response.ok)
        throw new Error(`PortWatch history HTTP ${response.status}`);
      const payload = await response.json();
      if (payload?.error)
        throw new Error(
          `PortWatch history error ${payload.error.code ?? ''}`.trim(),
        );
      const rows = normalizePortHistoryRows(payload);
      if (!rows) throw new Error('Malformed PortWatch history response');
      const fetchedAt = now();
      historyCache.set(portid, { rows, fetchedAt });
      return { rows, fetchedAt };
    } catch (error) {
      if (signal.aborted) throw error;
      if (cached && at - cached.fetchedAt <= PORT_DOSSIER_HISTORY_STALE_MS)
        return { rows: cached.rows, fetchedAt: cached.fetchedAt, stale: true };
      return { error: error?.message || 'PortWatch history unavailable' };
    }
  }

  /** The section inputs the live module supplies; `dispose` is teardown, not a hook. */
  const LIVE_HOOKS = ['weather', 'news', 'cameras'];

  function runLive(controller, tick) {
    if (!live || !current?.dossier) return;
    for (const key of LIVE_HOOKS) {
      const hook = live[key];
      if (typeof hook !== 'function') continue;
      if (tick > 0 && key !== 'cameras') continue;
      Promise.resolve()
        .then(() => hook(current.dossier, controller.signal, tick))
        .then(
          (value) => {
            if (!isCurrent(controller)) return;
            current.inputs[key] = value ?? { error: `${key} unavailable` };
            render();
          },
          (error) => {
            if (!isCurrent(controller)) return;
            current.inputs[key] = {
              error: error?.message || `${key} unavailable`,
            };
            render();
          },
        );
    }
  }

  function stopTimer() {
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  function startTimer(controller) {
    stopTimer();
    let tick = 0;
    timer = setTimer(() => {
      if (!isCurrent(controller)) return stopTimer();
      tick += 1;
      Object.assign(current.inputs, layerInputs(current.portid));
      render();
      runLive(controller, tick);
    }, PORT_DOSSIER_TICK_MS);
  }

  function abortCurrent() {
    stopTimer();
    if (current) current.controller.abort();
    current = null;
    // The live module holds the frame's object URL; a closed or swapped
    // dossier will never show it again.
    live?.dispose?.();
  }

  async function openPort(portid) {
    const entry = bundled.get(portid);
    if (!entry || disposed) return false;
    if (current?.portid === portid) {
      panel.open(entry);
      Object.assign(current.inputs, layerInputs(portid));
      render();
      return true;
    }
    abortCurrent();
    const controller = new AbortController();
    current = {
      portid,
      dossier: null,
      controller,
      inputs: {
        row: null,
        history: null,
        disruptions: null,
        weather: null,
        news: null,
        cameras: null,
      },
    };
    panel.open(entry);
    let dossier = null;
    try {
      dossier = await loadDossier(portid);
    } catch (error) {
      if (isCurrent(controller)) {
        panel.renderError?.(entry, error?.message || 'dossier unavailable');
        // Leave no half-open slot behind, or the same-port fast path would
        // answer the next click without ever retrying the load.
        abortCurrent();
      }
      return false;
    }
    if (!isCurrent(controller)) return false;
    if (!dossier) {
      panel.renderError?.(entry, 'no bundled dossier');
      abortCurrent();
      return false;
    }
    current.dossier = dossier;
    Object.assign(current.inputs, layerInputs(portid));
    render();
    loadHistory(portid, controller.signal).then(
      (history) => {
        if (!isCurrent(controller)) return;
        current.inputs.history = history;
        render();
      },
      () => {},
    );
    runLive(controller, 0);
    startTimer(controller);
    return true;
  }

  function close() {
    abortCurrent();
    panel.close();
  }

  function onSelected(event) {
    const portid = portidFromContextRecord(event?.detail);
    if (portid && bundled.has(portid)) {
      void openPort(portid);
      return;
    }
    // Any other selection means the port is no longer selected.
    if (current) close();
  }

  function onCleared() {
    if (current) close();
  }

  windowRef?.addEventListener?.('gev:entity-selected', onSelected);
  windowRef?.addEventListener?.('gev:entity-selection-cleared', onCleared);
  // The panel's own close button hides the panel without touching selection.
  panel.onClose?.(() => abortCurrent());

  return Object.freeze({
    openPort,
    close,
    getState: () => ({
      portid: current?.portid ?? null,
      loaded: Boolean(current?.dossier),
      historyCached: [...historyCache.keys()],
    }),
    destroy() {
      if (disposed) return;
      disposed = true;
      windowRef?.removeEventListener?.('gev:entity-selected', onSelected);
      windowRef?.removeEventListener?.(
        'gev:entity-selection-cleared',
        onCleared,
      );
      abortCurrent();
      live?.dispose?.();
      panel.destroy?.();
    },
  });
}
