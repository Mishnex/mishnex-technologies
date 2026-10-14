# Staff integration test staging checklist

**Production flags remain OFF.** Never run test-user provisioning or password changes against the production owner account.

## Isolated environment
1. Create a separate Supabase test project (Auth + PostgreSQL), using the same reviewed schema migrations.
2. Create a separate Render staging web service pointing at the development branch, with a staging-only database URL, Supabase URL and keys.
3. Keep `STAFF_CRM_ENABLED=false` throughout initial authentication testing.
4. Use disposable test email accounts and no real customer data. Do not copy production Auth users, CRM leads or secrets.
5. Ensure the database connection validates TLS certificates. Do not use `rejectUnauthorized:false`.
6. Restrict staging service access before enabling `STAFF_MANAGEMENT_ENABLED=true`.

## Required controlled scenarios
- Owner provisions one disposable Sales employee; generated temporary password shown only once.
- First login returns `mustChangePassword=true`; CRM routes remain inaccessible.
- Employee changes password, signs in again and confirms old access token rejected.
- Global logout revokes staff access tokens and refresh sessions.
- Disabled employee cannot sign in or access protected routes.
- Five concurrent Super Admin sessions succeed; a sixth is rejected, including simultaneous attempts.
- Sales can read but cannot manage leads; Developer and Accountant cannot read leads.
- Confirm audit rows for password changes, logout, provisioning, reset and deactivation.
- Verify Owner-only endpoints remain inaccessible to staff.

## Exit criteria
- Record redacted HTTP statuses, GitHub CI run, and PostgreSQL audit checks.
- No sensitive tokens, temporary passwords or service-role keys in logs.
- Investigate all failed scenarios; do not activate production flags until reviewed.
