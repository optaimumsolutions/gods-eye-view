import {
  AccessDeniedError,
  accessTokenFrom,
  createAccessVerifier,
} from './accessJwt.js';

/** Identity headers the globe sets for the console; never accepted from outside. */
export const USER_HEADER = 'x-oracle-user';
export const PROXY_KEY_HEADER = 'x-oracle-proxy-key';

/**
 * Read the hosting switches. Absent team and audience = local development,
 * guard off. `GEV_REQUIRE_ACCESS=1` (set in the production env file) or a
 * half-configured pair turns every request into a 403: fail closed.
 */
export function hostingAccessConfig(env = process.env) {
  const team = String(env.GEV_ACCESS_TEAM ?? '').trim();
  const audience = String(env.GEV_ACCESS_AUD ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const required =
    env.GEV_REQUIRE_ACCESS === '1' || Boolean(team) || audience.length > 0;
  return { team, audience, required };
}

/** Remove identity headers a client could have set itself. */
export function stripIdentityHeaders(req) {
  delete req.headers[USER_HEADER];
  delete req.headers[PROXY_KEY_HEADER];
}

/**
 * The guard for one server. `mode` is `off` (development), `verify`
 * (production) or `deny` (production without a usable configuration).
 */
export function createAccessGuard({ verifier = null, required = false } = {}) {
  const mode = verifier ? 'verify' : required ? 'deny' : 'off';

  async function authenticate(req) {
    stripIdentityHeaders(req);
    if (mode === 'off') return { email: null };
    if (mode === 'deny') throw new AccessDeniedError('access not configured');
    const token = accessTokenFrom(req.headers);
    if (!token) throw new AccessDeniedError('missing token');
    return verifier.verify(token);
  }

  function middleware(req, res, next) {
    authenticate(req).then(
      (identity) => {
        if (identity.email) req.gevUser = identity.email;
        next();
      },
      (error) => forbid(res, error),
    );
  }

  /** For the WebSocket upgrade (M4): resolves to the identity or rejects. */
  function verifyUpgrade(req) {
    return authenticate(req);
  }

  return { mode, authenticate, middleware, verifyUpgrade };
}

function forbid(res, error) {
  const reason =
    error instanceof AccessDeniedError ? error.reason : 'verification failed';
  if (!(error instanceof AccessDeniedError))
    console.error('[gev-access-guard]', error);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(403, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(`Forbidden (${reason}). Sign in through Cloudflare Access.\n`);
}

/** Vite plugin: the guard runs before every other middleware, dev and preview. */
export function accessGuardPlugin({ env = process.env, fetchImpl, now } = {}) {
  const config = hostingAccessConfig(env);
  const verifier =
    config.team && config.audience.length
      ? createAccessVerifier({
          teamDomain: config.team,
          audience: config.audience,
          ...(fetchImpl ? { fetchImpl } : {}),
          ...(now ? { now } : {}),
        })
      : null;
  const guard = createAccessGuard({ verifier, required: config.required });
  const install = (server) => {
    if (guard.mode === 'off') return;
    server.middlewares.use(guard.middleware);
  };
  return {
    name: 'gev-access-guard',
    enforce: 'pre',
    configureServer: { order: 'pre', handler: install },
    configurePreviewServer: { order: 'pre', handler: install },
    api: { guard },
  };
}
