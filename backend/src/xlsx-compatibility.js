import JSZip from 'jszip';
import saxes from 'saxes';
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const escapeText=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escapeAttribute=s=>escapeText(s).replace(/"/g,'&quot;').replace(/\r/g,'&#13;').replace(/\n/g,'&#10;').replace(/\t/g,'&#9;');
// ExcelJS requires unprefixed SpreadsheetML elements, although prefixed OOXML is valid.
export function normalizeSpreadsheetXml(xml){
 const parser=new saxes.SaxesParser({xmlns:true}),out=[],names=[];let prefixed=false;
 parser.on('opentag',tag=>{
  const name=tag.uri===MAIN?tag.local:tag.name;prefixed ||= tag.uri===MAIN&&!!tag.prefix;
  const attrs=Object.values(tag.attributes).filter(a=>a.name!=='xmlns').map(a=>a.name+'="'+escapeAttribute(a.value)+'"');
  if(tag.uri===MAIN)attrs.push('xmlns="'+MAIN+'"');else if(Object.hasOwn(tag.attributes,'xmlns'))attrs.push('xmlns="'+escapeAttribute(tag.attributes.xmlns.value)+'"');
  out.push('<'+name+(attrs.length?' '+attrs.join(' '):'')+'>');names.push(name);
 });
 parser.on('closetag',()=>out.push('</'+names.pop()+'>'));
 parser.on('text',s=>out.push(escapeText(s)));
 parser.on('cdata',s=>out.push('<![CDATA['+s+']]>'));
 parser.on('comment',s=>out.push('<!--'+s+'-->'));
 parser.on('doctype',()=>{throw Error('DOCTYPE is not allowed in spreadsheets.');});
 parser.on('error',e=>{throw e;});parser.write(xml).close();
 return prefixed?out.join(''):xml;
}
export async function compatibleXlsx(buffer){
 const zip=await JSZip.loadAsync(buffer);const files=Object.values(zip.files).filter(f=>!f.dir);
 if(files.length>500)throw Error('Too many spreadsheet package parts.');
 let total=0;for(const f of files){total+=f._data?.uncompressedSize||0;if(total>25*1024*1024)throw Error('Expanded spreadsheet exceeds 25 MB.');}
 let changed=false;
 for(const f of files){if(!/^xl\/.*\.xml$/.test(f.name))continue;const xml=await f.async('string'),normalized=normalizeSpreadsheetXml(xml);if(normalized!==xml){zip.file(f.name,normalized);changed=true;}}
 return changed?zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}):buffer;
}
