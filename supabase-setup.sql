-- Marathontracker: tabel voor je gegevens.
-- Plak dit hele bestand in Supabase -> SQL Editor -> New query, en klik op Run.

create table if not exists public.entries (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  kind       text not null,
  data       jsonb not null,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists entries_user_ts on public.entries (user_id, server_ts);

-- Houdt bij wanneer de server iets ontving (zo weet elk apparaat wat nieuw is).
create or replace function public.entries_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_ts := clock_timestamp();
  return new;
end
$$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch
  before insert or update on public.entries
  for each row execute function public.entries_touch();

-- Alleen jij kunt jouw gegevens zien en wijzigen.
alter table public.entries enable row level security;

drop policy if exists "Alleen eigen gegevens" on public.entries;
create policy "Alleen eigen gegevens" on public.entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.entries to authenticated;
