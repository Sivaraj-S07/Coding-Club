-- OPTIONAL performance migration for Team Insights (Team Search + team workspace).
--
-- Team Insights is derived entirely from existing tables, so the application
-- works WITHOUT this file. Apply it after migration_teams_mentors.sql to speed up
-- the "all tasks / projects / messages for these people" lookups that Team Search
-- now performs in bulk. Safe to re-run: indexes only, no data or schema changes.
create index if not exists team_tasks_assignee_idx on public.team_tasks(assignee_id);
create index if not exists team_tasks_mentor_idx on public.team_tasks(mentor_id);
create index if not exists team_tasks_team_idx on public.team_tasks(team_id);
create index if not exists team_projects_student_idx on public.team_projects(student_id);
create index if not exists team_projects_team_idx on public.team_projects(team_id);
create index if not exists team_messages_mentor_idx on public.team_messages(mentor_id);
create index if not exists team_members_student_idx on public.team_members(student_id);
create index if not exists team_mentors_mentor_idx on public.team_mentors(mentor_id);
