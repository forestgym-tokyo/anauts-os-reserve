/**
 * 9ROUND daily workout booking. Disabled until explicitly configured.
 * No top-level service calls, triggers, Calendar writes, or live-data defaults.
 * All reservation/auth state lives in a separate spreadsheet.
 */
const NR_BOOKING = Object.freeze({
  timezone: "Asia/Tokyo",
  capacity: 4,
  minutes: 45,
  otpMinutes: 10,
  sessionHours: 6,
  cutoffMinutes: 60,
  bookingLimit: 10,
  attempts: 5,
  tables: {
    challenges: ["challenge_id", "email_hash", "code_hash", "member_no", "created_at", "expires_at", "attempts", "status", "copy_token_hash"],
    sessions: ["token_hash", "member_no", "email_hash", "created_at", "expires_at", "status"],
    fighters: ["member_no", "email_hash", "fighter_name", "created_at", "updated_at"],
    bookings: ["booking_id", "kind", "slot_id", "date", "start_time", "end_time", "member_no", "member_name", "created_at", "status", "cancelled_at"],
    trials: ["slot_id", "kind", "date", "start_time", "end_time", "capacity", "title", "status", "created_by", "updated_at"],
    blocks: ["slot_id", "date", "start_time", "status", "updated_by", "updated_at"],
    passes: ["pass_id", "member_no", "email_hash", "token_hash", "created_at", "status"],
    attendance: ["booking_id", "member_no", "checked_in_at", "staff_code", "status"],
    changes: ["old_booking_id", "new_booking_id", "new_slot_id", "created_at"],
    management_actions: ["action_id", "booking_id", "action_type", "staff_code", "created_at", "new_booking_id"],
    mail: ["event_id", "booking_id", "event_type", "recipient_role", "recipient", "payload_json", "status", "created_at", "sent_at", "attempts", "last_error"]
  }
});

function nrBookingError_(code, message) {
  const error = new Error(message);
  error.nrCode = code;
  throw error;
}

function nrBookingConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  if (p.ROUND9_BOOKING_ENABLED !== "true") {
    nrBookingError_("BOOKING_DISABLED", "現在、予約受付の準備中です。");
  }
  const config = {
    dataId: String(p.ROUND9_BOOKING_SPREADSHEET_ID || "").trim(),
    masterId: String(p.ROUND9_BOOKING_MEMBER_MASTER_ID || "").trim(),
    masterSheet: String(p.ROUND9_BOOKING_MEMBER_MASTER_SHEET || "").trim(),
    secret: String(p.ROUND9_BOOKING_SECRET || ""),
    environment: String(p.ROUND9_BOOKING_ENV || "development"),
    testEmails: String(p.ROUND9_BOOKING_TEST_EMAILS || "").toLowerCase().split(",").map(function (v) { return v.trim(); }).filter(Boolean),
    days: Number(p.ROUND9_BOOKING_DAYS || 30)
  };
  if (!config.dataId || !config.masterId || !config.masterSheet || config.secret.length < 32 ||
      !Number.isInteger(config.days) || config.days < 1 || config.days > 90 ||
      ["development", "production"].indexOf(config.environment) < 0) {
    nrBookingError_("BOOKING_CONFIGURATION", "予約システムの接続設定を確認してください。");
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (config.dataId === config.masterId || (active && active.getId() === config.dataId)) {
    nrBookingError_("BOOKING_CONFIGURATION", "予約データには専用のスプレッドシートが必要です。");
  }
  if (config.environment === "development" &&
      (!config.testEmails.length ||
       config.masterId === p.ROUND9_MEMBER_MASTER_ID ||
       config.masterId === "1TT7TMIsHn8HXZCL6R0MyM6mOgx2kW9JRYghxC8JYemQ")) {
    nrBookingError_("BOOKING_CONFIGURATION", "開発環境にはテスト用会員マスターとテスト用メール設定が必要です。");
  }
  return config;
}

