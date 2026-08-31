/**
 * ============================================================
 * A-nauts OS Reserve
 * 87_9RoundSuspensionToken.gs
 * 9ROUND アリオ蘇我店 休会届 - 72時間有効の個別URL
 * ============================================================
 */

const ROUND9_SUSPENSION_TOKEN_CONFIG = Object.freeze({
  TTL_HOURS: 72,
  TOKEN_LOG_SHEET_DEFAULT: "休会URL発行",
  PUBLIC_URL_DEFAULT: "https://forestgym-tokyo.github.io/anauts-os-reserve/9round-suspension/"
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("9ROUND休会届")
    .addItem("選択会員の休会URLを発行", "issue9RoundSuspensionUrlForActiveRow")
    .addToUi();
}

function issue9RoundSuspensionUrlForActiveRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("9ROUND_Memberスプレッドシートから実行してください。");

  const masterSheet = get9RoundMemberMasterSheet_();
  const activeSheet = SpreadsheetApp.getActiveSheet();
  const activeRange = SpreadsheetApp.getActiveRange();
  if (!activeRange || activeSheet.getSheetId() !== masterSheet.getSheetId()) {
    throw new Error("9ROUND会員マスターの対象会員行を選択してから実行してください。");
  }

  const rowNumber = activeRange.getRow();
  if (rowNumber < 2) throw new Error("見出し行ではなく、対象会員の行を選択してください。");

  const values = masterSheet.getDataRange().getDisplayValues();
  const headers = values[0].map(normalize9RoundHeader_);
  const row = values[rowNumber - 1];
  const memberNoIndex = headers.indexOf("会員番号");
  const emailIndex = headers.indexOf("メールアドレス");
  if (memberNoIndex < 0 || emailIndex < 0) {
    throw new Error("9ROUND会員マスターに会員番号またはメールアドレス列がありません。");
  }

  const memberNo = normalize9RoundMemberNo_(row[memberNoIndex]);
  const email = normalize9RoundEmail_(row[emailIndex]);
  const member = find9RoundMember_(memberNo, email);
  if (!member) throw new Error("選択行の会員情報を確認できません。");
  if (!is9RoundSuspensionStatusActive_(member.contractStatus)) {
    throw new Error("現在の会員ステータスでは休会URLを発行できません。");
  }

  const tokenSheet = getOrCreate9RoundSuspensionTokenSheet_(ss);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let rawToken;
  let expiresAt;
  try {
    invalidateExisting9RoundSuspensionTokens_(tokenSheet, member.memberNo);
    rawToken = create9RoundSuspensionToken_();
    const tokenHash = hash9RoundSuspensionToken_(rawToken);
    const now = new Date();
    expiresAt = new Date(now.getTime() + ROUND9_SUSPENSION_TOKEN_CONFIG.TTL_HOURS * 60 * 60 * 1000);
    const issueId =
      "9RU-" +
      Utilities.formatDate(now, ROUND9_SUSPENSION_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss") +
      "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");

    tokenSheet.appendRow([
      issueId,
      now,
      expiresAt,
      member.memberNo,
      member.name,
      member.email,
      tokenHash,
      "有効",
      "",
      ""
    ]);
    const addedRow = tokenSheet.getLastRow();
    tokenSheet.getRange(addedRow, 2, 1, 2).setNumberFormat("yyyy/mm/dd hh:mm:ss");
  } finally {
    lock.releaseLock();
  }

  const publicUrl = ROUND9_SUSPENSION_TOKEN_CONFIG.PUBLIC_URL_DEFAULT;
  const url = publicUrl + "?token=" + encodeURIComponent(rawToken);
  show9RoundSuspensionUrlDialog_(url, member, expiresAt);
  return url;
}

function verify9RoundSuspensionToken_(body) {
  try {
    const tokenInfo = resolve9RoundSuspensionToken_(body && body.token);
    const member = tokenInfo.member;
    return round9Json_({
      ok: true,
      data: Object.assign({
        memberName: member.name,
        course: member.course,
        contractStatus: member.contractStatus,
        expiresAt: Utilities.formatDate(
          tokenInfo.expiresAt,
          ROUND9_SUSPENSION_CONFIG.TIMEZONE,
          "yyyy/MM/dd HH:mm"
        )
      }, build9RoundSuspensionOptionData_(member.memberNo))
    });
  } catch (error) {
    console.error("verify9RoundSuspensionToken_", error);
    return round9Json_({
      ok: false,
      code: error && error.code ? error.code : "ROUND9_TOKEN_VERIFY_ERROR",
      message: error && error.message ? error.message : "専用URLを確認できませんでした。"
    });
  }
}

