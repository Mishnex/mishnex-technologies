# Mishnex Admin & CRM — Development Foundation

Status: development only. The live GitHub Pages website on `main` is unchanged.

## Confirmed architecture
- Public website remains on GitHub Pages.
- Admin and client applications will use separate frontends and a secure server-side API.
- PostgreSQL will store leads, users, customers, quotations, projects, and payments.
- GoDaddy DNS may later route admin/client subdomains to their hosting providers.

## Initial repository audit
- `contact.html` contains a `#leadForm` enquiry form.
- `assets/js/main.js` intercepts `.lead-form` submissions and only displays a local success UI.
- No real lead is persisted or delivered by that handler.
- Do not display a success message until the backend confirms acceptance.

## Delivery order
1. Implement a separate backend service with environment-based secrets, PostgreSQL migrations, input validation, rate limiting and CORS allowlist.
2. Create `POST /api/public/leads` with server-side validation, anti-spam protections, durable storage, and safe error responses.
3. Connect the website forms to that endpoint only after the API is deployed and tested. Keep a clear error state if submission fails.
4. Implement staff authentication, hashed passwords, secure session handling, owner-controlled account management and role-based permissions.
5. Implement CRM lead assignment and status changes with audit logs.
6. Implement unique customer IDs, quotations, default 30% advance and owner-controlled settings.
7. Implement UPI payment reference submission with *manual bank verification* by Owner or explicitly authorized Super Admin. Never auto-confirm from a screenshot or UPI reference.
8. Implement client portal with strict server-side tenant isolation.

## Non-negotiable authorization rules
- Only Owner can create/deactivate staff, assign roles, change advance policy and change receiving UPI account.
- Maximum five Super Admin accounts and five simultaneous active Super Admin sessions, enforced atomically on the server.
- Sales may send normal quotations; below-floor prices or extra discounts require Owner approval.
- Payment approval is available only to Owner and specifically delegated Super Admins.
- Payment status changes are transactional, idempotent, and audit-logged.
- Clients can access only their own customer records.

## Before deployment
- Confirm backend hosting and PostgreSQL provider.
- Configure DNS, TLS, secret management, backups, monitoring, and owner bootstrap process.
- Run integration/security tests; no production payment use until verification workflow is validated.
