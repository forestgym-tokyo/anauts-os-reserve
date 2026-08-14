// BUILD: 20260814-trainer-schedule-v1
const API_URL="https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const state={staff:[],stores:[],services:[],serviceHours:[],selectedServiceCode:"",selectedStaffCode:"",shiftRows:[],shiftPreview:null,staffScheduleDate:"",staffSchedule:null,trainerScheduleDate:"",trainerSchedule:null};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
async function apiGet(action,params={}){const u=new URL(API_URL);u.searchParams.set("action",action);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));u.searchParams.set("_",Date.now());const r=await fetch(u,{cache:"no-store"}),j=await r.json();if(!j.ok)throw new Error(j.message||"取得失敗");return j}
async function apiPost(p){const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(p)}),j=await r.json();if(!j.ok)throw new Error(j.message||"処理失敗");return j}
$$(".nav-button").forEach(b=>b.onclick=async()=>{$$(".nav-button").forEach(x=>x.classList.toggle("is-active",x===b));$$(".view").forEach(x=>x.classList.remove("is-active"));$("#"+b.dataset.view+"View").classList.add("is-active");if(b.dataset.view==="staffSchedule")await loadStaffSchedule();if(b.dataset.view==="trainerSchedule")await loadTrainerSchedule()});
$$(".registration-card").forEach(b=>b.onclick=()=>showRegistration(b.dataset.registration));
async function showRegistration(type){["#staffManager","#shiftManager","#serviceManager","#serviceHoursManager","#registrationPlaceholder"].forEach(x=>$(x)?.classList.add("is-hidden"));if(type==="staff"){$("#staffManager").classList.remove("is-hidden");await loadStaff();if(!state.selectedStaffCode)resetStaffForm();return}if(type==="shift"){$("#shiftManager").classList.remove("is-hidden");await Promise.all([loadStaff(),loadStores()]);setupShift();return}if(type==="service"){$("#serviceManager").classList.remove("is-hidden");await loadServices();setupServiceManager();return}if(type==="hours"){$("#serviceHoursManager").classList.remove("is-hidden");await loadServices();setupServiceHours();return}const map={},v=map[type]||["🛠️","準備中"];$("#placeholderIcon").textContent=v[0];$("#placeholderTitle").textContent=v[1];$("#registrationPlaceholder").classList.remove("is-hidden")}
async function loadStaff(){try{const j=await apiGet("getStaff",{include_inactive:"true"});state.staff=Array.isArray(j.data?.staff)?j.data.staff:Array.isArray(j.data)?j.data:[];renderStaff()}catch(e){state.staff=[];$("#staffList").innerHTML=`<div class="no-staff">${esc(e.message)}</div>`}}
async function loadStores(){try{const j=await apiGet("getStores");state.stores=Array.isArray(j.data)?j.data:[]}catch(e){msg(e.message,true)}}
function renderStaff(){
  const box=$("#staffList");
  if(!box)return;
  const q=($("#staffSearch")?.value||"").toLowerCase();
  const rows=state.staff.filter(s=>
    [s.staff_code,s.staff_name,s.display_name,s.role]
      .join(" ").toLowerCase().includes(q)
  );

  box.innerHTML=rows.map(s=>`
    <button type="button"
      class="staff-card ${String(s.staff_code)===String(state.selectedStaffCode)?"is-selected":""}"
      data-staff-code="${esc(s.staff_code)}">
      <span class="role-icon">${String(s.role).toUpperCase()==="TRAINER"?"🏋️":"👤"}</span>
      <span class="staff-meta">
        <strong>${esc(s.display_name||s.staff_name||s.staff_code)}</strong>
        <small>${esc(s.role||"")} · ${esc(s.store_code||"")}${s.active===false?" · 無効":""}</small>
      </span>
      <span class="staff-color" style="background:${esc(s.color||"#63d179")}"></span>
    </button>
  `).join("")||'<div class="no-staff">該当するスタッフがいません。</div>';

  $$("[data-staff-code]").forEach(b=>{
    b.onclick=()=>selectStaff(b.dataset.staffCode);
  });
}