function submit9RoundSuspensionToken_(body) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    if (!body || body.confirmFee !== true || body.confirmPeriod !== true || body.confirmDeadline !== true) {
      throw new Error("確認事項すべてへの同意が必要です。");
    }

    const months = Number(body.months);
    if (!Number.isInteger(months) || months < ROUND9_SUSPENSION_CONFIG.MIN_MONTHS || months > ROUND9_SUSPENSION_CONFIG.MAX_MONTHS) {
      throw new Error("休会期間は1〜6か月で選択してください。");
    }

    lock.waitLock(10000);
    locked = true;

    const tokenInfo = resolve9RoundSuspensionToken_(body.token);
    const member = tokenInfo.member;
    const startMonth = normalize9RoundSuspensionMonth_(body.startMonth);
    const expectedStartMonth = get9RoundSuspensionStartMonthForMember_(member.memberNo);
    if (startMonth !== expectedStartMonth) {
      throw new Error("休会開始月が最新の受付条件と一致しません。ページを再読み込みしてお手続きください。");
    }

    const application = create9RoundSuspensionApplication_(member, startMonth, months);
    mark9RoundSuspensionTokenUsed_(
      tokenInfo.sheet,
      tokenInfo.rowNumber,
      application.appliedAt,
      application.applicationId
    );

    lock.releaseLock();
    locked = false;

    const warnings = [];
    try {
      send9RoundSuspensionMemberMail_(member, application);
    } catch (error) {
      console.error("send9RoundSuspensionMemberMail_", error);
      warnings.push("会員向け受付メールの送信に失敗しました");
    }

    try {
      send9RoundSuspensionAdminMail_(member, application);
    } catch (error) {
      console.error("send9RoundSuspensionAdminMail_", error);
      warnings.push("管理者通知メールの送信に失敗しました");
    }

    return round9Json_({
      ok: true,
      data: Object.assign({}, application, {mailWarning: warnings.join("／")}),
      message: warnings.length
        ? "休会申請は受け付けました。メール送信の一部に失敗したため、スタッフへお申し出ください。"
        : "休会申請を受け付けました。登録メールアドレスへ受付メールを送信しました。"
    });
  } catch (error) {
    if (locked) {
      try { lock.releaseLock(); } catch (_) {}
    }
    console.error("submit9RoundSuspensionToken_", error);
    return round9Json_({
      ok: false,
      code: error && error.code ? error.code : "ROUND9_TOKEN_SUBMIT_ERROR",
      message: error && error.message ? error.message : "休会申請の受付中にエラーが発生しました。"
    });
  }
}

function resolve9RoundSuspensionToken_(rawToken) {
  const token = String(rawToken || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    const error = new Error("この休会URLは無効です。店舗から送付された専用URLをご利用ください。");
    error.code = "TOKEN_INVALID";
    throw error;
  }

  const ss = get9RoundMasterSpreadsheet_();
  const sheet = getOrCreate9RoundSuspensionTokenSheet_(ss);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    const error = new Error("この休会URLは無効です。店舗へお問い合わせください。");
    error.code = "TOKEN_NOT_FOUND";
    throw error;
  }

  const headers = values[0].map(function(value) { return String(value).trim(); });
  const index = {};
  headers.forEach(function(header, i) { index[header] = i; });
  ["有効期限", "会員番号", "メールアドレス", "トークンハッシュ", "ステータス"].forEach(function(header) {
    if (typeof index[header] !== "number") throw new Error("休会URL発行シートに必要な列「" + header + "」がありません。");
  });

  const hash = hash9RoundSuspensionToken_(token);
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[index["トークンハッシュ"]] || "") !== hash) continue;

    const status = String(row[index["ステータス"]] || "").trim();
    if (status === "使用済") {
      const error = new Error("この休会URLはすでに使用されています。再度お手続きが必要な場合は店舗へお問い合わせください。");
      error.code = "TOKEN_USED";
      throw error;
    }
    if (status !== "有効") {
      const error = new Error("この休会URLは無効になっています。新しいURLの発行を店舗へご依頼ください。");
      error.code = "TOKEN_INVALIDATED";
      throw error;
    }

    const expiresAt = parse9RoundSuspensionTokenDate_(row[index["有効期限"]]);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      const error = new Error("この休会URLの有効期限は切れています。新しいURLの発行を店舗へご依頼ください。");
      error.code = "TOKEN_EXPIRED";
      throw error;
    }

    const memberNo = normalize9RoundMemberNo_(row[index["会員番号"]]);
    const email = normalize9RoundEmail_(row[index["メールアドレス"]]);
    const member = find9RoundMember_(memberNo, email);
    if (!member) {
      const error = new Error("会員情報を確認できませんでした。店舗へお問い合わせください。");
      error.code = "MEMBER_NOT_FOUND";
      throw error;
    }
    if (!is9RoundSuspensionStatusActive_(member.contractStatus)) {
      const error = new Error("現在の会員ステータスではオンラインで休会申請を受け付けできません。店舗までお問い合わせください。");
      error.code = "MEMBER_NOT_ACTIVE";
      throw error;
    }

    return {sheet: sheet, rowNumber: i + 1, expiresAt: expiresAt, member: member};
  }

  const error = new Error("この休会URLは無効です。店舗から送付された専用URLをご利用ください。");
  error.code = "TOKEN_NOT_FOUND";
  throw error;
}

