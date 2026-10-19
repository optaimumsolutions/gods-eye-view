import * as Cesium from 'cesium';
import { horizonOccluder } from '../../data/iconOrientation.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { isEmptySpacePick } from '../commodities/emptyPick.js';
import {
  GAS_OVERLAY_COHORT_LIMIT,
  GAS_OVERLAY_COLLISION_CAPACITY,
  GAS_OVERLAY_HOVER_THROTTLE_MS,
  GAS_OVERLAY_LAYER_ID,
  GAS_OVERLAY_SOURCE_ID,
  GAS_OVERLAY_TIER_GLOBAL,
  GAS_OVERLAY_TIER_REGIONAL,
  LINE_WIDTH_PX,
  NOTICE_RING_CSS,
  NOTICE_RING_EXTRA_PX,
  STATION_CSS,
  STATION_PX,
  buildHoverPointCard,
  buildHoverStationCard,
  buildSelectedPointCard,
  createPipelineOverlayEntry,
  createPointOverlayEntry,
  detailTierForHeight,
  legendEntries,
  partColor,
  pointPixelSize,
  utilizationColor,
  selectOverlayCohort,
} from './model.js';
import { mapAnalystRecord } from './records.js';
export * from './model.js';
export * from './records.js';
export {
  createGasOverlaySource,
  GAS_OVERLAY_URLS,
  PIPELINE_OVERLAY_URL,
} from './source.js';

/** A new gas day lands once a day; the poll reads the shared oracle memo. */
const UPDATE_INTERVAL_MS = 10 * 60_000;

/**
 * Own the pipeline overlay (docs/COMMODITIES-PLAN.md §19 P4): the P1
 * linework as one batched ground primitive whose parts carry the
 * utilization ramp of their nearest posted point, the P2 meter points as
 * pinned marks sized by design capacity and coloured by scheduled ÷ design
 * on the newest gas day, the compressor stations, and an amber ring on
 * every point or station a critical notice names. Geometry never moves; a
 * new gas day only restyles.
 */
