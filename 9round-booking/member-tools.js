(function () {
  "use strict";
  const q = function (s) { return document.querySelector(s); };
  const api = window.NineRoundBookingApi;
  const config = window.ANAUTS_ROUND9_BOOKING || {};
  const query = new URLSearchParams(window.location.search);
  const wanted = config.initialBookingId || query.get("booking_id") || "";
  const intent = config.initialIntent || query.get("intent") || "";
  let token = "", sequence = 0, qrSequence = 0, busy = false, qrBusy = false, intentHandled = false;
  let bookings = [], changing = null;
  const tools = window.NineRoundMemberTools = {
    onError: function () {}, onMessage: function () {}, reload: function () {}, cancel: function () {},
    get changing() { return changing; },
    setBusy: function (value) { busy = value; syncButtons(); q("#changeAbort").disabled = value; },
    authenticate: function (value) {
      if (token === value) return;
      token = value; sequence++; qrSequence++; bookings = []; changing = null; qrBusy = false; intentHandled = false;
      q("#myBookings").replaceChildren(); q("#memberQrCanvas").width = 1; q("#memberQrCanvas").height = 1;
      q("#qrStatus").textContent = ""; q("#qrSave").hidden = true; q("#qrSave").removeAttribute("href"); syncChange();
      if (token) { refresh(); displayPass(false); }
    },
    refresh: refresh,
    finishChange: function () { changing = null; syncChange(); }
  };
  function element(tag, className, text) {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text !== undefined) el.textContent = text; return el;
  }
  function when(r) { return r.date.replace(/-/g, "/") + " " + r.start_time; }
  function syncButtons() {
    document.querySelectorAll("[data-member-action]").forEach(function (b) { b.disabled = busy || qrBusy; });
  }
  function syncChange() {
    q("#changeBookingBanner").hidden = !changing;
    q("#changeBookingText").textContent = changing ? when(changing) + " から変更します。変更先の日時と枠を選んでください。" : "";
    q("#changeAbort").disabled = busy;
  }
  function startChange(r, fromMail) {
    // Initial slot loading may still be in flight when a mail deep link resolves.
    // Opening the change picker only changes view state; reload supersedes it.
    if ((busy && !fromMail) || !r.can_change) return;
    changing = r; syncChange();
    q("#bookingDate").value = r.date;
    tools.reload(); q("#changeBookingBanner").scrollIntoView({ block: "nearest" });
  }
  function renderBookings() {
    const target = q("#myBookings"); target.replaceChildren();
    if (!bookings.length) target.append(element("p", "hint", "これからの予約はありません。"));
    bookings.forEach(function (r) {
      const card = element("article", "my-booking"); card.dataset.ownBooking = r.booking_id;
      card.append(element("strong", "", when(r)));
      card.append(element("span", "booking-state", r.attended ? "受講済み" : r.status === "CANCELLED" ? "取消済み" : r.status === "RESCHEDULED" ? "変更済み" : "予約済み"));
      const actions = element("div", "member-actions");
      if (r.can_change) {
        const change = element("button", "text-button", "変更する"); change.type = "button"; change.dataset.memberAction = "change";
        change.addEventListener("click", function () { startChange(r); }); actions.append(change);
      }
      if (r.can_cancel) {
        const cancel = element("button", "text-button", "キャンセルする"); cancel.type = "button"; cancel.dataset.memberAction = "cancel";
        cancel.addEventListener("click", function () { if (!busy) tools.cancel(r, cancel); }); actions.append(cancel);
      }
      if (!r.can_change && r.status === "CONFIRMED" && !r.attended) actions.append(element("small", "hint", "変更・取消の締切を過ぎています"));
      card.append(actions); target.append(card);
    });
    syncButtons();
  }
  async function refresh() {
    if (!token) return;
    const ownToken = token, seq = ++sequence;
    try {
      const data = await api("get9RoundMemberBookings", { session_token: ownToken, booking_id: wanted });
      if (token !== ownToken || seq !== sequence) return;
      bookings = data.bookings; renderBookings();
      if (changing && !bookings.some(function (r) { return r.booking_id === changing.booking_id && r.can_change; })) tools.finishChange();
      if (wanted && !intentHandled) {
        intentHandled = true; q("#myBookingsPanel").open = true;
        const selected = bookings.find(function (r) { return r.booking_id === wanted; });
        if (!selected) { tools.onMessage("メールの予約をご本人の予約として確認できませんでした。登録メールをご確認ください。", true); return; }
        if (intent === "change" && selected.can_change) startChange(selected, true);
        else {
          tools.onMessage(selected.status !== "CONFIRMED" ? "この予約はすでに取消・変更済みです。" : selected.can_cancel ? "対象の予約を確認し、「キャンセルする」を押してください。" : "予約・変更・取消は開始1時間前までです。");
          q("#myBookingsPanel").scrollIntoView({ block: "nearest" });
        }
      }
    } catch (error) { if (token === ownToken && seq === sequence) tools.onError(error); }
  }
  async function displayPass(rotate) {
    if (!token || qrBusy) return;
    if (rotate && !window.confirm("会員QRを再発行します。保存済みの古いQRは利用できなくなります。再発行しますか？")) return;
    const ownToken = token, seq = ++qrSequence; qrBusy = true; syncButtons();
    if (rotate) { q("#memberQrCanvas").width = 1; q("#memberQrCanvas").height = 1; q("#qrSave").hidden = true; q("#qrSave").removeAttribute("href"); }
    q("#qrStatus").textContent = "会員QRを準備しています…";
    try {
      const data = await api(rotate ? "rotate9RoundMemberPass" : "get9RoundMemberPass", { session_token: ownToken });
      if (token !== ownToken || seq !== qrSequence) return;
      const qr = window.qrcode(0, "M"); qr.addData(data.qr_text); qr.make();
      const modules = qr.getModuleCount(), cell = 6, margin = 4;
      const canvas = q("#memberQrCanvas"); canvas.width = canvas.height = (modules + margin * 2) * cell;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#000";
      for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
      q("#qrSave").href = canvas.toDataURL("image/png"); q("#qrSave").hidden = false;
      q("#qrStatus").textContent = rotate ? "会員QRを再発行しました。店舗でこのQRを提示してください。" : "店舗でこのQRをスタッフに提示してください。";
    } catch (error) {
      if (token === ownToken && seq === qrSequence) { q("#qrStatus").textContent = "会員QRを表示できませんでした。再表示をお試しください。"; tools.onError(error); }
    } finally { if (token === ownToken && seq === qrSequence) { qrBusy = false; syncButtons(); } }
  }
  q("#changeAbort").addEventListener("click", function () { if (!busy) { tools.finishChange(); tools.reload(); } });
  q("#qrReload").addEventListener("click", function () { displayPass(false); });
  q("#qrRotate").addEventListener("click", function () { displayPass(true); });
})();
