# Realtor Portal

A white-label client portal that real estate firms license, rebrand as their own, and use to keep their buyer/seller clients informed throughout a deal.

## What's in this folder

```
RealtorPortal/
├── README.md            ← you are here
├── ARCHITECTURE.md      ← system design, multi-tenant model, why these choices
├── BUILD_PLAN.md        ← 12-week plan, what to build in what order
├── PITCH.md             ← scripts for dad's first 5 realtor introductions
├── MONETIZATION.md      ← pricing, contracts, what to charge
├── supabase/            ← Postgres schema, RLS policies, seed data
├── mobile/              ← React Native (Expo) cross-platform app
└── admin/               ← Next.js admin panel (your control plane)
```

## TL;DR

- **You build the app once.** Each firm gets a "branded instance" — same binary, different logo / colors / name shown at runtime, scoped via a `firm_id`.
- **One mobile app**, two roles. Login determines whether you see the realtor view or the client view.
- **One admin panel** that only you (super-admin) can access. You use it to onboard new firms.
- **Supabase backend.** Postgres with row-level security so firms can't see each other's data.
- **Free for v1 dev.** Supabase free tier, Expo free, Vercel free for the admin panel. Costs kick in only after you have paying firms.

## Stack at a glance

| Layer | Tech | Why |
|---|---|---|
| Mobile (iOS + Android) | React Native + Expo SDK 51, Expo Router | One codebase, both platforms. Hot reload. EAS for builds. |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) | Free tier, RLS for multi-tenancy, real-time messaging out of the box. |
| Admin panel | Next.js 14 App Router + Tailwind + shadcn/ui | Fast to build, clean component library, Vercel deploy. |
| Push notifications | Expo Push Notifications | Free, works iOS + Android, no Firebase config needed. |
| Payments (post-v1) | Stripe Billing | When you start charging firms a monthly fee. |

## Read in this order

1. `ARCHITECTURE.md` — to understand the system before touching code.
2. `supabase/schema.sql` — see the data model.
3. `BUILD_PLAN.md` — see what to do this week vs. next month.
4. `PITCH.md` — what to send the first realtors when you're ready to validate before writing more code.
