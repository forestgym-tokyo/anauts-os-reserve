/** Deadlines, transactional changes, notifications and member attendance. */
function nrBookingDeadline_(booking) {
  return new Date(Date.parse(booking.date + "T" + booking.start_time + ":00+09:00") - NR_BOOKING.cutoffMinutes * 60000).toISOString();
}

function nrBookingBeforeDeadline_(booking) {
  return Date.now() <= Date.parse(nrBookingDeadline_(booking));
}

function nrBookingRequireDeadline_(booking) {
  if (!nrBookingBeforeDeadline_(booking)) nrBookingError_("DEADLINE_PASSED", "予約・変更・取消は開始1時間前までです。");
}

function nrBookingAttended_(config, id) {
  return nrBookingRows_(config, "attendance").some(function (r) { return r.booking_id === id && r.status === "ATTENDED"; });
}

function nrBookingRequireMutable_(config, booking) {
  if (booking.status !== "CONFIRMED") nrBookingError_("BOOKING_UNAVAILABLE", "この予約は変更・取消できません。");
  if (nrBookingAttended_(config, booking.booking_id)) nrBookingError_("ALREADY_ATTENDED", "受講済みの予約は変更・取消できません。");
  nrBookingRequireDeadline_(booking);
}

function nrGet9RoundMemberBookings_(config, body) {
  const auth = nrBookingSession_(config, body);
  const attendance = nrBookingRows_(config, "attendance");
  const today = nrBookingRange_(config).from;
  const wanted = String(body.booking_id || "");
  return { bookings: nrBookingRows_(config, "bookings").filter(function (r) {
    return r.member_no === auth.member.no && ((r.status === "CONFIRMED" && r.date >= today) || r.booking_id === wanted);
  }).map(function (r) {
    const attended = attendance.some(function (a) { return a.booking_id === r.booking_id && a.status === "ATTENDED"; });
    const mutable = r.status === "CONFIRMED" && nrBookingBeforeDeadline_(r) && !attended;
    return { booking_id: r.booking_id, slot_id: r.slot_id, date: r.date, start_time: r.start_time, end_time: r.end_time,
      status: r.status, attended: attended, can_cancel: mutable, can_change: mutable, deadline: nrBookingDeadline_(r) };
  }).sort(function (a, b) { return (a.date + a.start_time).localeCompare(b.date + b.start_time); }) };
}

