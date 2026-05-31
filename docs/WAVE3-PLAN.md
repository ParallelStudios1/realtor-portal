# Wave 3 Implementation Plan — Realtor Portal

> Planning artifact only. No code in this document is applied. Every migration is
> written to be idempotent and to follow the existing repo conventions
> (`IF NOT EXISTS`, `DROP POLICY IF EXISTS ... CREATE POLICY`, `current_firm_id()`,
> `is_staff_role()`, `is_firm_admin()`, the `client-docs` Storage bucket, the
> `notify()` / `notifyDealParticipants()` helpers, the `/api/cron/*` + `vercel.json`
> cron pattern, and the Anthropic fetch pattern in `api/ai/listing-description`).

## Conventions discovered in the repo (anchors this plan relies on)

- **Migrations** live in `supabase/migrations/NNNN_*.sql`, last applied is `0032_plan_tier.sql`. New files continue at `0033`+.
- **RLS helpers** (all `SECURITY DEFINER`, `search_path=public`):
  - `public.current_firm_id()` → caller's firm.
  - `public.current_role()` → caller's `user_role`.
  - `public.is_staff_role()` → realtor/firm_admin/super_admin/owner/manager/agent.
  - `public.is_firm_admin()` → owner/firm_admin/super_admin (the **broker gate**).
  - `public.can_collab_on_search(search_id)` → cross-firm collaborator.
  - `public.current_user_email()` → caller email (for `external_email` matches).
- **Notifications**: `admin/lib/notify.ts` → `notify()`, `notifyMany()`, `notifyDealParticipants({searchId, subject, text, html, sms_text, excludeUserId})`. Channels: `email` (`lib/email.ts`, Resend→SMTP→noop), `sms` (`lib/sms.ts`, Twilio REST; gated by `users.sms_opt_in`), push (`api/notifications/send-push`, Expo tokens in `push_tokens`).
- **Cron**: `admin/app/api/cron/drips/route.ts` GET, `Bearer ${CRON_SECRET}` auth, uses `getSupabaseServiceRoleClient()`, drains a due-queue table. Schedule registered in `admin/vercel.json` (`"0 14 * * *"` = 09:00 ET).
- **Queue precedent**: `scheduled_messages` (mig `0024`) — `scheduled_for`, `sent_at IS NULL` partial index, `channel`, `kind`. We extend its `kind` CHECK rather than inventing a parallel queue.
- **Storage**: private bucket `client-docs`, path `{firm_id}/{search_id}/{ts}-{filename}`; `documents` rows have `folder text` (mig 0016). Signed URLs via `service.storage.from('client-docs').createSignedUrl(path, ttl)` (see `api/documents/sign-url`).
- **AI**: `api/ai/listing-description/route.ts` POSTs to `https://api.anthropic.com/v1/messages` with `x-api-key: ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, model `claude-haiku-4-5`, with a no-key deterministic fallback. `resolveCaller(req)` supports both cookie session (`getMe()`) and mobile `Authorization: Bearer`.
- **E-sign**: `admin/lib/docusign.ts` (`createDocusignEnvelope`, JWT grant, soft-skip when `DOCUSIGN_*` unset) + `api/docusign/create/route.ts`. `client_searches.docusign_envelope_url` already stores the result.
- **important_dates**: `(id, firm_id, search_id, label, date, notes, event_time, location, things_to_bring, created_by, created_at, updated_at)`. Has `dates_read` / `dates_staff_write` RLS.
- **Roles for "broker"**: use `owner` / `firm_admin` (via `is_firm_admin()`). "Agent" = `realtor`/`agent`.

---

# Feature 1 — Deadline Auto-Reminders / Escalation Engine

**Goal:** Turn `important_dates` into a deadline engine. Each date can carry one or
more relative reminder offsets (e.g. "3 days before", "morning of"). A daily cron
materializes due reminders into the existing `scheduled_messages` queue (so the
`drips` dispatcher delivers them), tracks acknowledgement, escalates unacknowledged
/ overdue items, and surfaces an **Overdue & At-Risk** panel to brokers.

### (a) Migration SQL — `0033_deadline_reminders.sql`

```sql
-- 0033 — Deadline reminders + escalation on important_dates.

-- 1. Per-date reminder configuration (multiple offsets per date).
--    offset_days: whole days BEFORE the date (0 = morning of, negative = after).
--    Channels reuse the scheduled_messages channel vocabulary.
CREATE TABLE IF NOT EXISTS public.date_reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  date_id       uuid NOT NULL REFERENCES public.important_dates(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  offset_days   integer NOT NULL DEFAULT 3,         -- fire N days before `date`
  at_time       time NOT NULL DEFAULT '09:00',      -- local-ish send time
  channels      text[] NOT NULL DEFAULT ARRAY['email','in_app'],
  audience      text NOT NULL DEFAULT 'staff'
                  CHECK (audience IN ('staff','client','all_parties')),
  escalate      boolean NOT NULL DEFAULT true,      -- escalate if not acked + overdue
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS date_reminders_date_idx   ON public.date_reminders(date_id);
CREATE INDEX IF NOT EXISTS date_reminders_search_idx ON public.date_reminders(search_id);

-- 2. Acknowledgement / completion + escalation bookkeeping on the date itself.
ALTER TABLE public.important_dates
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS owner_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.important_dates.owner_user_id IS
  'Agent responsible for hitting this deadline; escalation pings their broker.';

-- 3. Idempotency ledger so the cron never double-queues the same reminder.
--    One row per (reminder, fire_date). UNIQUE makes re-runs a no-op.
CREATE TABLE IF NOT EXISTS public.date_reminder_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id   uuid NOT NULL REFERENCES public.date_reminders(id) ON DELETE CASCADE,
  fire_on       date NOT NULL,
  queued_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, fire_on)
);

