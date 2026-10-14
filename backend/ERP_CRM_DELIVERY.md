# Mishnex CRM release status — 11 October 2026

The CRM/ERP release is deployed to production at https://mishnex-crm-api.onrender.com. PR #2 merged to development/admin-crm-foundation as 0623e22b70875a9416a115e7795ee7084444c9f0; Render deployment dep-db5mv0ng0jfs73bh2qmg is live. Main has not changed. Email delivery and real multi-role/customer Auth acceptance remain unverified; this is a production deployment, not a claim that every external integration has passed acceptance.

## Delivered

- Owner/staff login, temporary-password change, live account/session checks, role permissions, five active Super Admin account/session limits, staff provisioning and deactivation.
- Leads and follow-up history; won-lead conversion; client records and Owner-created customer login accounts. Owner/employee identities cannot be linked as customers, including legacy access-link endpoints.
- HR profiles, attendance and leave; projects, assigned tasks, website content and reports.
- Itemized quotations with customer contact details, quantities, prices, server-calculated totals and pricing approval. Rotating/expiring private quotation links and quotation print/PDF layout.
- Owner and delegated Super Admin advance controls; branded part/full UPI checkout; reference submission; manual bank review; audited ledger, receipts and remaining balance. Bank references do not automatically confirm credit.
- Unique role IDs and header identity; employee call/work tracking; Owner/Super Admin employee and client directories with ID search, related records and invoice-based financial summaries.
- Optional client/company GSTIN, audited invoice billing/cost corrections, customer-isolated invoice PDFs with orange company logo and embedded fonts. Recorded margin excludes unknown costs and does not represent net profit.
- Independent login failure budgets for colleagues/customers sharing an internet connection, plus an IP-wide spraying limit. Database readiness endpoint and graceful service shutdown. CI installs the lockfile and checks migration integrity.

## Added enquiry, lead and approval workflow

- Payment review searches quotation ID, requires bank verification remarks and validates the selected approving role against the signed-in account. Existing Owner delegation is still required for Super Admin approval. Audit records snapshot approver name, employee ID, quotation ID and date/time; they are retained indefinitely (at least three months), without automatic deletion of financial evidence.
- Approved payments set booking confirmation. Create a project with its accepted quotation and matching client; marking all associated projects completed displays Project completed in the private quotation and customer portal. Existing unlinked projects do not infer a quotation from client name.
- Website enquiries and manual contact pools are Owner/Super Admin-only. The Manual lead entry page has client name, phone, email and location fields. Sales generation draws only from this manual pool. Manual entry has no record-count quota or 100-row form cap. Large saves use small sequential requests to fit the API payload budget; confirmed rows are removed from the form, while unsaved rows remain after a failure. Repeated saves support additional contacts; removal is soft and preserves assignment/call history. Each staff member may generate one contact, close it with remarks, then generate another. Database row locks and unique constraints prevent duplicate assignment and simultaneous open leads for the same actor.
- Performance has India-time daily/weekly/monthly/custom filters, generated leads, reported calls and conversions, quotation creator/time and invoice contribution by currency. Financial periods select invoice creation dates; verified paid is the current balance for those invoices. Recorded margin excludes invoices with missing costs; it is not net profit.
- New website enquiries enqueue an email atomically with contact storage. SMTP delivery retries in the background; the company recipient defaults to info@mishnex.com. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM privately on Render. Without configuration, email stays queued and the enquiry page says so. Email delivery must be verified before production launch; database capture alone is not email delivery.

## Evidence

