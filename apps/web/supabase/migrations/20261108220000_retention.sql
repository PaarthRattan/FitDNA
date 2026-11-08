-- Retention: delete what we said we wouldn't keep.
--
-- * Listings past their retention date (90 days after the last successful fetch, set
--   by the import; for a listing that was never fetched, 90 days after it was created).
--   Deleting a listing removes its extractions, size chart, price observations,
--   imports, overrides and saves (on delete cascade). Purchases keep their prediction
--   snapshot, with the listing link set to null, so fit feedback still works.
-- * AI run logs older than 90 days.
--
-- Demo listings are never deleted. Runs nightly with pg_cron where it's available
-- (it is on Supabase); the function can also be run by hand.

create function public.purge_expired() returns table (listings_deleted integer, ai_runs_deleted integer)
language plpgsql
set search_path = ''
as $$
declare
  n_listings integer;
  n_runs integer;
begin
  delete from public.listings
  where not is_demo and coalesce(retention_until, created_at + interval '90 days') < now();
  get diagnostics n_listings = row_count;

  delete from public.ai_runs where created_at < now() - interval '90 days';
  get diagnostics n_runs = row_count;

  return query select n_listings, n_runs;
end;
$$;

-- Only the database owner (and the scheduler) may run it, not the API roles.
revoke execute on function public.purge_expired() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-expired', '17 3 * * *', 'select public.purge_expired()');
  end if;
end;
$$;
