import test from 'node:test';
import assert from 'node:assert/strict';
import {readinessHandler,releaseTables} from '../src/readiness.js';
async function check(query,stopping=()=>false){
 const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await readinessHandler({query},stopping)({},res);return res;
}
test('readiness checks the release schema with a bounded database query',async()=>{
 const r=await check(async options=>{assert.deepEqual(options.values,[releaseTables]);assert.equal(options.query_timeout,5000);return {rows:[{schema_ready:true}]}});
 assert.equal(r.code,200);assert.deepEqual(r.body,{status:'ready'});assert.equal(r.headers['Cache-Control'],'no-store');
});
test('missing migrations or unavailable database report unavailable without details',async()=>{
 for(const query of [async()=>({rows:[{schema_ready:false}]}),async()=>{throw Error('sensitive connection details')}]){
  const r=await check(query);assert.equal(r.code,503);assert.deepEqual(r.body,{status:'unavailable'});
 }
});
test('draining server is not ready and does not acquire a connection',async()=>{
 const r=await check(async()=>{throw Error('must not query')},()=>true);assert.equal(r.code,503);
});
