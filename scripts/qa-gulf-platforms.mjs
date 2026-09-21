/**
 * Headless check for `production-gulf-platforms` (row 11, docs/COMMODITIES-PLAN.md §13).
 *
 * A committed check, like `qa-gas-flows.mjs`: it exists in a clean checkout
 * and is the evidence milestones 2 and 3 cite. What it proves:
 *   1. The layer registers, enables and reads its bundle; the counts on the
 *      globe are the bundle's counts (G1).
 *   2. Every platform on the far side of the planet is hidden (the
 *      horizon-cull pass), and every one over the Gulf is shown.
 *   3. The tiers switch at the datacenters heights; hovering a producer at
 *      any depth raises its card; clicking it selects it.
 *   4. Activation and heap growth stay inside the pre-committed gate.
 *   5. The panel line names the current month and the months still filling.
 *   6. (Milestone 3) the click opens the dossier with a 120-point chart.
 *
 * Run against a FRESH dev server from the tree under test — a long-lived
 * server fails the activation gate for reasons that have nothing to do with
 * the layer (see the project gotchas):
 *   npx vite --port 4174 --strictPort --host 127.0.0.1
 *   node scripts/qa-gulf-platforms.mjs --url http://127.0.0.1:4174
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
const APP_URL = argOf('--url', process.env.GEV_URL || 'http://127.0.0.1:4174');
const HEADFUL = argv.includes('--headful');
const LAYER_ID = 'production-gulf-platforms';

/** Pre-committed gate (milestone 2). */
const MAX_ACTIVATION_MS = 900;
const MAX_HEAP_GROWTH_MIB = 100;

