/**
 * ============================================================
 * A-nauts OS Reserve
 * 84_9RoundWithdrawal.gs
 * 9ROUND アリオ蘇我店 退会申請
 * ============================================================
 *
 * 既存の MPG 申請用 GAS Web App から呼び出す。
 * 9ROUND 会員マスターは Script Properties で別 Spreadsheet を指定する。
 */

const ROUND9_WITHDRAWAL_CONFIG = Object.freeze({
  TIMEZONE: "Asia/Tokyo",
  DEADLINE_DAY: 20,
  DEADLINE_HOUR: 21,
  LOG_SHEET_DEFAULT: "退会申請",
  ACTIVE_STATUSES: ["ok", "kyukai", "契約中", "休会中"],
  ADMIN_RECIPIENTS: [
    "9round.ariosoga@gmail.com",
    "info@theforestgym.com"
  ],
  REPLY_TO: "9round.ariosoga@gmail.com"
});

/**
 * 9ROUND会員マスターをこのWeb Appに紐づける初期設定。
 *
 * 使用例:
 * setup9RoundWithdrawalMaster("スプレッドシートID", "シート名");
 *
 * シート名を省略した場合は先頭シートを使用する。
 */
function setup9RoundWithdrawalMaster(spreadsheetId, sheetName) {
  const id = extract9RoundSpreadsheetId_(spreadsheetId);
  if (!id) {
    throw new Error("9ROUND会員マスターのスプレッドシートIDまたはURLを指定してください。");
  }

  const ss = SpreadsheetApp.openById(id);
  const targetSheet = sheetName
    ? ss.getSheetByName(String(sheetName).trim())
    : ss.getSheets()[0];

  if (!targetSheet) {
    throw new Error("指定された9ROUND会員マスターのシートを確認できません。");
  }

  validate9RoundMemberHeaders_(targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getDisplayValues()[0]);

  PropertiesService.getScriptProperties().setProperties({
    ROUND9_MEMBER_MASTER_ID: ss.getId(),
    ROUND9_MEMBER_MASTER_SHEET_NAME: targetSheet.getName(),
    ROUND9_WITHDRAWAL_LOG_SHEET_NAME: ROUND9_WITHDRAWAL_CONFIG.LOG_SHEET_DEFAULT
  });

  return {
    spreadsheetId: ss.getId(),
    memberMasterSheetName: targetSheet.getName(),
    withdrawalLogSheetName: ROUND9_WITHDRAWAL_CONFIG.LOG_SHEET_DEFAULT
  };
}

function get9RoundWithdrawalDate_() {
  try {
    const withdrawalDate = get9RoundEarliestWithdrawalDate_();
    return round9Json_({
      ok: true,
      data: {
        withdrawalDate: withdrawalDate,
        label: format9RoundWithdrawalDateLabel_(withdrawalDate),
        deadlineText: "毎月20日21:00までのお手続きで当月末退会"
      }
    });
  } catch (error) {
    console.error("get9RoundWithdrawalDate_", error);
    return round9Json_({
      ok: false,
      code: "ROUND9_WITHDRAWAL_DATE_ERROR",
      message: error && error.message
        ? error.message
        : "退会期日を取得できませんでした。"
    });
  }
}

function check9RoundWithdrawalMember_(body) {
  try {
    const memberNo = normalize9RoundMemberNo_(body && body.memberNo);
    const email = normalize9RoundEmail_(body && body.email);

    validate9RoundMemberCredentials_(memberNo, email);

    const member = find9RoundMember_(memberNo, email);
    if (!member) {
      return round9Json_({
        ok: false,
        code: "MEMBER_NOT_FOUND",
        message: "会員番号またはメールアドレスが一致しません。入力内容をご確認ください。"
      });
    }

    if (!is9RoundWithdrawalStatusActive_(member.contractStatus)) {
      return round9Json_({
        ok: false,
        code: "MEMBER_NOT_ACTIVE",
        message: "現在の会員ステータスでは退会申請を受け付けできません。スタッフへお申し出ください。"
      });
    }

    const withdrawalDate = get9RoundEarliestWithdrawalDate_();
    return round9Json_({
      ok: true,
      data: {
        memberName: member.name,
        course: member.course,
        withdrawalDate: withdrawalDate,
        withdrawalDateLabel: format9RoundWithdrawalDateLabel_(withdrawalDate)
      }
    });
  } catch (error) {
    console.error("check9RoundWithdrawalMember_", error);
    return round9Json_({
      ok: false,
      code: "ROUND9_WITHDRAWAL_MEMBER_ERROR",
      message: error && error.message
        ? error.message
        : "会員情報を確認できませんでした。"
    });
  }
}

