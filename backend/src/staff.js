import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { tokenIssuedAfterCutoff } from './staff-session.js';
import { permissionsFor as sharedPermissionsFor } from './staff-permissions.js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// Owner-only management routes and separately gated staff auth/CRM routes share this router.
// Supabase service-role credentials MUST only exist in Render server environment.
export function staffRoutes({ pool, requireOwner }) {
  const router = Router();
  // Staff auth responses and one-time credentials must never be cached.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const staffSchema = z.object({
    email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(['super_admin','manager','sales','developer','accountant','hr'])
  }).strict();
  const uuidSchema = z.string().uuid();
  const fingerprint = token => createHash('sha256').update(token).digest('hex');
  const secret = () => randomBytes(24).toString('base64url') + 'aA1!';
  const configured = () => Boolean(process.env.STAFF_MANAGEMENT_ENABLED === 'true' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  async function adminApi(path, method, body) {
    const response = await fetch(new URL('/auth/v1/admin/' + path, process.env.SUPABASE_URL), {
      method, headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Auth admin request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const staffLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7',
    legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again later.' }
  });
  const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7',
    legacyHeaders: false, message: { error: 'Too many password changes. Try again later.' }
  });
  // Authenticated identity must be checked against the live staff record on every request.
  async function requireStaffPermission(permission, req, res, next) {
    if (process.env.STAFF_CRM_ENABLED !== 'true') return res.status(503).json({ error:'Staff CRM modules are disabled.' });
    if (!configured() || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error:'Staff CRM access disabled.' });
    const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error:'Authentication required.' });
    try {
      const response = await fetch(new URL('/auth/v1/user', process.env.SUPABASE_URL), {
        headers:{ apikey:process.env.SUPABASE_ANON_KEY, Authorization:'Bearer ' + match[1] },
        signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(401).json({ error:'Invalid session.' });
      const user = await response.json();
      const result = await pool.query(
        'select user_id,role,is_active,must_change_password,sessions_valid_after from public.crm_staff where user_id=$1',
        [user.id]
      );
      const staff = result.rows[0];
      if (!staff || !staff.is_active || staff.must_change_password) return res.status(403).json({ error:'Staff access denied.' });
      if (!tokenIssuedAfterCutoff(match[1],staff.sessions_valid_after)) return res.status(401).json({ error:'Session revoked.' });
      if (staff.role === 'super_admin') {
        const active = await pool.query(
          'select 1 from public.crm_super_admin_sessions where user_id=$1 and token_fingerprint=$2 and revoked_at is null and expires_at>now()',
          [user.id,fingerprint(match[1])]
        );
        if (!active.rowCount) return res.status(401).json({ error:'Super Admin session revoked.' });
      }
      if (!sharedPermissionsFor(staff).includes(permission)) return res.status(403).json({ error:'Insufficient permissions.' });
      req.staff = { id:user.id, role:staff.role };
      next();
    } catch(error) { next(error); }
  }
  // Read-only permission probe; no CRM business data is exposed here.
  router.get('/permissions/check/leads', (req,res,next) => requireStaffPermission('leads:read',req,res,next), (_req,res) => {
    res.set('Cache-Control','no-store').json({ allowed:true, permission:'leads:read', crmAccessEnabled:true });
  });
  // A safe, read-only overview for staff with explicit lead read permission.
  // Owner-only lead management endpoints remain unchanged.
  router.get('/leads', (req,res,next) => requireStaffPermission('leads:read',req,res,next), async (_req,res,next) => {
    try {
      const result = await pool.query(
        'select id,name,email,service,created_at from public.crm_leads order by created_at desc limit 50'
      );
      res.set('Cache-Control','no-store').json({ leads:result.rows });
    } catch(error) { next(error); }
  });
  // Temporary-password login is restricted to password setup; it never grants CRM module access.
  router.post('/login', staffLoginLimiter, async (req, res, next) => {
    if (!configured() || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error:'Staff login is disabled.' });
    const parsed = z.object({ email:z.string().email().max(254), password:z.string().min(1).max(1024) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error:'Enter valid credentials.' });
    try {
      const response = await fetch(new URL('/auth/v1/token?grant_type=password', process.env.SUPABASE_URL), {
        method:'POST', headers:{ apikey:process.env.SUPABASE_ANON_KEY, 'Content-Type':'application/json' },
        body:JSON.stringify(parsed.data), signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(401).json({ error:'Invalid credentials.' });
      const data = await response.json();
      const staff = await pool.query(
        'select user_id,role,is_active,must_change_password,sessions_valid_after from public.crm_staff where user_id=$1',
        [data.user?.id]
      );
      if (!staff.rowCount || !staff.rows[0].is_active) return res.status(403).json({ error:'Staff access denied.' });
      const account = staff.rows[0];
      if (!tokenIssuedAfterCutoff(data.access_token, account.sessions_valid_after)) return res.status(401).json({ error:'Session revoked. Sign in again.' });
      if (account.role === 'super_admin' && !account.must_change_password) {
        const ttl = Number(data.expires_in);
        if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 3900) {
          return res.status(401).json({ error:'Invalid session expiry. Sign in again.' });
        }
        const expiresAt = new Date(Date.now() + Math.min(ttl, 3600) * 1000);
        const registered = await pool.query(
          'select public.crm_register_super_admin_session($1,$2,$3) as allowed',
          [account.user_id, fingerprint(data.access_token), expiresAt]
        );
        if (!registered.rows[0]?.allowed) return res.status(429).json({ error:'Maximum 5 active Super Admin sessions reached.' });
      }
      res.set('Cache-Control','no-store').json({
        accessToken:data.access_token, expiresIn:data.expires_in,
        role:account.role, mustChangePassword:account.must_change_password,
        crmAccessEnabled:process.env.STAFF_CRM_ENABLED==='true'&&!account.must_change_password
      });
    } catch (error) { next(error); }
  });
  // Protected staff identity endpoint: always re-check live DB state before access.
  router.get('/me', async (req, res, next) => {
    if (!configured() || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error:'Staff access is disabled.' });
    const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error:'Authentication required.' });
    try {
      const response = await fetch(new URL('/auth/v1/user', process.env.SUPABASE_URL), {
        headers:{ apikey:process.env.SUPABASE_ANON_KEY, Authorization:'Bearer ' + match[1] },
        signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(401).json({ error:'Invalid session.' });
      const user = await response.json();
      const result = await pool.query('select user_id,full_name,role,is_active,must_change_password,sessions_valid_after from public.crm_staff where user_id=$1',[user.id]);
      if (!result.rowCount || !result.rows[0].is_active) return res.status(403).json({ error:'Account disabled or not found.' });
      const staff = result.rows[0];
      if (!tokenIssuedAfterCutoff(match[1],staff.sessions_valid_after)) return res.status(401).json({ error:'Session revoked.' });
      if (staff.role === 'super_admin' && !staff.must_change_password) {
        const active = await pool.query(
          'select 1 from public.crm_super_admin_sessions where user_id=$1 and token_fingerprint=$2 and revoked_at is null and expires_at>now()',
          [user.id,fingerprint(match[1])]
        );
        if (!active.rowCount) return res.status(401).json({ error:'Super Admin session expired or revoked.' });
      }
      res.set('Cache-Control','no-store').json({
        id:staff.user_id,fullName:staff.full_name,role:staff.role,
        mustChangePassword:staff.must_change_password,permissions:sharedPermissionsFor(staff),crmAccessEnabled:process.env.STAFF_CRM_ENABLED==='true'&&!staff.must_change_password
      });
    } catch (error) { next(error); }
  });
  // Explicit Super Admin logout invalidates the registered access-token fingerprint.
  router.post('/logout', async (req, res, next) => {
    if (!configured() || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error:'Staff access is disabled.' });
    const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error:'Authentication required.' });
    try {
      const response = await fetch(new URL('/auth/v1/user', process.env.SUPABASE_URL), {
        headers:{ apikey:process.env.SUPABASE_ANON_KEY, Authorization:'Bearer ' + match[1] },
        signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(401).json({ error:'Invalid session.' });
      const user = await response.json();
      await pool.query('select public.crm_revoke_staff_sessions_on_logout($1)', [user.id]);
      // Global sign-out revokes provider refresh sessions across devices.
      const logoutResponse = await fetch(new URL('/auth/v1/logout?scope=global', process.env.SUPABASE_URL), {
        method:'POST',
        headers:{ apikey:process.env.SUPABASE_ANON_KEY, Authorization:'Bearer ' + match[1] },
        signal:AbortSignal.timeout(8000)
      });
      if (!logoutResponse.ok) return res.status(502).set('Cache-Control','no-store').json({
        signedOut:false, error:'Local session revoked; identity provider logout could not be confirmed.'
      });
      res.set('Cache-Control','no-store').json({ signedOut:true });
    } catch (error) { next(error); }
  });
  // Self-service first-login password change. Does not grant staff CRM access.
  router.post('/change-password', passwordChangeLimiter, async (req, res, next) => {
    if (!configured() || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Staff access is not enabled.' });
    const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error: 'Sign in first.' });
    const parsed = z.object({ newPassword: z.string().min(12).max(128) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'New password must contain 12 to 128 characters.' });
    try {
      const response = await fetch(new URL('/auth/v1/user', process.env.SUPABASE_URL), {
        headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + match[1] },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(401).json({ error: 'Invalid or expired session.' });
      const user = await response.json();
      const staff = await pool.query('select is_active,sessions_valid_after from public.crm_staff where user_id=$1', [user.id]);
      if (!staff.rowCount || !staff.rows[0].is_active) return res.status(403).json({ error: 'Active staff account required.' });
      if (!tokenIssuedAfterCutoff(match[1], staff.rows[0].sessions_valid_after)) return res.status(401).json({ error:'Session revoked. Sign in again.' });
      // Re-check active staff state and mark sessions invalid before changing Auth credentials.
      await pool.query('select public.crm_begin_staff_password_change($1)', [user.id]);
      try {
        await adminApi('users/' + encodeURIComponent(user.id), 'PUT', { password: parsed.data.newPassword });
        await pool.query('select public.crm_complete_staff_password_change($1)', [user.id]);
      } catch (error) {
        console.error('Staff password change requires recovery', { userId: user.id, message: error.message });
        return res.status(503).set('Cache-Control', 'no-store').json({
          changed: false,
          error: 'Password change could not be confirmed. Existing sessions were revoked. Contact the Owner to reset your password.'
        });
      }
      res.set('Cache-Control', 'no-store').json({ changed: true, message: 'Password updated. Sign in again.' });
    } catch (error) { next(error); }
  });
  router.use(requireOwner);
  router.use((_req, res, next) => configured() ? next() : res.status(503).json({ error: 'Staff provisioning is not configured.' }));

  router.get('/', async (_req, res, next) => {
    try {
      const result = await pool.query('select user_id,email,full_name,role,is_active,must_change_password,created_at from public.crm_staff order by created_at desc limit 100');
      res.set('Cache-Control','no-store').json({ staff: result.rows });
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid staff details.' });
    const { email, fullName, role } = parsed.data;
    let userId;
    let commitAttempted = false;
    const password = secret();
    try {
      // Do not send invite or confirmation emails. Credentials shown to Owner exactly once.
      const auth = await adminApi('users', 'POST', {
        email, password, email_confirm: true, app_metadata: { mishnex_role: role }
      });
      userId = auth.id;
      if (!uuidSchema.safeParse(userId).success) throw new Error('Auth account creation returned an invalid user ID');
      const client = await pool.connect();
      let transactionOpen = false;
      let connectionBroken = false;
      try {
        transactionOpen = true;
        await client.query('BEGIN');
        await client.query(
          'insert into public.crm_staff(user_id,email,full_name,role,created_by) values ($1,$2,$3,$4,$5)',
          [userId,email,fullName,role,req.owner.id]
        );
        await client.query(
          "insert into public.crm_staff_audit(actor_id,target_id,action,detail) values ($1,$2,'staff_created',$3)",
          [req.owner.id,userId,JSON.stringify({ role })]
        );
        commitAttempted = true;
        await client.query('COMMIT');
        transactionOpen = false;
      } catch (error) {
        if (transactionOpen && !commitAttempted) {
          try { await client.query('ROLLBACK'); transactionOpen = false; }
          catch (rollbackError) {
            connectionBroken = true;
            console.error('Staff provisioning rollback failed:', rollbackError.message);
          }
        }
        if (commitAttempted) connectionBroken = true;
        throw error;
      } finally { client.release(connectionBroken || transactionOpen); }
      res.set('Cache-Control','no-store').status(201).json({
        staff: { userId,email,fullName,role,mustChangePassword:true },
        temporaryPassword:password,
        warning:'Copy this password securely now. It will not be shown again.'
      });
    } catch (error) {
      let cleanupFailed = false;
      // A COMMIT error is ambiguous: PostgreSQL may have committed despite a lost response.
      // Never delete Auth after COMMIT was attempted; require manual reconciliation.
      if (userId && commitAttempted) return res.status(503).json({
        error:'Employee creation outcome is uncertain. Do not retry; an authorized operator must reconcile Auth and staff records.'
      });
      if (userId) {
        try { await adminApi('users/' + encodeURIComponent(userId), 'DELETE'); }
        catch (cleanupError) {
          cleanupFailed = true;
          console.error('Orphan staff auth account cleanup failed:', cleanupError.message);
        }
      }
      if (cleanupFailed) return res.status(503).json({
        error:'Employee provisioning failed and Auth cleanup could not be confirmed. Do not retry until the account is reconciled by an authorized operator.'
      });
      if (error.code === '23505') return res.status(409).json({ error:'Email already registered.' });
      if (error.message?.includes('Maximum 5 active Super Admin')) return res.status(409).json({ error:'Maximum 5 active Super Admin accounts allowed.' });
      if (error.status === 422) return res.status(409).json({ error:'Staff email already exists or is invalid.' });
      next(error);
    }
  });
  // Owner can suspend an employee immediately. Every staff request checks is_active.
  router.post('/:userId/deactivate', async (req, res, next) => {
    if (!uuidSchema.safeParse(req.params.userId).success) return res.status(400).json({ error:'Invalid staff ID.' });
    const id = req.params.userId;
    const client = await pool.connect().catch(next);
    if (!client) return;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'update public.crm_staff set is_active=false, sessions_valid_after=now(), updated_at=now() where user_id=$1 and is_active=true returning user_id,role',
        [id]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error:'Active employee not found.' });
      }
      await client.query(
        "insert into public.crm_staff_audit(actor_id,target_id,action,detail) values ($1,$2,'staff_deactivated',$3)",
        [req.owner.id,id,JSON.stringify({ role:result.rows[0].role })]
      );
      await client.query('update public.crm_super_admin_sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [id]);
      await client.query('COMMIT');
      res.set('Cache-Control','no-store').json({ deactivated:true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { client.release(); }
  });
  router.post('/:userId/reset-password', async (req, res, next) => {
    if (!uuidSchema.safeParse(req.params.userId).success) return res.status(400).json({ error:'Invalid staff ID.' });
    const id = req.params.userId;
    try {
      const result = await pool.query('select user_id from public.crm_staff where user_id=$1 and is_active=true',[id]);
      if (!result.rowCount) return res.status(404).json({ error:'Active staff member not found.' });
      // Revoke existing CRM sessions before changing the external Auth password.
      await pool.query('select public.crm_begin_staff_password_change($1)', [id]);
      const password = secret();
      try {
        await adminApi('users/' + encodeURIComponent(id), 'PUT', { password });
        await pool.query(
          "insert into public.crm_staff_audit(actor_id,target_id,action,detail) values ($1,$2,'staff_password_reset',$3)",
          [req.owner.id,id,JSON.stringify({ method:'owner_manual' })]
        );
      } catch (error) {
        console.error('Owner staff password reset requires recovery', { userId:id, message:error.message });
        return res.status(503).set('Cache-Control','no-store').json({
          error:'Employee password reset could not be confirmed. Existing sessions were revoked. Retry the reset or contact support.'
        });
      }
      res.set('Cache-Control','no-store').json({ temporaryPassword:password, warning:'Copy securely. Old CRM sessions are not accepted by future session-cutoff-aware authorization middleware.' });
    } catch (error) { next(error); }
  });
  return router;
}
