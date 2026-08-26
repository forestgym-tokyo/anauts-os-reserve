(()=>{
  "use strict";

  function paintButton(el,bg,border,color,shadow){
    if(!el)return;
    el.style.setProperty("background",bg,"important");
    el.style.setProperty("background-color",bg,"important");
    el.style.setProperty("border-color",border,"important");
    el.style.setProperty("color",color,"important");
    el.style.setProperty("box-shadow",shadow,"important");
    el.style.setProperty("font-weight","900","important");
    el.style.setProperty("opacity","1","important");
    el.style.setProperty("filter","none","important");
  }

  function repaint(){
    document.querySelectorAll("#staffScheduleBoard .tour-print-button").forEach(el=>
      paintButton(el,"#38bdf8","#7dd3fc","#062033","0 4px 12px rgba(56,189,248,.28)")
    );

    document.querySelectorAll("#staffScheduleBoard .reservation-manage-button:not(.withdrawal-form-shortcut)").forEach(el=>
      paintButton(el,"#fbbf24","#fcd34d","#201500","0 4px 12px rgba(251,191,36,.28)")
    );

    document.querySelectorAll("#staffScheduleBoard .withdrawal-form-shortcut").forEach(el=>
      paintButton(el,"#ff4d5f","#ff7a88","#ffffff","0 4px 12px rgba(255,77,95,.32)")
    );

    document.querySelectorAll("#ecDetail [data-ec-res]").forEach(el=>
      paintButton(el,"#fbbf24","#fcd34d","#201500","0 4px 12px rgba(251,191,36,.28)")
    );

    document.querySelectorAll("#ecDetail .withdrawal-form-shortcut").forEach(el=>
      paintButton(el,"#ff4d5f","#ff7a88","#ffffff","0 4px 12px rgba(255,77,95,.32)")
    );
  }

  function ensureStyle(){
    if(document.getElementById("withdrawalButtonColorFix"))return;
    const style=document.createElement("style");
    style.id="withdrawalButtonColorFix";
    style.textContent=`
      #staffScheduleBoard .tour-print-button:hover{background:#67d3fa!important;border-color:#bae6fd!important;color:#041822!important}
      #staffScheduleBoard .reservation-manage-button:not(.withdrawal-form-shortcut):hover{background:#fcd34d!important;border-color:#fde68a!important;color:#171000!important}
      #staffScheduleBoard .withdrawal-form-shortcut:hover{background:#ff6676!important;border-color:#ff9aa4!important;color:#fff!important}
      #staffScheduleBoard .tour-print-button:focus-visible,
      #staffScheduleBoard .reservation-manage-button:focus-visible,
      #staffScheduleBoard .withdrawal-form-shortcut:focus-visible{outline:3px solid rgba(255,255,255,.92)!important;outline-offset:2px!important}
    `;
    document.head.appendChild(style);
  }

  function boot(){
    ensureStyle();
    repaint();
    const observer=new MutationObserver(()=>repaint());
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","disabled"]});
    window.addEventListener("focus",repaint);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)repaint();});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
