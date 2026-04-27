-- BUDG-020 — consume_space_invite RPC
-- SECURITY DEFINER: validates token + atomically marks invite used and
-- inserts the caller into space_members. Bypasses RLS (which would
-- otherwise prevent a non-member from inserting themselves into
-- space_members).

create or replace function public.consume_space_invite(p_token text)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.space_invites;
  v_space  public.spaces;
  v_user   uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Lock the invite row to prevent double-consume races.
  select * into v_invite
  from public.space_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  if v_invite.used_at is not null then
    raise exception 'invite already used' using errcode = 'P0001';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite expired' using errcode = 'P0001';
  end if;

  -- Insert membership (idempotent — user may already be a member, e.g.
  -- if they re-clicked their own invite).
  insert into public.space_members (space_id, user_id, role)
  values (v_invite.space_id, v_user, 'member')
  on conflict (space_id, user_id) do nothing;

  -- Mark invite consumed.
  update public.space_invites
     set used_at = now(),
         used_by_user_id = v_user
   where id = v_invite.id;

  select * into v_space from public.spaces where id = v_invite.space_id;
  return v_space;
end;
$$;

revoke all on function public.consume_space_invite(text) from public;
grant execute on function public.consume_space_invite(text) to authenticated;
