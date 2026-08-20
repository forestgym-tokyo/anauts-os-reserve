/**
 * A-nauts OS Reserve
 * 店内見学 / ダイエット無料カウンセリング非会員 UI v38
 *
 * 対象:
 * - TOUR
 * - COUNSEL かつ customer_type=VISITOR
 *
 * 対象予約行に「アンケート」を追加。
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

  function isTourReservation_(r){
    return serviceCodeOf_(r)==="TOUR";
  }

  function isCounselVisitorReservation_(r){
    if(serviceCodeOf_(r)!=="COUNSEL")return false;

    const type=customerTypeOf_(r);
    const memberNo=String(r?.member_no||"").trim();

    /*
     * COUNSEL非会員判定を堅牢化。
     * getStaffScheduleでcustomer_typeがVISITORなら確定。
     * 旧データ等でcustomer_typeが空でも、会員番号が空なら非会員として扱う。
     * MEMBERは必ず除外する。
     */
    if(type==="MEMBER")return false;
    if(type==="VISITOR")return true;
    return !memberNo;
  }

  function isQuestionnaireTarget_(r){
    return (
      isTourReservation_(r) ||
      isCounselVisitorReservation_(r)
    );
  }

  function questionnaireTitle_(r){
    return isCounselVisitorReservation_(r)
      ? "ダイエット無料カウンセリング／非会員様アンケート"
      : "店内見学アンケート";
  }

  function questionnairePersonLabel_(r){
    return isCounselVisitorReservation_(r)
      ? "カウンセリング予約者"
      : "見学者";
  }

  function questionnaireDateLabel_(r){
    return isCounselVisitorReservation_(r)
      ? "カウンセリング日時"
      : "見学日時";
  }


  function buildCounselVisitorQuestionnaireHtml_(r){
    const esc=escapeHtml;
    const name=esc(r?.customer_name||"");
    const postal=esc(r?.postal_code||"");
    const prefecture=esc(r?.prefecture||"");
    const city=esc(r?.city||"");
    const detail=esc(r?.address_detail||"");
    const phone=esc(r?.customer_phone||"");
    const email=esc(r?.customer_email||"");
    const date=esc(r?.date||r?.reservation_date||"");
    const start=esc(r?.start_time||"");
    const end=esc(r?.end_time||"");
    const address=`${prefecture}${city}${detail}`;

    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ダイエット無料カウンセリング／非会員様アンケート</title>
<style>
@page{size:A4;margin:9mm}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;color:#111;background:#eef1f4}
.toolbar{position:sticky;top:0;z-index:20;padding:10px;background:#111827;text-align:center}
.toolbar button{border:0;border-radius:8px;background:#178447;color:#fff;font-weight:800;font-size:15px;padding:11px 24px;cursor:pointer}
.sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:9mm;box-shadow:0 4px 20px rgba(0,0,0,.15)}
h1{font-size:18px;text-align:center;margin:0 0 8px}
h2{font-size:15px;margin:10px 0 5px}
.sub{text-align:center;font-size:11px;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{border:1px solid #555;padding:5px 6px;vertical-align:top}
th{width:24%;background:#f2f4f7;text-align:left}
.q{border:1px solid #555;border-top:0;padding:7px 8px;font-size:11px;line-height:1.55}
.q:first-of-type{border-top:1px solid #555}
.line{display:inline-block;min-width:110px;border-bottom:1px solid #555;height:15px}
.check{white-space:nowrap;margin-right:12px}
.office{margin-top:8px;border:1px solid #555;padding:6px;font-size:10px}
.medical td:first-child{width:78%}
.medical td:last-child{width:22%;white-space:nowrap}
.page2{page-break-before:always}
.note{font-size:10px;line-height:1.5}
@media print{
  body{background:#fff}
  .toolbar{display:none!important}
  .sheet{margin:0;box-shadow:none;width:auto;min-height:0;padding:0}
  .page2{page-break-before:always}
}
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">印刷する</button></div>

<section class="sheet">
<h1>WEBご入会者アンケート＆登録用紙</h1>
<div class="sub">ダイエット無料カウンセリング（非会員様）</div>

<table>
<tr><th>お名前</th><td>${name ? name+" 様" : ""}</td><th>性別</th><td>男・女</td></tr>
<tr><th>ふりがな</th><td></td><th>生年月日（西暦）</th><td>　　　　年　　月　　日　　年齢　　歳</td></tr>
<tr><th>ご住所</th><td colspan="3">〒 ${postal}<br>${address}</td></tr>
<tr><th>お電話番号</th><td>${phone}</td><th>ご紹介者</th><td></td></tr>
<tr><th>メールアドレス</th><td colspan="3">${email}</td></tr>
</table>

<h2>以下のアンケートにお答えください。</h2>
<div class="q"><strong>① 当ジムを何でお知りになりましたか？</strong><br>
1．新聞折込　2．ちらし　3．通りがかり　4．ホットペッパービューティー　5．マイプレ<br>
6．ホームページ　7．インスタグラム　8．駅看板　9．その他<br>
9を選択の方、ご記載お願いします。 <span class="line"></span></div>

<div class="q"><strong>② 現在、ジムに通っていますか？</strong><br>
1．はい　2．以前通っていた　3．通ったことがない<br>
1の方、どのような形態のジムですか<br>
1．総合型（プール、スタジオ有）　2．24時間型　3．パーソナル　4．その他</div>

<div class="q"><strong>③ ジムを検討されている目的は何ですか？</strong><br>
1．健康維持　2．体力強化　3．スタイル改善　4．その他（　　　　　　　　　　　）</div>

<div class="q"><strong>④ ジムを選ぶ際に重要視している点は何ですか？</strong><br>
1．口コミ　2．価格　3．営業時間・アクセスの良さ　4．設備　5．ご質問・その他<br>
4の方、どのような設備ですか？ <span class="line"></span><br>
5の方、具体的に教えてください。その他ご要望等<br><br><br></div>

<div class="office"><strong>弊社使用欄</strong>　ダイエット無料カウンセリング　
${date} ${start}${end ? " - "+end : ""}　受付 □　確認 □</div>
</section>

<section class="sheet page2">
<h1>会員登録書</h1>
<h2>●メディカルチェック（該当する方へ✓を入れて下さい）</h2>
<table class="medical">
<tr><td>医師から、脳卒中（脳出血、脳梗塞等）にかかっているといわれたり、治療を受けたことがありますか？</td><td>□はい　□いいえ</td></tr>
<tr><td>医師から、心臓病（狭心症、心筋梗塞等）にかかっているといわれたり、治療を受けたことがありますか？</td><td>□はい　□いいえ</td></tr>
<tr><td>医師から、慢性の腎不全にかかっているといわれたり、治療（人工透析）を受けたことがありますか？</td><td>□はい　□いいえ</td></tr>
<tr><td>医師から貧血と言われたことがありますか？</td><td>□はい　□いいえ</td></tr>
<tr><td>これまで長く通院していたとか、入院手術をした病気はありませんか？<br>「はい」の場合、病名を記載してください。<br>（病名：　　　　　　　　　　　　　　　　　　　　　　　　　）</td><td>□はい　□いいえ</td></tr>
<tr><td>＜女性の方のみ＞現在、妊娠中ですか？</td><td>□はい　□いいえ</td></tr>
<tr><td>最近お身体で気になることはありますか？<br>「はい」の場合、内容を記載してください。<br>（内容：　　　　　　　　　　　　　　　　　　　　　　　　　）</td><td>□はい　□いいえ</td></tr>
</table>
<p class="note">※「はい」がある方は、必要に応じて医師への確認をおすすめします。</p>

<h2>●緊急連絡先</h2>
<table>
<tr><th>お名前</th><td></td><th>ご関係</th><td></td></tr>
<tr><th>お電話番号</th><td colspan="3"></td></tr>
</table>

<h2>公式LINE登録（任意）</h2>
<p class="note">The Forest Gym公式LINEアカウントでは、健康に関する情報、マシントレーニングに関する情報などを不定期でお届けします。　□ご登録済</p>

<h2>入会申込み</h2>
<p class="note">The Forest Gymにおける入会規則について同意し、会員になることを申し込みます。</p>
<table>
<tr><th>会員№</th><td></td><th>日付</th><td>2026／　　／　　</td></tr>
<tr><th>お名前</th><td colspan="3"></td></tr>
<tr><th>プラン</th><td colspan="3"></td></tr>
</table>
<div class="office"><strong>弊社使用欄</strong>　受付 □　確認 □</div>
</section>
</body>
</html>`;
  }

  function openCounselVisitorQuestionnaire_(r){
    const win=window.open("","_blank");
    if(!win){
      throw new Error("ブラウザのポップアップがブロックされています。");
    }
    win.document.open();
    win.document.write(buildCounselVisitorQuestionnaireHtml_(r));
    win.document.close();
    try{win.focus();}catch(e){}
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

  function finishPrintModal_(overlay,fileUrl){
    const msg=overlay?.querySelector("#tourPrintMessage");
    if(msg){
      msg.style.color="#067647";
      msg.textContent="PDF作成完了しました。";
    }

    const btn=overlay?.querySelector("#tourPrintGenerate");
    if(btn){
      btn.disabled=false;
      btn.textContent="アンケートを開く";
      btn.onclick=()=>{
        window.open(
          fileUrl,
          "_blank",
          "noopener"
        );
      };
    }
  }

  function openCounselQuestionnaireModal_(r){
    closeModal();
    injectStyles();

    const overlay=document.createElement("div");
    overlay.className="tour-print-overlay";

    const html=buildCounselVisitorQuestionnaireHtml_(r);

    overlay.innerHTML=`
      <div class="tour-print-modal" style="width:min(1100px,98vw);height:94vh;display:flex;flex-direction:column;" role="dialog" aria-modal="true">
        <div class="tour-print-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <h2 style="margin:0;">ダイエット無料カウンセリング／非会員様アンケート</h2>
            <p style="margin:4px 0 0;">A4・2ページで表示します。</p>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" class="ghost-button" id="counselQuestionnaireClose">閉じる</button>
            <button type="button" class="primary-button" id="counselQuestionnairePrint">印刷する</button>
          </div>
        </div>
        <iframe
          id="counselQuestionnaireFrame"
          title="ダイエット無料カウンセリング非会員様アンケート"
          style="flex:1;width:100%;border:0;background:#eef1f4;"
        ></iframe>
      </div>`;

    document.body.appendChild(overlay);

    const frame=overlay.querySelector("#counselQuestionnaireFrame");
    frame.srcdoc=html;

    overlay.querySelector("#counselQuestionnaireClose").onclick=closeModal;
    overlay.querySelector("#counselQuestionnairePrint").onclick=()=>{
      try{
        frame.contentWindow.focus();
        frame.contentWindow.print();
      }catch(err){
        alert("印刷画面を開けませんでした。");
      }
    };

    overlay.addEventListener("click",e=>{
      if(e.target===overlay)closeModal();
    });
  }


  function openPrintModal(r){
    /*
     * COUNSELでアンケートボタンが表示されている予約は
     * PDF生成APIを一切呼ばない。
     * 同一画面のモーダル内へ直接アンケートを表示する。
     */
    if(serviceCodeOf_(r)==="COUNSEL"){
      openCounselQuestionnaireModal_(r);
      return;
    }

    closeModal();
    injectStyles();

    const overlay=document.createElement("div");
    overlay.className="tour-print-overlay";
    overlay.innerHTML=`
      <div class="tour-print-modal" role="dialog" aria-modal="true" aria-label="アンケート閲覧・印刷">
        <div class="tour-print-head">
          <h2>${escapeHtml(questionnaireTitle_(r))}</h2>
          <p>転記内容を選択してPDFを作成します。</p>
        </div>
        <div class="tour-print-body">
          <div class="tour-print-reservation">
            <strong>${escapeHtml(r.customer_name||questionnairePersonLabel_(r))}</strong><br>
            ${escapeHtml(r.date||r.reservation_date||"")} ${escapeHtml(r.start_time||"")}〜${escapeHtml(r.end_time||"")}
          </div>
          <div class="tour-print-options">
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="FULL" checked>
              <span><strong>全部</strong><small>氏名・郵便番号・住所・電話番号・メールアドレス・${escapeHtml(questionnaireDateLabel_(r))}を転記</small></span>
            </label>
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="ADDRESS_ONLY">
              <span><strong>住所のみ</strong><small>郵便番号・住所・${escapeHtml(questionnaireDateLabel_(r))}のみ転記。氏名・電話番号・メールは空欄</small></span>
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
          <button type="button" class="primary-button" id="tourPrintGenerate">アンケートを表示</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal()});
    overlay.querySelector("#tourPrintCancel").onclick=closeModal;

    overlay.querySelector("#tourPrintGenerate").onclick=async()=>{
      const btn=overlay.querySelector("#tourPrintGenerate");
      const msg=overlay.querySelector("#tourPrintMessage");
      const mode=overlay.querySelector('input[name="tourPrintMode"]:checked')?.value||"FULL";

      btn.disabled=true;
      btn.textContent="PDF作成中…";
      msg.style.color="#475467";
      msg.textContent="PDFを作成しています…";

      let completed=false;

      try{
        if(typeof apiGet!=="function")throw new Error("管理画面APIを利用できません。");
        const j=await apiGet(PRINT_ACTION,{
          reservation_id:r.reservation_id,
          print_mode:mode,
          questionnaire_source:
            isCounselVisitorReservation_(r)
              ? "COUNSEL_VISITOR"
              : "TOUR"
        });
        const data=j.data||{};
        const fileUrl=String(data.file_url||"").trim();
        if(!fileUrl)throw new Error("保存済みPDFのURLを取得できませんでした。");

        // 成功後も同じUIを残し、
        // 「アンケートを開く」ボタンからPDFを開く。
        // 自動で別タブは開かない。
        finishPrintModal_(
          overlay,
          fileUrl
        );

        completed=true;
      }catch(err){
        msg.style.color="#b42318";
        msg.textContent=err.message||"PDFの生成に失敗しました。";
      }finally{
        if(
          document.body.contains(overlay) &&
          !completed
        ){
          btn.disabled=false;
          btn.textContent="アンケートを表示";
        }
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
      button.textContent=serviceCodeOf_(r)==="COUNSEL" ? "アンケートを表示" : "アンケート";
      button.title=serviceCodeOf_(r)==="COUNSEL" ? "COUNSELアンケート v38" : "店内見学アンケート";
      button.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();

        if(serviceCodeOf_(r)==="COUNSEL"){
          openCounselQuestionnaireModal_(r);
          return;
        }

        openPrintModal(r);
      };

      actions.appendChild(button);

      if(isTourReservation_(r)){
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
        actions.appendChild(mail);
      }

      row.appendChild(actions);

      /*
       * 見学専用の「質問・ご要望」「対応済み」は
       * COUNSELには追加しない。
       */
      if(isTourReservation_(r)){
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
    if(window.__questionnaireUiV38Installed)return;
    window.__questionnaireUiV38Installed=true;

    const original=window.renderStaffSchedule;
    window.renderStaffSchedule=function(d){
      const result=original.apply(this,arguments);
      setTimeout(()=>enhanceStaffSchedule(d),0);
      return result;
    };
  }

  boot();
})();
