// Opt-in integration suite: use a DISPOSABLE database with schema.sql and
// migration_teams_mentors.sql already applied. Every fixture is rolled back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const enabled = process.env.EDUVERSE_TEST_PG === '1';
test('PostgreSQL team lifecycle, authorization, invitations, tasks and revocation', {skip: !enabled}, () => {
 const output = execFileSync('psql', ['-X','-v','ON_ERROR_STOP=1','-c', `
 begin;
 do $$
 declare owner uuid; student uuid; outsider uuid; mentor uuid; tid uuid; iid uuid; taskid uuid; denied boolean;
 begin
 insert into students(name,username,register_number,password_hash) values ('Owner','testowner','991234567890','fixture') returning id into owner;
 insert into students(name,username,register_number,password_hash) values ('Student','teststudent','991234567891','fixture') returning id into student;
 insert into students(name,username,register_number,password_hash) values ('Outsider','testoutsider','991234567892','fixture') returning id into outsider;
 insert into mentors(name,username,email,password_hash) values ('Mentor','testmentor','mentor-fixture@example.test','fixture') returning id into mentor;
 tid := (eduverse_team_action(owner,'student','create','{"name":"Test team"}'::jsonb)->>'id')::uuid;
 if not exists(select 1 from team_members where team_id=tid and student_id=owner) then raise exception 'owner membership missing'; end if;
 denied:=false; begin perform eduverse_team_action(outsider,'student','message',jsonb_build_object('teamId',tid,'content','blocked')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'outsider message allowed'; end if;
 denied:=false; begin perform eduverse_team_action(mentor,'mentor','task',jsonb_build_object('teamId',tid,'assigneeId',owner,'title','blocked')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'unaccepted mentor allowed'; end if;
 iid := (eduverse_team_action(student,'student','request',jsonb_build_object('teamId',tid))->>'id')::uuid;
 denied:=false; begin perform eduverse_team_action(student,'student','respond',jsonb_build_object('invitationId',iid,'decision','accepted')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'student accepted own request'; end if;
 perform eduverse_team_action(owner,'student','respond',jsonb_build_object('invitationId',iid,'decision','accepted'));
 if not exists(select 1 from team_members where team_id=tid and student_id=student) then raise exception 'join failed'; end if;
 iid := (eduverse_team_action(owner,'student','invite',jsonb_build_object('teamId',tid,'targetId',mentor,'targetRole','mentor'))->>'id')::uuid;
 denied:=false; begin perform eduverse_team_action(owner,'student','respond',jsonb_build_object('invitationId',iid,'decision','accepted')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'owner accepted mentor invite'; end if;
 perform eduverse_team_action(mentor,'mentor','respond',jsonb_build_object('invitationId',iid,'decision','rejected'));
 if exists(select 1 from team_mentors where team_id=tid and mentor_id=mentor) then raise exception 'rejection granted access'; end if;
 iid := (eduverse_team_action(owner,'student','invite',jsonb_build_object('teamId',tid,'targetId',mentor,'targetRole','mentor'))->>'id')::uuid;
 denied:=false; begin perform eduverse_team_action(owner,'student','invite',jsonb_build_object('teamId',tid,'targetId',mentor,'targetRole','mentor')); exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'duplicate pending allowed'; end if;
 perform eduverse_team_action(mentor,'mentor','respond',jsonb_build_object('invitationId',iid,'decision','accepted'));
 taskid := (eduverse_team_action(mentor,'mentor','task',jsonb_build_object('teamId',tid,'assigneeId',student,'title','Build a loop','dueDate','2027-01-01'))->>'id')::uuid;
 denied:=false; begin perform eduverse_team_action(owner,'student','taskStatus',jsonb_build_object('teamId',tid,'taskId',taskid,'status','done')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'non-assignee updated task'; end if;
 perform eduverse_team_action(student,'student','taskStatus',jsonb_build_object('teamId',tid,'taskId',taskid,'status','done'));
 if not exists(select 1 from team_tasks where id=taskid and status='done') then raise exception 'task status missing'; end if;
 perform eduverse_team_action(mentor,'mentor','message',jsonb_build_object('teamId',tid,'content','Keep going'));
 perform eduverse_team_action(student,'student','project',jsonb_build_object('teamId',tid,'title','Loop project','url','https://example.test/project'));
 denied:=false; begin perform eduverse_team_action(student,'student','project',jsonb_build_object('teamId',tid,'title','Unsafe','url','javascript:alert(1)')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'unsafe project accepted'; end if;
 perform eduverse_team_action(owner,'student','remove',jsonb_build_object('teamId',tid,'targetId',mentor,'targetRole','mentor'));
 denied:=false; begin perform eduverse_team_action(mentor,'mentor','message',jsonb_build_object('teamId',tid,'content','blocked')); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'removed mentor allowed'; end if;
 perform eduverse_team_action(student,'student','leave',jsonb_build_object('teamId',tid));
 if exists(select 1 from team_members where team_id=tid and student_id=student) then raise exception 'leave failed'; end if;
 iid := (eduverse_team_action(owner,'student','invite',jsonb_build_object('teamId',tid,'targetId',student,'targetRole','student'))->>'id')::uuid;
 perform eduverse_team_action(student,'student','respond',jsonb_build_object('invitationId',iid,'decision','accepted'));
 perform eduverse_team_action(owner,'student','delete',jsonb_build_object('teamId',tid));
 if exists(select 1 from team_messages where team_id=tid) or exists(select 1 from team_tasks where team_id=tid) or exists(select 1 from team_projects where team_id=tid) then raise exception 'delete cascade failed'; end if;
 if has_function_privilege('anon','eduverse_team_action(uuid,text,text,jsonb)','execute') or has_function_privilege('authenticated','eduverse_team_action(uuid,text,text,jsonb)','execute') then raise exception 'browser RPC access allowed'; end if;
 end $$;
 rollback;`], {encoding:'utf8'});
 assert.match(output,/ROLLBACK/);
});
