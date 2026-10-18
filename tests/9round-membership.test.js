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
test("inclusive days, final-floor rounding, leap years and the 24/25 boundary",()=>{
  assert.equal(model.quote("PREMIUM_ONE","2026-10-18").firstMonthFee,2781);
  assert.equal(model.quote("PREMIUM_ONE","2026-10-25").total,7550);
  assert.equal(model.quote("PREMIUM_HALF","2026-10-25").total,11794);
  assert.equal(model.quote("REGULAR","2026-10-25").total,29238);
  assert.equal(model.quote("REGULAR","2026-10-24").nextMonthFee,0);
  assert.equal(model.quote("REGULAR","2026-10-25").nextMonthFee,7700);
  assert.equal(model.quote("REGULAR","2026-10-01").firstMonthFee,7700);
  assert.equal(model.quote("PREMIUM_ONE","2026-10-31").firstMonthFee,198);
  assert.equal(model.quote("PREMIUM_ONE","2028-02-29").firstMonthFee,212);
  assert.equal(model.quote("PREMIUM_ONE","2027-02-28").firstMonthFee,220);
  assert.equal(model.quote("PREMIUM_ONE","2027-02-29"),null);
  assert.equal(model.quote("BAD","2026-10-25"),null);
  assert.equal(model.quote("REGULAR","2026-12-31").nextMonth,"2027-01");
});
test("server recalculates client-tampered amounts and records pending application in the master",()=>{
  const e=env(), before=JSON.stringify(e.master.getSheetByName("Members").rows), p=input({total:1,initial_fee:0,first_month_fee:0});
  const saved=e.call("create9RoundMembershipApplication",p); assert.equal(saved.ok,true,JSON.stringify(saved));
  assert.equal(saved.data.quote.total,7550); const row=e.rows()[0];
  assert.equal(row["初回合計"],7550); assert.equal(row["初月日割り会費"],1390); assert.equal(row["当月日数"],31); assert.equal(row["初月利用日数"],7);
  assert.equal(row["カード登録状態"],"未登録"); assert.equal(row["決済状態"],"未決済"); assert.equal(row["申込ステータス"],"内容確認待ち"); assert.equal(row["会員番号"],"");
  assert.equal(JSON.stringify(e.master.getSheetByName("Members").rows),before); assert.equal(e.sent.length,0);
});
test("network retries are idempotent, changed content cannot reuse a request key, and formulas are escaped",()=>{
  const e=env(),p=input({name:"=IMPORTDATA(悪意)"}); const a=e.call("create9RoundMembershipApplication",p),b=e.call("create9RoundMembershipApplication",p);
  assert.equal(a.ok,true,JSON.stringify(a)); assert.equal(a.data.application_id,b.data.application_id); assert.equal(e.rows().length,1); assert.equal(e.rows()[0]["名前"].startsWith("'="),true);
  assert.equal(e.call("create9RoundMembershipApplication",{...p,name:"変更"}).code,"MEMBERSHIP_REQUEST_CHANGED");
  assert.equal(e.call("create9RoundMembershipApplication",input()).code,"MEMBERSHIP_ALREADY_RECEIVED");
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
