const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");

const adminSource=fs.readFileSync(path.join(__dirname,"../admin/admin-settlement-v2.js"),"utf8");
const gasSource=fs.readFileSync(path.join(__dirname,"../gas/89_TfgSettlementApproval.gs"),"utf8");

function extractFunction(source,name){
  const start=source.indexOf("function "+name+"(");
  assert.notEqual(start,-1,name+" is defined");
  let brace=source.indexOf("{",start),depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==="{")depth++;
    if(source[i]==="}"){depth--;if(depth===0)return source.slice(start,i+1);}
  }
  throw new Error("Unclosed function "+name);
}

test("9th 20:00 exactly is still current-month withdrawal; one second later is next month",()=>{
  const scope=vm.createContext({});
  vm.runInContext(extractFunction(adminSource,"cutoffInfo")+";this.cutoffInfo=cutoffInfo;",scope);
  const exact=scope.cutoffInfo(new Date(2026,8,9,20,0,0));
  const after=scope.cutoffInfo(new Date(2026,8,9,20,0,1));
  assert.equal(exact.withdrawalDate,"2026-09-30");
  assert.equal(after.withdrawalDate,"2026-10-31");
  assert.equal(exact.expiry.getTime(),new Date(2026,8,9,20,0,1).getTime());
});

test("final month is zero only after the 9th cutoff and through the 26th",()=>{
  const scope=vm.createContext({});
  vm.runInContext(extractFunction(adminSource,"cutoffInfo")+";this.cutoffInfo=cutoffInfo;",scope);
  assert.equal(scope.cutoffInfo(new Date(2026,8,5,12,0,0)).beforeFinalCharge,false);
  assert.equal(scope.cutoffInfo(new Date(2026,8,9,20,0,0)).beforeFinalCharge,false);
  assert.equal(scope.cutoffInfo(new Date(2026,8,9,20,0,1)).beforeFinalCharge,true);
  assert.equal(scope.cutoffInfo(new Date(2026,8,26,23,59,59)).beforeFinalCharge,true);
  assert.equal(scope.cutoffInfo(new Date(2026,8,27,0,0,0)).beforeFinalCharge,false);
});

test("bank transfer instructions use the configured Mizuho account",()=>{
  assert.match(gasSource,/BANK_NAME:"みずほ銀行"/);
  assert.match(gasSource,/BANK_BRANCH:"新浦安支店"/);
  assert.match(gasSource,/BANK_ACCOUNT_TYPE:"普通"/);
  assert.match(gasSource,/BANK_ACCOUNT_NO:"1917298"/);
  assert.match(gasSource,/BANK_ACCOUNT_NAME:"A-nauts株式会社"/);
});

test("pause months do not create settlement difference",()=>{
  assert.match(gasSource,/if\(status==="休会"\)[\s\S]*?normal=550;[\s\S]*?paid=550;[\s\S]*?settlement=0;/);
});

test("payments after the twelfth do not recreate campaign settlement",()=>{
  assert.match(gasSource,/paymentSequence!==null&&paymentSequence>12[\s\S]*?settlement=0;/);
  assert.match(adminSource,/completed>=12/);
});


test("settlement approval requires a six-digit member number",()=>{
  assert.match(gasSource,/\^\\d\{6\}\$/);
  assert.match(gasSource,/会員番号は6桁の数字で入力してください/);
});

test("reissuing a settlement invalidates previous active draft or pending links",()=>{
  assert.match(gasSource,/invalidatePreviousPendingTfgSettlements_/);
  assert.match(gasSource,/setValue\("SUPERSEDED"\)/);
  assert.match(gasSource,/\["DRAFT","PENDING"\]/);
  assert.match(gasSource,/row\.status==="SUPERSEDED"/);
});

test("URL issuance creates a draft and member email is a separate authenticated action",()=>{
  assert.match(gasSource,/"DRAFT"/);
  assert.match(gasSource,/function sendTfgSettlementApproval_/);
  assert.match(gasSource,/fresh\.status==="DRAFT"/);
  assert.match(gasSource,/setValue\("PENDING"\)/);
  assert.match(adminSource,/下書きを保存し、承認URLを発行しました。会員にはまだ送信していません。/);
});


test("first-month normal fee is auto-calculated from campaign proration",()=>{
  const scope=vm.createContext({});
  vm.runInContext(extractFunction(adminSource,"firstNormalFromPaid_")+";this.fn=firstNormalFromPaid_;",scope);
  assert.equal(scope.fn(2874,{campaign:4950,normal:7480}),4342);
});

test("settlement UI initializes even if DOMContentLoaded already fired",()=>{
  assert.match(adminSource,/document\.readyState==="loading"/);
  assert.match(adminSource,/else initSettlementUi_\(\);/);
});

test("member preview renders inline in admin",()=>{
  assert.match(adminSource,/settlementInlineMemberPreview/);
  assert.match(adminSource,/buildMemberPreviewHtml_/);
  assert.match(adminSource,/scrollIntoView/);
});


test("pre-March-2026 DAY and NIGHT365 have no monthly campaign difference",()=>{
  assert.match(adminSource,/DAY:\{after202603:\{normal:6050,campaign:4180\},before202603:\{normal:4180,campaign:4180\}\}/);
  assert.match(adminSource,/NIGHT365:\{after202603:\{normal:4950,campaign:3300\},before202603:\{normal:3300,campaign:3300\}\}/);
});

test("pre-March-2026 DAY and NIGHT365 do not apply selectable benefits",()=>{
  assert.match(adminSource,/joinDate<"2026-03-01"&&\(plan==="DAY"\|\|plan==="NIGHT365"\)\)return 0/);
});
