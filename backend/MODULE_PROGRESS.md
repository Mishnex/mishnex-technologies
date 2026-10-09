# ERP/CRM implementation and release checklist

**Working branch:** `development/admin-crm-foundation`. Never merge or modify `main` without explicit Owner approval.

## Module 1 — Login, staff and access control

Implemented in development:
- [x] Owner-only staff provisioning, password reset and deactivation endpoints
- [x] Staff authentication, first-login password-change flow and session cutoff logic
- [x] Role/permission policy and feature-gated staff lead access
- [x] Mocked HTTP/security tests and staging safety guard scripts

**Outstanding — do not claim 100% until verified:**
- [ ] Run real isolated Supabase Auth + PostgreSQL integration tests (not just mocks)
- [ ] Test five concurrent Super Admin sessions and concurrent account provisioning under real transactions
- [ ] Verify role restrictions, deactivation, logout and password reset against real JWTs
- [ ] Reconcile ambiguous Auth/DB employee creation outcomes; never blindly delete an Auth user when DB COMMIT may have succeeded
- [ ] Validate Owner recovery path, audit trail and rate limits end-to-end
- [ ] Complete security review, rollback rehearsal and Owner acceptance before enabling staff flags

**Production switches:** `STAFF_MANAGEMENT_ENABLED` and `STAFF_CRM_ENABLED` remain OFF.

## Module 2 — Leads and clients

Implemented in development:
- [x] Shared lead status validation and allowed transitions, preserving legacy `closed`
- [x] Draft lead activity migration (NOT applied to production)
- [x] Owner-only status update endpoint using row lock, transaction and activity insert
- [x] Owner-only activity history endpoint with existence check and 100-row limit
- [x] Feature-gated HTTP tests for update, history, authorization and rollback
- [x] Owner lead list includes status and supports validated status filtering

**Outstanding:**
- [ ] Review migration against all existing lead statuses and data, then test on isolated staging
- [ ] Real PostgreSQL transaction and concurrent-update tests
- [ ] Connect Owner dashboard to lead status and follow-up history endpoints
- [ ] Add lead assignment, filtering and client conversion design and implementation
- [ ] Implement client management and tests, including permissions and audit requirements
- [ ] Owner acceptance and rollback plan before enabling `LEAD_WORKFLOW_ENABLED`

**Production switch:** `LEAD_WORKFLOW_ENABLED` remains OFF; do not apply the migration to production without explicit approval.

## Release gate

- [ ] CI passes on intended development commit
- [ ] Isolated staging end-to-end tests pass
- [ ] Production migrations reviewed, backup/rollback verified
- [ ] Owner explicitly approves production rollout
- [ ] Verify live site and security after deployment

Percentages discussed previously are planning estimates, **not** evidence of completed integration tests.
