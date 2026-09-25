import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { horizonOccluder } from '../../data/iconOrientation.js';
import {
  ONSHORE_FLY_DURATION_S,
  ONSHORE_FLY_FROM_HEIGHT_M,
  ONSHORE_FLY_TO_FIELD_HEIGHT_M,
  ONSHORE_FLY_TO_WELL_HEIGHT_M,
  ONSHORE_HOVER_THROTTLE_MS,
  ONSHORE_MAX_POINTS_IN_VIEW,
  ONSHORE_OVERLAY_COHORT_LIMIT,
  ONSHORE_OVERLAY_COLLISION_CAPACITY,
  ONSHORE_TIER_GLOBAL,
  ONSHORE_TIER_LOCAL,
  ONSHORE_TIER_REGIONAL,
  ONSHORE_ZOOM_OUT_HEIGHT_M,
  REGION_MARK_PX,
  YOY_CSS,
  buildHoverClusterCard,
  buildHoverWellCard,
  buildSelectedWellCard,
  clusterPixelSize,
  createClusterOverlayEntry,
  createRegionOverlayEntry,
  createWellOverlayEntry,
  detailTierForHeight,
  facilitiesInRectangle,
  legendEntries,
  markerStyle,
  padRectangle,
  selectOverlayCohort,
  wellPixelSize,
} from './model.js';
import {
  facilityStamp,
  mapAnalystRecord,
  mapClusterAnalystRecord,
  onshoreMetaLine,
} from './records.js';
import {
  basinWeatherLine,
  currentBasinReading,
  pickBasinReading,
} from './basinWeather.js';
export * from './model.js';
export * from './records.js';
export * from './shards.js';
export {
  createBundledOnshoreSource,
  ONSHORE_REGION_IDS,
} from './bundledSource.js';
export { buildOnshoreDossierModel, createOnshoreDossier } from './dossier.js';
export * from './basinWeather.js';

/** The bundle never changes at runtime; the poll is the manager's formality. */
const UPDATE_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Own one onshore region's display (docs/COMMODITIES-PLAN.md §14, R12.5):
 * at global depth one mark and card for the region; at regional depth a
 * pinned mark per field sized by its gas in the newest complete month and
 * coloured by its change against a year earlier, labels for the largest;
 * at local depth every well as a point primitive — never an entity: row 11
 * measured ~0.45 ms per entity, and a region has tens of thousands of wells
 * — clipped to the view, labels for the largest in view, a hover card for
 * any point, and a click that opens the dossier and fetches the well's
 * history shard. The dossier's buttons come back here as fly, zoom-out,
 * previous and next.
 */
