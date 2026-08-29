const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('gas/46_1_TourQuestionnairePrintFast.gs','utf8');
const main=fs.readFileSync('gas/99_Main.gs','utf8');

function functionBody(name){
  const marker=`function ${name}(`;
  const start=src.indexOf(marker);
  assert.ok(start>=0,`${name} must exist`);
  const brace=src.indexOf('{',start);
  let depth=0;
  for(let i=brace;i<src.length;i++){
    if(src[i]==='{')depth++;
    if(src[i]==='}'&&--depth===0)return src.slice(brace,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

const generate=functionBody('generateTourQuestionnairePdfFast');
assert.doesNotMatch(generate,/SpreadsheetApp\.create\s*\(/,'normal PDF generation must not create a spreadsheet');
assert.doesNotMatch(generate,/\.copyTo\s*\(/,'normal PDF generation must not copy sheets');
assert.doesNotMatch(generate,/deleteRows\s*\(/,'normal PDF generation must not reshape sheets');
assert.match(src,/page1\.getMaxRows\(\) === 41/,'page 1 must remain physically limited to rows 1-41');
assert.match(src,/page2\.getMaxRows\(\) === 27/,'page 2 must remain physically limited to rows 42-68');
assert.match(src,/"&scale=4"/,'each fixed sheet must fit to one PDF page');
assert.match(src,/function setupTourQuestionnaireFastPdf\s*\(/,'one-time prebuild function must exist');
assert.match(main,/case "generateTourQuestionnairePdf"[\s\S]*?return generateTourQuestionnairePdfCompatible_\(/,'GET route must use compatible generator');
assert.match(main,/typeof generateTourQuestionnairePdfFast === "function"/,'compatible generator must detect the optional fast implementation');
assert.match(main,/return generateTourQuestionnairePdfFast\(params \|\| \{\}\)/,'compatible generator must prefer the fast implementation');
assert.match(main,/return generateTourQuestionnairePdf\(params \|\| \{\}\)/,'compatible generator must fall back to the existing implementation');
console.log('tour questionnaire fast PDF checks passed');
