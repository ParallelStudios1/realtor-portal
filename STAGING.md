# Testing web changes before they hit production

Production (`realtorportal.parallelstudios.co`) only deploys from the
**`main`** branch. Any other branch gets its own throwaway **preview URL**
from Vercel — same code path, same build, different address.

## The workflow

1. Do work on the `staging` branch:

       git checkout staging
       git merge main          # keep it current
       ...make changes, commit...
       git push origin staging

2. Vercel builds it automatically and comments a URL that looks like:

       https://realtor-portal-git-staging-parallelstudios1s-projects.vercel.app

   Find it in the Vercel dashboard → realtor-portal → Deployments (it's the
   one labeled `staging`, environment "Preview").

3. Click around on that URL until you're satisfied. Production is untouched.

4. Ship it:

       git checkout main
       git merge staging
       git push origin main

## Two things to know

- **The preview shares the production DATABASE.** It's the same app pointed
  at the same Supabase. Test with test accounts (realtor@test.com etc.), not
  by deleting real data. Schema migrations are applied to the shared database
  directly, so a migration is "live" for both preview and production the
  moment it's applied — write migrations to be backward-compatible (add, don't
  drop).
- **Mobile is unchanged by any of this.** TestFlight / Play internal remain
  the preview channel for the apps.
