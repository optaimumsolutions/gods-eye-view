import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
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
export { createPortWatchChokepointSource } from './source.js';

/** PortWatch publishes daily; a half-hour poll is plenty and polite. */
const UPDATE_INTERVAL_MS = 30 * 60_000;

/**
 * Own one chokepoint display: a ground ring per strait sized by its baseline
 * tanker rate, an inner disc showing how much of that flow is still moving,
 * an ambient deviation label, and a selected detail card.
 */
export function createChokepointsLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
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
    if (!id || !_rowById.has(id)) return;
    _selectedId = id;
    if (_viewer) _viewer.selectedEntity = entity;
    context.selectEntityContext(entity);
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
      overlayHost.setVisible(CHOKEPOINT_OVERLAY_SOURCE_ID, false);
      console.log('[Data:Chokepoints] Initialized');
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

        const entities = [];
        const entries = [];
        _rowById.clear();
        _positionById.clear();
        for (const row of rows) {
          const position = chokepointPosition(row);
          const color = statusColor(row.status);
          const radius = ringRadiusMeters(row.baselineAvg);
          const innerRadius = radius * flowRatio(row);
          const ring = new Cesium.Entity({
            id: `chokepoint:${row.id}`,
            position,
            polyline: {
              // A ground polyline draws on terrain; a clamped ellipse outline
              // does not (Cesium drops it with a one-time warning).
              positions: groundCirclePositions(row.lon, row.lat, radius),
              clampToGround: true,
              width: 2.5,
              material: color.withAlpha(0.9),
            },
            point: {
              pixelSize: 9,
              color,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: {
              portid: row.id,
              name: row.name,
              ...contextProperties(row),
            },
          });
          ring.__chokepointId = row.id;
          const flow = new Cesium.Entity({
            id: `chokepoint-flow:${row.id}`,
            position,
            ellipse: {
              semiMajorAxis: innerRadius,
              semiMinorAxis: innerRadius,
              material: new Cesium.ColorMaterialProperty(color.withAlpha(0.35)),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          flow.__chokepointId = row.id;
          entities.push(ring, flow);
          entries.push(createChokepointOverlayEntry(row, position));
          _rowById.set(row.id, row);
          _positionById.set(row.id, position);
          context.registerEntityContext(ring, {
            id: `${CHOKEPOINT_LAYER_ID}:${row.id}`,
            layerId: CHOKEPOINT_LAYER_ID,
            layerName: layer.name,
            source: 'IMF PortWatch',
            dataSource: _dataSource,
            label: `${row.name} · tanker transits ${formatDeviation(row.deviationPct)} vs ${row.baselineDays}d`,
            latitude: row.lat,
            longitude: row.lon,
            properties: contextProperties(row),
          });
        }

        _dataSource.entities.removeAll();
        for (const entity of entities) _dataSource.entities.add(entity);
        _entries = selectChokepointOverlayCohort(entries);
        if (_selectedId && !_rowById.has(_selectedId)) _selectedId = null;
        _rows = rows;
        _latestDate = snapshot.latestDate ?? null;
        _lastUpdate = Date.now();
        _lastError = null;
        publishOverlay();
        console.log(
          `[Data:Chokepoints] Updated: ${rows.length} chokepoints (latest ${_latestDate ?? 'n/a'})`,
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
        lastUpdate: _lastUpdate,
        error: _lastError,
        latestDate: _latestDate,
      };
    },
  };
  return layer;
}
