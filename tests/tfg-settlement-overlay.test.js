const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {test}=require('node:test'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),name='91_TfgSettlementApproval.js';
const baseline=execFileSync('git',['show','2fb8e6a:gas/91_TfgSettlementApproval.gs'],{cwd:root,encoding:'utf8'});
const desired=fs.readFileSync(path.join(root,'gas/91_TfgSettlementApproval.gs'),'utf8');
const run=folder=>execFileSync(process.execPath,[path.join(root,'scripts/gas-tfg-settlement-policy-overlay.mjs'),folder],{encoding:'utf8',stdio:'pipe'});
test('settlement overlay preserves unrelated live files and code and is repeatable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tfg-settlement-overlay-'));
 try{
  const addition='\nfunction remoteOnlySettlementHelper_() { return "preserve"; }\n';
  fs.writeFileSync(path.join(dir,name),baseline+addition);fs.writeFileSync(path.join(dir,'99_Main.js'),'// retained router\n');fs.writeFileSync(path.join(dir,'appsscript.json'),'{}\n');
  run(dir);assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),desired+addition);
  assert.equal(fs.readFileSync(path.join(dir,'99_Main.js'),'utf8'),'// retained router\n');assert.equal(fs.readFileSync(path.join(dir,'appsscript.json'),'utf8'),'{}\n');
  run(dir);assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),desired+addition);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unknown edits to the live normalization block abort without writing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tfg-settlement-drift-'));
 try{
  const changed=baseline.replace('note+="／最終月請求なし（0円）";','note="drift";');assert.notEqual(changed,baseline);
  fs.writeFileSync(path.join(dir,name),changed);assert.throws(()=>run(dir),/Live settlement source differs/);assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),changed);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('duplicate live settlement modules abort before applying the policy',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tfg-settlement-duplicate-'));
 try{
  fs.writeFileSync(path.join(dir,name),baseline);fs.writeFileSync(path.join(dir,'91_TfgSettlementApproval.gs'),baseline);
  assert.throws(()=>run(dir),/exactly one existing settlement module/);assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),baseline);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
