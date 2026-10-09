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