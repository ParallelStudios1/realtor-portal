# HANDOFF — Realtor Portal & Turner Logan

**Audience:** the next AI assistant continuing Turner's work.
**Goal:** the conversation should feel like he never switched models. You should know everything I know.
**Last updated:** 2026-05-30 by Claude Sonnet 4.6 (Cowork mode).

> **Read order:** sections 0–3 are mandatory before you write a single line of code or respond. Sections 4–11 are reference. Section 12 is the complete user-message timeline (lives in a sibling file).

---

## 0. The first thing you should know

Turner Logan is a **16-year-old solo founder** running Parallel Studios LLC. He's built Realtor Portal almost entirely by directing AI agents (me) over ~30 days. **He cannot code most of this himself** — he knows Java, Python, some HTML and SwiftUI, and uses voice dictation a lot. That means:

- Messages are short, often ALL CAPS for urgency, frequent typos ("reqaltor", "super bass" = Supabase, "dispach", "perfefct").
- He is bluntly impatient: "DO IT YOURSELF", "JUST MAKE IT WORK", "come on", swears occasionally. **Don't take it personally. Don't grovel. Don't apologize twice.**
- He treats you as a colleague and full delegate. He does NOT want clarifying questions on small things. Just ship.
- He does want pushback on bad ideas: *"I don't want a yes man"*.
- He gets frustrated when the same bug reappears. If you fix something he's complained about three times, **test it end-to-end yourself in Chrome before declaring victory.**

He's chasing real revenue. His dad is a real estate attorney with warm-lead pipeline — that's the GTM. The product is **white-label** so each firm rebrands the same SaaS as their own.

---

## 1. Standing permissions Turner has granted (verbatim)

These are explicit. You don't need to re-ask:

- *"you have access to my Twilio which has 48.85 of funds in it so do whatever"*
- *"you have access to my whole computer terminal and everything. Do whatever you can to make this work perfectly."*
- *"always deploy without asking everywhere"*
- *"you have terminal abilities, do it yourself"*
- *"You will do the coding, not me"*
- *"You can or should be able to access my desktop"*
- Pasted his live Stripe keys, Supabase service-role JWT, Apple Developer creds, Outlook M365 access, DocuSign creds, Vercel scope. **Treat all of these as already authorized.**
- He'll often paste an error and expect you to act on it. Don't ask "what would you like me to do?" — fix it.

**Hard limits I respect** (Anthropic policy + common sense): I still won't move money on his behalf, send messages from his accounts to third parties without confirming the recipient + body, modify SSO/sharing permissions on documents I don't own, etc. He understands and hasn't pushed back on these. Use judgment.

---

## 2. How I work (so you can match)

### 2a. Multi-agent loops by default
For anything bigger than a one-file edit, I dispatch parallel sub-agents via the `Agent` tool. Patterns I've used:
- **Research → Plan → Code → QA loop** with separate agents per phase
- **Parallel fan-out** for unrelated work (e.g. 4 P0 bugs at once — one agent each, run in a single message with multiple `Agent` blocks so they run concurrently)
- **One agent per file domain** when a fix spans many files (e.g. "convert dynamic imports to static across 17 page files")

Each agent gets a self-contained prompt with the why, the constraints, and the exact files to touch. Turner expects you to use them. Don't try to single-shot everything yourself.

### 2b. Deploy mechanism
I cannot push to GitHub directly from this sandbox. I push via **osascript driving Turner's local terminal**:
```
do shell script "/bin/bash -c 'export PATH=/Users/turnerlogan/.nvm/versions/node/v20.19.4/bin:/usr/local/bin:$PATH && cd /Users/turnerlogan/RealtorPortal && git add -A && git commit -m \"...\" && git push origin main'"
```
Vercel auto-deploys from `main`. Same pattern for Vercel CLI (`npx vercel ls`, `npx vercel inspect --logs <url>`, `npx vercel env add NAME production --force --scope parallelstudios1s-projects`).

### 2c. Browser-driven verification
For UI bugs and flows, I drive Chrome via the **Claude in Chrome MCP** (`mcp__Claude_in_Chrome__*`) — DOM-aware, much faster than computer-use clicks. Use `browser_batch` to sequence steps. For Resend / GoDaddy / Stripe dashboards I use Chrome MCP too. Computer-use is the fallback for native apps.

