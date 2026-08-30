/**
 * ============================================================
 * A-nauts OS Reserve
 * 81_MpgSuspensionToken.gs
 * My Private Gym 休会届 - 72時間有効の個別URL
 * ============================================================
 */

const MPG_SUSPENSION_TOKEN_CONFIG = Object.freeze({
  TTL_HOURS: 72,
  TOKEN_LOG_SHEET_DEFAULT: "休会URL発行",
  PUBLIC_URL_DEFAULT: "https://forestgym-tokyo.github.io/anauts-os-reserve/mpg-suspension/"
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("MPG休会届")
    .addItem("選択会員の休会URLを発行", "issueMpgSuspensionUrlForActiveRow")
    .addToUi();
}

function issueMpgSuspensionUrlForActiveRow() {
  const ss = getMpgMasterSpreadsheet_();
  const masterSheet = getMpgMemberMasterSheet_();
  const activeSheet = ss.getActiveSheet();
  const activeRange = activeSheet.getActiveRange();

  if (!activeRange || activeSheet.getSheetId() !== masterSheet.getSheetId()) {
    throw new Error("MPG会員マスターの対象会員行を選択してから実行してください。");
  }

  const rowNumber = activeRange.getRow();
  if (rowNumber < 2) {
    throw new Error("見出し行ではなく、対象会員の行を選択してください。");
  }

  const values = masterSheet.getDataRange().getDisplayValues();
  const headers = values[0].map(function(value) { return String(value).trim(); });
  const row = values[rowNumber - 1];
  const index = {};
  headers.forEach(function(header, i) { index[header] = i; });

  ["会員番号", "メールアドレス"].forEach(function(header) {
    if (typeof index[header] !== "number") {
      throw new Error("MPG会員マスターに必要な列「" + header + "」がありません。");
    }
  });

  const memberNo = normalizeMpgMemberNo_(row[index["会員番号"]]);
  const email = normalizeMpgEmail_(row[index["メールアドレス"]]);
  if (!memberNo || !email) {
    throw new Error("選択行の会員番号またはメールアドレスを確認できません。");
  }

  const member = findMpgMember_(memberNo, email);
  if (!member) {
    throw new Error("選択行の会員情報を会員マスターで確認できません。");
  }
  if (MPG_SUSPENSION_CONFIG.ACTIVE_STATUSES.indexOf(member.contractStatus) === -1) {
    throw new Error("現在の契約ステータスでは休会URLを発行できません。");
  }

  const tokenSheet = getOrCreateMpgSuspensionTokenSheet_(ss);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let rawToken;
  let expiresAt;
  let publicUrl;
  try {
    invalidateExistingMpgSuspensionTokens_(tokenSheet, member.memberNo);

    rawToken = createMpgSuspensionToken_();
    const tokenHash = hashMpgSuspensionToken_(rawToken);
    const now = new Date();
    expiresAt = new Date(now.getTime() + MPG_SUSPENSION_TOKEN_CONFIG.TTL_HOURS * 60 * 60 * 1000);
    const issueId = "MPGU-" + Utilities.formatDate(now, MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss") + "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");

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

    publicUrl = getMpgSuspensionPublicUrl_();
  } finally {
    lock.releaseLock();
  }

  const url = publicUrl + (publicUrl.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(rawToken);
  showMpgSuspensionUrlDialog_(url, member, expiresAt);
  return url;
}

function verifyMpgSuspensionToken_(body) {
  try {
    const tokenInfo = resolveMpgSuspensionToken_(body && body.token);
    const member = tokenInfo.member;
    const earliest = getMpgEarliestStartMonth_();
    const options = buildMpgStartMonthOptions_(earliest, MPG_SUSPENSION_CONFIG.START_MONTH_OPTIONS);

    return mpgJson_({
      ok: true,
      data: {
        memberName: member.name,
        course: member.course,
        monthlyFee: member.monthlyFee,
        expiresAt: Utilities.formatDate(tokenInfo.expiresAt, MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm"),
        earliestStartMonth: earliest,
        startMonthOptions: options,
        suspensionFeeMonthly: MPG_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY,
        minMonths: MPG_SUSPENSION_CONFIG.MIN_MONTHS,
        maxMonths: MPG_SUSPENSION_CONFIG.MAX_MONTHS
      }
    });
  } catch (error) {
    console.error("verifyMpgSuspensionToken_", error);
    return mpgJson_({
      ok: false,
      code: error && error.code ? error.code : "MPG_TOKEN_VERIFY_ERROR",
      message: error && error.message ? error.message : "専用URLを確認できませんでした。"
    });
  }
}

function submitMpgSuspensionToken_(body) {
  const lock = LockService.getScriptLock();
  try {
    if (!body || body.agreed !== true) {
      throw new Error("確認事項への同意が必要です。");
    }

    const months = Number(body.months);
    if (!Number.isInteger(months) || months < MPG_SUSPENSION_CONFIG.MIN_MONTHS || months > MPG_SUSPENSION_CONFIG.MAX_MONTHS) {
      throw new Error("休会期間は1〜6か月で選択してください。");
    }

    const startMonth = normalizeMpgMonth_(body.startMonth);
    const earliest = getMpgEarliestStartMonth_();
    const allowed = buildMpgStartMonthOptions_(earliest, MPG_SUSPENSION_CONFIG.START_MONTH_OPTIONS);
    if (allowed.indexOf(startMonth) === -1) {
      throw new Error("選択された休会開始月は受付対象外です。ページを再読み込みしてお手続きください。");
    }

    lock.waitLock(10000);
    const tokenInfo = resolveMpgSuspensionToken_(body.token);
    const member = tokenInfo.member;
    const endMonth = addMpgMonths_(startMonth, months - 1);
    const resumeDate = addMpgMonths_(startMonth, months);
    const suspensionFee = MPG_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY * months;
    const applicationId = createMpgSuspensionId_();
    const now = new Date();
    const appliedAt = Utilities.formatDate(now, MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm:ss");

    const ss = getMpgMasterSpreadsheet_();
    const logSheet = getOrCreateMpgSuspensionLogSheet_(ss);
    if (hasDuplicateMpgSuspension_(logSheet, member.memberNo, startMonth)) {
      const duplicateError = new Error("同じ休会開始月の申請をすでに受け付けています。重複して申請する必要はありません。");
      duplicateError.code = "DUPLICATE_APPLICATION";
      throw duplicateError;
    }

    logSheet.appendRow([
      applicationId,
      appliedAt,
      member.memberNo,
      member.name,
      member.email,
      member.contractStatus,
      member.course,
      member.monthlyFee,
      startMonth,
      months,
      endMonth,
      resumeDate,
      suspensionFee,
      "受付",
      "個別URL申請"
    ]);

    markMpgSuspensionTokenUsed_(tokenInfo.sheet, tokenInfo.rowNumber, appliedAt, applicationId);
    lock.releaseLock();

    const mailWarnings = [];
    try {
      sendMpgSuspensionMemberMail_(member, {
        applicationId: applicationId,
        startMonth: startMonth,
        months: months,
        endMonth: endMonth,
        resumeDate: resumeDate,
        suspensionFee: suspensionFee
      });
    } catch (error) {
      console.error("sendMpgSuspensionMemberMail_", error);
      mailWarnings.push("会員向け受付メールの送信に失敗しました");
    }

    try {
      sendMpgSuspensionAdminMail_(member, {
        applicationId: applicationId,
        appliedAt: appliedAt,
        startMonth: startMonth,
        months: months,
        endMonth: endMonth,
        resumeDate: resumeDate,
        suspensionFee: suspensionFee
      });
    } catch (error) {
      console.error("sendMpgSuspensionAdminMail_", error);
      mailWarnings.push("管理者通知メールの送信に失敗しました");
    }

    return mpgJson_({
      ok: true,
      data: {
        applicationId: applicationId,
        memberName: member.name,
        startMonth: startMonth,
        months: months,
        endMonth: endMonth,
        resumeDate: resumeDate,
        suspensionFee: suspensionFee,
        mailWarning: mailWarnings.join("／")
      }
    });
  } catch (error) {
    try { lock.releaseLock(); } catch (_) {}
    console.error("submitMpgSuspensionToken_", error);
    return mpgJson_({
      ok: false,
      code: error && error.code ? error.code : "MPG_TOKEN_SUBMIT_ERROR",
      message: error && error.message ? error.message : "休会申請の受付中にエラーが発生しました。"
    });
  }
}

function resolveMpgSuspensionToken_(rawToken) {
  const token = String(rawToken || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    const error = new Error("この休会URLは無効です。店舗から送付された専用URLをご利用ください。");
    error.code = "TOKEN_INVALID";
    throw error;
  }

  const ss = getMpgMasterSpreadsheet_();
  const sheet = getOrCreateMpgSuspensionTokenSheet_(ss);
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
    if (typeof index[header] !== "number") {
      throw new Error("休会URL発行シートに必要な列「" + header + "」がありません。");
    }
  });

  const hash = hashMpgSuspensionToken_(token);
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[index["トークンハッシュ"]] || "") !== hash) continue;

    const status = String(row[index["ステータス"]] || "").trim();
    if (status === "使用済") {
      const usedError = new Error("この休会URLはすでに使用されています。再度お手続きが必要な場合は店舗へお問い合わせください。");
      usedError.code = "TOKEN_USED";
      throw usedError;
    }
    if (status !== "有効") {
      const invalidError = new Error("この休会URLは無効になっています。新しいURLの発行を店舗へご依頼ください。");
      invalidError.code = "TOKEN_INVALIDATED";
      throw invalidError;
    }

    const expiresAt = parseMpgTokenDate_(row[index["有効期限"]]);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      const expiredError = new Error("この休会URLの有効期限は切れています。新しいURLの発行を店舗へご依頼ください。");
      expiredError.code = "TOKEN_EXPIRED";
      throw expiredError;
    }

    const memberNo = normalizeMpgMemberNo_(row[index["会員番号"]]);
    const email = normalizeMpgEmail_(row[index["メールアドレス"]]);
    const member = findMpgMember_(memberNo, email);
    if (!member) {
      const memberError = new Error("会員情報を確認できませんでした。店舗へお問い合わせください。");
      memberError.code = "MEMBER_NOT_FOUND";
      throw memberError;
    }
    if (MPG_SUSPENSION_CONFIG.ACTIVE_STATUSES.indexOf(member.contractStatus) === -1) {
      const statusError = new Error("現在の契約状況ではオンラインで休会申請を受け付けできません。店舗までお問い合わせください。");
      statusError.code = "MEMBER_NOT_ACTIVE";
      throw statusError;
    }

    return {
      sheet: sheet,
      rowNumber: i + 1,
      expiresAt: expiresAt,
      member: member
    };
  }

  const notFoundError = new Error("この休会URLは無効です。店舗から送付された専用URLをご利用ください。");
  notFoundError.code = "TOKEN_NOT_FOUND";
  throw notFoundError;
}

