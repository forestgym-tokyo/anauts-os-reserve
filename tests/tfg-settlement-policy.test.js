const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");

const adminSource=fs.readFileSync(path.join(__dirname,"../admin/admin-settlement-v2.js"),"utf8");
const gasSource=fs.readFileSync(path.join(__dirname,"../gas/91_TfgSettlementApproval.gs"),"utf8");

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
  assert.match(adminSource,/const campaignCompleted=new Date/);
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
  assert.match(adminSource,/会員向けメールをGmailの下書きに保存しました。内容を確認してGmailから送信してください。/);
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

const legacyAdminSource=fs.readFileSync(path.join(__dirname,"../admin/admin-settlement.js"),"utf8");
const approvalSource=fs.readFileSync(path.join(__dirname,"../settlement-approval/index.html"),"utf8");
function fixture(joinDate,withdrawalDate,{pause=false,unpaid=false}={}){
  const j=new Date(joinDate+"T00:00:00"),w=new Date(withdrawalDate+"T00:00:00");
  const items=[{label:"初期費用",kind:"INITIAL",baseNormal:8800,basePaid:0,normal:8800,paid:0},{label:"選べる特典",kind:"BENEFIT",baseNormal:6600,basePaid:0,normal:6600,paid:0}];
  for(let d=new Date(j.getFullYear(),j.getMonth(),1),i=0;d<=w;d=new Date(d.getFullYear(),d.getMonth()+1,1),i++){
    const first=i===0,final=d.getFullYear()===w.getFullYear()&&d.getMonth()===w.getMonth();
    items.push({target:`${d.getFullYear()}年${d.getMonth()+1}月`,label:first?"初月会費":"月会費",kind:"MONTH",basePaid:final&&unpaid?0:first?1000:4950,baseNormal:first?1500:7480,paid:final&&unpaid?0:first?1000:4950,normal:first?1500:7480,status:pause&&i===2?"休会":"通常",isFinalMonth:final});
  }
  return {joinDate,withdrawalDate,items};
}
function adminCalculate(source,data,unpaid){
  const scope=vm.createContext({current:{...structuredClone(data),beforeFinalCharge:unpaid},cutoffInfo:()=>({beforeFinalCharge:unpaid})});
  vm.runInContext(extractFunction(source,"recalculateCampaign_")+";recalculateCampaign_();",scope);
  return scope.current;
}
function serverCalculate(data,unpaid){
  const scope=vm.createContext({items:structuredClone(data.items),withdrawalDate:data.withdrawalDate,unpaid});
  vm.runInContext(extractFunction(gasSource,"tfgSettlementIsWithdrawalMonth_")+extractFunction(gasSource,"tfgSettlementCampaignProgress_")+extractFunction(gasSource,"tfgSettlementNormalizeItems_")+";this.result=tfgSettlementNormalizeItems_(items,withdrawalDate,unpaid,false,0);",scope);
  return scope.result;
}
for(const source of [adminSource,legacyAdminSource]){
  test(`admin ${source===adminSource?"v2":"legacy"}: first month excluded; following month starts at 1`,()=>{
    for(const join of ["2026-01-01","2026-01-15","2026-01-31"]){
      const first=adminCalculate(source,fixture(join,"2026-01-31"),false);
      assert.equal(first.completedPayments,0);
      assert.equal(first.items[2].paymentSequence,null);
      const next=adminCalculate(source,fixture(join,"2026-02-28"),false);
      assert.equal(next.completedPayments,1);
      assert.equal(next.items[3].paymentSequence,1);
      assert.ok(next.items[2].settlement>0,"initial prorated difference retained");
    }
  });
}
for(const join of ["2026-01-01","2026-01-15","2026-01-31","2024-02-29","2025-02-01","2025-02-15","2025-02-28"]){
  const j=new Date(join+"T00:00:00");
  const boundary=new Date(j.getFullYear()+1,j.getMonth()+1,0);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  for(const delta of [-1,0,1])for(const pause of [false,true])for(const unpaid of [false,true]){
    const d=new Date(boundary);d.setDate(d.getDate()+delta);
    test(`boundary ${join} ${iso(d)} pause=${pause} unpaid=${unpaid}`,()=>{
      const data=fixture(join,iso(d),{pause,unpaid});
      // Deliberately bogus client sequences must not determine the saved amount.
      data.items.forEach(x=>x.paymentSequence=99);
      const saved=serverCalculate(data,unpaid);
      for(const source of [adminSource,legacyAdminSource]){
        const ui=adminCalculate(source,data,unpaid);
        assert.equal(ui.campaignCompleted,!pause&&delta>=0);
        assert.deepEqual(Array.from(ui.items,x=>x.settlement),Array.from(saved,x=>x.settlement));
        const total=ui.items.reduce((s,x)=>s+x.settlement,0);
        if(!pause&&delta>=0)assert.equal(total,0);else assert.ok(total>0);
        if(pause){const row=ui.items.find(x=>x.status==="休会");assert.equal(row.paid,550);assert.equal(row.normal,550);assert.equal(row.settlement,0);assert.equal(row.paymentSequence,null);}
      }
    });
  }
}
test("preview, approval and server show the same postponed exemption month with suspension",()=>{
  const data=fixture("2026-01-15","2026-12-31",{pause:true});
  for(const [source,name,key] of [[adminSource,"campaignProgressForPreview_","remaining"],[approvalSource,"campaignProgress_","remaining"],[gasSource,"tfgSettlementCampaignProgress_","remainingMonths"]]){
    const scope=vm.createContext({items:data.items,date:data.withdrawalDate});
    vm.runInContext(extractFunction(source,name)+`;this.result=${name}(items,date);`,scope);
    assert.equal(scope.result[key],2);
    assert.match(source,/入会初月と休会月を除く満12か月が経過した月末に、精算金は免除されます。/);
  }
});
test("month enumeration ends at withdrawal month across December and year boundaries",()=>{
  for(const source of [adminSource,legacyAdminSource]){
    const scope=vm.createContext({});
    vm.runInContext(extractFunction(source,"monthsBetween")+";this.monthsBetween=monthsBetween;",scope);
    for(const [join,end,length] of [["2026-01-31","2026-12-31",12],["2026-12-01","2026-12-31",1],["2026-12-15","2027-01-31",2],["2025-01-01","2027-01-31",25]]){
      const rows=scope.monthsBetween(join,end);
      assert.equal(rows.length,length);
      assert.equal(rows.at(-1).y,Number(end.slice(0,4)));
      assert.equal(rows.at(-1).m+1,Number(end.slice(5,7)));
    }
  }
});
test("legacy flat-plan and final-charge rules remain intact before exemption",()=>{
  const scope=vm.createContext({});
  vm.runInContext(extractFunction(gasSource,"tfgSettlementIsWithdrawalMonth_")+extractFunction(gasSource,"tfgSettlementCampaignProgress_")+extractFunction(gasSource,"tfgSettlementNormalizeItems_"),scope);
  for(const rate of [4180,3300]){
    const rows=fixture("2025-01-15","2025-03-31").items;
    const result=scope.tfgSettlementNormalizeItems_(rows,"2025-03-31",true,true,rate);
    assert.equal(result[2].settlement,0);
    assert.equal(result[2].normal,result[2].paid);
    assert.equal(result[3].normal,rate);
    assert.equal(result[3].settlement,0);
    assert.equal(result[0].settlement,8800);
  }
  const data=fixture("2026-03-15","2026-05-31");
  const result=serverCalculate(data,true);
  assert.equal(result.at(-1).paid,0);
  assert.equal(result.at(-1).settlement,7480);
  assert.equal(result[0].settlement,8800);
  assert.equal(result[1].settlement,6600);
  assert.equal(result[2].settlement,500);
});