### 2d. Database
Supabase project is `epagiepzartckjqzbsxi` (us-west-2). I use the **Supabase MCP** (`mcp__7b16af5d-e544-4b26-ab20-4b1403956d8c__*`) for `execute_sql` and `apply_migration`. Service-role bypass is fine for ops work.

### 2e. Vercel deploys are watched
**There's a scheduled task running every 10 minutes** that checks if the *latest* production deploy is in Error state and, if so, fetches the build logs and surfaces the file:line + error. It does NOT auto-fix. Location: `/Users/turnerlogan/Documents/Claude/Scheduled/vercel-error-watch/SKILL.md`. The watcher is smart enough not to false-positive on resolved failures (it ignores Vercel error emails if the latest deploy is now Ready).

### 2f. TodoList usage
Turner sees the task list as a sidebar widget. I use `TaskCreate` / `TaskUpdate` aggressively. The list has grown to 163+ items. **Don't delete history.** Add new tasks for each P0 batch, mark `in_progress` when you start, `completed` when shipped (not when "ready"). Include a verification step where appropriate.

### 2g. Communication style match
Turner doesn't want fluff. **Match his energy: short, direct, no preamble.** Lead with the answer or the fix, then explain only what's load-bearing. He'll ask if he wants more. Avoid bullet lists for short answers — write prose. Bullets are fine for table-shaped data (commits, files, env vars).

### 2h. He still calls me "Claude" but expects continuity
If he says "you said earlier..." and you have no record, **don't lie that you remember.** Tell him you're a fresh session, point to this HANDOFF.md, and ask him to restate. If he's frustrated about repeating himself, just do the thing and move on.

---

## 3. The Vercel-error scheduled task

Already running. Confirms via Vercel CLI (`vercel ls`) whether the latest prod deploy is Ready, Error, Queued, or Building. Only alerts if Error. Does NOT auto-fix. Cron: `*/10 * * * *` (every 10 min). Notify-on-completion is off, so you only hear from it when there's an actual prod failure.

If Turner asks for the watcher to alert on something else (e.g. Supabase advisor warnings, Stripe webhook failures), you can build sibling scheduled tasks the same way. See `mcp__scheduled-tasks__create_scheduled_task`.

---

## 4. The product — Realtor Portal

White-label multi-tenant SaaS for real-estate firms. Each firm rebrands the same app under their own logo/colors/name.

**Two halves:**
- **Web admin** (`admin/`, Next.js 14 App Router) — realtors, firm admins, attorneys, clients all use the same app at `realtor-portal-ten.vercel.app` with role-gated routes.
- **Mobile** (`mobile/`, Expo SDK 54) — TestFlight + Play Store, version 0.1.3. Both client and realtor experiences. iOS build quota **exhausted until June 1**.

**What it does:**
- Realtor signs up, creates branded firm (logo, brand color, tagline).
- Adds clients (buyers/sellers).
- For each client, manages "deals" (`client_searches`) through phases: searching → offer_made → counter_offer → under_contract → closing → closed.
- Per deal: houses + ratings, important dates, documents (folders), messages (group + private DMs), tour requests, showings, deal participants (co-realtor, attorney, lender, inspector, etc).
- Stripe billing: Solo ($99, 1 seat), Team ($299, 10), Brokerage ($799, 50).
- Plan-tier seat caps enforced in the firm-invite flow.
- Phase celebration popups, branding everywhere, mobile push notifications, email + SMS notifications.
- Public AVM seller-lead funnel at `/value/[firmSlug]` — address → estimate → lead capture → notify realtor.
- Broker analytics dashboard (KPIs, pipeline by phase, top realtors, stuck deals).
- Cross-firm collab: realtors can be invited into other firms' deals as guests; they get premium features on that deal even on a free plan.
- Attorney portal — attorneys see read-only deals they're attached to.
- `/invite/[token]` — first-class branded invite landing (no auth required). Replaces the old `/welcome` "open the app / continue in browser" screen for most invite paths.

---

## 5. Repo layout

Full audit of every file/route is in section 11. The high-level shape:

