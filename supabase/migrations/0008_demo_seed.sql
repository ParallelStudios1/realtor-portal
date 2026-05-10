-- =============================================================================
-- 0008_demo_seed.sql
-- Seeds the "Try the demo" experience: a Demo Realty firm with a realtor,
-- a buyer, and a seller, plus enough activity (houses, messages, tours,
-- documents, important dates) for a realistic walkthrough.
--
-- Idempotent: every INSERT is ON CONFLICT (id) DO NOTHING. Re-runnable.
--
-- Deterministic UUIDs so the /api/demo/start endpoint can always look up
-- the demo users by id without a query:
--   firm:    00000000-0000-0000-0000-00000000d000
--   realtor: 00000000-0000-0000-0000-00000000d001
--   buyer:   00000000-0000-0000-0000-00000000d002
--   seller:  00000000-0000-0000-0000-00000000d003
--   buyer search:  00000000-0000-0000-0000-00000000d010
--   seller search: 00000000-0000-0000-0000-00000000d011
--   houses:   ...d020, d021, d022
--   messages: ...d030..d035
--   tours:    ...d040 (confirmed), d041 (pending)
--   important_date: ...d050
--   document: ...d060
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Auth users (one per demo persona)
-- We insert directly into auth.users with email_confirmed_at = now() so the
-- generateLink({ type: 'magiclink' }) call can issue a session immediately.
-- ---------------------------------------------------------------------------
insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) values
    (
        '00000000-0000-0000-0000-00000000d001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'demo-realtor@example.com',
        crypt('demo-only-not-used', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Maria Logan","is_demo":true}'::jsonb,
        now(),
        now(),
        '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-00000000d002',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'demo-buyer@example.com',
        crypt('demo-only-not-used', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Alex Carter","is_demo":true}'::jsonb,
        now(),
        now(),
        '', '', '', ''
    ),
    (
        '00000000-0000-0000-0000-00000000d003',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'demo-seller@example.com',
        crypt('demo-only-not-used', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Jordan Reyes","is_demo":true}'::jsonb,
        now(),
        now(),
        '', '', '', ''
    )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- B) Firm
-- ---------------------------------------------------------------------------
insert into public.firms (
    id, name, slug, brand_color, accent_color, tagline, status,
    onboarding_completed, contact_email, primary_color, secondary_color
)
values (
    '00000000-0000-0000-0000-00000000d000',
    'Demo Realty',
    'demo',
    '#0F766E',
    '#14B8A6',
    'See it. Live it. Own it.',
    'active',
    true,
    'demo-realtor@example.com',
    '#0F766E',
    '#0F172A'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- C) public.users rows (linked to auth.users via FK on id)
-- ---------------------------------------------------------------------------
insert into public.users (id, firm_id, role, email, full_name)
values
    (
        '00000000-0000-0000-0000-00000000d001',
        '00000000-0000-0000-0000-00000000d000',
        'firm_admin',
        'demo-realtor@example.com',
        'Maria Logan'
    ),
    (
        '00000000-0000-0000-0000-00000000d002',
        '00000000-0000-0000-0000-00000000d000',
        'client',
        'demo-buyer@example.com',
        'Alex Carter'
    ),
    (
        '00000000-0000-0000-0000-00000000d003',
        '00000000-0000-0000-0000-00000000d000',
        'client',
        'demo-seller@example.com',
        'Jordan Reyes'
    )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- D) client_searches — one buyer search, one seller listing
-- ---------------------------------------------------------------------------
insert into public.client_searches (
    id, firm_id, client_id, realtor_id, name, phase, kind, description
)
values
    (
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d002',
        '00000000-0000-0000-0000-00000000d001',
        'Alex Carter''s Search',
        'searching',
        'buyer',
        '3 bed / 2 bath, walkable neighborhood, under $850k.'
    ),
    (
        '00000000-0000-0000-0000-00000000d011',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d003',
        '00000000-0000-0000-0000-00000000d001',
        'Jordan Reyes''s Listing',
        'searching',
        'seller',
        'Listing prep for 1820 Elm St.'
    )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- E) houses on the buyer search
