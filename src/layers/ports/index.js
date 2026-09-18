import * as Cesium from 'cesium';
import { horizonOccluder } from '../../data/iconOrientation.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  PORT_LAYER_ID,
  PORT_OVERLAY_SOURCE_ID,
  PORT_OVERLAY_COHORT_LIMIT,
  PORT_OVERLAY_COLLISION_CAPACITY,
  buildSelectedDisruptionCard,
  buildSelectedPortCard,
  createDisruptionOverlayEntry,
  createPortOverlayEntry,
  disruptionPosition,
  eventColor,
  eventLabel,
  groundRingPositions,
  mapAnalystRecord,
  mapDisruptionAnalystRecord,
  portPixelSize,
  portPosition,
  selectPortOverlayCohort,
  statusColor,
} from './model.js';
import { formatDeviation } from './records.js';
export * from './model.js';
export * from './records.js';
export { createPortWatchPortSource } from './source.js';

/** PortWatch publishes daily; a half-hour poll is plenty and polite. */
const UPDATE_INTERVAL_MS = 30 * 60_000;

/**
 * Own one port display: a marker per port sized by its annual tanker visits
 * and coloured by its 7-day versus 90-day tanker-call deviation, a ground
 * ring per recent PortWatch disruption, ambient labels for the busiest ports
 * and every disruption, and a selected detail card for either kind.
 */
