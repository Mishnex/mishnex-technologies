# Owner login activation (development only)

This is a **setup checklist**, not evidence that the integration is live.

## 1. Create the owner identity in Supabase

In the correct Supabase project, go to Authentication → Users and create/invite the intended owner email. Confirm the email as appropriate and use a strong, unique password. **Do not share the password in GitHub, chat, or screenshots.** Copy the new user's UUID from Authentication → Users (not the email address).

Keep public signups disabled unless there is a separately reviewed user-onboarding flow. The API allows only the configured owner UUID, not any authenticated Supabase user.

## 2. Configure Render service

In the Render service `mishnex-crm-api`, add these environment variables privately:

- `SUPABASE_URL` — your Supabase project URL, such as `https://example.supabase.co`
- `SUPABASE_ANON_KEY` — your Supabase publishable/anon key (never use the service-role key)
- `OWNER_USER_ID` — the exact UUID of the owner in Supabase Authentication

Existing `DATABASE_URL`, `NODE_ENV`, and `ALLOWED_ORIGINS` must remain correctly configured. Redeploy after saving environment variables.

**Do not add real credentials to `.env.example` or commit them to the repository.** Do not expose the Supabase service-role key in browser code.

## 3. Verify the database separately

The public lead submission previously returned HTTP 500. Before claiming CRM works, inspect Render logs for the underlying PostgreSQL connection/permission/schema issue. Verify that the backend role can INSERT into `public.crm_leads` and SELECT only through authenticated server routes. Avoid disabling RLS or exposing leads to anonymous clients as a workaround.

## 4. Acceptance checks

- Without a token, `GET /api/admin/me` must fail.
- A valid Supabase user whose UUID does not match `OWNER_USER_ID` must be denied.
- Correct owner credentials must sign in and `GET /api/admin/me` must report `role: owner`.
- `GET /api/admin/leads` must deny unauthenticated requests and return actual leads only for the owner.
- After signing out, the frontend must stop using its in-memory token.
- Verify mobile layout and CORS for the actual development preview origin.

## Known limitations / next security work

The preview does not implement persistent sessions, token refresh, staff roles, multi-admin caps, audit logging, or payment approval. Owner JWTs are held only in page memory; closing/reloading requires sign-in again. Supabase Auth tokens remain valid until expiration, even after a local sign-out, unless revoked by the identity provider. A production release requires full session/revocation policy, error-handling tests, deployment review, and verification of database connectivity.

**Do not merge into main or advertise this preview as a live admin portal until acceptance checks pass.**
