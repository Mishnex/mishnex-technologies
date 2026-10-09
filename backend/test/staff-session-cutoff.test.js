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

test('rejects malformed JWT structures', () => {
  assert.equal(tokenIssuedAfterCutoff('', '1970-01-01T00:00:00Z'), false);
  assert.equal(tokenIssuedAfterCutoff('bad.token', '1970-01-01T00:00:00Z'), false);
  assert.equal(tokenIssuedAfterCutoff('header.!!.signature', '1970-01-01T00:00:00Z'), false);
});
test('rejects non-integer issued-at timestamps', () => {
  assert.equal(allowed('102', '1970-01-01T00:01:41.500Z'), false);
  assert.equal(allowed(102.5, '1970-01-01T00:01:41.500Z'), false);
});
test('rejects a token issued exactly at logout cutoff', () => {
  assert.equal(allowed(200, '1970-01-01T00:03:20.000Z'), false);
  assert.equal(allowed(201, '1970-01-01T00:03:20.000Z'), true);
});

test('rejects JWTs without all three nonempty segments', () => {
  const payload = Buffer.from(JSON.stringify({ iat: 102 })).toString('base64url');
  const cutoff = '1970-01-01T00:01:41.500Z';
  assert.equal(tokenIssuedAfterCutoff('header.' + payload, cutoff), false);
  assert.equal(tokenIssuedAfterCutoff('header.' + payload + '.', cutoff), false);
  assert.equal(tokenIssuedAfterCutoff('.' + payload + '.signature', cutoff), false);
  assert.equal(tokenIssuedAfterCutoff(null, cutoff), false);
});

test('rejects JWT payload segments with non-base64url characters', () => {
  const cutoff = '1970-01-01T00:01:41.500Z';
  assert.equal(tokenIssuedAfterCutoff('header.ab+c.signature', cutoff), false);
  assert.equal(tokenIssuedAfterCutoff('header.ab=c.signature', cutoff), false);
  assert.equal(tokenIssuedAfterCutoff('header.ab/c.signature', cutoff), false);
});

test('JWT issued-at rejects boolean and negative values', () => {
  assert.equal(allowed(true, '1970-01-01T00:00:00Z'), false);
  assert.equal(allowed(-1, '1970-01-01T00:00:00Z'), false);
});

test('rejects JWT issued-at values beyond safe integer precision', () => {
  assert.equal(allowed(Number.MAX_SAFE_INTEGER + 1, '1970-01-01T00:00:00Z'), false);
  assert.equal(allowed(Number.MAX_SAFE_INTEGER, '1970-01-01T00:00:00Z'), true);
});
