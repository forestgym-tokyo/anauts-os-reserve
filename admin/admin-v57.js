// Admin v57 extension: management my-shift direct edit + monthly schedule
(()=>{
  const originalApplyPermissionUi=applyPermissionUi;
  applyPermissionUi=function(){
    originalApplyPermissionUi();
    if(state.authUser?.staff_code) $("#myShiftNav")?.classList.remove("is-hidden");
    ensureMonthlyScheduleUi_();
  };

  const originalCanUseMyShift=canUseMyShift;
  canUseMyShift=function(){
    return authEnabled() && !!state.authUser?.staff_code;
  };

  const originalLoadMyShiftView=loadMyShiftView;
  loadMyShiftView=async function(){
    if(!canUseMyShift())return;
    if(!isManagementUser())return originalLoadMyShiftView();

    const role=String(state.authUser?.role||"STAFF").toUpperCase();
    const rawName=String(state.authUser?.display_name||state.authUser?.staff_name||state.authUser?.staff_code||"").trim();
    const titleName=role==="TRAINER"?`${rawName}トレーナー`:`${rawName}さん`;
    if($("#myShiftPageTitle"))$("#myShiftPageTitle").textContent=`${titleName}のシフト`;
    if(!state.myShiftMonth)state.myShiftMonth=localYmd().slice(0,7);
    const range=monthRangeFromYm_(state.myShiftMonth); if(!range)return;
    $("#myShiftMonthLabel").textContent=formatMonthLabel_(state.myShiftMonth);
    setupMyShiftMonthTabs_();
    $("#myShiftList").innerHTML='<div class="registered-shift-empty">1か月分のシフトを読み込んでいます…</div>';
    $("#myShiftRequestForm")?.classList.add("is-hidden");
    $("#todayShiftContactCard")?.classList.add("is-hidden");
    try{
      const shiftRes=await apiGet("getStaffShifts",{staff_code:state.authUser.staff_code,start_date:range.start,end_date:range.end});
      state.myShiftRows=(Array.isArray(shiftRes.data)?shiftRes.data:Array.isArray(shiftRes.data?.shifts)?shiftRes.data.shifts:[]).filter(r=>r.active!==false).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start_time).localeCompare(String(b.start_time)));
      renderManagementMyShiftRows_();
      $("#myShiftStatusSummary").textContent=`勤務 ${state.myShiftRows.length}件 / ADMIN・MANAGERは直接編集`;
      if($("#myShiftRequestHistory"))$("#myShiftRequestHistory").innerHTML='<div class="registered-shift-empty">ADMIN / MANAGERは変更申請不要です。</div>';
    }catch(e){
      $("#myShiftList").innerHTML=`<div class="registered-shift-empty is-error">${esc(e.message||"シフトを取得できませんでした。")}</div>`;
    }
  };

  function renderManagementMyShiftRows_(){
    const box=$("#myShiftList"),rows=state.myShiftRows||[];
    if(!rows.length){box.innerHTML='<div class="registered-shift-empty">この月の確定シフトはありません。</div>';return;}
    box.innerHTML=rows.map(r=>`<div class="registered-shift-row" style="grid-template-columns:minmax(125px,170px) minmax(0,1fr) auto">
      <div class="registered-shift-time"><strong>${esc(formatStaffDate(r.date))}</strong><small style="display:block;margin-top:4px;color:#91a198">${esc(r.date)}</small></div>
      <div class="registered-shift-meta"><span style="font-size:16px;font-weight:900;color:#fff">${esc(r.start_time)}〜${esc(r.end_time)}</span><small>${esc(r.store_code||state.authUser?.store_code||"")}</small></div>
      <div class="registered-shift-actions"><button class="ghost-button" type="button" data-admin-my-edit="${esc(r.shift_id||"")}">直接変更</button><button class="danger-ghost" type="button" data-admin-my-delete="${esc(r.shift_id||"")}">直接削除</button></div>
    </div>`).join("");
    $$('[data-admin-my-edit]').forEach(b=>b.onclick=()=>directEditMyShift_(rows.find(r=>String(r.shift_id)===String(b.dataset.adminMyEdit))));
    $$('[data-admin-my-delete]').forEach(b=>b.onclick=()=>directDeleteMyShift_(rows.find(r=>String(r.shift_id)===String(b.dataset.adminMyDelete))));
  }

  async function directEditMyShift_(r){
    if(!r)return;
    const start=prompt(`${formatStaffDate(r.date)}\n開始時刻を入力してください（例 09:00）`,String(r.start_time||"").slice(0,5)); if(start===null)return;
    const end=prompt(`${formatStaffDate(r.date)}\n終了時刻を入力してください（例 18:00）`,String(r.end_time||"").slice(0,5)); if(end===null)return;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end){alert("時刻を正しく入力してください。");return;}
    if(!confirm(`${r.date} ${r.start_time}〜${r.end_time}\n↓\n${r.date} ${start}〜${end}\n\n申請なしで直接更新します。よろしいですか？`))return;
    try{await apiPost({action:"saveStaffShift",shift_id:r.shift_id,staff_code:state.authUser.staff_code,store_code:r.store_code||state.authUser.store_code||"YACHIYO",date:r.date,start_time:start,end_time:end});await loadMyShiftView();}
    catch(e){alert(e.message||"更新できませんでした。");}
  }

  async function directDeleteMyShift_(r){
    if(!r||!confirm(`${r.date} ${r.start_time}〜${r.end_time} のシフトを申請なしで直接削除します。よろしいですか？`))return;
    try{await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});await loadMyShiftView();}
    catch(e){alert(e.message||"削除できませんでした。");}
  }

  function ensureMonthlyScheduleUi_(){
    if($("#monthlyScheduleNav"))return;
    const myNav=$("#myShiftNav"); if(!myNav)return;
    const nav=document.createElement("button"); nav.id="monthlyScheduleNav"; nav.className="nav-button"; nav.dataset.view="monthlySchedule"; nav.innerHTML='<span>📅</span>予定一覧'; myNav.before(nav);
    const main=document.querySelector("main.main"); if(!main)return;
    const sec=document.createElement("section"); sec.id="monthlyScheduleView"; sec.className="view";
    sec.innerHTML=`<div class="page-heading"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h1>予定一覧</h1><p>月単位で全スタッフ・トレーナー・個人の予定を確認できます。</p></div></div>
      <div class="schedule-toolbar card"><div class="toolbar-group"><button id="monthlyPrev" class="icon-button" type="button">‹</button><button id="monthlyToday" class="ghost-button" type="button">今月</button><button id="monthlyNext" class="icon-button" type="button">›</button></div><strong id="monthlyLabel" class="period-title"></strong><select id="monthlyPersonFilter" style="min-width:210px"></select></div>
      <div id="monthlyMessage" class="form-message is-hidden staff-schedule-message"></div><div id="monthlyBoard" class="schedule-board card"><div class="staff-schedule-loading">予定を読み込んでいます…</div></div>`;
    main.appendChild(sec);
    state.monthlyScheduleMonth=state.monthlyScheduleMonth||localYmd().slice(0,7);
    nav.onclick=async()=>{ $$(".nav-button").forEach(x=>x.classList.toggle("is-active",x===nav)); $$(".view").forEach(x=>x.classList.remove("is-active")); sec.classList.add("is-active"); await loadMonthlySchedule_(); };
    $("#monthlyPrev").onclick=()=>moveMonthly_(-1); $("#monthlyNext").onclick=()=>moveMonthly_(1); $("#monthlyToday").onclick=()=>{state.monthlyScheduleMonth=localYmd().slice(0,7);loadMonthlySchedule_();};
    $("#monthlyPersonFilter").onchange=renderMonthlySchedule_;
  }

  function moveMonthly_(delta){const r=monthRangeFromYm_(state.monthlyScheduleMonth||localYmd().slice(0,7));const d=new Date(r.year,r.month-1+delta,1);state.monthlyScheduleMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;loadMonthlySchedule_();}

  async function loadMonthlySchedule_(){
    ensureMonthlyScheduleUi_(); const ym=state.monthlyScheduleMonth||localYmd().slice(0,7),range=monthRangeFromYm_(ym); if(!range)return;
    $("#monthlyLabel").textContent=formatMonthLabel_(ym); $("#monthlyBoard").innerHTML='<div class="staff-schedule-loading">1か月分の予定を読み込んでいます…</div>';
    try{
      if(!state.staff?.length){const s=await apiGet("getStaff",{include_inactive:"false"});state.staff=Array.isArray(s.data?.staff)?s.data.staff:Array.isArray(s.data)?s.data:[];}
      setupMonthlyFilter_();
      const days=Array.from({length:range.last},(_,i)=>`${ym}-${String(i+1).padStart(2,"0")}`);
      const results=await Promise.all(days.map(async date=>{const [s,t]=await Promise.all([apiGet("getStaffSchedule",{date,store_code:"YACHIYO"}),apiGet("getTrainerSchedule",{date,store_code:"YACHIYO"})]);return {date,staff:s.data||{},trainer:t.data||{}};}));
      state.monthlyScheduleData=results; renderMonthlySchedule_();
    }catch(e){$("#monthlyBoard").innerHTML=`<div class="staff-schedule-empty"><strong>予定を取得できませんでした</strong><span>${esc(e.message)}</span></div>`;}
  }

  function setupMonthlyFilter_(){
    const sel=$("#monthlyPersonFilter"),old=sel.value||"ALL"; const active=(state.staff||[]).filter(s=>s.active!==false);
    const options=[['ALL','全員'],['STAFF_ALL','スタッフ全員'],['TRAINER_ALL','トレーナー全員'],['SELF','自分'],...active.map(s=>[String(s.staff_code),roleHonorific(s)])];
    sel.innerHTML=options.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(""); if(options.some(x=>x[0]===old))sel.value=old;
  }

  function monthlyMatch_(code,role,filter){if(filter==='ALL')return true;if(filter==='SELF')return String(code)===String(state.authUser?.staff_code);if(filter==='STAFF_ALL')return String(role).toUpperCase()==='STAFF';if(filter==='TRAINER_ALL')return String(role).toUpperCase()==='TRAINER';return String(code)===String(filter);}

  function renderMonthlySchedule_(){
    const box=$("#monthlyBoard"),filter=$("#monthlyPersonFilter")?.value||"ALL",staffMap=new Map((state.staff||[]).map(s=>[String(s.staff_code),s])); const out=[];
    for(const day of state.monthlyScheduleData||[]){
      const shifts=[...(day.staff.shifts||[]),...(day.trainer.shifts||[])]; const shiftMap=new Map(); for(const r of shifts){const k=`${r.staff_code}|${r.start_time}|${r.end_time}`;shiftMap.set(k,r);}
      const reservations=[...(day.staff.reservations||[]),...(day.trainer.reservations||[])].filter(r=>String(r.status||'').toUpperCase()!=='CANCELLED'); const resMap=new Map(); for(const r of reservations){const k=String(r.reservation_id||`${r.staff_code}|${r.start_time}|${r.service_code}`);resMap.set(k,r);}
      const rows=[];
      for(const r of shiftMap.values()){const p=staffMap.get(String(r.staff_code))||{staff_code:r.staff_code,staff_name:r.staff_name,role:r.role};if(monthlyMatch_(r.staff_code,p.role,filter))rows.push({time:`${r.start_time}〜${r.end_time}`,person:roleHonorific(p),text:'勤務シフト',kind:'SHIFT'});}
      for(const r of resMap.values()){const p=staffMap.get(String(r.staff_code))||{staff_code:r.staff_code,staff_name:r.staff_name,role:r.role};if(monthlyMatch_(r.staff_code,p.role,filter))rows.push({time:`${r.start_time}〜${r.end_time}`,person:roleHonorific(p),text:`${r.service_name||r.service_code} / ${r.customer_name||'氏名未登録'}`,kind:'RESERVATION'});}
      if(rows.length){rows.sort((a,b)=>a.time.localeCompare(b.time));out.push(`<section class="staff-day-section"><div class="staff-day-head"><strong>${esc(formatStaffDate(day.date))}</strong><span class="shift-pill">${rows.length}件</span></div><div class="staff-reservation-list">${rows.map(r=>`<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(r.time)}</div><div class="staff-reservation-service"><strong>${esc(r.person)}</strong><small>${r.kind==='SHIFT'?'シフト':'予約'}</small></div><div class="staff-reservation-customer"><strong>${esc(r.text)}</strong></div></div>`).join('')}</div></section>`);}
    }
    box.innerHTML=out.length?`<div class="staff-day-grid">${out.join('')}</div>`:'<div class="staff-schedule-empty"><strong>この月の該当予定はありません</strong></div>';
  }

  window.addEventListener("DOMContentLoaded",ensureMonthlyScheduleUi_);
})();
