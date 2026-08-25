(()=>{
  "use strict";

  const STORE_CODE="YACHIYO";
  const eventState={month:"",mode:"STAFF",selectedDate:"",cache:new Map(),loading:false};
  const q=s=>document.querySelector(s);
  const qa=s=>document.querySelectorAll(s);
  const html=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const thisMonth=()=>ymd(new Date()).slice(0,7);

  function isAdmin(){try{return String(state?.authUser?.permission||"").toUpperCase()==="ADMIN";}catch(_){return false;}}
  function monthMeta(ym){const m=/^(\d{4})-(\d{2})$/.exec(String(ym||""));if(!m)return null;const year=Number(m[1]),month=Number(m[2]),last=new Date(year,month,0).getDate();return{year,month,last,start:`${ym}-01`,end:`${ym}-${String(last).padStart(2,"0")}`};}
  function moveMonth(ym,delta){const meta=monthMeta(ym)||monthMeta(thisMonth()),d=new Date(meta.year,meta.month-1+delta,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
  function monthDates(ym){const meta=monthMeta(ym);return meta?Array.from({length:meta.last},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`):[];}
  function modeLabel(){return eventState.mode==="TRAINER"?"トレーナー対応":"スタッフ対応";}
  function actionName(){return eventState.mode==="TRAINER"?"getTrainerSchedule":"getStaffSchedule";}
  function personLabel(r){const base=String(r.staff_name||r.display_name||r.staff_code||"").trim();if(!base)return"担当未設定";if(eventState.mode==="TRAINER")return/トレーナー$/.test(base)?base:`${base}トレーナー`;return/さん$/.test(base)?base:`${base}さん`;}

  function ensureStyle(){
    if(q("#adminEventCalendarStyle"))return;
    const style=document.createElement("style");style.id="adminEventCalendarStyle";style.textContent=`
      #eventCalendarNav.is-hidden{display:none!important}.ecal-mode{display:inline-flex;gap:6px;padding:4px;background:#10231d;border:1px solid #294037;border-radius:12px}.ecal-mode button{border:0;border-radius:9px;padding:9px 14px;background:transparent;color:#aab8b1;font:inherit;font-weight:900;cursor:pointer}.ecal-mode button.is-active{background:#2b5a47;color:#fff}.ecal-wrap{overflow-x:auto}.ecal{min-width:980px;border:1px solid #294037;border-radius:14px;overflow:hidden;background:#10231d}.ecal-week{display:grid;grid-template-columns:repeat(7,1fr);background:#183129}.ecal-week div{padding:10px;text-align:center;font-weight:900;color:#b9c9c2;border-right:1px solid #294037}.ecal-week div:last-child{border-right:0}.ecal-grid{display:grid;grid-template-columns:repeat(7,1fr)}.ecal-day{min-height:145px;padding:8px;border-right:1px solid #294037;border-top:1px solid #294037;background:#10231d;cursor:pointer}.ecal-day:nth-child(7n){border-right:0}.ecal-day.out{background:#0c1b16;cursor:default;opacity:.5}.ecal-day.today{box-shadow:inset 0 0 0 2px #7ed6a5}.ecal-day.is-selected{background:#173a2f;box-shadow:inset 0 0 0 2px #63d179}.ecal-num{font-weight:900;color:#e7f1ed;margin-bottom:6px}.ecal-event{display:block;padding:5px 6px;margin:4px 0;border-radius:7px;background:#24483b;color:#fff;font-size:11px;line-height:1.3;overflow:hidden}.ecal-event b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ecal-event span{display:block;color:#c4d4cd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ecal-more{display:block;margin-top:5px;color:#79dc8c;font-size:11px;font-weight:900}.ecal-detail{margin-top:14px;padding:14px;border:1px solid #294037;border-radius:12px;background:#10231d}.ecal-detail h3{margin:0 0 10px}.ecal-detail-row{display:grid;grid-template-columns:110px minmax(0,1.2fr) minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid #294037}.ecal-detail-row:first-of-type{border-top:0}.ecal-detail-time{font-weight:900;color:#fff}.ecal-detail-main strong,.ecal-detail-person strong{display:block;color:#fff}.ecal-detail-main small,.ecal-detail-person small{display:block;margin-top:3px;color:#91a198}.ecal-warning{margin:0 0 12px;padding:10px 12px;border:1px solid #70562e;border-radius:10px;background:#2a2113;color:#f3cf8c;font-size:12px;font-weight:800}@media(max-width:700px){.ecal{min-width:760px}.ecal-day{min-height:108px;padding:5px}.ecal-event{font-size:10px;padding:4px}.ecal-event b{font-size:10px}.ecal-detail-row{grid-template-columns:1fr;gap:6px}.ecal-detail-row .ghost-button{width:100%}#eventCalendarView .schedule-toolbar{align-items:flex-start;gap:10px}}
    `;document.head.appendChild(style);
  }

  function build(){
    if(q("#eventCalendarNav"))return;
    const nav=q(".topnav"),main=q("main.main"),registration=q("#registrationView");if(!nav||!main||!registration)return;ensureStyle();
    const navButton=document.createElement("button");navButton.id="eventCalendarNav";navButton.className="nav-button is-hidden";navButton.type="button";navButton.dataset.view="eventCalendar";navButton.innerHTML="<span>📆</span>イベント";nav.insertBefore(navButton,nav.querySelector('[data-view="registration"]'));
    const view=document.createElement("section");view.id="eventCalendarView";view.className="view";view.innerHTML=`
      <div class="page-heading"><div><p class="eyebrow">ADMIN EVENT CALENDAR</p><h1>イベントカレンダー</h1><p>予約イベントをスタッフ対応／トレーナー対応で切り替えて確認します。</p></div></div>
      <div class="schedule-toolbar card"><div class="toolbar-group"><button id="ecPrev" class="icon-button" type="button" aria-label="前月">‹</button><button id="ecNow" class="ghost-button" type="button">今月</button><button id="ecNext" class="icon-button" type="button" aria-label="翌月">›</button></div><strong id="ecMonthLabel" class="period-title"></strong><div class="ecal-mode" role="group" aria-label="イベント種別"><button id="ecStaffMode" class="is-active" type="button">スタッフ対応</button><button id="ecTrainerMode" type="button">トレーナー対応</button></div><button id="ecReload" class="ghost-button" type="button">再読込</button></div>
      <div id="ecSummary" class="schedule-summary" style="margin:0 0 12px"></div><div id="ecMessage" class="form-message is-hidden staff-schedule-message"></div><div id="ecBoard" class="card"><div class="staff-schedule-loading">イベントを読み込んでいます…</div></div><div id="ecDetail" class="ecal-detail is-hidden"></div>`;main.insertBefore(view,registration);
    eventState.month=thisMonth();navButton.onclick=()=>openView();
    q("#ecPrev").onclick=()=>{if(eventState.loading)return;eventState.month=moveMonth(eventState.month,-1);eventState.selectedDate="";load();};
    q("#ecNext").onclick=()=>{if(eventState.loading)return;eventState.month=moveMonth(eventState.month,1);eventState.selectedDate="";load();};
    q("#ecNow").onclick=()=>{if(eventState.loading)return;eventState.month=thisMonth();eventState.selectedDate="";load();};
    q("#ecStaffMode").onclick=()=>setMode("STAFF");q("#ecTrainerMode").onclick=()=>setMode("TRAINER");q("#ecReload").onclick=()=>{if(eventState.loading)return;eventState.cache.delete(`${eventState.mode}:${eventState.month}`);eventState.selectedDate="";load();};q("#logoutButton")?.addEventListener("click",()=>setTimeout(syncAccess,0));syncAccess();
  }

  function syncAccess(){const allowed=isAdmin();q("#eventCalendarNav")?.classList.toggle("is-hidden",!allowed);if(!allowed&&q("#eventCalendarView")?.classList.contains("is-active")){q("#eventCalendarView")?.classList.remove("is-active");q('[data-view="staffSchedule"]')?.classList.add("is-active");q("#staffScheduleView")?.classList.add("is-active");}}
  function openView(){if(!isAdmin())return;qa(".nav-button").forEach(x=>x.classList.toggle("is-active",x.id==="eventCalendarNav"));qa(".view").forEach(x=>x.classList.remove("is-active"));q("#eventCalendarView")?.classList.add("is-active");load();}
  function setMode(mode){if(eventState.loading)return;if(mode!=="STAFF"&&mode!=="TRAINER")return;eventState.mode=mode;eventState.selectedDate="";q("#ecStaffMode")?.classList.toggle("is-active",mode==="STAFF");q("#ecTrainerMode")?.classList.toggle("is-active",mode==="TRAINER");load();}
  function setMessage(text,error=false){const n=q("#ecMessage");if(!n)return;n.textContent=text||"";n.classList.toggle("is-hidden",!text);n.classList.toggle("is-error",!!error);}

  async function fetchMonth(){
    const key=`${eventState.mode}:${eventState.month}`;if(eventState.cache.has(key))return eventState.cache.get(key);
    const dates=monthDates(eventState.month),rows=[],errors=[];let cursor=0,done=0;
    const worker=async()=>{while(true){const index=cursor++;if(index>=dates.length)return;const date=dates[index];try{const j=await apiGet(actionName(),{date,store_code:STORE_CODE});const reservations=(Array.isArray(j?.data?.reservations)?j.data.reservations:[]).filter(r=>String(r.status||"").trim().toUpperCase()!=="CANCELLED").map(r=>({...r,date:String(r.date||date)}));rows.push(...reservations);}catch(e){errors.push({date,message:e?.message||"取得失敗"});}finally{done++;const board=q("#ecBoard");if(board&&eventState.loading)board.innerHTML=`<div class="staff-schedule-loading">${modeLabel()}を読み込んでいます… ${done}/${dates.length}</div>`;}}};
    await Promise.all(Array.from({length:Math.min(6,dates.length)},worker));rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start_time).localeCompare(String(b.start_time)));const result={rows,errors};eventState.cache.set(key,result);return result;
  }

  async function load(){
    if(!isAdmin()||eventState.loading)return;eventState.loading=true;setMessage("");q("#ecDetail")?.classList.add("is-hidden");const meta=monthMeta(eventState.month);if(q("#ecMonthLabel"))q("#ecMonthLabel").textContent=`${meta.year}年${meta.month}月`;if(q("#ecBoard"))q("#ecBoard").innerHTML=`<div class="staff-schedule-loading">${modeLabel()}を読み込んでいます…</div>`;
    try{const result=await fetchMonth();render(result);}catch(e){q("#ecBoard").innerHTML=`<div class="staff-schedule-empty"><strong>イベントを取得できませんでした</strong><span>${html(e?.message||"取得に失敗しました。")}</span></div>`;setMessage(e?.message||"取得に失敗しました。",true);}finally{eventState.loading=false;}
  }

  function render(result){
    const rows=result.rows||[],meta=monthMeta(eventState.month),today=ymd(new Date()),first=new Date(meta.year,meta.month-1,1),offset=(first.getDay()+6)%7,total=Math.ceil((offset+meta.last)/7)*7,byDate=new Map();rows.forEach(r=>{const date=String(r.date||"");if(!byDate.has(date))byDate.set(date,[]);byDate.get(date).push(r);});let cells="";
    for(let i=0;i<total;i++){const day=i-offset+1;if(day<1||day>meta.last){cells+='<div class="ecal-day out"></div>';continue;}const date=`${eventState.month}-${String(day).padStart(2,"0")}`,items=byDate.get(date)||[],visible=items.slice(0,3).map(r=>`<span class="ecal-event"><b>${html(String(r.start_time||"").slice(0,5))} ${html(r.service_name||r.service_code||"予約")}</b><span>${html(r.customer_name||"氏名未登録")}</span></span>`).join(""),more=items.length>3?`<span class="ecal-more">＋${items.length-3}件</span>`:"";cells+=`<div class="ecal-day ${date===today?"today":""} ${date===eventState.selectedDate?"is-selected":""}" data-ec-date="${date}"><div class="ecal-num">${day}</div>${visible}${more}</div>`;}
    q("#ecBoard").innerHTML=`${result.errors?.length?`<div class="ecal-warning">一部の日付を取得できませんでした（${result.errors.length}日）。「再読込」で再取得できます。</div>`:""}<div class="ecal-wrap"><div class="ecal"><div class="ecal-week"><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div><div>日</div></div><div class="ecal-grid">${cells}</div></div></div>`;q("#ecSummary").innerHTML=`<span>${html(modeLabel())} <b>${rows.length}</b>件</span><span>表示月 <b>${meta.month}月</b></span>`;qa("#ecBoard [data-ec-date]").forEach(cell=>cell.onclick=()=>showDay(cell.dataset.ecDate,result));if(eventState.selectedDate)showDay(eventState.selectedDate,result,false);
  }

  function showDay(date,result,scroll=true){
    eventState.selectedDate=date;qa("#ecBoard [data-ec-date]").forEach(c=>c.classList.toggle("is-selected",c.dataset.ecDate===date));const detail=q("#ecDetail"),rows=(result.rows||[]).filter(r=>String(r.date||"")===date);if(!detail)return;detail.classList.remove("is-hidden");detail.innerHTML=`<h3>${html(formatStaffDate(date))}の${html(modeLabel())}</h3>${rows.length?rows.map((r,i)=>`<div class="ecal-detail-row"><div class="ecal-detail-time">${html(String(r.start_time||"").slice(0,5))}〜${html(String(r.end_time||"").slice(0,5))}</div><div class="ecal-detail-main"><strong>${html(r.service_name||r.service_code||"予約")}</strong><small>${html(r.customer_name||"氏名未登録")}${r.member_no?` / 会員番号 ${html(r.member_no)}`:""}</small></div><div class="ecal-detail-person"><strong>${html(personLabel(r))}</strong><small>${html(r.status||"RESERVED")}</small></div><button class="ghost-button" type="button" data-ec-res="${i}">予約詳細</button></div>`).join(""):'<div class="registered-shift-empty">この日のイベントはありません。</div>'}`;detail.querySelectorAll("[data-ec-res]").forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.ecRes)];if(!r?.reservation_id)return alert("予約IDを取得できません。");if(typeof openReservationManageFromStaff_==="function")openReservationManageFromStaff_(r.reservation_id);});if(scroll)detail.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function boot(){if(typeof state==="undefined"||typeof apiGet!=="function"||typeof formatStaffDate!=="function"){setTimeout(boot,100);return;}build();if(typeof applyPermissionUi==="function"){const originalApply=applyPermissionUi;applyPermissionUi=function(){originalApply();syncAccess();};}syncAccess();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();