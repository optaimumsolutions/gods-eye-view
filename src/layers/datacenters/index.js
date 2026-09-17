import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  DATACENTER_FLY_DURATION_S,
  DATACENTER_FLY_FROM_HEIGHT_M,
  DATACENTER_FLY_TO_HEIGHT_M,
  DATACENTER_HOVER_THROTTLE_MS,
  DATACENTER_LAYER_ID,
  DATACENTER_OVERLAY_SOURCE_ID,
  DATACENTER_OVERLAY_COHORT_LIMIT,
  DATACENTER_OVERLAY_COLLISION_CAPACITY,
  DATACENTER_TIER_GLOBAL,
  DATACENTER_TIER_LOCAL,
  DATACENTER_ZOOM_OUT_HEIGHT_M,
  assetColor,
  assetPosition,
  buildSelectedDatacenterCard,
  createAssetOverlayEntry,
  createDatacenterOverlayEntry,
  datacenterPosition,
  detailTierForHeight,
  footprintPositions,
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
export { buildDossierModel, createDatacenterDossier } from './dossier.js';

/** A bundled snapshot never changes at runtime; the poll is a formality. */
const UPDATE_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Own the US data center display. Every site is a pinned marker with a
 * campus ring, a campus footprint where one is mapped, and its on-site
 * plants; the ambient overlay deepens with the camera (label, short card,
 * campus card); hovering highlights the marker; clicking opens the dossier
 * drawer and, from far away, flies the camera down to the campus. The
 * dossier's buttons come back here as fly, zoom-out, previous and next.
 */
