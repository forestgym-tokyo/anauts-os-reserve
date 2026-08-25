(()=>{
  "use strict";

  let scheduled=false;

  function ensureStyle(){
    if(document.getElementById("adminUiCalendarLayoutStyle"))return;
    const style=document.createElement("style");
    style.id="adminUiCalendarLayoutStyle";
    style.textContent=`
      .withdrawal-link-actions{
        display:grid!important;
        grid-template-columns:repeat(2,112px)!important;
        gap:6px!important;
        align-items:center!important;
        justify-content:end!important;
        flex-wrap:nowrap!important;
        min-width:230px;
      }
      .withdrawal-link-actions>button{
        box-sizing:border-box!important;
        width:112px!important;
        min-width:112px!important;
        height:34px!important;
        min-height:34px!important;
        padding:7px 10px!important;
        border-radius:8px!important;
        font-size:12px!important;
        font-weight:700!important;
        line-height:18px!important;
        white-space:nowrap!important;
        margin:0!important;
      }
      .withdrawal-link-actions .withdrawal-form-shortcut{
        border:1px solid #e15b64!important;
        background:#2a1618!important;
        color:#ff9ca3!important;
      }
      @media(max-width:700px){
        .withdrawal-link-actions{
          width:100%!important;
          min-width:0!important;
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
        }
        .withdrawal-link-actions>button{
          width:100%!important;
          min-width:0!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeWeek(week){
    const labels=["日","月","火","水","木","金","土"];
    const cells=Array.from(week.children).slice(0,7);
    if(cells.length!==7)return;
    cells.forEach((cell,i)=>{
      if(cell.textContent!==labels[i])cell.textContent=labels[i];
    });
  }

  function normalizeGrid(grid,dayClass,dateAttr){
    const real=Array.from(grid.querySelectorAll(`.${dayClass}[${dateAttr}]`));
    if(!real.length)return;

    const firstDate=real[0].getAttribute(dateAttr)||"";
    const parts=firstDate.split("-").map(Number);
    if(parts.length!==3||parts.some(Number.isNaN))return;

    const lead=new Date(parts[0],parts[1]-1,parts[2]).getDay();
    const total=Math.ceil((lead+real.length)/7)*7;
    const signature=`${firstDate}:${real.length}:${lead}:${total}`;

    if(grid.dataset.sundayCalendar===signature && grid.children.length===total)return;

    const frag=document.createDocumentFragment();
    for(let i=0;i<lead;i++){
      const blank=document.createElement("div");
      blank.className=`${dayClass} out`;
      frag.appendChild(blank);
    }

    real.forEach(cell=>frag.appendChild(cell));

    for(let i=lead+real.length;i<total;i++){
      const blank=document.createElement("div");
      blank.className=`${dayClass} out`;
      frag.appendChild(blank);
    }

    grid.replaceChildren(frag);
    grid.dataset.sundayCalendar=signature;
  }

  function normalizeAll(){
    ensureStyle();

    document.querySelectorAll(".mcal-week").forEach(normalizeWeek);
    document.querySelectorAll(".ecal-week").forEach(normalizeWeek);

    document.querySelectorAll(".mcal-grid").forEach(grid=>{
      if(grid.querySelector("[data-mydate]"))normalizeGrid(grid,"mcal-day","data-mydate");
      else if(grid.querySelector("[data-mdate]"))normalizeGrid(grid,"mcal-day","data-mdate");
    });

    document.querySelectorAll(".ecal-grid").forEach(grid=>{
      if(grid.querySelector("[data-ec-date]"))normalizeGrid(grid,"ecal-day","data-ec-date");
    });
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      normalizeAll();
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);
  else schedule();

  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
