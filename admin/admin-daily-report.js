(()=>{
  "use strict";

  const STORE_CODE="YACHIYO";
  const MAX_IMAGES=5;
  const MAX_IMAGE_EDGE=1280;
  const CLIENT_IMAGE_MAX_BYTES=720*1024;
  const CLEANING_AREAS=[
    {
      name:"有酸素エリア",
      groups:[
        {
          name:"トレッドミル周辺",
          items:[
            {item:"トレッドミル・本体ベルト",instruction:"スプレー塗布後、緑のモップで拭き取る。"},
            {item:"トレッドミル・フレーム（横）",instruction:"スプレー塗布後、緑のモップで拭き取る。"},
            {item:"トレッドミル・先端部",instruction:"グローブダスターまたは黄色モップで埃を除去した後、スプレーを塗布し、水色雑巾で拭き取る。"},
            {item:"トレッドミル・ゴムマット",instruction:"スプレー塗布後、緑のモップで拭き取る。"}
          ]
        },
        {
          name:"バイク・クロストレーナー",
          items:[
            {item:"本体",instruction:"スプレーを塗布し、水色雑巾で拭き取る。"},
            {item:"周辺床",instruction:"スプレー塗布後、緑のモップで拭き取る。"}
          ]
        }
      ]
    },
    {
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
      name:"フリーウエイトエリア",
      groups:[{
        name:"",
        items:[
          {item:"床",instruction:"掃除機で埃を取る。ラック周辺は、ほうきで埃をかき出した後、掃除機で吸い込む。プロテイン跡は、スプレー後に刷毛でこすり、水色雑巾で拭き取る。"},
          {item:"ラック本体",instruction:"グローブダスターで埃を取る。飲み物のボトル跡は、スプレー後に刷毛でこすり、水色雑巾で拭き取る。"},
          {item:"ベンチ",instruction:"グローブダスターで埃を取る。飲み物のボトル跡は、スプレー後に刷毛でこすり、水色雑巾で拭き取る。"}
        ]
      }]
    },
    {
      name:"ストレッチエリア",
      groups:[{
        name:"",
        items:[
          {item:"床",instruction:"土足禁止エリア用掃除機で埃を取る。"},
          {item:"棚",instruction:"グローブダスターで埃を取る。汚れ具合によっては、スプレー後に水色雑巾で拭き取る。"}
        ]
      }]
    },
    {
      name:"シャワー・更衣室",
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
      name:"トイレ",
      groups:[{
        name:"",
        items:[
          {item:"床",instruction:"基本は掃除機で清掃する。尿汚れは、トイレ洗剤とペーパータオルで拭き取る。"},
          {item:"便器",instruction:"トイレ洗剤を使用し、刷毛でこする。"}
        ]
      }]
    },
    {
      name:"その他",
      groups:[{
        name:"",
        items:[
          {item:"アルコールの補充",instruction:""},
          {item:"タオル交換",instruction:""}
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
    autoRows:[],
    scheduleShifts:[],
    staff:[],
    staffLoaded:false,
    version:0,
    status:"NOT_LOADED",
    existingImages:[],
    newImages:[],
    dirty:false,
    applying:false,
    busy:false,
    imageProcessing:false,
    serverAvailable:false,
    daySequence:0
  };

  const q=s=>document.querySelector(s);
  const qa=s=>document.querySelectorAll(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const today=()=>ymd(new Date());
  const normalizeCode=v=>String(v||"").trim().toUpperCase();

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
      .dr-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:12px}
      .dr-date-field{display:grid;gap:4px;min-width:210px}
      .dr-date-field>span{color:#77877f;font-size:11px;font-weight:900}
      .dr-toolbar .dr-date{width:100%;min-width:180px;box-sizing:border-box;border:1px solid #345047;border-radius:9px;background:#0b1713;color:#fff;padding:9px 10px;font:inherit}
      .dr-meta{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
      .dr-chip{display:inline-flex;align-items:center;min-height:34px;padding:6px 10px;border:1px solid #294037;border-radius:999px;background:#10231d;color:#cbd8d1;font-size:12px;font-weight:800}
      .dr-banner{margin-bottom:16px;padding:12px 14px;border:1px solid #356246;border-radius:12px;background:#10231d;color:#cbe7d2;font-size:12px;line-height:1.65}
      .dr-message{margin-bottom:16px;padding:11px 13px;border:1px solid #356246;border-radius:10px;background:#10231d;color:#d9f4df;font-size:12px;font-weight:800;line-height:1.6}
      .dr-message.is-error{border-color:#8a3e48;background:#2a1519;color:#ffd6db}
      .dr-section{margin-bottom:16px;padding:18px}
      .dr-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      #dailyReportView .page-heading h1,.dr-section-head h2{color:#151716}
      .dr-section-head h2{margin:0;font-size:18px}
      .dr-section-head p{margin:4px 0 0;color:#91a198;font-size:12px;line-height:1.55}
      .dr-staff-choices{display:flex;gap:9px;flex-wrap:wrap}
      .dr-staff-choice{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:8px 12px;border:1px solid #345047;border-radius:10px;background:#0d1e18;color:#dce6e1;font-size:13px;font-weight:900;cursor:pointer}
      .dr-staff-choice:has(input:checked){border-color:#63d179;background:#173424;color:#fff}
      .dr-staff-choice input{accent-color:#63d179}
      .dr-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      .dr-summary-card{min-width:0;padding:12px;border:1px solid #294037;border-radius:12px;background:#0d1e18}
      .dr-summary-card strong{display:block;font-size:22px;color:#fff}
      .dr-summary-card span{display:block;margin-top:2px;color:#9caea5;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dr-clean-list{display:grid;gap:14px}
      .dr-clean-area{overflow:hidden;border:1px solid #294037;border-radius:14px;background:#0d1e18}
      .dr-clean-area-head{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid #294037;background:#10231d}
      .dr-clean-area-head h3{margin:0;color:#79dc8c;font-size:16px}
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
      .dr-field small,.dr-help{color:#91a198;font-size:11px;line-height:1.55}
      .dr-inquiry-list{display:grid;gap:10px}
      .dr-inquiry{padding:12px;border:1px solid #294037;border-radius:12px;background:#0d1e18}
      .dr-inquiry-grid{display:grid;grid-template-columns:120px 110px minmax(130px,1fr) 130px 150px;gap:9px;align-items:end}
      .dr-inquiry-grid .dr-field{min-width:0}
      .dr-inquiry-grid input[data-i="time"]{width:110px;max-width:100%;min-width:0}
      .dr-inquiry .dr-field.detail{grid-column:1/-1}
      .dr-inline-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .dr-empty{padding:16px;border:1px dashed #345047;border-radius:12px;color:#91a198;text-align:center;font-size:12px}
      .dr-radio-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .dr-radio{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid #345047;border-radius:999px;background:#0d1e18;color:#dce6e1;cursor:pointer}
      .dr-radio input{accent-color:#63d179}
      .dr-conditional{display:grid;gap:10px;margin-top:10px}
      .dr-image-list{display:grid;gap:7px;margin-top:4px}
      .dr-image-row{display:flex;align-items:center;gap:9px;min-width:0;padding:9px 10px;border:1px solid #294037;border-radius:9px;background:#0d1e18}
      .dr-image-row a,.dr-image-row span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cfe6d6;font-size:12px;font-weight:800}
      .dr-image-row a{text-decoration:underline}
      .dr-footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}
      .dr-review{margin-top:14px;padding:14px;border:1px solid #4b6b5e;border-radius:12px;background:#0d1e18;line-height:1.7}
      .dr-review h3{margin:0 0 8px;font-size:16px;color:#fff}
      .dr-review pre{margin:0;white-space:pre-wrap;font:inherit;color:#dce6e1}
      .dr-required-note{color:#ffcf7d;font-size:11px}
      @media(max-width:900px){.dr-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.dr-inquiry-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dr-inquiry .dr-field.detail{grid-column:1/-1}}
      @media(max-width:600px){.dr-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dr-clean-item{grid-template-columns:1fr}.dr-clean-item select{min-height:44px}.dr-inquiry-grid{grid-template-columns:1fr}.dr-inquiry .dr-field.detail{grid-column:auto}.dr-date-field{width:100%}.dr-meta{width:100%;margin-left:0}.dr-footer button{width:100%}}
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
        <label class="dr-date-field"><span>日報日付（過去分も閲覧可）</span><input id="drDate" class="dr-date" type="date"></label>
        <div class="dr-meta"><span id="drReporter" class="dr-chip"></span><span id="drStatus" class="dr-chip">未読込</span></div>
      </div>
      <div id="drMessage" class="dr-message is-hidden"></div>
      <div class="dr-banner">1店舗・1日につき1つの共有日報です。早番は「下書き保存」、後番は内容を引き継いで追記し、最終勤務者が「日報提出」を行ってください。提出時は info@theforestgym.com と kawakamimihomiho@gmail.com の両方へ送信します。</div>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>担当スタッフ</h2><p>実際に当日の日報を入力・確認したスタッフを選択してください。複数選択できます。</p></div></div>
        <div id="drStaffChoices" class="dr-staff-choices"><div class="dr-empty">日報を開くとスタッフを読み込みます。</div></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>本日の実績</h2><p>Reserveの予約データから自動集計します。</p></div><button id="drReloadAuto" class="ghost-button" type="button">再読込</button></div>
        <div id="drAutoSummary" class="dr-summary-grid"><div class="dr-empty">日報を開くと予約実績を読み込みます。</div></div>
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
        <div id="drEquipmentDetail" class="dr-conditional is-hidden">
          <div class="dr-field"><span>対象</span><select id="drEquipmentCategory"><option>マシン・ラック</option><option>Akerun・入退室</option><option>タブレット・IT機器</option><option>空調・照明</option><option>シャワー・トイレ</option><option>備品</option><option>その他</option></select></div>
          <div class="dr-field"><span>内容</span><textarea id="drEquipmentMemo" rows="3" placeholder="状態と必要な対応を入力"></textarea></div>
          <div class="dr-field"><span>画像添付（最大5枚）</span><input id="drEquipmentImages" type="file" accept="image/*" multiple><small>選択した画像はiPad上で1枚ずつ最大1280pxに圧縮してから送信します。過去画像は軽量化のためリンクで表示します。</small><div id="drImageList" class="dr-image-list"><div class="dr-empty">画像はありません。</div></div></div>
        </div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>クレーム・事故・トラブル</h2><p>通常の問い合わせとは分けて記録します。</p></div></div>
        <div class="dr-radio-row"><label class="dr-radio"><input type="radio" name="drTrouble" value="NONE" checked>なし</label><label class="dr-radio"><input type="radio" name="drTrouble" value="ISSUE">あり</label></div>
        <div id="drTroubleDetail" class="dr-conditional is-hidden"><div class="dr-field"><span>区分</span><select id="drTroubleCategory"><option>クレーム</option><option>怪我・事故</option><option>利用ルール違反</option><option>会員間トラブル</option><option>入退室トラブル</option><option>その他</option></select></div><div class="dr-field"><span>対応区分</span><select id="drTroubleStatus"><option>要確認</option><option>要対応</option><option>対応済み</option></select></div><div class="dr-field"><span>内容</span><textarea id="drTroubleMemo" rows="3" placeholder="発生内容・対応内容を入力"></textarea></div></div>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>引継ぎ事項</h2><p>次のスタッフに伝える必要があることだけ入力します。</p></div></div>
        <div class="dr-field"><span>引継ぎ内容</span><textarea id="drHandover" rows="4" placeholder="例：○○様へ明日電話／ラック2の部品確認"></textarea></div>
        <label class="dr-radio" style="margin-top:10px"><input id="drHandoverAction" type="checkbox">次のスタッフによる対応が必要</label>
        <p class="dr-help">チェックあり＝次のスタッフが対応する必要があります。チェックなし＝情報共有のみで、追加対応は不要です。</p>
      </section>

      <section class="card dr-section">
        <div class="dr-section-head"><div><h2>その他メモ</h2><p>上記に含まれない事項がある場合のみ入力します。</p></div></div>
        <div class="dr-field"><textarea id="drOtherMemo" rows="3" placeholder="任意"></textarea></div>
      </section>

      <div class="dr-footer"><button id="drReviewButton" class="ghost-button" type="button">入力内容を確認</button><button id="drSaveButton" class="ghost-button" type="button" disabled>下書き保存</button><button id="drSubmitButton" class="primary-button" type="button" disabled>日報提出</button></div>
      <div id="drReview" class="dr-review is-hidden"></div>
    `;

    q("#drDate").value=REPORT_STATE.date;
    q("#drReporter").textContent=`入力者 ${reporterLabel()}`;
    renderCleaning();
    bind();
    resetForm();

    const nav=q('[data-view="dailyReport"]');
    if(nav?.classList.contains("is-active"))loadDay();
  }

  function renderCleaning(){
    const box=q("#drCleaning");if(!box)return;
    let itemIndex=0;
    box.innerHTML=CLEANING_AREAS.map(area=>`<section class="dr-clean-area">
      <div class="dr-clean-area-head"><h3>■${esc(area.name)}</h3></div>
      ${area.groups.map(group=>`<div class="dr-clean-group">
        ${group.name?`<h4>${esc(group.name)}</h4>`:""}
        ${group.items.map(item=>{const i=itemIndex;itemIndex+=1;return`<label class="dr-clean-item">
          <span class="dr-clean-copy"><span class="dr-clean-target">${esc(item.item)}</span>${item.instruction?`<span class="dr-clean-instruction">${esc(item.instruction)}</span>`:""}</span>
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
    q("#drReloadAuto").onclick=reloadAutoOnly;
    q("#drAllClean").onclick=()=>{qa("[data-dr-clean]").forEach(s=>s.value="DONE");markDirty();};
    q("#drAddInquiry").onclick=()=>addInquiry({},true);
    qa('input[name="drEquipment"]').forEach(r=>r.onchange=()=>q("#drEquipmentDetail").classList.toggle("is-hidden",r.checked&&r.value==="NONE"));
    qa('input[name="drTrouble"]').forEach(r=>r.onchange=()=>q("#drTroubleDetail").classList.toggle("is-hidden",r.checked&&r.value==="NONE"));
    q("#drEquipmentImages").onchange=handleImageSelection;
    q("#drImageList").onclick=handleImageRemove;
    q("#drReviewButton").onclick=review;
    q("#drSaveButton").onclick=()=>writeReport(false);
    q("#drSubmitButton").onclick=()=>writeReport(true);
    q("#dailyReportView").addEventListener("input",event=>{
      if(event.target.id!=="drDate"&&event.target.id!=="drEquipmentImages")markDirty();
    });
    q("#dailyReportView").addEventListener("change",event=>{
      if(event.target.id!=="drDate"&&event.target.id!=="drEquipmentImages")markDirty();
    });
    q('[data-view="dailyReport"]')?.addEventListener("click",()=>{
      q("#drReporter").textContent=`入力者 ${reporterLabel()}`;
      if(REPORT_STATE.status==="NOT_LOADED")loadDay();
    });
    window.addEventListener("beforeunload",event=>{
      if(!REPORT_STATE.dirty)return;
      event.preventDefault();
      event.returnValue="";
    });
  }

  function markDirty(){
    if(REPORT_STATE.applying||REPORT_STATE.status==="SUBMITTED")return;
    REPORT_STATE.dirty=true;
    if(REPORT_STATE.serverAvailable)setStatus("未保存の変更");
  }

  function moveDate(delta){
    const [year,month,day]=REPORT_STATE.date.split("-").map(Number);
    setDate(ymd(new Date(year,month-1,day+delta)));
  }

  function setDate(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||""))){
      q("#drDate").value=REPORT_STATE.date;
      return;
    }
    if(date===REPORT_STATE.date)return;
    if(REPORT_STATE.dirty&&!window.confirm("未保存の変更があります。破棄して別の日付を表示しますか？")){
      q("#drDate").value=REPORT_STATE.date;
      return;
    }
    REPORT_STATE.date=date;
    q("#drDate").value=date;
    q("#drReview").classList.add("is-hidden");
    loadDay();
  }

  function resetForm(){
    REPORT_STATE.applying=true;
    qa("[data-dr-clean]").forEach(s=>s.value="");
    if(q("#drCleaningMemo"))q("#drCleaningMemo").value="";
    q("#drInquiryList").innerHTML='<div class="dr-empty">本日の問い合わせは登録されていません。</div>';
    q('input[name="drEquipment"][value="NONE"]').checked=true;
    q("#drEquipmentDetail").classList.add("is-hidden");
    q("#drEquipmentCategory").value="マシン・ラック";
    q("#drEquipmentMemo").value="";
    q("#drEquipmentImages").value="";
    q('input[name="drTrouble"][value="NONE"]').checked=true;
    q("#drTroubleDetail").classList.add("is-hidden");
    q("#drTroubleCategory").value="クレーム";
    q("#drTroubleStatus").value="要確認";
    q("#drTroubleMemo").value="";
    q("#drHandover").value="";
    q("#drHandoverAction").checked=false;
    q("#drOtherMemo").value="";
    REPORT_STATE.existingImages=[];
    REPORT_STATE.newImages=[];
    renderImages();
    REPORT_STATE.applying=false;
  }

  async function loadDay(){
    if(!q("#dailyReportView")||!REPORT_STATE.date)return;
    const requestDate=REPORT_STATE.date;
    const sequence=++REPORT_STATE.daySequence;
    REPORT_STATE.busy=true;
    REPORT_STATE.serverAvailable=false;
    REPORT_STATE.version=0;
    REPORT_STATE.status="LOADING";
    REPORT_STATE.dirty=false;
    resetForm();
    setStatus("読込中");
    showMessage("",false);
    q("#drAutoSummary").innerHTML='<div class="staff-schedule-loading">予約実績を読み込んでいます…</div>';
    q("#drStaffChoices").innerHTML='<div class="staff-schedule-loading">担当スタッフを読み込んでいます…</div>';
    setActionState();

    const [staffResult,reportResult,autoResult]=await Promise.allSettled([
      fetchStaff(),
      apiGet("getDailyReport",{date:requestDate,store_code:STORE_CODE}),
      fetchAutoData(requestDate)
    ]);
    if(sequence!==REPORT_STATE.daySequence||requestDate!==REPORT_STATE.date)return;

    if(staffResult.status==="fulfilled"){
      REPORT_STATE.staff=normalizeStaffList(staffResult.value);
      REPORT_STATE.staffLoaded=true;
    }else{
      REPORT_STATE.staff=[];
    }

    if(autoResult.status==="fulfilled"){
      REPORT_STATE.autoRows=autoResult.value.rows;
      REPORT_STATE.scheduleShifts=autoResult.value.shifts;
      renderAuto();
    }else{
      REPORT_STATE.autoRows=[];
      REPORT_STATE.scheduleShifts=[];
      q("#drAutoSummary").innerHTML=`<div class="dr-empty">実績を取得できませんでした：${esc(autoResult.reason?.message||"取得失敗")}</div>`;
    }

    const record=reportResult.status==="fulfilled"?(reportResult.value?.data?.report||null):null;
    const savedStaff=Array.isArray(record?.report?.staff)?record.report.staff:[];
    ensureStaffEntries(REPORT_STATE.scheduleShifts);
    ensureStaffEntries(savedStaff);
    ensureStaffEntries([state?.authUser||{}]);
    renderStaffChoices();

    if(reportResult.status==="fulfilled"){
      REPORT_STATE.serverAvailable=true;
      if(record){
        applyReportRecord(record);
      }else{
        applyNewReportDefaults();
      }
    }else{
      applyNewReportDefaults();
      REPORT_STATE.serverAvailable=false;
      setStatus("保存接続エラー");
      showMessage(`日報の保存先へ接続できませんでした。GASの71_DailyReport.gsと99_Main.gsを反映して新しいデプロイを作成後、再読込してください。詳細：${reportResult.reason?.message||"取得失敗"}`,true);
    }

    REPORT_STATE.busy=false;
    REPORT_STATE.dirty=false;
    setActionState();
  }

  async function fetchStaff(){
    if(Array.isArray(state?.staff)&&state.staff.length)return state.staff;
    const json=await apiGet("getStaff",{include_inactive:"false"});
    return Array.isArray(json.data?.staff)?json.data.staff:(Array.isArray(json.data)?json.data:[]);
  }

  function normalizeStaffList(rows){
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(row=>row&&row.active!==false).map(row=>{
      const code=normalizeCode(row.staff_code);
      if(!code||seen.has(code))return null;
      seen.add(code);
      return {staff_code:code,staff_name:String(row.display_name||row.staff_name||row.name||code).trim()||code};
    }).filter(Boolean).sort((a,b)=>a.staff_name.localeCompare(b.staff_name,"ja"));
  }

  function ensureStaffEntries(rows){
    const map=new Map(REPORT_STATE.staff.map(item=>[item.staff_code,item]));
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const code=normalizeCode(row?.staff_code);
      if(!code||map.has(code))return;
      const item={staff_code:code,staff_name:String(row.display_name||row.staff_name||row.name||code).trim()||code};
      REPORT_STATE.staff.push(item);
      map.set(code,item);
    });
    REPORT_STATE.staff.sort((a,b)=>a.staff_name.localeCompare(b.staff_name,"ja"));
  }

  function renderStaffChoices(selectedCodes){
    const box=q("#drStaffChoices");if(!box)return;
    const selected=new Set(selectedCodes||selectedStaffCodes());
    box.innerHTML=REPORT_STATE.staff.length?REPORT_STATE.staff.map(item=>`<label class="dr-staff-choice"><input type="checkbox" data-dr-staff="${esc(item.staff_code)}" ${selected.has(item.staff_code)?"checked":""}><span>${esc(item.staff_name)}</span></label>`).join(""):'<div class="dr-empty">選択できるスタッフが見つかりません。</div>';
  }

  function selectedStaffCodes(){
    return [...qa("[data-dr-staff]:checked")].map(input=>normalizeCode(input.dataset.drStaff));
  }

  function selectStaffCodes(codes){
    const selected=new Set((codes||[]).map(normalizeCode));
    qa("[data-dr-staff]").forEach(input=>{input.checked=selected.has(normalizeCode(input.dataset.drStaff));});
  }

  function applyNewReportDefaults(){
    REPORT_STATE.status="NEW";
    REPORT_STATE.version=0;
    const shiftCodes=[...new Set(REPORT_STATE.scheduleShifts.map(row=>normalizeCode(row.staff_code)).filter(Boolean))];
    const currentCode=normalizeCode(state?.authUser?.staff_code);
    selectStaffCodes(shiftCodes.length?shiftCodes:(currentCode?[currentCode]:[]));
    setLocked(false);
    setStatus("未作成");
    renderImages();
  }

  function applyReportRecord(record){
    const data=record.report||{};
    REPORT_STATE.applying=true;
    const cleaningMap=new Map((Array.isArray(data.cleaning)?data.cleaning:[]).map(item=>[
      [item.area,item.group,item.item].join("|"),item.status||""
    ]));
    qa("[data-dr-clean]").forEach((select,index)=>{
      const item=CLEANING_ITEMS[index]||{};
      select.value=cleaningMap.get([item.area,item.group,item.item].join("|"))||data.cleaning?.[index]?.status||"";
    });
    q("#drCleaningMemo").value=data.cleaning_memo||"";
    q("#drInquiryList").innerHTML='<div class="dr-empty">本日の問い合わせは登録されていません。</div>';
    (data.inquiries||[]).forEach(item=>addInquiry(item,false));

    const equipmentValue=data.equipment?.has_issue?"ISSUE":"NONE";
    q(`input[name="drEquipment"][value="${equipmentValue}"]`).checked=true;
    q("#drEquipmentDetail").classList.toggle("is-hidden",equipmentValue==="NONE");
    setSelectValue(q("#drEquipmentCategory"),data.equipment?.category,"マシン・ラック");
    q("#drEquipmentMemo").value=data.equipment?.memo||"";

    const troubleValue=data.trouble?.has_issue?"ISSUE":"NONE";
    q(`input[name="drTrouble"][value="${troubleValue}"]`).checked=true;
    q("#drTroubleDetail").classList.toggle("is-hidden",troubleValue==="NONE");
    setSelectValue(q("#drTroubleCategory"),data.trouble?.category,"クレーム");
    setSelectValue(q("#drTroubleStatus"),data.trouble?.status,"要確認");
    q("#drTroubleMemo").value=data.trouble?.memo||"";
    q("#drHandover").value=data.handover?.memo||"";
    q("#drHandoverAction").checked=!!data.handover?.needs_action;
    q("#drOtherMemo").value=data.other_memo||"";
    selectStaffCodes((data.staff||[]).map(item=>item.staff_code));

    REPORT_STATE.existingImages=Array.isArray(record.images)?record.images.slice():[];
    REPORT_STATE.newImages=[];
    REPORT_STATE.version=Number(record.version||0);
    REPORT_STATE.status=String(record.status||"DRAFT").toUpperCase();
    REPORT_STATE.applying=false;
    renderImages();
    const locked=REPORT_STATE.status==="SUBMITTED"||REPORT_STATE.status==="SUBMITTING";
    setLocked(locked);
    setStatus(REPORT_STATE.status==="SUBMITTED"?"提出済み":REPORT_STATE.status==="SUBMITTING"?"送信中":"下書き");
    if(REPORT_STATE.status==="SUBMITTED")showMessage(`提出済みの日報です（${record.submitted_at||"提出日時不明"}）。閲覧のみできます。`,false);
    if(REPORT_STATE.status==="SUBMITTING")showMessage("別のスタッフがこの日報を送信中です。少し待って日付を再読込してください。",false);
  }

  function setSelectValue(select,value,fallback){
    if(!select)return;
    const desired=String(value||fallback||"");
    if([...select.options].some(option=>option.value===desired))select.value=desired;
    else select.value=fallback||select.options[0]?.value||"";
  }

  function setLocked(locked){
    qa("#dailyReportView .dr-section input,#dailyReportView .dr-section select,#dailyReportView .dr-section textarea").forEach(control=>{control.disabled=!!locked;});
    q("#drAllClean").disabled=!!locked;
    q("#drAddInquiry").disabled=!!locked;
    renderImages();
    setActionState();
  }

  async function fetchAutoData(date,force=false){
    const staffRequest=!force&&state?.staffScheduleDate===date&&state?.staffSchedule
      ? Promise.resolve({data:state.staffSchedule})
      : apiGet("getStaffSchedule",{date,store_code:STORE_CODE});
    const trainerRequest=!force&&state?.trainerScheduleDate===date&&state?.trainerSchedule
      ? Promise.resolve({data:state.trainerSchedule})
      : apiGet("getTrainerSchedule",{date,store_code:STORE_CODE});
    const [staffResult,trainerResult]=await Promise.allSettled([
      staffRequest,
      trainerRequest
    ]);
    if(staffResult.status==="rejected"&&trainerResult.status==="rejected")throw staffResult.reason;
    const payloads=[staffResult,trainerResult].filter(result=>result.status==="fulfilled").map(result=>result.value?.data||{});
    const rowMap=new Map();
    const shiftMap=new Map();
    payloads.forEach(payload=>{
      (Array.isArray(payload.reservations)?payload.reservations:[]).filter(row=>String(row.status||"").toUpperCase()!=="CANCELLED").forEach(row=>{
        const key=String(row.reservation_id||`${date}|${row.start_time}|${row.customer_name}|${row.service_code||row.service_name}`);
        if(!rowMap.has(key))rowMap.set(key,row);
      });
      (Array.isArray(payload.shifts)?payload.shifts:[]).forEach(row=>{
        const key=`${row.staff_code}|${row.start_time}|${row.end_time}`;
        if(!shiftMap.has(key))shiftMap.set(key,row);
      });
    });
    return {rows:[...rowMap.values()],shifts:[...shiftMap.values()]};
  }

  async function reloadAutoOnly(){
    if(REPORT_STATE.busy)return;
    const button=q("#drReloadAuto");
    button.disabled=true;
    q("#drAutoSummary").innerHTML='<div class="staff-schedule-loading">予約実績を読み込んでいます…</div>';
    try{
      const result=await fetchAutoData(REPORT_STATE.date,true);
      REPORT_STATE.autoRows=result.rows;
      REPORT_STATE.scheduleShifts=result.shifts;
      const selected=selectedStaffCodes();
      ensureStaffEntries(result.shifts);
      renderStaffChoices(selected);
      if(REPORT_STATE.status==="NEW"&&!selected.length){
        selectStaffCodes([...new Set(result.shifts.map(row=>normalizeCode(row.staff_code)).filter(Boolean))]);
      }
      renderAuto();
      showMessage("予約実績を再読込しました。",false);
    }catch(error){
      q("#drAutoSummary").innerHTML=`<div class="dr-empty">実績を取得できませんでした：${esc(error?.message||"取得失敗")}</div>`;
    }finally{
      button.disabled=false;
    }
  }

  function renderAuto(){
    const box=q("#drAutoSummary");if(!box)return;
    const counts=new Map();
    REPORT_STATE.autoRows.forEach(row=>{const key=serviceShort(row);counts.set(key,(counts.get(key)||0)+1);});
    const ordered=["見学","ダイエット相談","退会手続","諸手続","食事相談","トレサポ","パーソナル","無料体験"];
    box.innerHTML=[`<div class="dr-summary-card"><strong>${REPORT_STATE.autoRows.length}</strong><span>予約合計</span></div>`]
      .concat(ordered.map(key=>`<div class="dr-summary-card"><strong>${counts.get(key)||0}</strong><span>${esc(key)}</span></div>`)).join("");
  }

  function addInquiry(data={},shouldMark=true){
    const list=q("#drInquiryList");
    list.querySelector(".dr-empty")?.remove();
    const row=document.createElement("div");
    row.className="dr-inquiry";
    row.innerHTML=`<div class="dr-inquiry-grid">
      <label class="dr-field"><span>受付経路</span><select data-i="channel"><option>来店（直接）</option><option>電話</option><option>LINE</option><option>メール</option></select></label>
      <label class="dr-field"><span>時刻</span><input data-i="time" type="time"></label>
      <label class="dr-field"><span>氏名</span><input data-i="name" type="text" placeholder="任意"></label>
      <label class="dr-field"><span>会員番号</span><input data-i="member" type="text" inputmode="numeric" maxlength="6" placeholder="任意"></label>
      <label class="dr-field"><span>対応状況</span><select data-i="status"><option>未対応</option><option>対応中</option><option>引継ぎ</option><option>対応済み</option></select></label>
      <label class="dr-field"><span>分類</span><select data-i="category"><option>見学・入会</option><option>退会・休会</option><option>料金・契約</option><option>トレーニング</option><option>設備・利用方法</option><option>その他</option></select></label>
      <label class="dr-field detail"><span>問い合わせ内容・対応内容</span><textarea data-i="detail" rows="2" placeholder="要点だけ入力"></textarea></label>
    </div><div class="dr-inline-actions" style="justify-content:flex-end;margin-top:8px"><button class="danger-ghost" data-i-remove type="button">削除</button></div>`;
    const set=(key,value)=>{const element=row.querySelector(`[data-i="${key}"]`);if(element&&value!=null)element.value=value;};
    set("channel",data.channel||"来店（直接）");
    set("time",data.time||"");
    set("name",data.name||"");
    set("member",data.member_no||"");
    set("status",data.status||"未対応");
    set("category",data.category||"見学・入会");
    set("detail",data.detail||"");
    row.querySelector("[data-i-remove]").onclick=()=>{
      row.remove();
      if(!list.querySelector(".dr-inquiry"))list.innerHTML='<div class="dr-empty">本日の問い合わせは登録されていません。</div>';
      markDirty();
    };
    list.appendChild(row);
    if(shouldMark)markDirty();
  }

  function serialize(){
    const cleaning=[...qa("[data-dr-clean]")].map((select,i)=>({
      area:CLEANING_ITEMS[i]?.area||"",
      group:CLEANING_ITEMS[i]?.group||"",
      item:CLEANING_ITEMS[i]?.item||"",
      instruction:CLEANING_ITEMS[i]?.instruction||"",
      status:select.value
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
    const staffMap=new Map(REPORT_STATE.staff.map(item=>[item.staff_code,item]));
    const staff=selectedStaffCodes().map(code=>staffMap.get(code)||{staff_code:code,staff_name:code});
    return {
      date:REPORT_STATE.date,
      store_code:STORE_CODE,
      reporter:reporterLabel(),
      reporter_code:state?.authUser?.staff_code||"",
      staff,
      cleaning,
      cleaning_memo:q("#drCleaningMemo")?.value.trim()||"",
      inquiries,
      equipment:{has_issue:q('input[name="drEquipment"]:checked')?.value==="ISSUE",category:q("#drEquipmentCategory")?.value||"",memo:q("#drEquipmentMemo")?.value.trim()||""},
      trouble:{has_issue:q('input[name="drTrouble"]:checked')?.value==="ISSUE",category:q("#drTroubleCategory")?.value||"",status:q("#drTroubleStatus")?.value||"",memo:q("#drTroubleMemo")?.value.trim()||""},
      handover:{memo:q("#drHandover")?.value.trim()||"",needs_action:!!q("#drHandoverAction")?.checked},
      other_memo:q("#drOtherMemo")?.value.trim()||"",
      reservation_count:REPORT_STATE.autoRows.length
    };
  }

  function review(){
    const data=serialize();
    const missing=data.cleaning.filter(item=>!item.status);
    const notDone=data.cleaning.filter(item=>item.status==="NOT_DONE");
    const inquiryStatus=data.inquiries.reduce((map,item)=>(map[item.status]=(map[item.status]||0)+1,map),{});
    const imageCount=REPORT_STATE.existingImages.length+REPORT_STATE.newImages.length;
    const lines=[
      `${data.date}　担当：${data.staff.map(item=>item.staff_name).join("、")||"未選択"}`,
      `予約実績：${data.reservation_count}件`,
      `清掃：完了 ${data.cleaning.filter(item=>item.status==="DONE").length}／未完了 ${notDone.length}／対象外 ${data.cleaning.filter(item=>item.status==="NA").length}／未確認 ${missing.length}`,
      `問い合わせ：${data.inquiries.length}件${data.inquiries.length?`（未対応 ${inquiryStatus["未対応"]||0}・対応中 ${inquiryStatus["対応中"]||0}・引継ぎ ${inquiryStatus["引継ぎ"]||0}・対応済み ${inquiryStatus["対応済み"]||0}）`:""}`,
      `設備異常：${data.equipment.has_issue?"あり":"なし"}／画像 ${imageCount}枚`,
      `クレーム・事故・トラブル：${data.trouble.has_issue?"あり":"なし"}`,
      `引継ぎ：${data.handover.memo?(data.handover.needs_action?"次のスタッフの対応が必要":"情報共有のみ"):"なし"}`
    ];
    const box=q("#drReview");
    box.classList.remove("is-hidden");
    box.innerHTML=`<h3>入力内容の確認</h3><pre>${esc(lines.join("\n"))}</pre>${missing.length?`<div class="dr-required-note" style="margin-top:10px">清掃チェックに未確認が ${missing.length} 件あります。</div>`:""}`;
    box.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  async function writeReport(shouldSubmit){
    if(REPORT_STATE.busy||REPORT_STATE.imageProcessing||!REPORT_STATE.serverAvailable)return;
    const report=serialize();
    if(!report.staff.length){
      showMessage("担当スタッフを1名以上選択してください。",true);
      q("#drStaffChoices")?.scrollIntoView({behavior:"smooth",block:"center"});
      return;
    }
    if(shouldSubmit&&!window.confirm("この日報を確定し、管理用メール2宛先へ送信します。提出後は編集できません。よろしいですか？"))return;

    REPORT_STATE.busy=true;
    setActionState();
    showMessage(shouldSubmit?"日報を提出しています…":"下書きを保存しています…",false);
    try{
      const json=await apiPost({
        action:shouldSubmit?"submitDailyReport":"saveDailyReport",
        date:REPORT_STATE.date,
        store_code:STORE_CODE,
        version:REPORT_STATE.version,
        report,
        existing_image_ids:REPORT_STATE.existingImages.map(image=>image.file_id),
        images:REPORT_STATE.newImages.map(image=>({file_name:image.file_name,mime_type:image.mime_type,data_base64:image.data_base64}))
      });
      const record=json.data?.report;
      if(!record)throw new Error("保存結果を確認できませんでした。");
      applyReportRecord(record);
      REPORT_STATE.dirty=false;
      q("#drEquipmentImages").value="";
      showMessage(json.data?.message||(shouldSubmit?"日報を提出しました。":"下書きを保存しました。"),false);
    }catch(error){
      const message=String(error?.message||"保存に失敗しました。");
      showMessage(`${message}${message.includes("更新")?" 入力内容を控えてから日付を再読込してください。":""}`,true);
    }finally{
      REPORT_STATE.busy=false;
      setActionState();
    }
  }

  async function handleImageSelection(event){
    const files=[...(event.target.files||[])];
    event.target.value="";
    const available=MAX_IMAGES-REPORT_STATE.existingImages.length-REPORT_STATE.newImages.length;
    if(available<=0){showMessage("画像は最大5枚です。不要な画像を削除してから追加してください。",true);return;}
    if(files.length>available){showMessage(`追加できる画像は残り${available}枚です。先頭から${available}枚だけ処理します。`,true);}

    REPORT_STATE.imageProcessing=true;
    setActionState();
    const errors=[];
    for(const file of files.slice(0,available)){
      try{
        showMessage(`画像を圧縮しています（${REPORT_STATE.newImages.length+1}/${Math.min(files.length,available)}）…`,false);
        REPORT_STATE.newImages.push(await compressImageFile(file));
        renderImages();
      }catch(error){
        errors.push(`${file.name}：${error?.message||"処理失敗"}`);
      }
    }
    REPORT_STATE.imageProcessing=false;
    if(REPORT_STATE.newImages.length)markDirty();
    setActionState();
    showMessage(errors.length?`処理できない画像がありました。${errors.join("／")}`:"画像を圧縮して追加しました。まだサーバーには保存されていません。",!!errors.length);
  }

  function compressImageFile(file){
    if(!String(file?.type||"").startsWith("image/"))return Promise.reject(new Error("画像ファイルではありません。"));
    return readFileAsDataUrl(file).then(dataUrl=>loadImage(dataUrl)).then(image=>{
      const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));
      let width=Math.max(1,Math.round((image.naturalWidth||image.width)*scale));
      let height=Math.max(1,Math.round((image.naturalHeight||image.height)*scale));
      let quality=.76;
      let output="";
      for(let attempt=0;attempt<6;attempt+=1){
        const canvas=document.createElement("canvas");
        canvas.width=width;
        canvas.height=height;
        const context=canvas.getContext("2d",{alpha:false});
        if(!context)throw new Error("画像を圧縮できません。別の画像を選択してください。");
        context.fillStyle="#fff";
        context.fillRect(0,0,width,height);
        context.drawImage(image,0,0,width,height);
        output=canvas.toDataURL("image/jpeg",quality);
        canvas.width=1;
        canvas.height=1;
        if(base64Bytes(output)<=CLIENT_IMAGE_MAX_BYTES)break;
        quality=Math.max(.48,quality-.09);
        if(attempt>=2){width=Math.max(1,Math.round(width*.84));height=Math.max(1,Math.round(height*.84));}
      }
      image.src="";
      const size=base64Bytes(output);
      if(!output||size>CLIENT_IMAGE_MAX_BYTES)throw new Error("圧縮後も画像が大きすぎます。別の画像を選択してください。");
      const baseName=String(file.name||"設備異常").replace(/\.[^.]+$/,"");
      return {
        local_id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file_name:`${baseName}.jpg`,
        mime_type:"image/jpeg",
        data_base64:output.split(",")[1]||"",
        size_bytes:size
      };
    });
  }

  function readFileAsDataUrl(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||""));
      reader.onerror=()=>reject(new Error("画像を読み込めません。"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl){
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error("この画像形式は端末で読み込めません。"));
      image.src=dataUrl;
    });
  }

  function base64Bytes(value){
    const base64=String(value||"").split(",").pop()||"";
    return Math.floor(base64.length*3/4);
  }

  function handleImageRemove(event){
    const button=event.target.closest("[data-image-remove]");
    if(!button||REPORT_STATE.status==="SUBMITTED")return;
    const kind=button.dataset.imageKind;
    const id=button.dataset.imageRemove;
    if(kind==="existing")REPORT_STATE.existingImages=REPORT_STATE.existingImages.filter(image=>String(image.file_id)!==id);
    else REPORT_STATE.newImages=REPORT_STATE.newImages.filter(image=>String(image.local_id)!==id);
    renderImages();
    markDirty();
  }

  function renderImages(){
    const box=q("#drImageList");if(!box)return;
    const locked=REPORT_STATE.status==="SUBMITTED"||REPORT_STATE.status==="SUBMITTING";
    const rows=[];
    REPORT_STATE.existingImages.forEach(image=>{
      const name=image.original_name||image.file_name||"保存済み画像";
      const label=`${name}（保存済み・${formatBytes(image.size_bytes)}）`;
      rows.push(`<div class="dr-image-row">${image.url?`<a href="${esc(image.url)}" target="_blank" rel="noopener">${esc(label)}</a>`:`<span>${esc(label)}</span>`}${locked?"":`<button class="danger-ghost" type="button" data-image-kind="existing" data-image-remove="${esc(image.file_id)}">削除</button>`}</div>`);
    });
    REPORT_STATE.newImages.forEach(image=>{
      rows.push(`<div class="dr-image-row"><span>${esc(image.file_name)}（未保存・${formatBytes(image.size_bytes)}）</span><button class="danger-ghost" type="button" data-image-kind="new" data-image-remove="${esc(image.local_id)}">削除</button></div>`);
    });
    box.innerHTML=rows.length?rows.join(""):'<div class="dr-empty">画像はありません。</div>';
  }

  function formatBytes(value){
    const bytes=Number(value||0);
    return bytes>=1024?`${Math.round(bytes/1024)}KB`:`${bytes}B`;
  }

  function setStatus(text){
    const chip=q("#drStatus");if(chip)chip.textContent=text;
  }

  function showMessage(text,isError){
    const box=q("#drMessage");if(!box)return;
    box.textContent=text||"";
    box.classList.toggle("is-hidden",!text);
    box.classList.toggle("is-error",!!isError);
  }

  function setActionState(){
    const locked=REPORT_STATE.status==="SUBMITTED"||REPORT_STATE.status==="SUBMITTING";
    const disabled=!REPORT_STATE.serverAvailable||REPORT_STATE.busy||REPORT_STATE.imageProcessing||locked;
    if(q("#drSaveButton"))q("#drSaveButton").disabled=disabled;
    if(q("#drSubmitButton"))q("#drSubmitButton").disabled=disabled;
    if(q("#drEquipmentImages"))q("#drEquipmentImages").disabled=disabled;
  }

  function boot(){
    if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"){setTimeout(boot,100);return;}
    const nav=q('[data-view="dailyReport"]');
    if(nav?.classList.contains("is-active"))build();
    else nav?.addEventListener("click",build,{once:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
