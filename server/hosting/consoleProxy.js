import http from 'node:http';
import { PROXY_KEY_HEADER, USER_HEADER } from './accessGuard.js';

/**
 * The Oil Oracle console under the globe's origin (plan §15, R13.2).
 *
 * A small streaming pass-through instead of Vite's `preview.proxy`: Vite
 * installs its proxy after plugin middleware, so the api-not-found handler
 * would swallow `/api/oracle/*`, and the proxy must stamp the verified
 * identity on every request it forwards. Nothing here buffers, caches or
 * times out: since FR-D19 (oracle FR-J1) `/ask` and `/grill` answer small
 * JSON at once and the page polls `GET /ask/<id>` (cancel: `POST
 * /ask/<id>/cancel`), but a streamed answer would still pass straight through.
 */

const PAGE_PATHS = new Set(['/gas', '/weather', '/trades', '/logs.json']);
const POST_PATHS = new Set(['/ask', '/grill', '/trade', '/trade_close']);
const ORACLE_API_PREFIX = '/api/oracle/';
// FR-D19 (oracle FR-J1) async ask jobs: poll and cancel.
const ASK_JOB = /^\/ask\/\d+$/;
const ASK_JOB_CANCEL = /^\/ask\/\d+\/cancel$/;
/** Tells the console the page is served inside the globe shell (strip tag). */
export const SHELL_HEADER = 'x-gev-shell';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
// The console needs none of these, and the Access token must not travel further.
const NOT_FORWARDED = new Set([
  ...HOP_BY_HOP,
  'host',
  'cookie',
  'cf-access-jwt-assertion',
  USER_HEADER,
  PROXY_KEY_HEADER,
  SHELL_HEADER,
]);

/** The console path for a request, or null when the globe serves it. */
export function consoleRoute(method, url) {
  let parsed;
  try {
    parsed = new URL(url, 'http://globe.invalid');
  } catch {
    return null;
  }
  const { pathname, search } = parsed;
  if (method === 'GET' || method === 'HEAD') {
    if (pathname === '/market' || pathname === '/market/') return `/${search}`;
    if (PAGE_PATHS.has(pathname)) return pathname + search;
    if (pathname.startsWith(ORACLE_API_PREFIX)) return pathname + search;
    if (ASK_JOB.test(pathname)) return pathname + search;
    return null;
  }
  if (
    method === 'POST' &&
    (POST_PATHS.has(pathname) || ASK_JOB_CANCEL.test(pathname))
  )
    return pathname + search;
  return null;
}

/** Headers for the upstream request: client headers minus the unsafe ones, plus identity. */
export function upstreamHeaders(incoming, { user, proxyKey, targetHost }) {
  const headers = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || NOT_FORWARDED.has(name.toLowerCase())) continue;
    headers[name] = value;
  }
  headers.host = targetHost;
  headers[SHELL_HEADER] = '1';
  if (user) {
    headers[USER_HEADER] = user;
    if (proxyKey) headers[PROXY_KEY_HEADER] = proxyKey;
  }
  return headers;
}

/** Connect-style middleware forwarding console routes to `target`. */
export function createConsoleProxy({
  target = 'http://127.0.0.1:8011',
  proxyKey = '',
} = {}) {
  const base = new URL(target);
  if (base.protocol !== 'http:')
    throw new Error(`Console proxy target must be http: ${target}`);
  const port = Number(base.port || 80);

  return function consoleProxy(req, res, next) {
    const path = consoleRoute(req.method, req.url);
    if (path === null) {
      next();
      return;
    }
    const upstream = http.request(
      {
        host: base.hostname,
        port,
        method: req.method,
        path,
        headers: upstreamHeaders(req.headers, {
          user: req.gevUser,
          proxyKey,
          targetHost: base.host,
        }),
      },
      (answer) => {
        const headers = {};
        for (const [name, value] of Object.entries(answer.headers)) {
          if (value !== undefined && !HOP_BY_HOP.has(name.toLowerCase()))
            headers[name] = value;
        }
        res.writeHead(answer.statusCode || 502, headers);
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        answer.pipe(res);
        answer.on('error', () => res.destroy());
      },
    );
    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(502, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        `The Oil Oracle console is offline (${error.code || error.message}). ` +
          'The globe still works; try this page again shortly.\n',
      );
    });
    // A closed tab or reload aborts the upstream call instead of leaking it.
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  };
}

/** Vite plugin: installed right after the access guard, dev and preview. */
export function consoleProxyPlugin({ env = process.env } = {}) {
  const enabled = env.GEV_CONSOLE_PROXY !== '0';
  const middleware = enabled
    ? createConsoleProxy({
        target: String(env.GEV_CONSOLE_URL || 'http://127.0.0.1:8011'),
        proxyKey: String(env.GEV_PROXY_KEY ?? '').trim(),
      })
    : null;
  const install = (server) => {
    if (middleware) server.middlewares.use(middleware);
  };
  return {
    name: 'gev-console-proxy',
    enforce: 'pre',
    configureServer: { order: 'pre', handler: install },
    configurePreviewServer: { order: 'pre', handler: install },
  };
}
