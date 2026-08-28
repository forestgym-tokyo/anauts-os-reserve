(()=>{
  "use strict";

  if(window.__ANAUTS_AUTO_REASSIGN_CONTROLLER__)return;
  window.__ANAUTS_AUTO_REASSIGN_CONTROLLER__=true;

  // Only these four services may be reassigned automatically.
  const AUTO_ASSIGN_SERVICE_CODES=new Set([
    "TOUR",
    "PROCEDURE",
    "UNSUBSCRIBE",
    "TRAINING_SUPPORT45"
  ]);
  const RESCHEDULE_ONLY_SERVICE_CODES=new Set([
    "COUNSEL",
    "MEAL_PLANNING"
  ]);
  const INACTIVE_RESERVATION_STATUSES=new Set([
    "CANCELLED",
    "CANCELED",
    "CANCEL",
    "CONSUMED"
  ]);
  const RETRY_AFTER_MS=60000;

  let running=false;
  let queued=false;
  let scheduleLoaderWrapped=false;
  const attemptedAt=new Map();

  const code=value=>String(value||"").trim().toUpperCase();
  const hhmm=value=>String(value||"").slice(0,5);
  const minutes=value=>{
    const match=/^(\d{1,2}):(\d{2})/.exec(String(value||""));
    return match?Number(match[1])*60+Number(match[2]):NaN;
  };

  function isActiveReservation(reservation){
    return !INACTIVE_RESERVATION_STATUSES.has(code(reservation?.status));
  }

  function shiftCoversReservation(shift,reservation){
    if(code(shift?.staff_code)!==code(reservation?.staff_code))return false;
    const shiftStart=minutes(shift?.start_time);
    const shiftEnd=minutes(shift?.end_time);
    const reservationStart=minutes(reservation?.start_time);
    const reservationEnd=minutes(reservation?.end_time);
    return [shiftStart,shiftEnd,reservationStart,reservationEnd].every(Number.isFinite)&&
      shiftStart<=reservationStart&&shiftEnd>=reservationEnd;
  }

  function needsAssignment(reservation,shifts){
    if(!reservation?.reservation_id||!isActiveReservation(reservation))return false;
    if(!code(reservation.staff_code))return true;
    return !shifts.some(shift=>shiftCoversReservation(shift,reservation));
  }

  function scheduleRows(schedule){
    const reservations=Array.isArray(schedule?.reservations)?schedule.reservations:[];
    const shifts=Array.isArray(schedule?.shifts)?schedule.shifts:[];
    return {
      shifts,
      automatic:reservations.filter(reservation=>
        AUTO_ASSIGN_SERVICE_CODES.has(code(reservation?.service_code))&&
        needsAssignment(reservation,shifts)
      ),
      rescheduleOnly:reservations.filter(reservation=>
        RESCHEDULE_ONLY_SERVICE_CODES.has(code(reservation?.service_code))&&
        needsAssignment(reservation,shifts)
      )
    };
  }

  function attemptKey(reservation,shifts){
    const shiftSignature=shifts.map(shift=>[
      code(shift?.staff_code),
      hhmm(shift?.start_time),
      hhmm(shift?.end_time)
    ].join("/")).sort().join(",");
    return [
      reservation?.reservation_id||"",
      code(reservation?.service_code),
      code(reservation?.staff_code),
      hhmm(reservation?.start_time),
      hhmm(reservation?.end_time),
      shiftSignature
    ].join("|");
  }

  function canAttempt(reservation,shifts){
    const key=attemptKey(reservation,shifts);
    const last=Number(attemptedAt.get(key)||0);
    if(Date.now()-last<RETRY_AFTER_MS)return false;
    attemptedAt.set(key,Date.now());
    return true;
  }

  function showMessage(text,isError=false){
    const message=document.getElementById("staffScheduleMessage");
    if(!message||!text)return;
    message.textContent=text;
    message.classList.remove("is-hidden");
    message.classList.toggle("is-error",!!isError);
  }

  function installRescheduleNotice(rows){
    const board=document.getElementById("staffScheduleBoard");
    if(!board)return;
    board.querySelector(".auto-reassign-reschedule-notice")?.remove();
    if(!rows.length)return;

    const notice=document.createElement("div");
    notice.className="auto-reassign-reschedule-notice";
    const title=document.createElement("strong");
    title.textContent=`リスケ対応が必要な予約 ${rows.length}件`;
    notice.appendChild(title);

    rows.forEach(reservation=>{
      const row=document.createElement("div");
      row.className="auto-reassign-reschedule-row";

      const detail=document.createElement("span");
      detail.textContent=[
        hhmm(reservation.start_time),
        reservation.service_name||reservation.service_code,
        reservation.customer_name||"氏名未登録"
      ].filter(Boolean).join(" / ");
      row.appendChild(detail);

      const button=document.createElement("button");
      button.type="button";
      button.className="reservation-manage-button";
      button.dataset.reservationId=String(reservation.reservation_id||"");
      button.textContent="変更・キャンセル";
      row.appendChild(button);
      notice.appendChild(row);
    });

    board.prepend(notice);
    if(typeof bindReservationManageButtons_==="function"){
      bindReservationManageButtons_(notice);
    }
  }

  async function reassignOne(reservation,date){
    // The dedicated reassignment action is used instead of updateReservation.
    // These flags also make the no-customer-mail intent explicit to the backend.
    return apiPost({
      action:"reassignReservationStaff",
      reservation_id:reservation.reservation_id,
      service_code:code(reservation.service_code),
      date:String(date||reservation.date||reservation.reservation_date||"").slice(0,10),
      start_time:hhmm(reservation.start_time),
      expected_staff_code:code(reservation.staff_code),
      internal_operation:true,
      suppress_customer_notification:true,
      notification_mode:"NONE"
    });
  }

  async function enforceCurrentSchedule(schedule,date){
    if(typeof state==="undefined"||!state?.authUser||typeof apiPost!=="function")return null;
    if(!schedule||typeof schedule!=="object")return null;
    if(running){queued=true;return null;}

    running=true;
    let completed=0;
    const failures=[];

    try{
      const rows=scheduleRows(schedule);
      installRescheduleNotice(rows.rescheduleOnly);

      for(const reservation of rows.automatic){
        if(!canAttempt(reservation,rows.shifts))continue;
        try{
          await reassignOne(reservation,date);
          completed+=1;
        }catch(error){
          failures.push({
            reservation_id:reservation.reservation_id,
            message:error?.message||String(error)
          });
        }
      }

      if(completed>0&&typeof window.loadStaffSchedule==="function"){
        await window.loadStaffSchedule();
      }else if(failures.length){
        showMessage(
          `自動割当てできない予約が${failures.length}件あります。変更・キャンセルから確認してください。`,
          true
        );
      }else if(rows.rescheduleOnly.length){
        showMessage(
          `カウンセリング・ミールプランニングの担当者不在予約が${rows.rescheduleOnly.length}件あります。自動割当てせず、リスケしてください。`,
          true
        );
      }

      return {completed,failures,reschedule_only:rows.rescheduleOnly.length};
    }finally{
      running=false;
      if(queued){
        queued=false;
        window.setTimeout(()=>enforceVisibleSchedule(),0);
      }
    }
  }

  function enforceVisibleSchedule(){
    if(typeof state==="undefined")return Promise.resolve(null);
    return enforceCurrentSchedule(state.staffSchedule,state.staffScheduleDate);
  }

  function wrapScheduleLoader(){
    if(scheduleLoaderWrapped||typeof window.loadStaffSchedule!=="function")return;
    const original=window.loadStaffSchedule;
    window.loadStaffSchedule=async function(){
      const result=await original.apply(this,arguments);
      await enforceVisibleSchedule();
      return result;
    };
    scheduleLoaderWrapped=true;
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiPost!=="function"){
      window.setTimeout(boot,100);
      return;
    }
    wrapScheduleLoader();
    window.setTimeout(()=>enforceVisibleSchedule(),0);
  }

  window.ANAUTS_ENFORCE_AUTO_REASSIGN=()=>enforceVisibleSchedule();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
