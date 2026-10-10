# Mishnex ERP/CRM delivery — 10 October 2026

## Current status

Feature implementation is deployed on the isolated Render staging service from `development/erp-payment-workflows`, commit `1968433db0dad6408111f3d741b155dd3b2f4c46`. Deployment `dep-db58b4ng0jfs73b86480` is live. Auto-deploy remains off, the free plan remains unchanged, and staging Auth is confirmed as `svhdqexfcyvqnpxuszim`. The five staff, CRM, lead, client and payment-review feature flags are enabled on staging only. Main and production feature switches are unchanged. Draft PR #2 contains the implementation.

## Readable IDs and workspace update

Staging now includes SQL 010: stored unique client codes CL-000001, employee codes EMP-000001 and quotation codes QT-000001, using database identity allocation and generated columns. Existing UUIDs, relationships and email/password sign-in stay intact. Owner is identified as OWN-000001 for the configured single-Owner account. Header shows name, code and readable role; team/client lists, client account switcher, quotation links and printed PDFs display the corresponding codes. Six digits are a minimum, so large numbers are never truncated. Rollbacks may leave sequence gaps; codes are unique, not gapless.

Owner secure browser sign-in succeeded after corrected credentials; quotation and advance-control pages were inspected. The employee/client interface improvements are live; real employee/client end-to-end acceptance and actual bank transfers remain unverified.

## Employee activity tracking

Owner-only Employee activity reports accept a date range (India time, up to 366 days) and employee filter, including inactive employees. Summary includes reported call attempts, connected calls, call minutes, follow-up notes, quotations created/currently ready or accepted, lead updates, task updates/completions, projects and invoices created. Latest 200 detail events are shown; summary counts cover the full range. Employees with lead-read access can log calls/follow-ups against their own authenticated identity and see their own latest 100 logs. Request keys prevent retry double-counting; logs have server timestamps and no edit/delete endpoints. Dial links do not automatically count as completed phone calls.

Task/project/invoice mutations and work logs save in one transaction. Unchanged done-task saves do not inflate completions. Existing quotation creation and lead histories supply older records; other work tracking starts with this deployment. Tracking is for recorded CRM activity, not automatic phone/device monitoring or all historical employee work. Staging SQL 011 is applied with RLS and no direct public grants. 212 automated tests pass, plus Owner report DOM checks and real staging rollback assertion for India midnight boundaries. Production unchanged.

## Mishnex role prefixes

SQL 012 changes display codes to MISH-SL (Sales), MISH-SA (Super Admin), MISH-HR, MISH-DV (Developer), MISH-MG (Manager), MISH-AC (Accountant), MISH-CL (Client), MISH-QT (Quotation), and MISH-OWN-000001 (configured Owner). Numbers keep their existing allocation; UUID primary keys and email/password sign-in are unchanged. Employee prefixes are assigned at creation and remain stable even if the current role later changes; current role is shown separately in the header. A database trigger prevents identity-prefix/number changes. Existing staging records are reformatted without renumbering.

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

## Live staging verification and remaining acceptance

- Render Dashboard branch change and deployment are complete. Existing staging credentials and TLS configuration were preserved. Do not merge PR #2 into the base branch without the production release review: the other API service auto-deploys that base and uses production Supabase.
- Live HTTP checks passed: health, all six hosted pages, logo/CSS and both configured UPI SVG QR endpoints return 200. Unauthenticated payment review and advance controls return 401. Staff-login redirects into the employee workspace. Browser inspection confirms the live client portal logo and orange/cream theme.
- Owner secure browser sign-in succeeded with corrected credentials; dashboard, quotation form and advance controls were inspected. Successful client account assignment is not claimed. The supplied client email still requires verified Owner setup.
- Authenticated acceptance remains: Owner-created disposable Sales/HR/Accountant/Developer/delegated and non-delegated Super Admin accounts, two distinct clients, quote creation/acceptance, advance controls, denied access, payment submission/re-review and receipt isolation; five parallel Super Admin sign-ins and sixth-session denial.
- Real mobile UPI handoff and actual bank receipt verification remain required. Opening an app, scanning a QR or submitting a reference is not proof of bank credit. No payment transfer was performed during automated checks.

## Production release

Production deployment, schema and feature enablement still require the previously specified Owner approval. Retain a database backup, precheck duplicate bank references, review ordered additive migrations, verify the Owner recovery redirect allowlist and validate TLS. Existing staff/Auth/session foundation must exist before ERP migrations. Supabase leaked-password protection remains disabled and needs review before production acceptance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Server-only tables intentionally have no public RLS policies.

Feature code and staging deployment are complete. Authenticated real-account acceptance and real mobile/bank payment verification remain open.
