-- Adivue V1 does not store video in Supabase.
-- Supabase Realtime Broadcast is used only for WebRTC signaling.
-- Optional table for future authenticated device history.
create table if not exists public.adivue_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  device_name text,
  role text check (role in ('camera','monitor')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.adivue_devices enable row level security;
create policy "owners manage own devices" on public.adivue_devices
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
