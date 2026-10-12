import fs from 'node:fs';
import path from 'node:path';
import { isPlausibleLatLon } from './normalize.js';

/**
 * Port cameras for the commodity port dossiers (docs/COMMODITIES-PLAN.md
 * §9.6.2): public still images at the twenty ports, hand-verified before
 * they ship and re-probed with `node scripts/build-port-dossiers.mjs
 * --probe`. The pack is registered by one line in `catalog.js`; everything
 * else about it lives here.
 *
 * The origin allowlist is the catalog itself. Unlike the open-data packs,
 * the file path cannot be overridden by an environment variable, so the
 * committed, reviewed rows are the only place a host can come from: a URL is
 * allowed exactly when a verified row carries its origin. The loader still
 * fails closed on anything that is not a bare http or https origin
 * (credentials, explicit ports, other schemes) and on a snapshot URL that
 * leaves its row's origin. Plain http is accepted as it is for Warendorf: the
 * proxy fetches the still server-side and serves it under this origin.
 */
export const DEFAULT_PORT_SOURCE_FILE = 'config/cctv_sources.ports.json';
export const PORT_CAMERA_SOURCE_KIND = 'port-webcam';
/** A traffic camera within the road-camera radius of a port; never a dossier frame candidate. */
export const PORT_ROAD_CAMERA_SOURCE_KIND = 'port-road-camera';
export const PORT_CAMERA_ID_RE = /^port-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The bare http(s) origin of a catalog URL, or null (credentials, an explicit port or another scheme). */
export function portImageOrigin(value) {
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  if (!parsed.hostname.includes('.')) return null;
  return parsed.origin;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate one catalog row into a camera source, or return null with the
 * reason a reviewer needs. Exported so the probe sheet and the test can
 * explain a rejection instead of just counting it.
 */
export function normalizePortCameraRow(item) {
  if (!item || typeof item !== 'object')
    return { camera: null, reason: 'not an object' };
  const id = text(item.id);
  if (!PORT_CAMERA_ID_RE.test(id))
    return {
      camera: null,
      reason: `id ${JSON.stringify(id)} is not a port camera id`,
    };
  const url = text(item.url) || text(item.snapshotUrl);
  const origin = portImageOrigin(url);
  if (!origin)
    return { camera: null, reason: `${id}: url is not a bare http(s) origin` };
  const snapshotUrl = text(item.snapshotUrl) || url;
  if (portImageOrigin(snapshotUrl) !== origin)
    return {
      camera: null,
      reason: `${id}: snapshotUrl leaves the row's origin`,
    };
  const lat = typeof item.lat === 'number' ? item.lat : NaN;
  const lon = typeof item.lon === 'number' ? item.lon : NaN;
  if (!isPlausibleLatLon(lat, lon))
    return { camera: null, reason: `${id}: implausible coordinates` };
  const name = text(item.name);
  const provider = text(item.provider);
  const license = text(item.license);
  const portid = text(item.portid);
  if (!name || !provider || !license || !/^port[0-9]+$/.test(portid))
    return {
      camera: null,
      reason: `${id}: name, provider, license and portid are required`,
    };
  return {
    camera: {
      ...item,
      id,
      name,
      provider,
      license,
      portid,
      url,
      snapshotUrl,
      lat,
      lon,
      city: text(item.city) || name,
      cityId: text(item.cityId) || portid,
      feedType: 'image',
      sourceKind:
        item.sourceKind === PORT_ROAD_CAMERA_SOURCE_KIND
          ? PORT_ROAD_CAMERA_SOURCE_KIND
          : PORT_CAMERA_SOURCE_KIND,
      poseSource: item.poseSource === 'curated' ? 'curated' : undefined,
    },
    reason: null,
  };
}

/** Read the committed port camera catalog; malformed rows are skipped with a warning, a missing file yields none. */
export function loadPortSourcesFromCatalog({
  sourceRoot = process.cwd(),
} = {}) {
  const resolved = path.resolve(sourceRoot, DEFAULT_PORT_SOURCE_FILE);
  let rows = [];
  try {
    if (!fs.existsSync(resolved)) {
      console.warn('[CCTV] Port camera catalog missing:', resolved);
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    rows = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(
      '[CCTV] Port camera catalog read error:',
      error?.message || error,
    );
    return [];
  }
  const cameras = [];
  const seen = new Set();
  for (const item of rows) {
    const { camera, reason } = normalizePortCameraRow(item);
    if (!camera) {
      console.warn('[CCTV] Port camera row skipped:', reason);
      continue;
    }
    if (seen.has(camera.id)) {
      console.warn('[CCTV] Port camera row skipped: duplicate id', camera.id);
      continue;
    }
    seen.add(camera.id);
    cameras.push(camera);
  }
  console.log('[CCTV] Loaded port camera sources:', cameras.length);
  return cameras;
}
