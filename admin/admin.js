// BUILD: 20260815-myshift-v8
const API_URL="https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const state={staff:[],stores:[],services:[],serviceHours:[],selectedServiceCode:"",selectedStaffCode:"",shiftRows:[],shiftPreview:null,staffScheduleDate:"",staffSchedule:null,trainerScheduleDate:"",trainerSchedule:null,myShiftDate:"",myShiftRows:[],myShiftRequests:[],authUser:null,idToken:""};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
function authEnabled(){return !!window.ANAUTS_AUTH?.enabled}
function withAuth(params={}){const o={...params};if(authEnabled()&&state.idToken)o.id_token=state.idToken;return o}
async function apiGet(action,params={}){const u=new URL(API_URL);u.searchParams.set("action",action);Object.entries(withAuth(params)).forEach(([k,v])=>u.searchParams.set(k,v));u.searchParams.set("_",Date.now());const r=await fetch(u,{cache:"no-store"}),j=await r.json();if(!j.ok)throw new Error(j.message||"取得失敗");return j}
async function apiPost(p){const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(withAuth(p))}),j=await r.json();if(!j.ok)throw new Error(j.message||"処理失敗");return j}

function roleHonorific(user){
  if(!user)return "";
  const base=user.display_name||user.staff_name||user.staff_code||user.email||"";
  return String(user.role||"").toUpperCase()==="TRAINER" ? `${base}トレーナー` : `${base}さん`;
}
function hasPermission(...levels){
  if(!authEnabled())return true;
  const p=String(state.authUser?.permission||"STAFF").toUpperCase();
  return levels.includes(p);
}
function applyPermissionUi(){
  if(!authEnabled())return;
  const permission=String(state.authUser?.permission||"STAFF").toUpperCase();
  const management=permission==="ADMIN"||permission==="MANAGER";
  document.querySelectorAll('[data-view="registration"]').forEach(el=>el.classList.toggle("is-hidden",!management));
  $("#myShiftNav")?.classList.toggle("is-hidden",management);
  $("#authUserArea")?.classList.remove("is-hidden");
  if($("#authUserName"))$("#authUserName").textContent=roleHonorific(state.authUser);
  if($("#authUserPermission"))$("#authUserPermission").textContent=permission;
}
function showLoginMessage(text,error=true){
  const n=$("#loginMessage"); if(!n)return;
  n.textContent=text||"";
  n.classList.toggle("is-hidden",!text);
  n.classList.toggle("is-error",!!error);
}
async function firebaseSignIn(email,password){
  const key=window.ANAUTS_AUTH?.firebaseApiKey;
  if(!key)throw new Error("Firebase APIキーが設定されていません。");
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const j=await r.json();
  if(!r.ok)throw new Error("メールアドレスまたはパスワードを確認してください。");
  return j;
}
async function restoreAuthSession(){
  if(!authEnabled())return true;
  const token=sessionStorage.getItem("anauts_id_token")||"";
  if(!token)return false;
  state.idToken=token;
  try{
    const j=await apiGet("getCurrentUser");
    state.authUser=j.data||null;
    applyPermissionUi();
    return !!state.authUser;
  }catch(e){
    sessionStorage.removeItem("anauts_id_token");
    state.idToken="";
    return false;
  }
}

async function initializeAppAfterAuth(){
  if(!state.staffScheduleDate)state.staffScheduleDate=localYmd();
  if(!state.myShiftDate)state.myShiftDate=localYmd();
  const activeButton=document.querySelector(".nav-button.is-active");
  const activeView=activeButton?.dataset?.view||"staffSchedule";
  if(activeView==="staffSchedule"){await loadStaffSchedule();return;}
  if(activeView==="trainerSchedule"){await loadTrainerSchedule();return;}
  if(activeView==="myShift"){await loadMyShiftView();return;}
}

async function doLogin(e){
  e.preventDefault();
  const button=$("#loginButton");
  button.disabled=true; button.textContent="ログイン中…"; showLoginMessage("");
  try{
    const auth=await firebaseSignIn($("#loginEmail").value.trim(),$("#loginPassword").value);
    state.idToken=auth.idToken;
    sessionStorage.setItem("anauts_id_token",auth.idToken);
    const j=await apiGet("getCurrentUser");
    state.authUser=j.data||null;
    if(!state.authUser)throw new Error("このアカウントにはA-nauts OS Reserveの利用権限がありません。");
    $("#loginGate").classList.add("is-hidden");
    applyPermissionUi();
    await initializeAppAfterAuth();
  }catch(err){
    state.idToken="";
    sessionStorage.removeItem("anauts_id_token");
    showLoginMessage(err.message||"ログインに失敗しました。",true);
  }finally{
    button.disabled=false; button.textContent="ログイン";
  }
}
function logout(){
  state.idToken=""; state.authUser=null;
  sessionStorage.removeItem("anauts_id_token");
  if(authEnabled()){
    $("#authUserArea")?.classList.add("is-hidden");
    $("#loginGate")?.classList.remove("is-hidden");
  }
}
$("#loginForm")?.addEventListener("submit",doLogin);
$("#logoutButton")?.addEventListener("click",logout);

