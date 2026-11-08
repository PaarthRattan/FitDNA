-- M7: how a purchase actually fit, compared later with what was predicted.
--
-- One answer per purchase: the overall fit, optionally each part, and whether it was
-- kept. Only fit zones, never body measurements or free text. This is the
-- calibration data for the engine's thresholds (and, later, a learned model).
-- Owner-only, for the user's own purchases, deleted with the user or the purchase.

create table public.fit_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid not null unique references public.purchases (id) on delete cascade,
  overall text not null check (overall in ('tight', 'fitted', 'ideal', 'relaxed', 'oversized')),
  chest text check (chest in ('tight', 'fitted', 'ideal', 'relaxed', 'oversized')),
  shoulder text check (shoulder in ('tight', 'fitted', 'ideal', 'relaxed', 'oversized')),
  length text check (length in ('tight', 'fitted', 'ideal', 'relaxed', 'oversized')),
  sleeve text check (sleeve in ('tight', 'fitted', 'ideal', 'relaxed', 'oversized')),
  kept boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger fit_feedback_updated_at
  before update on public.fit_feedback
  for each row execute function public.set_updated_at();

alter table public.fit_feedback enable row level security;

create policy "fit_feedback: owner reads"
  on public.fit_feedback for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only about one of the user's own purchases.
create policy "fit_feedback: owner inserts"
  on public.fit_feedback for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.purchases p where p.id = purchase_id and p.user_id = (select auth.uid()))
  );

create policy "fit_feedback: owner updates"
  on public.fit_feedback for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.purchases p where p.id = purchase_id and p.user_id = (select auth.uid()))
  );

create policy "fit_feedback: owner deletes"
  on public.fit_feedback for delete to authenticated
  using ((select auth.uid()) = user_id);
