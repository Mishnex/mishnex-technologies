import { assertStagingTarget } from '../test-support/staging-guard.js';
import pg from 'pg';

async function main() {
  assertStagingTarget(process.env);
  const authUrl = new URL('/auth/v1/health', process.env.SUPABASE_URL);
  const response = await fetch(authUrl, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Staging Supabase Auth health failed: HTTP ' + response.status);
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    ssl: { rejectUnauthorized: true }
  });
  try {
    await client.connect();
    const result = await client.query('select current_database() as database_name, current_user as database_user');
    console.log('Staging Auth reachable; PostgreSQL TLS connection verified.');
    console.log('Database:', result.rows[0]?.database_name);
  } finally {
    await client.end().catch(() => {});
  }
}
main().catch(error => {
  console.error('Staging connectivity check failed:', error.message);
  process.exitCode = 1;
});
