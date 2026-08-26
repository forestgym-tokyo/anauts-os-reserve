(()=>{
  "use strict";

  if(window.__ANAUTS_AUTO_REASSIGN_CONTROLLER__)return;
  window.__ANAUTS_AUTO_REASSIGN_CONTROLLER__=true;

  const MUTATION_ACTIONS=new Set([
    "saveStaff",
    "setStaffActive",
    "saveService",
    "setServiceActive",
    "saveStaffShift",
    "deleteStaffShift"
  ]);
  const DEFAULT_DAYS=14;
  const MUTATION_DAYS=30;
  const MIN_INTERVAL_MS=60000;
  let running=false;
  let pendingDays=null;
  let apiWrapped=false;
  let lastRunAt=0;

  function activeStaffDate(){
    if(typeof state!=="undefined"&&state?.staffScheduleDate){
      return String(state.staffScheduleDate).slice(0,10);
    }
    return typeof localYmd==="function"?localYmd():"";
  }

  function showResult(result){
    const data=result?.data||{};
    const changed=Number(data.changed_count||0);
    const failures=Array.isArray(data.failures)?data.failures:[];
    const message=document.getElementById("staffScheduleMessage");
    if(!message)return;
    if(failures.length){
      const first=failures[0]||{};
      message.textContent=`担当者を再割り当てできない予約が${failures.length}件あります。${first.reservation_id||""}`.trim();
      message.classList.remove("is-hidden");
      message.classList.add("is-error");
      return;
    }
    if(changed>0){
      message.textContent=`${changed}件の担当者を自動変更しました（お客様への変更メール送信なし）。`;
      message.classList.remove("is-hidden","is-error");
    }
  }

  async function refreshVisibleSchedule(){
    try{
      if(document.querySelector("#staffScheduleView.is-active")&&typeof loadStaffSchedule==="function"){
        await loadStaffSchedule();
      }else if(document.querySelector("#trainerScheduleView.is-active")&&typeof loadTrainerSchedule==="function"){
        await loadTrainerSchedule();
      }
    }catch(_){ }
  }

  async function runReassignment(days=DEFAULT_DAYS,force=false){
    const normalizedDays=Math.max(0,Math.min(30,Number(days)||0));
    if(typeof state==="undefined"||!state?.authUser||typeof apiPost!=="function")return null;
    if(running){
      pendingDays=Math.max(pendingDays==null?0:pendingDays,normalizedDays);
      return null;
    }
    const now=Date.now();
    if(!force&&now-lastRunAt<MIN_INTERVAL_MS)return null;

    running=true;
    lastRunAt=now;
    try{
      const result=await apiPost({
        action:"reassignInvalidReservations",
        start_date:activeStaffDate(),
        days:normalizedDays
      });
      if(result&&result.ok===false){
        throw new Error(result.message||"予約担当者を再判定できませんでした。");
      }
      showResult(result);
      if(Number(result?.data?.changed_count||0)>0){
        await refreshVisibleSchedule();
      }
      return result;
    }catch(error){
      console.error("A-nauts automatic reassignment failed",error);
      return null;
    }finally{
      running=false;
      if(pendingDays!=null){
        const nextDays=pendingDays;
        pendingDays=null;
        setTimeout(()=>runReassignment(nextDays,true),250);
      }
    }
  }

  function wrapApiPost(){
    if(apiWrapped||typeof apiPost!=="function")return;
    const original=apiPost;
    apiPost=async function(payload){
      const result=await original(payload);
      if(payload&&MUTATION_ACTIONS.has(payload.action)&&result?.ok!==false){
        setTimeout(()=>runReassignment(MUTATION_DAYS,true),250);
      }
      return result;
    };
    apiWrapped=true;
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiPost!=="function"){
      setTimeout(boot,100);
      return;
    }
    wrapApiPost();
    document.addEventListener("click",event=>{
      if(event.target.closest?.('[data-view="staffSchedule"]')){
        setTimeout(()=>runReassignment(0,false),350);
      }
    },true);
  }

  window.ANAUTS_ENFORCE_AUTO_REASSIGN=days=>runReassignment(days,true);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