function nrReschedule9RoundBooking_(config, body) {
  return nrBookingLocked_(function () {
    const auth = nrBookingSession_(config, body);
    const rows = nrBookingRows_(config, "bookings");
    const old = rows.find(function (r) { return r.booking_id === String(body.booking_id || "") && r.member_no === auth.member.no; });
    if (!old) nrBookingError_("BOOKING_NOT_FOUND", "ご本人の予約を確認できません。");
    const date = nrBookingRequireDate_(config, body.date);
    const slot = nrBookingDailySlots_(date).find(function (r) { return r.slot_id === body.slot_id; });
    if (!slot) nrBookingError_("INVALID_SLOT", "変更先の枠を選び直してください。");
    const id = nrBookingHash_(config, "reschedule:" + old.booking_id + ":" + slot.slot_id);
    if (old.status === "RESCHEDULED") {
      const completed = rows.find(function (r) { return r.booking_id === id && r.member_no === auth.member.no; });
      if (completed) return { booking_id: id, already_changed: true };
    }
    nrBookingRequireMutable_(config, old);
    if (old.slot_id === slot.slot_id) return { booking_id: old.booking_id, already_changed: true };
    nrBookingRequireDeadline_(slot);
    nrBookingNotificationConfig_(config);
    if (rows.some(function (r) { return r.slot_id === slot.slot_id && r.member_no === auth.member.no && r.status === "CONFIRMED"; })) {
      nrBookingError_("ALREADY_BOOKED", "変更先の枠はすでに予約済みです。元の予約は維持されています。");
    }
    if (nrBookingRows_(config, "blocks").some(function (b) { return b.slot_id === slot.slot_id && b.status === "BLOCKED"; })) {
      nrBookingError_("SLOT_BLOCKED", "変更先は受付停止中です。元の予約は維持されています。");
    }
    if (nrBookingCount_(rows, slot.slot_id) >= slot.capacity) nrBookingError_("SLOT_FULL", "変更先は満員です。元の予約は維持されています。");
    const changedAt = new Date().toISOString();
    const booking = { booking_id: id, kind: "DAILY", slot_id: slot.slot_id, date: date, start_time: slot.start_time,
      end_time: slot.end_time, member_no: auth.member.no, member_name: auth.member.name, created_at: changedAt,
      status: "CONFIRMED", cancelled_at: "" };
    const previous = Object.assign({}, old);
    old.status = "RESCHEDULED"; old.cancelled_at = changedAt;
    rows.push(booking);
    // One Sheets write applies both the old and new reservation together. The
    // same script lock excludes bookings, cancellations, blocks and check-ins.
    const values = rows.map(function (r) { return NR_BOOKING.tables.bookings.map(function (h) {
      const value = String(r[h] || ""); return /^[=+@-]/.test(value) ? "'" + value : value;
    }); });
    nrBookingSheet_(config, "bookings").getRange(2, 1, values.length, NR_BOOKING.tables.bookings.length).setNumberFormat("@").setValues(values);
    nrBookingWrite_(config, "changes", { old_booking_id: old.booking_id, new_booking_id: id, new_slot_id: slot.slot_id, created_at: changedAt });
    return { booking_id: id, already_changed: false,
      notification_pending: nrBookingNotify_(config, "CHANGED", booking, auth.member, previous) };
  });
}

function nrBookingNotificationConfig_(config) {
  const p = PropertiesService.getScriptProperties().getProperties();
  const url = String(p.ROUND9_BOOKING_MEMBER_URL || "").trim();
  const recipients = String(p.ROUND9_BOOKING_ADMIN_EMAILS || (config.environment === "development" ? config.testEmails[0] : "") || "")
    .split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (!/^https:\/\/[a-z0-9.-]+\/[^\s<>"#]*$/i.test(url) || !recipients.length) {
    nrBookingError_("BOOKING_CONFIGURATION", "確認メールの予約画面URL・管理通知先を設定してください。");
  }
  const emails = Array.from(new Set(recipients.map(nrBookingEmail_)));
  if (config.environment === "development" && emails.some(function (email) { return config.testEmails.indexOf(email) < 0; })) {
    nrBookingError_("BOOKING_CONFIGURATION", "開発環境の管理通知先はテスト許可メールに限定してください。");
  }
  return { memberUrl: url, adminEmails: emails };
}

function nrBookingHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}

function nrBookingMailLink_(url, bookingId, intent) {
  return url + (url.indexOf("?") < 0 ? "?" : "&") + "booking_id=" + encodeURIComponent(bookingId) + "&intent=" + intent;
}

