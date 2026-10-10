import { Router } from 'express';
import { z } from 'zod';

// Staging ERP owner API. Explicit resource allowlist prevents arbitrary SQL/table access.
export function erpRoutes({pool,requireOwner}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.use(requireOwner);
 const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
 const uuid=z.string().uuid().nullable().optional();
 const positiveId=z.coerce.number().int().positive();
 const specs={
  projects:{table:'crm_projects',fields:{clientId:['client_id',uuid],name:['name',z.string().trim().min(2).max(180)],description:['description',z.string().max(3000)],status:['status',z.enum(['planned','active','on_hold','completed','cancelled'])],dueDate:['due_date',date]}},
  tasks:{table:'crm_project_tasks',fields:{projectId:['project_id',positiveId],title:['title',z.string().trim().min(2).max(180)],assignee:['assignee',uuid],status:['status',z.enum(['todo','in_progress','blocked','done'])],dueDate:['due_date',date]}},
  quotations:{table:'crm_quotations',fields:{clientId:['client_id',uuid],title:['title',z.string().trim().min(2).max(180)],amount:['amount',z.coerce.number().min(0).max(9999999999)],currency:['currency',z.enum(['INR','USD','EUR','GBP'])],status:['status',z.enum(['draft','sent','accepted','rejected'])]}},
  invoices:{table:'crm_invoices',fields:{clientId:['client_id',z.string().uuid()],quotationId:['quotation_id',positiveId.nullable().optional()],amount:['amount',z.coerce.number().min(0).max(9999999999)],paidAmount:['paid_amount',z.coerce.number().min(0).max(9999999999)],currency:['currency',z.enum(['INR','USD','EUR','GBP'])],dueDate:['due_date',date],status:['status',z.enum(['draft','issued','part_paid','paid','void'])]}},
  website:{table:'crm_website_content',fields:{pageKey:['page_key',z.string().regex(/^[a-z0-9_-]{1,80}$/)],sectionKey:['section_key',z.string().regex(/^[a-z0-9_-]{1,80}$/)],content:['content',z.record(z.unknown()).refine(x=>JSON.stringify(x).length<=8000)]}}
 };
 function specFor(req,res){const s=specs[req.params.resource];if(!s){res.status(404).json({error:'Unknown module.'});return null}return s}
 router.get('/invoices/:id/payments',async(req,res,next)=>{const id=positiveId.safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid invoice.'});try{
 const r=await pool.query('select id,invoice_id,amount,reference,note,recorded_at from public.crm_invoice_payments where invoice_id=$1 order by id desc',[id.data]);res.json({payments:r.rows});
 }catch(e){next(e)}});
 router.post('/invoices/:id/payments',async(req,res,next)=>{const id=positiveId.safeParse(req.params.id),body=z.object({amount:z.coerce.number().positive().max(9999999999),reference:z.string().trim().min(3).max(120),note:z.string().max(1000).default('')}).strict().safeParse(req.body);
 if(!id.success||!body.success)return res.status(400).json({error:'Invalid payment details.'});
 const client=await pool.connect();let committed=false;
 try{await client.query('BEGIN');
 const invoice=await client.query('select id,amount,paid_amount,status from public.crm_invoices where id=$1 for update',[id.data]);
 if(!invoice.rowCount||!['issued','part_paid'].includes(invoice.rows[0].status)){await client.query('ROLLBACK');return res.status(409).json({error:'Invoice must be issued and unpaid.'})}
 const i=invoice.rows[0],amount=Math.round(body.data.amount*100),due=Math.round((Number(i.amount)-Number(i.paid_amount))*100);
 if(!Number.isSafeInteger(amount)||amount>due){await client.query('ROLLBACK');return res.status(400).json({error:'Amount exceeds remaining balance.'})}
 const entry=await client.query('insert into public.crm_invoice_payments(invoice_id,amount,reference,note,recorded_by) values($1,$2,$3,$4,$5) returning id,amount,reference,recorded_at',[id.data,body.data.amount,body.data.reference,body.data.note,req.owner.id]);
 const nextPaid=(Math.round(Number(i.paid_amount)*100)+amount)/100;
 await client.query('update public.crm_invoices set paid_amount=$2,status=$3 where id=$1',[id.data,nextPaid,amount===due?'paid':'part_paid']);
 await client.query('COMMIT');committed=true;res.status(201).json({payment:entry.rows[0],paidAmount:nextPaid});
 }catch(e){if(!committed){try{await client.query('ROLLBACK')}catch{}}if(e.code==='23505')return res.status(409).json({error:'Payment reference already recorded for this invoice.'});next(e)}finally{client.release(!committed)}
 });
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
 router.get('/:resource',async(req,res,next)=>{const s=specFor(req,res);if(!s)return;try{
  const sort=req.params.resource==='website'?'updated_at':'id';const r=await pool.query('select * from public.'+s.table+' order by '+sort+' desc limit 100');
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
  try{const r=await pool.query('insert into public.'+s.table+' ('+columns.join(',')+') values ('+params.map((_,i)=>'$'+(i+1)).join(',')+') returning *',params);res.status(201).json({item:r.rows[0]})}
  catch(e){if(['23503','23514','23502','23505','22P02'].includes(e.code))return res.status(400).json({error:'Invalid linked record or field values.'});next(e)}
 });
 router.patch('/:resource/:id',async(req,res,next)=>{const s=specFor(req,res),id=positiveId.safeParse(req.params.id);if(!s)return;if(!id.success)return res.status(400).json({error:'Invalid record ID.'});if(req.params.resource==='website')return res.status(405).json({error:'Website content updates require a page and section key.'});
  const schema=z.object(Object.fromEntries(Object.entries(s.fields).map(([key,[,type]])=>[key,type.optional()]))).strict();
  const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid details.'});
  const entries=Object.entries(parsed.data).filter(([,v])=>v!==undefined);
  if(!entries.length)return res.status(400).json({error:'No changes.'});
  if(req.params.resource==='invoices'&&('paidAmount' in parsed.data||parsed.data.status==='paid'||parsed.data.status==='part_paid'))return res.status(400).json({error:'Payment amounts and paid status require a verified payment workflow.'});
  const columns=entries.map(([key])=>s.fields[key][0]),params=entries.map(([,v])=>v);
  try{const r=await pool.query('update public.'+s.table+' set '+columns.map((col,i)=>col+'=$'+(i+2)).join(',')+' where id=$1 returning *',[id.data,...params]);if(!r.rowCount)return res.status(404).json({error:'Record not found.'});res.json({item:r.rows[0]})}
  catch(e){if(['23503','23514','23502','23505','22P02'].includes(e.code))return res.status(400).json({error:'Invalid linked record or field values.'});next(e)}
 });
 return router;
}
