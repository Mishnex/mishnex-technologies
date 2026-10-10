import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {erpRoutes} from '../src/erp-routes.js';
import {rolePermissions} from '../src/staff-permissions.js';
async function run({role='owner',path='/projects',method='GET',body,query=()=>({rowCount:1,rows:[]})}={}){
 const calls=[],app=express();app.use(express.json());app.use(erpRoutes({pool:{query:async(sql,params)=>{calls.push({sql,params});return query(sql,params)}},authorize:(req,res,next)=>{req.actor={id:'actor',role,owner:role==='owner',permissions:rolePermissions[role]||[]};next()}}));app.use((err,req,res,next)=>res.status(500).json({error:err.message}));const server=app.listen(0,'127.0.0.1');try{await new Promise(r=>server.once('listening',r));const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),calls}}finally{await new Promise(r=>server.close(r))}
}
test('Accountant cannot read projects',async()=>{const r=await run({role:'accountant'});assert.equal(r.status,403);assert.equal(r.calls.length,0)});
test('Sales cannot change invoice or website',async()=>{for(const path of ['/invoices/1','/website/section']){const r=await run({role:'sales',path,method:'PATCH',body:{amount:1}});assert.equal(r.status,403);assert.equal(r.calls.length,0)}});
test('Developer project reads are scoped to assigned tasks',async()=>{const r=await run({role:'developer'});assert.equal(r.status,200);assert.match(r.calls[0].sql,/where assignee=\$1/);assert.deepEqual(r.calls[0].params,['actor'])});
test('Developer cannot reassign a task',async()=>{const r=await run({role:'developer',path:'/tasks/1',method:'PATCH',body:{assignee:'11dcb25b-f1d8-4722-ad06-a0449d82362e'}});assert.equal(r.status,403);assert.equal(r.calls.length,0)});
test('Developer task status update checks assignee in SQL',async()=>{const r=await run({role:'developer',path:'/tasks/1',method:'PATCH',body:{status:'done'}});assert.equal(r.status,200);assert.match(r.calls[0].sql,/and assignee=\$3/);assert.equal(r.calls[0].params[2],'actor')});
test('Sales normal quotations can be sent but discounted and below-floor need Owner',async()=>{for(const [amount,discountPercent,status] of [[100,0,201],[20,0,409],[100,5,409]]){const r=await run({role:'sales',path:'/quotations',method:'POST',body:{clientId:'11dcb25b-f1d8-4722-ad06-a0449d82362e',title:'Website',amount,discountPercent,status:'sent'},query:sql=>sql.includes('crm_business_policy')?{rowCount:1,rows:[{quotation_floors:{INR:50}}]}:{rowCount:1,rows:[{id:1}]}});assert.equal(r.status,status)}});
test('legacy direct ledger write cannot bypass review audit',async()=>{const r=await run({path:'/invoices/1/payments',method:'POST',body:{amount:10,reference:'UPI123'}});assert.equal(r.status,409);assert.equal(r.calls.length,0)});