- 285 automated tests pass locally (lead pool and payment review additions). GitHub CI #524 passed on release-hardening commit `01f20b79f813640d84a7d0ee31ba05c8f26acc77`; the embedded-font/release-document commit is checked independently in the linked PR checks.
- Real staging Owner login succeeded. Employee directory opened an existing Sales employee's complete record.
- Real Owner browser created a disposable two-item quotation: 2 × INR 100 plus 3 × INR 50 = INR 350. Private sharing and Owner fixed INR 100 advance succeeded.
- Private checkout created one issued invoice without crediting money. Full payment selected INR 350; part payment selected INR 100. A explicitly simulated QA reference produced pending confirmation: reported INR 100, verified paid INR 0, remaining INR 350, expected after approval INR 250.
- Actual staging invoice PDF endpoint returned a one-page A4 document. Visual review found font substitution spacing problems; fonts are now embedded and the corrected document was rendered and inspected. Automated PDF tests verify embedded fonts and Unicode mappings, including 50-item documents.
- Disposable customer, quotation, invoice, pending reference and associated test audit/work rows were removed after checks. No bank transfer or real payment approval occurred.
- Earlier real staging SQL rollback tests passed transaction/cap/advance/financial isolation checks; 26 record queries passed against actual schema. These are distinct from real multi-role Auth acceptance.
- A disposable eight-account real-Auth acceptance setup was created in isolated staging. Automatic approval review rejected executing the acceptance script because new staff/Super Admin access, password changes and test side effects need specific authorization. All six test staff accounts are disabled, all eight Auth logins are banned, and local credentials were removed. Full removal encountered an expired connector approval state; the disabled fixtures remain for explicit approved cleanup. No execution of the rejected test script or workaround is claimed.
- `/ready` returned HTTP 200 with `status: ready` on the hardening release. Unauthenticated protected endpoints deny access.

## Remaining external configuration and acceptance

1. Complete real multi-role Auth acceptance: temporary-password change, Sales/HR/Developer/Accountant and delegated/non-delegated Super Admin restrictions, two customer identities and cross-customer isolation, five parallel Super Admin sessions and sixth denial, disable/reset/logout with actual JWTs. Automated and SQL tests cover these policies but do not replace this live acceptance.
2. Create/link the intended real customer's portal account using the Owner provisioning flow. The supplied `vishalmishravishal5918@gmail.com` has no staging Auth account or client record. Do not link the distinct Owner account `vishlamishravishal5918@gmail.com` as a client.
3. Verify real mobile UPI handoff and a bank-received payment before approving it. Direct UPI has manual confirmation, not merchant webhooks, card or netbanking processing.
4. Configure SMTP privately and verify delivery to the company mailbox. Production database/application rollout below is completed; email delivery is still unverified.

## Completed production rollout

- Verified the production foundation and zero rows in all four original CRM tables. Existing Auth accounts and credentials were preserved; no temporary accounts or passwords were created or changed in production.
- Captured a private logical CRM snapshot in crm_launch_snapshot_20261011: baseline column/constraint/function metadata and four original CRM tables. All snapshot tables have RLS and no public/anon/authenticated privileges. This is an in-database CRM rollback snapshot, not a complete/offsite backup of Supabase Auth or the project.
- Verified release-manifest.json integrity and applied all 23 ordered migrations once to production project wgvqbxgeezrurvnownsd, retaining Supabase migration history. Production now has 27 private CRM tables; RLS and absent public SELECT privileges verified.
- Configured primary UPI vishalmishravishal560-1@okhdfcbank, secondary 8235911701@ptyes, receiver VISHAL KUMAR and default 30% advance. Owner/delegated Super Admin can change advance requirements through the panel.
- Merged environment updates enable all five workspace/client/lead/payment feature flags while preserving existing server secrets and TLS settings. Company enquiry recipient is info@mishnex.com. SMTP credentials have not been supplied by the user or independently verified; delivery remains an external requirement.
- PR #2 merged after CI #532 and 282 passing automated tests. Production release auto-deployed; previous application commit was 63ac265ddad50e5c2c0117677444e99f5a7c9754. Keep additive schema and financial records if application rollback is ever required.
- Production smoke checks exposed a missing trusted database CA. Configured the Supabase Root 2021 CA and retained certificate/hostname verification. Production connection-string SSL parameters are removed before pg initialization so they cannot override the explicit trusted TLS configuration.
- Added nonsecret startup diagnostics for Owner login/account-provisioning/email configuration and feature flags. The logs contain booleans only, never credential values.
- Security advisors show intentional RLS-without-public-policies notices and the pre-existing leaked-password protection warning. Server-only tables are intentionally inaccessible through the public Data API. Auth hardening guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Live entry points

- Owner / employee panel: https://mishnex-crm-api.onrender.com/admin-panel
- Customer portal: https://mishnex-crm-api.onrender.com/client-portal
- Readiness: https://mishnex-crm-api.onrender.com/ready
- Configure SMTP privately: https://dashboard.render.com/web/srv-db4dqunlot8c738m48v0/environment

Do not claim real bank confirmation from a submitted reference. Do not claim completed live employee/customer authorization acceptance: the prior temporary-account test execution was rejected by automatic approval review, and no workaround was run. New customer login accounts must be provisioned by the Owner through the reviewed panel flow.
