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
 router.get('/reports/overview',async(_req,res,next)=>{try{
 const r=await pool.query(`select
 (select count(*)::int from public.crm_leads) leads,
 (select count(*)::int from public.crm_clients) clients,
 (select count(*)::int from public.crm_projects) projects,
 (select count(*)::int from public.crm_project_tasks) tasks,
 (select count(*)::int from public.crm_project_tasks where status='done') completed_tasks,
 (select count(*)::int from public.crm_staff where is_active) active_staff,
 (select count(*)::int from public.crm_hr_leave_requests where status='pending') pending_leaves,
 (select coalesce(sum(amount),0) from public.crm_invoices where status<>'void') invoiced,
 (select coalesce(sum(paid_amount),0) from public.crm_invoices where status<>'void') received`);
 res.json({report:r.rows[0]});
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
  const entries=Object.entries(parsed.data).filter(([,v])=>v!==undefined);
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
  const columns=entries.map(([key])=>s.fields[key][0]),params=entries.map(([,v])=>v);
  try{const r=await pool.query('update public.'+s.table+' set '+columns.map((col,i)=>col+'=$'+(i+2)).join(',')+' where id=$1 returning *',[id.data,...params]);if(!r.rowCount)return res.status(404).json({error:'Record not found.'});res.json({item:r.rows[0]})}
  catch(e){if(['23503','23514','23502','23505','22P02'].includes(e.code))return res.status(400).json({error:'Invalid linked record or field values.'});next(e)}
 });
 return router;
}
