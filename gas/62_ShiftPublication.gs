/**
 * 9ROUND アリオ蘇我店の月次シフト公開制御。
 *
 * 2026年10月分以降はADMINが月単位で公開するまで、STAFFには
 * 予定・個人シフトの中身を返さず「公開前」状態を返す。
 * ADMIN / MANAGERは調整中の内容を常に確認できる。
 */

const STAFF_SHIFT_PUBLICATION_SHEET = "staff_shift_publications";
const STAFF_SHIFT_PUBLICATION_START_MONTH = "2026-10";
const STAFF_SHIFT_PUBLICATION_STORE = "SOGA";
const STAFF_SHIFT_PUBLICATION_CACHE_KEY = "staff-shift-publications-v1";
const STAFF_SHIFT_PUBLICATION_HEADERS = [
  "publication_id", "store_code", "target_month", "status",
  "published_by", "published_at", "updated_at"
];

function getStaffShiftPublication(params) {
  try {
    params = params || {};
    const auth = requireAuth_(params, ["ADMIN", "MANAGER", "STAFF"]);
    const month = normalizeStaffShiftPublicationMonth_(params.month);
    const storeCode = normalizeStaffShiftPublicationStore_(
      params.store_code || auth.profile && auth.profile.store_code
    );

    if (!storeCode) throw new Error("店舗を指定してください。");
    if (storeCode !== STAFF_SHIFT_PUBLICATION_STORE) {
      throw new Error("公開制御は9ROUND アリオ蘇我店のシフトが対象です。");
    }

    return successResponse(buildStaffShiftPublicationStatus_(storeCode, month));
  } catch (error) {
    return errorResponse(error.message, "SHIFT_PUBLICATION_STATUS_ERROR");
  }
}

function publishStaffShiftMonth(body) {
  const lock = LockService.getScriptLock();
  try {
    body = body || {};
    const auth = requireAuth_(body, ["ADMIN"]);
    const month = normalizeStaffShiftPublicationMonth_(body.month);
    const storeCode = normalizeStaffShiftPublicationStore_(body.store_code);

    if (!storeCode) throw new Error("店舗を指定してください。");
    if (storeCode !== STAFF_SHIFT_PUBLICATION_STORE) {
      throw new Error("公開操作は9ROUND アリオ蘇我店のシフトが対象です。");
    }
    if (month < STAFF_SHIFT_PUBLICATION_START_MONTH) {
      throw new Error("2026年9月以前のシフトは公開済みとして扱われます。");
    }

    lock.waitLock(20000);
    const now = new Date();
    const actor = String(auth.staff_code || auth.email || "").trim();
    upsertStaffShiftPublication_(storeCode, month, "PUBLISHED", actor, now);

    return successResponse({
      store_code: storeCode,
      target_month: month,
      status: "PUBLISHED",
      is_published: true,
      published_by: actor,
      published_at: now
    });
  } catch (error) {
    return errorResponse(error.message, "SHIFT_PUBLICATION_SAVE_ERROR");
  } finally {
    try { lock.releaseLock(); } catch (_) { }
  }
}

/** 調整保存時に再び公開前へ戻す。呼び出し元のロック内で実行する。 */
function markStaffShiftMonthDraft_(storeCode, month) {
  storeCode = normalizeStaffShiftPublicationStore_(storeCode);
  month = normalizeStaffShiftPublicationMonth_(month);
  if (
    storeCode !== STAFF_SHIFT_PUBLICATION_STORE ||
    month < STAFF_SHIFT_PUBLICATION_START_MONTH
  ) return;
  upsertStaffShiftPublication_(storeCode, month, "DRAFT", "", new Date());
}

