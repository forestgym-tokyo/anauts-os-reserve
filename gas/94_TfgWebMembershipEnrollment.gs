/**
 * The Forest Gym: public WEB enrollment handled by the same A-nauts OS
 * Apps Script deployment and ScriptLock as createTourSameDayEnrollment().
 *
 * ROLLOUT: disabled until script property TFG_WEB_JOIN_ENABLED is "true".
 * Never enable before routing the WEB form away from the legacy GAS endpoint
 * and verifying both routes. Do not count form submission as a paid CV.
 *
 * Member master status: "ACT" = existing active member;
 * blank status + historical name = withdrawn, entitled to a NEW member number.
 */
const TFW_FORM_SPREADSHEET_ID = "1wf1NaznPKXCrkr6lNhxSrh82WGVazcT-D8vt1z9aQkw";
const TFW_MASTER_SPREADSHEET_ID = "1kLK6Dbe05Uqd0pxnoKX8MbHpQH9AgDnVygwzDPzyXvw";
const TFW_ADMIN_EMAIL = "info@theforestgym.com";
const TFW_FORM_SHEET_NAME = "membership_form";
const TFW_MASTER_SHEET_NAME = "master";
const TFW_FORM_MEMBER_COL = 19;
const TFW_FORM_APPLICATION_COL = 20;
const TFW_FORM_STATUS_COL = 21;
const TFW_FORM_LAST_COL = 28;
const TFW_FORM_HEADERS = [
  "送信日時", "姓", "名", "セイ", "メイ", "生年月日", "電話番号",
  "メールアドレス", "郵便番号", "住所", "番地・建物名",
  "キャンペーン", "会員種別", "利用開始日", "特典", "初回金額",
  "決済URL", "顔写真URL", "割当会員番号", "申込みID", "登録状態",
  "gclid", "gbraid", "wbraid", "utm_source", "utm_medium",
  "utm_campaign", "utm_content"
];

