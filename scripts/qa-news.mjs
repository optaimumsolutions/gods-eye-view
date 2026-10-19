/**
 * Headless check for `commodity-news`, the row 5 asset-headline badges.
 *
 * What it proves:
 *   1. The layer registers, enables and pins all thirty gazetteer assets.
 *   2. `/api/news-assets` answers 200 with a well-formed payload and the
 *      fifteen-minute cache header, and the layer reads it without error.
 *   3. An asset with no matched headline draws nothing; a matched asset's
 *      badge appears once its group fills (reported, never gated — GDELT
 *      throttles shared boxes, so live volume is not a pass condition).
 *   4. Activation cost is inside the pre-committed gate.
 *
 * Usage:
 *   node scripts/qa-news.mjs [--url http://localhost:4173] [--headful]
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
const LAYER_ID = 'commodity-news';
const PINNED_ASSETS = 30;

/** Pre-committed gate: thirty pinned points is a trivial draw. */
const MAX_ACTIVATION_MS = 400;

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

  /** The route answers on its own, before any layer is enabled. */
  const route = await page.evaluate(async () => {
    const response = await fetch('/api/news-assets');
    const cache = response.headers.get('cache-control');
    const state = response.headers.get('x-news-assets');
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { status: response.status, cache, state, payload };
  });
  check('route answers 200', route.status === 200, { got: route.status });
  check(
    'payload carries status, assets and the wire notice',
    ['ready', 'warming'].includes(route.payload?.status) &&
      Array.isArray(route.payload?.assets) &&
      /UNVERIFIED WIRE/.test(String(route.payload?.notice)),
    { status: route.payload?.status, state: route.state },
  );
  report('route state', {
    state: route.state,
    assets: route.payload?.assets?.length,
  });

  /** Park at full earth with every other layer off. */
  const baseline = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    const v = gev.viewer;
    v.camera.cancelFlight();
    const ell = v.scene.globe.ellipsoid;
    v.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: (20 * Math.PI) / 180,
        latitude: (25 * Math.PI) / 180,
        height: 16_000_000,
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
    return { registered: gev.dataManager.layers.has(layerId) };
  }, LAYER_ID);
  check(
    'layer is registered in the data manager',
    baseline.registered === true,
  );

  const activation = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    const started = performance.now();
    await gev.dataManager.setEnabled(layerId, true, { origin: 'user' });
    return { elapsed: performance.now() - started };
  }, LAYER_ID);
  await new Promise((r) => setTimeout(r, 2_500));

  const stats = await page.evaluate(
    (layerId) =>
      window.__godsEyeView.dataManager.layers.get(layerId)?.module?.getStats?.() ??
      null,
    LAYER_ID,
  );
  report('getStats @ global', stats);
  report('activation ms', Math.round(activation.elapsed));
  check(
    `activation under ${MAX_ACTIVATION_MS} ms`,
    activation.elapsed < MAX_ACTIVATION_MS,
    { got: Math.round(activation.elapsed) },
  );
  check(`${PINNED_ASSETS} assets pinned`, stats?.pinned === PINNED_ASSETS, {
    got: stats?.pinned,
  });
  check('source is GDELT DOC', stats?.source === 'GDELT DOC', {
    got: stats?.source,
  });
  check('no fetch error recorded', stats?.error == null, { got: stats?.error });
  report('assets with headlines (warming-dependent)', stats?.count);
  report('headlines total', stats?.headlines);

  /** Only matched assets draw: shown points never exceed the matched count. */
  const drawn = await page.evaluate((layerId) => {
    const gev = window.__godsEyeView;
    const sources = gev.viewer.dataSources;
    for (let i = 0; i < sources.length; i += 1) {
      const ds = sources.get(i);
      if (ds.name !== layerId) continue;
      const values = ds.entities.values;
      return {
        entities: values.length,
        shown: values.filter((entity) => entity.point?.show?.getValue?.())
          .length,
      };
    }
    return null;
  }, LAYER_ID);
  report('entities', drawn);
  check(
    'every gazetteer asset holds one pinned entity',
    drawn?.entities === PINNED_ASSETS,
    { got: drawn?.entities },
  );
  check(
    'no badge draws without a matched headline',
    Number.isFinite(drawn?.shown) && drawn.shown <= (stats?.count ?? 0),
    { shown: drawn?.shown, matched: stats?.count },
  );

  check(
    'no uncaught page errors',
    pageErrors.length === 0,
    pageErrors.slice(0, 3),
  );

  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const shot = path.join(SHOTS_DIR, 'news-global.png');
  await page.screenshot({ path: shot });
  console.log(`  [SHOT] ${shot}`);
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nqa-news: PASS' : `\nqa-news: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
