(()=>{
  "use strict";

  if(window.__ANAUTS_SCHEDULE_REASSIGN_FIX__)return;
  window.__ANAUTS_SCHEDULE_REASSIGN_FIX__=true;

  const q=s=>document.querySelector(s);
  const qa=s=>Array.from(document.querySelectorAll(s));

  function ensureStyle(){
    if(q("#scheduleActionFixStyle"))return;
    const style=document.createElement("style");
    style.id="scheduleActionFixStyle";
    style.textContent=`
      @media(min-width:761px){
        #staffScheduleBoard .staff-reservation-row{
          grid-template-columns:105px minmax(180px,1.1fr) minmax(170px,1fr) 110px minmax(238px,auto)!important;
        }
        #staffScheduleBoard .staff-reservation-row>.reservation-manage-button{
          grid-column:5!important;
          grid-row:1!important;
          justify-self:end!important;
          box-sizing:border-box!important;
          width:112px!important;
          min-width:112px!important;
          height:38px!important;
          min-height:38px!important;
          margin:0!important;
          padding:7px 10px!important;
        }
        #staffScheduleBoard .staff-reservation-row>.withdrawal-link-actions{
          grid-column:5!important;
          grid-row:1!important;
          justify-self:end!important;
          align-self:center!important;
          display:grid!important;
          grid-template-columns:112px 112px!important;
          gap:8px!important;
          min-width:232px!important;
          width:232px!important;
          margin:0!important;
        }
        #staffScheduleBoard .withdrawal-link-actions>button{
          box-sizing:border-box!important;
          width:112px!important;
          min-width:112px!important;
          height:38px!important;
          min-height:38px!important;
          margin:0!important;
          padding:7px 10px!important;
          border-radius:8px!important;
          font-size:12px!important;
          font-weight:700!important;
          line-height:22px!important;
          white-space:nowrap!important;
        }
      }
      @media(max-width:760px){
        #staffScheduleBoard .staff-reservation-row>.reservation-manage-button,
        #staffScheduleBoard .staff-reservation-row>.withdrawal-link-actions{
          grid-column:1/-1!important;
          width:100%!important;
          min-width:0!important;
          margin-top:4px!important;
        }
        #staffScheduleBoard .staff-reservation-row>.withdrawal-link-actions{
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          gap:8px!important;
        }
        #staffScheduleBoard .withdrawal-link-actions>button{
          width:100%!important;
          min-width:0!important;
          min-height:42px!important;
          margin:0!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeActionRows(){
    qa("#staffScheduleBoard .staff-reservation-row").forEach(row=>{
      const wrapper=row.querySelector(":scope > .withdrawal-link-actions");
      if(!wrapper)return;
      const manage=wrapper.querySelector(".reservation-manage-button:not(.withdrawal-form-shortcut)");
      const withdrawal=wrapper.querySelector(".withdrawal-form-shortcut");
      if(manage)manage.removeAttribute("style");
      if(withdrawal){
        withdrawal.removeAttribute("style");
        withdrawal.classList.remove("reservation-manage-button");
      }
    });
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"){
      setTimeout(boot,100);
      return;
    }
    ensureStyle();
    normalizeActionRows();

    const observer=new MutationObserver(()=>normalizeActionRows());
    observer.observe(document.documentElement,{childList:true,subtree:true});

  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();
