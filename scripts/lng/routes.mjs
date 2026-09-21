/**
 * Modelled sea routes for the LNG arcs (docs/COMMODITIES-PLAN.md §12.6.1
 * item 5): `searoute-ts` over the Eurostat 2025 marine network, computed at
 * build, two variants per pair. `open` is the shortest path with every canal
 * and strait open; `redSeaClosed` blocks Bab el-Mandeb so the route rounds the
 * Cape of Good Hope, and is stored only for pairs whose open route used the
 * strait. Each variant lists the chokepoints of the bundled gazetteer it
 * passes within 25 km, so a card can say "via Panama" from data, not from a
 * label on the passage.
 *
 * These are shortest paths, not observed tracks: draft limits, slot auctions
 * and weather routing are not modelled, and every card says so.
 */

import { seaRoute } from 'searoute-ts';
import { CHOKEPOINT_GAZETTEER } from '../../src/layers/chokepoints/gazetteer.js';

export const ROUTE_ENGINE = Object.freeze({
  name: 'searoute-ts',
  version: '2.3.0',
  network: 'Eurostat 2025 maritime network (marnet), MIT-licensed distribution',
  units: 'nautical miles',
});
export const RED_SEA_CLOSED_FROM = '2024-01';
/**
 * The PRD said 25 km. Measured against every lane in the bundle (2026-09-21)
 * the passages a lane actually threads sit 1 to 27 km from PortWatch's pin
 * (Hormuz and Malacca both 26.9 km, because the pin is mid-strait and the
 * Eurostat lane hugs one shore) and the nearest pin a lane merely passes is
 * 45 km off (Mindoro). 40 km separates the two groups; 25 km silently drops
 * Hormuz from every Qatar route.
 */
export const VIA_RADIUS_KM = 40;
export const MAX_VERTICES = 400;
const PRECISION = 3;

const EARTH_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle-ish distance from a point to a segment, km, via local equirectangular projection. */
function pointToSegmentKm(p, a, b) {
  const lat0 = rad(p[1]);
  const cos = Math.cos(lat0);
  const dx = (lon) => {
    let d = lon - p[0];
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return rad(d) * cos;
  };
  const ax = dx(a[0]);
  const ay = rad(a[1] - p[1]);
  // Place b relative to a, not to p: a segment whose ends fall on opposite
  // sides of the ±180° seam from p's view would otherwise be drawn straight
  // through p (the Qatar to Tianjin lane once "passed" the Mona Passage).
  let dab = b[0] - a[0];
  if (dab > 180) dab -= 360;
  if (dab < -180) dab += 360;
  const bx = ax + rad(dab) * cos;
  const by = rad(b[1] - p[1]);
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : -(ax * vx + ay * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.sqrt(cx * cx + cy * cy) * EARTH_KM;
}

/** Chokepoints within `radiusKm` of the line, in the order the line meets them. */
export function viaChokepoints(
  coords,
  gazetteer = CHOKEPOINT_GAZETTEER,
  radiusKm = VIA_RADIUS_KM,
) {
  const hits = [];
  for (const cp of gazetteer) {
    const p = [cp.lon, cp.lat];
    let best = Infinity;
    let bestAt = -1;
    for (let i = 0; i + 1 < coords.length; i += 1) {
      const d = pointToSegmentKm(p, coords[i], coords[i + 1]);
      if (d < best) {
        best = d;
        bestAt = i;
      }
    }
    if (best <= radiusKm) hits.push({ name: cp.name, at: bestAt, km: best });
  }
  return hits.sort((a, b) => a.at - b.at || a.km - b.km).map((h) => h.name);
}

function roundCoords(coords) {
  const out = [];
  for (const [lon, lat] of coords) {
    const r = [Number(lon.toFixed(PRECISION)), Number(lat.toFixed(PRECISION))];
    const last = out[out.length - 1];
    if (!last || last[0] !== r[0] || last[1] !== r[1]) out.push(r);
  }
  return out;
}

export function computeRoute(origin, destination, { restrictions = [] } = {}) {
  const feature = seaRoute(origin, destination, {
    returnPassages: true,
    restrictions,
  });
  const coords = roundCoords(feature.geometry.coordinates);
  if (coords.length > MAX_VERTICES)
    throw new Error(
      `route ${origin} → ${destination} has ${coords.length} vertices, over the ${MAX_VERTICES} gate`,
    );
  return {
    nm: Math.round(feature.properties.length * 10) / 10,
    passages: [...(feature.properties.passages ?? [])],
    coords,
  };
}

/** A cached or fresh variant with its chokepoint list derived from the line. */
function withVia(variant) {
  return {
    nm: variant.nm,
    passages: variant.passages,
    via: viaChokepoints(variant.coords),
    coords: variant.coords,
  };
}

/**
 * Compute both variants for every pair. `pairs` carry `originId` and
 * `destinationId`; `terminalsById` supplies coordinates. A cache keyed by the
 * exact inputs lets a rebuild skip pairs it has already routed.
 */
export function buildRoutes(
  pairs,
  terminalsById,
  { cache = new Map(), log = () => {} } = {},
) {
  const routes = [];
  const unrouted = [];
  let computed = 0;
  const started = Date.now();
  for (const pair of pairs) {
    const o = terminalsById.get(pair.originId);
    const d = terminalsById.get(pair.destinationId);
    if (!o || !d)
      throw new Error(
        `route ${pair.id}: unknown endpoint ${!o ? pair.originId : pair.destinationId}`,
      );
    const origin = [o.lon, o.lat];
    const destination = [d.lon, d.lat];
    const key = (restrictions) =>
      `${ROUTE_ENGINE.version}|${origin.join(',')}|${destination.join(',')}|${restrictions.join('+')}`;
    const variant = (restrictions) => {
      const k = key(restrictions);
      if (!cache.has(k)) {
        cache.set(k, computeRoute(origin, destination, { restrictions }));
        computed += 1;
        if (computed % 50 === 0)
          log(
            `  routed ${computed} variants (${Math.round((Date.now() - started) / 1000)} s)`,
          );
      }
      return cache.get(k);
    };
    let open;
    let redSeaClosed = null;
    try {
      open = variant([]);
      if (open.passages.includes('babelmandeb'))
        redSeaClosed = variant(['babelmandeb']);
    } catch (error) {
      // A terminal the network cannot reach (an inland river berth, a snap
      // beyond the coast) stays in the manifest with its volume; nothing is
      // drawn from a guessed position.
      if (
        !/NoRouteError|SnapFailedError|No sea route|snap/i.test(
          `${error.name} ${error.message}`,
        )
      )
        throw error;
      unrouted.push({
        id: pair.id,
        originId: pair.originId,
        destinationId: pair.destinationId,
        origin: `${o.name} (${o.country})`,
        destination: `${d.name} (${d.country})`,
        volume: pair.volume,
        reason: error.message,
      });
      continue;
    }
    routes.push({
      ...pair,
      redSeaExposed: redSeaClosed !== null,
      variants: {
        open: withVia(open),
        redSeaClosed: redSeaClosed ? withVia(redSeaClosed) : null,
      },
    });
  }
  log(
    `  ${routes.length} pairs routed, ${unrouted.length} unrouted, ${computed} variants computed, ${Math.round((Date.now() - started) / 1000)} s`,
  );
  return { routes, unrouted };
}

/** Which variant a period draws: the closed one from 2024-01 on exposed pairs. */
export function variantForPeriod(route, period) {
  return route.redSeaExposed &&
    route.variants.redSeaClosed &&
    String(period) >= RED_SEA_CLOSED_FROM
    ? 'redSeaClosed'
    : 'open';
}