```
RealtorPortal/
├── admin/                       Next.js 14 web app, deployed to Vercel
│   ├── app/                     App Router routes (pages + API)
│   ├── components/              Shared client components
│   ├── lib/                     Server helpers (Supabase, email, sms, plans, etc.)
│   ├── e2e/                     Playwright smoke tests
│   └── middleware.ts            Route gating + cookie refresh
├── mobile/                      Expo / React Native (iOS + Android)
│   ├── app/                     expo-router screens
│   ├── ios/                     Native iOS shell
│   └── lib/
├── supabase/migrations/         0002–0032 SQL migrations
├── scripts/                     One-off ops scripts
├── .github/                     CI (deploy to Vercel on push)
├── .vercel/                     Linked Vercel project metadata
└── HANDOFF.md                   ← you are here
```

---

## 6. External services + credentials

### Supabase
- **project_id**: `epagiepzartckjqzbsxi` (name: `realtor-portal-prod`, region: `us-west-2`)
- **URL**: `https://epagiepzartckjqzbsxi.supabase.co`
- **Access**: Supabase MCP — `mcp__7b16af5d-e544-4b26-ab20-4b1403956d8c__execute_sql`, `_apply_migration`, etc. Always pass `project_id`.
- **RLS** is on everywhere. Service-role bypasses it. RLS helper functions: `current_firm_id()`, `current_user_email()`, `is_staff_role()`, `is_firm_admin()`, `can_collab_on_search(p_search_id)`.

### Vercel
- **project_id**: `prj_UvaVOTWT1KeXZn4mpHuQ7qNUmYld`
- **Scope/team**: `parallelstudios1s-projects`
- **Prod alias**: `realtor-portal-ten.vercel.app`
- **Access via CLI** on Turner's Mac: `npx vercel ls realtor-portal --scope parallelstudios1s-projects` etc. Token already cached locally.
- **Vercel MCP** tokens have permission issues — prefer CLI.

### Stripe (live)
- Keys set in Vercel env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Price IDs in `admin/lib/plans.ts`:
  - solo: `price_1TUXB4E4f1D9W7YWV6x21nCU` ($99)
  - team: `price_1TUXB8E4f1D9W7YWhmNaJize` ($299)
  - brokerage: `price_1TUFlsE4f1D9W7YWXviZUzol` ($799)
- Webhook: `https://realtor-portal-ten.vercel.app/api/billing/webhook` handles `checkout.session.completed` + `customer.subscription.updated/deleted`. Sets `firms.plan_tier`, `stripe_subscription_id`, `status`.

### Twilio
- **From-number**: `+18557657815` (toll-free)
- **A2P 10DLC verification**: **STILL PENDING** — until approved, sending to real US carriers returns error 30034. `/api/debug/test-sms` surfaces this with the fix path. Toll-free verification SID is `HHd515b68a874b52ee678ef325cd75d1d8` (submitted as SOLE_PROPRIETOR).
- **Balance**: ~$48.85 as of last check.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in Vercel.

### Resend (set up today, 2026-05-30)
- **API key in Vercel**: `RESEND_API_KEY = re_[REDACTED]`
- **From address**: `RESEND_FROM = Realtor Portal <noreply@parallelstudios.co>`
- **Domain `parallelstudios.co`** verified today via **GoDaddy Domain Connect** (SPF/DKIM/DMARC auto-pushed by Resend, no manual TXT entry).
- `admin/lib/email.ts` has a **multi-provider transport** — Resend primary, generic SMTP (nodemailer) fallback if `SMTP_HOST/USER/PASS` set, no-op + log warning otherwise.
- **NOTE**: `lib/email.ts` `DEFAULT_FROM` constant still hardcodes `noreply@realtor-portal-ten.vercel.app` — runtime `RESEND_FROM` env overrides at send time. Cosmetic cleanup pending.

### GoDaddy
- Owns DNS for `parallelstudios.co`. Domain Connect used today (auto-flow); future DNS changes can be done the same way via Resend / other providers that support Domain Connect.

