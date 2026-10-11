import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('backend/release-manifest.json',root),'utf8'));
for(const migration of manifest.migrations){
 const data=await readFile(new URL(migration.path,root));
 if(createHash('sha256').update(data).digest('hex')!==migration.sha256)throw Error('Migration changed after review: '+migration.path);
 console.log(migration.order+'. '+migration.path);
}
console.log('Release migration integrity verified. No database changes performed.');
