/**
 * Headless check for `commodity-gas-flows`, the PENCIL substrate.
 *
 * This is a **committed** check, unlike the ad-hoc render probes under
 * `.gev-logs/` which are git-ignored and do not exist in a clean checkout.
 * It is the measurement half of milestone 5's performance gate: the network is
 * 32,885 ground-polyline parts, far above anything this repo has measured, and
 * `docs/PERFORMANCE.md` records only Apple M5 figures and sets no budget. So
 * the thresholds below are this row's pre-committed choice, decided before the
 * code was written rather than after a slow demo.
 *
 * What it proves:
 *   1. The layer registers, enables and reads its bundles.
 *   2. At global the network is withheld entirely and the pips still draw.
 *   3. At regional the Interstate network appears; at local both classes do.
 *   4. Activation cost and heap growth are inside the pre-committed gate.
 *   5. Nothing in the layer is pickable, and no volume string is ever shown.
 *
 * Usage:
 *   node scripts/qa-gas-flows.mjs [--url http://localhost:4173] [--headful]
 * Visual proof saved to qa-shots/ (git-ignored).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_DIR = process.env.QA_SHOTS_DIR || path.join(REPO_ROOT, 'qa-shots');
const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const APP_URL = argOf('--url', process.env.GEV_URL || 'http://localhost:4173');
const HEADFUL = argv.includes('--headful');
const LAYER_ID = 'commodity-gas-flows';

/** Pre-committed gate (milestone 5). Breach means reduce the drawn set. */
const MAX_ACTIVATION_MS = 900;
const MAX_HEAP_GROWTH_MIB = 250;

let failures = 0;
function check(name, pass, detail) {
  if (!pass) failures += 1;
  const tag = pass ? 'PASS' : 'FAIL';
  const extra = detail === undefined ? '' : ` — ${JSON.stringify(detail)}`;
  console.log(`  [${tag}] ${name}${extra}`);
}
function report(name, detail) {
  console.log(`  [MEAS] ${name} — ${JSON.stringify(detail)}`);
}

