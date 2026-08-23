(()=>{
  "use strict";
  function css(){if(document.getElementById("tourUiPolishCss"))return;const s=document.createElement("style");s.id="tourUiPolishCss";s.textContent=`
    .tour-mail-button{display:none!important}
    .tour-row-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,160px))!important;gap:10px!important;align-items:stretch!important;margin:0!important;width:max-content!important;max-width:100%!important}
    .tour-row-actions .tour-print-button,.tour-row-actions .tour-enroll-button,.tour-row-actions .reservation-manage-button{width:160px!important;min-width:160px!important;height:58px!important;min-height:58px!important;margin:0!important;border-radius:12px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;font-weight:800!important;box-sizing:border-box!important;white-space:nowrap!important}
    .tour-row-actions .reservation-manage-button{order:2!important}.tour-row-actions .tour-print-button{order:1!important}.tour-row-actions .tour-enroll-button{order:3!important}
    .tour-reply-inside{min-width:120px!important}
    @media(max-width:1100px){.tour-row-actions{grid-template-columns:repeat(3,minmax(0,1fr))!important;width:100%!important}.tour-row-actions .tour-print-button,.tour-row-actions .tour-enroll-button,.tour-row-actions .reservation-manage-button{width:100%!important;min-width:0!important}}
    @media(max-width:700px){.tour-row-actions{grid-template-columns:1fr!important;width:100%!important}.tour-row-actions .tour-print-button,.tour-row-actions .tour-enroll-button,.tour-row-actions .reservation-manage-button{width:100%!important;min-width:0!important}}
  `;document.head.appendChild(s)}
  let activeMail=null;
  function normalizeRows(){
    document.querySelectorAll(".staff-reservation-row").forEach(row=>{
      const q=row.querySelector(".tour-print-button");
      const enroll=row.querySelector(".tour-enroll-button");
      const manage=row.querySelector(".reservation-manage-button");
      const mail=row.querySelector(".tour-mail-button");
      if(q&&mail&&!q.dataset.replyLinked){q.dataset.replyLinked="1";q.addEventListener("click",()=>{activeMail=mail},{capture:true})}
      if(!q&&!enroll)return;
      let actions=row.querySelector(".tour-row-actions");
      if(!actions){actions=document.createElement("span");actions.className="tour-row-actions";row.appendChild(actions)}
      if(q&&q.parentElement!==actions)actions.appendChild(q);
      if(manage&&manage.parentElement!==actions)actions.appendChild(manage);
      if(enroll&&enroll.parentElement!==actions)actions.appendChild(enroll);
    });
  }
  function wireModal(){const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');if(!modal||modal.querySelector(".tour-reply-inside"))return;const actions=modal.querySelector(".tour-print-actions");if(!actions)return;const b=document.createElement("button");b.type="button";b.className="ghost-button tour-reply-inside";b.textContent="返信する";b.onclick=()=>{const mail=activeMail;document.querySelector(".tour-print-overlay")?.remove();setTimeout(()=>mail?.click(),0)};const generate=actions.querySelector("#tourPrintGenerate");actions.insertBefore(b,generate||null)}
  function boot(){css();normalizeRows();wireModal();new MutationObserver(()=>{normalizeRows();wireModal()}).observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();