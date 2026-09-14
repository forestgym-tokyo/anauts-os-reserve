/**
 * ============================================================
 * A-nauts OS Reserve
 * 86_9RoundSuspension.gs
 * 9ROUND アリオ蘇我店 休会申請
 * ============================================================
 */

const ROUND9_SUSPENSION_CONFIG = Object.freeze({
  TIMEZONE: "Asia/Tokyo",
  DEADLINE_DAY: 20,
  DEADLINE_HOUR: 21,
  MIN_MONTHS: 1,
  MAX_MONTHS: 6,
  SUSPENSION_FEE_MONTHLY: 1100,
  ACTIVE_STATUSES: ["ok", "kyukai", "契約中", "休会中"],
  LOG_SHEET_DEFAULT: "休会申請",
  ADMIN_RECIPIENTS: ["9round.ariosoga@gmail.com", "info@theforestgym.com"],
  REPLY_TO: "9round.ariosoga@gmail.com"
});

function get9RoundEarliestSuspensionStartMonth_() {
  const now = new Date();
  const parts = Utilities.formatDate(
    now,
    ROUND9_SUSPENSION_CONFIG.TIMEZONE,
    "yyyy,M,d,H,m,s"
  ).split(",").map(Number);

  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  const hour = parts[3];
  const minute = parts[4];
  const second = parts[5];

  const afterDeadline =
    day > ROUND9_SUSPENSION_CONFIG.DEADLINE_DAY ||
    (day === ROUND9_SUSPENSION_CONFIG.DEADLINE_DAY &&
      (hour > ROUND9_SUSPENSION_CONFIG.DEADLINE_HOUR ||
        (hour === ROUND9_SUSPENSION_CONFIG.DEADLINE_HOUR && (minute > 0 || second > 0))));

  return build9RoundSuspensionMonth_(year, month, afterDeadline ? 2 : 1);
}

function get9RoundSuspensionStartMonthForMember_(memberNo) {
  const ruleEarliest = get9RoundEarliestSuspensionStartMonth_();
  const ss = get9RoundMasterSpreadsheet_();
  const sheet = ss.getSheetByName(ROUND9_SUSPENSION_CONFIG.LOG_SHEET_DEFAULT);
  if (!sheet || sheet.getLastRow() < 2) return ruleEarliest;

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(normalize9RoundHeader_);
  const memberIndex = headers.indexOf("会員番号");
  const endIndex = headers.indexOf("休会終了月");
  const statusIndex = headers.indexOf("ステータス");
  if (memberIndex < 0 || endIndex < 0 || statusIndex < 0) return ruleEarliest;

  let latestEnd = "";
  values.slice(1).forEach(function(row) {
    const status = String(row[statusIndex] || "").trim();
    if (status === "取消" || status === "却下") return;
    if (normalize9RoundMemberNo_(row[memberIndex]) !== memberNo) return;
    let endMonth = "";
    try { endMonth = normalize9RoundSuspensionMonth_(row[endIndex]); } catch (_) { return; }
    if (!latestEnd || endMonth > latestEnd) latestEnd = endMonth;
  });

  if (!latestEnd) return ruleEarliest;
  const extensionStart = add9RoundSuspensionMonths_(latestEnd, 1);
  return extensionStart > ruleEarliest ? extensionStart : ruleEarliest;
}

function build9RoundSuspensionOptionData_(memberNo) {
  const earliest = memberNo
    ? get9RoundSuspensionStartMonthForMember_(memberNo)
    : get9RoundEarliestSuspensionStartMonth_();

  return {
    earliestStartMonth: earliest,
    startMonthOptions: [earliest],
    suspensionFeeMonthly: ROUND9_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY,
    billingMethod: "monthly",
    minMonths: ROUND9_SUSPENSION_CONFIG.MIN_MONTHS,
    maxMonths: ROUND9_SUSPENSION_CONFIG.MAX_MONTHS,
    deadlineText: "毎月20日21:00までの申請で翌月1日から、以降は翌々月1日から休会可能"
  };
}

function is9RoundSuspensionStatusActive_(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ROUND9_SUSPENSION_CONFIG.ACTIVE_STATUSES.some(function(value) {
    return String(value).toLowerCase() === normalized;
  });
}

