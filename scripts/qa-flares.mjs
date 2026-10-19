/**
 * Headless check for `commodity-flares`, the row 15 nightly flare heat
 * (docs/COMMODITIES-PLAN.md §17, M3 gate).
 *
 * What it proves:
 *   1. `/api/flares?region=williston` answers 200 with nights that each
 *      carry a cloud state, behind the one-minute route cache.
 *   2. The layer registers, enables, and its card numbers equal the API:
 *      the display night (the newest trusted clear night), its lit sites,
 *      site FRP and detection split, with all 7,493 bundled sites pinned.
 *   3. Activation apart from the fetches, heap growth and the layer's own
 *      frame cost at the regional tier stay inside the pre-committed gates
 *      (G15.5).
 *   4. Hovering a site raises its card; clicking selects it.
 *
 * Usage:
 *   node scripts/qa-flares.mjs [--url http://localhost:4173] [--headful]
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
const LAYER_ID = 'commodity-flares';
const PINNED_SITES = 7_493;

/** Pre-committed gates (G15.5). */
const MAX_LAYER_ACTIVATION_MS = 1_000;
const MAX_HEAP_GROWTH_MIB = 50;
const MAX_LAYER_FRAME_COST_MS = 16;

const GLOBAL_VIEW = [-103.1, 47.85, 16_000_000];
const REGIONAL_VIEW = [-103.1, 47.85, 1_200_000];

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

/** The display night the layer draws: newest trusted clear, else newest. */
function displayNightOf(nights) {
  const sorted = [...nights].sort((a, b) => (a.night < b.night ? 1 : -1));
  return (
    sorted.find((n) => n.cloud?.state === 'clear' && !n.suspect) ??
    sorted[0] ??
    null
  );
}

