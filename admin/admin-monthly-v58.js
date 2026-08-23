(()=>{
  function boot(){
    if(typeof apiGet!=="function"||typeof apiPost!=="function"||typeof state==="undefined"){setTimeout(boot,100);return;}

    const originalApply=applyPermissionUi;
    applyPermissionUi=function(){
      originalApply();
      if(state.authUser?.staff_code)document.querySelector("#myShiftNav")?.classList.remove("is-hidden");
      buildMonthly();
    };
    canUseMyShift=function(){return !!state.authUser?.staff_code;};

    const originalRender=renderMyShiftRows;
    renderMyShiftRows=function(){
      if(!isManagementUser())return originalRender();
      const box=document.querySelector("#myShiftList"),rows=state.myShiftRows||[];
      if(!box)return;
      const p=document.querySelector("#myShiftView .page-heading p:last-child");if(p)p.textContent="自分の確定シフトを確認できます。ADMIN / MANAGERは申請なしで直接変更・削除できます。";
      document.querySelector("#myShiftRequestHistory")?.closest("section")?.classList.add("is-hidden");
      if(!rows.length){box.innerHTML='<div class="registered-shift-empty">この月の確定シフトはありません。</div>';return;}
      box.innerHTML=rows.map((r,i)=>`<div class="registered-shift-row"><div class="registered-shift-time"><strong>${esc(r.date)}</strong></div><div class="registered-shift-meta"><span>${esc(r.start_time)}〜${esc(r.end_time)}</span><small>${esc(r.store_code||"")}</small></div><div class="registered-shift-actions"><button class="ghost-button" data-direct-edit="${i}">直接変更</button><button class="danger-ghost" data-direct-delete="${i}">直接削除</button></div></div>`).join("");
      box.querySelectorAll("[data-direct-edit]").forEach(b=>b.onclick=async()=>{const r=rows[+b.dataset.directEdit],s=prompt("開始時刻",String(r.start_time).slice(0,5));if(s===null)return;const e=prompt("終了時刻",String(r.end_time).slice(0,5));if(e===null)return;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e)||s>=e)return alert("時刻を確認してください。");try{await apiPost({action:"saveStaffShift",shift_id:r.shift_id,staff_code:state.authUser.staff_code,store_code:r.store_code||state.authUser.store_code||"YACHIYO",date:r.date,start_time:s,end_time:e});await loadMyShiftView()}catch(x){alert(x.message)}});
      box.querySelectorAll("[data-direct-delete]").forEach(b=>b.onclick=async()=>{const r=rows[+b.dataset.directDelete];if(!confirm(`${r.date} ${r.start_time}〜${r.end_time} を削除しますか？`))return;try{await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});await loadMyShiftView()}catch(x){alert(x.message)}});
    };

    function buildMonthly(){
      if(document.querySelector('[data-view="monthlySchedule"]'))return;
      const nav=document.querySelector(".topnav"),main=document.querySelector("main.main");if(!nav||!main)return;
      const b=document.createElement("button");b.className="nav-button";b.dataset.view="monthlySchedule";b.innerHTML="<span>📅</span>予定一覧";nav.insertBefore(b,nav.querySelector('[data-view="registration"]'));
      const v=document.createElement("section");v.id="monthlyScheduleView";v.className="view";v.innerHTML=`<div class="page-heading"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h1>予定一覧</h1><p>月単位で全スタッフ・トレーナーの勤務予定を確認します。</p></div></div><div class="schedule-toolbar card"><div class="toolbar-group"><button id="mPrev" class="icon-button">‹</button><button id="mNow" class="ghost-button">今月</button><button id="mNext" class="icon-button">›</button></div><strong id="mLabel" class="period-title"></strong><select id="mFilter" style="min-width:220px"></select></div><div id="mBoard" class="schedule-board card"></div>`;main.insertBefore(v,document.querySelector("#registrationView"));
      state.monthlyMonth=state.monthlyMonth||localYmd().slice(0,7);
      b.onclick=()=>{document.querySelectorAll(".nav-button").forEach(x=>x.classList.toggle("is-active",x===b));document.querySelectorAll(".view").forEach(x=>x.classList.remove("is-active"));v.classList.add("is-active");loadMonth()};
      document.querySelector("#mPrev").onclick=()=>move(-1);document.querySelector("#mNext").onclick=()=>move(1);document.querySelector("#mNow").onclick=()=>{state.monthlyMonth=localYmd().slice(0,7);loadMonth()};document.querySelector("#mFilter").onchange=renderMonth;
    }
    function move(n){const [y,m]=state.monthlyMonth.split("-").map(Number),d=new Date(y,m-1+n,1);state.monthlyMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;loadMonth()}
    async function loadMonth(){const ym=state.monthlyMonth,r={start:`${ym}-01`,end:`${ym}-${String(new Date(+ym.slice(0,4),+ym.slice(5,7),0).getDate()).padStart(2,"0")}`},board=document.querySelector("#mBoard");document.querySelector("#mLabel").textContent=`${+ym.slice(0,4)}年${+ym.slice(5,7)}月`;board.innerHTML='<div class="staff-schedule-loading">読み込んでいます…</div>';try{if(!state.staff.length){const s=await apiGet("getStaff",{include_inactive:"false"});state.staff=Array.isArray(s.data?.staff)?s.data.staff:(Array.isArray(s.data)?s.data:[])}const j=await apiGet("getStaffShifts",{start_date:r.start,end_date:r.end});state.monthlyRows=(Array.isArray(j.data)?j.data:(j.data?.shifts||[])).filter(x=>x.active!==false);filters();renderMonth()}catch(e){board.innerHTML=`<div class="staff-schedule-empty"><strong>取得できませんでした</strong><span>${esc(e.message)}</span></div>`}}
    function filters(){const s=document.querySelector("#mFilter"),cur=s.value||"ALL",a=state.staff.filter(x=>x.active!==false),me=state.authUser?.staff_code||"";s.innerHTML=`<option value="ALL">全員</option><option value="STAFF">スタッフ全員</option><option value="TRAINER">トレーナー全員</option>${me?'<option value="ME">自分</option>':''}`+a.map(x=>`<option value="P:${esc(x.staff_code)}">${esc((x.display_name||x.staff_name||x.staff_code)+(String(x.role).toUpperCase()==="TRAINER"?"トレーナー":"さん"))}</option>`).join("");if([...s.options].some(o=>o.value===cur))s.value=cur}
    function renderMonth(){const board=document.querySelector("#mBoard"),f=document.querySelector("#mFilter").value,people=new Map(state.staff.map(x=>[String(x.staff_code),x]));let a=(state.monthlyRows||[]).slice();if(f==="ME")a=a.filter(x=>String(x.staff_code)===String(state.authUser.staff_code));else if(f==="STAFF"||f==="TRAINER")a=a.filter(x=>String(people.get(String(x.staff_code))?.role).toUpperCase()===f);else if(f.startsWith("P:"))a=a.filter(x=>String(x.staff_code)===f.slice(2));a.sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.start_time).localeCompare(String(y.start_time)));if(!a.length){board.innerHTML='<div class="staff-schedule-empty"><strong>この月の予定はありません</strong></div>';return}board.innerHTML=a.map(x=>{const p=people.get(String(x.staff_code))||{},n=p.display_name||p.staff_name||x.staff_name||x.staff_code,label=n+(String(p.role).toUpperCase()==="TRAINER"?"トレーナー":"さん");return `<div class="registered-shift-row"><div class="registered-shift-time"><strong>${esc(x.date)}</strong></div><div class="registered-shift-meta"><span>${esc(x.start_time)}〜${esc(x.end_time)}</span><small>${esc(label)}</small></div></div>`}).join("")}

    buildMonthly();
    if(state.authUser)applyPermissionUi();
  }
  boot();
})();