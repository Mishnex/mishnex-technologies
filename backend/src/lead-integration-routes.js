import express,{Router} from 'express';
import {createHmac,timingSafeEqual} from 'node:crypto';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {externalLeadSchema,saveExternalLead} from './lead-ingestion.js';
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);}
export function signed(body,signature,secret){return !!secret&&Buffer.isBuffer(body)&&equal(signature,'sha256='+createHmac('sha256',secret).update(body).digest('hex'));}
export function leadIntegrationRoutes({pool,env=process.env,fetchLead=fetch}){
 const r=Router();r.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
 r.get('/meta',(req,res)=>{if(!env.META_VERIFY_TOKEN)return res.status(503).json({error:'Meta integration is not configured.'});if(req.query['hub.mode']!=='subscribe'||typeof req.query['hub.verify_token']!=='string'||!equal(req.query['hub.verify_token'],env.META_VERIFY_TOKEN)||typeof req.query['hub.challenge']!=='string')return res.sendStatus(403);res.type('text/plain').send(req.query['hub.challenge'])});
 r.use(express.raw({type:'application/json',limit:'256kb'}));
 r.post('/connected/:source',async(req,res,next)=>{
  const source=req.params.source;let configs;try{configs=JSON.parse(env.LEAD_SOURCE_SECRETS||'{}')}catch{return res.status(503).json({error:'Source configuration is invalid.'})}
  const secret=Object.hasOwn(configs,source)&&configs[source];if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'This source is not connected.'});
  if(!signed(req.body,req.get('X-Lead-Signature'),secret))return res.sendStatus(401);
  let body;try{body=JSON.parse(req.body.toString('utf8'))}catch{return res.sendStatus(400)}
  const parsed=z.object({eventId:z.string().min(1).max(180),lead:externalLeadSchema}).strict().safeParse(body);if(!parsed.success)return res.status(400).json({error:'Invalid lead fields. Name and phone are required.'});
  try{const saved=await saveExternalLead(pool,'integration',source+':'+parsed.data.eventId,parsed.data.lead);res.status(201).json({received:true,...saved})}catch(e){next(e)}
 });
 r.post('/meta',async(req,res,next)=>{
  if(!env.META_APP_SECRET||!env.META_PAGE_ACCESS_TOKEN||!env.META_GRAPH_API_VERSION||!env.META_PAGE_IDS)return res.status(503).json({error:'Meta integration is not configured.'});
  if(!signed(req.body,req.get('X-Hub-Signature-256'),env.META_APP_SECRET))return res.sendStatus(401);
  let body;try{body=JSON.parse(req.body.toString('utf8'))}catch{return res.sendStatus(400)}
  if(body.object!=='page'||!Array.isArray(body.entry)||body.entry.length>100)return res.sendStatus(400);
  const pages=env.META_PAGE_IDS.split(',').map(v=>v.trim());
  try{for(const entry of body.entry){if(!pages.includes(String(entry.id)))continue;for(const change of entry.changes||[]){if(change.field!=='leadgen')continue;const id=String(change.value?.leadgen_id||'');if(!/^\d+$/.test(id))return res.sendStatus(400);
   const existing=await pool.query("select lead_id from public.crm_lead_ingestion_events where source in ('facebook','instagram') and external_id=$1",[id]);if(existing.rowCount)continue;
   if(!/^v\d+\.\d+$/.test(env.META_GRAPH_API_VERSION))return res.status(503).json({error:'Invalid Graph API version.'});
   const url=new URL('https://graph.facebook.com/'+env.META_GRAPH_API_VERSION+'/'+id);url.searchParams.set('fields','id,field_data,platform');
   const response=await fetchLead(url,{headers:{Authorization:'Bearer '+env.META_PAGE_ACCESS_TOKEN},signal:AbortSignal.timeout(8000)});if(!response.ok)return res.status(502).json({error:'Meta lead retrieval failed; delivery can be retried.'});
   const record=await response.json(),fields=Object.fromEntries((record.field_data||[]).map(x=>[x.name,String(x.values?.[0]||'')]));
   const candidate={name:fields.full_name||[fields.first_name,fields.last_name].filter(Boolean).join(' '),phone:fields.phone_number||'',email:fields.email||'',location:fields.city||fields.location||'Not provided',requirement:fields.requirement||'Meta lead form enquiry'};
   const parsed=externalLeadSchema.safeParse(candidate);if(!parsed.success)return res.status(422).json({error:'Meta form must supply a valid name and phone. Configure the form fields before retrying.'});
   await saveExternalLead(pool,record.platform==='instagram'?'instagram':'facebook',id,parsed.data);
  }}res.json({received:true})}catch(e){next(e)}
 });return r;
}
