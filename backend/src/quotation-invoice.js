import {reject} from './transaction.js';
export async function quotationInvoice(client,q){
 let invoiceId=q.payment_invoice_id;
 if(!invoiceId){
  const existing=await client.query("select id,amount,currency,client_id,status from public.crm_invoices where quotation_id=$1 and status<>'void' order by id for update",[q.id]);
  if(existing.rowCount>1)reject(409,'Multiple invoices exist for this quotation. Contact Mishnex.');
  if(existing.rowCount){const i=existing.rows[0];if(i.client_id!==q.client_id||i.currency.trim()!==q.currency.trim()||Number(i.amount)!==Number(q.amount)||i.status==='draft')reject(409,'Invoice is not ready for this quotation. Contact Mishnex.');invoiceId=i.id;}
  else{const created=await client.query("insert into public.crm_invoices(client_id,quotation_id,amount,currency,status) values($1,$2,$3,$4,'issued') returning id",[q.client_id,q.id,q.amount,q.currency]);invoiceId=created.rows[0].id;}
  await client.query("update public.crm_quotations set status='accepted',payment_invoice_id=$2 where id=$1",[q.id,invoiceId]);
 }
 return invoiceId;
}
