import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { CHOKEPOINT_GAZETTEER } from './gazetteer.js';
import {
  CHOKEPOINT_LAYER_ID,
  CHOKEPOINT_OVERLAY_SOURCE_ID,
  CHOKEPOINT_OVERLAY_COHORT_LIMIT,
  CHOKEPOINT_OVERLAY_COLLISION_CAPACITY,
  buildSelectedChokepointCard,
  chokepointPosition,
  createChokepointOverlayEntry,
  flowRatio,
  groundCirclePositions,
  mapAnalystRecord,
  ringRadiusMeters,
  selectChokepointOverlayCohort,
  statusColor,
} from './model.js';
import { formatDeviation } from './records.js';
export * from './model.js';
export * from './records.js';
export { CHOKEPOINT_GAZETTEER } from './gazetteer.js';
export { createPortWatchChokepointSource } from './source.js';

/** PortWatch publishes daily; a half-hour poll is plenty and polite. */
const UPDATE_INTERVAL_MS = 30 * 60_000;

/** A pinned strait before its first feed: known place, unknown flow. */
function emptyRow(point) {
  return {
    ...point,
    recentAvg: null,
    baselineAvg: null,
    recentDays: 0,
    baselineDays: 0,
    deviationPct: null,
    status: 'unknown',
    latestDate: null,
    history: [],
  };
}

/**
 * Own one chokepoint display. Geometry is pinned: every strait's ring, inner
 * disc and marker are created once from the bundled gazetteer at a fixed
 * height, and each refresh only restyles them from the daily feed (colour,
 * ring size, disc size, ambient label, detail card). Nothing that marks a
 * position is clamped to terrain, so a marker never re-seats itself as
 * tiles refine and never blinks on a refresh.
 */
