(() => {
  "use strict";

  if (window.__ANAUTS_COUNSELING_LINK_MANAGER__) return;
  window.__ANAUTS_COUNSELING_LINK_MANAGER__ = true;

  const escapeHtml = value => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  let candidates = [];
  let installed = false;

  function isManagementUser() {
    if (typeof state === "undefined" || !state?.authUser) return false;
    const permission = String(state.authUser.permission || "").toUpperCase();
    return permission === "ADMIN" || permission === "MANAGER";
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = `
      .counsel-link-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
      .counsel-link-summary{color:#cbd4cd;font-size:13px;line-height:1.7}
      .counsel-link-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:16px}
      .counsel-link-table{width:100%;min-width:860px;border-collapse:collapse}
      .counsel-link-table th,.counsel-link-table td{padding:13px 12px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;font-size:12px;vertical-align:middle}
      .counsel-link-table th{position:sticky;top:0;background:#151c17;color:#91a198;font-size:10px;letter-spacing:.06em;z-index:1}
      .counsel-link-table tr:last-child td{border-bottom:0}
      .counsel-link-table input[type=checkbox]{width:18px;height:18px;accent-color:#63d179}
      .counsel-link-status{display:inline-flex;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.08);font-size:10px;font-weight:800;white-space:nowrap}
      .counsel-link-status.is-sent{color:#79dc8c;background:rgba(99,209,121,.12)}
      .counsel-link-empty{padding:42px 20px;text-align:center;color:#91a198}
      .counsel-link-message{margin-bottom:14px;padding:12px 14px;border-radius:10px;background:rgba(99,209,121,.12);color:#9be6a8;font-size:12px;line-height:1.7}
      .counsel-link-message.is-error{background:rgba(255,102,102,.12);color:#ffabab}
      @media(max-width:700px){.counsel-link-toolbar .primary-button,.counsel-link-toolbar .ghost-button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function installUi() {
    if (installed) return;
    const nav = document.querySelector(".topnav");
    const main = document.querySelector("main.main");
    if (!nav || !main || typeof apiGet !== "function" || typeof apiPost !== "function") return;
    installed = true;
    injectStyle();

    const button = document.createElement("button");
    button.id = "counselingLinksNav";
    button.className = "nav-button is-hidden";
    button.type = "button";
    button.dataset.view = "counselingLinks";
    button.innerHTML = "<span>✉️</span>回答URL送信";
    nav.appendChild(button);

    const view = document.createElement("section");
    view.id = "counselingLinksView";
    view.className = "view";
    view.innerHTML = `
      <div class="page-heading">
        <div>
          <p class="eyebrow">DIET COUNSELING</p>
          <h1>回答URL送信</h1>
          <p>過去のダイエットカウンセリング申込者を確認し、専用回答URLを送信します。</p>
        </div>
      </div>
      <section class="manager card">
        <div id="counselingLinksMessage" class="counsel-link-message" hidden></div>
        <div class="counsel-link-toolbar">
          <div class="counsel-link-summary" id="counselingLinksSummary">対象者を読み込んでいます…</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="reloadCounselingLinks" class="ghost-button" type="button">再読み込み</button>
            <button id="sendCounselingLinks" class="primary-button" type="button">選択した方へ送信</button>
          </div>
        </div>
        <div class="counsel-link-table-wrap">
          <table class="counsel-link-table">
            <thead><tr>
              <th><input id="selectAllCounselingLinks" type="checkbox" aria-label="すべて選択"></th>
              <th>予約日時</th><th>氏名</th><th>メール</th><th>実施方法</th><th>送信</th><th>回答</th>
            </tr></thead>
            <tbody id="counselingLinksBody"></tbody>
          </table>
        </div>
      </section>
    `;
    main.appendChild(view);

    button.addEventListener("click", async () => {
      document.querySelectorAll(".nav-button").forEach(item => item.classList.toggle("is-active", item === button));
      document.querySelectorAll(".view").forEach(item => item.classList.toggle("is-active", item === view));
      await loadCandidates();
    });
    view.querySelector("#reloadCounselingLinks").addEventListener("click", loadCandidates);
    view.querySelector("#selectAllCounselingLinks").addEventListener("change", event => {
      view.querySelectorAll('tbody input[type="checkbox"]:not(:disabled)').forEach(input => {
        input.checked = event.target.checked;
      });
      updateSummary();
    });
    view.querySelector("#counselingLinksBody").addEventListener("change", updateSummary);
    view.querySelector("#sendCounselingLinks").addEventListener("click", sendSelected);
  }

  function showMessage(message, isError = false) {
    const el = document.querySelector("#counselingLinksMessage");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!isError);
  }

  function selectedIds() {
    return [...document.querySelectorAll('#counselingLinksBody input[type="checkbox"]:checked')]
      .map(input => input.value);
  }

  function updateSummary() {
    const summary = document.querySelector("#counselingLinksSummary");
    if (!summary) return;
    const unsent = candidates.filter(row => row.mail_status !== "送信済み").length;
    summary.textContent = `対象 ${candidates.length}件／未送信 ${unsent}件／選択中 ${selectedIds().length}件`;
  }

  function renderCandidates() {
    const body = document.querySelector("#counselingLinksBody");
    if (!body) return;
    if (!candidates.length) {
      body.innerHTML = '<tr><td colspan="7" class="counsel-link-empty">送信対象の予約はありません。</td></tr>';
      updateSummary();
      return;
    }

    body.innerHTML = candidates.map(row => {
      const sent = row.mail_status === "送信済み";
      const date = `${row.reservation_date || ""} ${row.start_time || ""}`.trim();
      return `<tr>
        <td><input type="checkbox" value="${escapeHtml(row.reservation_id)}" ${sent ? "disabled" : "checked"} aria-label="${escapeHtml(row.customer_name)}様を選択"></td>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(row.customer_name || "—")}</td>
        <td>${escapeHtml(row.customer_email)}</td>
        <td>${escapeHtml(row.consultation_method || "ONLINE")}</td>
        <td><span class="counsel-link-status ${sent ? "is-sent" : ""}">${escapeHtml(row.mail_status)}</span></td>
        <td><span class="counsel-link-status ${row.answer_status === "回答済み" ? "is-sent" : ""}">${escapeHtml(row.answer_status)}</span></td>
      </tr>`;
    }).join("");
    document.querySelector("#selectAllCounselingLinks").checked = false;
    updateSummary();
  }

  async function loadCandidates() {
    if (!isManagementUser()) return;
    showMessage("");
    const body = document.querySelector("#counselingLinksBody");
    if (body) body.innerHTML = '<tr><td colspan="7" class="counsel-link-empty">対象者を確認しています…</td></tr>';
    try {
      const result = await apiGet("getDietCounselingLinkCandidates");
      candidates = Array.isArray(result?.data?.candidates) ? result.data.candidates : [];
      renderCandidates();
    } catch (error) {
      candidates = [];
      renderCandidates();
      showMessage(error?.message || "対象者を取得できませんでした。", true);
    }
  }

  async function sendSelected() {
    const ids = selectedIds();
    if (!ids.length) {
      showMessage("送信対象を選択してください。", true);
      return;
    }
    const names = candidates.filter(row => ids.includes(row.reservation_id))
      .slice(0, 5).map(row => `${row.customer_name || "氏名未登録"}様`).join("、");
    const suffix = ids.length > 5 ? `ほか${ids.length - 5}件` : "";
    if (!window.confirm(`${ids.length}件へ専用回答URLを送信しますか？\n\n${names}${suffix}`)) return;

    const button = document.querySelector("#sendCounselingLinks");
    button.disabled = true;
    button.textContent = "送信中…";
    showMessage("");
    try {
      const result = await apiPost({
        action: "sendDietCounselingLinksBulk",
        reservation_ids: ids
      });
      const data = result.data || {};
      showMessage(`送信 ${data.sent_count || 0}件／スキップ ${data.skipped_count || 0}件／失敗 ${data.failed_count || 0}件`);
      await loadCandidates();
    } catch (error) {
      showMessage(error?.message || "送信できませんでした。", true);
    } finally {
      button.disabled = false;
      button.textContent = "選択した方へ送信";
    }
  }

  function syncPermission() {
    installUi();
    const button = document.querySelector("#counselingLinksNav");
    if (button) button.classList.toggle("is-hidden", !isManagementUser());
  }

  syncPermission();
  window.setInterval(syncPermission, 600);
})();
