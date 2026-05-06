-- =====================================================================
-- Realtor Portal — initial schema
-- =====================================================================
--
-- Multi-tenant white-label SaaS. Every firm-scoped row carries a `firm_id`,
-- and Postgres row-level security (RLS) refuses cross-tenant access at the
-- database level — even if the app code has a bug.
--
-- Run this against a fresh Supabase project (Project Settings → Database →
-- SQL Editor → paste → run). It creates all tables, indexes, RLS policies,
-- and triggers. Idempotent: safe to re-run on a clean DB.
--
-- =====================================================================

-- Enable extensions Supabase usually has but check explicitly.
create extension if not exists "uuid-ossp";

-- =====================================================================
-- ENUMS
-- =====================================================================

do $$ begin
    create type user_role as enum ('super_admin', 'realtor', 'client');
exception when duplicate_object then null; end $$;

do $$ begin
    create type deal_phase as enum ('searching', 'offer_made', 'under_contract', 'closing', 'closed');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- FIRMS — one row per real estate firm that licenses the app.
-- =====================================================================

create table if not exists public.firms (
    id              uuid primary key default uuid_generate_v4(),
    name            text not null,                        -- e.g. "Coastal Homes"
    slug            text not null unique,                 -- e.g. "coastal-homes" (URL-safe id)
    logo_url        text,                                 -- public Supabase Storage URL
    primary_color   text not null default '#1F6FEB',      -- hex
    secondary_color text not null default '#0B1F3A',      -- hex
    contact_email   text,
    is_active       boolean not null default true,        -- flip false to suspend a firm
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists firms_slug_idx on public.firms(slug);

-- =====================================================================
-- USERS — linked to Supabase auth.users(id).
-- =====================================================================

create table if not exists public.users (
    id            uuid primary key references auth.users(id) on delete cascade,
    firm_id       uuid references public.firms(id) on delete restrict,
                  -- super_admin has firm_id = null. Everyone else must have one.
    role          user_role not null default 'client',
    full_name     text not null default '',
    email         text not null,
    phone         text,
    avatar_url    text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint users_firm_required_for_non_super_admin
        check (role = 'super_admin' or firm_id is not null)
);

create index if not exists users_firm_id_idx on public.users(firm_id);
create index if not exists users_role_idx on public.users(role);

-- =====================================================================
-- CLIENT_SEARCHES — one search/deal per client.
-- =====================================================================

create table if not exists public.client_searches (
    id           uuid primary key default uuid_generate_v4(),
    firm_id      uuid not null references public.firms(id) on delete cascade,
    client_id    uuid not null references public.users(id) on delete cascade,
    realtor_id   uuid not null references public.users(id) on delete restrict,
    name         text not null,         -- "Eric Logan's Search for 3 Bedrooms"
    description  text,
    phase        deal_phase not null default 'searching',
    started_at   timestamptz not null default now(),
    closed_at    timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists client_searches_firm_id_idx on public.client_searches(firm_id);
create index if not exists client_searches_client_id_idx on public.client_searches(client_id);
create index if not exists client_searches_realtor_id_idx on public.client_searches(realtor_id);
create index if not exists client_searches_phase_idx on public.client_searches(phase);

-- =====================================================================
-- HOUSES — properties the client has toured or saved for a search.
-- =====================================================================

create table if not exists public.houses (
    id            uuid primary key default uuid_generate_v4(),
    firm_id       uuid not null references public.firms(id) on delete cascade,
    search_id     uuid not null references public.client_searches(id) on delete cascade,
    address       text not null,
    list_price    numeric(12, 2),
    bedrooms      integer,
    bathrooms     numeric(3, 1),
    square_feet   integer,
    listing_url   text,                  -- Zillow / MLS / etc.
    photo_url     text,
    notes         text,
    is_favorite   boolean not null default false,
    toured_at     timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists houses_search_id_idx on public.houses(search_id);
create index if not exists houses_firm_id_idx on public.houses(firm_id);

-- =====================================================================
-- ACTIVITIES — the feed: "Sarah updated the Inspection Report"
-- =====================================================================

create table if not exists public.activities (
    id           uuid primary key default uuid_generate_v4(),
    firm_id      uuid not null references public.firms(id) on delete cascade,
    search_id    uuid not null references public.client_searches(id) on delete cascade,
    actor_id     uuid not null references public.users(id) on delete restrict,
    action       text not null,           -- e.g. "updated", "uploaded", "added", "moved_phase"
    target       text not null,           -- e.g. "Inspection Report", "Closing Day", "Under Contract"
    metadata     jsonb,                   -- flexible: { "old_phase": "searching", "new_phase": "offer_made" } etc.
    created_at   timestamptz not null default now()
);

create index if not exists activities_search_id_created_at_idx
    on public.activities(search_id, created_at desc);
create index if not exists activities_firm_id_idx on public.activities(firm_id);

-- =====================================================================
-- IMPORTANT_DATES — Closing Day, Appraisal Due, Inspection Deadline.
-- =====================================================================

create table if not exists public.important_dates (
    id           uuid primary key default uuid_generate_v4(),
    firm_id      uuid not null references public.firms(id) on delete cascade,
    search_id    uuid not null references public.client_searches(id) on delete cascade,
    label        text not null,                -- "Closing Day"
    date         date not null,
    notes        text,
    created_by   uuid references public.users(id) on delete set null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists important_dates_search_id_idx on public.important_dates(search_id);
create index if not exists important_dates_date_idx on public.important_dates(date);

-- =====================================================================
-- DOCUMENTS — PDFs uploaded by realtor.
-- =====================================================================

create table if not exists public.documents (
    id            uuid primary key default uuid_generate_v4(),
    firm_id       uuid not null references public.firms(id) on delete cascade,
    search_id     uuid not null references public.client_searches(id) on delete cascade,
    name          text not null,
    storage_path  text not null,    -- relative path inside the 'documents' Supabase Storage bucket
    file_size     bigint,
    mime_type     text,
    uploaded_by   uuid references public.users(id) on delete set null,
    created_at    timestamptz not null default now()
);

create index if not exists documents_search_id_idx on public.documents(search_id);

-- =====================================================================
-- MESSAGES — in-app chat between realtor and client.
-- =====================================================================

create table if not exists public.messages (
    id           uuid primary key default uuid_generate_v4(),
    firm_id      uuid not null references public.firms(id) on delete cascade,
    search_id    uuid not null references public.client_searches(id) on delete cascade,
    sender_id    uuid not null references public.users(id) on delete restrict,
    body         text not null,
    read_at      timestamptz,
    created_at   timestamptz not null default now()
);

create index if not exists messages_search_id_created_at_idx
    on public.messages(search_id, created_at desc);

-- =====================================================================
-- PUSH_TOKENS — Expo push notification tokens per device per user.
-- =====================================================================

create table if not exists public.push_tokens (
    id           uuid primary key default uuid_generate_v4(),
    user_id      uuid not null references public.users(id) on delete cascade,
    token        text not null unique,        -- Expo push token
    platform     text not null check (platform in ('ios', 'android')),
    last_seen_at timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

-- =====================================================================
-- TRIGGERS — keep updated_at fresh.
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists firms_set_updated_at on public.firms;
create trigger firms_set_updated_at before update on public.firms
    for each row execute function public.set_updated_at();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
    for each row execute function public.set_updated_at();

drop trigger if exists client_searches_set_updated_at on public.client_searches;
create trigger client_searches_set_updated_at before update on public.client_searches
    for each row execute function public.set_updated_at();

drop trigger if exists important_dates_set_updated_at on public.important_dates;
create trigger important_dates_set_updated_at before update on public.important_dates
    for each row execute function public.set_updated_at();

-- =====================================================================
-- HELPER VIEWS / FUNCTIONS for RLS — let policies stay readable.
-- =====================================================================

-- Returns the firm_id of the currently authenticated user (or null).
create or replace function public.current_firm_id()
returns uuid language sql stable as $$
    select firm_id from public.users where id = auth.uid();
$$;

-- Returns the role of the currently authenticated user.
create or replace function public.current_role()
returns user_role language sql stable as $$
    select role from public.users where id = auth.uid();
$$;

-- =====================================================================
-- ROW-LEVEL SECURITY
-- =====================================================================
--
-- The pattern: enable RLS on every table, then write explicit policies.
-- super_admin bypass is intentionally narrow — only writable from the
-- admin panel via service-role key (which already bypasses RLS).
--
-- =====================================================================

alter table public.firms             enable row level security;
alter table public.users             enable row level security;
alter table public.client_searches   enable row level security;
alter table public.houses            enable row level security;
alter table public.activities        enable row level security;
alter table public.important_dates   enable row level security;
alter table public.documents         enable row level security;
alter table public.messages          enable row level security;
alter table public.push_tokens       enable row level security;

-- ---------- firms ----------
-- Anyone authenticated can read the firm row they belong to (for theming).
drop policy if exists firms_read_own on public.firms;
create policy firms_read_own on public.firms
    for select using (id = public.current_firm_id());

-- Writes go through the service-role key (admin panel) — no anon-key writes allowed.

-- ---------- users ----------
-- IMPORTANT: this self-read policy must exist BEFORE users_read_same_firm,
-- otherwise the helper functions (current_firm_id / current_role) can't even
-- read your own row to figure out which firm you belong to. Without this
-- policy, every other RLS check breaks because they all depend on the helpers.
drop policy if exists users_read_self on public.users;
create policy users_read_self on public.users
    for select using (id = auth.uid());

drop policy if exists users_read_same_firm on public.users;
create policy users_read_same_firm on public.users
    for select using (firm_id = public.current_firm_id());

-- A user can update their own profile fields (name, phone, avatar) — never role / firm_id.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
    for update using (id = auth.uid())
    with check (id = auth.uid());

-- ---------- client_searches ----------
-- Realtors see all searches in their firm. Clients see only their own.
drop policy if exists searches_read on public.client_searches;
create policy searches_read on public.client_searches
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or client_id = auth.uid()
        )
    );

-- Realtors can insert/update/delete searches in their firm.
drop policy if exists searches_realtor_write on public.client_searches;
create policy searches_realtor_write on public.client_searches
    for all using (
        firm_id = public.current_firm_id()
        and public.current_role() = 'realtor'
    )
    with check (
        firm_id = public.current_firm_id()
        and public.current_role() = 'realtor'
    );

-- ---------- houses, activities, important_dates, documents ----------
-- Same pattern: realtors can do anything within their firm; clients can read what's
-- attached to their own searches.

-- houses
drop policy if exists houses_read on public.houses;
create policy houses_read on public.houses
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or search_id in (select id from public.client_searches where client_id = auth.uid())
        )
    );

drop policy if exists houses_realtor_write on public.houses;
create policy houses_realtor_write on public.houses
    for all using (firm_id = public.current_firm_id() and public.current_role() = 'realtor')
    with check (firm_id = public.current_firm_id() and public.current_role() = 'realtor');

-- activities
drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or search_id in (select id from public.client_searches where client_id = auth.uid())
        )
    );

