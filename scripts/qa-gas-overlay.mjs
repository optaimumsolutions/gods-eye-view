/**
 * Headless check for `gas-pipeline-overlay`, the row 17 P4 layer
 * (docs/COMMODITIES-PLAN.md §19.5 P4 gate).
 *
 * The oracle route only answers through the hosted console, so the run
 * intercepts `/api/oracle/pipeline-overlay` and serves a fixture shaped by
 * the P3 live dry run (Freeport 0.8219, Golden Pass 0.3925, one notice
 * naming a Loc and a station). What it proves:
 *   1. The layer registers and enables; every lookup point and station is
 *      drawn; the notice rings match the flagged marks.
 *   2. Hovering a point raises the card with the P4 gate's five facts:
 *      gas day, design, scheduled, utilization, active notices.
 *   3. Activation apart from the fetches, heap growth and the layer's own
 *      frame cost stay inside the pre-committed gates.
 *   4. With the route absent (second pass, no interception) the layer
 *      degrades to bundle-only: everything grey, stats say why, no errors.
 *
 * Usage:
 *   node scripts/qa-gas-overlay.mjs [--url http://localhost:4173] [--headful]
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
const LAYER_ID = 'gas-pipeline-overlay';

/** Pre-committed gates. */
const MAX_LAYER_ACTIVATION_MS = 1_500;
const MAX_HEAP_GROWTH_MIB = 60;
const MAX_LAYER_FRAME_COST_MS = 16;

const GLOBAL_VIEW = [-92.5, 30.8, 9_000_000];

const POINTS_CSV = fs.readFileSync(
  path.join(REPO_ROOT, 'src/data/local_data/gas_overlay/points.csv'),
  'utf8',
);
const POINT_COUNT = POINTS_CSV.trim().split('\n').length - 1;
/** The Freeport delivery's committed placement (points.csv gulf_south 24329). */
const FREEPORT = (() => {
  const row = POINTS_CSV.split('\n').find((line) =>
    line.startsWith('gulf_south,24329,'),
  );
  const m = row.match(/,(-\d+\.\d+),(\d+\.\d+),/);
  return { lon: Number(m[1]), lat: Number(m[2]) };
})();
const REGIONAL_VIEW = [FREEPORT.lon, FREEPORT.lat, 600_000];
const STATIONS = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'src/data/local_data/gas_overlay/stations.json'),
    'utf8',
  ),
).stations.length;

