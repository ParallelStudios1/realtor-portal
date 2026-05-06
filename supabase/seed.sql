-- =====================================================================
-- Seed data — fake firm + users + a search to demo the app.
-- =====================================================================
--
-- Run this after schema.sql, then sign up a couple of users via the app's
-- login screen using the emails below — this script then UPDATES those
-- auth.users-linked rows to assign firm_id / role.
--
-- (Supabase auth.users rows can only be created via the auth API — you
-- cannot insert directly. So you sign up first, then run the relevant
-- UPDATE block.)
--
-- =====================================================================

-- 1. A demo firm.
insert into public.firms (id, name, slug, primary_color, secondary_color, contact_email)
values (
    '00000000-0000-0000-0000-00000000beef',
    'Coastal Homes Realty',
    'coastal-homes',
    '#0E7C66',  -- teal
    '#0B1F3A',  -- navy
    'demo@coastalhomes.test'
)
on conflict (slug) do nothing;

-- 2. After you sign up via the app with these test emails, run THIS block to
--    promote them to the right role and firm:
--
-- update public.users
-- set firm_id = '00000000-0000-0000-0000-00000000beef',
--     role = 'realtor',
--     full_name = 'Sarah Realtor'
-- where email = 'sarah@coastalhomes.test';
--
-- update public.users
-- set firm_id = '00000000-0000-0000-0000-00000000beef',
--     role = 'client',
--     full_name = 'Eric Logan'
-- where email = 'eric@example.test';

-- 3. Once both users exist, create a search:
--
-- insert into public.client_searches (firm_id, client_id, realtor_id, name, phase)
-- select
--     '00000000-0000-0000-0000-00000000beef',
--     c.id,
--     r.id,
--     'Eric Logan''s Search for 3 Bedrooms',
--     'searching'
-- from
--     public.users c,
--     public.users r
-- where
--     c.email = 'eric@example.test'
--     and r.email = 'sarah@coastalhomes.test';

-- 4. Add some example houses, dates, activity:
--
-- insert into public.houses (firm_id, search_id, address, list_price, bedrooms, bathrooms, square_feet)
-- select
--     '00000000-0000-0000-0000-00000000beef',
--     s.id,
--     '142 Seabreeze Lane',
--     625000,
--     3,
--     2.5,
--     1820
-- from public.client_searches s
-- where s.name = 'Eric Logan''s Search for 3 Bedrooms';
--
-- insert into public.important_dates (firm_id, search_id, label, date, created_by)
-- select
--     '00000000-0000-0000-0000-00000000beef',
--     s.id,
--     'Inspection Deadline',
--     current_date + 7,
--     s.realtor_id
-- from public.client_searches s
-- where s.name = 'Eric Logan''s Search for 3 Bedrooms';
