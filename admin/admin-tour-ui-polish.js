(()=>{
  "use strict";
  function css(){if(document.getElementById("tourUiPolishCss"))return;const s=document.createElement("style");s.id="tourUiPolishCss";s.textContent=`
    .tour-mail-button{display:none!important}
    .tour-row-actions{display:inline-flex!important;gap:10px!important;align-items:stretch!important;flex-wrap:wrap!important}
    .tour-row-actions .tour-print-button,.tour-row-actions .tour-enroll-button{width:160px!important;min-width:160px!important;height:58px!important;min-height:58px!important;margin:0!important;border-radius:12px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-weight:800!important}
    .staff-reservation-row .reservation-manage-button,.staff-reservation-row [data-action="manage"],.staff-reservation-row [data-action="change-cancel"]{width:160px!important;min-width:160px!important;height:58px!important;min-height:58px!important;border-radius:12px!important;font-weight:800!important}
    .tour-reply-inside{min-width:120px!important}
    @media(max-width:680px){.tour-row-actions .tour-print-button,.tour-row-actions .tour-enroll-button,.staff-reservation-row .reservation-manage-button,.staff-reservation-row [data-action="manage"],.staff-reservation-row [data-action="change-cancel"]{width:100%!important;min-width:0!important}}
  `;document.head.appendChild(s)}
  let activeMail=null;
  function wireRows(){document.querySelectorAll(".staff-reservation-row").forEach(row=>{const q=row.querySelector(".tour-print-button");const mail=row.querySelector(".tour-mail-button");if(q&&mail&&!q.dataset.replyLinked){q.dataset.replyLinked="1";q.addEventListener("click",()=>{activeMail=mail},{capture:true})}})}
  function wireModal(){const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');if(!modal||modal.querySelector(".tour-reply-inside"))return;const actions=modal.querySelector(".tour-print-actions");if(!actions)return;const b=document.createElement("button");b.type="button";b.className="ghost-button tour-reply-inside";b.textContent="返信する";b.onclick=()=>{const mail=activeMail;document.querySelector(".tour-print-overlay")?.remove();setTimeout(()=>mail?.click(),0)};const generate=actions.querySelector("#tourPrintGenerate");actions.insertBefore(b,generate||null)}
  function boot(){css();wireRows();wireModal();new MutationObserver(()=>{wireRows();wireModal()}).observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();