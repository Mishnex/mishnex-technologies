import { Router } from 'express';
import { z } from 'zod';
export function policyRoutes({pool,requireOwner}) {
 const router=Router();router.use(requireOwner);
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.get('/',async(_req,res,next)=>{try{const r=await pool.query('select advance_percent,upi_id,quotation_floors,updated_at from public.crm_business_policy where singleton');res.json({policy:r.rows[0]})}catch(e){next(e)}});
 router.put('/',async(req,res,next)=>{
  const floor=z.number().min(0).max(9999999999);
  const body=z.object({advancePercent:z.number().min(0).max(100),upiId:z.string().trim().max(100).refine(x=>x===''||/^[\w.\-]+@[\w.\-]+$/.test(x)),quotationFloors:z.object({INR:floor,USD:floor,EUR:floor,GBP:floor}).strict()}).strict().safeParse(req.body);
  if(!body.success)return res.status(400).json({error:'Invalid advance, UPI ID or quotation floor.'});
  try{const d=body.data;const r=await pool.query('update public.crm_business_policy set advance_percent=$1,upi_id=$2,quotation_floors=$3,updated_by=$4,updated_at=now() where singleton returning advance_percent,upi_id,quotation_floors,updated_at',[d.advancePercent,d.upiId,d.quotationFloors,req.owner.id]);res.json({policy:r.rows[0]})}catch(e){next(e)}
 });return router;
}
