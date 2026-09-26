const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");

const adminSource=fs.readFileSync(path.join(__dirname,"../admin/admin-settlement.js"),"utf8");
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

test("through the 26th final month is treated as not yet charged",()=>{
  const scope=vm.createContext({});
  vm.runInContext(extractFunction(adminSource,"cutoffInfo")+";this.cutoffInfo=cutoffInfo;",scope);
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
