-- M1: the user-owned core of the Fit Passport.
--
-- Every table here belongs to one user, is readable and writable only by that user
-- (row-level security), and is deleted with the user (on delete cascade), which is how
-- "Delete my data" works. Measurements are in centimetres.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consents: append-only. The latest row per scope is the current state, so a
-- withdrawal is a new row, never an edit. An identity column orders rows exactly,
-- even when several are written in the same transaction (same now()).
-- ---------------------------------------------------------------------------

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('data', 'scan')),
  action text not null check (action in ('granted', 'withdrawn')),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  region text check (char_length(region) <= 40),
  created_at timestamptz not null default now()
);

create index consents_user_scope_idx on public.consents (user_id, scope, id desc);

alter table public.consents enable row level security;

create policy "consents: owner reads"
  on public.consents for select to authenticated
  using ((select auth.uid()) = user_id);

-- No update or delete policy: users can only append.
create policy "consents: owner appends"
  on public.consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- True when the calling user's latest consent for a scope is a grant.
-- Runs with the caller's rights, so it only ever sees the caller's own rows.
create function public.has_current_consent(p_scope text) returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select c.action = 'granted'
      from public.consents c
      where c.user_id = (select auth.uid()) and c.scope = p_scope
      order by c.id desc
      limit 1
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Body measurements: one current value per measurement per user. A scan replaces
-- manual entries rather than adding to them. Writes require a current data consent,
-- enforced here in the database, not only in the app.
-- ---------------------------------------------------------------------------

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name in ('chest', 'shoulder', 'waist', 'hip', 'arm', 'torso')),
  value_cm numeric(5, 1) not null check (value_cm > 0 and value_cm < 300),
  range_cm numeric(4, 1) check (range_cm >= 0 and range_cm < 50),
  confidence smallint not null check (confidence between 0 and 100),
  source text not null check (source in ('manual', 'scan')),
  vendor_job_id text check (char_length(vendor_job_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create trigger body_measurements_updated_at
  before update on public.body_measurements
  for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;

create policy "body_measurements: owner reads"
  on public.body_measurements for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "body_measurements: owner inserts with consent"
  on public.body_measurements for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_current_consent('data')));

create policy "body_measurements: owner updates with consent"
  on public.body_measurements for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (select public.has_current_consent('data')));

-- Deleting needs no consent: withdrawing consent must never block deletion.
create policy "body_measurements: owner deletes"
  on public.body_measurements for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Fit preferences: free-text notes per garment category.
-- ---------------------------------------------------------------------------

create table public.fit_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('tee', 'shirt', 'knit', 'jacket')),
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

create trigger fit_preferences_updated_at
  before update on public.fit_preferences
  for each row execute function public.set_updated_at();

alter table public.fit_preferences enable row level security;

create policy "fit_preferences: owner reads"
  on public.fit_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "fit_preferences: owner inserts"
  on public.fit_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "fit_preferences: owner updates"
  on public.fit_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "fit_preferences: owner deletes"
  on public.fit_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Reference garments: pieces the user owns, with flat measurements and how each
-- fits them. These anchor every prediction. Chest is stored with its basis because
-- "pit to pit" is a flat width, not a circumference.
-- ---------------------------------------------------------------------------

create table public.reference_garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  category text not null check (category in ('tee', 'shirt', 'knit', 'jacket')),
  size_label text check (char_length(size_label) <= 20),
  chest_cm numeric(5, 1) check (chest_cm > 0 and chest_cm < 250),
  chest_basis text not null default 'flat' check (chest_basis in ('flat', 'circumference')),
  shoulder_cm numeric(4, 1) check (shoulder_cm > 0 and shoulder_cm < 100),
  length_cm numeric(5, 1) check (length_cm > 0 and length_cm < 200),
  sleeve_cm numeric(4, 1) check (sleeve_cm > 0 and sleeve_cm < 120),
  stretch text not null default 'none' check (stretch in ('none', 'low', 'medium', 'high')),
  fit_zone text not null check (fit_zone in ('tight', 'fitted', 'ideal', 'relaxed', 'oversized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reference_garments_user_idx on public.reference_garments (user_id);

create trigger reference_garments_updated_at
  before update on public.reference_garments
  for each row execute function public.set_updated_at();

alter table public.reference_garments enable row level security;

create policy "reference_garments: owner reads"
  on public.reference_garments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "reference_garments: owner inserts"
  on public.reference_garments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "reference_garments: owner updates"
  on public.reference_garments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "reference_garments: owner deletes"
  on public.reference_garments for delete to authenticated
  using ((select auth.uid()) = user_id);