### EAS / iOS / Android
- **Expo project ID**: `2ec40b9d-760a-4b14-81eb-8de0f06e9fdb`
- **Owner**: `parallelstudios`
- **Slug**: `realtor-portal`, current version: `0.1.3`
- **iOS bundle**: `com.parallelstudios.realtorportal`
- **Apple Team ID**: `W4K7G5YF5D` (in `APPLE_TEAM_ID` Vercel env)
- **Apple ID**: `turnerlogan@parallelstudios.co`
- **ASC App ID**: `6768115138`
- **ASC API key (.p8)**: `/Users/turnerlogan/Downloads/AuthKey_544WW2NRWY.p8`
- **Android package**: `com.parallelstudios.realtorportal`
- **associatedDomains**: `applinks:realtor-portal-ten.vercel.app`
- **Universal Links path prefixes**: `/welcome`, `/invite`
- **iOS build quota EXHAUSTED until ~June 1.** Last build logs: `eas-build-v0.1.2.log`, `eas-build.log`, `eas-submit-ios.log` in repo root.

### GitHub
- `ParallelStudios1/realtor-portal`, default branch `main`. Push → auto-deploys to Vercel.

### Outlook (M365)
- Turner's email: `turnerlogan@parallelstudios.co`
- Connected via M365 MCP (`mcp__b8d59dba-8f1d-46e9-b1dd-27c4a7d6815b__outlook_email_search` etc.). The Vercel-error scheduled task does NOT use this (it polls Vercel CLI directly) but you can use Outlook search for triaging emails.

### DocuSign
- Soft-skipped until `DOCUSIGN_*` env set. UI degrades to "paste signed URL" mode. Real envelope creation has never been live.

### Sentry / observability
- **NOT WIRED UP.** No `SENTRY_*` referenced in code. Pending work if you want error monitoring.

### Anthropic API
- `ANTHROPIC_API_KEY` is referenced by `/api/ai/listing-description`. **Verify in Vercel env** before relying on AI features.

---

## 7. Architecture quick-ref

### Auth model
- `getMe()` (in `admin/lib/supabaseSsr.ts`) calls `supabase.auth.getUser()` + RPC `public.me()` returning `{user_id, email, full_name, role, firm_id, firm_name, firm_subdomain, firm_logo_url, firm_brand_color, firm_status, trial_ends_at, onboarding_completed}`.
- Roles: `super_admin | firm_admin | realtor | client | owner | manager | agent | attorney`.

### Middleware route gating (`admin/middleware.ts`)
- **Public**: `/`, `/signup*`, `/login*`, `/welcome*`, `/deal/*`, `/participant*`, `/privacy*`, `/terms*`, `/value/*`, `/invite/*`, `/api/*`, `/.well-known/*`, `/_next*`, `/favicon*`.
- **CRITICAL**: `/api/*` is public **so middleware doesn't redirect mobile fetches to /login HTML**. Each API route does its own auth (cookie session or Bearer token).
- Unauth + protected → `/login?next=<path>`.
- Auth + visiting `/login` or `/signup` → role-aware home (`attorney → /attorney`, `client → /client`, else `/dashboard`).
- Cross-role visits redirected (e.g. client at `/dashboard` → `/client`).

### Roles & permissions
- `super_admin` — Turner. Sees `/superadmin`. Always staff.
- `firm_admin` / `owner` — Billing, branding, manage seats, delete users, invite teammates.
- `manager` — Firm staff, elevated; can invite/manage agents but not billing.
- `realtor` / `agent` — Day-to-day staff. Sees firm's deals + clients.
- `client` — Buyer or seller. Sees only own `client_searches`. Can write activities on own deal.
- `attorney` — Attached by email or `deal_participants.role='attorney'`. Read-only deal view.

### Key tables
- `firms` — `id, name, subdomain, logo_url, brand_color, accent_color, tagline, status (trial|active|cancelled|past_due), trial_ends_at, stripe_customer_id, stripe_subscription_id, plan_tier (solo|team|brokerage), phase_labels jsonb, phase_messages jsonb`.
- `users` — `id (=auth.uid()), firm_id, role, email, full_name, sms_opt_in`. `assigned_realtor_id` for clients.
- `client_searches` (the "deal" table) — `id, firm_id, realtor_id (nullable), client_id (nullable), kind (buy|sell), name, phase, co_realtor_id, attorney_name/email/phone, docusign_envelope_url, agreed_price, closing_amount, earnest_money, commission_pct, contract_url, contract_signed_at, notes, offer_amount, counter_offer_amount, closing_date, closed_message, offer_house_id, assigned_realtor_id`.
- `deal_participants` (mig 0015) — `id, search_id, user_id (nullable), external_email, external_name, role, can_view_documents, can_view_financials, can_view_messages, can_view_dates`.
- `deal_invites` (mig 0031) — `id, token, search_id, firm_id, participant_id, role, name, email, phone, created_by, accepted_at, accepted_by, expires_at`. Powers `/invite/[token]`.
- `firm_invites` (mig 0021) — Seat-invite tokens for joining a firm. Auto-stamps `accepted_at` via trigger (mig 0023).
- `documents` — Stored in private `client-docs` bucket at `{firm_id}/{search_id}/{ts}-{name}`.
- `houses`, `house_ratings`, `messages` (with private DM cols from 0029), `activities`, `tour_requests`, `showings` (mig 0030), `important_dates`, `firm_contacts` (mig 0028), `user_deal_views` (mig 0022), `scheduled_messages` (mig 0024), `push_tokens`.