function submit9RoundWithdrawal_(body) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    const lastName = String((body && body.lastName) || "").trim();
    const firstName = String((body && body.firstName) || "").trim();
    const lastKana = String((body && body.lastKana) || "").trim();
    const firstKana = String((body && body.firstKana) || "").trim();
    const memberNo = normalize9RoundMemberNo_(body && body.memberNo);
    const email = normalize9RoundEmail_(body && body.email);
    const phone = normalize9RoundPhone_(body && body.phone);
    const reason = String((body && body.reason) || "").trim();
    const otherReason = String((body && body.otherReason) || "").trim();

    validate9RoundWithdrawalForm_({
      lastName: lastName,
      firstName: firstName,
      lastKana: lastKana,
      firstKana: firstKana,
      memberNo: memberNo,
      email: email,
      phone: phone,
      reason: reason,
      otherReason: otherReason,
      confirm1: body && body.confirm1,
      confirm2: body && body.confirm2,
      confirm3: body && body.confirm3
    });

    const member = find9RoundMember_(memberNo, email);
    if (!member) {
      const memberError = new Error("会員番号またはメールアドレスが一致しません。入力内容をご確認ください。");
      memberError.code = "MEMBER_NOT_FOUND";
      throw memberError;
    }

    if (!is9RoundWithdrawalStatusActive_(member.contractStatus)) {
      const statusError = new Error("現在の会員ステータスでは退会申請を受け付けできません。スタッフへお申し出ください。");
      statusError.code = "MEMBER_NOT_ACTIVE";
      throw statusError;
    }

    // 退会日はクライアント入力を信用せず、送信時刻からサーバー側で必ず再計算する。
    const withdrawalDate = get9RoundEarliestWithdrawalDate_();
    const now = new Date();
    const appliedAt = Utilities.formatDate(
      now,
      ROUND9_WITHDRAWAL_CONFIG.TIMEZONE,
      "yyyy/MM/dd HH:mm:ss"
    );
    const applicationId =
      "9RW-" +
      Utilities.formatDate(now, ROUND9_WITHDRAWAL_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss") +
      "-" +
      String(Math.floor(Math.random() * 10000)).padStart(4, "0");

    const ss = get9RoundMasterSpreadsheet_();
    const sheet = getOrCreate9RoundWithdrawalLogSheet_(ss);

    lock.waitLock(10000);
    locked = true;

    if (hasDuplicate9RoundWithdrawal_(sheet, memberNo, withdrawalDate)) {
      const duplicateError = new Error(
        "同じ退会期日の申請をすでに受け付けています。重複して申請する必要はありません。"
      );
      duplicateError.code = "DUPLICATE_APPLICATION";
      throw duplicateError;
    }

    sheet.appendRow([
      applicationId,
      appliedAt,
      memberNo,
      lastName,
      firstName,
      lastKana,
      firstKana,
      member.name,
      email,
      phone,
      member.contractStatus,
      member.course,
      withdrawalDate,
      reason,
      otherReason,
      member.campaignName,
      member.campaignBindingEnd,
      "受付",
      "店頭WEB申請"
    ]);

    lock.releaseLock();
    locked = false;

    const warnings = [];

    try {
      send9RoundWithdrawalMemberMail_(member, {
        applicationId: applicationId,
        withdrawalDate: withdrawalDate,
        reason: reason
      });
    } catch (mailError) {
      console.error("send9RoundWithdrawalMemberMail_", mailError);
      warnings.push("会員向け受付メールの送信に失敗しました");
    }

    try {
      send9RoundWithdrawalAdminMail_(member, {
        applicationId: applicationId,
        appliedAt: appliedAt,
        enteredName: (lastName + " " + firstName).trim(),
        enteredKana: (lastKana + " " + firstKana).trim(),
        phone: phone,
        withdrawalDate: withdrawalDate,
        reason: reason,
        otherReason: otherReason
      });
    } catch (mailError) {
      console.error("send9RoundWithdrawalAdminMail_", mailError);
      warnings.push("管理者通知メールの送信に失敗しました");
    }

    return round9Json_({
      ok: true,
      data: {
        applicationId: applicationId,
        memberName: member.name,
        withdrawalDate: withdrawalDate,
        withdrawalDateLabel: format9RoundWithdrawalDateLabel_(withdrawalDate),
        mailWarning: warnings.join("／")
      },
      message: warnings.length
        ? "退会申請は受け付けました。メール送信の一部に失敗したため、スタッフへお申し出ください。"
        : "退会申請を受け付けました。登録メールアドレスへ受付メールを送信しました。"
    });
  } catch (error) {
    if (locked) {
      try {
        lock.releaseLock();
      } catch (_) {}
    }

    console.error("submit9RoundWithdrawal_", error);
    return round9Json_({
      ok: false,
      code: error && error.code
        ? error.code
        : "ROUND9_WITHDRAWAL_SUBMIT_ERROR",
      message: error && error.message
        ? error.message
        : "退会申請の受付中にエラーが発生しました。"
    });
  }
}

