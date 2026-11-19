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
    assert.equal(scope.cutoffInfo(new Date("2027-02-09T11:00:00Z"),"2026-10-15").withdrawalDate,"2027-02-28");
    assert.equal(scope.cutoffInfo(new Date("2027-02-09T11:00:01Z"),"2026-10-15").withdrawalDate,"2027-03-31");
  });
  test(file+": pause changes extend and restore the period, monthly charges and remembered statuses",()=>{
    const source=fs.readFileSync(path.join(root,file),"utf8"),data=payload();
    data.cutoffWithdrawalDate="2026-12-31";data.calculatedAt=new Date("2026-11-19T03:00:00Z");
    data.items=data.items.map(item=>({...item,kind:item.label==="初期費用"?"INITIAL":"MONTH",basePaid:item.paid,baseNormal:item.normal}));
    const scope=vm.createContext({current:data});
    const rates=source.slice(source.indexOf("const planRates="),source.indexOf("let current="));
    vm.runInContext(rates+["minimumWithdrawalDate_","monthsBetween","rateFor","isBeforeMonthlyCharge_","syncWithdrawalPeriod_","recalculateCampaign_"].map(name=>fn(source,name)).join("\n"),scope);
    function change(target,status,date,count){
      scope.current.items.find(item=>item.target===target).status=status;
      scope.syncWithdrawalPeriod_();scope.recalculateCampaign_();
      assert.equal(scope.current.withdrawalDate,date);
      const months=Array.from(scope.current.items).filter(item=>item.kind==="MONTH");
      assert.equal(months.length,count);
      assert.equal(months.filter(item=>item.isFinalMonth).length,1);
      assert.equal(months.at(-1).isFinalMonth,true);
      assert.equal(months.at(-1).paid,0);
      assert.equal(scope.current.items.reduce((sum,item)=>sum+item.settlement,0),28820);
      for(const month of months.slice(1,-1))assert.equal(month.paid,month.target==="2026年11月"?4950:0);
      return months;
    }
    change("2026年12月","休会","2027-02-28",5);
    change("2027年1月","休会","2027-03-31",6);
    change("2027年2月","休会","2027-04-30",7);
    change("2027年3月","休会","2027-05-31",8);
    change("2026年12月","通常","2027-04-30",7);
    change("2027年1月","通常","2027-01-31",4);
    const restored=change("2026年12月","休会","2027-04-30",7);
    assert.equal(restored.find(item=>item.target==="2027年2月").status,"休会");
    assert.equal(restored.find(item=>item.target==="2027年3月").status,"休会");
    change("2026年12月","通常","2027-01-31",4);
  });
}
test("minimum three full months exclude only pauses before completion in both UI and GAS",()=>{
  const server=gasScope(),functions=[(join,items)=>server.tfgSettlementMinimumWithdrawalDate_(join,items)];
  for(const file of ["admin/admin-settlement-v2.js","admin/admin-settlement.js"]){
    const source=fs.readFileSync(path.join(root,file),"utf8"),scope=vm.createContext({});
    vm.runInContext(fn(source,"minimumWithdrawalDate_"),scope);
    functions.push((join,items)=>scope.minimumWithdrawalDate_(join,items));
  }
  const pause=target=>({target,label:"月会費",status:"休会"});
  const cases=[
    [[],"2027-01-31"],
    [["2026年10月"],"2027-01-31"],
    [["2026年12月"],"2027-02-28"],
    [["2026年11月","2026年12月"],"2027-03-31"],
    [["2027年2月","2026年12月"],"2027-03-31"],
    [["2026年12月","2026年12月"],"2027-02-28"],
    [["2027年2月","2027年3月"],"2027-01-31"],
    [["2026年12月","2027年4月"],"2027-02-28"]
  ];
  for(const calculate of functions){
    for(const [months,date] of cases)assert.equal(calculate("2026-10-15",months.map(pause)),date);
    assert.equal(calculate("2027-10-31",[pause("2027年12月")]),"2028-02-29");
    assert.equal(calculate("2026-10-15",[{...pause("2026年12月"),status:"通常"}]),"2027-01-31");
    assert.equal(calculate("2026-10-15",[{...pause("2026年12月"),status:" 休会 "}]),"2027-02-28");
  }
});
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
  assert.equal(result.data.total,28820);
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
  assert.equal(result.ok,true);assert.equal(result.data.total,21340);
  const last=JSON.parse(scope.savedRows[0][6]).at(-1);
  assert.equal(last.normal,0);assert.equal(last.settlement,0);
  assert.match(last.note,/実質退会日：2027-01-31/);
});
test("an October join with December paused saves five months through February and canonical final charges",()=>{
  for(const billing of ["NORMAL","ZERO"]){
    const scope=gasScope(),body=payload();
    body.withdrawalDate="2027-02-28";body.finalMonthBilling=billing;
    body.items.find(item=>item.target==="2026年12月").status="休会";
    // January deliberately retains an obsolete final-month flag from the shorter period.
    body.items.push({target:"2027年2月",label:"月会費",paid:4950,normal:7480,status:"通常",isFinalMonth:true});
    const result=scope.createTfgSettlement_(body);
    assert.equal(result.ok,true);assert.equal(result.data.withdrawalDate,"2027-02-28");
    assert.equal(result.data.total,billing==="ZERO"?21340:28820);
    const saved=JSON.parse(scope.savedRows[0][6]);
    assert.deepEqual(saved.slice(1).map(item=>item.paymentSequence),[null,1,null,2,3]);
    assert.deepEqual(saved.slice(1).map(item=>item.paid),[4950,4950,0,0,0]);
    assert.equal(saved.filter(item=>item.isFinalMonth).length,1);
    assert.equal(saved.at(-1).isFinalMonth,true);
    if(billing==="ZERO")assert.match(saved.at(-1).note,/実質退会日：2027-02-28/);
  }
});
test("an old January end date or missing February detail is rejected when December is paused",()=>{
  for(const omitDate of [false,true])for(const status of ["休会"," 休会 "]){
    const scope=gasScope(),body=payload();
    body.items.find(item=>item.target==="2026年12月").status=status;
    if(omitDate)delete body.withdrawalDate;
    assert.equal(scope.createTfgSettlement_(body).ok,false);
    assert.equal(scope.savedRows.length,0);
  }
});
test("monthly payments use the previous month's 27th in Japan time, including December and leap years",()=>{
  const server=gasScope(),functions=[(target,at)=>server.tfgSettlementIsBeforeMonthlyCharge_(target,new Date(at))];
  for(const file of ["admin/admin-settlement-v2.js","admin/admin-settlement.js"]){
    const scope=vm.createContext({});vm.runInContext(fn(fs.readFileSync(path.join(root,file),"utf8"),"isBeforeMonthlyCharge_"),scope);
    functions.push((target,at)=>scope.isBeforeMonthlyCharge_(target,new Date(at)));
  }
  for(const calculate of functions)for(const [target,at,pending] of [
    ["2026年11月","2026-11-19T03:00:00Z",false],
    ["2026年12月","2026-11-19T03:00:00Z",true],
    ["2027年1月","2026-11-19T03:00:00Z",true],
    ["2026年12月","2026-11-26T14:59:59.999Z",true],
    ["2026年12月","2026-11-26T15:00:00.000Z",false],
    ["2027年1月","2026-12-26T14:59:59.999Z",true],
    ["2027年1月","2026-12-26T15:00:00.000Z",false],
    ["2028年3月","2028-02-26T14:59:59.999Z",true],
    ["2028年3月","2028-02-26T15:00:00.000Z",false]
  ])assert.equal(calculate(target,at),pending,target+" at "+at);
});
test("saving an October join never stores December or January as paid before their scheduled charges",()=>{
  for(const [at,paid,total] of [
    ["2026-11-05T03:00:00Z",[4950,4950,0,0],28820],
    ["2026-11-19T03:00:00Z",[4950,4950,0,0],28820],
    ["2026-11-26T14:59:59Z",[4950,4950,0,0],28820],
    ["2026-11-26T15:00:00Z",[4950,4950,4950,0],23870],
    ["2026-12-26T15:00:00Z",[4950,4950,4950,4950],18920]
  ]){
    const scope=gasScope(at),result=scope.createTfgSettlement_(payload());
    assert.equal(result.ok,true);assert.equal(result.data.total,total);
    assert.deepEqual(JSON.parse(scope.savedRows[0][6]).slice(1).map(item=>item.paid),paid);
  }
});
test("an entered first-month payment stays paid even before that month's scheduled date",()=>{
  const scope=gasScope(),body=payload();body.joinDate="2026-12-01";body.withdrawalDate="2027-03-31";
  body.items.slice(1).forEach((item,index)=>{item.target=["2026年12月","2027年1月","2027年2月","2027年3月"][index];});
  body.items[1].paid=2874;body.items[1].normal=4342;
  const result=scope.createTfgSettlement_(body);assert.equal(result.ok,true);
  assert.deepEqual(JSON.parse(scope.savedRows[0][6]).slice(1).map(item=>item.paid),[2874,0,0,0]);
});
test("crossing the monthly charge date requires recalculation before any settlement is saved",()=>{
  const scope=gasScope("2026-11-27T03:00:00Z"),body=payload();body.calculatedAt="2026-11-19T03:00:00Z";
  body.items.slice(-2).forEach(item=>item.paid=0);
  const result=scope.createTfgSettlement_(body);
  assert.equal(result.ok,false);assert.match(result.message,/決済予定日をまたいだ/);assert.equal(scope.savedRows.length,0);
});
test("withdrawal cutoffs and expiry always use Japan time",()=>{
  const server=gasScope();
  for(const file of ["admin/admin-settlement-v2.js","admin/admin-settlement.js"]){
    const scope=vm.createContext({});vm.runInContext(fn(fs.readFileSync(path.join(root,file),"utf8"),"cutoffInfo"),scope);
    for(const [at,withdrawal,expiry] of [
      ["2026-11-09T11:00:00Z","2026-11-30","2026-11-09T11:00:01Z"],
      ["2026-11-09T11:00:01Z","2026-12-31","2026-11-26T15:00:00Z"],
      ["2026-11-26T14:59:59Z","2026-12-31","2026-11-26T15:00:00Z"],
      ["2026-11-26T15:00:00Z","2026-12-31","2026-12-09T11:00:00Z"]
    ]){
      const now=new Date(at),result=scope.cutoffInfo(now);
      assert.equal(result.withdrawalDate,withdrawal);
      assert.equal(result.expiry.getTime(),Date.parse(expiry));
      assert.equal(server.tfgSettlementNextExpiry_(now).getTime(),result.expiry.getTime());
    }
  }
});
