-- Swissquote Sports (v0.25): administrators for all sports or for one sport.
-- Run once in Supabase > SQL Editor. Safe to run again. Run supabase-setup.sql first.
-- Existing administrators (table "admins") become administrators for ALL sports.

create table if not exists public.sport_admins (
  uid uuid not null references auth.users(id) on delete cascade,
  sport text not null,
  primary key (uid, sport)
);
alter table public.sport_admins enable row level security;

create or replace function public.my_admin_scope() returns text[]
language sql security definer stable set search_path = public as $$
  select case
    when exists (select 1 from public.admins where uid = auth.uid()) then array['*']::text[]
    else coalesce((select array_agg(sport order by sport) from public.sport_admins where uid = auth.uid()), array[]::text[])
  end $$;

create or replace function public.is_admin_for(sp text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where uid = auth.uid())
      or exists (select 1 from public.sport_admins where uid = auth.uid() and sport = coalesce(nullif(sp,''),'padel'));
$$;

create or replace function public.is_any_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where uid = auth.uid())
      or exists (select 1 from public.sport_admins where uid = auth.uid());
$$;

-- List of administrators (only for administrators of all sports)
create or replace function public.admin_list() returns table(email text, name text, sports text[])
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then raise exception 'not allowed'; end if;
  return query
    select u.email::text,
           trim(coalesce(u.raw_user_meta_data->>'first','') || ' ' || coalesce(u.raw_user_meta_data->>'last',''))::text,
           case when exists (select 1 from public.admins a where a.uid = u.id) then array['*']::text[]
                else (select array_agg(s.sport order by s.sport) from public.sport_admins s where s.uid = u.id) end
    from auth.users u
    where exists (select 1 from public.admins a where a.uid = u.id)
       or exists (select 1 from public.sport_admins s where s.uid = u.id)
    order by 1;
end $$;

-- Set the sports an account can manage: ['*'] = all sports, [] = remove access.
create or replace function public.admin_set(p_email text, p_sports text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then raise exception 'not allowed'; end if;
  select id into v from auth.users where lower(email) = lower(trim(p_email));
  if v is null then raise exception 'no account with this email'; end if;
  if v = auth.uid() and not ('*' = any(coalesce(p_sports, array[]::text[]))) then
    raise exception 'you cannot remove your own access';
  end if;
  delete from public.sport_admins where uid = v;
  if '*' = any(coalesce(p_sports, array[]::text[])) then
    insert into public.admins (uid, note) values (v, 'all sports') on conflict (uid) do nothing;
  else
    delete from public.admins where uid = v;
    insert into public.sport_admins (uid, sport)
      select v, x from unnest(coalesce(p_sports, array[]::text[])) x where length(trim(x)) > 0
      on conflict do nothing;
  end if;
end $$;

revoke all on function public.my_admin_scope(), public.is_admin_for(text), public.is_any_admin(),
  public.admin_list(), public.admin_set(text, text[]) from public;
grant execute on function public.my_admin_scope(), public.is_admin_for(text), public.is_any_admin(),
  public.admin_list(), public.admin_set(text, text[]) to authenticated;

-- Bookings: a sport administrator manages the bookings of their sport only
drop policy if exists "admin all bookings" on public.bookings;
create policy "admin all bookings" on public.bookings for all to authenticated
  using (public.is_admin_for(data->>'sport')) with check (public.is_admin_for(data->>'sport'));

create or replace function public.guard_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin_for(old.data->>'sport') then return new; end if;
  if (new.data->>'uid') is distinct from (old.data->>'uid') then raise exception 'not allowed'; end if;
  if (new.data->>'code') is distinct from (old.data->>'code') then raise exception 'not allowed'; end if;
  if coalesce(new.data->>'checkedIn','false') <> coalesce(old.data->>'checkedIn','false') then raise exception 'not allowed'; end if;
  return new;
end $$;

-- Club settings and events: any administrator can save (the console limits each one to their sport)
drop policy if exists "admin writes club" on public.club;
create policy "admin writes club" on public.club for all to authenticated
  using (public.is_any_admin()) with check (public.is_any_admin());
