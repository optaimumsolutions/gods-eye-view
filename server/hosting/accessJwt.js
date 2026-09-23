import { createPublicKey, verify as verifySignature } from 'node:crypto';

/**
 * Cloudflare Access token verification for the hosted site (plan §15, R13.6).
 *
 * Cloudflare Access signs every request that passes its login with an RS256
 * JWT in the `Cf-Access-Jwt-Assertion` header (and the `CF_Authorization`
 * cookie). The origin re-checks it so that a detached or misconfigured Access
 * application can never expose the site: signature against the team's
 * published keys, audience = this application's AUD tag, issuer = the team
 * domain, and the time claims. Uses node:crypto only.
 */

export class AccessDeniedError extends Error {
  constructor(reason) {
    super(`Access denied: ${reason}`);
    this.name = 'AccessDeniedError';
    this.reason = reason;
  }
}

const deny = (reason) => {
  throw new AccessDeniedError(reason);
};

/** Split and decode a compact JWS without trusting any of it yet. */
export function decodeJwt(token) {
  if (typeof token !== 'string' || !token) deny('missing token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part))
    deny('malformed token');
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    deny('malformed token');
  }
  if (!header || typeof header !== 'object' || Array.isArray(header))
    deny('malformed token');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    deny('malformed token');
  return {
    header,
    payload,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: Buffer.from(parts[2], 'base64url'),
  };
}

/** Accept `team`, `team.cloudflareaccess.com` or its https URL; return the host. */
export function normaliseTeamDomain(team) {
  const raw = String(team ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  if (!raw) return '';
  const host = (
    raw.includes('.') ? raw : `${raw}.cloudflareaccess.com`
  ).toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host))
    throw new Error(`Invalid Cloudflare Access team domain: ${team}`);
  return host;
}

/** The Access token on an incoming request: the header first, then the cookie. */
export function accessTokenFrom(headers = {}) {
  const header = headers['cf-access-jwt-assertion'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const cookie = typeof headers.cookie === 'string' ? headers.cookie : '';
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === 'CF_Authorization') {
      const value = part.slice(index + 1).trim();
      if (value) return value;
    }
  }
  return '';
}

/**
 * Build a verifier for one Access application.
 * `verify(token)` resolves to `{ email, sub, exp }` or rejects with AccessDeniedError.
 */
export function createAccessVerifier({
  teamDomain,
  audience,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  leewaySeconds = 60,
  refreshCooldownMs = 60_000,
} = {}) {
  const host = normaliseTeamDomain(teamDomain);
  const audiences = new Set(
    []
      .concat(audience ?? [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  );
  if (!host || !audiences.size)
    throw new Error('Access verifier needs a team domain and an audience tag');
  if (typeof fetchImpl !== 'function')
    throw new Error('Access verifier needs a fetch implementation');
  const issuer = `https://${host}`;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  let keys = new Map();
  let lastFetchAt = -Infinity;
  let inflight = null;

  function refresh() {
    if (inflight) return inflight;
    lastFetchAt = now();
    inflight = (async () => {
      const response = await fetchImpl(certsUrl, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok)
        throw new Error(`Access signing keys answered ${response.status}`);
      const body = await response.json();
      const next = new Map();
      for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
        if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
        try {
          next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
        } catch {
          // A key the runtime cannot import is skipped, never trusted.
        }
      }
      if (!next.size) throw new Error('Access signing keys carried no RSA key');
      keys = next;
      return keys.size;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function keyFor(kid) {
    if (keys.has(kid)) return keys.get(kid);
    // Unknown kid: Cloudflare rotated its keys. Re-fetch, at most once a cooldown.
    if (!keys.size || now() - lastFetchAt >= refreshCooldownMs) {
      try {
        await refresh();
      } catch {
        deny('signing keys unavailable');
      }
    }
    const key = keys.get(kid);
    if (!key) deny('unknown signing key');
    return key;
  }

  async function verify(token) {
    const { header, payload, signingInput, signature } = decodeJwt(token);
    if (header.alg !== 'RS256') deny('unsupported algorithm');
    if (typeof header.kid !== 'string' || !header.kid) deny('missing key id');
    const key = await keyFor(header.kid);
    if (
      !verifySignature('RSA-SHA256', Buffer.from(signingInput), key, signature)
    )
      deny('bad signature');
    const tokenAudiences = [].concat(payload.aud ?? []);
    if (!tokenAudiences.some((value) => audiences.has(value)))
      deny('wrong audience');
    if (payload.iss !== issuer) deny('wrong issuer');
    const seconds = now() / 1000;
    if (
      typeof payload.exp !== 'number' ||
      payload.exp + leewaySeconds <= seconds
    )
      deny('expired');
    if (
      typeof payload.nbf === 'number' &&
      payload.nbf - leewaySeconds > seconds
    )
      deny('not yet valid');
    if (
      typeof payload.iat === 'number' &&
      payload.iat - leewaySeconds > seconds
    )
      deny('issued in the future');
    const email =
      typeof payload.email === 'string'
        ? payload.email.trim().toLowerCase()
        : '';
    if (!email) deny('no identity email');
    return {
      email,
      sub: typeof payload.sub === 'string' ? payload.sub : null,
      exp: payload.exp,
    };
  }

  return { verify, refresh, issuer, certsUrl };
}