test("the initial month remains excluded when its status is suspended",()=>{
  const data=fixture("2026-01-15","2027-01-31");
  data.items[2].status="休会";
  for(const source of [adminSource,legacyAdminSource]){
    const ui=adminCalculate(source,data,false);
    assert.equal(ui.campaignCompleted,true);
    assert.equal(ui.items[2].paymentSequence,null);
    assert.equal(ui.items[3].paymentSequence,1);
  }
  const saved=serverCalculate(data,false);
  assert.equal(saved[2].paymentSequence,null);assert.equal(saved[3].paymentSequence,1);assert.equal(saved.reduce((sum,item)=>sum+item.settlement,0),0);
});

test("server labels the first month as proration even if a stale client calls it 1/12",()=>{
  const data=fixture("2026-01-15","2026-02-28");
  data.items[2].note="キャンペーン決済 1/12";data.items[2].paymentSequence=1;
  const saved=serverCalculate(data,false);
  assert.equal(saved[2].paymentSequence,null);assert.doesNotMatch(saved[2].note,/\d+\/12/);assert.match(saved[2].note,/日割り差額/);
  assert.equal(saved[3].paymentSequence,1);assert.match(saved[3].note,/継続月数 1\/12か月/);
  assert.equal(saved[2].settlement,500);
});
for(const pauseCount of [1,2,4])for(const delta of [-1,0,1]){
  test(`exemption excludes ${pauseCount} suspended months, boundary offset ${delta}`,()=>{
    const boundary=new Date(2027,1+pauseCount,0);
    boundary.setDate(boundary.getDate()+delta);
    const date=`${boundary.getFullYear()}-${String(boundary.getMonth()+1).padStart(2,"0")}-${String(boundary.getDate()).padStart(2,"0")}`;
    const data=fixture("2026-01-15",date);
    data.items.filter(x=>x.kind==="MONTH").slice(1,1+pauseCount).forEach(x=>x.status="休会");
    const server=serverCalculate(data,true);
    for(const source of [adminSource,legacyAdminSource]){
      const ui=adminCalculate(source,data,true);
      assert.equal(ui.campaignCompleted,delta>=0);
      assert.deepEqual(Array.from(ui.items,x=>x.settlement),Array.from(server,x=>x.settlement));
      assert.equal(ui.items.reduce((s,x)=>s+x.settlement,0)===0,delta>=0);
    }
    for(const [source,name,key] of [[adminSource,"campaignProgressForPreview_","remaining"],[approvalSource,"campaignProgress_","remaining"],[gasSource,"tfgSettlementCampaignProgress_","remainingMonths"]]){
      const scope=vm.createContext({items:data.items,date});
      vm.runInContext(extractFunction(source,name)+`;this.result=${name}(items,date);`,scope);
      assert.equal(scope.result[key],delta>=0?0:1);
    }
  });
}
test("suspension in the already-excluded joining month does not extend exemption twice",()=>{
  const data=fixture("2026-01-15","2027-01-31");data.items[2].status="休会";
  for(const source of [adminSource,legacyAdminSource])assert.equal(adminCalculate(source,data,false).campaignCompleted,true);
  assert.equal(serverCalculate(data,false).reduce((s,x)=>s+x.settlement,0),0);
});