### Plan tiers
- **Solo** $99/mo, 1 seat
- **Team** $299/mo, 10 seats
- **Brokerage** $799/mo, 50 seats
- Seat caps enforced when inviting via Firm Control (`inviteFirmMemberAction` counts users + pending invites).
- Trial firms get cap 1 (solo default).
- Cross-firm "guest pass" via `canUsePremiumForDeal`: write actions allowed if caller's home firm is active OR deal's host firm is active and caller is a `deal_participants`.

---

## 8. Critical files (memorize these)

| Path | Purpose |
|---|---|
| `admin/middleware.ts` | Cookie refresh + route gating |
| `admin/lib/supabaseSsr.ts` | `getSupabaseServerClient`, `getMe()` |
| `admin/lib/supabaseServer.ts` | `getSupabaseServiceRoleClient()` (RLS bypass) |
| `admin/lib/supabaseBrowser.ts` | Anon client for the browser |
| `admin/lib/email.ts` | Multi-provider email transport (Resend → SMTP → no-op) |
| `admin/lib/sms.ts` | Twilio REST wrapper |
| `admin/lib/notify.ts` | Unified email+sms wrapper |
| `admin/lib/plans.ts` | Stripe price→tier mapping |
| `admin/lib/planGate.ts` | `canUsePremiumForDeal()` for cross-firm guest pass |
| `admin/lib/dealEmail.ts` | `emailEveryoneOnPhaseChange()` |
| `admin/lib/humanError.ts` | Friendly error string mapper |
| `admin/lib/ics.ts` | Zero-dep iCalendar builder |
| `admin/lib/docusign.ts` | DocuSign JWT/envelope (soft-skips when env unset) |
| `admin/app/dashboard/clients/[id]/actions.ts` | `addParticipantAction` — the Add Party flow (~1000 lines, watch your token budget) |
| `admin/app/api/auth/signup/route.ts` | Today's duplicate-firm bug + fix |
| `admin/app/api/participants/add/route.ts` | Mobile parity for Add Party |
| `admin/app/invite/[token]/{page,InviteClient,actions}.tsx` | First-class invite landing |
| `admin/app/signup/{page,SignupForm,actions,SignupSubmit}.tsx` | Role-picker signup |
| `admin/app/onboarding/page.tsx` | One-step branding wizard |
| `admin/app/dashboard/page.tsx` | Dashboard overview |
| `admin/app/dashboard/deals/[id]/page.tsx` | Canonical deal detail |
| `admin/app/welcome/WelcomeClient.tsx` | OLD "open the app / continue browser" screen — being phased out in favor of `/invite/[token]` |

---

## 9. Recent commit history (since 2026-05-21)

