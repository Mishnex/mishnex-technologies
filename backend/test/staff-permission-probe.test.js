import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('successful leads permission probe reports CRM access enabled', () => {
  const source = readFileSync(new URL('../src/staff.js', import.meta.url), 'utf8');
  const start = source.indexOf("router.get('/permissions/check/leads'");
  assert.notEqual(start, -1);
  const end = source.indexOf("router.get('/leads'", start);
  assert.notEqual(end, -1);
  const route = source.slice(start, end);
  assert.match(route, /requireStaffPermission\('leads:read'/);
  assert.match(route, /crmAccessEnabled:true/);
  assert.doesNotMatch(route, /crmAccessEnabled:false/);
});
