import * as Cesium from 'cesium';
import {
  DEFAULT_FIELD_STAT,
  FIELD_STATS,
  FIELD_UPSCALE,
  paintField,
  rampLegend,
} from './fieldModel.js';
import { DEFAULT_LEAD, getForecastScrubber } from './scrubber.js';
import { WEATHER_SKILL_URL } from './source.js';

export const WEATHER_FIELD_LAYER_ID = 'weather-field';
/** W7's alpha for the draped field; per-cell confidence multiplies it. */
const FIELD_ALPHA = 0.6;
/**
 * The field is a ground-clamped rectangle ENTITY with an image material, not
 * an imagery layer: the hosted site lands on Google Photorealistic 3D Tiles
 * with `scene.globe.show = false`, and imagery layers only render on the
 * globe surface, while a classified ground rectangle drapes over both the
 * globe and 3D Tiles (the chokepoint discs' mechanism).
 */
const FIELD_DATASOURCE_ID = 'weather-field';
/** The manifest is 2 KB; re-read it every half hour like the point layer's metadata. */
const UPDATE_INTERVAL_MS = 30 * 60_000;

/**
 * Row 3 M4 (docs/COMMODITIES-PLAN.md §11.8.10): the CONUS forecast field
 * as one imagery layer — the selected stat for the scrubber's lead, painted
 * to a canvas with per-cell confidence alpha and draped over the CONUS
 * rectangle. Grids are cached per (lead, stat) for the run; the scrubber
 * and the stat chips re-paint without a fetch once a grid is cached.
 */
