# Mishnex CRM API — Phase 1

**Development only.** No production deployment has been made.

Requires Node.js 20+, PostgreSQL, and a backend hosting service. GitHub Pages cannot run this API.

1. `cd backend && npm install`
2. Copy `.env.example` to `.env`, set a real `DATABASE_URL` and allowed frontend origins.
3. Run the migration in `sql/001_leads.sql` against your PostgreSQL database using your preferred SQL client.
4. Run `npm start`.
5. Test `GET /health` and `POST /api/public/leads` with JSON fields `name,email,phone,service,budget,calltime,requirement`.

Security notes:
- The endpoint uses strict server-side validation, SQL parameters, origin allowlisting, and basic IP rate limiting.
- Configure TLS, secure DB certificates, proxy trust, monitoring, backup, and anti-bot protections before production.
- The honeypot is supplemental; it is not sufficient protection by itself.
- The database is private; **do not** expose it through GitHub Pages or commit real credentials.
- No admin login or payment approval endpoints have been implemented yet.
- The public website form is intentionally not switched to this API until deployment and end-to-end testing.
