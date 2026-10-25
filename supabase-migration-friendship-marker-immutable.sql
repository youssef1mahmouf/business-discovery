-- Migration: Make __bdFriendRequest immutable during project saves.
-- Prevents partners (or any non-owner save path) from converting an ordinary
-- shared project into a friendship record and then deleting it through
-- public.bd_remove_friendship.

create or replace function public.bd_create_workspace_invite(p_project jsonb, p_email text, p_role text, p_workspace_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := pg_catalog.gen_random_uuid();
  v_invite_code uuid := pg_catalog.gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if v_email = '' or position('@' in v_email) < 2 then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'لا يمكنك دعوة حسابك نفسه'; end if;
  if jsonb_typeof(p_project) <> 'object' then raise exception 'بيانات المشروع غير صالحة'; end if;
  if p_role not in ('assistant', 'security') then raise exception 'نوع الدور غير صالح'; end if;

  if p_workspace_id is null then
    insert into public.bd_workspaces(id, owner_id, invite_email, invite_code, project)
    values (v_workspace_id, auth.uid(), v_email, v_invite_code, p_project);
  else
    v_workspace_id := p_workspace_id;
    update public.bd_workspaces
       set project = jsonb_set(p_project, '{__bdFriendRequest}',
              coalesce((select w.project -> '__bdFriendRequest' from public.bd_workspaces w where w.id = v_workspace_id), 'false'::jsonb), true),
           updated_at = now()
     where id = v_workspace_id and owner_id = auth.uid();
    if not found then raise exception 'فقط المالك يستطيع دعوة أعضاء لهذا المشروع'; end if;
  end if;
  insert into public.bd_workspace_members(workspace_id, invite_email, role, invite_code)
  values (v_workspace_id, v_email, p_role, v_invite_code);
  return jsonb_build_object('workspace_id', v_workspace_id, 'invite_code', v_invite_code);
end;
$$;

create or replace function public.bd_save_workspace_project(p_id uuid, p_project jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_current jsonb;
  v_old_items jsonb;
  v_new_items jsonb;
  v_merged_items jsonb := '[]'::jsonb;
  v_old_item jsonb;
  v_new_item jsonb;
  v_old_participants jsonb;
  v_new_participants jsonb;
  v_merged_participants jsonb := '[]'::jsonb;
  v_old_participant jsonb;
  v_new_participant jsonb;
  v_old_files jsonb;
  v_new_files jsonb;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_file_index integer;
  v_answers_edit boolean := false;
  v_actions_view boolean := true;
  v_actions_edit boolean := true;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if jsonb_typeof(p_project) <> 'object' then raise exception 'بيانات المشروع غير صالحة'; end if;

  update public.bd_workspaces
     set project = jsonb_set(p_project, '{__bdFriendRequest}',
            coalesce((select w.project -> '__bdFriendRequest' from public.bd_workspaces w where w.id = p_id), 'false'::jsonb), true),
         updated_at = pg_catalog.now()
   where id = p_id and owner_id = auth.uid();
  if found then return; end if;

  select w.project into v_current from public.bd_workspaces w
   where w.id = p_id and (w.partner_id = auth.uid() or exists (
     select 1 from public.bd_workspace_members m where m.workspace_id = p_id
       and m.user_id = auth.uid() and m.role in ('assistant', 'security')
   )) and coalesce((w.project #>> '{_bdSharing,projects,view}')::boolean, true)
   for update;
  if not found then raise exception 'لا تملك صلاحية تعديل هذا المشروع'; end if;

  v_answers_edit := coalesce((v_current #>> '{_bdSharing,answers,edit}')::boolean, false);
  v_actions_view := coalesce((v_current #>> '{_bdSharing,actions,view}')::boolean, true);
  v_actions_edit := coalesce((v_current #>> '{_bdSharing,actions,edit}')::boolean, true);

  if v_answers_edit then
    v_old_participants := coalesce(v_current -> 'participants', '[]'::jsonb);
    v_new_participants := coalesce(p_project -> 'participants', '[]'::jsonb);
    if jsonb_typeof(v_new_participants) <> 'array' then raise exception 'قائمة الإجابات غير صالحة'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_new_participants) submitted
       where not exists (select 1 from jsonb_array_elements(v_old_participants) saved where saved ->> 'id' = submitted ->> 'id')
    ) then raise exception 'لا يمكنك إضافة مشاركين إلى المشروع'; end if;
    for v_old_participant in select value from jsonb_array_elements(v_old_participants) loop
      v_new_participant := null;
      select value into v_new_participant from jsonb_array_elements(v_new_participants)
       where value ->> 'id' = v_old_participant ->> 'id';
      if lower(coalesce(v_old_participant ->> 'memberEmail', '')) = v_email then
        if v_new_participant is null or
           (v_new_participant - 'answers' - 'skipped' - 'notes' - 'flags' - 'lastQuestionId' - 'updatedAt') is distinct from
           (v_old_participant - 'answers' - 'skipped' - 'notes' - 'flags' - 'lastQuestionId' - 'updatedAt') then
          raise exception 'يمكنك تعديل إجابات حسابك فقط';
        end if;
        v_merged_participants := v_merged_participants || jsonb_build_array(v_new_participant);
      else
        v_merged_participants := v_merged_participants || jsonb_build_array(v_old_participant);
      end if;
    end loop;
    v_current := jsonb_set(v_current, '{participants}', v_merged_participants, true);
  end if;

  v_old_items := coalesce(v_current -> 'actionItems', '[]'::jsonb);
  v_new_items := coalesce(p_project -> 'actionItems', '[]'::jsonb);
  if jsonb_typeof(v_new_items) <> 'array' then raise exception 'قائمة المهام غير صالحة'; end if;
  for v_old_item in select value from jsonb_array_elements(v_old_items) loop
    if not v_actions_view then
      v_merged_items := v_merged_items || jsonb_build_array(v_old_item);
      continue;
    end if;
    v_new_item := null;
    select value into v_new_item from jsonb_array_elements(v_new_items) where value ->> 'id' = v_old_item ->> 'id';
    if lower(coalesce(v_old_item ->> 'assigneeEmail', '')) = v_email then
      if not v_actions_edit then
        if v_new_item is distinct from v_old_item then raise exception 'لا تسمح الصلاحيات بتعديل المهام'; end if;
        v_merged_items := v_merged_items || jsonb_build_array(v_old_item);
        continue;
      end if;
      if v_new_item is null or (v_new_item - 'attachments' - 'status' - 'submittedAt' - 'submittedByEmail') is distinct from
         (v_old_item - 'attachments' - 'status' - 'submittedAt' - 'submittedByEmail') then
        raise exception 'يمكنك تعديل مرفقات المهمة المسندة إليك وإرسالها فقط';
      end if;
      v_old_files := coalesce(v_old_item -> 'attachments', '[]'::jsonb);
      v_new_files := coalesce(v_new_item -> 'attachments', '[]'::jsonb);
      if jsonb_typeof(v_new_files) <> 'array' or jsonb_array_length(v_new_files) < jsonb_array_length(v_old_files) then
        raise exception 'لا يمكن حذف مرفقات المهمة';
      end if;
      for v_file_index in 0..jsonb_array_length(v_old_files) - 1 loop
        if (v_old_files -> v_file_index) is distinct from (v_new_files -> v_file_index) then
          raise exception 'لا يمكن تغيير مرفق سبق رفعه';
        end if;
      end loop;
      for v_file_index in jsonb_array_length(v_old_files)..jsonb_array_length(v_new_files) - 1 loop
        if lower(coalesce(v_new_files -> v_file_index ->> 'uploadedByEmail', '')) <> v_email then
          raise exception 'يمكنك رفع مرفقات باسم حسابك فقط';
        end if;
      end loop;
      if coalesce(v_new_item ->> 'status', '') <> coalesce(v_old_item ->> 'status', '') and not (
        coalesce(v_old_item ->> 'status', 'todo') in ('todo', 'later') and v_new_item ->> 'status' = 'disc2'
      ) then
        raise exception 'يمكنك إرسال المهمة للمراجعة فقط';
      end if;
      if v_new_item ->> 'status' in ('disc2', 'res') and (
        lower(coalesce(v_new_item ->> 'submittedByEmail', '')) <> v_email or
        nullif(v_new_item ->> 'submittedAt', '') is null
      ) then
        raise exception 'بيانات تسليم المهمة غير صالحة';
      end if;
      v_merged_items := v_merged_items || jsonb_build_array(v_new_item);
    else
      if lower(coalesce(v_old_item ->> 'requestedByEmail', '')) = v_email then
        if v_new_item is null or v_new_item is distinct from v_old_item then
          raise exception 'يمكنك مشاهدة المهمة التي طلبتها فقط؛ التسليم يحدّثه المنفذ';
        end if;
        v_merged_items := v_merged_items || jsonb_build_array(v_old_item);
      else
        if v_new_item is not null then raise exception 'لا يمكنك تعديل مهمة مسندة إلى شخص آخر'; end if;
        v_merged_items := v_merged_items || jsonb_build_array(v_old_item);
      end if;
    end if;
  end loop;
  if jsonb_array_length(v_new_items) <> case when v_actions_view then (
    select count(*) from jsonb_array_elements(v_old_items) old_item
     where lower(coalesce(old_item ->> 'assigneeEmail', '')) = v_email
        or lower(coalesce(old_item ->> 'requestedByEmail', '')) = v_email
  ) else 0 end then raise exception 'يمكنك تعديل المهام المسندة إليك فقط'; end if;
  update public.bd_workspaces set project = jsonb_set(v_current, '{actionItems}', v_merged_items, true),
         updated_at = pg_catalog.now() where id = p_id;
end;
$$;

notify pgrst, 'reload schema';
