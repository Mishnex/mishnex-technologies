import test from 'node:test';
import assert from 'node:assert/strict';
import {canConvertLead,clientFromLead,clientSchema} from '../src/client-workflow.js';

test('only won leads are eligible for client conversion',()=>{
  for(const status of ['new','contacted','qualified','proposal','lost','closed',null])assert.equal(canConvertLead(status),false);
  assert.equal(canConvertLead('won'),true);
});
test('client conversion validates contact details and keeps source immutable',()=>{
  const lead={status:'won',name:'  Test Client  ',email:' test@example.com ',phone:null};
  const client=clientFromLead(lead);
  assert.deepEqual(client,{name:'Test Client',email:'test@example.com',phone:null});
  assert.equal(lead.name,'  Test Client  ');
});
test('client conversion rejects invalid lead data and additional fields',()=>{
  assert.throws(()=>clientFromLead({status:'lost',name:'A',email:'a@example.com'}),/Only won/);
  assert.throws(()=>clientFromLead({status:'won',name:'A',email:'invalid'}),/contact details/);
  assert.equal(clientSchema.safeParse({name:'A',email:'a@example.com',role:'owner'}).success,false);
});