```
ea78b3c  2026-05-30  P0: Signup must not create duplicate firm for existing email
bfdc2a5  2026-05-30  Fix build: static-import redirect so TS narrows me to non-null
f566a2f  2026-05-30  Fix Create Firm 404: kill non-null getMe assertions, add post-signin cooldown
8e3fcc4  2026-05-30  chore: trigger redeploy to pick up RESEND_API_KEY + RESEND_FROM env vars
6f2f616  2026-05-30  Email: add nodemailer for SMTP fallback when RESEND_API_KEY is unset
f684b8b  2026-05-30  P0 batch: stuck Start-deal button, signup spinner, client realtime race, plan-tier gating + seat caps, SMTP fallback, /invite tokens to /api/participants/add
c26bd6d  2026-05-23  Invite: surface deal_invites errors + always use /invite URL for all roles
c29fc2a  2026-05-23  First-class /invite/[token] landing
b2e0986  2026-05-23  Invites: signInWithOtp so re-invites email + auto-copy magic link fallback
a34953f  2026-05-23  Showings scheduler + AVM disclosure + dashboard nav respects firm brand color
4d1d111  2026-05-22  QA hardening: AVM estimate validates firmId, lead validates email shape
41e68b3  2026-05-22  AVM seller-lead landing /value/[firmSlug]
d658eda  2026-05-22  Broker analytics dashboard
5e50755  2026-05-22  P0 batch: revalidatePath, goUnderContract bail-on-error, /api/participants/add access, drop dead Attorney modal
4f2aa5a  2026-05-22  chore: redeploy to pick up new TWILIO_FROM_NUMBER (toll-free)
886e3e2  2026-05-22  Test-SMS polls Twilio delivery + surfaces A2P 10DLC error 30034
f2ca57e  2026-05-22  Strip beta copy from Settings + spinner on PrimaryButton + global data-loading spinner
476e1e4  2026-05-22  Visible Send-Test-Text button on Settings
7c3d3d5  2026-05-22  Magic links go through /welcome hash handler + service-role deal lookup
e11af52  2026-05-22  Mobile realtor deal detail: skeleton loading screen + v0.1.3
c5b0df2  2026-05-22  Real invite emails via Supabase SMTP + attorney via Add Party + magic-link onboarding
f1b6e43  2026-05-21  Per-party private DM: migration 0029 + sendPrivatePartyMessageAction + thread modal
c231f84  2026-05-21  mobile: 0.1.2 — admin People merge lock + Edit Party + truthful toast
125b8a8  2026-05-21  People: lock-merge so party never disappears + Edit Party modal
046b919  2026-05-21  mobile: bump 0.1.0 -> 0.1.1
75bf289  2026-05-21  Mobile client home: People, Attorney/DocuSign/Contract, event details
de23215  2026-05-21  Mobile parity: Add Party screen + /api/participants/add
7cc219f  2026-05-21  Outside realtor invite: magic-link signup + welcome/realtor onboarding + guest banner
50be21a  2026-05-21  Add Party: SMS-first invite (phone primary, email optional)
c019340  2026-05-21  notify: report email ok only when email actually went out
2eed378  2026-05-21  People section: merge server prop with local state + direct Supabase refetch
0a42b45  2026-05-21  Cross-firm guests can open the deal: canUsePremiumForDeal in authorize()
52b0848  2026-05-21  Notify everywhere via Twilio + email; Add Party returns row for instant People update
e473d8b  2026-05-21  Add Party: surface firm_contacts + cross-firm realtor invite + per-deal premium gate
a282144  2026-05-21  Contacts: add/edit/remove standalone contacts
cf92c7f  2026-05-21  People section: realtime subscription on deal_participants
cac33bf  2026-05-21  404 on client invite + start-deal-without-client
5e05246  2026-05-21  E2E: fix landing smoke test for new copy
90d6fbf  2026-05-21  De-AI: flat landing rewrite, NavigationProgress bar, real route skeletons
6825048  2026-05-21  Final-final batch: address book, event details, your-home badge, user-delete v3
```

---

## 10. Open / pending / untrusted

### P0 — verify today's fixes
1. **Duplicate-firm signup fix (`ea78b3c`)** — Live but not re-tested on a brand-new email. 27 orphan firms cleaned up. Turner moved back to firm `a30e4a95`.
2. **Resend `parallelstudios.co`** — DNS verified today; first real outbound from `noreply@parallelstudios.co` not yet observed end-to-end. Trigger a real invite and confirm inbox delivery + SPF/DKIM headers.
3. **`lib/email.ts` `DEFAULT_FROM`** still hardcodes `noreply@realtor-portal-ten.vercel.app` — runtime override works, but constant should be updated.

### Twilio
4. **A2P 10DLC verification still pending.** Until approved, real SMS to non-Twilio US numbers returns error 30034. Toll-free `+18557657815` is capped until cleared.

