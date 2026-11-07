-- A minimal stand-in for the parts of a Supabase database that our migrations and
-- row-level security rely on, so they can be tested in PGlite without Docker.
-- Test-only: never apply this to a real Supabase project, which already has all of it.

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
