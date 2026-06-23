-- App Store / Play Store UGC compliance: block users + report content.
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists user_blocks_own on public.user_blocks;
create policy user_blocks_own on public.user_blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  search_id uuid references public.client_searches(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  firm_id uuid references public.firms(id) on delete set null,
  kind text not null default 'other',
  reason text,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
alter table public.content_reports enable row level security;
drop policy if exists content_reports_insert_own on public.content_reports;
create policy content_reports_insert_own on public.content_reports
  for insert with check (reporter_id = auth.uid());
drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own on public.content_reports
  for select using (reporter_id = auth.uid());

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
