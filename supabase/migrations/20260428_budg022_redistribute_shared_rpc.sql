-- BUDG-022 — Shared Redistribution Phase 2:
-- Atomic RPC for redistributing money between is_shared transactions and
-- (optionally) inserting new shared events / upserting recurring overrides.
--
-- See ADR-004 for why we don't reuse apply_rebalance (its tx_updates path
-- forces sign inversion, which would corrupt income rows).
--
-- SECURITY INVOKER + RLS — every affected row is naturally scoped to
-- auth.uid(). The function additionally forces `is_shared = true` on every
-- inserted row so this code path can never leak a private tx into the bag.

create or replace function public.redistribute_shared(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  u jsonb;
  i jsonb;
  o jsonb;
begin
  -- 1. Update existing transactions' amounts (signed, no negation, no auto-delete).
  if payload ? 'tx_updates' and jsonb_typeof(payload->'tx_updates') = 'array' then
    for u in select * from jsonb_array_elements(payload->'tx_updates')
    loop
      update public.transactions
         set amount = (u->>'amount')::numeric
       where id = (u->>'id')::uuid;
    end loop;
  end if;

  -- 2. Insert brand-new shared events (used by cross-month transfer to a new
  --    row and by quick-add). is_shared is forced to true regardless of input.
  if payload ? 'tx_inserts' and jsonb_typeof(payload->'tx_inserts') = 'array' then
    for i in select * from jsonb_array_elements(payload->'tx_inserts')
    loop
      insert into public.transactions (
        occurred_on, amount, description, category_id,
        recurring_rule_id, planned, confirmed_at, is_shared
      )
      values (
        (i->>'occurred_on')::date,
        (i->>'amount')::numeric,
        nullif(i->>'description', ''),
        nullif(i->>'category_id', '')::uuid,
        nullif(i->>'recurring_rule_id', '')::uuid,
        coalesce((i->>'planned')::boolean, true),
        nullif(i->>'confirmed_at', '')::timestamptz,
        true
      );
    end loop;
  end if;

  -- 3. Upsert recurring_overrides (used when a recurring occurrence is the
  --    source — its scheduled amount is dialled down for that single date).
  if payload ? 'override_upserts' and jsonb_typeof(payload->'override_upserts') = 'array' then
    for o in select * from jsonb_array_elements(payload->'override_upserts')
    loop
      insert into public.recurring_overrides (
        recurring_rule_id, occurrence_date, amount_override, skipped
      )
      values (
        (o->>'recurring_rule_id')::uuid,
        (o->>'occurrence_date')::date,
        nullif(o->>'amount_override', '')::numeric,
        coalesce((o->>'skipped')::boolean, false)
      )
      on conflict (recurring_rule_id, occurrence_date) do update
        set amount_override = excluded.amount_override,
            skipped         = excluded.skipped;
    end loop;
  end if;
end;
$$;

revoke all on function public.redistribute_shared(jsonb) from public;
grant execute on function public.redistribute_shared(jsonb) to authenticated;

comment on function public.redistribute_shared(jsonb) is
  'BUDG-022: atomically redistribute money between is_shared transactions. '
  'Accepts {tx_updates, tx_inserts, override_upserts} arrays. '
  'tx_updates writes amount as-is (no sign flip). tx_inserts forces is_shared=true. '
  'See ADR-004 in obsidian-vault/Tickets/BUDG-022.';
