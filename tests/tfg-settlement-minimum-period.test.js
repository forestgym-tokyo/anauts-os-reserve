const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {test}=require("node:test"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,".."),gas=fs.readFileSync(path.join(root,"gas/91_TfgSettlementApproval.gs"),"utf8");
function fn(source,name){
  const start=source.indexOf("function "+name+"("),brace=source.indexOf("{",start);
  assert.ok(start>=0,name);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==="{")depth++;
    if(source[i]==="}"&&!--depth)return source.slice(start,i+1);
  }
  throw Error("Unclosed "+name);
}
function gasScope(at="2026-11-19T03:00:00Z"){
  const scope=vm.createContext({at});
  vm.runInContext(`
    const NativeDate=Date;
    Date=class extends NativeDate { constructor(...args){super(...(args.length?args:[at]));} };
    const TFG_SETTLEMENT_CONFIG={TIMEZONE:"Asia/Tokyo",APPROVAL_BASE_URL:"https://example.invalid/approval"};
    const Utilities={
      getUuid:()=>"test-token",formatDate:(date,zone,format)=>{
        const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
        const v=Object.fromEntries(p.map(x=>[x.type,x.value]));
        return format==="yyyy,M,d,H,m,s"?[v.year,v.month,v.day,v.hour,v.minute,v.second].join(","):v.year+"-"+v.month+"-"+v.day;
      }
    };
    this.savedRows=[];
    const LockService={getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})};
    function getTfgSettlementSheet_(){return{appendRow:row=>savedRows.push(row)};}
    function invalidatePreviousPendingTfgSettlements_(){}
    function tfgSettlementHash_(token){return "test-hash";}
    function tfgSettlementJson_(result){return result;}
    function tfgSettlementNormalizePaymentMethod_(value){return value||"CARD";}
    function tfgSettlementPaymentNote_(){return "fixture";}
  `,scope);
  const names=["tfgSettlementMinimumWithdrawalDate_","tfgSettlementValidateMonthRange_","tfgSettlementJstParts_","tfgSettlementWithdrawalDate_","tfgSettlementIsBeforeMonthlyCharge_","tfgSettlementNextExpiry_","tfgSettlementIsWithdrawalMonth_","tfgSettlementCampaignProgress_","tfgSettlementNormalizeItems_","createTfgSettlement_"];
  vm.runInContext(names.map(name=>fn(gas,name)).join("\n"),scope);
  return scope;
}
for(const file of ["admin/admin-settlement-v2.js","admin/admin-settlement.js"]){
  test(file+": joining month excluded from the minimum three full months",()=>{
    const source=fs.readFileSync(path.join(root,file),"utf8"),scope=vm.createContext({});
    vm.runInContext(["minimumWithdrawalDate_","cutoffInfo","monthsBetween"].map(name=>fn(source,name)).join("\n"),scope);
    for(const day of ["01","15","31"]){
      const join="2026-10-"+day,cut=scope.cutoffInfo(new Date(2026,10,19,12),join);
      assert.equal(cut.withdrawalDate,"2027-01-31");
      assert.deepEqual(Array.from(scope.monthsBetween(join,cut.withdrawalDate),x=>[x.y,x.m+1]),[[2026,10],[2026,11],[2026,12],[2027,1]]);
    }
    for(const [join,earliest] of [["2026-11-30","2027-02-28"],["2027-11-30","2028-02-29"],["2026-12-31","2027-03-31"]]){
      assert.equal(scope.minimumWithdrawalDate_(join),earliest);
    }
    assert.equal(scope.cutoffInfo(new Date(2027,1,9,20,0,0),"2026-10-15").withdrawalDate,"2027-02-28");
    assert.equal(scope.cutoffInfo(new Date(2027,1,9,20,0,1),"2026-10-15").withdrawalDate,"2027-03-31");
  });
}
test("GAS enforces the minimum and preserves later cutoff dates",()=>{
  const scope=gasScope();
  for(const day of ["01","15","31"])assert.equal(scope.tfgSettlementWithdrawalDate_(new Date("2026-11-19T03:00:00Z"),"2026-10-"+day),"2027-01-31");
  for(const [at,expected] of [["2027-01-09T11:00:00Z","2027-01-31"],["2027-01-09T11:00:01Z","2027-02-28"],["2027-02-05T03:00:00Z","2027-02-28"]]){
    assert.equal(scope.tfgSettlementWithdrawalDate_(new Date(at),"2026-10-15"),expected);
  }
  assert.equal(scope.tfgSettlementWithdrawalDate_(new Date("2027-11-01T03:00:00Z"),"2027-11-30"),"2028-02-29");
  for(const date of ["","2026-02-30","2026-13-01","not-a-date"])assert.throws(()=>scope.tfgSettlementMinimumWithdrawalDate_(date),/正しいスタート日/);
});
function payload(){
  return {memberNo:"123456",memberName:"計算確認用",email:"test@example.invalid",joinDate:"2026-10-15",withdrawalDate:"2027-01-31",plan:"REGULAR",items:[
    {target:"—",label:"初期費用",paid:0,normal:8800},
    ...["2026年10月","2026年11月","2026年12月","2027年1月"].map((target,i)=>({target,label:i?"月会費":"初月会費",paid:4950,normal:7480,status:"通常",isFinalMonth:i===3}))
  ]};
}
test("saving an October join stores all four monthly lines through January with the authoritative date and amount",()=>{
  const scope=gasScope(),result=scope.createTfgSettlement_(payload());
  assert.equal(result.ok,true);
  assert.equal(result.data.withdrawalDate,"2027-01-31");
  assert.equal(result.data.total,23870);
  assert.equal(scope.savedRows.length,1);
  const row=scope.savedRows[0],items=JSON.parse(row[6]);
  assert.equal(row[5],"2027-01-31");
  assert.deepEqual(items.slice(1).map(x=>x.target),["2026年10月","2026年11月","2026年12月","2027年1月"]);
  assert.deepEqual(items.slice(1).map(x=>x.paymentSequence),[null,1,2,3]);
  assert.equal(items.reduce((sum,x)=>sum+x.settlement,0),result.data.total);
});
test("incomplete, duplicate, reordered or stale-date requests cannot save an early settlement",()=>{
  for(const change of [
    body=>body.items.pop(),
    body=>body.items.splice(2,1),
    body=>body.items.push({...body.items.at(-1)}),
    body=>body.items[3].target="2026年11月",
    body=>body.items.reverse(),
    body=>body.withdrawalDate="2026-12-31",
    body=>body.joinDate=""
  ]){
    const scope=gasScope(),body=payload();change(body);
    assert.equal(scope.createTfgSettlement_(body).ok,false);
    assert.equal(scope.savedRows.length,0);
  }
});
test("waiving the last charge cannot move an October join's effective date before January 31",()=>{
  const scope=gasScope(),body=payload();body.finalMonthBilling="ZERO";
  const result=scope.createTfgSettlement_(body);
  assert.equal(result.ok,true);assert.equal(result.data.total,16390);
  const last=JSON.parse(scope.savedRows[0][6]).at(-1);
  assert.equal(last.normal,0);assert.equal(last.settlement,0);
  assert.match(last.note,/実質退会日：2027-01-31/);
});
