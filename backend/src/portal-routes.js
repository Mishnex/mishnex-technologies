import { Router } from 'express';
export function portalRoutes({pool}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.post('/login',async(req,res,next)=>{const {email,password}=req.body||{};if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>1024||!email||!password)return res.status(400).json({error:'Enter a valid email and password.'});try{
 const auth=await fetch(new URL('/auth/v1/token?grant_type=password',process.env.SUPABASE_URL),{method:'POST',headers:{apikey:process.env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(8000)});
 if(!auth.ok)return res.status(401).json({error:'Invalid credentials or client access denied.'});
 const session=await auth.json();
 const verify=await fetch(new URL('/auth/v1/user',process.env.SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(8000)});
 if(!verify.ok)return res.status(401).json({error:'Invalid session.'});
 const user=await verify.json();
 const allowed=await pool.query('select 1 from public.crm_client_portal_access where user_id=$1 limit 1',[user.id]);
 if(!allowed.rowCount)return res.status(403).json({error:'Client portal access not assigned.'});
 res.json({accessToken:session.access_token,expiresIn:session.expires_in});
 }catch(e){next(e)}});
 router.use(async(req,res,next)=>{
  const match=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
  if(!match)return res.status(401).json({error:'Client sign in required.'});
  try {
   const response=await fetch(new URL('/auth/v1/user',process.env.SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(8000)});
   if(!response.ok)return res.status(401).json({error:'Invalid client session.'});
   const user=await response.json();
   if(!user?.id)return res.status(401).json({error:'Invalid account.'});
   req.clientUserId=user.id;next();
  }catch(e){next(e)}
 });
 router.get('/health',(_req,res)=>res.json({status:'ok'}));
 router.get('/overview',async(req,res,next)=>{try{
  const memberships=await pool.query('select c.id,c.name,c.email from public.crm_client_portal_access a join public.crm_clients c on c.id=a.client_id where a.user_id=$1 order by c.created_at desc',[req.clientUserId]);
  res.json({clients:memberships.rows});
 }catch(e){next(e)}});
 router.get('/clients/:clientId/projects',async(req,res,next)=>{try{
  const result=await pool.query('select p.id,p.name,p.description,p.status,p.due_date from public.crm_projects p where p.client_id=$1 and exists(select 1 from public.crm_client_portal_access a where a.client_id=p.client_id and a.user_id=$2) order by p.id desc limit 100',[req.params.clientId,req.clientUserId]);
  res.json({projects:result.rows});
 }catch(e){if(e.code==='22P02')return res.status(400).json({error:'Invalid client ID.'});next(e)}});
 router.get('/clients/:clientId/invoices',async(req,res,next)=>{try{
  const result=await pool.query('select i.id,i.amount,i.paid_amount,i.currency,i.due_date,i.status,i.created_at from public.crm_invoices i where i.client_id=$1 and exists(select 1 from public.crm_client_portal_access a where a.client_id=i.client_id and a.user_id=$2) and i.status<>\'draft\' order by i.id desc limit 100',[req.params.clientId,req.clientUserId]);
  res.json({invoices:result.rows});
 }catch(e){if(e.code==='22P02')return res.status(400).json({error:'Invalid client ID.'});next(e)}});
 return router;
}
