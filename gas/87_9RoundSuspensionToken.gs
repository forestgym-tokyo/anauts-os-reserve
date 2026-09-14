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
    .addItem("休会申請案内メールを送信・予約", "show9RoundSuspensionGuideDialog")
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

  const result = issue9RoundSuspensionUrlForMember_(member);
  show9RoundSuspensionUrlDialog_(
    result.url,
    member,
    result.expiresAt,
    result.mailSent,
    result.mailError
  );
  return result.url;
}

function issue9RoundSuspensionUrlForMember_(member) {
  if (!member || !member.memberNo || !member.email) {
    throw new Error("休会URLを発行する会員情報を確認できません。");
  }
  if (!is9RoundSuspensionStatusActive_(member.contractStatus)) {
    throw new Error("現在の会員ステータスでは休会URLを発行できません。");
  }

  const ss = get9RoundMasterSpreadsheet_();
  const tokenSheet = getOrCreate9RoundSuspensionTokenSheet_(ss);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let rawToken;
  let expiresAt;
  let addedRow = 0;
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
    addedRow = tokenSheet.getLastRow();
    tokenSheet.getRange(addedRow, 2, 1, 2).setNumberFormat("yyyy/mm/dd hh:mm:ss");
  } finally {
    lock.releaseLock();
  }

  const publicUrl = ROUND9_SUSPENSION_TOKEN_CONFIG.PUBLIC_URL_DEFAULT;
  const url = publicUrl + "?token=" + encodeURIComponent(rawToken);
  let mailSent = false;
  let mailError = "";

  try {
    send9RoundSuspensionUrlMail_(member, url, expiresAt);
    mailSent = true;
    set9RoundSuspensionTokenIssueNote_(tokenSheet, addedRow, "会員へ専用URLメール送信済");
  } catch (error) {
    console.error("send9RoundSuspensionUrlMail_", error);
    mailError = error && error.message ? error.message : "メール送信に失敗しました。";
    set9RoundSuspensionTokenIssueNote_(tokenSheet, addedRow, "専用URLメール送信失敗: " + mailError);
  }

  return {
    url: url,
    expiresAt: expiresAt,
    mailSent: mailSent,
    mailError: mailError
  };
}

function send9RoundSuspensionUrlMail_(member, url, expiresAt) {
  const expiryText = Utilities.formatDate(
    expiresAt,
    ROUND9_SUSPENSION_CONFIG.TIMEZONE,
    "yyyy/MM/dd HH:mm"
  );
  const subject = "【9ROUND アリオ蘇我店】休会申請のお手続き";
  const body = [
    member.name + " 様",
    "",
    "9ROUND アリオ蘇我店でございます。",
    "休会申請用の会員様専用URLをお送りします。",
    "以下のURLより、有効期限までにお手続きください。",
    "",
    "▼休会申請URL",
    url,
    "",
    "URL有効期限：" + expiryText,
    "",
    "※このURLは会員様専用です。第三者への転送・共有はお控えください。",
    "※申請完了後、このURLは使用できなくなります。",
    "※有効期限を過ぎた場合は、新しいURLの発行が必要です。",
    "",
    "9ROUND アリオ蘇我店"
  ].join("\n");

  const safeName = escape9RoundSuspensionHtml_(member.name);
  const safeUrl = escape9RoundSuspensionHtml_(url);
  const safeExpiry = escape9RoundSuspensionHtml_(expiryText);
  const htmlBody =
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans JP,sans-serif;line-height:1.8;color:#111">' +
    '<p>' + safeName + ' 様</p>' +
    '<p>9ROUND アリオ蘇我店でございます。<br>休会申請用の会員様専用URLをお送りします。<br>以下のボタンより、有効期限までにお手続きください。</p>' +
    '<p style="margin:24px 0"><a href="' + safeUrl + '" style="display:inline-block;padding:13px 22px;background:#e31b23;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">休会申請を行う</a></p>' +
    '<p><strong>URL有効期限：</strong>' + safeExpiry + '</p>' +
    '<p style="font-size:12px;color:#666">※このURLは会員様専用です。第三者への転送・共有はお控えください。<br>※申請完了後、このURLは使用できなくなります。<br>※有効期限を過ぎた場合は、新しいURLの発行が必要です。</p>' +
    '<p>9ROUND アリオ蘇我店</p>' +
    '</div>';

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    body: body,
    htmlBody: htmlBody,
    name: "9ROUND アリオ蘇我店",
    replyTo: ROUND9_SUSPENSION_CONFIG.REPLY_TO
  });
}

