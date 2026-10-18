/** Free trials share the daily timetable; MPG presence permits parallel reception. */
function nrTrialEnabled_() {
  return PropertiesService.getScriptProperties().getProperties().ROUND9_TRIAL_ENABLED === "true";
}

function nrTrialConfig_(config) {
  if (!nrTrialEnabled_()) nrBookingError_("TRIAL_DISABLED", "現在、無料体験予約の準備中です。");
  const p = PropertiesService.getScriptProperties().getProperties();
  const sourceId = String(p.ROUND9_TRIAL_SHIFT_SPREADSHEET_ID || p.ROUND9_BOOKING_STAFF_DIRECTORY_ID || "").trim();
  const staffCode = String(p.ROUND9_TRIAL_STAFF_CODE || "KAWAKAMI").trim().toUpperCase();
  if (!sourceId || sourceId === config.dataId || sourceId === config.masterId || !staffCode) {
    nrBookingError_("TRIAL_CONFIGURATION", "体験担当者の勤務予定の接続設定を確認してください。");
  }
  const settings = nrBookingNotificationConfig_(config);
  const trialUrl = String(p.ROUND9_TRIAL_URL || "https://forestgym-tokyo.github.io/anauts-os-reserve/9round-booking/trial/").trim();
  if (!/^https:\/\/[a-z0-9.-]+\/[^\s<>"#]*$/i.test(trialUrl)) nrBookingError_("TRIAL_CONFIGURATION", "体験申込画面のURLを確認してください。");
  return { sourceId: sourceId, staffCode: staffCode, url: trialUrl, adminEmails: settings.adminEmails };
}

/** Editor-only additive migration. Never reinitializes reservations or existing source data. */
function prepare9RoundTrialStorage_() {
  const config = nrBookingConfig_();
  return nrBookingLocked_(function () {
    const ss = SpreadsheetApp.openById(config.dataId);
    ["trial_contacts", "trial_applications"].forEach(function (table) {
      let sheet = ss.getSheetByName("nr_" + table);
      if (!sheet) {
        sheet = ss.insertSheet("nr_" + table);
        sheet.getRange(1, 1, 1, NR_BOOKING.tables[table].length).setValues([NR_BOOKING.tables[table]]);
        sheet.setFrozenRows(1);
      }
      nrBookingSheet_(config, table);
    });
    return { ready: true };
  });
}

function nrTrialReadSource_(config) {
  const settings = nrTrialConfig_(config), source = SpreadsheetApp.openById(settings.sourceId);
  const shifts = nrBookingDirectoryRows_(source, "staff_shifts", ["staff_code", "store_code", "date", "start_time", "end_time", "active"]);
  const reservations = nrBookingDirectoryRows_(source, "reservations", ["service_code", "staff_code", "reservation_date", "start_time", "status"]);
  const publications = source.getSheetByName("staff_shift_publications") ? nrBookingDirectoryRows_(source, "staff_shift_publications", ["store_code", "target_month", "status"]) : [];
  return { settings: settings, shifts: shifts, reservations: reservations, publications: publications };
}

function nrTrialDate_(value) {
  return String(value || "").trim().replace(/\//g, "-").replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, function (_, y, m, d) { return y + "-" + m.padStart(2, "0") + "-" + d.padStart(2, "0"); });
}

function nrTrialTime_(value) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value || "").trim());
  return match ? match[1].padStart(2, "0") + ":" + match[2] : "";
}

function nrTrialScheduleContext_(config) {
  return { source: nrTrialReadSource_(config), bookings: nrBookingRows_(config, "bookings"), applications: nrBookingRows_(config, "trial_applications") };
}