-- 4. Extend scheduled_messages.kind to accept escalation rows.
ALTER TABLE public.scheduled_messages
  DROP CONSTRAINT IF EXISTS scheduled_messages_kind_check;
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_kind_check
  CHECK (kind IN ('drip','holiday','reminder','custom','deadline','escalation'));

-- 5. RLS — mirror dates_staff_write / dates_read.
ALTER TABLE public.date_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS date_reminders_staff ON public.date_reminders;
CREATE POLICY date_reminders_staff ON public.date_reminders FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
DROP POLICY IF EXISTS date_reminders_collab ON public.date_reminders;
CREATE POLICY date_reminders_collab ON public.date_reminders FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));

ALTER TABLE public.date_reminder_runs ENABLE ROW LEVEL SECURITY;
-- runs are written only by the service-role cron; no client policy needed,
-- but allow staff read for debugging visibility.
DROP POLICY IF EXISTS date_reminder_runs_read ON public.date_reminder_runs;
CREATE POLICY date_reminder_runs_read ON public.date_reminder_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.date_reminders r
    WHERE r.id = date_reminder_runs.reminder_id
      AND r.firm_id = public.current_firm_id() AND public.is_staff_role()
  ));
```

### (b) New / changed files

| File | Purpose |
|---|---|
| `supabase/migrations/0033_deadline_reminders.sql` | Reminder config, ack/escalation columns, idempotency ledger, kind CHECK widening. |
| `admin/app/api/cron/deadlines/route.ts` | Daily cron: materialize due reminders → `scheduled_messages`; detect overdue → escalation rows. |
| `admin/lib/deadlines.ts` | Pure helpers: compute fire dates, build reminder/escalation message bodies, resolve broker for an agent. |
| `admin/app/dashboard/deals/[id]/actions.ts` (new or extend) | Server actions: `addDateReminderAction`, `removeDateReminderAction`, `completeImportantDateAction`, `acknowledgeImportantDateAction`. |
| `admin/app/dashboard/deals/[id]/DealWorkspace.tsx` (edit) | Add per-date reminder chips + "Mark done" / "Acknowledge" controls. |
| `admin/components/DeadlineReminderEditor.tsx` | Small popover to add offsets/channels/audience to a date. |
| `admin/app/dashboard/oversight/page.tsx` | Broker **Overdue & At-Risk** dashboard (read-gated to `is_firm_admin`). |
| `admin/vercel.json` (edit) | Add second cron entry for `/api/cron/deadlines`. |

### (c) Server actions / API routes

- `POST /api/cron/deadlines` *(GET handler, Bearer CRON_SECRET — same auth as drips)*. Logic:
  1. Pull `date_reminders` joined to `important_dates` where the **fire date** (`date - offset_days`) is **today** (server tz; document the ET assumption) and there is no `date_reminder_runs` row for `(reminder_id, today)`.
  2. For each, insert one `scheduled_messages` row per resolved recipient (`channel` from `reminder.channels`, `kind='deadline'`, `scheduled_for=now()`, body from `lib/deadlines.ts`). Resolve recipients by `audience`: `staff`→owner/realtor; `client`→principal client; `all_parties`→reuse `notifyDealParticipants` recipient resolution.
  3. Insert the `date_reminder_runs` row (UNIQUE guards against double-send).
  4. **Escalation pass**: select `important_dates` where `date < today`, `completed_at IS NULL`, `acknowledged_at IS NULL`, `escalated_at IS NULL`, and at least one reminder has `escalate=true`. For each, resolve the agent's broker (`is_firm_admin` user in the same firm, or `firms.owner`), queue a `kind='escalation'` message to the broker, and set `important_dates.escalated_at=now()`.
  5. Let the existing `/api/cron/drips` dispatcher deliver the queued rows (it already handles email/sms/in_app + `sms_opt_in` gating). **Sequence the deadlines cron a few minutes before drips** so same-day rows go out that morning.
- Server actions (`'use server'`, `getMe()` + `getSupabaseServiceRoleClient()`, plan-gate via `isFirmPlanActive` like existing actions): manage reminders and mark dates done/acknowledged (which clears them from the at-risk list and writes an `activities` row).

### (d) UI surfaces

- **Deal workspace** (`DealWorkspace.tsx`): each important date gets reminder chips ("3d before · email", "morning of · SMS"), an owner selector, and Mark Done / Acknowledge buttons. Overdue dates render red with a "⚠ overdue" tag.
- **Broker oversight page** (`/dashboard/oversight`, `is_firm_admin` only): firm-wide table of overdue + at-risk (≤2 days out, unacknowledged) deadlines grouped by agent, with deep links into each deal. This is the "broker-visibility of overdue items" requirement.
- **Mobile**: surface reminder chips read-only in `mobile/app` deal detail (optional, fast-follow).

### (e) Risks + compliance/legal notes

- **Timezone**: cron is tz-naive (server/ET). A "3 days before closing" reminder near a DST boundary or for a Pacific-coast firm could fire a day off. Mitigation: store firm tz on `firms` (fast-follow) and compute fire dates in that tz; for v1 document the ET assumption.
- **Idempotency**: the `date_reminder_runs` UNIQUE is the only thing preventing duplicate sends if the cron runs twice — keep it.
- **SMS consent**: drips dispatcher already enforces `users.sms_opt_in`; do not bypass it. TCPA/telephone-consent risk if you SMS clients who didn't opt in.
- **Escalation = not legal advice**: an unacked "inspection deadline" reminder is an operational nudge, not a guarantee. Add boilerplate ("informational, verify in your contract") to deadline templates.
- **Notification storms**: cap recipients and dedupe per date per day; reuse `notifyDealParticipants`'s dedupe-by-email logic.

### (f) Effort: **M** (one migration, one cron route, one helper, modest UI, one new broker page).

---

# Feature 2 — Showing-Feedback Loop

**Goal:** After a showing, the buyer submits structured feedback (rating + free text +
interest level). The listing/selling side gets a periodic **digest** email. Builds on
`showings` (0030), `houses`, and the rating shape established by `house_ratings`.

### (a) Migration SQL — `0034_showing_feedback.sql`

```sql
-- 0034 — Showing feedback + seller digest tracking.

