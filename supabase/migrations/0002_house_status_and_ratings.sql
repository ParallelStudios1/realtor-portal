-- =====================================================================
-- Migration 0002 — house status field + ratings table
-- =====================================================================
--
-- Adds:
--   - houses.status (enum: interested, tour_requested, toured, offered, passed)
--   - house_ratings table (1–5 stars + notes from client after a tour)
--
-- Run this against an existing database that already has schema.sql applied.
-- Idempotent — safe to re-run.
-- =====================================================================

-- 1. Status enum
do $$ begin
    create type house_status as enum (
        'interested',
        'tour_requested',
        'toured',
        'offered',
        'passed'
    );
exception when duplicate_object then null; end $$;

-- 2. Add status column to houses (default 'interested' for existing rows).
alter table public.houses
    add column if not exists status house_status not null default 'interested';

create index if not exists houses_status_idx on public.houses(status);

-- 3. house_ratings — one rating per (client, house) pair max.
create table if not exists public.house_ratings (
    id           uuid primary key default uuid_generate_v4(),
    firm_id      uuid not null references public.firms(id) on delete cascade,
    house_id     uuid not null references public.houses(id) on delete cascade,
    search_id    uuid not null references public.client_searches(id) on delete cascade,
    client_id    uuid not null references public.users(id) on delete cascade,
    stars        integer not null check (stars between 1 and 5),
    notes        text,
    requested_at timestamptz,             -- when the realtor asked for feedback
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (client_id, house_id)          -- one rating per client per house
);

create index if not exists house_ratings_house_id_idx on public.house_ratings(house_id);
create index if not exists house_ratings_search_id_idx on public.house_ratings(search_id);

drop trigger if exists house_ratings_set_updated_at on public.house_ratings;
create trigger house_ratings_set_updated_at before update on public.house_ratings
    for each row execute function public.set_updated_at();

-- 4. RLS for house_ratings.
alter table public.house_ratings enable row level security;

drop policy if exists ratings_read on public.house_ratings;
create policy ratings_read on public.house_ratings
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or client_id = auth.uid()
        )
    );

-- Only the client themselves can write their rating.
drop policy if exists ratings_client_write on public.house_ratings;
create policy ratings_client_write on public.house_ratings
    for all using (firm_id = public.current_firm_id() and client_id = auth.uid())
    with check (firm_id = public.current_firm_id() and client_id = auth.uid());

-- 5. tour_requests — lightweight signal for "client wants to see this house"
--    Doesn't try to be a calendar — just a notification trigger. Realtor coordinates
--    the actual tour out-of-band.
create table if not exists public.tour_requests (
    id           uuid primary key default uuid_generate_v4(),
    firm_id      uuid not null references public.firms(id) on delete cascade,
    house_id     uuid not null references public.houses(id) on delete cascade,
    search_id    uuid not null references public.client_searches(id) on delete cascade,
    client_id    uuid not null references public.users(id) on delete cascade,
    preferred_when text,                       -- free-text "Saturday afternoon" etc.
    notes        text,
    handled_at   timestamptz,                  -- realtor flips this when they've followed up
    created_at   timestamptz not null default now()
);

create index if not exists tour_requests_search_id_idx on public.tour_requests(search_id);

alter table public.tour_requests enable row level security;

drop policy if exists tour_requests_read on public.tour_requests;
create policy tour_requests_read on public.tour_requests
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or client_id = auth.uid()
        )
    );

drop policy if exists tour_requests_client_insert on public.tour_requests;
create policy tour_requests_client_insert on public.tour_requests
    for insert with check (
        firm_id = public.current_firm_id()
        and client_id = auth.uid()
    );

drop policy if exists tour_requests_realtor_update on public.tour_requests;
create policy tour_requests_realtor_update on public.tour_requests
    for update using (
        firm_id = public.current_firm_id()
        and public.current_role() = 'realtor'
    );
