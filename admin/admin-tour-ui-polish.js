(()=>{
  "use strict";

  function css(){
    if(document.getElementById("tourUiPolishCss"))return;
    const s=document.createElement("style");
    s.id="tourUiPolishCss";
    s.textContent=`
      .tour-mail-button{display:none!important}

      /* TOUR操作は必ず同じ1行の専用グリッドへ */
      .staff-reservation-row .tour-row-actions{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:10px!important;
        align-items:stretch!important;
        justify-items:stretch!important;
        width:100%!important;
        max-width:540px!important;
        margin:10px 0 0!important;
        padding:0!important;
        box-sizing:border-box!important;
        grid-column:1 / -1!important;
        clear:both!important;
      }

      .staff-reservation-row .tour-row-actions .tour-print-button,
      .staff-reservation-row .tour-row-actions .reservation-manage-button,
      .staff-reservation-row .tour-row-actions .tour-enroll-button{
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
        height:58px!important;
        min-height:58px!important;
        margin:0!important;
        padding:8px 10px!important;
        border-radius:12px!important;
        box-sizing:border-box!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        text-align:center!important;
        font-size:14px!important;
        line-height:1.25!important;
        font-weight:800!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
      }

      .tour-row-actions .tour-print-button{order:1!important}
      .tour-row-actions .reservation-manage-button{order:2!important}
      .tour-row-actions .tour-enroll-button{order:3!important}
      .tour-reply-inside{min-width:120px!important}

      /* iPad / タブレット：3枚を均等幅のまま維持 */
      @media (min-width:701px) and (max-width:1100px){
        .staff-reservation-row .tour-row-actions{
          max-width:none!important;
          width:100%!important;
          gap:8px!important;
        }
        .staff-reservation-row .tour-row-actions .tour-print-button,
        .staff-reservation-row .tour-row-actions .reservation-manage-button,
        .staff-reservation-row .tour-row-actions .tour-enroll-button{
          font-size:13px!important;
          padding:8px 6px!important;
        }
      }

      /* スマホ：3枚を縦に揃える */
      @media (max-width:700px){
        .staff-reservation-row .tour-row-actions{
          grid-template-columns:1fr!important;
          width:100%!important;
          max-width:none!important;
          gap:8px!important;
          margin-top:10px!important;
        }
        .staff-reservation-row .tour-row-actions .tour-print-button,
        .staff-reservation-row .tour-row-actions .reservation-manage-button,
        .staff-reservation-row .tour-row-actions .tour-enroll-button{
          width:100%!important;
          min-width:0!important;
          height:48px!important;
          min-height:48px!important;
          font-size:14px!important;
        }
      }
    `;
    document.head.appendChild(s);
  }

  let activeMail=null;

  function normalizeRows(){
    document.querySelectorAll(".staff-reservation-row").forEach(row=>{
      const q=row.querySelector(".tour-print-button");
      const enroll=row.querySelector(".tour-enroll-button");
      const manage=row.querySelector(".reservation-manage-button");
      const mail=row.querySelector(".tour-mail-button");

      if(q&&mail&&!q.dataset.replyLinked){
        q.dataset.replyLinked="1";
        q.addEventListener("click",()=>{activeMail=mail},{capture:true});
      }

      if(!q&&!enroll&&!manage)return;

      let actions=row.querySelector(".tour-row-actions");
      if(!actions){
        actions=document.createElement("div");
        actions.className="tour-row-actions";
        row.appendChild(actions);
      }

      if(q&&q.parentElement!==actions)actions.appendChild(q);
      if(manage&&manage.parentElement!==actions)actions.appendChild(manage);
      if(enroll&&enroll.parentElement!==actions)actions.appendChild(enroll);
    });
  }

  function wireModal(){
    const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');
    if(!modal||modal.querySelector(".tour-reply-inside"))return;
    const actions=modal.querySelector(".tour-print-actions");
    if(!actions)return;
    const b=document.createElement("button");
    b.type="button";
    b.className="ghost-button tour-reply-inside";
    b.textContent="返信する";
    b.onclick=()=>{
      const mail=activeMail;
      document.querySelector(".tour-print-overlay")?.remove();
      setTimeout(()=>mail?.click(),0);
    };
    const generate=actions.querySelector("#tourPrintGenerate");
    actions.insertBefore(b,generate||null);
  }

  function boot(){
    css();
    normalizeRows();
    wireModal();
    new MutationObserver(()=>{
      normalizeRows();
      wireModal();
    }).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();