/** Editor-only initialization. Run only against a new development data sheet. */
function setup9RoundBookingStorage_() {
  const config = nrBookingConfig_();
  return nrBookingLocked_(function () {
    const ss = SpreadsheetApp.openById(config.dataId);
    Object.keys(NR_BOOKING.tables).forEach(function (table) {
      let sheet = ss.getSheetByName("nr_" + table);
      if (!sheet) {
        sheet = ss.insertSheet("nr_" + table);
        sheet.getRange(1, 1, 1, NR_BOOKING.tables[table].length).setValues([NR_BOOKING.tables[table]]);
        sheet.setFrozenRows(1);
      }
      nrBookingSheet_(config, table);
    });
    return { ok: true, environment: config.environment };
  });
}

function nrBookingSheet_(config, table) {
  const sheet = SpreadsheetApp.openById(config.dataId).getSheetByName("nr_" + table);
  if (!sheet) nrBookingError_("BOOKING_CONFIGURATION", "予約データの初期設定が未完了です。");
  const headers = NR_BOOKING.tables[table];
  const actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  if (actual.length !== headers.length || headers.some(function (h, i) { return actual[i] !== h; })) {
    nrBookingError_("BOOKING_CONFIGURATION", "予約データの列構成を確認してください。");
  }
  return sheet;
}

function nrBookingRows_(config, table) {
  const sheet = nrBookingSheet_(config, table);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, NR_BOOKING.tables[table].length)
    .getDisplayValues().map(function (values, i) {
      const row = { _row: i + 2 };
      NR_BOOKING.tables[table].forEach(function (header, index) { row[header] = String(values[index] || ""); });
      return row;
    });
}

function nrBookingWrite_(config, table, data, rowNumber) {
  const sheet = nrBookingSheet_(config, table);
  const values = NR_BOOKING.tables[table].map(function (header) {
    const value = data[header] === undefined ? "" : String(data[header]);
    // setValues interprets an initial "=" as a formula, even for imported names.
    return /^[=+@-]/.test(value) ? "'" + value : value;
  });
  sheet.getRange(rowNumber || sheet.getLastRow() + 1, 1, 1, values.length).setNumberFormat("@").setValues([values]);
}

function nrBookingLocked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

function nrBookingHash_(config, value) {
  return Utilities.computeHmacSha256Signature(String(value), config.secret, Utilities.Charset.UTF_8)
    .map(function (n) { return ("0" + ((n + 256) % 256).toString(16)).slice(-2); }).join("");
}

function nrBookingOpaque_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").toLowerCase();
}

function nrBookingEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    nrBookingError_("INVALID_EMAIL", "メールアドレスを正しく入力してください。");
  }
  return email;
}

/** The production master is read only; no helper that creates/updates it is used. */
function nrBookingMembers_(config) {
  const sheet = SpreadsheetApp.openById(config.masterId).getSheetByName(config.masterSheet);
  if (!sheet) nrBookingError_("BOOKING_CONFIGURATION", "会員情報の接続設定を確認してください。");
  const values = sheet.getDataRange().getDisplayValues();
  const headers = (values[0] || []).map(function (v) { return String(v).trim(); });
  const required = ["会員番号", "名前", "メールアドレス", "会員ステータス"];
  const indexes = required.map(function (header) { return headers.indexOf(header); });
  if (indexes.some(function (i) { return i < 0; })) nrBookingError_("BOOKING_CONFIGURATION", "会員情報の列構成を確認してください。");
  return values.slice(1).map(function (row) {
    return {
      no: String(row[indexes[0]] || "").trim(),
      name: String(row[indexes[1]] || "").trim(),
      email: String(row[indexes[2]] || "").trim().toLowerCase(),
      active: ["ok", "契約中", "active", "act"].indexOf(String(row[indexes[3]] || "").trim().toLowerCase()) >= 0
    };
  });
}

function nrBookingFindMember_(config, predicate) {
  const all = nrBookingMembers_(config);
  const matches = all.filter(function (member) {
    return member.active && member.no && member.name && predicate(member);
  });
  // Imports can repeat the same member, including spaces between family/given names.
  // Conflicting identities or statuses must never select an arbitrary person.
  if (!matches.length) return null;
  const member = matches[0];
  const sameIdentity = function (row) {
    return row.no === member.no && row.email === member.email && row.active === member.active &&
      row.name.replace(/[\s\u3000]+/g, "") === member.name.replace(/[\s\u3000]+/g, "");
  };
  if (!matches.every(sameIdentity)) return null;
  const sameEmail = all.filter(function (row) { return row.active && row.email === member.email; });
  if (!sameEmail.every(sameIdentity)) return null;
  const sameNumber = all.filter(function (row) { return row.no === member.no; });
  return sameNumber.every(sameIdentity) ? member : null;
}

