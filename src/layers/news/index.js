import * as Cesium from 'cesium';
import { horizonOccluder } from '../../data/iconOrientation.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { isEmptySpacePick } from '../commodities/emptyPick.js';
import { NEWS_GAZETTEER } from './gazetteer.js';
import {
  NEWS_LAYER_ID,
  NEWS_OVERLAY_SOURCE_ID,
  NEWS_OVERLAY_COHORT_LIMIT,
  NEWS_OVERLAY_COLLISION_CAPACITY,
  badgeColor,
  badgePixelSize,
  buildSelectedNewsCard,
  createNewsOverlayEntry,
  mapAnalystRecord,
  newsPosition,
  selectNewsOverlayCohort,
} from './model.js';
export * from './model.js';
export * from './records.js';
export { NEWS_GAZETTEER } from './gazetteer.js';
export { createNewsAssetsSource, NEWS_ASSETS_ROUTE } from './source.js';

/**
 * The proxy refreshes one upstream group a minute behind a 15-minute cache,
 * so a short local poll only ever reads that cache; badges appear
 * progressively as the groups fill after enable.
 */
const UPDATE_INTERVAL_MS = 2 * 60_000;

/** A pinned asset before its first feed: known place, no headlines yet. */
function emptyRow(point) {
  return { ...point, count: 0, latestAt: null, articles: [] };
}

/**
 * Own the news badges. Geometry is pinned: every asset's marker is created
 * once from the bundled gazetteer at a fixed height and each refresh only
 * restyles it (visibility, colour, size, ambient badge, detail card). An
 * asset with no matched headline in the window draws nothing (row 5 rule).
 */