function validate9RoundWithdrawalForm_(data) {
  if (!data.lastName || !data.firstName || !data.lastKana || !data.firstKana) {
    throw new Error("氏名・フリガナを入力してください。");
  }

  if (!valid9RoundKana_(data.lastKana) || !valid9RoundKana_(data.firstKana)) {
    throw new Error("フリガナはカタカナまたはアルファベットで入力してください。");
  }

  validate9RoundMemberCredentials_(data.memberNo, data.email);

  if (!data.phone) {
    throw new Error("電話番号を入力してください。");
  }

  if (!data.reason) {
    throw new Error("退会理由を選択してください。");
  }

  if (data.reason === "その他" && !data.otherReason) {
    throw new Error("退会理由をご記載ください。");
  }

  if (data.confirm1 !== true || data.confirm2 !== true || data.confirm3 !== true) {
    throw new Error("確認事項すべてへの同意が必要です。");
  }
}

function validate9RoundMemberCredentials_(memberNo, email) {
  if (!/^\d{7}$/.test(memberNo)) {
    throw new Error("会員番号は7桁の数字で入力してください。");
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("メールアドレスを正しく入力してください。");
  }
}

function get9RoundEarliestWithdrawalDate_() {
  const now = new Date();
  const parts = Utilities.formatDate(
    now,
    ROUND9_WITHDRAWAL_CONFIG.TIMEZONE,
    "yyyy,M,d,H,m,s"
  ).split(",").map(Number);

  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const hour = parts[3];
  const minute = parts[4];
  const second = parts[5];

  const afterDeadline =
    day > ROUND9_WITHDRAWAL_CONFIG.DEADLINE_DAY ||
    (
      day === ROUND9_WITHDRAWAL_CONFIG.DEADLINE_DAY &&
      (
        hour > ROUND9_WITHDRAWAL_CONFIG.DEADLINE_HOUR ||
        (
          hour === ROUND9_WITHDRAWAL_CONFIG.DEADLINE_HOUR &&
          (minute > 0 || second > 0)
        )
      )
    );

  return get9RoundMonthEndFromOffset_(year, month, afterDeadline ? 1 : 0);
}

function get9RoundMonthEndFromOffset_(year, month, offset) {
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const targetYear = first.getUTCFullYear();
  const targetMonth = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();

  return (
    String(targetYear) +
    "-" +
    String(targetMonth).padStart(2, "0") +
    "-" +
    String(lastDay).padStart(2, "0")
  );
}

function format9RoundWithdrawalDateLabel_(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");

  return (
    Number(match[1]) +
    "年" +
    Number(match[2]) +
    "月末（" +
    Number(match[1]) +
    "年" +
    Number(match[2]) +
    "月" +
    Number(match[3]) +
    "日）"
  );
}

