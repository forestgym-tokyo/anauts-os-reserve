/** The Forest Gym: 退会期日翌日に master.status を空欄化する。 */
const TFG_WITHDRAWAL_STATUS = Object.freeze({
  TZ: "Asia/Tokyo",
  MASTER_ID: "1kLK6Dbe05Uqd0pxnoKX8MbHpQH9AgDnVygwzDPzyXvw",
  MASTER_SHEET: "master",
  LOG_SHEET: "退会申請",
  REFLECTED_HEADER: "マスター反映",
  CANCELLED: ["取消", "却下", "キャンセル", "CANCELLED", "CANCELED"]
});

function runTfgWithdrawalStatusRollover() {
  const now = new Date();
  const today = Utilities.formatDate(now, TFG_WITHDRAWAL_STATUS.TZ, "yyyy-MM-dd");
  const reflectedAt = Utilities.formatDate(now, TFG_WITHDRAWAL_STATUS.TZ, "yyyy/MM/dd HH:mm:ss");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const masterSs = SpreadsheetApp.openById(TFG_WITHDRAWAL_STATUS.MASTER_ID);
    const master = masterSs.getSheetByName(TFG_WITHDRAWAL_STATUS.MASTER_SHEET);
    if (!master) throw new Error("masterシートが見つかりません。");

    const props = PropertiesService.getScriptProperties();
    const logId = String(props.getProperty("TFG_WITHDRAWAL_LOG_SPREADSHEET_ID") || "").trim();
    const logSs = logId && logId !== masterSs.getId()
      ? SpreadsheetApp.openById(logId)
      : masterSs;
    const logName = String(props.getProperty("TFG_WITHDRAWAL_LOG_SHEET_NAME") || TFG_WITHDRAWAL_STATUS.LOG_SHEET).trim();
    const log = logSs.getSheetByName(logName);
    if (!log) throw new Error("退会申請ログ「" + logName + "」が見つかりません。");

    const reflectedCol = ensureTfgWithdrawalReflectedColumn_(log);
    const logValues = log.getDataRange().getValues();
    if (logValues.length < 2) return { ok: true, processed: 0, notFound: [] };

    const lh = tfgWithdrawalHeaderMap_(logValues[0]);
    const memberCol = tfgWithdrawalHeader_(lh, ["会員番号", "memberNo"], true);
    const dateCol = tfgWithdrawalHeader_(lh, ["退会期日", "退会日", "withdrawalDate"], true);
    const appStatusCol = tfgWithdrawalHeader_(lh, ["ステータス", "申請ステータス"], false);

    const masterValues = master.getDataRange().getValues();
    const mh = tfgWithdrawalHeaderMap_(masterValues[0] || []);
    const masterMemberCol = tfgWithdrawalHeader_(mh, ["memberNo", "会員番号"], true);
    const masterStatusCol = tfgWithdrawalHeader_(mh, ["status", "ステータス"], true);
    const masterRows = {};

    for (let i = 1; i < masterValues.length; i++) {
      const no = normalizeTfgWithdrawalMemberNo_(masterValues[i][masterMemberCol]);
      if (no && !masterRows[no]) masterRows[no] = i + 1;
    }

    let processed = 0;
    const notFound = [];

    for (let i = 1; i < logValues.length; i++) {
      const row = logValues[i];
      if (String(row[reflectedCol - 1] || "").trim()) continue;

      const appStatus = appStatusCol >= 0 ? String(row[appStatusCol] || "").trim() : "";
      if (isTfgWithdrawalCancelled_(appStatus)) continue;

      const memberNo = normalizeTfgWithdrawalMemberNo_(row[memberCol]);
      const withdrawalDate = normalizeTfgWithdrawalDate_(row[dateCol]);
      if (!memberNo || !withdrawalDate || withdrawalDate >= today) continue;

      const masterRow = masterRows[memberNo];
      if (!masterRow) {
        notFound.push(memberNo);
        continue;
      }

      // status 以外の会員情報は変更しない。
      master.getRange(masterRow, masterStatusCol + 1).setValue("");
      log.getRange(i + 1, reflectedCol).setValue("処理済 " + reflectedAt);
      processed++;
    }

    SpreadsheetApp.flush();
    return { ok: true, processed: processed, notFound: notFound };
  } finally {
    lock.releaseLock();
  }
}

function setupTfgWithdrawalStatusDailyTrigger() {
  removeTfgWithdrawalStatusDailyTrigger();
  ScriptApp.newTrigger("runTfgWithdrawalStatusRollover")
    .timeBased()
    .atHour(0)
    .nearMinute(10)
    .everyDays(1)
    .inTimezone(TFG_WITHDRAWAL_STATUS.TZ)
    .create();
  return { ok: true, schedule: "毎日0:10頃", timezone: TFG_WITHDRAWAL_STATUS.TZ };
}

function removeTfgWithdrawalStatusDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "runTfgWithdrawalStatusRollover") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function ensureTfgWithdrawalReflectedColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = tfgWithdrawalHeaderMap_(headers);
  const existing = tfgWithdrawalHeader_(map, [TFG_WITHDRAWAL_STATUS.REFLECTED_HEADER], false);
  if (existing >= 0) return existing + 1;
  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(TFG_WITHDRAWAL_STATUS.REFLECTED_HEADER);
  return newCol;
}

function tfgWithdrawalHeaderMap_(headers) {
  const map = {};
  (headers || []).forEach(function(value, index) {
    const key = String(value || "").trim();
    if (key && typeof map[key] !== "number") map[key] = index;
  });
  return map;
}

function tfgWithdrawalHeader_(map, aliases, required) {
  for (let i = 0; i < aliases.length; i++) {
    if (typeof map[aliases[i]] === "number") return map[aliases[i]];
  }
  if (required) throw new Error("必要な列がありません: " + aliases.join(" / "));
  return -1;
}

function normalizeTfgWithdrawalMemberNo_(value) {
  const match = String(value == null ? "" : value).trim().match(/(\d{6})$/);
  return match ? match[1] : "";
}

function normalizeTfgWithdrawalDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TFG_WITHDRAWAL_STATUS.TZ, "yyyy-MM-dd");
  }
  const raw = String(value == null ? "" : value)
    .trim().replace(/年/g, "-").replace(/月/g, "-").replace(/日/g, "").replace(/[/.]/g, "-");
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== mo || check.getUTCDate() !== d) return "";
  return String(y).padStart(4, "0") + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function isTfgWithdrawalCancelled_(value) {
  const status = String(value || "").trim().toUpperCase();
  return TFG_WITHDRAWAL_STATUS.CANCELLED.some(function(item) {
    return status === String(item).trim().toUpperCase();
  });
}
