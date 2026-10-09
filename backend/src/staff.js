import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

// All routes are Owner-only until staff RBAC and session enforcement are implemented.
// Supabase service-role credentials MUST only exist in Render server environment.
export function staffRoutes({ pool, requireOwner }) {
  const router = Router();
  const staffSchema = z.object({
    email: z.string().email().max(254).transform(v => v.trim().toLowerCase()),
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(['super_admin','manager','sales','developer','accountant'])
  }).strict();
  const uuidSchema = z.string().uuid();
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
    const password = secret();
    try {
      // Do not send invite or confirmation emails. Credentials shown to Owner exactly once.
      const auth = await adminApi('users', 'POST', {
        email, password, email_confirm: true, app_metadata: { mishnex_role: role }
      });
      userId = auth.id;
      if (!userId) throw new Error('Auth account creation did not return a user ID');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'insert into public.crm_staff(user_id,email,full_name,role,created_by) values ($1,$2,$3,$4,$5)',
          [userId,email,fullName,role,req.owner.id]
        );
        await client.query(
          "insert into public.crm_staff_audit(actor_id,target_id,action,detail) values ($1,$2,'staff_created',$3)",
          [req.owner.id,userId,JSON.stringify({ role })]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
      res.set('Cache-Control','no-store').status(201).json({
        staff: { userId,email,fullName,role,mustChangePassword:true },
        temporaryPassword:password,
        warning:'Copy this password securely now. It will not be shown again.'
      });
    } catch (error) {
      if (userId) {
        try { await adminApi('users/' + encodeURIComponent(userId), 'DELETE'); }
        catch (cleanupError) { console.error('Orphan staff auth account cleanup failed:', cleanupError.message); }
      }
      if (error.code === '23505') return res.status(409).json({ error:'Email already registered.' });
      if (error.message?.includes('Maximum 5 active Super Admin')) return res.status(409).json({ error:'Maximum 5 active Super Admin accounts allowed.' });
      if (error.status === 422) return res.status(409).json({ error:'Staff email already exists or is invalid.' });
      next(error);
    }
  });
  router.post('/:userId/reset-password', async (req, res, next) => {
    if (!uuidSchema.safeParse(req.params.userId).success) return res.status(400).json({ error:'Invalid staff ID.' });
    const id = req.params.userId;
    try {
      const result = await pool.query('select user_id from public.crm_staff where user_id=$1 and is_active=true',[id]);
      if (!result.rowCount) return res.status(404).json({ error:'Active staff member not found.' });
      const password = secret();
      await adminApi('users/' + encodeURIComponent(id), 'PUT', { password });
      await pool.query('update public.crm_staff set must_change_password=true,updated_at=now() where user_id=$1',[id]);
      await pool.query(
        "insert into public.crm_staff_audit(actor_id,target_id,action,detail) values ($1,$2,'staff_password_reset',$3)",
        [req.owner.id,id,JSON.stringify({ method:'owner_manual' })]
      );
      res.set('Cache-Control','no-store').json({ temporaryPassword:password, warning:'Copy securely. Existing sessions must be revoked before enabling staff login.' });
    } catch (error) { next(error); }
  });
  return router;
}
