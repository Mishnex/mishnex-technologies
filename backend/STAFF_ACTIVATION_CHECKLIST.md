# Staff management activation checklist

Staff provisioning is disabled by default via STAFF_MANAGEMENT_ENABLED.

1. In Supabase Dashboard > Project Settings > API Keys, locate the **secret/service_role** key. Never paste it in chat, a GitHub file, or a browser script.
2. In Render > mishnex-crm-api > Environment, set SUPABASE_SERVICE_ROLE_KEY to that value (secret environment variable). Leave STAFF_MANAGEMENT_ENABLED unset or false.
3. Verify database TLS, Owner sign-in, and the staff database migration.
4. Implement and test mandatory first-login password change, session invalidation on reset, disabled-account enforcement, and staff role permissions.
5. Implement and test the five-active-Super-Admin-session cap (the existing DB trigger only limits active accounts).
6. Only after security tests pass, set STAFF_MANAGEMENT_ENABLED=true in Render.

Email invitations and paid SMTP are not required for manual staff provisioning. Temporary credentials must be shared through a secure channel. Do not store or log plaintext passwords.

Status: not ready for staff production use. No changes to the public website's main branch.
## Development status (2026-10-09)

- Added staff logout request to Supabase Auth and local Super Admin token-fingerprint revocation; integration tests still pending.
- Added role-gated staff Leads read endpoint and session-cap database function; not yet approved for production use.
- Confirm the Supabase logout scope and refresh-token behavior with real test accounts before enabling staff access.
- Verify database TLS, Owner authentication, staff account creation, password reset, logout, and role permissions end-to-end.
- Confirm the five-session cap under concurrent login attempts, logout, expiry, and account deactivation.
- Keep STAFF_MANAGEMENT_ENABLED=false until all checks pass; do not merge development into main.

## Independent CRM data access gate

`STAFF_CRM_ENABLED` defaults to disabled. Staff permission-protected CRM routes return HTTP 503 unless this flag is explicitly `true`, even if `STAFF_MANAGEMENT_ENABLED=true`. Keep **both flags disabled** in production until staff authentication, logout revocation, RBAC, and integration tests pass. Do not enable CRM data access merely to test account provisioning.
