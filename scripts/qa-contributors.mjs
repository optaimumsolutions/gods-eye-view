/**
 * The shared headless check for row 14 M1 (docs/COMMODITIES-PLAN.md §16,
 * G14.2, R14.6): a region layer's main contributors, run by the onshore
 * harness and the Gulf QA once the layer is enabled at global depth.
 *
 * Proves, against the committed contributors file:
 *   1. `getStats().contributors` describes the bundle's month and its total
 *      equals the expected region total within 0.1 %.
 *   2. Optionally, the top five operators' volumes equal the same operators'
 *      per-facility totals within 0.1 % (G14.2).
 *   3. Both change spans reconcile, and the region card on screen carries
 *      the "Top operators" and "vs <month>" lines.
 *   4. Clicking the region mark opens the Contributors drawer: a column per
 *      chart month, the ranked table, the change ledgers; a screenshot; the
 *      close button closes it.
 */

import fs from 'node:fs';
import path from 'node:path';

export async function checkContributors(
  page,
  {
    check,
    report,
    sleep,
    screenOf,
    shotsDir,
    file,
    stats,
    expectedTotalMcfd,
    facilityTotals = null,
    drawerId,
    markLonLat,
    shot,
  },
) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const c = stats?.contributors ?? null;
  report('contributors', {
    month: c?.month,
    operators: c?.operators,
    top: c?.top?.map((o) => `${o.short} ${(o.share * 100).toFixed(1)}%`),
    momMMcfd: c ? Math.round(c.momDeltaMcfd / 100) / 10 : null,
    reconciles: c?.reconciles,
  });
  check(
    `contributors describe ${raw.current.month}`,
    c?.month === raw.current.month,
    { got: c?.month },
  );
  check(
    'contributors total equals the region total within 0.1 %',
    c && Math.abs(c.totalMcfd - expectedTotalMcfd) <= 0.001 * expectedTotalMcfd,
    {
      got: Math.round(c?.totalMcfd ?? 0),
      expected: Math.round(expectedTotalMcfd),
    },
  );
  if (facilityTotals) {
    const days = new Date(
      Date.UTC(
        Number(raw.current.month.slice(0, 4)),
        Number(raw.current.month.slice(5)),
        0,
      ),
    ).getUTCDate();
    const off = (c?.top ?? []).map((o) => {
      const wells = facilityTotals.get(o.id) ?? 0;
      return {
        op: o.short,
        pct: wells ? ((o.currentMcfd * days - wells) / wells) * 100 : null,
      };
    });
    check(
      'top five operators equal their facilities within 0.1 % (G14.2)',
      off.length === 5 &&
        off.every((o) => o.pct !== null && Math.abs(o.pct) <= 0.1),
      off,
    );
  }
  check(
    'both change spans reconcile',
    c?.reconciles?.mom === true && c?.reconciles?.yoy === true,
    c?.reconciles,
  );
  // The overlay paints to a canvas; the layer reports the card it published.
  const card = stats?.regionCard ?? [];
  check(
    'the region card shows the top operators and the change vs last month',
    card.some((line) => /^Top operators: /.test(line)) &&
      card.some((line) => /^vs [A-Z]{3}: [+−±]/.test(line)),
    { card },
  );

  const mark = await screenOf(page, markLonLat[0], markLonLat[1]);
  if (mark) {
    await page.mouse.click(mark.x, mark.y);
    await sleep(900);
  }
  const drawer = await page.evaluate((id) => {
    const node = document.getElementById(id);
    if (!node || node.hidden) return { open: false };
    return {
      open: true,
      title: node.querySelector('.dc-dossier__title')?.textContent ?? null,
      columns: node.querySelectorAll('.dc-stack__hit').length,
      tableRows: node.querySelectorAll('.dc-table tr').length - 1,
      keys: node.querySelectorAll('.dc-key').length,
      sections: [...node.querySelectorAll('.dc-section__title')].map(
        (n) => n.textContent,
      ),
    };
  }, drawerId);
  report('contributors drawer', drawer);
  check(
    'clicking the region mark opens the Contributors drawer',
    drawer.open === true,
    {
      mark,
    },
  );
  check(
    `the chart has a column per month (${raw.months.length})`,
    drawer.columns === raw.months.length,
    { got: drawer.columns },
  );
  check(
    'the ranked table and the change ledgers are there',
    drawer.tableRows >= 5 &&
      drawer.sections?.some((t) => /^Change vs [A-Z]{3}$/.test(t)) &&
      drawer.sections?.some((t) => /^Change vs [A-Z]{3} \d{4}$/.test(t)),
    { rows: drawer.tableRows, sections: drawer.sections },
  );
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, shot) });
  await page.evaluate((id) => {
    document
      .getElementById(id)
      ?.querySelector('[data-action="close"]')
      ?.click();
  }, drawerId);
  await sleep(300);
  const closed = await page.evaluate(
    (id) => document.getElementById(id)?.hidden !== false,
    drawerId,
  );
  check('the close button closes the drawer', closed === true);
}
