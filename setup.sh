#!/bin/bash
# Realtor Portal — one-shot setup
# Run with:  bash ~/RealtorPortal/setup.sh

set -e

cd ~/RealtorPortal

echo ""
echo "=========================================="
echo "  Realtor Portal — Setup"
echo "=========================================="
echo ""

# Bump file descriptors so Metro doesn't crash
ulimit -n 65536 2>/dev/null || true

# --- 1. Admin web ----------------------------------------------------------
echo "[1/3] Installing admin web app..."
cd ~/RealtorPortal/admin
if [ ! -d node_modules ]; then
  npm install
else
  echo "      already installed, skipping"
fi
echo ""

# --- 2. Mobile app ---------------------------------------------------------
echo "[2/3] Installing mobile app (this is the slow one — ~2 min)..."
cd ~/RealtorPortal/mobile

# Wipe stale state from prior attempts
rm -rf node_modules package-lock.json .expo

# Install with legacy peer deps to bypass React 18→19 transition
npm install --legacy-peer-deps

echo ""
echo "[3/3] Done. Next:"
echo ""
echo "  TAB 1 — Admin web:"
echo "    cd ~/RealtorPortal/admin && npm run dev"
echo "    Then open http://localhost:3000"
echo ""
echo "  TAB 2 — Mobile app in iOS Simulator (no phone needed):"
echo "    cd ~/RealtorPortal/mobile && ulimit -n 65536 && npx expo start --ios"
echo ""
echo "  Or for your phone (only if not on school WiFi/VPN):"
echo "    cd ~/RealtorPortal/mobile && ulimit -n 65536 && npx expo start --tunnel"
echo ""
