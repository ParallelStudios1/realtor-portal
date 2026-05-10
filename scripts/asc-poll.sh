#!/bin/bash
# Poll App Store Connect API for build processing status.
# When the latest build is VALID (processed), email Turner and exit.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin

KEY_ID='3ST6Z8D74J'
ISSUER_ID='907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8=/Users/turnerlogan/Downloads/AuthKey_3ST6Z8D74J.p8
APP_ID='6768115138'
LOG=/tmp/asc-poll.log
LAST_STATE_FILE=/tmp/asc-poll-last-state.txt

make_jwt() {
python3 - <<'PY'
import jwt, time, os
key = open(os.environ['P8']).read()
token = jwt.encode(
  {'iss': os.environ['ISSUER_ID'], 'exp': int(time.time())+1100, 'aud':'appstoreconnect-v1'},
  key, algorithm='ES256', headers={'kid': os.environ['KEY_ID']}
)
print(token if isinstance(token, str) else token.decode())
PY
}

send_email() {
  local subj="$1"
  local body="$2"
  /usr/bin/osascript - "$subj" "$body" <<'APPLE'
on run argv
  set subj to item 1 of argv
  set body to item 2 of argv
  tell application "Mail"
    set m to make new outgoing message with properties {subject:subj, content:body, visible:false}
    tell m to make new to recipient with properties {address:"turnerlogan@parallelstudios.co"}
    send m
  end tell
end run
APPLE
}

export KEY_ID ISSUER_ID P8

while true; do
  TS=$(date '+%Y-%m-%d %H:%M:%S')
  JWT=$(make_jwt 2>>"$LOG")
  if [ -z "$JWT" ]; then
    echo "[$TS] JWT generation failed" >> "$LOG"
    sleep 60
    continue
  fi
  RESP=$(curl -s -H "Authorization: Bearer $JWT" \
    "https://api.appstoreconnect.apple.com/v1/builds?filter%5Bapp%5D=$APP_ID&sort=-uploadedDate&limit=3")
  PARSED=$(printf '%s' "$RESP" | python3 -c '
import sys, json
try:
  d = json.load(sys.stdin)
  builds = d.get("data", [])
  if not builds:
    print("NONE||")
  else:
    b = builds[0]
    a = b.get("attributes", {})
    print(f"{a.get(\"processingState\",\"?\")}|{a.get(\"version\",\"?\")}|{b.get(\"id\",\"?\")}")
except Exception as e:
  print(f"ERR|{e}|")')
  PSTATE=$(echo "$PARSED" | cut -d'|' -f1)
  VERSION=$(echo "$PARSED" | cut -d'|' -f2)
  BID=$(echo "$PARSED" | cut -d'|' -f3)
  echo "[$TS] processingState=$PSTATE version=$VERSION id=$BID" >> "$LOG"

  LAST=""
  if [ -f "$LAST_STATE_FILE" ]; then LAST=$(cat "$LAST_STATE_FILE"); fi
  echo "$PSTATE" > "$LAST_STATE_FILE"

  if [ "$PSTATE" = "VALID" ]; then
    BODY="Build version $VERSION (build id $BID) is processed by Apple and ready for TestFlight.

Claude is now adding turnerlogan@parallelstudios.co as an Internal Tester.

TestFlight: https://appstoreconnect.apple.com/apps/$APP_ID/testflight/ios"
    send_email "[Realtor Portal] TestFlight build PROCESSED" "$BODY" >> "$LOG" 2>&1
    echo "[$TS] sent PROCESSED email -- exiting" >> "$LOG"
    exit 0
  fi

  if [ -n "$LAST" ] && [ "$LAST" != "$PSTATE" ]; then
    send_email "[Realtor Portal] ASC state -> $PSTATE" "Build $VERSION ($BID) at $TS" >> "$LOG" 2>&1
    echo "[$TS] state changed $LAST -> $PSTATE, emailed" >> "$LOG"
  fi

  sleep 90
done
