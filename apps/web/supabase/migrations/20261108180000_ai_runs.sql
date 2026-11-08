-- M4b: a log of every AI model call, with opportunistic dedupe.
--
-- Only listing text is ever sent to a model (never body data, consent records or
-- anything about the user), and the input itself isn't stored here: only its hash,
-- the model's validated-or-not output, token counts and timing. The primary cache is
-- the listing itself (a listing isn't re-read unless it's re-fetched and changed);
-- this table also stops an identical input from being sent twice.
--
-- Server-only: row-level security is on with no policies, so neither signed-in users
-- nor anonymous visitors can read or write it. Old rows are cleared by the retention
-- job (M5).

create table public.ai_runs (
  id bigint generated always as identity primary key,
  task text not null check (char_length(task) between 1 and 40),
  model text not null check (char_length(model) between 1 and 80),
  prompt_version text not null check (char_length(prompt_version) between 1 and 40),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('ok', 'invalid', 'error')),
  output jsonb,
  error text check (char_length(error) <= 500),
  input_tokens integer check (input_tokens >= 0),
  cached_tokens integer check (cached_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (task, model, prompt_version, input_hash)
);

alter table public.ai_runs enable row level security;
-- No policies: only the server, with the secret key, reads or writes AI runs.
