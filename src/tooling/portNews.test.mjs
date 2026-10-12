import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PORT_NEWS_MAX_ITEMS,
  PORT_NEWS_NOTICE,
  PORT_NEWS_ROUTE,
  PORT_NEWS_VERIFICATION,
  buildPortNewsQuery,
  parseGoogleNewsRss,
  portNewsProxy,
  selectPortHeadlines,
  titleMatchesAlias,
} from '../../server/providers/portNews.js';

function install(plugin, preview = false) {
  const routes = new Map();
  plugin[preview ? 'configurePreviewServer' : 'configureServer']({
    middlewares: { use: (route, handler) => routes.set(route, handler) },
  });
  return routes;
}

function request(
  handler,
  { method = 'GET', url = '/', address = '127.0.0.1' } = {},
) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([]);
    Object.assign(req, {
      method,
      url,
      headers: { host: 'localhost:4173' },
      socket: { remoteAddress: address },
    });
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      writeHead(status, values) {
        this.statusCode = status;
        for (const [k, v] of Object.entries(values)) this.setHeader(k, v);
      },
      end(body = '') {
        resolve({
          status: this.statusCode,
          headers,
          body: String(body),
          json: () => JSON.parse(String(body)),
        });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function seedRoot(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gev-port-news-'));
  mkdirSync(path.join(dir, 'config'));
  writeFileSync(
    path.join(dir, 'config', 'port_dossiers.seed.json'),
    JSON.stringify([
      {
        portid: 'port362',
        slug: 'fujairah',
        aliases: ['Fujairah port', 'Port of Fujairah', 'Fujairah'],
      },
      {
        portid: 'port481',
        slug: 'houston',
        aliases: ['Port of Houston', 'Houston Ship Channel'],
      },
      { portid: 'port9', slug: 'no-aliases', aliases: [] },
    ]),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function rssItem(
  title,
  link,
  source = 'Example Wire',
  pubDate = 'Tue, 16 Sep 2026 10:00:00 GMT',
) {
  return `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${pubDate}</pubDate><source url="https://example.wire">${source}</source></item>`;
}

function rss(items) {
  return `<?xml version="1.0"?><rss><channel><title>feed</title>${items.join('')}</channel></rss>`;
}

test('buildPortNewsQuery quotes every alias, joins with OR and pins the window', () => {
  assert.deepEqual(
    buildPortNewsQuery([
      'Port of Houston',
      'Houston Ship Channel',
      'Port of Houston',
    ]),
    {
      rss: '("Port of Houston" OR "Houston Ship Channel") when:7d',
      gdelt: '("Port of Houston" OR "Houston Ship Channel")',
    },
  );
  assert.deepEqual(buildPortNewsQuery(['Ras "Tanura" (terminal)']), {
    rss: '"Ras Tanura terminal" when:7d',
    gdelt: '"Ras Tanura terminal"',
  });
  assert.equal(buildPortNewsQuery([]), null);
  assert.equal(buildPortNewsQuery(['  ', '""']), null);
});

test('titleMatchesAlias is case- and whitespace-insensitive and needs a real alias', () => {
  assert.ok(
    titleMatchesAlias('Tankers queue at the PORT OF   HOUSTON - Reuters', [
      'Port of Houston',
    ]),
  );
  assert.ok(
    !titleMatchesAlias('Houston Rockets win again', [
      'Port of Houston',
      'Houston Ship Channel',
    ]),
  );
  assert.ok(!titleMatchesAlias('Anything', ['']));
  assert.ok(!titleMatchesAlias('', ['Fujairah']));
});

test('parseGoogleNewsRss reads CDATA titles, drops bad links and collapses duplicates', () => {
  const xml = rss([
    rssItem(
      'Fujairah bunker sales fall &amp; recover',
      'https://example.wire/a',
    ),
    rssItem(
      'Fujairah bunker sales fall & recover',
      'https://example.wire/a-copy',
    ),
    rssItem('No link item', 'not a url'),
    rssItem('Javascript link', 'javascript:alert(1)'),
    rssItem(
      'Second story',
      'https://example.wire/b',
      'Other Wire',
      'nonsense date',
    ),
  ]);
  const articles = parseGoogleNewsRss(xml);
  assert.deepEqual(
    articles.map((article) => [
      article.title,
      article.domain,
      article.publishedAt,
    ]),
    [
      [
        'Fujairah bunker sales fall & recover',
        'Example Wire',
        '2026-09-16T10:00:00.000Z',
      ],
      ['Second story', 'Other Wire', null],
    ],
  );
  assert.deepEqual(parseGoogleNewsRss(''), []);
});

test('selectPortHeadlines filters by alias, caps the list and stamps every item', () => {
  const articles = Array.from({ length: 15 }, (_, index) => ({
    title:
      index % 3 === 0
        ? `Elsewhere ${index}`
        : `Port of Fujairah story ${index}`,
    url: `https://example.wire/${index}`,
    domain: 'example.wire',
    publishedAt: null,
    sourceCountry: null,
  }));
  const kept = selectPortHeadlines(
    articles,
    ['Port of Fujairah'],
    '2026-09-17T12:00:00.000Z',
  );
  assert.equal(kept.length, PORT_NEWS_MAX_ITEMS);
  for (const item of kept) {
    assert.match(item.title, /Port of Fujairah/);
    assert.equal(item.verification, PORT_NEWS_VERIFICATION);
    assert.equal(item.seenAt, '2026-09-17T12:00:00.000Z');
  }
});

test('port news route validates the request and only serves ports with a dossier', async (t) => {
  const plugin = portNewsProxy({
    sourceRoot: seedRoot(t),
    fetchText: async () => rss([]),
    fetchJson: async () => ({ articles: [] }),
  });
  const handler = install(plugin).get(PORT_NEWS_ROUTE);
  assert.ok(handler);
  assert.equal(
    (await request(handler, { method: 'POST', url: '/?portid=port362' }))
      .status,
    405,
  );
  assert.equal((await request(handler, { url: '/' })).status, 400);
  assert.equal(
    (await request(handler, { url: '/?portid=DROP%20TABLE' })).status,
    400,
  );
  assert.equal((await request(handler, { url: '/?portid=port1' })).status, 404);
  assert.equal(
    (await request(handler, { url: '/?portid=port9' })).status,
    404,
    'a seed entry without aliases is not served',
  );
  assert.ok(
    install(plugin, true).get(PORT_NEWS_ROUTE),
    'preview server gets the same route',
  );
});

test('port news serves alias-matched RSS headlines marked UNVERIFIED WIRE and caches per port', async (t) => {
  let clock = 1_800_000_000_000;
  const calls = [];
  const plugin = portNewsProxy({
    sourceRoot: seedRoot(t),
    now: () => clock,
    fetchText: async (url, options) => {
      calls.push(url);
      assert.ok(
        options.maxBytes > 0 && options.timeoutMs > 0,
        'upstream read is bounded',
      );
      return rss([
        rssItem('Port of Fujairah adds storage', 'https://example.wire/1'),
        rssItem('Fujairah bunker demand steady', 'https://example.wire/2'),
        rssItem('Sharjah traffic report', 'https://example.wire/3'),
      ]);
    },
    fetchJson: async () => {
      throw new Error('GDELT must not be asked when RSS has matches');
    },
  });
  const handler = install(plugin).get(PORT_NEWS_ROUTE);
  const first = await request(handler, { url: '/?portid=port362' });
  assert.equal(first.status, 200);
  assert.equal(first.headers['x-port-news'], 'MISS');
  const payload = first.json();
  assert.equal(payload.status, 'ready');
  assert.equal(payload.source, 'Google News RSS');
  assert.equal(payload.notice, PORT_NEWS_NOTICE);
  assert.deepEqual(
    payload.articles.map((article) => article.title),
    ['Port of Fujairah adds storage', 'Fujairah bunker demand steady'],
  );
  for (const article of payload.articles) {
    assert.equal(article.verification, PORT_NEWS_VERIFICATION);
    assert.equal(article.seenAt, payload.retrievedAt);
  }
  assert.equal(calls.length, 1);
  assert.equal(
    new URL(calls[0]).searchParams.get('q'),
    '("Fujairah port" OR "Port of Fujairah" OR "Fujairah") when:7d',
  );

  clock += 5 * 60_000;
  const second = await request(handler, { url: '/?portid=port362' });
  assert.equal(second.headers['x-port-news'], 'HIT');
  assert.equal(second.json().status, 'cached');
  assert.equal(calls.length, 1, 'one upstream query per port per window');

  const other = await request(handler, { url: '/?portid=port481' });
  assert.equal(other.headers['x-port-news'], 'MISS');
  assert.equal(
    other.json().status,
    'empty',
    'no Houston headline in the stub feed',
  );
  assert.equal(calls.length, 2);

  clock += 16 * 60_000;
  const third = await request(handler, { url: '/?portid=port362' });
  assert.equal(third.headers['x-port-news'], 'MISS', 'the window has expired');
  assert.equal(calls.length, 3);
});

test('port news falls back to GDELT, then to the stale copy, then to a sanitized 503', async (t) => {
  let clock = 1_800_000_000_000;
  let rssFails = true;
  let gdeltFails = false;
  const plugin = portNewsProxy({
    sourceRoot: seedRoot(t),
    now: () => clock,
    fetchText: async () => {
      if (rssFails) throw new Error('secret upstream detail 1');
      return rss([]);
    },
    fetchJson: async (url, options) => {
      if (gdeltFails) throw new Error('secret upstream detail 2');
      assert.equal(options.redirect, 'error');
      assert.match(decodeURIComponent(url), /timespan=7d/);
      return {
        articles: [
          {
            title: 'Houston Ship Channel closed by fog',
            url: 'https://example.news/fog',
            domain: 'example.news',
            seendate: '20260916T101500Z',
          },
          {
            title: 'Unrelated Texas story',
            url: 'https://example.news/other',
            domain: 'example.news',
            seendate: '20260916T101500Z',
          },
        ],
      };
    },
  });
  const handler = install(plugin).get(PORT_NEWS_ROUTE);
  const viaGdelt = await request(handler, { url: '/?portid=port481' });
  assert.equal(viaGdelt.status, 200);
  const payload = viaGdelt.json();
  assert.equal(payload.source, 'GDELT DOC');
  assert.deepEqual(
    payload.articles.map((article) => [
      article.title,
      article.publishedAt,
      article.verification,
    ]),
    [
      [
        'Houston Ship Channel closed by fog',
        '2026-09-16T10:15:00Z',
        PORT_NEWS_VERIFICATION,
      ],
    ],
  );

  gdeltFails = true;
  clock += 20 * 60_000;
  const stale = await request(handler, { url: '/?portid=port481' });
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['x-port-news'], 'STALE');
  assert.equal(stale.json().status, 'stale');

  clock += 61 * 60_000;
  const failed = await request(handler, { url: '/?portid=port481' });
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.json(), {
    error: 'Port headlines are temporarily unavailable',
  });
  assert.ok(
    !failed.body.includes('secret'),
    'upstream error text never reaches the client',
  );
});

test('port news coalesces concurrent refreshes and rate-limits a client', async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let fetches = 0;
  const plugin = portNewsProxy({
    sourceRoot: seedRoot(t),
    fetchText: async () => {
      fetches += 1;
      await gate;
      return rss([rssItem('Port of Fujairah story', 'https://example.wire/1')]);
    },
    fetchJson: async () => ({ articles: [] }),
  });
  const handler = install(plugin).get(PORT_NEWS_ROUTE);
  const a = request(handler, { url: '/?portid=port362' });
  const b = request(handler, { url: '/?portid=port362' });
  release();
  const [first, second] = await Promise.all([a, b]);
  assert.equal(fetches, 1);
  assert.deepEqual(
    [first.headers['x-port-news'], second.headers['x-port-news']].sort(),
    ['INFLIGHT', 'MISS'],
  );

  let limited = null;
  for (let index = 0; index < 40; index += 1) {
    const response = await request(handler, {
      url: '/?portid=port362',
      address: '10.0.0.9',
    });
    if (response.status === 429) {
      limited = response;
      break;
    }
  }
  assert.ok(limited, 'a chatty client is rate limited');
  assert.equal(limited.headers['retry-after'], '10');
});
