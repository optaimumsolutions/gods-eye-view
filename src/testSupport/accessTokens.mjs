import { generateKeyPairSync, sign } from 'node:crypto';

/** A local stand-in for a Cloudflare Access team: its keys, JWKS and token signer. */
export const TEAM = 'optaimum-test';
export const TEAM_HOST = `${TEAM}.cloudflareaccess.com`;
export const ISSUER = `https://${TEAM_HOST}`;
export const CERTS_URL = `${ISSUER}/cdn-cgi/access/certs`;
export const AUD = 'aud-commodities-fixture';
export const NOW_MS = Date.parse('2026-09-23T15:00:00Z');

export function createSigningKey(kid = 'kid-1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    alg: 'RS256',
    use: 'sig',
  };
  return { kid, privateKey, jwk };
}

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** Sign an Access-shaped token; `claims` and `header` override the defaults. */
export function signAccessToken(key, { claims = {}, header = {} } = {}) {
  const seconds = Math.floor(NOW_MS / 1000);
  const head = encode({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header });
  const body = encode({
    aud: [AUD],
    email: 'jack@optaimum.com',
    exp: seconds + 3600,
    iat: seconds - 60,
    nbf: seconds - 60,
    iss: ISSUER,
    sub: 'user-1',
    type: 'app',
    ...claims,
  });
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${head}.${body}`),
    key.privateKey,
  );
  return `${head}.${body}.${signature.toString('base64url')}`;
}

/** A fetch that serves the JWKS for `keys` at CERTS_URL and counts its calls. */
export function certsFetch(getKeys) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url) !== CERTS_URL)
      return new Response('not found', { status: 404 });
    return Response.json({ keys: getKeys().map((key) => key.jwk) });
  };
  return { fetchImpl, calls };
}
