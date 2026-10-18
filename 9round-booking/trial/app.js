(function () {
  "use strict";
  const q = function (id) { return document.getElementById(id); };
  const api = window.NineRoundBookingApi;
  const state = { schedule: null, date: "", slot: null, week: 0, busy: false, request: "", submission: "", application: null };
  let loadSequence = 0;
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  function dateObject(date) { return new Date(date + "T12:00:00+09:00"); }
  function shortDate(date) { const d = dateObject(date); return (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日（" + weekdays[d.getUTCDay()] + "）"; }
  function addDays(date, n) { return new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function notice(text, error) { q("notice").textContent = text || ""; q("notice").hidden = !text; q("notice").classList.toggle("is-error", !!error); }
  function step(n) { document.querySelectorAll("[data-step]").forEach(function (el) { el.classList.toggle("is-current", Number(el.dataset.step) === n); }); }
  function setBusy(value) {
    state.busy = value;
    q("submitBooking").disabled = value || !state.slot;
    q("detailsFields").disabled = value || !state.slot;
    q("previousWeek").disabled = value || !state.schedule || state.week === 0;
    q("nextWeek").disabled = value || !state.schedule || addDays(state.schedule.range.from, (state.week + 1) * 7) > state.schedule.range.to;
    q("reloadSchedule").disabled = value;
    ["changeBooking", "cancelBooking", "closeChange"].forEach(function (id) { q(id).disabled = value; });
    q("bookingLayout").setAttribute("aria-busy", String(value));
  }
  function beginFeedback(title, text) {
    q("feedbackTitle").textContent = title; q("feedbackText").textContent = text || "";
    q("feedbackIcon").classList.remove("is-complete"); q("feedbackIcon").textContent = "";
    q("feedbackClose").hidden = true; q("feedback").dataset.state = "pending";
    if (!q("feedback").open) q("feedback").showModal();
  }
  function finishFeedback(title, text, error) {
    q("feedbackTitle").textContent = title; q("feedbackText").textContent = text || "";
    q("feedbackIcon").classList.add("is-complete"); q("feedbackIcon").textContent = error ? "!" : "✓";
    q("feedbackClose").hidden = false; q("feedback").dataset.state = error ? "error" : "success";
  }
  function errorMessage(error) { return ["ACTION_NOT_FOUND", "BOOKING_DISABLED", "BOOKING_CONFIGURATION", "TRIAL_DISABLED", "TRIAL_CONFIGURATION"].indexOf(error.code) >= 0 ? "現在、無料体験予約の準備中です。" : error.message || "処理を完了できませんでした。"; }
  function slotButton(slot, forChange) {
    const button = node("button", "slot-button" + (!forChange && state.slot && state.slot.slot_id === slot.slot_id ? " is-selected" : ""));
    button.type = "button"; button.disabled = !slot.available || state.busy || (forChange && slot.remaining < state.application.party_size);
    button.dataset.slotId = slot.slot_id;
    if (forChange) button.append(node("span", "", shortDate(slot.date)));
    button.append(node("strong", "", slot.start_time), node("span", "", slot.closed ? "受付停止" : slot.available ? "残り" + slot.remaining + "名 · 無料" : slot.remaining ? "受付終了" : "満員"), node("i", "", state.slot && state.slot.slot_id === slot.slot_id && !forChange ? "✓" : "↗"));
    button.addEventListener("click", function () { if (state.busy) return; if (forChange) mutate(false, slot); else chooseSlot(slot); });
    return button;
  }
  function renderSchedule() {
    if (!state.schedule) return;
    const from = addDays(state.schedule.range.from, state.week * 7), to = addDays(from, 6) > state.schedule.range.to ? state.schedule.range.to : addDays(from, 6);
    q("weekLabel").textContent = shortDate(from).replace(/（.）/, "") + " — " + shortDate(to).replace(/（.）/, "");
    q("dateStrip").replaceChildren();
    for (let i = 0; i < 7; i++) {
      const date = addDays(from, i), d = dateObject(date), offered = state.schedule.slots.filter(function (s) { return s.date === date; });
      const available = offered.some(function (s) { return s.available; });
      const button = node("button", "date-button" + (date === state.date ? " is-selected" : ""));
      button.type = "button"; button.disabled = state.busy || date > state.schedule.range.to || !offered.length;
      button.setAttribute("aria-label", shortDate(date) + (available ? " 予約可能" : " 予約可能な体験枠なし"));
      button.setAttribute("aria-pressed", String(date === state.date)); button.dataset.date = date;
      button.append(node("span", "", weekdays[d.getUTCDay()]), node("strong", "", String(d.getUTCDate())), node("i", "", available ? "○" : "—"));
      button.addEventListener("click", function () { if (!state.busy) { state.date = date; renderSchedule(); } });
      q("dateStrip").append(button);
    }
    q("selectedDateLabel").textContent = state.date ? shortDate(state.date) + " の体験枠" : "日時を選択してください";
    q("slots").replaceChildren();
    const slots = state.schedule.slots.filter(function (s) { return s.date === state.date; });
    if (!slots.length) q("slots").append(node("p", "empty-state", "この日に受付中の体験枠はありません。別の日付をお選びください。"));
    slots.forEach(function (slot) { q("slots").append(slotButton(slot, false)); });
    setBusy(state.busy);
  }
  function chooseSlot(slot) {
    state.slot = slot;
    q("selection").replaceChildren();
    const content = node("div"); content.append(node("p", "", shortDate(slot.date)), node("strong", "", slot.start_time + " 開始"));
    q("selection").append(node("span", "selection-icon", "✓"), content);
    q("detailsFields").disabled = false; q("submitBooking").disabled = false;
    q("partySize").options[1].disabled = slot.remaining < 2;
    if (Number(q("partySize").value) > slot.remaining) { q("partySize").value = "1"; syncParty(); }
    step(2); notice(""); renderSchedule();
  }
  async function loadSchedule(keepSelection) {
    const own = ++loadSequence; q("reloadSchedule").disabled = true;
    try {
      const data = await api("get9RoundTrialSlots", {});
      if (own !== loadSequence) return;
      state.schedule = data;
      if (!keepSelection || !state.date) {
        const first = data.slots.find(function (s) { return s.available; }) || data.slots[0];
        state.date = first ? first.date : data.range.from;
        state.week = Math.floor(daysBetween(data.range.from, state.date) / 7);
      }
      if (state.slot) {
        const next = data.slots.find(function (s) { return s.slot_id === state.slot.slot_id; });
        if (!next || !next.available) {
          state.slot = null; q("detailsFields").disabled = true;
          q("selection").replaceChildren(node("p", "", "空き状況が変わりました。日時を選び直してください。"));
        } else state.slot = next;
      }
      renderSchedule();
    } catch (error) {
      if (own !== loadSequence) return;
      q("slots").replaceChildren(node("p", "empty-state", errorMessage(error))); q("weekLabel").textContent = "スケジュールを取得できませんでした";
      notice(errorMessage(error), true);
    } finally { if (own === loadSequence) setBusy(state.busy); }
  }
  function syncParty() { const two = q("partySize").value === "2"; q("companionField").hidden = !two; q("companionName").required = two; }
  function collectDetails() {
    return { name: q("name").value.trim(), email: q("email").value.trim().toLowerCase(), phone: q("phone").value,
      party_size: Number(q("partySize").value), companion_name: q("partySize").value === "2" ? q("companionName").value.trim() : "",
      consent: q("consent").checked, website: q("website").value };
  }
  async function submitBooking(event) {
    event.preventDefault();
    if (state.busy || !state.slot || !q("applicationForm").reportValidity()) return;
    const details = collectDetails(), submission = JSON.stringify([details, state.slot.date, state.slot.slot_id]);
    // Reuse the same request after an uncertain network result, even if the user
    // selects the same slot again. Changed details start a separate submission.
    if (submission !== state.submission) { state.request = crypto.randomUUID(); state.submission = submission; }
    setBusy(true); notice(""); beginFeedback("予約しています…", shortDate(state.slot.date) + " " + state.slot.start_time + " 開始");
    try {
      const result = await api("create9RoundTrialBooking", Object.assign({}, details, {
        request_id: state.request, date: state.slot.date, slot_id: state.slot.slot_id }));
      renderResult(result);
      finishFeedback("体験予約が完了しました", result.notification_pending ? "予約は確定しています。確認メールは送信待ちです。" : "確認メールをお送りしました。");
    } catch (error) {
      finishFeedback(error.code ? "予約を完了できませんでした" : "予約結果を確認できませんでした", errorMessage(error) + (!error.code ? "\n同じ申込は再度押しても重複しません。確認メールもご確認ください。" : ""), true);
      if (["TRIAL_UNAVAILABLE", "TRIAL_FULL"].indexOf(error.code) >= 0) await loadSchedule(true);
    } finally { setBusy(false); }
  }
  function renderResult(result) {
    state.application = result;
    if (q("membershipLink")) q("membershipLink").href = "../membership/#" + new URLSearchParams({ application_id: result.application_id, trial_token: result.trial_token }).toString();
    q("bookingLayout").hidden = true; q("resultPanel").hidden = false; q("changePanel").hidden = true;
    step(3); notice("");
    const cancelled = result.status === "CANCELLED";
    q("resultTitle").textContent = cancelled ? "キャンセルが完了しました" : "体験予約が確定しています";
    q("resultDescription").textContent = cancelled ? "またのご予約をお待ちしています。" : "ご予約内容をご確認ください。当日のご来店をお待ちしています。";
    q("resultDetails").replaceChildren();
    const fields = [["ご予約日時", shortDate(result.date) + " " + result.start_time + " 開始"], ["お名前", result.name + " 様"], ["参加人数", result.party_size + "名"], ["体験料金", "無料（¥0）"], ["店舗", "9ROUND アリオ蘇我店"]];
    if (result.companion_name) fields.splice(3, 0, ["同行者", result.companion_name + " 様"]);
    fields.forEach(function (pair) { q("resultDetails").append(node("dt", "", pair[0]), node("dd", "", pair[1])); });
    q("resultMailNote").textContent = result.notification_pending ? "確認メールは送信待ちです。予約は確定しています。" : "確認メールの専用リンクからも変更・キャンセルできます。";
    q("resultActions").hidden = !result.can_cancel && !result.can_change;
    q("changeBooking").hidden = !result.can_change; q("cancelBooking").hidden = !result.can_cancel;
  }
  async function showChange() {
    if (state.busy || !state.application) return;
    setBusy(true); notice("");
    try {
      const data = await api("get9RoundTrialSlots", {});
      const available = data.slots.filter(function (s) { return s.available && s.remaining >= state.application.party_size && !(s.date === state.application.date && s.start_time === state.application.start_time); });
      q("changeSlots").replaceChildren();
      available.forEach(function (s) { q("changeSlots").append(slotButton(s, true)); });
      if (!available.length) q("changeSlots").append(node("p", "empty-state", "現在、変更できる体験枠はありません。"));
      q("changePanel").hidden = false;
    } catch (error) { notice(errorMessage(error), true); }
    finally { setBusy(false); q("changeSlots").querySelectorAll("button").forEach(function (b) { b.disabled = false; }); }
  }
  async function mutate(cancel, slot) {
    if (state.busy || !state.application) return;
    setBusy(true); notice("");
    beginFeedback(cancel ? "キャンセルしています。" : "予約を変更しています…", shortDate(state.application.date) + " " + state.application.start_time + " 開始");
    try {
      const result = await api(cancel ? "cancel9RoundTrialBooking" : "reschedule9RoundTrialBooking", Object.assign({ application_id: state.application.application_id, trial_token: state.application.trial_token }, slot ? { date: slot.date, slot_id: slot.slot_id } : {}));
      renderResult(result);
      finishFeedback(cancel ? "キャンセルが完了しました" : "体験日時を変更しました", result.notification_pending ? "確認メールは送信待ちです。" : "確認メールをお送りしました。");
    } catch (error) { finishFeedback("操作結果をご確認ください", errorMessage(error), true); }
    finally { setBusy(false); }
  }
  q("applicationForm").addEventListener("submit", submitBooking);
  q("partySize").addEventListener("change", syncParty);
  q("previousWeek").addEventListener("click", function () { if (!state.busy && state.week > 0) { state.week--; renderSchedule(); } });
  q("nextWeek").addEventListener("click", function () { if (!state.busy) { state.week++; renderSchedule(); } });
  q("reloadSchedule").addEventListener("click", function () { if (!state.busy) loadSchedule(true); });
  q("changeBooking").addEventListener("click", showChange);
  q("cancelBooking").addEventListener("click", function () { mutate(true); });
  q("closeChange").addEventListener("click", function () { if (!state.busy) q("changePanel").hidden = true; });
  q("feedbackClose").addEventListener("click", function () { if (!state.busy) q("feedback").close(); });
  q("feedback").addEventListener("cancel", function (event) { if (state.busy) event.preventDefault(); });
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  // Mail apps can reuse an already open tab with a fragment-only navigation.
  // Reload that explicit link so it is verified and immediately removed again.
  window.addEventListener("hashchange", function () { if (location.hash) location.reload(); });
  async function start() {
    if (fragment.has("application_id") || fragment.has("trial_token")) {
      setBusy(true); notice("ご予約内容を確認しています。");
      try { renderResult(await api("get9RoundTrialBooking", { application_id: fragment.get("application_id"), trial_token: fragment.get("trial_token") })); }
      catch (error) { notice(errorMessage(error), true); await loadSchedule(false); }
      finally { setBusy(false); }
    } else await loadSchedule(false);
  }
  start();
})();
