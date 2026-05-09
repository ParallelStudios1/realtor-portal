#!/bin/bash
TOKEN=$(python3 -c 'import json; d=json.load(open("'"$HOME"'/.expo/state.json")); print(d.get("auth",{}).get("sessionSecret",""))')
echo "TOKEN_LEN: ${#TOKEN}"
curl -s "https://api.expo.dev/v2/projects/2ec40b9d-760a-4b14-81eb-8de0f06e9fdb/builds/b90f2b50-2888-42f7-a75f-67cf6ad3c82a" \
  -H "Expo-Session: $TOKEN" 2>&1 | head -100
