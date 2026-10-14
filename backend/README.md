# Mishnex CRM API

Node.js 20+, Express and PostgreSQL backend for the Owner/staff workspace, client portal, quotations and manually verified UPI payments.

See [ERP_CRM_DELIVERY.md](ERP_CRM_DELIVERY.md) for current functionality, validation and exact staging deployment steps. Feature code is on `development/erp-payment-workflows`; production release is pending Owner approval.

## Local run

1. `cd backend && npm ci`
2. Copy `.env.example` to `.env`; configure the database, allowed origins, Supabase Auth and Owner identity. Keep service-role credentials server-side.
3. Use the existing reviewed staff/Auth/session foundation and ordered migrations. The delivery document identifies SQL already applied to isolated staging. Do not apply these to production without the release review.
4. `npm start`; visit `/admin-panel`, `/staff-login`, `/client-portal` or `/quotation#PRIVATE_TOKEN`.
5. `npm test` runs the automated tests. `npm run staging:preflight` checks isolated staging configuration.

Payment receipt verification is manual. A UPI link/QR is a payment handoff, not an automatic bank confirmation. Owner or Owner-authorized Super Admin verifies a reference before ledger/balance/receipt confirmation. Pending payments never auto-reject.

GitHub Pages cannot run this API. Use the Render backend for hosted panels and API calls. Verify production TLS certificates and explicit origin allowlists. Never commit database passwords, service-role keys or customer credentials.
