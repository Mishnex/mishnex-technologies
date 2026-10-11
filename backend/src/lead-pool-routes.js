import {Router} from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {transaction,reject} from './transaction.js';
export const managementOnly=(req,res,next)=>req.actor.owner||req.actor.role==='super_admin'?next():res.status(403).json({error:'Owner or Super Admin access required.'});
const contact=z.object({name:z.string().trim().min(2).max(100),email:z.union([z.string().trim().email().max(254),z.string().trim().length(0)]).optional().default(''),phone:z.string().trim().min(7).max(20),location:z.string().trim().min(2).max(180),service:z.string().trim().min(2).max(120).default('External enquiry'),requirement:z.string().trim().min(3).max(3000).default('Manual sales contact')}).strict();
const close=z.object({remarks:z.string().trim().min(3).max(2000),outcome:z.enum(['connected','no_answer','busy','wrong_number','not_interested','follow_up','converted'])}).strict();
export function leadPoolRoutes({pool,authorize}){
 const r=Router();r.use(authorize);r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const activeSQL='select a.id as assignment_id,a.created_at as assigned_at,l.* from public.crm_lead_assignments a join public.crm_leads l on l.id=a.lead_id where a.actor_id=$1 and a.closed_at is null';
 r.get('/mine',async(req,res,next)=>{try{res.json({lead:(await pool.query(activeSQL,[req.actor.id])).rows[0]||null})}catch(e){next(e)}});
 r.post('/generate',async(req,res,next)=>{try{const lead=await transaction(pool,async c=>{
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,731))',[req.actor.id]);
  const old=await c.query(activeSQL,[req.actor.id]);if(old.rowCount)return old.rows[0];
  const row=await c.query("select l.* from public.crm_leads l where l.source='manual' and l.removed_at is null and l.status='new' and not exists(select 1 from public.crm_lead_assignments a where a.lead_id=l.id) order by l.created_at,l.id for update of l skip locked limit 1");
  if(!row.rowCount)reject(409,'No unassigned leads available. Ask management to add contacts.');
  const a=await c.query('insert into public.crm_lead_assignments(lead_id,actor_id) values($1,$2) returning id,created_at',[row.rows[0].id,req.actor.id]);
  return {...row.rows[0],assignment_id:a.rows[0].id,assigned_at:a.rows[0].created_at};
 });res.json({lead})}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}});
 r.post('/:id/close',async(req,res,next)=>{const p=close.safeParse(req.body),id=z.coerce.number().int().positive().safeParse(req.params.id);if(!p.success||!id.success)return res.status(400).json({error:'Choose an outcome and enter remarks (at least 3 characters).'});try{await transaction(pool,async c=>{
  const a=await c.query('select * from public.crm_lead_assignments where id=$1 and actor_id=$2 for update',[id.data,req.actor.id]);if(!a.rowCount)reject(404,'Your assignment was not found.');if(a.rows[0].closed_at)reject(409,'Lead already closed.');
  await c.query('update public.crm_lead_assignments set closed_at=now(),remarks=$2,outcome=$3 where id=$1',[id.data,p.data.remarks,p.data.outcome]);
  await c.query("insert into public.crm_staff_call_activity(actor_id,lead_id,request_id,kind,outcome,duration_seconds,note) select $1,$2,$3,$4,$5,0,$6 where not exists(select 1 from public.crm_staff_call_activity c join public.crm_lead_assignments a on a.lead_id=c.lead_id and a.actor_id=c.actor_id where a.id=$7 and c.kind='call' and c.created_at>=a.created_at)",[req.actor.id,a.rows[0].lead_id,randomUUID(),'call',p.data.outcome==='converted'?'connected':p.data.outcome,p.data.remarks,id.data]);
 });res.json({closed:true})}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}});
 r.get('/contacts',managementOnly,async(req,res,next)=>{const source=req.query.source==='manual'?'manual':'website',page=z.coerce.number().int().min(1).safe().safeParse(req.query.page||1);if(!page.success)return res.status(400).json({error:'Invalid page.'});try{const rows=await pool.query('select l.*,a.actor_id,a.created_at as assigned_at,a.closed_at,a.remarks,a.outcome,s.full_name as assigned_to,s.employee_code,m.sent_at as email_sent_at,m.last_error as email_error from public.crm_leads l left join public.crm_lead_assignments a on a.lead_id=l.id left join public.crm_staff s on s.user_id=a.actor_id left join public.crm_enquiry_mail_outbox m on m.lead_id=l.id where l.source=$1 and l.removed_at is null order by l.created_at desc,l.id limit 200 offset $2',[source,(page.data-1)*200]);res.json({contacts:rows.rows,limit:200,page:page.data})}catch(e){next(e)}});
 r.post('/contacts',managementOnly,async(req,res,next)=>{const p=z.object({contacts:z.array(contact).min(1)}).strict().safeParse(req.body);if(!p.success)return res.status(400).json({error:'Enter valid client name, phone and location. Email is optional, but must be valid when provided.'});try{const ids=await transaction(pool,async c=>{const ids=[];for(const d of p.data.contacts){const row=await c.query("insert into public.crm_leads(name,email,phone,service,requirement,source,created_by,location) values($1,$2,$3,$4,$5,'manual',$6,$7) returning id",[d.name,d.email,d.phone,d.service,d.requirement,req.actor.id,d.location]);ids.push(row.rows[0].id)}return ids});res.status(201).json({ids})}catch(e){next(e)}});
 r.delete('/contacts/:id',managementOnly,async(req,res,next)=>{const p=z.string().uuid().safeParse(req.params.id);if(!p.success)return res.status(400).json({error:'Invalid contact.'});try{const q=await pool.query('update public.crm_leads set removed_at=now(),removed_by=$2 where id=$1 and removed_at is null returning id',[p.data,req.actor.id]);if(!q.rowCount)return res.status(404).json({error:'Contact not found.'});res.json({removed:true})}catch(e){next(e)}});
 return r;
}