function nrTrialAvailability_(config, date, context) {
  context = context || nrTrialScheduleContext_(config);
  const source = context.source;
  const publication = source.publications.find(function (r) { return r.store_code.toUpperCase() === "MPG" && r.target_month === date.slice(0, 7); });
  const shifts = source.shifts.filter(function (s) {
    return s.staff_code.toUpperCase() === source.settings.staffCode && s.store_code.toUpperCase() === "MPG" &&
      nrTrialDate_(s.date) === date && nrBookingStaffBoolean_(s.active) && (!publication || publication.status.toUpperCase() === "PUBLISHED");
  });
  return nrBookingBaseSlots_(date).map(function (slot) {
    const supportBusy = source.reservations.some(function (r) {
      if (r.service_code.toUpperCase() !== "MPG_TRAINING_SUPPORT45" ||
          (r.staff_code && r.staff_code.toUpperCase() !== source.settings.staffCode) ||
          (r.store_code && r.store_code.toUpperCase() !== "MPG") || nrTrialDate_(r.reservation_date) !== date ||
          ["CANCELLED", "CANCELED", "CANCEL", "REJECTED"].indexOf(r.status.toUpperCase()) >= 0) return false;
      const start = nrTrialTime_(r.start_time), end = nrTrialTime_(r.end_time) || (start ? nrBookingTime_(Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 45) : "");
      return start && end && start < slot.end_time && end > slot.start_time;
    });
    const parallel = !supportBusy && shifts.some(function (s) { const start = nrTrialTime_(s.start_time), end = nrTrialTime_(s.end_time); return start && end && start <= slot.start_time && end >= slot.end_time; });
    const overlaps = function (r) { return r.date === date && r.status === "CONFIRMED" && r.start_time < slot.end_time && r.end_time > slot.start_time; };
    const daily = context.bookings.some(function (r) { return r.kind === "DAILY" && overlaps(r); });
    const trial = context.applications.some(overlaps);
    // Derived visibility never deletes reservations or overwrites manual stops.
    // If staffing changes after both sides booked, retain both and stop additions.
    return Object.assign({}, slot, { daily_hidden: !parallel && trial && !daily,
      trial_hidden: !parallel && daily, staffing_conflict: !parallel && daily && trial,
      support_busy: !!supportBusy, mpg_conflict: !!supportBusy && trial });
  });
}

function nrTrialPlans_(config, date, context) {
  return nrTrialAvailability_(config, date, context).map(function (slot) {
    return { slot_id: "TRIAL:" + date + ":" + slot.start_time, kind: "TRIAL", date: date, start_time: slot.start_time,
      end_time: slot.end_time, capacity: 2, title: "無料体験", status: slot.staffing_conflict || slot.support_busy ? "CLOSED" : "OPEN",
      auto_hidden: slot.trial_hidden, staffing_conflict: slot.staffing_conflict, mpg_conflict: slot.mpg_conflict };
  });
}

function nrTrialRequirePlannedSlot_(config, date, time) {
  const slot = nrTrialPlans_(config, date).find(function (s) { return s.start_time === time; });
  if (!slot) nrBookingError_("TRIAL_UNAVAILABLE", "デイリーワークアウトと同じ時間割から体験枠を選んでください。");
  return slot;
}

function nrTrialSlots_(config, date, context) {
  const overrides = nrBookingRows_(config, "trials").filter(function (r) { return r.date === date; });
  return nrTrialPlans_(config, date, context).map(function (slot) {
    const override = overrides.find(function (r) { return r.start_time === slot.start_time; });
    if (!override) return slot;
    return Object.assign({}, slot, { slot_id: override.slot_id, capacity: Math.min(2, Math.max(1, Number(override.capacity) || 2)),
      title: override.title || "無料体験", status: override.status === "DELETED" ? "DELETED" : slot.status !== "OPEN" ? slot.status : override.status });
  });
}

function nrTrialCount_(config, slotId, excludingId) {
  return nrBookingRows_(config, "trial_applications").filter(function (r) {
    return r.slot_id === slotId && r.status === "CONFIRMED" && r.application_id !== excludingId;
  }).reduce(function (n, r) { return n + Number(r.party_size); }, 0);
}

function nrGet9RoundTrialSlots_(config, body) {
  const context = nrTrialScheduleContext_(config), range = nrBookingRange_(config);
  const from = body.date ? nrBookingRequireDate_(config, body.date) : range.from;
  const to = body.date ? from : range.to, slots = [];
  const applications = context.applications;
  for (let cursor = Date.parse(from + "T00:00:00+09:00"); cursor <= Date.parse(to + "T00:00:00+09:00"); cursor += 86400000) {
    const date = Utilities.formatDate(new Date(cursor), NR_BOOKING.timezone, "yyyy-MM-dd");
    nrTrialSlots_(config, date, context).forEach(function (slot) {
      const count = applications.filter(function (r) { return r.slot_id === slot.slot_id && r.status === "CONFIRMED"; }).reduce(function (n, r) { return n + Number(r.party_size); }, 0);
      const remaining = Math.max(0, slot.capacity - count);
      if (slot.status === "DELETED" || slot.auto_hidden) return;
      // Public output contains no shift details, contact information, or applicant identifiers.
      slots.push({ slot_id: slot.slot_id, date: date, start_time: slot.start_time, end_time: slot.end_time,
        capacity: slot.capacity, remaining: remaining, fee: 0, available: slot.status === "OPEN" && remaining > 0 && nrBookingBeforeDeadline_(slot),
        closed: slot.status !== "OPEN", deadline: nrBookingDeadline_(slot) });
    });
  }
  return { range: range, fee: 0, capacity: 2, slots: slots };
}

