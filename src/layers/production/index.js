import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { horizonOccluder } from '../../data/iconOrientation.js';
import {
  GULF_FLY_DURATION_S,
  GULF_FLY_FROM_HEIGHT_M,
  GULF_FLY_TO_HEIGHT_M,
  GULF_HOVER_THROTTLE_MS,
  GULF_LAYER_ID,
  GULF_OVERLAY_COHORT_LIMIT,
  GULF_OVERLAY_COLLISION_CAPACITY,
  GULF_OVERLAY_SOURCE_ID,
  GULF_TIER_GLOBAL,
  GULF_ZOOM_OUT_HEIGHT_M,
  buildHoverPlatformCard,
  buildSelectedPlatformCard,
  createPlatformOverlayEntry,
  detailTierForHeight,
  legendEntries,
  markerPixelSize,
  markerStyle,
  selectPlatformOverlayCohort,
} from './model.js';
import { gulfMetaLine, mapAnalystRecord, platformStamp } from './records.js';
export * from './model.js';
export * from './records.js';
export * from './completeness.js';
export { createBundledGulfSource } from './bundledSource.js';
export { buildGulfDossierModel, createGulfDossier } from './dossier.js';

/** The bundle never changes at runtime; the poll is the manager's formality. */
const UPDATE_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Own the Gulf of Mexico platform display. Every installed structure is a
 * pinned point sized by its gas in the newest complete reporting month and
 * coloured by its change against the same month a year earlier; hovering
 * raises the point and shows its card at any depth; clicking opens the
 * dossier drawer and, from far away, flies the camera down to the platform.
 * The dossier's buttons come back here as fly, zoom-out, previous and next.
 */
