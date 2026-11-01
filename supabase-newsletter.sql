-- Swissquote Sports (v0.33): liste des abonnés à la newsletter.
-- A exécuter UNE FOIS dans Supabase > SQL Editor (sans risque si relancé).
-- Chaque joueur gère sa propre ligne (inscription / désinscription).
-- Seuls les administrateurs de tous les sports peuvent lire la liste complète.

create table if not exists public.newsletter (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.newsletter enable row level security;
drop policy if exists "own newsletter row" on public.newsletter;
drop policy if exists "admin reads newsletter" on public.newsletter;
create policy "own newsletter row" on public.newsletter for all to authenticated
  using (data->>'uid' = auth.uid()::text) with check (data->>'uid' = auth.uid()::text);
create policy "admin reads newsletter" on public.newsletter for select to authenticated
  using (public.is_admin());

-- La suppression d'un compte supprime aussi sa ligne newsletter
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if public.is_admin() then raise exception 'admin accounts cannot be deleted here'; end if;
  delete from public.bookings where data->>'uid' = auth.uid()::text;
  delete from public.seats where data->>'uid' = auth.uid()::text;
  delete from public.newsletter where data->>'uid' = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
