#!/bin/bash
# One-command deploy for Realtor Portal.
#
#   ./scripts/deploy.sh           — web + iOS (production)
#   ./scripts/deploy.sh ios       — iOS only
#   ./scripts/deploy.sh android   — Android only
#   ./scripts/deploy.sh web       — push to main (web only)
#   ./scripts/deploy.sh all       — web + iOS + Android
#
# What it does:
#   1. Clears any stale .git/index.lock
#   2. Commits everything pending and pushes to main (web auto-deploys via Vercel)
#   3. Kicks `eas build --profile production --auto-submit` for the requested
#      mobile target. iOS lands on TestFlight; Android lands in Play Internal.
#
# Requires (on your Mac):
#   - eas-cli logged in (npm i -g eas-cli && eas login)
#   - git push working to GitHub
#   - For Android: ~/Downloads/google-play-service-account.json (see notes
#     at the bottom of this file for how to create one).

set -e
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-default}"

cd "$ROOT"

log() { printf "\033[1;34m›\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; }

# ---------- 1. Release any stale git lock ----------------------------------
if [ -f .git/index.lock ]; then
  log "Removing stale .git/index.lock"
  rm -f .git/index.lock || true
fi

# ---------- 2. Commit + push (web auto-deploys via Vercel) -----------------
if [ "$TARGET" = "default" ] || [ "$TARGET" = "web" ] || [ "$TARGET" = "all" ]; then
  log "Staging changes"
  git add -A

  if git diff --cached --quiet; then
    log "Nothing new to commit — pushing existing main"
  else
    MSG="${COMMIT_MSG:-deploy: ship pending changes}"
    log "Committing: $MSG"
    git commit -m "$MSG"
  fi

  log "Pushing to origin/main (Vercel will auto-deploy the web app)"
  git push origin main
fi

# ---------- 3. Mobile builds ------------------------------------------------
build_ios() {
  log "Kicking iOS production build + TestFlight submit"
  cd "$ROOT/mobile"
  npx eas-cli build --platform ios --profile production --non-interactive --auto-submit
}

build_android() {
  log "Kicking Android production build + Play Internal submit"
  cd "$ROOT/mobile"
  if [ ! -f /Users/turnerlogan/Downloads/google-play-service-account.json ]; then
    warn "Missing google-play-service-account.json — building without auto-submit"
    warn "Drop the JSON at: /Users/turnerlogan/Downloads/google-play-service-account.json"
    npx eas-cli build --platform android --profile production --non-interactive
  else
    npx eas-cli build --platform android --profile production --non-interactive --auto-submit
  fi
}

case "$TARGET" in
  default|ios)
    build_ios
    ;;
  android)
    build_android
    ;;
  web)
    log "Web push done. Watch your deploy at https://vercel.com/dashboard"
    ;;
  all)
    build_ios
    build_android
    ;;
  *)
    err "Unknown target: $TARGET"
    err "Usage: $0 [web|ios|android|all]"
    exit 2
    ;;
esac

cd "$ROOT"
log "Done. Track builds: https://expo.dev/accounts/parallelstudios/projects/realtor-portal/builds"

# ---------- Android setup notes (one-time) ---------------------------------
#
# To enable auto-submit to Google Play Internal track:
#   1. Go to Google Play Console → Settings → Developer account → API access
#   2. Create a service account in Google Cloud (Owner role on Play Console)
#   3. Download the JSON key, save it as:
#        /Users/turnerlogan/Downloads/google-play-service-account.json
#   4. In Play Console, grant that service account "Release manager" permissions
#      and link your app
#   5. Re-run: ./scripts/deploy.sh android
#
# If you don't want to set up Android yet, run only `./scripts/deploy.sh ios`.
