# Mishnex ERP/CRM delivery — 10 October 2026

The existing project was continued. Main was not changed. Production feature switches were not enabled.

## Login repairs deployed separately

The hosted admin workspace contained an unescaped apostrophe in a JavaScript string. The browser could not parse any of the script, so login handlers never registered. This was reproduced against the original source and repaired on the existing development branch.

Staff login and Owner password recovery pages also inherited Helmet's default CSP, which blocked their inline scripts. They now use hashes of their exact scripts. Script execution remains restricted; script `unsafe-inline` was not enabled. All five hosted page scripts have a parsing/CSP regression check.

## Implemented development workflows

- Existing Owner/staff account creation, password reset/change, deactivation and five Super Admin account/session caps retained.
- Existing leads, status history, won-lead client conversion and Owner-controlled client portal memberships retained.
- Projects and tasks: create/update status, select clients and staff by name; developers read assigned projects/tasks and update only their own task status.
- Quotations: normal Sales quotations, per-currency minimum amounts, Owner approval before sending below-floor or discounted quotes.
- Invoices: match accepted quotations; issued financial fields cannot be edited or moved to another client. Paid status can only come from reviewed payments.
- Payment submission: a client submits a UPI reference against their own issued invoice. It remains pending until a bank transaction is manually verified.
- Review: Owner or explicitly delegated active Super Admin approves/rejects/reopens payments. Sales, HR and Accountant cannot decide payments. No delay-based rejection exists.
- Approval updates the payment ledger, invoice balance and actor/role/action/reason/time audit in one transaction. Repeated approvals do not credit again; uncertain COMMIT returns a reconciliation warning.
- Client portal: own quotations, projects, invoice totals, amount paid, remaining balance, submitted payment history and approved receipt details.
- Owner-only business policy: receiving UPI ID, advance percentage (default 30%), quotation minimums.
- Existing HR employee profiles, attendance, leave decisions and currency-separated reports retained. HR now uses the shared live staff/session checks and feature gates.

## Validation completed

- 146 Node tests pass, including authorization, client payment isolation, duplicate approval, rollback and ambiguous COMMIT cases.
- Admin login, eight module screens and sign-out passed a DOM smoke test with mocked API responses.
- New payment/policy schema applied only to `mishnex-crm-staging`.
- Real staging PostgreSQL transaction test inserted a test client, invoice, payment, ledger and audit, checked duplicate-reference rejection, remaining balance and receipt membership filtering, then rolled back all test records.
- RLS is enabled on all four new tables and anon/authenticated have no direct table grants. Access stays behind the server API.

## Required before releasing the new workflows

1. Deploy the feature branch to the existing staging service; do not merge it into an auto-deploying service until its database schema and feature gates are reviewed.
2. Apply `sql/002_payment_review.sql` and `sql/003_business_policy.sql` after the existing migrations. These are already present on isolated staging only.
3. Enable `PAYMENT_REVIEW_ENABLED=true` on staging; configure receiving UPI ID and quote floors in Owner settings. Keep production disabled until acceptance.
4. Test actual Owner, Sales, HR, Accountant, Developer, delegated and non-delegated Super Admin, and two separate clients with real Auth sessions. Recheck five concurrent accounts/sessions and deactivation with real concurrency.
5. Verify the Owner-email recovery configuration, database TLS certificate and all forms in a real browser. Headless Chromium download was blocked in this environment; DOM checks do not substitute for browser/layout or real Auth tests.
6. Obtain Owner production rollout approval, retain a database backup, review additive migrations and rehearse rollback before enabling production.

The staging advisor also reports pre-existing public execution grants on `rls_auto_enable()` and disabled leaked-password protection. These were not silently changed. Review them before production security sign-off. Intentional server-only RLS tables have no public policies.

This delivery is tested development code plus deployed login repairs. Full production/auth/browser acceptance is still outstanding; it is not a 100% production-ready claim.
