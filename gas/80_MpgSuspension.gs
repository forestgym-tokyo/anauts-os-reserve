/**
 * ============================================================
 * A-nauts OS Reserve
 * 80_MpgSuspension.gs
 * My Private Gym 休会届
 * ============================================================
 * Script Properties:
 *   MPG_MEMBER_MASTER_ID              required
 *   MPG_MEMBER_MASTER_SHEET_NAME      optional (default: first sheet)
 *   MPG_SUSPENSION_LOG_SHEET_NAME     optional (default: 休会申請)
 */

const MPG_SUSPENSION_CONFIG = Object.freeze({
  TIMEZONE: "Asia/Tokyo",
  MEMBER_PREFIX: "MPG",
  MEMBER_DIGITS: 6,
  DEADLINE_DAY: 9,
  DEADLINE_HOUR: 20,
  MIN_MONTHS: 1,
  MAX_MONTHS: 6,
  START_MONTH_OPTIONS: 6,
  SUSPENSION_FEE_MONTHLY: 550,
  ACTIVE_STATUSES: ["契約中", "休会中"],
  ADMIN_RECIPIENTS: [
    "9round.ariosoga@gmail.com",
    "info@theforestgym.com"
  ],
  REPLY_TO: "info@theforestgym.com",
  LOG_SHEET_DEFAULT: "休会申請"
});

function verifyMpgSuspensionMember_(body) {
  try {
    const input = validateMpgIdentityInput_(body);
    const member = findMpgMember_(input.memberNo, input.email);

    if (!member) {
      return mpgJson_({
        ok: false,
        code: "MEMBER_NOT_FOUND",
        message: "会員番号またはメールアドレスが一致しません。入力内容をご確認ください。"
      });
    }

    if (MPG_SUSPENSION_CONFIG.ACTIVE_STATUSES.indexOf(member.contractStatus) === -1) {
      return mpgJson_({
        ok: false,
        code: "MEMBER_NOT_ACTIVE",
        message: "現在の契約状況ではオンラインで休会申請を受け付けできません。店舗までお問い合わせください。"
      });
    }

    const earliest = getMpgEarliestStartMonth_();
    const options = buildMpgStartMonthOptions_(earliest, MPG_SUSPENSION_CONFIG.START_MONTH_OPTIONS);

    return mpgJson_({
      ok: true,
      data: {
        memberName: member.name,
        course: member.course,
        monthlyFee: member.monthlyFee,
        earliestStartMonth: earliest,
        startMonthOptions: options,
        suspensionFeeMonthly: MPG_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY,
        minMonths: MPG_SUSPENSION_CONFIG.MIN_MONTHS,
        maxMonths: MPG_SUSPENSION_CONFIG.MAX_MONTHS
      }
    });
  } catch (error) {
    console.error("verifyMpgSuspensionMember_", error);
    return mpgJson_({
      ok: false,
      code: "MPG_VERIFY_ERROR",
      message: error && error.message ? error.message : "会員情報の確認中にエラーが発生しました。"
    });
  }
}

