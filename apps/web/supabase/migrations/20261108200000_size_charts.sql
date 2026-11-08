-- M4c: size charts read from a listing's photos.
--
-- One chart per listing: a row per size, in cm, garment measurements only (a brand's
-- body-size guide is rejected before it gets here). It lets the fit engine say which
-- size would fit best. Shared marketplace data like listing_extractions: written only
-- by the server, readable wherever the listing is, deleted with the listing. The
-- photos themselves are never stored.

create table public.size_charts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings (id) on delete cascade,
  brand text check (char_length(brand) <= 80),
  chest_basis text not null check (chest_basis in ('flat', 'circumference')),
  -- [{"label": "M", "chest_cm": 53, "shoulder_cm": 46, "length_cm": 70, "sleeve_cm": 63}, ...]
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 2 and 12),
  source text not null check (source in ('ai_photo')),
  extractor_version text not null check (char_length(extractor_version) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger size_charts_updated_at
  before update on public.size_charts
  for each row execute function public.set_updated_at();

alter table public.size_charts enable row level security;

-- Readable wherever the listing is (the subquery applies listings' own policy).
create policy "size_charts: read with listing"
  on public.size_charts for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));
