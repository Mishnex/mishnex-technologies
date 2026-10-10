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

## Itemized quotation update — 10 October 2026

The quotation screen now captures client name/email/phone, an existing or new client, and up to 50 product/service lines with unit price and integer quantity. The browser previews totals; the server calculates and stores subtotal, discount and final total in integer paisa/cents. Client contact and 30%-default advance policy are saved with the quotation.

Sales can create normal quotations and request Owner approval for discounted/below-floor drafts. Approved/sent quotations can generate a private 30-day link, copied or shared through user-operated WhatsApp/email compose links. Token secrets appear only in the URL fragment and request headers; the database stores hashes. New links revoke previous links, and the creating salesman or Owner can disable them.

The shared quotation page shows all items and client details, print/PDF option, verified payments and remaining balance. It offers default advance/custom part payment and full remaining payment, plus a UPI app link for INR quotations. Customers explicitly accept the quotation and submit the bank reference. No customer panel account is required for this specific quotation link. It does not grant access to other client records. The authenticated client portal also displays its own itemized quotations after Owner membership assignment.

Payment review remains manual. Shared-link submissions have no signed-in user ID and are audited as `client_link`; a database constraint still requires an authenticated actor for approval/rejection/reopening. A locked quotation binds acceptance to one matching invoice. Itemized quotation financial data is immutable; revisions require a new quotation.

Validation: 170 Node tests pass. DOM checks exercised a 2 × 15000 + 3 × 1000 = 33000 quotation, client fields, 30% advance, full balance and custom part-payment selection, and safe text rendering. The additive `sql/004_itemized_quotations.sql` schema was applied to isolated staging only. A real PostgreSQL rollback check validated saved line totals, private link expiry and denial of anonymous payment decisions. Full real-browser/Auth acceptance and feature deployment remain outstanding.

## Multiple receiving UPI accounts

Owner policy now supports primary and secondary receiving UPI IDs plus receiver name. The quotation page and signed-in client portal let customers select the account and part/full INR amount. The Pay via UPI link and locally generated QR encode the same selected account and amount; no external QR service receives these details. QR generation accepts only configured receiving accounts, validates amount precision and applies rate limits. Changing recipient/amount does not create or confirm a payment. Existing manual bank review, audit, pending status and client isolation remain required.

Apply `backend/sql/005_multiple_upi_options.sql` before deploying this version. Both customer-provided receiving IDs and receiver name have been configured only in the staging policy; these are runtime Owner settings, not hardcoded in source. Production deployment/configuration and real mobile UPI payment testing remain outstanding.
