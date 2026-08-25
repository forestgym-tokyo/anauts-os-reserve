(()=>{
  "use strict";

  const q=document.createElement("script");
  q.src="./admin-questionnaire-core.js?v=20260825-1258";
  q.async=false;
  document.head.appendChild(q);

  const ymd=(add=0)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+add);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};

  function css(){
    if(document.getElementById("myShiftInlineCss"))return;
    const s=document.createElement("style");s.id="myShiftInlineCss";
    s.textContent=`#myShiftList .registered-shift-row{cursor:pointer;transition:.15s ease}#myShiftList .registered-shift-row.is-shift-selected{background:rgba(99,209,121,.18)!important;border:2px solid #63d179!important;box-shadow:0 0 0 2px rgba(99,209,121,.2)!important}#myShiftList .registered-shift-actions button{pointer-events:auto!important;position:relative!important;z-index:99!important}`;
    document.head.appendChild(s);
  }
  function selected(row){document.querySelectorAll("#myShiftList .registered-shift-row").forEach(x=>x.classList.toggle("is-shift-selected",x===row));}
  function getShift(btn){const id=btn.dataset.myShiftEdit||btn.dataset.myShiftDelete||"";try{return (state.myShiftRows||[]).find(r=>String(r.shift_id||"")===String(id))||null}catch(e){return null}}
  function phone(r,isDelete){const card=document.querySelector("#todayShiftContactCard"),a=document.querySelector("#todayShiftContactAction"),d=document.querySelector("#todayShiftContactDetail");const timing=String(r.date)===ymd()?"当日":"前日";if(a)a.textContent=`${timing}の${isDelete?"シフト削除":"シフト変更"}について直接連絡`;if(d)d.innerHTML=`${r.date}<br>${r.start_time}〜${r.end_time}<br><br>シフト日の当日および前日の変更・削除はWebから申請できません。<br>下のボタンから080-3553-4259へ直接ご連絡ください。`;card?.classList.remove("is-hidden");card?.scrollIntoView({behavior:"smooth",block:"start"});}
  function act(btn){const row=btn.closest(".registered-shift-row");selected(row);const r=getShift(btn);if(!r){myShiftMsg?.("対象シフトを取得できませんでした。",true);return;}const date=String(r.date||""),del=btn.hasAttribute("data-my-shift-delete");if(date<ymd()){myShiftMsg?.("過去のシフトは変更・削除申請できません。",true);return;}if(date===ymd()||date===ymd(1)){phone(r,del);return;}if(del)requestDeleteMyShift(r);else editMyShiftRequest(r);}
  function wire(){const today=ymd();document.querySelectorAll("#myShiftList .registered-shift-row").forEach(row=>{row.querySelectorAll("[data-my-shift-edit],[data-my-shift-delete]").forEach(btn=>{const r=getShift(btn);if(r&&String(r.date||"")>=today&&!row.classList.contains("is-pending-request"))btn.disabled=false;});});}
  function text(){const v=document.querySelector("#myShiftView");if(!v)return;[...v.querySelectorAll(":scope > .card")].forEach(c=>{if(!String(c.textContent||"").includes("シフト変更について"))return;const s=c.querySelector("strong"),d=c.querySelector("div");if(s)s.textContent="直前のシフト変更について";if(d)d.innerHTML='シフト日の<strong>当日および前日</strong>は、この画面から変更・削除申請できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。';});}
  function boot(){css();text();wire();const box=document.querySelector("#myShiftList");if(box)new MutationObserver(wire).observe(box,{childList:true,subtree:true});document.addEventListener("click",e=>{const btn=e.target.closest?.("#myShiftList [data-my-shift-edit],#myShiftList [data-my-shift-delete]");if(btn){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();act(btn);return;}const row=e.target.closest?.("#myShiftList .registered-shift-row");if(row)selected(row);},true);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();