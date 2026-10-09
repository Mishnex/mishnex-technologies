import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('staff routes use only the shared permission policy', () => {
  const source = readFileSync(new URL('../src/staff.js', import.meta.url), 'utf8');
  assert.match(source, /permissionsFor as sharedPermissionsFor/);
  assert.match(source, /sharedPermissionsFor\(staff\)/);
  assert.doesNotMatch(source, /const rolePermissions\s*=/);
  assert.doesNotMatch(source, /function permissionsFor\(/);
});
