import { Router } from 'express';
import { z } from 'zod';
import {transaction,reject} from './transaction.js';

// Staging ERP owner API. Explicit resource allowlist prevents arbitrary SQL/table access.
export function erpRoutes({pool,requireOwner,authorize}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.use(authorize||requireOwner);
 router.use((req,res,next)=>{
  if(!authorize){req.actor={id:req.owner.id,role:'owner',owner:true,permissions:[]};return next()}
  if(req.actor.owner){req.owner={id:req.actor.id};return next()}
  const resource=req.path.split('/')[1];if(resource==='lookups'&&req.method==='GET'&&req.actor.permissions.some(p=>['quotations:read','projects:read','payments:read'].includes(p)))return next();const permission={projects:'projects:read',tasks:'projects:read',quotations:'quotations:read',invoices:'payments:read',reports:'reports:read'}[resource];
  if(req.method==='GET'&&permission&&req.actor.permissions.includes(permission))return next();
  if(resource==='quotations'&&req.method==='POST'&&(req.actor.permissions.includes('quotations:create')||req.actor.permissions.includes('quotations:manage')))return next();
  if(resource==='tasks'&&req.method==='PATCH'&&req.actor.role==='developer')return next();
  if(['projects','tasks'].includes(resource)&&['POST','PATCH'].includes(req.method)&&req.actor.permissions.includes('projects:manage'))return next();
  return res.status(403).json({error:'Insufficient permissions.'});
 });
 const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
 const uuid=z.string().uuid().nullable().optional();
 const positiveId=z.coerce.number().int().positive();
 const specs={
  projects:{table:'crm_projects',fields:{clientId:['client_id',uuid],name:['name',z.string().trim().min(2).max(180)],description:['description',z.string().max(3000)],status:['status',z.enum(['planned','active','on_hold','completed','cancelled'])],dueDate:['due_date',date]}},
  tasks:{table:'crm_project_tasks',fields:{projectId:['project_id',positiveId],title:['title',z.string().trim().min(2).max(180)],assignee:['assignee',uuid],status:['status',z.enum(['todo','in_progress','blocked','done'])],dueDate:['due_date',date]}},
  quotations:{table:'crm_quotations',fields:{clientId:['client_id',uuid],title:['title',z.string().trim().min(2).max(180)],discountPercent:['discount_percent',z.coerce.number().min(0).max(100)],amount:['amount',z.coerce.number().min(0).max(9999999999)],currency:['currency',z.enum(['INR','USD','EUR','GBP'])],status:['status',z.enum(['draft','sent','accepted','rejected'])]}},
  invoices:{table:'crm_invoices',fields:{clientId:['client_id',z.string().uuid()],quotationId:['quotation_id',positiveId.nullable().optional()],amount:['amount',z.coerce.number().min(0).max(9999999999)],paidAmount:['paid_amount',z.coerce.number().min(0).max(9999999999)],currency:['currency',z.enum(['INR','USD','EUR','GBP'])],dueDate:['due_date',date],status:['status',z.enum(['draft','issued','part_paid','paid','void'])]}},
  website:{table:'crm_website_content',fields:{pageKey:['page_key',z.string().regex(/^[a-z0-9_-]{1,80}$/)],sectionKey:['section_key',z.string().regex(/^[a-z0-9_-]{1,80}$/)],content:['content',z.record(z.unknown()).refine(x=>JSON.stringify(x).length<=8000)]}}
 };
 function specFor(req,res){const s=specs[req.params.resource];if(!s){res.status(404).json({error:'Unknown module.'});return null}return s}
 router.get('/invoices/:id/payments',async(req,res,next)=>{const id=positiveId.safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid invoice.'});try{
 const r=await pool.query('select id,invoice_id,amount,reference,note,recorded_at from public.crm_invoice_payments where invoice_id=$1 order by id desc',[id.data]);res.json({payments:r.rows});
 }catch(e){next(e)}});
 router.post('/invoices/:id/payments',(_req,res)=>res.status(409).json({error:'Use payment review to approve a submitted payment with an audit trail.'}));
 router.get('/reports/overview',async(_req,res,next)=>{try{
 const r=await pool.query(`select
 (select count(*)::int from public.crm_leads) leads,
 (select count(*)::int from public.crm_clients) clients,
 (select count(*)::int from public.crm_projects) projects,
 (select count(*)::int from public.crm_project_tasks) tasks,
 (select count(*)::int from public.crm_project_tasks where status='done') completed_tasks,
 (select count(*)::int from public.crm_staff where is_active) active_staff,
 (select count(*)::int from public.crm_hr_leave_requests where status='pending') pending_leaves,
 (select count(*)::int from public.crm_invoices where status not in ('paid','void')) open_invoices`);
 const financial=await pool.query(`select currency,coalesce(sum(amount),0)::text invoiced,coalesce(sum(paid_amount),0)::text received,coalesce(sum(amount-paid_amount),0)::text outstanding from public.crm_invoices where status<>'void' group by currency order by currency`);
 res.json({report:r.rows[0],financial:financial.rows});
 }catch(e){next(e)}});
 router.put('/website/section',async(req,res,next)=>{const parsed=z.object({pageKey:z.string().regex(/^[a-z0-9_-]{1,80}$/),sectionKey:z.string().regex(/^[a-z0-9_-]{1,80}$/),content:z.record(z.unknown()).refine(x=>JSON.stringify(x).length<=8000)}).strict().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid content.'});try{
 const d=parsed.data;
 const r=await pool.query(`insert into public.crm_website_content(page_key,section_key,content,updated_by)
 values($1,$2,$3,$4) on conflict(page_key,section_key) do update set content=excluded.content,updated_by=excluded.updated_by,updated_at=now() returning *`,[d.pageKey,d.sectionKey,d.content,req.owner.id]);
 res.json({item:r.rows[0]});
 }catch(e){next(e)}});
 router.get('/lookups',async(req,res,next)=>{try{
  const clients=req.actor.owner||req.actor.permissions.some(p=>['quotations:read','projects:manage','payments:read'].includes(p))?await pool.query('select id,name from public.crm_clients order by name limit 200'):{rows:[]};
  const projects=req.actor.owner||req.actor.permissions.includes('projects:read')?await pool.query('select id,name from public.crm_projects'+(req.actor.role==='developer'?' where id in(select project_id from public.crm_project_tasks where assignee=$1)':'')+' order by id desc limit 200',req.actor.role==='developer'?[req.actor.id]:[]):{rows:[]};
  const staff=req.actor.owner||req.actor.permissions.includes('projects:manage')?await pool.query('select user_id,full_name from public.crm_staff where is_active order by full_name limit 200'):{rows:[]};
  const quotations=req.actor.owner||req.actor.permissions.includes('quotations:read')?await pool.query("select id,title,client_id,amount,currency from public.crm_quotations where status='accepted' order by id desc limit 200"):{rows:[]};
  res.json({clients:clients.rows,projects:projects.rows,staff:staff.rows,quotations:quotations.rows});
 }catch(e){next(e)}});
 router.get('/:resource',async(req,res,next)=>{const s=specFor(req,res);if(!s)return;try{
  const sort=req.params.resource==='website'?'updated_at':'id';
  const scoped=req.actor.role==='developer'&&['projects','tasks'].includes(req.params.resource);
  const where=scoped?(req.params.resource==='tasks'?' where assignee=$1':' where id in(select project_id from public.crm_project_tasks where assignee=$1)'):'';
  const r=await pool.query('select * from public.'+s.table+where+' order by '+sort+' desc limit 100',scoped?[req.actor.id]:[]);
  res.json({items:r.rows});
 }catch(e){next(e)}});
 router.post('/:resource',async(req,res,next)=>{const s=specFor(req,res);if(!s)return;
  const schema=z.object(Object.fromEntries(Object.entries(s.fields).map(([key,[,type]])=>[key,type.optional()]))).strict();
  const parsed=schema.safeParse(req.body);
  if(!parsed.success||!Object.keys(parsed.data).length)return res.status(400).json({error:'Invalid or empty details.'});
  const required={projects:['name'],tasks:['projectId','title'],quotations:['title','amount'],invoices:['clientId','amount'],website:['pageKey','sectionKey','content']};
  if(required[req.params.resource].some(key=>parsed.data[key]===undefined))return res.status(400).json({error:'Missing required fields.'});
  const entries=Object.entries(parsed.data).filter(([,v])=>v!==undefined);
  if(req.params.resource==='invoices'&&('paidAmount' in parsed.data||parsed.data.status==='paid'||parsed.data.status==='part_paid'))return res.status(400).json({error:'Use a verified payment workflow to record payments.'});
  if(req.params.resource==='invoices'&&parsed.data.paidAmount!==undefined&&parsed.data.amount!==undefined&&parsed.data.paidAmount>parsed.data.amount)return res.status(400).json({error:'Paid amount exceeds invoice amount.'});
  const columns=entries.map(([key])=>s.fields[key][0]),params=entries.map(([,v])=>v);
  try{
   if(req.params.resource==='quotations'){
    if(!parsed.data.clientId)return res.status(400).json({error:'Select a client for the quotation.'});
    const policy=await pool.query('select quotation_floors from public.crm_business_policy where singleton');
    if(!policy.rowCount)return res.status(503).json({error:'Business policy is not configured.'});
    const floor=Number(policy.rows[0].quotation_floors[parsed.data.currency||'INR']||0),needsApproval=!req.actor.owner&&(parsed.data.amount<floor||(parsed.data.discountPercent||0)>0);
    if(!req.actor.owner&&!['draft','sent',undefined].includes(parsed.data.status))return res.status(403).json({error:'Only Owner may accept or reject quotations.'});
    if(needsApproval&&parsed.data.status==='sent')return res.status(409).json({error:'Below-floor quotation needs Owner approval before sending. Save it as a draft.'});
    columns.push('created_by','requires_approval');params.push(req.actor.id,needsApproval);
   }
   if(req.params.resource==='invoices'&&parsed.data.quotationId){
    const quote=await pool.query('select client_id,currency,amount,status from public.crm_quotations where id=$1',[parsed.data.quotationId]);
    const q=quote.rows[0];if(!q||q.client_id!==parsed.data.clientId||q.currency.trim()!==(parsed.data.currency||'INR')||Number(q.amount)!==parsed.data.amount||q.status!=='accepted')return res.status(400).json({error:'Invoice must match an accepted quotation for the same client, amount and currency.'});
   }
   const r=await pool.query('insert into public.'+s.table+' ('+columns.join(',')+') values ('+params.map((_,i)=>'$'+(i+1)).join(',')+') returning *',params);res.status(201).json({item:r.rows[0]})}
  catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(['23503','23514','23502','23505','22P02'].includes(e.code))return res.status(400).json({error:'Invalid linked record or field values.'});next(e)}
 });
 router.patch('/:resource/:id',async(req,res,next)=>{const s=specFor(req,res),id=positiveId.safeParse(req.params.id);if(!s)return;if(!id.success)return res.status(400).json({error:'Invalid record ID.'});if(req.params.resource==='website')return res.status(405).json({error:'Website content updates require a page and section key.'});
  const schema=z.object(Object.fromEntries(Object.entries(s.fields).map(([key,[,type]])=>[key,type.optional()]))).strict();
  const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid details.'});
  const entries=Object.entries(parsed.data).filter(([,v])=>v!==undefined);
  if(!entries.length)return res.status(400).json({error:'No changes.'});
  if(req.params.resource==='invoices'&&('paidAmount' in parsed.data||parsed.data.status==='paid'||parsed.data.status==='part_paid'))return res.status(400).json({error:'Payment amounts and paid status require a verified payment workflow.'});
  const columns=entries.map(([key])=>s.fields[key][0]),params=entries.map(([,v])=>v);
  try{
   if(req.params.resource==='quotations'&&parsed.data.status==='sent'){columns.push('approved_by');params.push(req.actor.id);}
   if(req.params.resource==='invoices'){
    const item=await transaction(pool,async client=>{
     const current=await client.query('select status,paid_amount from public.crm_invoices where id=$1 for update',[id.data]);
     if(!current.rowCount)reject(404,'Invoice not found.');const invoice=current.rows[0];
     if(invoice.status!=='draft'&&['clientId','quotationId','amount','currency'].some(k=>k in parsed.data))reject(409,'Issued invoice financial details are immutable.');
     if(parsed.data.status&&parsed.data.status!==invoice.status){
      const allowed=invoice.status==='draft'?['issued','void']:invoice.status==='issued'&&Number(invoice.paid_amount)===0?['void']:[];
      if(!allowed.includes(parsed.data.status))reject(409,'Invoice status change is not allowed. Paid status is managed by payment review.');
     }
     if(parsed.data.quotationId)reject(409,'Linked quotation cannot be changed. Create a corrected draft invoice.');
     const result=await client.query('update public.crm_invoices set '+columns.map((col,i)=>col+'=$'+(i+2)).join(',')+' where id=$1 returning *',[id.data,...params]);return result.rows[0];
    });return res.json({item});
   }
   if(req.actor.role==='developer'){
    if(Object.keys(parsed.data).some(k=>k!=='status'))return res.status(403).json({error:'Developers may update only their assigned task status.'});
    const r=await pool.query('update public.crm_project_tasks set status=$2 where id=$1 and assignee=$3 returning *',[id.data,parsed.data.status,req.actor.id]);if(!r.rowCount)return res.status(404).json({error:'Assigned task not found.'});return res.json({item:r.rows[0]});
   }
   const r=await pool.query('update public.'+s.table+' set '+columns.map((col,i)=>col+'=$'+(i+2)).join(',')+' where id=$1 returning *',[id.data,...params]);if(!r.rowCount)return res.status(404).json({error:'Record not found.'});res.json({item:r.rows[0]})}
  catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(['23503','23514','23502','23505','22P02'].includes(e.code))return res.status(400).json({error:'Invalid linked record or field values.'});next(e)}
 });
 return router;
}
