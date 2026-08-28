(()=>{
  "use strict";

  function css(){
    if(document.getElementById("tourUiPolishCss"))return;
    const s=document.createElement("style");
    s.id="tourUiPolishCss";
    s.textContent=`
      .tour-mail-button{display:none!important}
      .staff-reservation-row .tour-question-inline{display:block!important;width:100%!important;max-width:none!important;box-sizing:border-box!important;grid-column:1 / -1!important;margin:10px 0 0!important;padding:12px 14px!important;cursor:pointer!important}
      .staff-reservation-row .tour-row-actions{display:flex!important;gap:8px!important;align-items:center!important;justify-content:flex-end!important;width:100%!important;max-width:none!important;margin:10px 0 0!important;padding:0!important;box-sizing:border-box!important;grid-column:1 / -1!important;clear:both!important}
      .staff-reservation-row .tour-row-actions .tour-print-button,.staff-reservation-row .tour-row-actions .reservation-manage-button,.staff-reservation-row .tour-row-actions .tour-enroll-button{width:158px!important;min-width:158px!important;max-width:158px!important;height:44px!important;min-height:44px!important;margin:0!important;padding:8px 12px!important;border-radius:10px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;font-size:13px!important;line-height:1.25!important;font-weight:800!important;white-space:normal!important;overflow-wrap:anywhere!important}
      .tour-row-actions .reservation-manage-button{order:1!important}.tour-row-actions .tour-print-button{order:2!important}.tour-row-actions .tour-enroll-button{order:3!important}.tour-reply-inside{min-width:120px!important}
      @media (min-width:701px) and (max-width:1100px){.staff-reservation-row .tour-row-actions{max-width:none!important;width:100%!important;gap:8px!important}.staff-reservation-row .tour-row-actions .tour-print-button,.staff-reservation-row .tour-row-actions .reservation-manage-button,.staff-reservation-row .tour-row-actions .tour-enroll-button{flex:1 1 0!important;width:auto!important;min-width:0!important;max-width:none!important;font-size:13px!important;padding:8px 6px!important}}
      @media (max-width:700px){.staff-reservation-row .tour-row-actions{display:grid!important;grid-template-columns:1fr!important;width:100%!important;max-width:none!important;gap:8px!important;margin-top:10px!important}.staff-reservation-row .tour-row-actions .tour-print-button,.staff-reservation-row .tour-row-actions .reservation-manage-button,.staff-reservation-row .tour-row-actions .tour-enroll-button{width:100%!important;min-width:0!important;max-width:none!important;height:46px!important;min-height:46px!important;font-size:14px!important}}
    `;
    document.head.appendChild(s);
  }

  let activeMail=null;

  function openReplyForRow(row){
    const mail=row?.querySelector(".tour-mail-button");
    if(!mail)return;
    activeMail=mail;
    mail.click();
  }

  function normalizeRows(){
    document.querySelectorAll(".staff-reservation-row").forEach(row=>{
      const q=row.querySelector(".tour-print-button");
      const enroll=row.querySelector(".tour-enroll-button");
      const manage=row.querySelector(".reservation-manage-button");
      const mail=row.querySelector(".tour-mail-button");
      const question=row.querySelector(".tour-question-inline");

      if(q&&mail&&!q.dataset.replyLinked){
        q.dataset.replyLinked="1";
        q.addEventListener("click",()=>{activeMail=mail},{capture:true});
      }

      if(question&&mail&&!question.dataset.replyLinked){
        question.dataset.replyLinked="1";
        question.setAttribute("role","button");
        question.setAttribute("tabindex","0");
        question.title="タップして返信";
        question.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openReplyForRow(row)});
        question.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openReplyForRow(row)}});
      }

      if(!q&&!enroll&&!manage)return;
      let actions=row.querySelector(".tour-row-actions");
      if(!actions){actions=document.createElement("div");actions.className="tour-row-actions";row.appendChild(actions)}

      /* 重要: 既に同じ親にある要素はappendChildしない。MutationObserver無限ループ防止 */
      if(manage&&manage.parentElement!==actions)actions.appendChild(manage);
      if(q&&q.parentElement!==actions)actions.appendChild(q);
      if(enroll&&enroll.parentElement!==actions)actions.appendChild(enroll);
    });
  }

  function wireModal(){
    const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');
    if(!modal||modal.querySelector(".tour-reply-inside"))return;
    const actions=modal.querySelector(".tour-print-actions");
    if(!actions)return;
    const b=document.createElement("button");
    b.type="button";b.className="ghost-button tour-reply-inside";b.textContent="返信する";
    b.onclick=()=>{const mail=activeMail;document.querySelector(".tour-print-overlay")?.remove();setTimeout(()=>mail?.click(),0)};
    const generate=actions.querySelector("#tourPrintGenerate");actions.insertBefore(b,generate||null);
  }

  let scheduled=false;
  function scheduleNormalize(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;normalizeRows();wireModal()});
  }

  function boot(){
    css();normalizeRows();wireModal();
    new MutationObserver(scheduleNormalize).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