export function createWeatherFieldLayer({
  source,
  scrubber = null,
  fetchImpl = (...args) => globalThis.fetch(...args),
  skillUrl = WEATHER_SKILL_URL,
  documentRef = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (
    typeof source?.getManifest !== 'function' ||
    typeof source?.getGrid !== 'function'
  )
    throw new TypeError('Weather field requires a field source');

  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _entity = null;
  let _manifest = null;
  let _skill = null;
  let _lead = DEFAULT_LEAD;
  let _stat = DEFAULT_FIELD_STAT;
  let _enabled = false;
  let _lastUpdate = null;
  let _lastError = null;
  let _painting = null;
  let _paintedKey = null;
  let _unsubscribeScrubber = null;
  const _canvases = new Map();

  function scrub() {
    if (scrubber) return scrubber;
    if (!documentRef) return null;
    scrubber = getForecastScrubber({ document: documentRef });
    return scrubber;
  }

  async function loadSkill(signal) {
    if (_skill) return _skill;
    try {
      const r = await fetchImpl(skillUrl, { signal });
      _skill = r.ok ? await r.json() : null;
    } catch {
      _skill = null;
    }
    return _skill;
  }

  /** The lead the manifest can answer nearest to the scrubber's. */
  function leadFor(lead) {
    const leads = _manifest?.leads || [];
    if (!leads.length) return null;
    if (leads.includes(lead)) return lead;
    return lead < leads[0] ? leads[0] : leads[leads.length - 1];
  }

  function removeField() {
    if (_entity && _dataSource) _dataSource.entities.remove(_entity);
    _entity = null;
    _paintedKey = null;
  }

  async function paint({ force = false } = {}) {
    if (!_enabled || !_manifest || !_viewer || !documentRef) return false;
    const lead = leadFor(_lead);
    if (lead == null) return false;
    const key = `${_manifest.init}:${lead}:${_stat}`;
    if (!force && key === _paintedKey) return true;
    if (_painting) return _painting;
    _painting = (async () => {
      try {
        const signal = _request?.signal;
        const [grid, spread] = await Promise.all([
          source.getGrid(lead, _stat, { signal }),
          _stat === 'spread'
            ? null
            : source.getGrid(lead, 'spread', { signal }),
        ]);
        if (!_enabled || signal?.aborted) return false;
        let canvas = _canvases.get(key);
        if (!canvas) {
          const { data, width, height } = paintField({
            stat: _stat,
            values: grid.values,
            spread: spread?.values ?? grid.values,
            rows: _manifest.grid.rows,
            cols: _manifest.grid.cols,
            lead,
            skill: _skill,
            upscale: FIELD_UPSCALE,
            baseAlpha: FIELD_ALPHA,
          });
          canvas = documentRef.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas
            .getContext('2d')
            .putImageData(new ImageData(data, width, height), 0, 0);
          _canvases.set(key, canvas);
        }
        const g = _manifest.grid;
        // cell centres are the grid points; the image spans half a cell beyond them
        const half = g.di / 2;
        const coordinates = Cesium.Rectangle.fromDegrees(
          g.west - half,
          g.south - half,
          g.east + half,
          g.north + half,
        );
        if (!_enabled || signal?.aborted) return false;
        removeField();
        _entity = _dataSource.entities.add(
          new Cesium.Entity({
            id: `weather-field:${key}`,
            rectangle: {
              coordinates,
              material: new Cesium.ImageMaterialProperty({
                image: canvas,
                transparent: true,
              }),
              // no height: a ground rectangle, classified onto terrain AND 3D Tiles
              classificationType: Cesium.ClassificationType.BOTH,
            },
          }),
        );
        _paintedKey = key;
        _lastError = null;
        return true;
      } catch (e) {
        if (_request?.signal?.aborted) return false;
        console.warn('[Data:WeatherField] paint error:', e);
        _lastError = e?.message || 'field unavailable';
        return false;
      } finally {
        _painting = null;
      }
    })();
    return _painting;
  }

  function onLead(lead) {
    if (lead === _lead) return;
    _lead = lead;
    paint();
  }

  const layer = {
    id: WEATHER_FIELD_LAYER_ID,
    name: 'Weather · Forecast Field (AIFS ENS)',
    icon: '🗺️',
    source: 'ECMWF AIFS ENS via Oil Oracle store',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer)
        throw new Error('Weather field layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(FIELD_DATASOURCE_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _enabled = false;
      console.log('[Data:WeatherField] Initialized');
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      const s = scrub();
      if (s) {
        s.acquire(WEATHER_FIELD_LAYER_ID);
        _lead = s.getLead();
        _unsubscribeScrubber = s.subscribe(onLead);
      }
      if (_manifest) paint({ force: true });
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _unsubscribeScrubber?.();
      _unsubscribeScrubber = null;
      scrubber?.release(WEATHER_FIELD_LAYER_ID);
      removeField();
      if (_dataSource) _dataSource.show = false;
    },

    async update() {
      if (!_enabled) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const [manifest] = await Promise.all([
          source.getManifest({ signal: request.signal }),
          loadSkill(request.signal),
        ]);
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        if (_manifest?.init !== manifest.init) _canvases.clear();
        _manifest = manifest;
        const s = scrub();
        if (s && manifest.leads.length) {
          const pad = (n) => String(n).padStart(2, '0');
          const issued = new Date(manifest.initialisedAt);
          s.setHorizon({
            horizon: manifest.leads[manifest.leads.length - 1],
            label: layer.source,
            issued: `issued ${pad(issued.getUTCHours())}Z ${pad(issued.getUTCMonth() + 1)}-${pad(issued.getUTCDate())}`,
          });
          _lead = s.getLead();
        }
        await paint({ force: _paintedKey === null });
        _lastUpdate = Date.now();
        console.log(
          `[Data:WeatherField] Updated: run ${manifest.init}, ${manifest.grid.rows}×${manifest.grid.cols} cells, ${manifest.leads.length} leads`,
        );
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:WeatherField] Fetch error:', e);
        _lastError = e?.message || 'Oil Oracle field unavailable';
        return Boolean(_manifest);
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy() {
      this.disable();
      if (_dataSource) {
        _viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _manifest = null;
      _canvases.clear();
      _lastUpdate = null;
      _lastError = null;
    },

    setStat(stat) {
      if (!FIELD_STATS[stat] || stat === _stat) return;
      _stat = stat;
      paint();
    },
    getStat: () => _stat,
    getSelectedLead: () => _lead,
    setSelectedLead(lead) {
      const s = scrub();
      if (s) s.setLead(lead);
      else onLead(lead);
    },

    getRowControls() {
      return {
        chips: Object.entries(FIELD_STATS).map(([id, spec]) => ({
          id: `stat-${id}`,
          label: spec.label.toUpperCase(),
          title: `Draw ${spec.label} (${spec.unit})`,
          disabled: !_enabled || id === _stat,
          onClick: () => layer.setStat(id),
        })),
        legend: [
          ...rampLegend(_stat).map((step) => ({
            label: step.label,
            color: step.color,
          })),
          {
            label: 'faded = unsure (lead-time skill × cell spread)',
            color: '#6b7280',
            blurb: `${FIELD_STATS[_stat].label} for the scrubber's day; cells fade where the 51 members disagree. ${
              _skill?.models?.ecmwf_aifs025_ensemble?.label ||
              'skill not loaded'
            }. ECMWF AIFS ENS open data, reduced by the Oil Oracle nightly.`,
          },
        ],
      };
    },

    getAnalystRecords() {
      return [];
    },

    getStats() {
      const g = _manifest?.grid;
      return {
        count: _manifest ? _manifest.leads.length : 0,
        countLabel: _manifest
          ? `${_manifest.leads.length} days · run ${_manifest.init} · ${FIELD_STATS[_stat].label}`
          : '',
        cells: g ? g.rows * g.cols : 0,
        lastUpdate: _lastUpdate,
        error: _lastError,
        init: _manifest?.init ?? null,
        selectedLead: _lead,
        stat: _stat,
        painted: _paintedKey,
        source: layer.source,
      };
    },
  };
  return layer;
}
