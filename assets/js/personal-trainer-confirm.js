/* A-nauts OS Reserve - personal trainer final confirmation */
(()=>{
  "use strict";
  if(!["personal","trial"].includes(location.pathname.split("/").filter(Boolean).pop()||""))return;

  const WOMEN_ONLY_TRAINER_CODE="YOSHIMARU";
  let filterTrainerCode="";
  let confirmedTrainerCode="";
  let resolving=false;
  let bypass=false;
  let trainers=[];
  const nativeFetch=window.fetch.bind(window);
  const q=s=>document.querySelector(s), qa=s=>Array.from(document.querySelectorAll(s));
  const submitForm=()=>{const f=q("#reservationForm");if(!f)return;if(typeof f.requestSubmit==="function"){f.requestSubmit();return;}f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const trainerLabel=t=>{const n=String(t.staff_name||t.display_name||t.staff_code||"").trim();return n.endsWith("トレーナー")?n:`${n}トレーナー`;};
  const trainerAllowed=t=>window.ANAUTS_YOSHIMARU_ALLOWED===true||String(t?.staff_code||"").trim().toUpperCase()!==WOMEN_ONLY_TRAINER_CODE;
  const announceFinalTrainer=t=>document.dispatchEvent(new CustomEvent("anauts:trainer-finalized",{detail:{staff_code:String(t?.staff_code||"").trim().toUpperCase(),staff_name:String(t?.staff_name||t?.display_name||"").trim()}}));

  function ensureStyle(){if(q("#ptConfirmStyle"))return;const s=document.createElement("style");s.id="ptConfirmStyle";s.textContent=`.ptc-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72)}.ptc-card{width:min(520px,100%);max-height:82vh;overflow:auto;padding:22px;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:#0d1c16;color:#fff}.ptc-card h2{margin:0 0 8px}.ptc-card p{line-height:1.6;opacity:.82}.ptc-list{display:grid;gap:9px;margin:16px 0}.ptc-trainer{width:100%;padding:14px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:transparent;color:inherit;font:inherit;font-weight:800;text-align:left;cursor:pointer}.ptc-trainer:hover{border-color:#d9b85d;background:rgba(217,184,93,.12)}.ptc-close{width:100%}`;document.head.appendChild(s);}
  function showError(msg){const n=q("#formError");if(!n)return;n.textContent=msg;n.classList.remove("is-hidden");n.scrollIntoView({behavior:"smooth",block:"nearest"});}
  async function loadTrainers(){if(trainers.length)return trainers.filter(trainerAllowed);const u=new URL(API_URL);u.searchParams.set("action","getPublicTrainers");u.searchParams.set("store_code",String(selectedService?.store_code||"YACHIYO"));u.searchParams.set("_",Date.now());const r=await nativeFetch(u.toString(),{cache:"no-store"}),j=await r.json();if(!j.ok)throw new Error(j.message||"トレーナー一覧を取得できませんでした。");trainers=Array.isArray(j.data?.trainers)?j.data.trainers:[];return trainers.filter(trainerAllowed);}
  async function trainerAvailable(t){if(!trainerAllowed(t))return false;const u=new URL(API_URL);u.searchParams.set("action","getAvailableSlots");u.searchParams.set("service_code",selectedService.service_code);u.searchParams.set("date",selectedSlot.date);u.searchParams.set("staff_code",t.staff_code);u.searchParams.set("_",Date.now());try{const r=await nativeFetch(u.toString(),{cache:"no-store"}),j=await r.json();return !!j.ok&&(j.data?.slots||[]).some(s=>String(s.start_time).slice(0,5)===String(selectedSlot.start_time).slice(0,5));}catch(_){return false;}}
  async function candidates(){const all=await loadTrainers(),out=[];let cursor=0;const worker=async()=>{while(cursor<all.length){const t=all[cursor++];if(await trainerAvailable(t))out.push(t);}};await Promise.all(Array.from({length:Math.min(3,all.length||1)},worker));return out;}
  function chooseModal(list){q("#ptcOverlay")?.remove();ensureStyle();const o=document.createElement("div");o.id="ptcOverlay";o.className="ptc-overlay";o.innerHTML=`<div class="ptc-card"><h2>担当トレーナーを選択</h2><p>${esc(selectedSlot.date)} ${esc(String(selectedSlot.start_time).slice(0,5))}の予約に対応可能なトレーナーが複数います。担当トレーナーを選択して予約を確定してください。</p><div class="ptc-list">${list.map((t,i)=>`<button type="button" class="ptc-trainer" data-ptc="${i}">${esc(trainerLabel(t))}</button>`).join("")}</div><button type="button" id="ptcClose" class="button button-secondary ptc-close">戻る</button></div>`;document.body.appendChild(o);qa("[data-ptc]").forEach(b=>b.onclick=()=>{const chosen=list[+b.dataset.ptc];confirmedTrainerCode=String(chosen.staff_code||"");o.remove();const summary=q("#selectedSlotText");if(summary&&!summary.textContent.includes("担当:"))summary.textContent+=` / 担当: ${trainerLabel(chosen)}`;announceFinalTrainer(chosen);bypass=true;submitForm();});q("#ptcClose").onclick=()=>o.remove();o.onclick=e=>{if(e.target===o)o.remove();};}

  document.addEventListener("click",e=>{
    const trainer=e.target.closest?.("#personalTrainerChoices [data-trainer-code]");if(trainer){filterTrainerCode=String(trainer.dataset.trainerCode||"");confirmedTrainerCode="";}
    if(e.target.closest?.(".service-card")){filterTrainerCode="";confirmedTrainerCode="";trainers=[];}
    if(e.target.closest?.(".slot-button"))confirmedTrainerCode="";
  },true);

  document.addEventListener("anauts:booking-eligibility-ready",()=>{filterTrainerCode="";confirmedTrainerCode="";});
  document.addEventListener("anauts:booking-eligibility-invalidated",()=>{filterTrainerCode="";confirmedTrainerCode="";q("#ptcOverlay")?.remove();});

  q("#reservationForm")?.addEventListener("submit",async e=>{
    if(bypass){bypass=false;return;}
    if(filterTrainerCode||confirmedTrainerCode)return;
    if(!selectedService||!selectedSlot||resolving)return;
    e.preventDefault();e.stopImmediatePropagation();resolving=true;
    const submit=q("#submitButton"),old=submit?.textContent;if(submit){submit.disabled=true;submit.textContent="担当トレーナー確認中…";}
    try{const list=await candidates();if(!list.length){showError("この時間に対応可能なトレーナーがいなくなりました。空き状況を更新してください。");return;}if(list.length===1){confirmedTrainerCode=String(list[0].staff_code||"");const summary=q("#selectedSlotText");if(summary&&!summary.textContent.includes("担当:"))summary.textContent+=` / 担当: ${trainerLabel(list[0])}`;announceFinalTrainer(list[0]);bypass=true;submitForm();return;}chooseModal(list);}catch(err){showError(err.message||"担当トレーナーを確認できませんでした。");}finally{resolving=false;if(submit){submit.disabled=false;submit.textContent=old||"この内容で予約する";}}
  },true);

  // personal-v54 のfetchラッパーの後段で、未指名時に最終選択したトレーナーをpayloadへ入れる。
  const previousFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){try{const method=String(init?.method||"GET").toUpperCase(),target=typeof input==="string"?input:String(input?.url||input||"");if(confirmedTrainerCode&&method==="POST"&&target===API_URL&&typeof init?.body==="string"){const body=JSON.parse(init.body);if(body?.action==="createReservation"&&!body.staff_code){body.staff_code=confirmedTrainerCode;init={...init,body:JSON.stringify(body)};}}}catch(_){ }return previousFetch(input,init);};
})();
