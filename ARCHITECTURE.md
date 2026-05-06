# Architecture

This doc explains how Realtor Portal is structured and *why*. Read this before changing anything load-bearing.

## The core problem to solve

Multiple real estate firms each get to use what *feels* like their own custom app — logo, name, colors — but you only build, deploy, and maintain a single codebase.

This is called **multi-tenant white-label SaaS**. The pattern is well-established. The single most important decision is how strictly tenants (firms) are isolated from each other in the database. We're using **Postgres row-level security (RLS)** on Supabase, which is the right call for a v1 with up to a few hundred firms. It's enforced at the database level — even if your app code has a bug, the database itself refuses to serve one firm's data to another firm's user.

## The three surfaces

```
┌─────────────────────────┐    ┌─────────────────────────┐
│   MOBILE APP            │    │   ADMIN PANEL           │
│   (iOS + Android)       │    │   (web, Turner only)    │
│                         │    │                         │
│   Used by:              │    │   Used by:              │
│   - Realtors at firms   │    │   - You (super-admin)   │
│   - Clients of those    │    │                         │
│     realtors            │    │   Purpose:              │
│                         │    │   - Onboard new firms   │
│   Roles determined      │    │   - Upload logos        │
│   at login.             │    │   - Set brand colors    │
│                         │    │   - View revenue, etc.  │
└───────────┬─────────────┘    └───────────┬─────────────┘
            │                              │
            └──────────────┬───────────────┘
                           │
                ┌──────────▼──────────┐
                │  SUPABASE           │
                │  (Postgres + Auth   │
                │  + Storage + RT)    │
                │                     │
                │  Row-level security │
                │  enforces tenant    │
                │  isolation.         │
                └─────────────────────┘
```

## Data model — high level

Every table that holds firm-scoped data has a `firm_id` foreign key. RLS policies use that column to gate every read and write.

```
firms (id, name, slug, logo_url, primary_color, secondary_color, ...)
  │
  ├── users (id, firm_id, role, email, full_name, ...)
  │     role ∈ {'realtor', 'client', 'super_admin'}
  │
  ├── client_searches (id, firm_id, client_id, realtor_id, name, status, ...)
  │     │   name e.g. "Eric Logan's Search for 3 Bedrooms"
  │     │   status (current phase) ∈ {'searching', 'offer_made', 'under_contract',
  │     │                              'closing', 'closed'}
  │     │
  │     ├── houses (id, firm_id, search_id, address, price, ...)
  │     ├── activities (id, firm_id, search_id, actor_id, action, target, ...)
  │     │     activity feed: "Sarah updated Inspection Report"
  │     ├── important_dates (id, firm_id, search_id, label, date, ...)
  │     │     e.g. "Closing Day", "Appraisal Due"
  │     ├── documents (id, firm_id, search_id, name, storage_path, ...)
  │     │     PDFs uploaded by the realtor
  │     └── messages (id, firm_id, search_id, sender_id, body, ...)
  │
  └── push_tokens (id, user_id, token, platform, ...)
        for Expo push notifications.
```

Full schema with constraints, indexes, and RLS policies is in `supabase/schema.sql`.

## Multi-tenancy: how a logo gets onto a phone

1. Realtor or client opens the app for the first time.
2. They log in (Supabase Auth — email + password, magic link, or Apple/Google).
3. Auth returns their `user_id`.
4. App fetches `users.firm_id` for that user.
5. App fetches the corresponding `firms` row → gets `logo_url`, `primary_color`, `name`.
6. App applies those values via a `ThemeProvider` at the top of the React component tree.
7. From now on, every screen displays *that firm's* branding. Every API call is scoped to that firm by RLS.

To change a firm's branding, you update the `firms` row in the admin panel. Next time their users open the app (or pull-to-refresh), the new branding loads. No app store update required. **This is the whole magic of white-label.**

## Why one App Store listing instead of one per firm

A future-you might be tempted to publish "Acme Realty Portal" and "Coastal Homes Portal" as separate App Store apps. Don't. Reasons:

- Apple charges no extra fee, but *each app needs its own review submission, screenshots, privacy nutrition labels, and version updates.* At 5 firms it's tedious. At 20 firms it's a part-time job.
- Apple has historically rejected near-duplicate apps as "spam" (Guideline 4.3). White-label apps need careful framing.
- A single app called something neutral ("Realtor Portal" or your product name) where the firm's branding takes over after login is the standard approach — Practifi, Bonzo, kvCORE all do this.

If a firm pushes back ("we want it on the store as Acme Realty"), the upgrade path is paid: they pay for a dedicated build, you submit a separate listing. Don't include this in v1 pricing.

## Roles and permissions

```
super_admin (you)
    can do anything across all firms via the admin panel
realtor (firm staff)
    can read/write all client_searches, houses, activities, dates,
    documents, messages where firm_id = their firm_id
    AND (typically) where they are the assigned realtor_id
client (homebuyer/seller)
    can read all entities where firm_id = their firm_id
    AND search_id = a search where they are the client_id
    can write only messages
```

These are enforced as Postgres RLS policies. App code does not perform authorization itself — the database refuses unauthorized queries. This is the safest pattern. See `supabase/schema.sql` for exact policy SQL.

## Push notifications

Using Expo's free push notification service. Every device registers an Expo push token in `push_tokens` on first login. When an event happens (activity created, date approaching, message sent), a Supabase database trigger calls an Edge Function that fans out push notifications via Expo's API.

For v1, simpler approach: when realtor performs an action in the app, the app itself sends the notification via the Expo SDK before persisting. We'll move to triggers in v1.5 once we know the patterns.

## Where the code lives

- `mobile/` — React Native + Expo Router, TypeScript everywhere.
- `admin/` — Next.js 14 App Router, deployed to Vercel.
- `supabase/` — SQL schema, RLS policies, optional Edge Functions.

## What's deliberately NOT in v1

These are real product needs but they each take 2+ weeks and we'd never ship without cutting:

- DocuSign integration (use plain PDF upload + viewer for v1; if a firm asks, sell it as a v1.5 paid add-on).
- MLS feed integration (the "list of houses" is manually entered by the realtor or the client; integrating Bridge Interactive / RESO is a project on its own).
- Automated transaction milestones (the realtor manually moves the deal through phases; no auto-detection from email or external systems).
- In-app payments (Stripe in admin panel only — collect from firms via subscription billing, not in the consumer-facing app).
- Web version of the client app (mobile-only for v1; if firms beg, we add a Next.js consumer app reading the same Supabase backend in v1.5).

When a realtor asks for one of these on a sales call, your answer is: *"That's on our roadmap for after launch. The portal you'll have at launch covers everything 90% of clients ask about during a deal."*

## Security notes

- Never put service-role Supabase keys in the mobile app. The mobile app uses the *anon* public key, and RLS protects the data.
- The admin panel is the *only* place that uses the service-role key, and that key lives only as a Vercel environment variable.
- File uploads (logos, PDFs) go to Supabase Storage. Bucket policies enforce same firm-scoping as the database.
- Logging out invalidates the session; rotating Supabase JWT keys invalidates all sessions.
