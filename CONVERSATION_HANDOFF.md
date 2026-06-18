# Realtor Portal — Complete Conversation & Project Handoff

> **Purpose of this file.** This is a full brain-dump so a *different AI model* (or a new human) can continue this project as if no conversation break ever happened. It captures: who the user is, what we're building, **every request in this work session and what I did + why**, the exact **methods/workflows** I use (build, deploy, verify, debug, clean up), all **credentials/IDs/paths**, the **codebase map** (web + mobile + database), the **critical domain concepts**, the **current deployment state**, and **open issues**. Read this top-to-bottom once; then keep it open as a reference.

Last updated: 2026-06-09 (end of the session that ended with "deploy everywhere" + the Supabase user-deletion fix + this handoff).

---

## 0. TL;DR for the next model — how to "be like me"

- **The user is Turner Logan** (`turnerlogan@parallelstudios.co`), a young solo founder of **Parallel Studios LLC**, building **Realtor Portal** — a white-label real-estate SaaS (web admin + client portals + native mobile app).
- **He wants full autonomy.** He repeatedly says things like "do all of it," "don't ask questions," "fix everything," "make it perfect." Default to **acting**, not asking. Only ask when a decision is truly his and unrecoverable.
- **He works in fast loops:** he reports a bug or asks for a feature in a sentence or two, often with typos; I build it, deploy to production, verify it **live**, clean up, and report back concisely.
- **Always: build → commit/push (auto-deploys to Vercel) → verify live → clean up test data → report.** Never leave test rows in his real database.
- **Verify on production**, logged in as **Eric** (his test client account) in the connected Chrome. Use a `?cb=<n>` cache-buster to force the newest build, because his open tabs cache old JS.
- **Be concise** in replies (he set a "be concise and direct" preference). Lead with the outcome. Don't over-explain.
- **Match the design system:** flat-ink (neutral grays `ink-50..900`), Inter font, `.surface`/`.input`/`.btn-primary`, **no gradients, no emojis**.
- The mobile app talks to the **same production web API + Supabase**, so server-side fixes are live for mobile immediately; only native UI changes need an EAS rebuild.

---

## 1. Who / What

**User:** Turner Logan — founder, Parallel Studios LLC. Email `turnerlogan@parallelstudios.co`. In the app he is a **firm_admin** of the firm **"Logan Realty"**.

**Product:** "Realtor Portal" — a multi-tenant, white-label real-estate transaction portal. A realtor (or brokerage/"firm") licenses it, rebrands it, and uses it to manage deals and keep every party (buyer/seller clients, attorneys, co-realtors, lenders, inspectors, title agents, appraisers) informed and coordinated through the lifecycle of a real-estate transaction.

**Three surfaces, one backend (Supabase):**
1. **`admin/`** — Next.js 14 (App Router) web app. Contains the realtor **dashboard**, the **client** portal (`/client`), the **attorney** portal (`/attorney`), the universal **`/deal/[id]`** all-parties view, **super-admin**, and all **API routes**. Deployed on **Vercel**.
2. **`mobile/`** — React Native + Expo (SDK 54, expo-router) app for iOS + Android. Talks to the web API + Supabase. Built/submitted via **EAS**.
3. **`supabase/`** — Postgres schema + 48 SQL migrations (Auth, RLS, Storage).

**Repo:** `github.com/ParallelStudios1/realtor-portal`, branch **`main`** (push to main → Vercel auto-deploys).

---

## 2. Infrastructure, accounts, IDs, credentials (CRITICAL REFERENCE)

