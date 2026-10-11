import {Router} from 'express';
import {z} from 'zod';
import {invoiceSelect,sendInvoicePDF} from './invoice-document.js';
export function invoiceRoutes({pool,authorize}){const r=Router();r.use(authorize);r.use((req,res,next)=>req.actor.owner||req.actor.permissions.includes('payments:read')?next():res.status(403).json({error:'Invoice access required.'}));r.get('/:id/pdf',async(req,res,next)=>{const id=z.coerce.number().int().positive().safeParse(req.params.id);if(!id.success)return res.status(400).json({error:'Invalid invoice.'});try{const invoice=(await pool.query(invoiceSelect+'where i.id=$1',[id.data])).rows[0];if(!invoice)return res.status(404).json({error:'Invoice not found.'});await sendInvoicePDF(res,invoice)}catch(e){next(e)}});return r}
