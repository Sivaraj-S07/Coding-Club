const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FakeLearningDb}=require('./helpers/fakeLearningDb');
const {loadAi}=require('./helpers/loadAi');
const ids={s1:'10000000-0000-4000-8000-000000000001',s2:'10000000-0000-4000-8000-000000000002',s3:'10000000-0000-4000-8000-000000000003',m1:'20000000-0000-4000-8000-000000000001',t1:'30000000-0000-4000-8000-000000000001',t2:'30000000-0000-4000-8000-000000000002',q1:'40000000-0000-4000-8000-000000000001'};
const call=(handler,req={})=>new Promise((resolve,reject)=>{const res={statusCode:200,status(c){this.statusCode=c;return this;},json(body){resolve({status:this.statusCode,body});}};handler({body:{},query:{},params:{},headers:{},...req},res,e=>e?reject(e):resolve({next:true}));});
const iso=d=>new Date(Date.now()-d*86400000).toISOString();
function setup(){
 const db=new FakeLearningDb();
 for(const t of ['mentors','teams','team_members','team_mentors','team_invitations','team_messages','team_tasks','team_projects','playground_runs'])db.rows[t]=[];
 loadAi(db);
 const c=require('../src/controllers/teamController');
 const insights=require('../src/utils/teamInsights');
 db.rows.students=[
  {id:ids.s1,name:'Asha Leader',username:'asha',password_hash:'x',department:'CSE',email:'private@x.test',register_number:'999',mobile_number:'111'},
  {id:ids.s2,name:'Ravi Member',username:'ravi',password_hash:'x',department:'ECE'},
  {id:ids.s3,name:'Idle Student',username:'idle',password_hash:'x',department:'IT'}];
 db.rows.mentors=[{id:ids.m1,name:'Meena Mentor',username:'meena',email:'m@x.test',password_hash:'h',bio:'Python coach'}];
 db.rows.teams=[{id:ids.t1,name:'Circuit Collective',description:'Builders',owner_id:ids.s1,created_at:iso(10)},{id:ids.t2,name:'Empty Circuit',description:'',owner_id:ids.s3,created_at:iso(5)}];
 db.rows.team_members=[{team_id:ids.t1,student_id:ids.s1},{team_id:ids.t1,student_id:ids.s2},{team_id:ids.t2,student_id:ids.s3}];
 db.rows.team_mentors=[{team_id:ids.t1,mentor_id:ids.m1}];
 db.rows.learning_profiles=[{student_id:ids.s1,xp:620,streak_days:8,total_practice_answers:40,last_active_date:iso(0).slice(0,10)},{student_id:ids.s2,xp:60,streak_days:1,total_practice_answers:5,last_active_date:iso(30).slice(0,10)}];
 db.rows.topic_mastery=[{student_id:ids.s1,topic_id:'variables',mastery:0.85,attempts:12,correct:10},{student_id:ids.s1,topic_id:'loops',mastery:0.65,attempts:6,correct:4},{student_id:ids.s2,topic_id:'variables',mastery:0.3,attempts:2,correct:1}];
 db.rows.quizzes=[{id:ids.q1,title:'Python Basics'}];
 db.rows.quiz_attempts=[{id:'a1',quiz_id:ids.q1,student_id:ids.s1,status:'submitted',percentage:92,passed:true,submitted_at:iso(1)},{id:'a2',quiz_id:ids.q1,student_id:ids.s2,status:'submitted',percentage:40,passed:false,submitted_at:iso(35)},{id:'a3',quiz_id:ids.q1,student_id:ids.s2,status:'in_progress',percentage:null,passed:null,submitted_at:null}];
 db.rows.adaptive_sessions=[{id:'x1',student_id:ids.s1,topic_id:'loops',status:'completed',answered_count:8,correct_count:6,started_at:iso(2)}];
 db.rows.playground_runs=[...Array(6)].map((_,i)=>({id:`r${i}`,student_id:ids.s1,language:'python',status:'ok',created_at:iso(i)})).concat([{id:'r9',student_id:ids.s1,language:'java',status:'runtime_error',created_at:iso(3)}]);
 db.rows.team_tasks=[{id:'k1',team_id:ids.t1,mentor_id:ids.m1,assignee_id:ids.s1,status:'done',title:'secret task title',created_at:iso(4)},{id:'k2',team_id:ids.t1,mentor_id:ids.m1,assignee_id:ids.s1,status:'done',title:'t2',created_at:iso(3)},{id:'k3',team_id:ids.t1,mentor_id:ids.m1,assignee_id:ids.s2,status:'todo',title:'t3',created_at:iso(2)}];
 db.rows.team_projects=[{id:'p1',team_id:ids.t1,student_id:ids.s1,title:'Secret project',url:'https://x.test'}];
 db.rows.team_messages=[{id:'g1',team_id:ids.t1,mentor_id:ids.m1,content:'private chat text',created_at:iso(1)}];
 return {db,c,insights};
}
const student=id=>({account:{id,role:'student'}});

