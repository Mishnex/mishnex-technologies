import { Router } from 'express';
import { z } from 'zod';
import { transaction, reject } from './transaction.js';
import {managementOnly} from './lead-pool-routes.js';
import { permit } from './workspace-auth.js';
const id=z.coerce.number().int().positive();
export const paymentAmount=z.coerce.number().positive().max(9999999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.0001,'Use at most two decimal places.');
const decision=z.object({action:z.enum(['approved','rejected','reopened']),reason:z.string().trim().min(3).max(1000),reviewerRole:z.enum(['owner','super_admin']).optional()}).strict();

export function paymentRoutes({pool,authorize,requireOwner}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.use((_req,res,next)=>process.env.PAYMENT_REVIEW_ENABLED==='true'?next():res.status(503).json({error:'Payment review is disabled.'}));
 router.use(authorize);
 router.get('/grants',requireOwner,async(_req,res,next)=>{try{
  const r=await pool.query('select g.user_id,s.full_name,g.granted_at from public.crm_payment_review_grants g join public.crm_staff s on s.user_id=g.user_id');res.json({grants:r.rows});
 }catch(e){next(e)}});
 router.put('/grants/:userId',requireOwner,async(req,res,next)=>{const user=z.string().uuid().safeParse(req.params.userId),body=z.object({enabled:z.boolean()}).strict().safeParse(req.body);if(!user.success||!body.success)return res.status(400).json({error:'Invalid grant.'});try{
  if(body.data.enabled){const r=await pool.query("insert into public.crm_payment_review_grants(user_id,granted_by) select user_id,$2 from public.crm_staff where user_id=$1 and role='super_admin' and is_active on conflict(user_id) do update set granted_by=excluded.granted_by,granted_at=now() returning user_id",[user.data,req.actor.id]);if(!r.rowCount)return res.status(400).json({error:'Only active Super Admins may receive payment approval access.'});}
  else await pool.query('delete from public.crm_payment_review_grants where user_id=$1',[user.data]);res.json({saved:true});
 }catch(e){next(e)}});
 router.get('/',permit('payments:read'),async(req,res,next)=>{try{
  const code=String(req.query.quotationId||'').trim().toUpperCase();if(code.length>80)return res.status(400).json({error:'Invalid quotation ID.'});
  const r=await pool.query("select p.*,i.client_id,i.currency,i.amount as invoice_amount,i.paid_amount,c.name as client_name,q.quotation_code from public.crm_payment_submissions p join public.crm_invoices i on i.id=p.invoice_id join public.crm_clients c on c.id=i.client_id left join public.crm_quotations q on q.id=i.quotation_id where ($1='' or q.quotation_code=$1 or q.id::text=$1) order by p.id desc limit 200",[code]);res.json({payments:r.rows});
 }catch(e){next(e)}});
 router.get('/:id/audit',managementOnly,async(req,res,next)=>{const parsed=id.safeParse(req.params.id);if(!parsed.success)return res.status(400).json({error:'Invalid payment.'});try{const r=await pool.query('select actor_id,actor_role,actor_name,actor_code,quotation_id,quotation_code,retained_until,action,reason,created_at from public.crm_payment_audit where submission_id=$1 order by id',[parsed.data]);res.json({audit:r.rows})}catch(e){next(e)}});
 router.patch('/:id/decision',async(req,res,next)=>{
  const parsed=id.safeParse(req.params.id),body=decision.safeParse(req.body);
  if(!parsed.success||!body.success)return res.status(400).json({error:'Choose a valid action and provide a reason.'});
  if(!req.actor.owner&&req.actor.role!=='super_admin')return res.status(403).json({error:'Payment decisions require Owner or delegated Super Admin access.'});
  if(body.data.reviewerRole&&body.data.reviewerRole!==req.actor.role)return res.status(403).json({error:'Select your own signed-in role. Approval cannot be recorded as another person.'});
  try{const result=await transaction(pool,async client=>{
   // Shared grant lock serializes revocation against in-flight approvals.
   if(!req.actor.owner){const grant=await client.query('select user_id from public.crm_payment_review_grants where user_id=$1 for share',[req.actor.id]);if(!grant.rowCount)reject(403,'Owner has not delegated payment approval access.');}
   const rows=await client.query('select * from public.crm_payment_submissions where id=$1 for update',[parsed.data]);
   if(!rows.rowCount)reject(404,'Payment not found.');const p=rows.rows[0],d=body.data;
   if(p.status===d.action)return {unchanged:true,status:p.status};
   if(p.status==='approved')reject(409,'An approved payment cannot be rejected or reopened.');
   if(d.action==='reopened'&&p.status!=='rejected')reject(409,'Only rejected payments can be reopened.');
   if(d.action==='approved'){
    await client.query('select pg_advisory_xact_lock(hashtextextended(lower(btrim($1)),918))',[p.reference]);
    const prior=await client.query('select submission_id from public.crm_invoice_payments where lower(btrim(reference))=lower(btrim($1)) limit 1',[p.reference]);if(prior.rowCount)reject(409,'This bank transaction reference has already been credited. Check the existing receipt.');
    const invoices=await client.query('select id,amount,paid_amount,status from public.crm_invoices where id=$1 for update',[p.invoice_id]);const invoice=invoices.rows[0];
    if(!invoice||!['issued','part_paid'].includes(invoice.status))reject(409,'Invoice must be issued and unpaid.');
    const cents=Math.round(Number(p.amount)*100),due=Math.round(Number(invoice.amount)*100)-Math.round(Number(invoice.paid_amount)*100);
    if(cents>due)reject(409,'Payment exceeds the remaining invoice balance.');
    await client.query('insert into public.crm_invoice_payments(invoice_id,amount,reference,note,recorded_by,submission_id) values($1,$2,$3,$4,$5,$6)',[p.invoice_id,p.amount,p.reference,d.reason,req.actor.id,p.id]);
    await client.query('update public.crm_invoices set paid_amount=$2,status=$3 where id=$1',[p.invoice_id,(Math.round(Number(invoice.paid_amount)*100)+cents)/100,cents===due?'paid':'part_paid']);
   }
   const status=d.action==='reopened'?'pending':d.action;
   await client.query('update public.crm_payment_submissions set status=$2,reason=$3,reviewed_by=$4,reviewed_at=now() where id=$1',[p.id,status,d.reason,req.actor.id]);
   await client.query("insert into public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason,actor_name,actor_code,quotation_id,quotation_code) select $1,$2,$3,$4,$5,coalesce(s.full_name,(select coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email) from auth.users u where u.id=$2),'Owner'),coalesce(s.employee_code,'MISH-OWN-000001'),i.quotation_id,q.quotation_code from public.crm_invoices i left join public.crm_quotations q on q.id=i.quotation_id left join public.crm_staff s on s.user_id=$2 where i.id=(select invoice_id from public.crm_payment_submissions where id=$1)",[p.id,req.actor.id,req.actor.role,d.action,d.reason]);
   return {status};
  });res.json(result)}catch(e){if(e.code==='23505')return res.status(409).json({error:'Payment reference already recorded. Review the payment history before retrying.'});if(e.status)return res.status(e.status).json({error:e.message});next(e)}
 });
 return router;
}
