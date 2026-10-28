-- Rôles Supabase + schéma de stockage minimal (pile locale de test uniquement)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'authenticator'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
create schema if not exists storage;
create schema if not exists extensions;
grant usage on schema storage, extensions to anon, authenticated, service_role;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Le binaire GoTrue seul laisse auth.users.role vide (Supabase hébergé y met « authenticated »).
create or replace function auth.pp_default_role() returns trigger language plpgsql as $$
begin
  if coalesce(new.role, '') = '' then new.role := 'authenticated'; end if;
  return new;
end $$;
drop trigger if exists pp_default_role on auth.users;
create trigger pp_default_role before insert or update on auth.users for each row execute function auth.pp_default_role();
update auth.users set role = 'authenticated' where coalesce(role, '') = '';
