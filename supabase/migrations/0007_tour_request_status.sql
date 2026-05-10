-- =====================================================================
-- Migration 0005 — tour_requests.status (pending/confirmed/declined/cancelled)
-- =====================================================================
--
-- The original tour_requests table only had handled_at as a "the realtor
-- followed up" signal. The end-to-end tour flow needs richer state so the
-- realtor dashboard can surface pending vs confirmed vs declined.
--
-- Idempotent — safe to re-run.
-- =====================================================================

-- 1. Status enum
do $$ begin
    create type tour_request_status as enum (
        'pending',
        'confirmed',
        'declined',
        'cancelled'
    );
exception when duplicate_object then null; end $$;

-- 2. Add status column with sensible default. Existing rows become 'pending'
--    if they haven't been handled, otherwise 'confirmed' (best guess — the
--    legacy semantics were "realtor followed up", which we map to confirmed).
alter table public.tour_requests
    add column if not exists status tour_request_status not null default 'pending';

update public.tour_requests
    set status = 'confirmed'
    where handled_at is not null and status = 'pending';

create index if not exists tour_requests_status_idx on public.tour_requests(status);
create index if not exists tour_requests_firm_status_idx
    on public.tour_requests(firm_id, status);

-- 3. updated_at column so realtors can sort by "most recently touched"
alter table public.tour_requests
    add column if not exists updated_at timestamptz not null default now();

drop trigger if exists tour_requests_set_updated_at on public.tour_requests;
create trigger tour_requests_set_updated_at before update on public.tour_requests
    for each row execute function public.set_updated_at();

-- 4. Allow the client who created the request to cancel their own pending
--    request. Realtor update policy already exists from 0002.
drop policy if exists tour_requests_client_cancel on public.tour_requests;
create policy tour_requests_client_cancel on public.tour_requests
    for update using (
        firm_id = public.current_firm_id()
        and client_id = auth.uid()
    )
    with check (
        firm_id = public.current_firm_id()
        and client_id = auth.uid()
    );
