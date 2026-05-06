-- Draft transactions — local scratch pad synced across devices
-- These are NOT real transactions; they live in their own table until the user
-- explicitly commits them to the ledger.

create table if not exists public.draft_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  amount numeric(14, 2) not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  created_at timestamptz not null default now()
);

create index if not exists draft_transactions_user_date_idx
  on public.draft_transactions (user_id, occurred_on);

alter table public.draft_transactions enable row level security;

create policy "draft_transactions: owner can select"
  on public.draft_transactions for select
  using (user_id = auth.uid());

create policy "draft_transactions: owner can insert"
  on public.draft_transactions for insert
  with check (user_id = auth.uid());

create policy "draft_transactions: owner can update"
  on public.draft_transactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "draft_transactions: owner can delete"
  on public.draft_transactions for delete
  using (user_id = auth.uid());
