import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { leadWorkflowRoutes } from '../src/lead-routes.js';

const leadId='00000000-0000-4000-8000-000000000011';
const ownerId='00000000-0000-4000-8000-000000000022';

async function request({ enabled, owner=true, body={status:'contacted',note:'Called'}, current='new' }) {
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  const calls=[];
  const client={
    query:async (sql,params)=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT status')) return {rowCount:1,rows:[{status:current}]};
      return {rowCount:1,rows:[]};
    },
    release:()=>{}
  };
  const app=express();
  app.use(express.json());
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{connect:async()=>client},
    requireOwner:(req,res,next)=>owner?(req.owner={id:ownerId},next()):res.status(403).json({error:'Owner only'})
  }));
  process.env.LEAD_WORKFLOW_ENABLED=enabled?'true':'false';
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/status',{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)
    });
    return {status:response.status,json:await response.json(),calls};
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined) delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
}

test('lead update feature flag denies all database work',async()=>{
  const result=await request({enabled:false});
  assert.equal(result.status,503);
  assert.equal(result.calls.length,0);
});
test('lead update requires Owner authorization',async()=>{
  const result=await request({enabled:true,owner:false});
  assert.equal(result.status,403);
  assert.equal(result.calls.length,0);
});
test('lead update records status and history in one transaction',async()=>{
  const result=await request({enabled:true});
  assert.equal(result.status,200);
  assert.deepEqual(result.calls.map(call=>call.sql.split(' ')[0]),['BEGIN','SELECT','UPDATE','INSERT','COMMIT']);
  assert.deepEqual(result.calls[3].params,[leadId,ownerId,'new','contacted','Called']);
});
test('lead update rejects invalid transition without writes',async()=>{
  const result=await request({enabled:true,body:{status:'won'}});
  assert.equal(result.status,409);
  assert.deepEqual(result.calls.map(call=>call.sql.split(' ')[0]),['BEGIN','SELECT','ROLLBACK']);
});