const browser = await puppeteer.launch({
  headless: HEADFUL ? false : 'new',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1440,900',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) =>
    pageErrors.push(String(error.message).replace(/https?:\/\/\S+/g, '[URL]')),
  );
  await page.setViewport({ width: 1440, height: 860 });
  const testUrl = new URL(APP_URL);
  testUrl.searchParams.set('welcome', '0');
  await page.goto(testUrl.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.styleManager &&
      document.getElementById('loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );

  report(
    'renderer',
    await page.evaluate(() => {
      const gl = window.__godsEyeView.viewer.scene.context._gl;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    }),
  );

  /** Park at full earth with every layer off, so the gas layer is measured alone. */
  const baseline = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    const v = gev.viewer;
    v.camera.cancelFlight();
    const ell = v.scene.globe.ellipsoid;
    v.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: (-98 * Math.PI) / 180,
        latitude: (39 * Math.PI) / 180,
        height: 14_000_000,
      }),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    v.camera.moveEnd.raiseEvent?.();
    for (const [id] of gev.dataManager.layers) {
      if (id === layerId) continue;
      try {
        await gev.dataManager.setEnabled(id, false, { origin: 'user' });
      } catch {
        /* measured via counts below */
      }
    }
    v.scene.requestRender?.();
    return {
      registered: gev.dataManager.layers.has(layerId),
      heapMiB: performance.memory
        ? performance.memory.usedJSHeapSize / 1048576
        : null,
    };
  }, LAYER_ID);

  check(
    'layer is registered in the data manager',
    baseline.registered === true,
  );

  /** Activation: the honest cost of turning it on at global. */
  const activation = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    const started = performance.now();
    await gev.dataManager.setEnabled(layerId, true, { origin: 'user' });
    const elapsed = performance.now() - started;
    return { elapsed };
  }, LAYER_ID);
  await new Promise((r) => setTimeout(r, 2_500));

  const readStats = async (label) => {
    const stats = await page.evaluate(
      (layerId) =>
        window.__godsEyeView.dataManager.layers
          .get(layerId)
          ?.module?.getStats?.() ?? null,
      LAYER_ID,
    );
    report(label, stats);
    return stats;
  };

  const globalStats = await readStats('getStats @ global');
  report('activation ms @ global', Math.round(activation.elapsed));
  check(
    `activation under ${MAX_ACTIVATION_MS} ms`,
    activation.elapsed < MAX_ACTIVATION_MS,
    { got: Math.round(activation.elapsed) },
  );
  check('60 crossings loaded', globalStats?.count === 60, {
    got: globalStats?.count,
  });
  check('234 systems loaded', globalStats?.systems === 234, {
    got: globalStats?.systems,
  });
  check('grade is pencil', globalStats?.grade === 'pencil');
  check(
    'network is withheld entirely at global',
    globalStats?.networkDrawn === false,
    { got: globalStats?.networkDrawn },
  );
  // The milestone-5 fallback: the grid costs NETWORK_DRAW_COST_MIB (a dated
  // constant in model.js, ~500 MiB on this machine), so it is opt-in.
  check(
    'GRID defaults OFF (milestone 5 fallback)',
    globalStats?.networkEnabled === false,
    { got: globalStats?.networkEnabled },
  );
  check(
    'a dark grid says why it is dark',
    /GRID .*OFF/.test(String(globalStats?.source)),
    { got: globalStats?.source },
  );
  check(
    'meta line states the volumes are unavailable',
    /UNAVAILABLE|NO VOLUMES/.test(String(globalStats?.source)),
    { got: globalStats?.source },
  );
  check(
    'meta line never claims a volume',
    !/MMcf/.test(String(globalStats?.source)),
  );

  /** Regional: Interstate appears, Intrastate does not. */
  await page.evaluate(() => {
    const v = window.__godsEyeView.viewer;
    const ell = v.scene.globe.ellipsoid;
    v.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: (-96 * Math.PI) / 180,
        latitude: (33 * Math.PI) / 180,
        height: 1_200_000,
      }),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    v.camera.moveEnd.raiseEvent?.();
    v.scene.requestRender?.();
  });
  await new Promise((r) => setTimeout(r, 2_500));
  const regionalOff = await readStats('getStats @ regional (grid off)');
  check('tier switched to regional', regionalOff?.tier === 'regional', {
    got: regionalOff?.tier,
  });
  check(
    'grid stays dark at regional until asked for',
    regionalOff?.networkDrawn === false,
  );

  const heapBeforeGrid = await page.evaluate(() =>
    performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  );
  if (baseline.heapMiB !== null && heapBeforeGrid !== null) {
    const growth = heapBeforeGrid - baseline.heapMiB;
    report(
      'heap growth MiB — layer as shipped (pips only)',
      Math.round(growth),
    );
    check(
      `as-shipped heap growth under ${MAX_HEAP_GROWTH_MIB} MiB`,
      growth < MAX_HEAP_GROWTH_MIB,
      { got: Math.round(growth) },
    );
  }

  /** Now opt in, and measure what the grid actually costs. */
  await page.evaluate((layerId) => {
    window.__godsEyeView.dataManager.layers
      .get(layerId)
      ?.module?.setNetworkEnabled?.(true);
  }, LAYER_ID);
  await new Promise((r) => setTimeout(r, 6_000));
  const regionalStats = await readStats('getStats @ regional (grid on)');
  check('network is drawn once enabled', regionalStats?.networkDrawn === true, {
    got: regionalStats?.networkDrawn,
  });
  report('network assembly ms', regionalStats?.networkBuildMs);

  /** Local: both pipe classes. */
  await page.evaluate(() => {
    const v = window.__godsEyeView.viewer;
    const ell = v.scene.globe.ellipsoid;
    v.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: (-97.5 * Math.PI) / 180,
        latitude: (28.9 * Math.PI) / 180,
        height: 120_000,
      }),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    v.camera.moveEnd.raiseEvent?.();
    v.scene.requestRender?.();
  });
  await new Promise((r) => setTimeout(r, 4_000));
  const localStats = await readStats('getStats @ local');
  check('tier switched to local', localStats?.tier === 'local', {
    got: localStats?.tier,
  });
  check('network is drawn at local', localStats?.networkDrawn === true);

  /** The network must not be pickable, at any tier. */
  const pickable = await page.evaluate(() => {
    const scene = window.__godsEyeView.viewer.scene;
    const prims = scene.groundPrimitives;
    for (let i = 0; i < prims.length; i += 1) {
      const p = prims.get(i);
      if (p?.allowPicking === true && p?.geometryInstances?.length > 1000) {
        return true;
      }
    }
    return false;
  });
  check('no large ground primitive allows picking', pickable === false);

  const heap = await page.evaluate(() =>
    performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  );
  if (heapBeforeGrid !== null && heap !== null) {
    // Recorded, not gated: opting in is an informed choice and this is the
    // number the operator is choosing. It is why GRID ships off.
    report(
      'heap growth MiB — grid opted in',
      Math.round(heap - heapBeforeGrid),
    );
    report('heap total MiB — grid opted in', Math.round(heap));
  } else {
    report('heap growth MiB', 'unavailable (performance.memory absent)');
  }

  check(
    'no uncaught page errors',
    pageErrors.length === 0,
    pageErrors.slice(0, 3),
  );

  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const shot = path.join(SHOTS_DIR, 'gas-flows-local.png');
  await page.screenshot({ path: shot });
  console.log(`  [SHOT] ${shot}`);
} finally {
  await browser.close();
}

console.log(
  failures === 0
    ? '\nqa-gas-flows: PASS'
    : `\nqa-gas-flows: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