CREATE TABLE IF NOT EXISTS public.showing_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  showing_id    uuid NOT NULL REFERENCES public.showings(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  house_id      uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  -- Author may be a signed-in client OR an external attendee (token link).
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name   text,
  author_email  text,
  stars         integer CHECK (stars BETWEEN 1 AND 5),
  interest      text CHECK (interest IN ('not_interested','maybe','interested','offer_likely')),
  price_opinion text CHECK (price_opinion IN ('overpriced','about_right','underpriced')),
  liked         text,
  concerns      text,
  -- Seller-visible vs. private-to-agent (buyer can request privacy).
  share_with_seller boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (showing_id, author_email)   -- one feedback per attendee per showing
);
CREATE INDEX IF NOT EXISTS showing_feedback_house_idx   ON public.showing_feedback(house_id);
CREATE INDEX IF NOT EXISTS showing_feedback_search_idx  ON public.showing_feedback(search_id);
CREATE INDEX IF NOT EXISTS showing_feedback_showing_idx ON public.showing_feedback(showing_id);

-- Track that we asked for feedback + that a seller digest was sent.
ALTER TABLE public.showings
  ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_digest_sent_at timestamptz;

ALTER TABLE public.showing_feedback ENABLE ROW LEVEL SECURITY;

-- Staff: full read/write on their firm's feedback (mirrors showings_staff_all).
DROP POLICY IF EXISTS showing_feedback_staff ON public.showing_feedback;
CREATE POLICY showing_feedback_staff ON public.showing_feedback FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- Principal client (buyer): insert + read their own deal's feedback.
DROP POLICY IF EXISTS showing_feedback_client_write ON public.showing_feedback;
CREATE POLICY showing_feedback_client_write ON public.showing_feedback FOR ALL
  USING (search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid()))
  WITH CHECK (search_id IN (SELECT id FROM public.client_searches WHERE client_id = auth.uid()));

-- Cross-firm collaborators (the buyer-side agent on a co-rep deal).
DROP POLICY IF EXISTS showing_feedback_collab ON public.showing_feedback;
CREATE POLICY showing_feedback_collab ON public.showing_feedback FOR ALL
  USING (public.can_collab_on_search(search_id))
  WITH CHECK (public.can_collab_on_search(search_id));
