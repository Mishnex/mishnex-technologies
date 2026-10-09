import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff password update passes validated password string to Supabase Admin API', () => {
  const source = readFileSync(new URL('../src/staff.js', import.meta.url), 'utf8');
  assert.match(source, /adminApi\('users\/['"] \+ encodeURIComponent\(user\.id\), 'PUT', \{ password: parsed\.data\.newPassword \}\)/);
  assert.doesNotMatch(source, /adminApi\('users\/['"] \+ encodeURIComponent\(user\.id\), 'PUT', \{ password: parsed\.data \}\)/);
});
