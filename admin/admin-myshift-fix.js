(()=>{
  "use strict";

  function ymd(d){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function tomorrowYmd(){
    const d=new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+1);
    return ymd(d);
  }

  function injectCss(){
    if(document.getElementById("myShiftFixCss"))return;
    const s=document.createElement("style");
    s.id="myShiftFixCss";
    s.textContent=`
      #myShiftList .registered-shift-actions{position:relative!important;z-index:2!important;pointer-events:auto!important}
      #myShiftList [data-my-shift-edit],
      #myShiftList [data-my-shift-delete]{position:relative!important;z-index:3!important;pointer-events:auto!important;cursor:pointer!important}
      #myShiftList [data-my-shift-edit]:not(:disabled),
      #myShiftList [data-my-shift-delete]:not(:disabled){opacity:1!important}
    `;
    document.head.appendChild(s);
  }

  function findShift(button){
    const id=button.dataset.myShiftEdit || button.dataset.myShiftDelete || "";
    const rows=(typeof state!=="undefined" && Array.isArray(state.myShiftRows)) ? state.myShiftRows : [];
    return rows.find(x=>String(x.shift_id||"")===String(id)) || null;
  }

  function showMessage(text,error=true){
    if(typeof myShiftMsg==="function"){
      myShiftMsg(text,error);
      return;
    }
    alert(text);
  }

  function showPhoneCard(r,actionLabel){
    const date=String(r?.date||"");
    const today=ymd(new Date());
    const timing=date===today ? "当日" : "前日";
    const staffName=(typeof roleHonorific==="function" && typeof state!=="undefined")
      ? roleHonorific(state.authUser||{})
      : "";
    const dateText=typeof formatStaffDate==="function" ? formatStaffDate(date) : date;
    const escape=typeof esc==="function" ? esc : v=>String(v??"");

    const action=document.querySelector("#todayShiftContactAction");
    if(action)action.textContent=`${timing}の${actionLabel}について直接連絡`;

    const detail=document.querySelector("#todayShiftContactDetail");
    if(detail){
      detail.innerHTML=
        (staffName ? `<strong>${escape(staffName)}</strong><br>` : "")+
        `${escape(dateText)}<br>`+
        `${escape(r.start_time||"")}〜${escape(r.end_time||"")}<br><br>`+
        `シフト日の当日および前日の変更・削除はWebから申請できません。<br>`+
        `お手数ですが、下のボタンから080-3553-4259へ直接お電話ください。`;
    }

    const card=document.querySelector("#todayShiftContactCard");
    card?.classList.remove("is-hidden");
    card?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function handle(button,e){
    if(button.disabled)return;
    const r=findShift(button);
    if(!r){
      e.preventDefault();
      e.stopImmediatePropagation();
      showMessage("対象のシフトを取得できませんでした。画面を更新してもう一度お試しください。",true);
      return;
    }

    const date=String(r.date||"");
    const today=ymd(new Date());
    const tomorrow=tomorrowYmd();
    const isDelete=button.hasAttribute("data-my-shift-delete");
    const label=isDelete ? "シフト削除" : "シフト変更";

    e.preventDefault();
    e.stopImmediatePropagation();

    if(date<today){
      showMessage("過去のシフトは変更・削除申請できません。",true);
      return;
    }

    if(date===today || date===tomorrow){
      showPhoneCard(r,label);
      return;
    }

    if(isDelete){
      if(typeof requestDeleteMyShift==="function")requestDeleteMyShift(r);
      else showMessage("シフト削除申請を開始できませんでした。",true);
    }else{
      if(typeof editMyShiftRequest==="function")editMyShiftRequest(r);
      else showMessage("シフト変更申請を開始できませんでした。",true);
    }
  }

  function boot(){
    injectCss();
    document.addEventListener("click",e=>{
      const b=e.target.closest?.("[data-my-shift-edit],[data-my-shift-delete]");
      if(!b || !b.closest("#myShiftList"))return;
      handle(b,e);
    },true);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();