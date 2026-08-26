(()=>{
  "use strict";

  if(window.__ANAUTS_SCHEDULE_REASSIGN_FIX__)return;
  window.__ANAUTS_SCHEDULE_REASSIGN_FIX__=true;

  // Emergency kill switch. This legacy repair path calls updateReservation,
  // which currently sends a customer-facing reservation change email.
  window.__ANAUTS_SCHEDULE_REASSIGN_DISABLED__=true;
  return;

  const STORE_CODE="YACHIYO";
  const HORIZON_DAYS=14;
  const q=s=>document.querySelector(s);
  const qa=s=>Array.from(document.querySelectorAll(s));
  const bool=v=>v===true||String(v||"").trim().toUpperCase()==="TRUE";
  const padTime=v=>String(v||"").slice(0,5);
  const min=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||""));return m?Number(m[1])*60+Number(m[2]):NaN;};
  const overlap=(a1,a2,b1,b2)=>min(a1)<min(b2)&&min(a2)>min(b1);
  const covers=(s,e,rs,re)=>min(s)<=min(rs)&&min(e)>=min(re);
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(v,n)=>{const [y,m,d]=String(v).split("-").map(Number),x=new Date(y,m-1,d+n);return ymd(x);};
  const dateOf=r=>String(r?.date||r?.reservation_date||"");
  const codeOf=r=>String(r?.service_code||"").trim().toUpperCase();
  const activeReservation=r=>!["CANCELLED","CANCELED","CANCEL","CONSUMED"].includes(String(r?.status||"").trim().toUpperCase());

  let repairing=false;
  let queued=false;
  let apiWrapped=false;

  function ensureStyle(){
    if(q("#scheduleActionFixStyle"))return;
    const style=document.createElement("style");
    style.id="scheduleActionFixStyle";
    style.textContent=`
      @media(min-width:761px){
        #staffScheduleBoard .staff-reservation-row{
          grid-template-columns:105px minmax(180px,1.1fr) minmax(170px,1fr) 110px minmax(238px,auto)!important;
        }
        #staffScheduleBoard .staff-reservation-row>.reservation-manage-button{
          grid-column:5!important;
          grid-row:1!important;
          justify-self:end!important;
          box-sizing:border-box!important;
          width:112px!important;
          min-width:112px!important;
          height:38px!important;
          min-height:38px!important;
          margin:0!important;
          padding:7px 10px!important;
        }
        #staffScheduleBoard .staff-reservation-row>.withdrawal-link-actions{
          grid-column:5!important;
          grid-row:1!important;
          justify-self:end!important;
          align-self:center!important;
          display:grid!important;
          grid-template-columns:112px 112px!important;
          gap:8px!important;
          min-width:232px!important;
          width:232px!important;
          margin:0!important;
        }
        #staffScheduleBoard .withdrawal-link-actions>button{
          box-sizing:border-box!important;
          width:112px!important;
          min-width:112px!important;
          height:38px!important;
          min-height:38px!important;
          margin:0!important;
          padding:7px 10px!important;
          border-radius:8px!important;
          font-size:12px!important;
          font-weight:700!important;
          line-height:22px!important;
          white-space:nowrap!important;
        }
      }
      @media(max-width:760px){
        #staffScheduleBoard .staff-reservation-row>.reservation-manage-button,
        #staffScheduleBoard .staff-reservation-row>.withdrawal-link-actions{
          grid-column:1/-1!important;
          width:100%!important;
          min-width:0!important;
          margin-top:4px!important;
        }
        #staffScheduleBoard .staff-reservation-row>.withdrawal-link-actions{
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          gap:8px!important;
        }
        #staffScheduleBoard .withdrawal-link-actions>button{
          width:100%!important;
          min-width:0!important;
          min-height:42px!important;
          margin:0!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeActionRows(){
    qa("#staffScheduleBoard .staff-reservation-row").forEach(row=>{
      const wrapper=row.querySelector(":scope > .withdrawal-link-actions");
      if(!wrapper)return;
      const manage=wrapper.querySelector(".reservation-manage-button:not(.withdrawal-form-shortcut)");
      const withdrawal=wrapper.querySelector(".withdrawal-form-shortcut");
      if(manage)manage.removeAttribute("style");
      if(withdrawal){
        withdrawal.removeAttribute("style");
        withdrawal.classList.remove("reservation-manage-button");
      }
    });
  }

  function permissionColumn(code){
    if(/^PT(?:_|\d|$)/.test(code))return"can_personal";
    if(code==="TOUR")return"can_tour";
    if(code==="COUNSEL")return"can_counsel";
    if(code==="MEAL_PLANNING")return"can_meal_planning";
    if(code==="PROCEDURE")return"can_procedure";
    if(code==="UNSUBSCRIBE")return"can_unsubscribe";
    if(code==="TRAINING_SUPPORT45")return"can_training_support";
    return"";
  }

  function isActiveStaff(s){
    return !!s&&(s.active===true||String(s.active||"").trim().toUpperCase()==="TRUE");
  }

  function roleAllowed(s,service){
    const roles=String(service?.provider_role||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
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

  async function loadMaster(start,end){
    const [staffJson,servicesJson,shiftJson]=await Promise.all([
      apiGet("getStaff",{include_inactive:"true"}),
      apiGet("getServices"),
      apiGet("getStaffShifts",{start_date:start,end_date:end})
    ]);
    return{
      staff:Array.isArray(staffJson?.data?.staff)?staffJson.data.staff:(Array.isArray(staffJson?.data)?staffJson.data:[]),
      services:Array.isArray(servicesJson?.data?.services)?servicesJson.data.services:(Array.isArray(servicesJson?.data)?servicesJson.data:[]),
      shifts:(Array.isArray(shiftJson?.data?.shifts)?shiftJson.data.shifts:(Array.isArray(shiftJson?.data)?shiftJson.data:[])).filter(x=>x.active!==false)
    };
  }

  async function loadStaffReservations(date){
    try{
      const j=await apiGet("getStaffSchedule",{date,store_code:STORE_CODE});
      return uniqueReservations((Array.isArray(j?.data?.reservations)?j.data.reservations:[]).filter(activeReservation).map(r=>({...r,date:dateOf(r)||date})));
    }catch(_){
      return[];
    }
  }

  function works(staff,shiftRows,r){
    return shiftRows.some(x=>String(x.staff_code||"")===String(staff.staff_code||"")&&String(x.date||"")===dateOf(r)&&covers(x.start_time,x.end_time,r.start_time,r.end_time));
  }

  function candidateFree(staff,r,dateRows){
    return !dateRows.some(o=>{
      if(!activeReservation(o))return false;
      if(String(o.reservation_id||"")===String(r.reservation_id||""))return false;
      if(String(o.staff_code||"")!==String(staff.staff_code||""))return false;
      return overlap(o.start_time,o.end_time,r.start_time,r.end_time);
    });
  }

  function candidateRank(s,dateRows){
    const permission=String(s.permission||s.auth_permission||s.user_permission||"").trim().toUpperCase();
    const p=permission==="ADMIN"?0:(permission==="MANAGER"?1:2);
    const count=dateRows.filter(r=>String(r.staff_code||"")===String(s.staff_code||"")).length;
    return[p,count,String(s.staff_code||"")];
  }

  function chooseCandidate(candidates,dateRows){
    if(candidates.length===1)return candidates[0];
    const hasPermission=candidates.every(s=>String(s.permission||s.auth_permission||s.user_permission||"").trim());
    if(!hasPermission)return null;
    return candidates.slice().sort((a,b)=>{
      const x=candidateRank(a,dateRows),y=candidateRank(b,dateRows);
      for(let i=0;i<x.length;i++){
        if(x[i]<y[i])return-1;
        if(x[i]>y[i])return 1;
      }
      return 0;
    })[0]||null;
  }

  async function repairAssignments(days=HORIZON_DAYS){
    if(repairing){queued=true;return 0;}
    if(typeof state==="undefined"||!state?.authUser||typeof apiGet!=="function"||typeof apiPost!=="function")return 0;
    repairing=true;
    let changed=0;
    try{
      const start=typeof localYmd==="function"?localYmd():ymd(new Date());
      const end=addDays(start,days);
      const master=await loadMaster(start,end);
      const staffByCode=new Map(master.staff.map(s=>[String(s.staff_code||""),s]));
      const serviceByCode=new Map(master.services.map(s=>[String(s.service_code||"").trim().toUpperCase(),s]));

      for(let i=0;i<=days;i++){
        const date=addDays(start,i);
        const rows=await loadStaffReservations(date);
        for(const r of rows){
          const code=codeOf(r);
          if(!code||/^PT(?:_|\d|$)/.test(code)||String(r.service_name||"").includes("パーソナル"))continue;
          const service=serviceByCode.get(code)||{};
          const assigned=staffByCode.get(String(r.staff_code||""));
          const assignedValid=!!assigned&&eligible(assigned,service)&&works(assigned,master.shifts,r);
          if(assignedValid)continue;

          const candidates=master.staff.filter(s=>eligible(s,service)&&works(s,master.shifts,r)&&candidateFree(s,r,rows));
          const chosen=chooseCandidate(candidates,rows);
          if(!chosen||!r.reservation_id)continue;

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
            console.warn("A-nauts reassignment skipped",r.reservation_id,error);
          }
        }
      }
    }finally{
      repairing=false;
      if(changed){
        try{
          if(q("#staffScheduleView.is-active")&&typeof loadStaffSchedule==="function")await loadStaffSchedule();
          if(q("#trainerScheduleView.is-active")&&typeof loadTrainerSchedule==="function")await loadTrainerSchedule();
        }catch(_){ }
        setTimeout(normalizeActionRows,30);
      }
      if(queued){queued=false;setTimeout(()=>repairAssignments(days),100);}
    }
    return changed;
  }

  function installApiHook(){
    if(apiWrapped||typeof apiPost!=="function")return;
    const original=apiPost;
    apiPost=async function(payload){
      const result=await original(payload);
      if(payload&&payload.action==="saveStaff"){
        setTimeout(()=>repairAssignments(30),150);
      }
      return result;
    };
    apiWrapped=true;
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"){
      setTimeout(boot,100);
      return;
    }
    ensureStyle();
    normalizeActionRows();
    installApiHook();

    const observer=new MutationObserver(()=>normalizeActionRows());
    observer.observe(document.documentElement,{childList:true,subtree:true});

    if(state.authUser)setTimeout(()=>repairAssignments(HORIZON_DAYS),250);

    const oldApply=typeof applyPermissionUi==="function"?applyPermissionUi:null;
    if(oldApply&&!oldApply.__scheduleReassignFix){
      const wrapped=function(){
        oldApply();
        if(state?.authUser)setTimeout(()=>repairAssignments(HORIZON_DAYS),250);
      };
      wrapped.__scheduleReassignFix=true;
      applyPermissionUi=wrapped;
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
