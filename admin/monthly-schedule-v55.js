// BUILD: 20260823-monthly-schedule-admin-v55
(() => {
  "use strict";

  const isManagement = () => hasPermission("ADMIN", "MANAGER");
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monthText = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  let monthlyMonth = monthText(new Date());
  let monthlyFilter = "ALL";
  let monthlyRows = [];

  // ADMIN/MANAGERにも「自分のシフト」を表示する。
  const originalApplyPermissionUi = applyPermissionUi;
  applyPermissionUi = function(){
    originalApplyPermissionUi();
    if(authEnabled() && state.authUser?.staff_code){
      $("#myShiftNav")?.classList.remove("is-hidden");
    }
  };

  // ADMIN/MANAGERも自分のシフト画面を利用可能。
  canUseMyShift = function(){
    return authEnabled() && !!state.authUser?.staff_code;
  };

  function injectMonthlyUi(){
    if($("#monthlyScheduleNav")) return;

    const registration = document.querySelector('.nav-button[data-view="registration"]');
    const nav = document.createElement("button");
    nav.id = "monthlyScheduleNav";
    nav.className = "nav-button";
    nav.type = "button";
    nav.dataset.view = "monthlySchedule";
    nav.innerHTML = '<span>📅</span>予定一覧';
    registration?.parentNode?.insertBefore(nav, registration);

    const section = document.createElement("section");
    section.id = "monthlyScheduleView";
    section.className = "view";
    section.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h1>予定一覧</h1><p>月単位でスタッフ・トレーナーの予定を確認できます。</p></div></div>
      <div class="schedule-toolbar card" style="gap:14px;flex-wrap:wrap">
        <div class="toolbar-group"><button id="monthlyPrev" class="icon-button" type="button">‹</button><button id="monthlyToday" class="ghost-button" type="button">今月</button><button id="monthlyNext" class="icon-button" type="button">›</button></div>
        <strong id="monthlyLabel" class="period-title"></strong>
        <label style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;font-weight:800;color:#aab6ad">表示</span><select id="monthlyPersonFilter" style="min-width:190px"></select></label>
        <div id="monthlySummary" class="schedule-summary"></div>
      </div>
      <div id="monthlyMessage" class="form-message is-hidden staff-schedule-message"></div>
      <div id="monthlyScheduleList" class="registered-shift-list card"><div class="registered-shift-empty">予定を読み込んでいます…</div></div>`;
    document.querySelector("main.main")?.appendChild(section);

    nav.addEventListener("click", async () => {
      $$(".nav-button").forEach(x=>x.classList.toggle("is-active",x===nav));
      $$(".view").forEach(x=>x.classList.remove("is-active"));
      section.classList.add("is-active");
      await loadMonthlySchedule();
    });
    $("#monthlyPrev").onclick=()=>{const [y,m]=monthlyMonth.split("-").map(Number);monthlyMonth=monthText(new Date(y,m-2,1));loadMonthlySchedule()};
    $("#monthlyNext").onclick=()=>{const [y,m]=monthlyMonth.split("-").map(Number);monthlyMonth=monthText(new Date(y,m,1));loadMonthlySchedule()};
    $("#monthlyToday").onclick=()=>{monthlyMonth=monthText(new Date());loadMonthlySchedule()};
    $("#monthlyPersonFilter").onchange=e=>{monthlyFilter=e.target.value;renderMonthlySchedule()};
  }

  async function ensureStaffForMonthly(){
    if(state.staff?.length) return;
    const j=await apiGet("getStaff",{include_inactive:"false"});
    state.staff=Array.isArray(j.data?.staff)?j.data.staff:Array.isArray(j.data)?j.data:[];
  }

  function populateMonthlyFilter(){
    const select=$("#monthlyPersonFilter"); if(!select)return;
    const active=(state.staff||[]).filter(s=>s.active!==false);
    const people=active.slice().sort((a,b)=>String(a.display_name||a.staff_name||"").localeCompare(String(b.display_name||b.staff_name||""),"ja"));
    select.innerHTML=`<option value="ALL">全員</option><option value="STAFF_ALL">スタッフ全員</option><option value="TRAINER_ALL">トレーナー全員</option><option value="ME">自分</option>`+
      people.map(s=>`<option value="PERSON:${esc(s.staff_code)}">${esc(roleHonorific(s))}</option>`).join("");
    if([...select.options].some(o=>o.value===monthlyFilter)) select.value=monthlyFilter; else {monthlyFilter="ALL";select.value="ALL"}
  }

  async function mapLimit(items, limit, fn){
    const out=new Array(items.length); let cursor=0;
    async function worker(){while(true){const i=cursor++;if(i>=items.length)return;try{out[i]=await fn(items[i])}catch(e){out[i]=null}}}
    await Promise.all(Array.from({length:Math.min(limit,items.length)},worker)); return out;
  }

  function normalizeSchedulePayload(payload, kind, date){
    const data=payload?.data||{};
    const candidates=[];
    for(const key of ["events","schedule","items","reservations","rows"]){if(Array.isArray(data[key])) candidates.push(...data[key])}
    if(Array.isArray(data)) candidates.push(...data);
    return candidates.map(r=>({
      ...r,
      _kind:kind,
      date:String(r.date||r.schedule_date||date).slice(0,10),
      staff_code:String(r.staff_code||r.trainer_code||r.assigned_staff_code||""),
      staff_name:String(r.staff_name||r.trainer_name||r.assigned_staff_name||""),
      start_time:String(r.start_time||r.start||r.time_from||"").slice(0,5),
      end_time:String(r.end_time||r.end||r.time_to||"").slice(0,5),
      title:String(r.service_name||r.title||r.summary||r.customer_name||r.name||"予定"),
      status:String(r.status||"").toUpperCase()
    })).filter(r=>r.status!=="CANCELLED");
  }

  async function loadMonthlySchedule(){
    injectMonthlyUi();
    $("#monthlyLabel").textContent=`${Number(monthlyMonth.slice(5))}月`;
    $("#monthlyScheduleList").innerHTML='<div class="registered-shift-empty">予定を読み込んでいます…</div>';
    try{
      await ensureStaffForMonthly(); populateMonthlyFilter();
      const [y,m]=monthlyMonth.split("-").map(Number); const last=new Date(y,m,0).getDate();
      const dates=Array.from({length:last},(_,i)=>`${monthlyMonth}-${String(i+1).padStart(2,"0")}`);
      const payloads=await mapLimit(dates,6,async date=>{
        const [staff,trainer]=await Promise.all([
          apiGet("getStaffSchedule",{date}),
          apiGet("getTrainerSchedule",{date})
        ]);
        return [...normalizeSchedulePayload(staff,"STAFF",date),...normalizeSchedulePayload(trainer,"TRAINER",date)];
      });
      monthlyRows=payloads.flatMap(x=>x||[]);
      renderMonthlySchedule();
    }catch(e){$("#monthlyScheduleList").innerHTML=`<div class="registered-shift-empty is-error">${esc(e.message||"予定を取得できませんでした。")}</div>`}
  }

  function rowStaff(row){
    return (state.staff||[]).find(s=>String(s.staff_code).toUpperCase()===String(row.staff_code).toUpperCase())||null;
  }
  function rowRole(row){return String(rowStaff(row)?.role||row._kind||"").toUpperCase()}
  function matchesMonthlyFilter(row){
    if(monthlyFilter==="ALL")return true;
    if(monthlyFilter==="STAFF_ALL")return rowRole(row)==="STAFF";
    if(monthlyFilter==="TRAINER_ALL")return rowRole(row)==="TRAINER";
    if(monthlyFilter==="ME")return String(row.staff_code).toUpperCase()===String(state.authUser?.staff_code||"").toUpperCase();
    if(monthlyFilter.startsWith("PERSON:"))return String(row.staff_code).toUpperCase()===monthlyFilter.slice(7).toUpperCase();
    return true;
  }
  function renderMonthlySchedule(){
    const box=$("#monthlyScheduleList");if(!box)return;
    const rows=monthlyRows.filter(matchesMonthlyFilter).sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
    $("#monthlySummary").textContent=`${rows.length}件`;
    if(!rows.length){box.innerHTML='<div class="registered-shift-empty">この条件の予定はありません。</div>';return}
    let prev="";box.innerHTML=rows.map(r=>{
      const s=rowStaff(r);const name=s?roleHonorific(s):(r.staff_name||r.staff_code||"担当未定");
      const head=r.date!==prev?(prev=r.date,`<div style="padding:14px 18px 7px;font-weight:900;color:#79dc8c">${esc(r.date)}</div>`):"";
      return `${head}<div class="registered-shift-row" style="margin:0 12px 8px"><div><strong>${esc(r.start_time||"--:--")}〜${esc(r.end_time||"--:--")}</strong><div style="margin-top:4px">${esc(r.title)}</div><small>${esc(name)}</small></div></div>`;
    }).join("")
  }

  // 管理者の自分シフトだけ、申請ではなく直接編集・削除に切り替える。
  const originalRenderMyShiftRows = renderMyShiftRows;
  renderMyShiftRows = function(){
    if(!isManagement()){originalRenderMyShiftRows();return}
    const box=$("#myShiftList"); const rows=state.myShiftRows||[];
    if(!rows.length){box.innerHTML='<div class="registered-shift-empty">この月の確定シフトはありません。</div>';return}
    box.innerHTML=rows.map((r,i)=>`<div class="registered-shift-row"><div><strong>${esc(r.date)}</strong><div>${esc(r.start_time)}〜${esc(r.end_time)}</div></div><div class="registered-shift-actions"><button class="ghost-button" type="button" data-direct-edit="${i}">変更</button><button class="danger-button" type="button" data-direct-delete="${i}">削除</button></div></div>`).join("");
    $$('[data-direct-edit]').forEach(b=>b.onclick=()=>directEdit(rows[Number(b.dataset.directEdit)]));
    $$('[data-direct-delete]').forEach(b=>b.onclick=()=>directDelete(rows[Number(b.dataset.directDelete)]));
  };

  async function directEdit(r){
    const start=prompt("開始時刻（HH:MM）",r.start_time);if(start===null)return;
    const end=prompt("終了時刻（HH:MM）",r.end_time);if(end===null)return;
    if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||start>=end){alert("時刻を確認してください。");return}
    try{
      await apiPost({action:"saveStaffShift",shift_id:r.shift_id,staff_code:state.authUser.staff_code,store_code:r.store_code||state.authUser.store_code||"YACHIYO",date:r.date,start_time:start,end_time:end});
      await loadMyShiftView();
    }catch(e){alert(e.message||"変更できませんでした。")}
  }
  async function directDelete(r){
    if(!confirm(`${r.date} ${r.start_time}〜${r.end_time} のシフトを削除しますか？`))return;
    try{await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});await loadMyShiftView()}catch(e){alert(e.message||"削除できませんでした。")}
  }

  function tuneMyShiftCopy(){
    if(!isManagement())return;
    const view=$("#myShiftView"); if(!view)return;
    const intro=view.querySelector(".page-heading p:last-child");if(intro)intro.textContent="自分の確定シフトを確認・変更できます。管理者は変更・削除をその場で反映します。";
    $("#todayShiftContactCard")?.classList.add("is-hidden");
    $("#myShiftRequestForm")?.classList.add("is-hidden");
    $("#myShiftRequestHistory")?.closest("section")?.classList.add("is-hidden");
  }

  injectMonthlyUi();
  const observer=new MutationObserver(()=>tuneMyShiftCopy());
  observer.observe(document.body,{childList:true,subtree:true});
})();
