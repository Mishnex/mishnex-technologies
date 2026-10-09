import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { staffRoutes } from '../src/staff.js';

function jwt(iat) {
  return 'header.' + Buffer.from(JSON.stringify({ iat })).toString('base64url') + '.signature';
}

test('staff login HTTP flow checks active account and fails closed on revoked token', async () => {
  const names = ['STAFF_MANAGEMENT_ENABLED','STAFF_CRM_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const issued = Math.floor(Date.now() / 1000) - 5;
  let token = jwt(issued);
  let active = true;
  let cutoff = new Date((issued - 5) * 1000).toISOString();
  let authCalls = 0;
  let dbCalls = 0;
  let server;
  try {
    Object.assign(process.env, {
      STAFF_MANAGEMENT_ENABLED:'true', STAFF_CRM_ENABLED:'false',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch = async (_url, _options) => {
      authCalls++;
      return { ok:true, json:async () => ({
        user:{ id:'00000000-0000-4000-8000-000000000001' },
        access_token:token, expires_in:3600
      }) };
    };
    const pool = { query:async () => {
      dbCalls++;
      return { rowCount:1, rows:[{
        user_id:'00000000-0000-4000-8000-000000000001',
        role:'sales', is_active:active, must_change_password:true,
        sessions_valid_after:cutoff
      }] };
    }};
    const app = express();
    app.use(express.json());
    app.use('/api/admin/staff', staffRoutes({
      pool, requireOwner:(_req,res) => res.sendStatus(403)
    }));
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/api/admin/staff/login';
    const login = () => originalFetch(url,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',password:'test-only-password'})
    });

    const valid = await login();
    assert.equal(valid.status,200);
    assert.equal(valid.headers.get('cache-control'),'no-store');
    const body = await valid.json();
    assert.equal(body.role,'sales');
    assert.equal(body.mustChangePassword,true);
    assert.equal(body.crmAccessEnabled,false);
    assert.equal(body.accessToken,token);

    active = false;
    const disabled = await login();
    assert.equal(disabled.status,403);

    active = true;
    cutoff = new Date((issued + 2) * 1000).toISOString();
    const revoked = await login();
    assert.equal(revoked.status,401);
    assert.ok(authCalls >= 3);
    assert.equal(dbCalls,3);
  } finally {
    if (server) await new Promise((resolve,reject) => server.close(err => err ? reject(err) : resolve()));
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('Super Admin login denies registration when five active sessions are already present', async () => {
  const names = ['STAFF_MANAGEMENT_ENABLED','STAFF_CRM_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let server;
  let registrations = 0;
  try {
    Object.assign(process.env, {
      STAFF_MANAGEMENT_ENABLED:'true', STAFF_CRM_ENABLED:'false',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    const issued = Math.floor(Date.now() / 1000) - 5;
    globalThis.fetch = async () => ({
      ok:true, json:async () => ({
        user:{ id:'00000000-0000-4000-8000-000000000001' },
        access_token:jwt(issued), expires_in:3600
      })
    });
    const pool = { query:async (sql, params) => {
      if (sql.includes('crm_register_super_admin_session')) {
        registrations++;
        assert.equal(params[0], '00000000-0000-4000-8000-000000000001');
        assert.match(params[1], /^[a-f0-9]{64}$/);
        assert.ok(params[2] instanceof Date);
        return { rowCount:1, rows:[{allowed:false}] };
      }
      return { rowCount:1, rows:[{
        user_id:'00000000-0000-4000-8000-000000000001',
        role:'super_admin', is_active:true, must_change_password:false,
        sessions_valid_after:new Date((issued - 5) * 1000).toISOString()
      }] };
    }};
    const app = express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const response = await originalFetch('http://127.0.0.1:' + server.address().port + '/api/admin/staff/login',{
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'superadmin@example.com',password:'test-only-password'})
    });
    assert.equal(response.status,429);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.match((await response.json()).error,/Maximum 5 active Super Admin sessions/);
    assert.equal(registrations,1);
  } finally {
    if (server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('Super Admin HTTP login succeeds only after session registration and rejects bad expiry', async () => {
  const names = ['STAFF_MANAGEMENT_ENABLED','STAFF_CRM_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let server;
  let expiresIn = 3600;
  let registrations = 0;
  try {
    Object.assign(process.env, {
      STAFF_MANAGEMENT_ENABLED:'true', STAFF_CRM_ENABLED:'false',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    const issued = Math.floor(Date.now() / 1000) - 5;
    globalThis.fetch = async () => ({
      ok:true, json:async () => ({
        user:{ id:'00000000-0000-4000-8000-000000000001' },
        access_token:jwt(issued), expires_in:expiresIn
      })
    });
    const pool = { query:async sql => {
      if (sql.includes('crm_register_super_admin_session')) {
        registrations++;
        return { rowCount:1, rows:[{allowed:true}] };
      }
      return { rowCount:1, rows:[{
        user_id:'00000000-0000-4000-8000-000000000001',
        role:'super_admin', is_active:true, must_change_password:false,
        sessions_valid_after:new Date((issued - 5) * 1000).toISOString()
      }] };
    }};
    const app = express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/api/admin/staff/login';
    const login = () => originalFetch(url,{
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'superadmin@example.com',password:'test-only-password'})
    });
    const valid = await login();
    assert.equal(valid.status,200);
    assert.equal((await valid.json()).role,'super_admin');
    assert.equal(registrations,1);

    expiresIn = -1;
    const invalid = await login();
    assert.equal(invalid.status,401);
    assert.match((await invalid.json()).error,/Invalid session expiry/);
    assert.equal(registrations,1);
  } finally {
    if (server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('staff identity HTTP endpoint denies disabled and revoked sessions', async () => {
  const names = ['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let server;
  let active = true;
  const issued = Math.floor(Date.now() / 1000) - 5;
  const token = jwt(issued);
  let cutoff = new Date((issued - 5) * 1000).toISOString();
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch = async () => ({
      ok:true, json:async () => ({id:'00000000-0000-4000-8000-000000000001'})
    });
    const pool = {query:async () => ({
      rowCount:1,rows:[{
        user_id:'00000000-0000-4000-8000-000000000001',
        full_name:'Test Employee',role:'sales',is_active:active,
        must_change_password:false,sessions_valid_after:cutoff
      }]
    })};
    const app = express();
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/api/admin/staff/me';
    const check = () => originalFetch(url,{headers:{authorization:'Bearer ' + token}});
    const valid = await check();
    assert.equal(valid.status,200);
    assert.equal(valid.headers.get('cache-control'),'no-store');
    assert.equal((await valid.json()).role,'sales');
    active = false;
    assert.equal((await check()).status,403);
    active = true;
    cutoff = new Date((issued + 2) * 1000).toISOString();
    assert.equal((await check()).status,401);
  } finally {
    if (server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('staff logout revokes database sessions before global identity-provider sign-out', async () => {
  const names = ['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let server;
  const events = [];
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch = async (url) => {
      if (String(url).includes('/auth/v1/logout')) {
        events.push('provider-logout');
        return {ok:true};
      }
      events.push('provider-user');
      return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001'})};
    };
    const pool = {query:async sql=>{
      assert.match(sql,/crm_revoke_staff_sessions_on_logout/);
      events.push('database-revoke');
      return {rowCount:1,rows:[{}]};
    }};
    const app = express();
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response = await originalFetch('http://127.0.0.1:' + server.address().port + '/api/admin/staff/logout',{
      method:'POST',headers:{authorization:'Bearer test-only-token'}
    });
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{signedOut:true});
    assert.deepEqual(events,['provider-user','database-revoke','provider-logout']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('staff logout reports partial failure after database revocation if provider sign-out fails', async () => {
  const names = ['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let server;
  const events = [];
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch = async url => {
      if(String(url).includes('/auth/v1/logout')){
        events.push('provider-logout-failed');
        return {ok:false,status:503};
      }
      events.push('provider-user');
      return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001'})};
    };
    const pool={query:async sql=>{
      assert.match(sql,/crm_revoke_staff_sessions_on_logout/);
      events.push('database-revoke');
      return {rowCount:1,rows:[{}]};
    }};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/logout',{
      method:'POST',headers:{authorization:'Bearer test-only-token'}
    });
    assert.equal(response.status,502);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.equal(body.signedOut,false);
    assert.match(body.error,/Local session revoked/);
    assert.deepEqual(events,['provider-user','database-revoke','provider-logout-failed']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('staff logout does not call provider logout when database revocation fails', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch=async url=>{
      if(String(url).includes('/auth/v1/logout')) events.push('unexpected-provider-logout');
      else events.push('provider-user');
      return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001'})};
    };
    const pool={query:async sql=>{
      assert.match(sql,/crm_revoke_staff_sessions_on_logout/);
      events.push('database-revoke-failed');
      throw new Error('simulated database outage');
    }};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/logout',{
      method:'POST',headers:{authorization:'Bearer test-only-token'}
    });
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(events,['provider-user','database-revoke-failed']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('staff password change aborts Auth update when DB revocation fails', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const issued=Math.floor(Date.now()/1000)-5;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch=async (url,options)=>{
      if(String(url).includes('/auth/v1/admin/')) events.push('unexpected-admin-password-update');
      else events.push('provider-user');
      return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001'})};
    };
    const pool={query:async sql=>{
      if(sql.includes('crm_begin_staff_password_change')){
        events.push('database-revoke-failed');
        throw new Error('simulated revocation failure');
      }
      events.push('database-staff-check');
      return {rowCount:1,rows:[{
        is_active:true,
        sessions_valid_after:new Date((issued-5)*1000).toISOString()
      }]};
    }};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/change-password',{
      method:'POST',headers:{authorization:'Bearer '+jwt(issued),'content-type':'application/json'},
      body:JSON.stringify({newPassword:'test-only-long-password-123!'})
    });
    assert.equal(response.status,503);
    assert.deepEqual(events,['provider-user','database-staff-check','database-revoke-failed']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('staff password change revokes sessions before provider update and requires re-login', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const issued=Math.floor(Date.now()/1000)-5;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    globalThis.fetch=async (url,options)=>{
      if(String(url).includes('/auth/v1/admin/')){
        events.push('provider-password-update');
        assert.equal(options.method,'PUT');
        assert.deepEqual(JSON.parse(options.body),{password:'test-only-long-password-123!'});
        return {ok:true,json:async()=>({})};
      }
      events.push('provider-user');
      return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001'})};
    };
    const pool={query:async sql=>{
      if(sql.includes('crm_begin_staff_password_change')){
        events.push('database-begin-revocation');
        return {rowCount:1,rows:[{}]};
      }
      if(sql.includes('crm_complete_staff_password_change')){
        events.push('database-complete-change');
        return {rowCount:1,rows:[{}]};
      }
      events.push('database-staff-check');
      return {rowCount:1,rows:[{
        is_active:true,sessions_valid_after:new Date((issued-5)*1000).toISOString()
      }]};
    }};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/change-password',{
      method:'POST',headers:{authorization:'Bearer '+jwt(issued),'content-type':'application/json'},
      body:JSON.stringify({newPassword:'test-only-long-password-123!'})
    });
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).changed,true);
    assert.deepEqual(events,[
      'provider-user','database-staff-check','database-begin-revocation',
      'provider-password-update','database-complete-change'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('staff password change returns recovery guidance if provider update fails after revocation', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  const originalError=console.error;
  let server;
  const events=[];
  const issued=Math.floor(Date.now()/1000)-5;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key',
      SUPABASE_ANON_KEY:'fake-test-only-anon-key'
    });
    console.error=()=>{};
    globalThis.fetch=async url=>{
      if(String(url).includes('/auth/v1/admin/')){
        events.push('provider-password-update-failed');
        return {ok:false,status:503,json:async()=>({})};
      }
      events.push('provider-user');
      return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001'})};
    };
    const pool={query:async sql=>{
      if(sql.includes('crm_begin_staff_password_change')){
        events.push('database-begin-revocation');
        return {rowCount:1,rows:[{}]};
      }
      if(sql.includes('crm_complete_staff_password_change')){
        events.push('unexpected-database-completion');
      }
      return {rowCount:1,rows:[{
        is_active:true,sessions_valid_after:new Date((issued-5)*1000).toISOString()
      }]};
    }};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({pool,requireOwner:(_req,res)=>res.sendStatus(403)}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/change-password',{
      method:'POST',headers:{authorization:'Bearer '+jwt(issued),'content-type':'application/json'},
      body:JSON.stringify({newPassword:'test-only-long-password-123!'})
    });
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.equal(body.changed,false);
    assert.match(body.error,/Contact the Owner to reset your password/);
    assert.deepEqual(events,['provider-user','database-begin-revocation','provider-password-update-failed']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    console.error=originalError;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner staff password reset revokes sessions before updating provider credentials', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (url,options)=>{
      assert.ok(String(url).includes('/auth/v1/admin/users/'+staffId));
      events.push('provider-password-update');
      assert.equal(options.method,'PUT');
      assert.ok(JSON.parse(options.body).password.length>=12);
      return {ok:true,json:async()=>({})};
    };
    const pool={query:async (sql,params)=>{
      if(sql.includes('crm_begin_staff_password_change')){
        events.push('database-revoke');
        assert.equal(params[0],staffId);
        return {rowCount:1,rows:[{}]};
      }
      if(sql.includes('insert into public.crm_staff_audit')){
        events.push('owner-audit');
        assert.equal(params[1],staffId);
        return {rowCount:1,rows:[{}]};
      }
      events.push('database-active-check');
      return {rowCount:1,rows:[{user_id:staffId}]};
    }};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool,requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/reset-password',{method:'POST'});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.ok(body.temporaryPassword.length>=12);
    assert.deepEqual(events,['database-active-check','database-revoke','provider-password-update','owner-audit']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner staff reset does not update Auth credentials when DB revocation fails', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async()=>{
      providerCalls++;
      throw new Error('Provider should not be called');
    };
    const pool={query:async sql=>{
      if(sql.includes('crm_begin_staff_password_change')) throw new Error('simulated database outage');
      return {rowCount:1,rows:[{user_id:staffId}]};
    }};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool,requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/reset-password',{method:'POST'});
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(providerCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee deactivation updates account, audits and revokes sessions atomically', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let server;
  const statements=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    const client={
      query:async sql=>{
        statements.push(sql);
        if(sql.includes('returning user_id,role')) return {rowCount:1,rows:[{user_id:staffId,role:'sales'}]};
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/deactivate',{method:'POST'});
    assert.equal(response.status,200);
    assert.equal((await response.json()).deactivated,true);
    assert.equal(statements[0],'BEGIN');
    assert.match(statements[1],/update public.crm_staff set is_active=false/);
    assert.match(statements[2],/staff_deactivated/);
    assert.match(statements[3],/update public.crm_super_admin_sessions set revoked_at=now/);
    assert.equal(statements[4],'COMMIT');
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee deactivation rolls back when audit insert fails', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let server;
  const statements=[];
  let released=false;
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    const client={
      query:async sql=>{
        statements.push(sql);
        if(sql.includes('returning user_id,role')) return {rowCount:1,rows:[{user_id:staffId,role:'sales'}]};
        if(sql.includes('staff_deactivated')) throw new Error('simulated audit write failure');
        return {rowCount:1,rows:[]};
      },
      release:()=>{released=true;}
    };
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/deactivate',{method:'POST'});
    assert.equal(response.status,503);
    assert.equal(statements[0],'BEGIN');
    assert.match(statements[1],/update public.crm_staff set is_active=false/);
    assert.match(statements[2],/staff_deactivated/);
    assert.equal(statements[3],'ROLLBACK');
    assert.equal(statements.includes('COMMIT'),false);
    assert.equal(released,true);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee deactivation skips audit for already inactive account', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let server;
  const statements=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    const client={
      query:async sql=>{
        statements.push(sql);
        if(sql.includes('returning user_id,role')) return {rowCount:0,rows:[]};
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/deactivate',{method:'POST'});
    assert.equal(response.status,404);
    assert.deepEqual(statements.slice(0,1),['BEGIN']);
    assert.match(statements[1],/update public.crm_staff set is_active=false/);
    assert.equal(statements[2],'ROLLBACK');
    assert.equal(statements.length,3);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner creates employee only after Auth, staff row and audit transaction succeed', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      events.push('provider-create');
      const body=JSON.parse(options.body);
      assert.equal(body.email,'staff@example.com');
      assert.equal(body.email_confirm,true);
      assert.equal(body.app_metadata.mishnex_role,'sales');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const client={
      query:async sql=>{
        if(sql==='BEGIN') events.push('database-begin');
        else if(sql.includes('insert into public.crm_staff(')) events.push('database-staff-insert');
        else if(sql.includes('staff_created')) events.push('database-audit');
        else if(sql==='COMMIT') events.push('database-commit');
        else events.push(sql);
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,201);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.equal(body.staff.userId,staffId);
    assert.equal(body.staff.mustChangePassword,true);
    assert.ok(body.temporaryPassword.length>=12);
    assert.deepEqual(events,[
      'provider-create','database-begin','database-staff-insert','database-audit','database-commit'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation cleans up Auth account if database audit fails', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (url,options)=>{
      if(options.method==='DELETE'){
        assert.ok(String(url).endsWith('/auth/v1/admin/users/'+staffId));
        events.push('provider-cleanup');
        return {ok:true,json:async()=>({})};
      }
      events.push('provider-create');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const client={
      query:async sql=>{
        if(sql==='BEGIN') events.push('database-begin');
        else if(sql.includes('insert into public.crm_staff(')) events.push('database-staff-insert');
        else if(sql.includes('staff_created')){
          events.push('database-audit-failed');
          throw new Error('simulated audit insert failure');
        } else if(sql==='ROLLBACK') events.push('database-rollback');
        else if(sql==='COMMIT') events.push('unexpected-commit');
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,503);
    assert.deepEqual(events,[
      'provider-create','database-begin','database-staff-insert',
      'database-audit-failed','database-rollback','provider-cleanup'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation returns conflict and cleans Auth on duplicate staff email', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      if(options.method==='DELETE'){
        events.push('provider-cleanup');
        return {ok:true,json:async()=>({})};
      }
      events.push('provider-create');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const client={
      query:async sql=>{
        if(sql==='BEGIN') events.push('database-begin');
        else if(sql.includes('insert into public.crm_staff(')){
          events.push('duplicate-staff-email');
          const error=new Error('duplicate key value violates unique constraint');
          error.code='23505';
          throw error;
        } else if(sql==='ROLLBACK') events.push('database-rollback');
        else if(sql==='COMMIT') events.push('unexpected-commit');
        else events.push('unexpected-query');
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,409);
    assert.equal((await response.json()).error,'Email already registered.');
    assert.deepEqual(events,[
      'provider-create','database-begin','duplicate-staff-email','database-rollback','provider-cleanup'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner cannot provision a sixth active Super Admin and cleans up Auth user', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      if(options.method==='DELETE'){
        events.push('provider-cleanup');
        return {ok:true,json:async()=>({})};
      }
      events.push('provider-create');
      const body=JSON.parse(options.body);
      assert.equal(body.app_metadata.mishnex_role,'super_admin');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const client={
      query:async sql=>{
        if(sql==='BEGIN') events.push('database-begin');
        else if(sql.includes('insert into public.crm_staff(')){
          events.push('super-admin-limit-rejected');
          throw new Error('Maximum 5 active Super Admin accounts allowed');
        } else if(sql==='ROLLBACK') events.push('database-rollback');
        else if(sql==='COMMIT') events.push('unexpected-commit');
        else events.push('unexpected-query');
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'admin@example.com',fullName:'Test Admin',role:'super_admin'})
    });
    assert.equal(response.status,409);
    assert.match((await response.json()).error,/Maximum 5 active Super Admin/);
    assert.deepEqual(events,[
      'provider-create','database-begin','super-admin-limit-rejected',
      'database-rollback','provider-cleanup'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation does not access database after Supabase rejects duplicate email', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      providerCalls++;
      assert.equal(options.method,'POST');
      return {ok:false,status:422,json:async()=>({message:'User already registered'})};
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{databaseCalls++;throw new Error('Database should not be accessed');}},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,409);
    assert.equal((await response.json()).error,'Staff email already exists or is invalid.');
    assert.equal(providerCalls,1);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation rejects invalid inputs before Auth or database access', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async()=>{providerCalls++;throw new Error('Unexpected Auth call');};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{databaseCalls++;throw new Error('Unexpected database call');}},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const cases=[
      {email:'not-an-email',fullName:'Test Employee',role:'sales'},
      {email:'staff@example.com',fullName:'Test Employee',role:'owner'},
      {email:'staff@example.com',role:'sales'},
      {email:'staff@example.com',fullName:'Test Employee',role:'sales',isActive:true}
    ];
    for(const payload of cases){
      const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)
      });
      assert.equal(response.status,400);
      assert.equal((await response.json()).error,'Invalid staff details.');
    }
    assert.equal(providerCalls,0);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Employee creation is denied to unauthenticated users before any side effects', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async()=>{providerCalls++;throw new Error('Unexpected provider call');};
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{databaseCalls++;throw new Error('Unexpected database call');}},
      requireOwner:(_req,res)=>res.status(401).json({error:'Owner authentication required.'})
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,401);
    assert.equal(providerCalls,0);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Employee deactivation denies non-Owner requests without opening a transaction', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  let server;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{databaseCalls++;throw new Error('Unexpected database access');}},
      requireOwner:(_req,res)=>res.status(403).json({error:'Owner access required.'})
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/00000000-0000-4000-8000-000000000001/deactivate',{method:'POST'});
    assert.equal(response.status,403);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner password reset with provider failure returns recovery error and never reveals temporary password', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      assert.equal(options.method,'PUT');
      events.push('provider-password-update-failed');
      return {ok:false,status:503,json:async()=>({message:'simulated provider outage'})};
    };
    const pool={query:async sql=>{
      if(sql.includes('select user_id from public.crm_staff')){
        events.push('database-active-staff-check');
        return {rowCount:1,rows:[{user_id:staffId}]};
      }
      if(sql.includes('crm_begin_staff_password_change')){
        events.push('database-session-revoke');
        return {rowCount:1,rows:[]};
      }
      events.push('unexpected-database-query');
      return {rowCount:1,rows:[]};
    }};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool,requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/reset-password',{method:'POST'});
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.match(body.error,/Retry the reset or contact support/);
    assert.equal(body.temporaryPassword,undefined);
    assert.deepEqual(events,[
      'database-active-staff-check','database-session-revoke','provider-password-update-failed'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner password reset hides credentials if audit fails after provider password update', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      assert.equal(options.method,'PUT');
      events.push('provider-password-updated');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const pool={query:async sql=>{
      if(sql.includes('select user_id from public.crm_staff')){
        events.push('database-active-staff-check');
        return {rowCount:1,rows:[{user_id:staffId}]};
      }
      if(sql.includes('crm_begin_staff_password_change')){
        events.push('database-session-revoke');
        return {rowCount:1,rows:[]};
      }
      if(sql.includes('staff_password_reset')){
        events.push('database-audit-failed');
        throw new Error('simulated audit storage failure');
      }
      events.push('unexpected-database-query');
      return {rowCount:1,rows:[]};
    }};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool,requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/'+staffId+'/reset-password',{method:'POST'});
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.match(body.error,/Retry the reset or contact support/);
    assert.equal(body.temporaryPassword,undefined);
    assert.deepEqual(events,[
      'database-active-staff-check','database-session-revoke',
      'provider-password-updated','database-audit-failed'
    ]);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner password reset rejects non-Owner requests before revocation or Auth changes', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async()=>{providerCalls++;throw new Error('Unexpected Auth access');};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{query:async()=>{databaseCalls++;throw new Error('Unexpected database access');}},
      requireOwner:(_req,res)=>res.status(403).json({error:'Owner access required.'})
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/00000000-0000-4000-8000-000000000001/reset-password',{method:'POST'});
    assert.equal(response.status,403);
    assert.equal(providerCalls,0);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner cannot reset password for inactive employee or mutate Auth sessions', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  const statements=[];
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async()=>{providerCalls++;throw new Error('Unexpected Auth access');};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{query:async sql=>{
        statements.push(sql);
        return {rowCount:0,rows:[]};
      }},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/00000000-0000-4000-8000-000000000001/reset-password',{method:'POST'});
    assert.equal(response.status,404);
    assert.equal(providerCalls,0);
    assert.equal(statements.length,1);
    assert.match(statements[0],/where user_id=\$1 and is_active=true/);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner staff mutation routes reject invalid IDs before touching database or Auth', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async()=>{providerCalls++;throw new Error('Unexpected Auth access');};
    const app=express();
    app.use('/api/admin/staff',staffRoutes({
      pool:{
        query:async()=>{databaseCalls++;throw new Error('Unexpected database query');},
        connect:async()=>{databaseCalls++;throw new Error('Unexpected database connection');}
      },
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    for(const action of ['reset-password','deactivate']){
      const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff/not-a-uuid/'+action,{method:'POST'});
      assert.equal(response.status,400);
      assert.equal((await response.json()).error,'Invalid staff ID.');
    }
    assert.equal(providerCalls,0);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation cleans Auth account when database connection fails', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      if(options.method==='DELETE'){
        events.push('provider-cleanup');
        return {ok:true,json:async()=>({})};
      }
      events.push('provider-create');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{events.push('database-connect-failed');throw new Error('database unavailable');}},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,503);
    assert.equal((await response.json()).temporaryPassword,undefined);
    assert.deepEqual(events,['provider-create','database-connect-failed','provider-cleanup']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation trims and lowercases email before Auth provisioning', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const staffId='00000000-0000-4000-8000-000000000001';
  const events=[];
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      events.push('auth');
      assert.equal(JSON.parse(options.body).email,'staff@example.com');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const client={
      query:async (sql,params)=>{
        if(sql.includes('insert into public.crm_staff(')){
          events.push('staff-insert');
          assert.equal(params[1],'staff@example.com');
        }
        return {rowCount:1,rows:[]};
      },
      release:()=>{}
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>client},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'  STAFF@Example.COM  ',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,201);
    assert.equal((await response.json()).staff.email,'staff@example.com');
    assert.deepEqual(events,['auth','staff-insert']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation fails closed when database and Auth cleanup both fail', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  const events=[];
  const staffId='00000000-0000-4000-8000-000000000001';
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      if(options.method==='DELETE'){
        events.push('provider-cleanup-failed');
        return {ok:false,status:503,json:async()=>({message:'simulated cleanup outage'})};
      }
      events.push('provider-create');
      return {ok:true,json:async()=>({id:staffId})};
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{events.push('database-connect-failed');throw new Error('database unavailable');}},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Service temporarily unavailable.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,503);
    assert.equal((await response.json()).temporaryPassword,undefined);
    assert.deepEqual(events,['provider-create','database-connect-failed','provider-cleanup-failed']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee creation rejects Auth success without user ID before database writes', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let providerCalls=0;
  let databaseCalls=0;
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      providerCalls++;
      assert.equal(options.method,'POST');
      return {ok:true,json:async()=>({})};
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{databaseCalls++;throw new Error('Unexpected database access');}},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Provisioning could not be confirmed.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,503);
    assert.equal((await response.json()).temporaryPassword,undefined);
    assert.equal(providerCalls,1);
    assert.equal(databaseCalls,0);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});

test('Owner employee provisioning rejects malformed Auth user ID before database access', async () => {
  const names=['STAFF_MANAGEMENT_ENABLED','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const originalFetch=globalThis.fetch;
  let server;
  let databaseCalls=0;
  const providerMethods=[];
  try {
    Object.assign(process.env,{
      STAFF_MANAGEMENT_ENABLED:'true',
      SUPABASE_URL:'https://isolated-staff-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'fake-test-only-service-key'
    });
    globalThis.fetch=async (_url,options)=>{
      providerMethods.push(options.method);
      return {ok:true,json:async()=>({id:'invalid-user-id'})};
    };
    const app=express();
    app.use(express.json());
    app.use('/api/admin/staff',staffRoutes({
      pool:{connect:async()=>{databaseCalls++;throw new Error('Unexpected database access');}},
      requireOwner:(req,_res,next)=>{req.owner={id:'00000000-0000-4000-8000-000000000002'};next();}
    }));
    app.use((_err,_req,res,_next)=>res.status(503).json({error:'Provisioning could not be confirmed.'}));
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await originalFetch('http://127.0.0.1:'+server.address().port+'/api/admin/staff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'staff@example.com',fullName:'Test Employee',role:'sales'})
    });
    assert.equal(response.status,503);
    assert.equal((await response.json()).temporaryPassword,undefined);
    assert.equal(databaseCalls,0);
    assert.deepEqual(providerMethods,['POST','DELETE']);
  } finally {
    if(server) await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    globalThis.fetch=originalFetch;
    for(const name of names){
      if(saved[name]===undefined) delete process.env[name];
      else process.env[name]=saved[name];
    }
  }
});
