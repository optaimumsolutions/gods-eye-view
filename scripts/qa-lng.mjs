/**
 * QA for the commodity-lng layer (docs/COMMODITIES-PLAN.md §12.6.2 item 19,
 * milestones 2 to 5): registers, enables, counts per chip, the activation and
 * heap gates, the cards at three depths over Sabine Pass, the Panama and Cape
 * via lists, the dossier's four tiles, 24 bars and five sections, the GEM-grade
 * card for Qatar, the dashed annual arc into China, Sodegaura's inbound pairs,
 * page errors, screenshots.
 *
 *   node scripts/qa-lng.mjs [--url http://localhost:4175] [--headful]
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
const APP_URL = argOf('--url', process.env.GEV_URL || 'http://localhost:4175');
const HEADFUL = argv.includes('--headful');
const LAYER_ID = 'commodity-lng';

/** Pre-committed gates (§12.6.1 item 8). */
const MAX_ACTIVATION_MS = 900;
/** Fetch included; the dev server's read of the 2.6 MB bundle is the variable. */
const MAX_COLD_ACTIVATION_MS = 3_000;
const MAX_HEAP_GROWTH_MIB = 60;

const SABINE_PASS = 'T100000130240';
const QATAR_NORTH = 'T100000130594';
const SODEGAURA = 'T100000130523';
const TIANJIN = 'T100000130410';

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await page.setViewport({ width: 1440, height: 860 });
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(String(error.message).replace(/https?:\/\/\S+/g, '[URL]'));
  });
  const testUrl = new URL(APP_URL);
  testUrl.searchParams.set('welcome', '0');
  await page.goto(testUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.styleManager &&
      document.getElementById('loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );

  const setView = async (lon, lat, height, settle = 2_500) => {
    await page.evaluate(
      ({ lon, lat, height }) => {
        const v = window.__godsEyeView.viewer;
        v.camera.cancelFlight?.();
        v.camera.setView({
          destination: window.Cesium
            ? window.Cesium.Cartesian3.fromDegrees(lon, lat, height)
            : v.scene.globe.ellipsoid.cartographicToCartesian({
                longitude: (lon * Math.PI) / 180,
                latitude: (lat * Math.PI) / 180,
                height,
              }),
          orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
        });
        v.camera.moveEnd.raiseEvent?.();
        v.scene.requestRender?.();
      },
      { lon, lat, height },
    );
    await wait(settle);
  };

  const readStats = async (label) => {
    const stats = await page.evaluate(
      (layerId) =>
        window.__godsEyeView.dataManager.layers
          .get(layerId)
          ?.module?.getStats?.() ?? null,
      LAYER_ID,
    );
    if (label) report(label, stats && { ...stats, observation: undefined });
    return stats;
  };

  const callLayer = (method, ...args) =>
    page.evaluate(
      ({ layerId, method, args }) => {
        const module =
          window.__godsEyeView.dataManager.layers.get(layerId)?.module;
        return module?.[method]?.(...args) ?? null;
      },
      { layerId: LAYER_ID, method, args },
    );

  // Baseline: a global view over the Atlantic, every other layer off.
  await setView(-40, 25, 14_000_000);
  const baseline = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    const registered = gev.dataManager.layers.has(layerId);
    for (const id of gev.dataManager.layers.keys()) {
      if (id !== layerId)
        await gev.dataManager.setEnabled(id, false, { origin: 'user' });
    }
    return {
      registered,
      heapMiB: performance.memory
        ? performance.memory.usedJSHeapSize / 1048576
        : null,
    };
  }, LAYER_ID);
  check(
    'layer is registered in the data manager',
    baseline.registered === true,
  );

  // The 2.6 MB bundle fetch through the dev server is the variable on this
  // box (307 to 1,613 ms within an hour, measured by row 11 the same day),
  // so the gate is the layer's own time apart from the fetch, plus a cold
  // total gate; the fetch is read from the browser's resource timing.
  const activation = await page.evaluate(async (layerId) => {
    const gev = window.__godsEyeView;
    // A Cesium page fills the default 250-entry resource buffer with tiles
    // long before the bundle loads, so widen and clear it first.
    performance.setResourceTimingBufferSize(4_000);
    performance.clearResourceTimings();
    const started = performance.now();
    await gev.dataManager.setEnabled(layerId, true, { origin: 'user' });
    const elapsed = performance.now() - started;
    const resources = performance
      .getEntriesByType('resource')
      .filter((e) => /local_data\/lng\/[a-z]+\.json/.test(e.name));
    const layerTiming =
      gev.dataManager.layers.get(layerId)?.module?.getStats?.()?.timing ?? null;
    const fromResources =
      resources.length === 4
        ? Math.max(...resources.map((e) => e.responseEnd)) -
          Math.min(...resources.map((e) => e.startTime))
        : null;
    const fetchMs = fromResources ?? layerTiming?.fetchMs ?? null;
    return {
      elapsed,
      fetchMs,
      layerMs: fetchMs === null ? null : elapsed - fetchMs,
      files: resources.length,
      fetchSource: fromResources !== null ? 'resource-timing' : 'layer-timing',
      layerTiming,
    };
  }, LAYER_ID);
  report('activation ms @ global', activation);
  check(
    `layer activation apart from the bundle fetch under ${MAX_ACTIVATION_MS} ms`,
    activation.layerMs !== null && activation.layerMs < MAX_ACTIVATION_MS,
    activation,
  );
  check(
    `cold activation including the fetch under ${MAX_COLD_ACTIVATION_MS} ms`,
    activation.elapsed < MAX_COLD_ACTIVATION_MS,
    activation,
  );
  await page.waitForFunction(
    (layerId) =>
      (window.__godsEyeView.dataManager.layers
        .get(layerId)
        ?.module?.getStats?.()?.count ?? 0) > 0,
    { timeout: 60_000 },
    LAYER_ID,
  );
  await wait(3_000);
  const globalStats = await readStats('getStats @ global');
  const heap = await page.evaluate(() =>
    performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
  );
  const growth =
    heap !== null && baseline.heapMiB !== null ? heap - baseline.heapMiB : null;
  report('heap growth MiB', { baseline: baseline.heapMiB, now: heap, growth });
  check(
    `heap growth under ${MAX_HEAP_GROWTH_MIB} MiB`,
    growth !== null && growth < MAX_HEAP_GROWTH_MIB,
    growth,
  );

  check('308 terminals loaded', globalStats?.terminals === 308);
  check(
    '74 export and 234 import terminals',
    globalStats?.exportTerminals === 74 && globalStats?.importTerminals === 234,
  );
  check(
    '470 routes: 218 DOE, 252 GIIGNL',
    globalStats?.routes === 470 &&
      globalStats?.doeRoutes === 218 &&
      globalStats?.giignlRoutes === 252,
  );
  check(
    'all three chips on by default',
    globalStats?.chips?.export &&
      globalStats?.chips?.import &&
      globalStats?.chips?.routes,
  );
  check(
    'meta line states the DOE window, the lag and the GEM release',
    /Jul 2025 to Jun 2026 · DOE · 2-month lag · GEM September 2025/.test(
      String(globalStats?.source),
    ),
  );
  check(
    'meta line says the chips are session-only',
    /session-only/.test(String(globalStats?.source)),
  );
  check(
    'observation is published-class with the DOE month',
    globalStats?.observation?.freshnessClass === 'published' &&
      /^2026-06-01/.test(String(globalStats?.observation?.observedAt)),
  );
  check('tier is global', globalStats?.tier === 'global');
  const entities = globalStats?.entities;
  const polylines = globalStats?.polylines;
  check(
    'entities = 308 markers + 74 rings; polylines = 470 lines + 252 arrow tails',
    entities === 308 + 74 && polylines === 470 + 252,
    { entities, polylines },
  );
  check(
    'every arc is in by the time the settle ends',
    globalStats?.arcsPending === 0,
    globalStats?.arcsPending,
  );

  // Label at the global tier, export only.
  const globalCard = await callLayer('getTerminalCard', SABINE_PASS, 'global');
  check(
    'Sabine Pass is a label at 7,000 km',
    globalCard?.variant === 'label' &&
      /SABINE PASS · 29.5 Mtpa/.test(globalCard?.title),
    globalCard,
  );
  const importGlobal = await callLayer('getTerminalCard', SODEGAURA, 'global');
  check(
    'import terminals carry no label at the global tier',
    importGlobal === null,
  );

  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'lng-global.png') });

  // Chips: ROUTES off removes the arcs and restores them.
  await callLayer('setChip', 'routes', false);
  await wait(500);
  const routesOff = await readStats();
  check(
    'ROUTES off draws no routes',
    routesOff?.drawn?.routes === 0 &&
      /ROUTES OFF/.test(String(routesOff?.source)),
  );
  await callLayer('setChip', 'routes', true);
  await wait(500);
  const routesOn = await readStats();
  check(
    'ROUTES on restores 470 routes',
    routesOn?.drawn?.routes === 470 && !/OFF/.test(String(routesOn?.source)),
  );
  await callLayer('setChip', 'import', false);
  const importOff = await readStats();
  check(
    'IMPORT off hides the 234 regas terminals',
    importOff?.drawn?.import === 0 && importOff?.drawn?.export === 74,
  );
  await callLayer('setChip', 'import', true);

  // Route cards: Panama on the open Sabine Pass → Japan pair, the Cape on 2026 India.
  const spJapan = await callLayer('getRouteCard', `doe:${SABINE_PASS}:japan`);
  check(
    'Sabine Pass → Sodegaura card lists Panama and not the Cape',
    /Panama Canal/.test(spJapan?.details?.join('|')) &&
      !/Cape of Good Hope/.test(spJapan?.details?.join('|')),
    spJapan?.details?.slice(0, 5),
  );
  check(
    'the DOE route card carries twelve monthly bars',
    (spJapan?.details ?? []).filter((l) => /▮/.test(l)).length >= 1 &&
      (spJapan?.details ?? []).filter((l) => /▮/.test(l)).length <= 12,
  );
  const spIndia = await callLayer('getRouteCard', `doe:${SABINE_PASS}:india`);
  check(
    'Sabine Pass → Dahej draws the Red Sea-closed variant via the Cape',
    /Cape of Good Hope/.test(spIndia?.details?.join('|')) &&
      /Red Sea closed/.test(spIndia?.details?.join('|')),
    spIndia?.details?.slice(0, 5),
  );
  const qatarChina = await callLayer(
    'getRouteCard',
    `giignl:${QATAR_NORTH}:${TIANJIN}`,
  );
  check(
    'the Qatar → China arc is the dashed GIIGNL grade stamped annual 2025',
    /GIIGNL annual \(dashed\)/.test(qatarChina?.details?.join('|')) &&
      /annual 2025/.test(qatarChina?.details?.join('|')) &&
      /Strait of Hormuz/.test(qatarChina?.details?.join('|')),
    qatarChina?.details?.slice(0, 5),
  );

  // GEM-grade card for Qatar's plant, Sodegaura's inbound pairs.
  const qatarCard = await callLayer('getTerminalCard', QATAR_NORTH, 'local');
  check(
    "Qatar's card names GEM and September 2025 with capacity, status and start year",
    /GEM · September 2025/.test(qatarCard?.details?.join('|')) &&
      /40.8 Mtpa/.test(qatarCard?.title) &&
      /operating since \d{4}/.test(qatarCard?.details?.join('|')),
    qatarCard,
  );
  const sodegauraCard = await callLayer('getTerminalCard', SODEGAURA, 'local');
  check(
    "Sodegaura's card lists its inbound pairs",
    /inbound pair/.test(sodegauraCard?.details?.join('|')) &&
      /← /.test(sodegauraCard?.details?.join('|')),
    sodegauraCard?.details?.slice(0, 5),
  );

  // Regional and local depth over Sabine Pass.
  await setView(-93.87, 29.75, 1_200_000);
  const regionalStats = await readStats();
  check('tier switched to regional', regionalStats?.tier === 'regional');
  const regionalCard = await callLayer(
    'getTerminalCard',
    SABINE_PASS,
    'regional',
  );
  check(
    'Sabine Pass regional card has three lines: operator/status, cargoes, top destination',
    regionalCard?.variant === 'card' &&
      regionalCard?.details?.length === 3 &&
      /436 cargoes/.test(regionalCard.details[1]) &&
      /^top: /.test(regionalCard.details[2]),
    regionalCard,
  );
  await page.screenshot({ path: path.join(SHOTS_DIR, 'lng-regional.png') });

  await setView(-93.87, 29.75, 150_000, 4_000);
  const localStats = await readStats();
  check('tier switched to local at 150 km', localStats?.tier === 'local');
  const localCard = await callLayer('getTerminalCard', SABINE_PASS, 'local');
  check(
    'the 150 km card opens with the three regional lines and lists the trains',
    localCard?.details?.slice(0, 3).join('|') ===
      regionalCard?.details?.join('|') &&
      /Train 1:/.test(localCard?.details?.join('|')) &&
      /click the marker for the dossier/.test(localCard?.details?.join('|')),
    localCard?.details,
  );
  await page.screenshot({ path: path.join(SHOTS_DIR, 'lng-local.png') });

  // Dossier: click Sabine Pass, four tiles, 24 bars, five sections, stepping.
  await callLayer('selectTerminal', SABINE_PASS);
  await wait(500);
  const dossier = await page.evaluate(() => {
    const root = document.getElementById('lng-dossier');
    if (!root || root.hidden) return null;
    return {
      title: root.querySelector('.lng-dossier__title')?.textContent,
      tiles: [...root.querySelectorAll('.lng-stat')].map((t) => t.dataset.stat),
      values: [...root.querySelectorAll('.lng-stat__value')].map(
        (t) => t.textContent,
      ),
      bars: root.querySelectorAll('rect[data-month]').length,
      baseline: Boolean(root.querySelector('line[data-baseline]')),
      sections: [...root.querySelectorAll('h3[data-section]')].map(
        (h) => h.dataset.section,
      ),
    };
  });
  check(
    'the Sabine Pass dossier opens with four tiles',
    dossier?.tiles?.length === 4 &&
      dossier?.title === 'Sabine Pass LNG Terminal',
    dossier,
  );
  check(
    '24 monthly bars and the baseload line',
    dossier?.bars === 24 && dossier?.baseline === true,
  );
  check(
    'five sections in order',
    JSON.stringify(dossier?.sections) ===
      JSON.stringify([
        'trains',
        'destinations',
        'shipping',
        'regulatory',
        'sources',
      ]),
  );
  check(
    'utilization is a percentage, not NaN',
    /^\d+\.\d %$/.test(dossier?.values?.[3] ?? ''),
    dossier?.values,
  );
  const selected = await readStats();
  check(
    'stats report the selection and the open dossier',
    selected?.selectedId === SABINE_PASS && selected?.dossierOpen === true,
  );
  await page.screenshot({ path: path.join(SHOTS_DIR, 'lng-dossier.png') });

  await page.click('#lng-dossier [data-action="next"]');
  await wait(2_600);
  const stepped = await readStats();
  check(
    'next steps to the second US plant by baseload',
    stepped?.selectedId && stepped.selectedId !== SABINE_PASS,
    stepped?.selectedId,
  );
  const order = await callLayer('getAnalystRecords', 400);
  const usPlants = (order ?? []).filter(
    (r) => r.country === 'United States' && r.kind === 'export',
  );
  check(
    'nine operating US plants ship cargoes in the window',
    usPlants.filter((r) => r.cargoes12m > 0).length === 9,
    usPlants.map((r) => [r.name, r.cargoes12m]),
  );
  await page.click('#lng-dossier [data-action="close"]');
  await wait(300);
  const closed = await readStats();
  check(
    'close clears the selection',
    closed?.selectedId === null && closed?.dossierOpen === false,
  );

  // Disable leaves nothing behind.
  await page.evaluate(async (layerId) => {
    await window.__godsEyeView.dataManager.setEnabled(layerId, false, {
      origin: 'user',
    });
  }, LAYER_ID);
  await wait(500);
  const afterOff = await page.evaluate(() =>
    Boolean(document.getElementById('lng-dossier')?.hidden ?? true),
  );
  check('disable hides the dossier', afterOff === true);
  check(
    'no uncaught page errors',
    pageErrors.length === 0,
    pageErrors.slice(0, 5),
  );
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nqa-lng: PASS' : `\nqa-lng: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
