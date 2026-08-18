// BUILD: 20260818-staff-reservation-manage-v37
const API_URL="https://script.google.com/macros/s/AKfycbyvpQRxRpMRfpaQHtBar77dViCqPl-hdFW-2yMdozhN8RHtwcrFiNEM9cvEbny4x9q0/exec";
const state={staff:[],stores:[],services:[],serviceHours:[],presenceWeekdays:[],presenceSpecials:[],selectedServiceCode:"",selectedStaffCode:"",shiftRows:[],shiftPreview:null,staffScheduleDate:"",staffSchedule:null,trainerScheduleDate:"",trainerSchedule:null,myShiftMonth:"",myShiftDate:"",myShiftRows:[],myShiftRequests:[],authUser:null,idToken:""};
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
  const isManagement=permission==="ADMIN"||permission==="MANAGER";
  document.querySelectorAll('[data-view="registration"]').forEach(el=>el.classList.toggle("is-hidden",!isManagement));
  $("#myShiftNav")?.classList.toggle("is-hidden",isManagement);
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
  if(!state.myShiftMonth)state.myShiftMonth=localYmd().slice(0,7);
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
async function showRegistration(type){if(authEnabled()&&!hasPermission("ADMIN","MANAGER"))return;["#staffManager","#shiftManager","#serviceManager","#serviceHoursManager","#presenceManager","#registrationPlaceholder"].forEach(x=>$(x)?.classList.add("is-hidden"));if(type==="staff"){$("#staffManager").classList.remove("is-hidden");await loadStaff();if(!state.selectedStaffCode)resetStaffForm();return}if(type==="shift"){$("#shiftManager").classList.remove("is-hidden");await Promise.all([loadStaff(),loadStores()]);setupShift();return}if(type==="service"){$("#serviceManager").classList.remove("is-hidden");await loadServices();setupServiceManager();return}if(type==="hours"){$("#serviceHoursManager").classList.remove("is-hidden");await loadServices();setupServiceHours();return}if(type==="presence"){$("#presenceManager").classList.remove("is-hidden");await loadStores();setupPresenceManager();return}const map={},v=map[type]||["🛠️","準備中"];$("#placeholderIcon").textContent=v[0];$("#placeholderTitle").textContent=v[1];$("#registrationPlaceholder").classList.remove("is-hidden")}
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


function staffLoginSetupMsg(text,error=false){
  const n=$("#staffLoginSetupMessage"); if(!n)return;
  n.textContent=text||""; n.classList.toggle("is-hidden",!text); n.classList.toggle("is-error",!!error);
}
async function sendStaffLoginSetup(){
  if(!hasPermission("ADMIN","MANAGER"))return staffLoginSetupMsg("この操作を行う権限がありません。",true);
  const staffCode=String($("#staffCode")?.value||"").trim().toUpperCase();
  const email=String($("#staffEmail")?.value||"").trim().toLowerCase();
  const password=String($("#staffInitialPassword")?.value||"");
  const permission=String($("#staffLoginPermission")?.value||"STAFF").trim().toUpperCase();
  if(!staffCode)return staffLoginSetupMsg("先にスタッフを選択または登録してください。",true);
  if(!email)return staffLoginSetupMsg("スタッフのメールアドレスを入力してください。",true);
  if(password.length<6)return staffLoginSetupMsg("初期パスワードは6文字以上で入力してください。",true);
  const name=String($("#staffDisplayName")?.value||$("#staffName")?.value||staffCode).trim();
  if(!confirm(`${name} のログイン設定を作成し、${email} に案内メールを送信します。\n\n権限：${permission}\n初期パスワード：${password}\n\n実行しますか？`))return;
  const b=$("#sendLoginSetupButton"); b.disabled=true; b.textContent="送信中…"; staffLoginSetupMsg("");
  try{
    await apiPost({action:"provisionStaffLogin",staff_code:staffCode,email,initial_password:password,permission,admin_url:location.origin+location.pathname});
    staffLoginSetupMsg("ログイン設定を保存し、案内メールを送信しました。");
  }catch(e){staffLoginSetupMsg(e.message||"ログイン設定メールを送信できませんでした。",true)}
  finally{b.disabled=false;b.textContent="ログイン設定メールを送信"}
}
$("#sendLoginSetupButton")?.addEventListener("click",sendStaffLoginSetup);

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
    const selectedStaffCode=$("#shiftSingleStaff")?.value||"";
    const selectedPerson=(state.staff||[]).find(x=>String(x.staff_code)===String(selectedStaffCode));
    const selectedRole=String(selectedPerson?.role||"STAFF").toUpperCase();

    if(selectedRole==="STAFF"){
      const presence=await getResolvedPresence_($("#shiftSingleDate").value,$("#shiftSingleStore").value);
      const s=$("#shiftSingleStart").value,e=$("#shiftSingleEnd").value;

      if(!isWithinPresence_(s,e,presence)){
        const rule=presence.closed?"在駐なし":`${presence.start_time||"--:--"}〜${presence.end_time||"--:--"}`;
        if(!confirm(`スタッフ在駐時間外のシフトです。\nこの日の在駐時間：${rule}\n\n例外として登録しますか？`))return;
      }
    }

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





async function openReservationManageFromStaff_(reservationId){
  const rid=String(reservationId||"").trim();
  if(!rid){
    alert("予約IDを取得できません。");
    return;
  }

  /*
   * ポップアップブロックを避けるため、
   * クリック時に先に空タブを開く。
   */
  const preview=window.open("about:blank","_blank");

  try{
    const j=await apiGet(
      "getAdminReservationManageUrl",
      {
        reservation_id:rid
      }
    );

    const url=String(
      j?.data?.manage_url||""
    ).trim();

    if(!url){
      throw new Error(
        "予約管理URLを取得できませんでした。"
      );
    }

    if(preview){
      preview.location.replace(url);
    }else{
      window.open(url,"_blank","noopener");
    }

  }catch(e){
    if(preview)preview.close();
    alert(
      e?.message||
      "予約管理画面を開けませんでした。"
    );
  }
}

function bindReservationManageButtons_(board){
  if(!board||board.dataset.manageBound==="1")return;
  board.dataset.manageBound="1";

  board.addEventListener("click",function(e){
    const btn=e.target.closest(
      ".reservation-manage-button"
    );
    if(!btn)return;

    e.preventDefault();
    e.stopPropagation();

    openReservationManageFromStaff_(
      btn.dataset.reservationId
    );
  });
}


