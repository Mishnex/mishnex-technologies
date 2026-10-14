import nodemailer from 'nodemailer';
export function enquiryMailer(pool,env=process.env,{createTransport=nodemailer.createTransport}={}){
 const configured=Boolean(env.SMTP_HOST&&env.SMTP_FROM&&env.SMTP_USER&&env.SMTP_PASS);
 const transport=configured?createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:env.SMTP_SECURE!=='false',auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},connectionTimeout:10000,socketTimeout:20000}):null;
 let busy=false;
 async function tick(){if(!transport||busy)return;busy=true;try{
  const claimed=await pool.query(`update public.crm_enquiry_mail_outbox set leased_until=now()+interval '2 minutes',attempts=attempts+1 where lead_id=(select lead_id from public.crm_enquiry_mail_outbox where sent_at is null and next_attempt_at<=now() and (leased_until is null or leased_until<now()) order by next_attempt_at for update skip locked limit 1) returning lead_id`);
  if(!claimed.rowCount)return;const id=claimed.rows[0].lead_id;
  try{const lead=(await pool.query('select name,email,phone,service,budget,preferred_call_time,requirement from public.crm_leads where id=$1',[id])).rows[0];if(!lead)throw Error('Missing enquiry');
   await transport.sendMail({from:env.SMTP_FROM,to:env.ENQUIRY_EMAIL_TO||'info@mishnex.com',replyTo:lead.email,subject:'New Mishnex website enquiry',messageId:'<enquiry-'+id+'@mishnex.com>',text:Object.entries(lead).map(([k,v])=>k.replaceAll('_',' ')+': '+(v||'—')).join('\n')});
   await pool.query('update public.crm_enquiry_mail_outbox set sent_at=now(),leased_until=null,last_error=null where lead_id=$1',[id]);
  }catch{await pool.query("update public.crm_enquiry_mail_outbox set leased_until=null,next_attempt_at=now()+least(interval '1 hour',interval '1 minute'*power(2,least(attempts,6))),last_error='Email delivery failed; retry scheduled' where lead_id=$1",[id]);}
 }catch{console.error('Enquiry mail queue unavailable.')}finally{busy=false}}
 const timer=setInterval(tick,30000);timer.unref();return {configured,stop(){clearInterval(timer);transport?.close()},tick};
}
