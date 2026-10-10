import {quotationInvoice} from './quotation-invoice.js';
import {advanceRequired} from './advance-policy.js';
import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {quotationTokenHash} from './quotation-routes.js';
import {paymentAmount} from './payment-routes.js';
import {transaction,reject} from './transaction.js';
export function quoteLinkRoutes({pool}){
 const r=Router();r.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');next()});
 r.use(rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));
 r.use((req,res,next)=>{const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('Authorization')||'')?.[1];if(!token)return res.status(404).json({error:'Quotation link is invalid or expired.'});req.quoteHash=quotationTokenHash(token);next()});
 const active="share_token_hash=$1 and share_expires_at>now() and status in ('sent','accepted') and (not requires_approval or approved_by is not null)";
 r.get('/',async(req,res,next)=>{try{
  const result=await pool.query(`select id,quotation_code,client_id,title,client_name,client_email,client_phone,items,subtotal,discount_percent,discount_amount,amount,currency,advance_percent,advance_amount,notes,status,payment_invoice_id from public.crm_quotations where ${active}`,[req.quoteHash]);
  if(!result.rowCount)return res.status(404).json({error:'Quotation link is invalid or expired.'});const q=result.rows[0];
  const invoice=q.payment_invoice_id?await pool.query('select id,paid_amount,status from public.crm_invoices where id=$1',[q.payment_invoice_id]):await pool.query("select id,paid_amount,status from public.crm_invoices where quotation_id=$1 and client_id=$2 and amount=$3 and currency=$4 and status<>'void' order by id limit 2",[q.id,q.client_id,q.amount,q.currency]);
  const effectiveInvoice=invoice.rows.length===1?invoice.rows[0]:null;
  const payments=effectiveInvoice?await pool.query('select id,amount,reference,status,reason,created_at,reviewed_at from public.crm_payment_submissions where invoice_id=$1 order by id desc limit 100',[effectiveInvoice.id]):{rows:[]};
  const paid=Number(effectiveInvoice?.paid_amount||0),{payment_invoice_id,client_id,...quotation}=q;
  const policy=await pool.query('select upi_id,upi_secondary_id,upi_receiver_name from public.crm_business_policy where singleton');
  res.json({quotation,paidAmount:paid,remainingAmount:Math.max(0,Number(q.amount)-paid),payments:payments.rows,minimumPayment:advanceRequired(q.amount,paid,q.advance_percent,q.advance_amount),upiId:q.currency.trim()==='INR'?policy.rows[0]?.upi_id||'':'',upiOptions:q.currency.trim()==='INR'?[...new Set([policy.rows[0]?.upi_id,policy.rows[0]?.upi_secondary_id].filter(Boolean))]:[],upiReceiverName:policy.rows[0]?.upi_receiver_name||'',canPay:q.currency.trim()==='INR'&&invoice.rows.length<=1&&!['void','draft'].includes(effectiveInvoice?.status)&&process.env.PAYMENT_REVIEW_ENABLED==='true'});
 }catch(e){next(e)}});
 r.post('/payments',async(req,res,next)=>{
  if(process.env.PAYMENT_REVIEW_ENABLED!=='true')return res.status(503).json({error:'Payment review is disabled.'});
  const body=z.object({amount:paymentAmount,reference:z.string().trim().min(3).max(120),acceptQuotation:z.literal(true)}).strict().safeParse(req.body);if(!body.success)return res.status(400).json({error:'Accept the quotation and enter a valid amount and transaction reference.'});
  try{const payment=await transaction(pool,async client=>{
   const result=await client.query(`select id,client_id,amount,currency,status,advance_percent,advance_amount,payment_invoice_id from public.crm_quotations where ${active} for update`,[req.quoteHash]);if(!result.rowCount)reject(404,'Quotation link is invalid or expired.');const q=result.rows[0];
   if(q.currency.trim()!=='INR')reject(409,'UPI is available for INR quotations. Contact Mishnex for other payment methods.');
   const invoiceId=await quotationInvoice(client,q);
   const invoice=await client.query('select amount,paid_amount,status from public.crm_invoices where id=$1 for update',[invoiceId]);const i=invoice.rows[0];
   if(!i||!['issued','part_paid'].includes(i.status))reject(409,'Invoice is not available for payment.');
   const due=Math.round(Number(i.amount)*100)-Math.round(Number(i.paid_amount)*100);if(Math.round(body.data.amount*100)>due)reject(400,'Amount exceeds the remaining balance.');
   if(body.data.amount<advanceRequired(i.amount,i.paid_amount,q.advance_percent,q.advance_amount))reject(400,'Payment is below the required advance. Refresh the quotation for current payment terms.');
   const created=await client.query('insert into public.crm_payment_submissions(invoice_id,submitted_by,amount,reference) values($1,null,$2,$3) returning id,status,amount',[invoiceId,body.data.amount,body.data.reference]);
   await client.query("insert into public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason) values($1,null,'client_link','submitted','Customer accepted quotation and submitted a payment reference using its private link')",[created.rows[0].id]);return created.rows[0];
  });res.status(201).json({payment,message:'Payment submitted for manual bank verification. Balance updates only after approval.'});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'This transaction reference is already submitted. Check payment history.'});if(e.status)return res.status(e.status).json({error:e.message});next(e)}
 });return r;
}
