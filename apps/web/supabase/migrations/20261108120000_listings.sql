-- M4a: marketplace listings imported from pasted links, and each user's view of them.
--
-- Two kinds of table:
--
-- * Shared marketplace data (listings, listing_extractions, price_observations): one row
--   per listing however many users import it. Only the server writes these, with the
--   secret key and after checking the user; no user can edit them. A user sees a listing
--   only if they imported it, or if it's a demo listing, so nobody can browse what other
--   people looked at. No raw page text is stored: only extracted fields and a hash.
--
-- * User-owned (listing_imports, listing_overrides, saved_listings, purchases): owner-only
--   and deleted with the user. listing_imports is server-written as well, because it is
--   also the per-user daily import count.

-- ---------------------------------------------------------------------------
-- Listings (shared)
-- ---------------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null check (marketplace in ('ebay', 'grailed', 'poshmark', 'mercari', 'depop', 'vinted')),
  -- Tracking parameters stripped; the dedupe key.
  canonical_url text not null unique check (canonical_url like 'https://%' and char_length(canonical_url) <= 500),
  title text check (char_length(title) <= 200),
  price numeric(10, 2) check (price >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  size_label text check (char_length(size_label) <= 40),
  condition text check (condition in ('new', 'like_new', 'excellent', 'good', 'fair', 'poor')),
  seller_rating numeric(2, 1) check (seller_rating between 0 and 5),
  image_urls text[] not null default '{}' check (cardinality(image_urls) <= 8),
  -- Hash of the scraped page text, to skip re-extracting an unchanged page.
  content_hash text check (char_length(content_hash) <= 100),
  -- Null until a scrape succeeds (a blocked site still gets a row, filled in by hand).
  fetched_at timestamptz,
  -- When this row may no longer be kept. Enforced by a scheduled job from M5.
  retention_until timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

alter table public.listings enable row level security;

-- ---------------------------------------------------------------------------
-- Listing imports: one row per link a user pastes. Server-written, owner-readable.
-- Only the canonical listing is kept, not the URL as pasted, which can carry
-- share or referral tokens.
-- ---------------------------------------------------------------------------

create table public.listing_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'fetching', 'done', 'failed')),
  error_code text check (error_code in ('disabled', 'blocked', 'not_found', 'timeout', 'busy', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'failed') = (error_code is not null))
);

create index listing_imports_user_created_idx on public.listing_imports (user_id, created_at desc);
create index listing_imports_listing_user_idx on public.listing_imports (listing_id, user_id);

create trigger listing_imports_updated_at
  before update on public.listing_imports
  for each row execute function public.set_updated_at();

alter table public.listing_imports enable row level security;

-- No insert, update or delete policy: only the server writes imports.
create policy "listing_imports: owner reads"
  on public.listing_imports for select to authenticated
  using ((select auth.uid()) = user_id);

