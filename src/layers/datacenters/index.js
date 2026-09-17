import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  DATACENTER_LAYER_ID,
  DATACENTER_OVERLAY_SOURCE_ID,
  DATACENTER_OVERLAY_COHORT_LIMIT,
  DATACENTER_OVERLAY_COLLISION_CAPACITY,
  DATACENTER_TIER_GLOBAL,
  buildSelectedDatacenterCard,
  createDatacenterOverlayEntry,
  datacenterPosition,
  detailTierForHeight,
  groundCirclePositions,
  markerPixelSize,
  ringRadiusMeters,
  selectDatacenterOverlayCohort,
  statusColor,
} from './model.js';
import { formatMw, mapAnalystRecord } from './records.js';
export * from './model.js';
export * from './records.js';
export { createBundledDatacenterSource } from './source.js';

/** A bundled snapshot never changes at runtime; the poll is a formality. */
const UPDATE_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Own the US data center display. Every site is a pinned marker with a
 * campus-scale ground ring, an ambient overlay entry whose depth follows the
 * camera height (label at global zoom, short card once regional) and a full
 * analyst card on click. Positions come from the bundle and never move.
 */
export function createDatacentersLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Data centers require a snapshot source');
  if (!overlayHost) throw new TypeError('Data centers require an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Data centers require context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('Data centers require a screen-space handler factory');

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _clickHandler = null;
  let _cameraListener = null;
  let _rows = [];
  let _entries = [];
  let _selectedId = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _snapshot = null;
  let _tier = DATACENTER_TIER_GLOBAL;
  let _enabled = false;
  const _rowById = new Map();
  const _positionById = new Map();
  /** Pinned entities per site id: `{ marker, ring }`. */
  const _pinsById = new Map();

  function currentTier() {
    const height = _viewer?.camera?.positionCartographic?.height;
    return detailTierForHeight(height);
  }

  function rebuildEntries() {
    const entries = [];
    for (const row of _rows) {
      entries.push(
        createDatacenterOverlayEntry(row, _positionById.get(row.id), _tier),
      );
    }
    _entries = selectDatacenterOverlayCohort(entries);
  }

  function publishOverlay() {
    if (!_enabled) return;
    const entries = _entries.filter((entry) => entry.id !== _selectedId);
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    if (selected)
      entries.push(
        buildSelectedDatacenterCard(selected, _positionById.get(selected.id)),
      );
    overlayHost.setEntries(DATACENTER_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: DATACENTER_OVERLAY_COHORT_LIMIT + 1,
      collisionCapacity: DATACENTER_OVERLAY_COLLISION_CAPACITY + 1,
      moving: false,
    });
  }

  /** Camera settled: if the height crossed the tier line, redraw the ambient cards. */
  function onCameraMoveEnd() {
    if (!_enabled) return;
    const tier = currentTier();
    if (tier === _tier) return;
    _tier = tier;
    rebuildEntries();
    publishOverlay();
  }

  function installCameraListener(viewer) {
    if (_cameraListener || !viewer?.camera?.moveEnd) return;
    _cameraListener = viewer.camera.moveEnd.addEventListener(onCameraMoveEnd);
  }

  function removeCameraListener() {
    if (!_cameraListener) return;
    _cameraListener();
    _cameraListener = null;
  }

  function select(entity) {
    const id = entity?.__datacenterId;
    if (!id || !_pinsById.has(id)) return;
    const anchor = _pinsById.get(id).marker;
    _selectedId = id;
    if (_viewer) _viewer.selectedEntity = anchor;
    context.selectEntityContext(anchor);
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selectedId) return;
    _selectedId = null;
    if (_viewer?.selectedEntity?.__datacenterId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(DATACENTER_LAYER_ID);
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
      if (entity?.__datacenterId) {
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

  function registerContext(marker, row) {
    context.registerEntityContext(marker, {
      id: `${DATACENTER_LAYER_ID}:${row.id}`,
      layerId: DATACENTER_LAYER_ID,
      layerName: layer.name,
      source: 'Epoch AI',
      dataSource: _dataSource,
      label: `${row.name} · ${formatMw(row.itPowerMw)} IT · ${row.owner ?? 'owner n/a'}`,
      latitude: row.lat,
      longitude: row.lon,
      properties: mapAnalystRecord(row),
    });
  }

  /** Create every site's pinned geometry once from the snapshot. */
  function createPins(rows) {
    for (const row of rows) {
      if (_pinsById.has(row.id)) continue;
      const position = datacenterPosition(row);
      const color = statusColor(row.status);
      const radius = ringRadiusMeters(row.itPowerMw);
      const marker = new Cesium.Entity({
        id: `datacenter:${row.id}`,
        position,
        point: {
          pixelSize: markerPixelSize(row.itPowerMw),
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2,
          // Pinned at the ellipsoid so a marker never re-seats itself as
          // terrain tiles refine; the disabled depth test keeps it visible.
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          datacenterId: row.id,
          name: row.name,
          ...mapAnalystRecord(row),
        },
      });
      marker.__datacenterId = row.id;
      const ring = new Cesium.Entity({
        id: `datacenter-ring:${row.id}`,
        position,
        polyline: {
          positions: groundCirclePositions(row.lon, row.lat, radius),
          clampToGround: true,
          width: 2,
          material: color.withAlpha(0.7),
        },
      });
      ring.__datacenterId = row.id;
      _dataSource.entities.add(marker);
      _dataSource.entities.add(ring);
      _pinsById.set(row.id, { marker, ring });
      _rowById.set(row.id, row);
      _positionById.set(row.id, position);
      registerContext(marker, row);
    }
  }

  const layer = {
    id: DATACENTER_LAYER_ID,
    name: 'Data Centers · US Power',
    icon: '⚡',
    source: 'Epoch AI',
    freshnessClass: 'published',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Data center layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(DATACENTER_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _entries = [];
      _selectedId = null;
      _lastUpdate = null;
      _lastError = null;
      _snapshot = null;
      _tier = DATACENTER_TIER_GLOBAL;
      _enabled = false;
      overlayHost.setVisible(DATACENTER_OVERLAY_SOURCE_ID, false);
      console.log('[Data:Datacenters] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(DATACENTER_OVERLAY_SOURCE_ID, true);
      installClickHandler(viewer);
      installCameraListener(viewer);
      _tier = currentTier();
      rebuildEntries();
      publishOverlay();
    },

    disable() {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeClickHandler();
      removeCameraListener();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(DATACENTER_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(DATACENTER_OVERLAY_SOURCE_ID, false);
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
        if (!rows) throw new Error('Malformed data center snapshot');
        createPins(rows);
        for (const row of rows) _rowById.set(row.id, row);
        _rows = rows;
        _snapshot = snapshot;
        _tier = currentTier();
        rebuildEntries();
        _lastUpdate = Date.now();
        _lastError = null;
        publishOverlay();
        console.log(
          `[Data:Datacenters] Updated: ${rows.length} sites (${snapshot.asOf})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Datacenters] Load error:', e);
        _lastError = e?.message || 'US data center bundle unavailable';
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
      removeCameraListener();
      overlayHost.clearSource(DATACENTER_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(DATACENTER_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(DATACENTER_LAYER_ID);
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _rows = [];
      _entries = [];
      _snapshot = null;
      _rowById.clear();
      _positionById.clear();
      _pinsById.clear();
      _lastUpdate = null;
      _lastError = null;
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
        asOf: _snapshot?.asOf ?? null,
        vintage: _snapshot?.vintage ?? null,
        freshnessClass: 'published',
        tier: _tier,
        totalItPowerMw: _rows.reduce((sum, r) => sum + (r.itPowerMw || 0), 0),
      };
    },
  };
  return layer;
}
