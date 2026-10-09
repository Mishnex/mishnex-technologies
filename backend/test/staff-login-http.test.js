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