export function createGulfPlatformsLayer({
  source,
  overlayHost,
  context,
  dossier = null,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Gulf platforms require a snapshot source');
  if (!overlayHost)
    throw new TypeError('Gulf platforms require an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Gulf platforms require context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError(
      'Gulf platforms require a screen-space handler factory',
    );

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _handler = null;
  let _removeMoveStart = null;
  let _removeMoveEnd = null;
  let _horizonCullRemovers = [];
  let _foreignSelectionListener = null;
  let _snapshot = null;
  let _rows = [];
  let _entries = [];
  let _selectedId = null;
  let _hoverId = null;
  let _hoverLastPickAt = 0;
  let _cameraMoving = false;
  let _lastUpdate = null;
  let _lastError = null;
  let _tier = GULF_TIER_GLOBAL;
  let _enabled = false;
  const _rowById = new Map();
  const _positionById = new Map();
  /** Pinned entity per structure id: `{ marker, visible }`. */
  const _pinsById = new Map();

  function cameraHeight() {
    return _viewer?.camera?.positionCartographic?.height;
  }

  function currentTier() {
    return detailTierForHeight(cameraHeight());
  }

  function pixelSizeFor(row, hovered) {
    return markerPixelSize(row, _snapshot?.gasMaxMcfd ?? 0, {
      tier: _tier,
      hovered,
    });
  }

  function applyTierToPins() {
    for (const [id, pin] of _pinsById) {
      const row = _rowById.get(id);
      if (!row) continue;
      pin.marker.point.pixelSize = pixelSizeFor(row, _hoverId === id);
    }
  }

  /* ---------------------------------------------------------------- *
   * Overlay
   * ---------------------------------------------------------------- */

  function rebuildEntries() {
    const entries = [];
    for (const row of _rows) {
      const entry = createPlatformOverlayEntry(
        row,
        _positionById.get(row.id),
        _tier,
      );
      if (entry) entries.push(entry);
    }
    _entries = selectPlatformOverlayCohort(entries, GULF_OVERLAY_COHORT_LIMIT);
  }

  function publishOverlay() {
    if (!_enabled) return;
    const entries = _entries.filter(
      (entry) => entry.id !== _selectedId && entry.id !== _hoverId,
    );
    const hovered =
      _hoverId && _hoverId !== _selectedId ? _rowById.get(_hoverId) : null;
    if (hovered)
      entries.push(
        buildHoverPlatformCard(hovered, _positionById.get(hovered.id)),
      );
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    if (selected)
      entries.push(
        buildSelectedPlatformCard(selected, _positionById.get(selected.id)),
      );
    overlayHost.setEntries(GULF_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: GULF_OVERLAY_COHORT_LIMIT + 2,
      collisionCapacity: GULF_OVERLAY_COLLISION_CAPACITY + 2,
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
   * Camera and the horizon
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

  /**
   * Hide the points that sit beyond the ellipsoid horizon. They are
   * always-on-top (`disableDepthTestDistance: INFINITY`) and nothing writes
   * far-side depth, so without this pass every platform on the far side of
   * the planet would shine through it — the same leak the chokepoints and
   * ports layers closed with the same occluder.
   */
  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.()) return;
    const occluder = horizonOccluder(_viewer.camera);
    for (const [id, pin] of _pinsById) {
      const visible = occluder.isPointVisible(_positionById.get(id)) === true;
      // Assigning `show` rebuilds a ConstantProperty, so only write on a flip.
      if (pin.visible === visible) continue;
      pin.marker.point.show = visible;
      pin.visible = visible;
    }
  }

  function installHorizonCulling(viewer) {
    if (_horizonCullRemovers.length || !viewer?.camera) return;
    // Event-driven: the pins never move, so only the camera can flip which
    // side of the planet a platform is on. `changed` catches a programmatic
    // `setView`, which raises no move events.
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

  /** Fly straight down onto a platform; the caller decides the height. */
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
      duration: GULF_FLY_DURATION_S,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
    return true;
  }

  function flyToPlatform(row) {
    return flyTo(row, GULF_FLY_TO_HEIGHT_M);
  }

  function zoomOut(row) {
    return flyTo(row, GULF_ZOOM_OUT_HEIGHT_M);
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
      pin.marker.point.pixelSize = pixelSizeFor(row, pinId === id);
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas?.style) canvas.style.cursor = id ? 'pointer' : '';
    publishOverlay();
  }

  function pickedPlatformId(picked) {
    return picked?.id?.__gulfPlatformId ?? null;
  }

  function handleHoverMove(position) {
    if (!_enabled || _cameraMoving || !position || !_viewer) return;
    if (!isPointerFree()) {
      if (_hoverId) setHover(null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < GULF_HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    setHover(pickedPlatformId(picked));
  }

  /* ---------------------------------------------------------------- *
   * Selection
   * ---------------------------------------------------------------- */

  function openDossier(row) {
    if (!dossier?.show) return;
    dossier.show(row, { snapshot: _snapshot });
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
    const far = !Number.isFinite(height) || height > GULF_FLY_FROM_HEIGHT_M;
    if (fly === 'always' || (fly === 'auto' && far)) flyToPlatform(row);
  }

  function clearSelection({ publish = true } = {}) {
    closeDossier();
    if (!_selectedId) return;
    _selectedId = null;
    if (_viewer?.selectedEntity?.__gulfPlatformId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(GULF_LAYER_ID);
    if (publish) publishOverlay();
  }

  /** ◂ / ▸ in the dossier: walk the producers by rank and fly to each. */
  function step(delta) {
    const ranked = _rows.filter((row) => row.producing);
    if (!ranked.length) return;
    const index = ranked.findIndex((row) => row.id === _selectedId);
    const next =
      ((index < 0 ? 0 : index + delta) + ranked.length) % ranked.length;
    selectById(ranked[next].id, { fly: 'always' });
  }

  /** Another layer took the selection: our card and dossier step aside. */
  function onForeignSelection(event) {
    const layerId = event?.detail?.layerId;
    if (!_selectedId || layerId === GULF_LAYER_ID) return;
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
      const id = pickedPlatformId(picked);
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
      id: `${GULF_LAYER_ID}:${row.id}`,
      layerId: GULF_LAYER_ID,
      layerName: layer.name,
      source: 'BSEE',
      dataSource: _dataSource,
      label: `${row.name} · ${row.areaBlock ?? ''} · ${row.observation.headline} · ${platformStamp(row)}`,
      latitude: row.lat,
      longitude: row.lon,
      properties: mapAnalystRecord(row),
    });
  }

  /** Create every structure's pinned point once from the snapshot. */
  function createPins(rows) {
    for (const row of rows) {
      if (_pinsById.has(row.id)) continue;
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
      const style = markerStyle(row);
      const marker = new Cesium.Entity({
        id: `gulf-platform:${row.id}`,
        position,
        point: {
          pixelSize: pixelSizeFor(row, false),
          color: Cesium.Color.fromCssColorString(style.fillCss).withAlpha(
            style.fillAlpha,
          ),
          outlineColor: Cesium.Color.fromCssColorString(
            style.outlineCss,
          ).withAlpha(style.outlineAlpha),
          outlineWidth: row.producing ? 2 : 1,
          // Pinned at the ellipsoid so a marker never re-seats itself as
          // terrain tiles refine; the disabled depth test keeps it visible.
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          gulfPlatformId: row.id,
          name: row.name,
          ...mapAnalystRecord(row),
        },
      });
      marker.__gulfPlatformId = row.id;
      _dataSource.entities.add(marker);
      _pinsById.set(row.id, { marker, visible: true });
      _rowById.set(row.id, row);
      _positionById.set(row.id, position);
      registerContext(marker, row);
    }
  }

  const layer = {
    id: GULF_LAYER_ID,
    name: 'Gas · Gulf Platforms (BSEE)',
    icon: '🛢',
    source: 'BSEE',
    freshnessClass: 'published',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer)
        throw new Error('Gulf platform layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(GULF_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _entries = [];
      _selectedId = null;
      _hoverId = null;
      _lastUpdate = null;
      _lastError = null;
      _snapshot = null;
      _tier = GULF_TIER_GLOBAL;
      _enabled = false;
      overlayHost.setVisible(GULF_OVERLAY_SOURCE_ID, false);
      console.log('[Data:GulfPlatforms] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(GULF_OVERLAY_SOURCE_ID, true);
      installHandlers(viewer);
      installCameraListeners(viewer);
      installHorizonCulling(viewer);
      refreshTier({ force: true });
    },

    disable() {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeHandlers();
      removeCameraListeners();
      removeHorizonCulling();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(GULF_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(GULF_OVERLAY_SOURCE_ID, false);
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      // A static bundle: read once, then restyle only. `true`, not `false`:
      // the data manager treats a false update as a rejected enable and runs
      // the disable cleanup, so a second enable used to leave the marks
      // hidden (found by the onshore QA's disable/enable pass, 2026-09-21).
      if (_snapshot) return true;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : null;
        if (!rows) throw new Error('Malformed Gulf platforms snapshot');
        _snapshot = snapshot;
        createPins(rows);
        _rows = rows;
        _lastUpdate = Date.now();
        _lastError = null;
        refreshTier({ force: true });
        refreshHorizonCulling();
        console.log(
          `[Data:GulfPlatforms] Updated: ${snapshot.counts.producing} producing of ${rows.length} installed structures (${snapshot.asOf})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:GulfPlatforms] Load error:', e);
        _lastError = e?.message || 'Gulf platforms bundle unavailable';
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
      removeHorizonCulling();
      dossier?.destroy?.();
      overlayHost.clearSource(GULF_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(GULF_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(GULF_LAYER_ID);
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
    flyToPlatform(id) {
      const row = _rowById.get(id ?? _selectedId);
      return row ? flyToPlatform(row) : false;
    },
    zoomOutFromPlatform(id) {
      const row = _rowById.get(id ?? _selectedId);
      return row ? zoomOut(row) : false;
    },
    stepPlatform(delta) {
      step(Number.isFinite(delta) ? Math.sign(delta) || 1 : 1);
    },
    selectPlatform(id) {
      selectById(id);
    },
    clearPlatform() {
      clearSelection();
    },

    /** The panel row's colour legend: one swatch per change class with its count. */
    getRowControls() {
      return { chips: [], legend: legendEntries(_snapshot) };
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
      const counts = _snapshot?.counts ?? null;
      return {
        // The count the panel prints is producing platforms; the meta line
        // carries the rest (R11.11).
        count: counts?.producing ?? 0,
        countLabel: counts ? `${counts.producing} producing` : null,
        installed: counts?.installed ?? 0,
        drawn: _rows.length,
        gasMcfdTotal: counts?.gasMcfdTotal ?? 0,
        gasMcfdFiled: counts?.gasMcfdFiled ?? 0,
        outOfRegion: counts?.outOfRegion ?? [],
        currentMonth: _snapshot?.currentMonth ?? null,
        completeness: _snapshot?.completeness?.table ?? [],
        asOf: _snapshot?.asOf ?? null,
        vintage: _snapshot?.retrieved ?? null,
        freshnessClass: 'published',
        source: gulfMetaLine(_snapshot),
        lastUpdate: _lastUpdate,
        error: _lastError,
        tier: _tier,
        selectedId: _selectedId,
        hoverId: _hoverId,
        dossierOpen: Boolean(dossier?.isOpen?.()),
      };
    },
  };
  return layer;
}