function tfwNorm_(value) {
  return String(value == null ? "" : value).normalize("NFKC")
    .replace(/[\s\u3000]+/g, "").toLowerCase();
}
function tfwEmail_(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}
function tfwText_(value, limit) {
  return String(value == null ? "" : value).trim().slice(0, limit || 512);
}
function tfwError_(code, message) {
  const e = new Error(message || code);
  e.tfwCode = code;
  return e;
}
function tfwEnabled_() {
  return PropertiesService.getScriptProperties()
    .getProperty("TFG_WEB_JOIN_ENABLED") === "true";
}
function tfwJson_(result) {
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
function tfwCacheResult_(id, result) {
  // Do not expose member number, name, email, or payment details in GET.
  const publicResult = {
    ok: Boolean(result.ok),
    code: String(result.code || ""),
    duplicate: Boolean(result.duplicate)
  };
  try {
    CacheService.getScriptCache().put(
      "tfw_join_" + id, JSON.stringify(publicResult), 600
    );
  } catch (e) {
    console.error("TFW result cache failed: " + e);
  }
}
function tfwRespond_(id, result) {
  if (id) tfwCacheResult_(id, result);
  return tfwJson_(result);
}

/** Anonymous GET: random application ID is a short-lived receipt capability. */
function tfwWebEnrollmentStatus_(params) {
  params = params || {};
  const cb = tfwText_(params.callback, 90);
  const id = tfwText_(params.applicationId, 160);
  if (!/^tfgJoinCb_[A-Za-z0-9_]{8,64}$/.test(cb) ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    return ContentService.createTextOutput("Invalid receipt request")
      .setMimeType(ContentService.MimeType.TEXT);
  }
  let status = {ok: false, pending: true};
  try {
    const raw = CacheService.getScriptCache().get("tfw_join_" + id);
    if (raw) status = JSON.parse(raw);
  } catch (e) {
    console.error("TFW receipt lookup failed: " + e);
  }
  return ContentService.createTextOutput(cb + "(" + JSON.stringify(status) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function tfwValidate_(body) {
  if (!body || typeof body !== "object") {
    throw tfwError_("INVALID_REQUEST", "申込み内容がありません。");
  }
  const id = tfwText_(body.applicationId, 150);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    throw tfwError_("INVALID_APPLICATION_ID", "申込みIDが不正です。");
  }
  const fullName = tfwText_((body.lastName || "") + " " + (body.firstName || ""), 160);
  const email = tfwEmail_(body.email);
  if (!tfwNorm_(fullName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw tfwError_("INVALID_IDENTITY", "氏名とメールアドレスを確認してください。");
  }
  const plan = tfwText_(body.plan, 60);
  if (!["REGULAR", "平日DAY", "DAY", "NIGHT365"].includes(plan)) {
    throw tfwError_("INVALID_PLAN", "会員種別が不正です。");
  }
  const campaign = tfwText_(body.campaign, 40);
  if (!["利用する", "利用しない"].includes(campaign)) {
    throw tfwError_("INVALID_CAMPAIGN", "キャンペーン区分が不正です。");
  }
  const startDate = tfwText_(body.startDate, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      isNaN(new Date(startDate + "T00:00:00").getTime())) {
    throw tfwError_("INVALID_START_DATE", "利用開始日が不正です。");
  }
  const paymentUrl = tfwText_(body.paymentUrl, 3000);
  // The fragment may contain attribution; the origin/path must be approved.
  const allowedPayment = /^https:\/\/getsugaku-panda\.jp\/subscription\/apply\/(17643|17677|17678|17679|17680|17681)(?:[#?]|$)/;
  if (!allowedPayment.test(paymentUrl)) {
    throw tfwError_("INVALID_PAYMENT_URL", "決済URLが不正です。");
  }
  const urlByPlan = {
    REGULAR: campaign === "利用する" ? "17643" : "17679",
    "平日DAY": campaign === "利用する" ? "17677" : "17680",
    DAY: campaign === "利用する" ? "17677" : "17680",
    NIGHT365: campaign === "利用する" ? "17678" : "17681"
  };
  if (paymentUrl.indexOf("/" + urlByPlan[plan]) === -1) {
    throw tfwError_("PAYMENT_PLAN_MISMATCH", "申込みプランと決済先が一致しません。");
  }
  return {
    id: id, name: fullName, email: email, plan: plan, campaign: campaign,
    startDate: startDate, paymentUrl: paymentUrl
  };
}

function tfwFormSheet_() {
  const ss = SpreadsheetApp.openById(TFW_FORM_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TFW_FORM_SHEET_NAME);
  if (!sheet) throw tfwError_("FORM_MISSING", "WEB入会の記録シートがありません。");
  if (sheet.getMaxColumns() < TFW_FORM_LAST_COL) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(),
      TFW_FORM_LAST_COL - sheet.getMaxColumns());
  }
  for (let col = 19; col <= TFW_FORM_LAST_COL; col++) {
    const cell = sheet.getRange(1, col);
    const current = tfwText_(cell.getValue(), 100);
    if (current && current !== TFW_FORM_HEADERS[col - 1]) {
      throw tfwError_("FORM_COLUMN_CONFLICT",
        "会員申込みシートの列" + col + "は他の用途で使用中です。");
    }
    if (!current) cell.setValue(TFW_FORM_HEADERS[col - 1]);
  }
  return sheet;
}
function tfwFindForm_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, TFW_FORM_STATUS_COL).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (tfwText_(rows[i][TFW_FORM_APPLICATION_COL - 1], 150) === id) {
      return {number: i + 2, values: rows[i]};
    }
  }
  return null;
}
function tfwMasterData_() {
  const sheet = SpreadsheetApp.openById(TFW_MASTER_SPREADSHEET_ID)
    .getSheetByName(TFW_MASTER_SHEET_NAME);
  if (!sheet) throw tfwError_("MASTER_MISSING", "masterシートがありません。");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw tfwError_("MASTER_EMPTY", "会員番号がありません。");
  const width = Math.max(sheet.getLastColumn(), 17);
  const rows = sheet.getRange(1, 1, lastRow, width).getValues();
  const headers = {};
  rows[0].forEach(function(v, i) {
    const label = String(v == null ? "" : v).trim();
    if (label && headers[label] == null) headers[label] = i;
  });
  const required = ["memberNo", "name", "email", "status", "note",
    "プラン", "キャンペーン", "特典", "スタート日", "初期費用",
    "初月日割り会費"];
  const missing = required.filter(function(name) {return headers[name] == null;});
  if (missing.length) throw tfwError_("MASTER_SCHEMA", missing.join(","));
  return {sheet: sheet, rows: rows, col: headers};
}
function tfwPreviousMaster_(master, id) {
  const marker = "WEB_JOIN_ID=" + id;
  for (let i = 1; i < master.rows.length; i++) {
    const row = master.rows[i];
    const note = String(row[master.col.note] || "");
    if (note.split(/[\r\n]/).indexOf(marker) >= 0) {
      return {number: i + 1, row: row};
    }
  }
  return null;
}
function tfwExistingMember_(master, identity) {
  for (let i = 1; i < master.rows.length; i++) {
    const row = master.rows[i];
    if (tfwText_(row[master.col.status], 12).toUpperCase() !== "ACT") continue;
    if (tfwEmail_(row[master.col.email]) !== identity.email) continue;
    const sameName = tfwNorm_(row[master.col.name]) === tfwNorm_(identity.name);
    if (sameName) throw tfwError_("ACTIVE_MEMBER_EXISTS", "在籍中のため新規発行できません。");
    // Different name on an active email is ambiguous, so staff must review.
    const dupOk = master.col.dupOk != null &&
      (row[master.col.dupOk] === true ||
        ["TRUE", "YES", "1"].indexOf(String(row[master.col.dupOk]).toUpperCase()) >= 0);
    if (!dupOk) throw tfwError_("ACTIVE_EMAIL_IN_USE", "使用中のメールアドレスです。");
  }
}
function tfwFreeMasterRow_(master) {
  for (let i = master.rows.length - 1; i >= 1; i--) {
    const row = master.rows[i];
    if (tfwText_(row[master.col.memberNo], 40) &&
        !tfwText_(row[master.col.name], 100) &&
        !tfwText_(row[master.col.status], 32)) {
      return {number: i + 1, row: row};
    }
  }
  throw tfwError_("NO_MEMBER_NUMBER", "空き会員番号がありません。");
}
function tfwIsSameApplication_(record, data) {
  const x = record.values;
  return tfwNorm_((x[1] || "") + " " + (x[2] || "")) === tfwNorm_(data.name) &&
    tfwEmail_(x[7]) === data.email &&
    tfwText_(x[12], 80) === data.plan &&
    tfwText_(x[13], 40) === data.startDate;
}
function tfwAttribution_(body) {
  const a = body.adAttribution && typeof body.adAttribution === "object"
    ? body.adAttribution : {};
  return ["gclid","gbraid","wbraid","utm_source","utm_medium","utm_campaign","utm_content"]
    .map(function(k) {return tfwText_(a[k], 500);});
}
function tfwNewFormRow_(body, identity) {
  const row = [
    new Date(), body.lastName || "", body.firstName || "",
    body.lastKana || "", body.firstKana || "", body.birthDate || "",
    body.phone || "", body.email || "", body.postal || "",
    body.address || "", body.addressDetail || "", body.campaign || "",
    identity.plan, identity.startDate, body.benefit || "",
    body.firstTotal || "", identity.paymentUrl, body.facePhotoUrl || "",
    "", identity.id, "受付中"
  ];
  return row.concat(tfwAttribution_(body));
}
function tfwCommitMaster_(master, body, identity, free) {
  const col = master.col, original = free.row.slice();
  const row = original.slice();
  function set(label, value) {row[col[label]] = value;}
  const total = Number(String(body.firstTotal || "").replace(/[^\d.-]/g, "")) || 0;
  const initial = identity.campaign === "利用する" ? 0 : 8800;
  const note = tfwText_(row[col.note], 1000);
  const marker = "WEB_JOIN_ID=" + identity.id;
  set("name", identity.name);
  set("email", identity.email);
  set("status", "ACT");
  set("note", note ? note + "\n" + marker : marker);
  set("プラン", identity.plan);
  set("キャンペーン", identity.campaign);
  set("特典", identity.campaign === "利用する" ? tfwText_(body.benefit, 100) : "特典なし");
  set("スタート日", identity.startDate);
  set("初期費用", initial);
  set("初月日割り会費", Math.max(0, total - initial));
  // One contiguous write includes idempotency marker and membership status.
  // Do not overwrite the numbering in column A or columns after M.
  const last = Math.max(col["初月日割り会費"], col.note, col.status, col.email) + 1;
  master.sheet.getRange(free.number, 2, 1, last - 1)
    .setValues([row.slice(1, last)]);
  SpreadsheetApp.flush();
  return tfwText_(row[col.memberNo], 40);
}
function tfwRecordMember_(sheet, formRow, memberNo, id) {
  sheet.getRange(formRow, TFW_FORM_MEMBER_COL, 1, 3)
    .setValues([[memberNo, id, "登録済"]]);
  SpreadsheetApp.flush();
}

