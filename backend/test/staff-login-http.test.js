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
