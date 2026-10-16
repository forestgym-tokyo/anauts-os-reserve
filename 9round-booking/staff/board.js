(function () {
  "use strict";
  const auth = window.NineRoundStaff;
  if (!auth) return;
  let built = false, requestSequence = 0, inFlight = false, board = [], currentIdentity = "";
  const q = function (s) { return document.querySelector(s); };
  function management() { return auth.canManage === true; }
  function eligible() { return !!auth.idToken; }
  function textElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function notice(text) { if (q("#nrAdminMessage")) q("#nrAdminMessage").textContent = text || ""; }
  async function request(action, payload) {
    if (!eligible()) throw new Error("9ROUNDスタッフとしてログインしてください。");
    // withAuth also honors the app's refreshed Firebase token.
    return auth.request(action, payload || {});
  }
  function resetData() {
    requestSequence++; inFlight = false; board = [];
    if (q("#nrAdminBoard")) q("#nrAdminBoard").replaceChildren();
    if (q("#nrTrialForm")) q("#nrTrialForm").reset();
    if (q("#nrTrialId")) q("#nrTrialId").value = "";
    if (q("#nrAdminReload")) q("#nrAdminReload").disabled = false;
    if (q("#nrTrialSave")) q("#nrTrialSave").disabled = false;
    if (built) setMutationBusy(false);
    notice("");
  }
  function syncAccess(initialData) {
    if (eligible()) build();
    const view = q("#nineRoundBookingView");
    if (!view) return;
    const identity = eligible() ? String(auth.generation) : "";
    if (identity !== currentIdentity) { resetData(); currentIdentity = identity; if (eligible()) newTrial(); }
    view.hidden = !eligible();
    q("#nrTrialEditor").hidden = !management();
    q("#nrBlockActions").hidden = !management();
    if (!eligible()) resetData();
    else if (initialData) render(initialData);
  }
  function render(data) {
    board = data.slots;
    const target = q("#nrAdminBoard");
    target.replaceChildren();
    board.forEach(function (slot) {
      const article = textElement("article", "nr-slot" + (slot.kind === "TRIAL" ? " is-trial" : ""));
      const header = textElement("div", "nr-slot-head");
      header.append(textElement("strong", "", slot.start_time + "–" + slot.end_time));
      header.append(textElement("span", "nr-count", slot.booked_count + " / " + slot.capacity + "名"));
      article.append(header, textElement("p", "nr-kind", slot.kind === "TRIAL" ? "体験 · " + slot.title + (slot.status === "CLOSED" ? "（受付停止）" : "") : "デイリーワークアウト" + (slot.status === "BLOCKED" ? "（ブロック中）" : "")));
      if (slot.members.length) {
        const names = textElement("ul", "nr-names");
        slot.members.forEach(function (member) {
          const li = textElement("li");
          li.append(textElement("span", "", member.name + " 様"), textElement("small", "", "会員番号 " + member.member_no));
          names.append(li);
        });
        article.append(names);
      } else article.append(textElement("p", "nr-empty", "予約はまだありません"));
      if (slot.kind === "TRIAL" && management()) {
        const edit = textElement("button", "", "体験枠を編集");
        edit.type = "button";
        edit.addEventListener("click", function () { editTrial(slot); });
        article.append(edit);
      } else if (slot.kind === "DAILY" && management()) {
        const block = textElement("button", "", slot.status === "BLOCKED" ? "ブロックを解除" : "予約受付をブロック");
        block.type = "button"; block.classList.toggle("nr-primary", slot.status === "BLOCKED");
        block.addEventListener("click", function () { setBlock([slot.slot_id], slot.status !== "BLOCKED"); });
        article.append(block);
      }
      target.append(article);
    });
  }
  async function setBlock(ids, blocked) {
    if (!management() || inFlight) return;
    if (!ids.length) { notice("先に対象日の予約を確認してください。"); return; }
    if (blocked && !window.confirm("予約受付をブロックします。すでに成立した予約は残ります。続けますか？")) return;
    inFlight = true; setMutationBusy(true);
    const ownStaff = auth.generation, ownSequence = ++requestSequence;
    const date = q("#nrAdminDate").value;
    q("#nrAdminBoard").querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    try {
      await request("set9RoundWorkoutBlock", { date: date, slot_ids: ids, blocked: blocked });
      if (ownSequence !== requestSequence || !eligible() || auth.generation !== ownStaff) return;
      notice(blocked ? "予約受付をブロックしました。既存の予約は維持されています。" : "ブロックを解除しました。");
      inFlight = false;
      await load(false);
    } catch (error) {
      if (ownSequence === requestSequence && eligible()) { notice(error.message); inFlight = false; await load(false); }
    } finally { inFlight = false; setMutationBusy(false); }
  }
  function setMutationBusy(value) {
    ["#nrAdminDate", "#nrAdminReload", "#nrBlockDay", "#nrUnblockDay", "#nrTrialSave", "#nrTrialNew"].forEach(function (s) { q(s).disabled = value; });
    q("#nrTrialForm").querySelectorAll("input,select").forEach(function (el) { el.disabled = value; });
  }
  async function load(clearNotice) {
    if (!eligible() || inFlight) return;
    const ownSequence = ++requestSequence, staff = auth.generation;
    board = [];
    q("#nrBlockDay").disabled = true; q("#nrUnblockDay").disabled = true;
    if (clearNotice) notice("");
    q("#nrAdminBoard").replaceChildren(textElement("p", "nr-empty", "予約を確認しています…"));
    q("#nrAdminReload").disabled = true;
    try {
      const data = await request("get9RoundBookingBoard", { date: q("#nrAdminDate").value });
      if (ownSequence !== requestSequence || !eligible() || auth.generation !== staff) return;
      render(data);
    } catch (error) {
      if (ownSequence !== requestSequence || !eligible()) return;
      q("#nrAdminBoard").replaceChildren(); notice(error.message);
    } finally {
      if (ownSequence === requestSequence) {
        q("#nrAdminReload").disabled = false;
        q("#nrBlockDay").disabled = false; q("#nrUnblockDay").disabled = false;
      }
    }
  }
  function newTrial() {
    q("#nrTrialForm").reset(); q("#nrTrialId").value = "";
    q("#nrTrialDate").value = q("#nrAdminDate").value;
    q("#nrTrialTitle").value = "体験";
    q("#nrTrialStart").value = "10:15"; q("#nrTrialCapacity").value = "1";
    q("#nrTrialSave").textContent = "体験枠を追加";
  }
  function editTrial(slot) {
    if (!management() || inFlight) return;
    q("#nrTrialEditor").open = true;
    q("#nrTrialId").value = slot.slot_id; q("#nrTrialTitle").value = slot.title;
    q("#nrTrialDate").value = slot.date; q("#nrTrialStart").value = slot.start_time;
    q("#nrTrialCapacity").value = String(slot.capacity); q("#nrTrialStatus").value = slot.status;
    q("#nrTrialSave").textContent = "体験枠を更新";
    q("#nrTrialEditor").scrollIntoView({ block: "nearest" });
  }
  async function saveTrial(event) {
    event.preventDefault();
    if (!management() || inFlight) return;
    inFlight = true;
    const ownStaff = auth.generation, ownSequence = ++requestSequence;
    const payload = { slot_id: q("#nrTrialId").value, title: q("#nrTrialTitle").value,
      date: q("#nrTrialDate").value, start_time: q("#nrTrialStart").value,
      capacity: Number(q("#nrTrialCapacity").value), status: q("#nrTrialStatus").value };
    setMutationBusy(true);
    q("#nrTrialSave").disabled = true; notice("");
    try {
      await request("save9RoundTrialSlot", payload);
      if (ownSequence !== requestSequence || !eligible() || auth.generation !== ownStaff) return;
      q("#nrAdminDate").value = payload.date;
      newTrial(); notice("体験枠を保存しました。"); inFlight = false; await load(false);
    } catch (error) { if (ownSequence === requestSequence && eligible()) notice(error.message); }
    finally { inFlight = false; setMutationBusy(false); }
  }
  function build() {
    if (built) return;
    built = true;
    const section = document.createElement("section");
    section.id = "nineRoundBookingView"; section.dataset.nineRoundBoard = "";
    section.innerHTML = [
      '<div class="page-heading"><div><p class="eyebrow">9ROUND ARIO SOGA</p><h1>9ROUND予約</h1><p>デイリーワークアウトの予約確認と体験枠の管理</p></div></div>',
      '<div class="nr-shell"><div class="nr-toolbar"><label>予約日<input id="nrAdminDate" type="date" required></label><button id="nrAdminReload" class="nr-primary" type="button">予約を確認</button></div>',
      '<div id="nrBlockActions" class="nr-toolbar"><button id="nrBlockDay" type="button">この日の全枠をブロック</button><button id="nrUnblockDay" type="button">この日の全枠を解除</button></div>',
      '<div id="nrAdminMessage" class="nr-message" role="status" aria-live="polite"></div><div id="nrAdminBoard" class="nr-board"></div>',
      '<details id="nrTrialEditor" class="nr-trial-editor"><summary>体験枠を作成・編集</summary>',
      '<p>デイリーワークアウトとは別の45分枠を追加します。定員は1〜4名です。</p>',
      '<form id="nrTrialForm"><input id="nrTrialId" type="hidden"><div class="nr-trial-fields">',
      '<label>体験枠名<input id="nrTrialTitle" maxlength="60" value="体験" required></label>',
      '<label>日付<input id="nrTrialDate" type="date" required></label>',
      '<label>開始時刻<input id="nrTrialStart" type="time" value="10:15" required></label>',
      '<label>定員<select id="nrTrialCapacity"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>',
      '<label>受付状態<select id="nrTrialStatus"><option value="OPEN">受付可能</option><option value="CLOSED">受付停止</option></select></label>',
      '</div><div class="nr-trial-actions"><button id="nrTrialSave" class="nr-primary" type="submit">体験枠を追加</button><button id="nrTrialNew" type="button">新規入力</button></div></form></details></div>'
    ].join("");
    q("#staffWorkspace").append(section);
    q("#nrAdminDate").value = window.NineRoundTokyoDate();
    newTrial();
    q("#nrAdminReload").addEventListener("click", function () { load(true); });
    q("#nrAdminDate").addEventListener("change", function () { if (q("#nrAdminDate").value) load(true); });
    q("#nrTrialForm").addEventListener("submit", saveTrial);
    q("#nrTrialNew").addEventListener("click", function () { if (!inFlight) newTrial(); });
    q("#nrBlockDay").addEventListener("click", function () { setBlock(board.filter(function (s) { return s.kind === "DAILY"; }).map(function (s) { return s.slot_id; }), true); });
    q("#nrUnblockDay").addEventListener("click", function () { setBlock(board.filter(function (s) { return s.kind === "DAILY"; }).map(function (s) { return s.slot_id; }), false); });
  }
  auth.onChange = syncAccess;
  syncAccess();
})();
