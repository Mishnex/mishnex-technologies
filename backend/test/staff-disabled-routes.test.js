import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { staffRoutes } from '../src/staff.js';

test('staff CRM and login endpoints stay disabled by default', async () => {
  const previousManagement = process.env.STAFF_MANAGEMENT_ENABLED;
  const previousCrm = process.env.STAFF_CRM_ENABLED;
  process.env.STAFF_MANAGEMENT_ENABLED = 'false';
  process.env.STAFF_CRM_ENABLED = 'false';
  const app = express();
  app.use(express.json());
  app.use('/api/admin/staff', staffRoutes({
    pool: { query: async () => { throw new Error('DB must not be accessed'); } },
    requireOwner: (_req, res) => res.sendStatus(403)
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const path of ['/leads', '/permissions/check/leads']) {
      const response = await fetch(base + '/api/admin/staff' + path);
      assert.equal(response.status, 503, path);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
    }
    const response = await fetch(base + '/api/admin/staff/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'not-a-real-password' })
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (previousManagement === undefined) delete process.env.STAFF_MANAGEMENT_ENABLED;
    else process.env.STAFF_MANAGEMENT_ENABLED = previousManagement;
    if (previousCrm === undefined) delete process.env.STAFF_CRM_ENABLED;
    else process.env.STAFF_CRM_ENABLED = previousCrm;
  }
});

test('CRM data stays blocked when account management is enabled', async () => {
  const previousManagement = process.env.STAFF_MANAGEMENT_ENABLED;
  const previousCrm = process.env.STAFF_CRM_ENABLED;
  process.env.STAFF_MANAGEMENT_ENABLED = 'true';
  process.env.STAFF_CRM_ENABLED = 'false';
  const app = express();
  app.use('/api/admin/staff', staffRoutes({
    pool: { query: async () => { throw new Error('DB must not be accessed'); } },
    requireOwner: (_req, res) => res.sendStatus(403)
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const path of ['/leads', '/permissions/check/leads']) {
      const response = await fetch(base + '/api/admin/staff' + path, {
        headers: { authorization: 'Bearer placeholder' }
      });
      assert.equal(response.status, 503, path);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (previousManagement === undefined) delete process.env.STAFF_MANAGEMENT_ENABLED;
    else process.env.STAFF_MANAGEMENT_ENABLED = previousManagement;
    if (previousCrm === undefined) delete process.env.STAFF_CRM_ENABLED;
    else process.env.STAFF_CRM_ENABLED = previousCrm;
  }
});

test('identity, logout, and password change stay unavailable when staff management is off', async () => {
  const previous = process.env.STAFF_MANAGEMENT_ENABLED;
  process.env.STAFF_MANAGEMENT_ENABLED = 'false';
  const app = express();
  app.use(express.json());
  app.use('/api/admin/staff', staffRoutes({
    pool: { query: async () => { throw new Error('DB must not be accessed'); } },
    requireOwner: (_req, res) => res.sendStatus(403)
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const routes = [
      { path: '/me', method: 'GET' },
      { path: '/logout', method: 'POST' },
      { path: '/change-password', method: 'POST' }
    ];
    for (const route of routes) {
      const response = await fetch(base + '/api/admin/staff' + route.path, {
        method: route.method, headers: { authorization: 'Bearer invalid' }
      });
      assert.equal(response.status, 503, route.path);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (previous === undefined) delete process.env.STAFF_MANAGEMENT_ENABLED;
    else process.env.STAFF_MANAGEMENT_ENABLED = previous;
  }
});
