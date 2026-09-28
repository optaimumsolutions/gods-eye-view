#!/usr/bin/env node
/**
 * Row 15 M0 probe (plan §17.2): reproduces the live findings the PRD rests on.
 * Fetches the keyless FIRMS VIIRS 7-day US files for the three satellites,
 * keeps night detections in each flare region, reads the ASOS sky cover at
 * each overpass, and (Williston) splits detections by distance to wells from
 * the row 12 bundle. Network only; writes nothing.
 *
 *   node scripts/probe-flares.mjs [--window 24h|7d]
 */

import { readFileSync } from 'node:fs';
import {
  FIRMS_NRT_FEEDS,
  FLARE_REGIONS,
  UNLISTED_RADIUS_M,
  firmsNrtUrl,
  inBox,
  matchRadiusM,
  nightOf,
  overpassMs,
  parseIemAsos,
  parseViirsCsv,
  pointIndex,
  skyState,
} from '../src/data/flares.js';

const args = process.argv.slice(2);
const windowArg = args.includes('--window')
  ? args[args.indexOf('--window') + 1]
  : '7d';

async function text(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const detections = [];
for (const feed of FIRMS_NRT_FEEDS) {
  const url = firmsNrtUrl(feed, windowArg);
  const rows = parseViirsCsv(await text(url));
  if (!rows) throw new Error(`not CSV: ${url}`);
  const night = rows.filter((d) => d.daynight === 'N');
  console.log(
    `${feed.satellite.padEnd(8)} ${rows.length} rows, ${night.length} night (${url.split('/').pop()})`,
  );
  for (const d of night) detections.push({ ...d, feed: feed.satellite });
}

function iemUrl(stations, fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  const q = new URLSearchParams();
  for (const s of stations) q.append('station', s);
  for (const f of ['skyc1', 'skyc2', 'skyc3']) q.append('data', f);
  Object.entries({
    year1: y1,
    month1: m1,
    day1: d1,
    year2: y2,
    month2: m2,
    day2: d2 + 1,
    tz: 'Etc/UTC',
    format: 'onlycomma',
    latlon: 'no',
    missing: 'M',
    trace: 'T',
    direct: 'no',
    report_type: '3',
  }).forEach(([k, v]) => q.append(k, String(v)));
  return `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${q}`;
}

function williston() {
  const index = JSON.parse(
    readFileSync(
      new URL(
        '../src/data/local_data/onshore/williston/index.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const wells = index.facilities.filter((f) => Number.isFinite(f.lat));
  const flaring = wells.filter((f) => (f.current?.[6] ?? 0) > 0);
  const flaredMcf = flaring.reduce((s, f) => s + f.current[6], 0);
  return { month: index.current.month, wells, flaring, flaredMcf };
}

const nd = williston();
const [year, mon] = nd.month.split('-').map(Number);
const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
console.log(
  `\nWilliston bundle ${nd.month}: ${nd.wells.length} wells with coordinates, ${nd.flaring.length} flared, ${(nd.flaredMcf / 1000 / days).toFixed(1)} MMcf/d`,
);

for (const region of Object.values(FLARE_REGIONS)) {
  const mine = detections.filter((d) => inBox(d, region.box));
  const nights = [...new Set(mine.map(nightOf))].sort();
  if (nights.length === 0) {
    console.log(`\n${region.name}: no night detections`);
    continue;
  }
  const sky = parseIemAsos(
    await text(iemUrl(region.stations, nights[0], nights.at(-1))),
  );
  if (!sky) throw new Error('IEM answered non-CSV');

  const split =
    region.id === 'williston'
      ? { sites: pointIndex(nd.flaring), wells: pointIndex(nd.wells) }
      : null;

  console.log(`\n${region.name} — ${mine.length} night detections`);
  console.log(
    'night       ' +
      FIRMS_NRT_FEEDS.map((f) => f.satellite.padStart(8)).join('') +
      '   total  sky' +
      (split ? '                     flaring-well  any-well  other' : ''),
  );
  const totals = { site: 0, unlisted: 0, other: 0 };
  for (const night of nights) {
    const tonight = mine.filter((d) => nightOf(d) === night);
    const cells = FIRMS_NRT_FEEDS.map((f) => {
      const n = tonight.filter((d) => d.feed === f.satellite);
      return String(n.length).padStart(8);
    }).join('');
    const passes = FIRMS_NRT_FEEDS.map((f) => {
      const t = tonight.filter((d) => d.feed === f.satellite).map(overpassMs);
      return t.length ? t.sort((a, b) => a - b)[t.length >> 1] : null;
    }).filter(Boolean);
    const states = passes.map((ms) => skyState(sky, ms));
    const worst = states.reduce(
      (w, s) =>
        ['unknown', 'clear', 'partial', 'obscured'].indexOf(s.state) >
        ['unknown', 'clear', 'partial', 'obscured'].indexOf(w.state)
          ? s
          : w,
      { state: 'unknown', stations: 0, covered: 0 },
    );
    let line = `${night}  ${cells}${String(tonight.length).padStart(8)}  ${`${worst.state} (${worst.covered}/${worst.stations} covered)`.padEnd(24)}`;
    if (split) {
      const n = { site: 0, unlisted: 0, other: 0 };
      for (const d of tonight) {
        if (split.sites.nearest(d.lat, d.lon, matchRadiusM(d))) n.site += 1;
        else if (split.wells.nearest(d.lat, d.lon, UNLISTED_RADIUS_M))
          n.unlisted += 1;
        else n.other += 1;
      }
      for (const k of Object.keys(n)) totals[k] += n[k];
      line += `${String(n.site).padStart(12)}${String(n.unlisted).padStart(10)}${String(n.other).padStart(7)}`;
    }
    console.log(line);
  }
  if (split) {
    const all = totals.site + totals.unlisted + totals.other;
    const pct = (k) => `${((100 * totals[k]) / all).toFixed(0)} %`;
    console.log(
      `split: within the match radius of a flaring well ${totals.site} (${pct('site')}), near another well ${totals.unlisted} (${pct('unlisted')}), near no well ${totals.other} (${pct('other')})`,
    );
  }
}