-- A listing is visible to the users who imported it, and demo listings to everyone.
create policy "listings: read demo or imported"
  on public.listings for select to anon, authenticated
  using (
    is_demo
    or exists (
      select 1 from public.listing_imports i
      where i.listing_id = listings.id and i.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Listing extractions (shared): measurements read from a listing, one row per
-- source. `fields` holds each measurement with its basis and the text it came from;
-- the app validates its shape.
-- ---------------------------------------------------------------------------

create table public.listing_extractions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  source text not null check (source in ('seller', 'size_chart', 'ai_text', 'ai_photo')),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  extractor_version text not null check (char_length(extractor_version) <= 40),
  content_hash text check (char_length(content_hash) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, source)
);

create trigger listing_extractions_updated_at
  before update on public.listing_extractions
  for each row execute function public.set_updated_at();

alter table public.listing_extractions enable row level security;

-- Readable wherever the listing is (the subquery applies listings' own policy).
create policy "listing_extractions: read with listing"
  on public.listing_extractions for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

-- ---------------------------------------------------------------------------
-- Price observations (shared): one per successful fetch, for price history.
-- ---------------------------------------------------------------------------

create table public.price_observations (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  observed_at timestamptz not null default now()
);

create index price_observations_listing_idx on public.price_observations (listing_id, observed_at desc);

alter table public.price_observations enable row level security;

create policy "price_observations: read with listing"
  on public.price_observations for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

-- ---------------------------------------------------------------------------
-- Listing overrides: a user's own corrections to a listing. Never an edit to the
-- shared row, so one user's correction can't change anyone else's predictions.
-- A column is null when the user hasn't corrected it; `cleared` lists measurements
-- the user says are wrong and should be ignored.
-- ---------------------------------------------------------------------------

create table public.listing_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  title text check (char_length(title) <= 80),
  category text check (category in ('tee', 'shirt', 'knit', 'jacket')),
  size_label text check (char_length(size_label) <= 40),
  stretch text check (stretch in ('none', 'low', 'medium', 'high')),
  chest_cm numeric(5, 1) check (chest_cm > 0 and chest_cm < 250),
  chest_basis text check (chest_basis in ('flat', 'circumference')),
  shoulder_cm numeric(4, 1) check (shoulder_cm > 0 and shoulder_cm < 100),
  length_cm numeric(5, 1) check (length_cm > 0 and length_cm < 200),
  sleeve_cm numeric(4, 1) check (sleeve_cm > 0 and sleeve_cm < 120),
  cleared text[] not null default '{}' check (cleared <@ array['chest', 'shoulder', 'length', 'sleeve']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id),
  check ((chest_cm is null) = (chest_basis is null))
);

create trigger listing_overrides_updated_at
  before update on public.listing_overrides
  for each row execute function public.set_updated_at();

alter table public.listing_overrides enable row level security;

create policy "listing_overrides: owner reads"
  on public.listing_overrides for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only for a listing the user can see.
create policy "listing_overrides: owner inserts"
  on public.listing_overrides for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.listings l where l.id = listing_id));

create policy "listing_overrides: owner updates"
  on public.listing_overrides for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.listings l where l.id = listing_id));

create policy "listing_overrides: owner deletes"
  on public.listing_overrides for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Saved listings
-- ---------------------------------------------------------------------------

create table public.saved_listings (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index saved_listings_user_created_idx on public.saved_listings (user_id, created_at desc);

alter table public.saved_listings enable row level security;

create policy "saved_listings: owner reads"
  on public.saved_listings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "saved_listings: owner inserts"
  on public.saved_listings for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.listings l where l.id = listing_id));

create policy "saved_listings: owner deletes"
  on public.saved_listings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Purchases: "I bought this", with a snapshot of the prediction at that moment, so
-- post-purchase fit feedback (M7) can be compared with what was predicted. The
-- snapshot holds zones and differences, not body measurements, and survives the
-- listing itself being deleted.
-- ---------------------------------------------------------------------------

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  marketplace text not null check (marketplace in ('ebay', 'grailed', 'poshmark', 'mercari', 'depop', 'vinted')),
  listing_title text check (char_length(listing_title) <= 200),
  listing_url text check (char_length(listing_url) <= 500),
  category text not null check (category in ('tee', 'shirt', 'knit', 'jacket')),
  size_label text check (char_length(size_label) <= 40),
  prediction jsonb not null check (jsonb_typeof(prediction) = 'object'),
  engine_version text not null check (char_length(engine_version) <= 40),
  inputs_hash text not null check (char_length(inputs_hash) <= 100),
  purchased_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index purchases_user_idx on public.purchases (user_id, purchased_at desc);

alter table public.purchases enable row level security;

create policy "purchases: owner reads"
  on public.purchases for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "purchases: owner inserts"
  on public.purchases for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id))
  );

create policy "purchases: owner deletes"
  on public.purchases for delete to authenticated
  using ((select auth.uid()) = user_id);
