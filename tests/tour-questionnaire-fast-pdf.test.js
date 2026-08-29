const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('gas/46_1_TourQuestionnairePrintFast.gs','utf8');
const main=fs.readFileSync('gas/99_Main.gs','utf8');
const view=fs.readFileSync('admin/questionnaire-print.html','utf8');

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
assert.doesNotMatch(generate,/SpreadsheetApp\./,'normal questionnaire display must not touch SpreadsheetApp');
assert.doesNotMatch(generate,/UrlFetchApp\./,'normal questionnaire display must not export PDF server-side');
assert.doesNotMatch(generate,/DriveApp\./,'normal questionnaire display must not create Drive files');
assert.match(generate,/TOUR_INSTANT_PRINT_VIEW_URL\s*\+\s*"#"\s*\+\s*encoded/,'PII must be passed in URL fragment, not query params');
assert.match(src,/render_mode:\s*"BROWSER_PRINT"/,'browser print mode must be returned');
assert.match(src,/pages:\s*2/,'API must declare exactly two pages');
assert.match(view,/tour-questionnaire-front\.png/,'page 1 must use the spreadsheet-derived front image');
assert.match(view,/tour-questionnaire-back\.png/,'page 2 must use the spreadsheet-derived back image');
assert.strictEqual((view.match(/<section class="sheet"/g)||[]).length,2,'print view must contain exactly two physical sheets');
assert.match(view,/M PLUS Rounded 1c/,'rounded Japanese font must be preferred');
assert.match(view,/@page\{size:A4 portrait;margin:0\}/,'print CSS must force A4 portrait with no extra browser page');
assert.match(main,/case "generateTourQuestionnairePdf"[\s\S]*?return generateTourQuestionnairePdfFast\(/,'GET route must use instant generator');
console.log('tour questionnaire instant two-page print checks passed');
