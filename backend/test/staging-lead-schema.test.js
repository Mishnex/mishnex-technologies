import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLeadSchema } from '../scripts/staging-lead-schema.js';

const rows=[
  {table_name:'crm_leads',column_name:'id',data_type:'uuid'},
  {table_name:'crm_leads',column_name:'status',data_type:'character varying'},
  {table_name:'crm_lead_activity',column_name:'id',data_type:'bigint'},
  {table_name:'crm_lead_activity',column_name:'lead_id',data_type:'uuid'},
  {table_name:'crm_lead_activity',column_name:'actor_id',data_type:'uuid'},
  {table_name:'crm_lead_activity',column_name:'from_status',data_type:'text'},
  {table_name:'crm_lead_activity',column_name:'to_status',data_type:'text'},
  {table_name:'crm_lead_activity',column_name:'note',data_type:'text'},
  {table_name:'crm_lead_activity',column_name:'created_at',data_type:'timestamp with time zone'}
];
test('Module 2 staging schema accepts expected column layout',()=>{
  assert.equal(inspectLeadSchema(rows),true);
});
test('Module 2 staging schema fails closed when activity table is missing',()=>{
  assert.throws(()=>inspectLeadSchema(rows.filter(row=>row.table_name!=='crm_lead_activity')),/crm_lead_activity.lead_id/);
});
test('Module 2 staging schema rejects wrong lead UUID type',()=>{
  assert.throws(()=>inspectLeadSchema(rows.map(row=>row.table_name==='crm_leads'&&row.column_name==='id'?{...row,data_type:'integer'}:row)),/UUID/);
});
