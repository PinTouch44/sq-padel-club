-- Swissquote Sports (v0.32): confidentialité des réservations.
-- A exécuter UNE FOIS dans Supabase > SQL Editor (sans risque si relancé).
-- Pré-requis: supabase-setup.sql et supabase-sports.sql déjà exécutés.
--
-- Avant: tout joueur connecté pouvait lire toutes les réservations (nom, téléphone, paiement).
-- Après: chacun ne lit que les siennes. Les organisateurs lisent celles de leur sport.
-- Pour compter les places et afficher "Qui joue", une table séparée "seats" ne contient que:
-- prénom, initiale du nom, nombre d'invités, statut. Rien d'autre.

-- 1. Table des places (données minimales, lisibles par tous les joueurs connectés)
create table if not exists public.seats (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.seats enable row level security;
drop policy if exists "read seats" on public.seats;
drop policy if exists "add own seat" on public.seats;
drop policy if exists "update own seat" on public.seats;
drop policy if exists "delete own seat" on public.seats;
drop policy if exists "admin all seats" on public.seats;
create policy "read seats" on public.seats for select to authenticated using (true);
create policy "add own seat" on public.seats for insert to authenticated
  with check (data->>'uid' = auth.uid()::text);
create policy "update own seat" on public.seats for update to authenticated
  using (data->>'uid' = auth.uid()::text) with check (data->>'uid' = auth.uid()::text);
create policy "delete own seat" on public.seats for delete to authenticated
  using (data->>'uid' = auth.uid()::text);
create policy "admin all seats" on public.seats for all to authenticated
  using (public.is_admin_for(data->>'sport')) with check (public.is_admin_for(data->>'sport'));

-- 2. Reprendre les réservations déjà existantes (version minimale)
insert into public.seats (id, data)
select id, jsonb_build_object(
  'eventId', data->>'eventId',
  'sport', coalesce(nullif(data->>'sport',''), 'padel'),
  'uid', data->>'uid',
  'first', coalesce(data->>'first',''),
  'last', left(coalesce(data->>'last',''), 1),
  'guests', case when jsonb_typeof(data->'guests') = 'array' then jsonb_array_length(data->'guests') else 0 end,
  'status', coalesce(data->>'status','confirmed'),
  'show', coalesce(data->>'show','true') <> 'false')
from public.bookings
on conflict (id) do update set data = excluded.data;

-- 3. Mise à jour en direct (ignore l'erreur si déjà activé)
do $$ begin
  alter publication supabase_realtime add table public.seats;
exception when others then null; end $$;

-- 4. Les réservations ne sont plus lisibles que par leur propriétaire (et les organisateurs du sport)
drop policy if exists "read bookings" on public.bookings;
create policy "read bookings" on public.bookings for select to authenticated
  using (data->>'uid' = auth.uid()::text);

-- 5. La suppression d'un compte supprime aussi les places
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if public.is_admin() then raise exception 'admin accounts cannot be deleted here'; end if;
  delete from public.bookings where data->>'uid' = auth.uid()::text;
  delete from public.seats where data->>'uid' = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