export function createChokepointsLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
  points = CHOKEPOINT_GAZETTEER,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Chokepoints require a snapshot source');
  if (!overlayHost) throw new TypeError('Chokepoints require an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Chokepoints require context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('Chokepoints require a screen-space handler factory');

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _clickHandler = null;
  let _rows = [];
  let _entries = [];
  let _selectedId = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _latestDate = null;
  let _enabled = false;
  const _rowById = new Map();
  const _positionById = new Map();
  /** Pinned entities per chokepoint id: `{ point, ring, flow, radius }`. */
  const _pinsById = new Map();

  function publishOverlay() {
    if (!_enabled) return;
    const entries = _entries.filter((entry) => entry.id !== _selectedId);
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    if (selected)
      entries.push(
        buildSelectedChokepointCard(selected, _positionById.get(selected.id)),
      );
    overlayHost.setEntries(CHOKEPOINT_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: CHOKEPOINT_OVERLAY_COHORT_LIMIT + 1,
      collisionCapacity: CHOKEPOINT_OVERLAY_COLLISION_CAPACITY + 1,
      moving: false,
    });
  }

  function select(entity) {
    const id = entity?.__chokepointId;
    if (!id || !_pinsById.has(id)) return;
    // The disc is pickable too, but the context lives on the ring entity.
    const anchor = _pinsById.get(id).ring;
    _selectedId = id;
    if (_viewer) _viewer.selectedEntity = anchor;
    context.selectEntityContext(anchor);
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selectedId) return;
    _selectedId = null;
    if (_viewer?.selectedEntity?.__chokepointId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(CHOKEPOINT_LAYER_ID);
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
      if (entity?.__chokepointId) {
        select(entity);
        return;
      }
      // A pick that belongs to a sibling layer is not empty space.
      if (picked) return;
      clearSelection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    if (!_clickHandler) return;
    _clickHandler.destroy();
    _clickHandler = null;
  }

  function contextProperties(row) {
    return {
      tankersPerDayRecent: row.recentAvg,
      tankersPerDayBaseline: row.baselineAvg,
      deviationPct: row.deviationPct,
      status: row.status,
      recentDays: row.recentDays,
      baselineDays: row.baselineDays,
      latestDate: row.latestDate,
    };
  }

  function registerContext(ring, row) {
    context.registerEntityContext(ring, {
      id: `${CHOKEPOINT_LAYER_ID}:${row.id}`,
      layerId: CHOKEPOINT_LAYER_ID,
      layerName: layer.name,
      source: 'IMF PortWatch',
      dataSource: _dataSource,
      label: row.latestDate
        ? `${row.name} · tanker transits ${formatDeviation(row.deviationPct)} vs ${row.baselineDays}d`
        : `${row.name} · tanker transits awaiting PortWatch data`,
      latitude: row.lat,
      longitude: row.lon,
      properties: contextProperties(row),
    });
  }

  /** Create every strait's pinned geometry once; positions never change after this. */
  function createPins() {
    for (const point of points) {
      const row = emptyRow(point);
      const position = chokepointPosition(point);
      const color = statusColor(row.status);
      const radius = ringRadiusMeters(null);
      const ring = new Cesium.Entity({
        id: `chokepoint:${point.id}`,
        position,
        polyline: {
          // A ground polyline draws on terrain; a clamped ellipse outline
          // does not (Cesium drops it with a one-time warning).
          positions: groundCirclePositions(point.lon, point.lat, radius),
          clampToGround: true,
          width: 2.5,
          material: color.withAlpha(0.9),
        },
        point: {
          pixelSize: 9,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2,
          // Pinned at the ellipsoid: a clamped point re-seats itself on every
          // terrain refinement and visibly hops under a tilted camera. The
          // disabled depth test keeps it drawn where terrain sits above it.
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          portid: point.id,
          name: point.name,
          ...contextProperties(row),
        },
      });
      ring.__chokepointId = point.id;
      const flow = new Cesium.Entity({
        id: `chokepoint-flow:${point.id}`,
        position,
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: new Cesium.ColorMaterialProperty(color.withAlpha(0.35)),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      flow.__chokepointId = point.id;
      _dataSource.entities.add(ring);
      _dataSource.entities.add(flow);
      _pinsById.set(point.id, { point, ring, flow, radius });
      _rowById.set(point.id, row);
      _positionById.set(point.id, position);
      registerContext(ring, row);
    }
  }

  /** Restyle one pinned strait from a fresh row; its position is untouched. */
  function restyle(row) {
    const pin = _pinsById.get(row.id);
    if (!pin) return false;
    const color = statusColor(row.status);
    const radius = ringRadiusMeters(row.baselineAvg);
    const innerRadius = radius * flowRatio(row);
    if (radius !== pin.radius) {
      pin.ring.polyline.positions = groundCirclePositions(
        pin.point.lon,
        pin.point.lat,
        radius,
      );
      pin.radius = radius;
    }
    pin.ring.polyline.material = color.withAlpha(0.9);
    pin.ring.point.color = color;
    pin.ring.properties = {
      portid: row.id,
      name: row.name,
      ...contextProperties(row),
    };
    pin.flow.ellipse.semiMajorAxis = innerRadius;
    pin.flow.ellipse.semiMinorAxis = innerRadius;
    pin.flow.ellipse.material = color.withAlpha(0.35);
    registerContext(pin.ring, row);
    return true;
  }

  const layer = {
    id: CHOKEPOINT_LAYER_ID,
    name: 'Chokepoints · Tanker Transits',
    icon: '🛢️',
    source: 'IMF PortWatch',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Chokepoint layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(CHOKEPOINT_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _entries = [];
      _selectedId = null;
      _lastUpdate = null;
      _lastError = null;
      _latestDate = null;
      _enabled = false;
      createPins();
      overlayHost.setVisible(CHOKEPOINT_OVERLAY_SOURCE_ID, false);
      console.log(`[Data:Chokepoints] Initialized: ${_pinsById.size} pinned`);
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(CHOKEPOINT_OVERLAY_SOURCE_ID, true);
      installClickHandler(viewer);
      publishOverlay();
    },

    disable() {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeClickHandler();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(CHOKEPOINT_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(CHOKEPOINT_OVERLAY_SOURCE_ID, false);
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
        if (!rows) throw new Error('Malformed chokepoint snapshot');

        const entries = [];
        const applied = [];
        const unpinned = [];
        for (const row of rows) {
          if (!restyle(row)) {
            unpinned.push(row.id);
            continue;
          }
          _rowById.set(row.id, row);
          entries.push(
            createChokepointOverlayEntry(row, _positionById.get(row.id)),
          );
          applied.push(row);
        }
        if (unpinned.length)
          console.warn(
            `[Data:Chokepoints] ${unpinned.length} feed ids have no pinned strait: ${unpinned.slice(0, 5).join(', ')}`,
          );
        _entries = selectChokepointOverlayCohort(entries);
        _rows = applied;
        _latestDate = snapshot.latestDate ?? null;
        _lastUpdate = Date.now();
        _lastError = null;
        publishOverlay();
        console.log(
          `[Data:Chokepoints] Updated: ${applied.length} of ${_pinsById.size} chokepoints (latest ${_latestDate ?? 'n/a'})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Chokepoints] Fetch error:', e);
        _lastError = e?.message || 'PortWatch unavailable';
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
      overlayHost.clearSource(CHOKEPOINT_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(CHOKEPOINT_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(CHOKEPOINT_LAYER_ID);
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
      _latestDate = null;
    },

    /** Plain records for the analyst query engine; empty while hidden. */
    getAnalystRecords(maxCount = 64) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 64;
      return _rows.slice(0, limit).map(mapAnalystRecord);
    },

    getStats() {
      return {
        count: _rows.length,
        pinned: _pinsById.size,
        lastUpdate: _lastUpdate,
        error: _lastError,
        latestDate: _latestDate,
      };
    },
  };
  return layer;
}
