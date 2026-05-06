# Make It Work — single runbook to fix every issue

Follow this top-to-bottom. ~30 minutes. After this, you have:
- Web sign-up that actually emails branded confirmations
- Invite links that land on the branded `/welcome` page (NOT the home page)
- Working mobile signup/signin with proper realtor vs client routing
- Real Stripe billing — Checkout, webhook, automatic firm activation when paid
- A TestFlight build of the iOS app where deep links actually open the app

---

## 0. Push everything that's already coded

```bash
cd ~/RealtorPortal
git add .
git commit -m "Stripe billing, webhook, mobile auth fix, EAS config, branded welcome"
git push
```

Vercel will auto-redeploy. Wait for green check.

---

## 1. Apply the new SQL migration

[SETUP_PART_4.sql](computer:///Users/turnerlogan/RealtorPortal/supabase/SETUP_PART_4.sql) — adds `stripe_customer_id` and `stripe_subscription_id` columns the webhook needs.

Supabase → SQL Editor → paste → Run.

---

## 2. Fix the invite link landing page (the "goes to home page" bug)

This is a Supabase config issue. Supabase only redirects to URLs you've explicitly allowed; if `redirect_to=` doesn't match, it silently falls back to Site URL.

1. Supabase → **Authentication → URL Configuration**
2. **Site URL**: paste your Vercel production URL (e.g. `https://realtor-portal-xxx.vercel.app`) — no trailing slash
3. **Redirect URLs** (one per line, include both with the `**` wildcard):
   ```
   https://realtor-portal-xxx.vercel.app/**
   http://localhost:3000/**
   ```
4. **Save**

After this, invite emails will land on `/welcome?firm_id=...` with the firm's branding, not the home page.

---

## 3. Set up Stripe (real billing — ~10 min)

### 3a. Create products + prices in Stripe

1. https://dashboard.stripe.com → toggle to **Test mode** (top right) for now
2. **Products → + Add product**
   - Name: **Solo** | Pricing: $99 / month, recurring → **Save product**
   - Note the price ID (starts with `price_...`) — copy it
3. Repeat for **Team** ($299/mo) and **Brokerage** ($799/mo)

### 3b. Add Stripe env vars to Vercel

Vercel → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (Stripe → Developers → API keys → Secret key) |
| `STRIPE_PRICE_SOLO` | `price_...` from step 3a |
| `STRIPE_PRICE_TEAM` | `price_...` from step 3a |
| `STRIPE_PRICE_BROKERAGE` | `price_...` from step 3a |
| `STRIPE_WEBHOOK_SECRET` | (you'll get this in step 3c) |

Apply to **Production**, **Preview**, **Development**.

### 3c. Wire the webhook

1. Stripe → **Developers → Webhooks → + Add endpoint**
2. **Endpoint URL**: `https://realtor-portal-xxx.vercel.app/api/billing/webhook`
3. **Events to send**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. **Add endpoint** → click into the new endpoint → **Signing secret → Reveal** → copy the `whsec_...` value
5. Paste it back into Vercel env var `STRIPE_WEBHOOK_SECRET`
6. Vercel → **Deployments** → on the latest, click `…` → **Redeploy** (so the new env vars take effect)

### 3d. Test billing

1. Open `https://your-vercel-url/dashboard/billing`
2. Click **Subscribe** on the Team plan
3. Stripe Checkout opens — use test card `4242 4242 4242 4242`, any future expiry, any CVC, any zip
4. Submit → you bounce back to billing page with "Subscription started"
5. Refresh → status shows **Active**
6. Verify in Supabase: `firms.status` for your firm = `'active'`, `stripe_customer_id` and `stripe_subscription_id` populated

If anything breaks, Stripe → Webhooks → click the endpoint → **Recent deliveries** shows what failed.

---

## 4. Ship the iOS app to TestFlight

You have Apple Developer — let's use it. ~15 min for the first build.

### 4a. Install and log in to EAS

```bash
cd ~/RealtorPortal/mobile
npm install -g eas-cli
eas login
```

(Use your Expo account — sign up free at expo.dev if you don't have one.)

### 4b. Link the project

```bash
eas init
```

It'll ask "Would you like to create a project for @your-account/realtor-portal?" → **Yes**. This adds a project ID to `app.json`.

### 4c. Build for TestFlight

```bash
eas build --platform ios --profile preview
```

EAS will:
1. Ask for your Apple ID + password (one time)
2. Generate signing certificates and provisioning profile automatically
3. Queue the build on EAS servers (~10-15 min)
4. Email you when done with a download link

When done:

```bash
eas submit --platform ios --latest
```

This uploads to App Store Connect → TestFlight processing (~10 min). You'll get an email from Apple when it's ready to test.

### 4d. Add yourself as a tester

1. https://appstoreconnect.apple.com → **My Apps → Realtor Portal**
2. **TestFlight → iOS → Internal Testing → + (group)** → name "Internal" → add yourself by email
3. Open the **TestFlight** app on your iPhone (download from App Store if you don't have it)
4. Sign in with the same Apple ID
5. The app appears under "Available"
6. Install it

Now `realtorportal://` URLs open the app. The web invite flow works end-to-end:
- Email → `/welcome` (branded) → set password → "Open the app" button → app opens

---

## 5. Verify the full loop

1. Open `https://your-vercel-url` in Incognito Chrome
2. Sign up as a fresh realtor: firm = "Test Realty", email = `you+realtortest@example.com`
3. Check email — confirm the link → land on dashboard
4. **Dashboard → Branding** → upload logo, pick colors, save
5. **Dashboard → Clients → Invite client** → invite `you+clienttest@example.com`
6. Open that email on your iPhone (in Apple Mail or Gmail)
7. Tap "Accept invitation"
8. Lands on a fully-branded **/welcome** page in Safari
9. Set a password
10. Tap "Open the app →"
11. **Realtor Portal app opens** (the TestFlight build)
12. Email pre-filled, type the password, sign in
13. You're in the **client view** with the firm's logo and colors

Realtor side:
1. On Mac, `https://your-vercel-url/login` as the realtor
2. **Dashboard → Clients** — see the client you just invited
3. Click into them — see their deal, current phase
4. (You can also sign in as the realtor on TestFlight to test the **realtor view** on phone — different screens, can update phases, upload documents, etc.)

---

## 6. Stuff to know

### Trial expiry
- Every new firm gets `trial_ends_at = now() + 14 days`
- The dashboard shows a yellow banner with days remaining
- Once they pay (Stripe Checkout completes), webhook flips `status='active'`
- You can manually extend a trial: `update firms set trial_ends_at = now() + interval '30 days' where id = 'xxx';`

### What's NOT done yet (real talk)
- **Trial expiry doesn't actually block access.** It shows a banner. To gate after 14 days, add a check in middleware that redirects expired trials to /dashboard/billing. Let me know if you want this.
- **Push notifications** require the TestFlight build (Expo Go can't do them). The code is wired; once you're on TestFlight, they work.
- **Universal Links** (so `https://your-vercel-url/welcome` opens the app on iOS without going through Safari) require an `apple-app-site-association` file at the domain root. We can add this later — for v1, the `realtorportal://` scheme + a button on /welcome is fine.
- **App Store proper** (so anyone can search and download the app) requires submitting for App Store Review. TestFlight is enough until you have paying customers.

### When something breaks
- **Vercel build fails** → check Deployments → click the red X → look at the error. Most are TypeScript or missing env vars.
- **Webhook not firing** → Stripe → Webhooks → endpoint → Recent deliveries → click the red one → see the error response from Vercel.
- **Email goes to home page still** → confirm Supabase Site URL exactly matches your Vercel URL (no trailing slash, no http/https mismatch)
- **Mobile sign-in fails** → could be Supabase paused (free tier auto-pauses after 7 days idle). Go to Supabase dashboard, click "Restore project."

---

You should be at a working SaaS product after this. If anything errors, paste the exact error and I'll fix it.
