import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { leadWorkflowRoutes } from '../src/lead-routes.js';

const leadId='00000000-0000-4000-8000-000000000011';
const ownerId='00000000-0000-4000-8000-000000000022';

async function request({ enabled, owner=true, body={status:'contacted',note:'Called'}, current='new' }) {
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  const calls=[];
  const releases=[];
  const client={
    query:async (sql,params)=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT status')) return {rowCount:1,rows:[{status:current}]};
      return {rowCount:1,rows:[]};
    },
    release:broken=>releases.push(broken)
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
    return {status:response.status,json:await response.json(),calls,releases};
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

test('lead activity history rejects requests when feature disabled',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='false';
  const app=express();
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{query:async()=>{throw Error('Database must not be called');}},
    requireOwner:(_req,_res,next)=>next()
  }));
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/activity');
    assert.equal(response.status,503);
    assert.equal(response.headers.get('cache-control'),'no-store');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined) delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('lead activity history returns 404 for unknown lead without reading activity',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const queries=[];
  const app=express();
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{query:async(sql,params)=>{
      queries.push(sql);
      assert.deepEqual(params,[leadId]);
      return {rowCount:0,rows:[]};
    }},
    requireOwner:(req,_res,next)=>{req.owner={id:ownerId};next();}
  }));
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/activity');
    assert.equal(response.status,404);
    assert.equal((await response.json()).error,'Lead not found.');
    assert.equal(queries.length,1);
    assert.match(queries[0],/SELECT 1 FROM public.crm_leads/);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined) delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('same-status follow-up saves activity without redundant lead update',async()=>{
  const result=await request({enabled:true,body:{status:'new',note:'Called; awaiting reply'}});
  assert.equal(result.status,200);
  assert.deepEqual(result.calls.map(call=>call.sql.split(' ')[0]),['BEGIN','SELECT','INSERT','COMMIT']);
  assert.deepEqual(result.calls[2].params,[leadId,ownerId,'new','new','Called; awaiting reply']);
});

test('same-status update without note is rejected without activity insert',async()=>{
  const result=await request({enabled:true,body:{status:'new'}});
  assert.equal(result.status,400);
  assert.match(result.json.error,/follow-up note is required/i);
  assert.deepEqual(result.releases,[false],'successful validation rollback returns connection to pool');
  assert.deepEqual(result.calls.map(call=>call.sql.split(' ')[0]),['BEGIN','SELECT','ROLLBACK']);
});

test('lead COMMIT acknowledgement failure returns uncertain outcome instead of claiming rollback',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const calls=[];
  const releases=[];
  const client={
    query:async sql=>{
      calls.push(sql);
      if(sql.startsWith('SELECT status'))return {rowCount:1,rows:[{status:'new'}]};
      if(sql==='COMMIT')throw new Error('commit acknowledgement lost');
      return {rowCount:1,rows:[]};
    },
    release:broken=>releases.push(broken)
  };
  const app=express();
  app.use(express.json());
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{connect:async()=>client},
    requireOwner:(req,_res,next)=>{req.owner={id:ownerId};next();}
  }));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/status',{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'contacted',note:'Called'})
    });
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/outcome is uncertain/i);
    assert.equal(calls.filter(sql=>sql==='COMMIT').length,1);
    assert.deepEqual(releases,[true],'uncertain COMMIT must discard the connection');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('lead status validation rejects unexpected fields, invalid statuses and oversized notes before DB access',async()=>{
  for(const body of [
    {status:'contacted',note:'ok',actor_id:ownerId},
    {status:'unreviewed'},
    {status:'contacted',note:'x'.repeat(2001)},
    {status:'contacted',note:'   '}
  ]){
    const result=await request({enabled:true,body});
    assert.equal(result.status,400,JSON.stringify(body).slice(0,100));
    assert.deepEqual(result.calls,[],'invalid payload must not begin a transaction');
    assert.deepEqual(result.releases,[],'invalid payload must not acquire a connection');
  }
});

