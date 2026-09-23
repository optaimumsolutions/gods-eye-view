import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessGuardPlugin,
  createAccessGuard,
  hostingAccessConfig,
} from '../../server/hosting/accessGuard.js';
import { createAccessVerifier } from '../../server/hosting/accessJwt.js';
import {
  AUD,
  NOW_MS,
  TEAM,
  certsFetch,
  createSigningKey,
  signAccessToken,
} from '../testSupport/accessTokens.mjs';

const KEY = createSigningKey();

function run(middleware, headers = {}) {
  return new Promise((resolve) => {
    const req = { headers: { ...headers } };
    const res = {
      headersSent: false,
      writeHead(status, head) {
        this.status = status;
        this.head = head;
        this.headersSent = true;
      },
      end(body) {
        resolve({
          passed: false,
          status: this.status,
          head: this.head,
          body,
          req,
        });
      },
      destroy() {
        resolve({ passed: false, destroyed: true, req });
      },
    };
    middleware(req, res, () => resolve({ passed: true, req }));
  });
}

const verifier = () =>
  createAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    fetchImpl: certsFetch(() => [KEY]).fetchImpl,
    now: () => NOW_MS,
  });

test('hosting config: nothing set is development, anything set is production', () => {
  assert.deepEqual(hostingAccessConfig({}), {
    team: '',
    audience: [],
    required: false,
  });
  assert.equal(hostingAccessConfig({ GEV_REQUIRE_ACCESS: '1' }).required, true);
  assert.equal(hostingAccessConfig({ GEV_ACCESS_TEAM: 'x' }).required, true);
  assert.deepEqual(
    hostingAccessConfig({ GEV_ACCESS_AUD: ' a , b ,' }).audience,
    ['a', 'b'],
  );
});

test('verify mode passes a signed request with its email and strips spoofed identity', async () => {
  const guard = createAccessGuard({ verifier: verifier(), required: true });
  assert.equal(guard.mode, 'verify');
  const result = await run(guard.middleware, {
    'cf-access-jwt-assertion': signAccessToken(KEY),
    'x-oracle-user': 'attacker@example.com',
    'x-oracle-proxy-key': 'guess',
  });
  assert.equal(result.passed, true);
  assert.equal(result.req.gevUser, 'jack@optaimum.com');
  assert.equal(result.req.headers['x-oracle-user'], undefined);
  assert.equal(result.req.headers['x-oracle-proxy-key'], undefined);
});

test('verify mode answers 403 to a missing or bad token and never calls next', async () => {
  const guard = createAccessGuard({ verifier: verifier(), required: true });
  const missing = await run(guard.middleware);
  assert.equal(missing.status, 403);
  assert.match(missing.body, /missing token/);
  assert.equal(missing.head['Cache-Control'], 'no-store');
  const wrong = await run(guard.middleware, {
    'cf-access-jwt-assertion': signAccessToken(KEY, { claims: { aud: ['x'] } }),
  });
  assert.equal(wrong.status, 403);
  assert.match(wrong.body, /wrong audience/);
});

test('production without a usable configuration denies everything (fail closed)', async () => {
  const guard = createAccessGuard({ verifier: null, required: true });
  assert.equal(guard.mode, 'deny');
  const result = await run(guard.middleware, {
    'cf-access-jwt-assertion': signAccessToken(KEY),
  });
  assert.equal(result.status, 403);
  assert.match(result.body, /access not configured/);
  await assert.rejects(
    guard.verifyUpgrade({ headers: {} }),
    /access not configured/,
  );
});

test('development mode lets requests through without identity', async () => {
  const guard = createAccessGuard();
  assert.equal(guard.mode, 'off');
  const result = await run(guard.middleware, {
    'x-oracle-user': 'spoof@example.com',
  });
  assert.equal(result.passed, true);
  assert.equal(result.req.gevUser, undefined);
  assert.equal(result.req.headers['x-oracle-user'], undefined);
});

test('the upgrade check resolves the same identity the HTTP guard sets', async () => {
  const guard = createAccessGuard({ verifier: verifier(), required: true });
  const identity = await guard.verifyUpgrade({
    headers: { cookie: `CF_Authorization=${signAccessToken(KEY)}` },
  });
  assert.equal(identity.email, 'jack@optaimum.com');
});

test('the plugin installs only in production, first, for dev and preview', () => {
  const installed = [];
  const server = { middlewares: { use: (fn) => installed.push(fn) } };
  const dev = accessGuardPlugin({ env: {} });
  assert.equal(dev.enforce, 'pre');
  dev.configurePreviewServer.handler(server);
  assert.equal(installed.length, 0);
  const half = accessGuardPlugin({ env: { GEV_ACCESS_TEAM: TEAM } });
  assert.equal(half.api.guard.mode, 'deny');
  const prod = accessGuardPlugin({
    env: { GEV_ACCESS_TEAM: TEAM, GEV_ACCESS_AUD: AUD },
    fetchImpl: certsFetch(() => [KEY]).fetchImpl,
  });
  assert.equal(prod.api.guard.mode, 'verify');
  assert.equal(prod.configureServer.order, 'pre');
  prod.configureServer.handler(server);
  prod.configurePreviewServer.handler(server);
  assert.equal(installed.length, 2);
});

test('rate limits key on the verified user when hosted, the socket otherwise', async () => {
  const { clientKey } =
    await import('../../server/providers/common/rate-limit.js');
  const socket = { remoteAddress: '127.0.0.1' };
  assert.equal(clientKey({ socket }), '127.0.0.1');
  assert.equal(
    clientKey({ socket, gevUser: 'a@example.com' }),
    'user:a@example.com',
  );
  assert.equal(
    clientKey({ socket, headers: { 'x-oracle-user': 'spoof' } }),
    '127.0.0.1',
    'a client header never picks the quota bucket',
  );
});
