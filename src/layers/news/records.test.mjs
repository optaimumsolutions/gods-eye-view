import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_GAZETTEER } from './gazetteer.js';
import { buildNewsSnapshot, normalizeNewsPayload } from './records.js';

const ARTICLE = {
  title: 'Tankers divert around the Strait of Hormuz',
  url: 'https://example.com/story',
  domain: 'example.com',
  publishedAt: '2026-10-18T08:00:00Z',
  seenAt: '2026-10-19T09:00:00Z',
  verification: 'UNVERIFIED WIRE',
};

test('gazetteer rows are frozen with unique ids and plausible coordinates', () => {
  const ids = new Set();
  for (const row of NEWS_GAZETTEER) {
    assert.ok(Object.isFrozen(row));
    assert.match(row.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(row.id), `duplicate id ${row.id}`);
    ids.add(row.id);
    assert.ok(
      ['strait', 'port', 'terminal', 'basin', 'pipeline'].includes(row.group),
    );
    assert.ok(Math.abs(row.lon) <= 180);
    assert.ok(Math.abs(row.lat) <= 90);
    // Only the dossier ports may lean on seed aliases; every other group
    // carries its own keywords.
    if (row.group !== 'port')
      assert.ok(row.keywords.length >= 1, `${row.id} needs keywords`);
  }
});

test('normalizeNewsPayload keeps well-formed articles and drops the rest', () => {
  const payload = normalizeNewsPayload({
    status: 'ready',
    retrievedAt: '2026-10-19T09:00:00Z',
    windowDays: 3,
    notice: 'UNVERIFIED WIRE',
    assets: [
      { id: 'strait-hormuz', latestAt: ARTICLE.publishedAt, articles: [ARTICLE] },
      // Malformed items drop silently; an asset with none drops entirely.
      { id: 'suez-canal', articles: [{ title: '', url: 'nope' }] },
      { id: 'strait-hormuz', articles: [ARTICLE] }, // duplicate id ignored
      { id: '', articles: [ARTICLE] },
    ],
  });
  assert.equal(payload.status, 'ready');
  assert.equal(payload.retrievedAt, '2026-10-19T09:00:00Z');
  assert.equal(payload.assets.size, 1);
  const hormuz = payload.assets.get('strait-hormuz');
  assert.equal(hormuz.count, 1);
  assert.equal(hormuz.articles[0].url, 'https://example.com/story');
});

test('normalizeNewsPayload rejects a malformed payload outright', () => {
  assert.equal(normalizeNewsPayload(null), null);
  assert.equal(normalizeNewsPayload({ assets: 'nope' }), null);
});

test('buildNewsSnapshot pins matched counts and zeroes the rest', () => {
  const payload = normalizeNewsPayload({
    status: 'warming',
    retrievedAt: '2026-10-19T09:00:00Z',
    windowDays: 3,
    assets: [{ id: 'strait-hormuz', articles: [ARTICLE] }],
  });
  const snapshot = buildNewsSnapshot(payload);
  assert.equal(snapshot.rows.length, NEWS_GAZETTEER.length);
  assert.equal(snapshot.status, 'warming');
  const hormuz = snapshot.rows.find((row) => row.id === 'strait-hormuz');
  assert.equal(hormuz.count, 1);
  assert.equal(hormuz.articles[0].title, ARTICLE.title);
  const quiet = snapshot.rows.find((row) => row.id === 'suez-canal');
  assert.equal(quiet.count, 0);
  assert.deepEqual(quiet.articles, []);
});
