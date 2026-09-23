import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AccessDeniedError,
  accessTokenFrom,
  createAccessVerifier,
  decodeJwt,
  normaliseTeamDomain,
} from '../../server/hosting/accessJwt.js';
import {
  AUD,
  CERTS_URL,
  ISSUER,
  NOW_MS,
  TEAM,
  certsFetch,
  createSigningKey,
  signAccessToken,
} from '../testSupport/accessTokens.mjs';

const KEY = createSigningKey('kid-1');
const OTHER = createSigningKey('kid-2');

function verifier(options = {}) {
  const certs = certsFetch(() => options.keys ?? [KEY]);
  let clock = options.now ?? NOW_MS;
  const instance = createAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    fetchImpl: certs.fetchImpl,
    now: () => clock,
    ...options.extra,
  });
  return { instance, calls: certs.calls, advance: (ms) => (clock += ms) };
}

async function deniedWith(promise, reason) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AccessDeniedError, error.message);
    assert.equal(error.reason, reason);
    return true;
  });
}

test('a token Access signed for this application yields its email', async () => {
  const { instance, calls } = verifier();
  assert.equal(instance.issuer, ISSUER);
  assert.equal(instance.certsUrl, CERTS_URL);
  const identity = await instance.verify(
    signAccessToken(KEY, { claims: { email: ' Jack@Optaimum.com ' } }),
  );
  assert.deepEqual(identity, {
    email: 'jack@optaimum.com',
    sub: 'user-1',
    exp: Math.floor(NOW_MS / 1000) + 3600,
  });
  assert.deepEqual(calls, [CERTS_URL]);
  await instance.verify(signAccessToken(KEY));
  assert.equal(calls.length, 1, 'signing keys are cached');
});

test('every forged or misdirected token is refused with its reason', async () => {
  const { instance } = verifier();
  const seconds = Math.floor(NOW_MS / 1000);
  const cases = [
    [signAccessToken(OTHER, { header: { kid: 'kid-1' } }), 'bad signature'],
    [
      signAccessToken(KEY, { claims: { aud: ['another-app'] } }),
      'wrong audience',
    ],
    [signAccessToken(KEY, { claims: { aud: AUD } }), null],
    [
      signAccessToken(KEY, {
        claims: { iss: 'https://evil.cloudflareaccess.com' },
      }),
      'wrong issuer',
    ],
    [signAccessToken(KEY, { claims: { exp: seconds - 61 } }), 'expired'],
    [signAccessToken(KEY, { claims: { exp: undefined } }), 'expired'],
    [signAccessToken(KEY, { claims: { nbf: seconds + 120 } }), 'not yet valid'],
    [
      signAccessToken(KEY, { claims: { iat: seconds + 120 } }),
      'issued in the future',
    ],
    [signAccessToken(KEY, { claims: { email: '' } }), 'no identity email'],
    [
      signAccessToken(KEY, { header: { alg: 'HS256' } }),
      'unsupported algorithm',
    ],
    [
      signAccessToken(KEY, { header: { alg: 'none' } }),
      'unsupported algorithm',
    ],
    [signAccessToken(KEY, { header: { kid: '' } }), 'missing key id'],
    ['', 'missing token'],
    ['a.b', 'malformed token'],
    ['a..c', 'malformed token'],
    ['%%%.%%%.%%%', 'malformed token'],
  ];
  for (const [token, reason] of cases) {
    if (reason === null) {
      // A single-string audience is valid JWT and accepted.
      assert.equal((await instance.verify(token)).email, 'jack@optaimum.com');
      continue;
    }
    await deniedWith(instance.verify(token), reason);
  }
});

test('the time checks allow one minute of clock skew and no more', async () => {
  const seconds = Math.floor(NOW_MS / 1000);
  const { instance } = verifier();
  assert.ok(
    await instance.verify(
      signAccessToken(KEY, { claims: { exp: seconds - 30 } }),
    ),
  );
  assert.ok(
    await instance.verify(
      signAccessToken(KEY, { claims: { nbf: seconds + 30 } }),
    ),
  );
});