function submitMpgSuspension_(body) {
  try {
    const input = validateMpgIdentityInput_(body);
    const member = findMpgMember_(input.memberNo, input.email);

    if (!member) {
      return mpgJson_({
        ok: false,
        code: "MEMBER_NOT_FOUND",
        message: "会員番号またはメールアドレスが一致しません。最初からやり直してください。"
      });
    }

    if (MPG_SUSPENSION_CONFIG.ACTIVE_STATUSES.indexOf(member.contractStatus) === -1) {
      return mpgJson_({
        ok: false,
        code: "MEMBER_NOT_ACTIVE",
        message: "現在の契約状況ではオンラインで休会申請を受け付けできません。店舗までお問い合わせください。"
      });
    }

    if (body.agreed !== true) {
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

    const endMonth = addMpgMonths_(startMonth, months - 1);
    const resumeDate = addMpgMonths_(startMonth, months);
    const suspensionFee = MPG_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY * months;
    const applicationId = createMpgSuspensionId_();
    const now = new Date();
    const appliedAt = Utilities.formatDate(now, MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm:ss");

    const ss = getMpgMasterSpreadsheet_();
    const logSheet = getOrCreateMpgSuspensionLogSheet_(ss);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (hasDuplicateMpgSuspension_(logSheet, input.memberNo, startMonth)) {
        return mpgJson_({
          ok: false,
          code: "DUPLICATE_APPLICATION",
          message: "同じ休会開始月の申請をすでに受け付けています。重複して申請する必要はありません。"
        });
      }

      logSheet.appendRow([
        applicationId,
        appliedAt,
        input.memberNo,
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
        ""
      ]);
    } finally {
      lock.releaseLock();
    }

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
    console.error("submitMpgSuspension_", error);
    return mpgJson_({
      ok: false,
      code: "MPG_SUBMIT_ERROR",
      message: error && error.message ? error.message : "休会申請の受付中にエラーが発生しました。"
    });
  }
}

function validateMpgIdentityInput_(body) {
  const memberNo = String((body && body.memberNo) || "").trim();
  const email = normalizeMpgEmail_((body && body.email) || "");

  if (!/^\d{6}$/.test(memberNo)) {
    throw new Error("会員番号は6桁の数字で入力してください。");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("メールアドレスを正しく入力してください。");
  }

  return { memberNo: memberNo, email: email };
}

function findMpgMember_(memberNo, email) {
  const sheet = getMpgMemberMasterSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (!values || values.length < 2) {
    throw new Error("MPG会員マスターにデータがありません。");
  }

  const headers = values[0].map(function(value) { return String(value).trim(); });
  const index = {};
  headers.forEach(function(header, i) { index[header] = i; });

  ["会員番号", "メールアドレス", "契約ステータス", "氏名（姓）", "氏名（名）", "コース", "継続課金(月次)"].forEach(function(header) {
    if (typeof index[header] !== "number") {
      throw new Error("MPG会員マスターに必要な列「" + header + "」がありません。");
    }
  });

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const masterNo = normalizeMpgMemberNo_(row[index["会員番号"]]);
    const masterEmail = normalizeMpgEmail_(row[index["メールアドレス"]]);

    if (masterNo === memberNo && masterEmail === email) {
      return {
        memberNo: masterNo,
        email: masterEmail,
        name: (String(row[index["氏名（姓）"]] || "").trim() + " " + String(row[index["氏名（名）"]] || "").trim()).trim(),
        contractStatus: String(row[index["契約ステータス"]] || "").trim(),
        course: String(row[index["コース"]] || "").trim(),
        monthlyFee: String(row[index["継続課金(月次)"]] || "").trim()
      };
    }
  }

  return null;
}

function getMpgMasterSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("MPG_MEMBER_MASTER_ID");
  if (!id) {
    throw new Error("MPG_MEMBER_MASTER_ID が設定されていません。管理者へお問い合わせください。");
  }
  return SpreadsheetApp.openById(id);
}

function getMpgMemberMasterSheet_() {
  const ss = getMpgMasterSpreadsheet_();
  const configuredName = String(PropertiesService.getScriptProperties().getProperty("MPG_MEMBER_MASTER_SHEET_NAME") || "").trim();
  const sheet = configuredName ? ss.getSheetByName(configuredName) : ss.getSheets()[0];
  if (!sheet) {
    throw new Error("MPG会員マスターのシートが見つかりません。");
  }
  return sheet;
}

function getOrCreateMpgSuspensionLogSheet_(ss) {
  const configuredName = String(PropertiesService.getScriptProperties().getProperty("MPG_SUSPENSION_LOG_SHEET_NAME") || "").trim();
  const name = configuredName || MPG_SUSPENSION_CONFIG.LOG_SHEET_DEFAULT;
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "申請ID", "申請日時", "会員番号", "氏名", "メールアドレス", "契約ステータス", "コース", "通常月会費",
      "休会開始月", "休会期間(月)", "休会終了月", "復会日", "休会費", "ステータス", "備考"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hasDuplicateMpgSuspension_(sheet, memberNo, startMonth) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return false;

  const headers = values[0];
  const memberIndex = headers.indexOf("会員番号");
  const startIndex = headers.indexOf("休会開始月");
  const statusIndex = headers.indexOf("ステータス");
  if (memberIndex < 0 || startIndex < 0 || statusIndex < 0) return false;

  return values.slice(1).some(function(row) {
    const status = String(row[statusIndex] || "").trim();
    return String(row[memberIndex] || "").trim() === memberNo &&
      normalizeMpgMonth_(row[startIndex]) === startMonth &&
      status !== "取消" && status !== "却下";
  });
}

