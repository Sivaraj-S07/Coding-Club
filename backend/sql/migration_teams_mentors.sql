-- Apply after all existing migrations. Custom Express JWT auth is preserved.
-- No direct browser table access: all authorization occurs in the API.
create table if not exists public.mentors (
 id uuid primary key default gen_random_uuid(), username text not null, name text not null,
 email text not null, password_hash text not null, bio text not null default '',
 created_at timestamptz not null default now()
);
grant all on public.mentors to service_role;
alter table public.mentors enable row level security;
create unique index if not exists mentors_email_unique on public.mentors(lower(email));
create unique index if not exists mentors_username_unique on public.mentors(lower(username));
create table if not exists public.teams (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 3 and 80),
 description text not null default '' check(length(description)<=500),
 owner_id uuid not null references public.students(id) on delete cascade,
 created_at timestamptz not null default now()
);
grant all on public.teams to service_role;
alter table public.teams enable row level security;
create table if not exists public.team_members (
 team_id uuid not null references public.teams(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(team_id,student_id)
);
grant all on public.team_members to service_role;
alter table public.team_members enable row level security;
create table if not exists public.team_mentors (
 team_id uuid not null references public.teams(id) on delete cascade,
 mentor_id uuid not null references public.mentors(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(team_id,mentor_id)
);
grant all on public.team_mentors to service_role;
alter table public.team_mentors enable row level security;
create table if not exists public.team_invitations (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 student_id uuid references public.students(id) on delete cascade,
 mentor_id uuid references public.mentors(id) on delete cascade,
 kind text not null check(kind in ('invite','request')),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled')),
 created_at timestamptz not null default now(), responded_at timestamptz,
 check((student_id is not null)::integer+(mentor_id is not null)::integer=1),
 check(kind='invite' or student_id is not null)
);
grant all on public.team_invitations to service_role;
alter table public.team_invitations enable row level security;
create unique index if not exists team_student_pending on public.team_invitations(team_id,student_id) where status='pending';
create unique index if not exists team_mentor_pending on public.team_invitations(team_id,mentor_id) where status='pending';
create table if not exists public.team_messages (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 student_id uuid references public.students(id) on delete cascade, mentor_id uuid references public.mentors(id) on delete cascade,
 content text not null check(length(content) between 1 and 4000), created_at timestamptz not null default now(),
 check((student_id is not null)::integer+(mentor_id is not null)::integer=1)
);
grant all on public.team_messages to service_role;
alter table public.team_messages enable row level security;
create index if not exists team_messages_recent on public.team_messages(team_id,created_at desc);
create table if not exists public.team_tasks (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 mentor_id uuid not null references public.mentors(id) on delete cascade,
 assignee_id uuid not null references public.students(id) on delete cascade,
 title text not null check(length(title) between 1 and 160), description text not null default '' check(length(description)<=2000),
 due_date date, status text not null default 'todo' check(status in ('todo','in_progress','done')),
 created_at timestamptz not null default now()
);
grant all on public.team_tasks to service_role;
alter table public.team_tasks enable row level security;
create table if not exists public.team_projects (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 title text not null check(length(title) between 1 and 160), description text not null default '' check(length(description)<=2000),
 url text not null default '' check(length(url)<=1000), created_at timestamptz not null default now()
);
grant all on public.team_projects to service_role;
alter table public.team_projects enable row level security;
-- Atomic operations with a per-team lock prevent invitation/leave races.
-- Caller identity comes exclusively from the API's verified token.
create or replace function public.eduverse_team_action(actor uuid, actor_role text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tid uuid; target uuid; inv team_invitations%rowtype; t teams%rowtype; result_id uuid;
 sid uuid; mid uuid; member boolean; mentor boolean;
begin
 if actor_role not in ('student','mentor') then raise exception 'Forbidden'; end if;
 if actor_role='student' and not exists(select 1 from students where id=actor and password_hash is not null) then raise exception 'Forbidden'; end if;
 if actor_role='mentor' and not exists(select 1 from mentors where id=actor) then raise exception 'Forbidden'; end if;
 if operation='create' then
  if actor_role<>'student' then raise exception 'Only students can create teams'; end if;
  insert into teams(name,description,owner_id) values(trim(payload->>'name'),coalesce(payload->>'description',''),actor) returning id into tid;
  insert into team_members(team_id,student_id) values(tid,actor);
  return jsonb_build_object('id',tid);
 end if;
 if operation='respond' then
  select * into inv from team_invitations where id=(payload->>'invitationId')::uuid;
  if not found then raise exception 'Invitation not found'; end if;
  tid:=inv.team_id;
 else tid:=(payload->>'teamId')::uuid; end if;
 select * into t from teams where id=tid for update;
 if not found then raise exception 'Team not found'; end if;
 member:=actor_role='student' and exists(select 1 from team_members where team_id=tid and student_id=actor);
 mentor:=actor_role='mentor' and exists(select 1 from team_mentors where team_id=tid and mentor_id=actor);
 if operation='invite' or operation='request' then
  if operation='invite' and (actor_role<>'student' or t.owner_id<>actor) then raise exception 'Only the team owner can invite'; end if;
  if operation='request' and actor_role<>'student' then raise exception 'Only students can request membership'; end if;
  target:=case when operation='request' then actor else (payload->>'targetId')::uuid end;
  if operation='request' or payload->>'targetRole'='student' then
   sid:=target;
   if not exists(select 1 from students where id=sid and password_hash is not null) then raise exception 'Student account not found'; end if;
   if exists(select 1 from team_members where team_id=tid and student_id=sid) then raise exception 'Already a team member'; end if;
  elsif payload->>'targetRole'='mentor' then
   mid:=target;
   if not exists(select 1 from mentors where id=mid) then raise exception 'Mentor not found'; end if;
   if exists(select 1 from team_mentors where team_id=tid and mentor_id=mid) then raise exception 'Already a team mentor'; end if;
  else raise exception 'Invalid account type'; end if;
  insert into team_invitations(team_id,student_id,mentor_id,kind) values(tid,sid,mid,case when operation='request' then 'request' else 'invite' end) returning id into result_id;
 elsif operation='respond' then
  select * into inv from team_invitations where id=inv.id for update;
  if inv.status<>'pending' then raise exception 'Invitation already answered'; end if;
  if inv.kind='request' then
   if actor_role<>'student' or t.owner_id<>actor then raise exception 'Only the owner can answer join requests'; end if;
   elsif not coalesce((actor_role='student' and inv.student_id=actor) or (actor_role='mentor' and inv.mentor_id=actor),false) then raise exception 'Only the recipient can answer'; end if;
  if payload->>'decision' not in ('accepted','rejected') then raise exception 'Invalid decision'; end if;
  update team_invitations set status=payload->>'decision', responded_at=now() where id=inv.id;
  if payload->>'decision'='accepted' then
   if inv.student_id is not null then insert into team_members(team_id,student_id) values(tid,inv.student_id) on conflict do nothing;
   else insert into team_mentors(team_id,mentor_id) values(tid,inv.mentor_id) on conflict do nothing; end if;
  end if;
 elsif operation='leave' then
  if not(member or mentor) then raise exception 'Forbidden'; end if;
  if t.owner_id=actor and actor_role='student' then raise exception 'Owners must delete their team instead'; end if;
  if member then delete from team_members where team_id=tid and student_id=actor;
  else delete from team_mentors where team_id=tid and mentor_id=actor; end if;
 elsif operation='delete' then
  if actor_role<>'student' or t.owner_id<>actor then raise exception 'Forbidden'; end if;
  delete from teams where id=tid;
 elsif operation='remove' then
  if actor_role<>'student' or t.owner_id<>actor then raise exception 'Forbidden'; end if;
  target:=(payload->>'targetId')::uuid;
  if payload->>'targetRole'='mentor' then delete from team_mentors where team_id=tid and mentor_id=target;
  elsif target<>actor then delete from team_members where team_id=tid and student_id=target;
  else raise exception 'Cannot remove owner'; end if;
 elsif operation='message' then
  if not(member or mentor) then raise exception 'Forbidden'; end if;
  insert into team_messages(team_id,student_id,mentor_id,content) values(tid,case when member then actor end,case when mentor then actor end,trim(payload->>'content')) returning id into result_id;
 elsif operation='task' then
  if not mentor then raise exception 'Only accepted mentors can assign tasks'; end if;
  target:=(payload->>'assigneeId')::uuid;
  if not exists(select 1 from team_members where team_id=tid and student_id=target) then raise exception 'Assignee is not a team member'; end if;
  insert into team_tasks(team_id,mentor_id,assignee_id,title,description,due_date) values(tid,actor,target,trim(payload->>'title'),coalesce(payload->>'description',''),nullif(payload->>'dueDate','')::date) returning id into result_id;
 elsif operation='taskStatus' then
  if not member then raise exception 'Forbidden'; end if;
  update team_tasks set status=payload->>'status' where id=(payload->>'taskId')::uuid and team_id=tid and assignee_id=actor returning id into result_id;
  if result_id is null then raise exception 'Only the assignee can update this task'; end if;
 elsif operation='project' then
  if not member then raise exception 'Forbidden'; end if;
  if coalesce(payload->>'url','')<>'' and payload->>'url' !~ '^https?://' then raise exception 'Project URL must use HTTP or HTTPS'; end if;
  insert into team_projects(team_id,student_id,title,description,url) values(tid,actor,trim(payload->>'title'),coalesce(payload->>'description',''),coalesce(payload->>'url','')) returning id into result_id;
 else raise exception 'Unknown operation'; end if;
 return jsonb_build_object('success',true,'id',result_id);
end $$;
revoke all on function public.eduverse_team_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.eduverse_team_action(uuid,text,text,jsonb) to service_role;
