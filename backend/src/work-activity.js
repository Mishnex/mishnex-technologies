import {transaction} from './transaction.js';
export async function recordWork(client,actor,resource,item,action){
 await client.query('insert into public.crm_staff_work_activity(actor_id,action,resource,record_id,detail) values($1,$2,$3,$4,$5)',[actor.id,action,resource,item.id,JSON.stringify({title:item.title||item.name||'',status:item.status||''})]);
}
export async function workMutation(pool,actor,resource,sql,params,action){
 return transaction(pool,async client=>{
  let previous;
  if(resource==='tasks'&&action==='updated'){
   const r=await client.query('select * from public.crm_project_tasks where id=$1'+(actor.role==='developer'?' and assignee=$2':'')+' for update',actor.role==='developer'?[params[0],actor.id]:[params[0]]);previous=r.rows[0];
  }
  const result=await client.query(sql,params);
  if(result.rows[0]&&['projects','tasks','invoices','quotations'].includes(resource)&&!(resource==='quotations'&&action==='created')){
   const item=result.rows[0];const clean=row=>JSON.stringify(Object.fromEntries(Object.entries(row||{}).filter(([key])=>key!=='updated_at').sort(([a],[b])=>a.localeCompare(b))));
   if(!previous||clean(previous)!==clean(item))await recordWork(client,actor,resource,item,resource==='tasks'&&item.status==='done'&&previous?.status!=='done'?'completed':action);
  }
  return result;
 });
}