$$(".nav-button").forEach(b=>b.onclick=async()=>{$$(".nav-button").forEach(x=>x.classList.toggle("is-active",x===b));$$(".view").forEach(x=>x.classList.remove("is-active"));$("#"+b.dataset.view+"View").classList.add("is-active");if(b.dataset.view==="staffSchedule")await loadStaffSchedule();if(b.dataset.view==="trainerSchedule")await loadTrainerSchedule();if(b.dataset.view==="myShift")await loadMyShiftView()});
$$(".registration-card").forEach(b=>b.onclick=()=>showRegistration(b.dataset.registration));
async function showRegistration(type){if(authEnabled()&&!hasPermission("ADMIN","MANAGER"))return;["#staffManager","#shiftManager","#serviceManager","#serviceHoursManager","#registrationPlaceholder"].forEach(x=>$(x)?.classList.add("is-hidden"));if(type==="staff"){$("#staffManager").classList.remove("is-hidden");await loadStaff();if(!state.selectedStaffCode)resetStaffForm();return}if(type==="shift"){$("#shiftManager").classList.remove("is-hidden");await Promise.all([loadStaff(),loadStores()]);setupShift();return}if(type==="service"){$("#serviceManager").classList.remove("is-hidden");await loadServices();setupServiceManager();return}if(type==="hours"){$("#serviceHoursManager").classList.remove("is-hidden");await loadServices();setupServiceHours();return}const map={},v=map[type]||["🛠️","準備中"];$("#placeholderIcon").textContent=v[0];$("#placeholderTitle").textContent=v[1];$("#registrationPlaceholder").classList.remove("is-hidden")}
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
$$(".shift-tab").forEach(b=>b.onclick=async()=>{
  $$(".shift-tab").forEach(x=>x.classList.toggle("is-active",x===b));
  $("#shiftBulkPanel").classList.toggle("is-hidden",b.dataset.shiftTab!=="bulk");
  $("#shiftSinglePanel").classList.toggle("is-hidden",b.dataset.shiftTab!=="single");
  hideMsg();
  if(b.dataset.shiftTab==="single")await loadRegisteredShifts();
});

function setupShift(){
  const stores=state.stores.filter(s=>s.active!==false);
  const o=stores.map(s=>`<option value="${esc(s.store_code)}">${esc(s.store_name||s.store_code)} (${esc(s.store_code)})</option>`).join("");
  $("#shiftBulkStore").innerHTML=o;
  $("#shiftSingleStore").innerHTML=o;
  ["#shiftBulkStore","#shiftSingleStore"].forEach(x=>{
    if(stores.some(s=>s.store_code==="YACHIYO"))$(x).value="YACHIYO";
  });
  $("#shiftSingleStaff").innerHTML=state.staff.filter(s=>s.active!==false).map(s=>`<option value="${esc(s.staff_code)}">${esc(s.display_name||s.staff_name||s.staff_code)} (${esc(s.staff_code)})</option>`).join("");
  const d=new Date(),ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  $("#shiftTargetMonth").value=ym;
  $("#shiftSingleDate").value=`${ym}-${String(d.getDate()).padStart(2,"0")}`;
  $("#shiftSingleStore").onchange=loadRegisteredShifts;
  $("#shiftSingleStaff").onchange=loadRegisteredShifts;
  $("#shiftSingleDate").onchange=loadRegisteredShifts;
  $("#shiftEditCancelButton").onclick=resetShiftEditor;
  resetShiftEditor();
  updateReplaceWarning();
  if(!$("#shiftSinglePanel").classList.contains("is-hidden"))loadRegisteredShifts();
}

async function loadRegisteredShifts(){
  const store=$("#shiftSingleStore")?.value||"";
  const staff=$("#shiftSingleStaff")?.value||"";
  const date=$("#shiftSingleDate")?.value||"";
  const box=$("#registeredShiftList");
  if(!box)return;
  if(!staff||!date){
    box.innerHTML='<div class="registered-shift-empty">スタッフと日付を選択してください。</div>';
    return;
  }
  const person=state.staff.find(s=>String(s.staff_code)===staff);
  $("#registeredShiftContext").textContent=`${person?.display_name||person?.staff_name||staff} · ${date}`;
  box.innerHTML='<div class="registered-shift-empty">読み込み中…</div>';
  try{
    const j=await apiGet("getStaffShifts",{staff_code:staff,start_date:date,end_date:date});
    const rows=(Array.isArray(j.data)?j.data:Array.isArray(j.data?.shifts)?j.data.shifts:[])
      .filter(r=>(!store||String(r.store_code)===store)&&r.active!==false);
    state.currentRegisteredShifts=rows;
    renderRegisteredShifts(rows);
  }catch(e){
    box.innerHTML=`<div class="registered-shift-empty is-error">${esc(e.message||"登録済みシフトを取得できませんでした。")}</div>`;
  }
}