/** The bundle is the expectation: the globe must show what the file says. */
const bundle = JSON.parse(
  fs.readFileSync(
    path.join(
      REPO_ROOT,
      'src',
      'data',
      'local_data',
      'bsee_gulf',
      'platforms.json',
    ),
    'utf8',
  ),
);
const expected = {
  installed: bundle.structures.length,
  producing: bundle.counts.producingCurrent,
  month: bundle.current.month,
};
const topProducer = bundle.structures
  .filter((s) => s.series && s.series.gas[bundle.current.index] > 0)
  .sort(
    (a, b) =>
      b.series.gas[bundle.current.index] - a.series.gas[bundle.current.index],
  )[0];

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Pin the camera straight down over lon/lat at a height; raise moveEnd so tiers settle. */
async function setView(page, lon, lat, height) {
  await page.evaluate(
    (lon, lat, height) => {
      const v = window.__godsEyeView.viewer;
      v.camera.cancelFlight();
      const ell = v.scene.globe.ellipsoid;
      v.camera.setView({
        destination: ell.cartographicToCartesian({
          longitude: (lon * Math.PI) / 180,
          latitude: (lat * Math.PI) / 180,
          height,
        }),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      v.camera.moveEnd.raiseEvent?.();
      v.scene.requestRender?.();
    },
    lon,
    lat,
    height,
  );
  await sleep(2_000);
}

const readStats = async (page, label) => {
  const stats = await page.evaluate(
    (layerId) =>
      window.__godsEyeView.dataManager.layers
        .get(layerId)
        ?.module?.getStats?.() ?? null,
    LAYER_ID,
  );
  report(label, {
    count: stats?.count,
    installed: stats?.installed,
    tier: stats?.tier,
    hoverId: stats?.hoverId,
    selectedId: stats?.selectedId,
    dossierOpen: stats?.dossierOpen,
    source: stats?.source,
  });
  return stats;
};

/** How many platform points are currently shown, from the layer's data source. */
const shownPoints = (page) =>
  page.evaluate((layerId) => {
    const v = window.__godsEyeView.viewer;
    const ds = v.dataSources.getByName(layerId)[0];
    if (!ds) return null;
    const now = v.clock.currentTime;
    let shown = 0;
    let total = 0;
    for (const e of ds.entities.values) {
      if (!e.point) continue;
      total += 1;
      if (e.point.show?.getValue?.(now) !== false) shown += 1;
    }
    return { shown, total };
  }, LAYER_ID);

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

  /** Park over the Gulf at global height with every other layer off. */
  const baseline = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    gev.viewer.camera.cancelFlight();
    for (const [id] of gev.dataManager.layers) {
      if (id === layerId) continue;
      try {
        await gev.dataManager.setEnabled(id, false, { origin: 'user' });
      } catch {
        /* measured via counts below */
      }
    }
    return {
      registered: gev.dataManager.layers.has(layerId),
      heapMiB: performance.memory
        ? performance.memory.usedJSHeapSize / 1048576
        : null,
    };
  }, LAYER_ID);
  await setView(page, -90.5, 27.5, 14_000_000);
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
  await sleep(2_500);

  const globalStats = await readStats(page, 'getStats @ global');
  report('activation ms @ global', Math.round(activation.elapsed));
  check(
    `activation under ${MAX_ACTIVATION_MS} ms`,
    activation.elapsed < MAX_ACTIVATION_MS,
    {
      got: Math.round(activation.elapsed),
    },
  );
  check(
    `${expected.producing} producing structures (the bundle's count)`,
    globalStats?.count === expected.producing,
    {
      got: globalStats?.count,
    },
  );
  check(
    `${expected.installed} installed structures drawn`,
    globalStats?.installed === expected.installed &&
      globalStats?.drawn === expected.installed,
    {
      got: [globalStats?.installed, globalStats?.drawn],
    },
  );
  check('tier is global at 14,000 km', globalStats?.tier === 'global');
  check(
    `panel line names the current month ${expected.month}`,
    String(globalStats?.source).includes(`AS OF ${expected.month}`),
    {
      got: globalStats?.source,
    },
  );
  check(
    'panel line names the months still filling',
    /% REPORTED/.test(String(globalStats?.source)),
  );
  check(
    'the layer is published, never live',
    globalStats?.freshnessClass === 'published',
  );

  const overGulf = await shownPoints(page);
  check(
    'every platform is shown over the Gulf',
    overGulf?.shown === overGulf?.total &&
      overGulf?.total === expected.installed,
    overGulf,
  );

  const heapAfter = await page.evaluate(() =>
    performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  );
  if (baseline.heapMiB !== null && heapAfter !== null) {
    const growth = heapAfter - baseline.heapMiB;
    report('heap growth MiB', Math.round(growth));
    check(
      `heap growth under ${MAX_HEAP_GROWTH_MIB} MiB`,
      growth < MAX_HEAP_GROWTH_MIB,
      { got: Math.round(growth) },
    );
  }

  /** The far side of the planet: nothing may paint through it. */
  await setView(page, 90, 27.5, 14_000_000);
  const farSide = await shownPoints(page);
  check(
    'no platform paints through the globe from the far side',
    farSide?.shown === 0,
    farSide,
  );

  /** Regional over the central Gulf. */
  await setView(page, -90.5, 27.5, 1_200_000);
  const regionalStats = await readStats(page, 'getStats @ regional');
  check('tier switched to regional', regionalStats?.tier === 'regional', {
    got: regionalStats?.tier,
  });
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'gulf-platforms-regional.png'),
  });

  /** Hover the top producer: its card must answer at regional depth. */
  const top = topProducer;
  // The page bundles Cesium as a module (no global), so the scene does the
  // projection: world position → canvas pixel.
  const screen = await page.evaluate(
    (lon, lat) => {
      const v = window.__godsEyeView.viewer;
      const world = v.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: (lon * Math.PI) / 180,
        latitude: (lat * Math.PI) / 180,
        height: 0,
      });
      const c = v.scene.cartesianToCanvasCoordinates(world);
      return c ? { x: c.x, y: c.y } : null;
    },
    top.lon,
    top.lat,
  );
  report('top producer', {
    id: top.id,
    name: top.name,
    gasMcfd: top.series.gas[bundle.current.index],
    screen,
  });
  if (screen) {
    await page.mouse.move(screen.x, screen.y);
    await sleep(400);
    await page.mouse.move(screen.x + 1, screen.y);
    await sleep(400);
  }
  const hoverStats = await readStats(page, 'getStats after hover');
  check('hovering the top producer names it', hoverStats?.hoverId === top.id, {
    got: hoverStats?.hoverId,
    want: top.id,
  });

  /** Click it: selected at once, and the dossier opens once milestone 3 lands. */
  if (screen) {
    await page.mouse.click(screen.x, screen.y);
    await sleep(3_000);
  }
  const clickStats = await readStats(page, 'getStats after click');
  check(
    'clicking selects the top producer',
    clickStats?.selectedId === top.id,
    { got: clickStats?.selectedId },
  );
  const dossier = await page.evaluate(() => {
    const node = document.getElementById('gulf-dossier');
    if (!node || node.hidden) return { exists: Boolean(node), open: false };
    return {
      exists: true,
      open: true,
      title: node.querySelector('.dc-dossier__title')?.textContent ?? null,
      sections: node.querySelectorAll('.dc-section').length,
      chartPoints: node.querySelectorAll('.dc-chart [data-point]').length,
      rows: node.querySelectorAll('.dc-row').length,
    };
  });
  report('dossier', dossier);
  if (dossier.exists) {
    check(
      'the dossier opened for the clicked platform',
      dossier.open === true && String(dossier.title).includes(top.name.trim()),
      dossier,
    );
    check(
      'the dossier chart carries 120 monthly points',
      dossier.chartPoints === 120,
      { got: dossier.chartPoints },
    );
    check('the dossier has at least five sections', dossier.sections >= 5, {
      got: dossier.sections,
    });
  } else {
    report('dossier', 'not built yet (milestone 3)');
  }
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'gulf-platforms-selected.png'),
  });

  /** Local over the same platform. */
  await setView(page, top.lon, top.lat, 120_000);
  const localStats = await readStats(page, 'getStats @ local');
  check('tier switched to local', localStats?.tier === 'local', {
    got: localStats?.tier,
  });
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'gulf-platforms-local.png'),
  });

  check(
    'no uncaught page errors',
    pageErrors.length === 0,
    pageErrors.slice(0, 3),
  );
  console.log(`  [SHOT] ${SHOTS_DIR}`);
} finally {
  await browser.close();
}

console.log(
  failures === 0
    ? '\nqa-gulf-platforms: PASS'
    : `\nqa-gulf-platforms: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
