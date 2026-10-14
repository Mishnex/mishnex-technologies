import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import JSZip from 'jszip';
import {readSpreadsheet} from '../src/spreadsheet.js';import {normalizeSpreadsheetXml} from '../src/xlsx-compatibility.js';
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
test('valid prefixed workbook, styles, shared strings and sheets preserve contact data',async()=>{
 const b=new ExcelJS.Workbook(),s=b.addWorksheet('Lead Upload');s.addRows([['Customer Name','Phone Number','Email','Location','Requirement / Notes'],['QA & <Client>','009876543210','','Kolkata','Text <x:sheet> stays text']]);
 const zip=await JSZip.loadAsync(await b.xlsx.writeBuffer());for(const f of Object.values(zip.files)){if(f.dir||!/^xl\/.*\.xml$/.test(f.name))continue;const xml=await f.async('string');if(!xml.includes('xmlns="'+MAIN+'"'))continue;zip.file(f.name,xml.replace('xmlns="'+MAIN+'"','xmlns:x="'+MAIN+'"').replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)(?=[\s/>])/g,'<$1x:$2'));}
 const r=await readSpreadsheet(await zip.generateAsync({type:'nodebuffer'}));assert.equal(r.rows[0][0],'QA & <Client>');assert.equal(r.rows[0][1],'009876543210');assert.equal(r.rows[0][4],'Text <x:sheet> stays text');assert.equal(r.selectedSheet,'Lead Upload');
});
test('only SpreadsheetML namespace elements are normalized',()=>{const xml='<x:worksheet xmlns:x="'+MAIN+'" xmlns:e="urn:extension"><e:item value="&quot;&amp;"/><x:sheetData/></x:worksheet>';const result=normalizeSpreadsheetXml(xml);assert.match(result,/<worksheet/);assert.match(result,/<e:item/);assert.match(result,/value="&quot;&amp;"/)});
test('XML doctype is rejected',()=>assert.throws(()=>normalizeSpreadsheetXml('<!DOCTYPE worksheet><worksheet/>'),/DOCTYPE/));