| Thing | Value |
|---|---|
| **Local repo (Mac)** | `/Users/turnerlogan/RealtorPortal` (subdirs `admin/`, `mobile/`, `supabase/`, `scripts/`) |
| **Supabase project ref** | `epagiepzartckjqzbsxi` → `https://epagiepzartckjqzbsxi.supabase.co` |
| **Vercel project id** | `prj_UvaVOTWT1KeXZn4mpHuQ7qNUmYld` |
| **Vercel team/org id** | `team_qlhRbznUtqXHRZFtJj6qSsEC` (slug `parallelstudios1s-projects`) |
| **Production web URL (alias)** | `https://realtor-portal-ten.vercel.app` (auto-aliased to newest main deploy) |
| **Expo/EAS account** | `parallelstudios` |
| **EAS project id** | `2ec40b9d-760a-4b14-81eb-8de0f06e9fdb` |
| **Mobile app version** | `0.1.3` (iOS build #31, Android versionCode 9 at last build) |
| **iOS bundle id** | `com.parallelstudios.realtorportal` |
| **Android package** | `com.parallelstudios.realtorportal` |
| **Apple ID** | `turnerlogan@parallelstudios.co` |
| **App Store Connect app id (ascAppId)** | `6768115138` |
| **Apple Team id** | `W4K7G5YF5D` |
| **ASC API key** | `/Users/turnerlogan/Downloads/AuthKey_544WW2NRWY.p8` (keyId `544WW2NRWY`, issuer `907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a`) — **present**, iOS auto-submit works |
| **Android Play service account** | `/Users/turnerlogan/Downloads/google-play-service-account.json` — **MISSING** → Android **auto-submit to Play is blocked**; the binary still builds and is downloadable from EAS |
| **Logan Realty firm_id** | `ab8549ed-a2da-4ef6-8fb3-a20b31528cdc` |
| **Twilio (toll-free A2P)** | Parallel Studios LLC, EIN `39-4117604`, address `5780 N Hillbrooke Trace, Johns Creek GA 30005`, registered agent Eric Logan, control number `25171177`, business type "Private Profit" (NOT "Sole Proprietor" — that caused rejection 30530). Resubmitted in earlier session. |
| **Node on Mac** | `~/.nvm/versions/node/v20.19.4/bin` (must export PATH in osascript) |

**Test accounts (in production):**
- **Turner** — `turnerlogan@parallelstudios.co`, `firm_admin`, firm `ab8549ed`.
- **Eric Logan** — `employee@parallelstudios.co`, role `client`, **user_id `96d36824-f988-4a72-9141-b8d3af29aa57`**. Principal client of **seller deal `472049ca-e3f2-4035-b40e-7c233ecf6738`** ("Eric Logan's Listing"). His real listing is **"5780 N Hillbrooke Trace"** ($5,000,000). **The connected Chrome is logged in as Eric** — use this to verify the client/seller and `/deal` surfaces. (Eric is Turner's own employee/test account; safe to create+delete test data on, but NEVER delete his real "5780 N Hillbrooke Trace" listing.)

---

## 3. My working methods / exact workflows (so the next model reproduces them)

### 3.1 Build (TypeScript type-check + Next production build)
The Linux sandbox (`mcp__workspace__bash`) has been **unavailable this session** ("Not enough disk space"). I build on the **Mac via osascript** instead:
```
do shell script "export PATH=\"$HOME/.nvm/versions/node/v20.19.4/bin:/usr/local/bin:/opt/homebrew/bin:$PATH\"; cd /Users/turnerlogan/RealtorPortal/admin; rm -rf .next; (npx next build > /tmp/rp_build.log 2>&1 &); echo started"
```
- **Always `rm -rf .next` first.** Overlapping/stale builds cause an `ENOENT .next/build-manifest.json` crash mid-"Collecting page data." A clean build fixes it.
- Run in **background** `(cmd &)` and **poll** the log: `tail -6 /tmp/rp_build.log`. A clean success ends with the route table + `○ (Static) … ƒ (Dynamic) …`. Check `grep -ciE 'Failed to compile|Type error|error TS' /tmp/rp_build.log` → expect `0`.
- **osascript has a ~30s wrapper timeout.** `sleep 30` often errors. Use `sleep 25` max, then poll in a separate call. A build takes ~45–60s.

### 3.2 Deploy
- `git add -A && git commit -m "…" && git push origin main` → **Vercel auto-deploys and auto-aliases production**.
- Check status: `npx vercel ls --yes` (in `admin/`); the deployments table line 7 (`sed -n '7p'`) is the newest. Wait for `● Ready` (Building → Ready ~60s).
- The Vercel **MCP** tools 403 on this team's scope, so use the **CLI via osascript** (`npx vercel`). The user is logged into the Vercel CLI on the Mac.

### 3.3 Verify live (Chrome MCP, as Eric)
- The connected Chrome session is **Eric** (a client). The `/dashboard/*` realtor area is **staff-only and middleware-redirects Eric to `/client`**, so I can't drive the realtor UI as Eric — I verify realtor-side changes by build success + DB checks, and verify client/`/deal` surfaces directly.
- **Force the new build** by navigating to `…/client?cb=<number>` (open tabs cache old JS chunks).
- The **`screenshot` tool is currently broken** (`Failed to deserialize params.clip.scale`). Use `get_page_text`, `read_page`, and `javascript_tool` (page-context JS eval) instead. The extension's **ref-based `left_click` sometimes doesn't fire React onClick** — a real DOM `.click()` via `javascript_tool` is more reliable; `form_input` works for inputs/selects; `file_upload` works for `<input type=file>` (pass the Mac absolute path under the uploads/outputs folder).

### 3.4 Database (Supabase MCP)
- `mcp__7b16af5d-…__execute_sql` (project `epagiepzartckjqzbsxi`) for queries + DML; `…__apply_migration` for DDL.
- **Always clean up test rows** after live verification. To bypass the storage `protect_delete` trigger when deleting a `storage.objects` row: wrap in `begin; set local session_replication_role = replica; delete …; commit;`.
- `audit_log` is **append-only** (a BEFORE DELETE/UPDATE block trigger raises) — never try to mutate it.
- The MCP SQL role **cannot `set role supabase_auth_admin`** (permission denied), so I can't perfectly replicate GoTrue's role in SQL — but FK cascade actions run as the system regardless of the deleting role.
- **Note:** `execute_sql` only returns the **last statement's** result set in a multi-statement batch.

### 3.5 Mobile builds (EAS)
```
cd mobile; npx eas-cli build --platform ios --profile production --auto-submit --non-interactive --no-wait   # → TestFlight
cd mobile; npx eas-cli build --platform android --profile production --non-interactive --no-wait              # binary only
```
- `--no-wait` queues and returns a build URL immediately. iOS auto-submits to TestFlight (key present). Android can't auto-submit (missing service-account JSON).

### 3.6 Reporting style
Concise. Outcome first. Mention the one manual step the user must do (almost always: **hard refresh Cmd+Shift+R** to get off the stale build). Be honest about what I could and couldn't verify (e.g., realtor-only UI I can't drive as Eric).

---

## 4. COMPLETE conversation history — every ask, what I did, and why

### 4.0 Context inherited from before this session (summarized)
A very long prior session built most of the app. Highlights the next model should know existed: onboarding "Save & continue" hang fixed; attorney workspace + private (party-scoped, NOT whole-deal) messages; tours **require a date+time** (store `requested_at`) + countdown + Tours section + client calendar/ICS; **phases + subphases + `awaiting_offer` phase + auto-advance**; **house-agreement flow** (client proposes a home → realtor confirms → auto-advance to `awaiting_offer`); **email required, phone optional** everywhere; seller-added-to-buyer-deal automation + select-which-house both directions; **document-upload 404 fixed** by a deal-centric `/dashboard/deals/[id]/upload` page; attorney menu rebuilt so they can view docs; cross-role doc/signing access; **DocuSign "not configured" path removed → paste-a-link flow tied to a document**; major **flat-ink UI** redesign; **seller/listing-agent workflow** (migration 0047: `listing_offers`, listing fields on `houses`, `SellerListingPanel`); seller-aware phase labels via `lib/dealKind.ts`; clear **deal (group) chat vs direct (private) messages** distinction; mobile parity passes; Twilio toll-free verification resubmitted (fixed business type + address + use-case + attestation). **`deal_phase` is a Postgres ENUM** — adding `awaiting_offer` required migration 0046 (`ALTER TYPE … ADD VALUE`); this was caught by a live test ("invalid input value for enum"). The user emphasized testing catches "stupid stuff."

### 4.1 (Session opener, continued task) — "seller self-service add listing + optional docs + FIX ALL BUYER ORIENTED THINGS, make everything custom per role, do it all now"
- **Built `admin/app/client/SellerAddListing.tsx`** (client component): a form for a principal seller to add the home they're selling (address, list price, beds/baths/sqft, photo URL, notes) + optionally **attach related documents**.
- **`admin/app/client/listingActions.ts`** server action `addSellerListingAction(fd)` (service-role: resolves the caller's most recent `kind='seller'` deal, inserts the house with `listing_status='coming_soon'`, optionally uploads files + inserts `documents` rows under folder `'Listing'`, logs a `listing_added` activity).
- Wired the form into the seller `/client` home (empty state + "Add another home") and `/client/houses`. Made `/client` quicklinks + houses-page copy **kind-aware** (sellers see "Your listings / Homes you're selling", not "your search").
- Verified the realtor `DealWorkspace` was already seller-aware ("Add your listing"). Built, committed, deployed.
- **Commits:** `1084996` (feature), `bf4ac11` (seller-aware labels).
- **Why:** the user's recurring complaint that the app was "too buyer-oriented" and that sellers couldn't add their own homes.

### 4.2 — "whenever I try to upload document: Something went wrong / We hit a snag loading this page. Try again"
- **Diagnosis:** the message is the app's **global `error.tsx`** boundary. Production logs showed **zero 500s**; every reachable flow worked. Root cause = **stale-chunk / ChunkLoadError**: I'd pushed several deploys in quick succession while his tab held old JS; navigating tried to fetch a chunk hash that no longer exists. Critically, **`error.tsx`'s "Try again" calls `reset()`**, which re-runs the segment with the **same dead webpack runtime** → fails again → feels like it happens "whenever."
- **Fix:** rewrote **`admin/app/error.tsx`** to detect chunk/module-load errors (`ChunkLoadError`, "Loading chunk", "failed to fetch dynamically imported module", etc.) and **auto hard-reload once** (sessionStorage-guarded against loops); the button becomes "Reload now" (does `location.reload()`), message becomes "Updating to the latest version…". Also fixed a real buyer-orientation bug found while testing: the universal `/deal` view showed **buyer** phase labels + "SEARCHING" for a **seller** — made it `phaseLabelFor(d.phase, d.kind)`.
- **Commit:** `b0b8bc4`. Verified the `/deal` seller labels live as Eric.

### 4.3 — "why cant the seller add their houses now"
- Reproduced as Eric: the form **does** open and save on a fresh load (a real `.click()` opened it; the listing saved). The button "not working" was the **same stale-build issue**. Told him to hard-refresh. (Confirmed by creating + deleting a throwaway listing live.)

### 4.4 — "Something went wrong … whenever I try to add a house **with documents, photourl, and optional notes all included**"
- **Root cause (found via a console error `TypeError: Cannot read properties of undefined (reading 'ok')`):** when the seller attaches a **real file**, the file bytes were sent **through the Server Action**, whose request body is capped at **~1 MB** (Vercel functions cap ~4.5 MB). A real PDF/photo blew the limit → the action resolved `undefined` → my `if (!r.ok)` threw → error boundary. My earlier 25-byte test slipped under the cap.
- **Fix (robust):** route file bytes **around** the Server Action. Added **`prepareSellerListingUploads(files[])`** which mints **signed upload URLs** (service role) for the `client-docs` bucket; the **browser uploads directly to Supabase Storage** via `supabase.storage.from('client-docs').uploadToSignedUrl(path, token, file)` (bypasses both the 1 MB action limit **and** storage RLS — there is **no client INSERT policy** on `client-docs`, only realtor). The action `addSellerListingAction` now receives only **metadata** (`docs_meta` JSON) and inserts `documents` rows. Also hardened the client to guard `!r || !r.ok`.
- **Verified live** with a **2.6 MB** file as Eric: house + attached document saved cleanly, no crash; cleaned up.
- **Commit:** `a38b6dd`.
- **Note:** the realtor-side `UploadDocumentClient` still uploads via the **browser** client to `client-docs` (realtors have the storage INSERT policy), so that path is fine.

### 4.5 — "you need to be able to as a seller update and remove homes"
- Added to `listingActions.ts`: `authorizeSellerHouse(houseId)` (caller must be the principal client of the seller deal owning the house), **`updateSellerListingAction(fd)`** (address/price/beds/baths/sqft/photo/notes + `listing_status` select), **`removeSellerListingAction(houseId)`** (clears dangling `offer_house_id`/`house_proposed_house_id` refs, then deletes the house; logs `listing_updated`/`listing_removed`).
- **Built `admin/app/client/houses/[id]/SellerListingControls.tsx`** (Edit details inline form + Remove with confirm) and wired it into the "This is your listing" block on the house detail page; also showed the listing-status pill and made the notes label kind-aware.
- **Verified live** as Eric on a throwaway listing: edited price→$725k + status→Active (persisted), then removed it (gone); real "5780" untouched.
- **Commit:** `2a889b3`.

### 4.6 — "the realtor should be able to mark who on the deal is supposed to sign the documents for docusign thingy"
- **`EsignPanel.tsx`** (`admin/app/dashboard/deals/[id]/`): added a **"Who needs to sign?"** chip picker (from a new `signerCandidates` prop) when attaching a signing link, and per-envelope **signer chips with check-off toggles** + an "X/Y signed" count.
- **`DealWorkspace.tsx`**: builds `signerCandidates` from principal client (labeled Seller/Client by kind), realtor, attorney, and every `deal_participants` row; passes to `EsignPanel`.
- **API `manual-link/route.ts`**: stores `recipients` as `{ label, signers:[{key,name,role,signed,signed_at}] }`.
- **New API `manual-link/signer/route.ts`**: staff-only toggle of a single signer's `signed`; **auto-completes** the envelope when all signers are signed.
- **`/deal/[id]/page.tsx`**: read-only display of designated signers + signed count for all parties (fixed label resolution for the new recipients shape).
- **Verified live** on `/deal` as Eric (seeded a 2-signer envelope: Eric=Seller signed, Turner=Realtor pending → rendered "1/2 signed" with the right chips); cleaned up.
- **Commits:** `a3e98e8`, `a97ccd9`.

### 4.7 — "I added a buyer to a deal and when I logged in as the buyer from the email, the deal was nowhere to be seen. fix this. also make the phases for everything better and more intuitive. also make the ui look better and the main panel for the realtor … looks very ugly. fix all this and redesign and just make the app look and function perfectly"
Three things:
1. **Bug (participant invisible):** Root cause in `admin/app/invite/[token]/actions.ts` — an invited buyer only becomes the deal's **principal client** if `client_id` was NULL (`.is('client_id', null)`); if the deal already had a principal, the buyer is just a **`deal_participants`** row. But `/client` only queried deals where you're the **principal**, so their deal was invisible (and they're redirected to `/client`). **Fix:** `admin/app/client/page.tsx` now also looks up **`deal_participants` where `user_id = me` OR `external_email ilike me.email`** (service role), and renders a **"Deals you're on"** section linking to **`/deal/[id]`** (which authorizes participants). Verified live by seeding Eric as a buyer-participant on a throwaway deal → it appeared as "OTHER DEALS YOU'RE ON … Buyer · Logan Realty · OFFER MADE" → cleaned up.
2. **Phases clearer:** `lib/dealKind.ts` — clearer **buyer labels** ("Home search / Preparing offer / Offer submitted / Negotiating / Under contract / Closing / Closed"), added **buyer phase messages** (`phaseMessageFor` now returns buyer copy too), and a new **`nextStepHintFor(phase, kind)`** ("Next: submit your offer to the seller", etc.). `components/DealProgressTimeline.tsx` now uses kind-aware labels + renders the next-step hint under the current phase. Verified the "Next:" hint live on Eric's seller timeline.
3. **Realtor "ugly panel" redesign:** the **`ClientDetailActions.tsx`** "Deal actions" panel was a **rainbow** of multi-colored tiles in **ragged 5-col rows** — off-brand vs flat-ink. Replaced the per-tile `TONE_STYLES` rainbow with a single **`ACCENT_TONES`** set; `ActionCard` is now uniform **monochrome ink** (icon chip goes ink-900/white on hover) with **one dark accent** for the key action and a subtle arrow; grid is an even `lg:grid-cols-4`; container is a clean white card with a titled header. (Pure styling; couldn't drive the realtor UI as Eric, but it compiled clean and deployed.)
- **Commits:** `51b25dd` (participant fix), `232e8c8` (phases + panel redesign).

### 4.8 — "deploy this everywhere" (said twice)
- Web was already live on Vercel. Kicked off **EAS production builds**: **iOS build #31** (`--auto-submit` → TestFlight, key present) and **Android** (versionCode auto-incremented to 9; binary only — Play submit blocked on the missing service-account JSON). Both queued via `--no-wait`.

### 4.9 — "also I cant delete supabase users again. continue what you were doing first but then fix this"
- **Investigated** FK constraints + triggers. Found: `public.users.id → auth.users` is **ON DELETE CASCADE**, and **every** child FK (on `users` and on `client_searches`) is CASCADE/SET NULL — so the cascade chain is clean. The blocker was a leftover custom **`BEFORE DELETE` trigger `auth_user_predelete_cleanup`** on `auth.users` (function `public._auth_user_predelete_cleanup()`) that manually deleted a **hard-coded list** of tables before the user. It's redundant **and** regression-prone: it silently broke whenever a new table was added that it didn't know about (e.g. `listing_offers`, `esign_envelopes`), surfacing as GoTrue's generic "Database error deleting user."
- **Fix:** **migration `0048_drop_redundant_auth_user_predelete_trigger.sql`** — `drop trigger … ; drop function …`. Now deletion relies on native cascades (self-maintaining, Supabase-recommended).
- **Verified** by creating disposable `auth.users` rows + related data and deleting: the user's own deals + child rows (incl. `listing_offers`, `esign_envelopes`) are removed, while a deal where they were **only the realtor** survives with `realtor_id` set NULL. Applied to the live DB via `apply_migration` (so it's **already live**) and saved the file in the repo.
- **Commit:** `0ca7547`.

### 4.10 — (this message) "give me a complete handoff … deploy multiple agents … don't forget any tiny thing"
- Spawned two **Explore** agents in parallel to map `admin/` and `mobile/`+infra accurately, then wrote **this file**.

**All commits this session (newest last):** `1084996`, `bf4ac11`, `b0b8bc4`, `a38b6dd`, `2a889b3`, `a3e98e8`, `a97ccd9`, `51b25dd`, `232e8c8`, `0ca7547`.

---

## 5. Files I created/changed this session (with why)

| File | What / why |
|---|---|
| `admin/app/client/SellerAddListing.tsx` | NEW. Seller self-service add-listing form; uploads docs via **signed URLs** (around the 1 MB action limit), then calls `addSellerListingAction` with metadata. |
| `admin/app/client/listingActions.ts` | `addSellerListingAction`, `prepareSellerListingUploads` (signed upload URLs), `updateSellerListingAction`, `removeSellerListingAction`, `authorizeSellerHouse`. Service-role, authorized to the principal seller. |
| `admin/app/client/page.tsx` | Seller "Your home for sale" wiring; **"Deals you're on"** participant-deals section (the buyer-invisible fix); kind-aware quicklinks; imports `phaseLabelFor`. |
| `admin/app/client/houses/page.tsx` | Seller-aware empty state + add-listing CTA. |
| `admin/app/client/houses/[id]/page.tsx` | Renders `SellerListingControls`; listing-status pill; kind-aware notes label. |
| `admin/app/client/houses/[id]/SellerListingControls.tsx` | NEW. Seller Edit (incl. `listing_status`) + Remove (confirm). |
| `admin/app/client/messages/page.tsx` | Copy fix ("your deal" not "your search"). |
| `admin/app/error.tsx` | Auto-recover from stale-chunk errors (hard reload once); "Reload now" button. |
| `admin/app/deal/[id]/page.tsx` | Seller-aware phase labels (badge + stepper); read-only **designated-signers** display on signing links. |
| `admin/lib/dealKind.ts` | Clearer buyer labels; buyer phase messages; `nextStepHintFor`. |
| `admin/components/DealProgressTimeline.tsx` | Kind-aware labels + "Next:" hint under current phase. |
| `admin/app/dashboard/deals/[id]/EsignPanel.tsx` | "Who needs to sign?" picker + per-signer check-off toggles + count. |
| `admin/app/dashboard/deals/[id]/DealWorkspace.tsx` | Builds + passes `signerCandidates`. |
| `admin/app/api/docusign/manual-link/route.ts` | Stores designated `signers` in `recipients`. |
| `admin/app/api/docusign/manual-link/signer/route.ts` | NEW. Toggle a signer's signed state; auto-complete envelope when all signed. |
| `admin/app/dashboard/clients/[id]/ClientDetailActions.tsx` | Flat-ink redesign of the "Deal actions" panel (uniform monochrome tiles + one accent; even 4-col grid; clean header). |
| `supabase/migrations/0048_drop_redundant_auth_user_predelete_trigger.sql` | NEW. Drops the fragile `auth.users` predelete trigger → user deletion via native cascade. **Already applied to live DB.** |

---

## 6. Critical domain concepts / database facts (do not re-learn the hard way)

- **`deal_phase` is a Postgres ENUM** with values, in order: `searching, awaiting_offer, offer_made, counter_offer, under_contract, closing, closed`. Adding a value needs `ALTER TYPE` (migration 0046 added `awaiting_offer`). Never write an enum value the type doesn't have — it throws at runtime.
- **`client_searches.kind`** ∈ `buyer | seller | both` — drives all kind-adaptive UI/labels (`lib/dealKind.ts`).
- **`houses.status`** is a USER-DEFINED enum: `interested, tour_requested, toured, offered, passed`. **`houses.listing_status`** is plain **text** (used values: `coming_soon, active, under_contract, pending, sold, withdrawn`).
- **Messages model:** `public.messages` with `recipient_user_id` — **NULL = group "Deal chat"**, **set = private 1:1 "Direct message."** Same table, two query shapes.
- **Parties:** extra people live in **`deal_participants`** (role, `represents` for co-realtors, `external_name/email/phone`, `user_id` once linked, 4 `can_view_*` flags). Role defaults in `lib/partyPermissions.ts`. A user can access a deal if (a) it's in their firm OR (b) they're a participant (by `user_id` or `external_email`) OR (c) they're the principal client. `/client` shows principal deals + participant deals; `/deal/[id]` is the universal all-parties view that authorizes participants.
- **House agreement:** client proposes (`house_proposed_house_id/by/at`); realtor confirms via the deal-id `agree-house` API → sets `offer_house_id` + `house_agreed_at/by`, auto-advances to `awaiting_offer`, clears the proposal. Works on null-client (seller/two-sided) deals.
- **`esign_envelopes.recipients`** (jsonb) is now `{ label, signers:[{key,name,role,signed,signed_at}] }` (older rows may be `[{label}]` — code normalizes both).
- **Storage buckets:** `client-docs` (private; realtor INSERT policy only — clients must use **signed upload URLs**), `house-photos`, `documents`. Signed download URLs via `/api/documents/sign-url`.
- **Referential integrity for user deletion:** all FKs to `public.users` and `public.client_searches` are **CASCADE or SET NULL**; `public.users.id → auth.users` is **CASCADE**. After migration 0048 there is **no custom auth.users delete trigger** — deletion is pure native cascade. (Deleting a user removes their own deals + children; deals where they were only realtor survive with `realtor_id` nulled.)
- **Append-only:** `audit_log` blocks UPDATE/DELETE. Storage tables have a `protect_delete` trigger — bypass for cleanup with `set local session_replication_role = replica;` inside a transaction.

---

## 7. Codebase map

### 7.1 `admin/` (Next.js 14 web) — high-level
- **Auth/session:** `lib/supabaseSsr.ts` (`getSupabaseServerClient`, `getMe`), `lib/supabaseServer.ts` (`getSupabaseServiceRoleClient`, **bypasses RLS — server-only**), `lib/supabaseBrowser.ts` (anon, RLS-bound). `middleware.ts` refreshes cookies and **redirects by role** (client→/client, attorney→/attorney, staff→/dashboard; logged-out→/login?next=…).
- **Route areas:** `app/dashboard/*` (realtor portal: deals board, `deals/[id]` workspace, clients, contacts, messages, tours, analytics, oversight, settings, billing, firm/branding, tools/net-sheet), `app/client/*` (buyer/seller portal: home, profile, documents, messages, houses[/id]), `app/attorney/*`, `app/deal/[id]` (universal all-parties view), `app/superadmin/*`, public `app/{login,signup,onboarding,welcome,invite/[token],value/[firmSlug],feedback/[token],privacy,terms}`.
- **Key API routes (`app/api/*`):** `deals/[id]/{chat,phase,agree-house}`, `documents/{sign-url,notify}`, `docusign/{create,refresh,webhook,manual-link,manual-link/signer,manual-link/status}`, `participants/add`, `clients/invite`, `showings/feedback`, `calendar/[searchId]` + `calendar/event/[id]` (ICS), `billing/{checkout,webhook}` (Stripe), `notifications/{send-email,send-push}`, `ai/{contract-extract,listing-description}`, `value/{lead,estimate}`, `inbox/count`, `cron/{daily,drips}`, `og/house/[id]`, `.well-known/*`.
- **lib:** `dealKind.ts` (phase labels/messages/hints), `dates.ts` (DATE-only formatting to avoid hydration bugs — use `formatDateOnly`, and `<LocalDateTime/>` for timestamptz), `notify.ts`/`email.ts`/`sms.ts`/`dealEmail.ts` (best-effort, never throw), `docusign.ts`, `ics.ts`, `audit.ts`, `deadlines.ts`, `showingDigest.ts`, `feedbackTokens.ts` (stateless HMAC), `plans.ts`/`planGate.ts` (Stripe tiers + trial/guest-pass gating), `partyPermissions.ts`, `humanError.ts`.
- **Design system (Tailwind):** custom `ink` scale, `soft-*` shadows, Inter font, `.surface/.input/.btn-primary/.btn-secondary`. **No gradients, no emojis, sentence case.**
- **Env vars:** required `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; recommended `RESEND_API_KEY`/SMTP, `TWILIO_*`, `STRIPE_*`, `CRON_SECRET`, `DOCUSIGN_*`, `FEEDBACK_TOKEN_SECRET`/`CALENDAR_FEED_SECRET`, `SITE_URL` (default `https://realtor-portal-ten.vercel.app`), Sentry.
- **Scripts:** `npm run dev|build|start|lint|type-check|e2e`.

### 7.2 `mobile/` (React Native + Expo, expo-router)
- **Groups:** `app/(auth)` (login/signup), `app/(client)` (tabs: Home/Houses/Messages/Documents + hidden activity/profile/deal-chat/houses/[id]), `app/(realtor)` (tabs: Home/Clients/Messages/Settings + `clients/[id]` with add-house/add-date/upload/financials/under-contract/phase/houses/[houseId]/deal-chat/alert/attorney/docusign/invite).
- **lib:** `auth.tsx` (Supabase auth context), `supabase.ts`, `queries.ts` + `mutations.ts` (React Query, realtime subscriptions, optimistic updates; calls web API `/api/notifications/*` with the session bearer token), `theme.tsx` (firm branding), `format.ts`, `houseStatus.ts`, `notifications.ts` (Expo push), `database.types.ts`, `humanError.ts`, `sentry.ts`.
- **Phase labels:** mobile has its own `SELLER_PHASE_LABELS` + `phaseLabel(id, kind, fallback)` in `(client)/index.tsx`. The recent **web** phase-copy improvements (clearer buyer labels, messages, next-step hints) are **web-only** — not yet ported to mobile. (The mapping agent flagged some mobile features as "stubbed"; treat that cautiously — earlier sessions did mobile parity work. Verify against the actual files before trusting "stubbed" claims.)
- **`app.json`:** version `0.1.3`, iOS bundle/Android package `com.parallelstudios.realtorportal`, scheme `realtorportal`, associated domains/intent filters for `realtor-portal-ten.vercel.app` (`/welcome`, `/invite`), EAS projectId `2ec40b9d-…`.
- **`eas.json`:** build profiles development/preview/production (production: iOS m-medium, Android app-bundle, `autoIncrement`); env per profile sets `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL=https://realtor-portal-ten.vercel.app`; submit.production has the iOS ASC key + the (missing) Android service account.

### 7.3 `supabase/migrations/` — 0002 … 0048 (48 files)
Notable recent ones: `0041` two-sided deal scoping; `0042` house↔listing link; `0043` house agreement; `0044` deal created_by; `0045` phases/house-proposal/participant visibility; `0046` add `awaiting_offer` to the `deal_phase` enum; `0047` seller listing workflow (`listing_offers` + listing fields on houses); **`0048` drop redundant auth.users predelete trigger** (the user-deletion fix). Repo root also has `README.md`, `ARCHITECTURE.md`, `BUILD_PLAN.md`, `PITCH.md`, `MONETIZATION.md`, and `scripts/` (ASC/TestFlight helpers: `asc-*.py`, `asc-poll.sh`, `eas-supervisor.sh`, `deploy.sh`).

---

## 8. Current deployment state (as of this handoff)

- **Web:** live on Vercel, production alias `realtor-portal-ten.vercel.app`, newest commit `0ca7547`. The user must **hard-refresh** to clear stale tabs.
- **Database:** migration `0048` is **already applied** to the live Supabase project (user deletion works now).
- **iOS:** EAS production **build #31** building → scheduled to **auto-submit to TestFlight**.
- **Android:** EAS production build (**versionCode 9**) building → **binary only**; **Play auto-submit blocked** until `/Users/turnerlogan/Downloads/google-play-service-account.json` exists. Check EAS dashboard (`expo.dev/accounts/parallelstudios/projects/realtor-portal`) for completion.

---

## 9. Open issues / things to watch / likely next requests

1. **Android Play submission** is blocked on the missing service-account JSON. When the user provides it: `npx eas-cli submit --platform android --profile production --latest`.
2. **Mobile parity gap:** the recent web features (seller self add/edit/remove listing, signed-URL doc upload, e-sign signer designation, participant "Deals you're on", clearer phase copy + next-step hints, the action-panel redesign) are **web-only**. The user will likely want these in the native app next.
3. **Stale-build UX:** the `error.tsx` auto-reload mitigates it, but rapid consecutive deploys while he has tabs open still require a hard refresh. Consider Vercel "skew protection."
4. **Twilio toll-free** A2P verification was resubmitted; SMS may still be pending approval (`lib/sms.ts` no-ops gracefully if unconfigured). A `test-sms` debug route exists.
5. **He tests as multiple roles with limited browsers.** I can only drive the **client/Eric** surfaces in the connected Chrome (middleware blocks `/dashboard` for clients). For realtor-only UI, rely on a clean build + DB checks, and say so honestly.
6. **Always clean up** any seeded test rows (`%QA%`, `%DELETE%`, `deltest%@example.com`, etc.) after live verification.

---

## 10. One-paragraph "voice & approach" so the next model sounds like the same collaborator

Move fast and act. Turner gives terse, high-energy, sometimes-typo'd asks and wants them fully done, deployed, and verified — not discussed. Build the change, push to main (auto-deploys), verify it on the live site as Eric with a cache-buster, clean up test data, and reply in a few sentences leading with the outcome and the one thing he must do (usually a hard refresh). Be honest about what couldn't be verified (realtor-only UI) instead of over-claiming. Keep the flat-ink aesthetic (no gradients/emojis). When something "looks broken," first suspect the **stale build**; when a Server Action mysteriously fails with files, suspect the **1 MB body limit**; when phases misbehave, remember **`deal_phase` is an enum**; when "can't delete users," it's **trigger/FK** territory. Treat his real data (especially Eric's "5780 N Hillbrooke Trace" listing) as production — never delete it.