test('lead activity history returns ordered records only for the requested lead',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const queries=[];
  const expected=[{id:8,from_status:'new',to_status:'contacted',note:'Called',created_at:'2026-10-09T12:00:00Z'}];
  const app=express();
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{query:async(sql,params)=>{
      queries.push({sql,params});
      if(sql.startsWith('SELECT 1 FROM public.crm_leads'))return {rowCount:1,rows:[{one:1}]};
      return {rowCount:1,rows:expected};
    }},
    requireOwner:(req,_res,next)=>{req.owner={id:ownerId};next();}
  }));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/activity');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{leadId,activity:expected});
    assert.equal(queries.length,2);
    assert.deepEqual(queries.map(query=>query.params),[[leadId],[leadId]]);
    assert.match(queries[1].sql,/ORDER BY a.created_at DESC,a.id DESC LIMIT 100/);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('non-owner cannot read lead activity or trigger database queries',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const app=express();
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{query:async()=>{throw Error('Unauthorized database access');}},
    requireOwner:(_req,res)=>res.status(403).json({error:'Owner only'})
  }));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/activity');
    assert.equal(response.status,403);
    assert.equal((await response.json()).error,'Owner only');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('lead transaction rollback failure discards broken PostgreSQL connection',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const calls=[],releases=[];
  const client={
    query:async sql=>{
      calls.push(sql);
      if(sql.startsWith('SELECT status'))return {rowCount:1,rows:[{status:'new'}]};
      if(sql==='ROLLBACK')throw new Error('connection lost during rollback');
      return {rowCount:1,rows:[]};
    },
    release:broken=>releases.push(broken)
  };
  const app=express();
  app.use(express.json());
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{connect:async()=>client},
    requireOwner:(req,_res,next)=>{req.owner={id:ownerId};next();}
  }));
  app.use((_error,_req,res,_next)=>res.status(500).json({error:'Internal server error'}));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/status',{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'won'})
    });
    assert.equal(response.status,500);
    assert.deepEqual(calls.map(sql=>sql.split(' ')[0]),['BEGIN','SELECT','ROLLBACK']);
    assert.deepEqual(releases,[true],'failed rollback must discard the client');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('lead activity insert failure rolls back the status update and reuses healthy connection',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const calls=[],releases=[];
  const client={
    query:async(sql,params)=>{
      calls.push({sql,params});
      if(sql.startsWith('SELECT status'))return {rowCount:1,rows:[{status:'new'}]};
      if(sql.startsWith('INSERT INTO public.crm_lead_activity'))throw new Error('activity insert rejected');
      return {rowCount:1,rows:[]};
    },
    release:broken=>releases.push(broken)
  };
  const app=express();
  app.use(express.json());
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{connect:async()=>client},
    requireOwner:(req,_res,next)=>{req.owner={id:ownerId};next();}
  }));
  app.use((_error,_req,res,_next)=>res.status(500).json({error:'Internal server error'}));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/status',{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'contacted',note:'Called'})
    });
    assert.equal(response.status,500);
    assert.deepEqual(calls.map(call=>call.sql.split(' ')[0]),['BEGIN','SELECT','UPDATE','INSERT','ROLLBACK']);
    assert.deepEqual(releases,[false],'successful rollback may reuse the connection');
    assert.equal(calls.some(call=>call.sql==='COMMIT'),false,'failed activity insert must not commit the lead status');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});

test('missing lead returns 404 and closes transaction without writing activity',async()=>{
  const previous=process.env.LEAD_WORKFLOW_ENABLED;
  process.env.LEAD_WORKFLOW_ENABLED='true';
  const calls=[],releases=[];
  const client={
    query:async sql=>{
      calls.push(sql);
      if(sql.startsWith('SELECT status'))return {rowCount:0,rows:[]};
      return {rowCount:1,rows:[]};
    },
    release:broken=>releases.push(broken)
  };
  const app=express();
  app.use(express.json());
  app.use('/api/admin/lead-workflow',leadWorkflowRoutes({
    pool:{connect:async()=>client},
    requireOwner:(req,_res,next)=>{req.owner={id:ownerId};next();}
  }));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/lead-workflow/'+leadId+'/status',{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'contacted'})
    });
    assert.equal(response.status,404);
    assert.deepEqual(calls.map(sql=>sql.split(' ')[0]),['BEGIN','SELECT','ROLLBACK']);
    assert.deepEqual(releases,[false]);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined)delete process.env.LEAD_WORKFLOW_ENABLED;
    else process.env.LEAD_WORKFLOW_ENABLED=previous;
  }
});
