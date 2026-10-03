-- Swissquote Padel Club: run this once in Supabase > SQL Editor
create table if not exists public.bookings (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists public.club (id text primary key, data jsonb not null, updated_at timestamptz default now());
alter table public.bookings enable row level security;
alter table public.club enable row level security;
-- Prototype access: anyone with the app link can read and write. Replace with real sign-in before wide use.
drop policy if exists "app access" on public.bookings;
create policy "app access" on public.bookings for all to anon, authenticated using (true) with check (true);
drop policy if exists "app access" on public.club;
create policy "app access" on public.club for all to anon, authenticated using (true) with check (true);
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.club;
