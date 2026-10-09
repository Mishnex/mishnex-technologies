# Failed Employee Provisioning — Owner Recovery Runbook

This procedure is for authorized operators only. Do not enable staff feature flags to investigate provisioning failures.

## When to use
Employee creation returns a server error after Supabase Auth user creation. The database insert or audit write may have failed; the compensating Auth deletion may also have failed. An Auth-only (orphan) account can remain.

## Immediate precautions
1. Keep `STAFF_MANAGEMENT_ENABLED` and `STAFF_CRM_ENABLED` disabled until the incident is resolved and activation is explicitly approved.
2. Do not retry employee creation blindly: a prior Auth user may still exist and trigger a duplicate-email error.
3. Never put temporary passwords, service-role keys, access tokens, or full credentials in logs or support tickets.
4. Record incident time (UTC), affected email (restricted operator notes), endpoint, request status, and relevant server logs. Restrict access to incident records.

## Read-only reconciliation
1. With authorized Supabase dashboard access, search **Authentication > Users** for the intended email. Note the Auth user UUID and creation time.
2. In SQL editor, check the matching CRM row with a parameterized or safely quoted UUID (replace placeholder before execution):

```sql
select user_id, email, role, is_active, must_change_password, created_at
from public.crm_staff
where user_id = '<AUTH_USER_UUID>';
```

3. Inspect audit events for that UUID:

```sql
select action, actor_id, target_id, created_at
from public.crm_staff_audit
where target_id = '<AUTH_USER_UUID>'
order by created_at desc
limit 25;
```

4. Interpret carefully:
   - Auth user exists, no CRM row: likely orphan Auth account.
   - Both exist: do **not** delete automatically; inspect whether the transaction committed and whether an audit record exists.
   - Neither exists: provisioning likely rolled back and Auth cleanup succeeded.
   - Database unavailable: postpone conclusions until read-only reconciliation is possible.

## Recovery decision
- For a confirmed **Auth-only** user created by the failed attempt, an authorized operator may delete that specific user through Supabase Auth dashboard **after verifying the UUID, email and creation time**. Obtain Owner approval and document the action. Never bulk-delete users or delete based on email alone.
- If a CRM row exists or identity is ambiguous, stop and escalate for manual review; do not attempt to repair by creating a second Auth identity.
- After reconciliation, retry Owner-controlled provisioning only when the earlier identity is resolved. Confirm first-login password change and audit behavior in isolated staging before any live activation.

## Verification
- Re-check Auth user and CRM row states after the action.
- Confirm no unintended staff accounts were touched.
- Review logs for failed cleanup and database errors without exposing secrets.
- Keep production staff flags OFF pending separate real Auth/PostgreSQL integration, concurrency, and RBAC verification.

This runbook is documentation, not an automated recovery or a substitute for staging tests.
