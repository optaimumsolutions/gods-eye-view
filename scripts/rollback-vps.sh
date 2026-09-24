#!/usr/bin/env bash
# Swap the live globe release back to the previous one (row 13, plan §15 R13.8).
#
#   sudo /srv/gods-eye-view/repo/scripts/rollback-vps.sh
#
# The previous release is already built and gated, so this is a symlink swap
# and a restart; the target is under a minute.
set -euo pipefail

BASE=${GEV_BASE:-/srv/gods-eye-view}
SERVICE=${GEV_SERVICE:-globe}
RUN_USER=${GEV_RUN_USER:-globe}
PORT=${GEV_PORT:-8020}

say() { printf '[rollback %s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() { say "FAILED: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run with sudo"
CURRENT=$(readlink -e "$BASE/current" 2>/dev/null || true)
PREVIOUS=$(readlink -e "$BASE/previous" 2>/dev/null || true)
[ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ] || die "no previous release recorded"
[ -f "$PREVIOUS/dist/index.html" ] || die "previous release has no build: $PREVIOUS"
[ "$PREVIOUS" != "$CURRENT" ] || die "previous is the live release; nothing to roll back to"

ln -sfn "$PREVIOUS" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
if [ -n "$CURRENT" ]; then
  ln -sfn "$CURRENT" "$BASE/previous.next"
  mv -Tf "$BASE/previous.next" "$BASE/previous"
fi
systemctl restart "$SERVICE"

code=000
for _ in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  [ "$code" != 000 ] && break
  sleep 1
done
[ "$code" = 403 ] || die "smoke check answered $code, expected 403; inspect: journalctl -u $SERVICE"
runuser -u "$RUN_USER" -- git -C "$BASE/repo" tag -f production "$(basename "$PREVIOUS")" >/dev/null
say "LIVE: $(basename "$PREVIOUS") (was $(basename "${CURRENT:-none}"))"
