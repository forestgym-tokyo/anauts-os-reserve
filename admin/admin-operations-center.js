(()=>{
  "use strict";

  const STORE_CODE="YACHIYO";
  const SINGLE_AUTO=new Set(["TOUR","COUNSEL","MEAL_PLANNING"]);
  const ALL_CAPACITY=new Set(["PROCEDURE","UNSUBSCRIBE","TRAINING_SUPPORT45"]);
  const PERSONAL_RE=/^PT(?:_|\d|$)/;
  const OPS={loading:false,alerts:[],staff:[],services:[],shifts:[],reservations:[],horizon:14,staffSaveBypass:false,shiftSubmitBypass:false,pendingConflictText:"",apiWrapped:false};
  const q=s=>document.querySelector(s), qa=s=>Array.from(document.querySelectorAll(s));
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(v,n)=>{const [y,m,d]=String(v).split("-").map(Number),x=new Date(y,m-1,d+n);return ymd(x)};
  const min=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(v||""));return m?Number(m[1])*60+Number(m[2]):NaN};
  const overlap=(a1,a2,b1,b2)=>min(a1)<min(b2)&&min(a2)>min(b1);
  const covers=(s,e,rs,re)=>min(s)<=min(rs)&&min(e)>=min(re);
  const isCancelled=r=>String(r?.status||"").trim().toUpperCase()==="CANCELLED";
  const codeOf=r=>String(r?.service_code||"").trim().toUpperCase();
  const isPersonal=r=>PERSONAL_RE.test(codeOf(r))||String(r?.service_name||"").includes("パーソナル");
  const serviceFor=r=>OPS.services.find(s=>String(s.service_code||"").toUpperCase()===codeOf(r))||{};
  const staffFor=code=>OPS.staff.find(s=>String(s.staff_code||"")===String(code||""))||null;
  const isActive=s=>!!s&&(s.active===true||String(s.active).toUpperCase()==="TRUE");
  const bool=v=>v===true||String(v).toUpperCase()==="TRUE";

  function permissionColumn(code){
    if(PERSONAL_RE.test(code))return"can_personal";
    if(code==="TOUR")return"can_tour";
    if(code==="COUNSEL")return"can_counsel";
    if(code==="MEAL_PLANNING")return"can_meal_planning";
    if(code==="PROCEDURE")return"can_procedure";
    if(code==="UNSUBSCRIBE")return"can_unsubscribe";
    if(code==="TRAINING_SUPPORT45")return"can_training_support";
    return"";
  }
  function roleAllowed(s,service){
    const roles=String(service.provider_role||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
    return !roles.length||roles.includes(String(s?.role||"").toUpperCase());
  }
  function serviceAllowed(s,service){const col=permissionColumn(String(service.service_code||"").toUpperCase());return !col||bool(s?.[col]);}
  function staffEligible(s,service){return isActive(s)&&roleAllowed(s,service)&&serviceAllowed(s,service);}
  function shiftsFor(code,date){return OPS.shifts.filter(x=>x.active!==false&&String(x.staff_code)===String(code)&&String(x.date)===date);}
  function staffWorks(s,r){return shiftsFor(s.staff_code,String(r.date||r.reservation_date||"")).some(x=>covers(x.start_time,x.end_time,r.start_time,r.end_time));}
  function reservationDate(r){return String(r.date||r.reservation_date||"");}
  function labelStaff(s){const n=String(s?.display_name||s?.staff_name||s?.staff_code||"");return String(s?.role||"").toUpperCase()==="TRAINER"?(n.endsWith("トレーナー")?n:`${n}トレーナー`):(n.endsWith("さん")?n:`${n}さん`)}
  function dedupe(rows){const m=new Map();for(const r of rows){const k=String(r.reservation_id||`${reservationDate(r)}|${r.start_time}|${r.service_code}|${r.customer_name}`);if(!m.has(k))m.set(k,r);}return Array.from(m.values());}

  function candidatesFor(r){
    const service=serviceFor(r),date=reservationDate(r);
    const base=OPS.staff.filter(s=>staffEligible(s,service)&&staffWorks(s,{...r,date}));
    return base.filter(s=>!OPS.reservations.some(o=>{
      if(o===r||isCancelled(o)||reservationDate(o)!==date)return false;
      if(String(o.staff_code||"")!==String(s.staff_code||""))return false;
      return overlap(o.start_time,o.end_time,r.start_time,r.end_time);
    }));
  }
  function assignmentState(r){
    const service=serviceFor(r),code=codeOf(r),cands=candidatesFor(r);
    if(ALL_CAPACITY.has(code))return{valid:cands.length>0,candidates:cands,reason:cands.length?"":"対応可能者がいません"};
    const assigned=staffFor(r.staff_code);
    const valid=!!assigned&&staffEligible(assigned,service)&&staffWorks(assigned,r);
    if(valid)return{valid:true,candidates:cands,assigned};
    return{valid:false,candidates:cands,assigned,reason:!r.staff_code?"担当者未設定":"現在の担当者が対応できません"};
  }

  async function ensureMaster(start,end){
    if(!OPS.staff.length){const j=await apiGet("getStaff",{include_inactive:"true"});OPS.staff=Array.isArray(j.data?.staff)?j.data.staff:(Array.isArray(j.data)?j.data:[]);}
    if(!OPS.services.length){const j=await apiGet("getServices");OPS.services=Array.isArray(j.data?.services)?j.data.services:(Array.isArray(j.data)?j.data:[]);}
    const sj=await apiGet("getStaffShifts",{start_date:start,end_date:end});
    OPS.shifts=(Array.isArray(sj.data)?sj.data:(Array.isArray(sj.data?.shifts)?sj.data.shifts:[])).filter(x=>x.active!==false);
  }
  async function fetchDateReservations(date){
    const rows=[];
    for(const action of ["getStaffSchedule","getTrainerSchedule"]){
      try{const j=await apiGet(action,{date,store_code:STORE_CODE});rows.push(...(Array.isArray(j.data?.reservations)?j.data.reservations:[]).map(r=>({...r,date:reservationDate(r)||date})));}catch(_){ }
    }
    return dedupe(rows.filter(r=>!isCancelled(r)));
  }

  function fairnessRank(s,r){
    const p=String(s.permission||s.auth_permission||s.user_permission||"").toUpperCase();
    const pr=p==="ADMIN"?0:(p==="MANAGER"?1:2);
    const date=reservationDate(r);
    const assigned=OPS.reservations.filter(x=>reservationDate(x)===date&&String(x.staff_code||"")===String(s.staff_code||"")&&SINGLE_AUTO.has(codeOf(x)));
    const last=assigned.reduce((m,x)=>Math.max(m,min(x.start_time)||0),0);
    return[pr,assigned.length,last,String(s.staff_code||"")];
  }
  function bestAutoCandidate(r,cands){return cands.slice().sort((a,b)=>{const x=fairnessRank(a,r),y=fairnessRank(b,r);for(let i=0;i<x.length;i++){if(x[i]<y[i])return-1;if(x[i]>y[i])return 1;}return 0;})[0]||null;}
  async function autoResolveAssignable(){
    const targets=OPS.alerts.filter(x=>SINGLE_AUTO.has(codeOf(x.r))&&(x.state.candidates||[]).length>0);
    for(const x of targets){
      const cands=x.state.candidates||[];
      /*
       * 候補1名なら自動割当。複数候補は、全候補のpermissionが取得できる場合だけ
       * ADMIN > MANAGER > 当日割当件数 > 最終割当 > staff_code の順で自動決定する。
       * permissionが取得できない環境では誤った優先付けを避け、TOPで手動選択に残す。
       */
      const hasPermissions=cands.every(s=>String(s.permission||s.auth_permission||s.user_permission||"").trim());
      if(cands.length>1&&!hasPermissions)continue;
      const chosen=cands.length===1?cands[0]:bestAutoCandidate(x.r,cands);
      if(!chosen||!x.r.reservation_id)continue;
      try{
        await apiPost({action:"updateReservation",reservation_id:x.r.reservation_id,date:reservationDate(x.r),start_time:String(x.r.start_time||"").slice(0,5),staff_code:chosen.staff_code});
        x.r.staff_code=chosen.staff_code;x.r.staff_name=chosen.staff_name||chosen.display_name||chosen.staff_code;
      }catch(_){ }
    }
  }

  async function scanOperations(start=localYmd(),days=OPS.horizon){
    const end=addDays(start,days);
    await ensureMaster(start,end);
    const dates=Array.from({length:days+1},(_,i)=>addDays(start,i));
    const all=[];let cursor=0;
    const worker=async()=>{while(cursor<dates.length){const d=dates[cursor++];all.push(...await fetchDateReservations(d));}};
    await Promise.all(Array.from({length:Math.min(5,dates.length)},worker));
    OPS.reservations=dedupe(all);
    OPS.alerts=OPS.reservations.map(r=>({r,state:assignmentState(r)})).filter(x=>!x.state.valid);
    // Automatic updateReservation is disabled because it sends customer mail.
    OPS.alerts=OPS.reservations.map(r=>({r,state:assignmentState(r)})).filter(x=>!x.state.valid);
    return OPS.alerts;
  }

  function ensureStyle(){
    if(q("#opsCenterStyle"))return;
    const s=document.createElement("style");s.id="opsCenterStyle";s.textContent=`
      #operationsTopNav.is-hidden{display:none!important}.ops-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px}.ops-card{padding:18px}.ops-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.ops-head h2{margin:0;font-size:18px}.ops-count{display:inline-flex;min-width:30px;height:30px;align-items:center;justify-content:center;border-radius:999px;font-weight:900}.ops-count.red{background:#4a171b;color:#ff9ca3}.ops-count.amber{background:#403015;color:#ffd27a}.ops-alert{display:grid;grid-template-columns:100px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid #294037}.ops-alert:first-child{border-top:0}.ops-alert-time{font-weight:900}.ops-alert-main strong{display:block;color:#fff}.ops-alert-main small{display:block;margin-top:4px;color:#9cadA4;line-height:1.5}.ops-alert-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ops-danger{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:999px;background:#4a171b;color:#ff9ca3;font-size:11px;font-weight:900}.ops-empty{padding:16px;border:1px dashed #345047;border-radius:12px;color:#91a198;text-align:center}.ops-detail-nav{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.ops-unassigned-badge{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:999px;background:#4a171b;color:#ff9ca3;font-size:11px;font-weight:900}.ops-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72)}.ops-modal-card{width:min(560px,100%);max-height:80vh;overflow:auto;padding:20px;border:1px solid #345047;border-radius:16px;background:#10231d}.ops-modal-card h2{margin:0 0 8px}.ops-choice{display:grid;gap:8px;margin-top:14px}.ops-choice button{width:100%;text-align:left}.staff-reservation-row .withdrawal-link-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:6px!important;min-width:230px!important;flex-wrap:nowrap!important}.staff-reservation-row .withdrawal-link-actions>button{box-sizing:border-box!important;width:112px!important;min-width:112px!important;height:34px!important;min-height:34px!important;padding:7px 10px!important;border:1px solid #cfd4d4!important;border-radius:8px!important;background:#fff!important;color:#101828!important;font-size:12px!important;font-weight:700!important;line-height:18px!important;white-space:nowrap!important;margin:0!important}.staff-reservation-row .withdrawal-link-actions>.withdrawal-form-shortcut{color:#b42318!important}@media(max-width:700px){.staff-reservation-row .withdrawal-link-actions{width:100%!important;min-width:0!important;justify-content:stretch!important}.staff-reservation-row .withdrawal-link-actions>button{width:50%!important;min-width:0!important;flex:1 1 0!important}}@media(max-width:900px){.ops-grid{grid-template-columns:1fr}.ops-alert{grid-template-columns:1fr}.ops-alert-actions{justify-content:flex-start}}`;
    document.head.appendChild(s);
  }

  function buildTop(){
    if(q("#operationsTopNav"))return;
    const nav=q(".topnav"),main=q("main.main"),first=q("#staffScheduleView");if(!nav||!main||!first)return;
    ensureStyle();
    const b=document.createElement("button");b.id="operationsTopNav";b.className="nav-button is-hidden";b.type="button";b.dataset.view="operationsTop";b.innerHTML="<span>⌂</span>TOP";nav.insertBefore(b,nav.firstChild);
    const v=document.createElement("section");v.id="operationsTopView";v.className="view";v.innerHTML=`<div class="page-heading"><div><p class="eyebrow">OPERATIONS DASHBOARD</p><h1>TOP</h1><p>今日の運営で確認が必要な事項をまとめて表示します。</p></div></div><div class="schedule-toolbar card"><strong class="period-title" id="opsTodayLabel"></strong><button id="opsReload" class="ghost-button" type="button">再読込</button></div><div id="opsTopMessage" class="form-message is-hidden"></div><div class="ops-grid"><section class="card ops-card"><div class="ops-head"><h2>🔴 担当者なし予約</h2><span id="opsUnassignedCount" class="ops-count red">0</span></div><div id="opsUnassigned"><div class="staff-schedule-loading">確認しています…</div></div></section><section class="card ops-card"><div class="ops-head"><h2>🔴 重大トラブル</h2><span class="ops-count red">—</span></div><div class="ops-empty">日報の共有保存API接続後、全スタッフ・トレーナーに表示します。</div></section><section class="card ops-card"><div class="ops-head"><h2>🟡 引継ぎ・要対応</h2><span class="ops-count amber">—</span></div><div class="ops-empty">日報の共有保存API接続後に表示します。</div></section><section class="card ops-card"><div class="ops-head"><h2>本日の予定</h2></div><div id="opsTodaySummary" class="schedule-summary"></div></section></div>`;
    main.insertBefore(v,first);b.onclick=()=>openTop();q("#opsReload").onclick=()=>loadTop(true);
  }
  function activateView(viewId,navSelector){qa(".nav-button").forEach(x=>x.classList.toggle("is-active",x.matches(navSelector)));qa(".view").forEach(x=>x.classList.toggle("is-active",x.id===viewId));}
  async function openTop(){if(!state?.authUser)return;activateView("operationsTopView","#operationsTopNav");await loadTop();}
  async function loadTop(force=false){
    if(OPS.loading)return;OPS.loading=true;q("#opsTodayLabel").textContent=formatStaffDate(localYmd());q("#opsUnassigned").innerHTML='<div class="staff-schedule-loading">担当状況を確認しています…</div>';
    try{await scanOperations(localYmd(),OPS.horizon);renderTop();enhanceCurrentSchedule();}catch(e){q("#opsUnassigned").innerHTML=`<div class="ops-empty">${esc(e.message||"取得できませんでした")}</div>`;}finally{OPS.loading=false;}
  }
  function renderTop(){
    q("#opsUnassignedCount").textContent=String(OPS.alerts.length);
    const box=q("#opsUnassigned");
    if(!OPS.alerts.length)box.innerHTML='<div class="ops-empty">担当者なしの予約はありません。</div>';
    else box.innerHTML=OPS.alerts.map((x,i)=>{const r=x.r,cs=x.state.candidates||[],kind=isPersonal(r)||String(serviceFor(r).provider_role||"").toUpperCase()==="TRAINER"?"TRAINER":"STAFF";return `<div class="ops-alert"><div class="ops-alert-time">${esc(reservationDate(r))}<br>${esc(String(r.start_time||"").slice(0,5))}</div><div class="ops-alert-main"><strong>${esc(r.service_name||r.service_code||"予約")} / ${esc(r.customer_name||"氏名未登録")}</strong><span class="ops-danger">担当者なし</span><small>${esc(x.state.reason||"")}${cs.length?` / 対応候補 ${cs.map(labelStaff).map(esc).join("、")}`:""}</small></div><div class="ops-alert-actions"><button class="ghost-button" data-ops-open="${i}" data-kind="${kind}">予定を開く</button>${cs.length?`<button class="ghost-button" data-ops-assign="${i}">代替担当者</button>`:""}<button class="ghost-button" data-ops-manage="${i}">予約日時を変更</button><button class="danger-ghost" data-ops-reschedule="${i}">リスケ依頼</button></div></div>`}).join("");
    qa("[data-ops-open]").forEach(b=>b.onclick=()=>{const x=OPS.alerts[+b.dataset.opsOpen];goToSchedule(b.dataset.kind,reservationDate(x.r));});
    qa("[data-ops-manage]").forEach(b=>b.onclick=()=>{const r=OPS.alerts[+b.dataset.opsManage]?.r;if(r?.reservation_id&&typeof openReservationManageFromStaff_==="function")openReservationManageFromStaff_(r.reservation_id);});
    qa("[data-ops-assign]").forEach(b=>b.onclick=()=>chooseReplacement(+b.dataset.opsAssign));
    qa("[data-ops-reschedule]").forEach(b=>b.onclick=()=>sendReschedule(+b.dataset.opsReschedule));
    const todayRows=OPS.reservations.filter(r=>reservationDate(r)===localYmd());const by=new Map();todayRows.forEach(r=>{const k=String(r.service_name||r.service_code||"その他");by.set(k,(by.get(k)||0)+1)});q("#opsTodaySummary").innerHTML=by.size?Array.from(by.entries()).map(([k,n])=>`<span>${esc(k)} <b>${n}</b>件</span>`).join(""):'<span>本日の予約はありません。</span>';
  }
  function modal(title,body){q("#opsModal")?.remove();const m=document.createElement("div");m.id="opsModal";m.className="ops-modal";m.innerHTML=`<div class="ops-modal-card"><h2>${esc(title)}</h2><div>${body}</div><div style="margin-top:14px"><button id="opsModalClose" class="ghost-button" type="button">閉じる</button></div></div>`;document.body.appendChild(m);q("#opsModalClose").onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove()};return m;}
  async function chooseReplacement(index){const x=OPS.alerts[index];if(!x)return;const cs=x.state.candidates||[];const m=modal("代替担当者を設定",`<p>${esc(reservationDate(x.r))} ${esc(x.r.start_time)} ${esc(x.r.service_name||x.r.service_code)}</p><div class="ops-choice">${cs.map((s,i)=>`<button class="ghost-button" data-ops-candidate="${i}">${esc(labelStaff(s))}</button>`).join("")}</div>`);qa("#opsModal [data-ops-candidate]").forEach(b=>b.onclick=async()=>{const s=cs[+b.dataset.opsCandidate];if(!confirm(`${labelStaff(s)}を担当者に設定しますか？`))return;try{await apiPost({action:"updateReservation",reservation_id:x.r.reservation_id,date:reservationDate(x.r),start_time:String(x.r.start_time).slice(0,5),staff_code:s.staff_code});m.remove();await loadTop(true);}catch(e){alert(e.message||"担当者を変更できませんでした。")}});}
  async function sendReschedule(index){const r=OPS.alerts[index]?.r;if(!r)return;let email=String(r.customer_email||"");try{if(!email&&r.reservation_id){const j=await apiGet("getReservation",{reservation_id:r.reservation_id});email=String(j.data?.customer_email||j.data?.reservation?.customer_email||"");}}catch(_){ }
    const subject="ご予約変更・キャンセルのお願い｜The Forest Gym";
    const dateText=reservationDate(r);const body=`${r.customer_name||""}様\n\nいつもThe Forest Gymをご利用いただき、誠にありがとうございます。\n\n現在ご予約いただいております下記のご予約につきまして、担当予定者の都合により、現在の日時でのご案内が難しくなりました。\n\n【現在のご予約】\n${dateText} ${String(r.start_time||"").slice(0,5)}〜${String(r.end_time||"").slice(0,5)}\n${r.service_name||r.service_code||""}\n\n大変お手数をおかけいたしますが、予約メール内の「予約変更・キャンセル」より、ご都合の良い日時への変更、またはキャンセルのお手続きをお願いいたします。\n\nご迷惑をおかけし、申し訳ございません。\n何卒ご理解、ご協力のほどよろしくお願いいたします。\n\nThe Forest Gym`;
    if(email)location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;else modal("リスケ依頼文",`<pre style="white-space:pre-wrap">${esc(body)}</pre>`);
  }

  async function goToSchedule(kind,date){
    const trainer=String(kind).toUpperCase()==="TRAINER";const nav=q(`[data-view="${trainer?"trainerSchedule":"staffSchedule"}"]`),viewId=trainer?"trainerScheduleView":"staffScheduleView";
    if(!nav)return;qa(".nav-button").forEach(x=>x.classList.toggle("is-active",x===nav));qa(".view").forEach(x=>x.classList.toggle("is-active",x.id===viewId));
    if(trainer){state.trainerScheduleDate=date;await loadTrainerSchedule();}else{state.staffScheduleDate=date;await loadStaffSchedule();}
    setTimeout(enhanceCurrentSchedule,50);
  }
  window.ANAUTS_OPS_GO_TO_SCHEDULE=goToSchedule;

  function enhanceCalendarDetails(){
    const my=q("#myCalDetail:not(.is-hidden)");if(my&&!my.querySelector(".ops-detail-nav")){const role=String(state?.authUser?.role||"").toUpperCase()==="TRAINER"?"TRAINER":"STAFF",date=String(my.querySelector("h3")?.textContent.match(/\d{4}-\d{2}-\d{2}/)?.[0]||state?.myShiftDate||"");const d=document.createElement("div");d.className="ops-detail-nav";d.innerHTML=`<button class="ghost-button" type="button">詳細</button>`;d.querySelector("button").onclick=()=>goToSchedule(role,date);my.insertBefore(d,my.children[1]||null);}
    const md=q("#mDetail:not(.is-hidden)");if(md&&!md.querySelector(".ops-detail-nav")){const date=md.querySelector("h3")?.textContent.match(/\d{4}-\d{2}-\d{2}/)?.[0]||"",f=q("#mFilter")?.value||"ALL",d=document.createElement("div");d.className="ops-detail-nav";if(f==="TRAINER")d.innerHTML='<button class="ghost-button" data-k="TRAINER">詳細</button>';else if(f==="STAFF")d.innerHTML='<button class="ghost-button" data-k="STAFF">詳細</button>';else if(f.startsWith("P:")||f==="ME"){const code=f==="ME"?state.authUser?.staff_code:f.slice(2),s=staffFor(code)||OPS.staff.find(x=>String(x.staff_code)===String(code)),k=String(s?.role||state.authUser?.role||"").toUpperCase()==="TRAINER"?"TRAINER":"STAFF";d.innerHTML=`<button class="ghost-button" data-k="${k}">詳細</button>`;}else d.innerHTML='<button class="ghost-button" data-k="STAFF">スタッフ予定</button><button class="ghost-button" data-k="TRAINER">トレーナー予定</button>';d.querySelectorAll("button").forEach(b=>b.onclick=()=>goToSchedule(b.dataset.k,date));md.insertBefore(d,md.children[1]||null);}
    const ec=q("#ecDetail:not(.is-hidden)");if(ec){const date=ec.querySelector("h3")?.textContent.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)||null,iso=date?`${date[1]}-${String(date[2]).padStart(2,"0")}-${String(date[3]).padStart(2,"0")}`:"",kind=q("#ecTrainerMode")?.classList.contains("is-active")?"TRAINER":"STAFF";qa("#ecDetail [data-ec-res]").forEach(b=>{b.textContent="詳細";b.removeAttribute("data-ec-res");const n=b.cloneNode(true);b.replaceWith(n);n.onclick=()=>goToSchedule(kind,iso);});if(!ec.querySelector(".ops-detail-nav")){const d=document.createElement("div");d.className="ops-detail-nav";d.innerHTML='<button class="ghost-button">この日の予定を開く</button>';d.querySelector("button").onclick=()=>goToSchedule(kind,iso);ec.insertBefore(d,ec.children[1]||null);}}
  }

  function fixWithdrawalLayout(){
    qa("#staffScheduleBoard .staff-reservation-row").forEach(row=>{
      let w=row.querySelector(":scope > .withdrawal-link-actions");
      let manage=row.querySelector(":scope > .reservation-manage-button");
      let withdrawal=row.querySelector(":scope > .withdrawal-form-shortcut");
      if(!w&&manage&&withdrawal){
        w=document.createElement("div");w.className="withdrawal-link-actions";
        row.insertBefore(w,manage);w.append(manage,withdrawal);
      }
      if(!w)return;
      manage=w.querySelector(".reservation-manage-button");
      withdrawal=w.querySelector(".withdrawal-form-shortcut");
      if(manage)manage.style.cssText="";
      if(withdrawal){withdrawal.style.cssText="";withdrawal.classList.add("reservation-manage-button");}
    });
  }
  async function enhanceCurrentSchedule(){
    fixWithdrawalLayout();
    const date=q("#staffScheduleView.is-active")?state.staffScheduleDate:(q("#trainerScheduleView.is-active")?state.trainerScheduleDate:"");if(!date)return;
    try{await ensureMaster(date,date);const rows=await fetchDateReservations(date);OPS.reservations=rows;const invalid=rows.map(r=>({r,state:assignmentState(r)})).filter(x=>!x.state.valid);const trainerView=!!q("#trainerScheduleView.is-active"),board=q(trainerView?"#trainerScheduleBoard":"#staffScheduleBoard");board?.querySelector(".ops-unassigned-section")?.remove();for(const x of invalid){const rid=String(x.r.reservation_id||"");let row=rid?q(`[data-reservation-id="${CSS.escape(rid)}"]`)?.closest(".staff-reservation-row"):null;if(row&&!row.querySelector(".ops-unassigned-badge")){const badge=document.createElement("span");badge.className="ops-unassigned-badge";badge.textContent="担当者なし";(row.querySelector(".staff-reservation-service")||row).appendChild(badge);}}const missing=invalid.filter(x=>{const svc=serviceFor(x.r),roles=String(svc.provider_role||x.r.provider_role||"").toUpperCase();const belongs=trainerView?(isPersonal(x.r)||roles.includes("TRAINER")):(!isPersonal(x.r)&&(!roles||roles.includes("STAFF")));if(!belongs)return false;const rid=String(x.r.reservation_id||"");return !rid||!q(`[data-reservation-id="${CSS.escape(rid)}"]`);});if(board&&missing.length){const sec=document.createElement("section");sec.className="staff-day-section ops-unassigned-section";sec.innerHTML=`<div class="staff-day-head"><div class="staff-day-person"><span class="staff-day-avatar">!</span><span><strong>担当者なし</strong><small>要対応</small></span></div></div><div class="staff-reservation-list">${missing.map(x=>`<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(x.r.start_time)}〜${esc(x.r.end_time)}</div><div class="staff-reservation-service"><strong>${esc(x.r.service_name||x.r.service_code)}</strong><small>${esc(x.r.service_code||"")}</small><span class="ops-unassigned-badge">担当者なし</span></div><div class="staff-reservation-customer"><strong>${esc(x.r.customer_name||"氏名未登録")}</strong><small>${x.r.member_no?`会員番号 ${esc(x.r.member_no)}`:""}</small></div><span class="reservation-status">${esc(x.r.status||"RESERVED")}</span><button class="reservation-manage-button" data-reservation-id="${esc(x.r.reservation_id||"")}" type="button">変更・キャンセル</button></div>`).join("")}</div>`;board.prepend(sec);if(typeof bindReservationManageButtons_==="function")bindReservationManageButtons_(sec);}
    }catch(_){ }
  }

  async function reservationsAffectedByShift(r,newStart,newEnd,deleteMode=false){
    const date=String(r.date||"");const role=String(state?.authUser?.role||"").toUpperCase()==="TRAINER"?"getTrainerSchedule":"getStaffSchedule";try{const j=await apiGet(role,{date,store_code:STORE_CODE});const rows=(Array.isArray(j.data?.reservations)?j.data.reservations:[]).filter(x=>!isCancelled(x)&&String(x.staff_code||"")===String(state.authUser?.staff_code||""));return rows.filter(x=>overlap(x.start_time,x.end_time,r.start_time,r.end_time)&&(deleteMode||!covers(newStart,newEnd,x.start_time,x.end_time)));}catch(_){return[];}
  }
  function conflictText(rows){return rows.map(x=>`${String(x.start_time||"").slice(0,5)}〜${String(x.end_time||"").slice(0,5)} ${x.service_name||x.service_code||"予約"} ${x.customer_name||""}`.trim()).join("\n");}
  function installShiftWarnings(){
    const form=q("#myShiftRequestForm");if(form&&!form.dataset.opsConflict){form.dataset.opsConflict="1";form.addEventListener("submit",async e=>{if(OPS.shiftSubmitBypass){OPS.shiftSubmitBypass=false;return;}const id=q("#myShiftEditingId")?.value||"",r=(state.myShiftRows||[]).find(x=>String(x.shift_id)===String(id));if(!r)return;e.preventDefault();e.stopImmediatePropagation();const rows=await reservationsAffectedByShift(r,q("#myShiftStart")?.value,q("#myShiftEnd")?.value,false);if(rows.length){const ok=confirm(`すでに予定が入っています。\n\n${conflictText(rows)}\n\nこのままシフト変更を申請しますか？`);if(!ok)return;OPS.pendingConflictText=conflictText(rows);}OPS.shiftSubmitBypass=true;form.requestSubmit();},true);}
    if(typeof requestDeleteMyShift==="function"&&!requestDeleteMyShift.__opsWrapped){const original=requestDeleteMyShift;const wrapped=async function(r){const rows=await reservationsAffectedByShift(r,"","",true);if(rows.length&&!confirm(`すでに予定が入っています。\n\n${conflictText(rows)}\n\nこのままシフト削除を申請しますか？`))return;if(rows.length)OPS.pendingConflictText=conflictText(rows);try{return await original(r);}finally{if(rows.length)OPS.pendingConflictText="";}};wrapped.__opsWrapped=true;requestDeleteMyShift=wrapped;}
  }

  function installStaffRoleWarning(){const form=q("#staffForm");if(!form||form.dataset.opsRoleCheck)return;form.dataset.opsRoleCheck="1";form.addEventListener("submit",async e=>{if(OPS.staffSaveBypass){OPS.staffSaveBypass=false;return;}const code=String(q("#staffCode")?.value||"").trim().toUpperCase(),old=state.staff?.find(s=>String(s.staff_code)===code);if(!old)return;const changed=String(old.role||"")!==String(q("#staffRole")?.value||"")||bool(old.can_personal)!==q("#staffCanPersonal")?.checked||bool(old.can_tour)!==q("#staffCanTour")?.checked||bool(old.can_counsel)!==q("#staffCanCounsel")?.checked||bool(old.can_meal_planning)!==q("#staffCanMealPlanning")?.checked||bool(old.can_procedure)!==q("#staffCanProcedure")?.checked||bool(old.can_unsubscribe)!==q("#staffCanUnsubscribe")?.checked||bool(old.can_training_support)!==q("#staffCanTrainingSupport")?.checked||isActive(old)!==q("#staffActive")?.checked;if(!changed)return;e.preventDefault();e.stopImmediatePropagation();try{await scanOperations(localYmd(),30);const future=OPS.reservations.filter(r=>String(r.staff_code)===code);if(future.length){const ok=confirm(`このスタッフ設定の変更により、現在担当している未来の予約を再判定します。\n対象予約 ${future.length}件\n\n担当者なしになる可能性があります。このまま変更しますか？`);if(!ok)return;}}catch(_){ }OPS.staffSaveBypass=true;form.requestSubmit();},true);}


  function wrapApiPost(){if(OPS.apiWrapped||typeof apiPost!=="function")return;const original=apiPost;apiPost=async function(payload){let p=payload;if(p&&p.action==="createShiftChangeRequest"&&OPS.pendingConflictText){const warning=`【重要：既存予定あり】\n${OPS.pendingConflictText}`;p={...p,reason:[warning,p.reason||""].filter(Boolean).join("\n\n"),has_existing_reservation:true,existing_reservation_summary:OPS.pendingConflictText};OPS.pendingConflictText="";}const result=await original(p);if(p&&["saveStaff","saveStaffShift","deleteStaffShift","createShiftChangeRequest","updateReservation"].includes(p.action)){setTimeout(async()=>{if(!state?.authUser)return;try{if(q("#operationsTopView.is-active"))await loadTop(true);else await scanOperations(localYmd(),OPS.horizon);}catch(_){ }},700);}return result;};OPS.apiWrapped=true;}

  function wrapPermissionUi(){if(typeof applyPermissionUi!=="function"||applyPermissionUi.__opsWrapped)return;const original=applyPermissionUi;const wrapped=function(){original();q("#operationsTopNav")?.classList.toggle("is-hidden",!state?.authUser);};wrapped.__opsWrapped=true;applyPermissionUi=wrapped;}
  function wrapInitialize(){if(typeof initializeAppAfterAuth!=="function"||initializeAppAfterAuth.__opsWrapped)return;const original=initializeAppAfterAuth;const wrapped=async function(){if(state?.authUser){await openTop();return;}return original();};wrapped.__opsWrapped=true;initializeAppAfterAuth=wrapped;}
  function boot(){if(typeof state==="undefined"||typeof apiGet!=="function"||typeof apiPost!=="function"||typeof localYmd!=="function"){setTimeout(boot,100);return;}buildTop();wrapApiPost();wrapPermissionUi();wrapInitialize();installShiftWarnings();installStaffRoleWarning();if(state.authUser){q("#operationsTopNav")?.classList.remove("is-hidden");setTimeout(openTop,0);}const mo=new MutationObserver(()=>{enhanceCalendarDetails();fixWithdrawalLayout();installShiftWarnings();installStaffRoleWarning();if(q("#staffScheduleView.is-active")||q("#trainerScheduleView.is-active"))setTimeout(enhanceCurrentSchedule,20);});mo.observe(document.documentElement,{childList:true,subtree:true});q("#logoutButton")?.addEventListener("click",()=>q("#operationsTopNav")?.classList.add("is-hidden"));}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
