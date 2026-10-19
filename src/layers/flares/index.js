import * as Cesium from 'cesium';
import { horizonOccluder } from '../../data/iconOrientation.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { isEmptySpacePick } from '../commodities/emptyPick.js';
import {
  FLARES_FLY_DURATION_S,
  FLARES_HOVER_THROTTLE_MS,
  FLARES_LAYER_ID,
  FLARES_OVERLAY_COHORT_LIMIT,
  FLARES_OVERLAY_COLLISION_CAPACITY,
  FLARES_OVERLAY_SOURCE_ID,
  FLARES_TIER_GLOBAL,
  FLARES_TIER_REGIONAL,
  FLARES_ZOOM_TO_REGION_HEIGHT_M,
  PIP_PX,
  PIP_STYLE,
  REGION_MARK_PX,
  RING_PX,
  RING_STYLE,
  buildHoverSiteCard,
  buildSelectedSiteCard,
  createLitSiteOverlayEntry,
  createRegionOverlayEntry,
  detailTierForHeight,
  flareColor,
  flarePosition,
  legendEntries,
  litLine,
  litPixelSize,
  nightStamp,
  selectOverlayCohort,
  siteTitle,
} from './model.js';
import { mapAnalystRecord } from './records.js';
export * from './model.js';
export * from './records.js';
export { createFlaresSource, FLARES_ROUTE, FLARES_REGION } from './source.js';

/**
 * The provider refreshes its upstream files every 30 minutes and a new night
 * lands once a day; the poll only ever reads the proxy's cache between those.
 */
const UPDATE_INTERVAL_MS = 30 * 60_000;

/**
 * Own the flare marks (docs/COMMODITIES-PLAN.md §17, FR-F6): at global depth
 * one mark and card for the region; at regional depth every bundled site as
 * a point primitive — lit sites on the last clear night sized by FRP and
 * coloured by nights lit in the last 30 clear nights, unlit sites as faint
 * rings, unlisted-well and other heat as grey pips. Geometry is pinned: the
 * sites never move, a refresh only restyles them; the pips are the only
 * marks rebuilt per night.
 */
