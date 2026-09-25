import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { build, preview } from 'vite';
import { hostingPlugins } from '../../server/hosting/plugins.js';
import { apiNotFoundPlugin } from '../../server/standalone/api-not-found.js';
import {
  AUD,
  TEAM,
  certsFetch,
  createSigningKey,
  signAccessToken,
} from '../testSupport/accessTokens.mjs';
import { makeFixtureRoot } from '../tooling/fixtureRoot.mjs';

/** Open a socket and resolve with its first frame, or reject with the HTTP status. */
function connect(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const frames = [];
    const waiters = [];
    ws.on('message', (data) => {
      const frame = JSON.parse(String(data));
      const waiter = waiters.findIndex((entry) => entry.type === frame.type);
      if (waiter >= 0) waiters.splice(waiter, 1)[0].resolve(frame);
      else frames.push(frame);
    });
    ws.on('unexpected-response', (req, res) =>
      reject(Object.assign(new Error('refused'), { status: res.statusCode })),
    );
    ws.on('error', reject);
    ws.on('open', () =>
      resolve({
        ws,
        next(type, timeoutMs = 3000) {
          const index = frames.findIndex((frame) => frame.type === type);
          if (index >= 0) return Promise.resolve(frames.splice(index, 1)[0]);
          return new Promise((done, fail) => {
            const timer = setTimeout(
              () => fail(new Error(`no ${type} frame`)),
              timeoutMs,
            );
            waiters.push({
              type,
              resolve: (frame) => (clearTimeout(timer), done(frame)),
            });
          });
        },
      }),
    );
  });
}

function post(port, body, key) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/publish',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key === undefined ? {} : { 'x-oracle-proxy-key': key }),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString() || 'null'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

test('the event hub behind the hosting plugins: guard at upgrade, snapshot, publish to browser', async (t) => {
  const key = createSigningKey('kid-events');
  const certs = certsFetch(() => [key]);
  const seconds = Math.floor(Date.now() / 1000);
  const token = signAccessToken(key, {
    claims: {
      iat: seconds - 60,
      nbf: seconds - 60,
      exp: seconds + 3600,
      email: 'invitee@example.com',
    },
  });

  // Stand-ins for the console (freshness) and askd (health, relay).
  const pages = [];
  const oracle = http.createServer((req, res) => {
    if (req.url === '/api/oracle/freshness') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          sources: [
            {
              source: 'quotes',
              observedAt: null,
              fetchedAt: new Date().toISOString(),
              lastRunAt: new Date().toISOString(),
              lastRunRows: 4,
              toleranceHours: 2,
              graceHours: 2,
              critical: true,
              state: 'live',
            },
          ],
        }),
      );
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok": true, "running": null}');
      return;
    }
    if (req.url === '/relay/slack') {
      pages.push(req.headers['x-oracle-proxy-key']);
      res.writeHead(202);
      res.end('{}');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  oracle.listen(0, '127.0.0.1');
  await once(oracle, 'listening');
  t.after(() => oracle.close());
  const oracleUrl = `http://127.0.0.1:${oracle.address().port}`;

  const root = await makeFixtureRoot('gev-events-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><title>Events fixture</title>',
  );
  const env = {
    GEV_ACCESS_TEAM: TEAM,
    GEV_ACCESS_AUD: AUD,
    GEV_REQUIRE_ACCESS: '1',
    GEV_CONSOLE_URL: oracleUrl,
    GEV_ASKD_URL: oracleUrl,
    GEV_PROXY_KEY: 'proxy-key-fixture',
    GEV_EVENTS_PUBLISH_PORT: '0',
  };
  const base = {
    root,
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
  };
  await build({
    ...base,
    plugins: hostingPlugins({ env, fetchImpl: certs.fetchImpl }),
  });
  const plugins = hostingPlugins({ env, fetchImpl: certs.fetchImpl });
  const server = await preview({
    ...base,
    plugins: [...plugins, apiNotFoundPlugin()],
    preview: { host: '127.0.0.1', port: 0 },
  });
  const events = plugins.find((plugin) => plugin.name === 'gev-events');
  // One ordered teardown: sockets and the hub first, or close() would wait on them.
  t.after(async () => {
    events.api.state.close?.();
    await new Promise((resolve) => server.httpServer.close(resolve));
  });
  const origin = `127.0.0.1:${server.httpServer.address().port}`;
  for (let i = 0; i < 50 && !events.api.state.address; i += 1)
    await new Promise((r) => setTimeout(r, 20));
  const publishPort = events.api.state.address.port;

  // Anonymous and forged upgrades are refused with 403, never upgraded.
  await assert.rejects(
    connect(`ws://${origin}/api/events`),
    (error) => error.status === 403,
  );
  await assert.rejects(
    connect(`ws://${origin}/api/events`, {
      'cf-access-jwt-assertion': 'x.y.z',
    }),
    (error) => error.status === 403,
  );
  // Other upgrade paths on the preview server are refused too.
  await assert.rejects(
    connect(`ws://${origin}/elsewhere`, { 'cf-access-jwt-assertion': token }),
    (error) => error.status === 404,
  );

  const client = await connect(`ws://${origin}/api/events`, {
    'cf-access-jwt-assertion': token,
  });
  const snapshot = await client.next('snapshot');
  assert.equal(snapshot.v, 1);
  assert.ok(Array.isArray(snapshot.sources) && Array.isArray(snapshot.health));

  // The publish listener: key checked, body validated, frames fan out.
  assert.equal(
    (
      await post(
        publishPort,
        { items: [{ source: 'quotes', rows: 4 }] },
        'wrong',
      )
    ).status,
    403,
  );
  assert.equal(
    (await post(publishPort, { items: [{ source: 'quotes', rows: 4 }] }))
      .status,
    403,
  );
  assert.equal(
    (await post(publishPort, '{nope', 'proxy-key-fixture')).status,
    400,
  );
  assert.equal(
    (await post(publishPort, { items: [] }, 'proxy-key-fixture')).status,
    400,
  );
  const started = Date.now();
  const accepted = await post(
    publishPort,
    { items: [{ source: 'quotes', runAt: '2026-09-25 15:00:02', rows: 4 }] },
    'proxy-key-fixture',
  );
  assert.deepEqual(accepted, { status: 202, body: { accepted: 1 } });
  const update = await client.next('source.updated');
  assert.equal(update.source, 'quotes');
  assert.equal(update.rows, 4);
  assert.equal(update.runAt, '2026-09-25T15:00:02.000Z');
  assert.ok(
    Date.now() - started < 5000,
    'a write reaches the browser within 5 s (G13.6)',
  );

  // A plain GET to the hub path asks for an upgrade instead of a 404.
  const plain = await fetch(`http://${origin}/api/events`, {
    headers: { 'cf-access-jwt-assertion': token },
  });
  assert.equal(plain.status, 426);
  client.ws.terminate();
});
