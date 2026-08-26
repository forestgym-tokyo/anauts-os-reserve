(()=>{
  "use strict";

  if(window.__ANAUTS_INTERNAL_RESERVATION_BRIDGE__)return;
  window.__ANAUTS_INTERNAL_RESERVATION_BRIDGE__=true;

  const q=s=>document.querySelector(s);
  const padTime=v=>String(v||"").slice(0,5);

  function installApiPostBridge(){
    if(typeof apiPost!=="function"){
      setTimeout(installApiPostBridge,100);
      return;
    }
    if(apiPost.__internalReservationBridge)return;

    const original=apiPost;
    const wrapped=async function(payload){
      let p=payload;
      if(
        p &&
        p.action==="updateReservation" &&
        typeof state!=="undefined" &&
        state &&
        state.authUser
      ){
        p={...p,internal_operation:true};
      }
      return original(p);
    };
    wrapped.__internalReservationBridge=true;
    wrapped.__internalReservationBridgeOriginal=original;
    apiPost=wrapped;
  }

  function uniqueReservations(rows){
    const map=new Map();
    (rows||[]).forEach(r=>{
      const key=String(r?.reservation_id||"") || [
        r?.date||r?.reservation_date||"",
        padTime(r?.start_time),
        r?.service_code||r?.service_name||"",
        r?.customer_name||""
      ].join("|");
      if(!map.has(key))map.set(key,r);
    });
    return Array.from(map.values());
  }

  async function findReservationFromAlert(button){
    const row=button.closest(".ops-alert");
    if(!row)throw new Error("対象予約を特定できませんでした。");

    const timeText=String(row.querySelector(".ops-alert-time")?.textContent||"");
    const date=(timeText.match(/\d{4}-\d{2}-\d{2}/)||[])[0]||"";
    const start=(timeText.match(/\d{1,2}:\d{2}/)||[])[0]||"";
    const strong=String(row.querySelector(".ops-alert-main strong")?.textContent||"").trim();
    const parts=strong.split(" / ");
    const service=String(parts[0]||"").trim();
    const customer=String(parts.slice(1).join(" / ")||"").trim();

    if(!date||!start)throw new Error("予約日時を特定できませんでした。");

    const all=[];
    for(const action of ["getStaffSchedule","getTrainerSchedule"]){
      try{
        const j=await apiGet(action,{date:date,store_code:"YACHIYO"});
        const rows=Array.isArray(j?.data?.reservations)?j.data.reservations:[];
        all.push(...rows);
      }catch(_){ }
    }

    const rows=uniqueReservations(all).filter(r=>{
      const status=String(r?.status||"").toUpperCase();
      return !["CANCELLED","CANCELED","CANCEL"].includes(status);
    });

    let matches=rows.filter(r=>
      padTime(r.start_time)===padTime(start) &&
      String(r.customer_name||"").trim()===customer &&
      (
        String(r.service_name||"").trim()===service ||
        String(r.service_code||"").trim()===service
      )
    );

    if(matches.length!==1){
      matches=rows.filter(r=>
        padTime(r.start_time)===padTime(start) &&
        String(r.customer_name||"").trim()===customer
      );
    }

    if(matches.length!==1||!matches[0]?.reservation_id){
      throw new Error("対象予約を一意に特定できませんでした。予定画面から予約内容を確認してください。");
    }

    return matches[0];
  }

  async function handleReschedule(button){
    if(button.dataset.sending==="1")return;

    try{
      button.dataset.sending="1";
      button.disabled=true;
      const oldText=button.textContent;
      button.textContent="確認中…";

      const reservation=await findReservationFromAlert(button);
      const customer=String(reservation.customer_name||"お客様");
      const date=String(reservation.date||reservation.reservation_date||"");
      const start=padTime(reservation.start_time);
      const service=String(reservation.service_name||reservation.service_code||"予約");

      const ok=confirm(
        `${customer}様へ予約変更・キャンセルのお願いを送信しますか？\n\n`+
        `${date} ${start}\n${service}`
      );

      if(!ok){
        button.textContent=oldText;
        return;
      }

      button.textContent="送信中…";
      const result=await apiPost({
        action:"sendReservationRescheduleRequest",
        reservation_id:reservation.reservation_id
      });

      button.textContent="リスケ依頼済み";
      button.disabled=true;
      alert(result?.message||"予約変更・キャンセルのお願いを送信しました。");
    }catch(error){
      button.disabled=false;
      button.textContent="リスケ依頼";
      alert(error?.message||"リスケ依頼を送信できませんでした。");
    }finally{
      delete button.dataset.sending;
    }
  }

  document.addEventListener("click",function(event){
    const button=event.target.closest?.("[data-ops-reschedule]");
    if(!button)return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleReschedule(button);
  },true);

  installApiPostBridge();
})();
