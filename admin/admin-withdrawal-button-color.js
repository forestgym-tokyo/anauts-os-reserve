(()=>{
  "use strict";

  if(document.getElementById("withdrawalButtonColorFix"))return;

  const style=document.createElement("style");
  style.id="withdrawalButtonColorFix";
  style.textContent=`
    /* アンケート：明るいブルー */
    #staffScheduleBoard .tour-print-button{
      background:#38bdf8!important;
      border:1px solid #7dd3fc!important;
      color:#062033!important;
      box-shadow:0 4px 12px rgba(56,189,248,.22)!important;
      font-weight:900!important;
    }
    #staffScheduleBoard .tour-print-button:hover{
      background:#67d3fa!important;
      border-color:#bae6fd!important;
      color:#041822!important;
    }

    /* 変更・キャンセル：明るいアンバー */
    #staffScheduleBoard .reservation-manage-button:not(.withdrawal-form-shortcut){
      background:#fbbf24!important;
      border:1px solid #fcd34d!important;
      color:#201500!important;
      box-shadow:0 4px 12px rgba(251,191,36,.20)!important;
      font-weight:900!important;
    }
    #staffScheduleBoard .reservation-manage-button:not(.withdrawal-form-shortcut):hover{
      background:#fcd34d!important;
      border-color:#fde68a!important;
      color:#171000!important;
    }

    /* 退会申請：明るいレッド */
    #staffScheduleBoard .withdrawal-link-actions > .withdrawal-form-shortcut{
      background:#ff4d5f!important;
      border:1px solid #ff7a88!important;
      color:#ffffff!important;
      box-shadow:0 4px 12px rgba(255,77,95,.24)!important;
      font-weight:900!important;
    }
    #staffScheduleBoard .withdrawal-link-actions > .withdrawal-form-shortcut:hover{
      background:#ff6676!important;
      border-color:#ff9aa4!important;
      color:#ffffff!important;
    }

    #staffScheduleBoard .tour-print-button:focus-visible,
    #staffScheduleBoard .reservation-manage-button:focus-visible,
    #staffScheduleBoard .withdrawal-form-shortcut:focus-visible{
      outline:3px solid rgba(255,255,255,.92)!important;
      outline-offset:2px!important;
    }

    /* イベント詳細も同じ色調に揃える */
    #ecDetail [data-ec-res]{
      background:#fbbf24!important;
      border-color:#fcd34d!important;
      color:#201500!important;
      font-weight:900!important;
    }
    #ecDetail .withdrawal-form-shortcut{
      background:#ff4d5f!important;
      border-color:#ff7a88!important;
      color:#ffffff!important;
      font-weight:900!important;
    }
  `;
  document.head.appendChild(style);
})();
