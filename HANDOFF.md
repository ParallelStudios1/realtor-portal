# HANDOFF — Realtor Portal & Turner Logan

**Audience:** the next AI assistant continuing Turner's work.
**Goal:** the conversation should feel like he never switched models. You should know everything I know.
**Last updated:** 2026-07-01 (Cowork mode). Supersedes the 2026-05-30 version; durable behavioral/credential context from that version is preserved below and reconciled with current state.

> **Read order:** sections 0–3 are mandatory before you write a single line of code or respond. Sections 4–9 are the current technical ground truth. Sections 10–13 are footguns, history, and live state. Section 14 is the message Turner will paste to start you.

---

## 0. The first thing you should know (who Turner is)

Turner Logan is a **teenage solo founder** running **Parallel Studios LLC**. He has built Realtor Portal almost entirely by directing AI agents over months. **He cannot code most of this himself** — he knows some Java, Python, HTML, SwiftUI, and uses voice dictation heavily. That means:

- Messages are short, often ALL CAPS for urgency, with frequent typos ("reqaltor", "super bass" = Supabase, "dispach", "perfefct", "backj").
- He is bluntly impatient: "DO IT YOURSELF", "JUST MAKE IT WORK", "don't get back to me until it's done". **Don't take it personally. Don't grovel. Don't apologize twice.**
- He treats you as a colleague and full delegate. He does NOT want clarifying questions on small things — just ship. But he does want pushback on bad ideas: *"I don't want a yes man."*
- He gets frustrated when the same bug reappears. If you fix something he's complained about more than once, **test it end-to-end yourself before declaring victory.**
- His GTM is real: his family is connected to real-estate/legal (his dad is a real-estate attorney with a warm-lead pipeline). The product is **white-label** so each firm rebrands the same SaaS as its own.

Match his energy: **short, direct, no preamble.** Lead with the fix, then only load-bearing explanation.

---

## 1. Standing permissions Turner has granted (verbatim, treat as authorized)

- *"you have access to my Twilio ... so do whatever"*
- *"you have access to my whole computer terminal and everything. Do whatever you can to make this work perfectly."*
- *"always deploy without asking everywhere"*
- *"you have terminal abilities, do it yourself"* / *"You will do the coding, not me"*
- He has pasted live Stripe keys, the Supabase service-role JWT, Apple Developer creds, Outlook M365 access, DocuSign creds, and Vercel scope. **Treat all of these as already authorized.**
- He'll paste an error and expect action, not questions. Fix it.

**Hard limits still respected** (policy + sense): don't move money on his behalf; don't send messages from his accounts to third parties without confirming recipient + body; don't enter his passwords into third-party sites (don't log into Twilio/Google/Apple/Supabase/Vercel/GoDaddy for him — if a step needs a human login, stop and tell him to do it). He understands these and hasn't pushed back.

---

## 2. How I work (so you can match)

- **Multi-agent by default.** For anything bigger than a one-file edit, dispatch parallel sub-agents via the `Agent` tool (research → plan → code → QA, or fan-out one agent per independent bug/file domain, launched in a single message so they run concurrently). Turner expects this. This very handoff was built by fanning out three Explore/general agents to capture repo, DB, and deploy ground truth.
- **Web builds + all git/EAS/Vercel CLI run on Turner's Mac, not the Linux sandbox** (the sandbox is out of disk). Drive the Mac shell via the Control-your-Mac osascript tool:
  ```
  export PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH; cd ~/RealtorPortal/admin; rm -rf .next; npx next build
  ```
  Node lives at `$HOME/.nvm/versions/node/v20.19.4/bin`.
- **Deploy web via git push:** `cd ~/RealtorPortal; git add -A; git commit -m "..."; git push origin main` → Vercel auto-deploys from `main`.
- **Deploy mobile via EAS (on the Mac):** `cd ~/RealtorPortal/mobile; npx eas-cli build --platform ios|android --profile production --auto-submit --non-interactive --no-wait`. iOS → TestFlight; Android → Play internal. First Android release must be rolled out once by hand in Play Console.
- **Database via the Supabase MCP** (`mcp__...__execute_sql`, `mcp__...__apply_migration`); service-role bypass is fine for ops. **Always also write the applied migration as a numbered `.sql` in `supabase/migrations/` and commit it** — the repo is the source of truth.
- **Browser verification via the Claude-in-Chrome MCP** (`mcp__claude-in-chrome__*`) — DOM-aware, faster than pixel-clicking; use it to reproduce UI bugs live before assuming. Computer-use is the fallback for native apps.
- **TaskCreate/TaskUpdate aggressively** — Turner sees the task list as a widget. Don't delete history; mark `completed` only when shipped, not when "ready"; include a verification step.
- **Always clean up test/QA data** you create.