$("#staffSearch")?.addEventListener("input",renderStaff);

function staffMsg(text,error=false){
  const n=$("#staffMessage");
  if(!n)return;
  n.textContent=text||"";
  n.classList.toggle("is-hidden",!text);
  n.classList.toggle("is-error",!!error);
}

function resetStaffForm(){
  state.selectedStaffCode="";
  $("#staffForm")?.reset();
  $("#staffFormTitle").textContent="新規スタッフ";
  $("#staffCodeHelp").textContent="スタッフコードは新規登録後は変更しないでください。";
  $("#staffCode").readOnly=false;
  $("#staffBrand").value="TFG";
  $("#staffStore").value="YACHIYO";
  $("#staffRole").value="STAFF";
  $("#staffActive").checked=true;
  $("#staffColor").value="#63d179";
  $("#staffColorPicker").value="#63d179";
  staffMsg("");
  renderStaff();
}

async function selectStaff(code){
  if(!code)return;
  staffMsg("");
  try{
    const j=await apiGet("getStaffByCode",{staff_code:code});
    const s=j.data||{};
    state.selectedStaffCode=s.staff_code||code;

    $("#staffFormTitle").textContent=s.display_name||s.staff_name||s.staff_code||"スタッフ編集";
    $("#staffCodeHelp").textContent=`スタッフコード：${s.staff_code||code}（編集時は変更しないでください）`;
    $("#staffCode").value=s.staff_code||"";
    $("#staffCode").readOnly=true;
    $("#staffBrand").value=s.brand_code||"TFG";
    $("#staffStore").value=s.store_code||"YACHIYO";
    $("#staffName").value=s.staff_name||"";
    $("#staffDisplayName").value=s.display_name||"";
    $("#staffEmail").value=s.email||"";
    $("#staffCalendarCode").value=s.calendar_code||"";
    $("#staffMailAccountCode").value=s.mail_account_code||"";
    $("#staffRole").value=s.role||"STAFF";
    $("#staffActive").checked=s.active!==false;

    const color=/^#[0-9A-Fa-f]{6}$/.test(s.color||"")?s.color:"#63d179";
    $("#staffColor").value=color;
    $("#staffColorPicker").value=color;

    $("#staffCanPersonal").checked=!!s.can_personal;
    $("#staffCanTour").checked=!!s.can_tour;
    $("#staffCanCounsel").checked=!!s.can_counsel;
    $("#staffCanMealPlanning").checked=!!s.can_meal_planning;
    $("#staffCanProcedure").checked=!!s.can_procedure;
    $("#staffCanUnsubscribe").checked=!!s.can_unsubscribe;
    $("#staffCanTrainingSupport").checked=!!s.can_training_support;
    $("#staffCan9Round").checked=!!s.can_9round;

    renderStaff();
  }catch(e){
    staffMsg(e.message||"スタッフ情報を取得できませんでした。",true);
  }
}

async function saveStaffFromUi(e){
  e.preventDefault();
  const code=String($("#staffCode").value||"").trim().toUpperCase();
  if(!code)return staffMsg("スタッフコードを入力してください。",true);

  const button=$("#saveStaffButton");
  button.disabled=true;
  button.textContent="保存中…";

  try{
    const j=await apiPost({
      action:"saveStaff",
      staff_code:code,
      brand_code:$("#staffBrand").value.trim(),
      store_code:$("#staffStore").value.trim(),
      staff_name:$("#staffName").value.trim(),
      display_name:$("#staffDisplayName").value.trim(),
      email:$("#staffEmail").value.trim(),
      calendar_code:$("#staffCalendarCode").value.trim(),
      mail_account_code:$("#staffMailAccountCode").value.trim(),
      color:$("#staffColor").value.trim(),
      role:$("#staffRole").value,
      active:$("#staffActive").checked,
      can_personal:$("#staffCanPersonal").checked,
      can_tour:$("#staffCanTour").checked,
      can_counsel:$("#staffCanCounsel").checked,
      can_meal_planning:$("#staffCanMealPlanning").checked,
      can_procedure:$("#staffCanProcedure").checked,
      can_unsubscribe:$("#staffCanUnsubscribe").checked,
      can_training_support:$("#staffCanTrainingSupport").checked,
      can_9round:$("#staffCan9Round").checked
    });

    await loadStaff();
    await selectStaff(code);
    staffMsg(j.data?.mode==="CREATE"?"スタッフを登録しました。":"スタッフ情報を更新しました。");
  }catch(err){
    staffMsg(err.message||"保存に失敗しました。",true);
  }finally{
    button.disabled=false;
    button.textContent="保存";
  }
}