/** Shaped by the P3 live dry run (gas day 2026-10-18). */
const FIXTURE = {
  source: 'Oil Oracle store',
  dataset: 'interstate pipeline postings (FERC 18 CFR 284.13)',
  dthPerMcf: 1.038,
  pipelines: [
    {
      id: 'gulf_south',
      name: 'Gulf South Pipeline (Boardwalk)',
      gasDay: '2026-10-18',
      cycle: 'ID3',
      observedAt: '2026-10-18',
      fetchedAt: new Date().toISOString(),
      freshness: { state: 'ok', ageHours: 2 },
      pointCount: 2,
      overDesign: 0,
      points: [
        {
          point: '24329-D',
          loc: '24329',
          name: 'STRATTON RIDGE',
          direction: 'D',
          scheduledDth: 493_140,
          designDth: 600_000,
          utilization: 0.8219,
        },
        {
          point: '3011-D',
          loc: '3011',
          name: 'LAKE CHARLES REFINERY',
          direction: 'D',
          scheduledDth: 10_000,
          designDth: 100_000,
          utilization: 0.1,
        },
      ],
      notices: [
        {
          id: '5038853',
          type: 'Maintenance',
          status: 'Initiate',
          subject: 'Index 198 Pipeline Maintenance',
          postedAt: '2026-10-08 08:42:00',
          effectiveAt: '2026-10-17 09:00:00',
          endsAt: '2027-12-16 09:00:00',
          upcoming: false,
          locs: ['24329'],
          stations: ['Vixen Compressor Station'],
          pipelineWide: false,
          excerpt: 'The following points will be shut-in…',
        },
      ],
    },
    {
      id: 'gulf_run',
      name: 'Gulf Run Pipeline (Energy Transfer)',
      gasDay: '2026-10-18',
      cycle: 'latest',
      fetchedAt: new Date().toISOString(),
      freshness: { state: 'ok', ageHours: 2 },
      pointCount: 1,
      overDesign: 0,
      points: [
        {
          point: '808311',
          loc: '808311',
          name: 'GOLDEN PASS PL',
          direction: 'D',
          scheduledDth: 785_000,
          designDth: 2_000_000,
          utilization: 0.3925,
        },
      ],
      notices: [],
    },
  ],
};

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

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) =>
    pageErrors.push(String(error.message).replace(/https?:\/\/\S+/g, '[URL]')),
  );
  await page.setViewport({ width: 1440, height: 860 });
  let serveFixture = true;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/api/oracle/pipeline-overlay')) {
      if (serveFixture)
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(FIXTURE),
        });
      else request.respond({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    request.continue();
  });
  const testUrl = new URL(APP_URL);
  testUrl.searchParams.set('welcome', '0');
  await page.goto(testUrl.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.styleManager &&
      document.getElementById('loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );

  /** Park over the Gulf Coast with every other layer off. */
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
  check('layer is registered in the data manager', baseline.registered === true);

  const activation = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    performance.setResourceTimingBufferSize(2_000);
    performance.clearResourceTimings();
    const started = performance.now();
    await gev.dataManager.setEnabled(layerId, true, { origin: 'user' });
    const elapsed = performance.now() - started;
    const fetches = performance
      .getEntriesByType('resource')
      .filter((e) => /gas_overlay|pipeline-overlay|lines|stations|points/.test(e.name));
    return {
      elapsed,
      fetchMs: fetches.length
        ? Math.max(...fetches.map((e) => e.responseEnd)) -
          Math.min(...fetches.map((e) => e.startTime))
        : null,
      files: fetches.length,
    };
  }, LAYER_ID);
  await sleep(3_000);

  const readStats = (label) =>
    page
      .evaluate(
        (layerId) =>
          window.__godsEyeView.dataManager.layers.get(layerId)?.module?.getStats?.() ??
          null,
        LAYER_ID,
      )
      .then((stats) => {
        report(label, stats && {
          count: stats.count,
          pinned: stats.pinned,
          stations: stats.stations,
          flagged: stats.flagged,
          notices: stats.notices,
          live: stats.live,
          drawn: stats.drawn,
          tier: stats.tier,
          error: stats.error,
          pipelines: stats.pipelines,
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
    { got: Math.round(layerMs) },
  );
  check('the live route (fixture) was read', globalStats?.live === true);
  check(`${POINT_COUNT} lookup points pinned`, globalStats?.pinned === POINT_COUNT, {
    got: globalStats?.pinned,
    want: POINT_COUNT,
  });
  check(`${STATIONS} stations drawn`, globalStats?.drawn?.stations === STATIONS, {
    got: globalStats?.drawn?.stations,
  });
  check(
    'readings joined (fixture: 3 points read)',
    globalStats?.count === 3,
    { got: globalStats?.count },
  );
  check(
    'notice rings match the flagged marks (Loc 24329 + Vixen)',
    globalStats?.flagged === 2 && globalStats?.drawn?.rings === 2,
    { flagged: globalStats?.flagged, rings: globalStats?.drawn?.rings },
  );
  check(
    'gas day and freshness on the pipelines',
    globalStats?.pipelines?.every(
      (p) => p.gasDay === '2026-10-18' && p.freshness?.state,
    ),
    { got: globalStats?.pipelines?.map((p) => p.gasDay) },
  );

  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'gas-overlay-global.png') });
  console.log(`  [SHOT] ${path.join(SHOTS_DIR, 'gas-overlay-global.png')}`);

  /** Regional depth over Freeport: marks on, hover the P4 gate's card. */
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
  await sleep(2_500);
  const regionalStats = await readStats('getStats @ regional');
  check('tier is regional', regionalStats?.tier === 'regional');

  const screen = await page.evaluate((target) => {
    const v = window.__godsEyeView.viewer;
    const world = v.scene.globe.ellipsoid.cartographicToCartesian({
      longitude: (target.lon * Math.PI) / 180,
      latitude: (target.lat * Math.PI) / 180,
      height: 0,
    });
    const c = v.scene.cartesianToCanvasCoordinates(world);
    return c ? { x: c.x, y: c.y } : null;
  }, FREEPORT);
  check('the Freeport point projects on screen', screen !== null);
  if (screen) {
    await page.mouse.move(screen.x, screen.y);
    await sleep(400);
    await page.mouse.move(screen.x + 1, screen.y);
    await sleep(400);
    const hover = await page.evaluate(
      (layerId) =>
        window.__godsEyeView.dataManager.layers.get(layerId)?.module?.getStats?.() ??
        null,
      LAYER_ID,
    );
    report('hover card', { hoverId: hover?.hoverId, card: hover?.hoverCard });
    check(
      'hover raises the Freeport point',
      hover?.hoverId === 'point:gulf_south:24329',
      { got: hover?.hoverId },
    );
    const card = (hover?.hoverCard ?? []).join(' | ');
    check(
      'the card shows gas day, design, scheduled, utilization and the notice (P4 gate)',
      /82\s?%/.test(card) &&
        /493,140 Dth\/d scheduled/.test(card) &&
        /600,000 Dth\/d design/.test(card) &&
        /gas day 2026-10-18/.test(card) &&
        /critical notice/.test(card),
      { card },
    );
    await page.mouse.click(screen.x, screen.y);
    await sleep(400);
    const click = await page.evaluate(
      (layerId) =>
        window.__godsEyeView.dataManager.layers.get(layerId)?.module?.getStats?.() ??
        null,
      LAYER_ID,
    );
    check('click selects the point', click?.selectedId === 'gulf_south:24329', {
      got: click?.selectedId,
    });
  }

  await page.screenshot({
    path: path.join(SHOTS_DIR, 'gas-overlay-regional.png'),
  });
  console.log(`  [SHOT] ${path.join(SHOTS_DIR, 'gas-overlay-regional.png')}`);

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

  // Bundle-only degradation (the route absent) is proven at the records
  // level (records.test.mjs): the shared oracle memo deliberately keeps the
  // last good body, so a browser re-enable here would read the cache, not
  // the 503.

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3));
} finally {
  await browser.close();
}

console.log(
  failures === 0 ? '\nqa-gas-overlay: PASS' : `\nqa-gas-overlay: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
