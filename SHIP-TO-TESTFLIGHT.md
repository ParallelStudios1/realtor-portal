# Ship to TestFlight + Real-Phone Deep Links — Runbook

This is the exact sequence to get the app on your iPhone via TestFlight, with email invites and website CTAs opening the app directly.

I (Claude) have already wired the code side:

- `mobile/app.json` → `ios.associatedDomains: ["applinks:realtor-portal-ten.vercel.app"]`
- `admin/app/.well-known/apple-app-site-association/route.ts` → AASA file served at the right URL
- `admin/app/.well-known/assetlinks.json/route.ts` → Android equivalent (for later)
- `admin/middleware.ts` → allows public access to `/.well-known/*`
- `admin/app/api/billing/checkout/route.ts` → hardened, never returns empty body
- `admin/.env.local` + Vercel → live Stripe keys
- Welcome page deep-links to `realtorportal://login` as a fallback

Everything below requires **your** Apple ID — Apple will not let me sign in for you.

## 1. Apple Developer membership ($99/yr)

1. Sign in with **your Apple ID** at https://developer.apple.com → Account → Membership.
2. Enroll if you haven't (one-time, ~24h to activate). Pick "Individual" unless you want the LLC on contracts.
3. After enrollment, copy the **Team ID** (10-char alphanumeric, e.g. `A1B2C3D4E5`).

## 2. Set the Team ID in two places

```bash
# (a) eas.json — replace the placeholder
sed -i '' "s/REPLACE_WITH_APPLE_TEAM_ID/<YOUR_TEAM_ID>/" ~/RealtorPortal/mobile/eas.json
```

```text
# (b) Vercel — Project Settings → Environment Variables → add:
APPLE_TEAM_ID = <YOUR_TEAM_ID>
```

Save → Vercel auto-redeploys → AASA file now contains the real `<TeamID>.com.parallelstudios.realtorportal`.

Verify the file:

```bash
curl -s https://realtor-portal-ten.vercel.app/.well-known/apple-app-site-association | jq .
# Should include "appID": "<YOUR_TEAM_ID>.com.parallelstudios.realtorportal"
```

## 3. App Store Connect entry

1. Go to https://appstoreconnect.apple.com → My Apps → **+** → New App.
2. Platform: iOS. Name: `Realtor Portal`. Primary language: English (U.S.). Bundle ID: select `com.parallelstudios.realtorportal` (you'll need to register it in https://developer.apple.com/account → Identifiers if Apple doesn't auto-list it).
3. SKU: anything unique, e.g. `realtor-portal-1`.
4. Save. Copy the **App ID** (numeric, ~10 digits) from the URL or the App Information page.

```bash
# Set in eas.json
sed -i '' "s/REPLACE_WITH_APP_STORE_CONNECT_APP_ID/<YOUR_APP_ID>/" ~/RealtorPortal/mobile/eas.json
```

## 4. EAS Build → TestFlight

From `~/RealtorPortal/mobile`:

```bash
# First build of production iOS — Apple will prompt you for your Apple ID + 2FA
eas build --platform ios --profile production
```

This produces a `.ipa` and uploads it to EAS. Watch the link it prints — it goes to https://expo.dev/accounts/parallelstudios/projects/realtor-portal/builds.

When it's done:

```bash
eas submit --platform ios --latest
```

This uploads to App Store Connect → TestFlight processing (~5-15 min).

Then in App Store Connect → TestFlight:

1. Wait for the build to switch from "Processing" to "Ready to Submit".
2. Add yourself as an **Internal Tester** (Users and Access → Add → invite `turnerlogan@parallelstudios.co`).
3. Add the build to your internal test group.
4. Open the **TestFlight** app on your iPhone with that Apple ID — your build appears, tap Install.

## 5. Verify deep links on your iPhone

After TestFlight install:

1. Open Mail on your phone. Send yourself an email from another account with a link to `https://realtor-portal-ten.vercel.app/welcome?firm_id=<any-uuid>`.
2. Tap the link → should open the **app** directly, not Safari. If it opens Safari, the AASA file isn't being read — usually means the `APPLE_TEAM_ID` env var isn't set or the app needs a fresh install (iOS caches AASA per-app per-install).
3. From Safari on the phone, navigate to `https://realtor-portal-ten.vercel.app/welcome` → a "smart banner" prompts to open in the app.

Apple validates AASA on each install — if you change the file, you have to reinstall the app for changes to apply.

## 6. After it works — the actual product invite flow

Your existing invite email (Supabase Auth) sends users to `/welcome` after verifying their token. Once Universal Links are live:

- iPhone Mail tap on the invite link → opens the app (already signed in) → routes by role.
- Android tap → opens the app (after the assetlinks.json is wired with the SHA-256 cert fingerprint, see step 7).
- Desktop / not-installed → falls through to the web welcome page with "Get the App" buttons.

## 7. Android equivalent (optional, after iOS works)

```bash
cd ~/RealtorPortal/mobile
eas credentials -p android  # prints the SHA-256 fingerprint
```

Add to Vercel:

```text
ANDROID_SHA256_FINGERPRINT = AB:CD:EF:...   (the hex, with colons)
```

Vercel redeploys → `assetlinks.json` is now valid → the Android app verifies on install.

```bash
eas build --platform android --profile production
eas submit --platform android --latest
```

(Google Play has its own first-time setup; ignore until iOS is solid.)

## What to do if anything blocks

- `eas build` complains about credentials → say **yes** when it offers to manage them for you. EAS can generate the iOS distribution certificate and provisioning profile.
- The AASA fetch fails on `https://app-site-association.cdn-apple.com` — that's Apple's validator, ignore. Only your phone's actual fetch matters.
- TestFlight build is "Missing Compliance" → in App Store Connect, mark the build "Does not use cryptography in a way that's not exempt" (we already set `ITSAppUsesNonExemptEncryption: false`).

When you have your Team ID + ASC App ID and have run `eas build`, ping me and I'll watch the build, retry submit on the inevitable transient failure, and verify the AASA file resolves.
