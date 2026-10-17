(function () {
  "use strict";
  const auth = window.NineRoundStaff, q = function (s) { return document.querySelector(s); };
  const config = window.ANAUTS_ROUND9_BOOKING || {}, query = new URLSearchParams(location.search);
  const wanted = config.initialBookingId || query.get("booking_id") || "", intent = config.initialIntent || query.get("intent") || "";
  let mounted = false, identity = "", sequence = 0, selected = null, busy = false;
  const actions = window.NineRoundBookingActions = { onUpdated: function () {}, mount: mount, reset: reset, open: open,
    authenticate: function () {
      if (!mounted) return;
      q("#nrManagedPanel").hidden = !auth.idToken || !auth.canManageBookings;
      if (!auth.idToken || !auth.canManageBookings || identity === String(auth.generation)) return;
      identity = String(auth.generation);
      if (wanted) open(wanted, intent);
    }
  };
  function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
  function reset() {
    sequence++; identity = ""; selected = null; busy = false;
    if (!mounted) return;
    q("#nrManagedPanel").hidden = true; q("#nrManagedPanel").open = false;
    q("#nrManagedContent").replaceChildren(); q("#nrManagedSlots").replaceChildren();
    q("#nrManagedMessage").textContent = ""; q("#nrManagedPicker").hidden = true;
    q("#nrManagedDate").value = ""; setBusy(false);
  }
  function current(seq, generation) { return seq === sequence && auth.generation === generation && !!auth.idToken && auth.canManageBookings; }
  function message(text) { q("#nrManagedMessage").textContent = text || ""; }
  function setBusy(value) {
    busy = value;
    q("#nrManagedPanel").querySelectorAll("button,input").forEach(function (b) { b.disabled = value || b.dataset.unavailable === "true"; });
    q("#nrManagedPanel").setAttribute("aria-busy", String(value));
  }
  function when(r) { return r.date.replace(/-/g, "/") + " " + r.start_time; }
  async function open(id, requestedIntent) {
    if (!auth.idToken || !auth.canManageBookings || busy) return;
    const seq = ++sequence, generation = auth.generation;
    selected = null; q("#nrManagedPanel").hidden = false; q("#nrManagedPanel").open = true;
    q("#nrManagedContent").replaceChildren(); q("#nrManagedSlots").replaceChildren(); q("#nrManagedPicker").hidden = true;
    setBusy(true); message("対象の予約を確認しています…");
    try {
      const data = await auth.request("get9RoundManagedBooking", { booking_id: id });
      if (!current(seq, generation)) return;
      selected = data.booking;
      q("#nrManagedContent").append(el("strong", selected.name + " 様"), el("p", "ファイター：" + (selected.fighter_name || "未登録")), el("p", when(selected)));
      const controls = el("div", undefined, "nr-member-actions");
      if (selected.can_change) {
        const change = el("button", "変更先を選ぶ"); change.type = "button";
        change.addEventListener("click", function () { if (!busy) { q("#nrManagedPicker").hidden = false; loadSlots(); } }); controls.append(change);
      }
      if (selected.can_cancel) {
        const cancel = el("button", "この予約をキャンセルする"); cancel.id = "nrManagedCancel"; cancel.type = "button";
        cancel.addEventListener("click", cancelBooking); controls.append(cancel);
      }
      q("#nrManagedContent").append(controls);
      q("#nrManagedDate").min = data.range.from; q("#nrManagedDate").max = data.range.to;
      q("#nrManagedDate").value = selected.date >= data.range.from && selected.date <= data.range.to ? selected.date : data.range.from;
      message(selected.status !== "CONFIRMED" ? "この予約はすでに取消・変更済みです。" : selected.attended ? "受講済みの予約です。" : !selected.can_cancel ? "変更・取消の締切を過ぎています。" : "対象の会員と予約をご確認のうえ、操作してください。");
      setBusy(false);
      if (requestedIntent === "change" && selected.can_change) { q("#nrManagedPicker").hidden = false; await loadSlots(); }
      if (current(seq, generation)) q("#nrManagedPanel").scrollIntoView({ block: "nearest" });
    } catch (error) { if (current(seq, generation)) message(error.message); }
    finally { if (current(seq, generation)) setBusy(false); }
  }
  async function loadSlots() {
    if (!selected || busy || !selected.can_change) return;
    const seq = sequence, generation = auth.generation, id = selected.booking_id, date = q("#nrManagedDate").value;
    q("#nrManagedSlots").replaceChildren(); setBusy(true);
    try {
      const data = await auth.request("get9RoundBookingBoard", { date: date });
      if (!current(seq, generation) || !selected || selected.booking_id !== id) return;
      data.slots.filter(function (s) { return s.kind === "DAILY"; }).forEach(function (slot) {
        const own = slot.members.some(function (m) { return m.member_no === selected.member_no; });
        const available = slot.available && !own;
        const button = el("button", slot.start_time + " · " + slot.booked_count + "/" + slot.capacity + "名" + (own ? " 予約済み" : slot.status === "BLOCKED" ? " 停止中" : ""));
        button.type = "button"; button.dataset.managedSlot = slot.slot_id; button.dataset.unavailable = String(!available); button.disabled = !available;
        button.addEventListener("click", function () { changeBooking(date, slot); }); q("#nrManagedSlots").append(button);
      });
    } catch (error) { if (current(seq, generation)) message(error.message); }
    finally { if (current(seq, generation)) setBusy(false); }
  }
  async function mutate(action, payload, done) {
    if (!selected || busy || !auth.canManageBookings) return;
    const seq = sequence, generation = auth.generation; setBusy(true); message("処理しています…");
    try {
      const result = await auth.request(action, payload);
      if (!current(seq, generation)) return;
      selected = null; q("#nrManagedContent").replaceChildren(); q("#nrManagedSlots").replaceChildren(); q("#nrManagedPicker").hidden = true;
      message(done + (result.notification_pending ? "確認メールは送信待ちです。" : "会員と管理者に確認メールをお送りしました。"));
      await actions.onUpdated();
    } catch (error) { if (current(seq, generation)) message(error.message); }
    finally { if (current(seq, generation)) setBusy(false); }
  }
  function cancelBooking() {
    if (!selected || busy || !selected.can_cancel) return;
    mutate("cancel9RoundManagedBooking", { booking_id: selected.booking_id }, "予約をキャンセルしました。");
  }
  function changeBooking(date, slot) {
    if (!selected || busy || !selected.can_change) return;
    mutate("reschedule9RoundManagedBooking", { booking_id: selected.booking_id, date: date, slot_id: slot.slot_id }, "予約を変更しました。");
  }
  function mount(parent) {
    if (mounted) return;
    mounted = true;
    const panel = el("details"); panel.id = "nrManagedPanel"; panel.className = "nr-managed"; panel.hidden = true;
    panel.innerHTML = '<summary>予約の変更・キャンセル</summary><p class="hint">変更・取消は開始1時間前までです。</p><div id="nrManagedContent"></div><div id="nrManagedMessage" class="nr-message" role="status" aria-live="polite"></div><div id="nrManagedPicker" hidden><label>変更先の日付<input id="nrManagedDate" type="date" required></label><div id="nrManagedSlots" class="nr-managed-slots"></div></div>';
    parent.insertBefore(panel, q("#nrAdminBoard"));
    q("#nrManagedDate").addEventListener("change", function () { if (q("#nrManagedDate").value) loadSlots(); });
  }
})();