export function createDatacentersLayer({
  source,
  overlayHost,
  context,
  dossier = null,
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
  let _handler = null;
  let _removeMoveStart = null;
  let _removeMoveEnd = null;
  let _foreignSelectionListener = null;
  let _rows = [];
  let _entries = [];
  let _selectedId = null;
  let _hoverId = null;
  let _hoverLastPickAt = 0;
  let _cameraMoving = false;
  let _lastUpdate = null;
  let _lastError = null;
  let _snapshot = null;
  let _tier = DATACENTER_TIER_GLOBAL;
  let _enabled = false;
  const _rowById = new Map();
  const _positionById = new Map();
  /** Pinned entities per site id: `{ marker, ring, footprint, outline, assets[] }`. */
  const _pinsById = new Map();

  function cameraHeight() {
    return _viewer?.camera?.positionCartographic?.height;
  }

  function currentTier() {
    return detailTierForHeight(cameraHeight());
  }

  function applyTierToPins() {
    const local = _tier === DATACENTER_TIER_LOCAL;
    for (const [id, pin] of _pinsById) {
      const row = _rowById.get(id);
      if (!row) continue;
      pin.marker.point.pixelSize = markerPixelSize(row.itPowerMw, {
        tier: _tier,
        hovered: _hoverId === id,
      });
      const hasFootprint = Boolean(pin.footprint);
      pin.ring.show = !(local && hasFootprint);
      if (pin.footprint) pin.footprint.show = local;
      if (pin.outline) pin.outline.show = local;
      for (const asset of pin.assets) asset.show = local;
    }
  }

  function rebuildEntries() {
    const entries = [];
    for (const row of _rows) {
      entries.push(
        createDatacenterOverlayEntry(row, _positionById.get(row.id), _tier),
      );
      if (_tier === DATACENTER_TIER_LOCAL) {
        for (const asset of row.assets)
          entries.push(
            createAssetOverlayEntry(row, asset, assetPosition(asset)),
          );
      }
    }
    _entries = selectDatacenterOverlayCohort(
      entries,
      DATACENTER_OVERLAY_COHORT_LIMIT,
    );
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

  function refreshTier({ force = false } = {}) {
    const tier = currentTier();
    if (!force && tier === _tier) return;
    _tier = tier;
    applyTierToPins();
    rebuildEntries();
    publishOverlay();
  }

  /* ---------------------------------------------------------------- *
   * Camera
   * ---------------------------------------------------------------- */

  function onCameraMoveStart() {
    _cameraMoving = true;
    if (_hoverId) setHover(null);
  }

  function onCameraMoveEnd() {
    _cameraMoving = false;
    if (!_enabled) return;
    refreshTier();
  }

  function installCameraListeners(viewer) {
    if (_removeMoveEnd || !viewer?.camera?.moveEnd) return;
    _removeMoveStart =
      viewer.camera.moveStart.addEventListener(onCameraMoveStart);
    _removeMoveEnd = viewer.camera.moveEnd.addEventListener(onCameraMoveEnd);
  }

  function removeCameraListeners() {
    _removeMoveStart?.();
    _removeMoveEnd?.();
    _removeMoveStart = null;
    _removeMoveEnd = null;
    _cameraMoving = false;
  }

  /** Fly straight down onto a site; the caller decides the height. */
  function flyTo(row, height) {
    if (!row || !_viewer || _viewer.isDestroyed?.()) return false;
    if (!isPointerFree()) return false;
    const camera = _viewer.camera;
    _viewer.trackedEntity = undefined;
    camera.cancelFlight?.();
    camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(row.lon, row.lat, height),
      orientation: {
        heading: camera.heading,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
      duration: DATACENTER_FLY_DURATION_S,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
    return true;
  }

  function flyToCampus(row) {
    return flyTo(row, DATACENTER_FLY_TO_HEIGHT_M);
  }

  function zoomOut(row) {
    return flyTo(row, DATACENTER_ZOOM_OUT_HEIGHT_M);
  }

  /* ---------------------------------------------------------------- *
   * Hover
   * ---------------------------------------------------------------- */

  function setHover(id) {
    if (id === _hoverId) return;
    const previous = _hoverId;
    _hoverId = id;
    for (const pinId of [previous, id]) {
      if (!pinId) continue;
      const pin = _pinsById.get(pinId);
      const row = _rowById.get(pinId);
      if (!pin || !row) continue;
      const hovered = pinId === id;
      pin.marker.point.pixelSize = markerPixelSize(row.itPowerMw, {
        tier: _tier,
        hovered,
      });
      const color = statusColor(row.status);
      pin.ring.polyline.material = color.withAlpha(hovered ? 1 : 0.7);
      pin.ring.polyline.width = hovered ? 3 : 2;
      if (pin.outline) {
        pin.outline.polyline.material = color.withAlpha(hovered ? 1 : 0.85);
        pin.outline.polyline.width = hovered ? 3 : 2;
      }
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas?.style) canvas.style.cursor = id ? 'pointer' : '';
  }

  function pickedDatacenterId(picked) {
    const entity = picked?.id;
    return entity?.__datacenterId ?? null;
  }

  function handleHoverMove(position) {
    if (!_enabled || _cameraMoving || !position || !_viewer) return;
    if (!isPointerFree()) {
      if (_hoverId) setHover(null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < DATACENTER_HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    setHover(pickedDatacenterId(picked));
  }

  /* ---------------------------------------------------------------- *
   * Selection
   * ---------------------------------------------------------------- */

  function openDossier(row) {
    if (!dossier?.show) return;
    dossier.show(row, { total: _rows.length });
  }

  function closeDossier() {
    dossier?.hide?.();
  }

  function selectById(id, { fly = 'auto' } = {}) {
    const pin = _pinsById.get(id);
    const row = _rowById.get(id);
    if (!pin || !row) return;
    _selectedId = id;
    if (_viewer) _viewer.selectedEntity = pin.marker;
    context.selectEntityContext(pin.marker);
    openDossier(row);
    publishOverlay();
    const height = cameraHeight();
    const far =
      !Number.isFinite(height) || height > DATACENTER_FLY_FROM_HEIGHT_M;
    if (fly === 'always' || (fly === 'auto' && far)) flyToCampus(row);
  }

  function select(entity) {
    const id = entity?.__datacenterId;
    if (!id) return;
    selectById(id);
  }

  function clearSelection({ publish = true } = {}) {
    closeDossier();
    if (!_selectedId) return;
    _selectedId = null;
    if (_viewer?.selectedEntity?.__datacenterId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(DATACENTER_LAYER_ID);
    if (publish) publishOverlay();
  }

  /** ◂ / ▸ in the dossier: walk the sites by rank and fly to each. */
  function step(delta) {
    if (!_rows.length) return;
    const index = _rows.findIndex((row) => row.id === _selectedId);
    const next =
      ((index < 0 ? 0 : index + delta) + _rows.length) % _rows.length;
    selectById(_rows[next].id, { fly: 'always' });
  }

  /** Another layer took the selection: our card and dossier step aside. */
  function onForeignSelection(event) {
    const layerId = event?.detail?.layerId;
    if (!_selectedId || layerId === DATACENTER_LAYER_ID) return;
    closeDossier();
    _selectedId = null;
    publishOverlay();
  }

  function installHandlers(viewer) {
    if (_handler || !viewer?.scene?.canvas) return;
    _handler = screenSpaceEventHandlerFactory(viewer.scene.canvas);
    _handler.setInputAction((click) => {
      // A tool owns the pointer (src/data/inputOwnership.js): yield the click.
      if (!_enabled || !isPointerFree()) return;
      const picked = viewer.scene.pick(click.position);
      const id = pickedDatacenterId(picked);
      if (id) {
        selectById(id);
        return;
      }
      // A pick that belongs to a sibling layer is not empty space.
      if (picked) return;
      clearSelection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    _handler.setInputAction((movement) => {
      handleHoverMove(movement?.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    if (typeof window !== 'undefined') {
      _foreignSelectionListener = onForeignSelection;
      window.addEventListener('gev:entity-selected', _foreignSelectionListener);
    }
  }

  function removeHandlers() {
    if (_handler) {
      _handler.destroy();
      _handler = null;
    }
    if (_foreignSelectionListener && typeof window !== 'undefined') {
      window.removeEventListener(
        'gev:entity-selected',
        _foreignSelectionListener,
      );
      _foreignSelectionListener = null;
    }
    setHover(null);
  }

  /* ---------------------------------------------------------------- *
   * Geometry
   * ---------------------------------------------------------------- */

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
          pixelSize: markerPixelSize(row.itPowerMw, { tier: _tier }),
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

      let footprint = null;
      let outline = null;
      const positions = footprintPositions(row.footprint);
      if (positions) {
        footprint = new Cesium.Entity({
          id: `datacenter-footprint:${row.id}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: new Cesium.ColorMaterialProperty(color.withAlpha(0.16)),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          show: false,
        });
        footprint.__datacenterId = row.id;
        // Cesium drops outlines on clamped polygons; draw the edge as a ground polyline.
        outline = new Cesium.Entity({
          id: `datacenter-outline:${row.id}`,
          polyline: {
            positions,
            clampToGround: true,
            width: 2,
            material: color.withAlpha(0.85),
          },
          show: false,
        });
        outline.__datacenterId = row.id;
        _dataSource.entities.add(footprint);
        _dataSource.entities.add(outline);
      }

      const assets = [];
      for (const asset of row.assets) {
        const entity = new Cesium.Entity({
          id: `datacenter-asset:${asset.id}`,
          position: assetPosition(asset),
          point: {
            pixelSize: 8,
            color: assetColor(),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          show: false,
        });
        entity.__datacenterId = row.id;
        _dataSource.entities.add(entity);
        assets.push(entity);
      }

      _pinsById.set(row.id, { marker, ring, footprint, outline, assets });
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
      _hoverId = null;
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
      installHandlers(viewer);
      installCameraListeners(viewer);
      refreshTier({ force: true });
    },

    disable() {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeHandlers();
      removeCameraListeners();
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
        _lastUpdate = Date.now();
        _lastError = null;
        refreshTier({ force: true });
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
      removeHandlers();
      removeCameraListeners();
      dossier?.destroy?.();
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

    /** Dossier buttons and voice hooks land here. */
    flyToSite(id) {
      const row = _rowById.get(id ?? _selectedId);
      return row ? flyToCampus(row) : false;
    },
    zoomOutFromSite(id) {
      const row = _rowById.get(id ?? _selectedId);
      return row ? zoomOut(row) : false;
    },
    stepSite(delta) {
      step(Number.isFinite(delta) ? Math.sign(delta) || 1 : 1);
    },
    selectSite(id) {
      selectById(id);
    },
    clearSite() {
      clearSelection();
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
        selectedId: _selectedId,
        hoverId: _hoverId,
        dossierOpen: Boolean(dossier?.isOpen?.()),
        totalItPowerMw: _rows.reduce((sum, r) => sum + (r.itPowerMw || 0), 0),
      };
    },
  };
  return layer;
}
