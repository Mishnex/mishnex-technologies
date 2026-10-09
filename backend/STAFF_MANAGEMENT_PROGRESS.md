# Manual staff accounts — implementation status

Database migration `crm_staff_accounts_and_audit_foundation` applied to Supabase project `mishnex-crm`.

## Implemented
- `public.crm_staff` with role, active flag, password-change requirement and creator.
- `public.crm_staff_audit` append-only-intended event schema.
- Transaction-serialized database trigger limiting active Super Admin **accounts** to 5.
- RLS enabled and direct anon/authenticated table privileges revoked.

## Not implemented yet
- Owner-authorized server endpoints for creating staff via Supabase Auth Admin API.
- Authorized Super Admin delegation, role authorization, staff password resets and session revocation.
- First-login mandatory password change enforcement, account disable, audit write logic.
- 5 simultaneous Super Admin **sessions** limit (distinct from account limit).
- Admin UI for staff management.

## Requirements before API activation
- Configure `SUPABASE_SERVICE_ROLE_KEY` as a **secret Render environment variable**, never commit it, return it to the browser, or put it in frontend assets.
- Establish a working Owner login before allowing provisioning.
- Implement API authentication and authorization server-side and use service role only server-side.
- Enforce session revocation and atomic concurrent session limits before granting staff access.
- Design safe one-time temporary credential delivery without email; do not persist plaintext passwords.
- Ensure the backend DB TLS certificate chain is verified (DATABASE_CA_CERT currently unconfirmed).

**Website/main branch untouched.**