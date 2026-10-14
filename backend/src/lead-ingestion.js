import {z} from 'zod';
import {transaction} from './transaction.js';
export const externalLeadSchema=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().max(20).regex(/^\+?[0-9 ()-]+$/).refine(v=>v.replace(/\D/g,'').length>=7),email:z.union([z.string().trim().email().max(254),z.literal('')]).default(''),location:z.string().trim().max(180).default('Not provided'),service:z.string().trim().min(2).max(120).default('External enquiry'),requirement:z.string().trim().min(3).max(3000).default('Connected source enquiry')}).strict();
// All connected-source retries are identified by source + external ID.
export async function saveExternalLead(pool,source,eventId,data){
 return transaction(pool,async c=>{
  await c.query('select pg_advisory_xact_lock(73120261014)');
  const old=await c.query('select lead_id from public.crm_lead_ingestion_events where source=$1 and external_id=$2',[source,eventId]);
  if(old.rowCount)return {leadId:old.rows[0].lead_id,duplicate:true};
  const match=await c.query("select id from public.crm_leads where removed_at is null and regexp_replace(phone,'[^0-9]','','g')=$1 limit 1",[data.phone.replace(/\D/g,'')]);
  let id=match.rows[0]?.id;
  if(!id){const saved=await c.query('insert into public.crm_leads(name,email,phone,location,service,requirement,source) values($1,$2,$3,$4,$5,$6,$7) returning id',[data.name,data.email,data.phone,data.location,data.service,data.requirement,source]);id=saved.rows[0].id;}
  await c.query('insert into public.crm_lead_ingestion_events(source,external_id,lead_id) values($1,$2,$3)',[source,eventId,id]);
  return {leadId:id,duplicate:!!match.rowCount};
 });
}
