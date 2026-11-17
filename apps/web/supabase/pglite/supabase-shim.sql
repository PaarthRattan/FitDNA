-- A minimal stand-in for the parts of a Supabase database that our migrations and
-- row-level security rely on, so they can be tested in PGlite without Docker.
-- Test-only: never apply this to a real Supabase project, which already has all of it.
-- It lives outside supabase/tests/ so `supabase test db` (pgTAP) never picks it up.

create schema auth;

create table auth.users (
  id uuid primary key,
  email text
);

-- Same definition as Supabase's: the user id comes from the request's JWT claims.
create function auth.uid() returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants the API roles full privileges on everything in public by default,
-- so row-level security is the only thing protecting rows. Mirror that here, so the
-- tests prove RLS does the protecting rather than missing grants.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Storage: the columns our migrations and policies touch. Supabase keeps row-level
-- security on storage.objects and grants the API roles access, as here.
create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Same definition as Supabase's: every path segment but the last (the file name).
create function storage.foldername(name text) returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
