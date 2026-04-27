-- BUDG-020 Phase 1 — Shared Budget Spaces: schema + RLS
-- Apply via: Supabase MCP `apply_migration` OR Dashboard SQL editor.
--
-- Adds: spaces, space_members, space_categories, space_invites tables;
--       space_id + space_category_id columns on transactions and recurring_rules;
--       RLS policies enforcing the "personal-ledger + shared-view" model
--       (every tx belongs to one user; members of a space can READ each other's
--       shared tx but never write them).

-- =========================================================================
-- 1. Tables
-- =========================================================================

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spaces_owner_idx on public.spaces (owner_user_id);

drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();


create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_members_user_idx on public.space_members (user_id);
create index if not exists space_members_space_idx on public.space_members (space_id);


create table if not exists public.space_categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists space_categories_space_idx on public.space_categories (space_id, sort_order);


create table if not exists public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  token text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists space_invites_space_idx on public.space_invites (space_id);
create index if not exists space_invites_token_idx on public.space_invites (token);


-- =========================================================================
-- 2. Add space tag columns to transactions and recurring_rules
-- =========================================================================

alter table public.transactions
  add column if not exists space_id uuid references public.spaces(id) on delete set null,
  add column if not exists space_category_id uuid references public.space_categories(id) on delete set null;

-- A space_category_id is only meaningful when the row is shared (space_id set).
-- Shared rows MAY be uncategorized — symmetrical with personal rows whose
-- category_id is freely nullable.
alter table public.transactions
  drop constraint if exists transactions_space_consistency_chk;
alter table public.transactions
  add constraint transactions_space_consistency_chk
  check (space_category_id is null or space_id is not null);

create index if not exists transactions_space_idx
  on public.transactions (space_id, occurred_on)
  where space_id is not null;


alter table public.recurring_rules
  add column if not exists space_id uuid references public.spaces(id) on delete set null,
  add column if not exists space_category_id uuid references public.space_categories(id) on delete set null;

alter table public.recurring_rules
  drop constraint if exists recurring_rules_space_consistency_chk;
alter table public.recurring_rules
  add constraint recurring_rules_space_consistency_chk
  check (space_category_id is null or space_id is not null);

create index if not exists recurring_rules_space_idx
  on public.recurring_rules (space_id)
  where space_id is not null;


-- =========================================================================
-- 3. Helper: list spaces the current user belongs to (SECURITY DEFINER to
--    bypass RLS recursion when used inside other policies)
-- =========================================================================

create or replace function public.my_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.space_members where user_id = auth.uid();
$$;

revoke all on function public.my_space_ids() from public;
grant execute on function public.my_space_ids() to authenticated;


-- =========================================================================
-- 4. Auto-create owner membership on space insert
-- =========================================================================

create or replace function public.spaces_add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.space_members (space_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists spaces_add_owner_member_trg on public.spaces;
create trigger spaces_add_owner_member_trg
  after insert on public.spaces
  for each row execute function public.spaces_add_owner_member();


-- =========================================================================
-- 5. RLS — enable
-- =========================================================================

alter table public.spaces            enable row level security;
alter table public.space_members     enable row level security;
alter table public.space_categories  enable row level security;
alter table public.space_invites     enable row level security;


-- =========================================================================
-- 6. RLS — spaces
-- =========================================================================

drop policy if exists "spaces: members can select" on public.spaces;
create policy "spaces: members can select"
  on public.spaces for select
  using (
    -- Owner must be visible directly: PostgREST's `Prefer: return=representation`
    -- issues INSERT...RETURNING, and Postgres evaluates SELECT USING against the
    -- new row before the AFTER INSERT trigger inserts the owner into
    -- space_members. Without this branch every fresh INSERT fails with 42501.
    owner_user_id = auth.uid()
    or id in (select public.my_space_ids())
  );

drop policy if exists "spaces: authenticated can create" on public.spaces;
create policy "spaces: authenticated can create"
  on public.spaces for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "spaces: owner can update" on public.spaces;
create policy "spaces: owner can update"
  on public.spaces for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "spaces: owner can delete" on public.spaces;
create policy "spaces: owner can delete"
  on public.spaces for delete
  using (owner_user_id = auth.uid());


-- =========================================================================
-- 7. RLS — space_members
-- =========================================================================

drop policy if exists "space_members: members can select" on public.space_members;
create policy "space_members: members can select"
  on public.space_members for select
  using (space_id in (select public.my_space_ids()));

-- INSERT for members happens via the consume_invite RPC (SECURITY DEFINER).
-- Direct INSERT is restricted to owners (e.g. for future "add by email").
drop policy if exists "space_members: owner can insert" on public.space_members;
create policy "space_members: owner can insert"
  on public.space_members for insert
  with check (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "space_members: owner can update role" on public.space_members;
create policy "space_members: owner can update role"
  on public.space_members for update
  using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_user_id = auth.uid()
    )
  );

-- Self-leave or owner-kick.
drop policy if exists "space_members: self or owner can delete" on public.space_members;
create policy "space_members: self or owner can delete"
  on public.space_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_user_id = auth.uid()
    )
  );


-- =========================================================================
-- 8. RLS — space_categories (members can manage)
-- =========================================================================

drop policy if exists "space_categories: members can select" on public.space_categories;
create policy "space_categories: members can select"
  on public.space_categories for select
  using (space_id in (select public.my_space_ids()));

drop policy if exists "space_categories: members can insert" on public.space_categories;
create policy "space_categories: members can insert"
  on public.space_categories for insert
  with check (space_id in (select public.my_space_ids()));

drop policy if exists "space_categories: members can update" on public.space_categories;
create policy "space_categories: members can update"
  on public.space_categories for update
  using (space_id in (select public.my_space_ids()))
  with check (space_id in (select public.my_space_ids()));

drop policy if exists "space_categories: members can delete" on public.space_categories;
create policy "space_categories: members can delete"
  on public.space_categories for delete
  using (space_id in (select public.my_space_ids()));


-- =========================================================================
-- 9. RLS — space_invites (owner-managed; consume via RPC)
-- =========================================================================

drop policy if exists "space_invites: owner can select" on public.space_invites;
create policy "space_invites: owner can select"
  on public.space_invites for select
  using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "space_invites: owner can insert" on public.space_invites;
create policy "space_invites: owner can insert"
  on public.space_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "space_invites: owner can delete" on public.space_invites;
create policy "space_invites: owner can delete"
  on public.space_invites for delete
  using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_user_id = auth.uid()
    )
  );


-- =========================================================================
-- 10. RLS — extend transactions and recurring_rules to allow READ of shared
--     tx by space members.
--     We add NEW permissive SELECT policies; existing "owner can select"
--     policies remain untouched. Postgres OR-combines permissive policies.
-- =========================================================================

drop policy if exists "transactions: space members can select shared" on public.transactions;
create policy "transactions: space members can select shared"
  on public.transactions for select
  using (
    space_id is not null
    and space_id in (select public.my_space_ids())
  );

drop policy if exists "recurring_rules: space members can select shared" on public.recurring_rules;
create policy "recurring_rules: space members can select shared"
  on public.recurring_rules for select
  using (
    space_id is not null
    and space_id in (select public.my_space_ids())
  );

-- NOTE: We deliberately do NOT add INSERT/UPDATE/DELETE policies for shared
-- tx/recurring_rules of other users. Existing owner-only mutation policies
-- keep the invariant: members can read each other's shared transactions,
-- but only the author can mutate them.
