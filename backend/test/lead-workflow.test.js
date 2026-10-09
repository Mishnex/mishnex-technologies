import test from 'node:test';
import assert from 'node:assert/strict';
import { leadStatuses, leadUpdateSchema, canTransitionLead } from '../src/lead-workflow.js';

test('Module 2 lead statuses are explicit', () => {
  assert.deepEqual(leadStatuses, ['new','contacted','qualified','proposal','won','lost']);
});

test('lead status updates accept a bounded optional note', () => {
  assert.equal(leadUpdateSchema.safeParse({status:'qualified',note:' Follow-up completed '}).data.note,'Follow-up completed');
  assert.equal(leadUpdateSchema.safeParse({status:'qualified',extra:'unexpected'}).success,false);
  assert.equal(leadUpdateSchema.safeParse({status:'qualified',note:'x'.repeat(2001)}).success,false);
  assert.equal(leadUpdateSchema.safeParse({status:'unknown'}).success,false);
});

test('lead workflow blocks skipped and terminal transitions', () => {
  assert.equal(canTransitionLead('new','contacted'),true);
  assert.equal(canTransitionLead('new','won'),false);
  assert.equal(canTransitionLead('contacted','qualified'),true);
  assert.equal(canTransitionLead('qualified','proposal'),true);
  assert.equal(canTransitionLead('proposal','won'),true);
  assert.equal(canTransitionLead('won','contacted'),false);
  assert.equal(canTransitionLead('lost','new'),false);
  assert.equal(canTransitionLead('garbage','new'),false);
});