export function createFlaresLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Flares requires a snapshot source');
  if (!overlayHost) throw new TypeError('Flares requires an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Flares requires context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('Flares requires a screen-space handler factory');

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _points = null;
  let _pips = null;
  let _handler = null;
  let _removeMoveStart = null;
  let _removeMoveEnd = null;
  let _horizonCullRemovers = [];
  let _foreignSelectionListener = null;
  let _snapshot = null;
  let _entries = [];
  let _selectedId = null;
  let _hover = null;
  let _hoverLastPickAt = 0;
  let _cameraMoving = false;
  let _lastUpdate = null;
  let _lastError = null;
  let _tier = FLARES_TIER_GLOBAL;
  let _enabled = false;
  let _regionPin = null;
  const _rowById = new Map();
  /** Point primitive and fixed position per site id, created once. */
  const _sitePoints = new Map();
  const _sitePositions = new Map();
  /** Context records for sites are registered on selection, never for all 7,493. */
  const _siteContexts = new Map();

  function cameraHeight() {
    return _viewer?.camera?.positionCartographic?.height;
  }

  function currentTier() {
    return detailTierForHeight(cameraHeight());
  }

  /* ---------------------------------------------------------------- *
   * Marks
   * ---------------------------------------------------------------- */

  function cssColor(css, alpha) {
    return Cesium.Color.fromCssColorString(css).withAlpha(alpha);
  }

  function sitePointStyle(row, hovered) {
    if (row.lit)
      return {
        pixelSize: litPixelSize(row.maxFrp, _snapshot?.frpMax ?? 0, {
          hovered,
        }),
        color: flareColor(row, _snapshot?.clearNights ?? 0),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
        outlineWidth: 1,
      };
    return {
      pixelSize: hovered ? RING_PX + 2 : RING_PX,
      color: cssColor(RING_STYLE.fillCss, RING_STYLE.fillAlpha),
      outlineColor: cssColor(RING_STYLE.outlineCss, RING_STYLE.outlineAlpha),
      outlineWidth: 1,
    };
  }

  function registerRegionContext(marker, snapshot) {
    context.registerEntityContext(marker, {
      id: `${FLARES_LAYER_ID}:region:${snapshot.region.id}`,
      layerId: FLARES_LAYER_ID,
      layerName: layer.name,
      source: snapshot.source || 'NASA FIRMS VIIRS NRT',
      dataSource: _dataSource,
      label: `${snapshot.regionName} · ${snapshot.displayNight?.litSites ?? 0} sites lit · ${nightStamp(snapshot)}`,
      latitude: snapshot.region.center.lat,
      longitude: snapshot.region.center.lon,
      properties: {
        litSites: snapshot.displayNight?.litSites ?? 0,
        siteFrpMw: snapshot.displayNight?.siteFrpMw ?? 0,
        night: snapshot.displayNight?.night ?? null,
        cloud: snapshot.displayNight?.cloud?.state ?? null,
      },
    });
  }

  function registerSiteContext(row) {
    let pseudo = _siteContexts.get(row.id);
    if (pseudo) return pseudo;
    // A point primitive is not an entity; the store only needs an object
    // that carries the context id and a `show` it can read.
    pseudo = { id: `flare-site:${row.id}`, show: true };
    context.registerEntityContext(pseudo, {
      id: `${FLARES_LAYER_ID}:site:${row.id}`,
      layerId: FLARES_LAYER_ID,
      layerName: layer.name,
      source: _snapshot?.source || 'NASA FIRMS VIIRS NRT',
      dataSource: _dataSource,
      label: `${siteTitle(row)} · ${litLine(row)} · ${nightStamp(_snapshot)}`,
      latitude: row.lat,
      longitude: row.lon,
      properties: mapAnalystRecord(row),
    });
    _siteContexts.set(row.id, pseudo);
    return pseudo;
  }

  /** The region's one mark, as an entity, created with the first snapshot. */
  function createRegionPin(snapshot) {
    const center = snapshot.region.center;
    if (
      _regionPin ||
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.lon)
    )
      return;
    const position = Cesium.Cartesian3.fromDegrees(center.lon, center.lat);
    const marker = new Cesium.Entity({
      id: `flares-region:${snapshot.region.id}`,
      position,
      point: {
        pixelSize: REGION_MARK_PX,
        color: cssColor('#ffb347', 0.9),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
        outlineWidth: 2,
        // Pinned at the ellipsoid so the mark never re-seats itself as
        // terrain tiles refine; the disabled depth test keeps it visible.
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: {
        flareRegionId: snapshot.region.id,
        name: snapshot.regionName,
      },
    });
    marker.__flareRegionId = snapshot.region.id;
    _dataSource.entities.add(marker);
    _regionPin = { marker, position, visible: true };
    registerRegionContext(marker, snapshot);
  }

  /**
   * Every site as a point primitive, created once on the first visit to the
   * regional tier so activation stays cheap: 7,493 points in one collection
   * are one draw call. Positions never change; a refresh only restyles.
   */
  function ensureSitePoints() {
    if (_points || !_viewer?.scene?.primitives || !_snapshot) return;
    _points = new Cesium.PointPrimitiveCollection();
    _points.show = false;
    _viewer.scene.primitives.add(_points);
    for (const row of _snapshot.rows) {
      const position = flarePosition(row);
      const style = sitePointStyle(row, false);
      const point = _points.add({
        id: Object.freeze({ flareSiteId: row.id }),
        position,
        ...style,
        // Pinned (§2.2): never CLAMP_TO_GROUND; the disabled depth test
        // keeps a mark drawn where terrain sits above the ellipsoid.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false,
      });
      _sitePoints.set(row.id, point);
      _sitePositions.set(row.id, position);
    }
  }

  /** Restyle every site point from the current snapshot (a new night landed). */
  function restyleSitePoints() {
    if (!_points || !_snapshot) return;
    for (const row of _snapshot.rows) {
      const point = _sitePoints.get(row.id);
      if (!point) continue;
      const hovered = _hover?.id === row.id;
      const style = sitePointStyle(row, hovered);
      point.pixelSize = style.pixelSize;
      point.color = style.color;
      point.outlineColor = style.outlineColor;
      point.outlineWidth = style.outlineWidth;
    }
  }

  /** The display night's unmatched heat; the only marks rebuilt per night. */
  function rebuildPips() {
    if (!_viewer?.scene?.primitives || !_snapshot) return;
    if (!_pips) {
      _pips = new Cesium.PointPrimitiveCollection();
      _pips.show = false;
      _viewer.scene.primitives.add(_pips);
    }
    _pips.removeAll();
    for (const pip of _snapshot.displayNight?.pips ?? []) {
      const style = PIP_STYLE[pip.kind] ?? PIP_STYLE.other;
      _pips.add({
        position: Cesium.Cartesian3.fromDegrees(pip.lon, pip.lat),
        pixelSize: PIP_PX,
        color: cssColor(style.css, style.alpha),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
      });
    }
  }

  function applyTier() {
    if (_regionPin) {
      const visible = _tier === FLARES_TIER_GLOBAL;
      if (_regionPin.visible !== visible) {
        _regionPin.marker.point.show = visible;
        _regionPin.visible = visible;
      }
    }
    if (_tier === FLARES_TIER_REGIONAL) ensureSitePoints();
    const sitesOn = _tier === FLARES_TIER_REGIONAL;
    if (_points) {
      if (_points.show !== sitesOn) _points.show = sitesOn;
      if (sitesOn)
        for (let i = 0; i < _points.length; i += 1) {
          const point = _points.get(i);
          if (!point.show) point.show = true;
        }
    }
    if (_pips && _pips.show !== sitesOn) _pips.show = sitesOn;
    refreshHorizonCulling();
  }

  /* ---------------------------------------------------------------- *
   * Overlay
   * ---------------------------------------------------------------- */

  function rebuildEntries() {
    if (!_snapshot) {
      _entries = [];
      return;
    }
    const entries = [];
    if (_tier === FLARES_TIER_GLOBAL) {
      if (_regionPin)
        entries.push(createRegionOverlayEntry(_snapshot, _regionPin.position));
    } else {
      for (const row of _snapshot.rows) {
        if (!row.lit) continue;
        const position = _sitePositions.get(row.id);
        if (!position) continue;
        const entry = createLitSiteOverlayEntry(
          row,
          position,
          _snapshot.clearNights,
        );
        if (entry) entries.push(entry);
      }
    }
    _entries = selectOverlayCohort(entries);
  }

  function publishOverlay() {
    if (!_enabled) return;
    const hoverEntryId = _hover ? `site:${_hover.id}` : null;
    const selectedEntryId = _selectedId ? `site:${_selectedId}` : null;
    const entries = _entries.filter(
      (entry) => entry.id !== hoverEntryId && entry.id !== selectedEntryId,
    );
    if (_hover && _hover.id !== _selectedId) {
      const row = _rowById.get(_hover.id);
      const position = _sitePositions.get(_hover.id);
      if (row && position)
        entries.push(buildHoverSiteCard(row, position, _snapshot));
    }
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    const selectedPosition = _selectedId
      ? _sitePositions.get(_selectedId)
      : null;
    if (selected && selectedPosition)
      entries.push(buildSelectedSiteCard(selected, selectedPosition, _snapshot));
    overlayHost.setEntries(FLARES_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: FLARES_OVERLAY_COHORT_LIMIT + 2,
      collisionCapacity: FLARES_OVERLAY_COLLISION_CAPACITY + 2,
      moving: false,
    });
  }

  function refreshTier({ force = false } = {}) {
    const tier = currentTier();
    if (!force && tier === _tier) return;
    _tier = tier;
    applyTier();
    rebuildEntries();
    publishOverlay();
  }

  /* ---------------------------------------------------------------- *
   * Camera and the horizon
   * ---------------------------------------------------------------- */

  function onCameraMoveStart() {
    _cameraMoving = true;
    if (_hover) setHover(null);
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
   * Hide the region mark beyond the ellipsoid horizon: it is always-on-top
   * and nothing writes far-side depth. Site points and pips show only at the
   * regional tier, where the far side is never in view.
   */
  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.() || !_regionPin)
      return;
    const occluder = horizonOccluder(_viewer.camera);
    const visible =
      _tier === FLARES_TIER_GLOBAL &&
      occluder.isPointVisible(_regionPin.position) === true;
    // Assigning `show` rebuilds a ConstantProperty, so only write on a flip.
    if (_regionPin.visible !== visible) {
      _regionPin.marker.point.show = visible;
      _regionPin.visible = visible;
    }
  }

  function installHorizonCulling(viewer) {
    if (_horizonCullRemovers.length || !viewer?.camera) return;
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

  function zoomToRegion() {
    const center = _snapshot?.region?.center;
    if (!center || !_viewer || _viewer.isDestroyed?.()) return false;
    if (!isPointerFree()) return false;
    const camera = _viewer.camera;
    _viewer.trackedEntity = undefined;
    camera.cancelFlight?.();
    camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        center.lon,
        center.lat,
        FLARES_ZOOM_TO_REGION_HEIGHT_M,
      ),
      orientation: {
        heading: camera.heading,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
      duration: FLARES_FLY_DURATION_S,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Hover and selection
   * ---------------------------------------------------------------- */

  function setHover(next) {
    const same =
      (next === null && _hover === null) ||
      (next && _hover && next.id === _hover.id);
    if (same) return;
    const previous = _hover;
    _hover = next;
    for (const target of [previous, next]) {
      if (!target) continue;
      const point = _sitePoints.get(target.id);
      const row = _rowById.get(target.id);
      if (!point || !row) continue;
      const style = sitePointStyle(row, next?.id === target.id);
      point.pixelSize = style.pixelSize;
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas?.style) canvas.style.cursor = next ? 'pointer' : '';
    publishOverlay();
  }

  /** What a pick landed on: a site point, the region mark, or nothing. */
  function pickedTarget(picked) {
    if (!picked) return null;
    const id = picked.id;
    if (id?.flareSiteId !== undefined && _rowById.has(id.flareSiteId))
      return { kind: 'site', id: id.flareSiteId };
    if (id?.__flareRegionId !== undefined)
      return { kind: 'region', id: id.__flareRegionId };
    return null;
  }

  function handleHoverMove(position) {
    if (!_enabled || _cameraMoving || !position || !_viewer) return;
    if (!isPointerFree()) {
      if (_hover) setHover(null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < FLARES_HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    const target = pickedTarget(picked);
    setHover(target?.kind === 'site' ? target : null);
  }

  function selectById(id) {
    const row = _rowById.get(id);
    if (!row) return;
    _selectedId = id;
    context.selectEntityContext(registerSiteContext(row));
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selectedId) return;
    _selectedId = null;
    context.clearSelectedEntityContextForLayer(FLARES_LAYER_ID);
    if (publish) publishOverlay();
  }

  /** Another layer took the selection: our card steps aside. */
  function onForeignSelection(event) {
    const layerId = event?.detail?.layerId;
    if (!_selectedId || layerId === FLARES_LAYER_ID) return;
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
      const target = pickedTarget(picked);
      if (target?.kind === 'site') {
        selectById(target.id);
        return;
      }
      if (target?.kind === 'region') {
        zoomToRegion();
        return;
      }
      // A pick that belongs to a sibling layer is not empty space; the
      // 3D-tiles basemap (a pick with no id) is (emptyPick.js, #74).
      if (!isEmptySpacePick(picked)) return;
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

  const layer = {
    id: FLARES_LAYER_ID,
    name: 'Gas flares · nightly heat',
    icon: '🔥',
    source: 'NASA FIRMS VIIRS NRT',
    freshnessClass: 'daily',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Flares layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(FLARES_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _snapshot = null;
      _entries = [];
      _selectedId = null;
      _hover = null;
      _lastUpdate = null;
      _lastError = null;
      _tier = FLARES_TIER_GLOBAL;
      _enabled = false;
      overlayHost.setVisible(FLARES_OVERLAY_SOURCE_ID, false);
      console.log('[Data:Flares] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(FLARES_OVERLAY_SOURCE_ID, true);
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
      if (_points) _points.show = false;
      if (_pips) _pips.show = false;
      overlayHost.clearSource(FLARES_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(FLARES_OVERLAY_SOURCE_ID, false);
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
        if (!Array.isArray(snapshot?.rows))
          throw new Error('Malformed flares snapshot');
        _snapshot = snapshot;
        _rowById.clear();
        for (const row of snapshot.rows) _rowById.set(row.id, row);
        createRegionPin(snapshot);
        restyleSitePoints();
        rebuildPips();
        // A selected site keeps its card through a refresh; the row object
        // under it was just replaced, so re-publish below redraws it.
        _lastUpdate = Date.now();
        _lastError = null;
        refreshTier({ force: true });
        console.log(
          `[Data:Flares] Updated: ${snapshot.displayNight?.litSites ?? 0} sites lit of ${snapshot.rows.length} on ${snapshot.displayNight?.night ?? 'no night'} (${snapshot.displayNight?.cloud?.state ?? 'n/a'})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Flares] Fetch error:', e);
        _lastError = e?.message || 'Flare detections unavailable';
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
      overlayHost.clearSource(FLARES_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(FLARES_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(FLARES_LAYER_ID);
      if (_points) {
        viewer?.scene?.primitives?.remove(_points);
        _points = null;
      }
      if (_pips) {
        viewer?.scene?.primitives?.remove(_pips);
        _pips = null;
      }
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _snapshot = null;
      _entries = [];
      _regionPin = null;
      _rowById.clear();
      _sitePoints.clear();
      _sitePositions.clear();
      _siteContexts.clear();
      _lastUpdate = null;
      _lastError = null;
    },

    /** Voice and QA hooks. */
    selectSite(id) {
      selectById(id);
    },
    clearSite() {
      clearSelection();
    },
    zoomToRegion() {
      return zoomToRegion();
    },

    /** The panel row's colour legend: the persistence ramp with counts. */
    getRowControls() {
      return { chips: [], legend: legendEntries(_snapshot) };
    },

    /** Plain records for the analyst query engine; empty while hidden. */
    getAnalystRecords(maxCount = 64) {
      if (!_dataSource || !_dataSource.show || !_snapshot) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 64;
      return _snapshot.rows
        .filter((row) => row.lit)
        .sort((a, b) => b.maxFrp - a.maxFrp)
        .slice(0, limit)
        .map(mapAnalystRecord);
    },

    getStats() {
      const night = _snapshot?.displayNight ?? null;
      return {
        count: night?.litSites ?? 0,
        countLabel: night ? `${night.litSites} lit` : null,
        pinned: _snapshot?.rows.length ?? 0,
        drawn: { sites: _sitePoints.size, pips: _pips?.length ?? 0 },
        night: night?.night ?? null,
        cloud: night?.cloud?.state ?? null,
        suspect: night?.suspect ?? false,
        isClear: night?.isClear ?? false,
        litSites: night?.litSites ?? 0,
        siteFrpMw: night?.siteFrpMw ?? 0,
        counts: night?.counts ?? null,
        nightsServed: _snapshot?.nights.length ?? 0,
        clearNights: _snapshot?.clearNights ?? 0,
        baseline: _snapshot?.baseline ?? null,
        asOf: night ? nightStamp(_snapshot) : null,
        retrievedAt: _snapshot?.retrievedAt ?? null,
        freshnessClass: 'daily',
        source: 'NASA FIRMS VIIRS NRT',
        lastUpdate: _lastUpdate,
        error: _lastError,
        tier: _tier,
        selectedId: _selectedId,
        hoverId: _hover?.id ?? null,
        // The global-tier region card as published to the overlay.
        regionCard:
          _entries.find((entry) => String(entry.id).startsWith('region:'))
            ?.details ?? null,
      };
    },
  };
  return layer;
}