test('team search for students returns role, progress, performance, tasks, skills, achievements and activities',async()=>{
 const {c}=setup();
 const r=await call(c.search,{...student(ids.s2),query:{q:'asha',type:'student'}});
 assert.equal(r.body.results.length,1);
 const a=r.body.results[0];
 assert.equal(a.role,'student');assert.equal(a.roleLabel,'Student · Team Leader');
 assert.equal(a.stats.completedTasks,2);assert.equal(a.stats.tasksAssigned,2);assert.equal(a.stats.xp,620);
 assert(a.progress>0&&a.progress<=100);assert(a.performance.score>50);
 assert(a.skills.some(s=>s.name==='Variables & Data Types'&&s.level==='Advanced'));
 assert(a.skills.some(s=>s.name==='Python'&&s.source==='language'));
 const badges=a.achievements.map(x=>x.id);
 for(const b of ['first_steps','streak_7','xp_500','quiz_passer','quiz_ace','topic_master','task_finisher','builder','team_leader'])assert(badges.includes(b),`missing ${b}`);
 assert(!badges.includes('xp_1000'));assert(!badges.includes('perfect_delivery'),'needs 3+ assigned tasks');
 assert(a.activities.length>0&&a.activities[0].at);
 assert(a.activities.some(x=>x.type==='quiz'&&x.label.includes('Python Basics')));
});
test('search never leaks private fields, task/project titles, chat or source code',async()=>{
 const {c}=setup();
 const body=JSON.stringify([(await call(c.search,{...student(ids.s2),query:{q:'asha',type:'student'}})).body,(await call(c.search,{...student(ids.s2),query:{q:'meena',type:'mentor'}})).body,(await call(c.search,{...student(ids.s2),query:{q:'circuit',type:'team'}})).body]);
 for(const secret of ['private@x.test','999','"111"','secret task title','Secret project','private chat text','password_hash','https://x.test','m@x.test'])assert(!body.includes(secret),`leaked ${secret}`);
});
test('inactive students get zero scores and no badges instead of errors',async()=>{
 const {c}=setup();
 const r=await call(c.search,{...student(ids.s1),query:{q:'idle',type:'student'}});
 const p=r.body.results[0];
 assert.equal(p.progress,0);assert.equal(p.performance.score,0);assert.equal(p.performance.label,'No activity yet');
 assert.deepEqual(p.achievements.map(a=>a.id),['team_leader']);assert.deepEqual(p.skills,[]);assert.deepEqual(p.activities,[]);
});
test('mentor search shows role, mentoring stats, achievements and mentee-based focus areas',async()=>{
 const {c}=setup();
 const r=await call(c.search,{...student(ids.s1),query:{q:'meena',type:'mentor'}});
 const m=r.body.results[0];
 assert.equal(m.role,'mentor');assert.equal(m.roleLabel,'Mentor');assert.equal(m.bio,'Python coach');
 assert.equal(m.stats.teamsMentoring,1);assert.equal(m.stats.mentees,2);assert.equal(m.stats.tasksAssigned,3);assert.equal(m.stats.tasksDone,2);assert.equal(m.stats.completionRate,67);
 assert(m.achievements.some(a=>a.id==='first_mentee'));assert(m.activities.length>0);
 assert.equal(m.email,undefined);assert.equal(m.password_hash,undefined);
});
test('team search shows leader, mentors, overall progress and top performers',async()=>{
 const {c}=setup();
 const r=await call(c.search,{...student(ids.s2),query:{q:'circuit',type:'team'}});
 assert.equal(r.body.results.length,2);
 const t=r.body.results.find(x=>x.id===ids.t1);
 assert.equal(t.leader.name,'Asha Leader');assert.equal(t.leader.roleLabel,'Team Leader');
 assert.equal(t.mentors[0].name,'Meena Mentor');assert.equal(t.mentors[0].roleLabel,'Mentor');
 assert.equal(t.summary.memberCount,2);assert.equal(t.summary.tasksDone,2);assert.equal(t.summary.tasksTotal,3);assert.equal(t.summary.completionRate,67);
 assert(t.summary.progress>0);assert.equal(t.topPerformers[0].name,'Asha Leader');assert.equal(t.topPerformers[0].rank,1);
 const empty=r.body.results.find(x=>x.id===ids.t2);
 assert.equal(empty.summary.memberCount,1);assert.equal(empty.topPerformers.length,0);assert.equal(empty.mentors.length,0);
});
test('team insights endpoint returns every member with full detail, ranks them and flags the viewer',async()=>{
 const {c}=setup();
 const r=await call(c.insights,{...student(ids.s2),params:{teamId:ids.t1}});
 const d=r.body;
 assert.equal(d.leader.id,ids.s1);assert.equal(d.members.length,2);assert.equal(d.members[0].id,ids.s1);assert.equal(d.members[0].rank,1);assert.equal(d.members[1].rank,2);
 const ravi=d.members.find(m=>m.id===ids.s2);
 assert.equal(ravi.isLeader,false);assert.equal(ravi.roleLabel,'Team Member');assert.deepEqual(ravi.teamTasks,{assigned:1,done:0,inProgress:0});
 assert(Array.isArray(ravi.skills)&&Array.isArray(ravi.achievements)&&Array.isArray(ravi.activities));
 assert.equal(d.mentors[0].teamStats.tasksAssigned,3);assert.equal(d.mentors[0].teamStats.messages,1);
 assert.equal(d.viewer.isMember,true);
 assert.equal(d.summary.progress,Math.round((d.members[0].progress+d.members[1].progress)/2));
 assert(d.recentActivity.length>0&&d.recentActivity[0].memberName);
 const outsider=await call(c.insights,{account:{id:ids.m1,role:'mentor'},params:{teamId:ids.t2}});
 assert.equal(outsider.body.viewer.isMember,false);
 await assert.rejects(call(c.insights,{...student(ids.s1),params:{teamId:'bad'}}),e=>e.statusCode===400);
 await assert.rejects(call(c.insights,{...student(ids.s1),params:{teamId:'50000000-0000-4000-8000-000000000009'}}),e=>e.statusCode===404);
});
test('mentor member overview now includes derived insights without losing existing fields',async()=>{
 const {c}=setup();
 const r=await call(c.overview,{account:{id:ids.m1,role:'mentor'},params:{teamId:ids.t1,studentId:ids.s1}});
 for(const k of ['student','profile','mastery','quizzes','runs','activities','projects'])assert(k in r.body,k);
 assert.equal(r.body.insights.stats.completedTasks,2);assert(r.body.insights.achievements.length>3);
});
test('analytics tables missing on an older database degrade gracefully; missing team tables stay an actionable 503',async()=>{
 const {c,db}=setup();
 db.missing=['playground_runs','adaptive_sessions'];
 const r=await call(c.search,{...student(ids.s2),query:{q:'asha',type:'student'}});
 assert.equal(r.body.results[0].stats.codeRuns,0);assert.equal(r.body.results[0].stats.xp,620);
 db.missing=['team_tasks'];
 await assert.rejects(call(c.insights,{...student(ids.s1),params:{teamId:ids.t1}}),e=>e.statusCode===503);
});
test('search still validates input after the enrichment change',async()=>{
 const {c}=setup();
 await assert.rejects(call(c.search,{...student(ids.s1),query:{q:'a),email.ilike.*',type:'student'}}),e=>e.statusCode===400);
 await assert.rejects(call(c.search,{...student(ids.s1),query:{q:'ok',type:'password_hash'}}),e=>e.statusCode===400);
 await assert.rejects(call(c.search,{...student(ids.s1),query:{q:'x',type:'team'}}),e=>e.statusCode===400);
});