function set9RoundSuspensionTokenIssueNote_(sheet, rowNumber, note) {
  if (!sheet || !rowNumber) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const noteColumn = headers.indexOf("備考") + 1;
  if (noteColumn > 0) sheet.getRange(rowNumber, noteColumn).setValue(note);
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

function show9RoundSuspensionUrlDialog_(url, member, expiresAt, mailSent, mailError) {
  const expiryText = Utilities.formatDate(expiresAt, ROUND9_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm");
  const safeUrl = escape9RoundSuspensionHtml_(url);
  const safeName = escape9RoundSuspensionHtml_(member.name);
  const mailStatus = mailSent
    ? '<div style="margin:0 0 12px;padding:10px;border-radius:8px;background:#e8f5e9;color:#1b5e20;font-size:13px">登録メールアドレスへ休会URLを送信しました。</div>'
    : '<div style="margin:0 0 12px;padding:10px;border-radius:8px;background:#ffebee;color:#b71c1c;font-size:13px">メール送信に失敗しました。下記URLをコピーして送信してください。' + escape9RoundSuspensionHtml_(mailError || "") + '</div>';
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:18px;color:#111">' +
    '<h3 style="margin:0 0 8px">休会URLを発行しました</h3>' +
    '<p style="margin:0 0 12px;font-size:13px">' + safeName + ' 様／有効期限 ' + expiryText + '</p>' +
    mailStatus +
    '<textarea id="url" readonly style="width:100%;height:110px;box-sizing:border-box;padding:10px">' + safeUrl + '</textarea>' +
    '<button onclick="copyUrl()" style="margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:#111;color:#ff3640;font-weight:700;cursor:pointer">URLをコピー</button>' +
    '<div id="msg" style="margin-top:8px;font-size:12px;color:#555"></div>' +
    '<script>function copyUrl(){var e=document.getElementById("url");e.focus();e.select();var done=false;try{done=document.execCommand("copy");}catch(_){done=false;}if(navigator.clipboard){navigator.clipboard.writeText(e.value).then(function(){document.getElementById("msg").textContent="コピーしました";});}else{document.getElementById("msg").textContent=done?"コピーしました":"選択したURLをコピーしてください";}}</script>' +
    '</div>'
  ).setWidth(560).setHeight(390);
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

const ROUND9_SUSPENSION_GUIDE_CONFIG = Object.freeze({
  TIMEZONE: "Asia/Tokyo",
  SCHEDULE_SHEET_NAME: "休会案内送信予約",
  TRIGGER_FUNCTION: "process9RoundSuspensionGuideSchedule",
  MIN_SCHEDULE_LEAD_MINUTES: 2,
  STATUS_PENDING: "予約済",
  STATUS_PROCESSING: "送信処理中",
  STATUS_SENT: "送信済",
  STATUS_FAILED: "送信失敗"
});

function show9RoundSuspensionGuideDialog() {
  const initialEmail = getSelected9RoundSuspensionGuideEmail_();
  const minSchedule = Utilities.formatDate(
    new Date(Date.now() + ROUND9_SUSPENSION_GUIDE_CONFIG.MIN_SCHEDULE_LEAD_MINUTES * 60 * 1000),
    ROUND9_SUSPENSION_GUIDE_CONFIG.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm"
  );
  const defaultSchedule = Utilities.formatDate(
    new Date(Date.now() + 10 * 60 * 1000),
    ROUND9_SUSPENSION_GUIDE_CONFIG.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm"
  );
  const html = [
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">',
    '<style>',
    ':root{--bg:#070707;--panel:#141414;--line:#343434;--text:#f7f7f7;--muted:#aaa;--red:#e31b23;--red2:#ff3640}',
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans JP,sans-serif;padding:22px}',
    'h1{font-size:21px;margin:0 0 5px}.sub{font-size:11px;color:var(--red2);letter-spacing:1.4px;margin-bottom:20px}',
    '.panel{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:17px;margin-bottom:14px}',
    'label{display:block;font-size:13px;margin-bottom:7px;color:#ddd}.field{margin-bottom:16px}',
    'input[type=email],input[type=datetime-local]{width:100%;border:1px solid #3a3a3a;border-radius:10px;background:#080808;color:#fff;padding:12px;font-size:15px}',
    '.choice{display:flex;gap:10px}.choice label{flex:1;border:1px solid #3a3a3a;border-radius:10px;padding:11px;margin:0;cursor:pointer}.choice input{accent-color:var(--red);margin-right:7px}',
    '.hint{font-size:11px;color:var(--muted);margin-top:6px}.hidden{display:none!important}',
    'button{width:100%;border:0;border-radius:11px;padding:13px;font-size:15px;font-weight:800;cursor:pointer}',
    '#confirmBtn{background:#f2f2f2;color:#111}#sendBtn{background:linear-gradient(135deg,#b30910,var(--red2));color:#fff;margin-top:14px}',
    'button:disabled{opacity:.55;cursor:default}.confirm-title{font-size:12px;color:var(--red2);font-weight:800;margin-bottom:10px}',
    '.confirm-row{display:grid;grid-template-columns:120px 1fr;gap:8px;font-size:14px;padding:7px 0;border-bottom:1px solid #2b2b2b}.confirm-row:last-of-type{border-bottom:0}',
    '.confirm-row span{color:var(--muted)}#message{min-height:20px;font-size:13px;margin-top:10px}.error{color:#ff7777}.success{color:#80d889}',
    '</style></head><body>',
    '<h1>休会申請案内メール</h1><div class="sub">SUSPENSION GUIDE MAIL</div>',
    '<div class="panel" id="inputPanel">',
    '<div class="field"><label for="email">会員登録メールアドレス</label>',
    '<input id="email" type="email" value="' + escape9RoundSuspensionHtml_(initialEmail) + '" autocomplete="off" required>',
    '<div class="hint">選択中の会員行にメールアドレスがある場合は自動入力されます。</div></div>',
    '<div class="field"><label>送信タイミング</label><div class="choice">',
    '<label><input type="radio" name="timing" value="now" checked>即時送信</label>',
    '<label><input type="radio" name="timing" value="scheduled">日時指定</label>',
    '</div></div>',
    '<div class="field hidden" id="scheduleField"><label for="scheduledAt">送信予定日時（日本時間）</label>',
    '<input id="scheduledAt" type="datetime-local" min="' + minSchedule + '" value="' + defaultSchedule + '" step="60">',
    '<div class="hint">Google側の実行状況により、指定時刻から数分遅れる場合があります。</div></div>',
    '<button id="confirmBtn" type="button">確認する</button><div id="message"></div></div>',
    '<div class="panel hidden" id="confirmPanel"><div class="confirm-title">送信内容の確認</div>',
    '<div class="confirm-row"><span>会員</span><strong id="confirmName"></strong></div>',
    '<div class="confirm-row"><span>申請種別</span><strong>休会申請</strong></div>',
    '<div class="confirm-row"><span>送信先</span><strong id="confirmEmail"></strong></div>',
    '<div class="confirm-row"><span>送信予定時間</span><strong id="confirmTime"></strong></div>',
    '<button id="sendBtn" type="button">送信する</button></div>',
    '<script>',
    'var confirmedPayload=null;',
    'var email=document.getElementById("email"),scheduleField=document.getElementById("scheduleField"),scheduledAt=document.getElementById("scheduledAt"),confirmPanel=document.getElementById("confirmPanel"),confirmBtn=document.getElementById("confirmBtn"),sendBtn=document.getElementById("sendBtn"),message=document.getElementById("message");',
    'function timing(){var el=document.querySelector("input[name=timing]:checked");return el?el.value:"now";}',
    'function payload(){return {email:email.value.trim(),timing:timing(),scheduledAt:scheduledAt.value};}',
    'function setMessage(text,type){message.textContent=text||"";message.className=type||"";}',
    'function resetConfirmation(){confirmedPayload=null;confirmPanel.classList.add("hidden");setMessage("","");}',
    'document.querySelectorAll("input").forEach(function(el){el.addEventListener("input",resetConfirmation);el.addEventListener("change",function(){scheduleField.classList.toggle("hidden",timing()!=="scheduled");resetConfirmation();});});',
    'confirmBtn.addEventListener("click",function(){var data=payload();if(!data.email){setMessage("会員登録メールアドレスを入力してください。","error");return;}if(data.timing==="scheduled"&&!data.scheduledAt){setMessage("送信予定日時を入力してください。","error");return;}confirmBtn.disabled=true;setMessage("会員情報を確認しています…","");google.script.run.withSuccessHandler(function(result){confirmedPayload=data;document.getElementById("confirmName").textContent=result.memberName+"様";document.getElementById("confirmEmail").textContent=result.email;document.getElementById("confirmTime").textContent=result.sendAtLabel;sendBtn.textContent=result.timing==="now"?"送信する":"送信予約を確定する";confirmPanel.classList.remove("hidden");setMessage("内容を確認し、送信ボタンを押してください。","");confirmBtn.disabled=false;}).withFailureHandler(function(error){setMessage(error&&error.message?error.message:"会員情報を確認できませんでした。","error");confirmBtn.disabled=false;}).preview9RoundSuspensionGuide(data);});',
    'sendBtn.addEventListener("click",function(){if(!confirmedPayload)return;sendBtn.disabled=true;confirmBtn.disabled=true;setMessage(confirmedPayload.timing==="now"?"送信しています…":"送信予約を登録しています…","");google.script.run.withSuccessHandler(function(result){setMessage(result.message,"success");sendBtn.textContent=result.timing==="now"?"送信済み":"予約済み";email.disabled=true;scheduledAt.disabled=true;document.querySelectorAll("input[name=timing]").forEach(function(el){el.disabled=true;});}).withFailureHandler(function(error){setMessage(error&&error.message?error.message:"処理に失敗しました。","error");sendBtn.disabled=false;confirmBtn.disabled=false;}).send9RoundSuspensionGuide(confirmedPayload);});',
    '</script></body></html>'
  ].join("");

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(620).setHeight(680),
    "9ROUND休会届"
  );
}

