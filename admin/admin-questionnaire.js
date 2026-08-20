/**
 * A-nauts OS Reserve
 * 店内見学 UI v32.1
 *
 * TOUR予約行に「アンケート閲覧・印刷」を追加。
 * ラジオボタン:
 * - 全部
 * - 住所のみ
 * - すべて空欄
 */
(function(){
  "use strict";

  const PRINT_ACTION = "generateTourQuestionnairePdf";
  const REPLY_ACTION = "sendTourCustomerReply";

  function serviceCodeOf_(r){
    return String(r?.service_code||"").toUpperCase();
  }

  function customerTypeOf_(r){
    return String(r?.customer_type||"").toUpperCase();
  }

  function isTour_(r){
    return serviceCodeOf_(r)==="TOUR";
  }

  function isCounselVisitor_(r){
    if(serviceCodeOf_(r)!=="COUNSEL")return false;

    const type=customerTypeOf_(r);
    const memberNo=String(r?.member_no||"").trim();

    if(type==="MEMBER")return false;
    if(type==="VISITOR")return true;

    // 既存予約でcustomer_typeが空の場合の互換
    return !memberNo;
  }

  function isQuestionnaireTarget_(r){
    return isTour_(r)||isCounselVisitor_(r);
  }

  function escapeHtml(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function injectStyles(){
    if(document.getElementById("tourPrintStyles"))return;
    const style=document.createElement("style");
    style.id="tourPrintStyles";
    style.textContent=`
      .tour-print-button{margin-left:10px;white-space:nowrap}
      .tour-print-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:18px}
      .tour-print-modal{width:min(520px,100%);background:#fff;color:#111;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden}
      .tour-print-head{padding:20px 22px 14px;border-bottom:1px solid #e5e7eb}
      .tour-print-head h2{margin:0 0 6px;font-size:20px}
      .tour-print-head p{margin:0;color:#667085;font-size:13px;line-height:1.5}
      .tour-print-body{padding:18px 22px}
      .tour-print-reservation{background:#f6f7f8;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px;line-height:1.7}
      .tour-print-options{display:grid;gap:10px}
      .tour-print-option{display:flex;align-items:flex-start;gap:11px;padding:13px;border:1px solid #d9dde3;border-radius:12px;cursor:pointer}
      .tour-print-option:has(input:checked){border-color:#111;background:#f4f7f5;box-shadow:0 0 0 1px #111 inset}
      .tour-print-option input{margin-top:3px;transform:scale(1.18)}
      .tour-print-option strong{display:block;font-size:14px;margin-bottom:3px}
      .tour-print-option small{display:block;color:#667085;line-height:1.45}
      .tour-print-duplex{margin-top:16px;padding:12px 14px;border-radius:10px;background:#fff7e6;border:1px solid #f2d28b;font-size:13px;line-height:1.55;font-weight:700}
      .tour-print-message{min-height:20px;margin-top:10px;color:#b42318;font-size:13px}
      .tour-print-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 22px 20px}
      .tour-print-actions button{min-height:42px}
      .tour-info-box{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e3e8ef;font-size:13px;line-height:1.6}
      .tour-info-box strong{display:block;margin-bottom:3px;font-size:12px;color:#475467}
      .tour-row-actions{display:inline-flex;gap:7px;align-items:center;margin-left:10px;flex-wrap:wrap}
      .tour-mail-button{width:38px;height:38px;min-width:38px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;line-height:1;padding:0}
      .tour-question-inline{width:100%;margin-top:8px;padding:9px 11px;border-left:3px solid #98a2b3;background:#f8fafc;border-radius:0 8px 8px 0;font-size:12px;line-height:1.55;color:#344054}
      .tour-question-inline strong{color:#101828}
      .tour-inquiry-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:12px}
      .tour-status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:800}
      .tour-status-pending{background:#fff1f2;color:#b42318;border:1px solid #fecdd3}
      .tour-status-done{background:#ecfdf3;color:#067647;border:1px solid #abefc6}
      .tour-status-handler{color:#475467}
      .tour-status-button{min-height:32px;padding:5px 10px;font-size:12px}
      .tour-reply-textarea{width:100%;min-height:170px;resize:vertical;padding:12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit;line-height:1.65}
      .tour-reply-subject{width:100%;padding:11px 12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit}
      .tour-reply-label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700}
      .tour-save-result{margin-top:12px;padding:12px 14px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:13px;line-height:1.65}
      .tour-save-result strong{display:block;margin-bottom:4px}
      .tour-save-result a{display:inline-block;margin-right:12px;font-weight:700;text-decoration:underline}
      @media(max-width:680px){
        .tour-print-button{margin-left:0}
        .tour-row-actions{margin-left:0;margin-top:8px;width:100%}
        .tour-row-actions .tour-print-button{flex:1}
        .tour-question-inline{margin-top:8px}
        .tour-print-modal{border-radius:14px}
        .tour-print-actions{flex-direction:column-reverse}
        .tour-print-actions button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function orderedReservations(d){
    const reservations=Array.isArray(d?.reservations)?d.reservations:[];
    const shifts=Array.isArray(d?.shifts)?d.shifts:[];
    const staffCodes=[...new Set([
      ...shifts.map(x=>x.staff_code),
      ...reservations.map(x=>x.staff_code)
    ].filter(Boolean))];
    const ordered=[];
    staffCodes.forEach(code=>{
      reservations
        .filter(x=>x.staff_code===code)
        .sort((a,b)=>String(a.start_time||"").localeCompare(String(b.start_time||"")))
        .forEach(r=>ordered.push(r));
    });
    return ordered;
  }


  function closeModal(){
    document.querySelector(".tour-print-overlay")?.remove();
  }

  function openPrintModal(r){
    closeModal();
    injectStyles();

    const overlay=document.createElement("div");
    overlay.className="tour-print-overlay";
    overlay.innerHTML=`
      <div class="tour-print-modal" role="dialog" aria-modal="true" aria-label="アンケート閲覧・印刷">
        <div class="tour-print-head">
          <h2>${isCounselVisitor_(r) ? "ダイエット無料カウンセリング アンケート" : "店内見学アンケート"}</h2>
          <p>転記内容を選択してPDFを作成します。</p>
        </div>
        <div class="tour-print-body">
          <div class="tour-print-reservation">
            <strong>${escapeHtml(r.customer_name||(isCounselVisitor_(r) ? "カウンセリング予約者" : "見学者"))}</strong><br>
            ${escapeHtml(r.date||r.reservation_date||"")} ${escapeHtml(r.start_time||"")}〜${escapeHtml(r.end_time||"")}
          </div>
          <div class="tour-print-options">
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="FULL" checked>
              <span><strong>全部</strong><small>氏名・郵便番号・住所・電話番号・メールアドレス・予約日時を転記</small></span>
            </label>
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="ADDRESS_ONLY">
              <span><strong>住所のみ</strong><small>郵便番号・住所・予約日時のみ転記。氏名・電話番号・メールは空欄</small></span>
            </label>
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="BLANK">
              <span><strong>すべて空欄</strong><small>予約情報を一切転記せず、原本のまま出力</small></span>
            </label>
          </div>
          <div class="tour-print-duplex">印刷設定：A4／両面印刷／長辺とじ<br>PDFは表面・裏面の2ページで生成されます。</div>
          <div class="tour-print-message" id="tourPrintMessage"></div>
        </div>
        <div class="tour-print-actions">
          <button type="button" class="ghost-button" id="tourPrintCancel">閉じる</button>
          <button type="button" class="primary-button" id="tourPrintGenerate">PDFを作成して閲覧・印刷</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal()});
    overlay.querySelector("#tourPrintCancel").onclick=closeModal;

    overlay.querySelector("#tourPrintGenerate").onclick=async()=>{
      const btn=overlay.querySelector("#tourPrintGenerate");
      const msg=overlay.querySelector("#tourPrintMessage");
      const mode=overlay.querySelector('input[name="tourPrintMode"]:checked')?.value||"FULL";

      // 先に空タブを開き、非同期処理後もポップアップブロックされないようにする。
      const preview=window.open("about:blank","_blank");
      if(preview){
        preview.document.write('<p style="font-family:sans-serif;padding:24px">PDFを作成しています…</p>');
      }

      btn.disabled=true;
      btn.textContent="PDF作成中…";
      msg.textContent="";

      try{
        if(typeof apiGet!=="function")throw new Error("管理画面APIを利用できません。");
        const j=await apiGet(PRINT_ACTION,{
          reservation_id:r.reservation_id,
          print_mode:mode
        });
        const data=j.data||{};
        const fileUrl=String(data.file_url||"").trim();
        if(!fileUrl)throw new Error("保存済みPDFのURLを取得できませんでした。");

        if(preview){
          preview.location.replace(fileUrl);
        }else{
          window.open(fileUrl,"_blank","noopener");
        }

        const folderUrl=String(data.folder_url||"").trim();
        const driveFolder=String(data.drive_folder||"A-nauts OS Reserve / TourQuestionnaireTemp").trim();

        msg.style.color="#067647";
        msg.innerHTML=
          `<div class="tour-save-result">`+
          `<strong>PDFをGoogle Driveへ保存しました。</strong>`+
          `保存先：${escapeHtml(driveFolder)}<br>`+
          `<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">PDFを開く</a>`+
          (folderUrl
            ? `<a href="${escapeHtml(folderUrl)}" target="_blank" rel="noopener">保存フォルダを開く</a>`
            : ``)+
          `<br>印刷時は「両面・長辺とじ」を選択してください。`+
          `</div>`;
      }catch(err){
        if(preview)preview.close();
        msg.style.color="#b42318";
        msg.textContent=err.message||"PDFの生成に失敗しました。";
      }finally{
        btn.disabled=false;
        btn.textContent="PDFを作成して閲覧・印刷";
      }
    };
  }


  function defaultReplySubject(){
    return "【The Forest Gym 八千代緑が丘店】店内見学について";
  }

  function defaultReplyBody(r){
    const name=String(r?.customer_name||"").trim();
    return `${name ? name+" 様" : "お客様"}\n\nお問い合わせありがとうございます。\n\n\nThe Forest Gym 八千代緑が丘店`;
  }

  function openReplyModal(r){
    closeModal();
    injectStyles();

    const overlay=document.createElement("div");
    overlay.className="tour-print-overlay";
    overlay.innerHTML=`
      <div class="tour-print-modal" role="dialog" aria-modal="true" aria-label="見学者へメール返信">
        <div class="tour-print-head">
          <h2>見学者へメール返信</h2>
          <p>info@theforestgym.com から送信します。</p>
        </div>
        <div class="tour-print-body">
          <div class="tour-print-reservation">
            <strong>${escapeHtml(r.customer_name||"見学者")}</strong><br>
            ${escapeHtml(r.customer_email||"メールアドレス未登録")}
          </div>
          <div class="tour-info-box">
            <strong>見学フォームの質問・ご要望</strong>
            ${escapeHtml(r.note||"なし").replace(/\n/g,"<br>")}
          </div>
          <label class="tour-reply-label" for="tourReplySubject">件名</label>
          <input id="tourReplySubject" class="tour-reply-subject" type="text" value="${escapeHtml(defaultReplySubject())}">
          <label class="tour-reply-label" for="tourReplyBody">本文</label>
          <textarea id="tourReplyBody" class="tour-reply-textarea">${escapeHtml(defaultReplyBody(r))}</textarea>
          <div class="tour-print-message" id="tourReplyMessage"></div>
        </div>
        <div class="tour-print-actions">
          <button type="button" class="ghost-button" id="tourReplyCancel">閉じる</button>
          <button type="button" class="primary-button" id="tourReplySend">送信する</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal()});
    overlay.querySelector("#tourReplyCancel").onclick=closeModal;

    overlay.querySelector("#tourReplySend").onclick=async()=>{
      const btn=overlay.querySelector("#tourReplySend");
      const msg=overlay.querySelector("#tourReplyMessage");
      const subject=overlay.querySelector("#tourReplySubject").value.trim();
      const body=overlay.querySelector("#tourReplyBody").value.trim();

      if(!r.customer_email){
        msg.textContent="見学者のメールアドレスがありません。";
        return;
      }
      if(!subject){
        msg.textContent="件名を入力してください。";
        return;
      }
      if(!body){
        msg.textContent="本文を入力してください。";
        return;
      }

      btn.disabled=true;
      btn.textContent="送信中…";
      msg.style.color="#475467";
      msg.textContent="メールを送信しています…";

      try{
        if(typeof apiPost!=="function")throw new Error("管理画面APIを利用できません。");
        await apiPost({
          action:REPLY_ACTION,
          reservation_id:r.reservation_id,
          subject,
          body,
          handler_code:currentHandler().code,
          handler_name:currentHandler().name,
          handler_email:currentHandler().email
        });
        msg.style.color="#067647";
        msg.textContent="送信完了しました。";
        btn.textContent="送信完了";
        setTimeout(closeModal,900);
      }catch(err){
        msg.style.color="#b42318";
        msg.textContent=err.message||"メール送信に失敗しました。";
        btn.disabled=false;
        btn.textContent="送信する";
      }
    };
  }


  function currentHandler(){
    const u=window.state?.authUser || (typeof state!=="undefined" ? state.authUser : null) || {};
    return {
      code:String(u.staff_code||u.staffCode||u.email||"").trim(),
      name:String(u.display_name||u.staff_name||u.name||u.email||"").trim(),
      email:String(u.email||"").trim()
    };
  }

  async function changeInquiryStatus(r, nextStatus, container){
    const h=currentHandler();
    const btn=container.querySelector(".tour-status-button");
    if(btn){btn.disabled=true;btn.textContent="更新中…";}
    try{
      const j=await apiPost({
        action:"setTourInquiryStatus",
        reservation_id:r.reservation_id,
        inquiry_status:nextStatus,
        handler_code:h.code,
        handler_name:h.name,
        handler_email:h.email
      });
      Object.assign(r,j.data||{});
      renderInquiryStatus(r,container);
    }catch(err){
      alert(err.message||"対応状況の更新に失敗しました。");
      if(btn)btn.disabled=false;
    }
  }

  function renderInquiryStatus(r, container){
    const done=String(r.inquiry_status||"PENDING").toUpperCase()==="DONE";
    const name=String(r.inquiry_handled_by_name||r.inquiry_handled_by||"").trim();
    container.innerHTML=`
      <span class="tour-status-badge ${done?"tour-status-done":"tour-status-pending"}">${done?"対応済":"未済"}</span>
      ${done && name ? `<span class="tour-status-handler">対応者：${escapeHtml(name)}</span>` : ``}
      <button type="button" class="ghost-button tour-status-button">${done?"未済に戻す":"対応済みにする"}</button>
    `;
    container.querySelector(".tour-status-button").onclick=e=>{
      e.preventDefault();e.stopPropagation();
      changeInquiryStatus(r,done?"PENDING":"DONE",container);
    };
  }

  function enhanceStaffSchedule(d){
    injectStyles();
    const ordered=orderedReservations(d);
    const rows=[...document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")];

    rows.forEach((row,i)=>{
      const r=ordered[i];
      if(!r||!isQuestionnaireTarget_(r))return;
      if(row.querySelector(".tour-print-button"))return;

      const actions=document.createElement("span");
      actions.className="tour-row-actions";

      const button=document.createElement("button");
      button.type="button";
      button.className="ghost-button tour-print-button";
      button.textContent="アンケート";
      button.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        openPrintModal(r);
      };

      const mail=document.createElement("button");
      mail.type="button";
      mail.className="ghost-button tour-mail-button";
      mail.textContent="✉";
      mail.title="見学者へメール返信";
      mail.setAttribute("aria-label","見学者へメール返信");
      mail.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        openReplyModal(r);
      };

      actions.appendChild(button);

      if(isTour_(r)){
        actions.appendChild(mail);
      }

      row.appendChild(actions);

      if(isTour_(r)){
        const question=document.createElement("div");
        question.className="tour-question-inline";
        question.innerHTML=
          `<strong>質問・ご要望：</strong> ${escapeHtml(r.note||"なし").replace(/\n/g,"<br>")}`;
        row.appendChild(question);

        const inquiry=document.createElement("div");
        inquiry.className="tour-inquiry-status";
        renderInquiryStatus(r,inquiry);
        row.appendChild(inquiry);
      }
    });
  }

  function boot(){
    injectStyles();
    if(typeof window.renderStaffSchedule!=="function"){
      setTimeout(boot,200);
      return;
    }
    if(window.__questionnaireUiV39Installed)return;
    window.__questionnaireUiV39Installed=true;

    const original=window.renderStaffSchedule;
    window.renderStaffSchedule=function(d){
      const result=original.apply(this,arguments);
      setTimeout(()=>enhanceStaffSchedule(d),0);
      return result;
    };
  }

  boot();
})();
