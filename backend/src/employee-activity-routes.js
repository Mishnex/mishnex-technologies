import {Router} from 'express';
import {z} from 'zod';
import {transaction,reject} from './transaction.js';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x=>!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x);
const logSchema=z.object({requestId:z.string().uuid(),leadId:z.string().uuid(),kind:z.enum(['call','follow_up']),outcome:z.enum(['connected','no_answer','busy','wrong_number','not_interested','follow_up']),durationSeconds:z.number().int().min(0).max(86400).default(0),note:z.string().trim().min(3).max(2000),nextFollowUp:date.nullable().default(null)}).strict();
export function employeeActivityRoutes({pool,authorize}){
 const r=Router();r.use(authorize);r.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 const leadAccess=(req,res,next)=>req.actor.owner||req.actor.permissions.includes('leads:read')?next():res.status(403).json({error:'Lead access required.'});
 r.post('/calls',leadAccess,async(req,res,next)=>{
  const p=logSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Check call outcome, note, duration and follow-up date.'});
  try{const d=p.data,result=await transaction(pool,async client=>{
   const lead=await client.query('select id from public.crm_leads where id=$1',[d.leadId]);if(!lead.rowCount)reject(404,'Lead not found.');
   const values=[req.actor.id,d.leadId,d.requestId,d.kind,d.outcome,d.durationSeconds,d.note,d.nextFollowUp];
   const saved=await client.query('insert into public.crm_staff_call_activity(actor_id,lead_id,request_id,kind,outcome,duration_seconds,note,next_follow_up) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(actor_id,request_id) do nothing returning *',values);
   if(saved.rowCount)return{activity:saved.rows[0],created:true};
   const old=(await client.query('select *,next_follow_up::text as next_follow_up from public.crm_staff_call_activity where actor_id=$1 and request_id=$2',[req.actor.id,d.requestId])).rows[0];
   if(!old||old.lead_id!==d.leadId||old.kind!==d.kind||old.outcome!==d.outcome||Number(old.duration_seconds)!==d.durationSeconds||old.note!==d.note||(old.next_follow_up?String(old.next_follow_up).slice(0,10):null)!==d.nextFollowUp)reject(409,'This request was already saved with different details.');
   return{activity:old,created:false};
  });res.status(result.created?201:200).json(result)}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}
 });
 r.get('/calls',leadAccess,async(req,res,next)=>{try{const result=await pool.query('select a.*,l.name as lead_name from public.crm_staff_call_activity a join public.crm_leads l on l.id=a.lead_id where a.actor_id=$1 order by a.created_at desc,a.id desc limit 100',[req.actor.id]);res.json({activities:result.rows})}catch(e){next(e)}});
 r.get('/report',async(req,res,next)=>{
  if(!req.actor.owner)return res.status(403).json({error:'Owner access required.'});
  const p=z.object({from:date,to:date,employeeId:z.string().uuid().optional()}).strict().safeParse(req.query);
  if(!p.success||p.data.to<p.data.from||Date.parse(p.data.to)-Date.parse(p.data.from)>366*86400000)return res.status(400).json({error:'Choose a valid date range of up to 366 days.'});
  const {from,to,employeeId}=p.data,params=[from+'T00:00:00+05:30',to+'T00:00:00+05:30',process.env.OWNER_USER_ID,employeeId||null];
  try{
   const summary=await pool.query(`with people as (
    select user_id,employee_code,full_name,role,is_active from public.crm_staff
    union all select $3::uuid,'MISH-OWN-000001','Owner','owner',true where not exists(select 1 from public.crm_staff where user_id=$3::uuid)
   ), calls as (select actor_id,count(*) filter(where kind='call')::int calls_logged,count(*) filter(where kind='call' and outcome='connected')::int connected_calls,count(*) filter(where kind='follow_up')::int follow_ups,coalesce(sum(duration_seconds) filter(where kind='call'),0)::bigint call_seconds from public.crm_staff_call_activity where created_at >= $1::timestamptz and created_at < $2::timestamptz+interval '1 day' group by actor_id), quotes as (select created_by,count(*)::int quotations_created,count(*) filter(where status in ('sent','accepted'))::int quotations_shared from public.crm_quotations where created_at >= $1::timestamptz and created_at < $2::timestamptz+interval '1 day' group by created_by), work as (select actor_id,count(*) filter(where resource='tasks' and action in ('updated','completed'))::int task_updates,count(*) filter(where resource='tasks' and action='completed')::int tasks_completed,count(*) filter(where resource='projects' and action='created')::int projects_created,count(*) filter(where resource='invoices' and action='created')::int invoices_created from public.crm_staff_work_activity where created_at >= $1::timestamptz and created_at < $2::timestamptz+interval '1 day' group by actor_id), leads as (select actor_id,count(*)::int lead_updates from public.crm_lead_activity where created_at >= $1::timestamptz and created_at < $2::timestamptz+interval '1 day' group by actor_id)
    select p.*,coalesce(c.calls_logged,0) calls_logged,coalesce(c.connected_calls,0) connected_calls,coalesce(c.follow_ups,0) follow_ups,coalesce(c.call_seconds,0) call_seconds,coalesce(q.quotations_created,0) quotations_created,coalesce(q.quotations_shared,0) quotations_shared,coalesce(w.task_updates,0) task_updates,coalesce(w.tasks_completed,0) tasks_completed,coalesce(w.projects_created,0) projects_created,coalesce(w.invoices_created,0) invoices_created,coalesce(l.lead_updates,0) lead_updates from people p left join calls c on c.actor_id=p.user_id left join quotes q on q.created_by=p.user_id left join work w on w.actor_id=p.user_id left join leads l on l.actor_id=p.user_id where ($4::uuid is null or p.user_id=$4::uuid) order by p.full_name`,params);
   const history=await pool.query(`with events as (
    select actor_id,created_at,kind as action,'Lead call / follow-up' as module,lead_id::text as record_id,jsonb_build_object('outcome',outcome,'note',note,'durationSeconds',duration_seconds,'nextFollowUp',next_follow_up) as detail from public.crm_staff_call_activity
    union all select created_by,created_at,'created','Quotation',quotation_code,jsonb_build_object('title',title,'amount',amount,'currency',currency,'status',status) from public.crm_quotations where created_by is not null
    union all select actor_id,created_at,action,resource,record_id::text,detail from public.crm_staff_work_activity
    union all select actor_id,created_at,'status / note','Lead',lead_id::text,jsonb_build_object('from',from_status,'to',to_status,'note',note) from public.crm_lead_activity)
    select e.*,s.full_name,s.employee_code from events e left join public.crm_staff s on s.user_id=e.actor_id where e.created_at >= $1::timestamptz and e.created_at < $2::timestamptz+interval '1 day' and ($3::uuid is null or e.actor_id=$3::uuid) order by e.created_at desc,e.module,e.record_id limit 200`,[params[0],params[1],employeeId||null]);
   res.json({summary:summary.rows,history:history.rows,timezone:'Asia/Kolkata',historyLimit:200,message:'Calls are employee-reported logs, not automatic phone records. Task and other work events start when tracking is enabled; earlier quotations and lead updates use existing records.'});
  }catch(e){next(e)}
 });return r;
}