function get9RoundMasterSpreadsheet_() {
  const id = String(
    PropertiesService.getScriptProperties().getProperty("ROUND9_MEMBER_MASTER_ID") || ""
  ).trim();

  if (!id) {
    throw new Error(
      "9ROUND会員マスターが未設定です。setup9RoundWithdrawalMaster() を実行してください。"
    );
  }

  return SpreadsheetApp.openById(id);
}

function get9RoundMemberMasterSheet_() {
  const ss = get9RoundMasterSpreadsheet_();
  const configuredName = String(
    PropertiesService.getScriptProperties().getProperty("ROUND9_MEMBER_MASTER_SHEET_NAME") || ""
  ).trim();

  const sheet = configuredName
    ? ss.getSheetByName(configuredName)
    : ss.getSheets()[0];

  if (!sheet) {
    throw new Error("9ROUND会員マスターのシートを確認できません。");
  }

  return sheet;
}

function find9RoundMember_(memberNo, email) {
  const sheet = get9RoundMemberMasterSheet_();

  if (sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    throw new Error("9ROUND会員マスターに会員データがありません。");
  }

  const values = sheet
    .getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
    .getDisplayValues();

  const headers = values[0].map(normalize9RoundHeader_);
  const columns = validate9RoundMemberHeaders_(headers);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowMemberNo = normalize9RoundMemberNo_(row[columns.memberNo]);
    const rowEmail = normalize9RoundEmail_(row[columns.email]);

    if (rowMemberNo === memberNo && rowEmail === email) {
      return {
        rowNumber: i + 1,
        memberNo: rowMemberNo,
        email: rowEmail,
        name: String(row[columns.name] || "").trim(),
        contractStatus: String(row[columns.status] || "").trim(),
        course: columns.course >= 0
          ? String(row[columns.course] || "").trim()
          : "",
        campaignName: columns.campaignName >= 0
          ? String(row[columns.campaignName] || "").trim()
          : "",
        campaignBindingEnd: columns.campaignBindingEnd >= 0
          ? String(row[columns.campaignBindingEnd] || "").trim()
          : ""
      };
    }
  }

  return null;
}

function validate9RoundMemberHeaders_(headers) {
  const normalized = headers.map(normalize9RoundHeader_);

  const columns = {
    memberNo: normalized.indexOf("会員番号"),
    name: normalized.indexOf("名前"),
    email: normalized.indexOf("メールアドレス"),
    status: normalized.indexOf("会員ステータス"),
    course: normalized.indexOf("会員種別"),
    campaignName: normalized.indexOf("キャンペーン名（日本語）"),
    campaignBindingEnd: normalized.indexOf("キャンペーン縛り満了日")
  };

  const required = [
    ["会員番号", columns.memberNo],
    ["名前", columns.name],
    ["メールアドレス", columns.email],
    ["会員ステータス", columns.status]
  ];

  const missing = required
    .filter(function(item) { return item[1] < 0; })
    .map(function(item) { return item[0]; });

  if (missing.length) {
    throw new Error(
      "9ROUND会員マスターに必要な列がありません：" + missing.join("、")
    );
  }

  return columns;
}

function getOrCreate9RoundWithdrawalLogSheet_(ss) {
  const configuredName = String(
    PropertiesService.getScriptProperties().getProperty("ROUND9_WITHDRAWAL_LOG_SHEET_NAME") || ""
  ).trim();

  const name = configuredName || ROUND9_WITHDRAWAL_CONFIG.LOG_SHEET_DEFAULT;
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "申請ID",
      "申請日時",
      "会員番号",
      "入力姓",
      "入力名",
      "入力姓カナ",
      "入力名カナ",
      "マスター氏名",
      "メールアドレス",
      "電話番号",
      "会員ステータス",
      "会員種別",
      "退会期日",
      "退会理由",
      "理由・意見",
      "キャンペーン名",
      "キャンペーン縛り満了日",
      "ステータス",
      "備考"
    ]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function hasDuplicate9RoundWithdrawal_(sheet, memberNo, withdrawalDate) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return false;

  const headers = values[0].map(normalize9RoundHeader_);
  const memberIndex = headers.indexOf("会員番号");
  const dateIndex = headers.indexOf("退会期日");
  const statusIndex = headers.indexOf("ステータス");

  if (memberIndex < 0 || dateIndex < 0 || statusIndex < 0) {
    return false;
  }

  return values.slice(1).some(function(row) {
    const status = String(row[statusIndex] || "").trim();
    return (
      normalize9RoundMemberNo_(row[memberIndex]) === memberNo &&
      String(row[dateIndex] || "").trim() === withdrawalDate &&
      status !== "取消" &&
      status !== "却下"
    );
  });
}

