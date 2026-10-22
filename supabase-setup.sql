-- Run this file once in Supabase Dashboard > SQL Editor.
-- The browser app uses only the project's public/publishable key. Never place a service_role key in the HTML.

create table if not exists public.bd_account_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"schema":"1.0.0","projects":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

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

alter table public.bd_account_data enable row level security;
alter table public.bd_workspaces enable row level security;

drop policy if exists "Users manage their account data" on public.bd_account_data;
create policy "Users manage their account data" on public.bd_account_data
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Workspace members read shared projects" on public.bd_workspaces;
create policy "Workspace members read shared projects" on public.bd_workspaces
  for select to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));

drop policy if exists "Workspace members update shared projects" on public.bd_workspaces;
create policy "Workspace members update shared projects" on public.bd_workspaces
  for update to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));

create or replace function public.bd_create_workspace_invite(p_project jsonb, p_email text)
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

  insert into public.bd_workspaces(id, owner_id, invite_email, invite_code, project)
  values (v_workspace_id, auth.uid(), v_email, v_invite_code, p_project);
  return jsonb_build_object('workspace_id', v_workspace_id, 'invite_code', v_invite_code);
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
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.bd_workspaces
     set partner_id = auth.uid(), invite_code = null, updated_at = now()
   where invite_code = p_code
     and partner_id is null
     and invite_email = lower(coalesce(auth.jwt() ->> 'email', ''));
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'الدعوة غير صالحة أو انتهت أو أُرسلت إلى بريد مختلف'; end if;
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
   where id = p_id and (owner_id = auth.uid() or partner_id = auth.uid());
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'لا تملك صلاحية تعديل هذا المشروع'; end if;
end;
$$;

revoke all on function public.bd_create_workspace_invite(jsonb, text) from public;
revoke all on function public.bd_accept_workspace_invite(uuid) from public;
revoke all on function public.bd_delete_workspace(uuid) from public;
revoke all on function public.bd_save_workspace_project(uuid, jsonb) from public;
grant execute on function public.bd_create_workspace_invite(jsonb, text) to authenticated;
grant execute on function public.bd_accept_workspace_invite(uuid) to authenticated;
grant execute on function public.bd_delete_workspace(uuid) to authenticated;
grant execute on function public.bd_save_workspace_project(uuid, jsonb) to authenticated;

grant select, insert, update, delete on public.bd_account_data to authenticated;
grant select on public.bd_workspaces to authenticated;
