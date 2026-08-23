// A-nauts OS Reserve - monthly schedule / management self shift extension
(()=>{
  const ready=()=>{
    if(typeof window.apiGet!=="function"||typeof window.apiPost!=="function"||typeof window.$!=="function"){
      setTimeout(ready,100);return;
    }

    // ADMIN / MANAGER でも「自分のシフト」を使用可能にする
    window.canUseMyShift=function(){return !!window.state?.authUser?.staff_code;};
    const baseApply=window.applyPermissionUi;
    window.applyPermissionUi=function(){
      if(typeof baseApply==="function")baseApply();
      const nav=document.querySelector("#myShiftNav");
      if(nav&&window.state?.authUser?.staff_code)nav.classList.remove("is-hidden");
      ensureMonthlyUi();
    };

    // 管理者は自分のシフトを直接変更・削除
    const baseRender=window.renderMyShiftRows;
    window.renderMyShiftRows=function(){
      if(!window.isManagementUser?.())return baseRender?.();
      const box=document.querySelector("#myShiftList");
      const rows=window.state?.myShiftRows||[];
      if(!box)return;
      const intro=document.querySelector("#myShiftView .page-heading p:last-child");
      if(intro)intro.textContent="自分の確定シフトを確認できます。ADMIN / MANAGERは申請なしで直接変更・削除できます。";
      document.querySelector("#myShiftRequestHistory")?.closest("section")?.classList.add("is-hidden");
      if(!rows.length){box.innerHTML='<div class="registered-shift-empty">この月の確定シフトはありません。</div>';return;}
      box.innerHTML=rows.map((r,i)=>`<div class="registered-shift-row" style="grid-template-columns:minmax(150px,190px) minmax(0,1fr) auto"><div class="registered-shift-time"><strong>${esc(r.date||"")}</strong><small style="display:block;margin-top:4px;color:#91a198">${esc(r.store_code||"")}</small></div><div class="registered-shift-meta"><span style="font-size:16px;font-weight:900;color:#fff">${esc(r.start_time)}〜${esc(r.end_time)}</span></div><div class="registered-shift-actions"><button class="ghost-button" type="button" data-mgmt-edit="${i}">直接変更</button><button class="danger-ghost" type="button" data-mgmt-delete="${i}">直接削除</button></div></div>`).join("");
      box.querySelectorAll("[data-mgmt-edit]").forEach(b=>b.onclick=()=>directEdit(rows[+b.dataset.mgmtEdit]));
      box.querySelectorAll("[data-mgmt-delete]").forEach(b=>b.onclick=()=>directDelete(rows[+b.dataset.mgmtDelete]));
    };

    async function directEdit(r){
      const start=prompt("開始時刻を入力してください（例 09:00）",String(r.start_time||"").slice(0,5));
      if(start===null)return;
      const end=prompt("終了時刻を入力してください（例 17:00）",String(r.end_time||"").slice(0,5));
      if(end===null)return;
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end){alert("時刻を確認してください。");return;}
      try{
        await apiPost({action:"saveStaffShift",shift_id:r.shift_id,staff_code:state.authUser.staff_code,store_code:r.store_code||state.authUser.store_code||"YACHIYO",date:r.date,start_time:start,end_time:end});
        await loadMyShiftView();
      }catch(e){alert(e.message||"変更できませんでした。");}
    }
    async function directDelete(r){
      if(!confirm(`${r.date} ${r.start_time}〜${r.end_time} のシフトを削除しますか？`))return;
      try{await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});await loadMyShiftView();}
      catch(e){alert(e.message||"削除できませんでした。");}
    }

    function ensureMonthlyUi(){
      if(document.querySelector('[data-view="monthlySchedule"]'))return;
      const nav=document.querySelector(".topnav");
      if(!nav)return;
      const btn=document.createElement("button");
      btn.className="nav-button";btn.dataset.view="monthlySchedule";btn.innerHTML="<span>📅</span>予定一覧";
      const reg=nav.querySelector('[data-view="registration"]');nav.insertBefore(btn,reg||null);
      const main=document.querySelector("main.main");
      const sec=document.createElement("section");sec.id="monthlyScheduleView";sec.className="view";
      sec.innerHTML=`<div class="page-heading"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h1>予定一覧</h1><p>月単位でスタッフ・トレーナーの勤務予定を確認します。</p></div></div><div class="schedule-toolbar card" style="gap:12px;flex-wrap:wrap"><div class="toolbar-group"><button id="monthlyPrev" class="icon-button" type="button">‹</button><button id="monthlyToday" class="ghost-button" type="button">今月</button><button id="monthlyNext" class="icon-button" type="button">›</button></div><strong id="monthlyLabel" class="period-title"></strong><select id="monthlyFilter" style="min-width:220px"></select></div><div id="monthlyMessage" class="form-message is-hidden"></div><div id="monthlyBoard" class="schedule-board card"><div class="staff-schedule-loading">予定一覧を読み込んでいます…</div></div>`;
      main.insertBefore(sec,document.querySelector("#registrationView"));
      state.monthlyScheduleMonth=state.monthlyScheduleMonth||localYmd().slice(0,7);
      btn.onclick=async()=>{document.querySelectorAll(".nav-button").forEach(x=>x.classList.toggle("is-active",x===btn));document.querySelectorAll(".view").forEach(x=>x.classList.remove("is-active"));sec.classList.add("is-active");await loadMonthly();};
      document.querySelector("#monthlyPrev").onclick=()=>moveMonth(-1);
      document.querySelector("#monthlyNext").onclick=()=>moveMonth(1);
      document.querySelector("#monthlyToday").onclick=()=>{state.monthlyScheduleMonth=localYmd().slice(0,7);loadMonthly();};
      document.querySelector("#monthlyFilter").onchange=renderMonthly;
    }

    function moveMonth(delta){const [y,m]=state.monthlyScheduleMonth.split("-").map(Number);const d=new Date(y,m-1+delta,1);state.monthlyScheduleMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;loadMonthly();}
    function range(ym){const [y,m]=ym.split("-").map(Number);const last=new Date(y,m,0).getDate();return {start:`${ym}-01`,end:`${ym}-${String(last).padStart(2,"0")}`};}
    async function loadMonthly(){
      ensureMonthlyUi();const ym=state.monthlyScheduleMonth||localYmd().slice(0,7);const r=range(ym);const board=document.querySelector("#monthlyBoard");document.querySelector("#monthlyLabel").textContent=`${Number(ym.slice(0,4))}年${Number(ym.slice(5,7))}月`;board.innerHTML='<div class="staff-schedule-loading">1か月分を読み込んでいます…</div>';
      try{
        if(!state.staff?.length){const s=await apiGet("getStaff",{include_inactive:"false"});state.staff=Array.isArray(s.data?.staff)?s.data.staff:Array.isArray(s.data)?s.data:[];}
        const j=await apiGet("getStaffShifts",{start_date:r.start,end_date:r.end});state.monthlyScheduleRows=(Array.isArray(j.data)?j.data:Array.isArray(j.data?.shifts)?j.data.shifts:[]).filter(x=>x.active!==false).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start_time).localeCompare(String(b.start_time)));
        fillFilter();renderMonthly();
      }catch(e){board.innerHTML=`<div class="staff-schedule-empty"><strong>予定を取得できませんでした</strong><span>${esc(e.message)}</span></div>`;}
    }
    function fillFilter(){
      const sel=document.querySelector("#monthlyFilter");const current=sel.value||"ALL";const staff=(state.staff||[]).filter(s=>s.active!==false);const me=state.authUser?.staff_code||"";
      const people=staff.map(s=>`<option value="P:${esc(s.staff_code)}">${esc((String(s.role).toUpperCase()==="TRAINER"?(s.display_name||s.staff_name||s.staff_code)+"トレーナー":(s.display_name||s.staff_name||s.staff_code)+"さん"))}</option>`).join("");
      sel.innerHTML=`<option value="ALL">全員</option><option value="ROLE:STAFF">スタッフ全員</option><option value="ROLE:TRAINER">トレーナー全員</option>${me?'<option value="ME">自分</option>':''}${people}`;if([...sel.options].some(o=>o.value===current))sel.value=current;
    }
    function renderMonthly(){
      const board=document.querySelector("#monthlyBoard");if(!board)return;const f=document.querySelector("#monthlyFilter")?.value||"ALL";const people=new Map((state.staff||[]).map(s=>[String(s.staff_code),s]));let rows=(state.monthlyScheduleRows||[]).slice();
      if(f==="ME")rows=rows.filter(r=>String(r.staff_code)===String(state.authUser?.staff_code));
      else if(f.startsWith("P:"))rows=rows.filter(r=>String(r.staff_code)===f.slice(2));
      else if(f.startsWith("ROLE:")){const role=f.slice(5);rows=rows.filter(r=>String(people.get(String(r.staff_code))?.role||"").toUpperCase()===role);}
      if(!rows.length){board.innerHTML='<div class="staff-schedule-empty"><strong>この月の予定はありません</strong><span>選択条件に該当する勤務シフトはありません。</span></div>';return;}
      const byDate=new Map();rows.forEach(r=>{if(!byDate.has(r.date))byDate.set(r.date,[]);byDate.get(r.date).push(r);});
      board.innerHTML=[...byDate.entries()].map(([date,a])=>`<section class="staff-day-section"><div class="staff-day-head"><strong>${esc(date)}</strong></div><div class="staff-reservation-list">${a.map(r=>{const p=people.get(String(r.staff_code))||{};const name=p.display_name||p.staff_name||r.staff_name||r.staff_code;const label=String(p.role).toUpperCase()==="TRAINER"?`${name}トレーナー`:`${name}さん`;return `<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(r.start_time)}〜${esc(r.end_time)}</div><div class="staff-reservation-service"><strong>${esc(label)}</strong><small>${esc(r.staff_code||"")}</small></div><div class="staff-reservation-customer"><strong>勤務シフト</strong><small>${esc(r.store_code||"")}</small></div></div>`;}).join("")}</div></section>`).join("");
    }

    ensureMonthlyUi();
    if(state.authUser)applyPermissionUi();
  };
  ready();
})();