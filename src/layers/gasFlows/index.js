import * as Cesium from 'cesium';
import {
  CROSSING_PIXEL_SIZE,
  CROSSING_UNKNOWN_CSS,
  GAS_TIER_GLOBAL,
  NETWORK_COLOR_CSS,
  NETWORK_DRAW_COST_MEASURED,
  NETWORK_DRAW_COST_MIB,
  NETWORK_WIDTH_PX,
  detailTierForHeight,
  networkAlphaFor,
  networkStampFor,
  networkVisibleAtTier,
  pencilMetaLine,
} from './model.js';
import { GAS_FLOWS_LAYER_ID, geometryOnlyHeadline } from './records.js';

export * from './model.js';
export * from './records.js';
export { createBundledGasSource } from './bundledSource.js';

/**
 * `commodity-gas-flows` — the PENCIL substrate.
 *
 * Two bundled, stale, geometry-only datasets: the January-2020 US transmission
 * network drawn as an inert 1 px hairline, and the 2017 NACEI border crossings
 * drawn as fixed-size grey pips. **Nothing in this layer carries a number**,
 * because nothing in the bundle is a measurement — the volumes arrive later,
 * from a server-side EIA provider that does not exist yet, and until then
 * R4.29 says the layer still draws the network and the pips and says the
 * volumes are unavailable.
 *
 * Three decisions are load-bearing and are not preferences:
 *
 *   · **The network cannot be clicked.** `allowPicking: false` on the
 *     primitive. It can never produce a card, so it can never assert a
 *     number — and it deletes the 1 px-line-against-a-pick-box problem
 *     outright.
 *   · **Nothing animates and the layer takes no render hold.** No material
 *     with `isConstant === false`, no per-frame callback. A `published`-class
 *     observation must not animate, and `GevRouteFlow` would pin
 *     `requestRenderMode = false` for a dataset that updates twelve times a
 *     year. Restyles are discrete, on `moveEnd`.
 *   · **The appearance is `PolylineColorAppearance`, not
 *     `PerInstanceColorAppearance`.** The latter does not drive a ground
 *     polyline; with it the per-instance colour is ignored and the
 *     Interstate/Intrastate alpha step silently collapses to one flat colour.
 *     Precedent: `src/data/contactTrailRenderer.js`.
 *
 * The bundle is static, so there is no poll: `update()` reads once and then
 * only restyles.
 */

/** Static bundles. The interval exists for the manager's contract, not to poll. */
const UPDATE_INTERVAL_MS = 24 * 60 * 60_000;

