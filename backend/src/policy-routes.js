import {transaction} from './transaction.js';
import { Router } from 'express';
import { z } from 'zod';
export function policyRoutes({pool,requireOwner}) {
 const router=Router();router.use(requireOwner);
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.get('/',async(_req,res,next)=>{try{const r=await pool.query('select advance_percent,upi_id,upi_secondary_id,upi_receiver_name,quotation_floors,updated_at from public.crm_business_policy where singleton');res.json({policy:r.rows[0]})}catch(e){next(e)}});
 router.put('/',async(req,res,next)=>{
  const floor=z.number().min(0).max(9999999999);
  const body=z.object({advancePercent:z.number().min(0).max(100),upiId:z.string().trim().max(100).refine(x=>x===''||/^[\w.\-]+@[\w.\-]+$/.test(x)),upiSecondaryId:z.string().trim().max(100).refine(x=>x===''||/^[\w.\-]+@[\w.\-]+$/.test(x)).optional(),upiReceiverName:z.string().trim().max(120).optional(),quotationFloors:z.object({INR:floor,USD:floor,EUR:floor,GBP:floor}).strict()}).strict().safeParse(req.body);
  if(!body.success)return res.status(400).json({error:'Invalid advance, UPI ID or quotation floor.'});
  try{const d=body.data;const r=await transaction(pool,async client=>{const before=await client.query('select advance_percent from public.crm_business_policy where singleton for update');const r=await client.query('update public.crm_business_policy set advance_percent=$1,upi_id=$2,quotation_floors=$3,updated_by=$4,upi_secondary_id=coalesce($5,upi_secondary_id),upi_receiver_name=coalesce($6,upi_receiver_name),updated_at=now() where singleton returning advance_percent,upi_id,upi_secondary_id,upi_receiver_name,quotation_floors,updated_at',[d.advancePercent,d.upiId,d.quotationFloors,req.owner.id,d.upiSecondaryId??null,d.upiReceiverName??null]);if(Number(before.rows[0]?.advance_percent)!==d.advancePercent)await client.query("insert into public.crm_payment_control_audit(actor_id,actor_role,before_value,after_value,reason) values($1,'owner',$2,$3,'Owner business settings update')",[req.owner.id,JSON.stringify({advancePercent:before.rows[0]?.advance_percent}),JSON.stringify({advancePercent:d.advancePercent})]);return r;});res.json({policy:r.rows[0]})}catch(e){next(e)}
 });return router;
}
