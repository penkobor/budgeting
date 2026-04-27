-- BUDG-012 Phase 5 — apply_rebalance v2: also handles one-off planned tx trims/skips.

drop function if exists public.apply_rebalance(jsonb, jsonb);

create or replace function public.apply_rebalance(
  tx jsonb,
  overrides jsonb,
  tx_updates jsonb default '[]'::jsonb
) returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  inserted public.transactions;
  o jsonb;
  u jsonb;
  new_amt numeric;
begin
  if (tx ? 'id') and nullif(tx->>'id', '') is not null then
    insert into public.transactions (
      id, occurred_on, amount, description, category_id,
      recurring_rule_id, planned, confirmed_at
    )
    values (
      (tx->>'id')::uuid,
      (tx->>'occurred_on')::date,
      (tx->>'amount')::numeric,
      nullif(tx->>'description', ''),
      nullif(tx->>'category_id', '')::uuid,
      nullif(tx->>'recurring_rule_id', '')::uuid,
      coalesce((tx->>'planned')::boolean, true),
      nullif(tx->>'confirmed_at', '')::timestamptz
    )
    on conflict (id) do update
      set occurred_on       = excluded.occurred_on,
          amount            = excluded.amount,
          description       = excluded.description,
          category_id       = excluded.category_id,
          recurring_rule_id = excluded.recurring_rule_id,
          planned           = excluded.planned,
          confirmed_at      = excluded.confirmed_at
    returning * into inserted;
  else
    insert into public.transactions (
      occurred_on, amount, description, category_id,
      recurring_rule_id, planned, confirmed_at
    )
    values (
      (tx->>'occurred_on')::date,
      (tx->>'amount')::numeric,
      nullif(tx->>'description', ''),
      nullif(tx->>'category_id', '')::uuid,
      nullif(tx->>'recurring_rule_id', '')::uuid,
      coalesce((tx->>'planned')::boolean, true),
      nullif(tx->>'confirmed_at', '')::timestamptz
    )
    returning * into inserted;
  end if;

  if overrides is not null and jsonb_typeof(overrides) = 'array' then
    for o in select * from jsonb_array_elements(overrides)
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

  if tx_updates is not null and jsonb_typeof(tx_updates) = 'array' then
    for u in select * from jsonb_array_elements(tx_updates)
    loop
      new_amt := (u->>'new_amount')::numeric;
      if new_amt <= 0 then
        delete from public.transactions where id = (u->>'id')::uuid;
      else
        update public.transactions
        set amount = -new_amt
        where id = (u->>'id')::uuid;
      end if;
    end loop;
  end if;

  return inserted;
end;
$$;

revoke all on function public.apply_rebalance(jsonb, jsonb, jsonb) from public;
grant execute on function public.apply_rebalance(jsonb, jsonb, jsonb) to authenticated;