export function createOnshoreLayer({
  region,
  source,
  shards = null,
  overlayHost,
  context,
  dossier = null,
  basinWeather = null,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (!region?.id || !region?.layerId)
    throw new TypeError('Onshore layer requires a region with id and layerId');
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Onshore layer requires a snapshot source');
  if (!overlayHost)
    throw new TypeError('Onshore layer requires an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Onshore layer requires context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError(
      'Onshore layer requires a screen-space handler factory',
    );

  const LAYER_ID = region.layerId;
  const OVERLAY_SOURCE_ID = region.layerId;

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _points = null;
  let _handler = null;
  let _removeMoveStart = null;
  let _removeMoveEnd = null;
  let _horizonCullRemovers = [];
  let _foreignSelectionListener = null;
  let _snapshot = null;
  // Row 13 M3: the Oil Oracle store's reading for this region's basin
  let _basinReading = null;
  let _weatherRequest = null;
  let _weatherWarned = false;
  let _rows = [];
  let _fields = [];
  let _entries = [];
  let _selectedId = null;
  let _hover = null;
  let _hoverLastPickAt = 0;
  let _cameraMoving = false;
  let _lastUpdate = null;
  let _lastError = null;
  let _tier = ONSHORE_TIER_GLOBAL;
  let _enabled = false;
  let _historyState = 'idle';
  let _pointsShown = 0;
  let _regionPin = null;
  const _rowById = new Map();
  const _fieldById = new Map();
  /** Pinned entity per field id: `{ marker, position, visible }`. */
  const _fieldPins = new Map();
  /** Point primitive per well id, created on the first visit to the local tier. */
  const _wellPoints = new Map();
  const _wellPositions = new Map();
  /** Context records for wells are registered on selection, never for all 20,000. */
  const _wellContexts = new Map();

  function cameraHeight() {
    return _viewer?.camera?.positionCartographic?.height;
  }

  function currentTier() {
    return detailTierForHeight(cameraHeight());
  }

  /** The camera's view rectangle in degrees, padded, or null when it looks past the globe. */
  function viewRectangle() {
    const camera = _viewer?.camera;
    const ellipsoid = _viewer?.scene?.globe?.ellipsoid;
    if (!camera?.computeViewRectangle || !ellipsoid) return null;
    const rect = camera.computeViewRectangle(ellipsoid);
    if (!rect) return null;
    return padRectangle({
      west: Cesium.Math.toDegrees(rect.west),
      south: Cesium.Math.toDegrees(rect.south),
      east: Cesium.Math.toDegrees(rect.east),
      north: Cesium.Math.toDegrees(rect.north),
    });
  }

  /* ---------------------------------------------------------------- *
   * Marks
   * ---------------------------------------------------------------- */

  function pointColor(css, alpha) {
    return Cesium.Color.fromCssColorString(css).withAlpha(alpha);
  }

  function fieldPixelSize(field, hovered) {
    return clusterPixelSize(field, _snapshot?.counts?.clusterGasMaxMcfd ?? 0, {
      hovered,
    });
  }

  function wellSize(row, hovered) {
    return wellPixelSize(row, _snapshot?.gasMaxMcfd ?? 0, { hovered });
  }

  function registerFieldContext(marker, field) {
    context.registerEntityContext(marker, {
      id: `${LAYER_ID}:field:${field.id}`,
      layerId: LAYER_ID,
      layerName: layer.name,
      source: _snapshot?.sourceName ?? 'state filings',
      dataSource: _dataSource,
      label: `${field.name} field · ${field.producing} wells producing · ${_snapshot?.asOf ?? ''}`,
      latitude: field.lat,
      longitude: field.lon,
      properties: mapClusterAnalystRecord(field, 'field'),
    });
  }

  function registerWellContext(row) {
    let pseudo = _wellContexts.get(row.id);
    if (pseudo) return pseudo;
    // A point primitive is not an entity; the store only needs an object
    // that carries the context id and a `show` it can read.
    pseudo = { id: `onshore-well:${row.id}`, show: true };
    context.registerEntityContext(pseudo, {
      id: `${LAYER_ID}:well:${row.id}`,
      layerId: LAYER_ID,
      layerName: layer.name,
      source: _snapshot?.sourceName ?? 'state filings',
      dataSource: _dataSource,
      label: `${row.name} · ${row.field ?? ''} · ${row.observation.headline} · ${facilityStamp(row)}`,
      latitude: row.lat,
      longitude: row.lon,
      properties: mapAnalystRecord(row),
    });
    _wellContexts.set(row.id, pseudo);
    return pseudo;
  }

  /** The region's one mark, as an entity, created with the snapshot. */
  function createRegionPin(snapshot) {
    const center = snapshot.region.center;
    if (
      !_regionPin &&
      Number.isFinite(center.lat) &&
      Number.isFinite(center.lon)
    ) {
      const position = Cesium.Cartesian3.fromDegrees(center.lon, center.lat);
      const marker = new Cesium.Entity({
        id: `onshore-region:${snapshot.regionId}`,
        position,
        point: {
          pixelSize: REGION_MARK_PX,
          color: pointColor(YOY_CSS.flat, 0.9),
          outlineColor: pointColor('#000000', 0.8),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: {
          onshoreRegionId: snapshot.regionId,
          name: snapshot.region.name,
        },
      });
      marker.__onshoreRegionId = snapshot.regionId;
      _dataSource.entities.add(marker);
      _regionPin = { marker, position, visible: true };
    }
  }

  /**
   * Every field's mark, as entities (a few hundred), created on the first
   * visit to the regional tier: at ~0.45 ms an entity they were a quarter of
   * the activation budget for a tier the camera may never reach.
   */
  function ensureFieldPins() {
    if (_fieldPins.size || !_snapshot || !_dataSource) return;
    for (const field of _fields) {
      if (_fieldPins.has(field.id)) continue;
      const position = Cesium.Cartesian3.fromDegrees(field.lon, field.lat);
      const style = markerStyle(field);
      const marker = new Cesium.Entity({
        id: `onshore-field:${_snapshot.regionId}:${field.id}`,
        position,
        point: {
          pixelSize: fieldPixelSize(field, false),
          color: pointColor(style.fillCss, style.fillAlpha),
          outlineColor: pointColor(style.outlineCss, style.outlineAlpha),
          outlineWidth: field.producing > 0 ? 2 : 1,
          // Pinned at the ellipsoid so a marker never re-seats itself as
          // terrain tiles refine; the disabled depth test keeps it visible.
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: false,
        },
        properties: {
          onshoreFieldId: field.id,
          name: field.name,
          ...mapClusterAnalystRecord(field, 'field'),
        },
      });
      marker.__onshoreFieldId = field.id;
      _dataSource.entities.add(marker);
      _fieldPins.set(field.id, { marker, position, visible: false });
      registerFieldContext(marker, field);
    }
  }

  /**
   * Every placed well as a point primitive, created once on the first visit
   * to the local tier so activation stays cheap. Twenty thousand points in
   * one collection are one draw call.
   */
  function ensureWellPoints() {
    if (_points || !_viewer?.scene?.primitives) return;
    _points = new Cesium.PointPrimitiveCollection();
    _points.show = false;
    _viewer.scene.primitives.add(_points);
    for (const row of _rows) {
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
      const style = markerStyle(row);
      const point = _points.add({
        id: Object.freeze({ onshoreWellId: row.id }),
        position,
        pixelSize: wellSize(row, false),
        color: pointColor(style.fillCss, style.fillAlpha),
        outlineColor: pointColor(style.outlineCss, style.outlineAlpha),
        outlineWidth: row.producing ? 1 : 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: false,
      });
      _wellPoints.set(row.id, point);
      _wellPositions.set(row.id, position);
    }
  }

  /**
   * Local tier: show the wells inside the padded view, the largest first,
   * up to the budget (R12.5). Rows are ranked by gas, so the cap keeps the
   * producers that matter when a view holds more than the budget.
   */
  function refreshPointClipping() {
    if (!_points) return;
    const rect = _tier === ONSHORE_TIER_LOCAL ? viewRectangle() : null;
    let shown = 0;
    for (const row of _rows) {
      const point = _wellPoints.get(row.id);
      if (!point) continue;
      const visible =
        _tier === ONSHORE_TIER_LOCAL &&
        shown < ONSHORE_MAX_POINTS_IN_VIEW &&
        (!rect ||
          (row.lon >= rect.west &&
            row.lon <= rect.east &&
            row.lat >= rect.south &&
            row.lat <= rect.north));
      if (visible) shown += 1;
      if (point.show !== visible) point.show = visible;
    }
    _pointsShown = shown;
  }

  function applyTier() {
    if (_regionPin) {
      const visible = _tier === ONSHORE_TIER_GLOBAL;
      if (_regionPin.visible !== visible) {
        _regionPin.marker.point.show = visible;
        _regionPin.visible = visible;
      }
    }
    if (_tier === ONSHORE_TIER_REGIONAL) ensureFieldPins();
    for (const [id, pin] of _fieldPins) {
      const field = _fieldById.get(id);
      pin.marker.point.pixelSize = fieldPixelSize(
        field,
        _hover?.kind === 'field' && _hover.id === id,
      );
    }
    refreshHorizonCulling();
    if (_tier === ONSHORE_TIER_LOCAL) ensureWellPoints();
    if (_points) _points.show = _tier === ONSHORE_TIER_LOCAL;
    refreshPointClipping();
  }

  /* ---------------------------------------------------------------- *
   * Overlay
   * ---------------------------------------------------------------- */

  function rebuildEntries() {
    const entries = [];
    if (!_snapshot) {
      _entries = [];
      return;
    }
    if (_tier === ONSHORE_TIER_GLOBAL) {
      if (_regionPin)
        entries.push(
          createRegionOverlayEntry(
            _snapshot,
            _regionPin.position,
            basinWeatherLine(_basinReading),
          ),
        );
    } else if (_tier === ONSHORE_TIER_REGIONAL) {
      for (const field of _fields) {
        const pin = _fieldPins.get(field.id);
        if (!pin) continue;
        const entry = createClusterOverlayEntry(field, pin.position, _tier);
        if (entry) entries.push(entry);
      }
    } else {
      const rect = viewRectangle();
      const inView = facilitiesInRectangle(_rows, rect);
      let taken = 0;
      for (const row of inView) {
        if (taken >= ONSHORE_OVERLAY_COHORT_LIMIT) break;
        const position = _wellPositions.get(row.id);
        if (!position) continue;
        const entry = createWellOverlayEntry(row, position, _tier);
        if (!entry) continue;
        entries.push(entry);
        taken += 1;
      }
    }
    _entries = selectOverlayCohort(entries, ONSHORE_OVERLAY_COHORT_LIMIT);
  }

  /**
   * Row 13 M3: the region card's basin line from `/api/oracle/basins`.
   * Optional: any failure (no console, an older console, a stale store)
   * leaves the card without the line, never the layer without its data.
   */
  async function refreshBasinWeather() {
    if (!basinWeather || !_snapshot) return;
    _weatherRequest?.abort();
    const request = new AbortController();
    _weatherRequest = request;
    try {
      const readings = await basinWeather.getReadings({
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      _basinReading = currentBasinReading(
        pickBasinReading(readings, _snapshot?.region?.basins),
      );
    } catch (e) {
      if (request.signal.aborted) return;
      _basinReading = null;
      if (!_weatherWarned) {
        _weatherWarned = true;
        console.info(
          `[Data:Onshore:${region.id}] Oil Oracle basins unavailable: ${e?.message}`,
        );
      }
    } finally {
      if (_weatherRequest === request) _weatherRequest = null;
    }
    if (!_enabled || !_snapshot) return;
    rebuildEntries();
    publishOverlay();
  }

  function publishOverlay() {
    if (!_enabled) return;
    const selectedEntryId = _selectedId ? `well:${_selectedId}` : null;
    const hoverEntryId = _hover ? `${_hover.kind}:${_hover.id}` : null;
    const entries = _entries.filter(
      (entry) => entry.id !== selectedEntryId && entry.id !== hoverEntryId,
    );
    if (_hover?.kind === 'well' && _hover.id !== _selectedId) {
      const row = _rowById.get(_hover.id);
      const position = _wellPositions.get(_hover.id);
      if (row && position) entries.push(buildHoverWellCard(row, position));
    } else if (_hover?.kind === 'field') {
      const field = _fieldById.get(_hover.id);
      const pin = _fieldPins.get(_hover.id);
      if (field && pin)
        entries.push(buildHoverClusterCard(field, pin.position, _snapshot));
    }
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    const selectedPosition = _selectedId
      ? _wellPositions.get(_selectedId)
      : null;
    if (selected && selectedPosition)
      entries.push(buildSelectedWellCard(selected, selectedPosition));
    overlayHost.setEntries(OVERLAY_SOURCE_ID, entries, {
      cohortLimit: ONSHORE_OVERLAY_COHORT_LIMIT + 2,
      collisionCapacity: ONSHORE_OVERLAY_COLLISION_CAPACITY + 2,
      moving: false,
    });
  }

  function refreshTier({ force = false } = {}) {
    const tier = currentTier();
    const changed = tier !== _tier;
    if (!force && !changed) {
      // Same depth, new view: the local tier's clipping and labels follow the camera.
      if (_tier === ONSHORE_TIER_LOCAL) {
        refreshPointClipping();
        rebuildEntries();
        publishOverlay();
      }
      return;
    }
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
   * Hide the entity marks that sit beyond the ellipsoid horizon: they are
   * always-on-top and nothing writes far-side depth, so without this every
   * field on the far side of the planet would shine through it. Well points
   * are only shown at the local tier, where the far side is never in view.
   */
  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.()) return;
    const occluder = horizonOccluder(_viewer.camera);
    const fieldsOn = _tier === ONSHORE_TIER_REGIONAL;
    for (const [, pin] of _fieldPins) {
      const visible =
        fieldsOn && occluder.isPointVisible(pin.position) === true;
      // Assigning `show` rebuilds a ConstantProperty, so only write on a flip.
      if (pin.visible === visible) continue;
      pin.marker.point.show = visible;
      pin.visible = visible;
    }
    if (_regionPin) {
      const visible =
        _tier === ONSHORE_TIER_GLOBAL &&
        occluder.isPointVisible(_regionPin.position) === true;
      if (_regionPin.visible !== visible) {
        _regionPin.marker.point.show = visible;
        _regionPin.visible = visible;
      }
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

  /** Fly straight down onto a point; the caller decides the height. */
  function flyTo(lon, lat, height) {
    if (!_viewer || _viewer.isDestroyed?.()) return false;
    if (!isPointerFree()) return false;
    const camera = _viewer.camera;
    _viewer.trackedEntity = undefined;
    camera.cancelFlight?.();
    camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      orientation: {
        heading: camera.heading,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
      duration: ONSHORE_FLY_DURATION_S,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
    return true;
  }

  function flyToWell(row) {
    return row ? flyTo(row.lon, row.lat, ONSHORE_FLY_TO_WELL_HEIGHT_M) : false;
  }

  function zoomOut(row) {
    return row ? flyTo(row.lon, row.lat, ONSHORE_ZOOM_OUT_HEIGHT_M) : false;
  }

  /* ---------------------------------------------------------------- *
   * Hover
   * ---------------------------------------------------------------- */

  function setHover(next) {
    const same =
      (next === null && _hover === null) ||
      (next && _hover && next.kind === _hover.kind && next.id === _hover.id);
    if (same) return;
    const previous = _hover;
    _hover = next;
    for (const target of [previous, next]) {
      if (!target) continue;
      if (target.kind === 'well') {
        const point = _wellPoints.get(target.id);
        const row = _rowById.get(target.id);
        if (point && row)
          point.pixelSize = wellSize(
            row,
            next?.kind === 'well' && next.id === target.id,
          );
      } else if (target.kind === 'field') {
        const pin = _fieldPins.get(target.id);
        const field = _fieldById.get(target.id);
        if (pin && field)
          pin.marker.point.pixelSize = fieldPixelSize(
            field,
            next?.kind === 'field' && next.id === target.id,
          );
      }
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas?.style) canvas.style.cursor = next ? 'pointer' : '';
    publishOverlay();
  }

  /** What a pick landed on: a well point, a field mark, the region mark, or nothing. */
  function pickedTarget(picked) {
    if (!picked) return null;
    const id = picked.id;
    if (id?.onshoreWellId !== undefined && _rowById.has(id.onshoreWellId))
      return { kind: 'well', id: id.onshoreWellId };
    if (id?.__onshoreFieldId !== undefined)
      return { kind: 'field', id: id.__onshoreFieldId };
    if (id?.__onshoreRegionId !== undefined)
      return { kind: 'region', id: id.__onshoreRegionId };
    return null;
  }

  function handleHoverMove(position) {
    if (!_enabled || _cameraMoving || !position || !_viewer) return;
    if (!isPointerFree()) {
      if (_hover) setHover(null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < ONSHORE_HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    const target = pickedTarget(picked);
    setHover(target && target.kind !== 'region' ? target : null);
  }

  /* ---------------------------------------------------------------- *
   * Selection and the dossier
   * ---------------------------------------------------------------- */

  function openDossier(row) {
    if (!dossier?.show) return;
    if (!shards) {
      _historyState = 'unavailable';
      dossier.show(row, {
        snapshot: _snapshot,
        history: null,
        historyState: 'unavailable',
      });
      return;
    }
    _historyState = 'loading';
    dossier.show(row, {
      snapshot: _snapshot,
      history: null,
      historyState: 'loading',
    });
    shards
      .getHistory(row.id)
      .then((history) => {
        if (_selectedId !== row.id) return;
        _historyState = history ? 'loaded' : 'unavailable';
        dossier.update?.(row, {
          snapshot: _snapshot,
          history,
          historyState: _historyState,
        });
      })
      .catch((error) => {
        if (_selectedId !== row.id) return;
        _historyState = 'error';
        console.warn(`[Data:Onshore:${region.id}] history shard error:`, error);
        dossier.update?.(row, {
          snapshot: _snapshot,
          history: null,
          historyState: 'error',
        });
      });
  }

  function closeDossier() {
    dossier?.hide?.();
    _historyState = 'idle';
  }

  function selectById(id, { fly = 'auto' } = {}) {
    const row = _rowById.get(id);
    if (!row) return;
    _selectedId = id;
    context.selectEntityContext(registerWellContext(row));
    openDossier(row);
    publishOverlay();
    const height = cameraHeight();
    const far = !Number.isFinite(height) || height > ONSHORE_FLY_FROM_HEIGHT_M;
    if (fly === 'always' || (fly === 'auto' && far)) flyToWell(row);
  }

  function clearSelection({ publish = true } = {}) {
    closeDossier();
    if (!_selectedId) return;
    _selectedId = null;
    context.clearSelectedEntityContextForLayer(LAYER_ID);
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
    if (!_selectedId || layerId === LAYER_ID) return;
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
      const target = pickedTarget(picked);
      if (target?.kind === 'well') {
        selectById(target.id);
        return;
      }
      if (target?.kind === 'field') {
        const field = _fieldById.get(target.id);
        if (field) flyTo(field.lon, field.lat, ONSHORE_FLY_TO_FIELD_HEIGHT_M);
        return;
      }
      if (target?.kind === 'region') {
        const center = _snapshot?.region?.center;
        if (center) flyTo(center.lon, center.lat, ONSHORE_ZOOM_OUT_HEIGHT_M);
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

  const layer = {
    id: LAYER_ID,
    name: region.name ?? `Gas · ${region.id} wells`,
    icon: region.icon ?? '⛽',
    source: 'state filings',
    freshnessClass: 'published',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer)
        throw new Error(`Onshore layer ${region.id} is already initialized`);
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _fields = [];
      _entries = [];
      _selectedId = null;
      _hover = null;
      _lastUpdate = null;
      _lastError = null;
      _snapshot = null;
      _weatherRequest?.abort();
      _basinReading = null;
      _tier = ONSHORE_TIER_GLOBAL;
      _enabled = false;
      _historyState = 'idle';
      overlayHost.setVisible(OVERLAY_SOURCE_ID, false);
      console.log(`[Data:Onshore:${region.id}] Initialized`);
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(OVERLAY_SOURCE_ID, true);
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
      overlayHost.clearSource(OVERLAY_SOURCE_ID);
      overlayHost.setVisible(OVERLAY_SOURCE_ID, false);
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      // A static bundle: read once, then restyle only. This must answer
      // `true`, not `false`: the data manager treats a false update as a
      // rejected enable and runs the disable cleanup, which is how a second
      // enable of a bundled layer used to leave its marks hidden (found by
      // the onshore QA's disable/enable pass, 2026-09-21).
      if (_snapshot) {
        refreshBasinWeather();
        return true;
      }
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : null;
        if (!rows) throw new Error('Malformed onshore snapshot');
        _snapshot = snapshot;
        _rows = rows;
        _fields = snapshot.clusters.fields;
        for (const row of rows) _rowById.set(row.id, row);
        for (const field of _fields) _fieldById.set(field.id, field);
        createRegionPin(snapshot);
        _lastUpdate = Date.now();
        _lastError = null;
        refreshTier({ force: true });
        refreshBasinWeather();
        console.log(
          `[Data:Onshore:${region.id}] Updated: ${snapshot.counts.producing} producing of ${rows.length} wells, ${_fields.length} fields (${snapshot.asOf})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn(`[Data:Onshore:${region.id}] Load error:`, e);
        _lastError = e?.message || 'Onshore bundle unavailable';
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
      overlayHost.clearSource(OVERLAY_SOURCE_ID);
      overlayHost.setVisible(OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(LAYER_ID);
      if (_points) {
        viewer?.scene?.primitives?.remove(_points);
        _points = null;
      }
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _rows = [];
      _fields = [];
      _entries = [];
      _snapshot = null;
      _weatherRequest?.abort();
      _basinReading = null;
      _regionPin = null;
      _rowById.clear();
      _fieldById.clear();
      _fieldPins.clear();
      _wellPoints.clear();
      _wellPositions.clear();
      _wellContexts.clear();
      _lastUpdate = null;
      _lastError = null;
      _pointsShown = 0;
    },

    /** Dossier buttons and voice hooks land here. */
    flyToWell(id) {
      return flyToWell(_rowById.get(id ?? _selectedId));
    },
    zoomOutFromWell(id) {
      return zoomOut(_rowById.get(id ?? _selectedId));
    },
    stepWell(delta) {
      step(Number.isFinite(delta) ? Math.sign(delta) || 1 : 1);
    },
    selectWell(id) {
      selectById(id);
    },
    clearWell() {
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
        // The count the panel prints is producing wells; the meta line
        // carries the rest (R12.11).
        count: counts?.producing ?? 0,
        basinWeather: _basinReading,
        countLabel: counts ? `${counts.producing} producing` : null,
        facilities: counts?.facilities ?? 0,
        reported: counts?.reported ?? 0,
        drawn: { fields: _fieldPins.size, wells: _wellPoints.size },
        pointsShown: _pointsShown,
        gasMcfdTotal: counts?.gasMcfdTotal ?? 0,
        oilBbldTotal: counts?.oilBbldTotal ?? 0,
        currentMonth: _snapshot?.currentMonth ?? null,
        completeness: _snapshot?.completeness?.table ?? [],
        reconciliation: _snapshot?.reconciliation?.latest ?? null,
        asOf: _snapshot?.asOf ?? null,
        vintage: _snapshot?.retrieved ?? null,
        freshnessClass: 'published',
        source: onshoreMetaLine(_snapshot),
        lastUpdate: _lastUpdate,
        error: _lastError,
        tier: _tier,
        selectedId: _selectedId,
        hoverId: _hover ? `${_hover.kind}:${_hover.id}` : null,
        dossierOpen: Boolean(dossier?.isOpen?.()),
        historyState: _historyState,
      };
    },
  };
  return layer;
}