function normalize9RoundSuspensionMonth_(value) {
  const raw = String(value || "").trim().replace(/\//g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) throw new Error("休会開始月の形式が正しくありません。");
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("休会開始月の形式が正しくありません。");
  return match[1] + "-" + String(month).padStart(2, "0");
}

function build9RoundSuspensionMonth_(year, month, offset) {
  const d = new Date(Date.UTC(year, month - 1 + offset, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

function add9RoundSuspensionMonths_(monthValue, offset) {
  const normalized = normalize9RoundSuspensionMonth_(monthValue);
  const parts = normalized.split("-").map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1 + offset, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

function format9RoundSuspensionMonth_(value) {
  const normalized = normalize9RoundSuspensionMonth_(value);
  const parts = normalized.split("-");
  return Number(parts[0]) + "年" + Number(parts[1]) + "月";
}

function getOrCreate9RoundSuspensionLogSheet_(ss) {
  let sheet = ss.getSheetByName(ROUND9_SUSPENSION_CONFIG.LOG_SHEET_DEFAULT);
  if (!sheet) sheet = ss.insertSheet(ROUND9_SUSPENSION_CONFIG.LOG_SHEET_DEFAULT);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "申請ID", "申請日時", "会員番号", "氏名", "メールアドレス", "会員ステータス", "会員種別",
      "休会開始月", "休会期間(月)", "休会終了月", "復会日", "月額休会費", "決済方法", "ステータス", "備考"
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hasDuplicate9RoundSuspension_(sheet, memberNo, startMonth) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return false;
  const headers = values[0].map(normalize9RoundHeader_);
  const memberIndex = headers.indexOf("会員番号");
  const startIndex = headers.indexOf("休会開始月");
  const statusIndex = headers.indexOf("ステータス");
  if (memberIndex < 0 || startIndex < 0 || statusIndex < 0) return false;

  return values.slice(1).some(function(row) {
    const status = String(row[statusIndex] || "").trim();
    let rowStart = "";
    try { rowStart = normalize9RoundSuspensionMonth_(row[startIndex]); } catch (_) { return false; }
    return normalize9RoundMemberNo_(row[memberIndex]) === memberNo &&
      rowStart === startMonth && status !== "取消" && status !== "却下";
  });
}

function create9RoundSuspensionApplication_(member, startMonth, months) {
  const endMonth = add9RoundSuspensionMonths_(startMonth, months - 1);
  const resumeMonth = add9RoundSuspensionMonths_(startMonth, months);
  const resumeDate = resumeMonth + "-01";
  const now = new Date();
  const appliedAt = Utilities.formatDate(now, ROUND9_SUSPENSION_CONFIG.TIMEZONE, "yyyy/MM/dd HH:mm:ss");
  const applicationId =
    "9RS-" +
    Utilities.formatDate(now, ROUND9_SUSPENSION_CONFIG.TIMEZONE, "yyyyMMdd-HHmmss") +
    "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");

  const ss = get9RoundMasterSpreadsheet_();
  const sheet = getOrCreate9RoundSuspensionLogSheet_(ss);
  if (hasDuplicate9RoundSuspension_(sheet, member.memberNo, startMonth)) {
    const error = new Error("同じ休会開始月の申請をすでに受け付けています。重複して申請する必要はありません。");
    error.code = "DUPLICATE_APPLICATION";
    throw error;
  }

  const isExtension = String(member.contractStatus || "").trim().toLowerCase() === "kyukai" ||
    String(member.contractStatus || "").trim() === "休会中";

  sheet.appendRow([
    applicationId,
    appliedAt,
    member.memberNo,
    member.name,
    member.email,
    member.contractStatus,
    member.course,
    startMonth,
    months,
    endMonth,
    resumeDate,
    ROUND9_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY,
    "各月決済（まとめて決済しない）",
    "受付",
    isExtension ? "休会中からの再申請（延長）" : "個別URL申請"
  ]);

  return {
    applicationId: applicationId,
    appliedAt: appliedAt,
    startMonth: startMonth,
    months: months,
    endMonth: endMonth,
    resumeDate: resumeDate,
    suspensionFeeMonthly: ROUND9_SUSPENSION_CONFIG.SUSPENSION_FEE_MONTHLY,
    billingMethod: "monthly"
  };
}

function send9RoundSuspensionMemberMail_(member, data) {
  const subject = "休会申請を受け付けました／9ROUND アリオ蘇我店";
  const body = [
    member.name + " 様",
    "",
    "9ROUND アリオ蘇我店でございます。",
    "休会申請を受け付けました。",
    "",
    "申請番号：" + data.applicationId,
    "休会開始：" + format9RoundSuspensionMonth_(data.startMonth) + "1日",
    "休会期間：" + data.months + "か月",
    "休会終了：" + format9RoundSuspensionMonth_(data.endMonth) + "末日",
    "自動復会日：" + format9RoundSuspensionMonth_(data.resumeDate.substring(0, 7)) + "1日",
    "休会費：月額1,100円",
    "",
    "休会費は休会期間分をまとめて決済するのではなく、休会期間中の各月に1,100円ずつ発生します。",
    "休会期間は1か月から6か月までです。延長を希望される場合は、現在の休会期間中に改めて休会申請をお願いいたします。",
    "",
    "9ROUND アリオ蘇我店"
  ].join("\n");

  MailApp.sendEmail({
    to: member.email,
    subject: subject,
    body: body,
    name: "9ROUND アリオ蘇我店",
    replyTo: ROUND9_SUSPENSION_CONFIG.REPLY_TO
  });
}

function send9RoundSuspensionAdminMail_(member, data) {
  const subject = "【9ROUND休会申請】" + (member.name || data.applicationId);
  const body = [
    "9ROUND アリオ蘇我店の休会申請を受け付けました。",
    "",
    "申請番号：" + data.applicationId,
    "申請日時：" + data.appliedAt,
    "会員番号：" + member.memberNo,
    "氏名：" + member.name,
    "登録メールアドレス：" + member.email,
    "会員ステータス：" + member.contractStatus,
    "会員種別：" + member.course,
    "休会開始：" + format9RoundSuspensionMonth_(data.startMonth) + "1日",
    "休会期間：" + data.months + "か月",
    "休会終了：" + format9RoundSuspensionMonth_(data.endMonth) + "末日",
    "自動復会日：" + format9RoundSuspensionMonth_(data.resumeDate.substring(0, 7)) + "1日",
    "休会費：月額1,100円",
    "決済方法：各月決済（まとめて決済しない）",
    "",
    "※休会中の再申請の場合は延長申請として確認してください。"
  ].join("\n");

  MailApp.sendEmail({
    to: ROUND9_SUSPENSION_CONFIG.ADMIN_RECIPIENTS.join(","),
    subject: subject,
    body: body,
    name: "9ROUND 休会申請",
    replyTo: ROUND9_SUSPENSION_CONFIG.REPLY_TO
  });
}
