(function () {
  "use strict";
  const q = id => document.getElementById(id);
  const query = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : "");
  const bookingId = query.get("booking_id") || "";
  const mailToken = query.get("mail_token") || "";
  const intent = query.get("intent") || "";
  // Keep the mail secret out of browser history and URLs copied from this page.
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  const context = { booking_id: bookingId, mail_token: mailToken };
  let busy = false, booking = null, range = null, closed = false;

  function status(message, error) {
    const target = q("status");
    target.textContent = message || "";
    target.classList.toggle("error", !!error);
    target.hidden = !message;
  }
  function buttons(enabled) {
    ["cancelBooking", "chooseChange", "changeDate"].forEach(function (id) {
      q(id).disabled = !enabled;
    });
    document.querySelectorAll("#availableSlots button").forEach(function (button) {
      button.disabled = !enabled;
    });
  }
  function failed(error) {
    status(error.message || "処理を確認できませんでした。メールから開き直してください。", true);
  }
  async function request(action, payload) {
    return window.NineRoundBookingApi(action, Object.assign({}, context, payload || {}));
  }
  function setDateRange() {
    q("changeDate").min = range.from;
    q("changeDate").max = range.to;
    q("changeDate").value = booking.date >= range.from && booking.date <= range.to ? booking.date : range.from;
  }
  async function load() {
    if (!/^[a-f0-9]{64}$/.test(bookingId) || !/^[a-f0-9]{64}$/.test(mailToken)) {
      status("予約確認メールまたは管理通知メールのボタンから開き直してください。", true);
      return;
    }
    try {
      const data = await request("get9RoundMailBooking");
      booking = data.booking; range = data.range;
      q("reservation").hidden = false;
      q("reservationInfo").textContent = booking.member_name + " 様\n" +
        booking.date.replace(/-/g, "/") + " " + booking.start_time + " 開始";
      q("actions").hidden = !booking.can_cancel && !booking.can_change;
      q("cancelBooking").hidden = !booking.can_cancel;
      q("chooseChange").hidden = !booking.can_change;
      status(booking.status !== "CONFIRMED" ? "この予約はすでに変更・キャンセルされています。" :
        !booking.can_cancel ? "この予約は変更・キャンセルの締切を過ぎているか、受講済みです。" : "");
      if (booking.can_change) {
        setDateRange();
        if (intent === "change") await chooseChange();
      }
    } catch (error) {
      failed(error);
    }
  }
  async function chooseChange() {
    if (!booking || !booking.can_change || busy || closed) return;
    q("changeArea").hidden = false;
    q("chooseChange").hidden = true;
    await loadSlots();
  }
  async function loadSlots() {
    if (!booking || busy || closed || q("changeArea").hidden) return;
    const date = q("changeDate").value;
    if (!date || date < range.from || date > range.to) {
      status("予約可能な日付を選択してください。", true);
      return;
    }
    busy = true; buttons(false); status("空き枠を確認しています…");
    q("availableSlots").replaceChildren();
    try {
      const data = await request("get9RoundMailSlots", { date: date });
      const available = data.slots.filter(slot => slot.available);
      status(available.length ? "" : "選択した日付に予約可能な枠はありません。");
      if (!available.length) return;
      available.forEach(function (slot) {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = slot.start_time + " 開始へ変更";
        button.addEventListener("click", function () { changeBooking(date, slot); });
        q("availableSlots").appendChild(button);
      });
    } catch (error) { failed(error); }
    finally { busy = false; buttons(true); }
  }
  async function mutate(action, payload, completed) {
    if (busy || closed || !booking) return;
    busy = true; buttons(false); status("処理しています…");
    try {
      const data = await request(action, payload);
      closed = true;
      q("actions").hidden = true;
      q("changeArea").hidden = true;
      status(completed + (data.notification_pending ? "\n確認メールは送信待ちです。" : "\n確認メールをお送りしました。"));
    } catch (error) {
      failed(error);
      // Read-only refresh after an uncertain result; never automatically retry a mutation.
      try {
        const latest = await request("get9RoundMailBooking");
        if (!latest.booking.can_cancel) {
          closed = true;
          q("actions").hidden = true;
          q("changeArea").hidden = true;
          status("予約の状態が更新されました。確認メールをご確認ください。");
        }
      } catch (_) {}
    } finally { busy = false; buttons(!closed); }
  }
  async function changeBooking(date, slot) {
    if (closed || busy || !booking.can_change) return;
    await mutate("reschedule9RoundMailBooking", { date: date, slot_id: slot.slot_id },
      date.replace(/-/g, "/") + " " + slot.start_time + " 開始へ予約を変更しました。");
  }
  q("cancelBooking").addEventListener("click", function () {
    if (closed || busy || !booking || !booking.can_cancel) return;
    mutate("cancel9RoundMailBooking", {}, "予約をキャンセルしました。");
  });
  q("chooseChange").addEventListener("click", chooseChange);
  q("changeDate").addEventListener("change", loadSlots);
  load();
})();
