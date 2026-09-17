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

-- 2b) Impostazioni condivise (nome, data di nascita): una riga per famiglia, last-writer-wins su updated_at.
create table if not exists public.family_settings (
  family_id   uuid primary key,
  name        text,
  birth       text,                       -- YYYY-MM-DD
  feed_h      numeric,                    -- intervallo pappe scelto dai genitori (ore); null = norma per età
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
alter table public.family_settings add column if not exists feed_h numeric;

-- 3) Sicurezza: ogni riga è visibile e modificabile solo dai membri della sua famiglia.
alter table public.family_members enable row level security;
alter table public.events enable row level security;
alter table public.family_settings enable row level security;

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

drop policy if exists "settings: family read" on public.family_settings;
create policy "settings: family read" on public.family_settings
  for select using (family_id in (select family_id from public.family_members where user_id = auth.uid()));

drop policy if exists "settings: family insert" on public.family_settings;
create policy "settings: family insert" on public.family_settings
  for insert with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

drop policy if exists "settings: family update" on public.family_settings;
create policy "settings: family update" on public.family_settings
  for update using (family_id in (select family_id from public.family_members where user_id = auth.uid()))
  with check (family_id in (select family_id from public.family_members where user_id = auth.uid()));

-- 4) Realtime: le modifiche arrivano subito all'altro telefono.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'family_settings') then
    alter publication supabase_realtime add table public.family_settings;
  end if;
end $$;

-- 5) Audio dei pianti: bucket privato "cries", una cartella per famiglia (<family_id>/<event_id>.<ext>), file fino a 10 MB.
--    Le policy leggono la cartella (primo segmento del nome) e la confrontano con la famiglia dell'utente.
insert into storage.buckets (id, name, public, file_size_limit)
values ('cries', 'cries', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "cries: family read" on storage.objects;
create policy "cries: family read" on storage.objects for select to authenticated
  using (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

drop policy if exists "cries: family insert" on storage.objects;
create policy "cries: family insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

drop policy if exists "cries: family update" on storage.objects;
create policy "cries: family update" on storage.objects for update to authenticated
  using (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()))
  with check (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

drop policy if exists "cries: family delete" on storage.objects;
create policy "cries: family delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cries' and (storage.foldername(name))[1] in (select family_id::text from public.family_members where user_id = auth.uid()));

-- 6) DOPO aver creato i due utenti in Authentication → Users (Add user, Auto Confirm),
--    eseguire questo per metterli nella stessa famiglia (l'uuid è arbitrario, basta che sia lo stesso per entrambi):
-- insert into public.family_members (family_id, user_id)
-- select '11111111-1111-4111-8111-111111111111', id from auth.users
-- on conflict do nothing;

-- 7) Nome visualizzato di ciascun genitore (l'app lo legge dal profilo dell'utente loggato e lo usa come "chi ha registrato"):
-- update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || '{"name":"Fabio"}'::jsonb where email = 'email-di-fabio';
-- update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || '{"name":"Ilaria"}'::jsonb where email = 'email-di-ilaria';