export function createNewsLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
  points = NEWS_GAZETTEER,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('News requires a snapshot source');
  if (!overlayHost) throw new TypeError('News requires an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`News requires context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('News requires a screen-space handler factory');

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _clickHandler = null;
  let _horizonCullRemovers = [];
  let _rows = [];
  let _entries = [];
  let _selectedId = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _retrievedAt = null;
  let _windowDays = null;
  let _enabled = false;
  const _rowById = new Map();
  const _positionById = new Map();
  /** Pinned entities per asset id: `{ point, marker, occluded, visible }`. */
  const _pinsById = new Map();

  function publishOverlay() {
    if (!_enabled) return;
    const entries = _entries.filter((entry) => entry.id !== _selectedId);
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    if (selected && selected.count > 0)
      entries.push(
        buildSelectedNewsCard(
          { ...selected, windowDays: _windowDays },
          _positionById.get(selected.id),
        ),
      );
    overlayHost.setEntries(NEWS_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: NEWS_OVERLAY_COHORT_LIMIT + 1,
      collisionCapacity: NEWS_OVERLAY_COLLISION_CAPACITY + 1,
      moving: false,
    });
  }

  function select(entity) {
    const id = entity?.__newsAssetId;
    if (!id || !_pinsById.has(id)) return;
    const row = _rowById.get(id);
    if (!row || row.count === 0) return;
    const anchor = _pinsById.get(id).marker;
    _selectedId = id;
    if (_viewer) _viewer.selectedEntity = anchor;
    context.selectEntityContext(anchor);
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selectedId) return;
    _selectedId = null;
    if (_viewer?.selectedEntity?.__newsAssetId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(NEWS_LAYER_ID);
    if (publish) publishOverlay();
  }

  function installClickHandler(viewer) {
    if (_clickHandler || !viewer?.scene?.canvas) return;
    _clickHandler = screenSpaceEventHandlerFactory(viewer.scene.canvas);
    _clickHandler.setInputAction((click) => {
      // A tool owns the pointer (src/data/inputOwnership.js): yield the click.
      if (!_enabled || !isPointerFree()) return;
      const picked = viewer.scene.pick(click.position);
      const entity = picked?.id;
      if (entity?.__newsAssetId) {
        select(entity);
        return;
      }
      // A pick that belongs to a sibling layer is not empty space; the
      // 3D-tiles basemap (a pick with no id) is (emptyPick.js, #74).
      if (!isEmptySpacePick(picked)) return;
      clearSelection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    if (!_clickHandler) return;
    _clickHandler.destroy();
    _clickHandler = null;
  }

  /** Show a marker only when it has news AND sits on the near side of the planet. */
  function applyVisibility(pin) {
    const visible = pin.hasNews && !pin.occluded;
    // Assigning `show` rebuilds a ConstantProperty, so only write on a flip.
    if (pin.visible === visible) return;
    pin.marker.point.show = visible;
    pin.visible = visible;
  }

  /**
   * Hide the badge markers beyond the ellipsoid horizon: the dots are
   * always-on-top (`disableDepthTestDistance: INFINITY`) and with the Cesium
   * globe hidden behind Google 3D tiles nothing writes far-side depth, so a
   * badge on the opposite side of the planet would shine through. Same
   * occluder pass as the chokepoints, CCTV and FIRMS layers.
   */
  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.()) return;
    const occluder = horizonOccluder(_viewer.camera);
    for (const [id, pin] of _pinsById) {
      pin.occluded = occluder.isPointVisible(_positionById.get(id)) !== true;
      applyVisibility(pin);
    }
  }

  function installHorizonCulling(viewer) {
    if (_horizonCullRemovers.length || !viewer?.camera) return;
    // Event-driven, never a per-frame pass: the pins never move, so only the
    // camera can flip which side of the planet an asset is on.
    _horizonCullRemovers = [
      viewer.camera.moveEnd.addEventListener(refreshHorizonCulling),
      viewer.camera.changed.addEventListener(refreshHorizonCulling),
    ];
    refreshHorizonCulling();
  }

  function removeHorizonCulling() {
    for (const remove of _horizonCullRemovers) remove();
    _horizonCullRemovers = [];
  }

  function contextProperties(row) {
    const top = row.articles[0] ?? null;
    return {
      headlineCount: row.count,
      latestAt: row.latestAt,
      topHeadline: top?.title ?? null,
      topDomain: top?.domain ?? null,
      topUrl: top?.url ?? null,
      verification: top ? top.verification : null,
    };
  }

  function registerContext(marker, row) {
    context.registerEntityContext(marker, {
      id: `${NEWS_LAYER_ID}:${row.id}`,
      layerId: NEWS_LAYER_ID,
      layerName: layer.name,
      source: 'GDELT DOC · UNVERIFIED WIRE',
      dataSource: _dataSource,
      label:
        row.count > 0
          ? `${row.name} · ${row.count} headline${row.count === 1 ? '' : 's'} on the wire`
          : `${row.name} · no matched headlines in the window`,
      latitude: row.lat,
      longitude: row.lon,
      properties: contextProperties(row),
    });
  }

  /** Create every asset's pinned marker once; positions never change after this. */
  function createPins() {
    for (const point of points) {
      const row = emptyRow(point);
      const position = newsPosition(point);
      const marker = new Cesium.Entity({
        id: `news:${point.id}`,
        position,
        point: {
          pixelSize: badgePixelSize(1),
          color: badgeColor(1),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2,
          // Pinned at the ellipsoid: a clamped point re-seats itself on every
          // terrain refinement and visibly hops under a tilted camera. The
          // disabled depth test keeps it drawn where terrain sits above it.
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: false,
        },
        properties: {
          assetId: point.id,
          name: point.name,
          ...contextProperties(row),
        },
      });
      marker.__newsAssetId = point.id;
      _dataSource.entities.add(marker);
      _pinsById.set(point.id, {
        point,
        marker,
        hasNews: false,
        occluded: false,
        visible: false,
      });
      _rowById.set(point.id, row);
      _positionById.set(point.id, position);
      registerContext(marker, row);
    }
  }

  /** Restyle one pinned asset from a fresh row; its position is untouched. */
  function restyle(row) {
    const pin = _pinsById.get(row.id);
    if (!pin) return false;
    pin.hasNews = row.count > 0;
    if (pin.hasNews) {
      pin.marker.point.color = badgeColor(row.count);
      pin.marker.point.pixelSize = badgePixelSize(row.count);
    }
    applyVisibility(pin);
    pin.marker.properties = {
      assetId: row.id,
      name: row.name,
      ...contextProperties(row),
    };
    registerContext(pin.marker, row);
    return true;
  }

  const layer = {
    id: NEWS_LAYER_ID,
    name: 'News · Asset Headlines',
    icon: '📰',
    source: 'GDELT DOC',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('News layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(NEWS_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _entries = [];
      _selectedId = null;
      _lastUpdate = null;
      _lastError = null;
      _retrievedAt = null;
      _windowDays = null;
      _enabled = false;
      createPins();
      overlayHost.setVisible(NEWS_OVERLAY_SOURCE_ID, false);
      console.log(`[Data:News] Initialized: ${_pinsById.size} pinned`);
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(NEWS_OVERLAY_SOURCE_ID, true);
      installClickHandler(viewer);
      installHorizonCulling(viewer);
      publishOverlay();
    },

    disable() {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeClickHandler();
      removeHorizonCulling();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(NEWS_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(NEWS_OVERLAY_SOURCE_ID, false);
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : null;
        if (!rows) throw new Error('Malformed news snapshot');
        _windowDays = snapshot.windowDays ?? null;

        const entries = [];
        const applied = [];
        for (const row of rows) {
          if (!restyle(row)) continue;
          _rowById.set(row.id, row);
          if (row.count > 0)
            entries.push(
              createNewsOverlayEntry(row, _positionById.get(row.id)),
            );
          applied.push(row);
        }
        // A selected asset whose headlines left the window closes its card.
        if (_selectedId && !(_rowById.get(_selectedId)?.count > 0))
          clearSelection({ publish: false });
        _entries = selectNewsOverlayCohort(entries);
        _rows = applied;
        _retrievedAt = snapshot.retrievedAt ?? null;
        _lastUpdate = Date.now();
        _lastError = null;
        publishOverlay();
        console.log(
          `[Data:News] Updated: ${entries.length} of ${_pinsById.size} assets carry headlines (${snapshot.status})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:News] Fetch error:', e);
        _lastError = e?.message || 'News wire unavailable';
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeClickHandler();
      removeHorizonCulling();
      overlayHost.clearSource(NEWS_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(NEWS_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(NEWS_LAYER_ID);
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _rows = [];
      _entries = [];
      _rowById.clear();
      _positionById.clear();
      _pinsById.clear();
      _lastUpdate = null;
      _lastError = null;
      _retrievedAt = null;
      _windowDays = null;
    },

    /** Plain records for the analyst query engine; empty while hidden. */
    getAnalystRecords(maxCount = 64) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 64;
      return _rows
        .filter((row) => row.count > 0)
        .slice(0, limit)
        .map(mapAnalystRecord);
    },

    getStats() {
      return {
        count: _rows.filter((row) => row.count > 0).length,
        pinned: _pinsById.size,
        headlines: _rows.reduce((sum, row) => sum + row.count, 0),
        lastUpdate: _lastUpdate,
        error: _lastError,
        retrievedAt: _retrievedAt,
        source: 'GDELT DOC',
      };
    },
  };
  return layer;
}
