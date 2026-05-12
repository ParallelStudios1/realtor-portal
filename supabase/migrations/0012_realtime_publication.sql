-- 0012 — Add the sync tables to the supabase_realtime publication.
-- Without this, every "live" feature silently fails (sent messages don't
-- show in sender's own UI, phase changes don't transfer cross-side,
-- alerts don't push, activity feed stays stale until refresh).

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_searches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tour_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.important_dates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.houses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