function nrRequest9RoundCode_(config, body) {
  const email = nrBookingEmail_(body.email);
  return nrBookingLocked_(function () {
    const now = new Date();
    const emailHash = nrBookingHash_(config, "email:" + email);
    const sentRecently = nrBookingRows_(config, "challenges").some(function (r) {
      return r.email_hash === emailHash && now.getTime() - Date.parse(r.created_at) < 60000;
    });
    if (sentRecently) {
      nrBookingError_("RATE_LIMIT", "確認コードの再送は60秒以上あけてください。");
    }
    const member = nrBookingFindMember_(config, function (m) { return m.email === email; });
    const challenge = nrBookingOpaque_();
    const code = nrBookingChallengeCode_(config, challenge);
    const copyToken = nrBookingOpaque_();
    const allowed = config.environment === "production" || config.testEmails.indexOf(email) >= 0;
    const row = {
      challenge_id: challenge, email_hash: emailHash, code_hash: nrBookingHash_(config, challenge + ":" + code),
      member_no: member && allowed ? member.no : "", created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + NR_BOOKING.otpMinutes * 60000).toISOString(),
      attempts: "0", status: "PENDING", copy_token_hash: nrBookingHash_(config, "copy:" + copyToken)
    };
    const rowNumber = nrBookingSheet_(config, "challenges").getLastRow() + 1;
    nrBookingWrite_(config, "challenges", row, rowNumber);
    if (member && allowed) {
      try {
        const copyUrl = nrBookingCodeCopyUrl_(challenge, copyToken);
        MailApp.sendEmail({
          to: email, subject: "【9ROUND アリオ蘇我店】予約の本人確認コード",
          body: "予約の本人確認コードは " + code + " です。\n\n有効期限は10分です。\nこのコードを他の方に伝えないでください。\nお心当たりがない場合は、このメールを破棄してください。" + (copyUrl ? "\n\nコードをコピー（専用画面）:\n" + copyUrl : ""),
          htmlBody: '<div style="font-family:sans-serif;max-width:560px;color:#171719"><h2>9ROUND アリオ蘇我店</h2><p>予約の本人確認コードです。</p><p style="font-size:36px;font-weight:bold;letter-spacing:8px;background:#f4f4f5;padding:20px;text-align:center">' + code + '</p>' +
            (copyUrl ? '<p><a href="' + nrBookingHtml_(copyUrl) + '" style="display:inline-block;background:#e52535;color:white;padding:14px 24px;text-decoration:none;border-radius:8px;font-weight:bold">コードをコピー</a></p><p style="font-size:12px">専用画面を開き、「コピーする」を押してください。</p>' : '') +
            '<p>有効期限は10分です。コピー後、元の予約画面に戻って入力してください。</p><p>このコードやボタンのリンクを他の方に伝えないでください。お心当たりがない場合は、このメールを破棄してください。</p></div>',
          name: "9ROUND アリオ蘇我店", replyTo: "9round.ariosoga@gmail.com"
        });
      } catch (_) {
        row.status = "SEND_FAILED";
        nrBookingWrite_(config, "challenges", row, rowNumber);
        nrBookingError_("MAIL_FAILED", "確認メールを送信できませんでした。時間をあけて再度お試しください。");
      }
    }
    // Same response for unknown, suspended, ambiguous, and eligible addresses.
    return { challenge_id: challenge, expires_in: 600,
      message: "登録メールアドレスが確認できた場合、確認コードをお送りします。届かない場合は登録内容をスタッフにご確認ください。" };
  });
}

function nrBookingChallengeCode_(config, challenge) {
  return String(parseInt(nrBookingHash_(config, "otp:" + challenge).slice(0, 10), 16) % 1000000).padStart(6, "0");
}