```

> Note: external (non-user) attendees submit via a **signed token link** that hits a
> service-role API route (no RLS path needed); RLS above covers the in-app cases.

### (b) New / changed files

| File | Purpose |
|---|---|
| `supabase/migrations/0034_showing_feedback.sql` | `showing_feedback` table + digest bookkeeping on `showings`. |
| `admin/lib/feedbackTokens.ts` | Sign/verify HMAC tokens for external-attendee feedback links (reuse `CRON_SECRET`-style server secret or `SUPABASE_JWT_SECRET`). |
| `admin/app/api/showings/feedback/route.ts` | Public POST: external attendee submits feedback via signed token (service-role insert). |
| `admin/app/feedback/[token]/page.tsx` | Public mobile-friendly feedback form (no login). |
| `admin/app/dashboard/deals/[id]/actions.ts` (extend) | `submitShowingFeedbackAction` (in-app buyer), `requestShowingFeedbackAction` (agent triggers ask). |
| `admin/app/api/cron/showing-digests/route.ts` | Cron: build per-seller digest of new feedback, email via `lib/email.ts`, stamp `feedback_digest_sent_at`. |
| `admin/lib/showingDigest.ts` | Render the digest HTML/text from a set of feedback rows. |
| `admin/app/dashboard/deals/[id]/DealWorkspace.tsx` (edit) | Show feedback under each showing + "Request feedback" button. |
| `mobile/app/.../showing-feedback.tsx` | In-app buyer feedback form (mobile parity). |
| `admin/vercel.json` (edit) | Cron entry for `/api/cron/showing-digests`. |

### (c) Server actions / API routes

- **Submit (in-app buyer)**: `submitShowingFeedbackAction({ showingId, stars, interest, price_opinion, liked, concerns, share_with_seller })` — `getMe()`, derive `firm_id/search_id/house_id` from the showing server-side, upsert into `showing_feedback`, write an `activities` row, optionally `notify` the agent.
- **Request feedback**: `requestShowingFeedbackAction({ showingId })` — sets `feedback_requested_at`, and for each attendee with an email mints a signed token and sends a "How was the showing?" email (or in-app to the principal client). Reuses `notify()`.
- **External submit**: `POST /api/showings/feedback` body `{ token, ...fields }` — verify token (`feedbackTokens.ts`), service-role insert keyed on `(showing_id, author_email)`. Always returns JSON.
- **Seller digest cron**: `GET /api/cron/showing-digests` (Bearer CRON_SECRET). For each **seller-side deal** (`client_searches.kind in ('seller','both')`) that has `showing_feedback` rows with `share_with_seller=true` created since the last digest, group by deal/house, render via `lib/showingDigest.ts`, email the seller (principal client of the seller deal) + listing agent, stamp `feedback_digest_sent_at` on the covered showings. Run daily or weekly (config in `vercel.json`).

### (d) UI surfaces

- **Public feedback form** (`/feedback/[token]`): stars, interest dropdown, price opinion, "what they liked", "concerns", privacy toggle. One screen, submits to the API route.
- **In-app buyer**: same form inside the client deal view + mobile screen.
- **Agent deal workspace**: each completed showing lists its feedback (private + shareable), with a "Request feedback" action and an indicator that the seller digest was sent.
- **Seller**: receives the digest email; (optional) a read-only "Showing Feedback" tab in the seller's client view that respects `share_with_seller`.

### (e) Risks + compliance/legal notes

- **Buyer-side confidentiality**: a buyer's agent generally should not leak the buyer's true ceiling to the seller. The `share_with_seller` flag + `price_opinion` being coarse (not a number) mitigates; default `share_with_seller=true` is a *product* choice — consider defaulting buyer-authored feedback to **false** and let the buyer's agent opt in. Flag for legal/brokerage policy review.
- **Token link security**: tokens must be single-purpose, expiring, and scoped to one `showing_id`; verify server-side, rate-limit the public route.
- **PII**: external attendee emails/names land in `showing_feedback`; include them in the retention/export rules from Feature 3.
- **Spam/abuse**: public POST route needs a basic rate limit and token-required gate.

### (f) Effort: **M** (one migration, two routes + one cron, digest renderer, public form, workspace edits, mobile screen).

---

# Feature 3 — Broker Compliance

**Goal:** Three pillars — (1) an **immutable, append-only audit trail** (who/what/when),
(2) **required-document checklists per deal type** with a **broker approval gate**, and
(3) **document retention + one-click closed-file export** (zip of a deal's documents).

### (a) Migration SQL — `0035_compliance.sql`

```sql
-- 0035 — Compliance: audit log, doc checklists + approval gate, retention/export.

-- ============ 1. Append-only audit log ============
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firm_id      uuid REFERENCES public.firms(id) ON DELETE SET NULL,  -- SET NULL, never CASCADE: log outlives the firm
  search_id    uuid,                                                 -- no FK: keep audit rows after a deal is deleted
  actor_user_id uuid,                                                -- no FK on purpose (preserve after user deletion)
  actor_email  text,
  actor_role   text,
  action       text NOT NULL,        -- e.g. 'document.upload','date.complete','approval.granted'
  entity_type  text,                 -- 'document','important_date','deal','approval'
  entity_id    text,
  summary      text,                 -- human-readable one-liner
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_firm_created_idx   ON public.audit_log(firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_search_idx         ON public.audit_log(search_id);

-- Append-only enforcement: block UPDATE/DELETE at the DB level.
CREATE OR REPLACE FUNCTION public._audit_log_no_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_log_block_update ON public.audit_log;
CREATE TRIGGER audit_log_block_update BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public._audit_log_no_mutate();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- Read-only for firm admins/brokers; writes happen via service role only.
DROP POLICY IF EXISTS audit_log_broker_read ON public.audit_log;
CREATE POLICY audit_log_broker_read ON public.audit_log FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin());
-- No INSERT/UPDATE/DELETE policy → only service role (cron + server actions) can write.

-- ============ 2. Document checklists + approval gate ============
-- Template: required docs per deal kind, per firm (seeded defaults overridable).
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  deal_kind   text NOT NULL CHECK (deal_kind IN ('buyer','seller','both')),
  label       text NOT NULL,                 -- "Buyer Agency Agreement"
  doc_folder  text,                          -- expected folder (matches documents.folder)
  required    boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_templates_firm_idx ON public.checklist_templates(firm_id, deal_kind);

