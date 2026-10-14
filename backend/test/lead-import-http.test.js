import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
import {leadImportRoutes} from '../src/lead-import-routes.js';
import {readSpreadsheet} from '../src/spreadsheet.js';
const data={headers:['Name','Phone','Email','Location'],rows:[['Example Client','9876543210','','Kolkata']],mapping:{name:'Name',phone:'Phone',email:'Email',location:'Location'}};
async function run(path,body,role='owner',query=()=>({rows:[],rowCount:0})){
 const calls=[],db={query:async(sql,p)=>{calls.push({sql,p});return query(sql,p)},release(){}};
 const app=express();app.use(leadImportRoutes({pool:{...db,connect:async()=>db},authorize:(req,res,next)=>{req.actor={id:'11111111-1111-4111-8111-111111111111',role,owner:role==='owner'};next()}}));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'Content-Type':Buffer.isBuffer(body)?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/json'},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});return {status:response.status,body:await response.json(),calls}}finally{await new Promise(r=>server.close(r))}
}
for(const role of ['sales','hr','accountant','manager','developer'])test(role+' cannot preview or commit imports',async()=>{for(const path of ['/preview','/commit']){const r=await run(path,{...data,confirmed:true},role);assert.equal(r.status,403);assert.equal(r.calls.length,0)}});
test('preview detects duplicates without saving',async()=>{const r=await run('/preview',{...data,rows:[...data.rows,...data.rows]});assert.equal(r.status,200);assert.deepEqual(r.body.duplicateRows,[3]);assert.equal(r.calls.some(c=>/insert|update/i.test(c.sql)),false)});
test('ambiguous duplicate headers and reused columns are rejected',async()=>{for(const body of [{...data,headers:['Name','Phone','Phone','Location']},{...data,mapping:{...data.mapping,location:'Name'}}])assert.equal((await run('/preview',body)).status,400)});
test('invalid phone and email reject commit atomically',async()=>{const r=await run('/commit',{...data,rows:[['Example','garbage','bad','City']],confirmed:true});assert.equal(r.status,400);assert.equal(r.calls.length,0)});
for(const role of ['owner','super_admin'])test(role+' imports as excel with attribution and transaction',async()=>{const r=await run('/commit',{...data,confirmed:true},role,sql=>sql.startsWith('insert')?{rows:[{id:'lead'}],rowCount:1}:{rows:[],rowCount:0});assert.equal(r.status,201);assert.equal(r.body.imported,1);assert.match(r.calls.find(c=>c.sql.startsWith('insert')).sql,/'excel'/);assert.equal(r.calls.at(-1).sql,'COMMIT')});
test('batches larger than default JSON limit are parsed',async()=>{const rows=Array.from({length:300},(_,i)=>['Client '+i,String(9876500000+i),'','Kolkata']);const r=await run('/preview',{...data,rows});assert.equal(r.status,200);assert.equal(r.body.total,300)});
test('XLSX preserves text phones and selects worksheets',async()=>{const b=new ExcelJS.Workbook();b.addWorksheet('Instructions').addRow(['Use Leads','Read first']);const s=b.addWorksheet('Leads');s.addRows([data.headers,['Example','009876543210','','Kolkata']]);const r=await readSpreadsheet(await b.xlsx.writeBuffer(),'Leads');assert.equal(r.rows[0][1],'009876543210');assert.deepEqual(r.sheets,['Instructions','Leads']);assert.equal(r.headers[0],'Name')});
test('XLSX formulas and malformed files rejected',async()=>{const b=new ExcelJS.Workbook(),s=b.addWorksheet('Leads');s.addRows([data.headers,['Example',{formula:'1+1',result:2},'','City']]);await assert.rejects(readSpreadsheet(await b.xlsx.writeBuffer()),/formulas/);await assert.rejects(readSpreadsheet(Buffer.from('invalid')),/Cannot read/)});

test('authenticated raw XLSX upload returns actual worksheet contacts',async()=>{const b=new ExcelJS.Workbook();b.addWorksheet('Leads').addRows([data.headers,...data.rows]);const r=await run('/file',Buffer.from(await b.xlsx.writeBuffer()));assert.equal(r.status,200);assert.deepEqual(r.body.rows,data.rows);assert.deepEqual(r.body.headers,data.headers)});
