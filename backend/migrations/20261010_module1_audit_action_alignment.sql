-- Module 1: make audit action validation consistent with implemented staff routes.
-- Apply only after approval and a controlled migration review. Staging applied 2026-10-10.
-- Production is intentionally untouched.
BEGIN;
ALTER TABLE public.crm_staff_audit DROP CONSTRAINT IF EXISTS crm_staff_audit_action_check;
ALTER TABLE public.crm_staff_audit ADD CONSTRAINT crm_staff_audit_action_check
CHECK (action IN (
 'staff_created','staff_password_reset','staff_disabled','staff_deactivated',
 'staff_enabled','staff_role_changed','staff_password_change_started',
 'staff_password_changed','staff_logout'
));
COMMIT;
