# Hosting — the globe and the Oil Oracle console at commodities.optaimum.com

Row 13 of [`COMMODITIES-PLAN.md`](COMMODITIES-PLAN.md) (§15). The globe runs as
`globe.service` on the VPS beside the console, on `127.0.0.1:8020`. Cloudflare
Tunnel `oracle` is the only way in, and Cloudflare Access gates it. The globe
server re-checks every request's Access token itself and refuses anything
without a valid one.

## What runs where

| Piece | Code | Dev (`npm run dev`) | Production (`vite preview`) |
| --- | --- | --- | --- |
| Access guard | `server/hosting/accessJwt.js`, `accessGuard.js` | off unless `GEV_ACCESS_*` is set | verifies `Cf-Access-Jwt-Assertion`; 403 otherwise |
| Console proxy | `server/hosting/consoleProxy.js` | on, to `127.0.0.1:8011` | on; adds `X-Oracle-User` + `X-Oracle-Proxy-Key` |
| Product strip | `public/gev-shell/strip.mjs`, `server/hosting/navStrip.js` | off unless `GEV_NAV_STRIP=1` | on (set at build time) |
| Allowed hosts | `build/vite.js` `extraAllowedHosts` | loopback only | + `GEV_ALLOWED_HOSTS` |
| Rate limits | `server/providers/common/rate-limit.js` | per socket address | per verified email |

Plugin order (`server/hosting/plugins.js`): guard, then console proxy, then the
strip, then the providers, then `api-not-found`. Vite runs plugin middleware
before its own host check, proxy and static files, so the guard covers every
request.

Console routes under the globe's origin: `GET /market` (the console root),
`/gas`, `/weather`, `/trades`, `/logs.json`, `/api/oracle/*` (reserved for M3),
and `POST /ask`, `/grill`, `/trade`, `/trade_close`. Answers stream; the proxy
never buffers or times out. With the console down, those paths answer a plain
502 page and the globe keeps working.

## Try it locally

```sh
GEV_NAV_STRIP=1 npm run build
npx vite preview --port 4176 --strictPort --host 127.0.0.1
# with the desk console on 8011, /market shows it through the proxy
```

`src/tooling/hostingPreview.test.mjs` runs the production path end to end
with a locally signed Access token: every route is 403 without it, the
identity reaches the console, `/api/oracle/*` beats `api-not-found`, and the
hosted name passes Vite's host check while any other name is refused.
`.gev-logs/render-strip.mjs` screenshots the strip on the globe and on
`/market`.

## Environment

`deploy/globe.env.example` is generated from every variable the server reads:
`node scripts/hosting/env-template.mjs` (a test fails when it drifts). Install
it as `/etc/gods-eye-view/globe.env`, owner `root:globe`, mode `0640`. Keys go
in over ssh, never through chat. The Google browser key and the Cesium token
are baked into the bundle at build time, so they reach every signed-in browser:
lock the Google key to `https://commodities.optaimum.com/*`.

## VPS setup (once)

Show each command before running it; the VPS also runs the live console.

```sh
# Node 24 (Ubuntu 26.04's apt ships Node 22, which fails package.json engines)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo useradd --system --home /srv/gods-eye-view --shell /usr/sbin/nologin globe
sudo install -d -o globe -g globe /srv/gods-eye-view /srv/gods-eye-view/releases /srv/gods-eye-view/shards
sudo -u globe git clone https://github.com/optaimumsolutions/gods-eye-view.git /srv/gods-eye-view/repo
sudo install -d -m 0750 -o root -g globe /etc/gods-eye-view
sudo install -m 0640 -o root -g globe /srv/gods-eye-view/repo/deploy/globe.env.example /etc/gods-eye-view/globe.env
sudo cp /srv/gods-eye-view/repo/deploy/globe.service /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable globe
```

From the laptop, the git-ignored onshore history (85 MB; the 950 MB
`.gev-cache/` stays on the laptop):

```sh
rsync -a public/data/onshore/williston/history/ ubuntu@15.204.118.186:/tmp/williston-history/
# then on the VPS
sudo install -d -o globe -g globe /srv/gods-eye-view/shards/williston
sudo rsync -a --chown=globe:globe /tmp/williston-history/ /srv/gods-eye-view/shards/williston/
```

## Deploy and roll back

```sh
sudo /srv/gods-eye-view/repo/scripts/deploy-vps.sh <sha>     # gates on the VPS, then swap
sudo /srv/gods-eye-view/repo/scripts/rollback-vps.sh          # previous release, under a minute
```

The deploy refuses to start inside the oracle's refresh windows
(22:45–23:30Z, 01:45–02:30Z) unless given `--force-window`. After the restart
an unauthenticated local request must answer 403; anything else rolls back.
The live commit carries the local tag `production`.

## Cloudflare, strictly in this order

1. Zero Trust → Access → Applications → self-hosted **Commodities** for
   `commodities.optaimum.com`; policy **Founder** (jack@optaimum.com, one-time
   PIN), session 24 hours. Copy the team domain and the application's AUD tag
   into `globe.env` (`GEV_ACCESS_TEAM`, `GEV_ACCESS_AUD`), then
   `sudo systemctl restart globe`.
2. Only then: tunnel **oracle** → Public hostname `commodities.optaimum.com` →
   `http://localhost:8020`. Check that the zone's Network → WebSockets switch
   is on (the default); milestone 4 needs it.

The console went briefly public during FR-D5 because the hostname came first.

## Verify (M1)

```sh
curl -sI https://commodities.optaimum.com/ | head -1        # redirect to the Access login
curl -sI https://commodities.optaimum.com/market | head -1
curl -sI https://commodities.optaimum.com/api/opensky | head -1
# on the VPS
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8020/   # 403
```

Then in a browser: the globe renders, every strip link loads, the badge matches
`/logs.json`.
