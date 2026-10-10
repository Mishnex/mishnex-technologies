// Read-only Module 2 schema preflight. Never applies migrations or writes data.
import pg from 'pg';
import { assertStagingTarget } from '../test-support/staging-guard.js';

export function inspectLeadSchema(rows) {
  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name,new Map());
    byTable.get(row.table_name).set(row.column_name,row);
  }
  const lead = byTable.get('crm_leads');
  const activity = byTable.get('crm_lead_activity');
  const required = {
    crm_leads:['id','status'],
    crm_lead_activity:['id','lead_id','actor_id','from_status','to_status','note','created_at']
  };
  const missing=[];
  for (const [table,columns] of Object.entries(required)) {
    const actual=byTable.get(table);
    for(const column of columns)if(!actual?.has(column))missing.push(table+'.'+column);
  }
  if(missing.length)throw new Error('Staging lead workflow schema missing: '+missing.join(', '));
  if(lead.get('id').data_type!=='uuid'||activity.get('lead_id').data_type!=='uuid'||activity.get('actor_id').data_type!=='uuid') {
    throw new Error('Staging lead workflow requires UUID lead and actor IDs');
  }
  if(activity.get('created_at').data_type!=='timestamp with time zone') {
    throw new Error('Staging activity timestamps must include time zone');
  }
  return true;
}

async function main() {
  assertStagingTarget(process.env);
  const client=new pg.Client({
    connectionString:process.env.DATABASE_URL,
    connectionTimeoutMillis:8000,
    ssl:{rejectUnauthorized:true}
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result=await client.query(`
      SELECT table_name,column_name,data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('crm_leads','crm_lead_activity')
      ORDER BY table_name,column_name
    `);
    inspectLeadSchema(result.rows);
    const constraints=await client.query(`
      SELECT conname,contype,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid='public.crm_lead_activity'::regclass
    `);
    if(!constraints.rows.some(row=>row.contype==='f'&&row.definition.includes('crm_leads'))) {
      throw new Error('Staging lead activity foreign key to crm_leads missing');
    }
    const security=await client.query(`
      SELECT relrowsecurity FROM pg_class WHERE oid='public.crm_lead_activity'::regclass
    `);
    if(security.rows[0]?.relrowsecurity!==true)throw new Error('Staging lead activity RLS must be enabled');
    await client.query('ROLLBACK');
    console.log('Module 2 isolated staging schema verified (read-only).');
  } finally {
    await client.end().catch(()=>{});
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(error=>{console.error('Module 2 staging schema check failed:',error.message);process.exitCode=1;});
}
