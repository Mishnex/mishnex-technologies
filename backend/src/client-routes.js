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
  router.get('/portal-access',async(_req,res,next)=>{try{
    const r=await pool.query('select a.client_id,a.user_id,c.name from public.crm_client_portal_access a join public.crm_clients c on c.id=a.client_id order by a.created_at desc limit 200');
    res.json({access:r.rows});
  }catch(e){next(e)}});
  router.post('/portal-access',async(req,res,next)=>{
    const parsed=z.object({clientId:z.string().uuid(),userId:z.string().uuid()}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'Valid client and account IDs required.'});
    try{
      const r=await pool.query('insert into public.crm_client_portal_access(client_id,user_id) values($1,$2) on conflict do nothing returning client_id,user_id',[parsed.data.clientId,parsed.data.userId]);
      res.status(r.rowCount?201:200).json({linked:true});
    }catch(e){if(e.code==='23503')return res.status(400).json({error:'Client or authenticated user does not exist.'});next(e)}
  });
  router.post('/portal-access/revoke',async(req,res,next)=>{
    const parsed=z.object({clientId:z.string().uuid(),userId:z.string().uuid()}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'Valid client and account IDs required.'});
    try{const r=await pool.query('delete from public.crm_client_portal_access where client_id=$1 and user_id=$2',[parsed.data.clientId,parsed.data.userId]);res.json({revoked:r.rowCount>0})}catch(e){next(e)}
  });
  router.get('/',async(req,res,next)=>{
    try {
      const result=await pool.query(
        'SELECT id,source_lead_id,name,email,phone,created_at FROM public.crm_clients ORDER BY created_at DESC,id DESC LIMIT 100'
      );
      return res.json({clients:result.rows});
    }catch(error){next(error);}
  });
  router.get('/:clientId/portal-users',async(req,res,next)=>{const id=z.string().uuid().safeParse(req.params.clientId);if(!id.success)return res.status(400).json({error:'Invalid client ID.'});try{const r=await pool.query('select user_id,created_at from public.crm_client_portal_access where client_id=$1 order by created_at desc',[id.data]);res.json({users:r.rows})}catch(e){next(e)}});
  router.post('/:clientId/portal-users',async(req,res,next)=>{const id=z.string().uuid().safeParse(req.params.clientId),body=z.object({userId:z.string().uuid()}).strict().safeParse(req.body);if(!id.success||!body.success)return res.status(400).json({error:'Invalid client or user ID.'});try{const r=await pool.query('insert into public.crm_client_portal_access(client_id,user_id) values($1,$2) on conflict do nothing returning user_id',[id.data,body.data.userId]);res.status(r.rowCount?201:200).json({linked:true})}catch(e){if(e.code==='23503')return res.status(404).json({error:'Client or authentication user not found.'});next(e)}});
  router.delete('/:clientId/portal-users/:userId',async(req,res,next)=>{const id=z.string().uuid().safeParse(req.params.clientId),user=z.string().uuid().safeParse(req.params.userId);if(!id.success||!user.success)return res.status(400).json({error:'Invalid client or user ID.'});try{await pool.query('delete from public.crm_client_portal_access where client_id=$1 and user_id=$2',[id.data,user.data]);res.json({revoked:true})}catch(e){next(e)}});
  router.post('/from-lead/:leadId',async(req,res,next)=>{
    const leadId=z.string().uuid().safeParse(req.params.leadId);
    if(!leadId.success||req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length){
      return res.status(400).json({error:'Invalid client conversion request.'});
    }
    let client,transactionOpen=false,commitAttempted=false,broken=false;
    async function rollbackForResponse(){
      transactionOpen=false;
      broken=true;
      await client.query('ROLLBACK');
      broken=false;
    }
    try {
      client=await pool.connect();
      transactionOpen=true;
      await client.query('BEGIN');
      const lead=await client.query(
        'SELECT id,status,name,email,phone FROM public.crm_leads WHERE id=$1 FOR UPDATE',[leadId.data]
      );
      if(!lead.rowCount){
        await rollbackForResponse();
        return res.status(404).json({error:'Lead not found.'});
      }
      const existing=await client.query(
        'SELECT id FROM public.crm_clients WHERE source_lead_id=$1',[leadId.data]
      );
      if(existing.rowCount){
        await rollbackForResponse();
        return res.status(409).json({error:'Lead has already been converted to a client.',clientId:existing.rows[0].id});
      }
      let details;
      try{details=clientFromLead(lead.rows[0]);}
      catch(error){
        await rollbackForResponse();
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
