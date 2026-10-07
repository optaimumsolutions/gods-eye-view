/**
 * Row 13 M4 (plan §15.7 R13.18): when the event hub reports a store write
 * (`gev:source-updated`, dispatched by the strip), the globe layers fed by
 * that source re-fetch and restyle in place. Layers that are off are left
 * alone (`refreshLayer` declines them); a burst of writes costs one refresh.
 * A mapped write also drops the shared `/api/oracle/*` memo
 * (src/data/sharedFetch.js) so the refresh reads the new rows, not a body
 * cached before the write.
 */
import { invalidateSharedOracleFetch } from '../data/sharedFetch.js';

/** The five onshore production layers (src/app/layers/onshore.js). */
const ONSHORE_LAYERS = Object.freeze([
  'production-williston',
  'production-appalachia',
  'production-permian-delaware',
  'production-permian-midland',
  'production-permian-platform',
]);

/** Oracle ingest source -> globe layers that read it through /api/oracle/. */
export const LIVE_REFRESH_LAYERS = Object.freeze({
  portwatch: Object.freeze(['commodity-chokepoints']),
  // Row 14: the US supply board re-reads the store when these sources write.
  ng_storage: Object.freeze(['gas-supply-us']),
  ng_monthly: Object.freeze(['gas-supply-us']),
  ng_regional: Object.freeze(['gas-supply-us']),
  ng_pipeline_flows: Object.freeze(['gas-supply-us']),
  // FR-D29: the board's DUC and STEO parts. duc_build is not an ingest_log
  // source yet (docs/DATA-MAP.md §3), so the hub cannot emit it until it is;
  // the entry is here so the refresh works the day it lands.
  steo: Object.freeze(['gas-supply-us']),
  duc_build: Object.freeze(['gas-supply-us']),
  wx_ghcn: ONSHORE_LAYERS,
  // FR-D29: the AIFS run also redraws Weather · Basin Forecast.
  wx_aifs: Object.freeze([...ONSHORE_LAYERS, 'weather-forecast']),
});

export const LIVE_REFRESH_DELAY_MS = 1_500;

/** Listen on `target` (window); returns the uninstall function. */
export function installLiveRefresh(
  dataManager,
  {
    target = globalThis,
    layers = LIVE_REFRESH_LAYERS,
    delayMs = LIVE_REFRESH_DELAY_MS,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
    invalidate = invalidateSharedOracleFetch,
  } = {},
) {
  const pending = new Map();
  const onUpdate = (event) => {
    const frame = event?.detail;
    if (!frame || !(frame.rows > 0)) return;
    const ids = layers[frame.source] ?? [];
    if (ids.length) invalidate?.();
    for (const id of ids) {
      if (pending.has(id)) continue;
      pending.set(
        id,
        setTimeoutImpl(() => {
          pending.delete(id);
          Promise.resolve(dataManager.refreshLayer(id)).catch(() => {});
        }, delayMs),
      );
    }
  };
  target.addEventListener?.('gev:source-updated', onUpdate);
  return () => {
    target.removeEventListener?.('gev:source-updated', onUpdate);
    for (const timer of pending.values()) clearTimeoutImpl(timer);
    pending.clear();
  };
}
