import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('staging preflight fails closed with no staging configuration', () => {
  const env = { ...process.env };
  for (const key of [
    'CRM_TEST_TARGET', 'SUPABASE_URL', 'DATABASE_URL',
    'STAGING_SUPABASE_PROJECT_ID', 'STAGING_DATABASE_HOST'
  ]) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/staging-preflight.js'], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Staging preflight rejected:/);
  assert.doesNotMatch(result.stdout, /verified/);
});

test('staging preflight accepts matching isolated identifiers without network calls', () => {
  const env = {
    ...process.env,
    CRM_TEST_TARGET: 'isolated-staging',
    STAFF_CRM_ENABLED: 'false',
    SUPABASE_URL: 'https://stagingproject.supabase.co',
    DATABASE_URL: 'postgresql://test:password@staging-db.example.com:5432/test',
    STAGING_SUPABASE_PROJECT_ID: 'stagingproject',
    STAGING_DATABASE_HOST: 'staging-db.example.com'
  };
  const result = spawnSync(process.execPath, ['scripts/staging-preflight.js'], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No network requests or mutations performed/);
});
