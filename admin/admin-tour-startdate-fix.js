(()=>{
  "use strict";

  function ymd(d){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function label(d){
    const w=["日","月","火","水","木","金","土"][d.getDay()];
    return `${d.getMonth()+1}月${d.getDate()}日（${w}）`;
  }

  function fixStartDate(){
    const old=document.getElementById("tourEnrollStart");
    if(!old || old.tagName==="SELECT" || old.dataset.selectFixed==="1")return;

    const now=new Date();
    now.setHours(0,0,0,0);
    const end=new Date(now.getFullYear(),now.getMonth()+1,0);

    const select=document.createElement("select");
    select.id="tourEnrollStart";
    select.required=true;
    select.dataset.selectFixed="1";
    select.style.width="100%";
    select.style.minHeight="44px";
    select.style.padding="9px 11px";
    select.style.border="1px solid #d0d5dd";
    select.style.borderRadius="10px";
    select.style.background="#fff";
    select.style.color="#111";
    select.style.font="inherit";

    for(let d=new Date(now);d<=end;d.setDate(d.getDate()+1)){
      const option=document.createElement("option");
      option.value=ymd(d);
      option.textContent=label(d);
      select.appendChild(option);
    }

    old.replaceWith(select);
  }

  function boot(){
    fixStartDate();
    new MutationObserver(fixStartDate).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
})();