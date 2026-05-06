# Realtor Portal — Get Started

**This is the only doc you need to read.** Top-to-bottom in ~20 minutes you'll have:

- The marketing site + signup live at `http://localhost:3000`
- A real firm signed up through the web (no more god-mode admin needed)
- The mobile app running on your iPhone via Expo Go
- A working demo you can show your dad's realtor friends

---

## Prereqs

- macOS (you have this)
- Node 20+ (`node -v` to check, install with `brew install node` if missing)
- Watchman (`brew install watchman` — already done)
- Expo Go on your iPhone from the App Store
- A Supabase project (already created at `epagiepzartckjqzbsxi`)

---

## Step 1 — Run the SQL migrations

Open the Supabase dashboard for project `epagiepzartckjqzbsxi`:
https://supabase.com/dashboard/project/epagiepzartckjqzbsxi/sql/new

Paste each file's contents into a new SQL Editor query and click **Run**, in order:

1. `supabase/schema.sql` — base multi-tenant schema (run only once)
2. `supabase/migrations/0002_house_status_and_ratings.sql` — tours + ratings
3. `supabase/migrations/0003_self_serve_signup.sql` — self-serve signup RPC + branding columns

If a query errors with "relation already exists," that table is fine — skip to the next file.

---

## Step 2 — Disable email confirmation (for now)

In Supabase dashboard → **Authentication → Providers → Email**:

- Turn **"Confirm email"** OFF for now (we'll wire up Resend SMTP later)

This lets new firms sign up and immediately use their dashboard.

---

## Step 3 — Create the firm-assets storage bucket

In Supabase dashboard → **Storage**:

- Click **New bucket**, name it `firm-assets`, check **Public bucket**, click **Create bucket**

Then go back to the SQL Editor and paste this to add storage RLS:

```sql
create policy "public read firm assets" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'firm-assets');

create policy "auth users write firm assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firm-assets');

create policy "auth users update firm assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'firm-assets');
```

---

## Step 4 — Start the web app

Terminal A:

```bash
cd ~/RealtorPortal/admin
npm install
npm run dev
```

Open **http://localhost:3000** — you should see the marketing landing page.

Click **Start free trial** → fill in your firm name, name, email, password → you're now in your own firm dashboard. 🎉

The branding wizard runs after signup. Upload a logo, pick colors, save → you land on the dashboard.

---

## Step 5 — Get the mobile app on your phone

Terminal B (new tab, leave web running):

```bash
cd ~/RealtorPortal/mobile

# 5a) Nuke any prior install state
rm -rf node_modules package-lock.json .expo

# 5b) Bump file descriptor limit (avoids EMFILE crashes)
ulimit -n 65536

# 5c) Install with --legacy-peer-deps (works around React 18→19 transition)
npm install --legacy-peer-deps

# 5d) Start Metro in tunnel mode (works on any Wi-Fi)
npx expo start --tunnel --clear
```

Wait for the QR code. On your iPhone:

1. Open **Expo Go**
2. Tap **Scan QR code**
3. Point at the QR in the terminal
4. The app loads on your phone

Sign in with the same email/password you used for the web signup → you'll see the realtor view.

---

## Step 6 — Try the full loop

### As a realtor (web)
1. http://localhost:3000/dashboard/clients/new
2. Invite a fake client: `you+client1@yourdomain.com`
3. They get an email with a one-tap link

### As a client (mobile)
1. Open the email on your phone, tap the magic link
2. The app opens with the client signed in
3. They see your firm's branding (logo, colors)
4. They can view their deal, request a tour, leave a rating

---

## Troubleshooting

### "Cannot connect to server" on phone
- Make sure you're using `--tunnel` (not just `expo start`)
- Restart Expo Go on your phone
- Try a different network

### "Project SDK 51, ExpoGo SDK 54" error
- This is fixed — `package.json` is now SDK 54 (Expo `~54.0.0`, React `19.1.0`, RN `0.81.5`)
- If it persists, run Step 5a–5d again from a clean state

### `EMFILE: too many open files`
- `ulimit -n 65536` (Step 5b) handles this
- Watchman is also installed, which prevents Metro from polling

### Email confirmation not arriving
- Make sure Step 2 is done (turn off "Confirm email")
- Or check Supabase → Authentication → Logs for the email content

### Stripe billing buttons say "coming soon"
- Add Payment Link URLs to `admin/.env.local`:
  ```
  NEXT_PUBLIC_STRIPE_LINK_SOLO=https://buy.stripe.com/...
  NEXT_PUBLIC_STRIPE_LINK_TEAM=https://buy.stripe.com/...
  NEXT_PUBLIC_STRIPE_LINK_BROKERAGE=https://buy.stripe.com/...
  ```
- Restart `npm run dev`

### Logo upload fails
- The `firm-assets` bucket must exist (Step 3)
- The bucket must be Public

---

## What changed (so you know what's new)

- **Self-serve signup**: realtors create their own firm at `/signup`. No more god-mode admin manually creating firms.
- **Branding wizard**: 60-second flow to upload logo, pick colors, set tagline. Mobile app reads these.
- **Realtor dashboard**: clients list, invite flow, branding editor, billing, settings. All scoped to their firm via RLS.
- **Public landing page** at `/` with hero, features, pricing, CTA.
- **Welcome page** at `/welcome` for invited clients (sends them to App Store / Play Store).
- **Trial expiry**: every new firm gets 14 days free, tracked in `firms.trial_ends_at`. Top-banner shows days left.
- **Super-admin (you)** moved to `/superadmin` — view all firms across the platform.

---

## What's next (suggested order)

1. **Get a real signup**: have your dad invite one realtor to try `localhost:3000` (or deploy first, see below)
2. **Deploy to production**:
   - `admin/` → Vercel (`vercel --prod` from inside admin dir)
   - mobile → EAS Build for TestFlight (`npx eas build --platform ios --profile preview`)
3. **Wire up Stripe** Payment Links once you have one paying customer ready
4. **Set up Resend SMTP** in Supabase Auth → SMTP Settings (replaces the 4-emails-per-hour rate limit)

---

If you get stuck on any step, paste the exact error and I'll diagnose it.