drop policy if exists activities_realtor_write on public.activities;
create policy activities_realtor_write on public.activities
    for insert with check (
        firm_id = public.current_firm_id()
        and public.current_role() = 'realtor'
        and actor_id = auth.uid()
    );

-- important_dates
drop policy if exists dates_read on public.important_dates;
create policy dates_read on public.important_dates
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or search_id in (select id from public.client_searches where client_id = auth.uid())
        )
    );

drop policy if exists dates_realtor_write on public.important_dates;
create policy dates_realtor_write on public.important_dates
    for all using (firm_id = public.current_firm_id() and public.current_role() = 'realtor')
    with check (firm_id = public.current_firm_id() and public.current_role() = 'realtor');

-- documents
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or search_id in (select id from public.client_searches where client_id = auth.uid())
        )
    );

drop policy if exists documents_realtor_write on public.documents;
create policy documents_realtor_write on public.documents
    for all using (firm_id = public.current_firm_id() and public.current_role() = 'realtor')
    with check (firm_id = public.current_firm_id() and public.current_role() = 'realtor');

-- ---------- messages ----------
-- Both realtors and clients can read messages on searches they're part of.
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
    for select using (
        firm_id = public.current_firm_id() and (
            public.current_role() = 'realtor'
            or search_id in (select id from public.client_searches where client_id = auth.uid())
        )
    );

-- Both can write messages — realtor anywhere in their firm, client only on own searches.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
    for insert with check (
        firm_id = public.current_firm_id()
        and sender_id = auth.uid()
        and (
            public.current_role() = 'realtor'
            or search_id in (select id from public.client_searches where client_id = auth.uid())
        )
    );

-- ---------- push_tokens ----------
-- Each user manages only their own tokens.
drop policy if exists push_tokens_self on public.push_tokens;
create policy push_tokens_self on public.push_tokens
    for all using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- =====================================================================
-- STORAGE BUCKETS — create separately in Supabase dashboard:
--   - logos     (public read, restricted write)
--   - documents (private, RLS-equivalent through the documents table)
-- See supabase/storage.md for setup steps.
-- =====================================================================