test('an unknown key id re-fetches the keys once per cooldown, then is refused', async () => {
  let keys = [KEY];
  const { instance, calls, advance } = verifier({ keys: undefined });
  const rotating = createAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    fetchImpl: certsFetch(() => keys).fetchImpl,
    now: () => NOW_MS,
  });
  await rotating.verify(signAccessToken(KEY));
  keys = [KEY, OTHER];
  // Cooldown not elapsed: the rotated key is not fetched yet.
  await deniedWith(
    rotating.verify(signAccessToken(OTHER)),
    'unknown signing key',
  );

  await instance.verify(signAccessToken(KEY));
  assert.equal(calls.length, 1);
  await deniedWith(
    instance.verify(signAccessToken(OTHER)),
    'unknown signing key',
  );
  assert.equal(calls.length, 1, 'no re-fetch inside the cooldown');
  advance(60_000);
  await deniedWith(
    instance.verify(signAccessToken(OTHER)),
    'unknown signing key',
  );
  assert.equal(calls.length, 2, 'one re-fetch after the cooldown');
});

test('a rotated key is picked up after the cooldown', async () => {
  let keys = [KEY];
  let clock = NOW_MS;
  const rotating = createAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    fetchImpl: certsFetch(() => keys).fetchImpl,
    now: () => clock,
  });
  await rotating.verify(signAccessToken(KEY));
  keys = [OTHER];
  clock += 61_000;
  assert.equal(
    (await rotating.verify(signAccessToken(OTHER))).email,
    'jack@optaimum.com',
  );
});

test('unreachable signing keys deny instead of letting a request through', async () => {
  const failing = createAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    fetchImpl: async () => new Response('down', { status: 503 }),
    now: () => NOW_MS,
  });
  await deniedWith(
    failing.verify(signAccessToken(KEY)),
    'signing keys unavailable',
  );
  const empty = createAccessVerifier({
    teamDomain: TEAM,
    audience: AUD,
    fetchImpl: async () => Response.json({ keys: [{ kty: 'EC', kid: 'x' }] }),
    now: () => NOW_MS,
  });
  await deniedWith(
    empty.verify(signAccessToken(KEY)),
    'signing keys unavailable',
  );
});

test('construction refuses a missing team or audience', () => {
  assert.throws(() => createAccessVerifier({ teamDomain: TEAM }), /audience/);
  assert.throws(() => createAccessVerifier({ audience: AUD }), /team domain/);
  assert.throws(() =>
    createAccessVerifier({ teamDomain: 'bad domain', audience: AUD }),
  );
});

test('team domains normalise from a name, a host or a URL', () => {
  assert.equal(
    normaliseTeamDomain('optaimum'),
    'optaimum.cloudflareaccess.com',
  );
  assert.equal(
    normaliseTeamDomain('https://Optaimum.cloudflareaccess.com/'),
    'optaimum.cloudflareaccess.com',
  );
  assert.equal(normaliseTeamDomain(''), '');
});

test('the token is read from the Access header first, then the cookie', () => {
  assert.equal(
    accessTokenFrom({ 'cf-access-jwt-assertion': ' h.e.x ' }),
    'h.e.x',
  );
  assert.equal(
    accessTokenFrom({ cookie: 'a=1; CF_Authorization=c.o.o; b=2' }),
    'c.o.o',
  );
  assert.equal(
    accessTokenFrom({
      'cf-access-jwt-assertion': 'h.e.x',
      cookie: 'CF_Authorization=c.o.o',
    }),
    'h.e.x',
  );
  assert.equal(accessTokenFrom({ cookie: 'CF_Authorization=' }), '');
  assert.equal(accessTokenFrom({}), '');
});

test('decoding never trusts a non-object header or payload', () => {
  const part = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  assert.throws(
    () => decodeJwt(`${part([1])}.${part({})}.sig`),
    AccessDeniedError,
  );
  assert.throws(
    () => decodeJwt(`${part({})}.${part('x')}.sig`),
    AccessDeniedError,
  );
});