export function createPortsLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Ports require a snapshot source');
  if (!overlayHost) throw new TypeError('Ports require an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(`Ports require context service ${method}`);
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError('Ports require a screen-space handler factory');

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _clickHandler = null;
  let _horizonCullRemovers = [];
  /** Always-on-top markers to horizon-cull: `{ entity, position, visible }`. */
  let _cullTargets = [];
  let _rows = [];
  let _disruptions = [];
  let _entries = [];
  /** @type {{kind: 'port'|'disruption', id: string}|null} */
  let _selected = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _latestDate = null;
  let _enabled = false;
  const _rowById = new Map();
  const _eventById = new Map();
  const _positionByKey = new Map();
  /** The registered (context-bearing) entity per selectable record. */
  const _anchorByKey = new Map();

  function selectionKey(kind, id) {
    return `${kind}:${id}`;
  }

  function publishOverlay() {
    if (!_enabled) return;
    const selectedKey = _selected
      ? selectionKey(_selected.kind, _selected.id)
      : null;
    const entries = _entries.filter((entry) => entry.id !== selectedKey);
    if (_selected) {
      const position = _positionByKey.get(selectedKey);
      if (_selected.kind === 'port') {
        const row = _rowById.get(_selected.id);
        if (row) entries.push(buildSelectedPortCard(row, position));
      } else {
        const event = _eventById.get(_selected.id);
        if (event) entries.push(buildSelectedDisruptionCard(event, position));
      }
    }
    overlayHost.setEntries(PORT_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: PORT_OVERLAY_COHORT_LIMIT + 1,
      collisionCapacity: PORT_OVERLAY_COLLISION_CAPACITY + 1,
      moving: false,
    });
  }

  function pickedSelection(entity) {
    if (entity?.__portId && _rowById.has(entity.__portId))
      return { kind: 'port', id: entity.__portId };
    if (entity?.__disruptionId && _eventById.has(entity.__disruptionId))
      return { kind: 'disruption', id: entity.__disruptionId };
    return null;
  }

  function select(entity) {
    const next = pickedSelection(entity);
    if (!next) return;
    // A ring segment is pickable, but the context lives on the anchor marker.
    const anchor = _anchorByKey.get(selectionKey(next.kind, next.id)) ?? entity;
    _selected = next;
    if (_viewer) _viewer.selectedEntity = anchor;
    context.selectEntityContext(anchor);
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    if (!_selected) return;
    _selected = null;
    const current = _viewer?.selectedEntity;
    if (current?.__portId || current?.__disruptionId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(PORT_LAYER_ID);
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
      if (pickedSelection(entity)) {
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

  /**
   * Hide the port and disruption markers that sit beyond the ellipsoid horizon.
   *
   * Same defect the chokepoints layer carried: these dots are always-on-top
   * (`disableDepthTestDistance: INFINITY`, so the quay a port sits on cannot
   * swallow its marker) and nothing writes far-side depth, so without this pass
   * every port on the opposite side of the planet painted straight through it.
   * At two thousand ports that reads as a haze of dots drifting over the globe.
   * The disruption rings are clamped to ground and the ambient labels already
   * horizon-cull, so only the dots leaked. Same occluder pass as the CCTV and
   * FIRMS layers.
   */
  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.()) return;
    const occluder = horizonOccluder(_viewer.camera);
    for (const target of _cullTargets) {
      const visible = occluder.isPointVisible(target.position) === true;
      // Assigning `show` rebuilds a ConstantProperty, so only write on a flip.
      if (target.visible === visible) continue;
      target.entity.point.show = visible;
      target.visible = visible;
    }
  }

  function installHorizonCulling(viewer) {
    if (_horizonCullRemovers.length || !viewer?.camera) return;
    // Event-driven, never a per-frame pass: a port never moves, so only the
    // camera can flip which side of the planet it is on. `moveEnd` is the
    // settle after a drag or flight; `changed` also catches a programmatic
    // `setView`, which raises no move events at all.
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

  function portContextProperties(row) {
    return {
      country: row.country,
      locode: row.locode,
      tankerCallsPerDayRecent: row.recentAvg,
      tankerCallsPerDayBaseline: row.baselineAvg,
      containerCallsPerDayRecent: row.recentContainers,
      deviationPct: row.deviationPct,
      status: row.status,
      recentDays: row.recentDays,
      baselineDays: row.baselineDays,
      annualTankerVisits: row.annualTankers,
      annualVesselVisits: row.annualVessels,
      latestDate: row.latestDate,
    };
  }

  function eventContextProperties(event) {
    return {
      eventType: eventLabel(event.type),
      severity: event.severity,
      alertLevel: event.alertLevel,
      country: event.country,
      from: event.from,
      to: event.to,
      affectedPortCount: event.affectedPortCount,
      affectedPorts: event.affectedPorts.join('; '),
    };
  }

  function resetIndexes() {
    _rowById.clear();
    _eventById.clear();
    _positionByKey.clear();
    _anchorByKey.clear();
  }

  const layer = {
    id: PORT_LAYER_ID,
    name: 'Ports · Tanker Calls',
    icon: '⚓',
    source: 'IMF PortWatch',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Ports layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(PORT_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _disruptions = [];
      _entries = [];
      _selected = null;
      _lastUpdate = null;
      _lastError = null;
      _latestDate = null;
      _enabled = false;
      overlayHost.setVisible(PORT_OVERLAY_SOURCE_ID, false);
      console.log('[Data:Ports] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(PORT_OVERLAY_SOURCE_ID, true);
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
      overlayHost.clearSource(PORT_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(PORT_OVERLAY_SOURCE_ID, false);
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
        if (!rows) throw new Error('Malformed port snapshot');
        const disruptions = Array.isArray(snapshot.disruptions)
          ? snapshot.disruptions
          : [];

        const entities = [];
        const entries = [];
        const cullTargets = [];
        resetIndexes();
        for (const row of rows) {
          const position = portPosition(row);
          const color = statusColor(row.status);
          const marker = new Cesium.Entity({
            id: `port:${row.id}`,
            position,
            // Pinned at a fixed height: a clamped point re-seats itself on every
            // terrain refinement and visibly hops under a tilted camera.
            point: {
              pixelSize: portPixelSize(row.annualTankers),
              color,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
              outlineWidth: 1.5,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: {
              portid: row.id,
              name: row.name,
              ...portContextProperties(row),
            },
          });
          marker.__portId = row.id;
          entities.push(marker);
          cullTargets.push({ entity: marker, position, visible: true });
          entries.push(createPortOverlayEntry(row, position));
          const key = selectionKey('port', row.id);
          _rowById.set(row.id, row);
          _positionByKey.set(key, position);
          _anchorByKey.set(key, marker);
          context.registerEntityContext(marker, {
            id: `${PORT_LAYER_ID}:${row.id}`,
            layerId: PORT_LAYER_ID,
            layerName: layer.name,
            source: 'IMF PortWatch',
            dataSource: _dataSource,
            label: `${row.name} · tanker calls ${formatDeviation(row.deviationPct)} vs ${row.baselineDays}d`,
            latitude: row.lat,
            longitude: row.lon,
            properties: portContextProperties(row),
          });
        }

        for (const event of disruptions) {
          const position = disruptionPosition(event);
          const color = eventColor(event.type);
          const anchor = new Cesium.Entity({
            id: `disruption:${event.id}`,
            position,
            point: {
              pixelSize: 8,
              color,
              outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: {
              eventid: event.id,
              name: event.name,
              ...eventContextProperties(event),
            },
          });
          anchor.__disruptionId = event.id;
          entities.push(anchor);
          cullTargets.push({ entity: anchor, position, visible: true });
          event.rings.forEach((ring, index) => {
            const outline = new Cesium.Entity({
              id: `disruption-ring:${event.id}:${index}`,
              polyline: {
                // A ground polyline draws on terrain; a clamped polygon
                // outline does not (Cesium drops it with a one-time warning).
                positions: groundRingPositions(ring),
                clampToGround: true,
                width: 2,
                material: color.withAlpha(0.85),
              },
            });
            outline.__disruptionId = event.id;
            entities.push(outline);
          });
          entries.push(createDisruptionOverlayEntry(event, position));
          const key = selectionKey('disruption', event.id);
          _eventById.set(event.id, event);
          _positionByKey.set(key, position);
          _anchorByKey.set(key, anchor);
          context.registerEntityContext(anchor, {
            id: `${PORT_LAYER_ID}:disruption:${event.id}`,
            layerId: PORT_LAYER_ID,
            layerName: layer.name,
            source: 'IMF PortWatch',
            dataSource: _dataSource,
            label: `${eventLabel(event.type)} · ${event.name}`,
            latitude: event.lat,
            longitude: event.lon,
            properties: eventContextProperties(event),
          });
        }

        _dataSource.entities.removeAll();
        for (const entity of entities) _dataSource.entities.add(entity);
        // A rebuild hands back fresh, unculled entities: re-cull immediately so
        // a refresh never flashes the far side of the planet back on.
        _cullTargets = cullTargets;
        refreshHorizonCulling();
        _entries = selectPortOverlayCohort(entries);
        if (
          _selected &&
          !_anchorByKey.has(selectionKey(_selected.kind, _selected.id))
        )
          _selected = null;
        _rows = rows;
        _disruptions = disruptions;
        _latestDate = snapshot.latestDate ?? null;
        _lastUpdate = Date.now();
        _lastError = null;
        publishOverlay();
        console.log(
          `[Data:Ports] Updated: ${rows.length} tanker ports of ${snapshot.registryCount ?? rows.length} in the registry, ${disruptions.length} disruptions (latest ${_latestDate ?? 'n/a'})`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Ports] Fetch error:', e);
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
      removeHorizonCulling();
      _cullTargets = [];
      overlayHost.clearSource(PORT_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(PORT_OVERLAY_SOURCE_ID, false);
      context.removeEntityContextsForLayer(PORT_LAYER_ID);
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _rows = [];
      _disruptions = [];
      _entries = [];
      resetIndexes();
      _lastUpdate = null;
      _lastError = null;
      _latestDate = null;
    },

    /** Plain records for the analyst query engine: disruptions first, then the busiest tanker ports; empty while hidden. */
    getAnalystRecords(maxCount = 64) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 64;
      const events = _disruptions.map(mapDisruptionAnalystRecord);
      const ports = _rows
        .slice()
        .sort((a, b) => (b.annualTankers ?? 0) - (a.annualTankers ?? 0))
        .slice(0, Math.max(0, limit - events.length))
        .map(mapAnalystRecord);
      return [...events, ...ports].slice(0, limit);
    },

    getStats() {
      return {
        count: _rows.length,
        disruptions: _disruptions.length,
        lastUpdate: _lastUpdate,
        error: _lastError,
        latestDate: _latestDate,
      };
    },
  };
  return layer;
}
