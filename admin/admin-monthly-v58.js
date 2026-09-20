(()=>{
  function boot(){
    if(typeof apiGet!=="function"||typeof apiPost!=="function"||typeof state==="undefined"){setTimeout(boot,100);return;}

    function sogaStaffRestricted_(){
      return typeof isSogaStaffUser==="function"&&isSogaStaffUser();
    }

    const originalApply=applyPermissionUi;
    applyPermissionUi=function(){
      originalApply();
      if(state.authUser?.staff_code)document.querySelector("#myShiftNav")?.classList.remove("is-hidden");
      buildMonthly();
      const monthlyNav=document.querySelector('[data-view="monthlySchedule"]');
      if(monthlyNav)monthlyNav.innerHTML=sogaStaffRestricted_()?"<span>📅</span>9ROUND予定":"<span>📅</span>予定一覧";
      if(typeof enforceSogaStaffUi_==="function")enforceSogaStaffUi_();
    };
    canUseMyShift=function(){return !!state.authUser?.staff_code;};

    const originalRender=renderMyShiftRows;
    renderMyShiftRows=function(){renderMyShiftCalendar();};

    function ensureCalendarCss(){if(document.querySelector("#anautsCalendarCss"))return;const style=document.createElement("style");style.id="anautsCalendarCss";style.textContent=`.mcal-wrap{overflow-x:auto}.mcal{min-width:980px;border:1px solid #294037;border-radius:14px;overflow:hidden;background:#10231d}.mcal-week{display:grid;grid-template-columns:repeat(7,1fr);background:#183129}.mcal-week div{padding:10px;text-align:center;font-weight:900;color:#b9c9c2;border-right:1px solid #294037}.mcal-week div:last-child{border-right:0}.mcal-grid{display:grid;grid-template-columns:repeat(7,1fr)}.mcal-day{min-height:145px;padding:8px;border-right:1px solid #294037;border-top:1px solid #294037;background:#10231d;cursor:pointer}.mcal-day:nth-child(7n){border-right:0}.mcal-day.out{background:#0c1b16;opacity:.5}.mcal-day.today{box-shadow:inset 0 0 0 2px #7ed6a5}.mcal-day.my-shift-selected{background:#173f2a!important;box-shadow:inset 0 0 0 3px #63d179!important}.mcal-num{font-weight:900;color:#e7f1ed;margin-bottom:6px}.mcal-event{display:block;padding:5px 6px;margin:4px 0;border-left:4px solid var(--staff-color,#63d179);border-radius:7px;background:#24483b;color:#fff;font-size:11px;line-height:1.25;white-space:normal;overflow:hidden}.mcal-event b{display:block;font-size:12px}.mcal-event-name{display:flex;align-items:center;gap:5px;margin-top:3px}.mcal-event-dot,.mcal-detail-dot{display:inline-block;width:8px;height:8px;flex:0 0 8px;border-radius:999px;background:var(--staff-color,#63d179)}.mcal-event-store{display:block;margin-top:3px;color:#a9bab1;font-size:9px;font-weight:800;letter-spacing:.05em}.mcal-detail{margin-top:14px;padding:14px;border:1px solid #294037;border-radius:12px;background:#10231d}.mcal-detail h3{margin:0 0 10px}.mcal-detail-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid #294037}.mcal-detail-row:first-of-type{border-top:0}.mcal-detail-store{margin-left:auto;color:#91a198;font-size:11px;font-weight:800}.monthly-filter-group{justify-self:end;display:flex;align-items:flex-end;gap:8px}.monthly-filter-field{display:grid;gap:4px}.monthly-filter-field span{color:#91a198;font-size:10px;font-weight:900}.monthly-filter-field select{min-width:170px}.mycal-actions{display:flex;gap:7px;margin-top:8px;flex-wrap:wrap}.mycal-actions button{font-size:12px;padding:6px 9px}@media(max-width:900px){#monthlyScheduleView .schedule-toolbar{grid-template-columns:1fr auto}.monthly-filter-group{grid-column:1/-1;justify-self:stretch}.monthly-filter-field{flex:1}.monthly-filter-field select{width:100%;min-width:0}}@media(max-width:700px){.mcal{min-width:760px}.mcal-day{min-height:105px;padding:5px}.mcal-event{font-size:10px;padding:4px}.mcal-event b{font-size:10px}.monthly-filter-group{display:grid;grid-template-columns:1fr 1fr;width:100%}}`;document.head.appendChild(style)}

    function renderMyShiftCalendar(){
      ensureCalendarCss();const box=document.querySelector("#myShiftList"),rows=(state.myShiftRows||[]).filter(x=>x.active!==false);if(!box)return;
      const p=document.querySelector("#myShiftView .page-heading p:last-child");
      if(p){
        if(sogaStaffRestricted_())p.textContent="9ROUND アリオ蘇我店の自分の確定シフトを確認できます。日付を押すと変更・削除申請ができます。";
        else p.textContent=isManagementUser()?"八千代・SOGA両店舗の自分の確定シフトを月間カレンダーで確認できます。日付を押すと直接変更・削除できます。":"八千代・SOGA両店舗の自分の確定シフトを月間カレンダーで確認できます。日付を押すと変更・削除申請ができます。";
      }
      const notice=document.querySelector("#myShiftView .page-heading + .card");
      if(notice&&!isManagementUser())notice.innerHTML=`<strong style="color:#ffcf7d">当日・前日のシフト変更について</strong><div style="margin-top:5px;color:#d7ddd8">当日および前日の追加・変更・削除申請はWebでは受付できません。必ず直接 <a href="tel:08035534259" style="color:#79dc8c;font-weight:900;text-decoration:none">080-3553-4259</a> までご連絡ください。</div>`;
      if(isManagementUser())document.querySelector("#myShiftRequestHistory")?.closest("section")?.classList.add("is-hidden");
      const ym=state.myShiftMonth||localYmd().slice(0,7),[y,m]=ym.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0).getDate(),offset=(first.getDay()+6)%7,total=Math.ceil((offset+last)/7)*7,today=localYmd(),by=new Map();rows.forEach(x=>{if(!by.has(x.date))by.set(x.date,[]);by.get(x.date).push(x)});let cells="";
      for(let i=0;i<total;i++){const day=i-offset+1;if(day<1||day>last){cells+='<div class="mcal-day out"></div>';continue}const date=`${ym}-${String(day).padStart(2,"0")}`,a=by.get(date)||[];cells+=`<div class="mcal-day ${date===today?'today':''}" data-mydate="${date}"><div class="mcal-num">${day}</div>${a.map(x=>`<span class="mcal-event" style="border-left:0"><b>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</b>${esc(x.store_code||"")}</span>`).join("")}</div>`}
      box.innerHTML=`<div class="mcal-wrap"><div class="mcal"><div class="mcal-week"><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div><div>日</div></div><div class="mcal-grid">${cells}</div></div></div><div id="myCalDetail" class="mcal-detail is-hidden"></div>`;
      box.querySelectorAll("[data-mydate]").forEach(c=>c.onclick=()=>showMyDay(c.dataset.mydate));
    }
    function myShiftRule_(date){
      const today=localYmd();
      if(!date||date<today)return "PAST";
      const [y,m,d]=today.split("-").map(Number),tomorrowDate=new Date(y,m-1,d+1);
      const tomorrow=`${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth()+1).padStart(2,"0")}-${String(tomorrowDate.getDate()).padStart(2,"0")}`;
      return (date===today||date===tomorrow)?"PHONE":"WEB";
    }
    function showMyShiftPhone_(r,actionLabel){
      const phone="080-3553-4259";
      if(typeof showTodayShiftContactCard_==="function"){
        showTodayShiftContactCard_(r,actionLabel);
        const card=document.querySelector("#todayShiftContactCard"),action=document.querySelector("#todayShiftContactAction"),detail=document.querySelector("#todayShiftContactDetail");
        if(card){const h2=card.querySelector("h2"),p=card.querySelector(".manager-header p:last-child");if(h2)h2.textContent="当日・前日のシフト変更";if(p)p.textContent="当日・前日のシフト変更・削除はWebから申請できません。選択した内容について直接ご連絡ください。";}
        if(action)action.textContent=`${actionLabel}について電話連絡`;
        if(detail)detail.innerHTML=`<strong>${esc(formatStaffDate(r.date))}</strong><br>${esc(r.start_time)}〜${esc(r.end_time)}<br><br>当日・前日のシフト${esc(actionLabel)}はWeb申請できません。<br>080-3553-4259まで直接ご連絡ください。`;
        return;
      }
      if(typeof myShiftMsg==="function")myShiftMsg(`当日・前日のシフト${actionLabel}はWeb申請できません。${phone}まで直接ご連絡ください。`,true);
    }
    function showMyDay(date){
      const detail=document.querySelector("#myCalDetail"),rows=(state.myShiftRows||[]).filter(x=>x.active!==false&&x.date===date),mode=myShiftRule_(date);
      document.querySelectorAll("#myShiftList [data-mydate]").forEach(c=>c.classList.toggle("my-shift-selected",c.dataset.mydate===date));
      detail.classList.remove("is-hidden");
      const actions=(x,i)=>{
        if(isManagementUser())return `<button class="ghost-button" data-my-edit="${i}">直接変更</button><button class="danger-ghost" data-my-delete="${i}">直接削除</button>`;
        if(mode==="PAST")return `<button class="ghost-button" type="button" disabled>変更申請不可</button><button class="danger-ghost" type="button" disabled>削除申請不可</button>`;
        if(mode==="PHONE")return `<button class="ghost-button" data-my-phone-edit="${i}">電話で変更連絡</button><button class="danger-ghost" data-my-phone-delete="${i}">電話で削除連絡</button>`;
        return `<button class="ghost-button" data-my-request-edit="${i}">変更申請</button><button class="danger-ghost" data-my-request-delete="${i}">削除申請</button>`;
      };
      detail.innerHTML=`<h3>${esc(date)} の自分のシフト</h3>${rows.length?rows.map((x,i)=>`<div class="mcal-detail-row" style="display:block"><strong>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</strong>　${esc(x.store_code||"")}<div class="mycal-actions">${actions(x,i)}</div></div>`).join(""):'<div>シフトはありません。</div>'}`;
      if(isManagementUser()){
        detail.querySelectorAll("[data-my-edit]").forEach(b=>b.onclick=()=>directEdit(rows[+b.dataset.myEdit]));
        detail.querySelectorAll("[data-my-delete]").forEach(b=>b.onclick=()=>directDelete(rows[+b.dataset.myDelete]));
        return;
      }
      detail.querySelectorAll("[data-my-phone-edit]").forEach(b=>b.onclick=()=>showMyShiftPhone_(rows[+b.dataset.myPhoneEdit],"変更"));
      detail.querySelectorAll("[data-my-phone-delete]").forEach(b=>b.onclick=()=>showMyShiftPhone_(rows[+b.dataset.myPhoneDelete],"削除"));
      detail.querySelectorAll("[data-my-request-edit]").forEach(b=>b.onclick=()=>{const r=rows[+b.dataset.myRequestEdit];if(r&&typeof editMyShiftRequest==="function")editMyShiftRequest(r)});
      detail.querySelectorAll("[data-my-request-delete]").forEach(b=>b.onclick=()=>{const r=rows[+b.dataset.myRequestDelete];if(r&&typeof requestDeleteMyShift==="function")requestDeleteMyShift(r)});
    }
    async function directEdit(r){const s=prompt("開始時刻",String(r.start_time).slice(0,5));if(s===null)return;const e=prompt("終了時刻",String(r.end_time).slice(0,5));if(e===null)return;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e)||s>=e)return alert("時刻を確認してください。");try{await apiPost({action:"saveStaffShift",shift_id:r.shift_id,staff_code:state.authUser.staff_code,store_code:r.store_code||state.authUser.store_code||"YACHIYO",date:r.date,start_time:s,end_time:e});await loadMyShiftView()}catch(x){alert(x.message)}}
    async function directDelete(r){if(!confirm(`${r.date} ${r.start_time}〜${r.end_time} を削除しますか？`))return;try{await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});await loadMyShiftView()}catch(x){alert(x.message)}}

    const MONTHLY_CACHE_PREFIX="anauts_monthly_cache_v1:";
    const MONTHLY_CACHE_FRESH_MS=30*1000;
    const MONTHLY_CACHE_MAX_AGE_MS=8*60*60*1000;
    const monthlyRequests_=new Map();
    let monthlyLoadSequence_=0;

    function monthlySubject_(){
      const tokenSubject=typeof currentAuthSubject_==="function"?currentAuthSubject_():"";
      return tokenSubject||String(state.authUser?.email||state.authUser?.staff_code||"anonymous");
    }
    function monthlyScope_(){return sogaStaffRestricted_()?"SOGA":"ALL"}
    function monthlyCacheKey_(ym){return `${MONTHLY_CACHE_PREFIX}${encodeURIComponent(monthlySubject_())}:${monthlyScope_()}:${ym}`}
    function readMonthlyCache_(ym){
      try{
        const cached=JSON.parse(localStorage.getItem(monthlyCacheKey_(ym))||"null");
        if(!cached||cached.month!==ym||!cached.saved_at)return null;
        const age=Date.now()-Number(cached.saved_at);
        if(age<0||age>MONTHLY_CACHE_MAX_AGE_MS)return null;
        cached.age=age;
        return cached;
      }catch(_){return null}
    }
    function writeMonthlyCache_(ym,payload){
      try{
        localStorage.setItem(monthlyCacheKey_(ym),JSON.stringify({
          month:ym,
          saved_at:Date.now(),
          rows:payload.rows||[],
          staff:payload.staff||[],
          publication:payload.publication||null
        }));
      }catch(_){
        // 保存できない端末でも通常取得は継続する。
      }
    }
    function invalidateMonthlyCache_(){
      monthlyRequests_.clear();
      try{
        for(let i=localStorage.length-1;i>=0;i-=1){
          const key=localStorage.key(i)||"";
          if(key.startsWith(MONTHLY_CACHE_PREFIX))localStorage.removeItem(key);
        }
      }catch(_){ }
    }
    window.ANAUTS_INVALIDATE_MONTHLY_CACHE=invalidateMonthlyCache_;

    const monthlyMutationActions_=new Set([
      "saveStaffShift","deleteStaffShift","importStaffShifts",
      "saveSogaShiftAssignments","publishStaffShiftMonth",
      "saveStaff","setStaffActive"
    ]);
    if(!window.__ANAUTS_MONTHLY_POST_INVALIDATION_INSTALLED__){
      window.__ANAUTS_MONTHLY_POST_INVALIDATION_INSTALLED__=true;
      const originalApiPost=apiPost;
      apiPost=async function(payload){
        const result=await originalApiPost.apply(this,arguments);
        if(monthlyMutationActions_.has(String(payload?.action||"")))invalidateMonthlyCache_();
        return result;
      };
    }

    function monthlyUpdatedLabel_(savedAt){
      try{return new Date(Number(savedAt)||Date.now()).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}
      catch(_){return ""}
    }
    function setMonthlyFreshness_(text,isWarning){
      const node=document.querySelector("#mFreshness");
      if(!node)return;
      node.textContent=text||"";
      node.style.color=isWarning?"#ffcf7d":"#91a198";
    }

    function buildMonthly(){
      if(document.querySelector('[data-view="monthlySchedule"]'))return;
      ensureCalendarCss();
      const nav=document.querySelector(".topnav"),main=document.querySelector("main.main");
      if(!nav||!main)return;
      const b=document.createElement("button");
      b.className="nav-button";
      b.dataset.view="monthlySchedule";
      b.innerHTML=sogaStaffRestricted_()?"<span>📅</span>9ROUND予定":"<span>📅</span>予定一覧";
      nav.insertBefore(b,nav.querySelector('[data-view="registration"]'));
      const v=document.createElement("section");
      v.id="monthlyScheduleView";
      v.className="view";
      v.innerHTML=`<div class="page-heading"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h1>予定一覧</h1><p>月間カレンダーでスタッフ・トレーナーの勤務予定を確認します。</p></div></div><div class="schedule-toolbar card"><div class="toolbar-group"><button id="mPrev" class="icon-button">‹</button><button id="mNow" class="ghost-button">今月</button><button id="mNext" class="icon-button">›</button></div><div><strong id="mLabel" class="period-title"></strong><span id="mFreshness" aria-live="polite" style="display:block;margin-top:4px;color:#91a198;font-size:11px;font-weight:800"></span></div><div class="monthly-filter-group"><label class="monthly-filter-field"><span>店舗</span><select id="mStore"></select></label><label class="monthly-filter-field"><span>表示</span><select id="mFilter"></select></label></div></div><div id="mBoard" class="card"></div><div id="mDetail" class="mcal-detail is-hidden"></div>`;
      main.insertBefore(v,document.querySelector("#registrationView"));
      state.monthlyMonth=state.monthlyMonth||localYmd().slice(0,7);
      state.monthlyStore=sogaStaffRestricted_()?"SOGA":(state.monthlyStore||"ALL");
      b.onclick=()=>{document.querySelectorAll(".nav-button").forEach(x=>x.classList.toggle("is-active",x===b));document.querySelectorAll(".view").forEach(x=>x.classList.remove("is-active"));v.classList.add("is-active");loadMonth()};
      document.querySelector("#mPrev").onclick=()=>move(-1);
      document.querySelector("#mNext").onclick=()=>move(1);
      document.querySelector("#mNow").onclick=()=>{state.monthlyMonth=localYmd().slice(0,7);loadMonth()};
      document.querySelector("#mStore").onchange=()=>{state.monthlyStore=document.querySelector("#mStore").value;filters();syncMonthlyHeading_();renderMonth();document.querySelector("#mDetail").classList.add("is-hidden")};
      document.querySelector("#mFilter").onchange=()=>{renderMonth();document.querySelector("#mDetail").classList.add("is-hidden")};
    }
    function move(n){const [y,m]=state.monthlyMonth.split("-").map(Number),d=new Date(y,m-1+n,1);state.monthlyMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;loadMonth()}
    function applyMonthlyPayload_(ym,payload,sourceLabel){
      if(state.monthlyMonth!==ym)return;
      if(Array.isArray(payload.staff)&&payload.staff.length)state.staff=payload.staff;
      if(payload.publication?.is_published===false){
        state.monthlyRows=[];
        storeFilters_();
        filters();
        syncMonthlyHeading_();
        document.querySelector("#mBoard").innerHTML=`<div class="staff-schedule-empty"><strong>公開前</strong><span>${esc(payload.publication.message||"管理者が公開すると予定を確認できます。")}</span></div>`;
      }else{
        state.monthlyRows=(payload.rows||[]).filter(x=>x.active!==false);
        storeFilters_();
        filters();
        syncMonthlyHeading_();
        renderMonth();
      }
      if(sourceLabel)setMonthlyFreshness_(sourceLabel,false);
    }
    function loginPrefetchFor_(ym){
      const prefetch=window.ANAUTS_LOGIN_MONTH_PREFETCH;
      if(!prefetch||prefetch.month!==ym||!prefetch.promise)return null;
      return Promise.resolve(prefetch.promise).then(result=>result||apiGet("getStaffShifts",monthParams_(ym)));
    }
    function monthParams_(ym){
      const params={start_date:`${ym}-01`,end_date:`${ym}-${String(new Date(+ym.slice(0,4),+ym.slice(5,7),0).getDate()).padStart(2,"0")}`};
      if(sogaStaffRestricted_())params.store_code="SOGA";
      return params;
    }
    function fetchMonthlyPayload_(ym){
      const requestKey=`${monthlyScope_()}:${ym}`;
      if(monthlyRequests_.has(requestKey))return monthlyRequests_.get(requestKey);
      const shiftRequest=loginPrefetchFor_(ym)||apiGet("getStaffShifts",monthParams_(ym));
      const request=Promise.resolve(shiftRequest).then(j=>{
        const payload={
          rows:(Array.isArray(j.data)?j.data:(j.data?.shifts||[])).filter(x=>x.active!==false),
          staff:state.staff,
          publication:j.data?.publication||null
        };
        if(!state.staff.length){
          apiGet("getStaff",{include_inactive:"false"}).then(s=>{
            const staff=Array.isArray(s.data?.staff)?s.data.staff:(Array.isArray(s.data)?s.data:[]);
            if(!staff.length)return;
            state.staff=staff;
            payload.staff=staff;
            writeMonthlyCache_(ym,payload);
            if(state.monthlyMonth===ym){
              storeFilters_();
              filters();
              syncMonthlyHeading_();
              renderMonth();
            }
          }).catch(staffError=>console.warn("予定一覧のスタッフ名簿を取得できませんでした。",staffError));
        }
        return payload;
      }).finally(()=>monthlyRequests_.delete(requestKey));
      monthlyRequests_.set(requestKey,request);
      return request;
    }
    async function loadMonth(options={}){
      const ym=state.monthlyMonth;
      const board=document.querySelector("#mBoard");
      const sequence=++monthlyLoadSequence_;
      document.querySelector("#mLabel").textContent=`${+ym.slice(0,4)}年${+ym.slice(5,7)}月`;
      document.querySelector("#mDetail").classList.add("is-hidden");
      const cached=readMonthlyCache_(ym);
      if(cached){
        const fresh=cached.age<=MONTHLY_CACHE_FRESH_MS&&!options.force;
        applyMonthlyPayload_(ym,cached,fresh?`更新 ${monthlyUpdatedLabel_(cached.saved_at)}`:`保存データ ${monthlyUpdatedLabel_(cached.saved_at)}・最新情報を確認中`);
        if(fresh)return;
      }else{
        board.innerHTML='<div class="staff-schedule-loading">読み込んでいます…</div>';
        setMonthlyFreshness_("最新情報を取得中",false);
      }
      try{
        const payload=await fetchMonthlyPayload_(ym);
        writeMonthlyCache_(ym,payload);
        if(sequence!==monthlyLoadSequence_||state.monthlyMonth!==ym)return;
        applyMonthlyPayload_(ym,payload,`更新 ${monthlyUpdatedLabel_(Date.now())}`);
      }catch(e){
        if(sequence!==monthlyLoadSequence_||state.monthlyMonth!==ym)return;
        if(cached){
          setMonthlyFreshness_("保存データを表示中・更新できませんでした",true);
          return;
        }
        board.innerHTML=`<div class="staff-schedule-empty"><strong>取得できませんでした</strong><span>${esc(e.message||"通信に失敗しました。")}</span><button id="mRetry" class="ghost-button" type="button" style="margin-top:14px">再読込</button></div>`;
        setMonthlyFreshness_("更新できませんでした",true);
        document.querySelector("#mRetry")?.addEventListener("click",()=>loadMonth({force:true}),{once:true});
      }
    }
    function storeLabel_(code){
      const master=(state.stores||[]).find(x=>String(x.store_code)===String(code));
      if(master)return master.store_name||master.store_code;
      if(code==="SOGA")return "9ROUND アリオ蘇我店";
      if(code==="YACHIYO")return "八千代緑が丘店";
      return code;
    }
    function storeFilters_(){
      const select=document.querySelector("#mStore");
      if(sogaStaffRestricted_()){
        select.innerHTML='<option value="SOGA">9ROUND アリオ蘇我店 (SOGA)</option>';
        select.value="SOGA";
        select.disabled=true;
        state.monthlyStore="SOGA";
        return;
      }
      select.disabled=false;
      const codes=new Set();
      (state.stores||[]).filter(x=>x.active!==false).forEach(x=>{if(x.store_code)codes.add(String(x.store_code))});
      (state.staff||[]).filter(x=>x.active!==false).forEach(x=>{if(x.store_code)codes.add(String(x.store_code))});
      (state.monthlyRows||[]).forEach(x=>{if(x.store_code)codes.add(String(x.store_code))});
      const order=Array.from(codes).sort((a,b)=>({YACHIYO:0,SOGA:1}[a]??9)-({YACHIYO:0,SOGA:1}[b]??9)||a.localeCompare(b));
      select.innerHTML='<option value="ALL">全店舗</option>'+order.map(code=>`<option value="${esc(code)}">${esc(storeLabel_(code))} (${esc(code)})</option>`).join("");
      const wanted=state.monthlyStore||"ALL";
      select.value=Array.from(select.options).some(x=>x.value===wanted)?wanted:"ALL";
      state.monthlyStore=select.value;
    }
    function filters(){
      const select=document.querySelector("#mFilter"),current=select.value||"ALL",store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL"),me=state.authUser?.staff_code||"";
      const codes=new Set((state.monthlyRows||[]).filter(x=>store==="ALL"||String(x.store_code)===store).map(x=>String(x.staff_code)));
      const people=state.staff.filter(x=>x.active!==false&&codes.has(String(x.staff_code)));
      select.innerHTML=`<option value="ALL">全員</option><option value="STAFF">スタッフ全員</option><option value="TRAINER">トレーナー全員</option>${me&&codes.has(String(me))?'<option value="ME">自分</option>':''}`+people.map(x=>`<option value="P:${esc(x.staff_code)}">${esc((x.display_name||x.staff_name||x.staff_code)+(String(x.role).toUpperCase()==="TRAINER"?"トレーナー":"さん"))}</option>`).join("");
      if(Array.from(select.options).some(x=>x.value===current))select.value=current;
    }
    function filtered(){
      const f=document.querySelector("#mFilter").value,store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL"),people=new Map(state.staff.map(x=>[String(x.staff_code),x]));
      let a=(state.monthlyRows||[]).filter(x=>store==="ALL"||String(x.store_code)===store);
      if(f==="ME")a=a.filter(x=>String(x.staff_code)===String(state.authUser.staff_code));
      else if(f==="STAFF"||f==="TRAINER")a=a.filter(x=>String(people.get(String(x.staff_code))?.role).toUpperCase()===f);
      else if(f.startsWith("P:"))a=a.filter(x=>String(x.staff_code)===f.slice(2));
      return a.sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.start_time).localeCompare(String(y.start_time))||String(x.staff_code).localeCompare(String(y.staff_code)));
    }
    function personLabel(x,people){const p=people.get(String(x.staff_code))||{},n=p.display_name||p.staff_name||x.staff_name||x.staff_code;return n+(String(p.role).toUpperCase()==="TRAINER"?"トレーナー":"さん")}
    function staffColor_(x,people){const color=String(people.get(String(x.staff_code))?.color||"");return /^#[0-9a-f]{6}$/i.test(color)?color:"#63d179"}
    function syncMonthlyHeading_(){
      const store=sogaStaffRestricted_()?"SOGA":(document.querySelector("#mStore")?.value||"ALL"),view=document.querySelector("#monthlyScheduleView");
      if(!view)return;
      view.querySelector(".eyebrow").textContent=store==="SOGA"?"9ROUND ARIO SOGA":"MONTHLY SCHEDULE";
      view.querySelector("h1").textContent=store==="SOGA"?"9ROUNDシフト":"予定一覧";
      view.querySelector(".page-heading p:last-child").textContent=store==="SOGA"?"アリオ蘇我店の確定シフトを月間カレンダーで確認します。":"月間カレンダーでスタッフ・トレーナーの勤務予定を確認します。";
    }
    function renderMonth(){
      const board=document.querySelector("#mBoard"),a=filtered(),people=new Map(state.staff.map(x=>[String(x.staff_code),x])),ym=state.monthlyMonth,[y,m]=ym.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0).getDate(),offset=(first.getDay()+6)%7,total=Math.ceil((offset+last)/7)*7,today=localYmd(),by=new Map();
      a.forEach(x=>{if(!by.has(x.date))by.set(x.date,[]);by.get(x.date).push(x)});
      let cells="";
      for(let i=0;i<total;i++){
        const day=i-offset+1;
        if(day<1||day>last){cells+='<div class="mcal-day out"></div>';continue}
        const date=`${ym}-${String(day).padStart(2,"0")}`,rows=by.get(date)||[];
        cells+=`<div class="mcal-day ${date===today?'today':''}" data-mdate="${date}"><div class="mcal-num">${day}</div>${rows.map(x=>{const color=staffColor_(x,people);return `<span class="mcal-event" style="--staff-color:${color}"><b>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</b><span class="mcal-event-name"><i class="mcal-event-dot"></i>${esc(personLabel(x,people))}</span><small class="mcal-event-store">${esc(x.store_code||"")}</small></span>`}).join("")}</div>`;
      }
      board.innerHTML=`<div class="mcal-wrap"><div class="mcal"><div class="mcal-week"><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div><div>日</div></div><div class="mcal-grid">${cells}</div></div></div>`;
      board.querySelectorAll("[data-mdate]").forEach(c=>c.onclick=()=>showDay(c.dataset.mdate));
    }
    function showDay(date){
      const detail=document.querySelector("#mDetail"),people=new Map(state.staff.map(x=>[String(x.staff_code),x])),rows=filtered().filter(x=>x.date===date);
      detail.classList.remove("is-hidden");
      detail.innerHTML=`<h3>${esc(date)} の予定</h3>${rows.length?rows.map(x=>{const color=staffColor_(x,people);return `<div class="mcal-detail-row" style="--staff-color:${color}"><i class="mcal-detail-dot"></i><strong>${esc(String(x.start_time).slice(0,5))}〜${esc(String(x.end_time).slice(0,5))}</strong><span>${esc(personLabel(x,people))}</span><small class="mcal-detail-store">${esc(x.store_code||"")}</small></div>`}).join(""):'<div>予定はありません。</div>'}`;
      detail.scrollIntoView({behavior:"smooth",block:"nearest"});
    }

    buildMonthly();
    if(state.authUser){
      applyPermissionUi();
      window.setTimeout(()=>loadMonth(),0);
    }
  }
  boot();
})();