export function createGasFlowsLayer({
  source,
  overlayHost = null,
  requestRender = null,
} = {}) {
  if (!source || typeof source.getSnapshot !== 'function') {
    throw new TypeError('Gas flows layer requires a source with getSnapshot()');
  }

  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _request = null;
  let _removeMoveEnd = null;
  let _removeCameraChanged = null;

  let _snapshot = null;
  let _networkPrimitive = null;
  let _networkBuilt = false;
  let _networkBuildMs = null;
  let _networkHeapMiB = null;
  /**
   * The GRID chip, defaulted OFF by the milestone-5 performance gate.
   *
   * Measured on the target Windows machine (AMD Radeon 610M, 2026-09-18):
   * parsing both bundles costs **31 MiB**, and building the 32,885-part
   * ground primitive costs a further **496 MiB** — about 15 KiB per part,
   * because `GroundPolylineGeometry` extrudes every polyline into its own
   * volume. Against a combined static scene that already reaches 872 MiB,
   * leaving that on by default would roughly double the heap for a layer that
   * carries no measurement at all. Re-measured at 514 MiB on 2026-09-21; the
   * figure the meta line prints is `NETWORK_DRAW_COST_MIB` in model.js, dated
   * there, and `getStats()` reports it with its date.
   *
   * R4.20's pre-committed gate names this exact outcome: "failing that, ship
   * with `GRID 2020` off by default and the meta line saying why." This is
   * that branch, taken on evidence rather than on a slow demo.
   */
  let _networkRequested = false;
  let _tier = GAS_TIER_GLOBAL;
  let _lastUpdate = null;
  let _lastError = null;

  const _crossingEntities = [];
  const _interstateIds = [];
  const _intrastateIds = [];
  let _removeReadyProbe = null;

  const cameraHeight = () => _viewer?.camera?.positionCartographic?.height;
  const currentTier = () => detailTierForHeight(cameraHeight());
  const nudgeRender = () => {
    if (typeof requestRender === 'function') requestRender();
    else _viewer?.scene?.requestRender?.();
  };

  /** One grey pip per crossing. Fixed size at every tier — PENCIL never varies. */
  function buildCrossings(crossings) {
    const colour = Cesium.Color.fromCssColorString(CROSSING_UNKNOWN_CSS);
    for (const crossing of crossings) {
      const entity = _dataSource.entities.add({
        id: `${GAS_FLOWS_LAYER_ID}:${crossing.cellId}`,
        position: Cesium.Cartesian3.fromDegrees(
          crossing.longitude,
          crossing.latitude,
        ),
        point: {
          pixelSize: CROSSING_PIXEL_SIZE,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: colour.withAlpha(0.85),
          outlineWidth: 1,
          // Fixed-height points write no far-side depth, so they would paint
          // through the globe without this.
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      // Not pickable in this increment. A pip that can be clicked needs a card,
      // and a card is the rung ladder (R4.48) — which cannot be built honestly
      // until there is a filing to put on it.
      entity.__gasFlowsGeometryOnly = geometryOnlyHeadline();
      _crossingEntities.push(entity);
    }
  }

  /**
   * One batched ground primitive for the whole network.
   *
   * Built lazily, on the first tier that actually draws it, because at global
   * the network is withheld entirely and most sessions never leave global.
   * `asynchronous: true` keeps the build off the main thread.
   */
  function buildNetwork(network) {
    if (_networkBuilt || !network || !_viewer) return;
    _networkBuilt = true;
    const started = Date.now();
    const colour = Cesium.Color.fromCssColorString(NETWORK_COLOR_CSS);
    const instances = [];
    for (const system of network.systems) {
      const alpha = networkAlphaFor(system.typePipe, _tier);
      const ids =
        system.typePipe === 'Intrastate' ? _intrastateIds : _interstateIds;
      system.parts.forEach((part, partIndex) => {
        const positions = Cesium.Cartesian3.fromDegreesArray(part.flat());
        if (positions.length < 2) return;
        // A string id, so `getGeometryInstanceAttributes` can find it later
        // without holding the original object reference.
        const id = `${system.id}:${partIndex}`;
        ids.push(id);
        instances.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.GroundPolylineGeometry({
              positions,
              width: NETWORK_WIDTH_PX,
              granularity: 0,
            }),
            id,
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                colour.withAlpha(alpha ?? 0),
              ),
              show: new Cesium.ShowGeometryInstanceAttribute(alpha !== null),
            },
          }),
        );
      });
    }
    if (!instances.length) return;
    _networkPrimitive = new Cesium.GroundPolylinePrimitive({
      geometryInstances: instances,
      classificationType: Cesium.ClassificationType.BOTH,
      appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
      asynchronous: true,
      // The load-bearing honesty decision, not the performance one.
      allowPicking: false,
      show: networkVisibleAtTier(_tier),
    });
    _viewer.scene.groundPrimitives.add(_networkPrimitive);
    _networkBuildMs = Date.now() - started;
    _networkHeapMiB = globalThis.performance?.memory
      ? Math.round(globalThis.performance.memory.usedJSHeapSize / 1048576)
      : null;
    console.log(
      `[Data:GasFlows] Network primitive: ${instances.length} parts assembled in ${_networkBuildMs} ms` +
        (_networkHeapMiB === null ? '' : ` (heap now ${_networkHeapMiB} MiB)`),
    );
  }

  /**
   * Re-apply the tier's alpha per pipe class.
   *
   * Whole-primitive `show` works immediately; per-instance attributes only
   * exist once the asynchronous build finishes, so when the primitive is not
   * ready this defers through a **self-removing** `postRender` hook. That is
   * not a render hold: it fires only on frames the scene was already drawing,
   * and it detaches as soon as it has applied.
   */
  function applyTierToNetwork() {
    if (!_networkPrimitive) return;
    const visible = networkVisibleAtTier(_tier);
    _networkPrimitive.show = visible;
    if (!visible) return;
    if (!_networkPrimitive.ready) {
      scheduleRestyleWhenReady();
      return;
    }
    const colour = Cesium.Color.fromCssColorString(NETWORK_COLOR_CSS);
    for (const [typePipe, ids] of [
      ['Interstate', _interstateIds],
      ['Intrastate', _intrastateIds],
    ]) {
      const alpha = networkAlphaFor(typePipe, _tier);
      const shown = alpha !== null;
      const value = Cesium.ColorGeometryInstanceAttribute.toValue(
        colour.withAlpha(alpha ?? 0),
      );
      for (const id of ids) {
        const attributes = _networkPrimitive.getGeometryInstanceAttributes(id);
        if (!attributes) continue;
        attributes.color = value;
        attributes.show = Cesium.ShowGeometryInstanceAttribute.toValue(shown);
      }
    }
  }

  function scheduleRestyleWhenReady() {
    if (_removeReadyProbe || !_viewer?.scene?.postRender) return;
    const probe = () => {
      if (!_networkPrimitive || _networkPrimitive.ready || !_enabled) {
        _removeReadyProbe?.();
        _removeReadyProbe = null;
        if (_networkPrimitive?.ready) applyTierToNetwork();
      }
    };
    _removeReadyProbe = _viewer.scene.postRender.addEventListener(probe);
  }

  function refreshTier({ force = false } = {}) {
    const next = currentTier();
    if (!force && next === _tier) return;
    _tier = next;
    if (_enabled && _networkRequested && networkVisibleAtTier(_tier)) {
      buildNetwork(_snapshot?.network);
    }
    applyTierToNetwork();
    nudgeRender();
  }

  function onCameraMoveEnd() {
    if (!_enabled) return;
    refreshTier();
  }

  /**
   * Both triggers, deliberately (R4.42). `moveEnd` covers ordinary navigation;
   * `changed` covers a programmatic `camera.setView`, which does **not** raise
   * `moveEnd` — so a scene jump or a director flight would otherwise leave the
   * layer showing the previous tier's geometry indefinitely.
   */
  function installCameraListeners(viewer) {
    const camera = viewer?.camera;
    if (!camera) return;
    if (!_removeMoveEnd && camera.moveEnd) {
      _removeMoveEnd = camera.moveEnd.addEventListener(onCameraMoveEnd);
    }
    if (!_removeCameraChanged && camera.changed) {
      // The viewer's default `percentageChanged` is left alone: this only
      // decides which of three tiers is drawn, and a layer that lowers the
      // shared threshold changes every other `camera.changed` listener too.
      _removeCameraChanged = camera.changed.addEventListener(onCameraMoveEnd);
    }
  }

  function removeCameraListeners() {
    _removeMoveEnd?.();
    _removeMoveEnd = null;
    _removeCameraChanged?.();
    _removeCameraChanged = null;
  }

  function releaseNetwork() {
    _removeReadyProbe?.();
    _removeReadyProbe = null;
    if (_networkPrimitive && _viewer) {
      _viewer.scene.groundPrimitives.remove(_networkPrimitive);
    }
    _networkPrimitive = null;
    _networkBuilt = false;
    _networkBuildMs = null;
    _interstateIds.length = 0;
    _intrastateIds.length = 0;
  }

  const layer = {
    id: GAS_FLOWS_LAYER_ID,
    name: 'Gas · Cross-Border Flows',
    icon: '⛽',
    source: 'EIA · NACEI',
    // Both bundles are years old. This must never resolve to LIVE.
    freshnessClass: 'published',
    updateInterval: UPDATE_INTERVAL_MS,

    init(viewer) {
      if (_viewer) throw new Error('Gas flows layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(GAS_FLOWS_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _enabled = false;
      _tier = GAS_TIER_GLOBAL;
      _snapshot = null;
      _lastUpdate = null;
      _lastError = null;
      console.log('[Data:GasFlows] Initialized');
    },

    enable(viewer = _viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      installCameraListeners(viewer);
      refreshTier({ force: true });
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      removeCameraListeners();
      _removeReadyProbe?.();
      _removeReadyProbe = null;
      if (_dataSource) _dataSource.show = false;
      if (_networkPrimitive) _networkPrimitive.show = false;
      nudgeRender();
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      if (_snapshot) return false; // Static bundles: read once, then restyle only.
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled) {
          return false;
        }
        _snapshot = snapshot;
        buildCrossings(snapshot.crossings.crossings);
        refreshTier({ force: true });
        _lastUpdate = Date.now();
        _lastError = null;
        if (snapshot.networkError) {
          console.warn(
            `[Data:GasFlows] Network bundle unavailable (${snapshot.networkError}); crossings only`,
          );
        }
        nudgeRender();
        return true;
      } catch (error) {
        if (request.signal.aborted) return false;
        _lastError = error instanceof Error ? error.message : String(error);
        console.warn(`[Data:GasFlows] ${_lastError}`);
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      removeCameraListeners();
      releaseNetwork();
      overlayHost?.clearSource?.(GAS_FLOWS_LAYER_ID);
      if (_dataSource) {
        viewer?.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _crossingEntities.length = 0;
      _viewer = null;
      _snapshot = null;
      _lastUpdate = null;
      _lastError = null;
    },

    /**
     * The `GRID 2020` chip. Off by default on the measurement above; turning it
     * on costs `NETWORK_DRAW_COST_MIB` (dated in model.js) and is the caller's
     * informed choice, which is why this is a toggle and not a silent tier
     * behaviour.
     */
    setNetworkEnabled(on) {
      const next = Boolean(on);
      if (next === _networkRequested) return _networkRequested;
      _networkRequested = next;
      if (!next) {
        releaseNetwork();
      } else if (_enabled && networkVisibleAtTier(_tier)) {
        buildNetwork(_snapshot?.network);
      }
      applyTierToNetwork();
      nudgeRender();
      return _networkRequested;
    },

    isNetworkEnabled() {
      return _networkRequested;
    },

    getStats() {
      const crossings = _snapshot?.crossings;
      const network = _snapshot?.network;
      return {
        count: crossings?.crossings.length ?? 0,
        systems: network?.systems.length ?? 0,
        parts: network?.counts.parts ?? 0,
        tier: _tier,
        networkEnabled: _networkRequested,
        networkDrawn:
          _networkRequested &&
          networkVisibleAtTier(_tier) &&
          Boolean(_networkPrimitive),
        networkBuildMs: _networkBuildMs,
        networkHeapMiB: _networkHeapMiB,
        // The cost the meta line quotes, and the day it was measured.
        networkDrawCostMiB: NETWORK_DRAW_COST_MIB,
        networkDrawCostMeasured: NETWORK_DRAW_COST_MEASURED,
        feed: _snapshot?.feed ?? 'cold',
        // Every grade in this layer is PENCIL until an EIA key exists.
        grade: 'pencil',
        stamp: network ? networkStampFor(network.vintage.label) : null,
        source: pencilMetaLine({
          crossings: crossings?.crossings.length ?? 0,
          systems: network?.systems.length ?? 0,
          networkVintage: network?.vintage.label ?? '',
          crossingVintage: crossings?.vintage.label ?? '',
          networkOff: !_networkRequested,
          keyRequired: true,
        }),
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };

  return layer;
}
