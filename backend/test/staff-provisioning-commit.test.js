import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { staffRoutes } from '../src/staff.js';

// These failure-injection tests use fake Auth and DB adapters; no production writes.
test('provisioning never deletes Auth after ambiguous COMMIT, but cleans up a definite pre-commit failure', async () => {
  const keys=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch;
  const userId='00000000-0000-4000-8000-000000000123';
  let server;
  let scenario='ambiguous';
  let deletes=0;
  let commits=0;
  const releases=[];
  try {
    Object.assign(process.env,{STAFF_MANAGEMENT_ENABLED:'true',SUPABASE_URL:'https://isolated-staff-test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-test-key'});
    globalThis.fetch=async (url,options)=>{
      if(options.method==='DELETE') { deletes++; return {ok:true,json:async()=>({})}; }
      assert.equal(options.method,'POST');
      assert.match(String(url),/\/auth\/v1\/admin\/users$/);
      return {ok:true,json:async()=>({id:userId})};
    };
    const pool={
      connect:async()=>({
        query:async sql=>{
          if(sql==='COMMIT'){commits++;throw new Error('connection lost after COMMIT');}
          if(scenario==='precommit' && sql.includes('insert into public.crm_staff(')) throw Object.assign(new Error('constraint failure'),{code:'23505'});
          return {rowCount:1,rows:[]};
        },
        release:broken=>releases.push(broken)
      })
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(req,res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000001'};next();}}));
    app.use((err,_req,res,_next)=>res.status(500).json({error:err.message}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const endpoint='http://127.0.0.1:'+server.address().port+'/api/admin/staff';
    const post=()=>originalFetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'employee@example.com',fullName:'Example Employee',role:'sales'})});
    const ambiguous=await post();
    assert.equal(ambiguous.status,503);
    assert.match((await ambiguous.json()).error,/outcome is uncertain/i);
    assert.equal(deletes,0,'Auth identity must survive uncertain COMMIT');
    assert.equal(commits,1);
    assert.deepEqual(releases,[true],'ambiguous COMMIT connection must be discarded');
    scenario='precommit';
    const rejected=await post();
    assert.equal(rejected.status,409);
    assert.equal(deletes,1,'definite pre-commit failure can clean up Auth');
    assert.equal(commits,1);
    assert.deepEqual(releases,[true,false],'successful rollback can return connection to pool');
  } finally {
    if(server)await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  }
});
