# Realtor Portal — Admin Panel

Your control room. Built with Next.js 14 (App Router) + Tailwind. Runs locally for now, deploys to Vercel free tier when you're ready.

## What it does

- List all firms on the platform (each firm = one tenant of the SaaS).
- Create a new firm: name, slug, brand colors, logo upload.
- View a firm: stats, brand colors, list of users.
- Invite users to a firm by email — Supabase sends a magic link, the user clicks, lands in the mobile app already associated to their firm.
- Suspend / reactivate a firm.

## What it deliberately doesn't do (yet)

- Edit a firm after creation (you can edit in Supabase Studio for v1).
- Stripe billing UI (do that around firm 4–5 — see `MONETIZATION.md`).
- Per-firm analytics or usage dashboards (Supabase has built-in usage views).
- Multi-admin login (this panel is just for you. Vercel password protection is enough — see deploy section below).

## Local setup

```bash
cd admin
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

Open http://localhost:3000. (Note: Expo's Metro bundler for the mobile app runs on port 8081 by default, so there's no conflict with the admin panel on 3000.)

## Important: this panel uses the service-role key

That key bypasses Postgres RLS. Anyone with access to this app can read or write *every* firm's data. So:

- Run it locally for now.
- When you deploy: use Vercel's [Password Protection](https://vercel.com/docs/security/deployment-protection) on the `admin` project. $0 on Pro, $20/mo otherwise — worth it for v1.
- v1.1: add real Supabase Auth gated to `role='super_admin'` via Next.js middleware. Not urgent until there's more than one of you.

## Deploy to Vercel

```bash
npm install -g vercel
cd admin
vercel
```

Follow prompts, set the same three env vars in Vercel project settings (Production + Preview). Done.

## Files

```
admin/
├── app/
│   ├── layout.tsx              ← root HTML shell + Tailwind
│   ├── globals.css
│   ├── page.tsx                ← firms list (home)
│   └── firms/
│       ├── new/page.tsx        ← create firm form (Server Action)
│       └── [id]/page.tsx       ← firm detail + users + invite + suspend
├── lib/
│   ├── supabaseServer.ts       ← service-role client (server-only)
│   └── supabaseBrowser.ts      ← anon client (browser, currently unused)
├── package.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── .env.example
└── .gitignore
```
