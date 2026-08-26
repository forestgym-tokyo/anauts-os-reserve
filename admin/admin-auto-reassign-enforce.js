(()=>{
  "use strict";

  if(window.__ANAUTS_AUTO_REASSIGN_ENFORCE__)return;
  window.__ANAUTS_AUTO_REASSIGN_ENFORCE__=true;

  const STORE_CODE="YACHIYO";
  const HORIZON_DAYS=30;
  const AUTO_SERVICES=new Set(["TOUR","COUNSEL","MEAL_PLANNING"]);

  const bool=v=>v===true||String(v||"").trim().toUpperCase()==="TRUE";
  const padTime=v=>String(v||"").slice(0,5);
  const min=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||""));return m?Number(m[1])*60+Number(m[2]):NaN;};
  const overlap=(a1,a2,b1,b2)=>min(a1)<min(b2)&&min(a2)>min(b1);
  const covers=(s,e,rs,re)=>min(s)<=min(rs)&&min(e)>=min(re);
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(v,n)=>{const [y,m,d]=String(v).split("-").map(Number),x=new Date(y,m-1,d+n);return ymd(x);};
  const codeOf=r=>String(r?.service_code||"").trim().toUpperCase();
  const dateOf=r=>String(r?.date||r?.reservation_date||"");
  const activeReservation=r=>!["CANCELLED","CANCELED","CANCEL","CONSUMED"].includes(String(r?.status||"").trim().toUpperCase());

  let running=false;
  let queued=false;

  function permissionColumn(code){
    if(code==="TOUR")return"can_tour";
    if(code==="COUNSEL")return"can_counsel";
    if(code==="MEAL_PLANNING")return"can_meal_planning";
    return"";
  }

  function isActiveStaff(s){
    return !!s&&(s.active===true||String(s.active||"").trim().toUpperCase()==="TRUE");
  }

  function roleAllowed(s,service){
    const roles=String(service?.provider_role||"")
      .split(",")
      .map(x=>x.trim().toUpperCase())
      .filter(Boolean);
    return !roles.length||roles.includes(String(s?.role||"").trim().toUpperCase());
  }

  function serviceAllowed(s,service){
    const col=permissionColumn(String(service?.service_code||"").trim().toUpperCase());
    return !col||bool(s?.[col]);
  }

  function eligible(s,service){
    return isActiveStaff(s)&&roleAllowed(s,service)&&serviceAllowed(s,service);
  }

  function uniqueReservations(rows){
    const map=new Map();
    (rows||[]).forEach(r=>{
      const key=String(r?.reservation_id||"")||[dateOf(r),padTime(r?.start_time),codeOf(r),r?.customer_name||""].join("|");
      if(!map.has(key))map.set(key,r);
    });
    return Array.from(map.values());
  }

  function works(staff,shifts,r){
    return shifts.some(x=>
      String(x.staff_code||"")===String(staff.staff_code||"")&&
      String(x.date||"")===dateOf(r)&&
      covers(x.start_time,x.end_time,r.start_time,r.end_time)
    );
  }

  function free(staff,r,dateRows){
    return !dateRows.some(o=>{
      if(!activeReservation(o))return false;
      if(String(o.reservation_id||"")===String(r.reservation_id||""))return false;
      if(String(o.staff_code||"")!==String(staff.staff_code||""))return false;
      return overlap(o.start_time,o.end_time,r.start_time,r.end_time);
    });
  }

  function permissionRank(s){
    const p=String(s?.permission||s?.auth_permission||s?.user_permission||"STAFF").trim().toUpperCase();
    return p==="ADMIN"?0:(p==="MANAGER"?1:2);
  }

  function rankCandidate(s,dateRows){
    const assigned=dateRows.filter(r=>
      activeReservation(r)&&
      AUTO_SERVICES.has(codeOf(r))&&
      String(r.staff_code||"")===String(s.staff_code||"")
    );
    const last=assigned.reduce((v,r)=>Math.max(v,min(r.start_time)||0),0);
    return[
      permissionRank(s),
      assigned.length,
      last,
      String(s.staff_code||"")
    ];
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
    return{
      staff:Array.isArray(staffJson?.data?.staff)?staffJson.data.staff:(Array.isArray(staffJson?.data)?staffJson.data:[]),
      services:Array.isArray(serviceJson?.data?.services)?serviceJson.data.services:(Array.isArray(serviceJson?.data)?serviceJson.data:[]),
      shifts:(Array.isArray(shiftJson?.data?.shifts)?shiftJson.data.shifts:(Array.isArray(shiftJson?.data)?shiftJson.data:[])).filter(x=>x.active!==false)
    };
  }

  async function loadDateReservations(date){
    const rows=[];
    for(const action of ["getStaffSchedule","getTrainerSchedule"]){
      try{
        const j=await apiGet(action,{date,store_code:STORE_CODE});
        rows.push(...(Array.isArray(j?.data?.reservations)?j.data.reservations:[]).map(r=>({...r,date:dateOf(r)||date})));
      }catch(error){
        console.warn("A-nauts auto reassign schedule fetch failed",action,date,error);
      }
    }
    return uniqueReservations(rows.filter(activeReservation));
  }

  async function enforceAutoReassign(days=HORIZON_DAYS){
    if(running){queued=true;return 0;}
    if(typeof state==="undefined"||!state?.authUser||typeof apiGet!=="function"||typeof apiPost!=="function")return 0;

    running=true;
    let changed=0;

    try{
      const start=typeof localYmd==="function"?localYmd():ymd(new Date());
      const end=addDays(start,days);
      const master=await loadMaster(start,end);
      const staffByCode=new Map(master.staff.map(s=>[String(s.staff_code||"").toUpperCase(),s]));
      const serviceByCode=new Map(master.services.map(s=>[String(s.service_code||"").trim().toUpperCase(),s]));

      for(let i=0;i<=days;i++){
        const date=addDays(start,i);
        const rows=await loadDateReservations(date);

        for(const r of rows){
          const code=codeOf(r);
          if(!AUTO_SERVICES.has(code)||!r.reservation_id)continue;

          const service=serviceByCode.get(code)||{};
          const assigned=staffByCode.get(String(r.staff_code||"").toUpperCase())||null;
          const assignedValid=!!assigned&&eligible(assigned,service)&&works(assigned,master.shifts,r);
          if(assignedValid)continue;

          const candidates=master.staff.filter(s=>
            eligible(s,service)&&
            works(s,master.shifts,r)&&
            free(s,r,rows)
          );

          const chosen=chooseCandidate(candidates,rows);
          if(!chosen)continue;

          try{
            await apiPost({
              action:"updateReservation",
              reservation_id:r.reservation_id,
              date:dateOf(r),
              start_time:padTime(r.start_time),
              staff_code:chosen.staff_code
            });

            r.staff_code=chosen.staff_code;
            r.staff_name=chosen.staff_name||chosen.display_name||chosen.staff_code;
            changed++;
          }catch(error){
            console.error(
              "A-nauts auto reassign failed",
              {
                reservation_id:r.reservation_id,
                service_code:code,
                old_staff_code:r.staff_code||"",
                new_staff_code:chosen.staff_code,
                message:error?.message||String(error)
              }
            );
          }
        }
      }
    }finally{
      running=false;

      if(changed){
        setTimeout(()=>location.reload(),300);
      }

      if(queued){
        queued=false;
        setTimeout(()=>enforceAutoReassign(days),150);
      }
    }

    return changed;
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"){
      setTimeout(boot,100);
      return;
    }

    if(state.authUser){
      setTimeout(()=>enforceAutoReassign(HORIZON_DAYS),600);
    }

    document.addEventListener("click",event=>{
      const button=event.target.closest?.("#opsReload,[data-view='operationsTop'],[data-view='staffSchedule']");
      if(button&&state?.authUser){
        setTimeout(()=>enforceAutoReassign(HORIZON_DAYS),400);
      }
    },true);
  }

  window.ANAUTS_ENFORCE_AUTO_REASSIGN=enforceAutoReassign;

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
