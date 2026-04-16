const http = require('http');
process.env.PORT = '3002';
process.env.DB_PATH = './data/test.db';
const fs = require('fs');
try { fs.rmSync('./data/test.db', { force: true }); } catch {}
const app = require('./src/server.js');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const o = { hostname: '127.0.0.1', port: 3002, path: '/api/v1' + path, method, headers: { 'Content-Type': 'application/json' }};
    if (token) o.headers.Authorization = `Bearer ${token}`;
    const r = http.request(o, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({s:res.statusCode,b:JSON.parse(d)})}catch{resolve({s:res.statusCode,b:d})} }); });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
let p=0,f=0;
function ok(n,c){if(c){console.log(`  ✅ ${n}`);p++}else{console.log(`  ❌ ${n}`);f++}}

async function run(){
  await new Promise(r=>setTimeout(r,3000));
  console.log('\n  TaskFlow API — Integration Tests\n');
  const h=await req('GET','/health'); ok('Health 200',h.s===200);
  const rg=await req('POST','/auth/register',{email:'t@test.com',username:'tester',password:'Test@12345',first_name:'T',last_name:'U'}); ok('Register 201',rg.s===201); ok('Has token',!!rg.b.data?.access_token);
  const dp=await req('POST','/auth/register',{email:'t@test.com',username:'tester',password:'Test@12345'}); ok('Dup 409',dp.s===409);
  const bv=await req('POST','/auth/register',{email:'x',username:'a',password:'b'}); ok('Validation 400',bv.s===400); ok('Has errors',bv.b.errors?.length>0);
  const lg=await req('POST','/auth/login',{email:'user@taskflow.io',password:'User@123'}); ok('Login 200',lg.s===200); const tk=lg.b.data.access_token; const rt=lg.b.data.refresh_token;
  const bl=await req('POST','/auth/login',{email:'user@taskflow.io',password:'wrong'}); ok('Wrong pw 401',bl.s===401);
  const pr=await req('GET','/auth/profile',null,tk); ok('Profile 200',pr.s===200); ok('No pw leak',!pr.b.data?.password_hash);
  const na=await req('GET','/auth/profile'); ok('No auth 401',na.s===401);
  const rf=await req('POST','/auth/refresh',{refresh_token:rt}); ok('Refresh 200',rf.s===200); ok('New token',!!rf.b.data?.access_token);
  const ct=await req('POST','/tasks',{title:'Test',priority:'high',tags:['a']},tk); ok('Create 201',ct.s===201); const tid=ct.b.data.id;
  const gt=await req('GET',`/tasks/${tid}`,null,tk); ok('Get 200',gt.s===200);
  const ut=await req('PUT',`/tasks/${tid}`,{status:'done',priority:'critical'},tk); ok('Update 200',ut.s===200); ok('Status done',ut.b.data?.status==='done');
  const ls=await req('GET','/tasks?limit=5',null,tk); ok('List 200',ls.s===200); ok('Has pagination',!!ls.b.pagination);
  const fl=await req('GET','/tasks?status=done',null,tk); ok('Filter works',fl.b.data?.every(t=>t.status==='done'));
  const sr=await req('GET','/tasks?search=Test',null,tk); ok('Search works',sr.b.data?.length>0);
  const st=await req('GET','/tasks/stats',null,tk); ok('Stats 200',st.s===200); ok('Has total',typeof st.b.data?.total==='number');
  const dl=await req('DELETE',`/tasks/${tid}`,null,tk); ok('Delete 200',dl.s===200);
  const gd=await req('GET',`/tasks/${tid}`,null,tk); ok('Deleted 404',gd.s===404);
  const al=await req('POST','/auth/login',{email:'admin@taskflow.io',password:'Admin@123'}); const atk=al.b.data.access_token;
  const au=await req('GET','/admin/users',null,atk); ok('Admin users',au.s===200); ok('Sees all',au.b.pagination?.total>=2);
  const ub=await req('GET','/admin/users',null,tk); ok('RBAC block 403',ub.s===403);
  const lo=await req('GET','/admin/audit-logs',null,atk); ok('Audit logs',lo.s===200); ok('Has entries',lo.b.data?.length>0);
  const nf=await req('GET','/nonexistent'); ok('404 route',nf.s===404); ok('Error shape',nf.b.success===false);
  console.log(`\n  Results: ${p} passed, ${f} failed`);
  if(f===0) console.log('  🎉 ALL TESTS PASSED\n'); else console.log('  ⚠️ Some failed\n');
  process.exit(f>0?1:0);
}
run().catch(e=>{console.error(e);process.exit(1)});
