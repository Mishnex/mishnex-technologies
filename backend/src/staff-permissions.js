export const rolePermissions = Object.freeze({
  super_admin: Object.freeze(['leads:read','leads:manage','quotations:read','quotations:manage','projects:read','projects:manage','payments:read','reports:read']),
  manager: Object.freeze(['leads:read','leads:manage','quotations:read','quotations:manage','projects:read','projects:manage','reports:read']),
  sales: Object.freeze(['leads:read','quotations:read']),
  developer: Object.freeze(['projects:read']),
  accountant: Object.freeze(['payments:read','reports:read'])
});
export function permissionsFor(staff) {
  if (!staff || !staff.is_active || staff.must_change_password) return [];
  return rolePermissions[staff.role] || [];
}
