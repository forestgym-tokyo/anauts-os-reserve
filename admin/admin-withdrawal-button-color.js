(()=>{
  "use strict";

  if(document.getElementById("withdrawalButtonColorFix"))return;

  const style=document.createElement("style");
  style.id="withdrawalButtonColorFix";
  style.textContent=`
    #staffScheduleBoard .withdrawal-link-actions > .withdrawal-form-shortcut{
      background:#9f1d20!important;
      border:1px solid #e05858!important;
      color:#ffffff!important;
      box-shadow:0 0 0 1px rgba(224,88,88,.10)!important;
    }
    #staffScheduleBoard .withdrawal-link-actions > .withdrawal-form-shortcut:hover{
      background:#b4232a!important;
      border-color:#f06a6a!important;
      color:#ffffff!important;
    }
    #staffScheduleBoard .withdrawal-link-actions > .withdrawal-form-shortcut:focus-visible{
      outline:2px solid #ff8a8a!important;
      outline-offset:2px!important;
    }
  `;
  document.head.appendChild(style);
})();
