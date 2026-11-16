-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9._-]{3,24}$'),
  qr_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lobby_date date not null default current_date,
  lobby_count integer not null check (lobby_count > 0),
  rate numeric(12,2) not null check (rate >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  paid_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.lobbies enable row level security;
alter table public.payments enable row level security;

-- Owners can read/update only their own profile. Profile creation is authenticated.
create policy "profile owner select" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profile owner insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profile owner update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "lobby owner all" on public.lobbies for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "payment owner all" on public.payments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read-only public views expose the public ledger by username. No public writes.
create or replace view public.public_profiles with (security_invoker = true) as
 select id, username, qr_url from public.profiles;
create or replace view public.public_lobbies with (security_invoker = true) as
 select id, user_id, lobby_date, lobby_count, rate from public.lobbies;
create or replace view public.public_payments with (security_invoker = true) as
 select id, user_id, amount, note, paid_at from public.payments;

grant select on public.public_profiles, public.public_lobbies, public.public_payments to anon, authenticated;
-- Allow anonymous read through views by adding explicit read-only base table policies.
create policy "public can view usernames" on public.profiles for select to anon using (true);
create policy "public can view lobby rows" on public.lobbies for select to anon using (true);
create policy "public can view payment rows" on public.payments for select to anon using (true);

-- QR storage bucket: public read, owner-only upload/delete in their own user-id folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ledger-qr','ledger-qr',true,4194304,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true, file_size_limit=4194304, allowed_mime_types=array['image/png','image/jpeg','image/webp'];
create policy "QR public read" on storage.objects for select to anon, authenticated using (bucket_id='ledger-qr');
create policy "QR owner upload" on storage.objects for insert to authenticated with check (bucket_id='ledger-qr' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "QR owner update" on storage.objects for update to authenticated using (bucket_id='ledger-qr' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='ledger-qr' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "QR owner delete" on storage.objects for delete to authenticated using (bucket_id='ledger-qr' and (storage.foldername(name))[1]=auth.uid()::text);
