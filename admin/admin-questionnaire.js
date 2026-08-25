(()=>{
  "use strict";

  function load(src){
    const s=document.createElement("script");
    s.src=src;
    s.async=false;
    document.head.appendChild(s);
  }

  /* 元のアンケートUI本体 */
  load("./admin-questionnaire-core.js?v=20260825-1258");

  function ymd_(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function tomorrowYmd_(){
    const d=new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+1);
    return ymd_(d);
  }

  function getShiftFromButton_(btn){
    const id=String(btn.dataset.myShiftEdit||btn.dataset.myShiftDelete||"");
    try{
      if(typeof state!=="undefined" && Array.isArray(state.myShiftRows)){
        const found=state.myShiftRows.find(x=>String(x.shift_id||"")===id);
        if(found)return found;
      }
    }catch(_e){}

    const row=btn.closest(".registered-shift-row");
    const date=String(row?.querySelector(".registered-shift-time small")?.textContent||"").trim();
    const timeText=String(row?.querySelector(".registered-shift-meta span")?.textContent||"").trim();
    const m=timeText.match(/(\d{1,2}:\d{2})\s*[〜~-]\s*(\d{1,2}:\d{2})/);
    return id&&date&&m ? {shift_id:id,date,start_time:m[1],end_time:m[2]} : null;
  }

  function msg_(text,error=true){
    try{
      if(typeof myShiftMsg==="function")return myShiftMsg(text,error);
    }catch(_e){}
    alert(text);
  }

  function phoneCard_(r,label){
    const action=document.querySelector("#todayShiftContactAction");
    const detail=document.querySelector("#todayShiftContactDetail");
    const card=document.querySelector("#todayShiftContactCard");
    const timing=String(r.date)===ymd_(new Date())?"当日":"前日";
    if(action)action.textContent=`${timing}の${label}について直接連絡`;
    if(detail)detail.innerHTML=`${r.date}<br>${r.start_time}〜${r.end_time}<br><br>シフト日の当日および前日の変更・削除はWebから申請できません。<br>下のボタンから080-3553-4259へ直接ご連絡ください。`;
    card?.classList.remove("is-hidden");
    card?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function installShiftButtons_(){
    if(window.__myShiftDirectButtonFixInstalled)return;
    window.__myShiftDirectButtonFixInstalled=true;

    document.addEventListener("click",function(e){
      const btn=e.target.closest?.("#myShiftList [data-my-shift-edit],#myShiftList [data-my-shift-delete]");
      if(!btn)return;

      /* disabled属性でも直前日案内を出せるよう、ここで必ず拾う */
      e.preventDefault();
      e.stopImmediatePropagation();

      const r=getShiftFromButton_(btn);
      if(!r)return msg_("対象のシフトを取得できませんでした。画面を更新してもう一度お試しください。",true);

      const today=ymd_(new Date());
      const tomorrow=tomorrowYmd_();
      const date=String(r.date||"");
      const isDelete=btn.hasAttribute("data-my-shift-delete");

      if(date<today)return msg_("過去のシフトは変更・削除申請できません。",true);
      if(date===today||date===tomorrow)return phoneCard_(r,isDelete?"シフト削除":"シフト変更");

      try{
        if(isDelete && typeof requestDeleteMyShift==="function"){
          requestDeleteMyShift(r);
          return;
        }
        if(!isDelete && typeof editMyShiftRequest==="function"){
          editMyShiftRequest(r);
          return;
        }
      }catch(err){
        return msg_(err?.message||"申請画面を開けませんでした。",true);
      }
      msg_(isDelete?"シフト削除申請を開始できませんでした。":"シフト変更申請を開始できませんでした。",true);
    },true);
  }

  function patchStaticMyShiftText(){
    const view=document.querySelector("#myShiftView");
    if(!view)return;

    const cards=[...view.querySelectorAll(":scope > .card")];
    const notice=cards.find(card=>String(card.textContent||"").includes("当日のシフト変更について"));
    if(notice){
      const strong=notice.querySelector("strong");
      const div=notice.querySelector("div");
      if(strong)strong.textContent="直前のシフト変更について";
      if(div)div.innerHTML='シフト日の<strong>当日および前日</strong>は、この画面から変更・削除申請できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。';
    }

    const contact=document.querySelector("#todayShiftContactCard");
    if(contact){
      const eyebrow=contact.querySelector(".eyebrow");
      const h2=contact.querySelector("h2");
      const p=contact.querySelector(".manager-header p[style]");
      if(eyebrow)eyebrow.textContent="URGENT SHIFT CHANGE";
      if(h2)h2.textContent="直前のシフト変更";
      if(p)p.textContent="シフト日の当日および前日はWebから変更・削除申請できません。選択した内容について直接ご連絡ください。";
    }
  }

  function boot_(){
    patchStaticMyShiftText();
    installShiftButtons_();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot_,{once:true});
  else boot_();
})();