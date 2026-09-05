(()=>{
  "use strict";

  function injectCss(){
    if(document.getElementById("tourUiPolishCss"))return;
    const style=document.createElement("style");
    style.id="tourUiPolishCss";
    style.textContent=`
      .tour-mail-button{display:none!important}
      .staff-reservation-row .tour-question-inline{display:block!important;width:100%!important;max-width:none!important;box-sizing:border-box!important;grid-column:1 / -1!important;margin:10px 0 0!important;padding:12px 14px!important;cursor:pointer!important}
      .staff-reservation-row .tour-row-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;align-items:center!important;width:100%!important;max-width:none!important;margin:10px 0 0!important;padding:0!important;box-sizing:border-box!important;grid-column:1 / -1!important;clear:both!important}
      .staff-reservation-row .tour-row-actions .tour-print-button,.staff-reservation-row .tour-row-actions .reservation-manage-button,.staff-reservation-row .tour-row-actions .tour-enroll-button{width:100%!important;min-width:0!important;max-width:none!important;height:44px!important;min-height:44px!important;margin:0!important;padding:8px 12px!important;border-radius:10px!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;font-size:13px!important;line-height:1.25!important;font-weight:800!important;white-space:normal!important;overflow-wrap:anywhere!important}
      .staff-reservation-row .tour-row-actions .tour-print-button{background:#38bdf8!important;border-color:#7dd3fc!important;color:#062033!important;box-shadow:0 4px 12px rgba(56,189,248,.28)!important}
      .staff-reservation-row .tour-row-actions .tour-print-button:hover{background:#67d3fa!important;border-color:#bae6fd!important;color:#041822!important}
      .staff-reservation-row .tour-row-actions .reservation-manage-button{background:#fbbf24!important;border-color:#fcd34d!important;color:#201500!important;box-shadow:0 4px 12px rgba(251,191,36,.28)!important}
      .staff-reservation-row .tour-row-actions .reservation-manage-button:hover{background:#fcd34d!important;border-color:#fde68a!important;color:#171000!important}
      .tour-row-actions .reservation-manage-button{order:1!important}.tour-row-actions .tour-print-button{order:2!important}.tour-row-actions .tour-enroll-button{order:3!important}
      @media (min-width:701px) and (max-width:1100px){.staff-reservation-row .tour-row-actions{max-width:none!important;width:100%!important;gap:8px!important}.staff-reservation-row .tour-row-actions .tour-print-button,.staff-reservation-row .tour-row-actions .reservation-manage-button,.staff-reservation-row .tour-row-actions .tour-enroll-button{width:100%!important;min-width:0!important;max-width:none!important;font-size:13px!important;padding:8px 6px!important}}
      @media (max-width:700px){.staff-reservation-row .tour-row-actions{display:grid!important;grid-template-columns:1fr!important;width:100%!important;max-width:none!important;gap:8px!important;margin-top:10px!important}.staff-reservation-row .tour-row-actions .tour-print-button,.staff-reservation-row .tour-row-actions .reservation-manage-button,.staff-reservation-row .tour-row-actions .tour-enroll-button{width:100%!important;min-width:0!important;max-width:none!important;height:46px!important;min-height:46px!important;font-size:14px!important}}
    `;
    document.head.appendChild(style);
  }

  function normalizeRows(){
    document.querySelectorAll("#staffScheduleBoard .staff-reservation-row").forEach(row=>{
      const questionnaire=row.querySelector(".tour-print-button");
      const enroll=row.querySelector(".tour-enroll-button");
      const manage=row.querySelector(".reservation-manage-button");
      if(!questionnaire&&!enroll)return;

      let actions=row.querySelector(".tour-row-actions");
      if(!actions){
        actions=document.createElement("div");
        actions.className="tour-row-actions";
        row.appendChild(actions);
      }
      if(manage&&manage.parentElement!==actions)actions.appendChild(manage);
      if(questionnaire&&questionnaire.parentElement!==actions)actions.appendChild(questionnaire);
      if(enroll&&enroll.parentElement!==actions)actions.appendChild(enroll);
    });
  }

  function scheduleNormalize(){
    window.setTimeout(normalizeRows,0);
  }

  function boot(){
    injectCss();
    normalizeRows();
    if(typeof window.renderStaffSchedule!=="function"||window.renderStaffSchedule.__tourUiPolishHooked)return;
    const original=window.renderStaffSchedule;
    const wrapped=function(){
      const result=original.apply(this,arguments);
      scheduleNormalize();
      return result;
    };
    wrapped.__tourUiPolishHooked=true;
    window.renderStaffSchedule=wrapped;
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
