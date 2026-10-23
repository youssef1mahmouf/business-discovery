-- One-time update for existing Supabase projects: in-app invitation inbox and decline action.
alter table public.bd_workspaces alter column invite_code drop not null;

create or replace function public.bd_list_my_pending_invites()
returns table(
  invite_code uuid,
  workspace_id uuid,
  request_kind text,
  sender_name text,
  sender_email text,
  project_name text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select m.invite_code,
         m.workspace_id,
         case when w.project ->> '__bdFriendRequest' = 'true' then 'friend' else 'project' end,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''), u.email, 'حساب')::text,
         u.email::text,
         coalesce(w.project ->> 'name', 'مشروع مشترك')::text,
         m.role,
         m.created_at
    from public.bd_workspace_members m
    join public.bd_workspaces w on w.id = m.workspace_id
    left join public.bd_profiles p on p.user_id = w.owner_id
    left join auth.users u on u.id = w.owner_id
   where auth.uid() is not null
     and m.user_id is null
     and m.invite_code is not null
     and lower(m.invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   order by m.created_at desc;
$$;

create or replace function public.bd_decline_workspace_invite(p_code uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_is_friend_request boolean;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;

  select m.workspace_id, coalesce(w.project ->> '__bdFriendRequest' = 'true', false)
    into v_workspace_id, v_is_friend_request
    from public.bd_workspace_members m
    join public.bd_workspaces w on w.id = m.workspace_id
   where m.invite_code = p_code
     and m.user_id is null
     and lower(m.invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   for update of m, w;

  if found then
    delete from public.bd_workspace_members
     where invite_code = p_code and user_id is null
       and lower(invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
    if v_is_friend_request then
      delete from public.bd_workspaces
       where id = v_workspace_id and partner_id is null and project ->> '__bdFriendRequest' = 'true';
    else
      update public.bd_workspaces
         set invite_code = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
       where id = v_workspace_id and invite_code = p_code and partner_id is null;
    end if;
    return;
  end if;

  update public.bd_workspaces
     set invite_code = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
   where invite_code = p_code and partner_id is null
     and lower(invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  if not found then raise exception 'الدعوة غير صالحة أو أُرسلت إلى بريد مختلف'; end if;
end;
$$;

revoke all on function public.bd_list_my_pending_invites() from public;
revoke all on function public.bd_decline_workspace_invite(uuid) from public;
grant execute on function public.bd_list_my_pending_invites() to authenticated;
grant execute on function public.bd_decline_workspace_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
