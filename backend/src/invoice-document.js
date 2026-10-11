import PDFDocument from 'pdfkit';
import {PNG} from 'pngjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const invoiceCode=id=>'MISH-INV-'+String(id).padStart(6,'0');
const logo=PNG.sync.read(readFileSync(fileURLToPath(new URL('../../assets/img/logo-transparent.png',import.meta.url))));
const logoRuns=[];
for(let y=0;y<logo.height;y++){let start=-1;for(let x=0;x<=logo.width;x++){const visible=x<logo.width&&logo.data[(y*logo.width+x)*4+3]>96;if(visible&&start<0)start=x;if(!visible&&start>=0){logoRuns.push([start,y,x-start]);start=-1}}}
export async function invoicePDF(invoice){
 const doc=new PDFDocument({size:'A4',margin:44,bufferPages:true,info:{Title:invoiceCode(invoice.id),Author:'Mishnex Technologies'}});
 const chunks=[];const complete=new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 const orange='#ec6c20',ink='#232a36',muted='#687080',width=507;
 const money=n=>invoice.currency.trim()+' '+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const text=(s,x,y,w=width,size=10,bold=false)=>doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(ink).text(String(s??''),x,y,{width:w,lineGap:3});
 function heading(){doc.rect(0,0,595,7).fill(orange);doc.save().translate(44,34).scale(0.31).fillColor(orange);for(const [x,y,w] of logoRuns)doc.rect(x,y,w,1.05);doc.fill().restore();text('MISHNEX TECHNOLOGIES',116,43,350,16,true);doc.fillColor(muted).fontSize(10).text('mishnextechnologies.com',116,68,{width:350});text('INVOICE',44,112,230,25,true);text(invoiceCode(invoice.id),320,118,231,14,true);doc.moveTo(44,153).lineTo(551,153).strokeColor('#e4e5e8').stroke();}
 heading();let y=176;
 const customer=[invoice.client_name,invoice.client_code,invoice.client_email,invoice.client_phone,invoice.client_gst_number?'Customer GSTIN: '+invoice.client_gst_number:null].filter(Boolean).join('\n');
 text('BILL TO',44,y,275,9,true);y+=20;text(customer,44,y,275,11);const h=doc.heightOfString(customer,{width:275,lineGap:3});
 const issued=invoice.created_at?new Date(invoice.created_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'-';
 text('Issued: '+issued+'\nStatus: '+invoice.status+(invoice.due_date?'\nDue: '+String(invoice.due_date).slice(0,10):'')+(invoice.seller_gst_number?'\nSeller GSTIN: '+invoice.seller_gst_number:''),335,y,216,10);y+=Math.max(h,75)+24;
 if(invoice.quotation_code){text('Quotation: '+invoice.quotation_code,44,y,507,10);y+=25}
 const rows=invoice.items?.length?invoice.items:[{name:invoice.title||'Products / services',quantity:1,unitPrice:invoice.amount,lineTotal:invoice.amount}];
 function tableHead(){doc.rect(44,y,width,28).fill('#fff2e9');text('PRODUCT / SERVICE',54,y+9,242,9,true);text('QTY',308,y+9,38,9,true);text('UNIT PRICE',350,y+9,88,9,true);text('AMOUNT',455,y+9,86,9,true);y+=38}
 tableHead();for(const item of rows){doc.font('Helvetica').fontSize(10);const height=Math.max(31,doc.heightOfString(String(item.name),{width:240,lineGap:3})+17);if(y+height>700){doc.addPage();heading();y=176;tableHead()}text(item.name,54,y,240);text(item.quantity,308,y,35);text(money(item.unitPrice),350,y,95,9);text(money(item.lineTotal),455,y,87,9);y+=height;doc.moveTo(44,y-8).lineTo(551,y-8).strokeColor('#eceef0').stroke()}
 if(y+225>725){doc.addPage();heading();y=176}y+=20;
 const totals=[];if(invoice.items?.length){totals.push(['Subtotal',invoice.subtotal??invoice.amount]);if(Number(invoice.discount_amount)>0)totals.push(['Discount',-Number(invoice.discount_amount)])}totals.push(['Invoice total',invoice.amount],['Verified paid',invoice.paid_amount],['Remaining balance',Math.max(0,Number(invoice.amount)-Number(invoice.paid_amount))]);
 for(const [label,value] of totals){text(label,300,y,150,11,label==='Remaining balance');text(money(value),448,y,103,11,true);y+=28}y+=12;
 text('Payment amounts reflect verified bank receipts only. Submitted UPI references remain pending until reviewed.',44,y,507,9);y=doc.y+14;
 text('Thank you for choosing Mishnex Technologies.',44,y,507,10,true);
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.moveTo(44,777).lineTo(551,777).strokeColor('#e4e5e8').stroke();doc.font('Helvetica').fontSize(8).fillColor(muted).text('Mishnex Technologies | '+invoiceCode(invoice.id),44,789,{width:400,lineBreak:false});doc.text('Page '+(i+1)+' / '+range.count,458,789,{width:93,lineBreak:false})}doc.end();return complete;
}
export const invoiceSelect=`select i.id,i.amount,i.paid_amount,i.currency,i.status,i.created_at,i.due_date,i.client_gst_number,i.seller_gst_number,c.name client_name,c.client_code,c.email client_email,c.phone client_phone,q.quotation_code,q.title,q.items,q.subtotal,q.discount_amount from public.crm_invoices i join public.crm_clients c on c.id=i.client_id left join public.crm_quotations q on q.id=i.quotation_id `;
export async function sendInvoicePDF(res,invoice){const pdf=await invoicePDF(invoice);res.set('Cache-Control','no-store');res.set('Content-Type','application/pdf');res.set('Content-Disposition','attachment; filename="'+invoiceCode(invoice.id)+'.pdf"');res.send(pdf)}
