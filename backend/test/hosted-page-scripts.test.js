import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {createHash} from 'node:crypto';
import {pageSecurity} from '../src/page-security.js';
for(const name of ['admin-panel','client-portal','staff-login','forgot-password','reset-password','quotation'])test(name+' hosted script parses and is allowed by its CSP',async()=>{
 const page=await readFile(new URL('../public/'+name+'.html',import.meta.url),'utf8');
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length);
 const csp=pageSecurity(page,{supabase:name==='reset-password'});
 for(const [,script] of scripts){assert.doesNotThrow(()=>new Script(script));assert.ok(csp.includes("'sha256-"+createHash('sha256').update(script).digest('base64')+"'"))}
 assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));
});
test('staff and recovery routes explicitly override Helmet CSP with script hashes',async()=>{const server=await readFile(new URL('../src/server.js',import.meta.url),'utf8');for(const name of ['staff-login','forgot-password','reset-password']){const handler=server.slice(server.indexOf("app.get('/"+name+"'"));assert.match(handler.split('});')[0],/pageSecurity\(page/)} });
