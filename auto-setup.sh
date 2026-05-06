#!/bin/bash
# Master automation script — runs every code/git/install step.
# Manual steps that need YOUR credentials are printed at the end.

set -e

cd ~/RealtorPortal

echo ""
echo "=========================================="
echo "  Realtor Portal — auto-setup"
echo "=========================================="
echo ""

# --- 1. Install Stripe in admin ---
echo "[1/5] Installing Stripe SDK in admin..."
cd ~/RealtorPortal/admin
npm install stripe --silent || npm install stripe

# --- 2. Make sure mobile peer deps are clean ---
echo ""
echo "[2/5] Verifying mobile deps..."
cd ~/RealtorPortal/mobile
npm install --legacy-peer-deps --silent 2>&1 | tail -5

# --- 3. Commit everything that's been edited ---
echo ""
echo "[3/5] Committing latest changes..."
cd ~/RealtorPortal
git add -A

if git diff --staged --quiet; then
  echo "      Nothing new to commit."
else
  git commit -m "Stripe billing, mobile auth fix, branded welcome, EAS config" || true
fi

# --- 4. Push to GitHub (Vercel auto-deploys) ---
echo ""
echo "[4/5] Pushing to GitHub..."
git push origin main

# --- 5. Print remaining manual steps ---
echo ""
echo "=========================================="
echo "  ✓ Code pushed. Vercel is rebuilding now."
echo "=========================================="
echo ""
echo "WHAT YOU STILL NEED TO DO YOURSELF (each ~1 min):"
echo ""
echo "1. SQL: Open Supabase SQL Editor, paste SETUP_PART_4.sql, Run."
echo "   File: ~/RealtorPortal/supabase/SETUP_PART_4.sql"
echo "   URL:  https://supabase.com/dashboard/project/epagiepzartckjqzbsxi/sql/new"
echo ""
echo "2. Supabase URL config: Set Site URL + Redirect URLs to your Vercel domain."
echo "   URL:  https://supabase.com/dashboard/project/epagiepzartckjqzbsxi/auth/url-configuration"
echo ""
echo "3. Stripe: Create products, copy price IDs, paste into Vercel env vars."
echo "   URL:  https://dashboard.stripe.com/test/products"
echo ""
echo "4. Stripe webhook: Add endpoint pointing to your Vercel /api/billing/webhook."
echo "   URL:  https://dashboard.stripe.com/test/webhooks"
echo ""
echo "5. EAS Build for TestFlight (requires Apple ID + 2FA):"
echo "   cd ~/RealtorPortal/mobile"
echo "   npm install -g eas-cli"
echo "   eas login"
echo "   eas init"
echo "   eas build --platform ios --profile preview"
echo "   eas submit --platform ios --latest"
echo ""
echo "Full walkthrough in: ~/RealtorPortal/MAKE-IT-WORK.md"
echo ""
