-- BUDG-021 — Supersede BUDG-020 Spaces with read-only Public Share Page
-- See: obsidian-vault/Tickets/BUDG-020 — FEAT | Shared Budget Spaces/ADR/
--      BUDG-020 - ADR-004 - Supersede Spaces with read-only public share page.md
--
-- This migration is the single source of truth for the schema flip. It is
-- safe because BUDG-020 has not been released to any user (no production
-- rows have space_id set). On a fresh DB the Drop section is a no-op.
--
-- Sections:
--   1. Drop BUDG-020 tables (CASCADE — removes their RLS policies and FKs).
--   2. Drop BUDG-020 RLS policies left on transactions/recurring_rules.
--   3. Drop BUDG-020 RPCs (CASCADE for any remaining dependents).
--   4. Drop BUDG-020 columns + constraints + indexes on transactions/recurring_rules.
--   5. Add is_shared boolean to transactions + recurring_rules.
--   6. Create share_links table with RLS (owner-only).
--   7. Create get_public_share(slug) SECURITY DEFINER RPC for unauthenticated reads.

-- =========================================================================
-- 1. Drop BUDG-020 tables FIRST
--    (CASCADE removes RLS policies on these tables, which would otherwise
--    keep my_space_ids() pinned in step 3.)
-- =========================================================================

drop trigger if exists spaces_add_owner_member_trg on public.spaces;
drop trigger if exists spaces_set_updated_at on public.spaces;

drop table if exists public.space_invites cascade;
drop table if exists public.space_categories cascade;
drop table if exists public.space_members cascade;
drop table if exists public.spaces cascade;


-- =========================================================================
-- 2. Drop BUDG-020 RLS policies left on transactions/recurring_rules
-- =========================================================================

drop policy if exists "transactions: space members can select shared" on public.transactions;
drop policy if exists "recurring_rules: space members can select shared" on public.recurring_rules;


-- =========================================================================
-- 3. Drop BUDG-020 RPCs
-- =========================================================================

drop function if exists public.consume_space_invite(text) cascade;
drop function if exists public.get_space_member_profiles(uuid) cascade;
drop function if exists public.my_space_ids() cascade;
drop function if exists public.spaces_add_owner_member() cascade;


-- =========================================================================
-- 4. Drop BUDG-020 columns / constraints / indexes from transactions + recurring_rules
-- =========================================================================

alter table public.transactions
  drop constraint if exists transactions_space_consistency_chk;
drop index if exists public.transactions_space_idx;
alter table public.transactions
  drop column if exists space_category_id,
  drop column if exists space_id;

alter table public.recurring_rules
  drop constraint if exists recurring_rules_space_consistency_chk;
drop index if exists public.recurring_rules_space_idx;
alter table public.recurring_rules
  drop column if exists space_category_id,
  drop column if exists space_id;


-- =========================================================================
-- 5. Add is_shared flag to transactions + recurring_rules
-- =========================================================================

alter table public.transactions
  add column if not exists is_shared boolean not null default false;

create index if not exists transactions_is_shared_idx
  on public.transactions (user_id, occurred_on)
  where is_shared = true;

alter table public.recurring_rules
  add column if not exists is_shared boolean not null default false;

create index if not exists recurring_rules_is_shared_idx
  on public.recurring_rules (user_id)
  where is_shared = true;


-- =========================================================================
-- 6. share_links table — one row per user; slug is the public URL key.
-- =========================================================================

create table if not exists public.share_links (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  slug text not null unique,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists share_links_slug_idx on public.share_links (slug);

drop trigger if exists share_links_set_updated_at on public.share_links;
create trigger share_links_set_updated_at
  before update on public.share_links
  for each row execute function public.set_updated_at();

alter table public.share_links enable row level security;

drop policy if exists "share_links: owner can select" on public.share_links;
create policy "share_links: owner can select"
  on public.share_links for select
  using (user_id = auth.uid());

drop policy if exists "share_links: owner can insert" on public.share_links;
create policy "share_links: owner can insert"
  on public.share_links for insert
  with check (user_id = auth.uid());

drop policy if exists "share_links: owner can update" on public.share_links;
create policy "share_links: owner can update"
  on public.share_links for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "share_links: owner can delete" on public.share_links;
create policy "share_links: owner can delete"
  on public.share_links for delete
  using (user_id = auth.uid());


-- =========================================================================
-- 7. get_public_share(slug) — unauthenticated read of one user's shared bag.
--    Returns jsonb: { display_name, transactions: [...], recurring_rules: [...] }.
--    Filtered to is_shared = true. Empty / null if slug unknown.
-- =========================================================================

create or replace function public.get_public_share(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_name  text;
  v_currency text;
  v_tx    jsonb;
  v_rr    jsonb;
begin
  select user_id, display_name
    into v_owner, v_name
    from public.share_links
   where slug = p_slug;

  if v_owner is null then
    return null;
  end if;

  select coalesce(currency, 'CZK')
    into v_currency
    from public.settings
   where user_id = v_owner;
  v_currency := coalesce(v_currency, 'CZK');

  select coalesce(jsonb_agg(t order by t.occurred_on), '[]'::jsonb)
    into v_tx
    from (
      select id, amount, occurred_on, description, planned, confirmed_at, category_id
        from public.transactions
       where user_id = v_owner and is_shared = true
    ) t;

  select coalesce(jsonb_agg(r order by r.starts_on), '[]'::jsonb)
    into v_rr
    from (
      select id, name, amount, kind, frequency, interval_days,
             day_of_month, day_of_week, month_of_year,
             starts_on, ends_on, active, notes, category_id
        from public.recurring_rules
       where user_id = v_owner and is_shared = true and active = true
    ) r;

  return jsonb_build_object(
    'display_name', v_name,
    'currency', v_currency,
    'transactions', v_tx,
    'recurring_rules', v_rr
  );
end;
$$;

revoke all on function public.get_public_share(text) from public;
grant execute on function public.get_public_share(text) to anon, authenticated;
