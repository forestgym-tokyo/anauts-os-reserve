(function () {
  "use strict";

  const VIEW_TYPE = "round9Interview";
  const MANAGER_ID = "round9InterviewManager";
  const marks = ["①", "②", "③", "④"];
  let loadedOnce = false;
  let previewSignature = "";
  let requestId = makeRequestId_();

  function q(selector) {
    return document.querySelector(selector);
  }

  function tomorrowYmd_() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function makeRequestId_() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    return `r9i_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  }

  function escapeHtml_(value) {
    if (typeof window.esc === "function") return window.esc(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
    });
  }

  function installStyle_() {
    if (q("#round9InterviewStyle")) return;
    const style = document.createElement("style");
    style.id = "round9InterviewStyle";
    style.textContent = `
      .r9i-shell{padding:22px}.r9i-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.r9i-head h2{margin:2px 0 5px}.r9i-head p{margin:0;color:#91a198;font-size:13px;line-height:1.65}.r9i-sender{flex:0 0 auto;padding:9px 12px;border:1px solid #345047;border-radius:11px;background:#0a1914;color:#79dc8c;font-size:12px;font-weight:850}.r9i-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.r9i-field{display:grid;gap:7px}.r9i-field>span{color:#cbd4cd;font-size:12px;font-weight:800}.r9i-field input{width:100%;min-height:46px;border:1px solid #345047;border-radius:10px;background:#09140f;color:#fff;padding:10px 12px;font-size:16px}.r9i-field input:focus{outline:0;border-color:#63d179;box-shadow:0 0 0 3px rgba(99,209,121,.12)}.r9i-candidate-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin:24px 0 10px}.r9i-candidate-head h3{margin:0}.r9i-candidate-head p{margin:5px 0 0;color:#91a198;font-size:12px}.r9i-search{display:grid;grid-template-columns:minmax(180px,240px) auto;gap:10px;align-items:end}.r9i-candidates{display:grid;gap:9px}.r9i-candidate{display:grid;grid-template-columns:44px minmax(150px,1.25fr) minmax(105px,.8fr) 18px minmax(105px,.8fr);gap:9px;align-items:center;padding:12px;border:1px solid #294037;border-radius:12px;background:#0b1914}.r9i-mark{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:#183527;color:#79dc8c;font-size:16px;font-weight:900}.r9i-candidate input{width:100%;min-height:42px;border:1px solid #345047;border-radius:9px;background:#07110d;color:#fff;padding:8px 10px;font-size:15px}.r9i-candidate-separator{text-align:center;color:#91a198}.r9i-window-note{grid-column:2/-1;color:#91a198;font-size:11px;line-height:1.5}.r9i-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap}.r9i-message{margin-top:14px;padding:11px 13px;border-radius:10px;background:#12271e;color:#bcebc8;font-size:13px;line-height:1.6}.r9i-message.is-error{background:#35161a;color:#ffadb3}.r9i-message.is-warning{background:#332710;color:#ffda89}.r9i-preview{margin-top:18px;border:1px solid #345047;border-radius:14px;overflow:hidden}.r9i-preview-head{padding:13px 15px;border-bottom:1px solid #294037;background:#10231d}.r9i-preview-head strong{display:block}.r9i-preview-head small{display:block;margin-top:4px;color:#91a198}.r9i-preview pre{margin:0;padding:17px;background:#07110d;color:#edf3ef;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}.r9i-loading{opacity:.65;pointer-events:none}.r9i-note{margin-top:14px;padding:12px 14px;border:1px solid #294037;border-radius:11px;color:#aebbb2;font-size:12px;line-height:1.7}.r9i-note strong{color:#fff}.r9i-card-accent{color:#ff5962!important}
      @media(max-width:760px){.r9i-shell{padding:17px}.r9i-head{display:grid}.r9i-sender{width:100%;overflow-wrap:anywhere}.r9i-grid{grid-template-columns:1fr}.r9i-candidate-head{display:grid}.r9i-search{grid-template-columns:1fr}.r9i-candidate{grid-template-columns:38px 1fr 1fr}.r9i-candidate .r9i-date{grid-column:2/-1}.r9i-candidate-separator{display:none}.r9i-window-note{grid-column:2/-1}.r9i-actions{display:grid;grid-template-columns:1fr}.r9i-actions button{width:100%;min-height:48px}}
    `;
    document.head.appendChild(style);
  }

  function installCard_() {
    const grid = q("#registrationView .registration-grid");
    if (!grid || q('[data-registration="round9Interview"]')) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "registration-card";
    card.dataset.registration = VIEW_TYPE;
    card.innerHTML = `
      <span class="registration-icon">🥊</span>
      <strong class="r9i-card-accent">9ROUND面接案内</strong>
      <small>候補抽出・Gmail下書き作成</small>
    `;
    card.onclick = function () {
      if (typeof window.showRegistration === "function") {
        window.showRegistration(VIEW_TYPE);
      }
    };
    grid.appendChild(card);
  }

  function installManager_() {
    if (q(`#${MANAGER_ID}`)) return;
    const placeholder = q("#registrationPlaceholder");
    if (!placeholder || !placeholder.parentNode) return;
    const section = document.createElement("section");
    section.id = MANAGER_ID;
    section.className = "manager card is-hidden";
    section.innerHTML = `
      <div class="r9i-shell">
        <div class="r9i-head">
          <div>
            <p class="eyebrow">9ROUND RECRUITING</p>
            <h2>ONLINE面接案内</h2>
            <p>The Forest Gymの勤務シフトと既存予定から、11:00〜20:00内の候補を4日分抽出します。</p>
          </div>
          <div class="r9i-sender">下書き保存先：9round.ariosoga@gmail.com</div>
        </div>

        <form id="round9InterviewForm" novalidate>
          <div class="r9i-grid">
            <label class="r9i-field">
              <span>応募者氏名</span>
              <input id="round9InterviewName" autocomplete="name" placeholder="例：山田 太一" required>
            </label>
            <label class="r9i-field">
              <span>メールアドレス</span>
              <input id="round9InterviewEmail" type="email" autocomplete="email" placeholder="example@gmail.com" required>
            </label>
          </div>

          <div class="r9i-candidate-head">
            <div>
              <h3>面接候補</h3>
              <p>各候補は30分以上、4つの異なる日付で指定してください。日時は直接修正できます。</p>
            </div>
            <div class="r9i-search">
              <label class="r9i-field">
                <span>候補開始日</span>
                <input id="round9InterviewStartDate" type="date" required>
              </label>
              <button id="round9InterviewReload" class="ghost-button" type="button">候補を再取得</button>
            </div>
          </div>

          <div id="round9InterviewCandidates" class="r9i-candidates"></div>

          <div class="r9i-note">
            <strong>動作：</strong>候補日時は川上一郎さん（KAWAKAMI）のYACHIYO勤務シフト内に限定し、Googleカレンダーの既存予定と重なる時間を除外します。メールは自動送信されません。<br>
            <strong>Indeed自動下書き：</strong><span id="round9InterviewAutomationStatus">確認中…</span>
          </div>

          <div id="round9InterviewMessage" class="r9i-message is-hidden"></div>

          <div class="r9i-actions">
            <button id="round9InterviewPreview" class="ghost-button" type="submit">案内文を確認</button>
            <button id="round9InterviewCreate" class="primary-button" type="button" disabled>9ROUNDのGmail下書きを作成</button>
          </div>
        </form>

        <div id="round9InterviewPreviewBox" class="r9i-preview is-hidden">
          <div class="r9i-preview-head">
            <strong id="round9InterviewPreviewSubject"></strong>
            <small id="round9InterviewPreviewMeta"></small>
          </div>
          <pre id="round9InterviewPreviewBody"></pre>
        </div>
      </div>
    `;
    placeholder.parentNode.insertBefore(section, placeholder);
    q("#round9InterviewStartDate").value = tomorrowYmd_();
    renderCandidates_([]);
    bindEvents_();
  }

  function wrapRegistration_() {
    if (window.__ANAUTS_ROUND9_INTERVIEW_WRAPPED__) return;
    if (typeof window.showRegistration !== "function") return;
    const original = window.showRegistration;
    window.showRegistration = async function (type) {
      const manager = q(`#${MANAGER_ID}`);
      if (manager) manager.classList.add("is-hidden");
      if (type !== VIEW_TYPE) return original.apply(this, arguments);
      if (typeof window.hasPermission === "function" && !window.hasPermission("ADMIN", "MANAGER")) return;
      ["#staffManager", "#shiftManager", "#serviceManager", "#serviceHoursManager", "#presenceManager", "#registrationPlaceholder"]
        .forEach(function (selector) { q(selector)?.classList.add("is-hidden"); });
      manager?.classList.remove("is-hidden");
      await loadAutomationStatus_();
      if (!loadedOnce) await loadCandidates_();
    };
    window.__ANAUTS_ROUND9_INTERVIEW_WRAPPED__ = true;
  }

  function bindEvents_() {
    q("#round9InterviewReload")?.addEventListener("click", loadCandidates_);
    q("#round9InterviewForm")?.addEventListener("submit", previewDraft_);
    q("#round9InterviewCreate")?.addEventListener("click", createDraft_);
    q("#round9InterviewForm")?.addEventListener("input", invalidatePreview_);
  }

  function renderCandidates_(rows) {
    const box = q("#round9InterviewCandidates");
    if (!box) return;
    const candidates = Array.isArray(rows) ? rows.slice(0, 4) : [];
    while (candidates.length < 4) candidates.push({});
    box.innerHTML = candidates.map(function (candidate, index) {
      const windows = Array.isArray(candidate.available_windows)
        ? candidate.available_windows.map(function (windowRow) {
            return `${windowRow.start_time}〜${windowRow.end_time}`;
          }).join("／")
        : "";
      return `
        <div class="r9i-candidate" data-r9i-index="${index}">
          <span class="r9i-mark">${marks[index]}</span>
          <input class="r9i-date" type="date" value="${escapeHtml_(candidate.date || "")}" aria-label="候補${index + 1}の日付" required>
          <input class="r9i-start" type="time" min="11:00" max="19:30" step="900" value="${escapeHtml_(candidate.start_time || "")}" aria-label="候補${index + 1}の開始時刻" required>
          <span class="r9i-candidate-separator">〜</span>
          <input class="r9i-end" type="time" min="11:30" max="20:00" step="900" value="${escapeHtml_(candidate.end_time || "")}" aria-label="候補${index + 1}の終了時刻" required>
          <small class="r9i-window-note">${windows ? `この日の空き時間：${escapeHtml_(windows)}` : "日付・時間を入力してください。"}</small>
        </div>
      `;
    }).join("");
  }

  function collectPayload_() {
    const candidates = Array.from(document.querySelectorAll("#round9InterviewCandidates .r9i-candidate"))
      .map(function (row) {
        return {
          date: row.querySelector(".r9i-date")?.value || "",
          start_time: row.querySelector(".r9i-start")?.value || "",
          end_time: row.querySelector(".r9i-end")?.value || ""
        };
      });
    return {
      applicant_name: q("#round9InterviewName")?.value.trim() || "",
      email: q("#round9InterviewEmail")?.value.trim() || "",
      candidates: candidates
    };
  }

  function payloadSignature_(payload) {
    return JSON.stringify({
      applicant_name: payload.applicant_name,
      email: payload.email.toLowerCase(),
      candidates: payload.candidates
    });
  }

  function validateClient_(payload) {
    if (!payload.applicant_name) throw new Error("応募者氏名を入力してください。");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      throw new Error("応募者のメールアドレスを確認してください。");
    }
    if (payload.candidates.length !== 4 || payload.candidates.some(function (row) {
      return !row.date || !row.start_time || !row.end_time;
    })) {
      throw new Error("面接候補を4日分すべて入力してください。");
    }
    if (new Set(payload.candidates.map(function (row) { return row.date; })).size !== 4) {
      throw new Error("面接候補は4つの異なる日付で指定してください。");
    }
  }

  async function loadCandidates_() {
    const manager = q(`#${MANAGER_ID}`);
    const startDate = q("#round9InterviewStartDate")?.value || tomorrowYmd_();
    setBusy_(true);
    setMessage_("勤務シフトとカレンダーを確認しています…", "");
    try {
      const response = await window.apiGet("get9RoundInterviewCandidates", { start_date: startDate });
      const data = response.data || {};
      renderCandidates_(data.candidates || []);
      loadedOnce = true;
      invalidatePreview_();
      if ((data.candidates || []).length < 4) {
        setMessage_(data.warning || "4日分の候補を取得できませんでした。", "warning");
      } else {
        setMessage_("4日分の候補を取得しました。氏名・メールアドレスを入力して案内文をご確認ください。", "");
      }
    } catch (error) {
      renderCandidates_([]);
      setMessage_(error.message || "面接候補を取得できませんでした。", "error");
    } finally {
      manager?.classList.remove("r9i-loading");
      setBusy_(false);
    }
  }

  async function loadAutomationStatus_() {
    const node = q("#round9InterviewAutomationStatus");
    if (!node) return;
    node.textContent = "確認中…";
    try {
      const response = await window.apiGet("get9RoundInterviewAutomationStatus");
      const data = response.data || {};
      node.textContent = data.enabled
        ? `有効（@indeedemail.com の新着を約${data.interval_minutes || 5}分ごとに確認し、9ROUNDへ下書き保存）`
        : "未設定（GASで自動処理の初期設定が必要です）";
    } catch (_) {
      node.textContent = "状態を確認できませんでした";
    }
  }

  async function previewDraft_(event) {
    event.preventDefault();
    const payload = collectPayload_();
    try {
      validateClient_(payload);
      setBusy_(true);
      setMessage_("候補日時を再確認し、案内文を作成しています…", "");
      const response = await window.apiPost(Object.assign({
        action: "preview9RoundInterviewDraft"
      }, payload));
      const data = response.data || {};
      q("#round9InterviewPreviewSubject").textContent = `件名：${data.subject || ""}`;
      q("#round9InterviewPreviewMeta").textContent = `宛先：${data.to || payload.email}／下書き保存先：${data.sender || "9round.ariosoga@gmail.com"}`;
      q("#round9InterviewPreviewBody").textContent = data.body || "";
      q("#round9InterviewPreviewBox").classList.remove("is-hidden");
      previewSignature = payloadSignature_(payload);
      q("#round9InterviewCreate").disabled = false;
      setMessage_("案内文を確認しました。問題なければGmail下書きを作成してください。", "");
      q("#round9InterviewPreviewBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      invalidatePreview_();
      setMessage_(error.message || "案内文を作成できませんでした。", "error");
    } finally {
      setBusy_(false);
    }
  }

  async function createDraft_() {
    const payload = collectPayload_();
    try {
      validateClient_(payload);
      if (!previewSignature || previewSignature !== payloadSignature_(payload)) {
        throw new Error("入力内容が変更されています。もう一度「案内文を確認」を押してください。");
      }
      setBusy_(true);
      setMessage_("9ROUNDのGmail下書きを作成しています…", "");
      const response = await window.apiPost(Object.assign({
        action: "create9RoundInterviewDraft",
        request_id: requestId
      }, payload));
      const data = response.data || {};
      q("#round9InterviewCreate").disabled = true;
      setMessage_(
        data.duplicate
          ? "同じ操作で作成済みのGmail下書きを確認しました。メールは自動送信されていません。"
          : "9round.ariosoga@gmail.com にGmail下書きを作成しました。メールは自動送信されていません。",
        ""
      );
      previewSignature = "";
      requestId = makeRequestId_();
    } catch (error) {
      setMessage_(error.message || "Gmail下書きを作成できませんでした。", "error");
    } finally {
      setBusy_(false);
    }
  }

  function invalidatePreview_() {
    previewSignature = "";
    const createButton = q("#round9InterviewCreate");
    if (createButton) createButton.disabled = true;
    q("#round9InterviewPreviewBox")?.classList.add("is-hidden");
  }

  function setBusy_(busy) {
    const manager = q(`#${MANAGER_ID}`);
    manager?.classList.toggle("r9i-loading", !!busy);
    ["#round9InterviewReload", "#round9InterviewPreview", "#round9InterviewCreate"]
      .forEach(function (selector) {
        const button = q(selector);
        if (!button) return;
        if (selector === "#round9InterviewCreate" && !busy) {
          button.disabled = !previewSignature;
        } else {
          button.disabled = !!busy;
        }
      });
  }

  function setMessage_(message, type) {
    const box = q("#round9InterviewMessage");
    if (!box) return;
    box.textContent = message || "";
    box.classList.toggle("is-hidden", !message);
    box.classList.toggle("is-error", type === "error");
    box.classList.toggle("is-warning", type === "warning");
  }

  function boot_() {
    installStyle_();
    installCard_();
    installManager_();
    wrapRegistration_();
  }

  boot_();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot_, { once: true });
  }
})();