// ===== スタッフ予定 =====
function localYmd(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function parseYmd(v){const [y,m,d]=String(v).split("-").map(Number);return new Date(y,m-1,d)}
function moveStaffScheduleDate(days){const d=parseYmd(state.staffScheduleDate||localYmd());d.setDate(d.getDate()+days);state.staffScheduleDate=localYmd(d);loadStaffSchedule()}
function formatStaffDate(v){const d=parseYmd(v),w=["日","月","火","水","木","金","土"];return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${w[d.getDay()]}）`}
async function loadStaffSchedule(){if(!$("#staffScheduleBoard"))return;if(!state.staffScheduleDate)state.staffScheduleDate=localYmd();$("#staffScheduleDateLabel").textContent=formatStaffDate(state.staffScheduleDate);$("#staffScheduleBoard").innerHTML='<div class="staff-schedule-loading">スタッフ予定を読み込んでいます…</div>';$("#staffScheduleMessage").classList.add("is-hidden");try{const j=await apiGet("getStaffSchedule",{date:state.staffScheduleDate,store_code:"YACHIYO"});state.staffSchedule=j.data||{};renderStaffSchedule(state.staffSchedule)}catch(e){$("#staffScheduleBoard").innerHTML='<div class="staff-schedule-empty"><strong>予定を取得できませんでした</strong><span>'+esc(e.message)+'</span></div>';const n=$("#staffScheduleMessage");n.textContent=e.message;n.classList.remove("is-hidden");n.classList.add("is-error")}}
function renderStaffSchedule(d){const shifts=Array.isArray(d.shifts)?d.shifts:[],reservations=Array.isArray(d.reservations)?d.reservations:[];$("#staffScheduleSummary").innerHTML=`<span>勤務 <b>${shifts.length}</b>名</span><span>予約 <b>${reservations.length}</b>件</span>`;const staffCodes=[...new Set([...shifts.map(x=>x.staff_code),...reservations.map(x=>x.staff_code)].filter(Boolean))];if(!staffCodes.length){$("#staffScheduleBoard").innerHTML='<div class="staff-schedule-empty"><strong>この日のスタッフ予定はありません</strong><span>シフト・予約ともに登録されていません。</span></div>';return}const sections=staffCodes.map(code=>{const ss=shifts.filter(x=>x.staff_code===code),rr=reservations.filter(x=>x.staff_code===code).sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));const name=ss[0]?.staff_name||rr[0]?.staff_name||code;const shiftText=ss.length?ss.map(x=>`${esc(x.start_time)}〜${esc(x.end_time)}`).join(" / "):"シフト登録なし";const rows=rr.length?rr.map(r=>`<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(r.start_time)}〜${esc(r.end_time)}</div><div class="staff-reservation-service"><strong>${esc(r.service_name||r.service_code)}</strong><small>${esc(r.service_code||"")}</small></div><div class="staff-reservation-customer"><strong>${esc(r.customer_name||"氏名未登録")}</strong><small>${r.member_no?`会員番号 ${esc(r.member_no)}`:esc(r.customer_type||"")}</small></div><span class="reservation-status">${esc(r.status||"RESERVED")}</span><button type="button" class="reservation-manage-button" data-reservation-id="${esc(r.reservation_id||"")}" style="border:1px solid #cfd4d4;background:#fff;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">変更・キャンセル</button></div>`).join(""):'<div class="staff-no-reservation">予約はありません。</div>';return `<section class="staff-day-section"><div class="staff-day-head"><div class="staff-day-person"><span class="staff-day-avatar">${esc(String(name).slice(0,1))}</span><span><strong>${esc(name)}</strong><small>${esc(code)}</small></span></div><span class="shift-pill">${shiftText}</span></div><div class="staff-reservation-list">${rows}</div></section>`}).join("");$("#staffScheduleBoard").innerHTML=`<div class="staff-day-grid">${sections}</div>`}
bindReservationManageButtons_($("#staffScheduleBoard"));
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
    const rows=rr.length?rr.map(r=>`<div class="staff-reservation-row"><div class="staff-reservation-time">${esc(r.start_time)}〜${esc(r.end_time)}</div><div class="staff-reservation-service"><strong>${esc(r.service_name||r.service_code)}</strong><small>${esc(r.service_code||"")}</small></div><div class="staff-reservation-customer"><strong>${esc(r.customer_name||"氏名未登録")}</strong><small>${r.member_no?`会員番号 ${esc(r.member_no)}`:esc(r.customer_type||"")}</small></div><span class="reservation-status">${esc(r.status||"RESERVED")}</span><button type="button" class="reservation-manage-button" data-reservation-id="${esc(r.reservation_id||"")}" style="border:1px solid #cfd4d4;background:#fff;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">変更・キャンセル</button></div>`).join(""):'<div class="staff-no-reservation">予約はありません。</div>';
    return `<section class="staff-day-section"><div class="staff-day-head"><div class="staff-day-person"><span class="staff-day-avatar">${esc(String(name).slice(0,1))}</span><span><strong>${esc(name)}</strong><small>${esc(code)}</small></span></div><span class="shift-pill">${shiftText}</span></div><div class="staff-reservation-list">${rows}</div></section>`;
  }).join("");
  $("#trainerScheduleBoard").innerHTML=`<div class="staff-day-grid">${sections}</div>`;
}
bindReservationManageButtons_($("#trainerScheduleBoard"));
$("#trainerPrevDay")?.addEventListener("click",()=>moveTrainerScheduleDate(-1));
$("#trainerNextDay")?.addEventListener("click",()=>moveTrainerScheduleDate(1));
$("#trainerToday")?.addEventListener("click",()=>{state.trainerScheduleDate=localYmd();loadTrainerSchedule()});


// ===== 自分のシフト変更申請 =====
function buildShiftTimeOptions_(includeBlank=true){
  const rows=[];
  if(includeBlank)rows.push('<option value="">選択してください</option>');
  for(let h=8;h<=23;h++){
    for(const m of [0,15,30,45]){
      const hh=String(h).padStart(2,"0");
      const mm=String(m).padStart(2,"0");
      rows.push(`<option value="${hh}:${mm}">${hh}:${mm}</option>`);
    }
  }
  rows.push('<option value="24:00">24:00</option>');
  return rows.join("");
}

function setupMyShiftTimeSelectors_(){
  const options=buildShiftTimeOptions_(true);
  if($("#myShiftStart"))$("#myShiftStart").innerHTML=options;
  if($("#myShiftEnd"))$("#myShiftEnd").innerHTML=options;
}

function isManagementUser(){return hasPermission("ADMIN","MANAGER")}
function canUseMyShift(){return authEnabled()&&!isManagementUser()&&!!state.authUser?.staff_code}

function isAllowedShiftTime_(value){
  const m=/^(\d{2}):(\d{2})$/.exec(String(value||""));
  if(!m)return false;
  const h=Number(m[1]),min=Number(m[2]);
  if(![0,15,30,45].includes(min))return false;
  if(h===24)return min===0;
  return h>=8&&h<=23;
}

function isTodayOrPastShiftDate_(dateValue){
  const target=String(dateValue||"");
  return !!target && target<=localYmd();
}

function sameDayShiftRuleMessage_(){
  return "当日のシフト追加・変更・削除はWeb申請できません。080-3553-4259まで直接ご連絡ください。";
}

function monthRangeFromYm_(ym){
  const m=/^(\d{4})-(\d{2})$/.exec(String(ym||""));
  if(!m)return null;
  const year=Number(m[1]),month=Number(m[2]);
  const last=new Date(year,month,0).getDate();
  return {
    start:`${m[1]}-${m[2]}-01`,
    end:`${m[1]}-${m[2]}-${String(last).padStart(2,"0")}`,
    year,month,last
  };
}

function formatMonthLabel_(ym){
  const r=monthRangeFromYm_(ym);
  if(!r)return ym||"";
  return `${r.year}年${r.month}月`;
}

function nextYm_(ym){
  const r=monthRangeFromYm_(ym);
  if(!r)return "";
  const d=new Date(r.year,r.month,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function setupMyShiftMonthTabs_(){
  const current=localYmd().slice(0,7);
  const next=nextYm_(current);

  const c=monthRangeFromYm_(current);
  const n=monthRangeFromYm_(next);

  if($("#myShiftCurrentMonthTab"))$("#myShiftCurrentMonthTab").textContent=`${c.month}月`;
  if($("#myShiftNextMonthTab"))$("#myShiftNextMonthTab").textContent=`${n.month}月`;

  const active=state.myShiftMonth||current;
  $("#myShiftCurrentMonthTab")?.classList.toggle("is-active",active===current);
  $("#myShiftNextMonthTab")?.classList.toggle("is-active",active===next);
}

function weekdayJa_(date){
  const d=parseYmd(date);
  return ["日","月","火","水","木","金","土"][d.getDay()];
}

function moveMyShiftMonth_(delta){
  const r=monthRangeFromYm_(state.myShiftMonth||localYmd().slice(0,7));
  const d=new Date(r.year,r.month-1+delta,1);
  state.myShiftMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  resetMyShiftForm();
  loadMyShiftView();
}

function myShiftMsg(text,error=false){
  const n=$("#myShiftMessage");
  if(!n)return;
  n.textContent=text||"";
  n.classList.toggle("is-hidden",!text);
  n.classList.toggle("is-error",!!error);
}

function resetMyShiftForm(){
  if($("#myShiftEditingId"))$("#myShiftEditingId").value="";
  if($("#myShiftStart"))$("#myShiftStart").value="";
  if($("#myShiftEnd"))$("#myShiftEnd").value="";
  if($("#myShiftReason"))$("#myShiftReason").value="";
  if($("#myShiftFormTitle"))$("#myShiftFormTitle").textContent="シフト変更申請";
  if($("#myShiftSelectedDate"))$("#myShiftSelectedDate").textContent="";
  if($("#myShiftFormHelp"))$("#myShiftFormHelp").textContent="一覧の「変更申請」を押すと、変更後の勤務時間を指定できます。";
  if($("#myShiftSubmitButton")){
    $("#myShiftSubmitButton").textContent="変更申請を送る";
    $("#myShiftSubmitButton").disabled=false;
  }
  $("#myShiftCancelEdit")?.classList.add("is-hidden");
  $("#myShiftRequestForm")?.classList.add("is-hidden");
}

async function loadMyShiftView(){
  if(!canUseMyShift())return;

  const role=String(state.authUser?.role||"STAFF").toUpperCase();
  const rawName=String(
    state.authUser?.display_name ||
    state.authUser?.staff_name ||
    state.authUser?.staff_code ||
    ""
  ).trim();

  const titleName=role==="TRAINER"
    ? `${rawName}トレーナー`
    : `${rawName}さん`;

  if($("#myShiftPageTitle"))$("#myShiftPageTitle").textContent=`${titleName}のシフト`;
  if(!state.myShiftMonth)state.myShiftMonth=localYmd().slice(0,7);

  const range=monthRangeFromYm_(state.myShiftMonth);
  if(!range)return;

  $("#myShiftMonthLabel").textContent=formatMonthLabel_(state.myShiftMonth);
  setupMyShiftMonthTabs_();
  $("#myShiftList").innerHTML='<div class="registered-shift-empty">1か月分のシフトを読み込んでいます…</div>';
  $("#myShiftRequestHistory").innerHTML='<div class="registered-shift-empty">申請履歴を読み込んでいます…</div>';

  try{
    const [shiftRes,requestRes]=await Promise.all([
      apiGet("getStaffShifts",{
        staff_code:state.authUser.staff_code,
        start_date:range.start,
        end_date:range.end
      }),
      apiGet("getMyShiftChangeRequests")
    ]);

    state.myShiftRows=(Array.isArray(shiftRes.data)?shiftRes.data:Array.isArray(shiftRes.data?.shifts)?shiftRes.data.shifts:[])
      .filter(r=>r.active!==false)
      .sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start_time).localeCompare(String(b.start_time)));

    state.myShiftRequests=(Array.isArray(requestRes.data)?requestRes.data:[])
      .filter(r=>String(r.date||"").slice(0,7)===state.myShiftMonth);

    renderMyShiftRows();
    renderMyShiftRequestHistory();

    const pending=state.myShiftRequests.filter(r=>String(r.status||"").toUpperCase()==="PENDING").length;
    $("#myShiftStatusSummary").textContent=`勤務 ${state.myShiftRows.length}件 / 承認待ち ${pending}件`;

    resetMyShiftForm();

  }catch(e){
    $("#myShiftList").innerHTML=`<div class="registered-shift-empty is-error">${esc(e.message||"シフトを取得できませんでした。")}</div>`;
    myShiftMsg(e.message||"取得に失敗しました。",true);
  }
}

function renderMyShiftRows(){
  const box=$("#myShiftList");
  const rows=state.myShiftRows||[];

  if(!rows.length){
    box.innerHTML='<div class="registered-shift-empty">この月の確定シフトはありません。</div>';
    return;
  }

  const today=localYmd();
  const requests=state.myShiftRequests||[];

  const pendingForShift=(r)=>{
    const shiftId=String(r.shift_id||"");
    return requests.find(q=>{
      const status=String(q.status||"").trim().toUpperCase();
      const requestShiftId=String(q.shift_id||q.original_shift_id||"");
      return status==="PENDING" && requestShiftId===shiftId;
    })||null;
  };

  box.innerHTML=rows.map(r=>{
    const date=String(r.date||"");
    const d=parseYmd(date);
    const day=d.getDate();
    const isToday=date===today;
    const blocked=date<today;
    const pending=pendingForShift(r);
    const pendingType=String(pending?.request_type||"").toUpperCase();
    const pendingLabel=pending
      ? (pendingType==="DELETE" ? "削除申請中" : "変更申請中")
      : "";

    return `<div class="registered-shift-row ${pending?"is-pending-request":""}"
      style="grid-template-columns:minmax(125px,170px) minmax(0,1fr) auto">
      <div class="registered-shift-time">
        <strong>${d.getMonth()+1}月${day}日（${weekdayJa_(date)}）</strong>
        <small style="display:block;margin-top:4px;color:#91a198">${esc(date)}</small>
      </div>
      <div class="registered-shift-meta">
        <span style="font-size:16px;font-weight:900;color:#fff">${esc(r.start_time)}〜${esc(r.end_time)}</span>
        <small>${esc(r.store_code||state.authUser?.store_code||"")}</small>
        ${pending?`<span class="shift-request-pending-badge">${esc(pendingLabel)}</span>`:""}
      </div>
      <div class="registered-shift-actions">
        <button class="ghost-button" type="button"
          data-my-shift-edit="${esc(r.shift_id||"")}"
          ${(blocked||pending)?"disabled":""}>変更申請</button>
        <button class="danger-ghost" type="button"
          data-my-shift-delete="${esc(r.shift_id||"")}"
          ${(blocked||pending)?"disabled":""}>シフト削除申請</button>
      </div>
    </div>`;
  }).join("");

  $$("[data-my-shift-edit]").forEach(b=>b.onclick=()=>{
    const r=rows.find(x=>String(x.shift_id)===String(b.dataset.myShiftEdit));
    if(!r)return;
    if(String(r.date||"")===today){
      showTodayShiftContactCard_(r,"変更申請");
      return;
    }
    editMyShiftRequest(r);
  });

  $$("[data-my-shift-delete]").forEach(b=>b.onclick=()=>{
    const r=rows.find(x=>String(x.shift_id)===String(b.dataset.myShiftDelete));
    if(!r)return;
    if(String(r.date||"")===today){
      showTodayShiftContactCard_(r,"シフト削除申請");
      return;
    }
    requestDeleteMyShift(r);
  });
}

function showTodayShiftContactCard_(r,actionLabel){
  const name=roleHonorific(state.authUser||{});

  if($("#todayShiftContactAction")){
    $("#todayShiftContactAction").textContent=`${actionLabel||"当日変更"}について直接連絡`;
  }

  if($("#todayShiftContactDetail")){
    $("#todayShiftContactDetail").innerHTML=
      `<strong>${esc(name)}</strong><br>`+
      `${esc(formatStaffDate(r.date))}<br>`+
      `${esc(r.start_time)}〜${esc(r.end_time)}<br><br>`+
      `当日の${esc(actionLabel||"シフト変更")}はWeb申請できません。<br>`+
      `下のボタンから080-3553-4259へ直接ご連絡ください。`;
  }

  $("#todayShiftContactCard")?.classList.remove("is-hidden");
  $("#todayShiftContactCard")?.scrollIntoView({behavior:"smooth",block:"start"});
}

$("#closeTodayShiftContactCard")?.addEventListener("click",()=>{
  $("#todayShiftContactCard")?.classList.add("is-hidden");
});

function editMyShiftRequest(r){
  const date=String(r.date||"");
  if(isTodayOrPastShiftDate_(date))return myShiftMsg(sameDayShiftRuleMessage_(),true);

  state.myShiftDate=date;
  $("#myShiftRequestForm")?.classList.remove("is-hidden");
  $("#myShiftEditingId").value=r.shift_id||"";
  $("#myShiftStart").value=String(r.start_time||"").slice(0,5);
  $("#myShiftEnd").value=String(r.end_time||"").slice(0,5);
  $("#myShiftReason").value="";
  $("#myShiftFormTitle").textContent="シフト変更申請";
  $("#myShiftSelectedDate").textContent=formatStaffDate(date);
  if($("#myShiftFormHelp"))$("#myShiftFormHelp").textContent="この既存シフトを変更する申請です。承認後に元のシフトが変更されます。";
  $("#myShiftSubmitButton").textContent="変更申請を送る";
  $("#myShiftCancelEdit").classList.remove("is-hidden");
  $("#myShiftRequestForm")?.scrollIntoView({behavior:"smooth",block:"start"});
  $("#myShiftStart").focus();
}

async function requestDeleteMyShift(r){
  const date=String(r.date||"");
  if(isTodayOrPastShiftDate_(date))return myShiftMsg(sameDayShiftRuleMessage_(),true);

  const reason=prompt(
    `${formatStaffDate(date)} ${r.start_time}〜${r.end_time} の既存シフトを丸ごと削除する申請を送ります。\n承認されるまで元のシフトは残ります。\n\n申請理由があれば入力してください。`,
    ""
  );
  if(reason===null)return;

  try{
    await apiPost({
      action:"createShiftChangeRequest",
      request_type:"DELETE",
      staff_code:state.authUser.staff_code,
      shift_id:r.shift_id,
      reason:String(reason||"").trim()
    });
    myShiftMsg("シフト削除申請を送信しました。承認されるまで現在のシフトはそのまま残ります。");
    await loadMyShiftView();
  }catch(e){
    const message=e.message||"削除申請に失敗しました。";

    if(isShiftReservationConflictMessage_(message)){
      myShiftMsg(message,true);
      showShiftReservationConflictCard_(message);
      return;
    }

    myShiftMsg(message,true);
  }
}


function isShiftReservationConflictMessage_(message){
  const s=String(message||"");
  return s.includes("対応予定") ||
         s.includes("予約があります") ||
         s.includes("予約があるため") ||
         s.includes("080-3553-4259");
}

function showShiftReservationConflictCard_(message){
  if($("#todayShiftContactAction")){
    $("#todayShiftContactAction").textContent="予約対応の確認が必要です";
  }

  if($("#todayShiftContactDetail")){
    $("#todayShiftContactDetail").innerHTML=
      `${esc(message||"このシフト変更には予約対応の確認が必要です。")}<br><br>`+
      `下のボタンから080-3553-4259へ直接ご連絡ください。`;
  }

  $("#todayShiftContactCard")?.classList.remove("is-hidden");
  $("#todayShiftContactCard")?.scrollIntoView({behavior:"smooth",block:"start"});
}

$("#myShiftRequestForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  if(!canUseMyShift())return myShiftMsg("この操作を行う権限がありません。",true);
  if(!state.myShiftDate)return myShiftMsg("一覧の既存シフトから「変更申請」を選択してください。",true);
  if(isTodayOrPastShiftDate_(state.myShiftDate))return myShiftMsg(sameDayShiftRuleMessage_(),true);

  const editingId=String($("#myShiftEditingId").value||"").trim();
  if(!editingId)return myShiftMsg("一覧の既存シフトから「変更申請」を選択してください。",true);

  const start=$("#myShiftStart").value;
  const end=$("#myShiftEnd").value;

  if(!start||!end)return myShiftMsg("開始時刻と終了時刻を選択してください。",true);
  if(!isAllowedShiftTime_(start)||!isAllowedShiftTime_(end))return myShiftMsg("時刻は08:00〜24:00、分は00・15・30・45のみ選択できます。",true);
  if(start>=end)return myShiftMsg("終了時刻は開始時刻より後にしてください。",true);

  const b=$("#myShiftSubmitButton");
  b.disabled=true;
  b.textContent="送信中…";
  myShiftMsg("");

  try{
    const role=String(state.authUser?.role||"STAFF").toUpperCase();

    if(role==="STAFF"){
      const store=state.authUser.store_code||"YACHIYO";
      const presence=await getResolvedPresence_(state.myShiftDate,store);

      if(!isWithinPresence_(start,end,presence)){
        const rule=presence.closed
          ?"在駐なし"
          :`${presence.start_time||"--:--"}〜${presence.end_time||"--:--"}`;

        throw new Error(
          `変更後の勤務時間はスタッフ在駐時間内で指定してください。この日の在駐時間：${rule}`
        );
      }
    }

    const result=await apiPost({
      action:"createShiftChangeRequest",
      request_type:"UPDATE",
      staff_code:state.authUser.staff_code,
      shift_id:editingId,
      store_code:state.authUser.store_code||"YACHIYO",
      date:state.myShiftDate,
      start_time:start,
      end_time:end,
      reason:$("#myShiftReason").value.trim()
    });

    b.textContent="送信完了しました";
    myShiftMsg("変更申請を送信しました。ADMIN / MANAGERへ承認メールを送信しました。");

    state.myShiftDate="";

    // 完了表示を確認できるようにしてから一覧を更新
    setTimeout(()=>{ loadMyShiftView(); },1200);

    // 完了表示は少し残す
    setTimeout(()=>{
      if($("#myShiftSubmitButton")){
        $("#myShiftSubmitButton").textContent="変更申請を送る";
        $("#myShiftSubmitButton").disabled=false;
      }
    },1500);

  }catch(err){
    b.textContent="変更申請を送る";
    b.disabled=false;

    const message=err.message||"シフト変更申請に失敗しました。";

    if(isShiftReservationConflictMessage_(message)){
      myShiftMsg(message,true);
      showShiftReservationConflictCard_(message);
      return;
    }

    myShiftMsg(message,true);
  }
});

$("#myShiftCancelEdit")?.addEventListener("click",()=>{
  state.myShiftDate="";
  resetMyShiftForm();
});



$("#myShiftCurrentMonthTab")?.addEventListener("click",()=>{
  state.myShiftMonth=localYmd().slice(0,7);
  state.myShiftDate="";
  resetMyShiftForm();
  loadMyShiftView();
});

$("#myShiftNextMonthTab")?.addEventListener("click",()=>{
  state.myShiftMonth=nextYm_(localYmd().slice(0,7));
  state.myShiftDate="";
  resetMyShiftForm();
  loadMyShiftView();
});

function renderMyShiftRequestHistory(){
  const box=$("#myShiftRequestHistory");
  const rows=(state.myShiftRequests||[]).slice()
    .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))||String(a.requested_at||"").localeCompare(String(b.requested_at||"")));

  if(!rows.length){
    box.innerHTML='<div class="registered-shift-empty">この月の申請履歴はありません。</div>';
    return;
  }

  const typeLabel={ADD:"追加",UPDATE:"変更",DELETE:"削除"};
  const statusLabel={PENDING:"承認待ち",APPROVED:"承認済み",REJECTED:"却下"};

  box.innerHTML=rows.map(r=>{
    const t=String(r.request_type||"").toUpperCase();
    const s=String(r.status||"").toUpperCase();
    const time=t==="DELETE"
      ? `${esc(r.old_start_time||"")}〜${esc(r.old_end_time||"")}`
      : `${esc(r.new_start_time||"")}〜${esc(r.new_end_time||"")}`;

    return `<div class="registered-shift-row">
      <div class="registered-shift-time"><strong>${esc(r.date||"")}</strong></div>
      <div class="registered-shift-meta">
        <span>${esc(typeLabel[t]||t)} · ${time}</span>
        <small>${esc(r.reason||"理由なし")}</small>
      </div>
      <div class="registered-shift-actions"><span class="shift-pill">${esc(statusLabel[s]||s)}</span></div>
    </div>`;
  }).join("");
}

// ===== パスワード変更 =====
function passwordMsg(text,error=false){const n=$("#passwordChangeMessage");if(!n)return;n.textContent=text||"";n.classList.toggle("is-hidden",!text);n.classList.toggle("is-error",!!error)}
async function firebaseChangePassword(newPassword){
  const key=window.ANAUTS_AUTH?.firebaseApiKey;if(!key)throw new Error("Firebase APIキーが設定されていません。");if(!state.idToken)throw new Error("ログイン情報がありません。");
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:state.idToken,password:newPassword,returnSecureToken:true})});
  const j=await r.json();if(!r.ok){const code=String(j?.error?.message||"");if(code.includes("WEAK_PASSWORD"))throw new Error("パスワードは6文字以上で設定してください。");if(code.includes("TOKEN_EXPIRED")||code.includes("INVALID_ID_TOKEN"))throw new Error("ログイン情報の有効期限が切れました。再ログインしてください。");throw new Error("パスワードを変更できませんでした。")}return j
}
$("#passwordChangeForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const p1=String($("#newPassword").value||""),p2=String($("#newPasswordConfirm").value||"");if(p1.length<6)return passwordMsg("新しいパスワードは6文字以上で入力してください。",true);if(p1!==p2)return passwordMsg("確認用パスワードが一致しません。",true);
  const b=$("#passwordChangeButton");b.disabled=true;b.textContent="変更中…";passwordMsg("");
  try{const result=await firebaseChangePassword(p1);if(result.idToken){state.idToken=result.idToken;sessionStorage.setItem("anauts_id_token",result.idToken)}$("#passwordChangeForm").reset();passwordMsg("パスワードを変更しました。")}catch(e2){passwordMsg(e2.message||"パスワードを変更できませんでした。",true)}finally{b.disabled=false;b.textContent="パスワードを変更"}
});



// ===== スタッフ在駐時間 =====
const PRESENCE_DAY_LABEL={MON:"月曜日",TUE:"火曜日",WED:"水曜日",THU:"木曜日",FRI:"金曜日",SAT:"土曜日",SUN:"日曜日"};
const PRESENCE_DAY_ORDER=["MON","TUE","WED","THU","FRI","SAT","SUN"];

function presenceMsg(text,error=false){
  const n=$("#presenceMessage");
  if(!n)return;
  n.textContent=text||"";
  n.classList.toggle("is-hidden",!text);
  n.classList.toggle("is-error",!!error);
}

function presenceTimeOptions_(blank=true){
  const a=[];
  if(blank)a.push('<option value="">選択</option>');
  for(let h=0;h<=23;h++){
    for(const m of [0,15,30,45]){
      const v=`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      a.push(`<option value="${v}">${v}</option>`);
    }
  }
  a.push('<option value="24:00">24:00</option>');
  return a.join("");
}