$("#newStaffButton")?.addEventListener("click",resetStaffForm);
$("#staffForm")?.addEventListener("submit",saveStaffFromUi);
$("#staffColorPicker")?.addEventListener("input",e=>{$("#staffColor").value=e.target.value});
$("#staffColor")?.addEventListener("input",e=>{
  const v=e.target.value.trim();
  if(/^#[0-9A-Fa-f]{6}$/.test(v))$("#staffColorPicker").value=v;
});
$$(".shift-tab").forEach(b=>b.onclick=()=>{$$(".shift-tab").forEach(x=>x.classList.toggle("is-active",x===b));$("#shiftBulkPanel").classList.toggle("is-hidden",b.dataset.shiftTab!=="bulk");$("#shiftSinglePanel").classList.toggle("is-hidden",b.dataset.shiftTab!=="single");hideMsg()});
function setupShift(){const stores=state.stores.filter(s=>s.active!==false),o=stores.map(s=>`<option value="${esc(s.store_code)}">${esc(s.store_name||s.store_code)} (${esc(s.store_code)})</option>`).join("");$("#shiftBulkStore").innerHTML=o;$("#shiftSingleStore").innerHTML=o;["#shiftBulkStore","#shiftSingleStore"].forEach(x=>{if(stores.some(s=>s.store_code==="YACHIYO"))$(x).value="YACHIYO"});$("#shiftSingleStaff").innerHTML=state.staff.filter(s=>s.active!==false).map(s=>`<option value="${esc(s.staff_code)}">${esc(s.display_name||s.staff_name||s.staff_code)} (${esc(s.staff_code)})</option>`).join("");const d=new Date(),ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;$("#shiftTargetMonth").value=ym;$("#shiftSingleDate").value=`${ym}-${String(d.getDate()).padStart(2,"0")}`}
function csvLine(line){const a=[];let s="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++}else q=!q}else if(c===","&&!q){a.push(s);s=""}else s+=c}a.push(s);return a}
async function readCsv(f){const lines=(await f.text()).replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)throw new Error("CSVにデータがありません。");const h=csvLine(lines[0]).map(x=>x.trim()),req=["staff_code","date","start_time","end_time"];req.forEach(k=>{if(!h.includes(k))throw new Error(`CSVに ${k} 列がありません。`)});return lines.slice(1).map(l=>{const c=csvLine(l),o={};h.forEach((x,i)=>o[x]=String(c[i]??"").trim());return {staff_code:o.staff_code,date:o.date,start_time:o.start_time,end_time:o.end_time}})}
$("#shiftPreviewButton").onclick=async()=>{hideMsg();const f=$("#shiftCsvFile").files[0];if(!f)return msg("CSVファイルを選択してください。",true);try{state.shiftRows=await readCsv(f);const j=await apiPost({action:"previewStaffShiftImport",mode:$("#shiftImportMode").value,store_code:$("#shiftBulkStore").value,target_month:$("#shiftTargetMonth").value,rows:state.shiftRows});state.shiftPreview=j.data;renderPreview(j.data);$("#shiftImportButton").disabled=+j.data.error_count>0||+j.data.valid_count===0;msg(+j.data.error_count?"エラーがあります。CSVを修正してください。":"プレビューOKです。",+j.data.error_count>0)}catch(e){msg(e.message,true)}};
function renderPreview(d){$("#shiftPreviewArea").classList.remove("is-hidden");$("#shiftPreviewSummary").innerHTML=`<span>全 ${d.total_count}件</span><strong class="ok-count">有効 ${d.valid_count}件</strong><strong class="error-count">エラー ${d.error_count}件</strong>`;const em=new Map((d.errors||[]).map(x=>[+x.row,x]));$("#shiftPreviewBody").innerHTML=state.shiftRows.map((r,i)=>{const e=em.get(i+2),s=state.staff.find(x=>x.staff_code===r.staff_code);return `<tr class="${e?"row-error":""}"><td>${i+2}</td><td>${esc(s?.display_name||s?.staff_name||r.staff_code)}<small>${esc(r.staff_code)}</small></td><td>${esc(r.date)}</td><td>${esc(r.start_time)}</td><td>${esc(r.end_time)}</td><td>${e?`<span class="status-bad">${esc(e.message||e.code)}</span>`:'<span class="status-ok">OK</span>'}</td></tr>`}).join("")}
$("#shiftImportButton").onclick=async()=>{if(!state.shiftPreview||+state.shiftPreview.error_count)return msg("エラーのないプレビューを先に実行してください。",true);if(!confirm(`${$("#shiftTargetMonth").value} のシフト ${state.shiftRows.length}件を登録します。よろしいですか？`))return;try{const j=await apiPost({action:"importStaffShifts",mode:$("#shiftImportMode").value,store_code:$("#shiftBulkStore").value,target_month:$("#shiftTargetMonth").value,rows:state.shiftRows});msg(`登録完了：${j.data.inserted_count}件 / 無効化：${j.data.disabled_count}件`);$("#shiftImportButton").disabled=true}catch(e){msg(e.message,true)}};
$("#shiftSingleForm").onsubmit=async e=>{e.preventDefault();if($("#shiftSingleStart").value>=$("#shiftSingleEnd").value)return msg("終了時刻は開始時刻より後にしてください。",true);try{const j=await apiPost({action:"saveStaffShift",staff_code:$("#shiftSingleStaff").value,store_code:$("#shiftSingleStore").value,date:$("#shiftSingleDate").value,start_time:$("#shiftSingleStart").value,end_time:$("#shiftSingleEnd").value});msg(`保存しました：${j.data.date} ${j.data.start_time}〜${j.data.end_time}`)}catch(x){msg(x.message,true)}};
function msg(s,e=false){const n=$("#shiftMessage");n.textContent=s;n.classList.remove("is-hidden");n.classList.toggle("is-error",e)}function hideMsg(){$("#shiftMessage").classList.add("is-hidden")}
async function loadServices(){try{const j=await apiGet("getServices");state.services=Array.isArray(j.data?.services)?j.data.services:Array.isArray(j.data)?j.data:[]}catch(e){state.services=[];if($("#serviceMessage")&&!$("#serviceManager")?.classList.contains("is-hidden"))serviceMsg(e.message,true);else hoursMsg(e.message,true)}}
function setupServiceHours(){const a=state.services.filter(s=>s.active!==false),sel=$("#serviceHoursService");sel.innerHTML=a.map(s=>`<option value="${esc(s.service_code)}">${esc(s.service_name||s.name||s.service_code)} (${esc(s.service_code)})</option>`).join("");if(a.some(s=>String(s.service_code).toUpperCase()==="UNSUBSCRIBE"))sel.value="UNSUBSCRIBE";sel.onchange=loadSelectedHours;$("#newServiceHourButton").onclick=()=>{$("#serviceHourForm").classList.remove("is-hidden");$("#serviceHourDay").value="ALL";$("#serviceHourStart").value="";$("#serviceHourEnd").value="";hideHoursMsg()};$("#cancelServiceHourButton").onclick=()=>$("#serviceHourForm").classList.add("is-hidden");$("#serviceHourForm").onsubmit=saveHour;loadSelectedHours()}
async function loadSelectedHours(){const code=$("#serviceHoursService").value;if(!code){$("#serviceHoursList").innerHTML='<div class="empty-service-hours">サービスがありません。</div>';return}const s=state.services.find(x=>String(x.service_code)===code)||{};$("#serviceHoursTitle").textContent=s.service_name||s.name||code;$("#serviceHoursCode").textContent=code;try{const j=await apiGet("getServiceHours",{service_code:code});state.serviceHours=Array.isArray(j.data)?j.data:[];renderHours()}catch(e){hoursMsg(e.message,true)}}
function renderHours(){const label={ALL:"すべての曜日",SUN:"日曜日",MON:"月曜日",TUE:"火曜日",WED:"水曜日",THU:"木曜日",FRI:"金曜日",SAT:"土曜日"};const box=$("#serviceHoursList");if(!state.serviceHours.length){box.innerHTML='<div class="empty-service-hours">提供時間がまだ登録されていません。</div>';return}box.innerHTML=state.serviceHours.map((r,i)=>`<div class="service-hour-row"><div class="service-day"><strong>${label[r.day_of_week]||esc(r.day_of_week)}</strong><small>${esc(r.day_of_week)}</small></div><div class="service-time">${esc(r.start_time)} <span>〜</span> ${esc(r.end_time)}</div><button type="button" class="danger-ghost" data-i="${i}">削除</button></div>`).join("");$$(".danger-ghost[data-i]").forEach(b=>b.onclick=()=>deleteHour(state.serviceHours[+b.dataset.i]))}
async function saveHour(e){e.preventDefault();const start=$("#serviceHourStart").value,end=$("#serviceHourEnd").value;if(!start||!end)return hoursMsg("開始時刻と終了時刻を入力してください。",true);if(start>=end)return hoursMsg("終了時刻は開始時刻より後にしてください。",true);try{await apiPost({action:"saveServiceHour",service_code:$("#serviceHoursService").value,day_of_week:$("#serviceHourDay").value,start_time:start,end_time:end,active:true});$("#serviceHourForm").classList.add("is-hidden");await loadSelectedHours();hoursMsg("保存しました。")}catch(e2){hoursMsg(e2.message,true)}}
async function deleteHour(r){if(!confirm(`${r.day_of_week} ${r.start_time}〜${r.end_time} を削除しますか？`))return;try{await apiPost({action:"deleteServiceHour",service_code:r.service_code,day_of_week:r.day_of_week,start_time:r.start_time,end_time:r.end_time});await loadSelectedHours();hoursMsg("削除しました。")}catch(e){hoursMsg(e.message,true)}}
function hoursMsg(s,e=false){const n=$("#serviceHoursMessage");n.textContent=s;n.classList.remove("is-hidden");n.classList.toggle("is-error",e)}function hideHoursMsg(){const n=$("#serviceHoursMessage");n.classList.add("is-hidden");n.classList.remove("is-error")}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
(()=>{const n=$("#todayLabel"),d=new Date(),w=["日","月","火","水","木","金","土"];if(n)n.textContent=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}（${w[d.getDay()]}）`})();
state.staffScheduleDate=localYmd();loadStaffSchedule();



// ===== スタッフ予定 =====
function localYmd(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function parseYmd(v){const [y,m,d]=String(v).split("-").map(Number);return new Date(y,m-1,d)}
function moveStaffScheduleDate(days){const d=parseYmd(state.staffScheduleDate||localYmd());d.setDate(d.getDate()+days);state.staffScheduleDate=localYmd(d);loadStaffSchedule()}
function formatStaffDate(v){const d=parseYmd(v),w=["日","月","火","水","木","金","土"];return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${w[d.getDay()]}）`}
async function loadStaffSchedule(){if(!$("#staffScheduleBoard"))return;if(!state.staffScheduleDate)state.staffScheduleDate=localYmd();$("#staffScheduleDateLabel").textContent=formatStaffDate(state.staffScheduleDate);$("#staffScheduleBoard").innerHTML='<div class="staff-schedule-loading">スタッフ予定を読み込んでいます…</div>';$("#staffScheduleMessage").classList.add("is-hidden");try{const j=await apiGet("getStaffSchedule",{date:state.staffScheduleDate,store_code:"YACHIYO"});state.staffSchedule=j.data||{};renderStaffSchedule(state.staffSchedule)}catch(e){$("#staffScheduleBoard").innerHTML='<div class="staff-schedule-empty"><strong>予定を取得できませんでした</strong><span>'+esc(e.message)+'</span></div>';const n=$("#staffScheduleMessage");n.textContent=e.message;n.classList.remove("is-hidden");n.classList.add("is-error")}}
function renderStaffSchedule(d){const shifts=Array.isArray(d.shifts)?d.shifts:[],reservations=Array.isArray(d.reservations)?d.reservations:[];$("#staffScheduleSummary").innerHTML=`<span>勤務 <b>${shifts.length}</b>名</span><span>予約 <b>${reservations.length}</b>件</span>`;const staffCodes=[...new Set([...shifts.map(x=>x.staff_code),...reservations.map(x=>x.staff_code)].filter(Boolean))];if(!staffCodes.length){$("#staffScheduleBoard").innerHTML='<div class="staff-schedule-empty"><strong>この日のスタッフ予定はありません</strong><span>シフト・予約ともに登録されていません。</span></div>';return}const sections=staffCodes.map(code=>{const ss=shifts.filter(x=>x.staff_code===code),rr=reservations.filter(x=>x.staff_code===code).sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));const name=ss[0]?.staff_name||rr[0]?.staff_name||code;const shiftText=ss.length?ss.map(x=>`${esc(x.start_time)}〜${esc(x.end_time)}`).join(" / "):"シフト登録なし";const rows=rr.length?rr.map(r=>`<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(r.start_time)}〜${esc(r.end_time)}</div><div class="staff-reservation-service"><strong>${esc(r.service_name||r.service_code)}</strong><small>${esc(r.service_code||"")}</small></div><div class="staff-reservation-customer"><strong>${esc(r.customer_name||"氏名未登録")}</strong><small>${r.member_no?`会員番号 ${esc(r.member_no)}`:esc(r.customer_type||"")}</small></div><span class="reservation-status">${esc(r.status||"RESERVED")}</span></div>`).join(""):'<div class="staff-no-reservation">予約はありません。</div>';return `<section class="staff-day-section"><div class="staff-day-head"><div class="staff-day-person"><span class="staff-day-avatar">${esc(String(name).slice(0,1))}</span><span><strong>${esc(name)}</strong><small>${esc(code)}</small></span></div><span class="shift-pill">${shiftText}</span></div><div class="staff-reservation-list">${rows}</div></section>`}).join("");$("#staffScheduleBoard").innerHTML=`<div class="staff-day-grid">${sections}</div>`}
$("#staffPrevDay")?.addEventListener("click",()=>moveStaffScheduleDate(-1));$("#staffNextDay")?.addEventListener("click",()=>moveStaffScheduleDate(1));$("#staffToday")?.addEventListener("click",()=>{state.staffScheduleDate=localYmd();loadStaffSchedule()});