function renderRegisteredShifts(rows){
  const box=$("#registeredShiftList");
  if(!rows.length){
    box.innerHTML='<div class="registered-shift-empty">この日の登録済みシフトはありません。</div>';
    return;
  }
  box.innerHTML=rows.map((r,i)=>`
    <div class="registered-shift-row">
      <div class="registered-shift-time"><strong>${esc(r.start_time)}</strong><span>〜</span><strong>${esc(r.end_time)}</strong></div>
      <div class="registered-shift-meta"><span>${esc(r.store_code||"")}</span><small>${esc(r.shift_id||"")}</small></div>
      <div class="registered-shift-actions">
        <button class="ghost-button" type="button" data-shift-edit="${i}">編集</button>
        <button class="danger-ghost" type="button" data-shift-delete="${i}">削除</button>
      </div>
    </div>`).join("");
  $$("[data-shift-edit]").forEach(b=>b.onclick=()=>editRegisteredShift(rows[+b.dataset.shiftEdit]));
  $$("[data-shift-delete]").forEach(b=>b.onclick=()=>deleteRegisteredShift(rows[+b.dataset.shiftDelete]));
}

function editRegisteredShift(r){
  $("#shiftEditingId").value=r.shift_id||"";
  $("#shiftSingleStart").value=String(r.start_time||"").slice(0,5);
  $("#shiftSingleEnd").value=String(r.end_time||"").slice(0,5);
  $("#shiftSingleFormTitle").textContent="登録済みシフトを編集";
  $("#shiftSingleSaveButton").textContent="変更を保存";
  $("#shiftEditCancelButton").classList.remove("is-hidden");
  $("#shiftSingleStart").focus();
}

function resetShiftEditor(){
  if($("#shiftEditingId"))$("#shiftEditingId").value="";
  if($("#shiftSingleStart"))$("#shiftSingleStart").value="";
  if($("#shiftSingleEnd"))$("#shiftSingleEnd").value="";
  if($("#shiftSingleFormTitle"))$("#shiftSingleFormTitle").textContent="新規シフト登録";
  if($("#shiftSingleSaveButton"))$("#shiftSingleSaveButton").textContent="保存";
  $("#shiftEditCancelButton")?.classList.add("is-hidden");
}

async function deleteRegisteredShift(r){
  if(!confirm(`${r.start_time}〜${r.end_time} のシフトを削除しますか？`))return;
  try{
    await apiPost({action:"deleteStaffShift",shift_id:r.shift_id});
    msg(`削除しました：${r.start_time}〜${r.end_time}`);
    resetShiftEditor();
    await loadRegisteredShifts();
  }catch(e){msg(e.message,true)}
}

function csvLine(line){const a=[];let s="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++}else q=!q}else if(c===","&&!q){a.push(s);s=""}else s+=c}a.push(s);return a}
async function readCsv(f){const lines=(await f.text()).replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)throw new Error("CSVにデータがありません。");const h=csvLine(lines[0]).map(x=>x.trim()),req=["staff_code","date","start_time","end_time"];req.forEach(k=>{if(!h.includes(k))throw new Error(`CSVに ${k} 列がありません。`)});return lines.slice(1).map(l=>{const c=csvLine(l),o={};h.forEach((x,i)=>o[x]=String(c[i]??"").trim());return {staff_code:o.staff_code,date:o.date,start_time:o.start_time,end_time:o.end_time}})}

function monthRange(ym){
  const m=/^(\d{4})-(\d{2})$/.exec(String(ym||""));
  if(!m)return null;
  const y=+m[1],mo=+m[2];
  const last=new Date(y,mo,0).getDate();
  return {
    start:`${m[1]}-${m[2]}-01`,
    end:`${m[1]}-${m[2]}-${String(last).padStart(2,"0")}`
  };
}

async function getExistingShiftCountForImport(){
  const ym=$("#shiftTargetMonth")?.value||"";
  const store=$("#shiftBulkStore")?.value||"";
  const range=monthRange(ym);
  if(!range)return 0;
  const j=await apiGet("getStaffShifts",{start_date:range.start,end_date:range.end});
  const rows=Array.isArray(j.data)?j.data:Array.isArray(j.data?.shifts)?j.data.shifts:[];
  return rows.filter(r=>(!store||String(r.store_code)===store)&&r.active!==false).length;
}

