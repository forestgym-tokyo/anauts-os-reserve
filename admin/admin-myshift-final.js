(()=>{
  "use strict";
  const PHONE="080-3553-4259";
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(s,n)=>{const [y,m,d]=String(s).split("-").map(Number),x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return ymd(x)};
  const rule=date=>{const t=ymd(new Date());if(!date||date<t)return"PAST";if(date===t||date===addDays(t,1))return"PHONE";return"WEB"};
  function rows(){try{return Array.isArray(state.myShiftRows)?state.myShiftRows:[]}catch(_){return[]}}
  function rowFor(b){const id=b.dataset.myShiftEdit||b.dataset.myShiftDelete||"";return rows().find(r=>String(r.shift_id)===String(id))}
  function style(){if(document.getElementById("myShiftFinalStyle"))return;const s=document.createElement("style");s.id="myShiftFinalStyle";s.textContent=`#myShiftList .registered-shift-row{cursor:pointer;transition:.15s}#myShiftList .registered-shift-row.my-shift-selected{background:#173f2a!important;border:2px solid #63d179!important;box-shadow:0 0 0 2px rgba(99,209,121,.18)!important}`;document.head.appendChild(s)}
  function phone(r,action){
    if(typeof showTodayShiftContactCard_==="function"){showTodayShiftContactCard_(r,action);const d=document.getElementById("todayShiftContactDetail");if(d)d.innerHTML=d.innerHTML.replaceAll("当日の","当日・前日の");return}
    const m=document.getElementById("myShiftMessage");const text=`当日・前日のシフト${action}はWeb申請できません。${PHONE}まで直接ご連絡ください。`;if(m){m.textContent=text;m.classList.remove("is-hidden");m.classList.add("is-error")}else alert(text)
  }
  function repair(){
    style();
    document.querySelectorAll("#myShiftList [data-my-shift-edit],#myShiftList [data-my-shift-delete]").forEach(b=>{
      const r=rowFor(b);if(!r)return;const mode=rule(String(r.date||""));
      if(mode==="PAST"){b.disabled=true;b.dataset.shiftRule="PAST";return}
      b.disabled=false;b.dataset.shiftRule=mode;
      if(mode==="PHONE")b.title=`当日・前日は電話（${PHONE}）でご連絡ください。`;
    });
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest?.("#myShiftList [data-my-shift-edit],#myShiftList [data-my-shift-delete]");
    if(b){const r=rowFor(b);if(!r)return;const mode=rule(String(r.date||""));if(mode==="PAST"){e.preventDefault();e.stopImmediatePropagation();return}if(mode==="PHONE"){e.preventDefault();e.stopImmediatePropagation();phone(r,b.hasAttribute("data-my-shift-delete")?"削除":"変更");return}return}
    const row=e.target.closest?.("#myShiftList .registered-shift-row");if(row){document.querySelectorAll("#myShiftList .registered-shift-row").forEach(x=>x.classList.remove("my-shift-selected"));row.classList.add("my-shift-selected")}
  },true);
  new MutationObserver(repair).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",repair);else repair();
})();