-- Per-deal checklist item status.
CREATE TABLE IF NOT EXISTS public.deal_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id     uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  label         text NOT NULL,
  required      boolean NOT NULL DEFAULT true,
  document_id   uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','provided','waived','n_a')),
  waived_reason text,
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, label)
);
CREATE INDEX IF NOT EXISTS deal_checklist_items_search_idx ON public.deal_checklist_items(search_id);

-- Broker approval gate (one approval record per deal milestone).
CREATE TABLE IF NOT EXISTS public.deal_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id    uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  gate         text NOT NULL DEFAULT 'file_complete'
                  CHECK (gate IN ('file_complete','pre_close','closed')),
  status       text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  decided_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at   timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, gate)
);
CREATE INDEX IF NOT EXISTS deal_approvals_search_idx ON public.deal_approvals(search_id);

-- ============ 3. Retention metadata ============
ALTER TABLE public.client_searches
  ADD COLUMN IF NOT EXISTS closed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until  date,        -- closed_at + firm retention window
  ADD COLUMN IF NOT EXISTS file_locked      boolean NOT NULL DEFAULT false; -- export-ready, no edits
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS retention_years  integer NOT NULL DEFAULT 7;     -- common RE record-keeping minimum

-- RLS for checklist + approvals.
ALTER TABLE public.checklist_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_approvals       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_templates_admin ON public.checklist_templates;
CREATE POLICY checklist_templates_admin ON public.checklist_templates FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
DROP POLICY IF EXISTS checklist_templates_read ON public.checklist_templates;
CREATE POLICY checklist_templates_read ON public.checklist_templates FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());

DROP POLICY IF EXISTS deal_checklist_items_staff ON public.deal_checklist_items;
CREATE POLICY deal_checklist_items_staff ON public.deal_checklist_items FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());

-- Agents can SEE approvals; only brokers can WRITE the decision.
DROP POLICY IF EXISTS deal_approvals_read ON public.deal_approvals;
CREATE POLICY deal_approvals_read ON public.deal_approvals FOR SELECT
  USING (firm_id = public.current_firm_id() AND public.is_staff_role());
DROP POLICY IF EXISTS deal_approvals_broker_write ON public.deal_approvals;
CREATE POLICY deal_approvals_broker_write ON public.deal_approvals FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_firm_admin())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_firm_admin());
```

### (b) New / changed files

| File | Purpose |
|---|---|
| `supabase/migrations/0035_compliance.sql` | Audit log (append-only), checklist templates + per-deal items, broker approval gate, retention columns. |
| `supabase/migrations/0036_compliance_seed_defaults.sql` | Optional: seed default `checklist_templates` per firm/deal_kind. |
| `admin/lib/audit.ts` | **Central** `logAudit({firmId, searchId, actor, action, entityType, entityId, summary, metadata})` helper (service-role insert). The single chokepoint for all audit writes. |
| `admin/app/dashboard/deals/[id]/actions.ts` (extend) | `upsertChecklistItemAction`, `requestBrokerApprovalAction`, `decideApprovalAction` (broker), `closeFileAction`. |
| `admin/app/api/deals/[id]/export/route.ts` | One-click closed-file export: streams a zip of the deal's documents + a manifest + audit trail PDF/CSV. |
| `admin/lib/zip.ts` | Thin wrapper around a zip lib (`archiver` or `jszip`) to assemble the export stream. |
| `admin/app/dashboard/deals/[id]/CompliancePanel.tsx` | Checklist + approval gate UI in the workspace. |
| `admin/app/dashboard/oversight/page.tsx` (shared w/ F1) | Broker view: pending approvals + non-compliant files firm-wide. |
| `admin/app/dashboard/firm/checklists/page.tsx` | Broker config of `checklist_templates`. |
| `admin/lib/auditTaps.ts` (or inline) | Add `logAudit()` calls at: document upload/delete, date complete, approval decisions, file close, export, e-sign send. |

### (c) Server actions / API routes — where to log audit events

- **Central helper**: `admin/lib/audit.ts#logAudit()` — every compliance-relevant mutation calls it. Because RLS blocks non-service-role inserts and a trigger blocks UPDATE/DELETE, the log is append-only and tamper-evident in practice.
- **Tap points** (call `logAudit` right after the mutation succeeds):
  - Document upload (`documents` insert path) and `documents/notify`.
  - `completeImportantDateAction` / `acknowledgeImportantDateAction` (F1).
  - `decideApprovalAction` (approve/reject) and `requestBrokerApprovalAction`.
  - `closeFileAction`, `exportFileAction`.
  - `api/docusign/create` (envelope sent) + envelope status callbacks (F4).
- **Approval gate**: `requestBrokerApprovalAction` creates a `deal_approvals(gate='file_complete', status='pending')` only when all `required` checklist items are `provided`/`waived`; `decideApprovalAction` (broker-only, `is_firm_admin`) sets `approved`/`rejected`. A deal can be marked closeable only after `file_complete` is `approved`.
- **Close + retention**: `closeFileAction` sets `closed_at=now()`, `retention_until = closed_at + firms.retention_years`, `file_locked=true`, and logs it. Locked files reject further document writes (enforce in the upload action, not RLS, to keep messaging clear).
- **Export route**: `GET /api/deals/[id]/export` — broker/owning-agent only; resolves all `documents` for the deal, fetches bytes from `client-docs` via service-role, zips them with a `manifest.json` (doc list + checksums) and an `audit-trail.csv` rendered from `audit_log`, streams `application/zip`. Logs an `export` audit event.

