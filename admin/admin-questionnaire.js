(()=>{
  "use strict";

  function load(src){
    const s=document.createElement("script");
    s.src=src;
    s.async=false;
    document.head.appendChild(s);
  }

  load("./admin-questionnaire-core.js?v=20260825-1258");

  function ymd_(addDays=0){
    const d=new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+addDays);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function installCss_(){
    if(document.getElementById("myShiftNativeFixCss"))return;
    const s=document.createElement("style");
    s.id="myShiftNativeFixCss";
    s.textContent=`
      #myShiftList .registered-shift-row{cursor:pointer;transition:.15s ease}
      #myShiftList .registered-shift-row.is-shift-selected{
        background:rgba(99,209,121,.16)!important;
        border:2px solid #63d179!important;
        box-shadow:0 0 0 2px rgba(99,209,121,.18)!important;
      }
      #myShiftList .registered-shift-row.is-shift-selected .registered-shift-time,
      #myShiftList .registered-shift-row.is-shift-selected .registered-shift-meta{
        background:rgba(99,209,121,.05)!important;
      }
    `;
    document.head.appendChild(s);
  }

  function selectRow_(row){
    document.querySelectorAll("#myShiftList .registered-shift-row").forEach(x=>{
      x.classList.toggle("is-shift-selected",x===row);
    });
  }

  function showPhone_(r,label){
    const action=document.querySelector("#todayShiftContactAction");
    const detail=document.querySelector("#todayShiftContactDetail");
    const card=document.querySelector("#todayShiftContactCard");
    const timing=String(r.date||"")===ymd_(0)?"当日":"前日";
    if(action)action.textContent=`${timing}の${label}について直接連絡`;
    if(detail){
      detail.innerHTML=`${r.date||""}<br>${r.start_time||""}〜${r.end_time||""}<br><br>シフト日の当日および前日の変更・削除はWebから申請できません。<br>下のボタンから080-3553-4259へ直接ご連絡ください。`;
    }
    card?.classList.remove("is-hidden");
    card?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function findShift_(id){
    try{
      return (state.myShiftRows||[]).find(x=>String(x.shift_id||"")===String(id||""))||null;
    }catch(_e){
      return null;
    }
  }

  function wireRenderedRows_(){
    const today=ymd_(0);
    const tomorrow=ymd_(1);

    document.querySelectorAll("#myShiftList .registered-shift-row").forEach(row=>{
      const edit=row.querySelector("[data-my-shift-edit]");
      const del=row.querySelector("[data-my-shift-delete]");
      const id=edit?.dataset.myShiftEdit||del?.dataset.myShiftDelete||"";
      const r=findShift_(id);
      if(!r)return;

      const date=String(r.date||"");
      const pending=row.classList.contains("is-pending-request");
      const past=date<today;

      row.onclick=(e)=>{
        if(e.target.closest("button"))return;
        selectRow_(row);
      };

      if(edit){
        edit.disabled=past||pending;
        edit.onclick=(e)=>{
          e.preventDefault();
          e.stopPropagation();
          selectRow_(row);
          if(past||pending)return;
          if(date===today||date===tomorrow){showPhone_(r,"シフト変更");return;}
          if(typeof editMyShiftRequest==="function")editMyShiftRequest(r);
        };
      }

      if(del){
        del.disabled=past||pending;
        del.onclick=(e)=>{
          e.preventDefault();
          e.stopPropagation();
          selectRow_(row);
          if(past||pending)return;
          if(date===today||date===tomorrow){showPhone_(r,"シフト削除");return;}
          if(typeof requestDeleteMyShift==="function")requestDeleteMyShift(r);
        };
      }
    });
  }

  function patchMainRenderer_(){
    if(window.__nativeMyShiftRendererPatched)return;
    if(typeof renderMyShiftRows!=="function")return;
    window.__nativeMyShiftRendererPatched=true;

    const original=renderMyShiftRows;
    renderMyShiftRows=function(){
      const result=original.apply(this,arguments);
      wireRenderedRows_();
      return result;
    };

    wireRenderedRows_();
  }

  function patchDateRules_(){
    try{
      isTodayOrPastShiftDate_=function(dateValue){
        const target=String(dateValue||"");
        return !!target && target<=ymd_(1);
      };
      sameDayShiftRuleMessage_=function(){
        return "シフト日の当日および前日の変更・削除はWeb申請できません。080-3553-4259まで直接ご連絡ください。";
      };
    }catch(_e){}
  }

  function patchStaticText_(){
    const view=document.querySelector("#myShiftView");
    if(!view)return;
    const cards=[...view.querySelectorAll(":scope > .card")];
    const notice=cards.find(card=>String(card.textContent||"").includes("シフト変更について"));
    if(notice){
      const strong=notice.querySelector("strong");
      const div=notice.querySelector("div");
      if(strong)strong.textContent="直前のシフト変更について";
      if(div)div.innerHTML='シフト日の<strong>当日および前日</strong>は、この画面から変更・削除申請できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。';
    }
  }

  function boot_(){
    installCss_();
    patchDateRules_();
    patchMainRenderer_();
    patchStaticText_();
    const box=document.querySelector("#myShiftList");
    if(box)new MutationObserver(()=>wireRenderedRows_()).observe(box,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot_,{once:true});
  else boot_();
})();