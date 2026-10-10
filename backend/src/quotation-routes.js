import {Router} from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {quotationSchema,quotationTotals} from './quotation-workflow.js';
import {transaction,reject} from './transaction.js';
import {permit} from './workspace-auth.js';
const quoteId=z.coerce.number().int().positive();
const hash=token=>createHash('sha256').update(token).digest('hex');
export function quotationRoutes({pool,authorize}){
 const r=Router();r.use(authorize);r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const writable=(req,res,next)=>req.actor.owner||req.actor.permissions.some(p=>['quotations:create','quotations:manage'].includes(p))?next():res.status(403).json({error:'Quotation creation access required.'});
 r.get('/',permit('quotations:read'),async(req,res,next)=>{try{const result=await pool.query('select id,quotation_code,title,client_name,client_email,client_phone,amount,currency,status,requires_approval,approved_by,advance_percent,advance_amount,created_at from public.crm_quotations order by id desc limit 100');res.json({quotations:result.rows})}catch(e){next(e)}});
 r.post('/',writable,async(req,res,next)=>{
  const parsed=quotationSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Check client details, item names, prices and quantities.'});
  try{const d=parsed.data,t=quotationTotals(d);if(t.amount<=0)return res.status(400).json({error:'Quotation total must be greater than zero.'});
   const quote=await transaction(pool,async client=>{
    const policy=await client.query('select quotation_floors,advance_percent from public.crm_business_policy where singleton for share');if(!policy.rowCount)reject(503,'Business policy is not configured.');
    const needsApproval=!req.actor.owner&&(t.amount<Number(policy.rows[0].quotation_floors[d.currency]||0)||d.discountPercent>0);
    if(needsApproval&&d.status==='sent')reject(409,'Discount or below-minimum price requires Owner approval. Save as draft.');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[d.clientEmail]);
    let clientId=d.clientId;
    if(clientId){const existing=await client.query('select id,email from public.crm_clients where id=$1',[clientId]);if(!existing.rowCount||existing.rows[0].email.toLowerCase()!==d.clientEmail)reject(400,'Selected client email does not match. Select the right client or choose New client.');}
    else{const existing=await client.query('select id from public.crm_clients where lower(email)=$1 order by created_at limit 2',[d.clientEmail]);if(existing.rowCount>1)reject(409,'Several clients use this email. Select the intended client.');if(existing.rowCount)clientId=existing.rows[0].id;else{const created=await client.query('insert into public.crm_clients(name,email,phone,created_by) values($1,$2,$3,$4) returning id',[d.clientName,d.clientEmail,d.clientPhone,req.actor.id]);clientId=created.rows[0].id;}}
    const result=await client.query(`insert into public.crm_quotations(client_id,title,amount,currency,status,discount_percent,requires_approval,created_by,client_name,client_email,client_phone,items,subtotal,discount_amount,advance_percent,notes)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id,quotation_code,title,amount,currency,status,requires_approval`,[clientId,d.title,t.amount,d.currency,d.status,d.discountPercent,needsApproval,req.actor.id,d.clientName,d.clientEmail,d.clientPhone,JSON.stringify(t.items),t.subtotal,t.discountAmount,policy.rows[0].advance_percent,d.notes]);return result.rows[0];
   });res.status(201).json({quotation:quote});
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(e.message==='Quotation total is too large.')return res.status(400).json({error:e.message});next(e)}
 });
 r.post('/:id/share',writable,async(req,res,next)=>{
  const id=quoteId.safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid quotation.'});
  try{const token=randomBytes(32).toString('base64url');await transaction(pool,async client=>{
   const q=await client.query('select status,requires_approval,approved_by,created_by from public.crm_quotations where id=$1 for update',[id.data]);if(!q.rowCount)reject(404,'Quotation not found.');const row=q.rows[0];
   if(!req.actor.owner&&row.created_by!==req.actor.id)reject(403,'Only the creating salesman or Owner may share this quotation.');
   if(!['sent','accepted'].includes(row.status)||(row.requires_approval&&!row.approved_by))reject(409,'Send or approve this quotation before sharing.');
   await client.query("update public.crm_quotations set share_token_hash=$2,share_expires_at=now()+interval '30 days' where id=$1",[id.data,hash(token)]);
  });res.json({path:'/quotation#'+token,expiresInDays:30,message:'Anyone with this link can view this quotation. Keep it private. Generating a new link disables the previous one.'});
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}
 });
 r.delete('/:id/share',writable,async(req,res,next)=>{const id=quoteId.safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid quotation.'});try{const result=await pool.query('update public.crm_quotations set share_token_hash=null,share_expires_at=null where id=$1 and ($2 or created_by=$3) returning id',[id.data,req.actor.owner,req.actor.id]);if(!result.rowCount)return res.status(404).json({error:'Quotation not found.'});res.json({revoked:true})}catch(e){next(e)}});
 return r;
}
export {hash as quotationTokenHash};
