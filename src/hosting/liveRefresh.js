/**
 * Row 13 M4 (plan §15.7 R13.18): when the event hub reports a store write
 * (`gev:source-updated`, dispatched by the strip), the globe layers fed by
 * that source re-fetch and restyle in place. Layers that are off are left
 * alone (`refreshLayer` declines them); a burst of writes costs one refresh.
 */

/** Oracle ingest source -> globe layers that read it through /api/oracle/. */
export const LIVE_REFRESH_LAYERS = Object.freeze({
  portwatch: Object.freeze(['commodity-chokepoints']),
  wx_ghcn: Object.freeze(['production-williston']),
  wx_aifs: Object.freeze(['production-williston']),
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
  } = {},
) {
  const pending = new Map();
  const onUpdate = (event) => {
    const frame = event?.detail;
    if (!frame || !(frame.rows > 0)) return;
    for (const id of layers[frame.source] ?? []) {
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
