import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { hostingPlugins } from '../../server/hosting/plugins.js';
import { localProviderPlugins } from '../../server/providers/local.js';
import { apiNotFoundPlugin } from '../../server/standalone/api-not-found.js';
import {
  AUD,
  TEAM,
  certsFetch,
  createSigningKey,
  signAccessToken,
} from '../testSupport/accessTokens.mjs';
import { makeFixtureRoot } from './fixtureRoot.mjs';

const STRIP_SOURCE = fileURLToPath(
  new URL('../../public/gev-shell/strip.mjs', import.meta.url),
);

/** Plain http so the Host header can be set (fetch forbids it). */
function request(origin, route, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${origin}${route}`,
      { method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('the built site behind the hosting plugins: fail closed, identity, proxy, strip, hosts', async (t) => {
  // Access tokens are signed with real RSA keys: 2048-bit generation is slow on CI.
  const key = createSigningKey('kid-hosting');
  const certs = certsFetch(() => [key]);
  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const claims = { iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3600 };
  const token = signAccessToken(key, {
    claims: { ...claims, email: 'invitee@example.com' },
  });
  const wrongAudience = signAccessToken(key, {
    claims: { ...claims, aud: ['other'] },
  });

  // A stand-in Oil Oracle console.
  const received = [];
  const consoleServer = http.createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    if (req.url === '/api/oracle/freshness') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"sources":[]}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`console ${req.url}`);
  });
  consoleServer.listen(0, '127.0.0.1');
  await once(consoleServer, 'listening');
  t.after(() => consoleServer.close());

  const root = await makeFixtureRoot('gev-hosting-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><title>Hosting fixture</title><div id="cesiumContainer"></div>',
  );
  const publicDir = path.join(root, 'public');
  await mkdir(path.join(publicDir, 'gev-shell'), { recursive: true });
  await copyFile(STRIP_SOURCE, path.join(publicDir, 'gev-shell', 'strip.mjs'));

  for (const [name, value] of Object.entries({
    FIRMS_MAP_KEY: '',
    FIRMS_API_KEY: '',
    TOMTOM_API_KEY: '',
    GOOGLE_MAPS_API_KEY: '',
    GOOGLE_MAPS_SERVER_API_KEY: '',
    OPENAI_API_KEY: '',
  })) {
    const before = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    });
  }

  const env = {
    GEV_ACCESS_TEAM: TEAM,
    GEV_ACCESS_AUD: AUD,
    GEV_REQUIRE_ACCESS: '1',
    GEV_CONSOLE_URL: `http://127.0.0.1:${consoleServer.address().port}`,
    GEV_PROXY_KEY: 'proxy-key-fixture',
    GEV_NAV_STRIP: '1',
  };
  const base = {
    root,
    configFile: false,
    envFile: false,
    publicDir,
    logLevel: 'silent',
  };
  await build({
    ...base,
    plugins: hostingPlugins({ env, fetchImpl: certs.fetchImpl }),
  });

  const { allowedHosts } = createBrowserViteConfig({
    extraAllowedHosts: ['commodities.optaimum.com'],
  }).server;
  const server = await preview({
    ...base,
    plugins: [
      ...hostingPlugins({ env, fetchImpl: certs.fetchImpl }),
      ...localProviderPlugins(),
      apiNotFoundPlugin(),
    ],
    server: { allowedHosts },
    preview: { host: '127.0.0.1', port: 0 },
  });
  t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const signedIn = { 'cf-access-jwt-assertion': token };

  // 1. Fail closed: no token, no content — pages, static files, APIs, console, POSTs.
  for (const [method, route] of [
    ['GET', '/'],
    ['GET', '/gev-shell/strip.mjs'],
    ['GET', '/api/firms/status'],
    ['GET', '/market'],
    ['GET', '/api/oracle/freshness'],
    ['POST', '/ask'],
  ]) {
    const answer = await request(origin, route, { method });
    assert.equal(answer.status, 403, `${method} ${route} without a token`);
    assert.match(answer.text, /Sign in through Cloudflare Access/);
  }
  const misdirected = await request(origin, '/', {
    headers: { 'cf-access-jwt-assertion': wrongAudience },
  });
  assert.equal(misdirected.status, 403);
  assert.equal(
    received.length,
    0,
    'nothing reached the console unauthenticated',
  );

  // 2. Signed in: the globe page carries the strip, which is served as a module.
  const page = await request(origin, '/', { headers: signedIn });
  assert.equal(page.status, 200);
  assert.match(
    page.text,
    /<script type="module" src="\/gev-shell\/strip\.mjs"><\/script>/,
  );
  const strip = await request(origin, '/gev-shell/strip.mjs', {
    headers: signedIn,
  });
  assert.equal(strip.status, 200);
  assert.match(strip.text, /export function freshnessFromLogs/);

  // 3. Provider APIs sit behind the guard and still answer.
  const firms = await request(origin, '/api/firms/status', {
    headers: signedIn,
  });
  assert.equal(firms.status, 200);
  const unknown = await request(origin, '/api/does-not-exist', {
    headers: signedIn,
  });
  assert.equal(unknown.status, 404);
  assert.deepEqual(JSON.parse(unknown.text), { error: 'Unknown API route' });

  // 4. The console under the same origin, with the verified identity and the key.
  const market = await request(origin, '/market', {
    headers: { ...signedIn, 'x-oracle-user': 'spoof@example.com' },
  });
  assert.equal(market.status, 200);
  assert.equal(market.text, 'console /');
  assert.equal(received.at(-1).headers['x-oracle-user'], 'invitee@example.com');
  assert.equal(
    received.at(-1).headers['x-oracle-proxy-key'],
    'proxy-key-fixture',
  );
  assert.equal(received.at(-1).headers['cf-access-jwt-assertion'], undefined);
  // The reserved oracle API reaches the console instead of api-not-found.
  const oracle = await request(origin, '/api/oracle/freshness', {
    headers: signedIn,
  });
  assert.equal(oracle.status, 200);
  assert.deepEqual(JSON.parse(oracle.text), { sources: [] });

  // 5. The hosted name is allowed; any other name is refused by Vite's host check.
  const hosted = await request(origin, '/', {
    headers: { ...signedIn, host: 'commodities.optaimum.com' },
  });
  assert.equal(hosted.status, 200);
  const foreign = await request(origin, '/', {
    headers: { ...signedIn, host: 'evil.example' },
  });
  assert.equal(foreign.status, 403);
  assert.match(foreign.text, /Blocked request/);

  assert.deepEqual(
    [...new Set(certs.calls)],
    [`https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`],
  );
});
