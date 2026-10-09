import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('connectivity script refuses missing staging configuration before network', () => {
  const env = { ...process.env };
  for (const key of [
    'CRM_TEST_TARGET', 'SUPABASE_URL', 'DATABASE_URL',
    'STAGING_SUPABASE_PROJECT_ID', 'STAGING_DATABASE_HOST',
    'STAGING_ENVIRONMENT_NAME'
  ]) delete env[key];
  const result = spawnSync(process.execPath, ['scripts/staging-connectivity.js'], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Staging connectivity check failed: Isolated staging target required/);
  assert.doesNotMatch(result.stdout, /reachable|verified/);
});
