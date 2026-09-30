import * as Cesium from 'cesium';
import { horizonOccluder } from '../../data/iconOrientation.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { formatAsOf } from '../commodities/observation.js';
import {
  BAND_LABELS,
  WEATHER_LAYER_ID,
  WEATHER_OVERLAY_COHORT_LIMIT,
  WEATHER_OVERLAY_COLLISION_CAPACITY,
  WEATHER_OVERLAY_SOURCE_ID,
  bandColor,
  bandCss,
  buildSelectedWeatherCard,
  createWeatherOverlayEntry,
  discShare,
  groundCirclePositions,
  hoverLines,
  ringRadiusMeters,
  selectWeatherOverlayCohort,
  selectedDay,
  weatherPosition,
} from './model.js';
import { MODEL_LABELS, mapAnalystRecord } from './records.js';
import { DEFAULT_LEAD, getForecastScrubber } from './scrubber.js';
export * from './model.js';
export { createOpenMeteoEnsembleSource } from './source.js';

/** W6: read the model's metadata every 30 minutes; data only on a new run. */
const UPDATE_INTERVAL_MS = 30 * 60_000;
const HOVER_THROTTLE_MS = 80;

/**
 * Row 3 (docs/COMMODITIES-PLAN.md §11): ten pinned markers — six basins, two
 * demand regions, two Gulf points — coloured by the selected day's minimum
 * against its ERA5 normal, ringed by ensemble spread, filled by the share of
 * the window past a printed threshold, and faded by confidence (lead-time
 * skill × spread). One shared scrubber walks the window; the layer restyles
 * without a fetch. Geometry is created once from the first snapshot's
 * gazetteer rows and never recreated.
 */
