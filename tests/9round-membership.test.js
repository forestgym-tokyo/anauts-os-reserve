const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const crypto = require("node:crypto");
const { fixture } = require("./helpers/9round-trial-fixture.cjs");
const model = require("../9round-booking/membership/plans.js");
const postal = require("../9round-booking/membership/postal.js");
const read = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
function env() {
  const e = fixture();
  e.properties.ROUND9_MEMBERSHIP_ENABLED = "true";
  e.context.PropertiesService.getScriptProperties = () => ({getProperties:()=>e.properties, getProperty:k=>e.properties[k]});
  vm.runInContext(read("9round-booking/membership/plans.js"), e.context);
  vm.runInContext(read("9round-booking/gas/Membership.gs"), e.context);
  const headers = vm.runInContext("Array.from(NR_MEMBERSHIP.headers)", e.context);
  const sheet = e.master.insertSheet("WEB入会申込"); sheet.rows = [Array.from(headers)];
  e.master.getSheetByName("Members").rows[0].push("利用開始日", "キャンペーン名（日本語）");
  return Object.assign(e, {sheet, headers, rows:()=>sheet.rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]])))});
}
function input(extra={}) { return {request_id:crypto.randomBytes(32).toString("hex"), plan_id:"PREMIUM_ONE", start_date:"2026-10-25", name:"入会 テスト", name_kana:"ニュウカイ テスト", birth_date:"1990-01-01", email:"trial0@example.invalid", phone:"09012345678", postal_code:"2600835", address_base:"千葉県千葉市中央区川崎町", address_detail:"1-1", consent_terms:true, consent_privacy:true, ...extra}; }
test("application date determines next-month collection while the start date determines inclusive proration",()=>{
  const quote=(plan,start,application="2026-10-18")=>model.quote(plan,start,application);
  assert.equal(quote("PREMIUM_ONE","2026-10-18").total,2781);
  assert.equal(quote("PREMIUM_ONE","2026-10-25").total,1390);
  assert.equal(quote("PREMIUM_HALF","2026-10-25").total,4864);
  assert.equal(quote("REGULAR","2026-10-25").total,21538);
  assert.equal(quote("PREMIUM_ONE","2026-10-25").nextMonthFee,0);
  assert.equal(quote("PREMIUM_ONE","2026-10-25").nextBillingDate,"2026-10-25");
  assert.equal(quote("PREMIUM_ONE","2026-10-25").nextBillingMonth,"2026-11");
  assert.equal(quote("PREMIUM_ONE","2026-10-25").nextBillingFee,6160);
  assert.equal(quote("PREMIUM_ONE","2026-10-31","2026-10-24").nextMonthFee,0);
  assert.equal(quote("PREMIUM_ONE","2026-10-31","2026-10-25").nextMonthFee,6160);
  assert.equal(quote("PREMIUM_ONE","2026-10-31","2026-10-25").nextBillingDate,"2026-11-25");
  assert.equal(quote("PREMIUM_ONE","2026-10-31","2026-10-25").nextBillingMonth,"2026-12");
  assert.equal(quote("REGULAR","2026-10-01","2026-10-01").firstMonthFee,7700);
  assert.equal(quote("PREMIUM_ONE","2026-10-31").firstMonthFee,198);
  assert.equal(quote("PREMIUM_ONE","2028-02-29","2028-02-18").firstMonthFee,212);
  assert.equal(quote("PREMIUM_ONE","2027-02-28","2027-02-18").firstMonthFee,220);
  assert.equal(quote("PREMIUM_ONE","2027-02-29"),null);
  assert.equal(quote("BAD","2026-10-25"),null);
  assert.equal(quote("REGULAR","2026-12-31","2026-12-18").nextMonth,"2027-01");
  assert.equal(model.validStart("2026-10-18","2026-10-18"),true);
  assert.equal(model.validStart("2026-10-31","2026-10-18"),true);
  assert.equal(model.validStart("2026-10-17","2026-10-18"),false);
  assert.equal(model.validStart("2026-11-01","2026-10-18"),false);
});
test("server recalculates client-tampered amounts and records pending application in the master",()=>{
  const e=env(), before=JSON.stringify(e.master.getSheetByName("Members").rows), p=input({total:1,initial_fee:0,first_month_fee:0});
  const saved=e.call("create9RoundMembershipApplication",p); assert.equal(saved.ok,true,JSON.stringify(saved));
  assert.equal(saved.data.quote.total,1390); const row=e.rows()[0];
  assert.equal(row["初回合計"],1390); assert.equal(row["初月日割り会費"],1390); assert.equal(row["当月日数"],31); assert.equal(row["初月利用日数"],7);
  assert.equal(row["カード登録状態"],"未登録"); assert.equal(row["決済状態"],"未決済"); assert.equal(row["申込ステータス"],"内容確認待ち"); assert.equal(row["会員番号"],"");
  assert.equal(JSON.stringify(e.master.getSheetByName("Members").rows),before); assert.equal(e.sent.length,0);
});
test("network retries are idempotent, changed content cannot reuse a request key, and formulas are escaped",()=>{
  const e=env(),p=input({name:"=IMPORTDATA(悪意)"}); const a=e.call("create9RoundMembershipApplication",p),b=e.call("create9RoundMembershipApplication",p);
  assert.equal(a.ok,true,JSON.stringify(a)); assert.equal(a.data.application_id,b.data.application_id); assert.equal(e.rows().length,1); assert.equal(e.rows()[0]["名前"].startsWith("'="),true);
  assert.equal(e.call("create9RoundMembershipApplication",{...p,name:"変更"}).code,"MEMBERSHIP_REQUEST_CHANGED");
  assert.equal(e.call("create9RoundMembershipApplication",input()).code,"MEMBERSHIP_ALREADY_RECEIVED");
});
test("retries after the 25th retain the original application-day total and schedule",()=>{
  const e=env(),p=input();const a=e.call("create9RoundMembershipApplication",p);assert.equal(a.ok,true);
  e.setNow("2026-10-25T01:00:00Z");const b=e.call("create9RoundMembershipApplication",p);
  assert.equal(b.ok,true);assert.equal(b.data.application_id,a.data.application_id);assert.equal(b.data.quote.total,1390);
  assert.equal(b.data.quote.nextMonthFee,0);assert.equal(b.data.quote.nextBillingDate,"2026-10-25");
  const c=e.call("create9RoundMembershipApplication",input({email:"trial1@example.invalid",start_date:"2026-10-31",application_date:"2026-10-18"}));
  assert.equal(c.ok,true);assert.equal(c.data.quote.total,6358);assert.equal(c.data.quote.nextMonthFee,6160);
});
test("One and Half share 30 places including paper entries, and regular plans remain available",()=>{
  const e=env(),master=e.master.getSheetByName("Members"); master.rows.push(["1000099","紙入会","paper@example.invalid","ok","2026/10/10","【プレミアムONE】10月分"]);
  for(let i=0;i<29;i++){const email=`test${i}@example.invalid`; e.properties.ROUND9_BOOKING_TEST_EMAILS+=","+email; assert.equal(e.call("create9RoundMembershipApplication",input({email,plan_id:i%2?"PREMIUM_HALF":"PREMIUM_ONE"})).ok,true);}
  assert.equal(e.call("create9RoundMembershipApplication",input()).code,"MEMBERSHIP_CAMPAIGN_FULL");
  assert.equal(e.call("create9RoundMembershipApplication",input({plan_id:"REGULAR"})).ok,true);
});
test("disabled, invalid, unconsented, stale and forged trial requests cannot write",()=>{
  const e=env(); e.properties.ROUND9_MEMBERSHIP_ENABLED="false"; assert.equal(e.call("create9RoundMembershipApplication",input()).code,"MEMBERSHIP_DISABLED");
  e.properties.ROUND9_MEMBERSHIP_ENABLED="true";
  for(const extra of [{consent_terms:false},{consent_privacy:"true"},{website:"spam"},{name_kana:"name"},{birth_date:"2026-10-18"},{postal_code:"123"},{plan_id:"BAD"},{start_date:"2026-11-01"},{start_date:"2026-10-01"},{trial_application_id:"a".repeat(64),trial_token:"a".repeat(64)}]) assert.equal(e.call("create9RoundMembershipApplication",input(extra)).ok,false,JSON.stringify(extra));
  assert.equal(e.rows().length,0);
});
test("postal normalization, exact match, deduplication and multiple candidates",()=>{
  assert.equal(postal.normalize("２６０－０８３５"),"2600835");
  const r={zipcode:"2600835",address1:"千葉県",address2:"千葉市中央区",address3:"川崎町"};
  assert.deepEqual(postal.addresses({status:200,results:[r,r,{...r,address3:"別町"},{...r,zipcode:"9999999"}]},"2600835"),["千葉県千葉市中央区川崎町","千葉県千葉市中央区別町"]);
  assert.deepEqual(postal.addresses({status:200,results:null},"2600835"),[]); assert.throws(()=>postal.addresses({status:500},"2600835"));
});
function formHarness(hash="") {
  class Element {
    constructor(){this.value="";this.maxLength=254;this.children=[];this.listeners={};this.classList={toggle(){}};this.dataset={};}
    append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
    addEventListener(type,fn){this.listeners[type]=fn;} setAttribute(){} removeAttribute(){} focus(){} scrollIntoView(){} setCustomValidity(){} reportValidity(){return true;}
  }
  const ids=[...read("9round-booking/membership/index.html").matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  let resolveTrial, rejectTrial; const pending=new Promise((resolve,reject)=>{resolveTrial=resolve;rejectTrial=reject;});
  const calls=[],history=[];
  const w={NineRoundMembershipPlans:{...model,today:()=>"2026-10-18"},NineRoundMembershipPostal:{connect(){}},crypto:crypto.webcrypto,
    location:{hash,pathname:"/9round-booking/membership/",search:""},history:{replaceState(...args){history.push(args[2]);}},
    NineRoundBookingApi(action,payload){calls.push({action,payload});return action==="get9RoundTrialBooking"?pending:Promise.resolve({accepting:false});}};
  const doc={getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),querySelector:()=>new Element(),querySelectorAll:()=>[]};
  vm.runInNewContext(read("9round-booking/membership/app.js"),{window:w,document:doc,URLSearchParams,Uint8Array});
  return {elements,calls,history,resolveTrial,rejectTrial};
}
test("trial reference prefills only stored contact fields, removes the fragment and preserves edits during loading",async()=>{
  const id="a".repeat(64),token="b".repeat(64),e=formHarness("#application_id="+id+"&trial_token="+token);
  e.elements.fullName.value="入力中の名前";
  e.resolveTrial({application_id:id,name:"体験予約の名前",email:"visitor@example.invalid",phone:"09012345678"});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(e.elements.fullName.value,"入力中の名前");assert.equal(e.elements.memberEmail.value,"visitor@example.invalid");assert.equal(e.elements.memberPhone.value,"09012345678");
  assert.equal(e.elements.memberAddress.value,"");assert.deepEqual(e.history,["/9round-booking/membership/"]);
  assert.equal(e.calls.filter(c=>c.action==="get9RoundTrialBooking").length,1);
});
test("invalid or expired trial references remain editable without invented customer information",async()=>{
  const invalid=formHarness("#name=偽の名前&email=fake@example.invalid");assert.equal(invalid.calls.some(c=>c.action==="get9RoundTrialBooking"),false);assert.equal(invalid.elements.fullName.value,"");
  const expired=formHarness("#application_id="+"a".repeat(64)+"&trial_token="+"b".repeat(64));expired.rejectTrial(new Error("expired"));await new Promise(resolve=>setImmediate(resolve));
  assert.match(expired.elements.prefillNotice.textContent,/取得できませんでした/);assert.equal(expired.elements.memberFields.disabled,false);
});

test("first page defaults to today and Premium One and refreshes its immediate amount",()=>{
  const e=formHarness(); assert.equal(e.elements.startDate.value,"2026-10-18");
  function text(element){return (element.textContent||"")+(element.children||[]).map(text).join(" ");}
  assert.match(text(e.elements.firstPlanSummary),/プレミアムOne/);assert.match(text(e.elements.firstPlanSummary),/2,781円/);
  e.elements.startDate.value="2026-10-25";e.elements.startDate.listeners.input();
  assert.match(text(e.elements.firstPlanSummary),/1,390円/);assert.match(text(e.elements.firstPlanSummary),/2026年10月25日/);
  const html=read("9round-booking/membership/index.html");
  assert.ok(html.indexOf('id="startDate"')<html.indexOf('id="detailsStage"'));
  assert.match(html,/id="startDate"[^>]*form="memberForm"/);
  assert.ok(!html.includes('class="steps"'));assert.match(html,/① プランを選ぶ/);
});
