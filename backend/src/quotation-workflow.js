import {z} from 'zod';
const money=z.coerce.number().min(0).max(99999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'Use at most two decimal places.');
export const quotationSchema=z.object({
 clientId:z.string().uuid().optional(),clientName:z.string().trim().min(2).max(120),
 clientEmail:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),clientPhone:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/).refine(s=>{const n=s.replace(/\D/g,'').length;return n>=7&&n<=15}),
 title:z.string().trim().min(2).max(180),currency:z.enum(['INR','USD','EUR','GBP']).default('INR'),
 items:z.array(z.object({name:z.string().trim().min(1).max(180),quantity:z.coerce.number().int().min(1).max(100000),unitPrice:money}).strict()).min(1).max(50),
 discountPercent:z.coerce.number().min(0).max(100).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001).default(0),
 status:z.enum(['draft','sent']).default('draft'),notes:z.string().trim().max(2000).default('')
}).strict();
export function quotationTotals(data){
 const items=data.items.map(i=>({...i,lineTotal:Math.round(i.unitPrice*100)*i.quantity/100}));
 const subtotalCents=items.reduce((sum,i)=>sum+Math.round(i.lineTotal*100),0);
 if(!Number.isSafeInteger(subtotalCents)||subtotalCents>999999999900)throw Error('Quotation total is too large.');
 const discountCents=Math.round(subtotalCents*Math.round(data.discountPercent*100)/10000);
 return {items,subtotal:subtotalCents/100,discountAmount:discountCents/100,amount:(subtotalCents-discountCents)/100};
}