export function createWeatherForecastLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
  scrubber = null,
  dossier = null,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Weather forecast requires a snapshot source');
  if (!overlayHost)
    throw new TypeError('Weather forecast requires an overlay host');
  for (const method of [
    'registerEntityContext',
    'selectEntityContext',
    'clearSelectedEntityContextForLayer',
    'removeEntityContextsForLayer',
  ]) {
    if (typeof context?.[method] !== 'function')
      throw new TypeError(
        `Weather forecast requires context service ${method}`,
      );
  }
  if (typeof screenSpaceEventHandlerFactory !== 'function')
    throw new TypeError(
      'Weather forecast requires a screen-space handler factory',
    );

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _handler = null;
  let _horizonCullRemovers = [];
  let _unsubscribeScrubber = null;
  let _rows = [];
  let _entries = [];
  let _selectedId = null;
  let _hoverId = null;
  let _hoverLastPickAt = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _meta = null;
  let _lead = DEFAULT_LEAD;
  let _enabled = false;
  let _sourceLabel =
    MODEL_LABELS[source.model] ||
    source.label ||
    'ECMWF AIFS ENS via Open-Meteo';
  const _rowById = new Map();
  const _positionById = new Map();
  /** Pinned entities per entry id: `{ ring, disc, radius, visible }`. */
  const _pinsById = new Map();

  function scrub() {
    if (scrubber) return scrubber;
    if (typeof document === 'undefined') return null;
    scrubber = getForecastScrubber({ document });
    return scrubber;
  }

  function rebuildEntries() {
    const entries = _rows.map((row) =>
      createWeatherOverlayEntry(row, _lead, _positionById.get(row.id)),
    );
    _entries = selectWeatherOverlayCohort(entries);
  }

  function publishOverlay() {
    if (!_enabled) return;
    const entries = _entries.filter(
      (entry) => entry.id !== _selectedId && entry.id !== _hoverId,
    );
    const hovered =
      _hoverId && _hoverId !== _selectedId ? _rowById.get(_hoverId) : null;
    if (hovered) {
      const [title, stamp, headline] = hoverLines(hovered, _lead, formatAsOf);
      entries.push({
        id: `hover-weather:${hovered.id}`,
        position: _positionById.get(hovered.id),
        variant: 'card',
        title,
        details: [stamp, headline],
        accent: bandCss(selectedDay(hovered, _lead)?.band),
        priority: Number.MAX_SAFE_INTEGER - 1,
        horizonCull: true,
        terrainOcclusion: false,
      });
    }
    const selected = _selectedId ? _rowById.get(_selectedId) : null;
    if (selected)
      entries.push(
        buildSelectedWeatherCard(
          selected,
          _lead,
          _positionById.get(selected.id),
          formatAsOf,
        ),
      );
    overlayHost.setEntries(WEATHER_OVERLAY_SOURCE_ID, entries, {
      cohortLimit: WEATHER_OVERLAY_COHORT_LIMIT + 2,
      collisionCapacity: WEATHER_OVERLAY_COLLISION_CAPACITY + 2,
      moving: false,
    });
  }

  function contextProperties(row) {
    return mapAnalystRecord(row, _lead);
  }

  function registerContext(ring, row) {
    const day = selectedDay(row, _lead);
    context.registerEntityContext(ring, {
      id: `${WEATHER_LAYER_ID}:${row.id}`,
      layerId: WEATHER_LAYER_ID,
      layerName: layer.name,
      source: _sourceLabel,
      dataSource: _dataSource,
      label: day
        ? `${row.name} · ${formatAsOf(day.observation)} · ${BAND_LABELS[day.band]}`
        : `${row.name} · forecast awaiting run`,
      latitude: row.lat,
      longitude: row.lon,
      properties: contextProperties(row),
    });
  }

  /** Create every entry's pinned geometry once; positions never change after this. */
  function createPins(rows) {
    for (const row of rows) {
      if (_pinsById.has(row.id)) continue;
      const position = weatherPosition(row);
      const radius = ringRadiusMeters(null);
      const color = bandColor('unknown');
      const ring = new Cesium.Entity({
        id: `weather:${row.id}`,
        position,
        polyline: {
          positions: groundCirclePositions(row.lon, row.lat, radius),
          clampToGround: true,
          width: 2.5,
          material: color,
        },
        point: {
          pixelSize: 9,
          color,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { id: row.id, name: row.name },
      });
      ring.__weatherId = row.id;
      const disc = new Cesium.Entity({
        id: `weather-disc:${row.id}`,
        position,
        ellipse: {
          semiMajorAxis: radius * 0.01,
          semiMinorAxis: radius * 0.01,
          material: new Cesium.ColorMaterialProperty(color.withAlpha(0.3)),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      disc.__weatherId = row.id;
      _dataSource.entities.add(ring);
      _dataSource.entities.add(disc);
      _pinsById.set(row.id, { ring, disc, radius, visible: true });
      _positionById.set(row.id, position);
    }
  }

  /** Restyle one pin from its row for the selected lead; position untouched. */
  function restyle(row) {
    const pin = _pinsById.get(row.id);
    if (!pin) return false;
    const day = selectedDay(row, _lead);
    const alpha = day?.confidence?.alpha ?? 1;
    const color = bandColor(day?.band, alpha);
    const radius = ringRadiusMeters(day?.tmin?.spread);
    if (radius !== pin.radius) {
      pin.ring.polyline.positions = groundCirclePositions(
        row.lon,
        row.lat,
        radius,
      );
      pin.radius = radius;
    }
    const hovered = _hoverId === row.id;
    pin.ring.polyline.material = color.withAlpha(
      Math.min(1, alpha * (hovered ? 1 : 0.9)),
    );
    pin.ring.polyline.width = hovered ? 3.5 : 2.5;
    pin.ring.point.color = color.withAlpha(Math.max(0.5, alpha));
    const inner = Math.max(radius * 0.02, radius * Math.min(1, discShare(row)));
    pin.disc.ellipse.semiMajorAxis = inner;
    pin.disc.ellipse.semiMinorAxis = inner;
    pin.disc.ellipse.material = color.withAlpha(0.35 * alpha);
    pin.ring.properties = {
      id: row.id,
      name: row.name,
      ...contextProperties(row),
    };
    registerContext(pin.ring, row);
    return true;
  }

  function restyleAll() {
    for (const row of _rows) restyle(row);
    rebuildEntries();
    publishOverlay();
    if (_selectedId && dossier?.isOpen?.())
      dossier.show(_rowById.get(_selectedId), _lead);
  }

  function onLead(lead) {
    if (lead === _lead) return;
    _lead = lead;
    restyleAll();
  }

  function select(entity) {
    const id = entity?.__weatherId;
    if (!id || !_pinsById.has(id)) return;
    const anchor = _pinsById.get(id).ring;
    _selectedId = id;
    if (_viewer) _viewer.selectedEntity = anchor;
    context.selectEntityContext(anchor);
    dossier?.show?.(_rowById.get(id), _lead);
    publishOverlay();
  }

  function clearSelection({ publish = true } = {}) {
    dossier?.hide?.();
    if (!_selectedId) return;
    _selectedId = null;
    if (_viewer?.selectedEntity?.__weatherId)
      _viewer.selectedEntity = undefined;
    context.clearSelectedEntityContextForLayer(WEATHER_LAYER_ID);
    if (publish) publishOverlay();
  }

  function setHover(id) {
    if (id === _hoverId) return;
    const previous = _hoverId;
    _hoverId = id;
    for (const rid of [previous, id]) {
      const row = rid && _rowById.get(rid);
      if (row) restyle(row);
    }
    publishOverlay();
  }

  function handleHoverMove(position) {
    if (!_enabled || !position || !_viewer) return;
    // R5: hover stays silent while a tool or the cockpit owns the pointer
    if (!isPointerFree()) {
      if (_hoverId) setHover(null);
      return;
    }
    const now = Date.now();
    if (now - _hoverLastPickAt < HOVER_THROTTLE_MS) return;
    _hoverLastPickAt = now;
    let picked = null;
    try {
      picked = _viewer.scene.pick(position);
    } catch {
      picked = null;
    }
    setHover(picked?.id?.__weatherId ?? null);
  }

  function installHandlers(viewer) {
    if (_handler || !viewer?.scene?.canvas) return;
    _handler = screenSpaceEventHandlerFactory(viewer.scene.canvas);
    _handler.setInputAction((click) => {
      if (!_enabled || !isPointerFree()) return;
      const picked = viewer.scene.pick(click.position);
      const entity = picked?.id;
      if (entity?.__weatherId) {
        select(entity);
        return;
      }
      if (picked) return;
      clearSelection();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    _handler.setInputAction((movement) => {
      handleHoverMove(movement?.endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  function removeHandlers() {
    if (_handler) {
      _handler.destroy();
      _handler = null;
    }
    setHover(null);
  }

  function refreshHorizonCulling() {
    if (!_enabled || !_viewer || _viewer.isDestroyed?.()) return;
    const occluder = horizonOccluder(_viewer.camera);
    for (const [id, pin] of _pinsById) {
      const visible = occluder.isPointVisible(_positionById.get(id)) === true;
      if (pin.visible === visible) continue;
      pin.ring.point.show = visible;
      pin.visible = visible;
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

  function metaLine() {
    if (!_meta)
      return _lastError ? `no run · ${_lastError}` : 'awaiting first run';
    const issued = new Date(_meta.initialisedAt);
    const ageH = Math.floor(
      (Date.now() - Date.parse(_meta.availableAt)) / 3_600_000,
    );
    const stale = ageH >= 24;
    const pad = (n) => String(n).padStart(2, '0');
    return `issued ${pad(issued.getUTCHours())}Z ${pad(issued.getUTCMonth() + 1)}-${pad(issued.getUTCDate())} · ${ageH}h ago · ${stale ? 'stale' : `valid ${_rows[0]?.days.length ?? 15}d`}`;
  }

  const layer = {
    id: WEATHER_LAYER_ID,
    name: 'Weather · Basin Forecast',
    icon: '🌡️',
    source: 'ECMWF AIFS ENS via Open-Meteo',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer)
        throw new Error('Weather forecast layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(WEATHER_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _rows = [];
      _entries = [];
      _selectedId = null;
      _hoverId = null;
      _lastUpdate = null;
      _lastError = null;
      _meta = null;
      _enabled = false;
      overlayHost.setVisible(WEATHER_OVERLAY_SOURCE_ID, false);
      console.log('[Data:Weather] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(WEATHER_OVERLAY_SOURCE_ID, true);
      installHandlers(viewer);
      installHorizonCulling(viewer);
      const s = scrub();
      if (s) {
        s.acquire(WEATHER_LAYER_ID);
        _lead = s.getLead();
        _unsubscribeScrubber = s.subscribe(onLead);
      }
      publishOverlay();
    },

    disable() {
      _request?.abort();
      _request = null;
      clearSelection({ publish: false });
      _enabled = false;
      removeHandlers();
      removeHorizonCulling();
      _unsubscribeScrubber?.();
      _unsubscribeScrubber = null;
      scrubber?.release(WEATHER_LAYER_ID);
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(WEATHER_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(WEATHER_OVERLAY_SOURCE_ID, false);
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
        if (!rows) throw new Error('Malformed weather snapshot');
        _sourceLabel = MODEL_LABELS[snapshot.model] || _sourceLabel;
        createPins(rows);
        _rows = rows;
        for (const row of rows) _rowById.set(row.id, row);
        _meta = snapshot.meta;
        const s = scrub();
        if (s) {
          const horizon = Math.max(0, (rows[0]?.days.length ?? 15) - 1);
          const issued = new Date(_meta.initialisedAt);
          const pad = (n) => String(n).padStart(2, '0');
          s.setHorizon({
            horizon,
            label: _sourceLabel,
            issued: `issued ${pad(issued.getUTCHours())}Z ${pad(issued.getUTCMonth() + 1)}-${pad(issued.getUTCDate())}`,
          });
          _lead = s.getLead();
        }
        restyleAll();
        _lastUpdate = Date.now();
        _lastError = snapshot.errors?.ensemble || null;
        console.log(
          `[Data:Weather] Updated: ${rows.length} markers, run ${_meta.initialisedAt}`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Weather] Fetch error:', e);
        _lastError = e?.message || 'Open-Meteo unavailable';
        return _rows.length > 0; // a cached run stays on the map
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      this.disable();
      context.removeEntityContextsForLayer(WEATHER_LAYER_ID);
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
      _meta = null;
    },

    clearSelection: () => clearSelection(),
    /** The scrubber's lead, for tests and the analyst engine. */
    getSelectedLead: () => _lead,
    setSelectedLead(lead) {
      const s = scrub();
      if (s) s.setLead(lead);
      else onLead(lead);
    },

    getRowControls() {
      return {
        chips: [
          {
            id: 'reset-day',
            label: `D+${_lead} · RESET`,
            title: 'Return the forecast window to D+1',
            disabled: !_enabled || _lead === DEFAULT_LEAD,
            onClick: () => layer.setSelectedLead(DEFAULT_LEAD),
          },
        ],
        legend: [
          ...[
            'much-colder',
            'colder',
            'near-normal',
            'warmer',
            'much-warmer',
          ].map((band) => ({
            label: BAND_LABELS[band],
            color: bandCss(band),
            count: _rows.filter((r) => selectedDay(r, _lead)?.band === band)
              .length,
          })),
          {
            label: 'confident · unsure · very unsure',
            color: '#6b7280',
            blurb: `Fade = lead-time skill × ensemble spread. ${
              _rows[0]?.days?.[1]?.confidence?.skillLabel || 'skill not loaded'
            }. Ring radius = spread; disc = share of the window past the printed heuristic.`,
          },
        ],
      };
    },

    getAnalystRecords(maxCount = 64) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 64;
      return _rows.slice(0, limit).map((row) => mapAnalystRecord(row, _lead));
    },

    getStats() {
      return {
        count: _rows.length,
        countLabel: _rows.length ? `${_rows.length} · ${metaLine()}` : '',
        pinned: _pinsById.size,
        lastUpdate: _lastUpdate,
        error: _lastError,
        issuedAt: _meta?.initialisedAt ?? null,
        availableAt: _meta?.availableAt ?? null,
        selectedLead: _lead,
        source: _sourceLabel,
      };
    },
  };
  return layer;
}
