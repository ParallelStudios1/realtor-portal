# Learning plan — from "AI built it" to "I can build it"

Goal: read every file in this repo and know what it does, then ship features
by hand. Your codebase is the textbook. Everything below points at real files
you already own.

---

## Tonight (2 hours)

1. Go to https://www.typescriptlang.org/play and paste in snippets from this
   repo when they confuse you. Keep it open permanently.
2. Read these three files top to bottom. Look up every line you don't get
   (typescriptlang.org/docs, developer.mozilla.org):
   - `admin/lib/bearerAuth.ts` — 58 lines. Auth for the whole API.
   - `admin/app/api/dates/complete/route.ts` — one small API route.
   - `mobile/lib/api.ts` — 36 lines. How mobile talks to the web API.
3. Write down (in this file, under Notes at the bottom) the 5 things that
   made no sense. That's your study list, not someone else's.

## Week 1-2 — JavaScript/TypeScript

You know Java and Python, so skip beginner courses. Learn the deltas:

- async/await and Promises (this is the #1 thing in every file)
- arrow functions, destructuring, spread (`...`), optional chaining (`?.`)
- modules: `import`/`export`
- TypeScript: types, interfaces, generics, `null` vs `undefined`

Resource: https://javascript.info (read fast, you know how to program) then
https://www.typescriptlang.org/docs/handbook/intro.html.

Exercise: write a small Node script by hand, no AI — read
`supabase/migrations/` filenames and print a numbered index. Run it with
`node script.js`. Trivial on purpose; it forces the toolchain into your hands.

## Week 3-4 — React

The UI model for BOTH your apps. Learn: components, props, state, hooks
(`useState`, `useEffect`), lists and keys, controlled inputs.

Resource: https://react.dev/learn — do the tic-tac-toe tutorial, then read
"Thinking in React".

Exercise in this repo: open `admin/components/Toast.tsx` and
`admin/components/PendingButton.tsx` and explain each to yourself out loud.
Then build one tiny component by hand: a `<CopyButton text={...}>` that
copies text and flips its label to "Copied" for 2 seconds. Use it somewhere
on the dashboard.

## Week 5-6 — Next.js (the web app)

This is `admin/`. Learn: App Router pages, server vs client components
(`'use client'`), API route handlers, `redirect`, middleware.

Resource: https://nextjs.org/learn — the official course, it's good.

Read in this repo, in order:
1. `admin/middleware.ts` — who can see which routes
2. `admin/app/dashboard/deals/[id]/page.tsx` — a server component fetching data
3. `admin/app/dashboard/deals/[id]/listingActions.ts` — server actions
4. `admin/app/api/showings/schedule/route.ts` — a full API route with
   auth, validation, DB writes, and notifications

## Week 7-8 — SQL / Postgres (the brains)

Half this product's logic lives in the database. Learn: joins, indexes,
constraints, then triggers and row-level security (RLS).

Resource: https://pgexercises.com then Supabase docs on RLS
(https://supabase.com/docs/guides/database/postgres/row-level-security).

Read in this repo: `supabase/schema.sql`, then migrations `0030` (a full
table with RLS policies, well commented), `0054` and `0057` (the automation
triggers that advance deal phases). These three teach more than any course.

## Week 9-10 — React Native / Expo (the mobile app)

If you know React this is mostly "View instead of div". Learn: core
components, StyleSheet, expo-router file-based navigation.

Resource: https://docs.expo.dev/tutorial/introduction/

Read in this repo: `mobile/app/(realtor)/_layout.tsx` (the tab bar — and the
comment about the junk-tab bug), `mobile/app/(realtor)/clients/[id]/add-date.tsx`
(a complete simple screen), `mobile/lib/queries.ts` (how data loads).

## The graduation project (do it WITHOUT AI)

Build "showing notes" end to end by hand:
1. Migration 0059: add a `private_notes text` column to `showings`.
2. API: accept it in `/api/showings/schedule` and a new update route.
3. Web: textarea in the showing modal, display on the workspace.
4. Mobile: same field on the showings screen.
5. Build both apps, test, commit, deploy.

It will take you days. That's the point. When it ships, you're no longer a
passenger in this codebase.

## Rules that make this work

- Type every example yourself. No copy-paste. Muscle memory is real.
- When AI (me) builds something for you, read the diff (`git show`) and
  don't move on until you could explain every changed file.
- One hour a day beats seven hours on Saturday.
- Keep shipping with AI in parallel - the business doesn't stop. Just read
  what ships.

## Notes (yours)

- 