function upsertStaffShiftPublication_(storeCode, month, status, actor, now) {
  const sheet = getStaffShiftPublicationSheet_();
  const existing = readStaffShiftPublicationRows_(sheet).find(function (row) {
    return row.store_code === storeCode && row.target_month === month;
  });
  const published = status === "PUBLISHED";
  const values = [
    existing && existing.publication_id || Utilities.getUuid(),
    storeCode,
    month,
    status,
    published ? actor : (existing && existing.published_by || ""),
    published ? now : (existing && existing.published_at || ""),
    now
  ];

  if (existing) {
    sheet.getRange(existing._row, 1, 1, values.length).setValues([values]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
  }
  clearStaffShiftPublicationCache_();
}

/** getStaffShiftsの返却直前に公開前データをSTAFFへ返さない。 */
function enforceStaffShiftPublication_(response, params, auth) {
  const permission = String(auth && auth.permission || "STAFF").trim().toUpperCase();
  if (permission === "ADMIN" || permission === "MANAGER") return response;

  const payload = parseAuthJsonResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const data = payload.data;
  const rows = Array.isArray(data)
    ? data
    : (data && Array.isArray(data.shifts) ? data.shifts : []);
  const publicationMap = getStaffShiftPublicationMap_();
  const hiddenScopes = {};
  const visibleRows = rows.filter(function (row) {
    const storeCode = normalizeStaffShiftPublicationStore_(
      row && row.store_code || params && params.store_code ||
      auth && auth.profile && auth.profile.store_code
    );
    const month = String(row && row.date || "").slice(0, 7);
    if (!storeCode || !/^\d{4}-\d{2}$/.test(month)) return true;
    if (isStaffShiftMonthPublishedFromMap_(publicationMap, storeCode, month)) return true;
    hiddenScopes[storeCode + "|" + month] = {
      store_code: storeCode,
      target_month: month
    };
    return false;
  });

  const requestedStore = normalizeStaffShiftPublicationStore_(params && params.store_code);
  const requestedMonths = staffShiftPublicationMonthsInRange_(
    params && params.start_date,
    params && params.end_date
  );
  if (requestedStore && requestedMonths.length) {
    const unpublished = requestedMonths.filter(function (month) {
      return !isStaffShiftMonthPublishedFromMap_(publicationMap, requestedStore, month);
    });
    if (unpublished.length) {
      const draftOutput = Array.isArray(data)
        ? { shifts: visibleRows }
        : Object.assign({}, data || {}, { shifts: visibleRows });
      draftOutput.publication = {
        status: "DRAFT",
        is_published: false,
        has_hidden_shifts: true,
        store_code: requestedStore,
        unpublished_months: unpublished,
        hidden_scopes: Object.keys(hiddenScopes).map(function (key) {
          return hiddenScopes[key];
        }),
        message: formatStaffShiftPublicationMessage_(unpublished[0])
      };
      return successResponse(draftOutput);
    }
  }

  const hidden = Object.keys(hiddenScopes).map(function (key) {
    return hiddenScopes[key];
  });
  if (!hidden.length) return response;

  const output = Array.isArray(data)
    ? { shifts: visibleRows }
    : Object.assign({}, data || {}, { shifts: visibleRows });
  output.publication = {
    status: "DRAFT",
    is_published: false,
    has_hidden_shifts: true,
    hidden_scopes: hidden,
    message: "予定と個人シフトは公開前です。管理者が公開すると表示されます。"
  };
  return successResponse(output);
}

function buildStaffShiftPublicationStatus_(storeCode, month) {
  const published = isStaffShiftMonthPublishedFromMap_(
    getStaffShiftPublicationMap_(),
    storeCode,
    month
  );
  const record = getStaffShiftPublicationRecord_(storeCode, month);
  return {
    store_code: storeCode,
    target_month: month,
    status: published ? "PUBLISHED" : "DRAFT",
    is_published: published,
    published_by: record && record.published_by || "",
    published_at: record && record.published_at || "",
    legacy_published: month < STAFF_SHIFT_PUBLICATION_START_MONTH
  };
}

function getStaffShiftPublicationRecord_(storeCode, month) {
  if (month < STAFF_SHIFT_PUBLICATION_START_MONTH) return null;
  return readStaffShiftPublicationRows_(getStaffShiftPublicationSheet_())
    .find(function (row) {
      return row.store_code === storeCode && row.target_month === month;
    }) || null;
}

function isStaffShiftMonthPublishedFromMap_(map, storeCode, month) {
  if (storeCode !== STAFF_SHIFT_PUBLICATION_STORE) return true;
  if (month < STAFF_SHIFT_PUBLICATION_START_MONTH) return true;
  return String(map[storeCode + "|" + month] || "").toUpperCase() === "PUBLISHED";
}

function getStaffShiftPublicationMap_() {
  try {
    const cached = CacheService.getScriptCache().get(STAFF_SHIFT_PUBLICATION_CACHE_KEY) || "";
    if (cached) return JSON.parse(cached);
  } catch (_) { }

  const map = {};
  readStaffShiftPublicationRows_(getStaffShiftPublicationSheet_()).forEach(function (row) {
    map[row.store_code + "|" + row.target_month] = row.status;
  });
  try {
    CacheService.getScriptCache().put(
      STAFF_SHIFT_PUBLICATION_CACHE_KEY,
      JSON.stringify(map),
      60
    );
  } catch (_) { }
  return map;
}

function clearStaffShiftPublicationCache_() {
  try {
    CacheService.getScriptCache().remove(STAFF_SHIFT_PUBLICATION_CACHE_KEY);
  } catch (_) { }
}

function getStaffShiftPublicationSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(STAFF_SHIFT_PUBLICATION_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(STAFF_SHIFT_PUBLICATION_SHEET);
    sheet.getRange(1, 1, 1, STAFF_SHIFT_PUBLICATION_HEADERS.length)
      .setValues([STAFF_SHIFT_PUBLICATION_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const missing = STAFF_SHIFT_PUBLICATION_HEADERS.filter(function (header) {
    return current.indexOf(header) < 0;
  });
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function readStaffShiftPublicationRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (valuesRow, index) {
    const row = { _row: index + 2 };
    headers.forEach(function (header, column) {
      row[header] = valuesRow[column];
    });
    row.publication_id = String(row.publication_id || "").trim();
    row.store_code = normalizeStaffShiftPublicationStore_(row.store_code);
    row.target_month = String(row.target_month || "").trim();
    row.status = String(row.status || "DRAFT").trim().toUpperCase();
    row.published_by = String(row.published_by || "").trim();
    return row;
  }).filter(function (row) {
    return !!row.store_code && /^\d{4}-\d{2}$/.test(row.target_month);
  });
}

function normalizeStaffShiftPublicationStore_(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeStaffShiftPublicationMonth_(value) {
  const month = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("対象月をyyyy-MM形式で指定してください。");
  }
  return month;
}

function staffShiftPublicationMonthsInRange_(startDate, endDate) {
  const startMonth = String(startDate || "").slice(0, 7);
  const endMonth = String(endDate || startDate || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) return [];

  const start = startMonth.split("-").map(Number);
  const finish = endMonth.split("-").map(Number);
  const cursor = new Date(start[0], start[1] - 1, 1);
  const end = new Date(finish[0], finish[1] - 1, 1);
  const months = [];
  while (cursor <= end && months.length < 24) {
    months.push(cursor.getFullYear() + "-" + ("0" + (cursor.getMonth() + 1)).slice(-2));
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return months;
}

function formatStaffShiftPublicationMessage_(month) {
  const parts = String(month || "").split("-").map(Number);
  const label = parts.length === 2 && parts[0] && parts[1]
    ? parts[0] + "年" + parts[1] + "月"
    : String(month || "対象月");
  return label + "の予定と個人シフトは公開前です。管理者が公開すると表示されます。";
}
