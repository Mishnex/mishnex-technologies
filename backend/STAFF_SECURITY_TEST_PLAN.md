# Staff CRM security test plan

Run in a controlled staging environment with test accounts. Keep STAFF_MANAGEMENT_ENABLED disabled in production until all checks pass.

## Authentication
- [ ] Owner can provision staff with a one-time password; public registration is unavailable.
- [ ] Temporary-password account cannot read CRM leads until password is changed.
- [ ] Disabled staff cannot sign in or access existing endpoints.
- [ ] Password reset invalidates older access tokens, including same-second cutoff tokens.
- [ ] Password changes create a staff audit event without storing a plaintext password.
- [ ] Logout invalidates the provider refresh session; verify behavior with a fresh refresh attempt.
- [ ] Failed identity-provider logout does not return signedOut=true.

## Authorization
- [ ] Super Admin, Manager, and Sales can access the read-only staff leads endpoint after activation.
- [ ] Developer and Accountant receive HTTP 403 for staff leads.
- [ ] All staff roles are blocked from Owner-only staff provisioning and lead mutation.
- [ ] Staff leads endpoint returns only the permitted columns and at most 50 records.
- [ ] All staff routes fail closed while the feature flag is off.

## Super Admin concurrency
- [ ] At most five active Super Admin accounts can exist.
- [ ] At most five concurrent Super Admin sessions can register, including parallel login attempts.
- [ ] Revocation, expiry, password reset, and deactivation release session capacity correctly.

## Operational gates
- [ ] Confirm PostgreSQL TLS validation works on Render.
- [ ] Run npm test in backend and capture test output.
- [ ] Verify login, logout, and password-change API requests against Supabase test users.
- [ ] Confirm staff credentials and service-role secrets never appear in logs or frontend bundles.
- [ ] Keep the public website main branch unchanged.