function nrTrialCheckEmail_(config, email) {
  email = nrBookingEmail_(email);
  if (config.environment === "development" && config.testEmails.indexOf(email) < 0) nrBookingError_("TRIAL_EMAIL_UNAVAILABLE", "開発用の確認済みメールアドレスを使用してください。");
  return email;
}

function nrTrialName_(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) nrBookingError_("INVALID_NAME", "お名前を60文字以内で入力してください。");
  return name;
}

function nrTrialRequireSlot_(config, date, id, party, excludingId) {
  const slot = nrTrialSlots_(config, nrBookingRequireDate_(config, date)).find(function (s) { return s.slot_id === id; });
  if (!slot || slot.status !== "OPEN" || slot.auto_hidden) nrBookingError_("TRIAL_UNAVAILABLE", "この体験枠は受け付けていません。他の日時をお選びください。");
  nrBookingRequireDeadline_(slot);
  if (nrTrialCount_(config, slot.slot_id, excludingId) + party > slot.capacity) nrBookingError_("TRIAL_FULL", "この体験枠は残席が足りません。他の日時をお選びください。");
  return slot;
}

function nrCreate9RoundTrial_(config, body) {
  nrTrialConfig_(config);
  return nrBookingLocked_(function () {
    const email = nrTrialCheckEmail_(config, body.email), name = nrTrialName_(body.name), party = Number(body.party_size);
    if (body.website) nrBookingError_("INVALID_REQUEST", "入力内容を確認してください。");
    // Submitted email links contacts only; it never authenticates access to existing bookings.
    const customer = "T" + nrBookingHash_(config, "trial-customer:" + email);
    if (body.consent !== true || (party !== 1 && party !== 2)) nrBookingError_("INVALID_REQUEST", "人数と個人情報の利用への同意を確認してください。");
    const companion = party === 2 ? nrTrialName_(body.companion_name) : "";
    const phone = String(body.phone || "").normalize("NFKC").replace(/[\s()-]/g, "");
    if (!/^\+?\d{10,15}$/.test(phone)) nrBookingError_("INVALID_PHONE", "連絡先の電話番号を確認してください。");
    const request = String(body.request_id || "");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(request)) nrBookingError_("INVALID_REQUEST", "申込画面を開き直してください。");
    const applications = nrBookingRows_(config, "trial_applications");
    const existing = applications.find(function (r) { return r.request_id === request; });
    if (existing) {
      if (existing.email !== email || existing.date !== body.date || existing.slot_id !== body.slot_id || Number(existing.party_size) !== party || existing.name !== name || existing.phone !== phone || existing.companion_name !== companion) nrBookingError_("REQUEST_CONFLICT", "この申込は処理済みです。確認メールをご確認ください。");
      const pending = nrBookingRows_(config, "mail").some(function (m) { return m.booking_id === existing.application_id && m.status !== "SENT"; });
      return Object.assign(nrTrialResult_(config, existing, "CUSTOMER"), { already_booked: true, notification_pending: pending });
    }
    const slot = nrTrialRequireSlot_(config, body.date, body.slot_id, party);
    if (nrBookingRows_(config, "trial_applications").some(function (r) { return r.customer_id === customer && r.slot_id === slot.slot_id && r.status === "CONFIRMED"; })) nrBookingError_("ALREADY_BOOKED", "この日時にはすでにお申込み済みです。確認メールをご確認ください。");
    const recent = applications.filter(function (r) { return Date.now() - Date.parse(r.created_at) < 3600000; });
    if (recent.length >= 40 || recent.filter(function (r) { return r.email === email; }).length >= 5) nrBookingError_("RATE_LIMIT", "お申込みが集中しています。時間をあけてお試しください。");
    const now = new Date().toISOString(), contacts = nrBookingRows_(config, "trial_contacts");
    const contact = contacts.find(function (r) { return r.customer_id === customer; });
    nrBookingWrite_(config, "trial_contacts", { customer_id: customer, name: name, email: email, phone: phone, created_at: contact ? contact.created_at : now, updated_at: now }, contact ? contact._row : undefined);
    const application = { application_id: nrBookingOpaque_(), request_id: request, customer_id: customer, slot_id: slot.slot_id,
      date: slot.date, start_time: slot.start_time, end_time: slot.end_time, party_size: String(party), name: name, companion_name: companion,
      phone: phone, email: email, status: "CONFIRMED", consent_at: now, created_at: now, updated_at: now };
    nrBookingWrite_(config, "trial_applications", application);
    return Object.assign(nrTrialResult_(config, application, "CUSTOMER"), { notification_pending: nrTrialNotify_(config, application, "CONFIRMED") });
  });
}

