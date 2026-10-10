import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {clientRoutes} from '../src/client-routes.js';

const leadId='c1274c3c-a2e1-4bd6-b6ce-3ab2cf1d0477';
const ownerId='4fd393e7-8681-4224-b6b4-f10f452d7487';
async function run({enabled=true,owner=true,method='POST',path='/from-lead/'+leadId,queries=async()=>({rowCount:1,rows:[]}),body={}}={}){
  const previousClient=process.env.CLIENT_MANAGEMENT_ENABLED;
  const previousLead=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.CLIENT_MANAGEMENT_ENABLED=enabled?'true':'false';
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const calls=[],releases=[];
  const client={
    query:async(sql,params)=>{calls.push({sql,params});return queries(sql,params);},
    release:broken=>releases.push(broken)
  };
  const app=express();app.use(express.json());
  app.use('/api/admin/clients',clientRoutes({
    pool:{connect:async()=>client,query:client.query},
    requireOwner:(req,res,next)=>owner?(req.owner={id:ownerId},next()):res.status(403).json({error:'Owner only'})
  }));
  app.use((_error,_req,res,_next)=>res.status(500).json({error:'Internal server error'}));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/clients'+path,{
      method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})
    });
    return {status:response.status,json:await response.json(),calls,releases};
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previousClient===undefined)delete process.env.CLIENT_MANAGEMENT_ENABLED;
    else process.env.CLIENT_MANAGEMENT_ENABLED=previousClient;
    if(previousLead===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previousLead;
  }
}
test('client management disabled by default blocks database access',async()=>{
  const r=await run({enabled:false,queries:()=>{throw Error('must not query');}});
  assert.equal(r.status,503);assert.equal(r.calls.length,0);
});
test('client conversion denies non-owner without touching database',async()=>{
  const r=await run({owner:false,queries:()=>{throw Error('must not query');}});
  assert.equal(r.status,403);assert.equal(r.calls.length,0);
});
test('client conversion rejects invalid request before acquiring database connection',async()=>{
  const r=await run({path:'/from-lead/invalid',queries:()=>{throw Error('must not query');}});
  assert.equal(r.status,400);assert.equal(r.calls.length,0);
});
test('won lead converts once with row lock and one transaction',async()=>{
  const r=await run({queries:async sql=>{
    if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{status:'won',name:' Client ',email:'client@example.com',phone:null}]};
    if(sql.startsWith('SELECT id FROM public.crm_clients'))return {rowCount:0,rows:[]};
    if(sql.startsWith('INSERT'))return {rowCount:1,rows:[{id:'new-client'}]};
    return {rowCount:0,rows:[]};
  }});
  assert.equal(r.status,201);assert.equal(r.json.clientId,'new-client');
  assert.deepEqual(r.calls.map(c=>c.sql.split(' ')[0]),['BEGIN','SELECT','SELECT','INSERT','COMMIT']);
  assert.match(r.calls[1].sql,/FOR UPDATE/);
  assert.deepEqual(r.releases,[false]);
});
test('duplicate conversion returns conflict and rolls back',async()=>{
  const r=await run({queries:async sql=>{
    if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{status:'won',name:'Client',email:'client@example.com'}]};
    if(sql.startsWith('SELECT id FROM public.crm_clients'))return {rowCount:1,rows:[{id:'existing'}]};
    return {rowCount:0,rows:[]};
  }});
  assert.equal(r.status,409);assert.equal(r.json.clientId,'existing');
  assert.deepEqual(r.calls.map(c=>c.sql.split(' ')[0]),['BEGIN','SELECT','SELECT','ROLLBACK']);
});
test('non-won lead cannot be converted',async()=>{
  const r=await run({queries:async sql=>{
    if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{status:'proposal',name:'Client',email:'client@example.com'}]};
    if(sql.startsWith('SELECT id FROM public.crm_clients'))return {rowCount:0,rows:[]};
    return {rowCount:0,rows:[]};
  }});
  assert.equal(r.status,422);
  assert.equal(r.calls.some(c=>c.sql.startsWith('INSERT')),false);
});
test('uncertain commit does not report successful client creation',async()=>{
  const r=await run({queries:async sql=>{
    if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{status:'won',name:'Client',email:'client@example.com'}]};
    if(sql.startsWith('SELECT id FROM public.crm_clients'))return {rowCount:0,rows:[]};
    if(sql.startsWith('INSERT'))return {rowCount:1,rows:[{id:'new-client'}]};
    if(sql==='COMMIT')throw Error('connection lost');
    return {rowCount:0,rows:[]};
  }});
  assert.equal(r.status,503);assert.match(r.json.error,/uncertain/);
  assert.deepEqual(r.releases,[true]);
  assert.equal(r.calls.some(c=>c.sql==='ROLLBACK'),false);
});
test('client list returns Owner-only records',async()=>{
  const r=await run({method:'GET',path:'/',queries:async()=>({rowCount:1,rows:[{id:'client'}]})});
  assert.equal(r.status,200);assert.deepEqual(r.json.clients,[{id:'client'}]);
  assert.equal(r.calls.length,1);
});
