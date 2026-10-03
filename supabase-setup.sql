-- Swissquote Padel Club: sécurité de la base (à exécuter UNE FOIS dans Supabase > SQL Editor)
-- Pré-requis: le compte admin a déjà été créé dans l'app avec l'adresse Gmail ci-dessous.

-- 1. Administrateurs (liés à l'identifiant du compte, pas seulement à l'e-mail)
create table if not exists public.admins (uid uuid primary key references auth.users(id) on delete cascade, note text);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.admins where uid = auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

insert into public.admins (uid, note)
select id, 'Organisateur' from auth.users where lower(email) = 'raphaelpinto92@gmail.com'
on conflict (uid) do nothing;

-- 2. Réservations: tout joueur connecté les voit; chacun ne crée/modifie que les siennes; l'admin gère tout
alter table public.bookings enable row level security;
drop policy if exists "app access" on public.bookings;
drop policy if exists "read bookings" on public.bookings;
drop policy if exists "add own booking" on public.bookings;
drop policy if exists "update own booking" on public.bookings;
drop policy if exists "admin all bookings" on public.bookings;
create policy "read bookings" on public.bookings for select to authenticated using (true);
create policy "add own booking" on public.bookings for insert to authenticated
  with check (data->>'uid' = auth.uid()::text and coalesce(data->>'checkedIn','false') = 'false');
create policy "update own booking" on public.bookings for update to authenticated
  using (data->>'uid' = auth.uid()::text) with check (data->>'uid' = auth.uid()::text);
create policy "admin all bookings" on public.bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- un joueur ne peut ni se pointer lui-même, ni changer le propriétaire ou le code d'une réservation
create or replace function public.guard_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if (new.data->>'uid') is distinct from (old.data->>'uid') then raise exception 'not allowed'; end if;
  if (new.data->>'code') is distinct from (old.data->>'code') then raise exception 'not allowed'; end if;
  if coalesce(new.data->>'checkedIn','false') <> coalesce(old.data->>'checkedIn','false') then raise exception 'not allowed'; end if;
  return new;
end $$;
drop trigger if exists guard_booking on public.bookings;
create trigger guard_booking before update on public.bookings for each row execute function public.guard_booking();

-- 3. Réglages du club: lecture pour tous, écriture réservée à l'admin
alter table public.club enable row level security;
drop policy if exists "app access" on public.club;
drop policy if exists "read club" on public.club;
drop policy if exists "admin writes club" on public.club;
create policy "read club" on public.club for select to anon, authenticated using (true);
create policy "admin writes club" on public.club for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Optionnel, pour repartir de zéro avant le lancement: supprimer les réservations de test
-- delete from public.bookings;


-- 6. Suppression de compte par le joueur (v0.21): supprime ses réservations puis son compte.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if public.is_admin() then raise exception 'admin accounts cannot be deleted here'; end if;
  delete from public.bookings where data->>'uid' = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