function preview9RoundSuspensionGuide(input) {
  const request = normalize9RoundSuspensionGuideRequest_(input);
  const member = find9RoundSuspensionGuideMemberByEmail_(request.email);
  validate9RoundSuspensionGuideMember_(member);
  return {
    memberName: member.name,
    email: member.email,
    timing: request.timing,
    sendAtLabel: request.timing === "now"
      ? "即時（" + format9RoundSuspensionGuideDate_(new Date()) + "頃）"
      : format9RoundSuspensionGuideDate_(request.sendAt)
  };
}

function send9RoundSuspensionGuide(input) {
  const request = normalize9RoundSuspensionGuideRequest_(input);
  const member = find9RoundSuspensionGuideMemberByEmail_(request.email);
  validate9RoundSuspensionGuideMember_(member);

  if (request.timing === "scheduled") {
    const reservation = reserve9RoundSuspensionGuide_(member, request.sendAt);
    return {
      ok: true,
      timing: "scheduled",
      reservationId: reservation.reservationId,
      message: member.name + "様への休会申請案内メールを" +
        format9RoundSuspensionGuideDate_(request.sendAt) + "に予約しました。"
    };
  }

  send9RoundSuspensionGuideNow_(member);
  return {
    ok: true,
    timing: "now",
    message: member.name + "様の登録メールアドレスへ休会申請案内メールを送信しました。"
  };
}

