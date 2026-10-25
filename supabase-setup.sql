<<<<<<< HEAD
-- Run this file once in Supabase Dashboard > SQL Editor.
-- The browser app uses only the project's public/publishable key. Never place a service_role key in the HTML.

create table if not exists public.bd_account_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"schema":"1.0.0","projects":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bd_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text,
  phone text not null default '',
  account_type text not null default 'owner',
  site_role text not null default 'member',
  created_at timestamptz not null default now()
);
alter table public.bd_profiles add column if not exists account_type text not null default 'owner';
alter table public.bd_profiles drop constraint if exists bd_profiles_account_type_check;
alter table public.bd_profiles add constraint bd_profiles_account_type_check check (account_type in ('owner', 'partner'));
alter table public.bd_profiles add column if not exists site_role text not null default 'member';
alter table public.bd_profiles drop constraint if exists bd_profiles_site_role_check;
alter table public.bd_profiles add constraint bd_profiles_site_role_check check (site_role in ('member', 'site_admin'));

create unique index if not exists bd_profiles_username_unique
  on public.bd_profiles (lower(username)) where username is not null;
create unique index if not exists bd_profiles_phone_unique
  on public.bd_profiles (phone) where phone <> '';

alter table public.bd_profiles enable row level security;
drop policy if exists "Users read their own profile" on public.bd_profiles;
create policy "Users read their own profile" on public.bd_profiles
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.bd_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bd_profiles(user_id, full_name, username, phone, account_type, site_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'account_type' = 'partner' then 'partner' else 'owner' end,
    case when lower(coalesce(new.email, '')) = 'youssef1mahmouf24@gmail.com' then 'site_admin' else 'member' end
  );
  insert into public.bd_account_data(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists bd_on_auth_user_created on auth.users;
create trigger bd_on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.bd_handle_new_user();

-- Ensure accounts that already exist also have a cloud data row.
insert into public.bd_account_data(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Keep the requested account as the main site administrator, including if it already exists.
insert into public.bd_profiles(user_id, full_name, username, phone, account_type, site_role)
select id, 'Youssef Mahmoud', 'youssef', '+201141030264', 'owner', 'site_admin'
  from auth.users where lower(email) = 'youssef1mahmouf24@gmail.com'
on conflict (user_id) do update
  set full_name = excluded.full_name,
      username = excluded.username,
      phone = excluded.phone,
      account_type = excluded.account_type,
      site_role = excluded.site_role;

create table if not exists public.bd_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete set null,
  invite_email text not null,
  invite_code uuid not null unique default gen_random_uuid(),
  project jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bd_one_partner_per_project unique (id, partner_id)
);
alter table public.bd_workspaces alter column invite_code drop not null;

-- Project-level staff invitations. Roles are enforced by database functions.
create table if not exists public.bd_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.bd_workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invite_email text not null,
  role text not null check (role in ('assistant', 'security')),
  invite_code uuid unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
drop index if exists public.bd_workspace_invites_pending_unique;
create unique index if not exists bd_workspace_invite_email_unique
  on public.bd_workspace_members(workspace_id, lower(invite_email));
create unique index if not exists bd_workspace_members_user_unique
  on public.bd_workspace_members(workspace_id, user_id) where user_id is not null;

alter table public.bd_account_data enable row level security;
alter table public.bd_workspaces enable row level security;
alter table public.bd_workspace_members enable row level security;

drop policy if exists "Users manage their account data" on public.bd_account_data;
create policy "Users manage their account data" on public.bd_account_data
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Workspace members read shared projects" on public.bd_workspaces;
create policy "Workspace members read shared projects" on public.bd_workspaces
  for select to authenticated using (
    owner_id = (select auth.uid()) or partner_id = (select auth.uid()) or
    exists (select 1 from public.bd_workspace_members m where m.workspace_id = public.bd_workspaces.id and m.user_id = (select auth.uid()))
  );

drop policy if exists "Workspace members update shared projects" on public.bd_workspaces;
drop policy if exists "Workspace owner updates shared project" on public.bd_workspaces;
create policy "Workspace owner updates shared project" on public.bd_workspaces
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Users read their workspace membership" on public.bd_workspace_members;
create policy "Users read their workspace membership" on public.bd_workspace_members
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.bd_workspace_members from anon, authenticated;
grant select on public.bd_workspace_members to authenticated;

drop function if exists public.bd_create_workspace_invite(jsonb, text);
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

create or replace function public.bd_my_workspace_roles()
returns table(workspace_id uuid, role text)
language sql security definer set search_path = ''
as $$
  select m.workspace_id, m.role from public.bd_workspace_members m where m.user_id = auth.uid()
  union all
  select w.id, 'assistant'::text from public.bd_workspaces w
   where w.partner_id = auth.uid() and not exists (select 1 from public.bd_workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid());
$$;

create or replace function public.bd_list_workspace_members(p_workspace_id uuid)
returns table(invite_email text, role text, accepted boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.bd_workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid()) then
    raise exception 'فقط المالك يستطيع عرض أعضاء المشروع';
  end if;
  return query select m.invite_email, m.role, m.user_id is not null
    from public.bd_workspace_members m where m.workspace_id = p_workspace_id order by m.created_at;
end;
$$;

create or replace function public.bd_accept_workspace_invite(p_code uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.bd_workspace_members set user_id = auth.uid(), invite_code = null, accepted_at = now()
   where invite_code = p_code and user_id is null
     and invite_email = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning workspace_id into v_workspace_id;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    update public.bd_workspaces w set partner_id = auth.uid(), invite_code = null, updated_at = now()
     where w.id = v_workspace_id and w.partner_id is null;
    return;
  end if;
  update public.bd_workspaces
     set partner_id = auth.uid(), invite_code = null, updated_at = now()
   where invite_code = p_code
     and partner_id is null
     and invite_email = lower(coalesce(auth.jwt() ->> 'email', ''));
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'الدعوة غير صالحة أو انتهت أو أُرسلت إلى بريد مختلف'; end if;
end;
$$;

-- Return only the pending invitations addressed to the signed-in user's email.
-- The invitee can see request metadata without gaining access to the project data.
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
      -- Invalidate a legacy project link when it reuses this member invite code.
      update public.bd_workspaces
         set invite_code = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
       where id = v_workspace_id and invite_code = p_code and partner_id is null;
    end if;
    return;
  end if;

  -- Older project invitations may have a workspace invite code without a member row.
  update public.bd_workspaces
     set invite_code = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
   where invite_code = p_code and partner_id is null
     and lower(invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  if not found then raise exception 'الدعوة غير صالحة أو أُرسلت إلى بريد مختلف'; end if;
end;
$$;

create or replace function public.bd_delete_workspace(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.bd_workspaces where id = p_id and owner_id = auth.uid();
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'فقط صاحب المشروع يستطيع حذفه من مساحة الشراكة'; end if;
end;
$$;

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
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_id is null then raise exception 'معرّف الصداقة غير صالح'; end if;

  select w.id, coalesce(w.project ->> '__bdFriendRequest' = 'true', false)
    into v_workspace_id, v_is_friend_request
    from public.bd_workspaces w
   where w.id = p_id
     and (w.owner_id = auth.uid() or w.partner_id = auth.uid())
   for update of w;

  if not found then raise exception 'الصداقة غير موجودة أو لا تملك صلاحية إزالتها'; end if;
  if not v_is_friend_request then raise exception 'هذا المعرّف لا يمثل صداقة'; end if;

  delete from public.bd_workspaces
   where id = v_workspace_id
     and (owner_id = auth.uid() or partner_id = auth.uid())
     and project ->> '__bdFriendRequest' = 'true';

  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'تعذر إزالة الصداقة'; end if;
end;
$$;

create or replace function public.bd_save_workspace_project(p_id uuid, p_project jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.bd_workspaces
     set project = jsonb_set(p_project, '{__bdFriendRequest}',
            coalesce((select w2.project -> '__bdFriendRequest' from public.bd_workspaces w2 where w2.id = p_id), 'false'::jsonb), true),
         updated_at = now()
   where id = p_id and (
     owner_id = auth.uid() or
     (partner_id = auth.uid() and not exists (select 1 from public.bd_workspace_members m where m.workspace_id = p_id and m.user_id = auth.uid() and m.role = 'security')) or
     exists (select 1 from public.bd_workspace_members m where m.workspace_id = p_id and m.user_id = auth.uid() and m.role = 'assistant')
   );
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'لا تملك صلاحية تعديل هذا المشروع'; end if;
end;
$$;

revoke all on function public.bd_create_workspace_invite(jsonb, text, text, uuid) from public;
revoke all on function public.bd_accept_workspace_invite(uuid) from public;
revoke all on function public.bd_list_my_pending_invites() from public;
revoke all on function public.bd_decline_workspace_invite(uuid) from public;
revoke all on function public.bd_delete_workspace(uuid) from public;
revoke all on function public.bd_remove_friendship(uuid) from public;
revoke all on function public.bd_save_workspace_project(uuid, jsonb) from public;
revoke all on function public.bd_my_workspace_roles() from public;
revoke all on function public.bd_list_workspace_members(uuid) from public;
grant execute on function public.bd_create_workspace_invite(jsonb, text, text, uuid) to authenticated;
grant execute on function public.bd_accept_workspace_invite(uuid) to authenticated;
grant execute on function public.bd_list_my_pending_invites() to authenticated;
grant execute on function public.bd_decline_workspace_invite(uuid) to authenticated;
grant execute on function public.bd_delete_workspace(uuid) to authenticated;
grant execute on function public.bd_remove_friendship(uuid) to authenticated;
grant execute on function public.bd_save_workspace_project(uuid, jsonb) to authenticated;
grant execute on function public.bd_my_workspace_roles() to authenticated;
grant execute on function public.bd_list_workspace_members(uuid) to authenticated;

grant select, insert, update, delete on public.bd_account_data to authenticated;
grant select on public.bd_profiles to authenticated;
grant select on public.bd_workspaces to authenticated;

create or replace function public.bd_get_my_site_role()
returns text language sql security definer set search_path = ''
as $$
  select coalesce((select p.site_role from public.bd_profiles p where p.user_id = auth.uid()), 'member'::text);
$$;

create or replace function public.bd_admin_list_accounts()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_accounts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.bd_profiles p where p.user_id = auth.uid() and p.site_role = 'site_admin'
  ) then raise exception 'لوحة مدير الموقع متاحة للحساب الإداري فقط'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'full_name', coalesce(p.full_name, ''),
    'username', coalesce(p.username, ''),
    'phone', coalesce(p.phone, ''),
    'site_role', coalesce(p.site_role, 'member'),
    'created_at', u.created_at,
    'private_data', coalesce(a.data, '{}'::jsonb),
    'shared_projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspace_id', w.id,
        'role', case when w.owner_id = u.id then 'owner' else coalesce(m.role, 'assistant') end,
        'project', w.project
      ) order by w.updated_at desc)
      from public.bd_workspaces w
      left join public.bd_workspace_members m on m.workspace_id = w.id and m.user_id = u.id
      where w.owner_id = u.id or w.partner_id = u.id or exists (
        select 1 from public.bd_workspace_members m2 where m2.workspace_id = w.id and m2.user_id = u.id
      )
    ), '[]'::jsonb)
  ) order by lower(coalesce(p.full_name, u.email))) , '[]'::jsonb)
    into v_accounts
    from auth.users u
    left join public.bd_profiles p on p.user_id = u.id
    left join public.bd_account_data a on a.user_id = u.id;
  return v_accounts;
