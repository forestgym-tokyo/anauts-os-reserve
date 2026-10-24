(()=>{
  "use strict";
  // Manager-only preview: group contiguous 45-minute source slots into one visible work period.
  // This view is intentionally read-only and never publishes or writes confirmed staff shifts.
  const PAGE_ID="sogaCandidateCalendarView";
  const NAV_ID="sogaCandidateCalendarNav";
  const CAL={month:"2026-11",data:null,loading:false,requestSerial:0};
  const q=s=>document.querySelector(s);
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const manager=()=>["ADMIN","MANAGER"].includes(String((typeof state!=="undefined"&&state.authUser?.permission)||"").toUpperCase());
  const weekdays=["月","火","水","木","金","土","日"];
  const pad=x=>String(x).padStart(2,"0");
  const labelPerson=(staff,code)=>{
    const name=String(staff?.display_name||staff?.staff_name||code||"").trim();
    return String(staff?.role||"").toUpperCase()==="TRAINER"?(name.endsWith("トレーナー")?name:name+"トレーナー"):(name.endsWith("さん")?name:name+"さん");
  };
  function nextMonth(amount){
    const [year,month]=CAL.month.split("-").map(Number);
    const date=new Date(year,month-1+amount,1);
    CAL.month=date.getFullYear()+"-"+pad(date.getMonth()+1);
    load();
  }
  function isOpen(){
    return q("#"+PAGE_ID)?.classList.contains("is-active");
  }
  function show(){
    if(!manager())return;
    document.querySelectorAll(".nav-button").forEach(el=>el.classList.toggle("is-active",el.id===NAV_ID));
    document.querySelectorAll(".view").forEach(el=>el.classList.toggle("is-active",el.id===PAGE_ID));
    load();
  }
  function installStyle(){
    if(q("#sogaCandidateCalendarCss"))return;
    const s=document.createElement("style");
    s.id="sogaCandidateCalendarCss";
    s.textContent=`
      .soga-preview-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:14px 0}
      .soga-preview-status{font-size:12px;color:#d4dfd7;border:1px solid #395748;background:#13261d;border-radius:10px;padding:11px 14px;line-height:1.6}
      .soga-preview-month-bar{display:flex;align-items:center;justify-content:center;gap:16px;padding:14px}
      .soga-preview-month-bar strong{min-width:160px;text-align:center;font-size:18px}
      .soga-preview-month-bar button{cursor:pointer;background:#193b2b;color:#fff;border:1px solid #37614a;border-radius:10px;padding:9px 13px;font-weight:800}
      .soga-preview-scroller{max-width:100%;overflow-x:auto;border-radius:13px}
      .soga-preview-calendar{min-width:1240px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}
      .soga-preview-weekday{text-align:center;padding:9px 5px;color:#bad4c1;font-weight:900;font-size:12px}
      .soga-preview-day{background:#10231d;border:1px solid #2b4a38;border-radius:10px;padding:9px;min-height:137px;min-width:0}
      .soga-preview-day.is-outside{background:#0b1913;opacity:.25}
      .soga-preview-day.is-closed{background:#26251f;border-color:#635b44}
      .soga-preview-day-title{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;color:#fff;font-weight:900;font-size:13px}
      .soga-preview-day-title small{font-size:10px;font-weight:700;color:#9fb5a4}
      .soga-preview-block{display:flex;align-items:center;gap:5px;padding:6px 5px;margin:4px 0;border:1px solid #355241;border-left:3px solid #80c88c;border-radius:6px;background:#172d22;min-width:0;white-space:nowrap;font-size:10px;color:#fff;line-height:1.35}
      .soga-preview-block.confirmed{border-left-color:#f3bd68;background:#36311d}
      .soga-preview-block.trial{border-left-color:#e4a0e8;background:#332337}
      .soga-preview-block time{font-weight:900;font-variant-numeric:tabular-nums;flex:0 0 auto;letter-spacing:-.2px}
      .soga-preview-block b{font-weight:800;text-overflow:ellipsis;overflow:hidden;min-width:0}
      .soga-preview-empty{color:#647b6b;font-size:11px;margin-top:10px}
      .soga-preview-alert{color:#e7ba73;font-weight:900;padding:14px 0}
      .soga-preview-counter{color:#a5b8ac;font-size:12px}
      @media(max-width:720px){.soga-preview-scroller{margin:0 -12px;max-width:calc(100% + 24px)}.soga-preview-head{align-items:flex-start}.soga-preview-calendar{min-width:1190px}}
      @media print{.topnav,.soga-preview-month-bar button,.soga-preview-status{display:none!important}.soga-preview-scroller{overflow:visible}.soga-preview-calendar{min-width:0;gap:3px}.soga-preview-day{background:white!important;color:#000;min-height:100px}.soga-preview-day-title,.soga-preview-block{color:#000!important}.soga-preview-block{white-space:normal}}
    `;
    document.head.appendChild(s);
  }
  function build(){
    if(q("#"+PAGE_ID))return;
    installStyle();
    const nav=document.createElement("button");
    nav.id=NAV_ID;
    nav.type="button";
    nav.className="nav-button";
    nav.dataset.view="sogaCandidateCalendar";
    nav.innerHTML="<span>🥊</span>希望予定表";
    const top=q(".topnav");
    const anchor=top?.querySelector('[data-view="registration"]');
    if(anchor)top.insertBefore(nav,anchor);else top?.appendChild(nav);
    const section=document.createElement("section");
    section.id=PAGE_ID;
    section.className="view";
    section.innerHTML=`
      <div class="page-heading"><div><p class="eyebrow">9ROUND ARIO SOGA · MANAGEMENT ONLY</p><h1>9ROUND 希望シフト予定表</h1><p>勤務時間をひとまとまりにした、未確定候補の月間プレビューです。</p></div></div>
      <div class="soga-preview-head">
        <div class="soga-preview-status">管理者・マネージャー専用／スタッフへは未公開　　<span id="sogaPreviewState">希望候補（未確定）</span></div>
        <div id="sogaPreviewTotal" class="soga-preview-counter"></div>
      </div>
      <div class="soga-preview-month-bar card">
        <button id="sogaPreviewPrev" type="button" aria-label="前月">‹ 前月</button>
        <strong id="sogaPreviewMonth"></strong>
        <button id="sogaPreviewNext" type="button" aria-label="翌月">翌月 ›</button>
        <button id="sogaPreviewReload" type="button">更新</button>
      </div>
      <div id="sogaPreviewContent" aria-live="polite"></div>
      <p class="soga-preview-status" style="margin-top:13px">前半 10:15〜14:00 ／ 後半 16:15〜20:45 ／ ＊後半 17:45〜20:45。全日希望は前半・後半の2行で表示します。ここでは確定・公開処理は行いません。</p>
    `;
    q("main.main")?.appendChild(section);
    nav.addEventListener("click",show);
    q("#sogaPreviewPrev").addEventListener("click",()=>nextMonth(-1));
    q("#sogaPreviewNext").addEventListener("click",()=>nextMonth(1));
    q("#sogaPreviewReload").addEventListener("click",load);
  }
  function groupRequests(data){
    const staff=new Map((data.staff||[]).map(row=>[String(row.staff_code),row]));
    const entries=new Map();
    const ingest=(r,status)=>{
      const date=String(r.date||"").slice(0,10),code=String(r.staff_code||"").trim().toUpperCase();
      const start=String(r.start_time||"").slice(0,5),end=String(r.end_time||"").slice(0,5);
      if(!date.startsWith(CAL.month+"-")||!code||!/^\d\d:\d\d$/.test(start)||!/^\d\d:\d\d$/.test(end))return;
      if(date==="2026-11-01")return; // Store closure takes precedence over every request.
      entries.set(date+"|"+code+"|"+start,{date,code,start,end,status});
    };
    (data.requests||[]).forEach(r=>ingest(r,"WISH"));
    (data.assignments||[]).forEach(r=>ingest(r,r.assignment_type==="TRIAL"?"TRIAL":"SHIFT"));
    const byPerson=new Map();
    entries.forEach(row=>{
      const key=row.date+"|"+row.code;
      if(!byPerson.has(key))byPerson.set(key,[]);
      byPerson.get(key).push(row);
    });
    const byDate=new Map();
    let segmentCount=0;
    byPerson.forEach(rows=>{
      rows.sort((a,b)=>a.start.localeCompare(b.start));
      let current=null;
      const complete=()=>{
        if(!current)return;
        current.name=labelPerson(staff.get(current.code),current.code);
        if(!byDate.has(current.date))byDate.set(current.date,[]);
        byDate.get(current.date).push(current);
        segmentCount++;
      };
      rows.forEach(row=>{
        if(current&&current.end===row.start&&current.status===row.status){
          current.end=row.end;
        }else{
          complete();
          current={...row};
        }
      });
      complete();
    });
    byDate.forEach(rows=>rows.sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name,"ja")));
    return {byDate,segmentCount,personCount:new Set(Array.from(entries.values()).map(x=>x.code)).size};
  }
  function dayHtml(day,month,year,blocks){
    const date=year+"-"+pad(month)+"-"+pad(day);
    const closed=date==="2026-11-01";
    const entries=blocks.get(date)||[];
    const body=closed?'<div class="soga-preview-alert">店休</div>':(entries.length?entries.map(r=>{
      const cls=r.status==="TRIAL"?"trial":(r.status==="SHIFT"?"confirmed":"");
      const title=r.status==="WISH"?"希望候補":(r.status==="TRIAL"?"体験担当候補":"調整中");
      return `<div class="soga-preview-block ${cls}" title="${escapeHtml(title+" · "+r.name+" · "+r.start+"〜"+r.end)}"><time>${escapeHtml(r.start)}〜${escapeHtml(r.end)}</time><b>${escapeHtml(r.name)}</b></div>`;
    }).join(""):'<div class="soga-preview-empty">候補なし</div>');
    return `<div class="soga-preview-day ${closed?"is-closed":""}"><div class="soga-preview-day-title"><span>${day}日</span><small>${closed?"店休日":entries.length+"件"}</small></div>${body}</div>`;
  }
  function render(){
    const [year,month]=CAL.month.split("-").map(Number);
    q("#sogaPreviewMonth").textContent=year+"年"+month+"月";
    if(!CAL.data){
      q("#sogaPreviewContent").innerHTML='<div class="soga-preview-status">希望データを読み込んでいます…</div>';
      return;
    }
    const grouped=groupRequests(CAL.data);
    const days=new Date(year,month,0).getDate();
    const offset=(new Date(year,month-1,1).getDay()+6)%7;
    const count=Math.ceil((offset+days)/7)*7;
    const nodes=[];
    for(let i=0;i<count;i++){
      const day=i-offset+1;
      nodes.push(day>=1&&day<=days?dayHtml(day,month,year,grouped.byDate):'<div class="soga-preview-day is-outside"></div>');
    }
    q("#sogaPreviewContent").innerHTML=`<div class="soga-preview-scroller"><div class="soga-preview-calendar">${weekdays.map(w=>'<div class="soga-preview-weekday">'+w+'</div>').join("")}${nodes.join("")}</div></div>`;
    q("#sogaPreviewTotal").textContent=grouped.personCount+"名／"+grouped.segmentCount+"勤務時間帯を表示";
    q("#sogaPreviewState").textContent="希望候補（未確定・閲覧専用）";
  }
  async function load(){
    if(!isOpen()||!manager()||CAL.loading)return;
    const serial=++CAL.requestSerial;
    const month=CAL.month;
    CAL.data=null;
    render();
    CAL.loading=true;
    try{
      const result=await apiGet("getSogaShiftBoard",{month,store_code:"SOGA"});
      if(serial!==CAL.requestSerial||month!==CAL.month)return;
      CAL.data=result.data||{};
      render();
    }catch(e){
      if(serial===CAL.requestSerial)q("#sogaPreviewContent").innerHTML='<div class="soga-preview-status">希望予定表を読み込めませんでした：'+escapeHtml(e.message||"通信エラー")+"</div>";
    }finally{
      CAL.loading=false;
      if(month!==CAL.month&&isOpen())load();
    }
  }
  function syncAuth(){
    if(typeof state==="undefined"||typeof apiGet!=="function")return;
    if(manager())build();
    const nav=q("#"+NAV_ID),view=q("#"+PAGE_ID);
    if(nav)nav.classList.toggle("is-hidden",!manager());
    if(view&&!manager())view.classList.remove("is-active");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",syncAuth,{once:true});
  else syncAuth();
  window.setInterval(syncAuth,850);
})();