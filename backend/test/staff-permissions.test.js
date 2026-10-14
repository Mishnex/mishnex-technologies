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

test('accountant can read payments but cannot manage projects', () => {
  assert.equal(permissionsFor(active('accountant')).includes('payments:read'), true);
  assert.equal(permissionsFor(active('accountant')).includes('projects:manage'), false);
});
test('developer can read projects but cannot manage payments', () => {
  assert.equal(permissionsFor(active('developer')).includes('projects:read'), true);
  assert.equal(permissionsFor(active('developer')).includes('payments:read'), false);
});
test('sales cannot manage quotations', () => {
  assert.equal(permissionsFor(active('sales')).includes('quotations:read'), true);
  assert.equal(permissionsFor(active('sales')).includes('quotations:manage'), false);
});
test('role permissions cannot be modified at runtime', async () => {
  const { rolePermissions } = await import('../src/staff-permissions.js');
  assert.equal(Object.isFrozen(rolePermissions), true);
  for (const grants of Object.values(rolePermissions)) assert.equal(Object.isFrozen(grants), true);
});
