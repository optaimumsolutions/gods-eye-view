import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import {
  consoleProxyPlugin,
  consoleRoute,
  createConsoleProxy,
  upstreamHeaders,
} from '../../server/hosting/consoleProxy.js';

test('console routes: pages, POST relays and the reserved oracle API; nothing else', () => {
  const cases = [
    ['GET', '/market', '/'],
    ['GET', '/market/', '/'],
    ['GET', '/market?tab=1', '/?tab=1'],
    ['HEAD', '/gas', '/gas'],
    ['GET', '/weather', '/weather'],
    ['GET', '/trades', '/trades'],
    ['GET', '/logs.json', '/logs.json'],
    ['GET', '/api/oracle/freshness', '/api/oracle/freshness'],
    ['POST', '/ask', '/ask'],
    ['POST', '/grill', '/grill'],
    ['POST', '/trade', '/trade'],
    ['POST', '/trade_close', '/trade_close'],
    ['GET', '/ask/42', '/ask/42'],
    ['POST', '/ask/42/cancel', '/ask/42/cancel'],
    ['POST', '/ask/42', null],
    ['GET', '/ask/42/cancel', null],
    ['GET', '/ask/x', null],
    ['GET', '/', null],
    ['GET', '/api/opensky', null],
    ['GET', '/ask', null],
    ['POST', '/market', null],
    ['POST', '/api/oracle/freshness', null],
    ['GET', '/gas/extra', null],
    ['DELETE', '/trade', null],
  ];
  for (const [method, url, expected] of cases)
    assert.equal(consoleRoute(method, url), expected, `${method} ${url}`);
});

test('upstream headers drop hop-by-hop, cookies, the Access token and spoofed identity', () => {
  const headers = upstreamHeaders(
    {
      host: 'commodities.optaimum.com',
      connection: 'keep-alive',
      cookie: 'CF_Authorization=secret',
      'cf-access-jwt-assertion': 'secret',
      'x-oracle-user': 'spoof@example.com',
      'x-oracle-proxy-key': 'guess',
      'x-gev-shell': 'spoof',
      'content-type': 'application/json',
      'content-length': '12',
      accept: '*/*',
    },
    {
      user: 'jack@optaimum.com',
      proxyKey: 'k3y',
      targetHost: '127.0.0.1:8011',
    },
  );
  assert.deepEqual(headers, {
    'content-type': 'application/json',
    'content-length': '12',
    accept: '*/*',
    host: '127.0.0.1:8011',
    'x-gev-shell': '1',
    'x-oracle-user': 'jack@optaimum.com',
    'x-oracle-proxy-key': 'k3y',
  });
  const anonymous = upstreamHeaders(
    { 'x-oracle-user': 'spoof' },
    {
      user: undefined,
      proxyKey: 'k3y',
      targetHost: 'h',
    },
  );
  assert.deepEqual(
    anonymous,
    { host: 'h', 'x-gev-shell': '1' },
    'no key without a verified user',
  );
});

async function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

test('a real round trip: rewrite, body relay, identity, streaming and the offline page', async (t) => {
  const seen = [];
  let releaseStream;
  const console_ = await listen((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      if (req.url === '/ask') {
        // HTTP/1.0-style streamed answer, like BaseHTTPRequestHandler.
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.write('[retrieving context]\n');
        releaseStream = () => res.end('answer\n');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'X-Console': 'yes' });
      res.end(`page ${req.url}`);
    });
  });
  t.after(() => console_.server.close());
  const proxy = createConsoleProxy({
    target: console_.origin,
    proxyKey: 'k3y',
  });
  const globe = await listen((req, res) => {
    req.gevUser = 'invitee@example.com';
    proxy(req, res, () => {
      res.writeHead(404);
      res.end('globe');
    });
  });
  t.after(() => globe.server.close());

  const market = await fetch(`${globe.origin}/market?x=1`, {
    headers: {
      'x-oracle-user': 'spoof@example.com',
      cookie: 'CF_Authorization=t',
    },
  });
  assert.equal(market.status, 200);
  assert.equal(market.headers.get('x-console'), 'yes');
  assert.equal(await market.text(), 'page /?x=1');
  assert.equal(seen.at(-1).headers['x-oracle-user'], 'invitee@example.com');
  assert.equal(seen.at(-1).headers['x-oracle-proxy-key'], 'k3y');
  assert.equal(seen.at(-1).headers.cookie, undefined);
  assert.equal(seen.at(-1).headers['x-gev-shell'], '1');

  const trade = await fetch(`${globe.origin}/trade`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"lots":1}',
  });
  assert.equal(trade.status, 200);
  assert.deepEqual(
    {
      method: seen.at(-1).method,
      url: seen.at(-1).url,
      body: seen.at(-1).body,
    },
    { method: 'POST', url: '/trade', body: '{"lots":1}' },
  );

  const passthrough = await fetch(`${globe.origin}/api/opensky`);
  assert.equal(
    await passthrough.text(),
    'globe',
    'non-console routes fall through',
  );

  // Streaming: the first line arrives while the console is still "thinking".
  const ask = await fetch(`${globe.origin}/ask`, {
    method: 'POST',
    body: '{"q":"x"}',
  });
  assert.equal(ask.status, 200);
  const reader = ask.body.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), '[retrieving context]\n');
  releaseStream();
  let rest = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += new TextDecoder().decode(value);
  }
  assert.equal(rest, 'answer\n');

  // Console down: a plain 502 page, never a crash.
  const deadProxy = createConsoleProxy({ target: 'http://127.0.0.1:1' });
  const dead = await listen((req, res) =>
    deadProxy(req, res, () => res.end('next')),
  );
  t.after(() => dead.server.close());
  const offline = await fetch(`${dead.origin}/gas`);
  assert.equal(offline.status, 502);
  assert.match(await offline.text(), /console is offline/);
});

test('the plugin can be switched off and refuses a non-http target', () => {
  const installed = [];
  const server = { middlewares: { use: (fn) => installed.push(fn) } };
  consoleProxyPlugin({
    env: { GEV_CONSOLE_PROXY: '0' },
  }).configurePreviewServer.handler(server);
  assert.equal(installed.length, 0);
  consoleProxyPlugin({ env: {} }).configureServer.handler(server);
  assert.equal(installed.length, 1);
  assert.throws(
    () => createConsoleProxy({ target: 'https://x.example' }),
    /must be http/,
  );
});
