# Realtor Portal — Deployment & Branded Email

End-to-end: get the admin live on a public URL with custom-branded emails.

---

## 1. Push to GitHub

```bash
cd ~/RealtorPortal
git init
git add .
git commit -m "Initial commit"
```

Go to github.com/new → name: `realtor-portal` → **Private** → **Create repository**.

Then push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/realtor-portal.git
git branch -M main
git push -u origin main
```

> **Important:** before pushing, double-check there are no secret keys in `admin/.env.local` or `mobile/.env` that you don't want public. The `.env` files should be in `.gitignore`. If they aren't:
> ```bash
> echo "admin/.env.local" >> .gitignore
> echo "mobile/.env"      >> .gitignore
> git rm --cached admin/.env.local mobile/.env 2>/dev/null
> git commit -am "ignore env files"
> ```

---

## 2. Deploy admin/ to Vercel (~3 min)

1. Go to vercel.com → **Sign up** with your GitHub account
2. Click **Add New → Project**
3. Pick the `realtor-portal` repo
4. **Root Directory** → click **Edit** → choose `admin`
5. Framework preset auto-detects Next.js — leave as-is
6. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://epagiepzartckjqzbsxi.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (your anon key)
   - `SUPABASE_SERVICE_ROLE_KEY` = (your service role key)
   - `NEXT_PUBLIC_SITE_URL` = (leave blank for now; we'll set it after we know the URL)
7. Click **Deploy**

After ~90 seconds, Vercel gives you a URL like `realtor-portal-xxx.vercel.app`. The marketing site is live.

8. Copy that URL, go back to **Settings → Environment Variables**, set `NEXT_PUBLIC_SITE_URL` = `https://realtor-portal-xxx.vercel.app`, then click **Deployments → Redeploy**.

### Add a custom domain (optional, $12/yr)

If you want it at `realtorportal.app` (or any domain you own):
- Buy the domain on Cloudflare (cheapest) or Namecheap
- In Vercel project → **Settings → Domains** → add the domain
- Vercel shows DNS records to add at your registrar
- Wait ~5 min for DNS to propagate
- Vercel auto-issues an HTTPS certificate

---

## 3. Set up Resend for branded emails (~5 min, free tier)

### 3a. Sign up

1. Go to resend.com → sign up (no credit card required)
2. After signup, you're on the dashboard

### 3b. Add your domain

You need a domain to send from. Two options:

**Option A — Use parallelstudios.co (you own this).**
1. In Resend, click **Domains → Add Domain**
2. Enter `parallelstudios.co`
3. Resend shows DNS records (TXT, CNAME, MX) to add at wherever your domain is registered
4. Add them, click **Verify** in Resend
5. Once verified, you can send from `noreply@parallelstudios.co`

**Option B — Skip domain verification, use Resend's testing domain.**
- Free, instant, but emails come from `onboarding@resend.dev` and look spammy
- Fine for testing, not for real customers

### 3c. Create an SMTP credential

1. In Resend → **API Keys → Create API Key** → name it `supabase-smtp` → **Full access** → click create
2. Copy the key (starts with `re_...`) — you only see it once

### 3d. Wire Resend into Supabase Auth

1. Go to your Supabase project → **Project Settings → Auth → SMTP Settings**
2. Toggle **Enable Custom SMTP** ON
3. Fill in:
   - **Sender email**: `noreply@parallelstudios.co` (or whatever domain you verified)
   - **Sender name**: `Realtor Portal` (this is the default; we'll override per-email below)
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: (the API key you copied — starts with `re_...`)
   - **Minimum interval between emails**: `0` (Resend handles its own rate limiting)
4. Click **Save**

Now Supabase sends ALL auth emails (signup confirm, magic link, password reset) through Resend, with `noreply@parallelstudios.co` as the sender.

---

## 4. Make the email show the firm name as the sender

By default the FROM name is whatever you set in Supabase SMTP Settings ("Realtor Portal"). To make the recipient see **"Logan Realty"** instead, we customize the email template to pass through a variable that the firm provides on invite.

### 4a. Customize the invite email template

1. In Supabase → **Authentication → Email Templates**
2. Click **Invite user**
3. Replace the subject line:
   ```
   {{ .SiteURL }} — {{ .Data.firm_name }} invited you
   ```
4. Replace the body:
   ```html
   <h2>You're invited to {{ .Data.firm_name }}'s client portal.</h2>
   <p>Hi {{ .Data.full_name }},</p>
   <p>{{ .Data.firm_name }} has invited you to track your real estate transaction in their secure client portal. Click below to download the app and sign in:</p>
   <p>
     <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#0F172A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">
       Accept invitation
     </a>
   </p>
   <p>If the button doesn't work, copy and paste this link:</p>
   <p>{{ .ConfirmationURL }}</p>
   <hr/>
   <p style="color:#888;font-size:12px;">This invitation was sent on behalf of {{ .Data.firm_name }} via Realtor Portal.</p>
   ```
5. Click **Save**

The variables `{{ .Data.firm_name }}` and `{{ .Data.full_name }}` come from the metadata your admin app already passes when calling `auth.admin.inviteUserByEmail` (see `admin/app/dashboard/clients/new/actions.ts`).

### 4b. (Optional) Override the FROM name per-email

Supabase's SMTP layer doesn't natively let you change FROM name per-email. To get **"Logan Realty <noreply@parallelstudios.co>"** as the literal sender (not just inside the email body), you'd need to either:
- Send invites yourself via Resend's API instead of Supabase auth admin invites, OR
- Wait — for v1, having the firm name in the subject line and body is enough. Most users see "From: Realtor Portal · Subject: Logan Realty invited you" and that reads fine.

When you're ready for the per-firm FROM name, ping me and I'll swap the invite flow to call Resend directly.

---

## 5. Sanity check

1. Go to your live admin URL → click **Start free trial** → sign up with a fresh email
2. Check your inbox — confirmation email arrives from `noreply@parallelstudios.co`, not Supabase
3. After confirming, go to **Dashboard → Clients → Invite client** → invite a fake client
4. Open that invite email — subject says "Your Firm Name invited you"

If anything's broken, paste the error and I'll fix.

---

## Cost

- Vercel: $0 (Hobby tier)
- Supabase: $0 (Free tier — 500MB DB, 1GB file storage, 50K monthly active users)
- Resend: $0 (Free tier — 3,000 emails/month, 100/day)
- Domain (optional): ~$12/yr
- Apple Developer (when ready to ship mobile): $99/yr

**Total to launch publicly: $0** (or $12/yr with custom domain)
