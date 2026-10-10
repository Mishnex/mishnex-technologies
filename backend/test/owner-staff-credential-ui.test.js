import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('successful employee creation displays one-time password before staff refresh settles',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const start=source.indexOf("staffForm.addEventListener('submit', async event => {");
  const end=source.indexOf("\nconst leadPanel=",start);
  assert.ok(start>=0&&end>start,'employee creation handler must exist');
  let refreshResolve;
  let refreshStarted=false;
  const submit={disabled:false};
  const credentialBox={hidden:true};
  const credentialValue={textContent:''};
  const staffStatus={textContent:''};
  const staffPanel={hidden:false};
  const staffForm={
    reset(){},
    querySelector(){return submit;},
    addEventListener(_event,handler){this.handler=handler;}
  };
  const context={
    staffForm,credentialBox,credentialValue,staffStatus,staffPanel,
    ownerAccessToken:'owner-token',
    FormData:class {constructor(){} *[Symbol.iterator](){yield ['email','staff@example.com'];}},
    staffRequest:async()=>({temporaryPassword:'one-time-secret'}),
    loadStaffPanel:async()=>{refreshStarted=true;await new Promise(resolve=>{refreshResolve=resolve;});}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const pending=staffForm.handler({preventDefault(){}});
  for(let i=0;i<10&&!refreshStarted;i++)await Promise.resolve();
  assert.equal(refreshStarted,true,'refresh should begin after successful provisioning');
  assert.equal(credentialValue.textContent,'one-time-secret','password must display before refresh finishes');
  assert.equal(credentialBox.hidden,false);
  assert.equal(submit.disabled,true,'submit remains locked during refresh');
  refreshResolve();
  await pending;
  assert.equal(credentialBox.hidden,false);
  assert.equal(submit.disabled,false);
});

test('staff refresh rejection does not hide already displayed one-time password',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const start=source.indexOf("staffForm.addEventListener('submit', async event => {");
  const end=source.indexOf("\nconst leadPanel=",start);
  assert.ok(start>=0&&end>start);
  const submit={disabled:false};
  const credentialBox={hidden:true};
  const credentialValue={textContent:''};
  const staffStatus={textContent:''};
  const staffPanel={hidden:false};
  const staffForm={reset(){},querySelector(){return submit;},addEventListener(_event,handler){this.handler=handler;}};
  const context={
    staffForm,credentialBox,credentialValue,staffStatus,staffPanel,
    ownerAccessToken:'owner-token',
    FormData:class {constructor(){} *[Symbol.iterator](){yield ['email','staff@example.com'];}},
    staffRequest:async()=>({temporaryPassword:'one-time-secret'}),
    loadStaffPanel:async()=>{throw new Error('refresh unavailable');}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  await staffForm.handler({preventDefault(){}});
  assert.equal(credentialValue.textContent,'one-time-secret');
  assert.equal(credentialBox.hidden,false);
  assert.match(staffStatus.textContent,/Employee was created successfully/);
  assert.match(staffStatus.textContent,/do not create the employee again/);
  assert.equal(submit.disabled,false);
});

test('employee creation response after logout never reveals temporary password',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const start=source.indexOf("staffForm.addEventListener('submit', async event => {");
  const end=source.indexOf("\nconst leadPanel=",start);
  assert.ok(start>=0&&end>start);
  let resolveCreate;
  let refreshCalls=0;
  const submit={disabled:false};
  const credentialBox={hidden:true};
  const credentialValue={textContent:''};
  const staffStatus={textContent:''};
  const staffPanel={hidden:false};
  const staffForm={reset(){},querySelector(){return submit;},addEventListener(_event,handler){this.handler=handler;}};
  const context={
    staffForm,credentialBox,credentialValue,staffStatus,staffPanel,
    ownerAccessToken:'owner-token',
    FormData:class {constructor(){} *[Symbol.iterator](){yield ['email','staff@example.com'];}},
    staffRequest:()=>new Promise(resolve=>{resolveCreate=resolve;}),
    loadStaffPanel:async()=>{refreshCalls++;}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const pending=staffForm.handler({preventDefault(){}});
  context.ownerAccessToken=null;
  staffPanel.hidden=true;
  resolveCreate({temporaryPassword:'must-not-show'});
  await pending;
  assert.equal(credentialBox.hidden,true);
  assert.equal(credentialValue.textContent,'');
  assert.equal(refreshCalls,0);
  assert.equal(submit.disabled,false);
});

test('employee creation response after leaving Staff panel never reveals temporary password',async()=>{
  const source=readFileSync(new URL('../../assets/js/admin.js',import.meta.url),'utf8');
  const start=source.indexOf("staffForm.addEventListener('submit', async event => {");
  const end=source.indexOf("\nconst leadPanel=",start);
  assert.ok(start>=0&&end>start);
  let resolveCreate;
  const submit={disabled:false};
  const credentialBox={hidden:true};
  const credentialValue={textContent:''};
  const staffStatus={textContent:''};
  const staffPanel={hidden:false};
  const staffForm={reset(){},querySelector(){return submit;},addEventListener(_event,handler){this.handler=handler;}};
  const context={
    staffForm,credentialBox,credentialValue,staffStatus,staffPanel,
    ownerAccessToken:'owner-token',
    FormData:class {constructor(){} *[Symbol.iterator](){yield ['email','staff@example.com'];}},
    staffRequest:()=>new Promise(resolve=>{resolveCreate=resolve;}),
    loadStaffPanel:async()=>{throw Error('should not refresh hidden panel');}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  const pending=staffForm.handler({preventDefault(){}});
  staffPanel.hidden=true;
  resolveCreate({temporaryPassword:'must-not-show'});
  await pending;
  assert.equal(credentialBox.hidden,true);
  assert.equal(credentialValue.textContent,'');
  assert.equal(submit.disabled,false);
});
