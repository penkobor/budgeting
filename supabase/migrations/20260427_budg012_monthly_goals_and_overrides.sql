-- BUDG-012 Phase 1 — Monthly goals + recurring overrides
-- Apply via: Supabase MCP `apply_migration` OR Dashboard SQL editor.

-- 1. monthly_goals: one row per (user, year_month). Goal = target end-of-month balance.
create table if not exists public.monthly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year_month)
);

create index if not exists monthly_goals_user_month_idx
  on public.monthly_goals (user_id, year_month);

alter table public.monthly_goals enable row level security;

create policy "monthly_goals: owner can select"
  on public.monthly_goals for select
  using (user_id = auth.uid());

create policy "monthly_goals: owner can insert"
  on public.monthly_goals for insert
  with check (user_id = auth.uid());

create policy "monthly_goals: owner can update"
  on public.monthly_goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "monthly_goals: owner can delete"
  on public.monthly_goals for delete
  using (user_id = auth.uid());

-- Auto-bump updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists monthly_goals_set_updated_at on public.monthly_goals;
create trigger monthly_goals_set_updated_at
  before update on public.monthly_goals
  for each row execute function public.set_updated_at();


-- 2. recurring_overrides: per-occurrence trim or skip without mutating template.
create table if not exists public.recurring_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recurring_rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  occurrence_date date not null,
  amount_override numeric(14, 2),
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (recurring_rule_id, occurrence_date),
  check (skipped = true or amount_override is not null)
);

create index if not exists recurring_overrides_user_date_idx
  on public.recurring_overrides (user_id, occurrence_date);

create index if not exists recurring_overrides_rule_date_idx
  on public.recurring_overrides (recurring_rule_id, occurrence_date);

alter table public.recurring_overrides enable row level security;

create policy "recurring_overrides: owner can select"
  on public.recurring_overrides for select
  using (user_id = auth.uid());

create policy "recurring_overrides: owner can insert"
  on public.recurring_overrides for insert
  with check (user_id = auth.uid());

create policy "recurring_overrides: owner can update"
  on public.recurring_overrides for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "recurring_overrides: owner can delete"
  on public.recurring_overrides for delete
  using (user_id = auth.uid());
