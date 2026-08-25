(()=>{
  "use strict";

  function load(src){
    const s=document.createElement("script");
    s.src=src;
    s.async=false;
    document.head.appendChild(s);
  }

  /* アンケートUI本体 */
  load("./admin-questionnaire-core.js?v=20260825-1258");

  /* 自分のシフト：本体の後から確実に適用する修正 */
  load("./admin-myshift-fix.js?v=20260825-1315");

  function patchStaticMyShiftText(){
    const view=document.querySelector("#myShiftView");
    if(!view)return;

    const cards=[...view.querySelectorAll(":scope > .card")];
    const notice=cards.find(card=>{
      const text=String(card.textContent||"");
      return text.includes("当日のシフト変更について") || text.includes("直前のシフト変更について");
    });

    if(notice){
      const strong=notice.querySelector("strong");
      const div=notice.querySelector("div");
      if(strong)strong.textContent="直前のシフト変更について";
      if(div){
        div.innerHTML='シフト日の<strong>当日および前日</strong>は、この画面から変更・削除申請できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。';
      }
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

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",patchStaticMyShiftText,{once:true});
  }else{
    patchStaticMyShiftText();
  }
})();