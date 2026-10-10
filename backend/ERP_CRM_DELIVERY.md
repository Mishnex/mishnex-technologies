# Mishnex ERP/CRM delivery — 10 October 2026

## Current status

Feature implementation is saved on `development/erp-payment-workflows`, draft PR #2. Main and production feature switches are unchanged. Login parsing/CSP repairs are already deployed; the complete feature branch is not yet deployed. The existing Render staging service still points to `development/admin-crm-foundation`. The Render connector supports triggering deploys and merging environment variables but cannot change an existing service branch. Deployment requires the Dashboard branch setting to be changed to the prepared feature branch.

## Implemented

- Individual staff credentials, Owner-only provisioning/deactivation, first-login password change and live role/session checks. Database caps retain five active Super Admin accounts and five active Super Admin sessions. Enabled staff sign-in leads to the shared role-specific workspace.
- Leads/history, client conversion, projects/tasks, HR employees/attendance/leave, invoices, reports and website CMS. Developers only access assigned work. Owner controls account lifecycle; permitted roles access their modules.
- Client quotations capture contact name/email/phone and up to 50 product/service lines with price and integer quantity. Server-calculated cents determine subtotal, discount and total. Below-floor/discounted quotations require Owner approval.
- Sales can copy private quotation links or open WhatsApp/email compose links. Tokens are hashes in the database and URL fragments in the browser; only that quotation's data/payment history is available. Links expire after 30 days and can be rotated/revoked.
- Both supplied UPI IDs and receiver name are staging runtime settings. Customer selects account and part/full INR amount. Locally generated QR and UPI app link encode the same recipient and amount; no external QR provider receives them.
- Owner and explicitly delegated active Super Admins control default advance percentage and quotation-specific percentage/fixed amount. Sales/HR/Accountant/Manager/Developer cannot change terms. Customers cannot bypass the saved minimum advance through the API. Full remaining payment is allowed. Terms cannot change after payment submissions start. Changes include actor, role, previous/new terms, timestamp and reason in Owner-readable audit.
- Quotation acceptance from a private link or signed-in client portal atomically prepares one matching invoice. Client memberships constrain all portal quotation, project, invoice, payment and receipt access.
- Owner creates/links client portal logins by email, removing the need to type Auth UUIDs. New logins get one-time temporary credentials and must change their password before portal data is available. Existing account passwords are preserved. Ambiguous commits require reconciliation rather than destructive Auth cleanup.
- Payment references remain pending until manual bank verification. Only Owner/delegated Super Admin approves/rejects/reopens. Delays do not reject. Rejected payments can be reviewed and approved later. Decisions atomically update ledger/balance/audit; repeat approvals and cross-invoice reuse of the same bank reference cannot double-credit.
- Customer acknowledgement shows reported amount/reference, total, verified paid and remaining balance. Expected balance after pending approval is clearly labelled. Refresh shows confirmed status only after approval. Approved receipt details are available in the authenticated portal.
- Shared original logo and website orange/cream theme cover Owner/staff/client panels, recovery, quotation/payment links and quotation Print / Save PDF. Public brand routes expose only the exact logo and CSS.

## Verification

- 198 automated Node tests pass: role/delegation restrictions, invoice and client isolation, first-password-change/session cutoff, pricing/precision, locked advance changes, rollback/ambiguous commit, duplicate bank reference, quote-link privacy and local QR recipient/amount.
- DOM smoke checks pass for itemized totals, part/full payment, pending-to-confirmed balance display, Owner fixed/default advance controls and safe text/private token use. These are mocked API checks, not live Auth or browser acceptance.
- Local HTTP server returns 200 for all six hosted pages, health, brand CSS and byte-identical original company logo. Scripts parse and their CSP hashes are valid.
- Real staging rollback tests pass for payments/receipts, itemized quotations, fixed advances/audit/first-password-change defaults, five active Super Admin account/session limits, revoked-session capacity and disabled-session denial. Fixture changes were rolled back. These database checks do not replace parallel real-browser login testing.
- Staging additive SQL 002–009 is applied. New tables have RLS enabled and no direct anon/authenticated grants. The internal `rls_auto_enable()` event trigger retains its behavior but public execution has been revoked and verified.

## Concrete staging deployment

1. In https://dashboard.render.com/web/srv-db4vrb0473hc739bknmg change Branch to `development/erp-payment-workflows`. Keep auto-deploy off. Do not merge PR #2 into the base branch: the other API service auto-deploys that base and uses a different database.
2. Keep the existing staging DATABASE_URL, Supabase keys, OWNER_USER_ID and TLS settings. On staging only enable STAFF_MANAGEMENT_ENABLED, STAFF_CRM_ENABLED, LEAD_WORKFLOW_ENABLED, CLIENT_MANAGEMENT_ENABLED and PAYMENT_REVIEW_ENABLED after confirming the staging Supabase reference `svhdqexfcyvqnpxuszim`.
3. Deploy the exact tested feature commit and check health, pages, logo/CSS, schema, Owner sign-in and role-specific requests.
4. Use Owner-created disposable staging accounts for Sales/HR/Accountant/Developer/delegated and non-delegated Super Admin plus two distinct clients. Exercise creation, quote acceptance, advance control, denied access, UPI handoff/QR, pending submission, bank review, re-review, balance and receipt isolation. Run five parallel Super Admin sign-ins and deny the sixth.
5. Real mobile UPI handoff and actual bank receipt verification are required; opening an app, scanning a QR or submitting a reference is not proof of bank credit. No payment transfer was performed during automated checks.

## Production release

Production deployment, schema and feature enablement still require the previously specified Owner approval. Retain a database backup, precheck duplicate bank references, review ordered additive migrations, verify the Owner recovery redirect allowlist and validate TLS. Existing staff/Auth/session foundation must exist before ERP migrations. Supabase leaked-password protection remains disabled and needs review before production acceptance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Server-only tables intentionally have no public RLS policies.

This is completed, tested feature code and staging database preparation. It is not a claim of completed live deployment or real-account/mobile acceptance.