end;
$$;

create or replace function public.bd_admin_set_site_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.bd_profiles p where p.user_id = auth.uid() and p.site_role = 'site_admin'
  ) then raise exception 'تغيير صلاحيات الموقع متاح لمدير الموقع فقط'; end if;
  if p_role not in ('member', 'site_admin') then raise exception 'الدور المطلوب غير صالح'; end if;
  if p_user_id = auth.uid() then raise exception 'لا يمكن تغيير صلاحية حساب مدير الموقع الحالي'; end if;
  update public.bd_profiles set site_role = p_role where user_id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'الحساب المطلوب غير موجود'; end if;
end;
$$;

revoke all on function public.bd_get_my_site_role() from public;
revoke all on function public.bd_admin_list_accounts() from public;
revoke all on function public.bd_admin_set_site_role(uuid, text) from public;
grant execute on function public.bd_get_my_site_role() to authenticated;
grant execute on function public.bd_admin_list_accounts() to authenticated;
grant execute on function public.bd_admin_set_site_role(uuid, text) to authenticated;

-- Refresh the PostgREST function cache after installing or updating RPCs.
notify pgrst, 'reload schema';


-- Project participant privacy and task handoff permissions update.
drop policy if exists "Workspace members read shared projects" on public.bd_workspaces;
create policy "Workspace owners read their projects" on public.bd_workspaces
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.bd_list_my_workspaces()
returns table(id uuid, project jsonb, owner_id uuid, partner_id uuid, invite_email text)
language sql security definer set search_path = ''
as $$
  select w.id,
         case when w.owner_id = auth.uid() then w.project else
           w.project || jsonb_build_object(
             '_bdSharing', coalesce(w.project -> '_bdSharing', '{"projects":{"view":true,"edit":false},"participants":{"view":true,"edit":false},"answers":{"view":false,"edit":false},"compare":{"view":true,"edit":false},"insights":{"view":true,"edit":false},"decision":{"view":false,"edit":false},"actions":{"view":true,"edit":true}}'::jsonb),
             'notes', '{}'::jsonb,
             'shortlist', '[]'::jsonb,
             'decisionStatus', case when coalesce((w.project #>> '{_bdSharing,decision,view}')::boolean, false) then coalesce(w.project -> 'decisionStatus', '{}'::jsonb) else '{}'::jsonb end,
             'activityLog', '[]'::jsonb,
             'participants', coalesce((
               select jsonb_agg(case
                 when coalesce((w.project #>> '{_bdSharing,answers,view}')::boolean, false) then p
                 when lower(coalesce(p ->> 'memberEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', '')) then p
                 else jsonb_build_object('id', p -> 'id', 'name', p -> 'name')
               end order by p ->> 'id')
                 from jsonb_array_elements(coalesce(w.project -> 'participants', '[]'::jsonb)) p
                where coalesce((w.project #>> '{_bdSharing,answers,view}')::boolean, false)
                   or lower(coalesce(p ->> 'memberEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
                   or coalesce((w.project #>> '{_bdSharing,participants,view}')::boolean, true)
             ), '[]'::jsonb),
             'actionItems', coalesce((
               select jsonb_agg(t order by t ->> 'createdAt')
                 from jsonb_array_elements(coalesce(w.project -> 'actionItems', '[]'::jsonb)) t
                where coalesce((w.project #>> '{_bdSharing,actions,view}')::boolean, true)
                  and (lower(coalesce(t ->> 'assigneeEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
                   or lower(coalesce(t ->> 'requestedByEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
             ), '[]'::jsonb)
           )
         end,
         w.owner_id, w.partner_id, w.invite_email
    from public.bd_workspaces w
   where auth.uid() is not null and (
     w.owner_id = auth.uid() or w.partner_id = auth.uid() or
     exists (select 1 from public.bd_workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid())
   ) and (w.owner_id = auth.uid() or coalesce((w.project #>> '{_bdSharing,projects,view}')::boolean, true));
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

revoke all on function public.bd_list_my_workspaces() from public;
grant execute on function public.bd_list_my_workspaces() to authenticated;
revoke all on function public.bd_save_workspace_project(uuid, jsonb) from public;
grant execute on function public.bd_save_workspace_project(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
=======
-- Run this file once in Supabase Dashboard > SQL Editor.
-- The browser app uses only the project's public/publishable key. Never place a service_role key in the HTML.

create table if not exists public.bd_account_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"schema":"1.0.0","projects":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bd_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text,
  phone text not null default '',
  account_type text not null default 'owner',
  site_role text not null default 'member',
  created_at timestamptz not null default now()
);
alter table public.bd_profiles add column if not exists account_type text not null default 'owner';
alter table public.bd_profiles drop constraint if exists bd_profiles_account_type_check;
alter table public.bd_profiles add constraint bd_profiles_account_type_check check (account_type in ('owner', 'partner'));
alter table public.bd_profiles add column if not exists site_role text not null default 'member';
alter table public.bd_profiles drop constraint if exists bd_profiles_site_role_check;
alter table public.bd_profiles add constraint bd_profiles_site_role_check check (site_role in ('member', 'site_admin'));

create unique index if not exists bd_profiles_username_unique
  on public.bd_profiles (lower(username)) where username is not null;
create unique index if not exists bd_profiles_phone_unique
  on public.bd_profiles (phone) where phone <> '';

alter table public.bd_profiles enable row level security;
drop policy if exists "Users read their own profile" on public.bd_profiles;
create policy "Users read their own profile" on public.bd_profiles
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.bd_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bd_profiles(user_id, full_name, username, phone, account_type, site_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'account_type' = 'partner' then 'partner' else 'owner' end,
    case when lower(coalesce(new.email, '')) = 'youssef1mahmouf24@gmail.com' then 'site_admin' else 'member' end
  );
  insert into public.bd_account_data(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists bd_on_auth_user_created on auth.users;
create trigger bd_on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.bd_handle_new_user();

-- Ensure accounts that already exist also have a cloud data row.
insert into public.bd_account_data(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Keep the requested account as the main site administrator, including if it already exists.
insert into public.bd_profiles(user_id, full_name, username, phone, account_type, site_role)
select id, 'Youssef Mahmoud', 'youssef', '+201141030264', 'owner', 'site_admin'
  from auth.users where lower(email) = 'youssef1mahmouf24@gmail.com'
on conflict (user_id) do update
  set full_name = excluded.full_name,
      username = excluded.username,
      phone = excluded.phone,
      account_type = excluded.account_type,
      site_role = excluded.site_role;

create table if not exists public.bd_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete set null,
  invite_email text not null,
  invite_code uuid not null unique default gen_random_uuid(),
  project jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bd_one_partner_per_project unique (id, partner_id)
);
alter table public.bd_workspaces alter column invite_code drop not null;

-- Project-level staff invitations. Roles are enforced by database functions.
create table if not exists public.bd_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.bd_workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invite_email text not null,
  role text not null check (role in ('assistant', 'security')),
  invite_code uuid unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
drop index if exists public.bd_workspace_invites_pending_unique;
create unique index if not exists bd_workspace_invite_email_unique
  on public.bd_workspace_members(workspace_id, lower(invite_email));
create unique index if not exists bd_workspace_members_user_unique
  on public.bd_workspace_members(workspace_id, user_id) where user_id is not null;

alter table public.bd_account_data enable row level security;
alter table public.bd_workspaces enable row level security;
alter table public.bd_workspace_members enable row level security;

drop policy if exists "Users manage their account data" on public.bd_account_data;
create policy "Users manage their account data" on public.bd_account_data
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Workspace members read shared projects" on public.bd_workspaces;
create policy "Workspace members read shared projects" on public.bd_workspaces
  for select to authenticated using (
    owner_id = (select auth.uid()) or partner_id = (select auth.uid()) or
    exists (select 1 from public.bd_workspace_members m where m.workspace_id = public.bd_workspaces.id and m.user_id = (select auth.uid()))
  );

drop policy if exists "Workspace members update shared projects" on public.bd_workspaces;
drop policy if exists "Workspace owner updates shared project" on public.bd_workspaces;
create policy "Workspace owner updates shared project" on public.bd_workspaces
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Users read their workspace membership" on public.bd_workspace_members;
create policy "Users read their workspace membership" on public.bd_workspace_members
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.bd_workspace_members from anon, authenticated;
grant select on public.bd_workspace_members to authenticated;

drop function if exists public.bd_create_workspace_invite(jsonb, text);
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
    update public.bd_workspaces set project = p_project, updated_at = now()
      where id = v_workspace_id and owner_id = auth.uid();
    if not found then raise exception 'فقط المالك يستطيع دعوة أعضاء لهذا المشروع'; end if;
  end if;
  insert into public.bd_workspace_members(workspace_id, invite_email, role, invite_code)
  values (v_workspace_id, v_email, p_role, v_invite_code);
  return jsonb_build_object('workspace_id', v_workspace_id, 'invite_code', v_invite_code);
end;
$$;

create or replace function public.bd_my_workspace_roles()
returns table(workspace_id uuid, role text)
language sql security definer set search_path = ''
as $$
  select m.workspace_id, m.role from public.bd_workspace_members m where m.user_id = auth.uid()
  union all
  select w.id, 'assistant'::text from public.bd_workspaces w
   where w.partner_id = auth.uid() and not exists (select 1 from public.bd_workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid());
$$;

create or replace function public.bd_list_workspace_members(p_workspace_id uuid)
returns table(invite_email text, role text, accepted boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.bd_workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid()) then
    raise exception 'فقط المالك يستطيع عرض أعضاء المشروع';
  end if;
  return query select m.invite_email, m.role, m.user_id is not null
    from public.bd_workspace_members m where m.workspace_id = p_workspace_id order by m.created_at;
end;
$$;

create or replace function public.bd_accept_workspace_invite(p_code uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.bd_workspace_members set user_id = auth.uid(), invite_code = null, accepted_at = now()
   where invite_code = p_code and user_id is null
     and invite_email = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning workspace_id into v_workspace_id;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    update public.bd_workspaces w set partner_id = auth.uid(), invite_code = null, updated_at = now()
     where w.id = v_workspace_id and w.partner_id is null;
    return;
  end if;
  update public.bd_workspaces
     set partner_id = auth.uid(), invite_code = null, updated_at = now()
   where invite_code = p_code
     and partner_id is null
     and invite_email = lower(coalesce(auth.jwt() ->> 'email', ''));
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'الدعوة غير صالحة أو انتهت أو أُرسلت إلى بريد مختلف'; end if;
end;
$$;

-- Return only the pending invitations addressed to the signed-in user's email.
-- The invitee can see request metadata without gaining access to the project data.
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
      -- Invalidate a legacy project link when it reuses this member invite code.
      update public.bd_workspaces
         set invite_code = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
       where id = v_workspace_id and invite_code = p_code and partner_id is null;
    end if;
    return;
  end if;

  -- Older project invitations may have a workspace invite code without a member row.
  update public.bd_workspaces
     set invite_code = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
   where invite_code = p_code and partner_id is null
     and lower(invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  if not found then raise exception 'الدعوة غير صالحة أو أُرسلت إلى بريد مختلف'; end if;
end;
$$;

create or replace function public.bd_delete_workspace(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.bd_workspaces where id = p_id and owner_id = auth.uid();
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'فقط صاحب المشروع يستطيع حذفه من مساحة الشراكة'; end if;
end;
$$;

create or replace function public.bd_save_workspace_project(p_id uuid, p_project jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.bd_workspaces
     set project = p_project, updated_at = now()
   where id = p_id and (
     owner_id = auth.uid() or
     (partner_id = auth.uid() and not exists (select 1 from public.bd_workspace_members m where m.workspace_id = p_id and m.user_id = auth.uid() and m.role = 'security')) or
     exists (select 1 from public.bd_workspace_members m where m.workspace_id = p_id and m.user_id = auth.uid() and m.role = 'assistant')
   );
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'لا تملك صلاحية تعديل هذا المشروع'; end if;
end;
$$;

revoke all on function public.bd_create_workspace_invite(jsonb, text, text, uuid) from public;
revoke all on function public.bd_accept_workspace_invite(uuid) from public;
revoke all on function public.bd_list_my_pending_invites() from public;
revoke all on function public.bd_decline_workspace_invite(uuid) from public;
revoke all on function public.bd_delete_workspace(uuid) from public;
revoke all on function public.bd_save_workspace_project(uuid, jsonb) from public;
revoke all on function public.bd_my_workspace_roles() from public;
revoke all on function public.bd_list_workspace_members(uuid) from public;
grant execute on function public.bd_create_workspace_invite(jsonb, text, text, uuid) to authenticated;
grant execute on function public.bd_accept_workspace_invite(uuid) to authenticated;
grant execute on function public.bd_list_my_pending_invites() to authenticated;
grant execute on function public.bd_decline_workspace_invite(uuid) to authenticated;
grant execute on function public.bd_delete_workspace(uuid) to authenticated;
grant execute on function public.bd_save_workspace_project(uuid, jsonb) to authenticated;
grant execute on function public.bd_my_workspace_roles() to authenticated;
grant execute on function public.bd_list_workspace_members(uuid) to authenticated;

grant select, insert, update, delete on public.bd_account_data to authenticated;
grant select on public.bd_profiles to authenticated;
grant select on public.bd_workspaces to authenticated;

create or replace function public.bd_get_my_site_role()
returns text language sql security definer set search_path = ''
as $$
  select coalesce((select p.site_role from public.bd_profiles p where p.user_id = auth.uid()), 'member'::text);
$$;

create or replace function public.bd_admin_list_accounts()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_accounts jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.bd_profiles p where p.user_id = auth.uid() and p.site_role = 'site_admin'
  ) then raise exception 'لوحة مدير الموقع متاحة للحساب الإداري فقط'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'full_name', coalesce(p.full_name, ''),
    'username', coalesce(p.username, ''),
    'phone', coalesce(p.phone, ''),
    'site_role', coalesce(p.site_role, 'member'),
    'created_at', u.created_at,
    'private_data', coalesce(a.data, '{}'::jsonb),
    'shared_projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspace_id', w.id,
        'role', case when w.owner_id = u.id then 'owner' else coalesce(m.role, 'assistant') end,
        'project', w.project
      ) order by w.updated_at desc)
      from public.bd_workspaces w
      left join public.bd_workspace_members m on m.workspace_id = w.id and m.user_id = u.id
      where w.owner_id = u.id or w.partner_id = u.id or exists (
        select 1 from public.bd_workspace_members m2 where m2.workspace_id = w.id and m2.user_id = u.id
      )
    ), '[]'::jsonb)
  ) order by lower(coalesce(p.full_name, u.email))) , '[]'::jsonb)
    into v_accounts
    from auth.users u
    left join public.bd_profiles p on p.user_id = u.id
    left join public.bd_account_data a on a.user_id = u.id;
  return v_accounts;
end;
$$;

create or replace function public.bd_admin_set_site_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.bd_profiles p where p.user_id = auth.uid() and p.site_role = 'site_admin'
  ) then raise exception 'تغيير صلاحيات الموقع متاح لمدير الموقع فقط'; end if;
  if p_role not in ('member', 'site_admin') then raise exception 'الدور المطلوب غير صالح'; end if;
  if p_user_id = auth.uid() then raise exception 'لا يمكن تغيير صلاحية حساب مدير الموقع الحالي'; end if;
  update public.bd_profiles set site_role = p_role where user_id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'الحساب المطلوب غير موجود'; end if;
end;
$$;

revoke all on function public.bd_get_my_site_role() from public;
revoke all on function public.bd_admin_list_accounts() from public;
revoke all on function public.bd_admin_set_site_role(uuid, text) from public;
grant execute on function public.bd_get_my_site_role() to authenticated;
grant execute on function public.bd_admin_list_accounts() to authenticated;
grant execute on function public.bd_admin_set_site_role(uuid, text) to authenticated;

-- Refresh the PostgREST function cache after installing or updating RPCs.
notify pgrst, 'reload schema';


-- Project participant privacy and task handoff permissions update.
drop policy if exists "Workspace members read shared projects" on public.bd_workspaces;
create policy "Workspace owners read their projects" on public.bd_workspaces
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.bd_list_my_workspaces()
returns table(id uuid, project jsonb, owner_id uuid, partner_id uuid, invite_email text)
language sql security definer set search_path = ''
as $$
  select w.id,
         case when w.owner_id = auth.uid() then w.project else
           w.project || jsonb_build_object(
             '_bdSharing', coalesce(w.project -> '_bdSharing', '{"projects":{"view":true,"edit":false},"participants":{"view":true,"edit":false},"answers":{"view":false,"edit":false},"compare":{"view":true,"edit":false},"insights":{"view":true,"edit":false},"decision":{"view":false,"edit":false},"actions":{"view":true,"edit":true}}'::jsonb),
             'notes', '{}'::jsonb,
             'shortlist', '[]'::jsonb,
             'decisionStatus', case when coalesce((w.project #>> '{_bdSharing,decision,view}')::boolean, false) then coalesce(w.project -> 'decisionStatus', '{}'::jsonb) else '{}'::jsonb end,
             'activityLog', '[]'::jsonb,
             'participants', coalesce((
               select jsonb_agg(case
                 when coalesce((w.project #>> '{_bdSharing,answers,view}')::boolean, false) then p
                 when lower(coalesce(p ->> 'memberEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', '')) then p
                 else jsonb_build_object('id', p -> 'id', 'name', p -> 'name')
               end order by p ->> 'id')
                 from jsonb_array_elements(coalesce(w.project -> 'participants', '[]'::jsonb)) p
                where coalesce((w.project #>> '{_bdSharing,answers,view}')::boolean, false)
                   or lower(coalesce(p ->> 'memberEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
                   or coalesce((w.project #>> '{_bdSharing,participants,view}')::boolean, true)
             ), '[]'::jsonb),
             'actionItems', coalesce((
               select jsonb_agg(t order by t ->> 'createdAt')
                 from jsonb_array_elements(coalesce(w.project -> 'actionItems', '[]'::jsonb)) t
                where coalesce((w.project #>> '{_bdSharing,actions,view}')::boolean, true)
                  and (lower(coalesce(t ->> 'assigneeEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
                   or lower(coalesce(t ->> 'requestedByEmail', '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
             ), '[]'::jsonb)
           )
         end,
         w.owner_id, w.partner_id, w.invite_email
    from public.bd_workspaces w
   where auth.uid() is not null and (
     w.owner_id = auth.uid() or w.partner_id = auth.uid() or
     exists (select 1 from public.bd_workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid())
   ) and (w.owner_id = auth.uid() or coalesce((w.project #>> '{_bdSharing,projects,view}')::boolean, true));
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

  update public.bd_workspaces set project = p_project, updated_at = pg_catalog.now()
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

revoke all on function public.bd_list_my_workspaces() from public;
grant execute on function public.bd_list_my_workspaces() to authenticated;
revoke all on function public.bd_save_workspace_project(uuid, jsonb) from public;
grant execute on function public.bd_save_workspace_project(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
>>>>>>> b7bc9b3792442894284ba60567713947636337e4