function nrBookingNotify_(config, type, booking, member, previous) {
  const settings = nrBookingNotificationConfig_(config);
  const label = { CONFIRMED: "予約確認", CHANGED: "予約変更", CANCELLED: "予約取消" }[type];
  const when = booking.date + " " + booking.start_time + "–" + booking.end_time;
  const old = previous ? "\n変更前: " + previous.date + " " + previous.start_time + "–" + previous.end_time : "";
  const summary = member.name + " 様\n\nデイリーワークアウトの" + label + "を受け付けました。\n日時: " + when + old + "\n店舗: 9ROUND アリオ蘇我店\n\n予約・変更・取消は開始1時間前までです。";
  const changeUrl = nrBookingMailLink_(settings.memberUrl, booking.booking_id, "change");
  const cancelUrl = nrBookingMailLink_(settings.memberUrl, booking.booking_id, "cancel");
  const active = type !== "CANCELLED";
  const buttons = active ? '<p><a style="display:inline-block;padding:13px 20px;background:#e52535;color:#fff;text-decoration:none;border-radius:6px;margin-right:10px" href="' + nrBookingHtml_(changeUrl) + '">予約を変更する</a>' +
    '<a style="display:inline-block;padding:13px 20px;background:#222;color:#fff;text-decoration:none;border-radius:6px" href="' + nrBookingHtml_(cancelUrl) + '">予約をキャンセルする</a></p><p style="font-size:12px">ボタンから本人確認後に操作できます。メールを開くだけでは予約は変更・取消されません。</p>' : "";
  const subject = "【9ROUND アリオ蘇我店】" + label + " " + when;
  const payload = {
    subject: subject, body: summary + (active ? "\n\n予約を変更する:\n" + changeUrl + "\n\n予約をキャンセルする:\n" + cancelUrl : ""),
    htmlBody: '<div style="font-family:sans-serif;max-width:620px;color:#111"><h2 style="border-bottom:3px solid #e52535;padding-bottom:12px">9ROUND ARIO SOGA</h2><p>' + nrBookingHtml_(summary).replace(/\n/g, "<br>") + "</p>" + buttons + "</div>",
    name: "9ROUND アリオ蘇我店", replyTo: "9round.ariosoga@gmail.com"
  };
  const admin = { subject: "【9ROUND 管理通知】" + label + " " + when,
    body: "デイリーワークアウト " + label + "\n日時: " + when + old + "\n氏名: " + member.name + "\n会員番号: " + member.no + "\n登録メール: " + member.email,
    name: "9ROUND 予約管理", replyTo: "9round.ariosoga@gmail.com" };
  const definitions = [
    { role: "MEMBER", recipient: member.email, payload: payload },
    { role: "ADMIN", recipient: settings.adminEmails.join(","), payload: admin }
  ];
  let pending = false;
  definitions.forEach(function (definition) {
    const eventId = nrBookingHash_(config, "mail:" + type + ":" + booking.booking_id + ":" + definition.role);
    let row = nrBookingRows_(config, "mail").find(function (m) { return m.event_id === eventId; });
    if (!row) {
      row = { event_id: eventId, booking_id: booking.booking_id, event_type: type, recipient_role: definition.role,
        recipient: definition.recipient, payload_json: JSON.stringify(definition.payload), status: "PENDING",
        created_at: new Date().toISOString(), sent_at: "", attempts: "0", last_error: "" };
      row._row = nrBookingSheet_(config, "mail").getLastRow() + 1;
      nrBookingWrite_(config, "mail", row, row._row);
    }
    if (row.status !== "SENT" && !nrBookingSendMail_(config, row)) pending = true;
  });
  return pending;
}

function nrBookingSendMail_(config, row) {
  try {
    const emails = row.recipient.split(",").map(nrBookingEmail_);
    if (config.environment === "development" && emails.some(function (email) { return config.testEmails.indexOf(email) < 0; })) throw new Error("not-allowlisted");
    row.attempts = String(Number(row.attempts || 0) + 1);
    MailApp.sendEmail(Object.assign({}, JSON.parse(row.payload_json), { to: emails.join(",") }));
    row.status = "SENT"; row.sent_at = new Date().toISOString(); row.last_error = "";
  } catch (_) {
    // A confirmed booking is retained even if the free MailApp quota is exhausted.
    row.status = "PENDING"; row.last_error = "送信待ちです。管理画面から再送してください。";
  }
  nrBookingWrite_(config, "mail", row, row._row);
  return row.status === "SENT";
}

function nrRetry9RoundNotifications_(config, body) {
  nrBookingStaff_(config, body, true);
  return nrBookingLocked_(function () {
    let sent = 0;
    nrBookingRows_(config, "mail").filter(function (r) { return r.status !== "SENT"; }).slice(0, 5)
      .forEach(function (r) { if (nrBookingSendMail_(config, r)) sent++; });
    return { sent: sent, pending: nrBookingRows_(config, "mail").filter(function (r) { return r.status !== "SENT"; }).length };
  });
}