function setupPresenceManager(){
  const stores=state.stores.filter(s=>s.active!==false);
  $("#presenceStore").innerHTML=stores.map(s=>`<option value="${esc(s.store_code)}">${esc(s.store_name||s.store_code)}</option>`).join("");
  if(stores.some(s=>String(s.store_code)==="YACHIYO"))$("#presenceStore").value="YACHIYO";

  $("#presenceMonthDay").innerHTML=Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}日</option>`).join("");
  $("#presenceSpecialStart").innerHTML=presenceTimeOptions_(true);
  $("#presenceSpecialEnd").innerHTML=presenceTimeOptions_(true);

  $("#presenceStore").onchange=loadPresenceSettings_;
  $("#presenceWeekdayTab").onclick=()=>showPresenceTab_("weekday");
  $("#presenceSpecialTab").onclick=()=>showPresenceTab_("special");
  $("#savePresenceWeekdays").onclick=savePresenceWeekdays_;
  $("#newPresenceSpecial").onclick=()=>openPresenceSpecialForm_();
  $("#cancelPresenceSpecial").onclick=closePresenceSpecialForm_;
  $("#presenceSpecialType").onchange=updatePresenceSpecialTypeUi_;
  $("#presenceSpecialClosed").onchange=updatePresenceSpecialClosedUi_;
  $("#presenceSpecialForm").onsubmit=savePresenceSpecial_;

  loadPresenceSettings_();
}

function showPresenceTab_(tab){
  const weekday=tab==="weekday";
  $("#presenceWeekdayTab").classList.toggle("is-active",weekday);
  $("#presenceSpecialTab").classList.toggle("is-active",!weekday);
  $("#presenceWeekdayPanel").classList.toggle("is-hidden",!weekday);
  $("#presenceSpecialPanel").classList.toggle("is-hidden",weekday);
  presenceMsg("");
}

async function loadPresenceSettings_(){
  const store=$("#presenceStore")?.value||"";
  if(!store)return;
  try{
    const j=await apiGet("getStaffPresenceHours",{store_code:store});
    state.presenceWeekdays=Array.isArray(j.data?.weekdays)?j.data.weekdays:[];
    state.presenceSpecials=Array.isArray(j.data?.specials)?j.data.specials:[];
    renderPresenceWeekdays_();
    renderPresenceSpecials_();
    presenceMsg("");
  }catch(e){
    presenceMsg(e.message||"スタッフ在駐時間を取得できませんでした。",true);
  }
}

function renderPresenceWeekdays_(){
  const byDay=new Map((state.presenceWeekdays||[]).map(r=>[String(r.day_of_week),r]));
  const options=presenceTimeOptions_(true);

  $("#presenceWeekdayList").innerHTML=PRESENCE_DAY_ORDER.map(day=>{
    const r=byDay.get(day)||{};
    const closed=r.closed===true || String(r.closed).toUpperCase()==="TRUE" || !r.start_time || !r.end_time;

    return `<div class="service-hour-row" data-presence-day="${day}" style="grid-template-columns:minmax(110px,150px) 1fr 1fr auto">
      <div class="service-day"><strong>${PRESENCE_DAY_LABEL[day]}</strong><small>${day}</small></div>
      <label><span style="display:block;color:#91a198;font-size:11px;margin-bottom:5px">開始</span><select class="presence-week-start">${options}</select></label>
      <label><span style="display:block;color:#91a198;font-size:11px;margin-bottom:5px">終了</span><select class="presence-week-end">${options}</select></label>
      <label style="display:flex;align-items:center;gap:7px"><input class="presence-week-closed" type="checkbox" ${closed?"checked":""}><span>在駐なし</span></label>
    </div>`;
  }).join("");

  $$("[data-presence-day]").forEach(row=>{
    const day=row.dataset.presenceDay;
    const r=byDay.get(day)||{};
    const start=row.querySelector(".presence-week-start");
    const end=row.querySelector(".presence-week-end");
    const closed=row.querySelector(".presence-week-closed");

    start.value=r.start_time||"";
    end.value=r.end_time||"";

    const sync=()=>{
      start.disabled=closed.checked;
      end.disabled=closed.checked;
    };
    closed.onchange=sync;
    sync();
  });
}

async function savePresenceWeekdays_(){
  const store=$("#presenceStore").value;
  const rows=$$("[data-presence-day]").map(row=>({
    day_of_week:row.dataset.presenceDay,
    start_time:row.querySelector(".presence-week-start").value,
    end_time:row.querySelector(".presence-week-end").value,
    closed:row.querySelector(".presence-week-closed").checked
  }));

  for(const r of rows){
    if(!r.closed && (!r.start_time||!r.end_time))
      return presenceMsg(`${PRESENCE_DAY_LABEL[r.day_of_week]}の開始・終了時刻を指定してください。`,true);
    if(!r.closed && r.start_time>=r.end_time)
      return presenceMsg(`${PRESENCE_DAY_LABEL[r.day_of_week]}の終了時刻は開始時刻より後にしてください。`,true);
  }

  try{
    await apiPost({action:"saveStaffPresenceWeekdays",store_code:store,rows});
    await loadPresenceSettings_();
    presenceMsg("曜日設定を保存しました。");
  }catch(e){
    presenceMsg(e.message||"保存できませんでした。",true);
  }
}

function openPresenceSpecialForm_(r=null){
  $("#presenceSpecialForm").classList.remove("is-hidden");
  $("#presenceSpecialId").value=r?.presence_id||"";
  $("#presenceSpecialType").value=r?.rule_type||"MONTH_DAY";
  $("#presenceMonthDay").value=String(r?.month_day||9);
  $("#presenceSpecialDate").value=r?.specific_date||"";
  $("#presenceSpecialLabel").value=r?.label||"";
  $("#presenceSpecialStart").value=r?.start_time||"";
  $("#presenceSpecialEnd").value=r?.end_time||"";
  $("#presenceSpecialClosed").checked=r?.closed===true||String(r?.closed).toUpperCase()==="TRUE";
  updatePresenceSpecialTypeUi_();
  updatePresenceSpecialClosedUi_();
}

function closePresenceSpecialForm_(){
  $("#presenceSpecialForm").classList.add("is-hidden");
  $("#presenceSpecialForm").reset();
  $("#presenceSpecialId").value="";
}

function updatePresenceSpecialTypeUi_(){
  const isDate=$("#presenceSpecialType").value==="DATE";
  $("#presenceMonthDayField").classList.toggle("is-hidden",isDate);
  $("#presenceDateField").classList.toggle("is-hidden",!isDate);
}

function updatePresenceSpecialClosedUi_(){
  const closed=$("#presenceSpecialClosed").checked;
  $("#presenceSpecialStart").disabled=closed;
  $("#presenceSpecialEnd").disabled=closed;
}

async function savePresenceSpecial_(e){
  e.preventDefault();

  const type=$("#presenceSpecialType").value;
  const closed=$("#presenceSpecialClosed").checked;

  const payload={
    action:"saveStaffPresenceSpecial",
    presence_id:$("#presenceSpecialId").value,
    store_code:$("#presenceStore").value,
    rule_type:type,
    month_day:type==="MONTH_DAY"?Number($("#presenceMonthDay").value):"",
    specific_date:type==="DATE"?$("#presenceSpecialDate").value:"",
    label:$("#presenceSpecialLabel").value.trim(),
    start_time:closed?"":$("#presenceSpecialStart").value,
    end_time:closed?"":$("#presenceSpecialEnd").value,
    closed
  };

  if(type==="DATE"&&!payload.specific_date)return presenceMsg("特定日を指定してください。",true);
  if(!closed&&(!payload.start_time||!payload.end_time))return presenceMsg("開始・終了時刻を指定してください。",true);
  if(!closed&&payload.start_time>=payload.end_time)return presenceMsg("終了時刻は開始時刻より後にしてください。",true);

  try{
    await apiPost(payload);
    closePresenceSpecialForm_();
    await loadPresenceSettings_();
    presenceMsg("追加設定を保存しました。");
  }catch(err){
    presenceMsg(err.message||"保存できませんでした。",true);
  }
}

function renderPresenceSpecials_(){
  const rows=state.presenceSpecials||[];

  if(!rows.length){
    $("#presenceSpecialList").innerHTML='<div class="empty-service-hours">追加設定はありません。</div>';
    return;
  }

  $("#presenceSpecialList").innerHTML=rows.map((r,i)=>{
    const key=r.rule_type==="DATE" ? esc(r.specific_date||"") : `毎月${esc(r.month_day)}日`;
    const time=(r.closed===true||String(r.closed).toUpperCase()==="TRUE")
      ?"在駐なし"
      :`${esc(r.start_time)} 〜 ${esc(r.end_time)}`;

    return `<div class="service-hour-row" style="grid-template-columns:minmax(130px,180px) 1fr auto auto">
      <div class="service-day"><strong>${key}</strong><small>${esc(r.label||r.rule_type||"")}</small></div>
      <div class="service-time">${time}</div>
      <button type="button" class="ghost-button" data-presence-edit="${i}">編集</button>
      <button type="button" class="danger-ghost" data-presence-delete="${i}">削除</button>
    </div>`;
  }).join("");

  $$("[data-presence-edit]").forEach(b=>b.onclick=()=>openPresenceSpecialForm_(rows[+b.dataset.presenceEdit]));
  $$("[data-presence-delete]").forEach(b=>b.onclick=()=>deletePresenceSpecial_(rows[+b.dataset.presenceDelete]));
}

async function deletePresenceSpecial_(r){
  const label=r.rule_type==="DATE"?r.specific_date:`毎月${r.month_day}日`;
  if(!confirm(`${label} の追加設定を削除しますか？`))return;

  try{
    await apiPost({action:"deleteStaffPresenceSpecial",presence_id:r.presence_id});
    await loadPresenceSettings_();
    presenceMsg("追加設定を削除しました。");
  }catch(e){
    presenceMsg(e.message||"削除できませんでした。",true);
  }
}

async function getResolvedPresence_(date,store){
  const j=await apiGet("getResolvedStaffPresenceHours",{date,store_code:store});
  return j.data||{};
}

function timeMinutes_(v){
  const m=/^(\d{2}):(\d{2})$/.exec(String(v||""));
  return m?Number(m[1])*60+Number(m[2]):NaN;
}

function isWithinPresence_(start,end,p){
  if(!p||p.closed===true||String(p.closed).toUpperCase()==="TRUE")return false;
  if(!p.start_time||!p.end_time)return false;
  return timeMinutes_(start)>=timeMinutes_(p.start_time)&&timeMinutes_(end)<=timeMinutes_(p.end_time);
}

// ===== サービス管理 =====
function setupServiceManager(){renderServiceList();resetServiceForm();$("#serviceSearch").oninput=renderServiceList;$("#newServiceButton").onclick=resetServiceForm;$("#serviceForm").onsubmit=saveServiceFromUi}
function renderServiceList(){const box=$("#serviceList");if(!box)return;const q=($("#serviceSearch")?.value||"").trim().toLowerCase();const rows=state.services.filter(s=>[s.service_code,s.service_name,s.category,s.provider_role].join(" ").toLowerCase().includes(q));if(!rows.length){box.innerHTML='<div class="no-staff">該当するサービスがありません。</div>';return}box.innerHTML=rows.map(s=>`<button type="button" class="service-list-item ${s.service_code===state.selectedServiceCode?"is-selected":""}" data-service-code="${esc(s.service_code)}"><span><strong>${esc(s.service_name||s.service_code)}</strong><small>${esc(s.service_code)} · ${esc(s.category||"")}</small></span><span class="service-badges"><span class="service-badge ${s.public===false?"off":""}">${s.public===false?"非公開":"公開"}</span></span></button>`).join("");$$('[data-service-code]').forEach(b=>b.onclick=()=>selectService(b.dataset.serviceCode))}
function selectService(code){const s=state.services.find(x=>String(x.service_code)===String(code));if(!s)return;state.selectedServiceCode=s.service_code;$("#serviceFormTitle").textContent=s.service_name||s.service_code;$("#serviceCodeHelp").textContent=`サービスコード：${s.service_code}（編集時は変更しないでください）`;$("#serviceCode").value=s.service_code||"";$("#serviceCode").readOnly=true;$("#serviceName").value=s.service_name||"";$("#serviceBrand").value=s.brand_code||"TFG";$("#serviceStore").value=s.store_code||"YACHIYO";$("#serviceCategory").value=s.category||"";$("#serviceFormType").value=s.form_type||"MEMBER";$("#serviceDuration").value=Number(s.duration||0);$("#serviceSlotInterval").value=Number(s.slot_interval_minutes||0);$("#serviceProviderRole").value=s.provider_role||"";$("#serviceCalendarCode").value=s.calendar_code||"";$("#serviceMailAccountCode").value=s.mail_account_code||"";$("#serviceBookingMinHours").value=Number(s.booking_min_hours||0);$("#serviceChangeLimitHours").value=Number(s.change_limit_hours||0);$("#serviceCancelLimitHours").value=Number(s.cancel_limit_hours||0);$("#servicePublicDays").value=Number(s.public_days||0);$("#servicePublic").checked=s.public!==false;$("#serviceActive").checked=s.active!==false;hideServiceMsg();renderServiceList()}
function resetServiceForm(){state.selectedServiceCode="";$("#serviceForm")?.reset();$("#serviceFormTitle").textContent="新規サービス";$("#serviceCodeHelp").textContent="サービスコードは新規登録後は変更しないでください。";$("#serviceCode").readOnly=false;$("#serviceBrand").value="TFG";$("#serviceStore").value="YACHIYO";$("#serviceFormType").value="MEMBER";$("#serviceBookingMinHours").value=3;$("#serviceChangeLimitHours").value=3;$("#serviceCancelLimitHours").value=3;$("#servicePublicDays").value=30;$("#servicePublic").checked=true;$("#serviceActive").checked=true;hideServiceMsg();renderServiceList()}
async function saveServiceFromUi(e){e.preventDefault();const code=String($("#serviceCode").value||"").trim().toUpperCase();if(!code)return serviceMsg("サービスコードを入力してください。",true);if(!$("#serviceName").value.trim())return serviceMsg("サービス名を入力してください。",true);if(+$("#serviceDuration").value<=0||+$("#serviceSlotInterval").value<=0)return serviceMsg("所要時間と予約間隔は1分以上にしてください。",true);const b=$("#saveServiceButton");b.disabled=true;b.textContent="保存中…";try{const j=await apiPost({action:"saveService",service_code:code,brand_code:$("#serviceBrand").value.trim(),store_code:$("#serviceStore").value.trim(),service_name:$("#serviceName").value.trim(),category:$("#serviceCategory").value.trim(),form_type:$("#serviceFormType").value,duration:+$("#serviceDuration").value,calendar_code:$("#serviceCalendarCode").value.trim(),provider_role:$("#serviceProviderRole").value.trim(),booking_min_hours:+$("#serviceBookingMinHours").value,change_limit_hours:+$("#serviceChangeLimitHours").value,cancel_limit_hours:+$("#serviceCancelLimitHours").value,public_days:+$("#servicePublicDays").value,slot_interval_minutes:+$("#serviceSlotInterval").value,mail_account_code:$("#serviceMailAccountCode").value.trim(),public:$("#servicePublic").checked,active:$("#serviceActive").checked});await loadServices();state.selectedServiceCode=code;const saved=state.services.find(x=>x.service_code===code);if(saved)selectService(code);else resetServiceForm();serviceMsg(j.data?.active===false?"保存しました。無効化したサービスは現在の一覧APIには表示されません。":"保存しました。")}catch(err){serviceMsg(err.message||"保存に失敗しました。",true)}finally{b.disabled=false;b.textContent="保存"}}
function serviceMsg(text,error=false){const n=$("#serviceMessage");if(!n)return;n.textContent=text;n.classList.remove("is-hidden");n.classList.toggle("is-error",error)}
function hideServiceMsg(){const n=$("#serviceMessage");if(!n)return;n.textContent="";n.classList.add("is-hidden");n.classList.remove("is-error")}

window.addEventListener("DOMContentLoaded",async()=>{
  setupMyShiftTimeSelectors_();
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