export function createGasOverlayLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Gas overlay requires a snapshot source');
  if (!overlayHost) throw new TypeError('Gas overlay requires an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Gas overlay requires context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('Gas overlay requires a screen-space handler factory');

  let _viewer = null;
  let _request = null;
  let _network = null;
  let _networkStyled = false;
  let _removeReadyProbe = null;
  let _points = null;
  let _stations = null;
  let _rings = null;
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
  let _tier = GAS_OVERLAY_TIER_GLOBAL;
  let _enabled = false;
  const _rowById = new Map();
  const _stationById = new Map();
  const _pointPrims = new Map();
  const _stationPrims = new Map();
  const _positionById = new Map();
  /** Ambient pipeline-card anchors: pipeline id -> Cartesian3. */
  const _pipelineAnchors = new Map();
  const _contexts = new Map();

  const cameraHeight = () => _viewer?.camera?.positionCartographic?.height;
  const currentTier = () => detailTierForHeight(cameraHeight());

  function cssColor(css, alpha) {
    return Cesium.Color.fromCssColorString(css).withAlpha(alpha);
  }

  /* ---------------------------------------------------------------- *
   * Marks
   * ---------------------------------------------------------------- */

  /**
   * One batched ground primitive for both pipelines' linework, each part a
   * geometry instance whose colour is its nearest posted point's ramp (the
   * founder PRD's segment rule). Built once; a new gas day restyles the
   * instances through `getGeometryInstanceAttributes` once the primitive is
   * ready (the gasFlows pattern).
   */
  function buildNetwork() {
    if (_network || !_viewer || !_snapshot) return;
    const instances = [];
    for (const pipeline of _snapshot.pipelines) {
      for (const { index, part, utilization } of pipeline.parts) {
        const positions = Cesium.Cartesian3.fromDegreesArray(part.flat());
        if (positions.length < 2) continue;
        instances.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.GroundPolylineGeometry({
              positions,
              width: LINE_WIDTH_PX,
              granularity: 0,
            }),
            id: `gas-overlay-part:${pipeline.id}:${index}`,
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                partColor(utilization),
              ),
            },
          }),
        );
      }
    }
    if (!instances.length) return;
    _network = new Cesium.GroundPolylinePrimitive({
      geometryInstances: instances,
      classificationType: Cesium.ClassificationType.BOTH,
      appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
      asynchronous: true,
      allowPicking: false,
      show: _enabled,
    });
    _viewer.scene.groundPrimitives.add(_network);
    _networkStyled = true;
  }

  /** Re-colour the parts for a fresh snapshot once the primitive is ready. */
  function restyleNetwork() {
    if (!_network || !_snapshot || _networkStyled) return;
    if (!_network.ready) {
      installReadyProbe();
      return;
    }
    for (const pipeline of _snapshot.pipelines) {
      for (const { index, utilization } of pipeline.parts) {
        const attributes = _network.getGeometryInstanceAttributes(
          `gas-overlay-part:${pipeline.id}:${index}`,
        );
        if (attributes)
          attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(
            partColor(utilization),
          );
      }
    }
    _networkStyled = true;
    removeReadyProbe();
  }

  function installReadyProbe() {
    if (_removeReadyProbe || !_viewer?.scene?.postRender) return;
    _removeReadyProbe = _viewer.scene.postRender.addEventListener(() => {
      if (_network?.ready) restyleNetwork();
    });
  }

  function removeReadyProbe() {
    _removeReadyProbe?.();
    _removeReadyProbe = null;
  }

  function registerPointContext(row) {
    let pseudo = _contexts.get(row.id);
    if (pseudo) return pseudo;
    pseudo = { id: `gas-overlay:${row.id}`, show: true };
    context.registerEntityContext(pseudo, {
      id: `${GAS_OVERLAY_LAYER_ID}:${row.id}`,
      layerId: GAS_OVERLAY_LAYER_ID,
      layerName: layer.name,
      source: 'pipeline postings (FERC 18 CFR 284.13)',
      dataSource: null,
      label: `${row.name} · Loc ${row.loc} (${row.pipeline})`,
      latitude: row.lat,
      longitude: row.lon,
      properties: mapAnalystRecord(row),
    });
    _contexts.set(row.id, pseudo);
    return pseudo;
  }

  /** Points, stations and notice rings, created once from the bundles. */
  function ensureMarks() {
    if (_points || !_viewer?.scene?.primitives || !_snapshot) return;
    _points = new Cesium.PointPrimitiveCollection();
    _stations = new Cesium.PointPrimitiveCollection();
    _rings = new Cesium.PointPrimitiveCollection();
    for (const c of [_points, _stations, _rings]) {
      c.show = false;
      _viewer.scene.primitives.add(c);
    }
    for (const row of _snapshot.points) {
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
      _positionById.set(row.id, position);
      const prim = _points.add({
        id: Object.freeze({ gasOverlayPointId: row.id }),
        position,
        pixelSize: pointPixelSize(row.designDth, _snapshot.designMax),
        color: utilizationColor(row.utilization),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
        outlineWidth: 1,
        // Pinned (§2.2): never CLAMP_TO_GROUND; the disabled depth test
        // keeps a mark drawn where terrain sits above the ellipsoid.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
      });
      _pointPrims.set(row.id, prim);
    }
    for (const station of _snapshot.stations) {
      const position = Cesium.Cartesian3.fromDegrees(station.lon, station.lat);
      _positionById.set(`station:${station.id}`, position);
      const prim = _stations.add({
        id: Object.freeze({ gasOverlayStationId: station.id }),
        position,
        pixelSize: STATION_PX,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: cssColor(STATION_CSS, 0.85),
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
      });
      _stationPrims.set(station.id, prim);
    }
    rebuildRings();
  }

  /** A fresh gas day restyles the point marks; positions never change. */
  function restyleMarks() {
    if (!_points || !_snapshot) return;
    for (const row of _snapshot.points) {
      const prim = _pointPrims.get(row.id);
      if (!prim) continue;
      prim.color = utilizationColor(row.utilization);
      prim.pixelSize = pointPixelSize(row.designDth, _snapshot.designMax, {
        hovered: _hover?.kind === 'point' && _hover.id === row.id,
      });
    }
    rebuildRings();
  }

  /** The amber notice rings; the only marks rebuilt per refresh. */
  function rebuildRings() {
    if (!_rings || !_snapshot) return;
    _rings.removeAll();
    const flagged = [
      ..._snapshot.points
        .filter((row) => row.noticeIds.length)
        .map((row) => ({
          position: _positionById.get(row.id),
          size:
            pointPixelSize(row.designDth, _snapshot.designMax) +
            NOTICE_RING_EXTRA_PX,
        })),
      ..._snapshot.stations
        .filter((station) => station.noticeIds.length)
        .map((station) => ({
          position: _positionById.get(`station:${station.id}`),
          size: STATION_PX + NOTICE_RING_EXTRA_PX,
        })),
    ];
    for (const { position, size } of flagged) {
      if (!position) continue;
      _rings.add({
        position,
        pixelSize: size,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: cssColor(NOTICE_RING_CSS, 0.9),
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
      });
    }
  }

  /** Each pipeline's ambient card sits on its longest part's midpoint. */
  function computeAnchors() {
    for (const pipeline of _snapshot.pipelines) {
      if (_pipelineAnchors.has(pipeline.id)) continue;
      const longest = pipeline.parts.reduce(
        (best, entry) =>
          !best || entry.part.length > best.part.length ? entry : best,
        null,
      );
      if (!longest) continue;
      const [lon, lat] = longest.part[Math.floor(longest.part.length / 2)];
      _pipelineAnchors.set(
        pipeline.id,
        Cesium.Cartesian3.fromDegrees(lon, lat),
      );
    }
  }

  function applyTier() {
    const marksOn = _enabled && _tier === GAS_OVERLAY_TIER_REGIONAL;
    if (_points && _points.show !== marksOn) _points.show = marksOn;
    if (_stations && _stations.show !== marksOn) _stations.show = marksOn;
    if (_rings && _rings.show !== marksOn) _rings.show = marksOn;
    if (_network && _network.show !== _enabled) _network.show = _enabled;
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
    if (_tier === GAS_OVERLAY_TIER_GLOBAL) {
      const occluder = _viewer?.camera ? horizonOccluder(_viewer.camera) : null;
      for (const pipeline of _snapshot.pipelines) {
        const anchor = _pipelineAnchors.get(pipeline.id);
        if (!anchor) continue;
        if (occluder && occluder.isPointVisible(anchor) !== true) continue;
        entries.push(createPipelineOverlayEntry(pipeline, anchor));
      }
    } else {
      for (const row of _snapshot.points) {
        const entry = createPointOverlayEntry(row);
        if (!entry) continue;
        entry.position = _positionById.get(row.id);
        entries.push(entry);
      }
    }
    _entries = selectOverlayCohort(entries);
  }

  function publishOverlay() {
    if (!_enabled) return;
    const hoverEntryId = _hover?.kind === 'point' ? `point:${_hover.id}` : null;
    const selectedEntryId = _selectedId ? `point:${_selectedId}` : null;
    const entries = _entries.filter(
      (entry) => entry.id !== hoverEntryId && entry.id !== selectedEntryId,
    );
    if (_hover && !(_hover.kind === 'point' && _hover.id === _selectedId)) {
      if (_hover.kind === 'point') {
        const row = _rowById.get(_hover.id);
        const position = _positionById.get(_hover.id);
        if (row && position)
          entries.push(buildHoverPointCard(row, position, _snapshot));
      } else {
        const station = _stationById.get(_hover.id);
        const position = _positionById.get(`station:${_hover.id}`);
        if (station && position)
          entries.push(buildHoverStationCard(station, position, _snapshot));
      }
    }
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    const selectedPosition = _selectedId
      ? _positionById.get(_selectedId)
      : null;
    if (selected && selectedPosition)
      entries.push(
        buildSelectedPointCard(selected, selectedPosition, _snapshot),
      );
    overlayHost.setEntries(GAS_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: GAS_OVERLAY_COHORT_LIMIT + 2,
      collisionCapacity: GAS_OVERLAY_COLLISION_CAPACITY + 2,
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
   * Camera
   * ---------------------------------------------------------------- */

  function onCameraMoveStart() {
    _cameraMoving = true;
    if (_hover) setHover(null);
  }

  function onCameraMoveEnd() {
    _cameraMoving = false;
    if (!_enabled) return;
    refreshTier({ force: true }); // the global cards horizon-cull per view
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

  /* ---------------------------------------------------------------- *
   * Hover and selection
   * ---------------------------------------------------------------- */

  function setHover(next) {
    const same =
      (next === null && _hover === null) ||
      (next && _hover && next.kind === _hover.kind && next.id === _hover.id);
    if (same) return;
    const previous = _hover;
    _hover = next;
    for (const target of [previous, next]) {
      if (!target || target.kind !== 'point') continue;
      const prim = _pointPrims.get(target.id);
      const row = _rowById.get(target.id);
      if (prim && row && _snapshot)
        prim.pixelSize = pointPixelSize(row.designDth, _snapshot.designMax, {
          hovered: next?.kind === 'point' && next.id === target.id,
        });
    }
    const canvas = _viewer?.scene?.canvas;
    if (canvas?.style) canvas.style.cursor = next ? 'pointer' : '';
    publishOverlay();
  }

  function pickedTarget(picked) {
    if (!picked) return null;
    const id = picked.id;
    if (
      id?.gasOverlayPointId !== undefined &&
      _rowById.has(id.gasOverlayPointId)
    )
      return { kind: 'point', id: id.gasOverlayPointId };
    if (
      id?.gasOverlayStationId !== undefined &&
      _stationById.has(id.gasOverlayStationId)
    )
      return { kind: 'station', id: id.gasOverlayStationId };
    return null;
  }

  function handleHoverMove(position) {
    if (!_enabled || _cameraMoving || !position || !_viewer) return;
    if (!isPointerFree()) {
      if (_hover) setHover(null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < GAS_OVERLAY_HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    setHover(pickedTarget(picked));
  }

  function selectById(id) {
    const row = _rowById.get(id);
    if (!row) return;
    _selectedId = id;
    context.selectEntityContext(registerPointContext(row));
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selectedId) return;
    _selectedId = null;
    context.clearSelectedEntityContextForLayer(GAS_OVERLAY_LAYER_ID);
    if (publish) publishOverlay();
  }

  function onForeignSelection(event) {
    const layerId = event?.detail?.layerId;
    if (!_selectedId || layerId === GAS_OVERLAY_LAYER_ID) return;
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
      if (target?.kind === 'point') {
        selectById(target.id);
        return;
      }
      if (target?.kind === 'station') return; // hover card only in P4
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
    id: GAS_OVERLAY_LAYER_ID,
    name: 'Gas · Pipeline Utilization',
    icon: '⛽',
    source: 'pipeline postings (FERC)',
    freshnessClass: 'daily',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Gas overlay layer is already initialized');
      _viewer = viewer;
      _snapshot = null;
      _entries = [];
      _selectedId = null;
      _hover = null;
      _lastUpdate = null;
      _lastError = null;
      _tier = GAS_OVERLAY_TIER_GLOBAL;
      _enabled = false;
      overlayHost.setVisible(GAS_OVERLAY_SOURCE_ID, false);
      console.log('[Data:GasOverlay] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      overlayHost.setVisible(GAS_OVERLAY_SOURCE_ID, true);
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
      removeReadyProbe();
      applyTier();
      overlayHost.clearSource(GAS_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(GAS_OVERLAY_SOURCE_ID, false);
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
        if (!Array.isArray(snapshot?.points))
          throw new Error('Malformed gas overlay snapshot');
        _snapshot = snapshot;
        _rowById.clear();
        _stationById.clear();
        for (const row of snapshot.points) _rowById.set(row.id, row);
        for (const station of snapshot.stations)
          _stationById.set(station.id, station);
        computeAnchors();
        const hadNetwork = Boolean(_network);
        buildNetwork();
        if (hadNetwork) {
          // A fresh gas day re-colours the existing instances.
          _networkStyled = false;
          restyleNetwork();
        }
        ensureMarks();
        restyleMarks();
        _lastUpdate = Date.now();
        _lastError = snapshot.live ? null : snapshot.error;
        refreshTier({ force: true });
        console.log(
          `[Data:GasOverlay] Updated: ${snapshot.counts.withData} of ${snapshot.counts.points} points read` +
            (snapshot.live
              ? ` (gas day ${snapshot.pipelines[0]?.gasDay ?? 'n/a'})`
              : ' (bundle only: no live route)'),
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:GasOverlay] Load error:', e);
        _lastError = e?.message || 'Gas overlay unavailable';
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
      removeReadyProbe();
      overlayHost.clearSource(GAS_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(GAS_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(GAS_OVERLAY_LAYER_ID);
      if (_network) {
        viewer?.scene?.groundPrimitives?.remove(_network);
        _network = null;
      }
      for (const collection of [_points, _stations, _rings]) {
        if (collection) viewer?.scene?.primitives?.remove(collection);
      }
      _points = null;
      _stations = null;
      _rings = null;
      _viewer = null;
      _snapshot = null;
      _entries = [];
      _rowById.clear();
      _stationById.clear();
      _pointPrims.clear();
      _stationPrims.clear();
      _positionById.clear();
      _pipelineAnchors.clear();
      _contexts.clear();
      _lastUpdate = null;
      _lastError = null;
    },

    /** Voice and QA hooks. */
    selectPoint(id) {
      selectById(id);
    },
    clearPoint() {
      clearSelection();
    },

    /** The panel row's colour legend: the utilization ramp with counts. */
    getRowControls() {
      return { chips: [], legend: legendEntries(_snapshot) };
    },

    /** Plain records for the analyst query engine; empty while hidden. */
    getAnalystRecords(maxCount = 64) {
      if (!_enabled || !_snapshot) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 64;
      return _snapshot.points
        .filter((row) => Number.isFinite(row.utilization))
        .sort((a, b) => b.utilization - a.utilization)
        .slice(0, limit)
        .map(mapAnalystRecord);
    },

    getStats() {
      const pipelines = (_snapshot?.pipelines ?? []).map((p) => ({
        id: p.id,
        gasDay: p.gasDay,
        cycle: p.cycle,
        litPoints: p.litPoints,
        medianUtilization: p.medianUtilization,
        overDesign: p.overDesign,
        notices: p.notices.length,
        freshness: p.freshness,
      }));
      return {
        count: _snapshot?.counts.withData ?? 0,
        countLabel: _snapshot ? `${_snapshot.counts.withData} read` : null,
        pinned: _snapshot?.counts.points ?? 0,
        stations: _snapshot?.counts.stations ?? 0,
        flagged: _snapshot?.counts.flagged ?? 0,
        notices: _snapshot?.counts.notices ?? 0,
        live: _snapshot?.live ?? false,
        pipelines,
        drawn: {
          points: _pointPrims.size,
          stations: _stationPrims.size,
          rings: _rings?.length ?? 0,
          parts: _network ? 'built' : 'none',
        },
        asOf: pipelines[0]?.gasDay ?? null,
        freshnessClass: 'daily',
        source: 'pipeline postings (FERC)',
        lastUpdate: _lastUpdate,
        error: _lastError,
        tier: _tier,
        selectedId: _selectedId,
        hoverId: _hover ? `${_hover.kind}:${_hover.id}` : null,
        // The hover card as published, so the headless QA can read the P4
        // gate's five facts off the same build the overlay draws.
        hoverCard:
          _hover?.kind === 'point' && _snapshot
            ? (() => {
                const row = _rowById.get(_hover.id);
                const position = _positionById.get(_hover.id);
                return row && position
                  ? buildHoverPointCard(row, position, _snapshot).details
                  : null;
              })()
            : null,
      };
    },
  };
  return layer;
}
