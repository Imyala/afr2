-- MzansiLingo sync backend — run this once in the Supabase SQL editor.
-- One row per user holding their whole progress state as JSON.
-- Row-level security means the public anon key can only ever read/write
-- the row belonging to the signed-in user.

create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "read own save"
  on public.saves for select
  using (auth.uid() = user_id);

create policy "insert own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy "update own save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- keep updated_at honest even if a client sends a stale value
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch
  before insert or update on public.saves
  for each row execute function public.touch_updated_at();
