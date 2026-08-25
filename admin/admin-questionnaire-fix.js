(()=>{
  "use strict";

  let activeReservation=null;
  let activeRow=null;

  function orderedReservations(d){
    const reservations=Array.isArray(d?.reservations)?d.reservations:[];
    const shifts=Array.isArray(d?.shifts)?d.shifts:[];
    const staffCodes=[...new Set([
      ...shifts.map(x=>x.staff_code),
      ...reservations.map(x=>x.staff_code)
    ].filter(Boolean))];
    const ordered=[];
    staffCodes.forEach(code=>{
      reservations
        .filter(x=>x.staff_code===code)
        .sort((a,b)=>String(a.start_time||"").localeCompare(String(b.start_time||"")))
        .forEach(r=>ordered.push(r));
    });
    return ordered;
  }

  function captureReservationFromButton(button){
    const row=button?.closest(".staff-reservation-row");
    if(!row)return;
    const rows=[...document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")];
    const index=rows.indexOf(row);
    const data=window.state?.staffSchedule || (typeof state!=="undefined" ? state.staffSchedule : null);
    const ordered=orderedReservations(data||{});
    activeReservation=ordered[index]||null;
    activeRow=row;
  }

  async function saveAddress(){
    if(!activeReservation){
      alert("対象の見学予約を特定できませんでした。画面を更新してもう一度お試しください。");
      return;
    }

    const current=String(activeReservation.customer_address||activeReservation.address||"").trim();
    const next=window.prompt("訂正後の住所を入力してください。\n番地・建物名・部屋番号まで入力できます。",current);
    if(next===null)return;
    const value=String(next).trim();
    if(!value){
      alert("住所を入力してください。");
      return;
    }

    if(typeof apiPost!=="function"){
      alert("管理画面APIを利用できません。");
      return;
    }

    try{
      await apiPost({
        action:"updateReservation",
        reservation_id:activeReservation.reservation_id,
        customer_address:value,
        address:value
      });

      activeReservation.customer_address=value;
      activeReservation.address=value;

      const info=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"] .tour-print-reservation');
      if(info){
        const notice=document.createElement("div");
        notice.style.marginTop="8px";
        notice.style.fontSize="12px";
        notice.style.color="#067647";
        notice.textContent="住所を訂正しました。";
        info.appendChild(notice);
      }

      alert("住所を訂正しました。訂正後の住所でPDFを作成できます。");
    }catch(e){
      alert(e.message||"住所の訂正に失敗しました。");
    }
  }

  function enhancePrintModal(){
    const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');
    if(!modal)return;

    const actions=modal.querySelector(".tour-print-actions");
    const generate=modal.querySelector("#tourPrintGenerate");
    if(!actions||!generate)return;

    if(!modal.querySelector("#tourAddressCorrect")){
      const addressBtn=document.createElement("button");
      addressBtn.type="button";
      addressBtn.id="tourAddressCorrect";
      addressBtn.className="ghost-button";
      addressBtn.textContent="住所訂正";
      addressBtn.onclick=saveAddress;
      actions.insertBefore(addressBtn,generate);
    }

    if(!generate.dataset.autoCloseFixed){
      generate.dataset.autoCloseFixed="1";
      const observer=new MutationObserver(()=>{
        if(generate.textContent==="PDF作成中…"){
          generate.dataset.wasGenerating="1";
          return;
        }
        if(generate.dataset.wasGenerating==="1" && generate.textContent==="PDFを作成して閲覧・印刷"){
          const message=modal.querySelector("#tourPrintMessage");
          const failed=message && String(message.textContent||"").includes("失敗");
          if(!failed){
            document.querySelector(".tour-print-overlay")?.remove();
          }
        }
      });
      observer.observe(generate,{childList:true,subtree:true,characterData:true});
    }
  }

  function bindButtons(){
    document.querySelectorAll(".tour-print-button").forEach(btn=>{
      if(btn.dataset.questionnaireFixBound)return;
      btn.dataset.questionnaireFixBound="1";
      btn.addEventListener("click",()=>{
        captureReservationFromButton(btn);
        setTimeout(enhancePrintModal,0);
      },{capture:true});
    });
  }

  function boot(){
    bindButtons();
    enhancePrintModal();
    new MutationObserver(()=>{
      bindButtons();
      enhancePrintModal();
    }).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();