// ===== トレーナー予定 =====
function moveTrainerScheduleDate(days){
  const d=parseYmd(state.trainerScheduleDate||localYmd());
  d.setDate(d.getDate()+days);
  state.trainerScheduleDate=localYmd(d);
  loadTrainerSchedule();
}
async function loadTrainerSchedule(){
  if(!$("#trainerScheduleBoard"))return;
  if(!state.trainerScheduleDate)state.trainerScheduleDate=localYmd();
  $("#trainerScheduleDateLabel").textContent=formatStaffDate(state.trainerScheduleDate);
  $("#trainerScheduleBoard").innerHTML='<div class="staff-schedule-loading">トレーナー予定を読み込んでいます…</div>';
  const m=$("#trainerScheduleMessage");
  m.classList.add("is-hidden");
  m.classList.remove("is-error");
  try{
    const j=await apiGet("getTrainerSchedule",{date:state.trainerScheduleDate,store_code:"YACHIYO"});
    state.trainerSchedule=j.data||{};
    renderTrainerSchedule(state.trainerSchedule);
  }catch(e){
    $("#trainerScheduleBoard").innerHTML='<div class="staff-schedule-empty"><strong>予定を取得できませんでした</strong><span>'+esc(e.message)+'</span></div>';
    m.textContent=e.message;
    m.classList.remove("is-hidden");
    m.classList.add("is-error");
  }
}
function renderTrainerSchedule(d){
  const shifts=Array.isArray(d.shifts)?d.shifts:[];
  const reservations=Array.isArray(d.reservations)?d.reservations:[];
  $("#trainerScheduleSummary").innerHTML=`<span>勤務 <b>${shifts.length}</b>名</span><span>予約 <b>${reservations.length}</b>件</span>`;
  const codes=[...new Set([...shifts.map(x=>x.staff_code),...reservations.map(x=>x.staff_code)].filter(Boolean))];
  if(!codes.length){
    $("#trainerScheduleBoard").innerHTML='<div class="staff-schedule-empty"><strong>この日のトレーナー予定はありません</strong><span>シフト・予約ともに登録されていません。</span></div>';
    return;
  }
  const sections=codes.map(code=>{
    const ss=shifts.filter(x=>x.staff_code===code);
    const rr=reservations.filter(x=>x.staff_code===code).sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));
    const name=ss[0]?.staff_name||rr[0]?.staff_name||code;
    const shiftText=ss.length?ss.map(x=>`${esc(x.start_time)}〜${esc(x.end_time)}`).join(" / "):"シフト登録なし";
    const rows=rr.length?rr.map(r=>`<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(r.start_time)}〜${esc(r.end_time)}</div><div class="staff-reservation-service"><strong>${esc(r.service_name||r.service_code)}</strong><small>${esc(r.service_code||"")}</small></div><div class="staff-reservation-customer"><strong>${esc(r.customer_name||"氏名未登録")}</strong><small>${r.member_no?`会員番号 ${esc(r.member_no)}`:esc(r.customer_type||"")}</small></div><span class="reservation-status">${esc(r.status||"RESERVED")}</span></div>`).join(""):'<div class="staff-no-reservation">予約はありません。</div>';
    return `<section class="staff-day-section"><div class="staff-day-head"><div class="staff-day-person"><span class="staff-day-avatar">${esc(String(name).slice(0,1))}</span><span><strong>${esc(name)}</strong><small>${esc(code)}</small></span></div><span class="shift-pill">${shiftText}</span></div><div class="staff-reservation-list">${rows}</div></section>`;
  }).join("");
  $("#trainerScheduleBoard").innerHTML=`<div class="staff-day-grid">${sections}</div>`;
}
$("#trainerPrevDay")?.addEventListener("click",()=>moveTrainerScheduleDate(-1));
$("#trainerNextDay")?.addEventListener("click",()=>moveTrainerScheduleDate(1));
$("#trainerToday")?.addEventListener("click",()=>{state.trainerScheduleDate=localYmd();loadTrainerSchedule()});

