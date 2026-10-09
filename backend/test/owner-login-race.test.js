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

test('sign-out resets disabled login and invalidates an outstanding login response',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const signoutStart=source.indexOf('function signOut() {');
  const signoutEnd=source.indexOf("\ndocument.getElementById('signOutButton')",signoutStart);
  const loginStart=source.indexOf("loginForm.addEventListener('submit', async event => {");
  const loginEnd=source.indexOf("\nasync function loadLeads()",loginStart);
  assert.ok(signoutStart>=0&&signoutEnd>signoutStart&&loginStart>=0&&loginEnd>loginStart);
  let resolveFetch;
  const submit={disabled:false};
  const loginMessage={textContent:''};
  const loginScreen={hidden:false};
  const adminApp={hidden:true};
  const loginForm={reset(){},addEventListener(_name,handler){this.handler=handler;}};
  const empty={replaceChildren(){}};
  const context={
    loginForm,loginMessage,loginScreen,adminApp,
    ownerLoginRequestId:0,ownerAccessToken:null,leadListRequestId:0,
    apiOrigin:'https://example.invalid',
    leadResults:empty,staffList:empty,staffStatus:{textContent:''},leadFeedback:{textContent:''},
    credentialBox:{hidden:false},credentialValue:{textContent:'sensitive'},
    staffPanel:{hidden:false},leadPanel:{hidden:false},
    document:{
      getElementById(id){
        if(id==='loginSubmit')return submit;
        if(id==='ownerEmail')return {value:'owner@example.com'};
        if(id==='ownerPassword')return {value:'password'};
        if(id==='liveLeads')return null;
        throw Error('Unexpected DOM ID: '+id);
      },
      querySelector(){return null;}
    },
    fetch:()=>new Promise(resolve=>{resolveFetch=resolve;}),
    loadLeads:async()=>{}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(signoutStart,signoutEnd)+'\n'+source.slice(loginStart,loginEnd),context);
  const pending=context.loginForm.handler({preventDefault(){}});
  assert.equal(submit.disabled,true);
  vm.runInContext('signOut()',context);
  assert.equal(submit.disabled,false,'logout should leave login form usable');
  assert.equal(credentialValue.textContent,'','logout clears temporary credentials');
  resolveFetch({ok:true,json:async()=>({accessToken:'expired-login-response'})});
  await pending;
  assert.equal(context.ownerAccessToken,null,'late response must not restore a logged-out session');
  assert.equal(adminApp.hidden,true);
  assert.equal(submit.disabled,false);
});
