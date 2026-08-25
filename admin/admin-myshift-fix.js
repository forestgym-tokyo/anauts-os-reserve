(()=>{
  "use strict";

  const TODAY=()=>localDate_(0);
  const TOMORROW=()=>localDate_(1);

  function localDate_(add){
    const d=new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+(add||0));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function css_(){
    if(document.getElementById("myShiftHardFixCss"))return;
    const s=document.createElement("style");
    s.id="myShiftHardFixCss";
    s.textContent=`
      #myShiftList .registered-shift-row{cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
      #myShiftList .registered-shift-row.is-shift-selected{
        background:rgba(99,209,121,.14)!important;
        border-color:#63d179!important;
        box-shadow:0 0 0 2px rgba(99,209,121,.22)!important;
      }
      #myShiftList .registered-shift-actions,
      #myShiftList [data-my-shift-edit],
      #myShiftList [data-my-shift-delete]{pointer-events:auto!important;position:relative!important;z-index:20!important}
    `;
    document.head.appendChild(s);
  }

  function rowShift_(row){
    const edit=row?.querySelector("[data-my-shift-edit]");
    const del=row?.querySelector("[data-my-shift-delete]");
    const id=String(edit?.dataset.myShiftEdit||del?.dataset.myShiftDelete||"");
    try{
      if(typeof state!=="undefined"&&Array.isArray(state.myShiftRows)){
        const r=state.myShiftRows.find(x=>String(x.shift_id||"")===id);
        if(r)return r;
      }
    }catch(_e){}
    return null;
  }

  function selectRow_(row){
    document.querySelectorAll("#myShiftList .registered-shift-row").forEach(x=>x.classList.toggle("is-shift-selected",x===row));
  }

  function phone_(r,isDelete){
    const action=document.querySelector("#todayShiftContactAction");
    const detail=document.querySelector("#todayShiftContactDetail");
    const card=document.querySelector("#todayShiftContactCard");
    const timing=String(r.date)===TODAY()?"当日":"前日";
    if(action)action.textContent=`${timing}の${isDelete?"シフト削除":"シフト変更"}について直接連絡`;
    if(detail)detail.innerHTML=`${r.date}<br>${r.start_time}〜${r.end_time}<br><br>シフト日の当日および前日の変更・削除はWebから申請できません。<br>下のボタンから080-3553-4259へ直接ご連絡ください。`;
    card?.classList.remove("is-hidden");
    card?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function act_(btn){
    const row=btn.closest(".registered-shift-row");
    selectRow_(row);
    const r=rowShift_(row);
    if(!r){
      if(typeof myShiftMsg==="function")myShiftMsg("対象のシフトを取得できませんでした。画面を更新してください。",true);
      return;
    }
    const date=String(r.date||"");
    const isDelete=btn.hasAttribute("data-my-shift-delete");
    if(date<TODAY()){
      if(typeof myShiftMsg==="function")myShiftMsg("過去のシフトは変更・削除申請できません。",true);
      return;
    }
    if(date===TODAY()||date===TOMORROW()){
      phone_(r,isDelete);
      return;
    }
    if(isDelete){
      if(typeof requestDeleteMyShift==="function")requestDeleteMyShift(r);
    }else{
      if(typeof editMyShiftRequest==="function")editMyShiftRequest(r);
    }
  }

  function wire_(){
    const box=document.querySelector("#myShiftList");
    if(!box)return;

    box.querySelectorAll(".registered-shift-row").forEach(row=>{
      if(row.dataset.hardShiftWired==="1")return;
      row.dataset.hardShiftWired="1";
      row.addEventListener("click",e=>{
        if(e.target.closest("button"))return;
        selectRow_(row);
      });

      row.querySelectorAll("[data-my-shift-edit],[data-my-shift-delete]").forEach(btn=>{
        /* 過去日以外はブラウザのdisabledを解除し、判定はこの処理で行う */
        const r=rowShift_(row);
        if(r&&String(r.date||"")>=TODAY())btn.disabled=false;
        btn.onclick=null;
        btn.addEventListener("click",e=>{
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          act_(btn);
        },true);
      });
    });
  }

  function boot_(){
    css_();
    wire_();
    const box=document.querySelector("#myShiftList");
    if(box)new MutationObserver(()=>wire_()).observe(box,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot_,{once:true});
  else boot_();
})();