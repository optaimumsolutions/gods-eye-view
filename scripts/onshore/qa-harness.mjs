/**
 * The shared headless check for the onshore region layers (row 12,
 * docs/COMMODITIES-PLAN.md §14, R12.12). Each region's `scripts/qa-onshore-<region>.mjs`
 * hands this harness its layer id, bundle folder and three camera views;
 * the harness proves, against a FRESH dev server from the tree under test:
 *   1. The layer registers, enables and reads its bundle; the counts on the
 *      globe are the bundle's counts (G5).
 *   2. Activation stays inside the gate apart from the bundle fetches (the
 *      row 11 split), the cold total inside its own, heap growth inside G4.
 *   3. The panel line names the current month and reconciles with EIA (G1).
 *   4. At global depth only the region mark shows; from the far side of the
 *      planet nothing paints through it; at regional depth the field marks
 *      show and hovering the largest raises a field card (its own or a
 *      neighbour's whose mark covers the same pixel).
 *   5. At local depth the wells are point primitives clipped to the view
 *      inside the budget; the layer's own frame cost is measured against the
 *      same view without it; hovering the top well raises a well on its pad
 *      (surface holes on one pad share a pixel at this height); clicking
 *      selects that well and opens its dossier; the history shard arrives and
 *      the chart carries one point per filed month.
 *   6. No uncaught page errors. Screenshots at the three tiers.
 *
 *   npx vite --port 4174 --strictPort --host 127.0.0.1
 *   node scripts/qa-onshore-williston.mjs --url http://127.0.0.1:4174
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { shardFor } from '../../src/layers/onshore/shards.js';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** Pre-committed gates (G4): the layer's own activation work, the cold total, the heap. */
export const MAX_ACTIVATION_MS = 900;
export const MAX_COLD_ACTIVATION_MS = 3_000;
export const MAX_HEAP_GROWTH_MIB = 150;
export const MAX_POINTS_IN_VIEW = 20_000;
/** The layer's own median frame cost at local depth (with the points minus without), G4. */
export const MAX_LAYER_FRAME_COST_MS = 16;
/** A field mark counts as "the one hovered" within this many pixels of the pointer. */
export const FIELD_HOVER_TOLERANCE_PX = 30;
/** Wells on one pad: surface holes within this many metres of each other. */
export const PAD_RADIUS_M = 60;

