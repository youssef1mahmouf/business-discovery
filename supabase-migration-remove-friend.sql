-- Migration: Add public.bd_remove_friendship(p_id uuid)
-- Purpose: Safely remove an accepted/outgoing friendship record.
-- A friendship is represented by a row in public.bd_workspaces whose
-- project JSON has "__bdFriendRequest" = true.
--
-- This function does NOT delete independently shared projects, memberships,
-- messages, or any other unrelated data. It deletes only the friendship row.

BEGIN;

create or replace function public.bd_remove_friendship(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_is_friend_request boolean;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  if p_id is null then
    raise exception 'معرّف الصداقة غير صالح';
  end if;

  -- Lock and verify that the caller is a legitimate participant in this record.
  select w.id,
         coalesce(w.project -> '__bdFriendRequest' = 'true'::jsonb, false)
    into v_workspace_id, v_is_friend_request
    from public.bd_workspaces w
   where w.id = p_id
     and (w.owner_id = auth.uid() or w.partner_id = auth.uid())
   for update of w;

  if not found then
    raise exception 'الصداقة غير موجودة أو لا تملك صلاحية إزالتها';
  end if;

  -- Verify that the record represents a friendship, not an ordinary project.
  if not v_is_friend_request then
    raise exception 'هذا المعرّف لا يمثل صداقة';
  end if;

  delete from public.bd_workspaces
   where id = v_workspace_id
     and (owner_id = auth.uid() or partner_id = auth.uid())
     and project -> '__bdFriendRequest' = 'true'::jsonb;

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'تعذر إزالة الصداقة';
  end if;
end;
$$;

revoke all on function public.bd_remove_friendship(uuid) from public;
grant execute on function public.bd_remove_friendship(uuid) to authenticated;

-- Ask PostgREST to refresh its schema cache after deployment.
notify pgrst, 'reload schema';

COMMIT;