---

## 3. Hard rules — never break these

1. Never enter Turner's credentials/passwords into third-party sites on his behalf.
2. **Never delete Eric's real listing "5780 N Hillbrooke Trace"** (Johns Creek GA) — it's live production data, not a test row. (Also the LLC's registered address; registered agent Eric Logan.)
3. **Flat-ink design only** — no gradients, no emojis, no glassmorphism. Inter font. `ink-*` neutrals on web; brand color only in per-firm branding. (He demanded a full "de-AI" pass; he has zero tolerance for AI-feeling UI. Use colored dots instead of 🏠, etc.)
4. **No payments inside the mobile app** (Apple rule) — mobile links out to web billing.
5. **Web builds run on the Mac**, not the Linux sandbox.
6. **Feature parity:** anything on web must also exist on mobile (customized for buyer vs. seller), and vice-versa. He has repeated "ALL FEATURES FROM WEB NEED TO BE ON MOBILE."
7. Keep the repo the source of truth for the DB (commit every applied migration).

---

## 4. The product

White-label multi-tenant SaaS for real-estate firms; each firm rebrands the same app under its own logo/colors/name. Two front ends, one Supabase backend.

- **Web** (`admin/`, Next.js 14 App Router) — realtors, firm admins, attorneys, and clients all use role-gated routes. Prod at `realtorportal.parallelstudios.co` (custom domain) and alias `realtor-portal-ten.vercel.app`.
- **Mobile** (`mobile/`, Expo SDK 54, RN 0.81) — TestFlight + Play, version **0.1.3**, both client and realtor/attorney experiences.

What it does: a realtor signs up and creates a branded firm; adds buyer/seller clients; each client has "deals" (`client_searches`) that move through phases searching → awaiting_offer → offer_made → counter_offer → under_contract → closing → closed. Per deal: houses + ratings, tours/showings, important dates (with completion + reminders), documents (folders, private storage), messages (group + private DMs), deal participants (co-realtor, attorney, lender, inspector, etc.), financials, e-sign, an interactive calendar, phase-celebration popups, and email/SMS/push notifications. Billing: Solo $99 (1 seat) / Team $299 (10) / Brokerage $799 (50), seat caps enforced. Public AVM seller-lead funnel at `/value/[firmSlug]`. Broker analytics dashboard. Cross-firm collab (guest realtors invited into another firm's deal). Attorney read-only portal. First-class branded invites at `/invite/[token]`. Store-compliance: block/report, EULA, in-app + public account deletion.

---

## 5. Repository layout

Root: `/Users/turnerlogan/RealtorPortal` (git repo; remote `github.com/ParallelStudios1/realtor-portal`, private, default branch `main`; push → Vercel auto-deploy).

```
RealtorPortal/
├── admin/                  Next.js 14 web app (Vercel; root dir = admin/)
│   ├── app/                App Router routes (pages + api/*/route.ts)
│   ├── components/         Shared client components
│   ├── lib/                Server helpers (supabase, email, sms, plans, etc.)
│   ├── e2e/                Playwright smoke tests
│   ├── middleware.ts       Route gating + cookie refresh
│   └── vercel.json         Cron: /api/cron/daily 13:00 UTC, /api/cron/drips 14:00 UTC
├── mobile/                 Expo / React Native (iOS + Android)
│   ├── app/                expo-router screens ((auth)/(client)/(realtor))
│   ├── components/         RN components
│   └── lib/                auth, supabase, theme, api, queries, mutations
├── supabase/
│   ├── schema.sql          Base schema (pre-numbered)
│   ├── seed.sql
│   └── migrations/         0002 → 0057
├── README.md  ARCHITECTURE.md  BUILD_PLAN.md  PITCH.md  MONETIZATION.md
└── HANDOFF.md              ← you are here
```

### 5.1 Web highlights
- **Routes:** `/dashboard/*` (clients, deals, contacts, messages, billing, firm, settings, branding, tours, analytics, oversight, tools/net-sheet, inbox), `/client/*`, `/attorney/*`, `/superadmin/*`, `/onboarding`, `/welcome/*`, `/invite/[token]`, `/feedback/[token]`, `/deal/[id]`, `/value/[firmSlug]`, legal (`/privacy`, `/terms`, `/sms-consent`, `/delete-account`).
- **Deal workspace:** `admin/app/dashboard/deals/[id]/DealWorkspace.tsx` + panels (`SellerListingPanel`, `ShowingFeedbackPanel`, `EsignPanel`, `SubphaseEditor`, `TerminateDealControl`, `ExtractReview`).
- **API routes** (all gated by `resolveCaller()` in `admin/lib/bearerAuth.ts`): `auth/signup`, `clients/invite`, `participants/add`, `deals/[id]/{chat,phase,agree-house}`, `dates/complete`, `calendar/[searchId]`, `calendar/event/[id]`, `showings/feedback`, `docusign/{create,refresh,manual-link,webhook}`, `documents/{sign-url,notify}`, `notifications/{send-push,send-email}`, `billing/{checkout,webhook}`, `ai/{listing-description,contract-extract}`, `cron/{daily,drips}`, `moderation/{report,block}`, `account/{delete,delete-request}`, `firm/members[/manage]`, `og/house/[id]`.
- **Key components:** `CalendarView.tsx` (month grid, dot markers, NO emojis), `DealChat`, `DealProgressTimeline`, `PrivateMessages`, `AgreedHomeCard`, `LocalDateTime` (hydration-safe), `Toast`, `PendingButton`, `NavigationProgress`.
- **Key lib:** `bearerAuth.ts` (read first), `supabaseServer.ts` (service-role, RLS bypass, server only), `supabaseSsr.ts` (`getMe()` RPC), `supabaseBrowser.ts`, `plans.ts`, `planGate.ts` (`canUsePremiumForDeal`), `sms.ts` (Twilio REST), `email.ts` (Resend→SMTP→no-op), `notify.ts`, `dealEmail.ts`, `dealKind.ts`, `partyPermissions.ts`, `ics.ts`, `docusign.ts`, `audit.ts`, `humanError.ts`.

### 5.2 Mobile highlights
- **Route groups:** `(auth)` login/signup; `(client)` index/home, houses + houses/[id], activity, messages, deal-chat, documents, profile; `(realtor)` index, clients + clients/[id] (+ houses/[houseId], add-house, add-party, add-date, phase, under-contract, financials, attorney, docusign, deal-chat, alert, upload), messages, oversight, firm, settings, invite; plus `welcome.tsx`, `invite/[token].tsx`. Root `_layout.tsx` wires QueryClient + Auth + Theme + Toast and routes by role.
- **Key components:** `CalendarView.tsx`, `DealInfo.tsx` (contains `TourRequestsCard` with reschedule-on-accept + `FinancialsCard` showing buyer's target offer), `Moderation.tsx` (block/report), `PhaseStepper`, `MilestoneCelebration`, `Stars`, `TrialBanner`.
- **Key lib:** `auth.tsx`, `supabase.ts` (AsyncStorage-persisted), `theme.tsx` (runtime firm branding), `api.ts` (`apiFetch()` → web API with Bearer; base `EXPO_PUBLIC_API_URL` || `https://realtorportal.parallelstudios.co`), `queries.ts` (`useActivities` joins actor for real names), `mutations.ts` (`useUpdateTourRequest` supports confirmed-when), `dealKind.ts`, `houseStatus.ts`, `format.ts`, `notifications.ts`.

---

## 6. Database (Supabase `epagiepzartckjqzbsxi`, us-west-2, Postgres 17)

- **URL** `https://epagiepzartckjqzbsxi.supabase.co`. RLS on everywhere; service-role bypasses. Helper fns: `current_firm_id()`, `current_user_email()`, `current_role()`, `is_staff_role()` (realtor/firm_admin/super_admin/owner/manager/agent), `is_firm_admin()`, `can_collab_on_search()`, `is_deal_participant()`. Storage buckets: `client-docs` (private, `{firm_id}/{search_id}/{ts}-{name}`), `house-photos` (public).
- **Migrations:** `supabase/migrations/0002_*` → `0057_*`. **No 0001** — base schema (firms, users, client_searches, houses, messages, activities, documents, important_dates + helpers) is in `schema.sql`. Purpose index in §6.2.
- **Core tables:** `firms`, `users`, `client_searches` (the deal), `houses`, `messages` (group + private DM cols), `activities`, `documents`, `important_dates`, `tour_requests`, `house_ratings`, `showings`, `showing_feedback`, `deal_participants`, `deal_invites`, `firm_invites`, `firm_contacts`, `listing_offers` (seller side), `esign_envelopes`, `contract_extractions`, `checklist_templates`/`deal_checklist_items`/`deal_approvals`, `date_reminders`/`date_reminder_runs`, `scheduled_messages`, `audit_log` (append-only), `user_blocks`/`content_reports`, `push_tokens`, `user_deal_views`.
- **Enums:** `deal_phase` (searching, awaiting_offer, offer_made, counter_offer, under_contract, closing, closed); `house_status` (interested, tour_requested, toured, offered, passed); `tour_request_status` (pending, confirmed, declined, cancelled); `party_role`; `user_role` (super_admin, realtor, client, firm_admin, attorney, owner, manager, agent). `houses.listing_status` and `listing_offers.status` are **text + CHECK**, not enums.
- **Data scale:** dev/demo — ~30 firms, 14 users, 8 deals, 4 houses. Many feature tables built but empty.

### 6.1 The automation triggers — the heart of "statuses change automatically" (VERIFIED WORKING this session)

All SECURITY DEFINER; use `_phase_ord()` (searching=0 … closed=6) so phases move **forward only**.

Buyer side:
- `client_searches` BEFORE UPDATE → `_auto_advance_phase()` (0054): offer_house_id first set → `awaiting_offer`; offer_amount →>0 → `offer_made`; counter_offer_amount →>0 → `counter_offer`; closing_date + closing_amount set → `closing`.
- `client_searches` AFTER UPDATE → `_house_status_on_phase()` (0056 made it fire on ANY update so it catches auto-advanced phases): phase becomes `offer_made` + offer house set → that house `offered`.
- `tour_requests` AFTER INSERT → `_house_status_on_tour_request()`: house `interested` → `tour_requested`. AFTER UPDATE → `_house_status_on_tour_confirm()`: on `confirmed`, house → `toured` (this makes the buyer rating prompt appear — the "does nothing" complaint root cause).

Seller side (0049 + 0057):
- `houses` AFTER INSERT → `_auto_agree_seller_listing()`: first house on a `kind='seller'` deal becomes the agreed listing.
- `houses` AFTER UPDATE → `_seller_phase_on_listing_status()`: listing active → `awaiting_offer`, under_contract → `under_contract`, sold → `closed` (seller deals only).
- `listing_offers` AFTER INSERT → `_seller_phase_on_offer_insert()`: → `offer_made`. AFTER UPDATE → `_seller_phase_on_offer_status()`: accepted → `under_contract` (+ house listing_status under_contract); countered → `counter_offer`.

Both chains tested end-to-end on throwaway fixtures; fixtures deleted.

### 6.2 Migration purpose index (0002–0057)

0002 house_status+ratings+tour_requests · 0003 self-serve signup RPCs+branding/trial · 0004 buyer/seller signup + `kind` · 0005 client-docs bucket · 0006 house-photos bucket · 0007 tour_request_status · 0008 demo seed · 0009 attorney/co-realtor/docusign fields · 0010 relax FKs for deletion · 0011 firm_admin as staff · 0012 realtime publication · 0013 deal financials · 0014 attorney role · 0015 deal_participants+party_role · 0016 counter_offer phase+doc folders · 0017 cross-firm participant write · 0018 safe user deletion · 0019 principal client activity writes · 0020 owner/manager/agent roles · 0021 firm hierarchy · 0022 seen-phase tracking · 0023 invite acceptance+offer amounts · 0024 phase overrides+SMS drips · 0025 extend pre-delete cleanup · 0026 event details+offer_house_id · 0027 nullable client on deal · 0028 firm_contacts · 0029 private party messages · 0030 showings · 0031 deal_invites · 0032 plan_tier · 0033 deadline reminders · 0034 showing feedback · 0035 audit log · 0036 compliance(checklists/approvals) · 0037 esign envelopes · 0038 contract extractions · 0039 participant represents · 0040 fix deal_participants RLS recursion · 0041 two-sided deal house-seller+scoping · 0042 house↔listing link · 0043 house agreement stamp · 0044 deal created_by · 0045 subphase+house proposal+participant visibility · 0046 awaiting_offer phase value · 0047 seller listing workflow+listing_offers · 0048 drop fragile pre-delete trigger · 0049 auto-agree seller listing · 0050 allow firm-less detached client · 0051 trial reminder idempotency · 0052 moderation blocks/reports · 0053 auto house-status lifecycle · 0054 auto-advance deal phase · 0055 buyer_desired_offer · 0056 phase→house-status on any update · 0057 seller-side auto-advance.

---

## 7. External services + credentials

- **Supabase:** project `epagiepzartckjqzbsxi` (`realtor-portal-prod`, us-west-2). Access via Supabase MCP (`execute_sql`, `apply_migration`; pass project_id). Code: `admin/lib/supabaseServer.ts` (service-role), `mobile/lib/supabase.ts` (anon).
- **Vercel:** org `parallelstudios1s-projects` (team `team_qlhRbznUtqXHRZFtJj6qSsEC`), project `realtor-portal` (`prj_UvaVOTWT1KeXZn4mpHuQ7qNUmYld`), root dir `admin/`, prod alias `realtor-portal-ten.vercel.app`. Prefer CLI on the Mac over the Vercel MCP (MCP has had permission issues).
- **Domain/DNS:** `realtorportal.parallelstudios.co` at GoDaddy → Vercel A record `76.76.21.21`, SSL via Vercel. GoDaddy Domain Connect used for Resend DNS.
- **Stripe (live):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in Vercel env. Price IDs in `admin/lib/plans.ts` (solo `price_1TUXB4E4f1D9W7YWV6x21nCU` $99, team `price_1TUXB8E4f1D9W7YWhmNaJize` $299, brokerage `price_1TUFlsE4f1D9W7YWXviZUzol` $799). Webhook `/api/billing/webhook` sets `firms.plan_tier/stripe_subscription_id/status`.
- **Twilio:** from-number `+18557657815` (toll-free). Env `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`. Toll-free/A2P registration was resubmitted under Parallel Studios LLC (Private Profit, not sole-proprietor) this project; **confirm it's fully verified before promising SMS to all US carriers** (historic error 30034 when unverified). `/api/debug/test-sms` surfaces status. Compliance page at `/sms-consent`.
- **Resend (email):** `RESEND_API_KEY`, `RESEND_FROM` (`Realtor Portal <noreply@parallelstudios.co>`) in Vercel. `parallelstudios.co` DNS-verified via GoDaddy Domain Connect. `admin/lib/email.ts` = Resend primary → SMTP fallback → no-op. **Always confirm a real email actually left the building, not just an OK response.**
- **EAS/Apple/Android:** Expo owner `parallelstudios`, EAS project `2ec40b9d-760a-4b14-81eb-8de0f06e9fdb`, slug `realtor-portal`, version `0.1.3`. iOS bundle `com.parallelstudios.realtorportal`, Apple Team `W4K7G5YF5D`, Apple ID `turnerlogan@parallelstudios.co`, ASC app id `6768115138`, ASC key `/Users/turnerlogan/Downloads/AuthKey_544WW2NRWY.p8`. Android package same, Play service-account JSON `/Users/turnerlogan/Downloads/google-play-service-account.json`, track `internal` (auto-submit now configured; first release rolled out manually once). Associated/app-link domains: `realtorportal.parallelstudios.co` + `realtor-portal-ten.vercel.app`, path prefixes `/welcome`, `/invite`.
- **GitHub:** `ParallelStudios1/realtor-portal`, `main` → Vercel.
- **Outlook (M365):** `turnerlogan@parallelstudios.co` via M365 MCP (for email triage; not used by the watcher).
- **DocuSign:** soft-skipped until `DOCUSIGN_*` env set; UI degrades to "paste signed URL." Real envelope creation not confirmed live.
- **Sentry:** `@sentry/*` present in both apps; wire `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` before real customer load.
- **Anthropic:** `ANTHROPIC_API_KEY` used by `/api/ai/listing-description` + contract extraction — verify it's set in Vercel before relying on AI features.
- **Env var NAMES** (values live in Vercel/EAS, never in git): Web — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SOLO|TEAM|BROKERAGE`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `APPLE_TEAM_ID`, optional `SENTRY_*`/`DOCUSIGN_*`/`ANTHROPIC_API_KEY`. Mobile (EAS) — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.

---

## 8. Architecture quick-ref

- **Auth:** `getMe()` (`admin/lib/supabaseSsr.ts`) = `auth.getUser()` + RPC `public.me()` → `{user_id,email,full_name,role,firm_id,firm_name,firm_logo_url,firm_brand_color,firm_status,trial_ends_at,onboarding_completed,...}`. Mobile uses AsyncStorage token; API routes resolve either cookie or Bearer via `resolveCaller()`.
- **Middleware** (`admin/middleware.ts`): public paths include `/`, `/login*`, `/signup*`, `/welcome*`, `/invite/*`, `/deal/*`, `/value/*`, `/delete-account`, `/privacy*`, `/terms*`, `/api/*`, `/_next*`. **`/api/*` is public so mobile fetches aren't redirected to /login HTML — each route does its own auth.** Role-aware redirects (attorney→/attorney, client→/client, else /dashboard).
- **Plan tiers/seats** enforced in Firm Control invite flow; trial firms cap at 1. Cross-firm guest pass via `canUsePremiumForDeal`.
- **Design tokens:** Inter font; Tailwind `ink-50…ink-950` neutrals; soft shadows; `rounded-xl`/`rounded-2xl`; fade-in/slide-up animations. No gradients/emojis.

---

## 9. Current status — done / verified / pending

### Done & deployed this project (recent)
- **Auto-advancing statuses & phases** (buyer + seller) via DB triggers 0053–0057 — tested end-to-end.
- **Interactive month calendar** on 4 surfaces (web client portal, web deal workspace, mobile client home, mobile realtor deal screen).
- **Buyer "I want this home" → optional offer-amount prompt** (mobile + web); stored in `client_searches.buyer_desired_offer`, shown to realtor in confirm banner + Financials.
- Financials surfaced to clients; "Unknown" names fixed (activities join actor); house "weird numbers" fixed (use address not id).
- Mobile: mark dates/events complete, tour reschedule-on-accept, brand-color picker, firm creation with logo upload, Firm Control + Oversight screens.
- Store compliance: block/report, in-app + public `/delete-account`, zero-tolerance EULA.
- Expo SDK 54 image-upload crash fixed (`expo-file-system/legacy`).
- Custom domain live w/ SSL; Vercel auto-deploy; Android EAS auto-submit configured; duplicate-firm signup bug fixed earlier.

### Build/deploy state at handoff
- Latest web commit `7a873fd` (migration files 0056+0057); prior `e0a676a` (calendar + buyer offer + name/number fixes). Web prod confirmed Ready.
- Mobile: iOS build `5382936c` finished (auto-submitting to TestFlight); Android `d3212540` was in progress (auto-submit to Play internal). Seller-side work was DB-only, so these builds carry all current mobile code.

### Pending / next
1. Confirm Android `d3212540` finished and reached Play internal; roll out the first release by hand if needed.
2. Confirm the TestFlight build processed and is installable.
3. Device spot-check: auto-phase/auto-status changes render correctly on both apps for a buyer AND a seller deal.
4. Verify Twilio A2P is fully cleared before promising SMS to all carriers.
5. Confirm `ANTHROPIC_API_KEY` set in Vercel if AI features are used.
6. Task tracker item #32 ("Add missing realtor deal-action buttons on mobile") — verify no realtor action remains web-only; port if so.
7. Wire Sentry before real customer load. DocuSign real envelopes never confirmed live.

---

## 10. Footguns (these have recurred — escalate fast, don't loop)

1. **Email delivery** ("invites don't send") has bitten many times: Supabase free-tier SMTP only mails team members; `RESEND_FROM` must be a verified domain address; SMS body must use the `/invite/<token>` URL. Always verify a real email lands.
2. **404s**: usually `getMe()` returning null on a cookie/SSR race (use static-import `redirect` from `next/navigation` so TS narrows), or an orphaned firm/deal in the DB. Check page exists, `getMe()`, and DB orphan.
3. **Vercel build failures**: missing dep after use, dynamic-import losing TS narrowing, strict null checks. Build on the Mac before pushing when a change touches many files.
4. **Supabase user-delete** FK/cascade fragility — several migrations addressed it (native cascades now; the old hard-coded pre-delete trigger was dropped in 0048).
5. **AI-feeling UI** — Turner has zero tolerance. No gradients, minimal/zero emojis, no "Powered by AI", no fake testimonials, flat ink palette.
6. **Beta/temporary copy** — he's repeatedly asked to purge "beta/coming soon/no longer". Kill any you find.
7. **Async buttons need spinners** — use `<PrimaryButton>`/`<PendingButton>` + `useFormStatus()`.
8. **Session state** — when his firm_id changes, his browser may hold the old firm; tell him to sign out/in.

---

## 11. Vercel-error watcher (scheduled task)

A scheduled task runs every 10 min (`*/10 * * * *`) checking whether the latest Vercel prod deploy is in Error; if so it surfaces the build error + file:line. It does **not** auto-fix and won't false-positive once a later deploy is Ready. Manage via `mcp__scheduled-tasks__list_scheduled_tasks` / `_update_scheduled_task` / `_create_scheduled_task`. You can add sibling watchers (Supabase advisors, Stripe webhook failures) the same way.

---

## 12. Full ask history (this engagement)

Product description ("don't make it sound AI") → fix mobile image upload (SDK 54 `expo-file-system/legacy`) → Android auto-deploy + replace blank logo squares → mobile firm creation w/ logo+branding parity → store compliance (block/report/EULA/account-deletion) → public account-deletion link → large batch (brand-color wheel, Twilio texting, save-house button under keyboard, buyer "what do you think" does nothing, tour reschedule-on-accept, interactive calendar everywhere, mark dates complete on mobile, **auto statuses/phases everywhere**, financials auto-update, fix weird house-number names + "Unknown" names, "confirm client wants this home" does nothing, buyer auto-ask offer amount, surface all numbers to client) → "do all of that, don't get back until done/tested/deployed" (calendar + deeper auto-advance + buyer offer prompt) → "apply all of it to seller-side deals, customized" → "tell me how to talk about this like I coded it" (uncle visiting) → **this handoff + a kickoff message**.

An older, day-by-day user-message timeline (~9000 words, phases A/B/C from Apr 29 onward including the abandoned ReelUp project) may exist in a prior session's outputs folder as `turner-user-timeline.md`; if it's not reachable, `git log --since="2026-05-15" --pretty='%h | %ai | %s'` narrates the work order well.

---

## 13. First things the next conversation should do

1. Read this file. 2. Skim `README.md` + `ARCHITECTURE.md`, then `admin/lib/bearerAuth.ts` and migrations 0053–0057. 3. Run `git log --oneline -15` on the Mac to see latest activity. 4. Confirm the Vercel watcher is enabled. 5. Match Turner's tone (short, direct). 6. Reproduce UI bugs live via the Chrome MCP before assuming. 7. Use parallel agents for anything 5+ files or multi-step. 8. Don't apologize for being a fresh session unless asked — just be useful.

---

## 14. The message for Turner to paste into the new conversation

> I'm continuing a project called **Realtor Portal** (my white-label real-estate SaaS, Parallel Studios LLC). Everything you need to act like you already know the project is in **`/Users/turnerlogan/RealtorPortal/HANDOFF.md`** — read that file first, top to bottom, before doing anything.
>
> Quick orientation so you know what you're touching: it's a **Next.js 14 web app in `admin/`** (deploys to Vercel on `git push origin main`; live at `realtorportal.parallelstudios.co`) and a **React Native + Expo SDK 54 mobile app in `mobile/`** (built with EAS → TestFlight + Play). Backend is **Supabase Postgres** (project `epagiepzartckjqzbsxi`) with row-level security and automation triggers; migrations live in `supabase/migrations/` (0002–0057). Deal automation (phases/statuses advancing automatically) is done at the database level and is already tested and live.
>
> How the work gets done here (important): **web builds and all git/EAS/Vercel commands run on my Mac, not your Linux sandbox** — drive my Mac terminal for `npx next build`, `git push`, and `eas build`. Use the **Supabase MCP** for database changes (and always commit the matching migration file). Use the **Claude-in-Chrome MCP** to verify UI live. Connected services: Vercel, Supabase, Twilio (SMS), Resend (email), Stripe (billing), Apple/Google (mobile), GoDaddy (DNS) — the exact IDs, file paths, and env-var names are all in HANDOFF.md §7.
>
> Rules that matter to me: **flat-ink design, no gradients or emojis, Inter font**; **never delete the "5780 N Hillbrooke Trace" listing** (it's real); **no payments inside the mobile app**; **keep web and mobile at feature parity**; always clean up test data; and **don't ask me small clarifying questions — just ship, test, and deploy**, and push back if I'm about to do something dumb.
>
> Start by reading HANDOFF.md and telling me the current state and what's pending, then wait for my next task.

---

*End of handoff. The next AI has everything I have. Welcome to Realtor Portal.*