function nrBookingPassText_(config, pass, member) {
  return "NR9:" + nrBookingHash_(config, "member-pass:" + pass.pass_id + ":" + member.no + ":" + member.email);
}

function nrBookingMemberPass_(config, member, rotate) {
  const emailHash = nrBookingHash_(config, "email:" + member.email);
  const rows = nrBookingRows_(config, "passes").filter(function (r) { return r.member_no === member.no && r.status === "ACTIVE"; });
  let pass = !rotate && rows.find(function (r) { return r.email_hash === emailHash; });
  if (pass) return { qr_text: nrBookingPassText_(config, pass, member), issued_at: pass.created_at };
  rows.forEach(function (r) { r.status = "REVOKED"; nrBookingWrite_(config, "passes", r, r._row); });
  pass = { pass_id: nrBookingOpaque_(), member_no: member.no, email_hash: emailHash,
    created_at: new Date().toISOString(), status: "ACTIVE" };
  const text = nrBookingPassText_(config, pass, member);
  pass.token_hash = nrBookingHash_(config, "qr:" + text);
  nrBookingWrite_(config, "passes", pass);
  return { qr_text: text, issued_at: pass.created_at };
}

function nrGet9RoundMemberPass_(config, body) {
  return nrBookingLocked_(function () { return nrBookingMemberPass_(config, nrBookingSession_(config, body).member, false); });
}

function nrRotate9RoundMemberPass_(config, body) {
  return nrBookingLocked_(function () { return nrBookingMemberPass_(config, nrBookingSession_(config, body).member, true); });
}

function nrCheckIn9RoundMember_(config, body) {
  const staff = nrBookingStaff_(config, body, false);
  return nrBookingLocked_(function () {
    const text = String(body.qr_text || "").trim();
    if (!/^NR9:[a-f0-9]{64}$/.test(text)) nrBookingError_("INVALID_QR", "9ROUNDの会員QRを読み取ってください。");
    const date = nrBookingDate_(body.date);
    if (date !== nrBookingRange_(config).from) nrBookingError_("CHECKIN_DATE", "受講登録できるのは本日の予約です。");
    const slot = nrBookingDailySlots_(date).find(function (s) { return s.slot_id === body.slot_id; });
    if (!slot) nrBookingError_("INVALID_SLOT", "受講登録する対象枠を選んでください。");
    const hash = nrBookingHash_(config, "qr:" + text);
    const passes = nrBookingRows_(config, "passes").filter(function (r) { return r.token_hash === hash && r.status === "ACTIVE"; });
    if (passes.length !== 1) nrBookingError_("INVALID_QR", "会員QRが無効です。会員画面で再表示してください。");
    const pass = passes[0];
    const member = nrBookingFindMember_(config, function (m) { return m.no === pass.member_no && nrBookingHash_(config, "email:" + m.email) === pass.email_hash; });
    if (!member) nrBookingError_("MEMBER_UNAVAILABLE", "現在の会員情報では受講登録できません。");
    const matches = nrBookingRows_(config, "bookings").filter(function (r) { return r.member_no === member.no && r.slot_id === slot.slot_id && r.status === "CONFIRMED"; });
    if (matches.length !== 1) nrBookingError_("NO_RESERVATION", "選択した枠にこの会員様の有効な予約がありません。");
    const booking = matches[0];
    const existing = nrBookingRows_(config, "attendance").find(function (r) { return r.booking_id === booking.booking_id && r.status === "ATTENDED"; });
    if (!existing) nrBookingWrite_(config, "attendance", { booking_id: booking.booking_id, member_no: member.no,
      checked_in_at: new Date().toISOString(), staff_code: staff.staff_code, status: "ATTENDED" });
    return { booking_id: booking.booking_id, member_name: member.name, start_time: booking.start_time,
      end_time: booking.end_time, attended: true, already_attended: !!existing };
  });
}