test("zero final month billing waives only the last month in both UI and stored calculations",()=>{
  for(const withdrawal of ["2026-07-31","2026-12-31"])for(const unpaid of [false,true])for(const pause of [false,true]){
    const data=fixture("2026-07-14",withdrawal);
    data.finalMonthBilling="ZERO";
    if(pause)data.items.at(-1).status="休会";
    const normal=adminCalculate(adminSource,{...data,finalMonthBilling:"NORMAL"},unpaid);
    const ui=adminCalculate(adminSource,data,unpaid);
    const scope=vm.createContext({items:structuredClone(data.items),date:withdrawal,unpaid});
    vm.runInContext(extractFunction(gasSource,"tfgSettlementIsWithdrawalMonth_")+extractFunction(gasSource,"tfgSettlementCampaignProgress_")+extractFunction(gasSource,"tfgSettlementNormalizeItems_")+';this.saved=tfgSettlementNormalizeItems_(items,date,unpaid,false,0,"ZERO");',scope);
    assert.equal(ui.items.at(-1).settlement,0);
    assert.equal(ui.items.at(-1).normal,0);
    assert.equal(scope.saved.at(-1).normal,0);
    assert.match(ui.items.at(-1).note,withdrawal==="2026-12-31"?/実質退会日：2026-11-30/:/実質退会日：2026-06-30/);
    assert.match(ui.items.at(-1).note,/最終月請求なし（0円）/);
    assert.deepEqual(Array.from(ui.items,x=>x.settlement),Array.from(scope.saved,x=>x.settlement));
    assert.deepEqual(ui.items.slice(0,-1),normal.items.slice(0,-1));
    assert.equal(ui.withdrawalDate,withdrawal);
    assert.equal(ui.items.at(-1).paid,normal.items.at(-1).paid);
  }
});

test("server zero billing does not waive an earlier month with a forged final-month flag",()=>{
  const data=fixture("2026-07-14","2026-12-31");
  data.items[3].isFinalMonth=true;
  const scope=vm.createContext({items:data.items});
  vm.runInContext(extractFunction(gasSource,"tfgSettlementIsWithdrawalMonth_")+extractFunction(gasSource,"tfgSettlementCampaignProgress_")+extractFunction(gasSource,"tfgSettlementNormalizeItems_")+';this.saved=tfgSettlementNormalizeItems_(items,"2026-12-31",false,false,0,"ZERO");',scope);
  assert.ok(scope.saved[3].settlement>0);
  assert.equal(scope.saved.at(-1).settlement,0);
});