function send9RoundWithdrawalMemberMail_(member, data) {
  const subject = "退会申請を受け付けました／9ROUND アリオ蘇我店";
  const body = [
    member.name + " 様",
    "",
    "9ROUND アリオ蘇我店でございます。",
    "退会申請を受け付けました。",
    "",
    "申請番号：" + data.applicationId,
    "退会期日：" + format9RoundWithdrawalDateLabel_(data.withdrawalDate),
    "退会理由：" + data.reason,
    "",
    "継続条件付きキャンペーン等の条件を満たしていない場合は、通常価格との差額等の精算が必要となる場合がございます。",
    "また、入会時キャンペーン等で定める退会不可期間に該当する場合は、退会可能な最短期日へ変更となります。",
    "必要な精算金や退会期日の変更がある場合は、別途ご案内いたします。",
    "",
    "9ROUND アリオ蘇我店"
  ].join("\n");

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    body: body,
    name: "9ROUND アリオ蘇我店",
    replyTo: ROUND9_WITHDRAWAL_CONFIG.REPLY_TO
  });
}

function send9RoundWithdrawalAdminMail_(member, data) {
  const subject =
    "【9ROUND退会申請】" +
    (member.name || data.enteredName || data.applicationId);

  const body = [
    "9ROUND アリオ蘇我店の退会申請を受け付けました。",
    "",
    "申請番号：" + data.applicationId,
    "申請日時：" + data.appliedAt,
    "会員番号：" + member.memberNo,
    "マスター氏名：" + member.name,
    "入力氏名：" + data.enteredName,
    "入力フリガナ：" + data.enteredKana,
    "登録メールアドレス：" + member.email,
    "電話番号：" + data.phone,
    "会員ステータス：" + member.contractStatus,
    "会員種別：" + member.course,
    "退会期日：" + format9RoundWithdrawalDateLabel_(data.withdrawalDate),
    "退会理由：" + data.reason,
    "理由・意見：" + (data.otherReason || "なし"),
    "キャンペーン名：" + (member.campaignName || "なし"),
    "キャンペーン縛り満了日：" + (member.campaignBindingEnd || "なし"),
    "",
    "※キャンペーン継続条件・精算金の有無を確認してください。"
  ].join("\n");

  MailApp.sendEmail({
    to: ROUND9_WITHDRAWAL_CONFIG.ADMIN_RECIPIENTS.join(","),
    subject: subject,
    body: body,
    name: "9ROUND 退会申請",
    replyTo: ROUND9_WITHDRAWAL_CONFIG.REPLY_TO
  });
}

function normalize9RoundMemberNo_(value) {
  return String(value == null ? "" : value)
    .replace(/[^\d]/g, "")
    .trim();
}

function normalize9RoundEmail_(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase();
}

function normalize9RoundPhone_(value) {
  return String(value == null ? "" : value)
    .replace(/[^0-9+]/g, "")
    .trim();
}

function normalize9RoundHeader_(value) {
  return String(value == null ? "" : value)
    .replace(/^\uFEFF/, "")
    .trim();
}

function valid9RoundKana_(value) {
  return /^[ァ-ヶーｦ-ﾟA-Za-zＡ-Ｚａ-ｚ\s]+$/.test(String(value || ""));
}

function is9RoundWithdrawalStatusActive_(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ROUND9_WITHDRAWAL_CONFIG.ACTIVE_STATUSES.some(function(value) {
    return String(value).toLowerCase() === normalized;
  });
}

function extract9RoundSpreadsheetId_(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const urlMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];

  return text;
}

function round9Json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