async function updateReplaceWarning(){
  const box=$("#shiftReplaceWarning");
  if(!box)return;
  const replace=$("#shiftImportMode")?.value==="REPLACE_MONTH";
  box.classList.toggle("is-hidden",!replace);
  if(!replace)return;
  $("#shiftReplaceWarningText").textContent="既存シフト件数を確認しています…";
  try{
    const count=await getExistingShiftCountForImport();
    state.shiftExistingCount=count;
    $("#shiftReplaceWarningText").textContent=
      `対象月の既存シフト ${count}件を削除して、CSVの内容に置き換えます。`;
  }catch(e){
    state.shiftExistingCount=null;
    $("#shiftReplaceWarningText").textContent=
      "対象月の既存シフトを削除してCSV内容に置き換えます。件数取得に失敗したため、登録前に再確認してください。";
  }
}

$("#shiftImportMode")?.addEventListener("change",updateReplaceWarning);
$("#shiftTargetMonth")?.addEventListener("change",updateReplaceWarning);
$("#shiftBulkStore")?.addEventListener("change",updateReplaceWarning);
$("#shiftPreviewButton").onclick=async()=>{
  hideMsg();
  const f=$("#shiftCsvFile").files[0];
  if(!f)return msg("CSVファイルを選択してください。",true);
  try{
    state.shiftRows=await readCsv(f);

    if($("#shiftImportMode").value==="REPLACE_MONTH"){
      state.shiftExistingCount=await getExistingShiftCountForImport();
      await updateReplaceWarning();
    }else{
      state.shiftExistingCount=0;
    }

    const j=await apiPost({
      action:"previewStaffShiftImport",
      mode:$("#shiftImportMode").value,
      store_code:$("#shiftBulkStore").value,
      target_month:$("#shiftTargetMonth").value,
      rows:state.shiftRows
    });

    state.shiftPreview=j.data;
    renderPreview(j.data);
    $("#shiftImportButton").disabled=+j.data.error_count>0||+j.data.valid_count===0;

    if(+j.data.error_count){
      msg("エラーがあります。CSVを修正してください。",true);
    }else if($("#shiftImportMode").value==="REPLACE_MONTH"){
      msg(`プレビューOKです。登録すると既存シフト ${state.shiftExistingCount||0}件を削除して置き換えます。`,true);
    }else{
      msg("プレビューOKです。既存シフトを残したまま追加登録します。");
    }
  }catch(e){
    msg(e.message,true);
  }
};
function renderPreview(d){$("#shiftPreviewArea").classList.remove("is-hidden");$("#shiftPreviewSummary").innerHTML=`<span>全 ${d.total_count}件</span><strong class="ok-count">有効 ${d.valid_count}件</strong><strong class="error-count">エラー ${d.error_count}件</strong>`;const em=new Map((d.errors||[]).map(x=>[+x.row,x]));$("#shiftPreviewBody").innerHTML=state.shiftRows.map((r,i)=>{const e=em.get(i+2),s=state.staff.find(x=>x.staff_code===r.staff_code);return `<tr class="${e?"row-error":""}"><td>${i+2}</td><td>${esc(s?.display_name||s?.staff_name||r.staff_code)}<small>${esc(r.staff_code)}</small></td><td>${esc(r.date)}</td><td>${esc(r.start_time)}</td><td>${esc(r.end_time)}</td><td>${e?`<span class="status-bad">${esc(e.message||e.code)}</span>`:'<span class="status-ok">OK</span>'}</td></tr>`}).join("")}
$("#shiftImportButton").onclick=async()=>{
  if(!state.shiftPreview||+state.shiftPreview.error_count){
    return msg("エラーのないプレビューを先に実行してください。",true);
  }

  const mode=$("#shiftImportMode").value;
  const month=$("#shiftTargetMonth").value;
  const newCount=state.shiftRows.length;

  let confirmText="";
  if(mode==="REPLACE_MONTH"){
    let existing=state.shiftExistingCount;
    if(existing===undefined||existing===null){
      try{existing=await getExistingShiftCountForImport()}catch(e){existing="不明"}
    }
    confirmText=
      `【対象月を全置換】\n\n`+
      `${month} の既存シフト ${existing}件を削除し、CSV ${newCount}件に置き換えます。\n\n`+
      `この操作は既存シフトに影響します。実行しますか？`;
  }else{
    confirmText=
      `【追加登録】\n\n`+
      `${month} にCSV ${newCount}件を追加します。\n`+
      `既存シフトは削除しません。\n\n実行しますか？`;
  }

  if(!confirm(confirmText))return;

  try{
    const j=await apiPost({
      action:"importStaffShifts",
      mode,
      store_code:$("#shiftBulkStore").value,
      target_month:month,
      rows:state.shiftRows
    });

    if(mode==="REPLACE_MONTH"){
      msg(`全置換完了：登録 ${j.data.inserted_count}件 / 既存無効化 ${j.data.disabled_count}件`);
    }else{
      msg(`追加登録完了：${j.data.inserted_count}件`);
    }

    $("#shiftImportButton").disabled=true;
    await updateReplaceWarning();
  }catch(e){
    msg(e.message,true);
  }
};

