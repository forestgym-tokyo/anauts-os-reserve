(()=>{
  "use strict";
  if(window.__ANAUTS_AUTO_REASSIGN_ENFORCE__)return;
  window.__ANAUTS_AUTO_REASSIGN_ENFORCE__=true;

  const STORE_CODE="YACHIYO",HORIZON_DAYS=30,MAX_DATE_WORKERS=4,MIN_SCAN_INTERVAL_MS=15000;
  const AUTO_SERVICES=new Set(["TOUR","COUNSEL","MEAL_PLANNING"]);
  const REASSIGN_TRIGGERS=new Set(["saveStaff","saveService","saveStaffShift","deleteStaffShift","createShiftChangeRequest"]);
  const code=v=>String(v||"").trim().toUpperCase(),bool=v=>v===true||code(v)==="TRUE",hhmm=v=>String(v||"").slice(0,5);
  const mins=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||""));return m?Number(m[1])*60+Number(m[2]):NaN;};
  const covers=(s,e,rs,re)=>mins(s)<=mins(rs)&&mins(e)>=mins(re),overlap=(a1,a2,b1,b2)=>mins(a1)<mins(b2)&&mins(a2)>mins(b1);
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(v,n)=>{const [y,m,d]=String(v).split("-").map(Number),x=new Date(y,m-1,d+n);return ymd(x);};
  const dateOf=r=>String(r?.date||r?.reservation_date||"").slice(0,10),serviceCodeOf=r=>code(r?.service_code);
  const activeReservation=r=>!["CANCELLED","CANCELED","CANCEL","CONSUMED"].includes(code(r?.status));
  let runningPromise=null,queuedDays=0,triggerTimer=0,lastStartedAt=0,apiWrapped=false,authRunDone=false,authHookInstalled=false;

  function permissionColumn(serviceCode){
    return serviceCode==="TOUR"?"can_tour":serviceCode==="COUNSEL"?"can_counsel":serviceCode==="MEAL_PLANNING"?"can_meal_planning":"";
  }
  function roleAllowed(staff,service){const roles=String(service?.provider_role||"").split(",").map(code).filter(Boolean);return !roles.length||roles.includes(code(staff?.role));}
  function serviceAllowed(staff,service){const column=permissionColumn(code(service?.service_code));return !column||bool(staff?.[column]);}
  function eligible(staff,service){return !!staff&&bool(staff.active)&&roleAllowed(staff,service)&&serviceAllowed(staff,service);}
  function uniqueReservations(rows){
    const result=new Map();
    (rows||[]).forEach(r=>{const key=String(r?.reservation_id||"")||[dateOf(r),hhmm(r?.start_time),serviceCodeOf(r),r?.customer_name||""].join("|");if(!result.has(key))result.set(key,r);});
    return Array.from(result.values());
  }
  function works(staff,shifts,reservation){
    const staffCode=code(staff?.staff_code),date=dateOf(reservation);
    return shifts.some(shift=>code(shift?.staff_code)===staffCode&&String(shift?.date||"").slice(0,10)===date&&covers(shift?.start_time,shift?.end_time,reservation?.start_time,reservation?.end_time));
  }
  function free(staff,reservation,dateRows){
    const staffCode=code(staff?.staff_code);
    return !dateRows.some(other=>activeReservation(other)&&String(other?.reservation_id||"")!==String(reservation?.reservation_id||"")&&code(other?.staff_code)===staffCode&&overlap(other?.start_time,other?.end_time,reservation?.start_time,reservation?.end_time));
  }
  function rankCandidate(staff,dateRows){
    const staffCode=code(staff?.staff_code),assigned=dateRows.filter(r=>activeReservation(r)&&AUTO_SERVICES.has(serviceCodeOf(r))&&code(r?.staff_code)===staffCode);
    return[assigned.length,assigned.reduce((v,r)=>Math.max(v,mins(r?.start_time)||0),0),staffCode];
  }
  function chooseCandidate(candidates,dateRows){return candidates.slice().sort((a,b)=>{const x=rankCandidate(a,dateRows),y=rankCandidate(b,dateRows);for(let i=0;i<x.length;i++){if(x[i]<y[i])return-1;if(x[i]>y[i])return 1;}return 0;})[0]||null;}

  async function loadMaster(start,end){
    const [staffJson,serviceJson,shiftJson]=await Promise.all([apiGet("getStaff",{include_inactive:"true"}),apiGet("getServices"),apiGet("getStaffShifts",{start_date:start,end_date:end})]);
    return{
      staff:Array.isArray(staffJson?.data?.staff)?staffJson.data.staff:(Array.isArray(staffJson?.data)?staffJson.data:[]),
      services:Array.isArray(serviceJson?.data?.services)?serviceJson.data.services:(Array.isArray(serviceJson?.data)?serviceJson.data:[]),
      shifts:(Array.isArray(shiftJson?.data?.shifts)?shiftJson.data.shifts:(Array.isArray(shiftJson?.data)?shiftJson.data:[])).filter(x=>x?.active!==false&&code(x?.store_code||STORE_CODE)===STORE_CODE)
    };
  }
  async function loadDateReservations(date){
    const actions=["getStaffSchedule","getTrainerSchedule"],results=await Promise.allSettled(actions.map(action=>apiGet(action,{date,store_code:STORE_CODE}))),rows=[];
    results.forEach((result,index)=>{if(result.status==="rejected"){console.warn("A-nauts auto reassign schedule fetch failed",actions[index],date,result.reason);return;}const reservations=Array.isArray(result.value?.data?.reservations)?result.value.data.reservations:[];rows.push(...reservations.map(r=>({...r,date:dateOf(r)||date})));});
    return uniqueReservations(rows.filter(activeReservation));
  }
  async function mapWithConcurrency(items,limit,worker){
    let cursor=0;const results=new Array(items.length),run=async()=>{while(cursor<items.length){const index=cursor++;results[index]=await worker(items[index],index);}};
    await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return results;
  }
  async function scanAndReassign(days){
    const start=typeof localYmd==="function"?localYmd():ymd(new Date()),end=addDays(start,days),master=await loadMaster(start,end);
    const staffByCode=new Map(master.staff.map(s=>[code(s?.staff_code),s])),serviceByCode=new Map(master.services.map(s=>[code(s?.service_code),s]));
    const dates=Array.from({length:days+1},(_,index)=>addDays(start,index)),dateRows=await mapWithConcurrency(dates,MAX_DATE_WORKERS,loadDateReservations);
    let changed=0;const failures=[];
    // Serialize writes: later choices must see assignments made earlier on the same date.
    for(const rows of dateRows)for(const reservation of rows){
      const serviceCode=serviceCodeOf(reservation);if(!AUTO_SERVICES.has(serviceCode)||!reservation?.reservation_id)continue;
      const service=serviceByCode.get(serviceCode)||{service_code:serviceCode,provider_role:reservation?.provider_role||"STAFF"},assigned=staffByCode.get(code(reservation?.staff_code));
      if(assigned&&eligible(assigned,service)&&works(assigned,master.shifts,reservation))continue;
      const chosen=chooseCandidate(master.staff.filter(staff=>eligible(staff,service)&&works(staff,master.shifts,reservation)&&free(staff,reservation,rows)),rows);
      if(!chosen)continue;
      try{
        await apiPost({action:"updateReservation",internal_operation:true,reservation_id:reservation.reservation_id,date:dateOf(reservation),start_time:hhmm(reservation.start_time),staff_code:chosen.staff_code});
        reservation.staff_code=chosen.staff_code;reservation.staff_name=chosen.staff_name||chosen.display_name||chosen.staff_code;changed++;
      }catch(error){failures.push({reservation_id:reservation.reservation_id,message:error?.message||String(error)});console.error("A-nauts auto reassign failed",failures[failures.length-1]);}
    }
    window.__ANAUTS_AUTO_REASSIGN_LAST_FAILURES__=failures;return changed;
  }
  async function refreshVisibleSchedule(){
    try{if(document.querySelector("#staffScheduleView.is-active")&&typeof loadStaffSchedule==="function")await loadStaffSchedule();else if(document.querySelector("#trainerScheduleView.is-active")&&typeof loadTrainerSchedule==="function")await loadTrainerSchedule();}
    catch(error){console.warn("A-nauts schedule refresh after reassignment failed",error);}
  }
  function enforceAutoReassign(days=HORIZON_DAYS,{force=false}={}){
    if(typeof state==="undefined"||!state?.authUser||typeof apiGet!=="function"||typeof apiPost!=="function")return Promise.resolve(0);
    if(runningPromise){queuedDays=Math.max(queuedDays,days);return runningPromise;}
    const wait=force?0:Math.max(0,MIN_SCAN_INTERVAL_MS-(Date.now()-lastStartedAt));
    runningPromise=(async()=>{if(wait)await new Promise(resolve=>setTimeout(resolve,wait));lastStartedAt=Date.now();const changed=await scanAndReassign(days);if(changed)await refreshVisibleSchedule();return changed;})()
      .catch(error=>{window.__ANAUTS_AUTO_REASSIGN_LAST_FAILURES__=[{reservation_id:"SYSTEM",message:error?.message||String(error)}];console.error("A-nauts auto reassign scan failed",error);return 0;})
      .finally(()=>{runningPromise=null;if(queuedDays){const nextDays=queuedDays;queuedDays=0;scheduleAutoReassign(nextDays,250);}});
    return runningPromise;
  }
  function scheduleAutoReassign(days=HORIZON_DAYS,delay=500){clearTimeout(triggerTimer);triggerTimer=setTimeout(()=>enforceAutoReassign(days),delay);}
  function installApiHook(){
    if(apiWrapped||typeof apiPost!=="function")return;const original=apiPost;
    apiPost=async function(payload){const result=await original(payload);if(payload&&!payload.internal_operation&&REASSIGN_TRIGGERS.has(payload.action))scheduleAutoReassign(HORIZON_DAYS,500);return result;};apiWrapped=true;
  }
  function installAuthHook(){
    if(authHookInstalled||typeof applyPermissionUi!=="function")return;
    const original=applyPermissionUi;
    applyPermissionUi=function(){
      const wasAuthenticated=authRunDone;
      const result=original.apply(this,arguments);
      authRunDone=!!state?.authUser;
      if(authRunDone&&!wasAuthenticated)scheduleAutoReassign(HORIZON_DAYS,2500);
      return result;
    };
    authHookInstalled=true;
  }
  function waitForAuth(){
    if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"){setTimeout(waitForAuth,100);return;}
    installApiHook();installAuthHook();if(state?.authUser){if(!authRunDone){authRunDone=true;scheduleAutoReassign(HORIZON_DAYS,2500);}return;}setTimeout(waitForAuth,150);
  }

  window.ANAUTS_ENFORCE_AUTO_REASSIGN=enforceAutoReassign;
  window.ANAUTS_SCHEDULE_AUTO_REASSIGN=scheduleAutoReassign;
  window.__ANAUTS_AUTO_REASSIGN_TEST__={eligible,works,free,chooseCandidate,uniqueReservations};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",waitForAuth,{once:true});else waitForAuth();
})();