### (d) UI surfaces

- **Compliance panel** (deal workspace): checklist with status chips, "attach document" links each item to a `documents` row, broker **Approve / Reject** buttons (visible only to `is_firm_admin`), and a **Close File** action gated on approval.
- **Broker oversight** (`/dashboard/oversight`): pending approvals queue + list of files missing required docs (shared page with F1's overdue panel).
- **Firm settings → Checklists** (`/dashboard/firm/checklists`): broker edits required-doc templates per deal kind.
- **Audit trail viewer**: read-only timeline on the deal (broker-visible) sourced from `audit_log`.
- **Export button**: on closed deals, "Download closed file (.zip)".

### (e) Risks + compliance/legal notes

- **Append-only is product-level, not cryptographic**: the trigger blocks UPDATE/DELETE and RLS blocks non-service-role writes, but a Postgres superuser/service-role can still mutate. For true immutability, document that audit integrity relies on restricted service-role custody; a later upgrade could add a hash chain (`prev_hash`/`row_hash`) per row.
- **Retention**: `retention_years` defaults to 7 (a common US real-estate record-keeping floor) but **varies by state and brokerage**; make it firm-configurable and surface the value. Don't auto-delete on `retention_until` in v1 — flag for purge, require explicit action.
- **Export completeness**: the zip must include exactly what's in `documents` plus the audit trail; missing-doc gaps should be listed in the manifest, not silently dropped (E&O exposure).
- **Access control**: export and audit views must be broker/owning-agent only; never expose another firm's data (always filter by `current_firm_id()`).
- **Storage egress**: large zips streamed through the serverless function can hit memory/time limits; stream with `archiver` rather than buffering, and consider signed-URL bundling for very large files.

### (f) Effort: **L** (two migrations, central audit helper + taps across the app, checklist + approval UI, broker config page, streaming export route, oversight dashboard).

---

# Feature 4 — E-Sign (real) + Contract-Date AI Extraction

**Goal:** (A) Make DocuSign envelopes *actually send* once `DOCUSIGN_*` env is set,
with status tracking back into the app; (B) an AI endpoint that reads an uploaded
purchase agreement, extracts dates/parties/contingencies, and proposes
`important_dates` rows — with a **mandatory human-confirm step** before anything is written.

## 4A — E-Sign (DocuSign) made real

The plumbing exists (`lib/docusign.ts`, `api/docusign/create`, `client_searches.docusign_envelope_url`). What's missing is **status tracking** and the **env/secrets** to flip it on.

### (a) Migration SQL — `0037_esign_envelopes.sql`

```sql
-- 0037 — Track DocuSign envelopes + their recipient/signing status.
CREATE TABLE IF NOT EXISTS public.esign_envelopes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id        uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id      uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  document_id    uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  provider       text NOT NULL DEFAULT 'docusign',
  envelope_id    text NOT NULL,
  envelope_url   text,
  status         text NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('created','sent','delivered','completed','declined','voided')),
  recipients     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name,email,role,status}]
  completed_at   timestamptz,
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, envelope_id)
);
CREATE INDEX IF NOT EXISTS esign_envelopes_search_idx ON public.esign_envelopes(search_id);

ALTER TABLE public.esign_envelopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS esign_envelopes_staff ON public.esign_envelopes;
CREATE POLICY esign_envelopes_staff ON public.esign_envelopes FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
-- Webhook writes are service-role (no policy needed for the callback path).
```

### (b) New / changed files

| File | Purpose |
|---|---|
| `supabase/migrations/0037_esign_envelopes.sql` | Persist envelopes + recipient/signing status. |
| `admin/app/api/docusign/create/route.ts` (edit) | After `createDocusignEnvelope` success, INSERT an `esign_envelopes` row + `logAudit('esign.sent')`. |
| `admin/app/api/docusign/webhook/route.ts` | DocuSign Connect webhook: verify HMAC, update envelope `status`/`recipients`/`completed_at`, notify parties, `logAudit`. |
| `admin/lib/docusign.ts` (edit) | Add `getEnvelopeStatus(envelopeId)` (poll fallback when Connect isn't configured) using existing JWT token flow. |
| `admin/app/dashboard/deals/[id]/EsignPanel.tsx` | UI: send for signature, show envelope status, link to DocuSign, manual-URL fallback (unchanged behavior when unconfigured). |

### (c) Envelope flow + minimum env/secrets

**Flow (when configured):**
1. Agent picks a deal document (a `documents` row in `client-docs`) → `EsignPanel` → `POST /api/docusign/create` with `{ searchId, documentUrl, documentName }`. `documentUrl` is a short-lived signed URL from `api/documents/sign-url`.
2. `createDocusignEnvelope()` mints a JWT user token (cached), fetches the PDF bytes server-side, builds signers (client + realtor) / CCs (attorney + participants), creates the envelope with `status:'sent'` and `signHere` anchor `/sn1/`.
3. On success: store `client_searches.docusign_envelope_url` (existing) **and** insert `esign_envelopes`; `logAudit('esign.sent')`; `notifyDealParticipants` ("Document sent for signature").
4. **DocuSign Connect** posts status changes to `/api/docusign/webhook` → verify HMAC → update `esign_envelopes` + notify on `completed`/`declined`. If Connect isn't set up, a light poll via `getEnvelopeStatus` on panel load keeps status fresh.

**Minimum env/secrets** (already read by `lib/docusign.ts`):
- `DOCUSIGN_BASE_URL` (e.g. `https://demo.docusign.net/restapi`)
- `DOCUSIGN_OAUTH_BASE` (e.g. `https://account-d.docusign.com`)
- `DOCUSIGN_INTEGRATION_KEY`
- `DOCUSIGN_USER_ID` (API user GUID)
- `DOCUSIGN_ACCOUNT_ID`
- `DOCUSIGN_RSA_PRIVATE_KEY` (PEM; `\n`-escaped allowed)
- **New for webhook**: `DOCUSIGN_CONNECT_HMAC_KEY` (to verify Connect callbacks).
- **One-time setup**: in DocuSign admin, grant the integration **JWT impersonation consent** for `DOCUSIGN_USER_ID` (the consent URL must be visited once), and configure a Connect webhook → `/api/docusign/webhook` with HMAC signing on. Document this in `DEPLOY.md`.

### (e) Risks + compliance/legal notes (4A)

- **JWT consent gotcha**: JWT grant fails until the API user grants consent once. Surface a clear error and document the consent URL.
- **Demo vs prod**: `account-d.`/`demo.docusign.net` are demo; production needs go-live promotion of the integration key. Don't ship demo creds.
- **Webhook auth**: verify the Connect HMAC; an unauthenticated webhook that flips envelope status is a tampering vector.
- **E-sign legality (ESIGN/UETA)**: rely on DocuSign's compliant flow; capture and store the **Certificate of Completion** (include it in the F3 export). Don't roll your own signature capture.
- **PII in transit**: the document bytes are fetched server-side and base64'd to DocuSign — fine, but ensure the signed-URL TTL is short.

### (f) Effort (4A): **M** (one migration, webhook route, status helper, panel; the hard parts are env/consent + Connect setup, not code).

## 4B — Contract-Date AI Extraction (upload → extract → confirm)

Reuses the `api/ai/listing-description` Anthropic pattern (same headers, `resolveCaller`, no-key fallback). **Nothing is written to `important_dates` without explicit human confirmation.**

### (a) Migration SQL — `0038_contract_extractions.sql`

```sql
-- 0038 — AI contract extraction proposals (staged, never auto-applied).
CREATE TABLE IF NOT EXISTS public.contract_extractions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  search_id    uuid NOT NULL REFERENCES public.client_searches(id) ON DELETE CASCADE,
  document_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed','confirmed','discarded')),
  -- Raw model output, kept for audit/debugging.
  raw          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Normalized proposals the UI renders for confirmation.
  proposed_dates    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{label,date,confidence,source_snippet}]
  proposed_parties  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{role,name,email}]
  contingencies     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{type,deadline,notes}]
  confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_extractions_search_idx ON public.contract_extractions(search_id);

ALTER TABLE public.contract_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_extractions_staff ON public.contract_extractions;
CREATE POLICY contract_extractions_staff ON public.contract_extractions FOR ALL
  USING (firm_id = public.current_firm_id() AND public.is_staff_role())
  WITH CHECK (firm_id = public.current_firm_id() AND public.is_staff_role());
```

### (b) New / changed files

| File | Purpose |
|---|---|
| `supabase/migrations/0038_contract_extractions.sql` | Stage AI proposals before any human-confirmed write. |
| `admin/app/api/ai/contract-extract/route.ts` | Read an uploaded PDF, call Anthropic, persist a `proposed` extraction. Never writes `important_dates`. |
| `admin/lib/pdfText.ts` | Extract text from the contract PDF (e.g. `pdf-parse`) before sending to the model (or pass the document via the model's document input). |
| `admin/app/dashboard/deals/[id]/ExtractReview.tsx` | Confirmation UI: editable proposed dates/parties/contingencies with checkboxes; "Confirm & add to deal". |
| `admin/app/dashboard/deals/[id]/actions.ts` (extend) | `confirmExtractionAction` — writes the human-approved subset to `important_dates`, sets status `confirmed`, `logAudit`. |

### (c) Upload → extract → confirm flow (mandatory human-confirm)

1. **Upload**: agent uploads the purchase agreement through the existing `documents`/`client-docs` path (or selects an existing deal document).
2. **Extract**: `POST /api/ai/contract-extract` `{ searchId, documentId | storage_path }` — `resolveCaller` (cookie or Bearer), firm-scope check, fetch the PDF via service-role signed URL, `pdfText.ts` → text. Call Anthropic (`x-api-key: ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, JSON-only system prompt) asking for `{ dates:[{label,date,confidence,source_snippet}], parties:[...], contingencies:[...] }`. **No-key fallback**: return an empty proposal set with a "manual entry" notice (mirrors the listing-description stub). Persist a `contract_extractions` row with `status='proposed'`. Return the proposals. **This route writes only to `contract_extractions`, never to `important_dates`.**
3. **Confirm (mandatory)**: `ExtractReview` shows each proposed date/party/contingency, pre-checked but **fully editable**, with the source snippet and confidence. The agent edits/unchecks, then submits `confirmExtractionAction`, which:
   - inserts only the confirmed dates into `important_dates` (respecting `dates_staff_write` RLS),
   - optionally creates `date_reminders` (F1) for each,
   - sets `contract_extractions.status='confirmed'`, `confirmed_by/at`,
   - `logAudit('extraction.confirmed', metadata={counts})`,
   - writes an `activities` row.
   Until this step runs, **nothing** lands on the deal timeline or calendar.

### (d) UI surfaces

- **Deal workspace → "Extract dates from contract"** button (on a document) → runs extract → opens `ExtractReview`.
- **Review modal**: table of proposed dates (label, date picker, confidence, snippet), parties, contingencies; bulk select; "Confirm & add". A visible banner: "AI suggestions — review before saving."
- **Audit**: the confirmation is logged; the `raw` model output is retained for traceability.

### (e) Risks + compliance/legal notes (4B)

- **Hallucination / wrong dates**: a mis-extracted closing or contingency deadline is a serious E&O risk. The **mandatory confirm step + source snippet + confidence** is the core mitigation; never auto-apply, never auto-create reminders without confirmation. Keep the "AI-suggested, verify against the contract" disclaimer prominent.
- **Not legal advice**: extraction is clerical assistance; copy must say so.
- **PII to the model**: contracts contain SSNs/financials. Consider redacting obvious PII before sending, and confirm Anthropic data-handling terms meet the brokerage's policy; gate the feature behind a firm setting if needed.
- **Cost/latency**: large PDFs → big prompts. Truncate or chunk; cap pages; show a spinner.
- **Date ambiguity**: ambiguous formats / "X days after acceptance" relative terms — resolve to absolute dates only when the base date is known, else surface as a contingency with an explicit "needs base date" flag.

### (f) Effort: **M** (4A: M, 4B: M; combined feel of one L if done together).

---

# Recommended build sequence & parallelization

### Dependencies
- **Feature 3's `admin/lib/audit.ts`** is consumed by F1 (date complete), F3 (everything), and F4 (esign/extraction). Land the audit helper early so other features can tap it.
- **Feature 1's `date_reminders`** are optionally created from **Feature 4B** confirmation. F4B can ship without it and add the wiring later.
- **The shared `/dashboard/oversight` page** is touched by both F1 (overdue) and F3 (approvals). Have one feature scaffold it and the other extend it to avoid a merge conflict.
- **`admin/vercel.json`** is edited by F1 and F2 (new cron entries) — coordinate a single edit or merge carefully.
- **`admin/app/dashboard/deals/[id]/actions.ts`** and **`DealWorkspace.tsx`** are touched by F1, F2, F3, F4 — the main conflict hotspots.

### Sequence
1. **Phase 0 (foundation, ~0.5 wk):** Land `admin/lib/audit.ts` + `0035`'s `audit_log` table only (split the migration so the log lands first). Scaffold `/dashboard/oversight` shell. Add the `audit_log` taps to existing document upload paths. *Low risk, unblocks everything.*
2. **Phase 1 (parallelizable pair):**
   - **Track A — Feature 1 (Deadlines)**: migration `0033`, `api/cron/deadlines`, `lib/deadlines.ts`, reminder UI, overdue panel on oversight.
   - **Track B — Feature 2 (Showing Feedback)**: migration `0034`, public form + token route, digest cron, workspace + mobile.
   - These two share almost no files (different tables, different cron routes, different UI sections). Coordinate only on `vercel.json` (append cron entries) and the `actions.ts`/`DealWorkspace.tsx` hotspots — split by clearly separated regions or land sequentially within the shared files.
3. **Phase 2 — Feature 3 (Compliance) remainder**: checklists, approvals, retention, export route, oversight approvals panel, firm checklist config. Builds on Phase 0's audit log. Larger, do it as its own focused block.
4. **Phase 3 — Feature 4 (E-sign + AI)**: 4A and 4B can be done in parallel by two people (4A = `esign_envelopes` + webhook + panel; 4B = `contract_extractions` + AI route + review UI). Both tap `audit.ts` from Phase 0. 4B's confirm step can optionally create F1 reminders once F1 is merged.

### Safe-to-parallelize summary
- **F1 ∥ F2**: safe — disjoint tables/routes; only `vercel.json` + the two deal-workspace hotspots need light coordination.
- **F4A ∥ F4B**: safe — disjoint tables, disjoint routes/components.
- **F3 must follow Phase 0** (its audit log + helper are the shared dependency) and is best done as a single block because audit taps span many files.
- **Migration numbering is strictly sequential** (`0033`→`0038`) regardless of who builds what; assign numbers up front to avoid collisions.

### Effort roll-up
| Feature | Effort |
|---|---|
| 1 — Deadline reminders/escalation | M |
| 2 — Showing feedback loop | M |
| 3 — Broker compliance | L |
| 4 — E-sign real + contract AI | M (4A) + M (4B) ≈ L combined |