function getOrCreateMpgSuspensionTokenSheet_(ss) {
  const configuredName = String(PropertiesService.getScriptProperties().getProperty("MPG_SUSPENSION_TOKEN_LOG_SHEET_NAME") || "").trim();
  const name = configuredName || MPG_SUSPENSION_TOKEN_CONFIG.TOKEN_LOG_SHEET_DEFAULT;
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "発行ID", "発行日時", "有効期限", "会員番号", "氏名", "メールアドレス", "トークンハッシュ", "ステータス", "使用日時", "備考"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function invalidateExistingMpgSuspensionTokens_(sheet, memberNo) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(function(value) { return String(value).trim(); });
  const memberIndex = headers.indexOf("会員番号");
  const statusIndex = headers.indexOf("ステータス");
  const noteIndex = headers.indexOf("備考");
  if (memberIndex < 0 || statusIndex < 0) return;

  let changed = false;
  for (let i = 1; i < values.length; i++) {
    if (normalizeMpgMemberNo_(values[i][memberIndex]) === memberNo && String(values[i][statusIndex] || "") === "有効") {
      values[i][statusIndex] = "再発行により無効";
      if (noteIndex >= 0) values[i][noteIndex] = "新しい休会URLを発行したため無効化";
      changed = true;
    }
  }
  if (changed) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }
}

