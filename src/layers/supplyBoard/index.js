import * as Cesium from 'cesium';
import {
  SUPPLY_BOARD_ANCHOR,
  SUPPLY_BOARD_LAYER_ID,
  SUPPLY_BOARD_MIN_HEIGHT_M,
  createSupplyBoardOverlayEntry,
  supplyBoardLines,
  supplyBoardMetaLine,
} from './model.js';

export * from './model.js';
export { createSupplyBoardSource, ORACLE_SUPPLY_BOARD_URL } from './source.js';

/** The store's balance and storage move weekly at most; half-hourly is plenty. */
const UPDATE_INTERVAL_MS = 30 * 60_000;

/**
 * The US gas supply board (row 14 M2, R14.8): one card over the lower 48 at
 * global depth, nothing closer in (the region layers speak there). No
 * entities and no picking: the card is ambient text on the shared overlay.
 */
export function createSupplyBoardLayer({ source, overlayHost } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Supply board requires a snapshot source');
  if (!overlayHost)
    throw new TypeError('Supply board requires an overlay host');

  let _viewer = null;
  let _snapshot = null;
  let _enabled = false;
  let _request = null;
  let _removeMoveEnd = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _shown = false;
  const _position = Cesium.Cartesian3.fromDegrees(
    SUPPLY_BOARD_ANCHOR.lon,
    SUPPLY_BOARD_ANCHOR.lat,
  );

  function atGlobalDepth() {
    const height = _viewer?.camera?.positionCartographic?.height;
    return !Number.isFinite(height) || height >= SUPPLY_BOARD_MIN_HEIGHT_M;
  }

  function publish() {
    if (!_enabled) return;
    const entries = [];
    if (_snapshot && atGlobalDepth()) {
      const entry = createSupplyBoardOverlayEntry(_snapshot, _position);
      if (entry) entries.push(entry);
    }
    _shown = entries.length > 0;
    overlayHost.setEntries(SUPPLY_BOARD_LAYER_ID, entries, {
      cohortLimit: 2,
      collisionCapacity: 4,
      moving: false,
    });
  }

  const layer = {
    id: SUPPLY_BOARD_LAYER_ID,
    name: 'Gas · US Supply Board',
    icon: '⛽',
    source: 'Oil Oracle store + filings',
    freshnessClass: 'published',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Supply board is already initialized');
      _viewer = viewer;
      _snapshot = null;
      _enabled = false;
      overlayHost.setVisible(SUPPLY_BOARD_LAYER_ID, false);
    },

    enable(viewer = _viewer) {
      _enabled = true;
      overlayHost.setVisible(SUPPLY_BOARD_LAYER_ID, true);
      if (!_removeMoveEnd && viewer?.camera?.moveEnd)
        _removeMoveEnd = viewer.camera.moveEnd.addEventListener(publish);
      publish();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _removeMoveEnd?.();
      _removeMoveEnd = null;
      _shown = false;
      overlayHost.clearSource(SUPPLY_BOARD_LAYER_ID);
      overlayHost.setVisible(SUPPLY_BOARD_LAYER_ID, false);
    },

    async update() {
      if (!_enabled) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _snapshot = snapshot;
        _lastUpdate = Date.now();
        _lastError = snapshot.board ? null : snapshot.boardError;
        publish();
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _lastError = e?.message || 'Supply board unavailable';
        console.warn('[Data:SupplyBoard] Load error:', e);
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy() {
      layer.disable();
      _viewer = null;
      _snapshot = null;
      _lastUpdate = null;
      _lastError = null;
    },

    getStats() {
      const regions = _snapshot?.regions ?? [];
      return {
        count: regions.length,
        countLabel: _snapshot ? `${regions.length} regions filed` : null,
        source: _snapshot ? supplyBoardMetaLine(_snapshot) : null,
        lines: _snapshot ? supplyBoardLines(_snapshot) : [],
        board: Boolean(_snapshot?.board),
        boardError: _snapshot?.boardError ?? null,
        shown: _shown,
        freshnessClass: 'published',
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };
  return layer;
}
