(function () {
  "use strict";
  const q = function (s) { return document.querySelector(s); };
  const api = window.NineRoundBookingApi;
  const tools = window.NineRoundMemberTools;
  const fighter = window.NineRoundFighter;
  const bookingEndDate = window.NineRoundWorkoutEndDate || "2026-10-24";
  const storageKey = "nr_booking_session_v1";
  let token = "", challenge = "", busy = false, sequence = 0;
  let range = { from: window.NineRoundTokyoDate(), to: bookingEndDate };
  let lastDate = "", limitReached = false;
  let feedbackSlotId = "";
  function bookingFeedback(state, date, slot, title, note) {
    const dialog = q("#bookingFeedback"), pending = state === "pending";
    feedbackSlotId = slot.slot_id;
    dialog.dataset.state = state;
    q("#bookingFeedbackIcon").textContent = pending ? "" : state === "success" ? "✓" : "!";
    q("#bookingFeedbackTitle").textContent = title;
    q("#bookingFeedbackWhen").textContent = dayLabel(date, "short") + "\n" + slot.start_time + " 開始";
    q("#bookingFeedbackNote").textContent = note;
    q("#bookingFeedbackClose").hidden = pending;
    if (!dialog.open) { dialog.showModal(); document.body.classList.add("has-booking-feedback"); }
    q(pending ? "#bookingFeedbackTitle" : "#bookingFeedbackClose").focus({ preventScroll: true });
  }
  q("#bookingFeedbackClose").addEventListener("click", function () { q("#bookingFeedback").close(); });
  q("#bookingFeedback").addEventListener("cancel", function (event) {
    if (q("#bookingFeedback").dataset.state === "pending") event.preventDefault();
  });
  q("#bookingFeedback").addEventListener("close", function () {
    document.body.classList.remove("has-booking-feedback");
    const button = Array.from(document.querySelectorAll("[data-book]")).find(function (b) { return b.dataset.book === feedbackSlotId; });
    if (button) { const card = button.closest(".slot-card"); card.tabIndex = -1; card.focus({ preventScroll: true }); }
  });
  function message(text, error) {
    q("#message").hidden = !text;
    q("#message").textContent = text || "";
    q("#message").classList.toggle("is-error", !!error);
  }
  function saveSession(value) {
    token = value || "";
    try { if (token) sessionStorage.setItem(storageKey, token); else sessionStorage.removeItem(storageKey); } catch (_) {}
  }
  function authenticated(value) {
    document.body.classList.toggle("is-verified", value);
    q("#authPanel").hidden = value;
    q("#bookingPanel").hidden = !value;
    q("#stepVerify").removeAttribute("aria-current");
    q("#stepDate").removeAttribute("aria-current");
    q(value ? "#stepDate" : "#stepVerify").setAttribute("aria-current", "step");
    if (!value) { q("#bookingFeedback").close(); q("#slotList").replaceChildren(); q("#code").value = ""; q("#bookingLimitStatus").textContent = ""; limitReached = false; }
    window.NineRoundFighter.authenticate(value ? token : "");
    tools.authenticate(value ? token : "");
  }
  function handleError(error) {
    if (["SESSION_EXPIRED", "MEMBER_UNAVAILABLE"].includes(error.code)) {
      sequence++;
      saveSession("");
      authenticated(false);
      q("#emailForm").hidden = false;
      q("#codeForm").hidden = true;
    }
    message(error.message || "処理を完了できませんでした。", true);
  }
  function setBusy(value) {
    busy = value;
    tools.setBusy(value);
    q("#bookingPanel").setAttribute("aria-busy", String(value));
    ["#sendCode", "#verifyCode", "#changeEmail", "#bookingDate", "#reload", "#previousDate", "#nextDate"].forEach(function (s) { q(s).disabled = value; });
    if (!value) {
      const closed = window.NineRoundTokyoDate() > bookingEndDate;
      q("#bookingDate").disabled = closed;
      q("#previousDate").disabled = closed || q("#bookingDate").value <= range.from;
      q("#nextDate").disabled = closed || !!range.to && q("#bookingDate").value >= range.to;
    }
    updateBookingButtons();
    document.querySelectorAll("[data-cancel]").forEach(function (button) { button.disabled = value; });
  }
  function updateBookingButtons() {
    const needsFighter = !fighter.registered && !tools.changing;
    document.querySelectorAll("[data-book]").forEach(function (button) {
      button.disabled = busy || needsFighter || button.dataset.available !== "true";
    });
    q(".tap-guide").textContent = needsFighter
      ? "予約にはファイターネームの登録が必要です。上の登録欄で入力して保存してください。"
      : "空いている枠をタップすると予約が完了します。";
  }
  function dayLabel(date, weekday) {
    return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: weekday || "long" }).format(new Date(date + "T12:00:00+09:00"));
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function slotCard(slot) {
    const past = !slot.available && !slot.is_booked && !slot.blocked && slot.booked_count < slot.capacity;
    const full = slot.booked_count >= slot.capacity;
    const card = element("article", "slot-card" + (slot.is_booked ? " is-mine" : slot.blocked ? " is-blocked" : full ? " is-full" : past ? " is-past" : ""));
    const button = element("button", "slot-button");
    button.type = "button";
    button.dataset.book = slot.slot_id;
    button.dataset.available = String(slot.available && (!limitReached || !!tools.changing));
    button.disabled = button.dataset.available !== "true" || (!fighter.registered && !tools.changing);
    button.append(element("span", "slot-time", slot.start_time));
    const count = element("span", "slot-count", "予約済み");
    count.append(element("b", "", slot.booked_count + " / " + slot.capacity + "名"));
    button.append(count);
    const meter = element("span", "slot-meter");
    const fill = element("i");
    fill.style.width = Math.min(100, slot.booked_count / slot.capacity * 100) + "%";
    meter.setAttribute("aria-hidden", "true");
    meter.append(fill); button.append(meter);
    button.append(element("span", "slot-action", slot.attended ? "✓ 受講済み" : slot.is_booked ? "✓ 予約済み" : slot.blocked ? "受付停止" : full ? "満員" : past ? "受付終了" : tools.changing ? "この枠へ変更 →" : limitReached ? "未消化予約の上限" : "タップして予約 →"));
    button.addEventListener("click", function () { reserve(slot, button); });
    card.append(button);
    if (slot.can_cancel) {
      const cancel = element("button", "cancel-booking", "タップしてキャンセル →");
      cancel.type = "button"; cancel.dataset.cancel = slot.booking_id;
      cancel.addEventListener("click", function () { cancelBooking(slot, cancel); });
      card.append(cancel);
    }
    return card;
  }
  function renderSlots(data) {
    limitReached = data.outstanding_count >= data.booking_limit;
    q("#bookingLimitStatus").textContent = "未消化予約 " + data.outstanding_count + " / " + data.booking_limit + "コマ" + (limitReached ? "（上限に達しています。予約一覧から変更・取消できます）" : "");
    range = { from: data.range.from, to: data.range.to && data.range.to < bookingEndDate ? data.range.to : bookingEndDate };
    q("#bookingDate").min = range.from;
    q("#bookingDate").max = range.to;
    q("#dateHeading").textContent = dayLabel(data.date);
    q("#slotList").replaceChildren();
    [["MORNING", "午前 · 10:15–14:00", function (s) { return s.start_time < "14:00"; }],
      ["EVENING", "午後 · 16:15–20:45", function (s) { return s.start_time >= "16:15"; }]].forEach(function (group) {
      q("#slotList").append(element("h4", "period-heading", group[1]));
      const grid = element("div", "slot-grid");
      data.slots.filter(group[2]).forEach(function (s) { grid.append(slotCard(s)); });
      q("#slotList").append(grid);
    });
  }
  async function loadSlots(clearMessage) {
    if (!token) return;
    range.from = window.NineRoundTokyoDate();
    if (range.from > range.to) {
      sequence++;
      q("#bookingDate").value = "";
      q("#dateHeading").textContent = "暫定予約の受付は終了しました";
      q("#slotList").replaceChildren();
      q("#bookingLimitStatus").textContent = "";
      message("10月25日（日）以降はデジムからご予約ください。");
      setBusy(false);
      return;
    }
    const selected = q("#bookingDate").value;
    q("#bookingDate").value = !selected || selected < range.from ? range.from : selected > range.to ? range.to : selected;
    const ownSequence = ++sequence, ownToken = token, date = q("#bookingDate").value;
    setBusy(true);
    if (clearMessage) message("");
    q("#slotList").replaceChildren(element("p", "loading", "予約枠を確認しています…"));
    try {
      const data = await api("get9RoundWorkoutSlots", { session_token: ownToken, date: date });
      if (ownSequence !== sequence || token !== ownToken) return;
      lastDate = date;
      renderSlots(data);
    } catch (error) {
      if (ownSequence !== sequence || token !== ownToken) return;
      q("#slotList").replaceChildren(element("p", "loading", "枠を取得できませんでした。「再読込」からもう一度お試しください。"));
      handleError(error);
    } finally {
      if (ownSequence === sequence || !token) setBusy(false);
    }
  }
  async function reserve(slot, button) {
    if (busy || !token || !slot.available) return;
    if (window.NineRoundTokyoDate() > bookingEndDate || lastDate > bookingEndDate) return loadSlots(true);
    if (!tools.changing && !fighter.requireRegistration()) return;
    const ownToken = token, date = lastDate;
    const changing = tools.changing;
    setBusy(true); message("");
    button.closest(".slot-card").classList.add("is-submitting");
    button.setAttribute("aria-busy", "true");
    button.querySelector(".slot-action").textContent = changing ? "変更しています…" : "予約しています…";
    bookingFeedback("pending", date, slot, changing ? "予約を変更しています…" : "予約しています…", "そのままお待ちください。");
    try {
      const result = await api(changing ? "reschedule9RoundWorkoutBooking" : "create9RoundWorkoutBooking",
        { session_token: ownToken, date: date, slot_id: slot.slot_id, booking_id: changing ? changing.booking_id : undefined });
      if (token !== ownToken) return;
      tools.finishChange();
      bookingFeedback("success", date, slot, changing ? "予約を変更しました" : "予約が完了しました", result.notification_pending
        ? "予約は成立しています。\n確認メールは送信待ちです。"
        : "確認メールをお送りしました。\nご来店をお待ちしています！");
      message(dayLabel(date) + " " + slot.start_time + (changing ? " に予約を変更しました。" : " の予約が完了しました。") +
        (result.notification_pending ? "確認メールは送信待ちです。予約は成立しています。" : "確認メールをお送りしました。"));
      await Promise.all([loadSlots(false), tools.refresh()]);
    } catch (error) {
      if (token !== ownToken) return;
      handleError(error);
      if (token) bookingFeedback("error", date, slot, error.code ? "予約を完了できませんでした" : "予約結果を確認できませんでした", error.message +
        (error.code ? "" : "\n予約一覧・確認メールをご確認ください。"));
      // Capacity conflicts and uncertain responses must not leave stale cards enabled.
      if (token) await loadSlots(false);
    } finally { if (token === ownToken || !token) setBusy(false); }
  }
  async function cancelBooking(slot, button) {
    if (busy || !token) return;
    const ownToken = token, date = slot.date || lastDate;
    const originalText = button && button.textContent;
    setBusy(true); message("");
    if (button) {
      button.textContent = "キャンセルしています。";
      button.setAttribute("aria-busy", "true");
      const card = button.closest(".slot-card");
      if (card) card.classList.add("is-submitting");
    }
    bookingFeedback("pending", date, slot, "キャンセルしています。", "そのままお待ちください。");
    try {
      const result = await api("cancel9RoundWorkoutBooking", { session_token: ownToken, booking_id: slot.booking_id });
      if (token !== ownToken) return;
      if (tools.changing && tools.changing.booking_id === slot.booking_id) tools.finishChange();
      bookingFeedback("success", date, slot, "キャンセルが完了しました", result.notification_pending
        ? "キャンセルは完了しています。\n確認メールは送信待ちです。"
        : "キャンセル確認メールをお送りしました。");
      message("キャンセルが完了しました。" + (result.notification_pending ? "確認メールは送信待ちです。" : "キャンセル確認メールをお送りしました。"));
      await Promise.all([loadSlots(false), tools.refresh()]);
    } catch (error) {
      if (token !== ownToken) return;
      handleError(error);
      if (token) bookingFeedback("error", date, slot, error.code ? "キャンセルを完了できませんでした" : "キャンセル結果を確認できませんでした", error.message +
        (error.code ? "" : "\n予約一覧・確認メールで結果をご確認ください。"));
      if (token) await loadSlots(false);
    } finally {
      if (button && button.isConnected) { button.textContent = originalText; button.removeAttribute("aria-busy"); }
      if (token === ownToken || !token) setBusy(false);
    }
  }
  tools.onError = handleError;
  window.NineRoundFighter.onError = handleError;
  fighter.onChange = updateBookingButtons;
  tools.onMessage = message;
  tools.reload = function () { return loadSlots(false); };
  tools.cancel = cancelBooking;
  q("#emailForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); message("");
    q("#sendCode").textContent = "送信中…";
    try {
      const data = await api("request9RoundBookingCode", { email: q("#email").value.trim() });
      challenge = data.challenge_id;
      q("#emailForm").hidden = true; q("#codeForm").hidden = false;
      q("#codeGuide").textContent = data.message;
      q("#code").value = ""; q("#code").focus();
    } catch (error) { handleError(error); }
    finally { setBusy(false); q("#sendCode").textContent = "確認コードを送る →"; }
  });
  q("#codeForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); message(""); q("#verifyCode").textContent = "確認中…";
    try {
      const data = await api("verify9RoundBookingCode", { challenge_id: challenge, code: q("#code").value.trim() });
      saveSession(data.session_token);
      q("#code").value = ""; challenge = "";
      authenticated(true);
      await loadSlots(true);
    } catch (error) { handleError(error); }
    finally { setBusy(false); q("#verifyCode").textContent = "本人確認して予約へ →"; }
  });
  q("#changeEmail").addEventListener("click", function () {
    if (busy) return;
    challenge = ""; q("#codeForm").hidden = true; q("#emailForm").hidden = false; q("#code").value = ""; message(""); q("#email").focus();
  });
  q("#logout").addEventListener("click", async function () {
    const oldToken = token;
    sequence++; saveSession(""); authenticated(false); message("");
    q("#codeForm").hidden = true; q("#emailForm").hidden = false;
    q("#email").value = ""; setBusy(false);
    // Clear local identity immediately, even when the network is unavailable.
    if (oldToken) try { await api("logout9RoundBooking", { session_token: oldToken }); } catch (_) {}
  });
  q("#bookingDate").value = range.from <= range.to ? range.from : "";
  q("#bookingDate").min = range.from; q("#bookingDate").max = range.to;
  q("#bookingDate").addEventListener("change", function () { if (!busy && q("#bookingDate").value) loadSlots(true); });
  q("#reload").addEventListener("click", function () { if (!busy) Promise.all([loadSlots(true), tools.refresh(), fighter.refresh()]); });
  function moveDate(offset) {
    if (busy) return;
    const date = new Date(q("#bookingDate").value + "T12:00:00+09:00");
    date.setTime(date.getTime() + offset * 86400000);
    const value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    if (value < range.from || (range.to && value > range.to)) return;
    q("#bookingDate").value = value; loadSlots(true);
  }
  q("#previousDate").addEventListener("click", function () { moveDate(-1); });
  q("#nextDate").addEventListener("click", function () { moveDate(1); });
  try { token = sessionStorage.getItem(storageKey) || ""; } catch (_) {}
  authenticated(!!token);
  if (token) loadSlots(true);
  else if (!(window.ANAUTS_ROUND9_BOOKING || {}).apiUrl) message("現在、予約受付の準備中です。");
})();

