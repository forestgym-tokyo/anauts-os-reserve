(()=>{
  "use strict";

  const MPG_MANAGER_ID = "mpgShiftManager";

  function permission_(){
    try{
      return String(state && state.authUser && state.authUser.permission || "").trim().toUpperCase();
    }catch(_){
      return "";
    }
  }

  function allowed_(){
    return permission_() === "ADMIN" || permission_() === "MANAGER";
  }

  function monthValue_(offset){
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1 + offset).padStart(2, "0")
    ].join("-");
  }

  function normalizedMonth_(offset){
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function hideOtherManagers_(){
    document.querySelectorAll("#registrationView .manager").forEach(function(section){
      if(section.id !== MPG_MANAGER_ID) section.classList.add("is-hidden");
    });
  }

  function showMessage_(message, isError){
    const el = document.getElementById("mpgShiftMessage");
    if(!el) return;
    el.textContent = message || "";
    el.classList.remove("is-hidden", "is-error");
    if(isError) el.classList.add("is-error");
  }

  async function generate_(){
    const month = String(document.getElementById("mpgShiftMonth")?.value || "").trim();
    const button = document.getElementById("mpgShiftGenerate");
    if(!month || !button) return;

    button.disabled = true;
    button.textContent = "作成中…";
    showMessage_("MPGシフトを作成しています。", false);

    try{
      const result = await apiPost({
        action: "generateKawakamiMpgShifts",
        month: month
      });
      const data = result && result.data || {};
      const reservedConflicts = Array.isArray(data.reserved_conflicts)
        ? data.reserved_conflicts.length
        : 0;

      showMessage_(
        month + " のMPGシフトを作成しました。" +
        " 登録 " + Number(data.inserted_count || 0) + "枠、" +
        "他店舗勤務で除外 " + Number(data.blocked_count || 0) + "枠、" +
        "48時間ルールで削除 " + Number(data.cleanup_removed_count || 0) + "枠" +
        (reservedConflicts ? "、確定予約との競合 " + reservedConflicts + "件（自動削除せず保護）" : "") +
        "。",
        false
      );
    }catch(error){
      showMessage_(error && error.message ? error.message : "MPGシフトを作成できませんでした。", true);
    }finally{
      button.disabled = false;
      button.textContent = "MPGシフトを自動作成";
    }
  }

  function build_(){
    if(!allowed_()) return;
    if(document.getElementById(MPG_MANAGER_ID)) return;

    const grid = document.querySelector("#registrationView .registration-grid");
    const view = document.getElementById("registrationView");
    if(!grid || !view) return;

    const card = document.createElement("button");
    card.className = "registration-card";
    card.type = "button";
    card.id = "mpgShiftRegistrationCard";
    card.innerHTML = '<span class="registration-icon">🏠</span><strong>MPGシフト作成</strong><small>川上一郎・45分枠を自動生成</small>';
    grid.appendChild(card);

    const section = document.createElement("section");
    section.id = MPG_MANAGER_ID;
    section.className = "manager card is-hidden";
    section.innerHTML = [
      '<div class="manager-header"><div>',
      '<p class="eyebrow">MY PRIVATE GYM SHIFT</p>',
      '<h2>川上一郎 MPGシフト</h2>',
      '<p style="margin:6px 0 0;color:#91a198;font-size:12px;line-height:1.8">',
      '見学・トレーニングサポートとも45分枠（10:15〜20:45）。八千代勤務の前後は2時間30分を確保し、9ROUND勤務時間はMPG枠から除外します。未予約枠は開始48時間前に自動削除します。',
      '</p></div></div>',
      '<div style="padding:20px 22px;display:grid;gap:14px">',
      '<label style="display:grid;gap:7px"><span style="font-size:12px;font-weight:800;color:#aab6ad">対象月</span>',
      '<select id="mpgShiftMonth"></select></label>',
      '<button id="mpgShiftGenerate" class="primary-button" type="button">MPGシフトを自動作成</button>',
      '<div id="mpgShiftMessage" class="form-message is-hidden"></div>',
      '<div style="font-size:12px;line-height:1.8;color:#9ba79f">',
      '基本枠：月・水 19:00〜21:00／火・木 10:00〜13:00／日 18:00〜21:00。見学・トレーニングサポートは同じ45分枠を使用します。10:15起点の45分グリッドに完全に入る枠を作成し、どちらかに確定予約がある枠は自動削除しません。',
      '</div></div>'
    ].join("");

    view.appendChild(section);

    const select = document.getElementById("mpgShiftMonth");
    const current = normalizedMonth_(0);
    const next = normalizedMonth_(1);
    select.innerHTML =
      '<option value="' + current + '">' + current + '（今月）</option>' +
      '<option value="' + next + '">' + next + '（翌月）</option>';

    card.addEventListener("click", function(event){
      event.preventDefault();
      event.stopPropagation();
      hideOtherManagers_();
      section.classList.remove("is-hidden");
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.getElementById("mpgShiftGenerate").addEventListener("click", generate_);
  }

  function boot_(){
    if(typeof state === "undefined" || typeof apiPost !== "function"){
      window.setTimeout(boot_, 120);
      return;
    }
    if(!state.authUser){
      window.setTimeout(boot_, 120);
      return;
    }
    build_();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot_, { once: true });
  }else{
    boot_();
  }
})();
