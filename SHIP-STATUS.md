# Realtor Portal — Ship Status

_Last updated: 2026-05-10 18:20 PT_

## Pipeline state: SHIPPED to TestFlight

| Stage | Result |
|---|---|
| Latest commit | `92f9912` (auto-fix EAS install babel-preset-expo + @babel/core) |
| EAS build | `1b68498c-5cc3-4d66-b320-a7d529d097f1` — **FINISHED** |
| ASC submission | `72fe0334-9156-44d1-aad0-b70961014832` — **accepted** |
| Apple processing | `21205547-afdc-4168-a32f-6f76c4f472c5` v6 — **VALID** |
| Internal beta group | `786a0ae8-9a09-48b9-be63-cb0665d1e0b9` (`Internal Testers`, hasAccessToAllBuilds=true) |
| Internal tester | `74a9c7c4-a653-4955-ba4b-e1273c146c4a` — turnerlogan@parallelstudios.co — state INVITED |
| "What to Test" notes | `f6992466-3336-41de-a09b-d1cd7cbca39b` — attached |

Apple is sending the TestFlight invitation email to turnerlogan@parallelstudios.co. The build can also be installed by signing into the TestFlight iOS app with that Apple ID.

## Web (Vercel)

| URL | Status |
|---|---|
| `https://realtor-portal-ten.vercel.app/` | HTTP 200 |
| `/login` | HTTP 200 |
| `/signup` | HTTP 200 |
| `/.well-known/apple-app-site-association` | HTTP 200 — `W4K7G5YF5D.com.parallelstudios.realtorportal`, paths `/invite`, `/invite/*` |

## Background watchers

Both auto-loop watchers have **exited cleanly** because the work succeeded:
- `/tmp/eas-loop.sh` — exited 0 after `eas submit` returned 0
- `/tmp/eas-emailer.sh` — exited after sending FINISHED email at 18:02:45
- `/tmp/asc-poll.sh` — never started (build was already VALID by the time we checked)

To re-run the build pipeline on a new commit:

```bash
cd /Users/turnerlogan/RealtorPortal
# make changes, commit, push
nohup /tmp/eas-loop.sh > /tmp/eas-loop-stdout.log 2>&1 &
nohup /tmp/eas-emailer.sh > /dev/null 2>&1 &
```

## Helper scripts

Under `scripts/`:

- `asc-list.py` — list beta groups, testers, latest build
- `asc-users.py` — list ASC team users
- `asc-create-internal-group.py` — create internal beta group (one-shot, already run)
- `asc-add-tester.py` — add Turner to the group (one-shot, already run)
- `asc-add-whatsnew.py` — attach "What to Test" notes to a build (run per build)
- `asc-poll.sh` — generic background poller for processing state

All scripts use the .p8 API key at `/Users/turnerlogan/Downloads/AuthKey_3ST6Z8D74J.p8`.

## Pending Vercel env vars (Turner action)

These currently no-op gracefully when unset:

- `RESEND_API_KEY` — transactional emails (tour confirmations + .ics, message digests)
- `ANTHROPIC_API_KEY` — AI listing description generator (falls back to stub)
- `NEXT_PUBLIC_SENTRY_DSN` — web client error tracking
- `EXPO_PUBLIC_SENTRY_DSN` — mobile error tracking

To set them:

```bash
cd /Users/turnerlogan/RealtorPortal/admin
vercel env add RESEND_API_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add EXPO_PUBLIC_SENTRY_DSN production
vercel --prod
```

## What Turner does next

1. Watch for the TestFlight invitation email from Apple (subject "You're invited to test Realtor Portal"). Tap `Start Testing` on iPhone.
2. Open TestFlight on iPhone → INSTALL.
3. Run through the validation list in the "What to Test" notes (8 items).
4. Reply to me here, or via Dispatch, with anything that needs fixing — auto-loop will rebuild and resubmit.
