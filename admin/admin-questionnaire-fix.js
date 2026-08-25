(()=>{
  "use strict";

  let activeReservation=null;

  function injectCss(){
    if(document.getElementById("questionnaireFixCss"))return;
    const s=document.createElement("style");
    s.id="questionnaireFixCss";
    s.textContent=`
      .tour-print-modal #tourAddressCorrect{
        background:#fff!important;
        color:#111!important;
        border:2px solid #344054!important;
        opacity:1!important;
        font-weight:800!important;
        min-height:46px!important;
        padding:10px 18px!important;
        border-radius:10px!important;
      }
      .tour-print-modal #tourAddressCorrect:hover{background:#f2f4f7!important}
      .tour-print-modal #tourPrintGenerate{
        opacity:1!important;
        font-weight:800!important;
        min-height:46px!important;
      }
      .tour-print-modal .tour-print-actions{
        display:flex!important;
        flex-wrap:wrap!important;
        gap:10px!important;
        align-items:stretch!important;
      }
      /* 重複している返信・説明系ボタンはアンケート画面から除去 */
      .tour-print-modal .tour-reply-inside{display:none!important}
      @media(max-width:700px){
        .tour-print-modal .tour-print-actions{display:grid!important;grid-template-columns:1fr!important}
        .tour-print-modal .tour-print-actions button{width:100%!important;margin:0!important}
      }
    `;
    document.head.appendChild(s);
  }

  function orderedReservations(d){
    const reservations=Array.isArray(d?.reservations)?d.reservations:[];
    const shifts=Array.isArray(d?.shifts)?d.shifts:[];
    const staffCodes=[...new Set([...shifts.map(x=>x.staff_code),...reservations.map(x=>x.staff_code)].filter(Boolean))];
    const ordered=[];
    staffCodes.forEach(code=>reservations.filter(x=>x.staff_code===code).sort((a,b)=>String(a.start_time||"").localeCompare(String(b.start_time||""))).forEach(r=>ordered.push(r)));
    return ordered;
  }

  function captureReservationFromButton(button){
    const row=button?.closest(".staff-reservation-row");
    if(!row)return;
    const rows=[...document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")];
    const index=rows.indexOf(row);
    const data=window.state?.staffSchedule || (typeof state!=="undefined" ? state.staffSchedule : null);
    activeReservation=orderedReservations(data||{})[index]||null;
  }

  async function saveAddress(){
    if(!activeReservation){alert("対象の見学予約を特定できませんでした。画面を更新してもう一度お試しください。");return;}
    const current=String(activeReservation.customer_address||activeReservation.address||"").trim();
    const next=window.prompt("訂正後の住所を入力してください。\n番地・建物名・部屋番号まで入力できます。",current);
    if(next===null)return;
    const value=String(next).trim();
    if(!value){alert("住所を入力してください。");return;}
    if(typeof apiPost!=="function"){alert("管理画面APIを利用できません。");return;}
    try{
      await apiPost({action:"updateReservation",reservation_id:activeReservation.reservation_id,customer_address:value,address:value});
      activeReservation.customer_address=value;
      activeReservation.address=value;
      alert("住所を訂正しました。訂正後の住所でPDFを作成できます。");
    }catch(e){alert(e.message||"住所の訂正に失敗しました。");}
  }

  function cleanRedundantUi(modal){
    /* 以前追加した返信ボタンは不要 */
    modal.querySelectorAll(".tour-reply-inside").forEach(x=>x.remove());

    /* タイトル下などに重複表示される『PDFを作成して閲覧・印刷』案内文だけを削除。
       実際の作成ボタン #tourPrintGenerate は残す。 */
    [...modal.querySelectorAll("p,small,div,span")].forEach(el=>{
      if(el.id==="tourPrintGenerate" || el.closest("button"))return;
      const t=String(el.textContent||"").replace(/\s+/g," ").trim();
      if((t==="PDFを作成して閲覧・印刷" || t==="店内見学アンケート PDFを作成して閲覧・印刷") && el.children.length===0){
        el.remove();
      }
    });
  }

  function enhancePrintModal(){
    injectCss();
    const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');
    if(!modal)return;
    cleanRedundantUi(modal);
    const actions=modal.querySelector(".tour-print-actions");
    const generate=modal.querySelector("#tourPrintGenerate");
    if(!actions||!generate)return;

    if(!modal.querySelector("#tourAddressCorrect")){
      const addressBtn=document.createElement("button");
      addressBtn.type="button";
      addressBtn.id="tourAddressCorrect";
      addressBtn.textContent="住所訂正";
      addressBtn.onclick=saveAddress;
      actions.insertBefore(addressBtn,generate);
    }

    if(!generate.dataset.autoCloseFixed){
      generate.dataset.autoCloseFixed="1";
      const observer=new MutationObserver(()=>{
        const text=String(generate.textContent||"").trim();
        if(text.includes("PDF作成中")){generate.dataset.wasGenerating="1";return;}
        if(generate.dataset.wasGenerating==="1"){
          const message=modal.querySelector("#tourPrintMessage");
          const msg=String(message?.textContent||"");
          const failed=/失敗|エラー|できません/.test(msg);
          if(!failed){setTimeout(()=>document.querySelector(".tour-print-overlay")?.remove(),100);}
          generate.dataset.wasGenerating="";
        }
      });
      observer.observe(generate,{childList:true,subtree:true,characterData:true});
    }
  }

  function bindButtons(){
    document.querySelectorAll(".tour-print-button").forEach(btn=>{
      if(btn.dataset.questionnaireFixBound)return;
      btn.dataset.questionnaireFixBound="1";
      btn.addEventListener("click",()=>{captureReservationFromButton(btn);setTimeout(enhancePrintModal,0);},{capture:true});
    });
  }

  function boot(){
    injectCss();bindButtons();enhancePrintModal();
    new MutationObserver(()=>{bindButtons();enhancePrintModal();}).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();