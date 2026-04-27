-- BUDG-020 — get_space_member_profiles RPC
-- Returns (user_id, email) for members of a space the caller belongs to.
-- SECURITY DEFINER to read auth.users; authorization check inside body.

create or replace function public.get_space_member_profiles(p_space_id uuid)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.space_members
     where space_id = p_space_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this space' using errcode = '42501';
  end if;

  return query
    select sm.user_id, u.email::text
      from public.space_members sm
      join auth.users u on u.id = sm.user_id
     where sm.space_id = p_space_id;
end;
$$;

revoke all on function public.get_space_member_profiles(uuid) from public;
grant execute on function public.get_space_member_profiles(uuid) to authenticated;
