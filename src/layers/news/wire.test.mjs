import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_GAZETTEER } from './gazetteer.js';
import {
  NEWS_GROUP_PHRASE_LIMIT,
  NEWS_QUERY_ALIAS_LIMIT,
  assetAliases,
  buildGroupQuery,
  buildNewsGroups,
  matchArticlesToAssets,
  mergeGroupCaches,
  titleMatchesAsset,
} from './wire.js';

test('assetAliases quotes keywords, seed aliases, then the bare name', () => {
  assert.deepEqual(
    assetAliases({ id: 'x', keywords: ['Strait of Hormuz', 'Hormuz'] }),
    ['Strait of Hormuz', 'Hormuz'],
  );
  assert.deepEqual(assetAliases({ id: 'houston', name: 'Houston' }, ['Port of Houston', 'Houston Ship Channel']), [
    'Port of Houston',
    'Houston Ship Channel',
  ]);
  assert.deepEqual(assetAliases({ id: 'ulsan', name: 'Ulsan' }), ['Ulsan']);
  // Quote-breaking characters are stripped, never sent upstream.
  assert.deepEqual(assetAliases({ id: 'q', keywords: ['a "b" (c)'] }), [
    'a b c',
  ]);
});

test('buildNewsGroups chunks the gazetteer under the phrase limit in order', () => {
  const groups = buildNewsGroups(NEWS_GAZETTEER);
  assert.ok(groups.length >= 2);
  const seen = [];
  for (const group of groups) {
    const phrases = group.assets.reduce(
      (sum, asset) => sum + asset.queryAliases.length,
      0,
    );
    assert.ok(phrases <= NEWS_GROUP_PHRASE_LIMIT, `${group.id} overflows`);
    for (const asset of group.assets) {
      assert.ok(asset.queryAliases.length <= NEWS_QUERY_ALIAS_LIMIT);
      assert.ok(asset.aliases.length >= asset.queryAliases.length);
      seen.push(asset.id);
    }
  }
  assert.deepEqual(
    seen,
    NEWS_GAZETTEER.map((row) => row.id),
    'every asset lands in exactly one group, in gazetteer order',
  );
});

test('buildGroupQuery joins quoted phrases with OR', () => {
  const [group] = buildNewsGroups([
    { id: 'a', name: 'Alpha' },
    { id: 'b', keywords: ['Beta One', 'Beta Two'] },
  ]);
  assert.equal(buildGroupQuery(group), '("Alpha" OR "Beta One" OR "Beta Two")');
});

test('titleMatchesAsset is case- and whitespace-insensitive', () => {
  assert.ok(titleMatchesAsset('Oil surges on STRAIT  OF  HORMUZ fears', ['Strait of Hormuz']));
  assert.ok(!titleMatchesAsset('Oil surges on OPEC cut', ['Strait of Hormuz']));
});

test('titleMatchesAsset matches whole words, not substrings', () => {
  assert.ok(!titleMatchesAsset('Monsanto settles lawsuit', ['Onsan']));
  assert.ok(titleMatchesAsset('Fire at Onsan refinery contained', ['Onsan']));
  assert.ok(titleMatchesAsset("Golden Pass's first cargo loads", ['Golden Pass LNG', 'Golden Pass']));
});

test('matchArticlesToAssets pins a headline to every asset it names', () => {
  const [group] = buildNewsGroups([
    { id: 'strait-hormuz', keywords: ['Strait of Hormuz', 'Hormuz'] },
    { id: 'ras-tanura', name: 'Ras Tanura' },
  ]);
  const articles = [
    {
      title: 'Ras Tanura loadings slow as Hormuz transits fall',
      url: 'https://example.com/one',
      domain: 'example.com',
      publishedAt: '2026-10-18T08:00:00Z',
    },
    {
      title: 'Unrelated market wrap',
      url: 'https://example.com/two',
      domain: 'example.com',
      publishedAt: null,
    },
  ];
  const byAsset = matchArticlesToAssets(articles, group, '2026-10-19T09:00:00Z');
  assert.deepEqual([...byAsset.keys()].sort(), ['ras-tanura', 'strait-hormuz']);
  const pinned = byAsset.get('strait-hormuz');
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].verification, 'UNVERIFIED WIRE');
  assert.equal(pinned[0].seenAt, '2026-10-19T09:00:00Z');
});

test('mergeGroupCaches reports warming until every group has fetched', () => {
  const fetched = {
    fetchedAt: '2026-10-19T09:00:00Z',
    byAsset: new Map([
      [
        'strait-hormuz',
        [
          {
            title: 't',
            url: 'https://example.com',
            domain: 'example.com',
            publishedAt: '2026-10-18T08:00:00Z',
            seenAt: '2026-10-19T09:00:00Z',
            verification: 'UNVERIFIED WIRE',
          },
        ],
      ],
    ]),
  };
  const warming = mergeGroupCaches([fetched, { fetchedAt: null, byAsset: new Map() }], 0);
  assert.equal(warming.status, 'warming');
  assert.equal(warming.assets.length, 1);
  assert.equal(warming.assets[0].latestAt, '2026-10-18T08:00:00Z');
  const ready = mergeGroupCaches([fetched], 0);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.retrievedAt, '2026-10-19T09:00:00Z');
});
