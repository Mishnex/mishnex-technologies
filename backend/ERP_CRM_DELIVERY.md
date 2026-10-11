# Mishnex CRM release status — 11 October 2026

The feature release is deployed to isolated staging. Production remains on its original CRM foundation; it does not contain the ERP/payment/client schema. Main has not changed. This document supersedes earlier estimates and completion claims.

## Delivered

- Owner/staff login, temporary-password change, live account/session checks, role permissions, five active Super Admin account/session limits, staff provisioning and deactivation.
- Leads and follow-up history; won-lead conversion; client records and Owner-created customer login accounts. Owner/employee identities cannot be linked as customers, including legacy access-link endpoints.
- HR profiles, attendance and leave; projects, assigned tasks, website content and reports.
- Itemized quotations with customer contact details, quantities, prices, server-calculated totals and pricing approval. Rotating/expiring private quotation links and quotation print/PDF layout.
- Owner and delegated Super Admin advance controls; branded part/full UPI checkout; reference submission; manual bank review; audited ledger, receipts and remaining balance. Bank references do not automatically confirm credit.
- Unique role IDs and header identity; employee call/work tracking; Owner/Super Admin employee and client directories with ID search, related records and invoice-based financial summaries.
- Optional client/company GSTIN, audited invoice billing/cost corrections, customer-isolated invoice PDFs with orange company logo and embedded fonts. Recorded margin excludes unknown costs and does not represent net profit.
- Independent login failure budgets for colleagues/customers sharing an internet connection, plus an IP-wide spraying limit. Database readiness endpoint and graceful service shutdown. CI installs the lockfile and checks migration integrity.

## Evidence

- 251 automated tests pass locally. GitHub CI #524 passed on release-hardening commit `01f20b79f813640d84a7d0ee31ba05c8f26acc77`; the embedded-font/release-document commit is checked independently in the linked PR checks.
- Real staging Owner login succeeded. Employee directory opened an existing Sales employee's complete record.
- Real Owner browser created a disposable two-item quotation: 2 × INR 100 plus 3 × INR 50 = INR 350. Private sharing and Owner fixed INR 100 advance succeeded.
- Private checkout created one issued invoice without crediting money. Full payment selected INR 350; part payment selected INR 100. A explicitly simulated QA reference produced pending confirmation: reported INR 100, verified paid INR 0, remaining INR 350, expected after approval INR 250.
- Actual staging invoice PDF endpoint returned a one-page A4 document. Visual review found font substitution spacing problems; fonts are now embedded and the corrected document was rendered and inspected. Automated PDF tests verify embedded fonts and Unicode mappings, including 50-item documents.
- Disposable customer, quotation, invoice, pending reference and associated test audit/work rows were removed after checks. No bank transfer or real payment approval occurred.
- Earlier real staging SQL rollback tests passed transaction/cap/advance/financial isolation checks; 26 record queries passed against actual schema. These are distinct from real multi-role Auth acceptance.
- A disposable eight-account real-Auth acceptance setup was created in isolated staging. Automatic approval review rejected executing the acceptance script because new staff/Super Admin access, password changes and test side effects need specific authorization. All six test staff accounts are disabled, all eight Auth logins are banned, and local credentials were removed. Full removal encountered an expired connector approval state; the disabled fixtures remain for explicit approved cleanup. No execution of the rejected test script or workaround is claimed.
- `/ready` returned HTTP 200 with `status: ready` on the hardening release. Unauthenticated protected endpoints deny access.

## Still required before claiming production launch

1. Complete real multi-role Auth acceptance: temporary-password change, Sales/HR/Developer/Accountant and delegated/non-delegated Super Admin restrictions, two customer identities and cross-customer isolation, five parallel Super Admin sessions and sixth denial, disable/reset/logout with actual JWTs. Automated and SQL tests cover these policies but do not replace this live acceptance.
2. Create/link the intended real customer's portal account using the Owner provisioning flow. The supplied `vishalmishravishal5918@gmail.com` has no staging Auth account or client record. Do not link the distinct Owner account `vishlamishravishal5918@gmail.com` as a client.
3. Verify real mobile UPI handoff and a bank-received payment before approving it. Direct UPI has manual confirmation, not merchant webhooks, card or netbanking processing.
4. Run the production rollout checklist below. Production rollout is not completed by a staging deploy.

## Production rollout

- Existing production foundation checked read-only: four CRM tables, required staff/session/password functions, zero CRM leads and zero CRM staff. Preserve existing Auth users and server credentials.
- Review `release-manifest.json`: 21 ordered migration files with SHA-256 hashes. Run `node backend/scripts/release-check.js` from the repo root. It checks integrity and performs no database writes.
- Take a database backup and record existing production deployment/configuration. Precheck all constraints, duplicate approved bank references if payment tables already exist, Owner identity and Auth recovery redirect allowlist.
- Apply the manifest migrations once, in order, to the production project; retain migration history. Do not re-run non-idempotent identity/GST migrations. No destructive down migration after accepting real financial data.
- Configure the already-authorized receiving UPI accounts and receiver name in business policy. Review quotation floors, default advance and GSTIN; GSTIN does not infer tax rates.
- Release PR #2 to its base branch only after schema/configuration are ready. That base auto-deploys production. Enable `STAFF_MANAGEMENT_ENABLED`, `STAFF_CRM_ENABLED`, `LEAD_WORKFLOW_ENABLED`, `CLIENT_MANAGEMENT_ENABLED`, and `PAYMENT_REVIEW_ENABLED` through a merging environment update that preserves existing secrets/TLS settings.
- Use `/ready` as the new service health check, verify Owner login and customer checkout/PDF, monitor deployment logs, and perform the acceptance cases above.
- If rollout fails, disable new feature flags and redeploy the recorded previous commit; preserve additive schema and ledger records for reconciliation.
- Supabase's leaked-password protection is currently disabled. Review the available plan/configuration before release: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Server-only tables intentionally have RLS without public policies/grants.
