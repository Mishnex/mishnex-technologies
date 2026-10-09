import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('late Owner login response cannot re-enable submit during a newer attempt',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const start=source.indexOf("loginForm.addEventListener('submit', async event => {");
  const end=source.indexOf("\nasync function loadLeads()",start);
  assert.ok(start>=0&&end>start,'Owner login handler must exist');
  const handlerSource=source.slice(start,end);
  const pending=[];
  const submit={disabled:false};
  const loginMessage={textContent:''};
  const loginScreen={hidden:false};
  const adminApp={hidden:true};
  const loginForm={
    reset(){},
    addEventListener(_event,handler){this.handler=handler;}
  };
  const context={
    loginForm,loginMessage,loginScreen,adminApp,
    ownerLoginRequestId:0,ownerAccessToken:null,
    apiOrigin:'https://example.invalid',
    document:{getElementById(id){
      if(id==='loginSubmit')return submit;
      if(id==='ownerEmail')return {value:'owner@example.com'};
      if(id==='ownerPassword')return {value:'password'};
      throw Error('Unexpected DOM ID: '+id);
    }},
    fetch:()=>new Promise(resolve=>pending.push(resolve)),
    loadLeads:async()=>{}
  };
  vm.createContext(context);
  vm.runInContext(handlerSource,context);
  const first=loginForm.handler({preventDefault(){}});
  assert.equal(submit.disabled,true);
  const second=loginForm.handler({preventDefault(){}});
  assert.equal(submit.disabled,true);
  assert.equal(pending.length,2);
  pending[0]({ok:false,json:async()=>({error:'Old request failed'})});
  await first;
  assert.equal(submit.disabled,true,'stale first request must not unlock the active second login');
  assert.equal(loginMessage.textContent,'Checking credentials...','stale error must not replace active login status');
  pending[1]({ok:false,json:async()=>({error:'Second request failed'})});
  await second;
  assert.equal(submit.disabled,false,'active login completion unlocks submit');
  assert.equal(loginMessage.textContent,'Second request failed');
});

test('stale successful Owner login cannot replace the newer authenticated session',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const start=source.indexOf("loginForm.addEventListener('submit', async event => {");
  const end=source.indexOf("\nasync function loadLeads()",start);
  assert.ok(start>=0&&end>start);
  const pending=[];
  const submit={disabled:false};
  const loginMessage={textContent:''};
  const loginScreen={hidden:false};
  const adminApp={hidden:true};
  let leadsLoaded=0;
  const loginForm={reset(){},addEventListener(_name,handler){this.handler=handler;}};
  const context={
    loginForm,loginMessage,loginScreen,adminApp,
    ownerLoginRequestId:0,ownerAccessToken:null,
    apiOrigin:'https://example.invalid',
    document:{getElementById(id){
      if(id==='loginSubmit')return submit;
      if(id==='ownerEmail')return {value:'owner@example.com'};
      if(id==='ownerPassword')return {value:'password'};
      throw Error('Unexpected DOM ID: '+id);
    }},
    fetch:()=>new Promise(resolve=>pending.push(resolve)),
    loadLeads:async()=>{leadsLoaded++;}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const first=loginForm.handler({preventDefault(){}});
  const second=loginForm.handler({preventDefault(){}});
  pending[1]({ok:true,json:async()=>({accessToken:'newer-token'})});
  await second;
  assert.equal(context.ownerAccessToken,'newer-token');
  assert.equal(leadsLoaded,1);
  assert.equal(adminApp.hidden,false);
  assert.equal(submit.disabled,false);
  pending[0]({ok:true,json:async()=>({accessToken:'stale-token'})});
  await first;
  assert.equal(context.ownerAccessToken,'newer-token','older successful response must not replace active credentials');
  assert.equal(leadsLoaded,1,'stale response must not trigger an extra lead request');
});
