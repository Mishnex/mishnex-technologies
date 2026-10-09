import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStagingTarget } from '../test-support/staging-guard.js';

const valid = () => ({
  CRM_TEST_TARGET: 'isolated-staging',
  STAGING_ENVIRONMENT_NAME: 'mishnex-crm-isolated-test',
  STAFF_CRM_ENABLED: 'false',
  SUPABASE_URL: 'https://stagingproject.supabase.co',
  DATABASE_URL: 'postgresql://test:password@staging-db.example.com:5432/test',
  STAGING_SUPABASE_PROJECT_ID: 'stagingproject',
  STAGING_DATABASE_HOST: 'staging-db.example.com'
});

test('accepts explicitly identified isolated staging', () => {
  assert.equal(assertStagingTarget(valid()), true);
});

test('rejects production Supabase project', () => {
  assert.throws(() => assertStagingTarget({
    ...valid(), SUPABASE_URL: 'https://wgvqbxgeezrurvnownsd.supabase.co',
    STAGING_SUPABASE_PROJECT_ID: 'wgvqbxgeezrurvnownsd'
  }));
});

test('rejects enabled CRM data and missing staging markers', () => {
  assert.throws(() => assertStagingTarget({ ...valid(), STAFF_CRM_ENABLED: 'true' }));
  assert.throws(() => assertStagingTarget({ ...valid(), CRM_TEST_TARGET: '' }));
  assert.throws(() => assertStagingTarget({ ...valid(), STAGING_DATABASE_HOST: '' }));
});

test('rejects database hostname mismatch', () => {
  assert.throws(() => assertStagingTarget({ ...valid(), DATABASE_URL: 'postgresql://test:password@other.example.com:5432/test' }));
});

test('rejects mismatched staging Auth project and insecure protocols', () => {
  assert.throws(() => assertStagingTarget({
    ...valid(), STAGING_SUPABASE_PROJECT_ID: 'differentproject'
  }));
  assert.throws(() => assertStagingTarget({
    ...valid(), SUPABASE_URL: 'http://stagingproject.supabase.co'
  }));
  assert.throws(() => assertStagingTarget({
    ...valid(), DATABASE_URL: 'https://staging-db.example.com/test'
  }));
});

test('rejects malformed staging URLs before any connection', () => {
  assert.throws(() => assertStagingTarget({ ...valid(), SUPABASE_URL: 'not-a-url' }));
  assert.throws(() => assertStagingTarget({ ...valid(), DATABASE_URL: 'not-a-url' }));
});