function getOrCreate9RoundSuspensionTokenSheet_(ss) {
  let sheet = ss.getSheetByName(ROUND9_SUSPENSION_TOKEN_CONFIG.TOKEN_LOG_SHEET_DEFAULT);
  if (!sheet) sheet = ss.insertSheet(ROUND9_SUSPENSION_TOKEN_CONFIG.TOKEN_LOG_SHEET_DEFAULT);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "発行ID", "発行日時", "有効期限", "会員番号", "氏名", "メールアドレス", "トークンハッシュ", "ステータス", "使用日時", "備考"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function invalidateExisting9RoundSuspensionTokens_(sheet, memberNo) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(function(value) { return String(value).trim(); });
  const memberIndex = headers.indexOf("会員番号");
  const statusIndex = headers.indexOf("ステータス");
  const noteIndex = headers.indexOf("備考");
  if (memberIndex < 0 || statusIndex < 0) return;

  let changed = false;
  for (let i = 1; i < values.length; i++) {
    if (normalize9RoundMemberNo_(values[i][memberIndex]) === memberNo && String(values[i][statusIndex] || "") === "有効") {
      values[i][statusIndex] = "再発行により無効";
      if (noteIndex >= 0) values[i][noteIndex] = "新しい休会URLを発行したため無効化";
      changed = true;
    }
  }
  if (changed) sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
}

function mark9RoundSuspensionTokenUsed_(sheet, rowNumber, usedAt, applicationId) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const statusColumn = headers.indexOf("ステータス") + 1;
  const usedAtColumn = headers.indexOf("使用日時") + 1;
  const noteColumn = headers.indexOf("備考") + 1;
  if (statusColumn > 0) sheet.getRange(rowNumber, statusColumn).setValue("使用済");
  if (usedAtColumn > 0) sheet.getRange(rowNumber, usedAtColumn).setValue(usedAt);
  if (noteColumn > 0) sheet.getRange(rowNumber, noteColumn).setValue("休会申請ID: " + applicationId);
}

function create9RoundSuspensionToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").toLowerCase();
}

function hash9RoundSuspensionToken_(token) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(token || ""),
    Utilities.Charset.UTF_8
  );
  return digest.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function parse9RoundSuspensionTokenDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6] || 0)
  );
}

function show9RoundSuspensionUrlDialog_(url, member, expiresAt) {
  const expiryText = Utilities.formatDate(expiresAt, ROUND9_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm");
  const safeUrl = escape9RoundSuspensionHtml_(url);
  const safeName = escape9RoundSuspensionHtml_(member.name);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:18px;color:#111">' +
    '<h3 style="margin:0 0 8px">休会URLを発行しました</h3>' +
    '<p style="margin:0 0 12px;font-size:13px">' + safeName + ' 様／有効期限 ' + expiryText + '</p>' +
    '<textarea id="url" readonly style="width:100%;height:110px;box-sizing:border-box;padding:10px">' + safeUrl + '</textarea>' +
    '<button onclick="copyUrl()" style="margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:#111;color:#ff3640;font-weight:700;cursor:pointer">URLをコピー</button>' +
    '<div id="msg" style="margin-top:8px;font-size:12px;color:#555"></div>' +
    '<script>function copyUrl(){var e=document.getElementById("url");e.focus();e.select();var done=false;try{done=document.execCommand("copy");}catch(_){done=false;}if(navigator.clipboard){navigator.clipboard.writeText(e.value).then(function(){document.getElementById("msg").textContent="コピーしました";});}else{document.getElementById("msg").textContent=done?"コピーしました":"選択したURLをコピーしてください";}}</script>' +
    '</div>'
  ).setWidth(560).setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(html, "9ROUND休会届");
}

function escape9RoundSuspensionHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