const SITES_BUNDLE = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'src/data/local_data/flares/williston/sites.json'),
    'utf8',
  ),
);

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
    const response = await fetch('/api/flares?region=williston');
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      status: response.status,
      cache: response.headers.get('cache-control'),
      payload,
    };
  });
  check('route answers 200', route.status === 200, { got: route.status });
  check('route carries the one-minute cache', route.cache === 'public, max-age=60', {
    got: route.cache,
  });
  const nights = Array.isArray(route.payload?.nights)
    ? route.payload.nights
    : [];
  check('payload serves nights, each with a cloud state', nights.length > 0 &&
    nights.every((n) => typeof n.cloud?.state === 'string'), {
    nights: nights.length,
  });
  const expected = displayNightOf(nights);
  report('display night (expected)', {
    night: expected?.night,
    cloud: expected?.cloud?.state,
    litSites: expected?.litSites,
    siteFrpMw: expected?.siteFrpMw,
    pips: expected?.pips?.length,
  });

  /** Park at full earth over the basin with every other layer off. */
  const baseline = await page.evaluate(
    async (layerId, view) => {
      const gev = window.__godsEyeView;
      const v = gev.viewer;
      v.camera.cancelFlight();
      const ell = v.scene.globe.ellipsoid;
      v.camera.setView({
        destination: ell.cartographicToCartesian({
          longitude: (view[0] * Math.PI) / 180,
          latitude: (view[1] * Math.PI) / 180,
          height: view[2],
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
    },
    LAYER_ID,
    GLOBAL_VIEW,
  );
  check(
    'layer is registered in the data manager',
    baseline.registered === true,
  );

  /** Enable; activation is gated apart from the route and bundle fetches. */
  const activation = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    performance.setResourceTimingBufferSize(2_000);
    performance.clearResourceTimings();
    const started = performance.now();
    await gev.dataManager.setEnabled(layerId, true, { origin: 'user' });
    const elapsed = performance.now() - started;
    const fetches = performance
      .getEntriesByType('resource')
      .filter((e) => /flares|sites/.test(e.name));
    return {
      elapsed,
      fetchMs: fetches.length
        ? Math.max(...fetches.map((e) => e.responseEnd)) -
          Math.min(...fetches.map((e) => e.startTime))
        : null,
      files: fetches.length,
    };
  }, LAYER_ID);
  await sleep(2_500);

  const readStats = (label) =>
    page
      .evaluate(
        (layerId) =>
          window.__godsEyeView.dataManager.layers
            .get(layerId)
            ?.module?.getStats?.() ?? null,
        LAYER_ID,
      )
      .then((stats) => {
        report(label, stats && {
          count: stats.count,
          pinned: stats.pinned,
          night: stats.night,
          cloud: stats.cloud,
          litSites: stats.litSites,
          siteFrpMw: stats.siteFrpMw,
          clearNights: stats.clearNights,
          tier: stats.tier,
          drawn: stats.drawn,
          error: stats.error,
        });
        return stats;
      });

  const globalStats = await readStats('getStats @ global');
  const layerMs = activation.elapsed - (activation.fetchMs ?? 0);
  report('activation ms @ global', {
    total: Math.round(activation.elapsed),
    fetches: activation.fetchMs === null ? null : Math.round(activation.fetchMs),
    files: activation.files,
    layer: Math.round(layerMs),
  });
  check(
    `activation, apart from the fetches, under ${MAX_LAYER_ACTIVATION_MS} ms`,
    layerMs < MAX_LAYER_ACTIVATION_MS,
    { got: Math.round(layerMs), fetchSeen: activation.fetchMs !== null },
  );
  check('no fetch error recorded', globalStats?.error == null, {
    got: globalStats?.error,
  });
  check(`${PINNED_SITES} sites pinned`, globalStats?.pinned === PINNED_SITES, {
    got: globalStats?.pinned,
  });

  /** Card numbers equal the API (M3 verify). */
  check(
    'display night equals the API',
    globalStats?.night === expected?.night,
    { got: globalStats?.night, want: expected?.night },
  );
  check(
    'lit sites equal the API',
    globalStats?.litSites === expected?.litSites,
    { got: globalStats?.litSites, want: expected?.litSites },
  );
  check(
    'site FRP equals the API',
    globalStats?.siteFrpMw === expected?.siteFrpMw,
    { got: globalStats?.siteFrpMw, want: expected?.siteFrpMw },
  );
  check(
    'detection split equals the API',
    JSON.stringify(globalStats?.counts) === JSON.stringify(expected?.counts),
    { got: globalStats?.counts, want: expected?.counts },
  );
  const card = Array.isArray(globalStats?.regionCard)
    ? globalStats.regionCard.join(' | ')
    : null;
  check(
    'the region card is published and carries the lit count',
    card !== null && card.includes(`${expected?.litSites} sites lit`),
    { card },
  );

  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'flares-global.png') });
  console.log(`  [SHOT] ${path.join(SHOTS_DIR, 'flares-global.png')}`);

  /** Regional depth: every site drawn, pips drawn, the card follows. */
  await page.evaluate((view) => {
    const v = window.__godsEyeView.viewer;
    v.camera.cancelFlight();
    const ell = v.scene.globe.ellipsoid;
    v.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: (view[0] * Math.PI) / 180,
        latitude: (view[1] * Math.PI) / 180,
        height: view[2],
      }),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    v.camera.moveEnd.raiseEvent?.();
    v.scene.requestRender?.();
  }, REGIONAL_VIEW);
  await sleep(3_000);

  const regionalStats = await readStats('getStats @ regional');
  check('tier is regional', regionalStats?.tier === 'regional', {
    got: regionalStats?.tier,
  });
  check(
    'every bundled site holds one drawn point',
    regionalStats?.drawn?.sites === PINNED_SITES,
    { got: regionalStats?.drawn?.sites },
  );
  check(
    'the display night’s pips are drawn',
    regionalStats?.drawn?.pips === (expected?.pips?.length ?? 0),
    { got: regionalStats?.drawn?.pips, want: expected?.pips?.length ?? 0 },
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

  /** Sixty forced frames; the sorted deltas after a warm-up of five. */
  const measureFrames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const v = window.__godsEyeView.viewer;
          const deltas = [];
          let last = performance.now();
          let n = 0;
          const tick = () => {
            v.scene.requestRender?.();
            const now = performance.now();
            deltas.push(now - last);
            last = now;
            n += 1;
            if (n < 60) requestAnimationFrame(tick);
            else resolve(deltas.slice(5).sort((a, b) => a - b));
          };
          requestAnimationFrame(tick);
        }),
    );
  const median = (sorted) => sorted[Math.floor(sorted.length / 2)];
  const framesOn = await measureFrames();
  await page.evaluate(
    (layerId) =>
      window.__godsEyeView.dataManager.setEnabled(layerId, false, {
        origin: 'user',
      }),
    LAYER_ID,
  );
  await sleep(500);
  const framesOff = await measureFrames();
  const frameCost = median(framesOn) - median(framesOff);
  report('layer frame cost ms @ regional', {
    on: Math.round(median(framesOn) * 10) / 10,
    off: Math.round(median(framesOff) * 10) / 10,
    cost: Math.round(frameCost * 10) / 10,
  });
  check(
    `layer frame cost under ${MAX_LAYER_FRAME_COST_MS} ms`,
    frameCost < MAX_LAYER_FRAME_COST_MS,
    { got: Math.round(frameCost * 10) / 10 },
  );
  await page.evaluate(
    (layerId) =>
      window.__godsEyeView.dataManager.setEnabled(layerId, true, {
        origin: 'user',
      }),
    LAYER_ID,
  );
  await sleep(2_000);

  /** Hover the largest lit site; its card and the pointer cursor follow. */
  const hoverTarget = (() => {
    const bySite = new Map(SITES_BUNDLE.sites.map((s) => [s.id, s]));
    for (const row of expected?.sites ?? []) {
      const site = bySite.get(row.id);
      if (site) return { id: row.id, lat: site.lat, lon: site.lon };
    }
    return null;
  })();
  if (hoverTarget) {
    const screen = await page.evaluate((target) => {
      const v = window.__godsEyeView.viewer;
      const world = v.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: (target.lon * Math.PI) / 180,
        latitude: (target.lat * Math.PI) / 180,
        height: 0,
      });
      const c = v.scene.cartesianToCanvasCoordinates(world);
      return c ? { x: c.x, y: c.y } : null;
    }, hoverTarget);
    check('the largest lit site projects on screen', screen !== null);
    if (screen) {
      await page.mouse.move(screen.x, screen.y);
      await sleep(400);
      await page.mouse.move(screen.x + 1, screen.y);
      await sleep(400);
      const hoverStats = await page.evaluate(
        (layerId) =>
          window.__godsEyeView.dataManager.layers
            .get(layerId)
            ?.module?.getStats?.() ?? null,
        LAYER_ID,
      );
      // The hovered site may be a neighbour whose mark covers the same
      // pixel at this height (the onshore harness rule): accept any site
      // within the pointer tolerance of the target.
      const hoveredId = hoverStats?.hoverId ?? null;
      const hoveredSite = hoveredId
        ? SITES_BUNDLE.sites.find((s) => s.id === hoveredId)
        : null;
      const hoveredScreen = hoveredSite
        ? await page.evaluate((target) => {
            const v = window.__godsEyeView.viewer;
            const world = v.scene.globe.ellipsoid.cartographicToCartesian({
              longitude: (target.lon * Math.PI) / 180,
              latitude: (target.lat * Math.PI) / 180,
              height: 0,
            });
            const c = v.scene.cartesianToCanvasCoordinates(world);
            return c ? { x: c.x, y: c.y } : null;
          }, hoveredSite)
        : null;
      const hoverDistancePx = hoveredScreen
        ? Math.hypot(hoveredScreen.x - screen.x, hoveredScreen.y - screen.y)
        : null;
      check(
        'hover raises a site under the pointer',
        hoveredId !== null && hoverDistancePx !== null && hoverDistancePx < 30,
        { got: hoveredId, want: hoverTarget.id, distancePx: hoverDistancePx },
      );
      await page.mouse.click(screen.x, screen.y);
      await sleep(400);
      const clickStats = await page.evaluate(
        (layerId) =>
          window.__godsEyeView.dataManager.layers
            .get(layerId)
            ?.module?.getStats?.() ?? null,
        LAYER_ID,
      );
      check(
        'click selects the site under the pointer',
        clickStats?.selectedId !== null &&
          clickStats?.selectedId === (clickStats?.hoverId ?? hoveredId),
        { got: clickStats?.selectedId },
      );
    }
  } else {
    report('hover skipped', 'no lit site on the display night');
  }

  await page.screenshot({ path: path.join(SHOTS_DIR, 'flares-regional.png') });
  console.log(`  [SHOT] ${path.join(SHOTS_DIR, 'flares-regional.png')}`);

  check(
    'no uncaught page errors',
    pageErrors.length === 0,
    pageErrors.slice(0, 3),
  );
} finally {
  await browser.close();
}

console.log(
  failures === 0 ? '\nqa-flares: PASS' : `\nqa-flares: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