### Mobile
5. **iOS build quota exhausted until ~June 1.** Cannot ship mobile updates until quota resets.
6. **`ANDROID_SHA256_FINGERPRINT`** — verify it's in Vercel so Android App Links keep working.

### Invite flow consolidation
7. `/welcome` vs `/invite/[token]` — `WelcomeClient.tsx` still in codebase, still handles Supabase invite-email redemption. Goal: migrate every invite through `/invite/[token]` and retire the "open the app / continue in browser" choice. Needs Supabase email-template update.

### Observability
8. **Sentry not wired up.** No `SENTRY_*` referenced. Add before non-trivial customer load.

### Misc
9. **Stripe price-ID drift** — `STRIPE_PRICE_SOLO/TEAM/BROKERAGE` envs are referenced but `lib/plans.ts` hardcodes the same IDs. Pick one source of truth.
10. **`/api/ai/listing-description`** — Verify `ANTHROPIC_API_KEY` is set in Vercel.
11. **DocuSign** — Soft-skipped until env set. UI degrades to "paste URL" mode. Real envelope creation never live.
12. **TS narrowing pattern** — anywhere `getMe()` is asserted non-null after a redirect, ensure static-import `redirect` from `next/navigation` (dynamic imports lose the `never` return type and break TS narrowing — that broke build `f566a2f` → fixed in `bfdc2a5`).
13. **Predelete trigger from migration 0025** covers tables through 0024. Tables added 0028–0032 (`firm_contacts`, private message cols, `showings`, `deal_invites`, `plan_tier`) need a 0033-style audit to confirm cascades are deadlock-proof under realtime subscribers.

### Untrusted commits (need end-to-end verification)
- Showings scheduler (`a34953f`)
- AVM landing (`41e68b3`)
- Broker analytics (`d658eda`)
- Per-party DMs (`f1b6e43`)
- Cross-firm collab writes (`0a42b45`)
- Mobile Add Party screen (`de23215`)

---

## 11. Recurring frustrations / footguns to avoid

These have come up MULTIPLE times. If they show up again, escalate quickly — don't go in circles.

### Footgun 1: Email delivery
Turner has reported "invite emails don't send" at least 10 times. Root causes have varied:
- Supabase free-tier SMTP only delivers to team members + `inviteUserByEmail` silently no-ops for existing users → switched to `signInWithOtp`
- Resend API key was never set → set today, domain verified
- `RESEND_FROM` was the vercel.app hostname which Resend rejected → fixed to `noreply@parallelstudios.co`
- The non-realtor SMS body used `dealUrl` instead of `primaryUrl` (`/invite/<token>`) → fixed
**Always confirm a real email actually leaves the building, not just that the API returned ok.**

### Footgun 2: 404 page-not-founds
At least 6 reports. Causes:
- `getMe()!` non-null assertion throwing when cookie write races SSR → fixed by static-import redirect + cooldown (commits `f566a2f`, `bfdc2a5`)
- Most recent: signup was orphaning firms, leaving Turner in an empty firm with all his deals stranded in old firms → fixed by `ea78b3c`
**When a 404 reappears, check (a) is the page literally missing, (b) is `getMe()` returning null, (c) is the deal/firm actually orphaned in the DB.**

### Footgun 3: Vercel build failures
At least 5. Patterns:
- Missing dependency in `package.json` after using it (e.g. `nodemailer`)
- Dynamic-import losing TS narrowing
- TypeScript strict null checks
**Run `npx next build` locally via osascript before pushing if the change touches 5+ files or imports.**

### Footgun 4: Supabase user-delete breaking
Multiple migrations to fix FK constraints / cascade behavior. Latest is migration 0025 predelete trigger but tables added 0028+ aren't covered.

### Footgun 5: "App looks awful" UI complaints
Turner has zero tolerance for AI-feeling UI. He demanded a full "de-AI pass" (commit `90d6fbf`). Avoid: gradient backgrounds, excessive emojis (use sparingly), overformatted "Step 1 of 1" badges, "Powered by AI" copy, fake testimonials, AI-sounding microcopy. Match the flat ink palette (`ink-50` through `ink-900`) and Inter font.

### Footgun 6: Beta / temporary copy
Turner has repeatedly asked to scan and remove all "beta", "coming soon", "no longer", "used to be" copy. There may still be some lurking. If you see it, kill it.

