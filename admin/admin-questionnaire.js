/**
 * A-nauts OS Reserve
 * 店内見学アンケート UI v29
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
      @media(max-width:680px){
        .tour-print-button{margin-left:0;margin-top:8px;width:100%}
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

  function decodeBase64Pdf(base64){
    const binary=atob(base64);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:"application/pdf"});
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
          <h2>店内見学アンケート</h2>
          <p>転記内容を選択してPDFを作成します。</p>
        </div>
        <div class="tour-print-body">
          <div class="tour-print-reservation">
            <strong>${escapeHtml(r.customer_name||"見学者")}</strong><br>
            ${escapeHtml(r.date||r.reservation_date||"")} ${escapeHtml(r.start_time||"")}〜${escapeHtml(r.end_time||"")}
          </div>
          <div class="tour-print-options">
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="FULL" checked>
              <span><strong>全部</strong><small>氏名・郵便番号・住所・電話番号・メールアドレス・見学日時を転記</small></span>
            </label>
            <label class="tour-print-option">
              <input type="radio" name="tourPrintMode" value="ADDRESS_ONLY">
              <span><strong>住所のみ</strong><small>郵便番号・住所・見学日時のみ転記。氏名・電話番号・メールは空欄</small></span>
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
        if(!data.base64)throw new Error("PDFデータを取得できませんでした。");

        const blob=decodeBase64Pdf(data.base64);
        const url=URL.createObjectURL(blob);

        if(preview){
          preview.location.href=url;
        }else{
          window.open(url,"_blank");
        }

        // PDF Viewerが読み込む時間を確保してから解放。
        setTimeout(()=>URL.revokeObjectURL(url),5*60*1000);
        msg.style.color="#067647";
        msg.textContent="PDFを生成しました。印刷時は「両面・長辺とじ」を選択してください。";
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

  function enhanceStaffSchedule(d){
    injectStyles();
    const ordered=orderedReservations(d);
    const rows=[...document.querySelectorAll("#staffScheduleBoard .staff-reservation-row")];

    rows.forEach((row,i)=>{
      const r=ordered[i];
      if(!r||String(r.service_code||"").toUpperCase()!=="TOUR")return;
      if(row.querySelector(".tour-print-button"))return;

      const button=document.createElement("button");
      button.type="button";
      button.className="ghost-button tour-print-button";
      button.textContent="アンケート閲覧・印刷";
      button.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        openPrintModal(r);
      };
      row.appendChild(button);
    });
  }

  function boot(){
    injectStyles();
    if(typeof window.renderStaffSchedule!=="function"){
      setTimeout(boot,200);
      return;
    }
    if(window.__tourPrintV29Installed)return;
    window.__tourPrintV29Installed=true;

    const original=window.renderStaffSchedule;
    window.renderStaffSchedule=function(d){
      const result=original.apply(this,arguments);
      setTimeout(()=>enhanceStaffSchedule(d),0);
      return result;
    };
  }

  boot();
})();
