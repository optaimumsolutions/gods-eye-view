#!/usr/bin/env bash
# Founder step (plan §15.12 steps 4-5): write the hosted Google keys, the
# Access team + AUD and the invitee cost caps into /etc/gods-eye-view/globe.env,
# then run a gated deploy so the browser key is baked into the build.
# Run from the laptop (Git Bash). Prints variable names and set/EMPTY only,
# never a value: key strings come from gcloud and travel on ssh's stdin.
#
#   bash scripts/hosting/push-hosted-env.sh              # write, then deploy
#   bash scripts/hosting/push-hosted-env.sh --no-deploy  # write only
#
# Needs: gcloud signed in with access to the Maps project, the ssh key below,
# and the Access app `Commodities` in front of the hostname (its public login
# redirect carries the team name and, as `kid`, the application AUD tag).
set -euo pipefail

VPS=${GEV_VPS:-ubuntu@15.204.118.186}
SSHKEY=${GEV_SSH_KEY:-$HOME/.ssh/oil_oracle_laptop_ed25519}
PROJECT=${GEV_MAPS_PROJECT:-gev-maps-12877}
HOST=${GEV_PUBLIC_HOST:-commodities.optaimum.com}

key_string() { # display name -> key string (never echoed)
  local name
  name=$(gcloud services api-keys list --project="$PROJECT" \
    --filter="displayName=\"$1\"" --format='value(name)' | head -n1)
  [ -n "$name" ] || { echo "no API key named \"$1\" in $PROJECT" >&2; return 1; }
  gcloud services api-keys get-key-string "$name" --project="$PROJECT" --format='value(keyString)'
}

LOC=$(curl -s -o /dev/null -I --max-time 20 -w '%{redirect_url}' "https://$HOST/")
TEAM=$(printf '%s' "$LOC" | sed -nE 's#^https://([a-z0-9-]+)\.cloudflareaccess\.com/.*#\1#p')
AUD=$(printf '%s' "$LOC" | sed -nE 's#.*[?&]kid=([0-9a-f]{64}).*#\1#p')
[ -n "$TEAM" ] && [ -n "$AUD" ] || { echo "no Access login redirect on https://$HOST/ (create the Access app first)"; exit 1; }

BK=$(key_string "GEV hosted browser key")
SK=$(key_string "GEV hosted server key")
[[ "$BK" =~ ^AIza[0-9A-Za-z_-]{35}$ ]] || { echo "browser key fetch failed"; exit 1; }
[[ "$SK" =~ ^AIza[0-9A-Za-z_-]{35}$ ]] || { echo "server key fetch failed"; exit 1; }

echo "== writing globe.env on the VPS"
{
  echo 'set -euo pipefail'
  echo 'F=/etc/gods-eye-view/globe.env'
  echo 'NEW=$(mktemp); T=$(mktemp /etc/gods-eye-view/.globe.env.XXXXXX)'
  echo "cat > \"\$NEW\" <<'EOF'"
  printf 'GOOGLE_MAPS_API_KEY=%s\n' "$BK"
  printf 'GOOGLE_MAPS_SERVER_API_KEY=%s\n' "$SK"
  printf 'GEV_ACCESS_TEAM=%s\n' "$TEAM"
  printf 'GEV_ACCESS_AUD=%s\n' "$AUD"
  echo 'GEV_RATELIMIT_GOOGLE_PER_MIN=30'
  echo 'GEV_RATELIMIT_OPENAI_PER_MIN=10'
  echo 'EOF'
  cat <<'REMOTE'
awk 'NR==FNR { i=index($0,"="); v[substr($0,1,i-1)]=substr($0,i+1); next }
     match($0, /^[A-Z0-9_]+=/) { k=substr($0,1,RLENGTH-1); if (k in v) { print k "=" v[k]; done[k]=1; next } }
     { print }
     END { for (k in v) if (!(k in done)) print k "=" v[k] }' "$NEW" "$F" > "$T"
chown --reference="$F" "$T"; chmod --reference="$F" "$T"
mv -f "$T" "$F"; rm -f "$NEW"
awk '/^(GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_SERVER_API_KEY|GEV_ACCESS_TEAM|GEV_ACCESS_AUD|GEV_RATELIMIT_GOOGLE_PER_MIN|GEV_RATELIMIT_OPENAI_PER_MIN|GEV_LICENCE_PROFILE)=/ { i=index($0,"="); printf "  %-30s %s\n", substr($0,1,i-1), (length(substr($0,i+1)) ? "set" : "EMPTY") }' "$F"
printf '  %-30s %s\n' "owner/mode" "$(stat -c '%U:%G %a' "$F")"
REMOTE
} | ssh -i "$SSHKEY" -o ConnectTimeout=20 "$VPS" 'sudo bash -s'

[ "${1:-}" = "--no-deploy" ] && { echo "skipped the deploy"; exit 0; }

echo "== gated deploy of origin/feat/commodities-shell (npm ci, four gates, build)"
ssh -i "$SSHKEY" -o ConnectTimeout=20 -o ServerAliveInterval=30 "$VPS" \
  'sudo /srv/gods-eye-view/repo/scripts/deploy-vps.sh origin/feat/commodities-shell'

echo "== anonymous check through Cloudflare (expect 302 to the login)"
curl -s -o /dev/null -I --max-time 20 -w '  / -> %{http_code}\n' "https://$HOST/"
