import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  EVENTS_PATH,
  PUBLISH_MAX_BYTES,
  PUBLISH_PATH,
  parsePublishBody,
} from './eventContract.js';
import { createEventHub } from './eventHub.js';

/**
 * M4 wiring (plan §15.7 R13.15–R13.16): the WebSocket hub at /api/events on
 * the globe server, checked by the Access guard at upgrade, and the
 * localhost-only publish listener the oracle posts to. On only when
 * `GEV_EVENTS_PUBLISH_PORT` is set (production: 8021); otherwise the upgrade
 * is left alone and the strip keeps polling /logs.json.
 */

/** The publish port, or null when events are off. `0` picks a free port (tests). */
export function eventsPublishPort(env = process.env) {
  const raw = String(env.GEV_EVENTS_PUBLISH_PORT ?? '').trim();
  if (!raw) return null;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 0 && port < 65536 ? port : null;
}

function keyMatches(given, want) {
  if (!want) return true;
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/** The localhost listener: POST /publish and GET /health. */
export function createPublishListener({ hub, proxyKey = '', log = console }) {
  return http.createServer((req, res) => {
    const path = String(req.url || '').split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      json(res, 200, hub.stats());
      return;
    }
    if (req.method !== 'POST' || path !== PUBLISH_PATH) {
      json(res, 404, { error: 'not found' });
      return;
    }
    if (!keyMatches(req.headers['x-oracle-proxy-key'], proxyKey)) {
      json(res, 403, { error: 'wrong key' });
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > PUBLISH_MAX_BYTES) {
        json(res, 413, { error: 'body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.headersSent) return;
      let items;
      try {
        items = parsePublishBody(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (error) {
        json(res, 400, {
          error: error instanceof TypeError ? error.message : 'invalid JSON',
        });
        return;
      }
      hub.publish(items).then(
        (accepted) => json(res, 202, { accepted }),
        (error) => {
          log.error?.('[gev-events] publish failed', error);
          json(res, 500, { error: 'publish failed' });
        },
      );
    });
  });
}

function refuseUpgrade(socket, status, text) {
  socket.end(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\n\r\n${text}\n`,
  );
}

/**
 * Vite plugin. `guard` is the Access guard (accessGuard.js); in development
 * (guard off) any upgrade is accepted, in deny mode every one is refused.
 */
export function eventsPlugin({
  env = process.env,
  guard,
  createHub = createEventHub,
  log = console,
} = {}) {
  const port = eventsPublishPort(env);
  const state = { hub: null, listener: null, address: null, close: null };

  const install = (server, { preview }) => {
    if (!server.httpServer || state.hub) return;
    if (port === null) {
      // Events off: preview refuses every upgrade at once (it has no HMR
      // socket), so a strip gives up quickly and keeps polling.
      if (preview)
        server.httpServer.on('upgrade', (req, socket) =>
          refuseUpgrade(socket, '404 Not Found', 'Not found.'),
        );
      return;
    }
    const proxyKey = String(env.GEV_PROXY_KEY ?? '');
    const hub = createHub({
      consoleUrl: env.GEV_CONSOLE_URL || 'http://127.0.0.1:8011',
      askdUrl: env.GEV_ASKD_URL || 'http://127.0.0.1:8014',
      proxyKey,
      log,
    });
    const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
    server.httpServer.on('upgrade', (req, socket, head) => {
      const path = String(req.url || '').split('?')[0];
      if (path !== EVENTS_PATH) {
        // Vite's own HMR socket lives on the dev server; preview has none.
        if (preview) refuseUpgrade(socket, '404 Not Found', 'Not found.');
        return;
      }
      const verify = guard?.verifyUpgrade
        ? guard.verifyUpgrade(req)
        : Promise.resolve({ email: null });
      verify.then(
        () =>
          wss.handleUpgrade(req, socket, head, (ws) => {
            const remove = hub.addClient({ send: (text) => ws.send(text) });
            ws.on('close', remove);
            ws.on('error', remove);
            // Browsers only listen; anything they send is ignored.
            ws.on('message', () => {});
          }),
        () =>
          refuseUpgrade(
            socket,
            '403 Forbidden',
            'Forbidden. Sign in through Cloudflare Access.',
          ),
      );
    });
    // A plain GET to the hub path is a client that cannot upgrade.
    server.middlewares.use((req, res, next) => {
      if (String(req.url || '').split('?')[0] !== EVENTS_PATH) return next();
      res.writeHead(426, {
        'Content-Type': 'text/plain',
        Upgrade: 'websocket',
      });
      res.end('Upgrade to a WebSocket.\n');
    });
    const listener = createPublishListener({ hub, proxyKey, log });
    listener.on('error', (error) =>
      log.error?.('[gev-events] publish listener', error.message),
    );
    listener.listen(port, '127.0.0.1', () => {
      state.address = listener.address();
    });
    hub.start();
    state.hub = hub;
    state.listener = listener;
    // An upgraded socket still counts as a connection, so httpServer.close()
    // waits for it: close() ends the sockets first. The service itself just
    // stops with its process.
    state.close = () => {
      if (!state.hub) return;
      state.hub = null;
      hub.stop();
      listener.close();
      for (const client of wss.clients) client.terminate();
      wss.close();
    };
    server.httpServer.once('close', () => state.close?.());
  };

  return {
    name: 'gev-events',
    configureServer: (server) => install(server, { preview: false }),
    configurePreviewServer: (server) => install(server, { preview: true }),
    api: {
      /** The live hub, the listener's bound address and close(), for tests and ops. */
      state,
    },
  };
}