function nrBookingCodeCopyUrl_(challenge, copyToken) {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const url = String(properties.ROUND9_BOOKING_CODE_COPY_URL || properties.ROUND9_BOOKING_MEMBER_URL || "");
  if (!/^https:\/\/[a-z0-9.-]+\/[^\s<>"#]*$/i.test(url)) return "";
  const page = /[?&]page=/.test(url) ? url.replace(/([?&])page=[^&]*/, "$1page=code-copy") : url + (url.indexOf("?") < 0 ? "?" : "&") + "page=code-copy";
  return page + "&challenge_id=" + encodeURIComponent(challenge) + "&copy_token=" + encodeURIComponent(copyToken);
}

function nrGet9RoundBookingCodeForCopy_(config, body) {
  const id = String(body.challenge_id || ""), copyToken = String(body.copy_token || "");
  const row = /^[a-f0-9]{64}$/.test(id) && /^[a-f0-9]{64}$/.test(copyToken) && nrBookingRows_(config, "challenges").find(function (r) { return r.challenge_id === id; });
  if (!row || row.status !== "PENDING" || Date.now() >= Date.parse(row.expires_at) || Number(row.attempts) >= NR_BOOKING.attempts ||
      row.copy_token_hash !== nrBookingHash_(config, "copy:" + copyToken)) {
    nrBookingError_("INVALID_COPY_LINK", "このコピー用リンクは無効か、有効期限が切れています。予約画面から確認コードを再送してください。");
  }
  const code = nrBookingChallengeCode_(config, id);
  if (row.code_hash !== nrBookingHash_(config, id + ":" + code)) nrBookingError_("INVALID_COPY_LINK", "確認コードを再送してください。");
  return { code: code, bookingUrl: String(PropertiesService.getScriptProperties().getProperties().ROUND9_BOOKING_MEMBER_URL || "") };
}

function nrVerify9RoundCode_(config, body) {
  return nrBookingLocked_(function () {
    const id = String(body.challenge_id || "");
    const code = String(body.code || "").trim();
    const row = nrBookingRows_(config, "challenges").find(function (r) { return r.challenge_id === id; });
    const now = new Date();
    if (!row || row.status !== "PENDING" || Date.parse(row.expires_at) <= now.getTime() || Number(row.attempts) >= NR_BOOKING.attempts) {
      nrBookingError_("INVALID_CODE", "確認コードが無効、または有効期限切れです。再送してお試しください。");
    }
    row.attempts = String(Number(row.attempts) + 1);
    if (!/^\d{6}$/.test(code) || nrBookingHash_(config, id + ":" + code) !== row.code_hash || !row.member_no) {
      if (Number(row.attempts) >= NR_BOOKING.attempts) row.status = "LOCKED";
      nrBookingWrite_(config, "challenges", row, row._row);
      nrBookingError_("INVALID_CODE", "確認コードを確認してください。5回間違えると再送が必要です。");
    }
    const member = nrBookingFindMember_(config, function (m) {
      return m.no === row.member_no && nrBookingHash_(config, "email:" + m.email) === row.email_hash;
    });
    if (!member) nrBookingError_("MEMBER_UNAVAILABLE", "現在の会員登録情報では予約できません。スタッフにご確認ください。");
    const token = nrBookingOpaque_();
    const expires = new Date(now.getTime() + NR_BOOKING.sessionHours * 3600000).toISOString();
    row.status = "USED";
    nrBookingWrite_(config, "challenges", row, row._row);
    nrBookingWrite_(config, "sessions", {
      token_hash: nrBookingHash_(config, "session:" + token), member_no: member.no,
      email_hash: row.email_hash, created_at: now.toISOString(), expires_at: expires, status: "ACTIVE"
    });
    return { session_token: token, expires_at: expires };
  });
}

function nrBookingSession_(config, body) {
  const token = String(body.session_token || "");
  if (!/^[a-f0-9]{64}$/.test(token)) nrBookingError_("SESSION_EXPIRED", "メールアドレスで本人確認をお願いします。");
  const hash = nrBookingHash_(config, "session:" + token);
  const session = nrBookingRows_(config, "sessions").find(function (row) {
    return row.token_hash === hash && row.status === "ACTIVE" && Date.parse(row.expires_at) > Date.now();
  });
  if (!session) nrBookingError_("SESSION_EXPIRED", "本人確認の有効期限が切れました。再度ご確認ください。");
  const member = nrBookingFindMember_(config, function (m) {
    return m.no === session.member_no && nrBookingHash_(config, "email:" + m.email) === session.email_hash;
  });
  if (!member) nrBookingError_("MEMBER_UNAVAILABLE", "現在の会員登録情報では予約できません。スタッフにご確認ください。");
  return { member: member, session: session };
}

function nrBookingDate_(value) {
  const date = String(value || "");
  const parsed = new Date(date + "T00:00:00+09:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) ||
      Utilities.formatDate(parsed, NR_BOOKING.timezone, "yyyy-MM-dd") !== date) {
    nrBookingError_("INVALID_DATE", "日付を正しく指定してください。");
  }
  return date;
}

function nrBookingRange_(config) {
  const today = Utilities.formatDate(new Date(), NR_BOOKING.timezone, "yyyy-MM-dd");
  return { from: today, to: Utilities.formatDate(new Date(Date.parse(today + "T00:00:00+09:00") + (config.days - 1) * 86400000), NR_BOOKING.timezone, "yyyy-MM-dd") };
}

function nrBookingRequireDate_(config, value) {
  const date = nrBookingDate_(value);
  const range = nrBookingRange_(config);
  if (date < range.from || date > range.to) nrBookingError_("DATE_OUT_OF_RANGE", "予約可能期間内の日付を選んでください。");
  return date;
}

function nrBookingTime_(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

function nrBookingDailySlots_(date) {
  const slots = [];
  [[615, 840], [975, 1245]].forEach(function (window) {
    for (let start = window[0]; start + 45 <= window[1]; start += 45) {
      const time = nrBookingTime_(start);
      slots.push({ slot_id: "DAILY:" + date + ":" + time, kind: "DAILY", date: date,
        start_time: time, end_time: nrBookingTime_(start + 45), capacity: 4, status: "OPEN" });
    }
  });
  return slots;
}

function nrBookingCount_(rows, slotId) {
  return rows.filter(function (r) { return r.slot_id === slotId && r.status === "CONFIRMED"; }).length;
}

function nrGet9RoundSlots_(config, body) {
  const auth = nrBookingSession_(config, body);
  const date = nrBookingRequireDate_(config, body.date);
  const rows = nrBookingRows_(config, "bookings");
  const blocks = nrBookingRows_(config, "blocks");
  const attendance = nrBookingRows_(config, "attendance");
  const slots = nrBookingDailySlots_(date).map(function (slot) {
    const mine = rows.find(function (r) { return r.slot_id === slot.slot_id && r.member_no === auth.member.no && r.status === "CONFIRMED"; });
    const count = nrBookingCount_(rows, slot.slot_id);
    const withinDeadline = nrBookingBeforeDeadline_(slot);
    const attended = !!mine && attendance.some(function (a) { return a.booking_id === mine.booking_id && a.status === "ATTENDED"; });
    const blocked = blocks.some(function (b) { return b.slot_id === slot.slot_id && b.status === "BLOCKED"; });
    // Explicit projection: no other member's identity ever enters this response.
    return { slot_id: slot.slot_id, kind: slot.kind, start_time: slot.start_time, end_time: slot.end_time,
      capacity: 4, booked_count: count, is_booked: !!mine, booking_id: mine ? mine.booking_id : "",
      blocked: blocked, available: withinDeadline && count < 4 && !mine && !blocked,
      can_cancel: withinDeadline && !!mine && !attended, can_change: withinDeadline && !!mine && !attended,
      attended: attended, deadline: nrBookingDeadline_(slot) };
  });
  return { date: date, range: nrBookingRange_(config), slots: slots,
    outstanding_count: nrBookingOutstanding_(config, auth.member.no, rows), booking_limit: NR_BOOKING.bookingLimit };
}

function nrCreate9RoundBooking_(config, body) {
  return nrBookingLocked_(function () {
    const auth = nrBookingSession_(config, body);
    const date = nrBookingRequireDate_(config, body.date);
    const slot = nrBookingDailySlots_(date).find(function (r) { return r.slot_id === body.slot_id; });
    if (!slot) nrBookingError_("INVALID_SLOT", "予約枠を選び直してください。");
    const rows = nrBookingRows_(config, "bookings");
    const mine = rows.find(function (r) {
      return r.slot_id === slot.slot_id && r.member_no === auth.member.no && r.status === "CONFIRMED";
    });
    if (mine) return { booking_id: mine.booking_id, already_booked: true };
    if (nrBookingOutstanding_(config, auth.member.no, rows) >= NR_BOOKING.bookingLimit) {
      nrBookingError_("BOOKING_LIMIT", "未消化の予約は10コマまでです。予約の変更・取消は予約一覧から行えます。");
    }
    nrBookingNotificationConfig_(config);
    if (nrBookingRows_(config, "blocks").some(function (r) { return r.slot_id === slot.slot_id && r.status === "BLOCKED"; })) {
      nrBookingError_("SLOT_BLOCKED", "この枠は予約受付を停止しています。他の枠をお選びください。");
    }
    nrBookingRequireDeadline_(slot);
    if (nrBookingCount_(rows, slot.slot_id) >= 4) nrBookingError_("SLOT_FULL", "この枠は満員になりました。他の枠をお選びください。");
    const id = nrBookingOpaque_();
    const booking = {
      booking_id: id, kind: "DAILY", slot_id: slot.slot_id, date: date,
      start_time: slot.start_time, end_time: slot.end_time,
      member_no: auth.member.no, member_name: auth.member.name,
      created_at: new Date().toISOString(), status: "CONFIRMED", cancelled_at: ""
    };
    nrBookingWrite_(config, "bookings", booking);
    return { booking_id: id, already_booked: false,
      notification_pending: nrBookingNotify_(config, "CONFIRMED", booking, auth.member) };
  });
}

function nrCancel9RoundBooking_(config, body) {
  return nrBookingLocked_(function () {
    const auth = nrBookingSession_(config, body);
    return nrBookingCancelForMember_(config, body, auth.member);
  });
}

function nrBookingCancelForMember_(config, body, member, staff) {
    const row = nrBookingRows_(config, "bookings").find(function (r) {
      return r.booking_id === String(body.booking_id || "") && r.member_no === member.no;
    });
    if (!row) nrBookingError_("BOOKING_NOT_FOUND", "ご本人の予約を確認できません。");
    if (row.status === "CANCELLED") return { cancelled: true };
    nrBookingRequireMutable_(config, row);
    nrBookingNotificationConfig_(config);
    row.status = "CANCELLED";
    row.cancelled_at = new Date().toISOString();
    nrBookingWrite_(config, "bookings", row, row._row);
    if (staff) nrBookingManagementAudit_(config, row.booking_id, "CANCELLED", staff, "");
    return { cancelled: true, notification_pending: nrBookingNotify_(config, "CANCELLED", row, member, null, staff) };
}

function nrLogout9RoundBooking_(config, body) {
  return nrBookingLocked_(function () {
    const hash = nrBookingHash_(config, "session:" + String(body.session_token || ""));
    const row = nrBookingRows_(config, "sessions").find(function (r) { return r.token_hash === hash; });
    if (row) { row.status = "REVOKED"; nrBookingWrite_(config, "sessions", row, row._row); }
    return { logged_out: true };
  });
}

function nrBookingStaff_(config, body, management) {
  const auth = nrBookingVerifiedStaff_(config, body);
  if (management && ["ADMIN", "MANAGER"].indexOf(auth.permission) < 0) {
    nrBookingError_("FORBIDDEN", "管理者またはマネージャーの権限が必要です。");
  }
  return auth;
}

function nrGet9RoundBoard_(config, body) {
  const auth = nrBookingStaff_(config, body, false);
  const date = nrBookingDate_(body.date);
  const rows = nrBookingRows_(config, "bookings");
  const blocks = nrBookingRows_(config, "blocks");
  const attendance = nrBookingRows_(config, "attendance");
  const fighters = nrBookingFighterNames_(config);
  const trials = nrBookingRows_(config, "trials").filter(function (r) { return r.date === date; });
  const slots = nrBookingDailySlots_(date).concat(trials);
  const canManage = ["ADMIN", "MANAGER"].indexOf(auth.permission) >= 0;
  return { date: date, can_manage: canManage,
    pending_notifications: canManage ? nrBookingRows_(config, "mail").filter(function (m) { return m.status !== "SENT"; }).length : 0,
    slots: slots.map(function (slot) {
    return { slot_id: slot.slot_id, kind: slot.kind, date: date, title: slot.title || "デイリーワークアウト",
      start_time: slot.start_time, end_time: slot.end_time, capacity: Number(slot.capacity),
      status: slot.kind === "DAILY" && blocks.some(function (b) { return b.slot_id === slot.slot_id && b.status === "BLOCKED"; }) ? "BLOCKED" : slot.status,
      booked_count: nrBookingCount_(rows, slot.slot_id),
      available: slot.kind === "DAILY" && nrBookingBeforeDeadline_(slot) && nrBookingCount_(rows, slot.slot_id) < Number(slot.capacity) &&
        !blocks.some(function (b) { return b.slot_id === slot.slot_id && b.status === "BLOCKED"; }),
      members: rows.filter(function (r) { return r.slot_id === slot.slot_id && r.status === "CONFIRMED"; })
        .map(function (r) {
          const checkin = attendance.find(function (a) { return a.booking_id === r.booking_id && a.status === "ATTENDED"; });
          return { booking_id: r.booking_id, member_no: r.member_no, name: r.member_name,
            fighter_name: fighters[r.member_no] || "", attended: !!checkin,
            can_cancel: canManage && nrBookingBeforeDeadline_(r) && !checkin,
            can_change: canManage && nrBookingBeforeDeadline_(r) && !checkin,
            checked_in_at: checkin ? checkin.checked_in_at : "" };
        })
    };
  }).sort(function (a, b) { return a.start_time.localeCompare(b.start_time) || a.kind.localeCompare(b.kind); }) };
}

function nrSet9RoundBlock_(config, body) {
  const auth = nrBookingStaff_(config, body, true);
  if (typeof body.blocked !== "boolean") nrBookingError_("INVALID_BLOCK", "ブロックまたは解除を指定してください。");
  return nrBookingLocked_(function () {
    const date = nrBookingRequireDate_(config, body.date);
    const ids = Array.isArray(body.slot_ids) ? body.slot_ids : [body.slot_id];
    const valid = nrBookingDailySlots_(date);
    if (!ids.length || ids.length > 11 || ids.some(function (id) { return !valid.some(function (s) { return s.slot_id === id; }); })) {
      nrBookingError_("INVALID_SLOT", "対象日のデイリーワークアウト枠を指定してください。");
    }
    const rows = nrBookingRows_(config, "blocks");
    Array.from(new Set(ids)).forEach(function (id) {
      const slot = valid.find(function (s) { return s.slot_id === id; });
      const old = rows.find(function (r) { return r.slot_id === id; });
      nrBookingWrite_(config, "blocks", {
        slot_id: id, date: date, start_time: slot.start_time, status: body.blocked ? "BLOCKED" : "OPEN",
        updated_by: auth.staff_code, updated_at: new Date().toISOString()
      }, old ? old._row : undefined);
    });
    return { blocked: body.blocked, count: new Set(ids).size };
  });
}

/** Trial slots are independent records; members cannot book them via the DAILY API. */
function nrSave9RoundTrial_(config, body) {
  const auth = nrBookingStaff_(config, body, true);
  return nrBookingLocked_(function () {
    const date = nrBookingRequireDate_(config, body.date);
    const time = String(body.start_time || "");
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) nrBookingError_("INVALID_SLOT", "体験枠の開始時刻を確認してください。");
    const parts = time.split(":").map(Number);
    const start = parts[0] * 60 + parts[1];
    if (!((start >= 615 && start + 45 <= 840) || (start >= 975 && start + 45 <= 1245))) {
      nrBookingError_("INVALID_SLOT", "45分の体験枠を営業時間内に設定してください。");
    }
    if (Date.parse(date + "T" + time + ":00+09:00") <= Date.now()) nrBookingError_("SLOT_STARTED", "未来の体験枠を指定してください。");
    const capacity = Number(body.capacity === undefined ? 1 : body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) nrBookingError_("INVALID_CAPACITY", "体験枠の定員は1〜4名で設定してください。");
    const title = String(body.title || "体験").trim();
    if (!title || title.length > 60) nrBookingError_("INVALID_TITLE", "体験枠名は60文字以内で入力してください。");
    const status = String(body.status || "OPEN");
    if (["OPEN", "CLOSED"].indexOf(status) < 0) nrBookingError_("INVALID_STATUS", "体験枠の受付状態を確認してください。");
    const rows = nrBookingRows_(config, "trials");
    const id = String(body.slot_id || "");
    const old = id ? rows.find(function (r) { return r.slot_id === id; }) : null;
    if (id && !old) nrBookingError_("INVALID_SLOT", "体験枠が見つかりません。");
    if (rows.some(function (r) { return r.slot_id !== id && r.date === date && r.start_time === time && r.status === "OPEN" && status === "OPEN"; })) {
      nrBookingError_("DUPLICATE_TRIAL", "同じ日時の体験枠はすでにあります。");
    }
    const booked = old ? nrBookingCount_(nrBookingRows_(config, "bookings"), old.slot_id) : 0;
    if (booked > capacity || (booked && (old.date !== date || old.start_time !== time))) {
      nrBookingError_("TRIAL_HAS_BOOKINGS", "予約済みの体験枠の日時・定員を変更できません。");
    }
    const slot = { slot_id: old ? old.slot_id : "TRIAL:" + nrBookingOpaque_(), kind: "TRIAL", date: date,
      start_time: time, end_time: nrBookingTime_(start + 45), capacity: capacity, title: title, status: status,
      created_by: old ? old.created_by : auth.staff_code, updated_at: new Date().toISOString() };
    nrBookingWrite_(config, "trials", slot, old ? old._row : undefined);
    return { slot_id: slot.slot_id };
  });
}

/** All state changes use POST. Email links only carry an opaque booking ID. */
function round9BookingApi_(action, body) {
  try {
    const config = nrBookingConfig_();
    const handlers = {
      request9RoundBookingCode: nrRequest9RoundCode_,
      verify9RoundBookingCode: nrVerify9RoundCode_,
      get9RoundWorkoutSlots: nrGet9RoundSlots_,
      create9RoundWorkoutBooking: nrCreate9RoundBooking_,
      cancel9RoundWorkoutBooking: nrCancel9RoundBooking_,
      reschedule9RoundWorkoutBooking: nrReschedule9RoundBooking_,
      get9RoundMemberBookings: nrGet9RoundMemberBookings_,
      get9RoundFighterProfile: nrGet9RoundFighterProfile_,
      save9RoundFighterProfile: nrSave9RoundFighterProfile_,
      get9RoundManagedBooking: nrGet9RoundManagedBooking_,
      cancel9RoundManagedBooking: nrCancel9RoundManagedBooking_,
      reschedule9RoundManagedBooking: nrReschedule9RoundManagedBooking_,
      get9RoundMemberPass: nrGet9RoundMemberPass_,
      rotate9RoundMemberPass: nrRotate9RoundMemberPass_,
      checkIn9RoundMember: nrCheckIn9RoundMember_,
      retry9RoundBookingNotifications: nrRetry9RoundNotifications_,
      logout9RoundBooking: nrLogout9RoundBooking_,
      get9RoundBookingBoard: nrGet9RoundBoard_,
      save9RoundTrialSlot: nrSave9RoundTrial_,
      set9RoundWorkoutBlock: nrSet9RoundBlock_
    };
    if (!handlers[action]) nrBookingError_("ACTION_NOT_FOUND", "指定された操作は利用できません。");
    return successResponse(handlers[action](config, body || {}));
  } catch (error) {
    const known = !!error.nrCode;
    return errorResponse(known ? error.message : "処理を完了できませんでした。時間をあけて再度お試しください。", error.nrCode || "BOOKING_ERROR");
  }
}