export async function runOnshoreQa({
  regionId,
  layerId,
  bundleDir,
  views,
  argv = process.argv.slice(2),
}) {
  const shotsDir = process.env.QA_SHOTS_DIR || path.join(REPO_ROOT, 'qa-shots');
  const argOf = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const appUrl = argOf('--url', process.env.GEV_URL || 'http://127.0.0.1:4174');
  const headful = argv.includes('--headful');

  /** The bundle is the expectation: the globe must show what the file says. */
  const index = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, bundleDir, 'index.json'), 'utf8'),
  );
  const clusters = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, bundleDir, 'clusters.json'), 'utf8'),
  );
  const gasAt = index.readingColumns.indexOf('gas');
  const expected = {
    facilities: index.facilities.length,
    producing: index.counts.producing,
    fields: clusters.fields.length,
    month: index.current.month,
  };
  const byId = new Map(index.facilities.map((f) => [f.id, f]));
  const topWell = [...index.facilities]
    .filter((f) => f.current && f.current[gasAt] > 0)
    .sort((a, b) => b.current[gasAt] - a.current[gasAt])[0];
  const topField = [...clusters.fields].sort(
    (a, b) =>
      (b.series.gas[index.current.index] ?? 0) -
      (a.series.gas[index.current.index] ?? 0),
  )[0];
  const fieldById = new Map(clusters.fields.map((f) => [f.id, f]));
  const shardDir = path.join(
    REPO_ROOT,
    'public',
    'data',
    'onshore',
    regionId,
    'history',
  );
  const filedMonthsOf = (id) => {
    const file = path.join(
      shardDir,
      `${shardFor(id, index.shards.count)}.json`,
    );
    if (!fs.existsSync(file)) return null;
    const shard = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gas = shard.facilities?.[id]?.gas;
    return Array.isArray(gas) ? gas.filter((v) => v !== null).length : null;
  };
  const shardsOnDisk = fs.existsSync(shardDir);

  /** Metres between two surface locations (equirectangular; pads are metres apart). */
  const metresBetween = (a, b) => {
    const R = 6_371_000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon =
      (((b.lon - a.lon) * Math.PI) / 180) *
      Math.cos(((a.lat + b.lat) * Math.PI) / 360);
    return R * Math.sqrt(dLat * dLat + dLon * dLon);
  };

  let failures = 0;
  const check = (name, pass, detail) => {
    if (!pass) failures += 1;
    const extra = detail === undefined ? '' : ` — ${JSON.stringify(detail)}`;
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${extra}`);
  };
  const report = (name, detail) =>
    console.log(`  [MEAS] ${name} — ${JSON.stringify(detail)}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const browser = await puppeteer.launch({
    headless: headful ? false : 'new',
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

  async function setView(page, [lon, lat, height]) {
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

  /** Wait for the globe's tiles at the current view, so a frame measures the scene, not the download. */
  async function waitForTiles(page, timeoutMs = 20_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const loaded = await page.evaluate(() => {
        const v = window.__godsEyeView.viewer;
        v.scene.requestRender?.();
        return v.scene.globe.tilesLoaded === true;
      });
      if (loaded) return true;
      await sleep(250);
    }
    return false;
  }

  /** Sixty forced frames; the sorted deltas after a warm-up of five. */
  const measureFrames = (page) =>
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
  const percentile = (sorted, p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

  const setEnabled = (page, enabled) =>
    page.evaluate(
      async (id, on) => {
        await window.__godsEyeView.dataManager.setEnabled(id, on, {
          origin: 'user',
        });
      },
      layerId,
      enabled,
    );

  const readStats = async (page, label) => {
    const stats = await page.evaluate(
      (id) =>
        window.__godsEyeView.dataManager.layers.get(id)?.module?.getStats?.() ??
        null,
      layerId,
    );
    report(label, {
      count: stats?.count,
      facilities: stats?.facilities,
      drawn: stats?.drawn,
      pointsShown: stats?.pointsShown,
      tier: stats?.tier,
      hoverId: stats?.hoverId,
      selectedId: stats?.selectedId,
      dossierOpen: stats?.dossierOpen,
      historyState: stats?.historyState,
      source: stats?.source,
    });
    return stats;
  };

  /** Entity marks (region + fields) currently shown, from the layer's data source. */
  const shownMarks = (page) =>
    page.evaluate((id) => {
      const v = window.__godsEyeView.viewer;
      const ds = v.dataSources.getByName(id)[0];
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
    }, layerId);

  const screenOf = (page, lon, lat) =>
    page.evaluate(
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
      lon,
      lat,
    );

  const hoverAt = async (page, screen) => {
    if (!screen) return;
    await page.mouse.move(screen.x, screen.y);
    await sleep(400);
    await page.mouse.move(screen.x + 1, screen.y);
    await sleep(400);
  };

  const readDossier = (page) =>
    page.evaluate(() => {
      const node = document.getElementById('onshore-dossier');
      if (!node || node.hidden) return { exists: Boolean(node), open: false };
      return {
        exists: true,
        open: true,
        title: node.querySelector('.dc-dossier__title')?.textContent ?? null,
        sections: node.querySelectorAll('.dc-section').length,
        chartPoints: node.querySelectorAll('.dc-chart [data-point]').length,
        rows: node.querySelectorAll('.dc-row').length,
        note: node.querySelector('.dc-note')?.textContent ?? null,
      };
    });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) =>
      pageErrors.push(
        String(error.message).replace(/https?:\/\/\S+/g, '[URL]'),
      ),
    );
    await page.setViewport({ width: 1440, height: 860 });
    const testUrl = new URL(appUrl);
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

    /** Park over the region at global height with every other layer off. */
    const baseline = await page.evaluate(async (id) => {
      const gev = window.__godsEyeView;
      gev.viewer.camera.cancelFlight();
      for (const [layer] of gev.dataManager.layers) {
        if (layer === id) continue;
        try {
          await gev.dataManager.setEnabled(layer, false, { origin: 'user' });
        } catch {
          /* measured via counts below */
        }
      }
      return {
        registered: gev.dataManager.layers.has(id),
        heapMiB: performance.memory
          ? performance.memory.usedJSHeapSize / 1048576
          : null,
      };
    }, layerId);
    await setView(page, views.global);
    check(
      'layer is registered in the data manager',
      baseline.registered === true,
    );

    const activation = await page.evaluate(async (id) => {
      const gev = window.__godsEyeView;
      performance.setResourceTimingBufferSize(2_000);
      performance.clearResourceTimings();
      const started = performance.now();
      await gev.dataManager.setEnabled(id, true, { origin: 'user' });
      const elapsed = performance.now() - started;
      // The bundle fetches are the serving path's cost, not the layer's
      // (row 11 measured the same file at 0.3 to 1.6 s within an hour on
      // this box); reported apart so the gate holds the layer to its own
      // work: parse, records, the field entities and the overlay.
      const entries = performance
        .getEntriesByType('resource')
        .filter((entry) =>
          /onshore\/[a-z-]+\/(index|clusters)\.json/.test(entry.name),
        );
      const fetchMs = entries.reduce((max, e) => Math.max(max, e.duration), 0);
      return {
        elapsed,
        fetchMs: entries.length ? fetchMs : null,
        transferBytes: entries.reduce(
          (sum, e) => sum + (e.transferSize || 0),
          0,
        ),
        files: entries.length,
      };
    }, layerId);
    await sleep(2_500);

    const globalStats = await readStats(page, 'getStats @ global');
    const layerMs = activation.elapsed - (activation.fetchMs ?? 0);
    report('activation ms @ global', {
      total: Math.round(activation.elapsed),
      bundleFetch:
        activation.fetchMs === null ? null : Math.round(activation.fetchMs),
      files: activation.files,
      transferKiB: Math.round(activation.transferBytes / 1024),
      layer: Math.round(layerMs),
    });
    check(
      `layer activation, less the bundle fetches, under ${MAX_ACTIVATION_MS} ms`,
      layerMs < MAX_ACTIVATION_MS,
      { got: Math.round(layerMs), fetchSeen: activation.fetchMs !== null },
    );
    check(
      `cold activation, fetches included, under ${MAX_COLD_ACTIVATION_MS} ms`,
      activation.elapsed < MAX_COLD_ACTIVATION_MS,
      { got: Math.round(activation.elapsed) },
    );
    check(
      `${expected.producing} producing wells (the bundle's count)`,
      globalStats?.count === expected.producing,
      { got: globalStats?.count },
    );
    check(
      `${expected.facilities} facilities in the snapshot, no field or well marks built yet`,
      globalStats?.facilities === expected.facilities &&
        globalStats?.drawn?.fields === 0 &&
        globalStats?.drawn?.wells === 0,
      { got: [globalStats?.facilities, globalStats?.drawn] },
    );
    check('tier is global at 14,000 km', globalStats?.tier === 'global');
    check(
      `panel line names the current month ${expected.month}`,
      String(globalStats?.source).includes(`AS OF ${expected.month}`),
      { got: globalStats?.source },
    );
    check(
      'panel line reconciles with EIA',
      /% OF EIA GROSS/.test(String(globalStats?.source)),
    );
    check(
      'the layer is published, never live',
      globalStats?.freshnessClass === 'published',
    );
    const globalMarks = await shownMarks(page);
    check(
      'at global depth only the region mark exists and shows',
      globalMarks?.shown === 1 && globalMarks?.total === 1,
      globalMarks,
    );
    check(
      'no well points exist yet at global depth',
      globalStats?.drawn?.wells === 0,
      { got: globalStats?.drawn?.wells },
    );
    fs.mkdirSync(shotsDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotsDir, `onshore-${regionId}-global.png`),
    });

    const heapAfter = await page.evaluate(() =>
      performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    );
    if (baseline.heapMiB !== null && heapAfter !== null) {
      const growth = heapAfter - baseline.heapMiB;
      report('heap growth MiB after activation', Math.round(growth));
      check(
        `heap growth under ${MAX_HEAP_GROWTH_MIB} MiB`,
        growth < MAX_HEAP_GROWTH_MIB,
        { got: Math.round(growth) },
      );
    }

    /** The far side of the planet: nothing may paint through it. */
    await setView(page, [
      views.global[0] + 180,
      views.global[1],
      views.global[2],
    ]);
    const farSide = await shownMarks(page);
    check(
      'no mark paints through the globe from the far side',
      farSide?.shown === 0,
      farSide,
    );

    /** Regional over the basin. */
    await setView(page, views.regional);
    const regionalStats = await readStats(page, 'getStats @ regional');
    check('tier switched to regional', regionalStats?.tier === 'regional', {
      got: regionalStats?.tier,
    });
    const regionalMarks = await shownMarks(page);
    check(
      `the ${expected.fields} field marks are built at regional depth, show, and the region mark hides`,
      regionalStats?.drawn?.fields === expected.fields &&
        regionalMarks?.total === expected.fields + 1 &&
        regionalMarks?.shown >= expected.fields * 0.9 &&
        regionalMarks?.shown <= expected.fields,
      { marks: regionalMarks, drawn: regionalStats?.drawn },
    );
    await page.screenshot({
      path: path.join(shotsDir, `onshore-${regionId}-regional.png`),
    });
    const fieldScreen = await screenOf(page, topField.lon, topField.lat);
    report('top field', {
      id: topField.id,
      gasMcf: topField.series.gas[index.current.index],
      screen: fieldScreen,
    });
    await hoverAt(page, fieldScreen);
    const fieldHover = await readStats(page, 'getStats after field hover');
    const hoveredFieldId = String(fieldHover?.hoverId ?? '').startsWith(
      'field:',
    )
      ? String(fieldHover.hoverId).slice('field:'.length)
      : null;
    const hoveredField = hoveredFieldId ? fieldById.get(hoveredFieldId) : null;
    const hoveredFieldScreen = hoveredField
      ? await screenOf(page, hoveredField.lon, hoveredField.lat)
      : null;
    const fieldPx =
      hoveredFieldScreen && fieldScreen
        ? Math.hypot(
            hoveredFieldScreen.x - fieldScreen.x,
            hoveredFieldScreen.y - fieldScreen.y,
          )
        : null;
    check(
      `hovering the top field raises a field card within ${FIELD_HOVER_TOLERANCE_PX} px (its own or the mark covering it)`,
      hoveredField !== null &&
        fieldPx !== null &&
        fieldPx <= FIELD_HOVER_TOLERANCE_PX,
      {
        got: fieldHover?.hoverId,
        want: `field:${topField.id}`,
        px: fieldPx === null ? null : Math.round(fieldPx),
      },
    );

    /** Local over the top well. */
    await setView(page, [topWell.lon, topWell.lat, views.local[2]]);
    const localStats = await readStats(page, 'getStats @ local');
    check('tier switched to local', localStats?.tier === 'local', {
      got: localStats?.tier,
    });
    check(
      `every well became a point primitive (${expected.facilities})`,
      localStats?.drawn?.wells === expected.facilities,
      { got: localStats?.drawn?.wells },
    );
    check(
      `points shown are clipped to the view, at most ${MAX_POINTS_IN_VIEW}`,
      localStats?.pointsShown > 0 &&
        localStats?.pointsShown <= MAX_POINTS_IN_VIEW,
      { got: localStats?.pointsShown },
    );
    const localMarks = await shownMarks(page);
    check(
      'field marks hide at local depth',
      localMarks?.shown === 0,
      localMarks,
    );

    /**
     * The layer's own frame cost: the same view with the points minus
     * without them, after the globe's tiles have loaded, so a slow tile
     * download or a slow box is not charged to the layer.
     */
    const tilesLoaded = await waitForTiles(page);
    const withLayer = await measureFrames(page);
    await setEnabled(page, false);
    await sleep(1_000);
    await waitForTiles(page);
    const withoutLayer = await measureFrames(page);
    await setEnabled(page, true);
    await sleep(2_500);
    const cost = Math.max(
      0,
      percentile(withLayer, 0.5) - percentile(withoutLayer, 0.5),
    );
    report('frame ms @ local (median, p90)', {
      tilesLoaded,
      withLayer: [
        Math.round(percentile(withLayer, 0.5) * 10) / 10,
        Math.round(percentile(withLayer, 0.9) * 10) / 10,
      ],
      withoutLayer: [
        Math.round(percentile(withoutLayer, 0.5) * 10) / 10,
        Math.round(percentile(withoutLayer, 0.9) * 10) / 10,
      ],
      layerCostMedian: Math.round(cost * 10) / 10,
    });
    check(
      `the layer's median frame cost at local depth is under ${MAX_LAYER_FRAME_COST_MS} ms`,
      cost < MAX_LAYER_FRAME_COST_MS,
      { got: Math.round(cost * 10) / 10 },
    );
    const afterToggle = await readStats(page, 'getStats after re-enable');
    check(
      'the points return after a disable and enable at local depth',
      afterToggle?.tier === 'local' && afterToggle?.pointsShown > 0,
      { got: [afterToggle?.tier, afterToggle?.pointsShown] },
    );

    const wellScreen = await screenOf(page, topWell.lon, topWell.lat);
    report('top well', {
      id: topWell.id,
      name: topWell.name,
      gasMcf: topWell.current[gasAt],
      screen: wellScreen,
    });
    await hoverAt(page, wellScreen);
    const hoverStats = await readStats(page, 'getStats after well hover');
    const hoveredWellId = String(hoverStats?.hoverId ?? '').startsWith('well:')
      ? String(hoverStats.hoverId).slice('well:'.length)
      : null;
    const hoveredWell = hoveredWellId ? byId.get(hoveredWellId) : null;
    const padMetres = hoveredWell ? metresBetween(hoveredWell, topWell) : null;
    check(
      `hovering the top well raises a well on its pad (within ${PAD_RADIUS_M} m)`,
      hoveredWell !== null && padMetres <= PAD_RADIUS_M,
      {
        got: hoverStats?.hoverId,
        want: `well:${topWell.id}`,
        metres: padMetres === null ? null : Math.round(padMetres),
      },
    );
    if (wellScreen) {
      await page.mouse.click(wellScreen.x, wellScreen.y);
      await sleep(3_000);
    }
    const clickStats = await readStats(page, 'getStats after click');
    const selected = clickStats?.selectedId
      ? byId.get(clickStats.selectedId)
      : null;
    check(
      'clicking selects the hovered well',
      selected !== null && clickStats?.selectedId === hoveredWellId,
      { got: clickStats?.selectedId, want: hoveredWellId },
    );
    const dossier = await readDossier(page);
    report('dossier', dossier);
    check(
      'the dossier opened for the selected well',
      dossier.open === true &&
        selected !== null &&
        String(dossier.title).includes(String(selected.name).trim()),
      dossier,
    );
    check('the dossier has at least five sections', dossier.sections >= 5, {
      got: dossier.sections,
    });
    if (shardsOnDisk && selected) {
      const filedMonths = filedMonthsOf(selected.id);
      check(
        `the history shard arrived and the chart carries one point per filed month (${filedMonths})`,
        clickStats?.historyState === 'loaded' &&
          dossier.chartPoints === filedMonths,
        {
          got: dossier.chartPoints,
          want: filedMonths,
          historyState: clickStats?.historyState,
        },
      );
    } else {
      check(
        'without shards on disk the dossier says the history is not built here',
        clickStats?.historyState === 'unavailable' &&
          /not built/.test(String(dossier.note)),
        { got: dossier.note, historyState: clickStats?.historyState },
      );
    }
    await page.screenshot({
      path: path.join(shotsDir, `onshore-${regionId}-local.png`),
    });

    check(
      'no uncaught page errors',
      pageErrors.length === 0,
      pageErrors.slice(0, 3),
    );
    console.log(`  [SHOT] ${shotsDir}`);
  } finally {
    await browser.close();
  }

  console.log(
    failures === 0
      ? `\nqa-onshore-${regionId}: PASS`
      : `\nqa-onshore-${regionId}: ${failures} FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
