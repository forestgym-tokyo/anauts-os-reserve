(()=>{
  "use strict";

  const PHONE="080-3553-4259";
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const today=()=>ymd(new Date());
  const addDays=(s,n)=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));if(!m)return "";const d=new Date(+m[1],+m[2]-1,+m[3]);d.setDate(d.getDate()+n);return ymd(d);};
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function getRows(){try{return Array.isArray(state?.myShiftRows)?state.myShiftRows:[]}catch(_){return []}}
  function getRowByButton(b){const id=b?.dataset?.myShiftEdit||b?.dataset?.myShiftDelete||"";return getRows().find(r=>String(r.shift_id)===String(id));}
  function pendingFor(r){try{return typeof pendingForShift==="function"?pendingForShift(r):null}catch(_){return null}}
  function rule(date){const t=today();if(!date||date<t)return "PAST";if(date===t||date===addDays(t,1))return "PHONE";return "WEB";}

  function ensureStyle(){
    if(document.getElementById("myShiftFinalStyle"))return;
    const s=document.createElement("style");s.id="myShiftFinalStyle";
    s.textContent=`#myShiftList .registered-shift-card.my-shift-selected{background:#eaf7ee!important;border:2px solid #2e7d4f!important;box-shadow:0 0 0 2px rgba(46,125,79,.12)!important}#myShiftList .registered-shift-card{cursor:pointer}.my-shift-phone-note{margin-top:10px;padding:12px 14px;border-radius:10px;background:#fff7e6;border:1px solid #f0c36d;font-weight:700;line-height:1.6}`;
    document.head.appendChild(s);
  }

  function showPhone(r,action){
    const box=document.getElementById("myShiftMessage");
    const text=`${r?.date||""}のシフト${action}はWeb申請できません。お電話（${PHONE}）でご連絡ください。`;
    if(box){box.textContent=text;box.classList.remove("is-hidden");box.classList.remove("is-error");}
    else alert(text);
  }

  function selectCard(card){
    document.querySelectorAll("#myShiftList .registered-shift-card").forEach(x=>x.classList.remove("my-shift-selected"));
    card?.classList.add("my-shift-selected");
  }

  function repair(){
    ensureStyle();
    const rows=getRows();
    document.querySelectorAll("#myShiftList [data-my-shift-edit],#myShiftList [data-my-shift-delete]").forEach(b=>{
      const r=getRowByButton(b);if(!r)return;
      const mode=rule(String(r.date||""));
      const pending=!!pendingFor(r);
      if(mode==="PAST"||pending){b.disabled=true;return;}
      b.disabled=false;
      b.title=mode==="PHONE"?`当日・前日の申請は電話（${PHONE}）でご連絡ください。`:"";
    });
  }

  document.addEventListener("click",e=>{
    const b=e.target.closest?.("#myShiftList [data-my-shift-edit],#myShiftList [data-my-shift-delete]");
    if(b){
      const r=getRowByButton(b);if(!r)return;
      const mode=rule(String(r.date||""));
      if(mode==="PAST"){e.preventDefault();e.stopImmediatePropagation();return;}
      if(mode==="PHONE"){
        e.preventDefault();e.stopImmediatePropagation();
        showPhone(r,b.hasAttribute("data-my-shift-delete")?"の削除":"の変更");return;
      }
      // 2日後以降は本体の既存onclickをそのまま実行させる
      return;
    }
    const card=e.target.closest?.("#myShiftList .registered-shift-card");
    if(card)selectCard(card);
  },true);

  new MutationObserver(repair).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",repair);else repair();
})();