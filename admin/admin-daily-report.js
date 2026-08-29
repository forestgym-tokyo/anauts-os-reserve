(()=>{
  "use strict";

  const STORE_CODE="YACHIYO";
  const CLEANING_AREAS=[
    {
      number:"①",
      name:"有酸素エリア",
      groups:[
        {
          name:"トレッドミル周辺",
          items:[
            {item:"トレッドミル・本体ベルト",instruction:"②スプレー塗布後、緑のモップで拭き取る。"},
            {item:"トレッドミル・フレーム（横）",instruction:"②スプレー塗布後、緑のモップで拭き取る。"},
            {item:"トレッドミル・先端部",instruction:"グローブダスターまたは黄色モップで埃を除去した後、②スプレーを塗布し、水色雑巾で拭き取る。"},
            {item:"トレッドミル・ゴムマット",instruction:"②スプレー塗布後、緑のモップで拭き取る。"}
          ]
        },
        {
          name:"バイク・クロストレーナー",
          items:[
            {item:"本体",instruction:"②スプレーを塗布し、水色雑巾で拭き取る。"},
            {item:"周辺床",instruction:"②スプレー塗布後、緑のモップで拭き取る。"}
          ]
        }
      ]
    },
    {
      number:"②",
      name:"マシンエリア",
      groups:[{
        name:"",
        items:[
          {item:"各マシン",instruction:"グローブダスターで埃を取る。"},
          {item:"床",instruction:"掃除機で埃を取る。マシン周辺は、ほうきで埃をかき出した後、掃除機で吸い込む。"}
        ]
      }]
    },
    {
      number:"③",
      name:"フリーウェイトエリア",
      groups:[{
        name:"",
        items:[
          {item:"床",instruction:"掃除機で埃を取る。ラック周辺は、ほうきで埃をかき出した後、掃除機で吸い込む。プロテイン跡は、②スプレー後に刷毛でこすり、水色雑巾で拭き取る。"},
          {item:"ラック本体",instruction:"グローブダスターで埃を取る。飲み物のボトル跡は、②スプレー後に刷毛でこすり、水色雑巾で拭き取る。"},
          {item:"ベンチ",instruction:"グローブダスターで埃を取る。飲み物のボトル跡は、②スプレー後に刷毛でこすり、水色雑巾で拭き取る。"}
        ]
      }]
    },
    {
      number:"④",
      name:"ストレッチエリア",
      groups:[{
        name:"",
        items:[
          {item:"床",instruction:"土足禁止エリア用掃除機で埃を取る。"},
          {item:"棚",instruction:"グローブダスターで埃を取る。汚れ具合によっては、②スプレー後に水色雑巾で拭き取る。"}
        ]
      }]
    },
    {
      number:"⑤",
      name:"シャワールーム・更衣室",
      groups:[{
        name:"",
        items:[
          {item:"排水溝・金属部分",instruction:"排水溝付近の髪の毛を取り除き、風呂用洗剤をスプレーして、刷毛・スポンジ・ブラシ等で汚れと水垢を除去する。金属部分は、風呂用洗剤をスプレー後、スポンジで軽くこする。"},
          {item:"床",instruction:"土足禁止エリア用掃除機で埃と髪の毛を取る。"},
          {item:"ドライヤー",instruction:"汚れがないかチェックする。"}
        ]
      }]
    },
    {
      number:"⑥",
      name:"トイレ",
      groups:[{
        name:"",
        items:[
          {item:"床",instruction:"基本は掃除機で清掃する。尿汚れは、トイレ洗剤とペーパータオルで拭き取る。"},
          {item:"便器",instruction:"トイレ洗剤を使用し、刷毛でこする。"}
        ]
      }]
    }
  ];
  const CLEANING_ITEMS=[];
  CLEANING_AREAS.forEach(area=>area.groups.forEach(group=>group.items.forEach(item=>CLEANING_ITEMS.push({
    area:area.name,
    group:group.name,
    item:item.item,
    instruction:item.instruction
  }))));
  const REPORT_STATE={
    date:"",
    drafts:new Map(),
    loading:false,
    autoRows:[]
  };

  const q=s=>document.querySelector(s);
  const qa=s=>document.querySelectorAll(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const today=()=>ymd(new Date());

  function reporterLabel(){
    try{
      if(typeof roleHonorific==="function")return roleHonorific(state.authUser)||"—";
      const u=state?.authUser||{};
      return u.display_name||u.staff_name||u.staff_code||u.email||"—";
    }catch(_){return"—";}
  }

  function serviceShort(r){
    const name=String(r.service_name||r.service_code||"").trim();
    const upper=name.toUpperCase();
    if(name.includes("店内見学")||upper.includes("TOUR"))return"見学";
    if(name.includes("退会")||upper.includes("UNSUBSCRIBE")||upper.includes("WITHDRAW"))return"退会手続";
    if(name.includes("諸手続")||upper.includes("PROCEDURE"))return"諸手続";
    if(name.includes("ダイエット")&&name.includes("カウンセリング"))return"ダイエット相談";
    if(name.includes("ミール")||upper.includes("MEAL"))return"食事相談";
    if(name.includes("トレーニングサポート")||upper.includes("TRAINING_SUPPORT"))return"トレサポ";
    if(name.includes("無料体験")||upper.includes("TRIAL"))return"無料体験";
    if(name.includes("パーソナル")||upper.startsWith("PT"))return"パーソナル";
    return name||"その他";
  }

  function ensureStyle(){
    if(q("#dailyReportStyle"))return;
    const style=document.createElement("style");
    style.id="dailyReportStyle";
    style.textContent=`
      #dailyReportView{padding-bottom:48px}
      .dr-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
      .dr-toolbar .dr-date{min-width:160px}
      .dr-meta{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
      .dr-chip{display:inline-flex;align-items:center;min-height:34px;padding:6px 10px;border:1px solid #294037;border-radius:999px;background:#10231d;color:#cbd8d1;font-size:12px;font-weight:800}
      .dr-banner{margin-bottom:16px;padding:12px 14px;border:1px solid #5f4b28;border-radius:12px;background:#251d10;color:#f2d18a;font-size:12px;line-height:1.65}
      .dr-section{margin-bottom:16px;padding:18px}
      .dr-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .dr-section-head h2{margin:0;font-size:18px}
      .dr-section-head p{margin:4px 0 0;color:#91a198;font-size:12px}
      .dr-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      .dr-summary-card{min-width:0;padding:12px;border:1px solid #294037;border-radius:12px;background:#0d1e18}
      .dr-summary-card strong{display:block;font-size:22px;color:#fff}
      .dr-summary-card span{display:block;margin-top:2px;color:#9caea5;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dr-clean-list{display:grid;gap:14px}
      .dr-clean-area{overflow:hidden;border:1px solid #294037;border-radius:14px;background:#0d1e18}
      .dr-clean-area-head{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid #294037;background:#10231d}
      .dr-clean-area-number{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#63d179;color:#07110d;font-weight:900}
      .dr-clean-area-head h3{margin:0;font-size:16px}
      .dr-clean-group{display:grid;gap:9px;padding:13px}
      .dr-clean-group+.dr-clean-group{border-top:1px solid #294037}
      .dr-clean-group h4{margin:0 0 2px;color:#79dc8c;font-size:13px}
      .dr-clean-item{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:12px;align-items:center;padding:11px 12px;border:1px solid #263b33;border-radius:10px;background:#0a1712}
      .dr-clean-copy{display:grid;gap:4px;min-width:0}
      .dr-clean-target{color:#fff;font-size:13px;font-weight:900}
      .dr-clean-instruction{color:#b5c2bb;font-size:12px;line-height:1.65}
      .dr-clean-item select,.dr-field select,.dr-field input,.dr-field textarea{width:100%;box-sizing:border-box;border:1px solid #345047;border-radius:9px;background:#0b1713;color:#fff;padding:9px 10px;font:inherit}
      .dr-field{display:grid;gap:6px}
      .dr-field>span{color:#aab8b1;font-size:11px;font-weight:800}
      .dr-inquiry-list{display:grid;gap:10px}
      .dr-inquiry{padding:12px;border:1px solid #294037;border-radius:12px;background:#0d1e18}
      .dr-inquiry-grid{display:grid;grid-template-columns:120px 120px minmax(130px,1fr) 130px 150px;gap:9px;align-items:end}
      .dr-inquiry .dr-field.detail{grid-column:1/-1}
      .dr-inline-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .dr-empty{padding:16px;border:1px dashed #345047;border-radius:12px;color:#91a198;text-align:center;font-size:12px}
      .dr-radio-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .dr-radio{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid #345047;border-radius:999px;background:#0d1e18;cursor:pointer}
      .dr-radio input{accent-color:#63d179}
      .dr-conditional{display:grid;gap:10px;margin-top:10px}
      .dr-footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}
      .dr-review{margin-top:14px;padding:14px;border:1px solid #4b6b5e;border-radius:12px;background:#0d1e18;line-height:1.7}
      .dr-review h3{margin:0 0 8px;font-size:16px}
      .dr-review pre{margin:0;white-space:pre-wrap;font:inherit;color:#dce6e1}
      .dr-required-note{color:#ffcf7d;font-size:11px}
      @media(max-width:900px){.dr-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.dr-inquiry-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dr-inquiry .dr-field.detail{grid-column:1/-1}}
      @media(max-width:600px){.dr-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dr-clean-item{grid-template-columns:1fr}.dr-clean-item select{min-height:44px}.dr-inquiry-grid{grid-template-columns:1fr}.dr-inquiry .dr-field.detail{grid-column:auto}.dr-toolbar .dr-date{width:100%}.dr-meta{width:100%;margin-left:0}.dr-footer button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function build(){
    const view=q("#dailyReportView");
    if(!view||view.dataset.dailyReportBuilt==="1")return;
    ensureStyle();
    REPORT_STATE.date=today();
    view.dataset.dailyReportBuilt="1";
    view.innerHTML=`
      <div class="page-heading"><div><p class="eyebrow">DAILY REPORT</p><h1>業務日報</h1><p>清掃・問い合わせ・設備異常・トラブル・引継ぎを簡潔に記録します。</p></div></div>
      <div class="schedule-toolbar card dr-toolbar">
        <div class="toolbar-group"><button id="drPrev" class="icon-button" type="button" aria-label="前日">‹</button><button id="drToday" class="ghost-button" type="button">今日</button><button id="drNext" class="icon-button" type="button" aria-label="翌日">›</button></div>
        <input id="drDate" class="dr-date" type="date">
        <div class="dr-meta"><span id="drReporter" class="dr-chip"></span><span id="drStatus" class="dr-chip">未確認</span></div>
      </div>
      <div class="dr-banner">現在は画面仕様確認版です。入力内容は画面内で保持しますが、Googleスプレッドシートへの保存・他スタッフとの共有はまだ接続していません。</div>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>本日の実績</h2><p>Reserveの予約データから自動集計します。</p></div><button id="drReloadAuto" class="ghost-button" type="button">再読込</button></div>
        <div id="drAutoSummary" class="dr-summary-grid"><div class="staff-schedule-loading">読み込んでいます…</div></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>清掃チェック</h2><p>各項目を「完了／未完了／対象外」で確認します。</p></div><button id="drAllClean" class="ghost-button" type="button">すべて完了</button></div>
        <div id="drCleaning" class="dr-clean-list"></div>
        <div class="dr-field" style="margin-top:12px"><span>清掃メモ（任意）</span><textarea id="drCleaningMemo" rows="2" placeholder="未完了箇所や補足があれば入力"></textarea></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>問い合わせ・対応</h2><p>来店（直接）・電話・LINE・メール別に記録します。問い合わせがなければ追加不要です。</p></div><button id="drAddInquiry" class="primary-button" type="button">＋ 問い合わせ追加</button></div>
        <div id="drInquiryList" class="dr-inquiry-list"><div class="dr-empty">本日の問い合わせは登録されていません。</div></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>設備・施設異常</h2><p>異常があった場合だけ詳細を入力します。</p></div></div>
        <div class="dr-radio-row"><label class="dr-radio"><input type="radio" name="drEquipment" value="NONE" checked>異常なし</label><label class="dr-radio"><input type="radio" name="drEquipment" value="ISSUE">異常あり</label></div>
        <div id="drEquipmentDetail" class="dr-conditional is-hidden"><div class="dr-field"><span>対象</span><select id="drEquipmentCategory"><option>マシン・ラック</option><option>Akerun・入退室</option><option>タブレット・IT機器</option><option>空調・照明</option><option>シャワー・トイレ</option><option>備品</option><option>その他</option></select></div><div class="dr-field"><span>内容</span><textarea id="drEquipmentMemo" rows="3" placeholder="状態と必要な対応を入力"></textarea></div></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>クレーム・事故・トラブル</h2><p>通常の問い合わせとは分けて記録します。</p></div></div>
        <div class="dr-radio-row"><label class="dr-radio"><input type="radio" name="drTrouble" value="NONE" checked>なし</label><label class="dr-radio"><input type="radio" name="drTrouble" value="ISSUE">あり</label></div>
        <div id="drTroubleDetail" class="dr-conditional is-hidden"><div class="dr-field"><span>区分</span><select id="drTroubleCategory"><option>クレーム</option><option>怪我・事故</option><option>利用ルール違反</option><option>会員間トラブル</option><option>入退室トラブル</option><option>その他</option></select></div><div class="dr-field"><span>対応区分</span><select id="drTroubleStatus"><option>要確認</option><option>要対応</option><option>対応済み</option></select></div><div class="dr-field"><span>内容</span><textarea id="drTroubleMemo" rows="3" placeholder="発生内容・対応内容を入力"></textarea></div></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>引継ぎ事項</h2><p>次のスタッフに伝える必要があることだけ入力します。</p></div></div>
        <div class="dr-field"><span>引継ぎ内容</span><textarea id="drHandover" rows="4" placeholder="例：○○様へ明日電話／ラック2の部品確認"></textarea></div>
        <label class="dr-radio" style="margin-top:10px"><input id="drHandoverAction" type="checkbox">要対応として引き継ぐ</label>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>その他メモ</h2><p>上記に含まれない事項がある場合のみ入力します。</p></div></div>
        <div class="dr-field"><textarea id="drOtherMemo" rows="3" placeholder="任意"></textarea></div>
      </section>

      <div class="dr-footer"><button id="drReviewButton" class="ghost-button" type="button">入力内容を確認</button><button id="drSubmitButton" class="primary-button" type="button" disabled title="サーバー保存接続後に有効化します">日報提出</button></div>
      <div id="drReview" class="dr-review is-hidden"></div>
    `;

    q("#drDate").value=REPORT_STATE.date;
    q("#drReporter").textContent=`担当 ${reporterLabel()}`;
    renderCleaning();
    bind();
    loadDay();
  }

  function renderCleaning(){
    const box=q("#drCleaning");if(!box)return;
    let itemIndex=0;
    box.innerHTML=CLEANING_AREAS.map(area=>`<section class="dr-clean-area">
      <div class="dr-clean-area-head"><span class="dr-clean-area-number">${esc(area.number)}</span><h3>${esc(area.name)}</h3></div>
      ${area.groups.map(group=>`<div class="dr-clean-group">
        ${group.name?`<h4>${esc(group.name)}</h4>`:""}
        ${group.items.map(item=>{const i=itemIndex;itemIndex+=1;return`<label class="dr-clean-item">
          <span class="dr-clean-copy"><span class="dr-clean-target">${esc(item.item)}</span><span class="dr-clean-instruction">${esc(item.instruction)}</span></span>
          <select data-dr-clean="${i}" aria-label="${esc(area.name)} ${esc(item.item)}"><option value="">未確認</option><option value="DONE">完了</option><option value="NOT_DONE">未完了</option><option value="NA">対象外</option></select>
        </label>`;}).join("")}
      </div>`).join("")}
    </section>`).join("");
  }

  function bind(){
    q("#drPrev").onclick=()=>moveDate(-1);
    q("#drNext").onclick=()=>moveDate(1);
    q("#drToday").onclick=()=>setDate(today());
    q("#drDate").onchange=()=>setDate(q("#drDate").value||today());
    q("#drReloadAuto").onclick=()=>loadAuto();
    q("#drAllClean").onclick=()=>qa("[data-dr-clean]").forEach(s=>s.value="DONE");
    q("#drAddInquiry").onclick=()=>addInquiry();
    qa('input[name="drEquipment"]').forEach(r=>r.onchange=()=>q("#drEquipmentDetail").classList.toggle("is-hidden",r.checked&&r.value==="NONE"));
    qa('input[name="drTrouble"]').forEach(r=>r.onchange=()=>q("#drTroubleDetail").classList.toggle("is-hidden",r.checked&&r.value==="NONE"));
    q("#drReviewButton").onclick=review;
    q('[data-view="dailyReport"]')?.addEventListener("click",()=>{q("#drReporter").textContent=`担当 ${reporterLabel()}`;loadDay();});
  }

  function moveDate(delta){
    const [y,m,d]=REPORT_STATE.date.split("-").map(Number),date=new Date(y,m-1,d+delta);
    setDate(ymd(date));
  }

  function setDate(date){
    captureDraft();
    REPORT_STATE.date=date;
    q("#drDate").value=date;
    q("#drReview").classList.add("is-hidden");
    restoreDraft();
    loadAuto();
  }

  function captureDraft(){
    if(!REPORT_STATE.date||!q("#drCleaning"))return;
    REPORT_STATE.drafts.set(REPORT_STATE.date,serialize());
  }

  function restoreDraft(){
    resetForm();
    const d=REPORT_STATE.drafts.get(REPORT_STATE.date);if(!d)return;
    qa("[data-dr-clean]").forEach((s,i)=>s.value=d.cleaning?.[i]?.status||"");
    q("#drCleaningMemo").value=d.cleaning_memo||"";
    (d.inquiries||[]).forEach(x=>addInquiry(x));
    const eq=d.equipment?.has_issue?"ISSUE":"NONE";q(`input[name="drEquipment"][value="${eq}"]`).checked=true;q("#drEquipmentDetail").classList.toggle("is-hidden",eq==="NONE");q("#drEquipmentCategory").value=d.equipment?.category||"マシン・ラック";q("#drEquipmentMemo").value=d.equipment?.memo||"";
    const tr=d.trouble?.has_issue?"ISSUE":"NONE";q(`input[name="drTrouble"][value="${tr}"]`).checked=true;q("#drTroubleDetail").classList.toggle("is-hidden",tr==="NONE");q("#drTroubleCategory").value=d.trouble?.category||"クレーム";q("#drTroubleStatus").value=d.trouble?.status||"要確認";q("#drTroubleMemo").value=d.trouble?.memo||"";
    q("#drHandover").value=d.handover?.memo||"";q("#drHandoverAction").checked=!!d.handover?.needs_action;q("#drOtherMemo").value=d.other_memo||"";
  }

  function resetForm(){
    qa("[data-dr-clean]").forEach(s=>s.value="");
    if(q("#drCleaningMemo"))q("#drCleaningMemo").value="";
    q("#drInquiryList").innerHTML='<div class="dr-empty">本日の問い合わせは登録されていません。</div>';
    q('input[name="drEquipment"][value="NONE"]').checked=true;q("#drEquipmentDetail").classList.add("is-hidden");q("#drEquipmentMemo").value="";
    q('input[name="drTrouble"][value="NONE"]').checked=true;q("#drTroubleDetail").classList.add("is-hidden");q("#drTroubleMemo").value="";
    q("#drHandover").value="";q("#drHandoverAction").checked=false;q("#drOtherMemo").value="";
  }

  function addInquiry(data={}){
    const list=q("#drInquiryList");
    list.querySelector(".dr-empty")?.remove();
    const row=document.createElement("div");row.className="dr-inquiry";
    row.innerHTML=`<div class="dr-inquiry-grid">
      <label class="dr-field"><span>受付経路</span><select data-i="channel"><option>来店（直接）</option><option>電話</option><option>LINE</option><option>メール</option></select></label>
      <label class="dr-field"><span>時刻</span><input data-i="time" type="time"></label>
      <label class="dr-field"><span>氏名</span><input data-i="name" type="text" placeholder="任意"></label>
      <label class="dr-field"><span>会員番号</span><input data-i="member" type="text" inputmode="numeric" maxlength="6" placeholder="任意"></label>
      <label class="dr-field"><span>対応状況</span><select data-i="status"><option>未対応</option><option>対応中</option><option>引継ぎ</option><option>対応済み</option></select></label>
      <label class="dr-field"><span>分類</span><select data-i="category"><option>見学・入会</option><option>退会・休会</option><option>料金・契約</option><option>トレーニング</option><option>設備・利用方法</option><option>その他</option></select></label>
      <label class="dr-field detail"><span>問い合わせ内容・対応内容</span><textarea data-i="detail" rows="2" placeholder="要点だけ入力"></textarea></label>
    </div><div class="dr-inline-actions" style="justify-content:flex-end;margin-top:8px"><button class="danger-ghost" data-i-remove type="button">削除</button></div>`;
    const set=(k,v)=>{const el=row.querySelector(`[data-i="${k}"]`);if(el&&v!=null)el.value=v;};
    set("channel",data.channel||"来店（直接）");set("time",data.time||"");set("name",data.name||"");set("member",data.member_no||"");set("status",data.status||"未対応");set("category",data.category||"見学・入会");set("detail",data.detail||"");
    row.querySelector("[data-i-remove]").onclick=()=>{row.remove();if(!list.querySelector(".dr-inquiry"))list.innerHTML='<div class="dr-empty">本日の問い合わせは登録されていません。</div>';};
    list.appendChild(row);
  }

  async function loadDay(){
    if(!q("#dailyReportView")||!REPORT_STATE.date)return;
    q("#drReporter").textContent=`担当 ${reporterLabel()}`;
    restoreDraft();
    await loadAuto();
  }

  async function loadAuto(){
    if(REPORT_STATE.loading)return;REPORT_STATE.loading=true;
    const box=q("#drAutoSummary");if(box)box.innerHTML='<div class="staff-schedule-loading">予約実績を読み込んでいます…</div>';
    try{
      const [staffRes,trainerRes]=await Promise.allSettled([
        apiGet("getStaffSchedule",{date:REPORT_STATE.date,store_code:STORE_CODE}),
        apiGet("getTrainerSchedule",{date:REPORT_STATE.date,store_code:STORE_CODE})
      ]);
      const rows=[];
      [staffRes,trainerRes].forEach(x=>{
        if(x.status!=="fulfilled")return;
        const a=Array.isArray(x.value?.data?.reservations)?x.value.data.reservations:[];
        a.filter(r=>String(r.status||"").toUpperCase()!=="CANCELLED").forEach(r=>rows.push(r));
      });
      const unique=new Map();
      rows.forEach(r=>{
        const key=String(r.reservation_id||`${r.date||REPORT_STATE.date}|${r.start_time}|${r.customer_name}|${r.service_code||r.service_name}`);
        if(!unique.has(key))unique.set(key,r);
      });
      REPORT_STATE.autoRows=[...unique.values()];
      renderAuto();
    }catch(e){
      if(box)box.innerHTML=`<div class="dr-empty">実績を取得できませんでした：${esc(e?.message||"取得失敗")}</div>`;
    }finally{REPORT_STATE.loading=false;}
  }

  function renderAuto(){
    const box=q("#drAutoSummary");if(!box)return;
    const counts=new Map();REPORT_STATE.autoRows.forEach(r=>{const k=serviceShort(r);counts.set(k,(counts.get(k)||0)+1);});
    const ordered=["見学","ダイエット相談","退会手続","諸手続","食事相談","トレサポ","パーソナル","無料体験"];
    const cards=[`<div class="dr-summary-card"><strong>${REPORT_STATE.autoRows.length}</strong><span>予約合計</span></div>`]
      .concat(ordered.map(k=>`<div class="dr-summary-card"><strong>${counts.get(k)||0}</strong><span>${esc(k)}</span></div>`));
    box.innerHTML=cards.join("");
  }

  function serialize(){
    const cleaning=[...qa("[data-dr-clean]")].map((s,i)=>({
      area:CLEANING_ITEMS[i]?.area||"",
      group:CLEANING_ITEMS[i]?.group||"",
      item:CLEANING_ITEMS[i]?.item||"",
      instruction:CLEANING_ITEMS[i]?.instruction||"",
      status:s.value
    }));
    const inquiries=[...qa("#drInquiryList .dr-inquiry")].map(row=>({
      channel:row.querySelector('[data-i="channel"]')?.value||"",
      time:row.querySelector('[data-i="time"]')?.value||"",
      name:row.querySelector('[data-i="name"]')?.value||"",
      member_no:row.querySelector('[data-i="member"]')?.value||"",
      status:row.querySelector('[data-i="status"]')?.value||"",
      category:row.querySelector('[data-i="category"]')?.value||"",
      detail:row.querySelector('[data-i="detail"]')?.value||""
    }));
    return {
      date:REPORT_STATE.date,store_code:STORE_CODE,reporter:reporterLabel(),
      reporter_code:state?.authUser?.staff_code||"",
      cleaning,cleaning_memo:q("#drCleaningMemo")?.value.trim()||"",
      inquiries,
      equipment:{has_issue:q('input[name="drEquipment"]:checked')?.value==="ISSUE",category:q("#drEquipmentCategory")?.value||"",memo:q("#drEquipmentMemo")?.value.trim()||""},
      trouble:{has_issue:q('input[name="drTrouble"]:checked')?.value==="ISSUE",category:q("#drTroubleCategory")?.value||"",status:q("#drTroubleStatus")?.value||"",memo:q("#drTroubleMemo")?.value.trim()||""},
      handover:{memo:q("#drHandover")?.value.trim()||"",needs_action:!!q("#drHandoverAction")?.checked},
      other_memo:q("#drOtherMemo")?.value.trim()||"",
      reservation_count:REPORT_STATE.autoRows.length
    };
  }

  function review(){
    captureDraft();const d=serialize(),missing=d.cleaning.filter(x=>!x.status),notDone=d.cleaning.filter(x=>x.status==="NOT_DONE");
    const review=q("#drReview");review.classList.remove("is-hidden");
    const inquiryStatus=d.inquiries.reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{});
    const lines=[
      `${d.date}　${d.reporter}`,
      `予約実績：${d.reservation_count}件`,
      `清掃：完了 ${d.cleaning.filter(x=>x.status==="DONE").length}／未完了 ${notDone.length}／対象外 ${d.cleaning.filter(x=>x.status==="NA").length}／未確認 ${missing.length}`,
      `問い合わせ：${d.inquiries.length}件${d.inquiries.length?`（未対応 ${inquiryStatus["未対応"]||0}・対応中 ${inquiryStatus["対応中"]||0}・引継ぎ ${inquiryStatus["引継ぎ"]||0}・対応済み ${inquiryStatus["対応済み"]||0}）`:""}`,
      `設備異常：${d.equipment.has_issue?"あり":"なし"}`,
      `クレーム・事故・トラブル：${d.trouble.has_issue?"あり":"なし"}`,
      `引継ぎ：${d.handover.memo?(d.handover.needs_action?"要対応":"あり"):"なし"}`
    ];
    review.innerHTML=`<h3>入力内容の確認</h3><pre>${esc(lines.join("\n"))}</pre>${missing.length?`<div class="dr-required-note" style="margin-top:10px">清掃チェックに未確認が ${missing.length} 件あります。</div>`:""}`;
    review.scrollIntoView({behavior:"smooth",block:"nearest"});
    q("#drStatus").textContent=missing.length?"未確認あり":"確認済み";
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiGet!=="function"){setTimeout(boot,100);return;}
    build();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
