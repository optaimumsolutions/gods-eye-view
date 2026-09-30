import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatAsOf } from '../commodities/observation.js';
import { buildWeatherDossierModel } from './dossier.js';
import {
  FIXTURE_ENTRIES,
  FIXTURE_META,
  fixtureNormals,
  fixturePayload,
  fixtureSkill,
} from './fixtures.mjs';
import { blocksByEntry, flattenPoints, normalizeMeta } from './live.js';
import {
  BAND_LABELS,
  RING_MAX_M,
  ambientLabel,
  buildSelectedWeatherCard,
  confidenceLine,
  createWeatherOverlayEntry,
  discShare,
  hoverLines,
  ringRadiusMeters,
  selectWeatherOverlayCohort,
} from './model.js';
import { buildWeatherSnapshot } from './records.js';

const rows = () => {
  const { points, slices } = flattenPoints(FIXTURE_ENTRIES);
  return buildWeatherSnapshot({
    entries: FIXTURE_ENTRIES,
    blocksByEntry: blocksByEntry(fixturePayload(), slices, points.length),
    meta: normalizeMeta(FIXTURE_META),
    normals: fixtureNormals(),
    skill: fixtureSkill(),
    fetchedAt: Date.UTC(2026, 8, 30, 15, 31),
  }).rows;
};

test('ring radius and disc share follow §11.8.5', () => {
  assert.equal(ringRadiusMeters(0), 30_000);
  assert.equal(ringRadiusMeters(10), 110_000);
  assert.equal(ringRadiusMeters(40), RING_MAX_M);
  assert.equal(ringRadiusMeters(null), 30_000);
  const [permian, texas, gulf] = rows();
  assert.equal(discShare(permian), permian.window.freezeDays / 15);
  assert.equal(discShare(texas), texas.window.heatingDays / 15);
  assert.equal(discShare(gulf), gulf.window.galeDays / 7);
});

test('labels, hover lines and the selected card carry the stamp, the heuristic and the confidence', () => {
  const [permian, texas, gulf] = rows();
  assert.match(
    ambientLabel(permian, 3),
    /^PERMIAN · D\+3 · p10 -?\d+°F · \d+ frz$/,
  );
  assert.match(ambientLabel(texas, 3), /^TEXAS · D\+3 · HDD14 \d+$/);
  assert.match(ambientLabel(gulf, 3), /^GULF LNG COAST · D\+3 · wind p90 \d+$/);
  const [title, stamp, headline] = hoverLines(permian, 3, formatAsOf);
  assert.equal(title, 'PERMIAN');
  assert.equal(stamp, 'issued 00Z 09-30 · valid 10-03 (D+3)');
  assert.match(headline, /freeze days \(heuristic 25°F\)/);
  assert.match(hoverLines(gulf, 2, formatAsOf)[2], /gale days \(≥ 39 mph\)/);
  const card = buildSelectedWeatherCard(permian, 3, null, formatAsOf);
  assert.match(card.title, /^PERMIAN · /);
  assert.ok(
    card.details.some((line) =>
      /confidence \d+% · lead D\+3 skill 0\.\d+ \(provisional \(17\/30 inits\), vintage 2026-09-30\) · spread p\d+/.test(
        line,
      ),
    ),
    card.details.join('\n'),
  );
  assert.ok(card.details.some((line) => /vs ERA5 normal/.test(line)));
  assert.equal(confidenceLine(null), 'confidence n/a');
  const entry = createWeatherOverlayEntry(permian, 3, null);
  assert.equal(entry.variant, 'label');
  assert.ok(
    entry.priority > createWeatherOverlayEntry(texas, 3, null).priority,
    'the larger anomaly wins collisions',
  );
  assert.equal(selectWeatherOverlayCohort([entry], 0).length, 0);
});

test('the dossier model draws a fifteen-day fan with the threshold and the normal, and a table by day', () => {
  const [permian] = rows();
  const m = buildWeatherDossierModel(permian, 5);
  assert.equal(m.fan.days.length, 15);
  assert.equal(m.fan.threshold, 25);
  assert.equal(m.fan.selected, 5);
  assert.ok(m.fan.normal.every((v) => v === 40));
  assert.equal(m.table.length, 15);
  assert.match(m.table[5].alpha, /%$/);
  assert.match(
    m.provenance,
    /ECMWF AIFS ENS via Open-Meteo · issued 00Z 09-30 · valid 10-05 · fetched 15:31Z · vs ERA5 normal 2016–2025 · thresholds are heuristics/,
  );
  assert.equal(m.stats[0].label, 'freeze days');
  assert.match(m.stats[0].note, /heuristic 25°F/);
});

test('R11: every card template is descriptive — thresholds say heuristic, nothing says what to do', () => {
  const dir = new URL('./', import.meta.url);
  const sources = ['model.js', 'dossier.js', 'index.js']
    .map((f) => readFileSync(fileURLToPath(new URL(f, dir)), 'utf8'))
    .join('\n');
  for (const forbidden of [
    /\bbuy\b/i,
    /\bsell\b/i,
    /\bshould\b/i,
    /\brecommend/i,
    /\bbullish\b/i,
    /\bbearish\b/i,
    /\balert\b/i,
    /\brisk grade\b/i,
  ])
    assert.doesNotMatch(
      sources,
      forbidden,
      `card templates must not contain ${forbidden}`,
    );
  assert.match(sources, /heuristic/);
  for (const label of Object.values(BAND_LABELS))
    assert.doesNotMatch(label, /\b(danger|risk)\b/i);
});
