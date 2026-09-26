(()=>{
  "use strict";

  const FALLBACK_STORE_CODE="SOGA";
  const SG={month:nextMonth_(),storeCode:"",stores:[],slots:[],requests:[],staff:[],selectedRequests:new Set(),assignments:new Map(),publication:null,mode:"request",dirty:false,built:false};
  const q=s=>document.querySelector(s);
  const qa=s=>Array.from(document.querySelectorAll(s));
  const h=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const bool=v=>v===true||["TRUE","1","YES","ON"].includes(String(v||"").trim().toUpperCase());
  const permission=()=>String(state?.authUser?.permission||"STAFF").toUpperCase();
  const management=()=>["ADMIN","MANAGER"].includes(permission());
  const administrator=()=>permission()==="ADMIN";
  const key=(date,start,staff="")=>[date,start,staff].filter(Boolean).join("|");

  function nextMonth_(){const d=new Date();d.setMonth(d.getMonth()+1,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
  function moveMonth_(amount){const [y,m]=SG.month.split("-").map(Number),d=new Date(y,m-1+amount,1);SG.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;SG.dirty=false;loadMode_()}
  function monthDates_(){const [y,m]=SG.month.split("-").map(Number),last=new Date(y,m,0).getDate();return Array.from({length:last},(_,i)=>`${SG.month}-${String(i+1).padStart(2,"0")}`)}
  function dateLabel_(date){const [y,m,d]=date.split("-").map(Number),w=["日","月","火","水","木","金","土"];return `${m}/${d}（${w[new Date(y,m-1,d).getDay()]}）`}
  function monthLabel_(){const [y,m]=SG.month.split("-").map(Number);return `${y}年${m}月`}
  function personLabel_(staff){const name=String(staff?.display_name||staff?.staff_name||staff?.staff_code||"").trim();if(String(staff?.role||"").toUpperCase()==="TRAINER")return name.endsWith("トレーナー")?name:`${name}トレーナー`;return name.endsWith("さん")?name:`${name}さん`}
  function message_(text,error=false){const box=q("#sogaShiftMessage");if(!box)return;box.textContent=text||"";box.classList.toggle("is-hidden",!text);box.classList.toggle("is-error",!!error)}
  function loading_(text="読み込んでいます…"){q("#sogaShiftBody").innerHTML=`<div class="soga-empty">${h(text)}</div>`}

  function injectCss_(){
    if(q("#sogaShiftCss"))return;
    const style=document.createElement("style");style.id="sogaShiftCss";style.textContent=`
      .soga-shell{display:grid;gap:14px}.soga-toolbar{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:13px 15px}.soga-toolbar-center{text-align:center}.soga-toolbar-center strong{display:block;font-size:17px}.soga-toolbar-center small{display:block;margin-top:3px;color:#91a198}.soga-store-select{min-height:40px;border:1px solid #345047;border-radius:10px;background:#10231d;color:#fff;padding:7px 10px;font-weight:800}.soga-mode-tabs{display:flex;gap:8px;flex-wrap:wrap}.soga-mode-tab{border:1px solid #345047;border-radius:10px;background:#10231d;color:#aebbb4;padding:10px 16px;font-weight:900}.soga-mode-tab.is-active{border-color:#63d179;background:#1d4d31;color:#fff}.soga-help{padding:13px 15px;border:1px solid #294037;border-radius:12px;background:#10231d;color:#cbd6d0;line-height:1.65;font-size:13px}.soga-help b{color:#7de092}.soga-publication{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid #294037;border-radius:12px;background:#10231d}.soga-publication strong,.soga-publication small{display:block}.soga-publication small{margin-top:4px;color:#91a198;line-height:1.55}.soga-publication .is-published{color:#7de092}.soga-publication .is-draft{color:#ffcf7d}.soga-final-tools{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.soga-submit-bar{position:sticky;bottom:10px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #345047;border-radius:14px;background:rgba(12,27,22,.96);box-shadow:0 12px 36px rgba(0,0,0,.38)}.soga-submit-bar strong{color:#fff}.soga-submit-bar small{display:block;color:#91a198;margin-top:3px}.soga-day-list{display:grid;gap:12px}.soga-day{overflow:hidden;border:1px solid #294037;border-radius:14px;background:#10231d}.soga-day summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;color:#fff;font-weight:900;list-style:none}.soga-day summary::-webkit-details-marker{display:none}.soga-day summary small{color:#91a198}.soga-request-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 14px 14px}.soga-request-slot{min-height:48px;border:1px solid #345047;border-radius:10px;background:#0d1e18;color:#c8d3cd;font-weight:900}.soga-request-slot.is-selected{border-color:#7be292;background:#2d7e45;color:#fff;box-shadow:0 5px 14px rgba(76,191,99,.22)}.soga-final-slots{display:grid}.soga-final-slot{display:grid;grid-template-columns:116px minmax(0,1fr);gap:12px;align-items:start;padding:12px 14px;border-top:1px solid #294037}.soga-slot-time{padding-top:10px;color:#fff;font-weight:900}.soga-candidates{display:flex;gap:8px;flex-wrap:wrap}.soga-candidate{min-width:148px;min-height:48px;border:1px solid #3a5147;border-radius:11px;background:#14231d;color:#d8e1dc;padding:7px 11px;text-align:left}.soga-candidate strong,.soga-candidate small{display:block}.soga-candidate small{margin-top:3px;color:#91a198;font-weight:800}.soga-candidate.is-shift{border-color:#7be292;background:#2d7e45;color:#fff}.soga-candidate.is-trial{border-color:#f0bc4d;background:#805c14;color:#fff;box-shadow:0 5px 14px rgba(240,188,77,.18)}.soga-candidate.is-shift small,.soga-candidate.is-trial small{color:#fff}.soga-no-candidate{padding:10px 0;color:#6f7e76}.soga-import{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;padding:14px;border:1px solid #294037;border-radius:12px;background:#10231d}.soga-import label{display:grid;gap:7px;color:#fff;font-size:13px;font-weight:900}.soga-import input{min-height:42px;border:1px solid #345047;border-radius:10px;background:#0d1e18;color:#fff;padding:8px}.soga-empty{padding:28px;border:1px dashed #345047;border-radius:14px;color:#91a198;text-align:center}.soga-legend{display:flex;gap:8px;flex-wrap:wrap}.soga-legend span{padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900}.soga-legend .wish{background:#1b2e26;color:#cdd8d2}.soga-legend .shift{background:#2d7e45;color:#fff}.soga-legend .trial{background:#805c14;color:#fff}
      @media(max-width:700px){.soga-toolbar{grid-template-columns:1fr}.soga-toolbar-center{order:-1}.soga-store-select{width:100%}.soga-request-grid{grid-template-columns:1fr}.soga-final-slot{grid-template-columns:1fr}.soga-slot-time{padding-top:0}.soga-candidates{display:grid;grid-template-columns:1fr 1fr}.soga-candidate{min-width:0;width:100%}.soga-import{grid-template-columns:1fr}.soga-publication,.soga-submit-bar{align-items:stretch;flex-direction:column}.soga-publication button,.soga-submit-bar button{width:100%}}
    `;document.head.appendChild(style);
  }

  async function resolveAccess_(){
    if(management())return true;
    try{
      const result=await apiGet("getStaff",{include_inactive:"false"});
      const rows=Array.isArray(result.data?.staff)?result.data.staff:(Array.isArray(result.data)?result.data:[]);
      const me=rows.find(row=>String(row.staff_code)===String(state.authUser?.staff_code));
      if(!me)return false;
      const storeText=`${me.store_code||""} ${me.store_name||""}`;
      return bool(me.can_9round)||/(SOGA|蘇我|9ROUND|9ラウンド|アリオ)/i.test(storeText);
    }catch(_){return false}
  }

  async function loadStores_(){
    try{const result=await apiGet("getStores");SG.stores=(Array.isArray(result.data)?result.data:[]).filter(row=>row.active!==false&&/(SOGA|蘇我|9ROUND|9ラウンド|アリオ)/i.test(`${row.store_code||""} ${row.store_name||""}`))}catch(_){SG.stores=[]}
    const preferred=SG.stores.find(row=>/(SOGA|蘇我|9ROUND|9ラウンド|アリオ)/i.test(`${row.store_code||""} ${row.store_name||""}`));
    SG.storeCode=String(preferred?.store_code||FALLBACK_STORE_CODE).trim().toUpperCase();
  }

  async function backendReady_(){
    try{
      await Promise.all([
        apiGet("getMySogaShiftRequests",{month:SG.month,store_code:SG.storeCode}),
        apiGet("getStaffShiftPublication",{month:SG.month,store_code:SG.storeCode})
      ]);
      return true;
    }catch(_){return false}
  }

  function build_(){
    if(SG.built)return;SG.built=true;SG.mode=management()?"final":"request";injectCss_();
    const nav=document.createElement("button");nav.id="sogaShiftNav";nav.className="nav-button";nav.dataset.view="sogaShift";nav.innerHTML=management()?"<span>🥊</span>9ROUNDシフト":"<span>🥊</span>希望シフト";
    const topnav=q(".topnav"),registration=topnav?.querySelector('[data-view="registration"]');if(registration)topnav.insertBefore(nav,registration);else topnav?.appendChild(nav);
    const section=document.createElement("section");section.id="sogaShiftView";section.className="view";section.innerHTML=`
      <div class="page-heading"><div><p class="eyebrow">9ROUND ARIO SOGA</p><h1>9ROUNDシフト</h1><p>希望シフトの提出と、公開前の月次シフト調整を行います。</p></div></div>
      <div class="soga-shell">
        <div class="soga-toolbar card"><div class="toolbar-group"><button id="sogaPrev" class="icon-button" type="button">‹</button><button id="sogaNext" class="icon-button" type="button">›</button></div><div class="soga-toolbar-center"><strong id="sogaMonthLabel"></strong><small>10:15〜14:00 / 16:15〜20:45</small></div><select id="sogaStore" class="soga-store-select"></select></div>
        <div id="sogaModeTabs" class="soga-mode-tabs"></div><div id="sogaShiftMessage" class="form-message is-hidden"></div><div id="sogaShiftBody"></div>
      </div>`;
    q("main.main")?.insertBefore(section,q("#registrationView"));
    nav.onclick=()=>open_();q("#sogaPrev").onclick=()=>moveMonth_(-1);q("#sogaNext").onclick=()=>moveMonth_(1);q("#sogaStore").onchange=()=>{SG.storeCode=q("#sogaStore").value;SG.dirty=false;loadMode_()};
    renderStoreOptions_();renderTabs_();if(typeof enforceSogaStaffUi_==="function")enforceSogaStaffUi_();
  }

  function renderStoreOptions_(){const select=q("#sogaStore");if(!select)return;const rows=SG.stores.length?SG.stores:[{store_code:FALLBACK_STORE_CODE,store_name:"9ROUND アリオ蘇我店"}];select.innerHTML=rows.map(row=>`<option value="${h(row.store_code)}">${h(row.store_name||row.store_code)}</option>`).join("");if(rows.some(row=>String(row.store_code)===SG.storeCode))select.value=SG.storeCode;else{select.value=rows[0].store_code;SG.storeCode=select.value}}
  function renderTabs_(){const box=q("#sogaModeTabs");if(!box)return;box.innerHTML=`<button class="soga-mode-tab ${SG.mode==="request"?"is-active":""}" data-soga-mode="request">希望提出</button>${management()?`<button class="soga-mode-tab ${SG.mode==="final"?"is-active":""}" data-soga-mode="final">シフト調整・公開</button>`:""}`;box.querySelectorAll("[data-soga-mode]").forEach(button=>button.onclick=()=>{SG.mode=button.dataset.sogaMode;SG.dirty=false;renderTabs_();loadMode_()})}
  function open_(){qa(".nav-button").forEach(button=>button.classList.toggle("is-active",button.id==="sogaShiftNav"));qa(".view").forEach(view=>view.classList.toggle("is-active",view.id==="sogaShiftView"));loadMode_()}
  async function loadMode_(){q("#sogaMonthLabel").textContent=monthLabel_();message_("");loading_();if(SG.mode==="final"&&management())await loadFinal_();else await loadRequests_()}

  async function loadRequests_(){
    try{const result=await apiGet("getMySogaShiftRequests",{month:SG.month,store_code:SG.storeCode});SG.slots=result.data?.slots||[];SG.selectedRequests=new Set((result.data?.requests||[]).map(row=>key(row.date,row.start_time)));renderRequestForm_()}catch(error){q("#sogaShiftBody").innerHTML=`<div class="soga-empty">${h(error.message||"希望枠を取得できませんでした。")}</div>`}
  }
  function renderRequestForm_(){const body=q("#sogaShiftBody"),days=monthDates_();body.innerHTML=`<div class="soga-help"><b>希望する枠をすべてタップ</b>してください。緑が選択中です。選び終わったら、画面下の「希望シフトを送信」を押してください。</div><div class="soga-day-list">${days.map(date=>{const count=SG.slots.filter(slot=>SG.selectedRequests.has(key(date,slot.start_time))).length;return `<details class="soga-day" ${count?"open":""}><summary><span>${h(dateLabel_(date))}</span><small data-request-day-count="${date}">${count}枠選択</small></summary><div class="soga-request-grid">${SG.slots.map(slot=>{const k=key(date,slot.start_time),selected=SG.selectedRequests.has(k);return `<button type="button" class="soga-request-slot ${selected?"is-selected":""}" data-request-date="${date}" data-request-start="${slot.start_time}" data-request-end="${slot.end_time}">${h(slot.start_time)}〜${h(slot.end_time)}</button>`}).join("")}</div></details>`}).join("")}</div><div class="soga-submit-bar"><div><strong id="sogaRequestTotal">${SG.selectedRequests.size}枠を選択中</strong><small>送信すると、この月の希望内容を上書きします。</small></div><button id="sogaSubmitRequests" class="primary-button" type="button">希望シフトを送信</button></div>`;
    body.querySelectorAll(".soga-request-slot").forEach(button=>button.onclick=()=>{const k=key(button.dataset.requestDate,button.dataset.requestStart);if(SG.selectedRequests.has(k))SG.selectedRequests.delete(k);else SG.selectedRequests.add(k);button.classList.toggle("is-selected",SG.selectedRequests.has(k));q("#sogaRequestTotal").textContent=`${SG.selectedRequests.size}枠を選択中`;const dayCount=SG.slots.filter(slot=>SG.selectedRequests.has(key(button.dataset.requestDate,slot.start_time))).length;body.querySelector(`[data-request-day-count="${button.dataset.requestDate}"]`).textContent=`${dayCount}枠選択`});q("#sogaSubmitRequests").onclick=submitRequests_;
  }
  async function submitRequests_(){const button=q("#sogaSubmitRequests");if(!confirm(`${monthLabel_()}の希望 ${SG.selectedRequests.size}枠を送信しますか？`))return;button.disabled=true;button.textContent="送信中…";try{const rows=[];monthDates_().forEach(date=>SG.slots.forEach(slot=>{if(SG.selectedRequests.has(key(date,slot.start_time)))rows.push({date,start_time:slot.start_time,end_time:slot.end_time})}));const result=await apiPost({action:"saveMySogaShiftRequests",month:SG.month,store_code:SG.storeCode,requests:rows});message_(`希望シフトを送信しました（${result.data?.saved_count||0}枠）。`)}catch(error){message_(error.message||"希望シフトを送信できませんでした。",true)}finally{button.disabled=false;button.textContent="希望シフトを送信"}}

  async function loadFinal_(){
    try{const [result,status]=await Promise.all([apiGet("getSogaShiftBoard",{month:SG.month,store_code:SG.storeCode}),apiGet("getStaffShiftPublication",{month:SG.month,store_code:SG.storeCode})]);SG.slots=result.data?.slots||[];SG.requests=result.data?.requests||[];SG.staff=result.data?.staff||[];SG.assignments=new Map((result.data?.assignments||[]).map(row=>[key(row.date,row.start_time,row.staff_code),row.assignment_type||"SHIFT"]));SG.publication=status.data||null;SG.dirty=false;renderFinal_()}catch(error){q("#sogaShiftBody").innerHTML=`<div class="soga-empty">${h(error.message||"シフト希望を取得できませんでした。")}</div>`}
  }
  function publicationHtml_(){const published=SG.publication?.is_published===true,legacy=SG.publication?.legacy_published===true,statusText=published?"公開済み":"公開前（ADMIN / MANAGERのみ閲覧可能）";let note=published?"予定一覧と各スタッフの個人シフトに表示されています。":"調整内容を保存しても、ADMINが公開するまでスタッフには表示されません。";if(legacy)note="2026年9月以前は従来どおり公開済みとして扱います。";const button=administrator()?`<button id="sogaPublishMonth" class="primary-button" type="button" ${published?"disabled":""}>${published?"公開済み":"スタッフへ公開"}</button>`:"<small>公開操作はADMINのみ行えます。</small>";return `<div class="soga-publication"><div><strong class="${published?"is-published":"is-draft"}">${h(statusText)}</strong><small>${h(note)}</small></div>${button}</div>`}
  function renderFinal_(){
    const staffMap=new Map(SG.staff.map(staff=>[String(staff.staff_code),staff])),requestBySlot=new Map();SG.requests.forEach(row=>{const k=key(row.date,row.start_time);if(!requestBySlot.has(k))requestBySlot.set(k,new Set());requestBySlot.get(k).add(String(row.staff_code))});SG.assignments.forEach((_,assignmentKey)=>{const [date,start,staffCode]=assignmentKey.split("|");const k=key(date,start);if(!requestBySlot.has(k))requestBySlot.set(k,new Set());requestBySlot.get(k).add(staffCode)});
    const activeDates=monthDates_().filter(date=>SG.slots.some(slot=>(requestBySlot.get(key(date,slot.start_time))||new Set()).size));
    q("#sogaShiftBody").innerHTML=`${publicationHtml_()}<div class="soga-help"><b>「希望を全てシフトへ入れる」で、全スタッフの希望枠を人数制限なく一括選択</b>できます。その後、各カードをタップしてシフト・体験担当・取消を調整してください。</div><div class="soga-legend"><span class="wish">希望</span><span class="shift">シフトイン</span><span class="trial">体験担当</span></div><div class="soga-final-tools"><button id="sogaSelectAllRequests" class="primary-button" type="button" ${SG.requests.length?"":"disabled"}>希望を全てシフトへ入れる</button><button id="sogaPrintShift" class="ghost-button" type="button">A4印刷 / PDF</button></div><div class="soga-import"><label>希望CSV（staff_code,date,start_time,end_time）<input id="sogaRequestCsv" type="file" accept=".csv,text/csv"></label><button id="sogaImportRequests" class="ghost-button" type="button">希望CSVを取り込む</button></div>${activeDates.length?`<div class="soga-day-list">${activeDates.map(date=>`<details class="soga-day" open><summary><span>${h(dateLabel_(date))}</span><small>${SG.slots.reduce((sum,slot)=>sum+(requestBySlot.get(key(date,slot.start_time))?.size||0),0)}希望</small></summary><div class="soga-final-slots">${SG.slots.map(slot=>{const codes=Array.from(requestBySlot.get(key(date,slot.start_time))||[]);return `<div class="soga-final-slot"><div class="soga-slot-time">${h(slot.start_time)}〜${h(slot.end_time)}</div><div class="soga-candidates">${codes.length?codes.map(code=>candidateHtml_(date,slot,code,staffMap.get(code))).join(""):'<span class="soga-no-candidate">希望者なし</span>'}</div></div>`}).join("")}</div></details>`).join("")}</div>`:'<div class="soga-empty">この月のシフト希望はまだありません。</div>'}<div class="soga-submit-bar"><div><strong id="sogaAssignmentTotal">${SG.assignments.size}件を調整案へ登録中</strong><small>保存後も、ADMINが公開するまではスタッフに表示されません。</small></div><button id="sogaSaveAssignments" class="primary-button" type="button">調整内容を保存</button></div>`;
    bindCandidateCards_();q("#sogaSelectAllRequests").onclick=selectAllRequests_;q("#sogaPrintShift").onclick=openPrintView_;q("#sogaImportRequests").onclick=importRequests_;q("#sogaSaveAssignments").onclick=saveAssignments_;if(q("#sogaPublishMonth"))q("#sogaPublishMonth").onclick=publishMonth_;
  }
  function candidateHtml_(date,slot,code,staff){const stateValue=SG.assignments.get(key(date,slot.start_time,code))||"",className=stateValue==="TRIAL"?"is-trial":(stateValue==="SHIFT"?"is-shift":""),label=stateValue==="TRIAL"?"体験担当":(stateValue==="SHIFT"?"シフトイン":"希望");return `<button type="button" class="soga-candidate ${className}" data-candidate-date="${date}" data-candidate-start="${slot.start_time}" data-candidate-end="${slot.end_time}" data-candidate-staff="${h(code)}"><strong>${h(personLabel_(staff||{staff_code:code}))}</strong><small>${label}</small></button>`}
  function bindCandidateCards_(){qa(".soga-candidate").forEach(button=>{let timer=0,longPressed=false;const clear=()=>{if(timer)clearTimeout(timer);timer=0};button.addEventListener("pointerdown",()=>{longPressed=false;timer=setTimeout(()=>{longPressed=true;clearAssignment_(button);},650)});button.addEventListener("pointerup",clear);button.addEventListener("pointercancel",clear);button.addEventListener("pointerleave",clear);button.addEventListener("contextmenu",event=>event.preventDefault());button.addEventListener("click",()=>{if(longPressed){longPressed=false;return}cycleAssignment_(button)})})}
  function assignmentButtonKey_(button){return key(button.dataset.candidateDate,button.dataset.candidateStart,button.dataset.candidateStaff)}
  function cycleAssignment_(button){const k=assignmentButtonKey_(button),current=SG.assignments.get(k)||"";if(!current)SG.assignments.set(k,"SHIFT");else if(current==="SHIFT")SG.assignments.set(k,"TRIAL");else SG.assignments.delete(k);SG.dirty=true;paintCandidate_(button)}
  function clearAssignment_(button){SG.assignments.delete(assignmentButtonKey_(button));SG.dirty=true;paintCandidate_(button)}
  function paintCandidate_(button){const value=SG.assignments.get(assignmentButtonKey_(button))||"";button.classList.toggle("is-shift",value==="SHIFT");button.classList.toggle("is-trial",value==="TRIAL");button.querySelector("small").textContent=value==="TRIAL"?"体験担当":(value==="SHIFT"?"シフトイン":"希望");q("#sogaAssignmentTotal").textContent=`${SG.assignments.size}件を調整案へ登録中`}
  function selectAllRequests_(){let added=0;SG.requests.forEach(row=>{const k=key(row.date,row.start_time,row.staff_code);if(!SG.assignments.has(k)){SG.assignments.set(k,"SHIFT");added++}});SG.dirty=SG.dirty||added>0;renderFinal_();message_(added?`希望 ${added}件を調整案へ追加しました。人数上限はありません。`:"すべての希望がすでに調整案へ入っています。")}
  async function saveAssignments_(){if(!confirm(`${monthLabel_()}の調整内容 ${SG.assignments.size}件を保存しますか？`))return;const button=q("#sogaSaveAssignments");button.disabled=true;button.textContent="保存中…";try{const assignments=[];SG.assignments.forEach((type,k)=>{const [date,start,staffCode]=k.split("|"),slot=SG.slots.find(row=>row.start_time===start);if(slot)assignments.push({date,start_time:start,end_time:slot.end_time,staff_code:staffCode,assignment_type:type})});const result=await apiPost({action:"saveSogaShiftAssignments",month:SG.month,store_code:SG.storeCode,assignments});SG.dirty=false;message_(`調整内容を保存しました（${result.data?.saved_count||0}件／体験担当 ${result.data?.trial_count||0}件）。公開操作を行うまでスタッフには表示されません。`);await loadFinal_()}catch(error){message_(error.message||"調整内容を保存できませんでした。",true)}finally{button.disabled=false;button.textContent="調整内容を保存"}}
  async function publishMonth_(){if(!administrator())return;if(SG.dirty){message_("未保存の調整があります。先に「調整内容を保存」を押してください。",true);return}if(!confirm(`${monthLabel_()}の予定と個人シフトをスタッフへ公開しますか？`))return;const button=q("#sogaPublishMonth");button.disabled=true;button.textContent="公開中…";try{await apiPost({action:"publishStaffShiftMonth",month:SG.month,store_code:SG.storeCode});message_(`${monthLabel_()}の予定と個人シフトを公開しました。`);await loadFinal_()}catch(error){message_(error.message||"シフトを公開できませんでした。",true);button.disabled=false;button.textContent="スタッフへ公開"}}


  const PRINT_DAY_START_=10*60+15;
  const PRINT_DAY_END_=20*60+45;
  const PRINT_BREAK_START_=14*60;
  const PRINT_BREAK_END_=16*60+15;

  function printMinutes_(value){
    const match=String(value||"").match(/^(\d{1,2}):(\d{2})$/);
    return match?Number(match[1])*60+Number(match[2]):NaN;
  }
  function printTime_(minutes){
    const value=Math.max(0,Number(minutes)||0),hour=Math.floor(value/60),minute=value%60;
    return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
  }
  function printSurname_(staff,code){
    const raw=String(staff?.last_name||staff?.family_name||staff?.display_name||staff?.staff_name||code||"").trim()
      .replace(/(?:トレーナー|さん)$/,"").trim();
    const pieces=raw.split(/[\s　]+/).filter(Boolean);
    return pieces[0]||raw||String(code||"");
  }
  function printStaffColor_(staff,code){
    const raw=String(staff?.color||"").trim();
    if(/^#[0-9A-Fa-f]{6}$/.test(raw))return raw;
    const palette=["#1f77b4","#2ca02c","#d62728","#9467bd","#ff7f0e","#17becf","#8c564b","#e377c2","#7f7f7f","#bcbd22"];
    const text=String(code||staff?.staff_code||"");
    let hash=0;for(let i=0;i<text.length;i++)hash=(hash*31+text.charCodeAt(i))>>>0;
    return palette[hash%palette.length];
  }
  function printWeeks_(){
    const [year,month]=SG.month.split("-").map(Number),last=new Date(year,month,0).getDate(),first=new Date(year,month-1,1);
    const offset=(first.getDay()+6)%7,days=Array(offset).fill(null);
    for(let day=1;day<=last;day++)days.push(`${SG.month}-${String(day).padStart(2,"0")}`);
    while(days.length%7)days.push(null);
    const weeks=[];for(let i=0;i<days.length;i+=7)weeks.push(days.slice(i,i+7));
    return weeks;
  }
  function printIntervalsForDate_(date){
    const slotEnds=new Map(SG.slots.map(slot=>[String(slot.start_time),String(slot.end_time)]));
    const byStaff=new Map();
    SG.assignments.forEach((type,assignmentKey)=>{
      if(!type)return;
      const [rowDate,start,staffCode]=assignmentKey.split("|");
      if(rowDate!==date)return;
      const end=slotEnds.get(start);
      const startMin=printMinutes_(start),endMin=printMinutes_(end);
      if(!Number.isFinite(startMin)||!Number.isFinite(endMin)||endMin<=startMin)return;
      if(!byStaff.has(staffCode))byStaff.set(staffCode,[]);
      byStaff.get(staffCode).push({startMin,endMin,start,end,staffCode});
    });
    const staffMap=new Map(SG.staff.map(staff=>[String(staff.staff_code),staff]));
    const segments=[];
    byStaff.forEach((rows,staffCode)=>{
      rows.sort((a,b)=>a.startMin-b.startMin);
      let current=null;
      rows.forEach(row=>{
        if(!current){current={...row,through:false};return}
        const adjacent=current.endMin===row.startMin;
        const acrossBreak=current.endMin===PRINT_BREAK_START_&&row.startMin===PRINT_BREAK_END_;
        if(adjacent||acrossBreak){
          current.endMin=row.endMin;
          current.end=row.end;
          current.through=current.through||acrossBreak;
        }else{
          segments.push(current);
          current={...row,through:false};
        }
      });
      if(current)segments.push(current);
    });
    segments.sort((a,b)=>Number(b.through)-Number(a.through)||a.startMin-b.startMin||a.endMin-b.endMin||String(a.staffCode).localeCompare(String(b.staffCode),"ja"));
    const placed=[];
    segments.forEach(segment=>{
      const occupied=new Set(placed.filter(other=>segment.startMin<other.endMin&&segment.endMin>other.startMin).map(other=>other.lane));
      let lane=0;while(occupied.has(lane))lane++;
      segment.lane=lane;
      segment.staff=staffMap.get(segment.staffCode)||{staff_code:segment.staffCode};
      placed.push(segment);
    });
    const maxLane=placed.reduce((max,row)=>Math.max(max,row.lane),0);
    return {segments:placed,columns:Math.max(2,maxLane+1)};
  }
  function printSegmentHtml_(segment,columns){
    const range=PRINT_DAY_END_-PRINT_DAY_START_;
    const top=Math.max(0,(segment.startMin-PRINT_DAY_START_)/range*100);
    const bottom=Math.min(100,(segment.endMin-PRINT_DAY_START_)/range*100);
    const height=Math.max(.8,bottom-top);
    const name=h(printSurname_(segment.staff,segment.staffCode));
    const color=h(printStaffColor_(segment.staff,segment.staffCode));
    const common=`class="print-shift${segment.through?" is-through":""}" style="--lane:${segment.lane};--columns:${columns};--person-color:${color};top:${top.toFixed(4)}%;height:${height.toFixed(4)}%"`;
    if(segment.through&&segment.startMin<PRINT_BREAK_START_&&segment.endMin>PRINT_BREAK_END_){
      const duration=segment.endMin-segment.startMin;
      const breakTop=(PRINT_BREAK_START_-segment.startMin)/duration*100;
      const breakHeight=(PRINT_BREAK_END_-PRINT_BREAK_START_)/duration*100;
      const topName=Math.max(12,breakTop/2);
      const bottomName=Math.min(88,breakTop+breakHeight+(100-breakTop-breakHeight)/2);
      return `<div ${common}><span class="shift-time is-start">${h(printTime_(segment.startMin))}</span><strong class="shift-name" style="top:${topName.toFixed(2)}%">${name}</strong><span class="shift-break" style="top:${breakTop.toFixed(4)}%;height:${breakHeight.toFixed(4)}%"></span><strong class="shift-name" style="top:${bottomName.toFixed(2)}%">${name}</strong><span class="shift-time is-end">${h(printTime_(segment.endMin))}</span></div>`;
    }
    return `<div ${common}><span class="shift-time is-start">${h(printTime_(segment.startMin))}</span><strong class="shift-name" style="top:50%">${name}</strong><span class="shift-time is-end">${h(printTime_(segment.endMin))}</span></div>`;
  }
  function printDayHtml_(date){
    if(!date)return '<div class="print-day is-outside"></div>';
    const {segments,columns}=printIntervalsForDate_(date),day=Number(date.slice(-2));
    const breakStart=(PRINT_BREAK_START_-PRINT_DAY_START_)/(PRINT_DAY_END_-PRINT_DAY_START_)*100;
    const breakEnd=(PRINT_BREAK_END_-PRINT_DAY_START_)/(PRINT_DAY_END_-PRINT_DAY_START_)*100;
    return `<div class="print-day"><div class="print-date">${day}日</div><div class="print-timeline"><span class="print-guide" style="top:${breakStart.toFixed(4)}%"></span><span class="print-guide" style="top:${breakEnd.toFixed(4)}%"></span>${segments.map(segment=>printSegmentHtml_(segment,columns)).join("")}</div></div>`;
  }
  function printWeekInfoHtml_(index){
    const range=PRINT_DAY_END_-PRINT_DAY_START_;
    const breakStart=(PRINT_BREAK_START_-PRINT_DAY_START_)/range*100;
    const breakEnd=(PRINT_BREAK_END_-PRINT_DAY_START_)/range*100;
    return `<div class="print-week-info"><strong>${index+1}週目</strong><div class="print-time-scale"><span class="t-start">10:15</span><span style="top:${breakStart.toFixed(4)}%">14:00</span><span style="top:${breakEnd.toFixed(4)}%">16:15</span><span class="t-end">20:45</span></div></div>`;
  }
  function printDocumentHtml_(){
    const weeks=printWeeks_(),weekdays=["月","火","水","木","金","土","日"];
    const rows=weeks.map((week,index)=>`<div class="print-week-row">${printWeekInfoHtml_(index)}${week.map(printDayHtml_).join("")}</div>`).join("");
    const title=`${monthLabel_()}　9ROUND シフト`;
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#e7e7e7;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif}
      .print-toolbar{position:sticky;top:0;z-index:20;display:flex;justify-content:center;gap:10px;padding:10px;background:#111}.print-toolbar button{border:0;border-radius:9px;background:#2f8f49;color:#fff;padding:10px 20px;font-weight:800;font-size:14px;cursor:pointer}
      .sheet{width:210mm;height:297mm;margin:8mm auto;padding:5mm 5mm 4mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.18);overflow:hidden}
      .print-title{height:14mm;display:flex;align-items:flex-start;justify-content:space-between;gap:8mm;padding:0 1mm}.print-title h1{margin:0;font-size:15pt;font-weight:500;letter-spacing:.01em}.print-title p{margin:5mm 0 0;font-size:7pt;color:#333;white-space:nowrap}
      .print-calendar{height:274mm;border-top:.28mm solid #333;border-left:.28mm solid #333;display:grid;grid-template-rows:8mm repeat(${weeks.length},minmax(0,1fr));background:#fff}
      .print-header,.print-week-row{display:grid;grid-template-columns:18mm repeat(7,minmax(0,1fr));min-height:0}
      .print-header>div{display:grid;place-items:center;border-right:.28mm solid #333;border-bottom:.28mm solid #333;font-size:7.4pt}.print-header .corner{font-size:6.4pt}
      .print-week-info,.print-day{position:relative;min-width:0;min-height:0;border-right:.28mm solid #333;border-bottom:.28mm solid #333;overflow:hidden}
      .print-week-info{background:#fafafa}.print-week-info>strong{position:absolute;top:2.2mm;left:1.2mm;font-size:6.2pt;font-weight:600}.print-time-scale{position:absolute;left:0;right:.7mm;top:6mm;bottom:1.2mm;font-size:5.1pt;color:#111;text-align:right}.print-time-scale span{position:absolute;right:0;transform:translateY(-50%)}.print-time-scale .t-start{top:0;transform:none}.print-time-scale .t-end{bottom:0;top:auto;transform:none}
      .print-date{position:absolute;z-index:4;top:1.1mm;left:1.2mm;font-size:6.6pt}.print-timeline{position:absolute;left:0;right:0;top:6mm;bottom:1.2mm}.print-guide{position:absolute;left:0;right:0;border-top:.18mm dotted #aaa;z-index:0}
      .print-shift{position:absolute;z-index:2;left:calc((100% / var(--columns)) * var(--lane) + .7mm);width:calc(100% / var(--columns) - 1.4mm);min-height:3.2mm;border:.28mm solid #222;border-radius:1.1mm;background:#fff;box-shadow:inset .7mm 0 0 var(--person-color);overflow:hidden}
      .shift-time{position:absolute;z-index:5;left:1.25mm;font-size:4.2pt;line-height:1;color:#333}.shift-time.is-start{top:.75mm}.shift-time.is-end{bottom:.7mm}.shift-name{position:absolute;z-index:5;left:0;right:0;transform:translateY(-50%);padding:0 .6mm 0 1.1mm;text-align:center;font-size:7.4pt;line-height:1.05;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .shift-break{position:absolute;z-index:3;left:0;right:0;border-top:.18mm dashed #666;border-bottom:.18mm dashed #666;background:repeating-linear-gradient(135deg,#f7f7f7 0,#f7f7f7 1.5mm,#9d9d9d 1.6mm,#9d9d9d 1.8mm);-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .print-day.is-outside{background:#fff}
      @page{size:A4 portrait;margin:0}
      @media print{html,body{width:210mm;height:297mm;background:#fff}.print-toolbar{display:none!important}.sheet{margin:0;box-shadow:none;page-break-after:avoid;break-after:avoid}.print-calendar,.print-shift,.shift-break{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="print-toolbar"><button type="button" onclick="window.print()">印刷 / PDF保存</button></div><main class="sheet"><header class="print-title"><h1>${h(title)}</h1><p>タイムカード確認用</p></header><section class="print-calendar"><div class="print-header"><div class="corner">週・時間</div>${weekdays.map(day=>`<div>${day}</div>`).join("")}</div>${rows}</section></main></body></html>`;
  }
  function openPrintView_(){
    const printWindow=window.open("","_blank");
    if(!printWindow){message_("印刷画面を開けませんでした。ブラウザのポップアップ許可を確認してください。",true);return}
    printWindow.document.open();
    printWindow.document.write(printDocumentHtml_());
    printWindow.document.close();
    printWindow.focus();
  }

  function csvLine_(line){const cells=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===","&&!quoted){cells.push(value);value=""}else value+=c}cells.push(value);return cells}
  async function importRequests_(){const input=q("#sogaRequestCsv"),file=input?.files?.[0];if(!file){message_("希望CSVを選択してください。",true);return}const button=q("#sogaImportRequests");button.disabled=true;button.textContent="取込中…";try{const lines=(await file.text()).replace(/^\uFEFF/,"").split(/\r?\n/).filter(line=>line.trim());if(lines.length<2)throw new Error("CSVに希望データがありません。");const headers=csvLine_(lines[0]).map(cell=>cell.trim()),required=["staff_code","date","start_time","end_time"];required.forEach(column=>{if(!headers.includes(column))throw new Error(`CSVに${column}列がありません。`)});const requests=lines.slice(1).map(line=>{const cells=csvLine_(line),row={};headers.forEach((column,index)=>row[column]=String(cells[index]??"").trim());return row});if(!confirm(`${requests.length}行の希望を追加取り込みしますか？`))return;const result=await apiPost({action:"importSogaShiftRequests",month:SG.month,store_code:SG.storeCode,requests});message_(`希望CSVを取り込みました（追加 ${result.data?.inserted_count||0}件／登録済み ${result.data?.skipped_count||0}件）。`);await loadFinal_()}catch(error){message_(error.message||"希望CSVを取り込めませんでした。",true)}finally{button.disabled=false;button.textContent="希望CSVを取り込む"}}

  async function boot_(){if(typeof state==="undefined"||!state.authUser||typeof apiGet!=="function"||typeof apiPost!=="function"){setTimeout(boot_,120);return}if(!(await resolveAccess_()))return;await loadStores_();if(!(await backendReady_()))return;build_()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot_,{once:true});else boot_();
})();