function getMpgEarliestStartMonth_() {
  const now = new Date();
  const parts = Utilities.formatDate(now, MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyy,M,d,H,m,s").split(",").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const hour = parts[3];
  const minute = parts[4];
  const second = parts[5];

  const afterDeadline = day > MPG_SUSPENSION_CONFIG.DEADLINE_DAY ||
    (day === MPG_SUSPENSION_CONFIG.DEADLINE_DAY &&
      (hour > MPG_SUSPENSION_CONFIG.DEADLINE_HOUR ||
        (hour === MPG_SUSPENSION_CONFIG.DEADLINE_HOUR && (minute > 0 || second > 0))));

  return buildMpgMonthFromParts_(year, month, afterDeadline ? 2 : 1);
}

function buildMpgStartMonthOptions_(earliest, count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(addMpgMonths_(earliest, i));
  }
  return result;
}

function normalizeMpgMemberNo_(value) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/(\d{6})$/);
  return match ? match[1] : "";
}

function normalizeMpgEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMpgMonth_(value) {
  const raw = String(value || "").trim().replace(/\//g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) throw new Error("休会開始月の形式が正しくありません。");
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("休会開始月の形式が正しくありません。");
  return match[1] + "-" + String(month).padStart(2, "0") + "-01";
}

function addMpgMonths_(monthString, offset) {
  const normalized = normalizeMpgMonth_(monthString);
  const parts = normalized.split("-").map(Number);
  return buildMpgMonthFromParts_(parts[0], parts[1], offset);
}

function buildMpgMonthFromParts_(year, month, offset) {
  const total = year * 12 + (month - 1) + offset;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return newYear + "-" + String(newMonth).padStart(2, "0") + "-01";
}

function createMpgSuspensionId_() {
  const timestamp = Utilities.formatDate(new Date(), MPG_SUSPENSION_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss");
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return "MPGS-" + timestamp + "-" + suffix;
}

function formatMpgMonthJa_(monthString) {
  const parts = normalizeMpgMonth_(monthString).split("-");
  return Number(parts[0]) + "年" + Number(parts[1]) + "月";
}

function formatMpgResumeDateJa_(monthString) {
  const parts = normalizeMpgMonth_(monthString).split("-");
  return Number(parts[0]) + "年" + Number(parts[1]) + "月1日";
}

function sendMpgSuspensionMemberMail_(member, application) {
  const subject = "休会申請を受け付けました／My Private Gym";
  const body = [
    member.name + " 様",
    "",
    "My Private Gymでございます。",
    "休会申請を受け付けました。",
    "",
    "申請番号：" + application.applicationId,
    "休会開始：" + formatMpgMonthJa_(application.startMonth),
    "休会期間：" + application.months + "か月",
    "休会終了：" + formatMpgMonthJa_(application.endMonth) + "末日",
    "復会日：" + formatMpgResumeDateJa_(application.resumeDate),
    "休会費：" + application.suspensionFee.toLocaleString("ja-JP") + "円（550円×" + application.months + "か月）",
    "",
    "未払いの会費等がある場合は、精算完了後に休会が適用されます。",
    "休会期間終了後は自動的に復会となります。延長をご希望の場合は、改めて休会手続きをお願いいたします。",
    "",
    "My Private Gym"
  ].join("\n");

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    body: body,
    name: "My Private Gym",
    replyTo: MPG_SUSPENSION_CONFIG.REPLY_TO
  });
}

function sendMpgSuspensionAdminMail_(member, application) {
  const subject = "[MPG休会] " + member.memberNo + " " + member.name + "／" + formatMpgMonthJa_(application.startMonth) + "から" + application.months + "か月";
  const body = [
    "My Private Gym 休会申請を受け付けました。",
    "",
    "申請番号：" + application.applicationId,
    "申請日時：" + application.appliedAt,
    "会員番号：" + member.memberNo,
    "氏名：" + member.name,
    "メール：" + member.email,
    "契約ステータス：" + member.contractStatus,
    "コース：" + member.course,
    "通常月会費：" + member.monthlyFee,
    "休会開始：" + formatMpgMonthJa_(application.startMonth),
    "休会期間：" + application.months + "か月",
    "休会終了：" + formatMpgMonthJa_(application.endMonth) + "末日",
    "復会日：" + formatMpgResumeDateJa_(application.resumeDate),
    "休会費：" + application.suspensionFee.toLocaleString("ja-JP") + "円",
    "",
    "※申請内容はMPG会員マスター内の「休会申請」シートにも記録されています。"
  ].join("\n");

  MailApp.sendEmail({
    to: MPG_SUSPENSION_CONFIG.ADMIN_RECIPIENTS.join(","),
    subject: subject,
    body: body,
    name: "My Private Gym 休会届",
    replyTo: MPG_SUSPENSION_CONFIG.REPLY_TO
  });
}

function mpgJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
