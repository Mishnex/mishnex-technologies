import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStagingTarget } from '../test-support/staging-guard.js';

const valid = () => ({
  CRM_TEST_TARGET: 'isolated-staging',
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