-- Photo URLs use Unsplash's public CDN — these IDs have been stable for years.
-- ---------------------------------------------------------------------------
insert into public.houses (
    id, firm_id, search_id, address, list_price,
    bedrooms, bathrooms, square_feet, photo_url, status, is_favorite
)
values
    (
        '00000000-0000-0000-0000-00000000d020',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '412 Maple Avenue, Austin, TX 78704',
        785000,
        3, 2.0, 1840,
        'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=80',
        'toured',
        true
    ),
    (
        '00000000-0000-0000-0000-00000000d021',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '927 Cedar Lane, Austin, TX 78745',
        699000,
        3, 2.5, 1620,
        'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80',
        'tour_requested',
        false
    ),
    (
        '00000000-0000-0000-0000-00000000d022',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '1503 Brookside Drive, Austin, TX 78703',
        839000,
        4, 3.0, 2210,
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=80',
        'interested',
        false
    )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- F) messages — alternating realtor/buyer, oldest -> newest
-- ---------------------------------------------------------------------------
insert into public.messages (
    id, firm_id, search_id, sender_id, body, created_at
)
values
    (
        '00000000-0000-0000-0000-00000000d030',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d001',
        'Hi Alex! I just added three new listings that match your criteria. Take a look when you get a chance.',
        now() - interval '3 days'
    ),
    (
        '00000000-0000-0000-0000-00000000d031',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d002',
        'Thanks Maria! 412 Maple looks amazing. Can we tour it this weekend?',
        now() - interval '2 days 20 hours'
    ),
    (
        '00000000-0000-0000-0000-00000000d032',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d001',
        'Yes — I locked in Saturday at 11am. The listing agent said the kitchen was just remodeled.',
        now() - interval '2 days 18 hours'
    ),
    (
        '00000000-0000-0000-0000-00000000d033',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d002',
        'Perfect. Also requesting a tour for 927 Cedar — that backyard photo is gorgeous.',
        now() - interval '1 day 10 hours'
    ),
    (
        '00000000-0000-0000-0000-00000000d034',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d001',
        'Got it — I''ll reach out to the listing agent and propose Sunday afternoon.',
        now() - interval '1 day 8 hours'
    ),
    (
        '00000000-0000-0000-0000-00000000d035',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d002',
        'Awesome, thank you! Also uploading my pre-approval letter so it''s on file.',
        now() - interval '4 hours'
    )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- G) tour_requests — one confirmed (Maple toured), one pending (Cedar)
-- ---------------------------------------------------------------------------
insert into public.tour_requests (
    id, firm_id, house_id, search_id, client_id,
    preferred_when, notes, status, handled_at, created_at
)
values
    (
        '00000000-0000-0000-0000-00000000d040',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d020',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d002',
        'Saturday at 11:00 AM',
        'Confirmed — meeting at the property.',
        'confirmed',
        now() - interval '2 days 12 hours',
        now() - interval '2 days 20 hours'
    ),
    (
        '00000000-0000-0000-0000-00000000d041',
        '00000000-0000-0000-0000-00000000d000',
        '00000000-0000-0000-0000-00000000d021',
        '00000000-0000-0000-0000-00000000d010',
        '00000000-0000-0000-0000-00000000d002',
        'Sunday afternoon (any time after 1pm)',
        'Especially want to see the backyard.',
        'pending',
        null,
        now() - interval '1 day 10 hours'
    )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- H) important_dates — Inspection 5 days from now
-- ---------------------------------------------------------------------------
insert into public.important_dates (
    id, firm_id, search_id, label, date, notes, created_by
)
values (
    '00000000-0000-0000-0000-00000000d050',
    '00000000-0000-0000-0000-00000000d000',
    '00000000-0000-0000-0000-00000000d010',
    'Inspection',
    (now() + interval '5 days')::date,
    'Home inspection scheduled for 412 Maple Avenue.',
    '00000000-0000-0000-0000-00000000d001'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- I) documents — pre-approval letter (storage_path is fake; row is what
-- shows up in the list)
-- ---------------------------------------------------------------------------
insert into public.documents (
    id, firm_id, search_id, name, storage_path, mime_type, file_size, uploaded_by
)
values (
    '00000000-0000-0000-0000-00000000d060',
    '00000000-0000-0000-0000-00000000d000',
    '00000000-0000-0000-0000-00000000d010',
    'Pre-approval letter.pdf',
    '00000000-0000-0000-0000-00000000d000/00000000-0000-0000-0000-00000000d010/demo-pre-approval-letter.pdf',
    'application/pdf',
    184320,
    '00000000-0000-0000-0000-00000000d001'
)
on conflict (id) do nothing;