function nrTrialToken_(config, application, role) {
  return nrBookingHash_(config, "trial-link:" + role + ":" + application.application_id + ":" + application.email + ":" + application.slot_id + ":" + application.updated_at + ":" + application.status);
}

function nrTrialSelect_(config, body, staff) {
  const application = nrBookingRows_(config, "trial_applications").find(function (r) { return r.application_id === String(body.application_id || ""); });
  let role = "CUSTOMER";
  const actor = staff ? nrBookingStaff_(config, body, false) : null;
  if (staff) role = "CUSTOMER";
  else {
    const token = String(body.trial_token || "");
    if (!application || !/^[a-f0-9]{64}$/.test(token)) nrBookingError_("TRIAL_LINK_INVALID", "この予約リンクは無効です。最新の確認メールをご確認ください。");
    if (nrTrialToken_(config, application, "CUSTOMER") !== token) {
      if (nrTrialToken_(config, application, "ADMIN") !== token) nrBookingError_("TRIAL_LINK_INVALID", "この予約リンクは無効です。最新の確認メールをご確認ください。");
      role = "ADMIN";
    }
  }
  if (!application) nrBookingError_("BOOKING_NOT_FOUND", "対象の体験予約が見つかりません。");
  return { application: application, role: role, staff: actor };
}

function nrTrialResult_(config, application, role) {
  const mutable = application.status === "CONFIRMED" && nrBookingBeforeDeadline_(application);
  return { application_id: application.application_id, trial_token: nrTrialToken_(config, application, role),
    date: application.date, start_time: application.start_time, end_time: application.end_time, name: application.name,
    companion_name: application.companion_name, phone: application.phone, email: application.email, party_size: Number(application.party_size),
    fee: 0, status: application.status, can_cancel: mutable, can_change: mutable, deadline: nrBookingDeadline_(application) };
}

function nrGet9RoundTrial_(config, body, staff) {
  nrTrialConfig_(config);
  const selected = nrTrialSelect_(config, body, staff);
  return nrTrialResult_(config, selected.application, selected.role);
}

function nrChange9RoundTrial_(config, body, staff, cancel) {
  nrTrialConfig_(config);
  return nrBookingLocked_(function () {
    const selected = nrTrialSelect_(config, body, staff), application = selected.application;
    if (application.status !== "CONFIRMED") nrBookingError_("BOOKING_UNAVAILABLE", "この予約は変更・キャンセルできません。");
    nrBookingRequireDeadline_(application);
    const previous = application.date + " " + application.start_time;
    if (cancel) application.status = "CANCELLED";
    else {
      const slot = nrTrialRequireSlot_(config, body.date, body.slot_id, Number(application.party_size), application.application_id);
      if (slot.slot_id === application.slot_id) return nrTrialResult_(config, application, selected.role);
      application.slot_id = slot.slot_id; application.date = slot.date; application.start_time = slot.start_time; application.end_time = slot.end_time;
    }
    application.updated_at = new Date(Math.max(Date.now(), Date.parse(application.updated_at) + 1)).toISOString();
    nrBookingWrite_(config, "trial_applications", application, application._row);
    if (staff) nrBookingManagementAudit_(config, application.application_id, cancel ? "TRIAL_CANCELLED" : "TRIAL_CHANGED", selected.staff, "");
    return Object.assign(nrTrialResult_(config, application, selected.role), { notification_pending: nrTrialNotify_(config, application, cancel ? "CANCELLED" : "CHANGED", previous) });
  });
}