function normalize9RoundSuspensionGuideRequest_(input) {
  const email = normalize9RoundEmail_(input && input.email);
  const timing = String((input && input.timing) || "now").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("有効な会員登録メールアドレスを入力してください。");
  }
  if (timing !== "now" && timing !== "scheduled") {
    throw new Error("送信タイミングを選択してください。");
  }

  let sendAt = new Date();
  if (timing === "scheduled") {
    const value = String((input && input.scheduledAt) || "").trim();
    try {
      sendAt = Utilities.parseDate(
        value,
        ROUND9_SUSPENSION_GUIDE_CONFIG.TIMEZONE,
        "yyyy-MM-dd'T'HH:mm"
      );
    } catch (_) {
      sendAt = null;
    }
    if (!sendAt || isNaN(sendAt.getTime())) {
      throw new Error("送信予定日時を正しく入力してください。");
    }
    if (sendAt.getTime() <= Date.now()) {
      throw new Error("日時指定は現在より後の時刻を指定してください。");
    }
  }

  return {email: email, timing: timing, sendAt: sendAt};
}

function find9RoundSuspensionGuideMemberByEmail_(email) {
  const sheet = get9RoundMemberMasterSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) throw new Error("9ROUND会員マスターに会員データがありません。");

  const headers = values[0].map(normalize9RoundHeader_);
  const columns = validate9RoundMemberHeaders_(headers);
  const memberNumbers = {};

  for (let i = 1; i < values.length; i++) {
    const rowEmail = normalize9RoundEmail_(values[i][columns.email]);
    if (rowEmail !== email) continue;
    const memberNo = normalize9RoundMemberNo_(values[i][columns.memberNo]);
    if (memberNo) memberNumbers[memberNo] = true;
  }

  const matches = Object.keys(memberNumbers);
  if (!matches.length) {
    throw new Error("登録メールアドレスに一致する会員を確認できませんでした。");
  }
  if (matches.length > 1) {
    throw new Error("同じメールアドレスに複数の会員番号が登録されています。対象会員を特定できないため送信できません。");
  }

  const member = find9RoundMember_(matches[0], email);
  if (!member) throw new Error("会員情報を確認できませんでした。");
  return member;
}

