import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenIssuedAfterCutoff } from '../src/staff-session.js';
function allowed(iat, cutoff) {
  const payload = Buffer.from(JSON.stringify({ iat })).toString('base64url');
  return tokenIssuedAfterCutoff('header.' + payload + '.signature', cutoff);
}
test('rejects tokens issued before a revocation cutoff', () => {
  assert.equal(allowed(100, '1970-01-01T00:01:41.500Z'), false);
});
test('rejects tokens issued in the cutoff second', () => {
  assert.equal(allowed(101, '1970-01-01T00:01:41.500Z'), false);
});
test('accepts tokens issued in a later second', () => {
  assert.equal(allowed(102, '1970-01-01T00:01:41.500Z'), true);
});
test('fails closed on invalid timestamps and missing iat', () => {
  assert.equal(allowed(102, 'invalid'), false);
  assert.equal(allowed(undefined, '1970-01-01T00:01:41.500Z'), false);
});
