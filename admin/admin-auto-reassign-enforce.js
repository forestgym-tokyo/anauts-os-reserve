(()=>{
  "use strict";

  const STORE_CODE="YACHIYO";
  const HORIZON_DAYS=30;
  const AUTO_SERVICES=new Set(["TOUR","COUNSEL","MEAL_PLANNING"]);
  const code=v=>String(v||"").trim().toUpperCase();
  const bool=v=>v===true||code(v)==="TRUE";
  const hhmm=v=>String(v||"").slice(0,5);
  const mins=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||""));return m?Number(m[1])*60+Number(m[2]):NaN;};
  const covers=(s,e,rs,re)=>mins(s)<=mins(rs)&&mins(e)>=mins(re);
  const overlap=(a1,a2,b1,b2)=>mins(a1)<mins(b2)&&mins(a2)>mins(b1);
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(v,n)=>{const [y,m,d]=String(v).split("-").map(Number),x=new Date(y,m-1,d+n);return ymd(x);};
  const dateOf=r=>String(r?.date||r?.reservation_date||"").slice(0,10);
  const serviceCodeOf=r=>code(r?.service_code);
  const activeReservation=r=>!["CANCELLED","CANCELED","CANCEL","CONSUMED"].includes(code(r?.status));

  let running=false;
  let queued=false;
  let authRunDone=false;

  function permissionOf(s){
    return code(s?.permission||s?.auth_permission||s?.user_permission||"");
  }

  function isManagement(s){
    const p=permissionOf(s);
    return p==="ADMIN"||p==="MANAGER";
  }

  function permissionColumn(serviceCode){
    if(serviceCode==="TOUR")return"can_tour";
    if(serviceCode==="COUNSEL")return"can_counsel";
    if(serviceCode==="MEAL_PLANNING")return"can_meal_planning";
    return"";
  }

  function isActiveStaff(s){
    return !!s&&bool(s.active);
  }

  function roleAllowed(s,service){
    const roles=String(service?.provider_role||"").split(",").map(code).filter(Boolean);
    return !roles.length||roles.includes(code(s?.role));
  }

  function serviceAllowed(s,service){
    const serviceCode=code(service?.service_code);
    const col=permissionColumn(serviceCode);
    if(!col)return true;
    if(bool(s?.[col]))return true;
    if(AUTO_SERVICES.has(serviceCode)&&isManagement(s))return true;
    return false;
  }

  function eligible(s,service){
    return isActiveStaff(s)&&roleAllowed(s,service)&&serviceAllowed(s,service);
  }

  function uniqueReservations(rows){
    const map=new Map();
    (rows||[]).forEach(r=>{
      const key=String(r?.reservation_id||"")||[dateOf(r),hhmm(r?.start_time),serviceCodeOf(r),r?.customer_name||""].join("|");
      if(!map.has(key))map.set(key,r);
    });
    return Array.from(map.values());
  }

  function works(staff,shifts,r){
    const staffCode=code(staff?.staff_code),date=dateOf(r);
    return shifts.some(x=>
      code(x?.staff_code)===staffCode&&
      String(x?.date||"").slice(0,10)===date&&
      covers(x?.start_time,x?.end_time,r?.start_time,r?.end_time)
    );
  }

  function free(staff,r,dateRows){
    const staffCode=code(staff?.staff_code);
    return !dateRows.some(o=>{
      if(!activeReservation(o))return false;
      if(String(o?.reservation_id||"")===String(r?.reservation_id||""))return false;
      if(code(o?.staff_code)!==staffCode)return false;
      return overlap(o?.start_time,o?.end_time,r?.start_time,r?.end_time);
    });
  }

  function rankCandidate(s,dateRows){
    const p=permissionOf(s);
    const permissionRank=p==="ADMIN"?0:(p==="MANAGER"?1:2);
    const staffCode=code(s?.staff_code);
    const assigned=dateRows.filter(r=>activeReservation(r)&&AUTO_SERVICES.has(serviceCodeOf(r))&&code(r?.staff_code)===staffCode);
    const last=assigned.reduce((v,r)=>Math.max(v,mins(r?.start_time)||0),0);
    return[permissionRank,assigned.length,last,staffCode];
  }

  function chooseCandidate(candidates,dateRows){
    return candidates.slice().sort((a,b)=>{
      const x=rankCandidate(a,dateRows),y=rankCandidate(b,dateRows);
      for(let i=0;i<x.length;i++){
        if(x[i]<y[i])return-1;
        if(x[i]>y[i])return 1;
      }
      return 0;
    })[0]||null;
  }

  async function loadMaster(start,end){
    const [staffJson,serviceJson,shiftJson]=await Promise.all([
      apiGet("getStaff",{include_inactive:"true"}),
      apiGet("getServices"),
      apiGet("getStaffShifts",{start_date:start,end_date:end})
    ]);
    const staff=Array.isArray(staffJson?.data?.staff)?staffJson.data.staff:(Array.isArray(staffJson?.data)?staffJson.data:[]);
    const services=Array.isArray(serviceJson?.data?.services)?serviceJson.data.services:(Array.isArray(serviceJson?.data)?serviceJson.data:[]);
    const shifts=(Array.isArray(shiftJson?.data?.shifts)?shiftJson.data.shifts:(Array.isArray(shiftJson?.data)?shiftJson.data:[]))
      .filter(x=>x?.active!==false&&code(x?.store_code||STORE_CODE)===STORE_CODE);
    return{staff,services,shifts};
  }

  async function loadDateReservations(date){
    const rows=[];
    for(const action of ["getStaffSchedule","getTrainerSchedule"]){
      try{
        const j=await apiGet(action,{date,store_code:STORE_CODE});
        const a=Array.isArray(j?.data?.reservations)?j.data.reservations:[];
        rows.push(...a.map(r=>({...r,date:dateOf(r)||date})));
      }catch(error){
        console.warn("A-nauts auto reassign schedule fetch failed",action,date,error);
      }
    }
    return uniqueReservations(rows.filter(activeReservation));
  }

  async function reassignOne(r,chosen){
    const result=await apiPost({
      action:"updateReservation",
      internal_operation:true,
      reservation_id:r.reservation_id,
      date:dateOf(r),
      start_time:hhmm(r.start_time),
      staff_code:chosen.staff_code
    });
    if(result&&result.ok===false){
      throw new Error(result.message||"予約担当者の変更に失敗しました。");
    }
    return result;
  }

  function showFailures(failures){
    if(!failures.length)return;
    const f=failures[0];
    const text=`自動担当変更に失敗しました：${f.customer||f.reservation_id} / ${f.message}`;
    for(const id of ["staffScheduleMessage","opsTopMessage"]){
      const el=document.getElementById(id);
      if(!el)continue;
      el.textContent=text;
      el.classList.remove("is-hidden");
      el.classList.add("is-error");
    }
  }

  async function enforceAutoReassign(days=HORIZON_DAYS){
    if(running){queued=true;return 0;}
    if(typeof state==="undefined"||!state?.authUser||typeof apiGet!=="function"||typeof apiPost!=="function")return 0;

    running=true;
    let changed=0;
    const failures=[];

    try{
      const start=typeof localYmd==="function"?localYmd():ymd(new Date());
      const end=addDays(start,days);
      const master=await loadMaster(start,end);
      const staffByCode=new Map(master.staff.map(s=>[code(s?.staff_code),s]));
      const serviceByCode=new Map(master.services.map(s=>[code(s?.service_code),s]));

      for(let i=0;i<=days;i++){
        const date=addDays(start,i);
        const rows=await loadDateReservations(date);

        for(const r of rows){
          const serviceCode=serviceCodeOf(r);
          if(!AUTO_SERVICES.has(serviceCode)||!r?.reservation_id)continue;

          const service=serviceByCode.get(serviceCode)||{service_code:serviceCode,provider_role:r?.provider_role||"STAFF"};
          const assigned=staffByCode.get(code(r?.staff_code))||null;
          const assignedValid=!!assigned&&eligible(assigned,service)&&works(assigned,master.shifts,r);
          if(assignedValid)continue;

          let candidates=master.staff.filter(s=>eligible(s,service)&&works(s,master.shifts,r)&&free(s,r,rows));

          if(!candidates.length){
            candidates=master.staff.filter(s=>
              isActiveStaff(s)&&
              roleAllowed(s,service)&&
              isManagement(s)&&
              works(s,master.shifts,r)&&
              free(s,r,rows)
            );
          }

          const chosen=chooseCandidate(candidates,rows);
          if(!chosen)continue;

          try{
            await reassignOne(r,chosen);
            r.staff_code=chosen.staff_code;
            r.staff_name=chosen.staff_name||chosen.display_name||chosen.staff_code;
            changed++;
          }catch(error){
            failures.push({
              reservation_id:r.reservation_id,
              customer:String(r?.customer_name||""),
              service_code:serviceCode,
              new_staff_code:chosen.staff_code,
              message:error?.message||String(error)
            });
            console.error("A-nauts auto reassign failed",failures[failures.length-1]);
          }
        }
      }
    }catch(error){
      failures.push({reservation_id:"SYSTEM",customer:"",message:error?.message||String(error)});
      console.error("A-nauts auto reassign scan failed",error);
    }finally{
      running=false;
      window.__ANAUTS_AUTO_REASSIGN_LAST_FAILURES__=failures;
      showFailures(failures);

      if(changed){
        const last=Number(sessionStorage.getItem("anautsAutoReassignReloadAt")||0);
        const now=Date.now();
        if(now-last>3000){
          sessionStorage.setItem("anautsAutoReassignReloadAt",String(now));
          setTimeout(()=>location.reload(),180);
        }else{
          try{
            if(document.querySelector("#staffScheduleView.is-active")&&typeof loadStaffSchedule==="function")await loadStaffSchedule();
            if(document.querySelector("#trainerScheduleView.is-active")&&typeof loadTrainerSchedule==="function")await loadTrainerSchedule();
          }catch(_){ }
        }
      }

      if(queued){
        queued=false;
        setTimeout(()=>enforceAutoReassign(days),180);
      }
    }

    return changed;
  }

  function trigger(delay=100){
    if(typeof state!=="undefined"&&state?.authUser)setTimeout(()=>enforceAutoReassign(HORIZON_DAYS),delay);
  }

  function waitForAuth(){
    if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"){
      setTimeout(waitForAuth,100);
      return;
    }
    if(state?.authUser){
      if(!authRunDone){authRunDone=true;trigger(30);}
      return;
    }
    setTimeout(waitForAuth,120);
  }

  function boot(){
    waitForAuth();
    document.addEventListener("click",event=>{
      const b=event.target.closest?.("#opsReload,[data-view='operationsTop'],[data-view='staffSchedule']");
      if(b)trigger(80);
    },true);
    window.addEventListener("focus",()=>trigger(100));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)trigger(100);});
  }

  window.ANAUTS_ENFORCE_AUTO_REASSIGN=enforceAutoReassign;
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