function markMpgSuspensionTokenUsed_(sheet, rowNumber, usedAt, applicationId) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const statusColumn = headers.indexOf("ステータス") + 1;
  const usedAtColumn = headers.indexOf("使用日時") + 1;
  const noteColumn = headers.indexOf("備考") + 1;
  if (statusColumn > 0) sheet.getRange(rowNumber, statusColumn).setValue("使用済");
  if (usedAtColumn > 0) sheet.getRange(rowNumber, usedAtColumn).setValue(usedAt);
  if (noteColumn > 0) sheet.getRange(rowNumber, noteColumn).setValue("休会申請ID: " + applicationId);
}

function createMpgSuspensionToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").toLowerCase();
}

function hashMpgSuspensionToken_(token) {
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

function parseMpgTokenDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0)
  );
}

function getMpgSuspensionPublicUrl_() {
  return String(PropertiesService.getScriptProperties().getProperty("MPG_SUSPENSION_PUBLIC_URL") || MPG_SUSPENSION_TOKEN_CONFIG.PUBLIC_URL_DEFAULT).trim();
}

function showMpgSuspensionUrlDialog_(url, member, expiresAt) {
  const expiryText = Utilities.formatDate(expiresAt, MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm");
  const safeUrl = escapeMpgHtml_(url);
  const safeName = escapeMpgHtml_(member.name);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:18px;color:#111">' +
    '<h3 style="margin:0 0 8px">休会URLを発行しました</h3>' +
    '<p style="margin:0 0 12px;font-size:13px">' + safeName + ' 様／有効期限 ' + expiryText + '</p>' +
    '<textarea id="url" readonly style="width:100%;height:110px;box-sizing:border-box;padding:10px">' + safeUrl + '</textarea>' +
    '<button onclick="copyUrl()" style="margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:#111;color:#81d8d0;font-weight:700;cursor:pointer">URLをコピー</button>' +
    '<div id="msg" style="margin-top:8px;font-size:12px;color:#555"></div>' +
    '<script>function copyUrl(){var e=document.getElementById("url");e.focus();e.select();var done=false;try{done=document.execCommand("copy");}catch(_){done=false;}if(navigator.clipboard){navigator.clipboard.writeText(e.value).then(function(){document.getElementById("msg").textContent="コピーしました";});}else{document.getElementById("msg").textContent=done?"コピーしました":"選択したURLをコピーしてください";}}</script>' +
    '</div>'
  ).setWidth(560).setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(html, "MPG休会届");
}

function escapeMpgHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
