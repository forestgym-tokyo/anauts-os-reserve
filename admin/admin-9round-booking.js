/**
 * Read-only A-nauts integration. The independent booking service owns all
 * reservations and management operations. This addon only calls the board API.
 */
(function () {
  "use strict";
  if (typeof state === "undefined" || typeof window.NineRoundBookingApi !== "function") return;
  let sequence = 0, identity = "", built = false;
  const q = function (s) { return document.querySelector(s); };
  function eligible() {
    if (!state.authUser || !state.idToken || state.authUser.active === false) return false;
    const role = String(state.authUser.permission || "").toUpperCase();
    return ["ADMIN", "MANAGER"].includes(role) || (role === "STAFF" &&
      (String(state.authUser.store_code || "").toUpperCase() === "SOGA" || state.authUser.can_9round === true));
  }
  function el(tag, className, text) {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function clear() { sequence++; if (q("#nrAppSlots")) q("#nrAppSlots").replaceChildren(); if (q("#nrAppMessage")) q("#nrAppMessage").textContent = ""; if (q("#nrAppReload")) q("#nrAppReload").disabled = false; }
  function sync() {
    if (eligible()) build();
    const panel = q("#nrAppBoard"); if (!panel) return;
    const nextIdentity = eligible() ? state.authUser.staff_code + ":" + state.authUser.permission : "";
    if (identity !== nextIdentity) { clear(); panel.open = false; identity = nextIdentity; }
    panel.hidden = !eligible();
  }
  function render(data) {
    const target = q("#nrAppSlots"); target.replaceChildren();
    data.slots.forEach(function (slot) {
      const card = el("article", "nr-slot" + (slot.kind === "TRIAL" ? " is-trial" : ""));
      const header = el("div", "nr-slot-head");
      header.append(el("strong", "", slot.start_time), el("span", "nr-count", slot.booked_count + " / " + slot.capacity + "名"));
      card.append(header, el("p", "nr-kind", (slot.kind === "TRIAL" ? "体験 · " + slot.title : "デイリーワークアウト") +
        (["BLOCKED", "CLOSED"].includes(slot.status) ? "（受付停止）" : "")));
      const names = el("ul", "nr-names");
      slot.members.forEach(function (member) { const li = el("li"); li.append(el("span", "", member.name + " 様"), el("small", "", "ファイター：" + (member.fighter_name || "未登録"))); names.append(li); });
      card.append(names);
      if (!slot.members.length) card.append(el("p", "nr-empty", "予約はまだありません"));
      target.append(card);
    });
  }
  async function load() {
    if (!eligible() || !q("#nrAppDate").value) return;
    const ownSequence = ++sequence, ownIdentity = identity;
    q("#nrAppMessage").textContent = "予約を確認しています…";
    q("#nrAppSlots").replaceChildren(); q("#nrAppReload").disabled = true;
    try {
      const data = await window.NineRoundBookingApi("get9RoundBookingBoard", withAuth({ date: q("#nrAppDate").value }));
      if (ownSequence !== sequence || ownIdentity !== identity || !eligible()) return;
      render(data); q("#nrAppMessage").textContent = "";
    } catch (error) {
      if (ownSequence === sequence && eligible()) q("#nrAppMessage").textContent = error.message;
    } finally { if (ownSequence === sequence) q("#nrAppReload").disabled = false; }
  }
  function build() {
    const parent = q("#monthlyScheduleView");
    if (built || !parent) return;
    built = true;
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "../9round-booking/staff/styles.css?v=20261017"; document.head.append(css);
    const panel = document.createElement("details"); panel.id = "nrAppBoard"; panel.dataset.nineRoundBoard = "";
    panel.className = "nr-shell"; panel.style.marginBottom = "20px";
    panel.innerHTML = '<summary style="cursor:pointer;min-height:44px;font-weight:800">9ROUND ワークアウト予約状況</summary>' +
      '<div class="nr-toolbar"><label>予約日<input id="nrAppDate" type="date" required></label><button id="nrAppReload" class="nr-primary" type="button">予約を確認</button></div>' +
      '<div id="nrAppMessage" class="nr-message" role="status" aria-live="polite"></div><div id="nrAppSlots" class="nr-board"></div>';
    const heading = parent.querySelector(".page-heading");
    if (heading) heading.after(panel); else parent.prepend(panel);
    q("#nrAppDate").value = window.NineRoundTokyoDate();
    q("#nrAppDate").addEventListener("change", load); q("#nrAppReload").addEventListener("click", load);
    panel.addEventListener("toggle", function () { if (panel.open) load(); });
  }
  const originalApply = applyPermissionUi;
  applyPermissionUi = function () { const result = originalApply.apply(this, arguments); sync(); return result; };
  const originalLogout = logout;
  logout = function () { clear(); const result = originalLogout.apply(this, arguments); sync(); return result; };
  q("#logoutButton")?.addEventListener("click", function () { clear(); sync(); });
  // The monthly view may be created by an earlier addon after its async boot.
  const observer = new MutationObserver(function () { if (!built && eligible()) sync(); });
  observer.observe(q("main.main") || document.body, { childList: true });
  sync();
  if (built) observer.disconnect();
})();
