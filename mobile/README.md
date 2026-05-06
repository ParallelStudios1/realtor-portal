# Realtor Portal — Mobile App

React Native + Expo cross-platform app. Same codebase ships on iOS and Android.

## Quick start (≈10 min)

### 1. Prereqs

- Node 20+ (`brew install node` if you don't have it)
- Expo Go app on your phone (App Store / Play Store) **or** an iOS simulator (Xcode) / Android emulator (Android Studio).

### 2. Set up

```bash
cd ~/Desktop/.../RealtorPortal/mobile     # or wherever you keep the folder
cp .env.example .env
# Open .env and paste your Supabase URL + anon key (get them from supabase.com → Project Settings → API)
npm install
```

### 3. Run

```bash
npx expo start
```

A QR code appears in the terminal. Scan with Expo Go on your phone, or press `i` for iOS simulator / `a` for Android emulator.

The app reloads on every save. Errors show as a red box on the device.

## What you should see

1. First launch → login screen with the firm's brand color and logo (default while not authenticated).
2. Sign up → creates a `users` row with role `client` by default.
3. To act as a realtor or get associated with a firm: open Supabase → Table Editor → `users` → set your `firm_id` and `role` per the comments in `supabase/seed.sql`.
4. Re-open the app: navigation routes you into either `(client)` or `(realtor)` based on role.

## Folder layout

```
mobile/
├── app/                 ← Expo Router file-based routes
│   ├── _layout.tsx      ← root: Query / Auth / Theme providers, role-based routing
│   ├── (auth)/          ← login, signup
│   ├── (client)/        ← home, houses, activity, messages, documents
│   └── (realtor)/       ← clients list, client detail, upload doc, add date, settings
├── components/          ← shared UI
├── lib/                 ← supabase client, auth/theme contexts, queries, mutations,
│                          notifications, types, formatters
├── package.json
├── app.json             ← Expo config (bundle ids, plugins, scheme)
├── tsconfig.json
├── babel.config.js
└── .env.example         ← copy to .env, fill in
```

## What's working in v1

- **Auth**: email + password sign up / sign in via Supabase Auth.
- **Theme**: pulls firm logo + colors at runtime. To swap firms, just change a user's `firm_id`.
- **Client side**: home dashboard, houses list, activity feed, messages, documents (PDF viewer in WebView).
- **Realtor side**: clients list, client detail with phase stepper + edit, add important date, upload PDF document.
- **Storage**: PDFs upload to Supabase Storage `documents` bucket, paths scoped by firm.

## What's stubbed (look for `TODO(v1.1):` in code)

- Push notifications: Expo push token registration is wired, but server-side fan-out on activity insert is not. v1 falls back to "if the user has the app open, queries refetch on focus."
- Realtor "New Client" creation flow: for v1, create searches via Supabase dashboard. The clients tab will list them once they exist.
- House add UI: the `useAddHouse` mutation exists but no screen wires it up. Houses can be inserted via Supabase dashboard for v1.
- DocuSign: out of scope for v1. PDFs are static.
- Real-time message subscription: messages refetch on send; live subscription via Supabase realtime is a v1.1 polish.

## Common errors

- **"Invalid API key"** → wrong Supabase keys in `.env`. Anon key, not service role.
- **"relation 'users' does not exist"** → you didn't run `supabase/schema.sql` yet. Do that first.
- **PDF doesn't open** → check `documents` bucket policies in Supabase. The bucket must allow signed URLs for the firm's users.
- **Photo library access denied** → iOS sim only. Test on a real device or enable in simulator settings.

## Building for TestFlight / Play Store

When ready (after first paying firm asks):

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios       # builds via EAS, uploads to App Store Connect
eas build --platform android   # produces an .aab for Play Console
```

Costs nothing on Expo's free tier (~30 builds/month). Apple's $99/year is required for TestFlight.

## Stack docs

- Expo Router — https://docs.expo.dev/router/introduction/
- Supabase JS — https://supabase.com/docs/reference/javascript/introduction
- TanStack Query — https://tanstack.com/query/v5/docs/react/overview
