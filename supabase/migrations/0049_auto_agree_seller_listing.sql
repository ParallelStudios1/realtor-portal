-- On SELLER deals the "agreed home" is by definition the home being listed.
-- Auto-set offer_house_id when the first house lands on a seller deal, no
-- matter which surface added it (seller self-service, realtor workspace,
-- mobile app). Only fires when no agreed home is set yet, so multi-listing
-- deals and explicit choices are never overridden.

create or replace function public._auto_agree_seller_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_searches cs
     set offer_house_id = new.id,
         house_agreed_at = now()
   where cs.id = new.search_id
     and cs.kind = 'seller'
     and cs.offer_house_id is null;
  return new;
end;
$$;

drop trigger if exists auto_agree_seller_listing on public.houses;
create trigger auto_agree_seller_listing
after insert on public.houses
for each row execute function public._auto_agree_seller_listing();

-- Backfill: seller deals that already have exactly ONE house and no agreed
-- home get that house as the agreed home. Ambiguous (multi-house) deals are
-- left for the realtor/seller to pick explicitly.
update public.client_searches cs
   set offer_house_id = h.id,
       house_agreed_at = now()
  from (
    select search_id, min(id::text)::uuid as id
      from public.houses
     group by search_id
    having count(*) = 1
  ) h
 where h.search_id = cs.id
   and cs.kind = 'seller'
   and cs.offer_house_id is null;
