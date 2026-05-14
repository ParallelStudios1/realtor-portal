#!/bin/bash
# Run /tmp/eas-loop.sh repeatedly. After each successful submit, check
# whether the latest origin/main commit is newer than the one we just
# built; if so, run again. If no new work, exit cleanly.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
LOG=/tmp/eas-supervisor.log
cd /Users/turnerlogan/RealtorPortal

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

LAST_BUILT_SHA=""

while true; do
  git fetch origin main --quiet 2>>"$LOG"
  HEAD_SHA=$(git rev-parse origin/main 2>>"$LOG")
  if [ "$HEAD_SHA" = "$LAST_BUILT_SHA" ]; then
    log "No new commits since $LAST_BUILT_SHA — supervisor exiting."
    exit 0
  fi
  log "Kicking eas-loop for $HEAD_SHA"
  /tmp/eas-loop.sh
  RC=$?
  log "eas-loop exited rc=$RC"
  if [ "$RC" -ne 0 ] && [ "$RC" -ne 1 ]; then
    log "eas-loop hit unrecoverable error — supervisor exiting."
    exit "$RC"
  fi
  LAST_BUILT_SHA="$HEAD_SHA"
  sleep 5
done
