import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { loginRateLimits } from '../src/login-rate-limit.js';

test('office users have independent failure budgets, normalized email cannot bypass limit', async t => {
  const app = express(); app.use(express.json());
  app.post('/login', loginRateLimits(), (req, res) => res.sendStatus(req.body.valid ? 200 : 401));
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const login = (email, valid = false) => fetch(`http://127.0.0.1:${server.address().port}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({email, valid})
  });
  for (let i = 0; i < 5; i++) assert.equal((await login('a@example.test')).status, 401);
  assert.equal((await login(' A@EXAMPLE.TEST ')).status, 429);
  assert.equal((await login('b@example.test')).status, 401);
  for (let i = 0; i < 6; i++) assert.equal((await login('c@example.test', true)).status, 200);
});

test('IP budget limits spraying many different email addresses', async t => {
  const app = express(); app.use(express.json());
  app.post('/login', loginRateLimits(), (_req, res) => res.sendStatus(401));
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  for (let i = 0; i < 61; i++) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({email:`user${i}@example.test`})
    });
    assert.equal(response.status, i < 60 ? 401 : 429);
  }
});
