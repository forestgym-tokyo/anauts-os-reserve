"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.join(__dirname,"admin-auto-reassign-enforce.js"),"utf8");
const calls=[];
const reservation={
  reservation_id:"R-OGINO-TOUR",
  date:"2026-08-26",
  start_time:"14:00",
  end_time:"15:00",
  service_code:"TOUR",
  service_name:"店内見学",
  customer_name:"荻野隆介",
  staff_code:"T1",
  status:"RESERVED"
};
const staff=[
  {staff_code:"T1",staff_name:"旧担当",active:true,role:"STAFF",can_tour:false,permission:"ADMIN"},
  {staff_code:"KAWAKAMI",staff_name:"川上一郎",active:true,role:"STAFF",can_tour:true}
];
const shifts=[{staff_code:"KAWAKAMI",date:"2026-08-26",start_time:"09:00",end_time:"18:00",active:true,store_code:"YACHIYO"}];
const context={
  console,
  Promise,
  Date,
  setTimeout,
  clearTimeout,
  state:{authUser:null},
  localYmd:()=>"2026-08-26",
  location:{reload(){throw new Error("full page reload must not be used");}},
  document:{readyState:"loading",querySelector:()=>null,addEventListener:()=>{}},
  apiGet:async(action,params)=>{
    calls.push({method:"GET",action,params});
    if(action==="getStaff")return{ok:true,data:{staff}};
    if(action==="getServices")return{ok:true,data:{services:[{service_code:"TOUR",provider_role:"STAFF"}]}};
    if(action==="getStaffShifts")return{ok:true,data:{shifts:[]}};
    if(action==="getStaffSchedule"&&params.date==="2026-08-26")return{ok:true,data:{reservations:[{...reservation}],shifts}};
    return{ok:true,data:{reservations:[]}};
  },
  apiPost:async payload=>{calls.push({method:"POST",payload});return{ok:true};}
};
context.window=context;
vm.runInNewContext(source,context,{filename:"admin-auto-reassign-enforce.js"});

(async()=>{
  const hooks=context.__ANAUTS_AUTO_REASSIGN_TEST__;
  assert.equal(hooks.eligible(staff[0],{service_code:"TOUR",provider_role:"STAFF"}),false,"ADMIN must not bypass can_tour=false");
  assert.equal(hooks.eligible({...staff[1],can_counsel:true},{service_code:"COUNSEL",provider_role:"STAFF"}),true);
  assert.equal(hooks.eligible({...staff[1],can_meal_planning:true},{service_code:"MEAL_PLANNING",provider_role:"STAFF"}),true);
  assert.equal(hooks.eligible({...staff[1],role:"TRAINER"},{service_code:"TOUR",provider_role:"STAFF"}),false);
  assert.equal(hooks.eligible({...staff[1],active:1,can_tour:1},{service_code:"TOUR",provider_role:"STAFF"}),true);
  assert.equal(hooks.shiftDateOf({shift_date:"2026-08-26"}),"2026-08-26");
  assert.equal(hooks.works(staff[1],shifts,reservation),true);
  assert.equal(hooks.works(staff[1],[{...shifts[0],end_time:"14:30"}],reservation),false);
  assert.equal(hooks.free(staff[1],reservation,[{reservation_id:"OTHER",staff_code:"KAWAKAMI",start_time:"14:30",end_time:"15:30",status:"RESERVED"}]),false);

  context.state.authUser={staff_code:"ADMIN"};
  const changed=await context.ANAUTS_ENFORCE_AUTO_REASSIGN(0,{force:true});
  assert.equal(changed,1);
  const updates=calls.filter(call=>call.method==="POST"&&call.payload.action==="updateReservation");
  assert.equal(updates.length,1,"reservation must be updated exactly once");
  assert.equal(updates[0].payload.reservation_id,"R-OGINO-TOUR");
  assert.equal(updates[0].payload.staff_code,"KAWAKAMI");
  assert.equal(updates[0].payload.internal_operation,true);
  assert.equal(calls.filter(call=>call.method==="GET").length,5,"one-day scan must use 3 master and 2 schedule requests");
  console.log("admin-auto-reassign-enforce tests passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
