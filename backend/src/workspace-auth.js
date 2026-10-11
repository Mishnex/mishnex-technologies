import { createHash } from 'node:crypto';
import { permissionsFor } from './staff-permissions.js';
import { tokenIssuedAfterCutoff } from './staff-session.js';

export function workspaceAuth(pool) {
  return async (req, res, next) => {
    const token = /^Bearer (\S+)$/.exec(req.get('Authorization') || '')?.[1];
    if (!token) return res.status(401).json({error:'Sign in required.'});
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.OWNER_USER_ID)
      return res.status(503).json({error:'Workspace authentication is not configured.'});
    try {
      const response = await fetch(new URL('/auth/v1/user',process.env.SUPABASE_URL), {
        headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)
      });
      if (!response.ok) return res.status(401).json({error:'Invalid session.'});
      const user = await response.json();
      if (user.id === process.env.OWNER_USER_ID) {
        req.actor={id:user.id,role:'owner',owner:true,permissions:[]}; return next();
      }
      if (process.env.STAFF_MANAGEMENT_ENABLED !== 'true' || process.env.STAFF_CRM_ENABLED !== 'true')
        return res.status(503).json({error:'Staff workspace is disabled.'});
      const result=await pool.query('select user_id,role,is_active,must_change_password,sessions_valid_after from public.crm_staff where user_id=$1',[user.id]);
      const staff=result.rows[0];
      if (!staff?.is_active || staff.must_change_password) return res.status(403).json({error:'Staff access denied.'});
      if (!tokenIssuedAfterCutoff(token,staff.sessions_valid_after)) return res.status(401).json({error:'Session revoked.'});
      if (staff.role==='super_admin') {
        const active=await pool.query('select 1 from public.crm_super_admin_sessions where user_id=$1 and token_fingerprint=$2 and revoked_at is null and expires_at>now()',[user.id,createHash('sha256').update(token).digest('hex')]);
        if (!active.rowCount) return res.status(401).json({error:'Super Admin session revoked.'});
      }
      req.actor={id:user.id,role:staff.role,owner:false,permissions:permissionsFor(staff)};next();
    } catch(error) {next(error);}
  };
}
export const permit = permission => (req,res,next) => req.actor?.owner || req.actor?.permissions.includes(permission)
  ? next() : res.status(403).json({error:'Insufficient permissions.'});
