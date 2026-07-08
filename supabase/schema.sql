create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  space_id text not null,
  title text not null check (char_length(title) between 1 and 28),
  description text not null default '' check (char_length(description) <= 72),
  mood text not null default '고요함' check (char_length(mood) <= 16),
  color text not null default '#67e8f9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position_x double precision not null check (position_x between 0 and 100),
  position_y double precision not null check (position_y between 0 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  space_id text not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id text not null,
  author_name text not null check (char_length(author_name) <= 18),
  author_color text not null default '#67e8f9' check (author_color ~ '^#[0-9A-Fa-f]{6}$'),
  content text not null check (char_length(content) between 1 and 240),
  created_at timestamptz not null default now()
);

create index if not exists rooms_space_created_idx on public.rooms (space_id, created_at);
create index if not exists rooms_expires_idx on public.rooms (expires_at);
create index if not exists messages_space_room_created_idx on public.messages (space_id, room_id, created_at);

alter table public.rooms enable row level security;
alter table public.messages enable row level security;

drop policy if exists "rooms are readable by visitors" on public.rooms;
drop policy if exists "rooms can be created by visitors" on public.rooms;
drop policy if exists "messages are readable by visitors" on public.messages;
drop policy if exists "messages can be created by visitors" on public.messages;

create policy "rooms are readable by visitors"
  on public.rooms for select
  to anon
  using (true);

create policy "rooms can be created by visitors"
  on public.rooms for insert
  to anon
  with check (true);

create policy "messages are readable by visitors"
  on public.messages for select
  to anon
  using (true);

create policy "messages can be created by visitors"
  on public.messages for insert
  to anon
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
