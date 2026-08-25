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

  function serviceCodeOf_(r){ return String(r?.service_code||"").toUpperCase(); }
  function customerTypeOf_(r){ return String(r?.customer_type||"").toUpperCase(); }
  function isTour_(r){ return serviceCodeOf_(r)==="TOUR"; }
  function isCounselVisitor_(r){
    if(serviceCodeOf_(r)!=="COUNSEL")return false;
    const type=customerTypeOf_(r), memberNo=String(r?.member_no||"").trim();
    if(type==="MEMBER")return false;
    if(type==="VISITOR")return true;
    return !memberNo;
  }
  function isQuestionnaireTarget_(r){ return isTour_(r)||isCounselVisitor_(r); }
  function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}

  function injectStyles(){
    if(document.getElementById("tourPrintStyles"))return;
    const style=document.createElement("style"); style.id="tourPrintStyles";
    style.textContent=`.tour-print-button{margin-left:10px;white-space:nowrap}.tour-print-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:18px}.tour-print-modal{width:min(520px,100%);background:#fff;color:#111;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden}.tour-print-head{padding:20px 22px 14px;border-bottom:1px solid #e5e7eb}.tour-print-head h2{margin:0 0 6px;font-size:20px}.tour-print-head p{margin:0;color:#667085;font-size:13px;line-height:1.5}.tour-print-body{padding:18px 22px}.tour-print-reservation{background:#f6f7f8;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px;line-height:1.7}.tour-print-options{display:grid;gap:10px}.tour-print-option{display:flex;align-items:flex-start;gap:11px;padding:13px;border:1px solid #d9dde3;border-radius:12px;cursor:pointer}.tour-print-option:has(input:checked){border-color:#111;background:#f4f7f5;box-shadow:0 0 0 1px #111 inset}.tour-print-option input{margin-top:3px;transform:scale(1.18)}.tour-print-option strong{display:block;font-size:14px;margin-bottom:3px}.tour-print-option small{display:block;color:#667085;line-height:1.45}.tour-print-duplex{margin-top:16px;padding:12px 14px;border-radius:10px;background:#fff7e6;border:1px solid #f2d28b;font-size:13px;line-height:1.55;font-weight:700}.tour-print-message{min-height:20px;margin-top:10px;color:#b42318;font-size:13px}.tour-print-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 22px 20px}.tour-print-actions button{min-height:42px}.tour-info-box{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e3e8ef;font-size:13px;line-height:1.6}.tour-info-box strong{display:block;margin-bottom:3px;font-size:12px;color:#475467}.tour-row-actions{display:inline-flex;gap:7px;align-items:center;margin-left:10px;flex-wrap:wrap}.tour-mail-button{width:38px;height:38px;min-width:38px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;line-height:1;padding:0}.tour-question-inline{width:100%;margin-top:8px;padding:9px 11px;border-left:3px solid #98a2b3;background:#f8fafc;border-radius:0 8px 8px 0;font-size:12px;line-height:1.55;color:#344054}.tour-question-inline strong{color:#101828}.tour-inquiry-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:12px}.tour-status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:800}.tour-status-pending{background:#fff1f2;color:#b42318;border:1px solid #fecdd3}.tour-status-done{background:#ecfdf3;color:#067647;border:1px solid #abefc6}.tour-status-handler{color:#475467}.tour-status-button{min-height:32px;padding:5px 10px;font-size:12px}.tour-reply-textarea{width:100%;min-height:170px;resize:vertical;padding:12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit;line-height:1.65}.tour-reply-subject{width:100%;padding:11px 12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit}.tour-reply-label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700}@media(max-width:680px){.tour-print-button{margin-left:0}.tour-row-actions{margin-left:0;margin-top:8px;width:100%}.tour-row-actions .tour-print-button{flex:1}.tour-print-modal{border-radius:14px}.tour-print-actions{flex-direction:column-reverse}.tour-print-actions button{width:100%}}`;
    document.head.appendChild(style);
  }
  function closeModal(){document.querySelector(".tour-print-overlay")?.remove();}
  function openPrintModal(r){
    closeModal();injectStyles();const overlay=document.createElement("div");overlay.className="tour-print-overlay";
    overlay.innerHTML=`<div class="tour-print-modal"><div class="tour-print-head"><h2>${isCounselVisitor_(r)?"ダイエット無料カウンセリング アンケート":"店内見学アンケート"}</h2><p>転記内容を選択してPDFを作成します。</p></div><div class="tour-print-body"><div class="tour-print-reservation"><strong>${escapeHtml(r.customer_name||"見学者")}</strong><br>${escapeHtml(r.date||r.reservation_date||"")} ${escapeHtml(r.start_time||"")}〜${escapeHtml(r.end_time||"")}</div><div class="tour-print-options"><label class="tour-print-option"><input type="radio" name="tourPrintMode" value="FULL" checked><span><strong>全部</strong><small>氏名・郵便番号・住所・電話番号・メールアドレス・予約日時を転記</small></span></label><label class="tour-print-option"><input type="radio" name="tourPrintMode" value="ADDRESS_ONLY"><span><strong>住所のみ</strong><small>郵便番号・住所・予約日時のみ転記</small></span></label><label class="tour-print-option"><input type="radio" name="tourPrintMode" value="BLANK"><span><strong>すべて空欄</strong><small>予約情報を一切転記せず原本のまま出力</small></span></label></div><div class="tour-print-message" id="tourPrintMessage"></div></div><div class="tour-print-actions"><button type="button" class="ghost-button" id="tourPrintCancel">閉じる</button><button type="button" class="primary-button" id="tourPrintGenerate">PDFを作成して閲覧・印刷</button></div></div>`;
    document.body.appendChild(overlay);overlay.querySelector("#tourPrintCancel").onclick=closeModal;
    overlay.querySelector("#tourPrintGenerate").onclick=async()=>{const btn=overlay.querySelector("#tourPrintGenerate"),msg=overlay.querySelector("#tourPrintMessage"),mode=overlay.querySelector('input[name="tourPrintMode"]:checked')?.value||"FULL";btn.disabled=true;try{const j=await apiGet(PRINT_ACTION,{reservation_id:r.reservation_id,print_mode:mode});const u=String(j?.data?.file_url||"");if(!u)throw new Error("PDFのURLを取得できませんでした。");window.open(u,"_blank","noopener");closeModal();}catch(err){msg.textContent=err.message||"PDF生成に失敗しました。";}finally{btn.disabled=false;}};
  }
  function openReplyModal(r){
    closeModal();injectStyles();const overlay=document.createElement("div");overlay.className="tour-print-overlay";overlay.innerHTML=`<div class="tour-print-modal"><div class="tour-print-head"><h2>見学者へメール返信</h2></div><div class="tour-print-body"><div class="tour-info-box"><strong>質問・ご要望</strong>${escapeHtml(r.note||"なし").replace(/\n/g,"<br>")}</div><label class="tour-reply-label">件名</label><input id="tourReplySubject" class="tour-reply-subject" value="【The Forest Gym 八千代緑が丘店】店内見学について"><label class="tour-reply-label">本文</label><textarea id="tourReplyBody" class="tour-reply-textarea">${escapeHtml((r.customer_name?r.customer_name+" 様":"お客様")+"\n\nお問い合わせありがとうございます。\n\n\nThe Forest Gym 八千代緑が丘店")}</textarea><div class="tour-print-message" id="tourReplyMessage"></div></div><div class="tour-print-actions"><button class="ghost-button" id="tourReplyCancel">閉じる</button><button class="primary-button" id="tourReplySend">送信</button></div></div>`;document.body.appendChild(overlay);overlay.querySelector("#tourReplyCancel").onclick=closeModal;overlay.querySelector("#tourReplySend").onclick=async()=>{const msg=overlay.querySelector("#tourReplyMessage");try{await apiPost(REPLY_ACTION,{reservation_id:r.reservation_id,subject:overlay.querySelector("#tourReplySubject").value,body:overlay.querySelector("#tourReplyBody").value});closeModal();}catch(err){msg.textContent=err.message||"送信に失敗しました。";}};
  }
  function enhance(){
    injectStyles();document.querySelectorAll(".schedule-item").forEach(item=>{if(item.dataset.questionnaireEnhanced==="1")return;const rid=item.dataset.reservationId;if(!rid)return;let r=null;try{r=(state?.schedule?.reservations||[]).find(x=>String(x.reservation_id)===String(rid));}catch(_e){}if(!r||!isQuestionnaireTarget_(r))return;item.dataset.questionnaireEnhanced="1";const actions=document.createElement("span");actions.className="tour-row-actions";const p=document.createElement("button");p.type="button";p.className="ghost-button tour-print-button";p.textContent="アンケート";p.onclick=e=>{e.stopPropagation();openPrintModal(r);};actions.appendChild(p);if(isTour_(r)){const m=document.createElement("button");m.type="button";m.className="ghost-button tour-mail-button";m.textContent="✉";m.onclick=e=>{e.stopPropagation();openReplyModal(r);};actions.appendChild(m);}item.appendChild(actions);if(r.note){const q=document.createElement("div");q.className="tour-question-inline";q.innerHTML=`<strong>質問・ご要望</strong><br>${escapeHtml(r.note).replace(/\n/g,"<br>")}`;item.appendChild(q);}});
  }
  window.addEventListener("load",()=>{enhance();new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});});
})();