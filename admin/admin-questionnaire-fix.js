(()=>{
  "use strict";

  let activeReservation=null;

  function injectCss(){
    if(document.getElementById("questionnaireFixCss"))return;
    const s=document.createElement("style");
    s.id="questionnaireFixCss";
    s.textContent=`
      .tour-print-modal{position:relative!important;max-height:calc(100vh - 24px)!important;overflow:auto!important}
      .tour-print-modal #tourAddressCorrect{background:#fff!important;color:#111!important;border:2px solid #344054!important;opacity:1!important;font-weight:800!important;min-height:46px!important;padding:10px 18px!important;border-radius:10px!important}
      .tour-print-modal #tourAddressCorrect:hover{background:#f2f4f7!important}
      .tour-print-modal #tourPrintGenerate{opacity:1!important;font-weight:800!important;min-height:46px!important}
      .tour-print-modal .tour-print-actions{display:flex!important;flex-wrap:wrap!important;gap:10px!important;align-items:stretch!important}
      .tour-print-modal #tourPrintCancel{display:none!important}
      .tour-modal-x{position:absolute!important;top:10px!important;right:12px!important;z-index:5!important;width:38px!important;height:38px!important;min-width:38px!important;border:0!important;border-radius:50%!important;background:#f2f4f7!important;color:#111!important;font-size:27px!important;font-weight:400!important;line-height:36px!important;padding:0!important;cursor:pointer!important}
      .tour-modal-x:hover{background:#e4e7ec!important}
      .tour-address-editor{margin-top:12px;padding:14px;border:1px solid #d0d5dd;border-radius:12px;background:#f8fafc}
      .tour-address-editor label{display:block;font-size:12px;font-weight:800;margin:0 0 6px;color:#344054}
      .tour-address-editor textarea{box-sizing:border-box;width:100%;min-height:88px;padding:10px 12px;border:1px solid #98a2b3;border-radius:8px;background:#fff;color:#111;font:inherit;line-height:1.5}
      .tour-address-editor .tour-address-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
      .tour-address-note{margin-top:8px;font-size:12px;font-weight:700;color:#067647}
      .tour-print-modal .tour-reply-inside{display:none!important}
      @media(max-width:700px){.tour-print-overlay{padding:8px!important;align-items:flex-start!important}.tour-print-modal{margin-top:6px!important;max-height:calc(100vh - 20px)!important}.tour-print-modal .tour-print-actions{display:grid!important;grid-template-columns:1fr!important}.tour-print-modal .tour-print-actions button{width:100%!important;margin:0!important}.tour-modal-x{position:sticky!important;float:right!important;top:8px!important;margin:4px 4px -42px 0!important}}
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

  function openAddressEditor(modal){
    if(!activeReservation)return;
    let editor=modal.querySelector("#tourAddressEditor");
    if(editor){editor.querySelector("textarea")?.focus();return;}
    const current=String(activeReservation.customer_address||activeReservation.address||"").trim();
    editor=document.createElement("div");
    editor.id="tourAddressEditor";
    editor.className="tour-address-editor";
    editor.innerHTML='<label for="tourCorrectedAddress">PDFに記載する住所</label><textarea id="tourCorrectedAddress"></textarea><div class="tour-address-actions"><button type="button" class="ghost-button" id="tourAddressCancel">取消</button><button type="button" class="primary-button" id="tourAddressApply">PDFへ反映</button></div><div class="tour-address-note" id="tourAddressNote"></div>';
    editor.querySelector("textarea").value=current;
    const body=modal.querySelector(".tour-print-body");
    body?.appendChild(editor);
    editor.querySelector("#tourAddressCancel").onclick=()=>editor.remove();
    editor.querySelector("#tourAddressApply").onclick=()=>{
      const value=String(editor.querySelector("textarea").value||"").trim();
      if(!value){editor.querySelector("#tourAddressNote").style.color="#b42318";editor.querySelector("#tourAddressNote").textContent="住所を入力してください。";return;}
      activeReservation.customer_address=value;
      activeReservation.address=value;
      modal.dataset.correctedAddress=value;
      editor.querySelector("#tourAddressNote").style.color="#067647";
      editor.querySelector("#tourAddressNote").textContent="訂正住所をPDF用に反映しました。";
    };
    editor.querySelector("textarea").focus();
  }

  function cleanRedundantUi(modal){
    modal.querySelectorAll(".tour-reply-inside").forEach(x=>x.remove());
  }

  function enhancePrintModal(){
    injectCss();
    const modal=document.querySelector('.tour-print-modal[aria-label="アンケート閲覧・印刷"]');
    if(!modal)return;
    cleanRedundantUi(modal);

    if(!modal.querySelector(".tour-modal-x")){
      const x=document.createElement("button");x.type="button";x.className="tour-modal-x";x.setAttribute("aria-label","閉じる");x.textContent="×";x.onclick=()=>modal.closest(".tour-print-overlay")?.remove();modal.prepend(x);
    }

    const actions=modal.querySelector(".tour-print-actions");
    const generate=modal.querySelector("#tourPrintGenerate");
    if(!actions||!generate)return;

    if(!modal.querySelector("#tourAddressCorrect")){
      const addressBtn=document.createElement("button");addressBtn.type="button";addressBtn.id="tourAddressCorrect";addressBtn.textContent="住所訂正";addressBtn.onclick=()=>openAddressEditor(modal);actions.insertBefore(addressBtn,generate);
    }

    /* PDF APIへ訂正住所も渡す。GAS側が対応済みならその住所が使われる。 */
    if(!generate.dataset.addressOverrideBound){
      generate.dataset.addressOverrideBound="1";
      generate.addEventListener("click",()=>{
        const value=String(modal.dataset.correctedAddress||"").trim();
        if(value && activeReservation){
          activeReservation.customer_address=value;
          activeReservation.address=value;
        }
      },{capture:true});
    }

    if(!generate.dataset.autoCloseFixed){
      generate.dataset.autoCloseFixed="1";
      const observer=new MutationObserver(()=>{
        const text=String(generate.textContent||"").trim();
        if(text.includes("PDF作成中")){generate.dataset.wasGenerating="1";return;}
        if(generate.dataset.wasGenerating==="1"){
          const msg=String(modal.querySelector("#tourPrintMessage")?.textContent||"");
          if(!/失敗|エラー|できません/.test(msg))setTimeout(()=>modal.closest(".tour-print-overlay")?.remove(),100);
          generate.dataset.wasGenerating="";
        }
      });
      observer.observe(generate,{childList:true,subtree:true,characterData:true});
    }
  }

  function bindButtons(){document.querySelectorAll(".tour-print-button").forEach(btn=>{if(btn.dataset.questionnaireFixBound)return;btn.dataset.questionnaireFixBound="1";btn.addEventListener("click",()=>{captureReservationFromButton(btn);setTimeout(enhancePrintModal,0);},{capture:true});});}
  function boot(){injectCss();bindButtons();enhancePrintModal();new MutationObserver(()=>{bindButtons();enhancePrintModal();}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();