$("#shiftSingleForm").onsubmit=async e=>{
  e.preventDefault();
  const start=$("#shiftSingleStart").value,end=$("#shiftSingleEnd").value;
  if(!start||!end)return msg("開始時刻と終了時刻を入力してください。",true);
  if(start>=end)return msg("終了時刻は開始時刻より後にしてください。",true);
  const button=$("#shiftSingleSaveButton");
  button.disabled=true;
  try{
    const editingId=$("#shiftEditingId").value;
    const payload={action:"saveStaffShift",staff_code:$("#shiftSingleStaff").value,store_code:$("#shiftSingleStore").value,date:$("#shiftSingleDate").value,start_time:start,end_time:end};
    if(editingId)payload.shift_id=editingId;
    const j=await apiPost(payload);
    msg(`${editingId?"変更":"保存"}しました：${j.data.date} ${j.data.start_time}〜${j.data.end_time}`);
    resetShiftEditor();
    await loadRegisteredShifts();
  }catch(x){msg(x.message,true)}
  finally{button.disabled=false}
};

function msg(s,e=false){const n=$("#shiftMessage");n.textContent=s;n.classList.remove("is-hidden");n.classList.toggle("is-error",e)}
function hideMsg(){$("#shiftMessage").classList.add("is-hidden")}
async function loadServices(){try{const j=await apiGet("getServices");state.services=Array.isArray(j.data?.services)?j.data.services:Array.isArray(j.data)?j.data:[]}catch(e){state.services=[];if($("#serviceMessage")&&!$("#serviceManager")?.classList.contains("is-hidden"))serviceMsg(e.message,true);else hoursMsg(e.message,true)}}
function setupServiceHours(){const a=state.services.filter(s=>s.active!==false),sel=$("#serviceHoursService");sel.innerHTML=a.map(s=>`<option value="${esc(s.service_code)}">${esc(s.service_name||s.name||s.service_code)} (${esc(s.service_code)})</option>`).join("");if(a.some(s=>String(s.service_code).toUpperCase()==="UNSUBSCRIBE"))sel.value="UNSUBSCRIBE";sel.onchange=loadSelectedHours;$("#newServiceHourButton").onclick=()=>{$("#serviceHourForm").classList.remove("is-hidden");$("#serviceHourDay").value="ALL";$("#serviceHourStart").value="";$("#serviceHourEnd").value="";hideHoursMsg()};$("#cancelServiceHourButton").onclick=()=>$("#serviceHourForm").classList.add("is-hidden");$("#serviceHourForm").onsubmit=saveHour;loadSelectedHours()}
async function loadSelectedHours(){const code=$("#serviceHoursService").value;if(!code){$("#serviceHoursList").innerHTML='<div class="empty-service-hours">サービスがありません。</div>';return}const s=state.services.find(x=>String(x.service_code)===code)||{};$("#serviceHoursTitle").textContent=s.service_name||s.name||code;$("#serviceHoursCode").textContent=code;try{const j=await apiGet("getServiceHours",{service_code:code});state.serviceHours=Array.isArray(j.data)?j.data:[];renderHours()}catch(e){hoursMsg(e.message,true)}}
function renderHours(){const label={ALL:"すべての曜日",SUN:"日曜日",MON:"月曜日",TUE:"火曜日",WED:"水曜日",THU:"木曜日",FRI:"金曜日",SAT:"土曜日"};const box=$("#serviceHoursList");if(!state.serviceHours.length){box.innerHTML='<div class="empty-service-hours">提供時間がまだ登録されていません。</div>';return}box.innerHTML=state.serviceHours.map((r,i)=>`<div class="service-hour-row"><div class="service-day"><strong>${label[r.day_of_week]||esc(r.day_of_week)}</strong><small>${esc(r.day_of_week)}</small></div><div class="service-time">${esc(r.start_time)} <span>〜</span> ${esc(r.end_time)}</div><button type="button" class="danger-ghost" data-i="${i}">削除</button></div>`).join("");$$(".danger-ghost[data-i]").forEach(b=>b.onclick=()=>deleteHour(state.serviceHours[+b.dataset.i]))}
async function saveHour(e){e.preventDefault();const start=$("#serviceHourStart").value,end=$("#serviceHourEnd").value;if(!start||!end)return hoursMsg("開始時刻と終了時刻を入力してください。",true);if(start>=end)return hoursMsg("終了時刻は開始時刻より後にしてください。",true);try{await apiPost({action:"saveServiceHour",service_code:$("#serviceHoursService").value,day_of_week:$("#serviceHourDay").value,start_time:start,end_time:end,active:true});$("#serviceHourForm").classList.add("is-hidden");await loadSelectedHours();hoursMsg("保存しました。")}catch(e2){hoursMsg(e2.message,true)}}
async function deleteHour(r){if(!confirm(`${r.day_of_week} ${r.start_time}〜${r.end_time} を削除しますか？`))return;try{await apiPost({action:"deleteServiceHour",service_code:r.service_code,day_of_week:r.day_of_week,start_time:r.start_time,end_time:r.end_time});await loadSelectedHours();hoursMsg("削除しました。")}catch(e){hoursMsg(e.message,true)}}
function hoursMsg(s,e=false){const n=$("#serviceHoursMessage");n.textContent=s;n.classList.remove("is-hidden");n.classList.toggle("is-error",e)}function hideHoursMsg(){const n=$("#serviceHoursMessage");n.classList.add("is-hidden");n.classList.remove("is-error")}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
(()=>{const n=$("#todayLabel"),d=new Date(),w=["日","月","火","水","木","金","土"];if(n)n.textContent=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}（${w[d.getDay()]}）`})();




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


// ===== 自分のシフト変更申請 =====
function isManagementUser(){return hasPermission("ADMIN","MANAGER")}
function canUseMyShift(){return authEnabled()&&!isManagementUser()&&!!state.authUser?.staff_code}
function moveMyShiftDate(days){const d=parseYmd(state.myShiftDate||localYmd());d.setDate(d.getDate()+days);state.myShiftDate=localYmd(d);loadMyShiftView()}
function myShiftMsg(text,error=false){const n=$("#myShiftMessage");if(!n)return;n.textContent=text||"";n.classList.toggle("is-hidden",!text);n.classList.toggle("is-error",!!error)}
function resetMyShiftForm(){if($("#myShiftEditingId"))$("#myShiftEditingId").value="";if($("#myShiftStart"))$("#myShiftStart").value="";if($("#myShiftEnd"))$("#myShiftEnd").value="";if($("#myShiftReason"))$("#myShiftReason").value="";if($("#myShiftFormTitle"))$("#myShiftFormTitle").textContent="シフト追加申請";if($("#myShiftSubmitButton"))$("#myShiftSubmitButton").textContent="追加申請を送る";$("#myShiftCancelEdit")?.classList.add("is-hidden")}
async function loadMyShiftView(){if(!canUseMyShift())return;if(!state.myShiftDate)state.myShiftDate=localYmd();$("#myShiftDateLabel").textContent=formatStaffDate(state.myShiftDate);const box=$("#myShiftList"),hist=$("#myShiftRequestHistory");if(box)box.innerHTML='<div class="registered-shift-empty">シフトを読み込んでいます…</div>';if(hist)hist.innerHTML='<div class="registered-shift-empty">申請履歴を読み込んでいます…</div>';try{const [a,b]=await Promise.all([apiGet("getStaffShifts",{staff_code:state.authUser.staff_code,start_date:state.myShiftDate,end_date:state.myShiftDate}),apiGet("getMyShiftChangeRequests")]);state.myShiftRows=(Array.isArray(a.data)?a.data:Array.isArray(a.data?.shifts)?a.data.shifts:[]).filter(r=>r.active!==false);state.myShiftRequests=Array.isArray(b.data)?b.data:[];renderMyShiftRows();renderMyShiftRequestHistory();const p=state.myShiftRequests.filter(r=>String(r.status||"").toUpperCase()==="PENDING"&&String(r.date||"")===state.myShiftDate).length;$("#myShiftStatusSummary").textContent=`登録 ${state.myShiftRows.length}件 / 承認待ち ${p}件`}catch(e){if(box)box.innerHTML=`<div class="registered-shift-empty is-error">${esc(e.message||"シフトを取得できませんでした。")}</div>`;myShiftMsg(e.message||"取得に失敗しました。",true)}}
function renderMyShiftRows(){const box=$("#myShiftList"),rows=state.myShiftRows||[];if(!box)return;if(!rows.length){box.innerHTML='<div class="registered-shift-empty">この日の登録済みシフトはありません。</div>';return}box.innerHTML=rows.map((r,i)=>`<div class="registered-shift-row"><div class="registered-shift-time"><strong>${esc(r.start_time)}</strong><span>〜</span><strong>${esc(r.end_time)}</strong></div><div class="registered-shift-meta"><span>${esc(r.store_code||state.authUser?.store_code||"")}</span><small>${esc(r.shift_id||"")}</small></div><div class="registered-shift-actions"><button class="ghost-button" type="button" data-my-shift-edit="${i}">変更申請</button><button class="danger-ghost" type="button" data-my-shift-delete="${i}">削除申請</button></div></div>`).join("");$$('[data-my-shift-edit]').forEach(b=>b.onclick=()=>editMyShiftRequest(rows[+b.dataset.myShiftEdit]));$$('[data-my-shift-delete]').forEach(b=>b.onclick=()=>requestDeleteMyShift(rows[+b.dataset.myShiftDelete]))}
function editMyShiftRequest(r){$("#myShiftEditingId").value=r.shift_id||"";$("#myShiftStart").value=String(r.start_time||"").slice(0,5);$("#myShiftEnd").value=String(r.end_time||"").slice(0,5);$("#myShiftReason").value="";$("#myShiftFormTitle").textContent="シフト変更申請";$("#myShiftSubmitButton").textContent="変更申請を送る";$("#myShiftCancelEdit").classList.remove("is-hidden");$("#myShiftStart").focus()}
async function requestDeleteMyShift(r){const reason=prompt(`${r.start_time}〜${r.end_time} の削除申請を送ります。\n申請理由があれば入力してください。`,"");if(reason===null)return;try{await apiPost({action:"createShiftChangeRequest",request_type:"DELETE",staff_code:state.authUser.staff_code,shift_id:r.shift_id,reason:String(reason||"").trim()});myShiftMsg("削除申請を送信しました。管理者の承認待ちです。");await loadMyShiftView()}catch(e){myShiftMsg(e.message||"削除申請に失敗しました。",true)}}
$("#myShiftRequestForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!canUseMyShift())return myShiftMsg("この操作を行う権限がありません。",true);const start=$("#myShiftStart").value,end=$("#myShiftEnd").value;if(!start||!end)return myShiftMsg("開始時刻と終了時刻を入力してください。",true);if(start>=end)return myShiftMsg("終了時刻は開始時刻より後にしてください。",true);const editingId=$("#myShiftEditingId").value,b=$("#myShiftSubmitButton");b.disabled=true;try{await apiPost({action:"createShiftChangeRequest",request_type:editingId?"UPDATE":"ADD",staff_code:state.authUser.staff_code,shift_id:editingId||"",store_code:state.authUser.store_code||"YACHIYO",date:state.myShiftDate,start_time:start,end_time:end,reason:$("#myShiftReason").value.trim()});myShiftMsg(editingId?"変更申請を送信しました。管理者の承認待ちです。":"追加申請を送信しました。管理者の承認待ちです。");resetMyShiftForm();await loadMyShiftView()}catch(x){myShiftMsg(x.message||"シフト変更申請に失敗しました。",true)}finally{b.disabled=false}})
$("#myShiftCancelEdit")?.addEventListener("click",resetMyShiftForm);$("#myShiftPrevDay")?.addEventListener("click",()=>moveMyShiftDate(-1));$("#myShiftNextDay")?.addEventListener("click",()=>moveMyShiftDate(1));$("#myShiftToday")?.addEventListener("click",()=>{state.myShiftDate=localYmd();loadMyShiftView()});
function renderMyShiftRequestHistory(){const box=$("#myShiftRequestHistory"),rows=(state.myShiftRequests||[]).slice(0,30);if(!box)return;if(!rows.length){box.innerHTML='<div class="registered-shift-empty">申請履歴はありません。</div>';return}const tl={ADD:"追加",UPDATE:"変更",DELETE:"削除"},sl={PENDING:"承認待ち",APPROVED:"承認済み",REJECTED:"却下"};box.innerHTML=rows.map(r=>{const t=String(r.request_type||"").toUpperCase(),s=String(r.status||"").toUpperCase(),time=t==="DELETE"?`${esc(r.old_start_time||"")}〜${esc(r.old_end_time||"")}`:`${esc(r.new_start_time||"")}〜${esc(r.new_end_time||"")}`;return `<div class="registered-shift-row"><div class="registered-shift-time"><strong>${esc(r.date||"")}</strong></div><div class="registered-shift-meta"><span>${esc(tl[t]||t)} · ${time}</span><small>${esc(r.reason||"理由なし")}</small></div><div class="registered-shift-actions"><span class="shift-pill">${esc(sl[s]||s)}</span></div></div>`}).join("")}

// ===== サービス管理 =====
function setupServiceManager(){renderServiceList();resetServiceForm();$("#serviceSearch").oninput=renderServiceList;$("#newServiceButton").onclick=resetServiceForm;$("#serviceForm").onsubmit=saveServiceFromUi}
function renderServiceList(){const box=$("#serviceList");if(!box)return;const q=($("#serviceSearch")?.value||"").trim().toLowerCase();const rows=state.services.filter(s=>[s.service_code,s.service_name,s.category,s.provider_role].join(" ").toLowerCase().includes(q));if(!rows.length){box.innerHTML='<div class="no-staff">該当するサービスがありません。</div>';return}box.innerHTML=rows.map(s=>`<button type="button" class="service-list-item ${s.service_code===state.selectedServiceCode?"is-selected":""}" data-service-code="${esc(s.service_code)}"><span><strong>${esc(s.service_name||s.service_code)}</strong><small>${esc(s.service_code)} · ${esc(s.category||"")}</small></span><span class="service-badges"><span class="service-badge ${s.public===false?"off":""}">${s.public===false?"非公開":"公開"}</span></span></button>`).join("");$$('[data-service-code]').forEach(b=>b.onclick=()=>selectService(b.dataset.serviceCode))}
function selectService(code){const s=state.services.find(x=>String(x.service_code)===String(code));if(!s)return;state.selectedServiceCode=s.service_code;$("#serviceFormTitle").textContent=s.service_name||s.service_code;$("#serviceCodeHelp").textContent=`サービスコード：${s.service_code}（編集時は変更しないでください）`;$("#serviceCode").value=s.service_code||"";$("#serviceCode").readOnly=true;$("#serviceName").value=s.service_name||"";$("#serviceBrand").value=s.brand_code||"TFG";$("#serviceStore").value=s.store_code||"YACHIYO";$("#serviceCategory").value=s.category||"";$("#serviceFormType").value=s.form_type||"MEMBER";$("#serviceDuration").value=Number(s.duration||0);$("#serviceSlotInterval").value=Number(s.slot_interval_minutes||0);$("#serviceProviderRole").value=s.provider_role||"";$("#serviceCalendarCode").value=s.calendar_code||"";$("#serviceMailAccountCode").value=s.mail_account_code||"";$("#serviceBookingMinHours").value=Number(s.booking_min_hours||0);$("#serviceChangeLimitHours").value=Number(s.change_limit_hours||0);$("#serviceCancelLimitHours").value=Number(s.cancel_limit_hours||0);$("#servicePublicDays").value=Number(s.public_days||0);$("#servicePublic").checked=s.public!==false;$("#serviceActive").checked=s.active!==false;hideServiceMsg();renderServiceList()}
function resetServiceForm(){state.selectedServiceCode="";$("#serviceForm")?.reset();$("#serviceFormTitle").textContent="新規サービス";$("#serviceCodeHelp").textContent="サービスコードは新規登録後は変更しないでください。";$("#serviceCode").readOnly=false;$("#serviceBrand").value="TFG";$("#serviceStore").value="YACHIYO";$("#serviceFormType").value="MEMBER";$("#serviceBookingMinHours").value=3;$("#serviceChangeLimitHours").value=3;$("#serviceCancelLimitHours").value=3;$("#servicePublicDays").value=30;$("#servicePublic").checked=true;$("#serviceActive").checked=true;hideServiceMsg();renderServiceList()}
async function saveServiceFromUi(e){e.preventDefault();const code=String($("#serviceCode").value||"").trim().toUpperCase();if(!code)return serviceMsg("サービスコードを入力してください。",true);if(!$("#serviceName").value.trim())return serviceMsg("サービス名を入力してください。",true);if(+$("#serviceDuration").value<=0||+$("#serviceSlotInterval").value<=0)return serviceMsg("所要時間と予約間隔は1分以上にしてください。",true);const b=$("#saveServiceButton");b.disabled=true;b.textContent="保存中…";try{const j=await apiPost({action:"saveService",service_code:code,brand_code:$("#serviceBrand").value.trim(),store_code:$("#serviceStore").value.trim(),service_name:$("#serviceName").value.trim(),category:$("#serviceCategory").value.trim(),form_type:$("#serviceFormType").value,duration:+$("#serviceDuration").value,calendar_code:$("#serviceCalendarCode").value.trim(),provider_role:$("#serviceProviderRole").value.trim(),booking_min_hours:+$("#serviceBookingMinHours").value,change_limit_hours:+$("#serviceChangeLimitHours").value,cancel_limit_hours:+$("#serviceCancelLimitHours").value,public_days:+$("#servicePublicDays").value,slot_interval_minutes:+$("#serviceSlotInterval").value,mail_account_code:$("#serviceMailAccountCode").value.trim(),public:$("#servicePublic").checked,active:$("#serviceActive").checked});await loadServices();state.selectedServiceCode=code;const saved=state.services.find(x=>x.service_code===code);if(saved)selectService(code);else resetServiceForm();serviceMsg(j.data?.active===false?"保存しました。無効化したサービスは現在の一覧APIには表示されません。":"保存しました。")}catch(err){serviceMsg(err.message||"保存に失敗しました。",true)}finally{b.disabled=false;b.textContent="保存"}}
function serviceMsg(text,error=false){const n=$("#serviceMessage");if(!n)return;n.textContent=text;n.classList.remove("is-hidden");n.classList.toggle("is-error",error)}
function hideServiceMsg(){const n=$("#serviceMessage");if(!n)return;n.textContent="";n.classList.add("is-hidden");n.classList.remove("is-error")}

window.addEventListener("DOMContentLoaded",async()=>{
  if(!authEnabled()){
    await initializeAppAfterAuth();
    return;
  }

  $("#loginGate")?.classList.remove("is-hidden");

  const ok=await restoreAuthSession();

  if(!ok){
    $("#loginGate")?.classList.remove("is-hidden");
    return;
  }

  $("#loginGate")?.classList.add("is-hidden");
  applyPermissionUi();
  await initializeAppAfterAuth();
});