function tfwSendAdminNotice_(body, memberNo) {
  const message = [
    "WEB入会フォームを受け付け、A-nauts OSで会員番号を割り当てました。",
    "※決済完了ではありません。決済確認まで広告CVに計上しないでください。",
    "会員番号: " + memberNo,
    "氏名: " + [body.lastName || "", body.firstName || ""].join(" "),
    "メール: " + String(body.email || ""),
    "会員種別: " + String(body.plan || ""),
    "スタート日: " + String(body.startDate || ""),
    "申込みID: " + String(body.applicationId || "")
  ].join("\n");
  try {
    MailApp.sendEmail({
      to: TFW_ADMIN_EMAIL,
      subject: "【The Forest Gym】新規入会フォーム入力通知",
      body: message
    });
  } catch (e) {
    console.error("WEB入会管理メール送信に失敗: " + e);
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty("TFG_WEB_JOIN_LINE_CHANNEL_ACCESS_TOKEN");
    const userId = props.getProperty("TFG_WEB_JOIN_LINE_USER_ID");
    if (!token || !userId) return;
    const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: {Authorization: "Bearer " + token},
      payload: JSON.stringify({
        to: userId,
        messages: [{type: "text", text:
          "【The Forest Gym】WEB入会申込み\n会員番号: " + memberNo +
          "\n氏名: " + [body.lastName || "", body.firstName || ""].join(" ") +
          "\nGmailの入会通知をご確認ください。"}]
      })
    });
    if (response.getResponseCode() >= 300) {
      console.error("WEB入会LINE通知HTTP " + response.getResponseCode());
    }
  } catch (e) {
    console.error("WEB入会LINE通知に失敗: " + e);
  }
}

