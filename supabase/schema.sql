-- Alan — cosa vuole? · schema Supabase
-- Eseguire una volta nel SQL Editor del progetto (Supabase → SQL Editor → New query → Run).

-- 1) Chi appartiene a quale famiglia. Un utente può stare in una sola famiglia.
create table if not exists public.family_members (
  family_id uuid not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  primary key (family_id, user_id)
);

-- 2) Il diario: una riga per voce (pappa, pannolino, nanna, sveglio, altro, pianto).
create table if not exists public.events (
  id          text primary key,            -- id generato dal client
  family_id   uuid not null,
  t           bigint not null,             -- epoch ms dell'evento
  k           text not null,               -- feed | diaper | sleep | wake | other | cry
  who         text,                        -- chi ha registrato (Fabio / Ilaria)
  data        jsonb not null default '{}', -- tutto il resto (ml, prep, drunk, pipi, cacca, what, dur, label, bins, ctx, feat)
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists events_family_updated on public.events (family_id, updated_at);
create index if not exists events_family_t on public.events (family_id, t);

-- 3) Sicurezza: ogni riga è visibile e modificabile solo dai membri della sua famiglia.
alter table public.family_members enable row level security;
alter table public.events enable row level security;

drop policy if exists "members: read own" on public.family_members;
create policy "members: read own" on public.family_members
  for select using (user_id = auth.uid());

drop policy if exists "events: family read" on public.events;
create policy "events: family read" on public.events
  for select using (family_id in (select family_id from public.family_members where user_id = auth.uid()));

drop policy if exists "events: family insert" on public.events;
create policy "events: family insert" on public.events
  for insert with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

drop policy if exists "events: family update" on public.events;
create policy "events: family update" on public.events
  for update using (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

-- 4) Realtime: le modifiche arrivano subito all'altro telefono.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- 5) Audio dei pianti: bucket privato "cries", un oggetto per pianto in <family_id>/<id>.<ext>.
--    Le policy leggono la cartella (primo segmento del nome) e la confrontano con la famiglia dell'utente.
insert into storage.buckets (id, name, public) values ('cries', 'cries', false) on conflict (id) do nothing;

drop policy if exists "cries: family read" on storage.objects;
create policy "cries: family read" on storage.objects
  for select using (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

drop policy if exists "cries: family insert" on storage.objects;
create policy "cries: family insert" on storage.objects
  for insert with check (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

drop policy if exists "cries: family update" on storage.objects;
create policy "cries: family update" on storage.objects
  for update using (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

drop policy if exists "cries: family delete" on storage.objects;
create policy "cries: family delete" on storage.objects
  for delete using (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

-- 6) DOPO aver creato i due utenti in Authentication → Users (Add user, Auto Confirm),
--    eseguire questo per metterli nella stessa famiglia (l'uuid è arbitrario, basta che sia lo stesso per entrambi):
-- insert into public.family_members (family_id, user_id)
-- select '11111111-1111-4111-8111-111111111111', id from auth.users
-- on conflict do nothing;