function nrTrialNotify_(config, application, type, previous) {
  const settings = nrTrialConfig_(config), label = { CONFIRMED: "予約確認", CHANGED: "予約変更", CANCELLED: "キャンセル完了" }[type];
  let pending = false;
  ["CUSTOMER", "ADMIN"].forEach(function (role) {
    const active = application.status === "CONFIRMED";
    const url = settings.url + "#application_id=" + encodeURIComponent(application.application_id) + "&trial_token=" + nrTrialToken_(config, application, role);
    const summary = application.name + " 様\n\n無料体験の" + label + "を受け付けました。\n日時：" + application.date + " " + application.start_time +
      "\n人数：" + application.party_size + "名" + (application.companion_name ? "\n同行者：" + application.companion_name + " 様" : "") + "\n料金：無料\n店舗：9ROUND アリオ蘇我店" +
      (type === "CHANGED" ? "\n変更前：" + previous : "") + (role === "ADMIN" ? "\nメール：" + application.email + "\n電話：" + application.phone : "") +
      "\n\n変更・キャンセルは開始1時間前までです。";
    const payload = { subject: "【9ROUND " + (role === "ADMIN" ? "体験・管理通知" : "無料体験") + "】" + label + " " + application.date + " " + application.start_time,
      body: summary + (active ? "\n\n予約の確認・変更・キャンセル：\n" + url + "\nこのリンクを第三者に転送しないでください。" : ""),
      htmlBody: '<div style="font-family:sans-serif;color:#111;max-width:620px"><h2 style="border-bottom:3px solid #2475ee;padding-bottom:16px">9ROUND 無料体験</h2><p>' + nrBookingHtml_(summary).replace(/\n/g, "<br>") + '</p>' +
        (active ? '<p><a href="' + nrBookingHtml_(url) + '" style="display:inline-block;padding:15px 24px;background:#1767db;color:white;text-decoration:none;border-radius:8px">予約の確認・変更・キャンセル</a></p><p>このリンクを第三者に転送しないでください。リンクを開くだけでは予約は変更されません。</p>' : "") + '</div>',
      name: "9ROUND アリオ蘇我店", replyTo: "9round.ariosoga@gmail.com" };
    const id = nrBookingHash_(config, "trial-mail:" + application.application_id + ":" + application.updated_at + ":" + role);
    let row = nrBookingRows_(config, "mail").find(function (r) { return r.event_id === id; });
    if (!row) {
      row = { event_id: id, booking_id: application.application_id, event_type: "TRIAL_" + type, recipient_role: role === "CUSTOMER" ? "MEMBER" : "ADMIN",
        recipient: role === "CUSTOMER" ? application.email : settings.adminEmails.join(","), payload_json: JSON.stringify(payload), status: "PENDING", created_at: new Date().toISOString(), sent_at: "", attempts: "0", last_error: "" };
      row._row = nrBookingSheet_(config, "mail").getLastRow() + 1;
      nrBookingWrite_(config, "mail", row, row._row);
    }
    if (row.status !== "SENT" && !nrBookingSendMail_(config, row)) pending = true;
  });
  return pending;
}

function nrTrialBoardSlots_(config, date, context) {
  const slots = nrTrialSlots_(config, date, context);
  // A changed shift never hides an already accepted trial from the staff board.
  nrBookingRows_(config, "trial_applications").filter(function (r) { return r.date === date && r.status === "CONFIRMED"; }).forEach(function (r) {
    const existing = slots.find(function (s) { return s.slot_id === r.slot_id; });
    if (existing && existing.auto_hidden) { existing.auto_hidden = false; existing.status = "CLOSED"; }
    if (!existing) slots.push({ slot_id: r.slot_id, kind: "TRIAL", date: date, start_time: r.start_time, end_time: r.end_time, capacity: 2, title: "無料体験（勤務予定変更・要確認）", status: "CLOSED" });
  });
  return slots;
}

function nrTrialBoardMembers_(config, slotId) {
  return nrBookingRows_(config, "trial_applications").filter(function (r) { return r.slot_id === slotId && r.status === "CONFIRMED"; }).map(function (r) {
    return { booking_id: r.application_id, application_id: r.application_id, name: r.name, companion_name: r.companion_name,
      party_size: Number(r.party_size), email: r.email, phone: r.phone, member_no: "", fighter_name: "", attended: false,
      can_cancel: nrBookingBeforeDeadline_(r), can_change: nrBookingBeforeDeadline_(r) };
  });
}

function nrTrialHandlers_() {
  return {
    get9RoundTrialSlots: nrGet9RoundTrialSlots_,
    create9RoundTrialBooking: nrCreate9RoundTrial_, get9RoundTrialBooking: function (c, b) { return nrGet9RoundTrial_(c, b, false); },
    cancel9RoundTrialBooking: function (c, b) { return nrChange9RoundTrial_(c, b, false, true); },
    reschedule9RoundTrialBooking: function (c, b) { return nrChange9RoundTrial_(c, b, false, false); },
    get9RoundManagedTrialBooking: function (c, b) { return nrGet9RoundTrial_(c, b, true); },
    cancel9RoundManagedTrialBooking: function (c, b) { return nrChange9RoundTrial_(c, b, true, true); },
    reschedule9RoundManagedTrialBooking: function (c, b) { return nrChange9RoundTrial_(c, b, true, false); }
  };
}
