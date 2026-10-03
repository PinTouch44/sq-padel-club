-- Swissquote Padel Club: verrouillage des paiements.
-- A exécuter UNE FOIS dans Supabase > SQL Editor, juste AVANT d'activer les paiements réels
-- (après avoir déployé les 3 fonctions et mis payments: "stripe" dans config.js).

-- 1. Un joueur ne peut plus modifier le prix, le paiement, la date ou le pointage de sa réservation
create or replace function public.guard_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  locked text[] := array['uid','code','eventId','total','tier','emp','guestPrice','createdAt','guests',
                         'payment','payMethod','paidAt','stripePaymentIntent','refundedAt','checkedIn','checkedAt'];
  k text;
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
begin
  if public.is_admin() or claims->>'role' = 'service_role' or current_user in ('postgres','supabase_admin') then return new; end if;
  foreach k in array locked loop
    if (new.data->k) is distinct from (old.data->k) then raise exception 'not allowed (%)', k; end if;
  end loop;
  return new;
end $$;
drop trigger if exists guard_booking on public.bookings;
create trigger guard_booking before update on public.bookings for each row execute function public.guard_booking();

-- 2. A la création, le serveur impose: non payé, non pointé, et SA date du jour (pas celle du téléphone)
create or replace function public.stamp_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
begin
  if public.is_admin() or claims->>'role' = 'service_role' or current_user in ('postgres','supabase_admin') then return new; end if;
  new.data := (new.data - 'stripePaymentIntent' - 'paidAt' - 'refundedAt' - 'refundDue')
    || jsonb_build_object('payment', 'unpaid', 'checkedIn', false,
                          'createdAt', to_char(now() at time zone 'Europe/Zurich', 'YYYY-MM-DD'));
  return new;
end $$;
drop trigger if exists stamp_booking on public.bookings;
create trigger stamp_booking before insert on public.bookings for each row execute function public.stamp_booking();
