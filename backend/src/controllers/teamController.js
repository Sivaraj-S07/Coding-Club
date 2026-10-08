const bcrypt = require('bcryptjs');
const { getSupabase } = require('../config/supabaseClient');
const { verifyToken, signMentorToken } = require('../utils/jwt');
const { ApiError, asyncHandler } = require('../utils/asyncHandler');
const { passwordIssues } = require('../utils/passwordPolicy');
const { normalizeEmail } = require('../utils/enums');
const { loadStudentInsights, loadMentorInsights, loadTeamInsights } = require('../utils/teamInsights');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = value => { if (!UUID.test(value || '')) throw new ApiError(400,'Invalid identifier'); return value; };
const text = (value, min, max, label) => { const v=String(value ?? '').trim(); if(v.length<min || v.length>max) throw new ApiError(400,`${label} must be ${min}-${max} characters`); return v; };
function dbError(error) { if (!error) return; if(error.code==='42P01' || error.code==='PGRST205' || error.code==='PGRST202') throw new ApiError(503,'Team features need the migration_teams_mentors.sql database update.'); throw new ApiError(500,'Unable to load team data'); }
async function read(query) { const {data,error}=await query; dbError(error); return data; }
const publicStudent = s => ({id:s.id,name:s.name,username:s.username,department:s.department || '',role:'student'});
const publicMentor = m => ({id:m.id,name:m.name,username:m.username,bio:m.bio || '',role:'mentor'});
const mentorRegister=asyncHandler(async(req,res)=>{
 const username=text(req.body?.username,3,30,'Username');
 if(!/^[A-Za-z0-9._-]+$/.test(username)) throw new ApiError(400,'Invalid username');
 const email=normalizeEmail(req.body?.email), password=String(req.body?.password || '');
  if(!email || password.length>200 || passwordIssues(password).length || password!==req.body?.confirmPassword) throw new ApiError(400,'A valid email and matching strong passwords are required');
 const {data,error}=await getSupabase().from('mentors').insert({username,name:username,email,password_hash:await bcrypt.hash(password,12)}).select('id,name,username,email,bio').single();
 if(error?.code==='23505') throw new ApiError(409,'This email or username is already registered');
 dbError(error);
 res.status(201).json({token:signMentorToken({mentorId:data.id,account:true}),student:{...publicMentor(data),email:data.email,profileComplete:true}});
});
const mentorSignIn=asyncHandler(async(req,res)=>{
 const email=normalizeEmail(req.body?.email), password=String(req.body?.password || '');
 if(!email || !password || password.length>200) throw new ApiError(400,'Email and password are required');
 const m=await read(getSupabase().from('mentors').select('id,name,username,email,bio,password_hash').eq('email',email).maybeSingle());
 if(!m || !await bcrypt.compare(password,m.password_hash)) throw new ApiError(401,'Incorrect email or password');
 res.json({token:signMentorToken({mentorId:m.id,account:true}),student:{...publicMentor(m),email:m.email,profileComplete:true}});
});
const requireAccount=asyncHandler(async(req,res,next)=>{
 const [scheme,token]=(req.headers.authorization || '').split(' ');
 let p; try { if(scheme!=='Bearer' || !token) throw new Error(); p=verifyToken(token); } catch { throw new ApiError(401,'Sign in to continue'); }
 if(!p.account || !['student','mentor'].includes(p.role)) throw new ApiError(403,'An account is required');
 const actorId=id(p.role==='mentor'?p.mentorId:p.studentId);
 const row=await read(getSupabase().from(p.role==='mentor'?'mentors':'students').select(p.role==='mentor'?'id':'id,password_hash').eq('id',actorId).maybeSingle());
 if(!row || (p.role==='student' && !row.password_hash)) throw new ApiError(401,'Account no longer available');
 req.account={id:actorId,role:p.role}; next();
});
const account=asyncHandler(async(req,res)=>{
 const {id:actor,role}=req.account;
 if(role==='student') {
  req.student={studentId:actor};
  return require('./studentAccountController').getAccount(req,res,error=>res.status(error.statusCode || 500).json({message:error.message}));
 }
 const row=await read(getSupabase().from(role==='mentor'?'mentors':'students').select(role==='mentor'?'id,name,username,email,bio':'id,name,username,email,register_number,mobile_number').eq('id',actor).single());
 res.json({student:role==='mentor'?{...publicMentor(row),email:row.email,profileComplete:true}:{...publicStudent(row),email:row.email,profileComplete:Boolean(row.register_number && row.mobile_number)}});
});
async function access(a,teamId) {
 const db=getSupabase(); const team=await read(db.from('teams').select('*').eq('id',id(teamId)).maybeSingle());
 if(!team) throw new ApiError(404,'Team not found');
 const row=await read(db.from(a.role==='mentor'?'team_mentors':'team_members').select('team_id').eq('team_id',teamId).eq(a.role==='mentor'?'mentor_id':'student_id',a.id).maybeSingle());
 if(!row) throw new ApiError(403,'You are not a member of this team'); return team;
}
// Compact person card used inside team search results (full detail loads via /teams/:teamId/insights).
const brief = p => p && ({id:p.id,name:p.name,username:p.username,role:p.role,roleLabel:p.roleLabel,progress:p.progress,performance:p.performance,achievementCount:p.achievements.length,stats:{completedTasks:p.stats.completedTasks}});
// Enrichment is best-effort: if analytics cannot be loaded, plain search results are still returned.
async function enrich(label,work,fallback) { try { return await work(); } catch(error) { if(error.statusCode===503) throw error; console.error(`[team search] ${label} insights failed:`,error.message); return fallback; } }
const search=asyncHandler(async(req,res)=>{
 const q=text(req.query.q,2,60,'Search');
 // Strictly sanitize PostgREST filters; never project email, password, phone or register number.
 if(!/^[\p{L}\p{N} ._-]+$/u.test(q)) throw new ApiError(400,'Use letters or numbers in your search');
 const pattern=q.replace(/[%_]/g,''); const type=req.query.type || 'student'; const db=getSupabase();
 if(type==='team') {
  const teams=await read(db.from('teams').select('id,name,description,owner_id,created_at').ilike('name',`%${pattern}%`).order('created_at',{ascending:false}).limit(20));
  const rolled=await enrich('team',()=>loadTeamInsights(db,teams,{memberCap:0}),null);
  return res.json({results:teams.map(t=>{
   const r=rolled?.get(t.id);
   return {id:t.id,name:t.name,description:t.description,createdAt:t.created_at,role:'team',...(r?{leader:brief(r.leader),mentors:r.mentors.map(brief),summary:r.summary,topPerformers:r.topPerformers}:{})};
  })});
 }
 if(!['student','mentor'].includes(type)) throw new ApiError(400,'Invalid search type');
 let query=db.from(type==='mentor'?'mentors':'students').select(type==='mentor'?'id,name,username,bio':'id,name,username,department').or(`username.ilike.%${pattern}%,name.ilike.%${pattern}%`).limit(20);
 if(type==='student') query=query.not('password_hash','is',null);
 const people=(await read(query)).map(type==='mentor'?publicMentor:publicStudent);
 const insights=await enrich(type,()=>type==='mentor'?loadMentorInsights(db,people):loadStudentInsights(db,people),new Map());
 res.json({results:people.map(p=>({...p,...(insights.get(p.id) || {})}))});
});
const list=asyncHandler(async(req,res)=>{
 const a=req.account,db=getSupabase();
 const memberships=await read(db.from(a.role==='mentor'?'team_mentors':'team_members').select('team_id').eq(a.role==='mentor'?'mentor_id':'student_id',a.id));
 const teams=memberships.length?await read(db.from('teams').select('*').in('id',memberships.map(x=>x.team_id)).order('created_at',{ascending:false})):[];
 const owned=a.role==='student'?teams.filter(t=>t.owner_id===a.id).map(t=>t.id):[];
 let query=db.from('team_invitations').select('id,team_id,student_id,mentor_id,kind,status,created_at,teams(name),students(name,username),mentors(name,username)').eq('status','pending');
 query=owned.length?query.or(`student_id.eq.${a.id},team_id.in.(${owned.join(',')})`):query.eq(a.role==='mentor'?'mentor_id':'student_id',a.id);
 res.json({teams,invitations:await read(query.order('created_at',{ascending:false}).limit(100))});
});
const detail=asyncHandler(async(req,res)=>{
 const a=req.account,db=getSupabase(),tid=id(req.params.teamId),team=await access(a,tid);
 const [members,mentors,messages,tasks,projects]=await Promise.all([
  read(db.from('team_members').select('student_id,joined_at,students(id,name,username,department)').eq('team_id',tid)),
  read(db.from('team_mentors').select('mentor_id,mentors(id,name,username,bio)').eq('team_id',tid)),
  read(db.from('team_messages').select('id,content,created_at,student_id,mentor_id,students(name,username),mentors(name,username)').eq('team_id',tid).order('created_at',{ascending:false}).limit(100)),
  read(db.from('team_tasks').select('*').eq('team_id',tid).order('created_at',{ascending:false}).limit(100)),
  read(db.from('team_projects').select('*').eq('team_id',tid).order('created_at',{ascending:false}).limit(100))
 ]);
 res.json({team,members:members.map(m=>({...publicStudent(m.students),joinedAt:m.joined_at})),mentors:mentors.map(m=>publicMentor(m.mentors)),messages:messages.reverse(),tasks,projects});
});
const overview=asyncHandler(async(req,res)=>{
 const a=req.account,tid=id(req.params.teamId),sid=id(req.params.studentId);
 if(a.role!=='mentor') throw new ApiError(403,'Mentor access required');
 await access(a,tid); const db=getSupabase();
 const member=await read(db.from('team_members').select('student_id').eq('team_id',tid).eq('student_id',sid).maybeSingle());
 if(!member) throw new ApiError(403,'Student is not a member of this team');
 const [student,profile,mastery,quizzes,runs,activities,projects]=await Promise.all([
 read(db.from('students').select('id,name,username,department').eq('id',sid).single()),
 read(db.from('learning_profiles').select('xp,streak_days,total_practice_answers,last_active_date').eq('student_id',sid).maybeSingle()),
 read(db.from('topic_mastery').select('topic_id,mastery,attempts,correct,last_practiced_at').eq('student_id',sid).limit(100)),
 read(db.from('quiz_attempts').select('id,status,obtained_marks,percentage,passed,submitted_at,quizzes(title)').eq('student_id',sid).order('started_at',{ascending:false}).limit(50)),
 read(db.from('playground_runs').select('id,language,status,time_ms,created_at,source,stdout,stderr').eq('student_id',sid).order('created_at',{ascending:false}).limit(30)),
 read(db.from('adaptive_sessions').select('id,topic_id,status,answered_count,correct_count,started_at').eq('student_id',sid).order('started_at',{ascending:false}).limit(30)),
 read(db.from('team_projects').select('*').eq('team_id',tid).eq('student_id',sid).order('created_at',{ascending:false}).limit(30))
 ]);
 // Revalidate membership before returning data if access was revoked during reads.
 await access(a,tid); const stillMember=await read(db.from('team_members').select('student_id').eq('team_id',tid).eq('student_id',sid).maybeSingle());
 if(!stillMember) throw new ApiError(403,'Student is no longer a member');
 const memberInsight=(await loadStudentInsights(db,[publicStudent(student)])).get(sid) || null;
 res.json({student:publicStudent(student),profile,mastery,quizzes,runs,activities,projects,insights:memberInsight});
});
// Read-only roll-up for one team: leader, mentors, every member's activity/progress/performance/achievements,
// top performers and overall team progress. Same exposure level as Team Search, so any signed-in account may read it.
const insights=asyncHandler(async(req,res)=>{
 const a=req.account,db=getSupabase(),tid=id(req.params.teamId);
 const team=await read(db.from('teams').select('id,name,description,owner_id,created_at').eq('id',tid).maybeSingle());
 if(!team) throw new ApiError(404,'Team not found');
 const rolled=(await loadTeamInsights(db,[team])).get(tid);
 const viewerIsMember=a.role==='mentor'?rolled.mentors.some(m=>m.id===a.id):rolled.members.some(m=>m.id===a.id);
 res.json({...rolled,viewer:{id:a.id,role:a.role,isMember:viewerIsMember}});
});
const mutate=asyncHandler(async(req,res)=>{
 const op=req.params.operation,p={...req.body},a=req.account;
 const allowed=['create','invite','request','respond','leave','delete','remove','message','task','taskStatus','project'];
 if(!allowed.includes(op)) throw new ApiError(400,'Unknown action');
 if(op==='create') {p.name=text(p.name,3,80,'Team name');p.description=text(p.description || '',0,500,'Description');}
 else if(op==='respond') {id(p.invitationId);if(!['accepted','rejected'].includes(p.decision)) throw new ApiError(400,'Invalid decision');}
 else id(p.teamId);
 if(['invite','remove'].includes(op)) {id(p.targetId);if(!['student','mentor'].includes(p.targetRole)) throw new ApiError(400,'Invalid account type');}
 if(op==='message') p.content=text(p.content,1,4000,'Message');
 if(op==='task') {id(p.assigneeId);p.title=text(p.title,1,160,'Task title');p.description=text(p.description || '',0,2000,'Description');if(p.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate) || Number.isNaN(Date.parse(p.dueDate)))) throw new ApiError(400,'Invalid due date');}
 if(op==='taskStatus') {id(p.taskId);if(!['todo','in_progress','done'].includes(p.status)) throw new ApiError(400,'Invalid task status');}
 if(op==='project') {p.title=text(p.title,1,160,'Project title');p.description=text(p.description || '',0,2000,'Description');p.url=text(p.url || '',0,1000,'URL');if(p.url) {let u;try{u=new URL(p.url);}catch{throw new ApiError(400,'Invalid URL');}if(!['http:','https:'].includes(u.protocol))throw new ApiError(400,'Use an HTTP or HTTPS URL');}}
 const {data,error}=await getSupabase().rpc('eduverse_team_action',{actor:a.id,actor_role:a.role,operation:op,payload:p});
 if(error) {
  if(error.code==='23505') throw new ApiError(409,'An invitation or join request is already pending');
  if(error.code==='P0001') {const safe=String(error.message);const denied=/Forbidden|Only |not a team member/i.test(safe);throw new ApiError(denied?403:409,safe);}
  if(['23514','22007','22008','22P02','23502'].includes(error.code)) throw new ApiError(400,'Invalid action details');
  dbError(error);
 }
 res.json(data);
});
module.exports={mentorRegister,mentorSignIn,requireAccount,account,search,list,detail,overview,insights,mutate,access};
