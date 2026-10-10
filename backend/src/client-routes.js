import { Router } from 'express';
import { z } from 'zod';
import { clientFromLead } from './client-workflow.js';

// Separate opt-in gate: no client reads or writes until reviewed staging migration.
export function clientRoutes({pool,requireOwner}) {
  const router=Router();
  router.use((_req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(process.env.CLIENT_MANAGEMENT_ENABLED!=='true'||process.env.LEAD_WORKFLOW_ENABLED!=='true'){
      return res.status(503).json({error:'Client management is not enabled.'});
    }
    next();
  });
  router.use(requireOwner);
  router.get('/',async(req,res,next)=>{
    try {
      const result=await pool.query(
        'SELECT id,source_lead_id,name,email,phone,created_at FROM public.crm_clients ORDER BY created_at DESC,id DESC LIMIT 100'
      );
      return res.json({clients:result.rows});
    }catch(error){next(error);}
  });
  router.post('/from-lead/:leadId',async(req,res,next)=>{
    const leadId=z.string().uuid().safeParse(req.params.leadId);
    if(!leadId.success||req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length){
      return res.status(400).json({error:'Invalid client conversion request.'});
    }
    let client,transactionOpen=false,commitAttempted=false,broken=false;
    try {
      client=await pool.connect();
      transactionOpen=true;
      await client.query('BEGIN');
      const lead=await client.query(
        'SELECT id,status,name,email,phone FROM public.crm_leads WHERE id=$1 FOR UPDATE',[leadId.data]
      );
      if(!lead.rowCount){
        await client.query('ROLLBACK');transactionOpen=false;
        return res.status(404).json({error:'Lead not found.'});
      }
      const existing=await client.query(
        'SELECT id FROM public.crm_clients WHERE source_lead_id=$1',[leadId.data]
      );
      if(existing.rowCount){
        await client.query('ROLLBACK');transactionOpen=false;
        return res.status(409).json({error:'Lead has already been converted to a client.',clientId:existing.rows[0].id});
      }
      let details;
      try{details=clientFromLead(lead.rows[0]);}
      catch(error){
        await client.query('ROLLBACK');transactionOpen=false;
        return res.status(422).json({error:error.message});
      }
      const inserted=await client.query(
        `INSERT INTO public.crm_clients(source_lead_id,name,email,phone,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [leadId.data,details.name,details.email,details.phone??null,req.owner.id]
      );
      commitAttempted=true;
      await client.query('COMMIT');transactionOpen=false;
      return res.status(201).json({clientId:inserted.rows[0].id,sourceLeadId:leadId.data});
    }catch(error){
      if(client&&transactionOpen&&!commitAttempted){
        try{await client.query('ROLLBACK');transactionOpen=false;}
        catch(rollbackError){broken=true;console.error('Client conversion rollback failed:',rollbackError.message);}
      }
      if(commitAttempted){
        broken=true;
        return res.status(503).json({error:'Client conversion outcome is uncertain. Refresh the client list before retrying.'});
      }
      if(error.code==='23505')return res.status(409).json({error:'Lead has already been converted to a client.'});
      next(error);
    }finally{client?.release(broken||transactionOpen);}
  });
  return router;
}
