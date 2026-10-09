// Reject production-looking targets before any real staff integration tests.
// This check is intentionally conservative and requires explicit staging identifiers.
export function assertStagingTarget(env) {
  if (env.CRM_TEST_TARGET !== 'isolated-staging') throw new Error('Isolated staging target required');
  if (env.STAFF_CRM_ENABLED === 'true') throw new Error('CRM data access must remain disabled');
  if (!env.SUPABASE_URL || !env.DATABASE_URL) throw new Error('Staging database and Auth URLs required');
  const auth = new URL(env.SUPABASE_URL);
  const database = new URL(env.DATABASE_URL);
  if (auth.protocol !== 'https:' || database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') {
    throw new Error('Expected HTTPS Auth and PostgreSQL connection');
  }
  if (auth.hostname === 'wgvqbxgeezrurvnownsd.supabase.co') throw new Error('Production Supabase project forbidden');
  if (env.STAGING_SUPABASE_PROJECT_ID && !auth.hostname.startsWith(env.STAGING_SUPABASE_PROJECT_ID + '.')) {
    throw new Error('Staging Supabase project mismatch');
  }
  if (!env.STAGING_SUPABASE_PROJECT_ID) throw new Error('Explicit staging Supabase project ID required');
  if (env.STAGING_ENVIRONMENT_NAME !== 'mishnex-crm-isolated-test') {
    throw new Error('Explicit isolated staging environment identity required');
  }
  if (!env.STAGING_DATABASE_HOST || database.hostname !== env.STAGING_DATABASE_HOST) {
    throw new Error('Explicit staging database host mismatch');
  }
  return true;
}