// ===== サービス管理 =====
function setupServiceManager(){renderServiceList();resetServiceForm();$("#serviceSearch").oninput=renderServiceList;$("#newServiceButton").onclick=resetServiceForm;$("#serviceForm").onsubmit=saveServiceFromUi}
function renderServiceList(){const box=$("#serviceList");if(!box)return;const q=($("#serviceSearch")?.value||"").trim().toLowerCase();const rows=state.services.filter(s=>[s.service_code,s.service_name,s.category,s.provider_role].join(" ").toLowerCase().includes(q));if(!rows.length){box.innerHTML='<div class="no-staff">該当するサービスがありません。</div>';return}box.innerHTML=rows.map(s=>`<button type="button" class="service-list-item ${s.service_code===state.selectedServiceCode?"is-selected":""}" data-service-code="${esc(s.service_code)}"><span><strong>${esc(s.service_name||s.service_code)}</strong><small>${esc(s.service_code)} · ${esc(s.category||"")}</small></span><span class="service-badges"><span class="service-badge ${s.public===false?"off":""}">${s.public===false?"非公開":"公開"}</span></span></button>`).join("");$$('[data-service-code]').forEach(b=>b.onclick=()=>selectService(b.dataset.serviceCode))}
function selectService(code){const s=state.services.find(x=>String(x.service_code)===String(code));if(!s)return;state.selectedServiceCode=s.service_code;$("#serviceFormTitle").textContent=s.service_name||s.service_code;$("#serviceCodeHelp").textContent=`サービスコード：${s.service_code}（編集時は変更しないでください）`;$("#serviceCode").value=s.service_code||"";$("#serviceCode").readOnly=true;$("#serviceName").value=s.service_name||"";$("#serviceBrand").value=s.brand_code||"TFG";$("#serviceStore").value=s.store_code||"YACHIYO";$("#serviceCategory").value=s.category||"";$("#serviceFormType").value=s.form_type||"MEMBER";$("#serviceDuration").value=Number(s.duration||0);$("#serviceSlotInterval").value=Number(s.slot_interval_minutes||0);$("#serviceProviderRole").value=s.provider_role||"";$("#serviceCalendarCode").value=s.calendar_code||"";$("#serviceMailAccountCode").value=s.mail_account_code||"";$("#serviceBookingMinHours").value=Number(s.booking_min_hours||0);$("#serviceChangeLimitHours").value=Number(s.change_limit_hours||0);$("#serviceCancelLimitHours").value=Number(s.cancel_limit_hours||0);$("#servicePublicDays").value=Number(s.public_days||0);$("#servicePublic").checked=s.public!==false;$("#serviceActive").checked=s.active!==false;hideServiceMsg();renderServiceList()}
function resetServiceForm(){state.selectedServiceCode="";$("#serviceForm")?.reset();$("#serviceFormTitle").textContent="新規サービス";$("#serviceCodeHelp").textContent="サービスコードは新規登録後は変更しないでください。";$("#serviceCode").readOnly=false;$("#serviceBrand").value="TFG";$("#serviceStore").value="YACHIYO";$("#serviceFormType").value="MEMBER";$("#serviceBookingMinHours").value=3;$("#serviceChangeLimitHours").value=3;$("#serviceCancelLimitHours").value=3;$("#servicePublicDays").value=30;$("#servicePublic").checked=true;$("#serviceActive").checked=true;hideServiceMsg();renderServiceList()}
async function saveServiceFromUi(e){e.preventDefault();const code=String($("#serviceCode").value||"").trim().toUpperCase();if(!code)return serviceMsg("サービスコードを入力してください。",true);if(!$("#serviceName").value.trim())return serviceMsg("サービス名を入力してください。",true);if(+$("#serviceDuration").value<=0||+$("#serviceSlotInterval").value<=0)return serviceMsg("所要時間と予約間隔は1分以上にしてください。",true);const b=$("#saveServiceButton");b.disabled=true;b.textContent="保存中…";try{const j=await apiPost({action:"saveService",service_code:code,brand_code:$("#serviceBrand").value.trim(),store_code:$("#serviceStore").value.trim(),service_name:$("#serviceName").value.trim(),category:$("#serviceCategory").value.trim(),form_type:$("#serviceFormType").value,duration:+$("#serviceDuration").value,calendar_code:$("#serviceCalendarCode").value.trim(),provider_role:$("#serviceProviderRole").value.trim(),booking_min_hours:+$("#serviceBookingMinHours").value,change_limit_hours:+$("#serviceChangeLimitHours").value,cancel_limit_hours:+$("#serviceCancelLimitHours").value,public_days:+$("#servicePublicDays").value,slot_interval_minutes:+$("#serviceSlotInterval").value,mail_account_code:$("#serviceMailAccountCode").value.trim(),public:$("#servicePublic").checked,active:$("#serviceActive").checked});await loadServices();state.selectedServiceCode=code;const saved=state.services.find(x=>x.service_code===code);if(saved)selectService(code);else resetServiceForm();serviceMsg(j.data?.active===false?"保存しました。無効化したサービスは現在の一覧APIには表示されません。":"保存しました。")}catch(err){serviceMsg(err.message||"保存に失敗しました。",true)}finally{b.disabled=false;b.textContent="保存"}}
function serviceMsg(text,error=false){const n=$("#serviceMessage");if(!n)return;n.textContent=text;n.classList.remove("is-hidden");n.classList.toggle("is-error",error)}
function hideServiceMsg(){const n=$("#serviceMessage");if(!n)return;n.textContent="";n.classList.add("is-hidden");n.classList.remove("is-error")}