/** Called by the existing doPost(e) router, action=submitTfgWebMembership. */
function tfwSubmitWebEnrollment_(body) {
  const id = tfwText_(body && body.applicationId, 150);
  let identity;
  try {
    identity = tfwValidate_(body);
    if (!tfwEnabled_()) {
      throw tfwError_("FEATURE_DISABLED", "WEB入会の新受付経路は未公開です。");
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(30000); // Shared with A-nauts OS tour enrollments.
    let assigned = "";
    let duplicate = false;
    try {
      const form = tfwFormSheet_();
      const master = tfwMasterData_();
      let existingForm = tfwFindForm_(form, identity.id);
      if (existingForm && !tfwIsSameApplication_(existingForm, identity)) {
        throw tfwError_("APPLICATION_ID_CONFLICT", "異なる申込み内容でIDが使用されています。");
      }
      const previousMaster = tfwPreviousMaster_(master, identity.id);
      if (previousMaster) {
        if (tfwNorm_(previousMaster.row[master.col.name]) !== tfwNorm_(identity.name) ||
            tfwEmail_(previousMaster.row[master.col.email]) !== identity.email) {
          throw tfwError_("APPLICATION_ID_CONFLICT", "同じIDが別の会員情報と紐づいています。");
        }
        assigned = tfwText_(previousMaster.row[master.col.memberNo], 40);
        duplicate = true;
      } else if (existingForm && tfwText_(existingForm.values[TFW_FORM_MEMBER_COL - 1], 40)) {
        // Legacy rows from an earlier deployment may have member numbers
        // without master notes. Do not allocate another number automatically.
        throw tfwError_("MEMBER_LINK_NEEDS_REVIEW", "申込みと会員マスターの照合が必要です。");
      } else {
        tfwExistingMember_(master, identity);
        if (!existingForm) {
          form.appendRow(tfwNewFormRow_(body, identity));
          existingForm = tfwFindForm_(form, identity.id);
          if (!existingForm) throw tfwError_("FORM_WRITE_FAILED", "受付記録を保存できませんでした。");
        }
        const free = tfwFreeMasterRow_(master);
        assigned = tfwCommitMaster_(master, body, identity, free);
      }
      if (!existingForm) {
        form.appendRow(tfwNewFormRow_(body, identity));
        existingForm = tfwFindForm_(form, identity.id);
        if (!existingForm) throw tfwError_("FORM_WRITE_FAILED", "受付記録を保存できませんでした。");
      }
      tfwRecordMember_(form, existingForm.number, assigned, identity.id);
    } finally {
      lock.releaseLock();
    }
    tfwCacheResult_(identity.id, {ok:true, duplicate: duplicate});
    if (!duplicate) tfwSendAdminNotice_(body, assigned);
    return tfwJson_({ok:true, duplicate:duplicate});
  } catch (err) {
    const code = err && err.tfwCode ? err.tfwCode : "REGISTRATION_ERROR";
    console.error("TFW enrollment error " + code + ": " + err);
    return tfwRespond_(id, {ok:false, code:code});
  }
}
