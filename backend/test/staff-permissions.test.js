import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionsFor } from '../src/staff-permissions.js';

const active = role => ({ role, is_active: true, must_change_password: false });

test('sales can read leads but cannot manage them', () => {
  assert.equal(permissionsFor(active('sales')).includes('leads:read'), true);
  assert.equal(permissionsFor(active('sales')).includes('leads:manage'), false);
});

test('developer and accountant cannot read leads', () => {
  for (const role of ['developer', 'accountant']) {
    assert.equal(permissionsFor(active(role)).includes('leads:read'), false);
  }
});

test('manager and super admin can read leads', () => {
  for (const role of ['manager', 'super_admin']) {
    assert.equal(permissionsFor(active(role)).includes('leads:read'), true);
  }
});

test('disabled and first-login staff have no permissions', () => {
  assert.deepEqual(permissionsFor({ ...active('manager'), is_active: false }), []);
  assert.deepEqual(permissionsFor({ ...active('super_admin'), must_change_password: true }), []);
});

test('unknown roles and missing staff fail closed', () => {
  assert.deepEqual(permissionsFor(active('unknown')), []);
  assert.deepEqual(permissionsFor(null), []);
});
