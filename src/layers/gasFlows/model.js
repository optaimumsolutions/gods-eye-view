/**
 * Presentation rules for the gas layer's PENCIL grade — the only grade it can
 * draw until an EIA key exists (docs/COMMODITIES-PLAN.md §10.7, R4.29, R4.34,
 * R4.38, R4.41).
 *
 * Every mark this module describes is **mapped only**: January-2020 linework
 * and 2017 NACEI crossing points. Nothing here varies with a measured
 * quantity, because there is no measured quantity in the bundle — that is the
 * whole point of the grade, and R4.29 is explicit that with no key "the layer
 * still renders the bundled network and the roster pips and says the volumes
 * are unavailable."
 *
 * So there is no size function in this file that takes a magnitude. Sizes are
 * constants. When the EIA provider lands, `crossingPixelSize` arrives beside
 * these and calls `assertEiaVolumeRecord` first; it does not replace them.
 *
 * Portable by rule: no Cesium, no DOM, no Node built-ins.
 */

export const GAS_FLOWS_OVERLAY_SOURCE_ID = 'commodity-gas-flows';

/**
 * Zoom tiers. The thresholds are the datacenters layer's, verbatim, because
 * R4.41 says to reuse them and two commodity layers changing depth at
 * different altitudes in the same frame reads as a bug.
 *
 * Worth recording: the *infrastructure* LOD next door switches at 3,000,000 m
 * and 200,000 m (`src/data/localGeojsonLod.js`), so `local-dams` and
 * `local-datacenters` still change at different heights from these. Three
 * layers, two vocabularies. Reconciling them is a shared-surface change and
 * belongs in its own milestone, not smuggled in here.
 */
export const GAS_REGIONAL_HEIGHT_M = 2_500_000;
export const GAS_LOCAL_HEIGHT_M = 300_000;
export const GAS_TIER_GLOBAL = 'global';
export const GAS_TIER_REGIONAL = 'regional';
export const GAS_TIER_LOCAL = 'local';

export function detailTierForHeight(cameraHeightM) {
  if (!Number.isFinite(cameraHeightM)) return GAS_TIER_GLOBAL;
  if (cameraHeightM < GAS_LOCAL_HEIGHT_M) return GAS_TIER_LOCAL;
  if (cameraHeightM < GAS_REGIONAL_HEIGHT_M) return GAS_TIER_REGIONAL;
  return GAS_TIER_GLOBAL;
}

/**
 * The two greys. `#6f7a88` is the shared `thin` token — it already means "not
 * enough data to say anything" across this console — and `#9aa4b2` is
 * `unknown`, which is what a crossing with no filing is.
 */
export const NETWORK_COLOR_CSS = '#6f7a88';
export const CROSSING_UNKNOWN_CSS = '#9aa4b2';

/** Fixed. Size variation is reserved, exclusively, for a measured volume. */
export const CROSSING_PIXEL_SIZE = 6;
export const NETWORK_WIDTH_PX = 1;

/**
 * What drawing the network costs, quoted in the meta line so a dark grid says
 * why it is dark. A measurement, not an estimate, and dated because it is a
 * fact about one machine on one day — AMD Radeon 610M via ANGLE/D3D11,
 * `scripts/qa-gas-flows.mjs`: 496 MiB on 2026-09-18, 514 MiB on 2026-09-21.
 * Re-measure and restate both when the drawn set or the primitive changes.
 */
export const NETWORK_DRAW_COST_MIB = 514;
export const NETWORK_DRAW_COST_MEASURED = '2026-09-21';

/**
 * Alpha is the **only** channel that varies on the network, one step, from the
 * only field with real distinct values (R4.16). Width does not vary, because
 * width is the canonical quantity channel on a flow map and this dataset has
 * no diameter, capacity, pressure or throughput to put on it.
 *
 * `null` means the class is not drawn at that tier at all. The network is
 * withheld entirely at global: 32,885 hairlines at that altitude is a
 * continental smear that reads as "gas is everywhere", and its density is a
 * digitizing artifact rather than a fact about gas.
 */
const NETWORK_ALPHA = Object.freeze({
  [GAS_TIER_GLOBAL]: Object.freeze({ Interstate: null, Intrastate: null }),
  [GAS_TIER_REGIONAL]: Object.freeze({ Interstate: 0.18, Intrastate: null }),
  [GAS_TIER_LOCAL]: Object.freeze({ Interstate: 0.3, Intrastate: 0.2 }),
});

/** Alpha for a pipe class at a tier, or `null` when it is not drawn. */
export function networkAlphaFor(typePipe, tier) {
  const row = NETWORK_ALPHA[tier] ?? NETWORK_ALPHA[GAS_TIER_GLOBAL];
  return row[typePipe] ?? null;
}

/** Whether any network geometry is on screen at this tier. */
export function networkVisibleAtTier(tier) {
  const row = NETWORK_ALPHA[tier] ?? NETWORK_ALPHA[GAS_TIER_GLOBAL];
  return Object.values(row).some((alpha) => alpha !== null);
}

/**
 * The corner stamp, shown whenever network geometry is (R4.39). It is not
 * dismissible and it is not a toggle: a closable warning is exactly how
 * stale-as-current happens again.
 */
export function networkStampFor(vintageLabel) {
  return `NETWORK · EIA TRANSMISSION · ${vintageLabel} · GEOMETRY ONLY · NO FLOW`;
}

/**
 * The panel meta line while the layer has no measured volume at all.
 *
 * It says the count of places it can draw and then says, in words, that it has
 * no numbers — rather than printing a zero, a dash, or nothing. `keyRequired`
 * is the R4.29 state: the bundle is fine, the volumes are not available yet.
 */
export function pencilMetaLine({
  crossings = 0,
  systems = 0,
  networkVintage = '',
  crossingVintage = '',
  networkOff = false,
  keyRequired = false,
} = {}) {
  const grid = networkVintage ? `GRID ${networkVintage}` : 'GRID';
  const parts = [
    `${crossings} PTS`,
    `${systems} SYSTEMS`,
    `GEOMETRY ONLY`,
    crossingVintage ? `CROSSINGS ${crossingVintage}` : null,
    // A dark grid must say why it is dark. Silence reads as "no pipelines
    // here", which is the opposite of true.
    networkOff ? `${grid} OFF · ${NETWORK_DRAW_COST_MIB} MiB TO DRAW` : grid,
    keyRequired ? 'NO EIA KEY · VOLUMES UNAVAILABLE' : 'NO VOLUMES LOADED',
  ];
  return parts.filter(Boolean).join(' · ');
}
