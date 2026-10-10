import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {portalRoutes} from '../src/portal-routes.js';
const actor='11dcb25b-f1d8-4722-ad06-a0449d82362e';
async function run({path='/invoices/1/payments',method='POST',body={amount:30,reference:'UPI123'},rows=[],enabled=true}={}){
 const oldFetch=global.fetch,oldUrl=process.env.SUPABASE_URL,oldFlag=process.env.PAYMENT_REVIEW_ENABLED;process.env.SUPABASE_URL='https://example.supabase.co';process.env.PAYMENT_REVIEW_ENABLED=String(enabled);global.fetch=async()=>({ok:true,json:async()=>({id:actor})});const calls=[],client={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:rows.length,rows}},release:()=>{}};
 const app=express();app.use(express.json());app.use(portalRoutes({pool:{query:client.query,connect:async()=>client}}));app.use((err,req,res,next)=>res.status(500).json({error:err.message}));const server=app.listen(0,'127.0.0.1');try{await new Promise(r=>server.once('listening',r));const response=await oldFetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer valid'},...(method==='POST'?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),calls}}finally{await new Promise(r=>server.close(r));global.fetch=oldFetch;for(const [key,value] of [['SUPABASE_URL',oldUrl],['PAYMENT_REVIEW_ENABLED',oldFlag]]){if(value===undefined)delete process.env[key];else process.env[key]=value}}
}
test('unknown or other-client invoice cannot receive a submission',async()=>{const r=await run();assert.equal(r.status,404);const lookup=r.calls.find(c=>c.sql.includes('select i.id'));assert.match(lookup.sql,/a.user_id=\$2/);assert.equal(lookup.params[1],actor);assert.equal(r.calls.some(c=>c.sql.startsWith('insert')),false)});
test('other-client receipt is absent and membership-scoped',async()=>{const r=await run({path:'/payments/1/receipt',method:'GET'});assert.equal(r.status,404);assert.match(r.calls[0].sql,/a.user_id=\$2/);assert.equal(r.calls[0].params[1],actor)});
test('client payment history cannot read another clients records',async()=>{const r=await run({path:'/clients/11dcb25b-f1d8-4722-ad06-a0449d82362e/payments',method:'GET'});assert.equal(r.status,200);assert.deepEqual(r.data.payments,[]);assert.match(r.calls[0].sql,/a.client_id=i.client_id and a.user_id=\$2/)});
test('disabled client payment feature blocks DB',async()=>{const r=await run({enabled:false});assert.equal(r.status,503);assert.equal(r.calls.length,0)});
