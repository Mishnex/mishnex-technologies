# CRM implementation and launch checklist

Current authoritative status and rollout instructions: [ERP_CRM_DELIVERY.md](ERP_CRM_DELIVERY.md).

## Implemented and checked

- [x] Staff lifecycle, role permissions, temporary-password and session policies
- [x] Leads, follow-up history, conversion and client provisioning
- [x] HR, projects, tasks, website content and reports
- [x] Itemized quotations, pricing approval and private sharing
- [x] Owner/delegated Super Admin advance control, direct UPI and manual payment review
- [x] Invoice ledger, receipts, customer balances, optional GST and branded invoice PDFs
- [x] Readable role/client/quotation IDs, employee work tracking and management record directories
- [x] 251 automated tests, database rollback/query checks and real Owner/private-quotation smoke flow
- [x] Office login limit fix, legacy customer-link guard, database readiness and safe shutdown
- [x] Production foundation inspection and ordered migration integrity manifest

## Open release gates

- [ ] Full real multi-role Auth/customer acceptance, including five parallel Super Admin sessions
- [ ] Intended customer account provisioned and verified using the Owner flow
- [ ] Real mobile UPI/bank receipt verified; never approve a test/reference alone
- [ ] Production backup, migrations, policy/configuration and release activated
- [ ] Production readiness, login, payment/PDF acceptance and monitoring verified

Production launch has not been performed. Staging, mocked HTTP/DOM checks and database rollback tests are separate evidence; none independently establishes a complete production launch.

Lead assignment and employee status-edit permissions are outside the implemented lead workflow: staff can read leads and record their calls; Owner controls lead status/conversion. Do not claim automatic telephone tracking or assigned-lead isolation.
