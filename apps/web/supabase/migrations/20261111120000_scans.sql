-- M6: photo body scans and the avatar they produce.
--
-- Photos are never stored anywhere: they go from the browser through a Route Handler to
-- the scan service in one request and are discarded. What's kept:
-- * scans: one row per scan request, its status, the stated height, and (when done) the
--   measurements the service returned for the fields the fit engine uses. Weight, age and
--   sex, if given, only sharpen the estimate and are never stored.
-- * avatars: the user's current avatar: body-shape numbers only (20 body coefficients and
--   the skeleton scales; no head, face or hand parameters) and the path of a faceless GLB
--   in the private `avatars` bucket.
--
-- Writes need both a current scan consent and a current data consent, checked here in the
-- database. Deleting never needs consent. Everything cascades from auth.users, except
-- Storage objects, which only the Storage API can delete: the app removes the user's
-- folder before withdrawing consent or deleting the account.

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error_code text check (
    error_code in (
      'too_large', 'bad_image', 'no_person', 'multiple_people', 'pose_front', 'pose_side',
      'bad_height', 'timeout', 'busy', 'failed'
    )
  ),
  adult_attested boolean not null check (adult_attested),
  height_cm numeric(4, 1) not null check (height_cm between 120 and 230),
  pipeline_version text check (char_length(pipeline_version) <= 200),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'failed') = (error_code is not null)),
  check (status = 'done' or result is null),
  -- Lets avatars reference (user_id, id), so an avatar can only point at its owner's scan.
  unique (user_id, id)
);

create index scans_user_created_idx on public.scans (user_id, created_at desc);

create trigger scans_updated_at
  before update on public.scans
  for each row execute function public.set_updated_at();

alter table public.scans enable row level security;

create policy "scans: owner reads"
  on public.scans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "scans: owner inserts with consent"
  on public.scans for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.has_current_consent('scan'))
    and (select public.has_current_consent('data'))
  );

create policy "scans: owner updates with consent"
  on public.scans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (select public.has_current_consent('scan'))
    and (select public.has_current_consent('data'))
  );

create policy "scans: owner deletes"
  on public.scans for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Avatars: at most one per user, the latest successful scan's.
-- ---------------------------------------------------------------------------

create table public.avatars (
  user_id uuid primary key references auth.users (id) on delete cascade,
  scan_id uuid not null,
  storage_path text not null,
  glb_bytes integer not null check (glb_bytes between 1 and 2097152),
  shape_layout text not null check (char_length(shape_layout) between 1 and 60),
  body_coeffs real[] not null check (cardinality(body_coeffs) = 20),
  body_scales jsonb not null check (jsonb_typeof(body_scales) = 'object'),
  pipeline_version text not null check (char_length(pipeline_version) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The object lives in the owner's folder, named after its scan, and nowhere else.
  check (storage_path = user_id::text || '/' || scan_id::text || '.glb'),
  -- Foreign-key checks ignore row-level security; the composite key keeps it to the owner's scans.
  foreign key (user_id, scan_id) references public.scans (user_id, id) on delete cascade
);

create index avatars_scan_idx on public.avatars (scan_id);

create trigger avatars_updated_at
  before update on public.avatars
  for each row execute function public.set_updated_at();

alter table public.avatars enable row level security;

create policy "avatars: owner reads"
  on public.avatars for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "avatars: owner inserts with consent"
  on public.avatars for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.has_current_consent('scan'))
    and (select public.has_current_consent('data'))
  );

create policy "avatars: owner updates with consent"
  on public.avatars for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (select public.has_current_consent('scan'))
    and (select public.has_current_consent('data'))
  );

create policy "avatars: owner deletes"
  on public.avatars for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Storage: a private bucket, one folder per user (<user id>/<scan id>.glb).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['model/gltf-binary'])
on conflict (id) do nothing;

create policy "avatars bucket: owner reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars bucket: owner uploads with consent"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_current_consent('scan'))
    and (select public.has_current_consent('data'))
  );

create policy "avatars bucket: owner replaces with consent"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_current_consent('scan'))
    and (select public.has_current_consent('data'))
  );

create policy "avatars bucket: owner deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Retention: scans that never finished, or failed, hold no measurements worth keeping.
-- Re-created to add them; the return type changes, so drop first. The pg_cron job calls
-- it by name and needs no change.
-- ---------------------------------------------------------------------------

drop function public.purge_expired();

create function public.purge_expired()
returns table (listings_deleted integer, ai_runs_deleted integer, scans_deleted integer)
language plpgsql
set search_path = ''
as $$
declare
  n_listings integer;
  n_runs integer;
  n_scans integer;
begin
  delete from public.listings
  where not is_demo and coalesce(retention_until, created_at + interval '90 days') < now();
  get diagnostics n_listings = row_count;

  delete from public.ai_runs where created_at < now() - interval '90 days';
  get diagnostics n_runs = row_count;

  delete from public.scans where status <> 'done' and created_at < now() - interval '30 days';
  get diagnostics n_scans = row_count;

  return query select n_listings, n_runs, n_scans;
end;
$$;

revoke execute on function public.purge_expired() from public, anon, authenticated;