function validate9RoundSuspensionGuideMember_(member) {
  if (!member || !is9RoundSuspensionStatusActive_(member.contractStatus)) {
    throw new Error("現在の会員ステータスでは休会申請案内を送信できません。");
  }
}

function send9RoundSuspensionGuideNow_(member) {
  validate9RoundSuspensionGuideMember_(member);
  const result = issue9RoundSuspensionUrlForMember_(member);
  if (!result.mailSent) {
    throw new Error(result.mailError || "休会申請案内メールの送信に失敗しました。");
  }
  return result;
}

function reserve9RoundSuspensionGuide_(member, sendAt) {
  const ss = get9RoundMasterSpreadsheet_();
  const sheet = getOrCreate9RoundSuspensionGuideScheduleSheet_(ss);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  const createdAt = new Date();
  const reservationId =
    "9RS-" +
    Utilities.formatDate(createdAt, ROUND9_SUSPENSION_GUIDE_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss") +
    "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  let rowNumber = 0;
  let trigger = null;

  try {
    sheet.appendRow([
      reservationId,
      createdAt,
      sendAt,
      member.memberNo,
      member.name,
      member.email,
      "登録中",
      "",
      "",
      ""
    ]);
    rowNumber = sheet.getLastRow();
    sheet.getRange(rowNumber, 2, 1, 2).setNumberFormat("yyyy/mm/dd hh:mm:ss");

    trigger = ScriptApp.newTrigger(ROUND9_SUSPENSION_GUIDE_CONFIG.TRIGGER_FUNCTION)
      .timeBased()
      .at(sendAt)
      .create();

    sheet.getRange(rowNumber, 7).setValue(ROUND9_SUSPENSION_GUIDE_CONFIG.STATUS_PENDING);
    sheet.getRange(rowNumber, 9).setNumberFormat("@").setValue(trigger.getUniqueId());
  } catch (error) {
    if (rowNumber) {
      sheet.getRange(rowNumber, 7).setValue(ROUND9_SUSPENSION_GUIDE_CONFIG.STATUS_FAILED);
      sheet.getRange(rowNumber, 10).setValue(
        "予約登録失敗: " + (error && error.message ? error.message : error)
      );
    }
    if (trigger) {
      try { ScriptApp.deleteTrigger(trigger); } catch (_) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }

  return {reservationId: reservationId, triggerId: trigger.getUniqueId(), rowNumber: rowNumber};
}

function process9RoundSuspensionGuideSchedule(e) {
  const triggerId = String((e && e.triggerUid) || "").trim();
  if (!triggerId) throw new Error("送信予約のトリガーIDを確認できません。");

  const ss = get9RoundMasterSpreadsheet_();
  const sheet = getOrCreate9RoundSuspensionGuideScheduleSheet_(ss);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  let rowNumber = 0;
  let row = null;
  try {
    const values = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < values.length; i++) {
      if (
        String(values[i][8] || "").trim() === triggerId &&
        String(values[i][6] || "").trim() === ROUND9_SUSPENSION_GUIDE_CONFIG.STATUS_PENDING
      ) {
        rowNumber = i + 1;
        row = values[i];
        break;
      }
    }
    if (rowNumber) {
      sheet.getRange(rowNumber, 7).setValue(ROUND9_SUSPENSION_GUIDE_CONFIG.STATUS_PROCESSING);
    }
  } finally {
    lock.releaseLock();
  }

  if (!rowNumber) {
    delete9RoundSuspensionGuideTrigger_(triggerId);
    return;
  }

  try {
    const memberNo = normalize9RoundMemberNo_(row[3]);
    const email = normalize9RoundEmail_(row[5]);
    const member = find9RoundMember_(memberNo, email);
    if (!member) throw new Error("予約時の会員情報と現在の会員マスターが一致しません。");
    send9RoundSuspensionGuideNow_(member);
    sheet.getRange(rowNumber, 7).setValue(ROUND9_SUSPENSION_GUIDE_CONFIG.STATUS_SENT);
    sheet.getRange(rowNumber, 8).setValue(new Date()).setNumberFormat("yyyy/mm/dd hh:mm:ss");
    sheet.getRange(rowNumber, 10).setValue("休会申請案内メール送信済");
  } catch (error) {
    sheet.getRange(rowNumber, 7).setValue(ROUND9_SUSPENSION_GUIDE_CONFIG.STATUS_FAILED);
    sheet.getRange(rowNumber, 10).setValue(
      "送信失敗: " + (error && error.message ? error.message : error)
    );
    console.error("process9RoundSuspensionGuideSchedule", error);
  } finally {
    delete9RoundSuspensionGuideTrigger_(triggerId);
  }
}

function getOrCreate9RoundSuspensionGuideScheduleSheet_(ss) {
  let sheet = ss.getSheetByName(ROUND9_SUSPENSION_GUIDE_CONFIG.SCHEDULE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ROUND9_SUSPENSION_GUIDE_CONFIG.SCHEDULE_SHEET_NAME);
    const headers = [
      "予約ID", "登録日時", "送信予定日時", "会員番号", "氏名",
      "メールアドレス", "ステータス", "送信日時", "トリガーID", "備考"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#111111")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 190);
    sheet.setColumnWidths(2, 2, 145);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 130);
    sheet.setColumnWidth(6, 230);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 145);
    sheet.setColumnWidth(9, 220);
    sheet.setColumnWidth(10, 300);
  }
  return sheet;
}

function delete9RoundSuspensionGuideTrigger_(triggerId) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getUniqueId() === triggerId) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function getSelected9RoundSuspensionGuideEmail_() {
  try {
    const masterSheet = get9RoundMemberMasterSheet_();
    const activeSheet = SpreadsheetApp.getActiveSheet();
    const activeRange = SpreadsheetApp.getActiveRange();
    if (
      !activeRange ||
      activeRange.getRow() < 2 ||
      activeSheet.getSheetId() !== masterSheet.getSheetId()
    ) {
      return "";
    }
    const headers = masterSheet
      .getRange(1, 1, 1, masterSheet.getLastColumn())
      .getDisplayValues()[0]
      .map(normalize9RoundHeader_);
    const emailIndex = headers.indexOf("メールアドレス");
    if (emailIndex < 0) return "";
    return normalize9RoundEmail_(
      masterSheet.getRange(activeRange.getRow(), emailIndex + 1).getDisplayValue()
    );
  } catch (_) {
    return "";
  }
}

function format9RoundSuspensionGuideDate_(date) {
  return Utilities.formatDate(
    date,
    ROUND9_SUSPENSION_GUIDE_CONFIG.TIMEZONE,
    "yyyy/MM/dd HH:mm"
  );
}
