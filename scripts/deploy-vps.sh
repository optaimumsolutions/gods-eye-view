#!/usr/bin/env bash
# Gated deploy of one commit of the globe on the VPS (row 13, plan §15 R13.8).
#
#   sudo /srv/gods-eye-view/repo/scripts/deploy-vps.sh <sha|ref> [--force-window]
#
# Checks the commit out into releases/<sha>, installs, runs the four gates
# (format, boundaries, tests, build), and only then swaps the `current`
# symlink and restarts the service. Any failure leaves the live release
# untouched. After the restart an unauthenticated local request must get 403
# (the fail-closed Access guard); anything else rolls straight back.
set -euo pipefail

BASE=${GEV_BASE:-/srv/gods-eye-view}
REPO="$BASE/repo"
RELEASES="$BASE/releases"
SHARDS="$BASE/shards"
ENV_FILE=${GEV_ENV_FILE:-/etc/gods-eye-view/globe.env}
SERVICE=${GEV_SERVICE:-globe}
RUN_USER=${GEV_RUN_USER:-globe}
PORT=${GEV_PORT:-8020}
KEEP=${GEV_KEEP_RELEASES:-5}
SAFE_PATH=/usr/local/bin:/usr/bin:/bin

say() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() { say "FAILED: $*"; exit 1; }

REF=${1:-}
[ -n "$REF" ] || die "usage: deploy-vps.sh <sha|ref> [--force-window]"
FORCE_WINDOW=0
[ "${2:-}" = "--force-window" ] && FORCE_WINDOW=1
[ "$(id -u)" -eq 0 ] || die "run with sudo (the swap and the restart need root)"
[ -r "$ENV_FILE" ] || die "missing $ENV_FILE (start from deploy/globe.env.example)"
command -v node >/dev/null || die "node is not installed"
case "$(node -p 'process.versions.node.split(".")[0]')" in
  24 | 26) ;;
  *) die "Node 24 is required (found $(node -v)); install from NodeSource node_24.x" ;;
esac

# Stay out of the oracle's daily (23:00Z) and slow (02:00Z) refresh tiers.
hhmm=$((10#$(date -u +%H%M)))
if [ "$FORCE_WINDOW" -eq 0 ] &&
  { { [ "$hhmm" -ge 2245 ] && [ "$hhmm" -le 2330 ]; } ||
    { [ "$hhmm" -ge 145 ] && [ "$hhmm" -le 230 ]; }; }; then
  die "inside an ingest window (22:45-23:30Z or 01:45-02:30Z); retry later or pass --force-window"
fi

as_user() { runuser -u "$RUN_USER" -- "$@"; }
# Gates run in a clean environment; only the build sees the production file,
# because browser-baked keys and GEV_NAV_STRIP are fixed at build time.
clean_env() {
  runuser -u "$RUN_USER" -- env -i HOME="$BASE" PATH="$SAFE_PATH" \
    PUPPETEER_SKIP_DOWNLOAD=true CI=1 \
    bash -c 'cd "$1"; shift; exec nice -n 10 ionice -c3 "$@"' _ "$DEST" "$@"
}
prod_env() {
  runuser -u "$RUN_USER" -- env -i HOME="$BASE" PATH="$SAFE_PATH" \
    PUPPETEER_SKIP_DOWNLOAD=true CI=1 \
    bash -c 'set -a; . "$1"; set +a; cd "$2"; shift 2; exec nice -n 10 ionice -c3 "$@"' \
    _ "$ENV_FILE" "$DEST" "$@"
}

say "fetching origin"
as_user git -C "$REPO" fetch --quiet --tags origin
SHA=$(as_user git -C "$REPO" rev-parse --verify --quiet "$REF^{commit}") || die "unknown ref: $REF"
DEST="$RELEASES/$SHA"
CURRENT=$(readlink -f "$BASE/current" 2>/dev/null || true)
if [ "$CURRENT" = "$DEST" ]; then
  say "$SHA is already live"
  exit 0
fi

as_user mkdir -p "$RELEASES"
if [ -e "$DEST" ]; then
  as_user git -C "$REPO" worktree remove --force "$DEST" 2>/dev/null || rm -rf "$DEST"
fi
as_user git -C "$REPO" worktree prune
as_user git -C "$REPO" worktree add --detach --quiet "$DEST" "$SHA"
LOGS="$DEST/.deploy-logs"
as_user mkdir -p "$LOGS"

step() {
  local name=$1
  shift
  say "$name"
  if ! "$@" >"$LOGS/$name.log" 2>&1; then
    tail -n 30 "$LOGS/$name.log" || true
    die "$name (full log: $LOGS/$name.log); the live release is unchanged"
  fi
}

step npm-ci clean_env npm ci --no-audit --no-fund
# Git-ignored onshore history (plan §15.13 V5): copied in before the build
# copies public/ into dist/.
if [ -d "$SHARDS" ]; then
  for region in "$SHARDS"/*/; do
    [ -d "$region" ] || continue
    name=$(basename "$region")
    as_user mkdir -p "$DEST/public/data/onshore/$name"
    as_user cp -a "${region%/}" "$DEST/public/data/onshore/$name/history"
  done
fi
step format clean_env npm run format:check
step boundaries clean_env npm run check:boundaries
step test clean_env npm test
step build prod_env npm run build
[ -f "$DEST/dist/index.html" ] || die "the build produced no dist/index.html"

say "swapping current -> $SHA"
PREVIOUS=$CURRENT
ln -sfn "$DEST" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
if [ -n "$PREVIOUS" ]; then
  ln -sfn "$PREVIOUS" "$BASE/previous.next"
  mv -Tf "$BASE/previous.next" "$BASE/previous"
fi
systemctl restart "$SERVICE"

code=000
for _ in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  [ "$code" != 000 ] && break
  sleep 1
done
if [ "$code" != 403 ]; then
  say "smoke check: unauthenticated GET / answered $code, expected 403 from the guard"
  if [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$BASE/current.next"
    mv -Tf "$BASE/current.next" "$BASE/current"
    systemctl restart "$SERVICE"
    say "rolled back to $(basename "$PREVIOUS")"
  fi
  die "smoke check"
fi

as_user git -C "$REPO" tag -f production "$SHA" >/dev/null
say "LIVE: $SHA"

# Keep the newest $KEEP releases, never the current or previous one.
LIVE=$(readlink -f "$BASE/current")
PREV=$(readlink -f "$BASE/previous" 2>/dev/null || true)
count=0
while IFS= read -r dir; do
  [ -n "$dir" ] || continue
  count=$((count + 1))
  [ "$count" -le "$KEEP" ] && continue
  [ "$dir" = "$LIVE" ] || [ "$dir" = "$PREV" ] && continue
  as_user git -C "$REPO" worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"
done < <(ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::')
as_user git -C "$REPO" worktree prune
