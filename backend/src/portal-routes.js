import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { transaction, reject } from './transaction.js';
import { paymentAmount } from './payment-routes.js';
export function portalRoutes({pool}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.post('/login',rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{const {email,password}=req.body||{};if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>1024||!email||!password)return res.status(400).json({error:'Enter a valid email and password.'});try{
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
 const paymentGate=(_req,res,next)=>process.env.PAYMENT_REVIEW_ENABLED==='true'?next():res.status(503).json({error:'Payment review is disabled.'});
 router.get('/payment-config',async(_req,res,next)=>{try{const r=await pool.query('select upi_id,advance_percent from public.crm_business_policy where singleton');res.json({policy:r.rows[0]||{upi_id:'',advance_percent:30}})}catch(e){next(e)}});
 router.get('/clients/:clientId/quotations',async(req,res,next)=>{
  const clientId=z.string().uuid().safeParse(req.params.clientId);if(!clientId.success)return res.status(400).json({error:'Invalid client.'});
  try{const r=await pool.query(`select q.id,q.title,q.amount,q.currency,q.status,q.advance_percent,round(q.amount*q.advance_percent/100,2) as advance_amount,q.items,q.subtotal,q.discount_amount,q.notes,q.client_name,q.client_email,q.client_phone
   from public.crm_quotations q where q.client_id=$1 and q.status in ('sent','accepted')
   and exists(select 1 from public.crm_client_portal_access a where a.client_id=q.client_id and a.user_id=$2) order by q.id desc limit 100`,[clientId.data,req.clientUserId]);res.json({quotations:r.rows})}catch(e){next(e)}
 });
 router.post('/invoices/:id/payments',paymentGate,async(req,res,next)=>{
  const invoiceId=z.coerce.number().int().positive().safeParse(req.params.id);
  const body=z.object({amount:paymentAmount,reference:z.string().trim().min(3).max(120)}).strict().safeParse(req.body);
  if(!invoiceId.success||!body.success)return res.status(400).json({error:'Enter a valid invoice, amount and UPI reference.'});
  try{const payment=await transaction(pool,async client=>{
   const invoices=await client.query("select i.id,i.amount,i.paid_amount,i.status from public.crm_invoices i where i.id=$1 and exists(select 1 from public.crm_client_portal_access a where a.client_id=i.client_id and a.user_id=$2) for update",[invoiceId.data,req.clientUserId]);
   if(!invoices.rowCount)reject(404,'Invoice not found.');const invoice=invoices.rows[0];
   if(!['issued','part_paid'].includes(invoice.status))reject(409,'Invoice is not available for payment.');
   if(Math.round(body.data.amount*100)>Math.round(Number(invoice.amount)*100)-Math.round(Number(invoice.paid_amount)*100))reject(400,'Amount exceeds remaining balance.');
   const result=await client.query('insert into public.crm_payment_submissions(invoice_id,submitted_by,amount,reference) values($1,$2,$3,$4) returning id,status,created_at',[invoiceId.data,req.clientUserId,body.data.amount,body.data.reference]);
   await client.query("insert into public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason) values($1,$2,'client','submitted','UPI reference submitted for manual verification')",[result.rows[0].id,req.clientUserId]);
   return result.rows[0];
  });res.status(201).json({payment,message:'Payment submitted. Awaiting manual bank verification; your balance changes after approval.'});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'This reference was already submitted. Check your payment history.'});if(e.status)return res.status(e.status).json({error:e.message});next(e)}
 });
 router.get('/clients/:clientId/payments',paymentGate,async(req,res,next)=>{
  const clientId=z.string().uuid().safeParse(req.params.clientId);if(!clientId.success)return res.status(400).json({error:'Invalid client.'});
  try{const result=await pool.query(`select p.id,p.invoice_id,p.amount,p.reference,p.status,p.reason,p.created_at,p.reviewed_at,i.currency,
   i.amount as total_amount,i.paid_amount,(i.amount-i.paid_amount) as remaining_amount
   from public.crm_payment_submissions p join public.crm_invoices i on i.id=p.invoice_id
   where i.client_id=$1 and exists(select 1 from public.crm_client_portal_access a where a.client_id=i.client_id and a.user_id=$2) order by p.id desc limit 200`,[clientId.data,req.clientUserId]);res.json({payments:result.rows});
  }catch(e){next(e)}
 });
 router.get('/payments/:id/receipt',paymentGate,async(req,res,next)=>{
  const paymentId=z.coerce.number().int().positive().safeParse(req.params.id);if(!paymentId.success)return res.status(400).json({error:'Invalid receipt.'});
  try{const result=await pool.query(`select l.id as receipt_number,l.amount,l.reference,l.recorded_at,i.id as invoice_id,i.currency,i.amount as total_amount,i.paid_amount,(i.amount-i.paid_amount) as remaining_amount,c.name as client_name
   from public.crm_invoice_payments l join public.crm_invoices i on i.id=l.invoice_id join public.crm_clients c on c.id=i.client_id
   where l.submission_id=$1 and exists(select 1 from public.crm_client_portal_access a where a.client_id=i.client_id and a.user_id=$2)`,[paymentId.data,req.clientUserId]);
   if(!result.rowCount)return res.status(404).json({error:'Approved receipt not found.'});res.json({receipt:result.rows[0]});
  }catch(e){next(e)}
 });
 return router;
}
