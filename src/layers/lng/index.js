import * as Cesium from 'cesium';
import { horizonOccluder } from '../../data/iconOrientation.js';
import { createObservation } from '../commodities/observation.js';
import {
  LNG_ARROW_TAIL_POINTS,
  LNG_FLY_DURATION_S,
  LNG_FLY_FROM_HEIGHT_M,
  LNG_FLY_TO_HEIGHT_M,
  LNG_HOVER_THROTTLE_MS,
  LNG_OVERLAY_COHORT_LIMIT,
  LNG_OVERLAY_COLLISION_CAPACITY,
  LNG_OVERLAY_SOURCE_ID,
  LNG_TIER_GLOBAL,
  LNG_ZOOM_OUT_HEIGHT_M,
  arrowTailCoords,
  buildRouteCard,
  buildSelectedTerminalCard,
  createTerminalOverlayEntry,
  detailTierForHeight,
  gradeColor,
  groundCirclePositions,
  kindColor,
  lngMetaLine,
  markerPixelSize,
  ringRadiusMeters,
  routePositions,
  routeWidthPx,
  selectLngOverlayCohort,
  terminalPosition,
} from './model.js';
import {
  LNG_LAYER_ID,
  LNG_LAYER_NAME,
  mapAnalystRecord,
  usDossierOrder,
} from './records.js';

export * from './model.js';
export * from './records.js';
export { createBundledLngSource } from './source.js';
export { buildLngDossierModel, createLngDossier } from './dossier.js';

const UPDATE_INTERVAL_MS = 10 * 60_000;
const CHIP_IDS = Object.freeze(['export', 'import', 'routes']);
/** Arcs added per macrotask after activation (~50 ms of geodesic work each). */
const ARC_CHUNK = 80;

/**
 * LNG terminals, US cargoes and sea-routed arcs on the globe
 * (docs/COMMODITIES-PLAN.md §12). Bundled, published-class data; the layer
 * keeps its own hover highlight like datacenters and joins the row 1 retrofit
 * list (§12.6.2 item 10).
 *
 * Markers are pinned points (`HeightReference.NONE`, depth test off) so a
 * jetty never swallows its plant; the horizon-occluder pass from the
 * chokepoints fix hides the far-side ones. Arcs are ground polylines: solid
 * with an arrow material for the DOE grade, dashed with a short solid arrow
 * tail for the GIIGNL grade, so the two grades never read alike.
 */
