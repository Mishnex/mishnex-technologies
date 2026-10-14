import ExcelJS from 'exceljs';
import {compatibleXlsx} from './xlsx-compatibility.js';
import {reject} from './transaction.js';
export async function readSpreadsheet(buffer, sheetName) {
 const book=new ExcelJS.Workbook();
 try { await book.xlsx.load(await compatibleXlsx(buffer)); } catch { reject(400,'Cannot read this Excel file. Upload an unencrypted .xlsx file.'); }
 const sheets=book.worksheets.filter(s=>s.state==='visible');
 const sheet=sheetName?sheets.find(s=>s.name===sheetName):sheets[0];
 if(!sheet)reject(400,'Choose a visible worksheet.');
 if(sheet.rowCount>2001||sheet.columnCount>100)reject(400,'Use at most 2,000 leads and 100 columns per worksheet.');
 const rows=[];
 sheet.eachRow({includeEmpty:true},row=>{const values=[];for(let i=1;i<=sheet.columnCount;i++){const cell=row.getCell(i);if(cell.type===ExcelJS.ValueType.Formula||cell.type===ExcelJS.ValueType.Error)reject(400,'Replace formulas and errors with plain values before uploading.');values.push(cell.text.trim());}rows.push(values);});
 const headers=rows.shift()||[];
 if(headers.length<2||headers.some(h=>!h)||new Set(headers).size!==headers.length)reject(400,'Every column needs a unique, nonempty header in row 1.');
 const populated=rows.filter(r=>r.some(Boolean));
 if(!populated.length)reject(400,'No leads found in the selected worksheet.');
 return {headers,rows:populated,sheets:sheets.map(s=>s.name),selectedSheet:sheet.name};
}
