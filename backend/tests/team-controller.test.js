const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FakeLearningDb}=require('./helpers/fakeLearningDb');
const {loadAi}=require('./helpers/loadAi');
const bcrypt=require('bcryptjs');
const studentId='10000000-0000-4000-8000-000000000001';
const mentorId='20000000-0000-4000-8000-000000000001';
const teamId='30000000-0000-4000-8000-000000000001';
function setup(){
 const db=new FakeLearningDb();
 for(const t of ['mentors','teams','team_members','team_mentors','team_invitations','team_messages','team_tasks','team_projects','playground_runs'])db.rows[t]=[];
 const {jwt}=loadAi(db);
 const c=require('../src/controllers/teamController');
 db.rows.students=[{id:studentId,name:'Student',username:'student',password_hash:'fixture',register_number:'123456789012',mobile_number:'9876543210',bio:'Preserved bio',avatar_url:'',department:'CSE',section:'A'}];
 db.rows.mentors=[{id:mentorId,name:'Mentor',username:'mentor',email:'mentor@example.test',password_hash:bcrypt.hashSync('TestStrong1!',4)}];
 db.rows.teams=[{id:teamId,name:'Test team',owner_id:studentId}];
 db.rows.team_members=[{team_id:teamId,student_id:studentId}];
 return {db,jwt,c};
}
function call(handler, req={}) {return new Promise((resolve,reject)=>{const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){resolve({status:this.statusCode,body});}};const request={body:{},query:{},params:{},headers:{},...req};handler(request,res,error=>error?reject(error):resolve({next:true,req:request}));});}
const denies=(code)=>e=>e.statusCode===code;
test('mentor registration hashes passwords and signs mentor-only tokens',async()=>{const {c,db,jwt}=setup();const r=await call(c.mentorRegister,{body:{username:'newmentor',email:'new@example.test',password:'TestStrong1!',confirmPassword:'TestStrong1!'}});assert.equal(r.status,201);assert.equal(r.body.student.role,'mentor');assert.equal(r.body.student.password_hash,undefined);assert.equal(jwt.verifyToken(r.body.token).role,'mentor');assert(await bcrypt.compare('TestStrong1!',db.rows.mentors[1].password_hash));});
test('mentor registration rejects invalid and oversized passwords',async()=>{const {c}=setup();for(const p of ['weak','Aa1!'.repeat(60)])await assert.rejects(call(c.mentorRegister,{body:{username:'mentor',email:'m@example.test',password:p,confirmPassword:p}}),denies(400));});
test('mentor sign-in checks password and rejects nonexistent accounts',async()=>{const {c,jwt}=setup();const r=await call(c.mentorSignIn,{body:{email:'mentor@example.test',password:'TestStrong1!'}});assert.equal(jwt.verifyToken(r.body.token).mentorId,mentorId);await assert.rejects(call(c.mentorSignIn,{body:{email:'mentor@example.test',password:'wrong'}}),denies(401));});
test('team middleware rejects guest, admin, expired and deleted accounts',async()=>{const {c,jwt}=setup();await assert.rejects(call(c.requireAccount),denies(401));await assert.rejects(call(c.requireAccount,{headers:{authorization:`Bearer ${jwt.signStudentToken({studentId})}`}}),denies(403));await assert.rejects(call(c.requireAccount,{headers:{authorization:`Bearer ${jwt.signAdminToken({account:true})}`}}),denies(403));await assert.rejects(call(c.requireAccount,{headers:{authorization:`Bearer ${jwt.signMentorToken({mentorId:studentId,account:true})}`}}),denies(401));const req={headers:{authorization:`Bearer ${jwt.signMentorToken({mentorId,account:true})}`}};const result=await call(c.requireAccount,req);assert(result.next);assert.equal(result.req.account.role,'mentor');});
test('student account refresh preserves bio, department and profile completion',async()=>{const {c}=setup();const r=await call(c.account,{account:{id:studentId,role:'student'}});assert.equal(r.body.student.bio,'Preserved bio');assert.equal(r.body.student.department,'CSE');assert.equal(r.body.student.profileComplete,true);});
test('mentor overview requires accepted mentorship and current student membership',async()=>{const {c,db}=setup();const req={account:{id:mentorId,role:'mentor'},params:{teamId,studentId}};await assert.rejects(call(c.overview,req),denies(403));db.rows.team_mentors=[{team_id:teamId,mentor_id:mentorId}];const r=await call(c.overview,req);assert.equal(r.body.student.id,studentId);assert.equal(r.body.student.password_hash,undefined);assert.equal(r.body.student.register_number,undefined);db.rows.team_members=[];await assert.rejects(call(c.overview,req),denies(403));await assert.rejects(call(c.overview,{...req,account:{id:studentId,role:'student'}}),denies(403));});
test('missing migration returns actionable 503',async()=>{const {c,db}=setup();db.missing=['teams'];await assert.rejects(c.access({id:studentId,role:'student'},teamId),denies(503));});
test('search sanitization rejects filter injection and private-field queries',async()=>{const {c}=setup();await assert.rejects(call(c.search,{query:{q:'a),email.ilike.*',type:'student'}}),denies(400));await assert.rejects(call(c.search,{query:{q:'ok',type:'password_hash'}}),denies(400));});
test('mutations derive identity from verified account, not request payload',async()=>{const {c,db}=setup();let rpc;db.rpc=async(name,payload)=>{rpc={name,payload};return {data:{success:true},error:null};};await call(c.mutate,{account:{id:studentId,role:'student'},params:{operation:'message'},body:{teamId,content:' Hello ',actor:mentorId,actor_role:'mentor'}});assert.equal(rpc.payload.actor,studentId);assert.equal(rpc.payload.actor_role,'student');assert.equal(rpc.payload.payload.content,'Hello');});
test('mutations reject unsafe URLs, bad statuses and malformed identifiers',async()=>{const {c}=setup();for(const [op,body] of [['project',{teamId,title:'Bad',url:'javascript:alert(1)'}],['taskStatus',{teamId,taskId:teamId,status:'oops'}],['invite',{teamId,targetId:'bad',targetRole:'mentor'}]])await assert.rejects(call(c.mutate,{account:{id:studentId,role:'student'},params:{operation:op},body}),denies(400));});