export function createLngLayer({
  source,
  overlayHost,
  context,
  dossier = null,
  screenSpaceEventHandlerFactory,
  requestRender = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('LNG requires a snapshot source');
  if (!overlayHost) throw new TypeError('LNG requires an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`LNG requires context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('LNG requires a screen-space handler factory');

  let _viewer = null;
  let _dataSource = null;
  /** One PolylineCollection for every arc and arrow tail. */
  let _lines = null;
  let _arcBuildToken = 0;
  let _arcsPending = 0;
  let _enabled = false;
  let _snapshot = null;
  let _rows = [];
  let _rowById = new Map();
  let _routeById = new Map();
  let _monthlyByRoute = new Map();
  /** terminal id → { marker, ring, position } */
  let _pins = new Map();
  /** route id → { line, arrow, width } */
  let _arcs = new Map();
  let _cullTargets = [];
  let _horizonCullRemovers = [];
  let _cameraRemovers = [];
  let _handler = null;
  let _foreignSelectionListener = null;
  let _request = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _tier = LNG_TIER_GLOBAL;
  let _cameraMoving = false;
  let _hoverId = null;
  let _hoverRouteId = null;
  let _hoverLastPickAt = 0;
  let _selectedId = null;
  let _selectedRouteId = null;
  let _entries = [];
  let _rowControlsListener = null;
  let _observation = null;
  let _timing = null;
  const _chips = { export: true, import: true, routes: true };

  const nudgeRender = () => {
    if (typeof requestRender === 'function') requestRender();
    else _viewer?.scene?.requestRender?.();
  };

  function cameraHeight() {
    return _viewer?.camera?.positionCartographic?.height;
  }

  function isPointerFree() {
    const owner = globalThis.__gevPointerOwner;
    return !owner || owner === LNG_LAYER_ID;
  }

  // Tiers ------------------------------------------------------------------

  function refreshTier({ force = false } = {}) {
    const tier = detailTierForHeight(cameraHeight());
    if (!force && tier === _tier) return;
    _tier = tier;
    applyTierToPins();
    rebuildEntries();
    publishOverlay();
  }

  function applyTierToPins() {
    for (const [id, pin] of _pins) {
      const row = _rowById.get(id);
      if (!row) continue;
      pin.marker.point.pixelSize = markerPixelSize(row, {
        tier: _tier,
        hovered: _hoverId === id,
      });
    }
  }

  function rebuildEntries() {
    const entries = [];
    for (const row of _rows) {
      if (!_chips[row.kind]) continue;
      const pin = _pins.get(row.id);
      if (!pin || pin.hidden) continue;
      const entry = createTerminalOverlayEntry(row, pin.position, _tier);
      if (entry) entries.push(entry);
    }
    _entries = selectLngOverlayCohort(entries, LNG_OVERLAY_COHORT_LIMIT);
  }

  function hoverRouteEntry() {
    const route = _hoverRouteId ? _routeById.get(_hoverRouteId) : null;
    if (!route || !_hoverPosition) return null;
    return buildRouteCard(route, _hoverPosition, { selected: false });
  }
  let _hoverPosition = null;

  function publishOverlay() {
    if (!_enabled) return;
    const entries = _entries.filter((entry) => entry.id !== _selectedId);
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    if (selected)
      entries.push(
        buildSelectedTerminalCard(selected, _pins.get(selected.id).position),
      );
    const selectedRoute = _selectedRouteId
      ? _routeById.get(_selectedRouteId)
      : null;
    if (selectedRoute && _chips.routes)
      entries.push(
        buildRouteCard(selectedRoute, _selectedRoutePosition, {
          selected: true,
          monthly: _monthlyByRoute.get(selectedRoute.id) ?? null,
        }),
      );
    const hover = hoverRouteEntry();
    if (hover && hover.id !== `hover-lng-route:${_selectedRouteId}`)
      entries.push(hover);
    overlayHost.setEntries(LNG_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: LNG_OVERLAY_COHORT_LIMIT + 3,
      collisionCapacity: LNG_OVERLAY_COLLISION_CAPACITY + 3,
      moving: false,
    });
  }
  let _selectedRoutePosition = null;

  // Camera -----------------------------------------------------------------

  function onCameraMoveStart() {
    _cameraMoving = true;
    if (_hoverId) setHover(null);
    if (_hoverRouteId) setHoverRoute(null, null);
  }

  function onCameraMoveEnd() {
    _cameraMoving = false;
    refreshTier();
  }

  function installCameraListeners(viewer) {
    if (_cameraRemovers.length || !viewer?.camera) return;
    _cameraRemovers = [
      viewer.camera.moveStart.addEventListener(onCameraMoveStart),
      viewer.camera.moveEnd.addEventListener(onCameraMoveEnd),
    ];
  }

  function removeCameraListeners() {
    for (const remove of _cameraRemovers) remove();
    _cameraRemovers = [];
  }

  function flyTo(row, height) {
    if (!_viewer?.camera || !row || !isPointerFree()) return;
    _viewer.trackedEntity = undefined;
    _viewer.camera.cancelFlight?.();
    _viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(row.lon, row.lat, height),
      orientation: {
        heading: _viewer.camera.heading,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
      duration: LNG_FLY_DURATION_S,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }

  // Horizon culling ----------------------------------------------------------

  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.()) return;
    const occluder = horizonOccluder(_viewer.camera);
    for (const target of _cullTargets) {
      const visible =
        !target.pin.hidden &&
        occluder.isPointVisible(target.pin.position) === true;
      if (target.visible === visible) continue;
      target.pin.marker.point.show = visible;
      target.visible = visible;
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

  // Hover ------------------------------------------------------------------

  function setHover(id) {
    if (id === _hoverId) return;
    const previous = _hoverId;
    _hoverId = id;
    for (const target of [previous, id]) {
      const pin = target ? _pins.get(target) : null;
      const row = target ? _rowById.get(target) : null;
      if (!pin || !row) continue;
      const hovered = target === id;
      pin.marker.point.pixelSize = markerPixelSize(row, {
        tier: _tier,
        hovered,
      });
      if (pin.ring) pin.ring.polyline.width = hovered ? 3 : 2;
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas) canvas.style.cursor = id || _hoverRouteId ? 'pointer' : '';
    nudgeRender();
  }

  function setHoverRoute(id, position) {
    if (id === _hoverRouteId && !position) return;
    const previous = _hoverRouteId;
    _hoverRouteId = id;
    _hoverPosition = position;
    for (const target of [previous, id]) {
      const arc = target ? _arcs.get(target) : null;
      const route = target ? _routeById.get(target) : null;
      if (!arc || !route) continue;
      const width = routeWidthPx(route, _snapshot.scales, {
        hovered: target === id,
      });
      arc.line.width = width;
      if (arc.arrow) arc.arrow.width = width + 2;
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas) canvas.style.cursor = id || _hoverId ? 'pointer' : '';
    if (previous !== id || position) publishOverlay();
    nudgeRender();
  }

  /** Markers pick as entities; arcs pick as the collection's `id` object. */
  function pickedIds(picked) {
    const entity = picked?.id;
    return {
      terminalId: entity?.__lngId ?? null,
      routeId: entity?.lngRouteId ?? null,
    };
  }

  function handleHoverMove(position) {
    if (!_enabled || _cameraMoving || !position || !_viewer) return;
    if (!isPointerFree()) {
      if (_hoverId) setHover(null);
      if (_hoverRouteId) setHoverRoute(null, null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < LNG_HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    const { terminalId, routeId } = pickedIds(picked);
    setHover(terminalId);
    if (routeId) {
      const anchor = _viewer.camera.pickEllipsoid(
        position,
        _viewer.scene.globe.ellipsoid,
      );
      setHoverRoute(routeId, anchor ?? null);
    } else if (_hoverRouteId) setHoverRoute(null, null);
  }

  // Selection ----------------------------------------------------------------

  function openDossier(row) {
    if (!dossier?.show || !row.us || row.us.smallScale) return;
    dossier.show(row, { order: usDossierOrder(_rows) });
  }

  function closeDossier() {
    dossier?.hide?.();
  }

  function selectById(id, { fly = 'auto' } = {}) {
    const pin = _pins.get(id);
    const row = _rowById.get(id);
    if (!pin || !row) return;
    _selectedId = id;
    _selectedRouteId = null;
    if (_viewer) _viewer.selectedEntity = pin.marker;
    context.selectEntityContext(pin.marker);
    openDossier(row);
    publishOverlay();
    const height = cameraHeight();
    const far = !Number.isFinite(height) || height > LNG_FLY_FROM_HEIGHT_M;
    if (fly === 'always' || (fly === 'auto' && far))
      flyTo(row, LNG_FLY_TO_HEIGHT_M);
    nudgeRender();
  }

  function selectRoute(id, position) {
    const arc = _arcs.get(id);
    const route = _routeById.get(id);
    if (!arc || !route) return;
    _selectedRouteId = id;
    _selectedRoutePosition = position ?? arc.midpoint;
    _selectedId = null;
    closeDossier();
    context.selectEntityContext(arc.id);
    publishOverlay();
    nudgeRender();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selectedId && !_selectedRouteId) return;
    _selectedId = null;
    _selectedRouteId = null;
    closeDossier();
    if (_viewer && _viewer.selectedEntity?.__lngId !== undefined)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(LNG_LAYER_ID);
    if (publish) publishOverlay();
    nudgeRender();
  }

  function onForeignSelection(event) {
    const layerId = event?.detail?.layerId;
    if ((!_selectedId && !_selectedRouteId) || layerId === LNG_LAYER_ID) return;
    closeDossier();
    _selectedId = null;
    _selectedRouteId = null;
    publishOverlay();
  }

  function installHandlers(viewer) {
    if (_handler || !viewer?.scene?.canvas) return;
    _handler = screenSpaceEventHandlerFactory(viewer.scene.canvas);
    _handler.setInputAction((click) => {
      if (!_enabled || !isPointerFree()) return;
      const picked = viewer.scene.pick(click.position);
      const { terminalId, routeId } = pickedIds(picked);
      if (terminalId) {
        selectById(terminalId);
        return;
      }
      if (routeId) {
        const anchor = viewer.camera.pickEllipsoid(
          click.position,
          viewer.scene.globe.ellipsoid,
        );
        selectRoute(routeId, anchor ?? null);
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
    const canvas = _viewer?.scene?.canvas;
    if (canvas) canvas.style.cursor = '';
    _hoverId = null;
    _hoverRouteId = null;
    _hoverPosition = null;
  }

  // Entities -----------------------------------------------------------------

  function observationFor(row) {
    const observedAt = row.us
      ? `${_snapshot.span.to}-01T00:00:00Z`
      : row.source.release
        ? `${row.source.release.replace(/^(\w+) (\d{4})$/, '$2-$1')}`
        : `${_snapshot.span.to}-01T00:00:00Z`;
    try {
      return createObservation({
        observedAt: Date.parse(observedAt)
          ? observedAt
          : _observation.observedAt,
        publishedAt: _observation.publishedAt,
        fetchedAt: _observation.fetchedAt,
        freshnessClass: 'published',
        source: row.us ? 'DOE · EIA · GEM' : 'GEM',
        headline: _snapshot.asOf,
      });
    } catch {
      return _observation;
    }
  }

  function registerContext(entity, row) {
    context.registerEntityContext(entity, {
      id: `${LNG_LAYER_ID}:${row.id}`,
      layerId: LNG_LAYER_ID,
      layerName: layer.name,
      source: row.us ? 'DOE · EIA · GEM' : 'GEM',
      dataSource: _dataSource,
      label: `${row.name} · ${row.kind} · ${row.capacityMtpa} Mtpa · ${row.country}`,
      latitude: row.lat,
      longitude: row.lon,
      properties: {
        ...mapAnalystRecord(row),
        observation: observationFor(row),
      },
    });
  }

  function registerRouteContext(entity, route) {
    const line = route.line;
    context.registerEntityContext(entity, {
      id: `${LNG_LAYER_ID}:route:${route.id}`,
      layerId: LNG_LAYER_ID,
      layerName: layer.name,
      source: route.grade === 'doe' ? 'DOE' : 'GIIGNL',
      dataSource: _dataSource,
      label: `${route.originName} → ${route.destinationName} · ${route.period}`,
      latitude: line.coords[Math.floor(line.coords.length / 2)][1],
      longitude: line.coords[Math.floor(line.coords.length / 2)][0],
      properties: {
        id: route.id,
        grade: route.grade,
        period: route.period,
        origin: route.originName,
        destination: route.destinationName,
        nm: line.nm,
        via: line.via.join(', '),
        variant: route.variantInUse,
        cargoes: route.volume.cargoes,
        mmcf: route.volume.mmcf,
        mt: route.volume.mt,
        observation: _observation,
      },
    });
  }

  function createPins(rows) {
    const pins = new Map();
    const cullTargets = [];
    for (const row of rows) {
      const position = terminalPosition(row);
      const color = kindColor(row.kind);
      const hollow = row.status !== 'operating';
      const marker = new Cesium.Entity({
        id: `lng:${row.id}`,
        position,
        point: {
          pixelSize: markerPixelSize(row, { tier: _tier }),
          color: hollow ? Cesium.Color.BLACK.withAlpha(0.35) : color,
          outlineColor: hollow ? color : Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { lngId: row.id, name: row.name, ...mapAnalystRecord(row) },
      });
      marker.__lngId = row.id;
      _dataSource.entities.add(marker);
      registerContext(marker, row);
      let ring = null;
      if (row.kind === 'export') {
        ring = new Cesium.Entity({
          id: `lng-ring:${row.id}`,
          polyline: {
            positions: groundCirclePositions(
              row.lon,
              row.lat,
              ringRadiusMeters(row),
            ),
            clampToGround: true,
            width: 2,
            material: color.withAlpha(hollow ? 0.45 : 0.7),
          },
        });
        ring.__lngId = row.id;
        _dataSource.entities.add(ring);
      }
      const pin = { marker, ring, position, hidden: !_chips[row.kind] };
      pins.set(row.id, pin);
      cullTargets.push({ pin, visible: true });
    }
    _pins = pins;
    _cullTargets = cullTargets;
  }

  /**
   * Arcs live in one PolylineCollection, the "one primitive per grade"
   * fallback of §12.9 taken from the start: ground-clamped entity polylines
   * of 20,000 km were worker geometry jobs that never came ready (probe
   * 2026-09-21, four batches, 0 ready at 30 s) and starved the rings queued
   * behind them, and plain entity polylines cost 118 MiB of heap against a
   * 60 MiB gate. The collection holds one vertex buffer, takes the arrow and
   * dash materials, picks by id, and renders at once. Positions are the
   * bundle's lane vertices subdivided along the geodesic so a segment never
   * dips below the ellipsoid; the sea is at height zero, so nothing hides it.
   */
  function addArc(route, materials, arcs) {
    const line = route.line;
    const width = routeWidthPx(route, _snapshot.scales);
    const dashed = route.grade === 'giignl';
    const id = { lngRouteId: route.id };
    const polyline = _lines.add({
      id,
      positions: routePositions(line.coords),
      width,
      material: dashed ? materials.giignl : materials.doe,
      show: _chips.routes,
    });
    registerRouteContext(id, route);
    let arrow = null;
    if (dashed) {
      arrow = _lines.add({
        id,
        positions: routePositions(
          arrowTailCoords(line.coords, LNG_ARROW_TAIL_POINTS),
        ),
        width: width + 2,
        material: materials.giignlArrow,
        show: _chips.routes,
      });
    }
    const mid = line.coords[Math.floor(line.coords.length / 2)];
    arcs.set(route.id, {
      id,
      line: polyline,
      arrow,
      width,
      midpoint: Cesium.Cartesian3.fromDegrees(mid[0], mid[1], 0),
    });
  }

  /**
   * The markers are drawn in the activation tick; the arcs follow in chunks
   * of ARC_CHUNK per macrotask, because subdividing 722 lanes along the
   * geodesic costs ~450 ms on this box and the activation gate is 900 ms
   * for the whole layer. `getStats().arcsPending` reports the remainder and
   * the QA asserts it reaches zero; a new snapshot or a disable cancels the
   * run through the token.
   */
  function createArcs(routes) {
    const token = (_arcBuildToken += 1);
    const arcs = new Map();
    _arcs = arcs;
    _arcsPending = _lines ? routes.length : 0;
    if (!_lines) return;
    const materials = {
      doe: Cesium.Material.fromType('PolylineArrow', {
        color: gradeColor('doe').withAlpha(0.9),
      }),
      giignl: Cesium.Material.fromType('PolylineDash', {
        color: gradeColor('giignl').withAlpha(0.85),
        dashLength: 24,
      }),
      giignlArrow: Cesium.Material.fromType('PolylineArrow', {
        color: gradeColor('giignl').withAlpha(0.95),
      }),
    };
    let index = 0;
    const step = () => {
      if (token !== _arcBuildToken || !_lines) return;
      const end = Math.min(index + ARC_CHUNK, routes.length);
      for (; index < end; index += 1) addArc(routes[index], materials, arcs);
      _arcsPending = routes.length - index;
      nudgeRender();
      if (index < routes.length) setTimeout(step, 0);
      else _rowControlsListener?.();
    };
    step();
  }

  function clearEntities() {
    context.removeEntityContextsForLayer(LNG_LAYER_ID);
    _arcBuildToken += 1;
    _arcsPending = 0;
    _dataSource?.entities.removeAll();
    _lines?.removeAll();
    _pins = new Map();
    _arcs = new Map();
    _cullTargets = [];
  }

  function applyChips() {
    for (const [id, pin] of _pins) {
      const row = _rowById.get(id);
      const hidden = !_chips[row.kind];
      pin.hidden = hidden;
      pin.marker.point.show = !hidden;
      if (pin.ring) pin.ring.show = !hidden;
    }
    for (const target of _cullTargets) target.visible = !target.pin.hidden;
    for (const arc of _arcs.values()) {
      arc.line.show = _chips.routes;
      if (arc.arrow) arc.arrow.show = _chips.routes;
    }
    if (!_chips.routes && _hoverRouteId) setHoverRoute(null, null);
    if (_selectedId && !_chips[_rowById.get(_selectedId)?.kind])
      clearSelection({ publish: false });
    refreshHorizonCulling();
    rebuildEntries();
    publishOverlay();
    _rowControlsListener?.();
    nudgeRender();
  }

  /** DOE routes: the twelve monthly rows behind the arc, for the click card. */
  function indexMonthly(snapshot) {
    const byRoute = new Map();
    if (!snapshot.monthly) return byRoute;
    const byPair = new Map();
    for (const m of snapshot.monthly) {
      if (m.month < snapshot.span.from || m.month > snapshot.span.to) continue;
      const key = `${m.terminalId}|${m.country}`;
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key).push(m);
    }
    for (const route of snapshot.routes) {
      if (route.grade !== 'doe') continue;
      const rows = byPair.get(`${route.originId}|${route.doeCountry}`) ?? [];
      byRoute.set(
        route.id,
        [...rows].sort((a, b) => a.month.localeCompare(b.month)),
      );
    }
    return byRoute;
  }

  function adoptSnapshot(snapshot) {
    _snapshot = snapshot;
    _rows = snapshot.rows;
    _rowById = new Map(_rows.map((row) => [row.id, row]));
    _routeById = new Map(snapshot.routes.map((route) => [route.id, route]));
    _monthlyByRoute = indexMonthly(snapshot);
    _observation = createObservation({
      observedAt: `${snapshot.span.to}-01T00:00:00Z`,
      publishedAt: snapshot.published
        ? `${snapshot.published}T00:00:00Z`
        : null,
      fetchedAt: Date.now(),
      freshnessClass: 'published',
      source: 'DOE · EIA · GEM · GIIGNL',
      headline: snapshot.asOf,
    });
    clearEntities();
    createPins(_rows);
    createArcs(snapshot.routes);
    refreshHorizonCulling();
    rebuildEntries();
    publishOverlay();
    _rowControlsListener?.();
    nudgeRender();
  }

  // Layer --------------------------------------------------------------------

  const layer = {
    id: LNG_LAYER_ID,
    name: LNG_LAYER_NAME,
    icon: '🛢',
    source: 'GEM · DOE · EIA · GIIGNL',
    freshnessClass: 'published',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      _viewer = viewer;
      if (!_dataSource) {
        _dataSource = new Cesium.CustomDataSource(LNG_LAYER_ID);
        _dataSource.show = false;
        viewer.dataSources.add(_dataSource);
      }
      if (!_lines && viewer?.scene?.primitives) {
        _lines = new Cesium.PolylineCollection();
        _lines.show = false;
        viewer.scene.primitives.add(_lines);
      }
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (viewer && !_viewer) this.init(viewer);
      if (_dataSource) _dataSource.show = true;
      if (_lines) _lines.show = true;
      overlayHost.setVisible(LNG_OVERLAY_SOURCE_ID, true);
      installHandlers(_viewer);
      installCameraListeners(_viewer);
      installHorizonCulling(_viewer);
      refreshTier({ force: true });
      nudgeRender();
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
      if (_lines) _lines.show = false;
      overlayHost.clearSource(LNG_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(LNG_OVERLAY_SOURCE_ID, false);
      nudgeRender();
    },

    async update() {
      if (_snapshot) return true;
      _request?.abort();
      const controller = new AbortController();
      _request = controller;
      try {
        const started = performance.now();
        const snapshot = await source.getSnapshot({
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        const fetched = performance.now();
        adoptSnapshot(snapshot);
        _timing = {
          fetchMs: Math.round(fetched - started),
          adoptMs: Math.round(performance.now() - fetched),
        };
        _lastUpdate = Date.now();
        _lastError = null;
        if (_enabled) installHorizonCulling(_viewer);
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        _lastError = error?.message ?? String(error);
        return false;
      } finally {
        if (_request === controller) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      this.disable();
      clearEntities();
      if (_dataSource && viewer?.dataSources) {
        viewer.dataSources.remove(_dataSource, true);
      }
      if (_lines && viewer?.scene?.primitives) {
        viewer.scene.primitives.remove(_lines);
      }
      _lines = null;
      _dataSource = null;
      _snapshot = null;
      _rows = [];
      _rowById = new Map();
      _routeById = new Map();
      _viewer = null;
    },

    // Chips (§12.6.2 item 14): session-only until the options codec carries them.
    getRowControls() {
      if (!_snapshot) return { chips: [], legend: [] };
      const counts = _snapshot.counts;
      const chip = (id, label, count, title) => ({
        id,
        label: `${label} ${count}`,
        active: _chips[id],
        state: _chips[id] ? 'active' : 'idle',
        title,
        onClick: () => layer.setChip(id, !_chips[id]),
      });
      return {
        chips: [
          chip(
            'export',
            'EXPORT',
            counts.exportTerminals,
            'Liquefaction terminals, operating and under construction (GEM)',
          ),
          chip(
            'import',
            'IMPORT',
            counts.importTerminals,
            'Regasification terminals (GEM)',
          ),
          chip(
            'routes',
            'ROUTES',
            counts.routes,
            'Modelled sea routes: solid DOE cargo arcs, dashed GIIGNL annual arcs',
          ),
        ],
        legend: [],
      };
    },

    setRowControlsListener(listener) {
      _rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    setChip(id, on) {
      if (!CHIP_IDS.includes(id)) return null;
      const next = Boolean(on);
      if (_chips[id] === next) return next;
      _chips[id] = next;
      if (_snapshot) applyChips();
      return next;
    },

    getChips() {
      return { ..._chips };
    },

    flyToTerminal(id) {
      flyTo(_rowById.get(id), LNG_FLY_TO_HEIGHT_M);
    },

    zoomOutFromTerminal(id) {
      flyTo(_rowById.get(id), LNG_ZOOM_OUT_HEIGHT_M);
    },

    stepTerminal(delta) {
      const order = usDossierOrder(_rows);
      if (!order.length) return;
      const index = order.findIndex((row) => row.id === _selectedId);
      const next = order[(index + delta + order.length) % order.length];
      selectById(next.id, { fly: 'always' });
    },

    selectTerminal(id) {
      selectById(id);
    },

    selectRoute(id) {
      selectRoute(id, null);
    },

    clearTerminal() {
      clearSelection();
    },

    getAnalystRecords(maxCount = 64) {
      return _rows.slice(0, maxCount).map(mapAnalystRecord);
    },

    /** The card a terminal shows at the current tier, as plain data (QA). */
    getTerminalCard(id, tier = _tier) {
      const row = _rowById.get(id);
      const pin = _pins.get(id);
      if (!row || !pin) return null;
      const entry = createTerminalOverlayEntry(row, pin.position, tier);
      if (!entry) return null;
      return {
        id: entry.id,
        variant: entry.variant,
        title: entry.title,
        details: entry.details ?? [],
      };
    },

    /** The click card of a route, as plain data (QA). */
    getRouteCard(id) {
      const route = _routeById.get(id);
      const arc = _arcs.get(id);
      if (!route || !arc) return null;
      const card = buildRouteCard(route, arc.midpoint, {
        selected: true,
        monthly: _monthlyByRoute.get(id) ?? null,
      });
      return { id: card.id, title: card.title, details: card.details };
    },

    getStats() {
      const drawn = {
        export: _rows.filter((r) => r.kind === 'export' && _chips.export)
          .length,
        import: _rows.filter((r) => r.kind === 'import' && _chips.import)
          .length,
        routes: _chips.routes ? _routeById.size : 0,
      };
      return {
        count: _rows.length,
        terminals: _rows.length,
        exportTerminals: _snapshot?.counts.exportTerminals ?? 0,
        importTerminals: _snapshot?.counts.importTerminals ?? 0,
        routes: _snapshot?.counts.routes ?? 0,
        doeRoutes: _snapshot?.counts.doeRoutes ?? 0,
        giignlRoutes: _snapshot?.counts.giignlRoutes ?? 0,
        drawn,
        chips: { ..._chips },
        entities: _dataSource?.entities.values.length ?? 0,
        polylines: _lines?.length ?? 0,
        arcsPending: _arcsPending,
        lastUpdate: _lastUpdate,
        error: _lastError,
        timing: _timing,
        asOf: _snapshot?.asOf ?? null,
        source: _snapshot ? lngMetaLine(_snapshot, _chips) : layer.source,
        freshnessClass: 'published',
        observation: _observation,
        span: _snapshot?.span ?? null,
        latestMonth: _snapshot?.latestMonth ?? null,
        gemRelease: _snapshot?.gemRelease ?? null,
        matrixYear: _snapshot?.matrixYear ?? null,
        engine: _snapshot?.engine ?? null,
        tier: _tier,
        selectedId: _selectedId,
        selectedRouteId: _selectedRouteId,
        hoverId: _hoverId,
        hoverRouteId: _hoverRouteId,
        dossierOpen: Boolean(dossier?.isOpen?.()),
      };
    },
  };

  return layer;
}
