import {Router} from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
export function upiRoutes({pool}){
 const r=Router();r.use(rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));
 r.get('/upi-qr',async(req,res,next)=>{try{
  const {account,amount}=req.query;
  if(typeof account!=='string'||account.length>100||typeof amount!=='string'||!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>9999999999)return res.status(400).json({error:'Select a valid UPI account and INR amount.'});
  const result=await pool.query('select upi_id,upi_secondary_id,upi_receiver_name from public.crm_business_policy where singleton');const p=result.rows[0];
  if(!p||![p.upi_id,p.upi_secondary_id].filter(Boolean).includes(account))return res.status(400).json({error:'Receiving UPI account is unavailable.'});
  const uri='upi://pay?'+new URLSearchParams({pa:account,pn:p.upi_receiver_name||'Mishnex Technologies',am:Number(amount).toFixed(2),cu:'INR'}).toString();
  const svg=await QRCode.toString(uri,{type:'svg',errorCorrectionLevel:'M',margin:4,width:240});
  res.set('Cache-Control','no-store');res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox");res.type('image/svg+xml').send(svg);
 }catch(e){next(e)}});return r;
}
