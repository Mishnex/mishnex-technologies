import {createHash} from 'node:crypto';
export function pageSecurity(page,{supabase=false}={}){
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");
 if(!scripts.length)throw Error('Page script is missing.');
 return "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' "+scripts.join(' ')+"; style-src 'self' 'unsafe-inline'; connect-src 'self'"+(supabase?' https://*.supabase.co':'')+"; img-src 'self' data:; font-src 'self'";
}