### Footgun 7: Slow buttons without loading state
Every async button MUST have a spinner. There's a `<PrimaryButton>` and `<PendingButton>` and a global `data-loading` CSS rule. Use `useFormStatus()` for server actions.

### Footgun 8: Don't promise free SMS to invitees
The toll-free A2P 10DLC verification is still pending. Don't claim invitee SMS works to all carriers until cleared.

### Footgun 9: Mobile builds blocked
EAS iOS quota exhausted until ~June 1. Don't try to ship mobile builds before then unless you've checked quota.

### Footgun 10: Turner's session can lose state
When he resigns up or his cookie changes firm_id, his browser session may still hold the old firm. If a fix requires re-signing in, tell him explicitly to sign out first.

---

## 12. Complete user-message timeline

The full chronological timeline of every message Turner has sent across the entire ~30-day project history is in a sibling file:

**`/Users/turnerlogan/Library/Application Support/Claude/local-agent-mode-sessions/4a94f868-c7e1-4b37-b02d-5a9c47773cf4/608a8419-d49d-4937-bb59-6f49d0dbbf97/local_cebb4397-1c14-4940-b905-b853dc0fa0d2/outputs/turner-user-timeline.md`**

~9000 words, ~233 timeline entries. Includes:
- **Phase A** (Apr 29–30): "make me rich" search → settles on building real product
- **Phase B** (May 1–3): ReelUp video editor — abandoned May 3
- **Phase C** (May 3+): Realtor Portal — current and ongoing

Plus dedicated sections for:
- **Turner's communication style & quirks**
- **Permissions granted (verbatim quotes)**
- **Recurring frustrations grouped by theme**
- **Explicit preferences he's stated**
- **Things asked for but not yet delivered / abandoned**

If that file isn't reachable from the next session, the next-best recovery path is to read recent commit messages in this repo (`git log --since="2026-05-15" --pretty='%h | %ai | %s'`) — the commit subjects narrate the work order pretty completely.

---

## 13. Active scheduled tasks

| Task ID | Cron | Purpose |
|---|---|---|
| `vercel-error-watch` | `*/10 * * * *` | Check if latest Vercel prod deploy is Error; surface build error + suggested fix |

Manage via: `mcp__scheduled-tasks__list_scheduled_tasks`, `_update_scheduled_task`, `_create_scheduled_task`.

---

## 14. Last things I was doing (live state at handoff)

1. **Just shipped `ea78b3c`** — the duplicate-firm signup fix. Vercel is building it.
2. **Database state**: Turner's `users` row (`303396ef-651b-4b3f-a712-2d4550c7b561`) was just moved from firm `21eea323` → firm `a30e4a95` (Logan Realty with his real data). 27 orphan Logan Realty firms were deleted.
3. **Resend**: API key + FROM env vars in Vercel; `parallelstudios.co` verified via GoDaddy Domain Connect today.
4. **Open task #72 (long-stale)**: "Test mobile client tour-request flow" — never closed; might still be valid.
5. **Open task #161 → completed just now**: "Reproduce + actually fix 404 on Create Firm signup". Closed.
6. **Open task #163 → in-progress**: "Compile full handoff doc for new conversation". That's what this file is. Mark completed after writing.

**Turner needs to** sign out + sign back in to pick up the firm_id move (his browser session still says he's in the deleted firm). Tell him this when he returns.

---

## 15. Pointers — first thing the next conversation should do

1. **Read this file** (you're doing it).
2. **Read** `turner-user-timeline.md` if the path resolves — gives full color on Turner.
3. **Run `git log --since="2026-05-25" --pretty='%h %ai %s'`** via osascript to see latest activity.
4. **Check the Vercel-watcher** with `mcp__scheduled-tasks__list_scheduled_tasks` — confirm it's still enabled.
5. **Match Turner's tone**: short, direct, no preamble. Ship the fix, then explain only what matters.
6. If he reports a bug you can't reproduce in code, **drive Chrome via `mcp__Claude_in_Chrome__*`** to reproduce live before assuming.
7. **Use the multi-agent pattern** for anything 5+ files or multi-step. Parallel agents are the default.
8. **Don't apologize for being a fresh session unless he asks.** Just be useful.

---

*End of handoff. The next AI has everything I have. Welcome to Realtor Portal.*
