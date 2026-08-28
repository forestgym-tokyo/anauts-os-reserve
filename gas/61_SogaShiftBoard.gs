/**
 * 9ROUND アリオ蘇我店 シフト希望・確定ボード
 *
 * 希望は soga_shift_requests、体験担当を含む確定情報は
 * soga_shift_assignments に保存する。確定時には既存の staff_shifts
 * 登録処理を利用するため、「自分のシフト」「予定一覧」と変更・削除申請は
 * 既存の八千代運用と同じ経路を通る。
 */

const SOGA_SHIFT_REQUEST_SHEET = "soga_shift_requests";
const SOGA_SHIFT_ASSIGNMENT_SHEET = "soga_shift_assignments";
const SOGA_SHIFT_REQUEST_HEADERS = [
  "request_id", "store_code", "staff_code", "date", "start_time", "end_time",
  "submitted_at", "updated_at"
];
const SOGA_SHIFT_ASSIGNMENT_HEADERS = [
  "assignment_id", "shift_id", "store_code", "staff_code", "date",
  "start_time", "end_time", "assignment_type", "confirmed_by", "confirmed_at"
];
const SOGA_SHIFT_SLOTS = [
  ["10:15", "11:00"],
  ["11:00", "11:45"],
  ["11:45", "12:30"],
  ["12:30", "13:15"],
  ["13:15", "14:00"],
  ["16:15", "17:00"],
  ["17:00", "17:45"],
  ["17:45", "18:30"],
  ["18:30", "19:15"],
  ["19:15", "20:00"],
  ["20:00", "20:45"]
];

function getMySogaShiftRequests(params) {
  try {
    params = params || {};
    const auth = requireAuth_(params, ["ADMIN", "MANAGER", "STAFF"]);
    const month = sogaRequireMonth_(params.month);
    const storeCode = sogaRequireStoreCode_(params.store_code);
    sogaRequireStaffEligibility_(auth, storeCode);
    const rows = sogaReadSheet_(
      sogaGetSheet_(SOGA_SHIFT_REQUEST_SHEET, SOGA_SHIFT_REQUEST_HEADERS)
    ).filter(function (row) {
      return row.store_code === storeCode &&
        row.staff_code === auth.staff_code &&
        row.date.slice(0, 7) === month;
    });

    return successResponse({
      month: month,
      store_code: storeCode,
      slots: sogaSlotObjects_(),
      requests: rows.map(sogaPublicRequest_)
    });
  } catch (error) {
    return errorResponse(error.message, "SOGA_SHIFT_REQUEST_ERROR");
  }
}

function getSogaShiftBoard(params) {
  try {
    params = params || {};
    requireAuth_(params, ["ADMIN", "MANAGER"]);
    const month = sogaRequireMonth_(params.month);
    const storeCode = sogaRequireStoreCode_(params.store_code);
    const requests = sogaReadSheet_(
      sogaGetSheet_(SOGA_SHIFT_REQUEST_SHEET, SOGA_SHIFT_REQUEST_HEADERS)
    ).filter(function (row) {
      return row.store_code === storeCode && row.date.slice(0, 7) === month;
    });
    const assignments = sogaActiveAssignments_(storeCode, month);
    const staff = sogaStaffRows_().filter(function (row) {
      return sogaIsEligibleStaff_(row, storeCode);
    });

    return successResponse({
      month: month,
      store_code: storeCode,
      slots: sogaSlotObjects_(),
      staff: staff,
      requests: requests.map(sogaPublicRequest_),
      assignments: assignments
    });
  } catch (error) {
    return errorResponse(error.message, "SOGA_SHIFT_BOARD_ERROR");
  }
}

function saveMySogaShiftRequests(body) {
  const lock = LockService.getScriptLock();
  try {
    body = body || {};
    const auth = requireAuth_(body, ["ADMIN", "MANAGER", "STAFF"]);
    const month = sogaRequireMonth_(body.month);
    const storeCode = sogaRequireStoreCode_(body.store_code);
    sogaRequireStaffEligibility_(auth, storeCode);
    const requests = Array.isArray(body.requests) ? body.requests : [];
    const normalized = [];
    const seen = {};

    requests.forEach(function (row) {
      const date = sogaDate_(row && row.date);
      const start = sogaTime_(row && row.start_time);
      const end = sogaTime_(row && row.end_time);
      if (date.slice(0, 7) !== month) throw new Error("対象月以外の日付が含まれています。");
      if (!sogaIsSlot_(start, end)) throw new Error("蘇我店の45分枠ではない時間が含まれています。");
      const key = date + "|" + start;
      if (seen[key]) return;
      seen[key] = true;
      normalized.push({ date: date, start_time: start, end_time: end });
    });

    lock.waitLock(20000);
    const sheet = sogaGetSheet_(SOGA_SHIFT_REQUEST_SHEET, SOGA_SHIFT_REQUEST_HEADERS);
    sogaDeleteMatchingRows_(sheet, function (row) {
      return row.store_code === storeCode &&
        row.staff_code === auth.staff_code &&
        row.date.slice(0, 7) === month;
    });

    const now = new Date();
    if (normalized.length) {
      const values = normalized.map(function (row) {
        return [
          Utilities.getUuid(), storeCode, auth.staff_code, row.date,
          row.start_time, row.end_time, now, now
        ];
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
    }

    return successResponse({
      month: month,
      store_code: storeCode,
      staff_code: auth.staff_code,
      saved_count: normalized.length
    });
  } catch (error) {
    return errorResponse(error.message, "SOGA_SHIFT_REQUEST_SAVE_ERROR");
  } finally {
    try { lock.releaseLock(); } catch (_) { }
  }
}

function importSogaShiftRequests(body) {
  const lock = LockService.getScriptLock();
  try {
    body = body || {};
    requireAuth_(body, ["ADMIN", "MANAGER"]);
    const month = sogaRequireMonth_(body.month);
    const storeCode = sogaRequireStoreCode_(body.store_code);
    const sourceRows = Array.isArray(body.requests) ? body.requests : [];
    if (!sourceRows.length) throw new Error("取り込むシフト希望がありません。");
    const normalized = [];
    const sourceKeys = {};
    const allowedStaff = {};
    sogaStaffRows_().filter(function (row) {
      return sogaIsEligibleStaff_(row, storeCode);
    }).forEach(function (row) {
      allowedStaff[row.staff_code] = true;
    });

    sourceRows.forEach(function (row, index) {
      const staffCode = String(row && row.staff_code || "").trim().toUpperCase();
      const date = sogaDate_(row && row.date);
      const start = sogaTime_(row && row.start_time);
      const end = sogaTime_(row && row.end_time);
      if (!staffCode) throw new Error("CSV " + (index + 2) + "行目のstaff_codeが空です。");
      if (!allowedStaff[staffCode]) throw new Error("CSV " + (index + 2) + "行目のスタッフは9ROUND担当に登録されていません。");
      if (date.slice(0, 7) !== month) throw new Error("CSV " + (index + 2) + "行目が対象月外です。");
      if (!sogaIsSlot_(start, end)) throw new Error("CSV " + (index + 2) + "行目が蘇我店の45分枠ではありません。");
      const key = staffCode + "|" + date + "|" + start;
      if (sourceKeys[key]) return;
      sourceKeys[key] = true;
      normalized.push({ staff_code: staffCode, date: date, start_time: start, end_time: end });
    });

    lock.waitLock(20000);
    const sheet = sogaGetSheet_(SOGA_SHIFT_REQUEST_SHEET, SOGA_SHIFT_REQUEST_HEADERS);
    const existingKeys = {};
    sogaReadSheet_(sheet).filter(function (row) {
      return row.store_code === storeCode && row.date.slice(0, 7) === month;
    }).forEach(function (row) {
      existingKeys[row.staff_code + "|" + row.date + "|" + row.start_time] = true;
    });

    const now = new Date();
    const inserts = normalized.filter(function (row) {
      return !existingKeys[row.staff_code + "|" + row.date + "|" + row.start_time];
    }).map(function (row) {
      return [
        Utilities.getUuid(), storeCode, row.staff_code, row.date,
        row.start_time, row.end_time, now, now
      ];
    });
    if (inserts.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, inserts.length, inserts[0].length).setValues(inserts);
    }

    return successResponse({
      month: month,
      store_code: storeCode,
      input_count: normalized.length,
      inserted_count: inserts.length,
      skipped_count: normalized.length - inserts.length
    });
  } catch (error) {
    return errorResponse(error.message, "SOGA_SHIFT_REQUEST_IMPORT_ERROR");
  } finally {
    try { lock.releaseLock(); } catch (_) { }
  }
}

function saveSogaShiftAssignments(body) {
  const lock = LockService.getScriptLock();
  const createdShiftIds = [];
  try {
    body = body || {};
    const auth = requireAuth_(body, ["ADMIN", "MANAGER"]);
    const month = sogaRequireMonth_(body.month);
    const storeCode = sogaRequireStoreCode_(body.store_code);
    const assignments = sogaNormalizeAssignments_(body.assignments, month);
    const allowedStaff = {};
    sogaStaffRows_().filter(function (row) {
      return sogaIsEligibleStaff_(row, storeCode);
    }).forEach(function (row) {
      allowedStaff[row.staff_code] = true;
    });
    assignments.forEach(function (row) {
      if (!allowedStaff[row.staff_code]) {
        throw new Error(row.staff_code + " は9ROUND担当に登録されていません。");
      }
    });

    lock.waitLock(20000);
    const assignmentSheet = sogaGetSheet_(
      SOGA_SHIFT_ASSIGNMENT_SHEET,
      SOGA_SHIFT_ASSIGNMENT_HEADERS
    );
    const previous = sogaReadSheet_(assignmentSheet).filter(function (row) {
      return row.store_code === storeCode && row.date.slice(0, 7) === month;
    });

    const now = new Date();
    const previousByKey = {};
    previous.forEach(function (row) {
      previousByKey[sogaAssignmentKey_(row)] = row;
    });
    const desiredByKey = {};
    assignments.forEach(function (row) {
      desiredByKey[sogaAssignmentKey_(row)] = row;
    });
    const removed = previous.filter(function (row) {
      return !desiredByKey[sogaAssignmentKey_(row)];
    });
    const savedRows = [];
    assignments.forEach(function (row) {
      const existing = previousByKey[sogaAssignmentKey_(row)];
      if (existing && existing.shift_id) {
        savedRows.push([
          existing.assignment_id || Utilities.getUuid(), existing.shift_id,
          storeCode, row.staff_code, row.date, row.start_time, row.end_time,
          row.assignment_type, auth.staff_code, now
        ]);
        return;
      }
      const result = sogaParseResponse_(saveStaffShift({
        staff_code: row.staff_code,
        store_code: storeCode,
        date: row.date,
        start_time: row.start_time,
        end_time: row.end_time
      }));
      if (!result || result.ok !== true) {
        throw new Error(result && result.message || "蘇我シフトを登録できませんでした。");
      }
      const saved = result.data || {};
      const shiftId = String(saved.shift_id || saved.id || "").trim();
      if (!shiftId) throw new Error("登録したシフトIDを取得できませんでした。");
      createdShiftIds.push(shiftId);
      savedRows.push([
        Utilities.getUuid(), shiftId, storeCode, row.staff_code, row.date,
        row.start_time, row.end_time, row.assignment_type,
        auth.staff_code, now
      ]);
    });

    removed.forEach(function (row) {
      if (!row.shift_id) return;
      const deleted = sogaParseResponse_(deleteStaffShift({ shift_id: row.shift_id }));
      if (deleted && deleted.ok === false) {
        throw new Error(deleted.message || "既存の蘇我シフトを削除できませんでした。");
      }
    });
    sogaDeleteMatchingRows_(assignmentSheet, function (row) {
      return row.store_code === storeCode && row.date.slice(0, 7) === month;
    });

    if (savedRows.length) {
      assignmentSheet.getRange(
        assignmentSheet.getLastRow() + 1,
        1,
        savedRows.length,
        savedRows[0].length
      ).setValues(savedRows);
    }

    return successResponse({
      month: month,
      store_code: storeCode,
      saved_count: savedRows.length,
      trial_count: assignments.filter(function (row) {
        return row.assignment_type === "TRIAL";
      }).length
    });
  } catch (error) {
    createdShiftIds.forEach(function (shiftId) {
      try { deleteStaffShift({ shift_id: shiftId }); } catch (_) { }
    });
    return errorResponse(error.message, "SOGA_SHIFT_ASSIGNMENT_SAVE_ERROR");
  } finally {
    try { lock.releaseLock(); } catch (_) { }
  }
}

function sogaAssignmentKey_(row) {
  return [
    String(row && row.date || "").slice(0, 10),
    sogaTime_(row && row.start_time),
    String(row && row.staff_code || "").trim().toUpperCase()
  ].join("|");
}

function sogaNormalizeAssignments_(rows, month) {
  rows = Array.isArray(rows) ? rows : [];
  const normalized = [];
  const slotCounts = {};
  const seen = {};
  rows.forEach(function (row) {
    const staffCode = String(row && row.staff_code || "").trim().toUpperCase();
    const date = sogaDate_(row && row.date);
    const start = sogaTime_(row && row.start_time);
    const end = sogaTime_(row && row.end_time);
    const type = String(row && row.assignment_type || "SHIFT").trim().toUpperCase();
    if (!staffCode) throw new Error("スタッフコードが空の確定枠があります。");
    if (date.slice(0, 7) !== month) throw new Error("対象月以外の日付が含まれています。");
    if (!sogaIsSlot_(start, end)) throw new Error("蘇我店の45分枠ではない時間が含まれています。");
    if (type !== "SHIFT" && type !== "TRIAL") throw new Error("担当区分が不正です。");
    const slotKey = date + "|" + start;
    const personKey = slotKey + "|" + staffCode;
    if (seen[personKey]) throw new Error("同じ枠に同じスタッフが重複しています。");
    seen[personKey] = true;
    slotCounts[slotKey] = Number(slotCounts[slotKey] || 0) + 1;
    if (slotCounts[slotKey] > 2) throw new Error("1枠に選択できるスタッフは2名までです。");
    normalized.push({
      staff_code: staffCode,
      date: date,
      start_time: start,
      end_time: end,
      assignment_type: type
    });
  });
  return normalized;
}

function sogaActiveAssignments_(storeCode, month) {
  const recorded = sogaReadSheet_(
    sogaGetSheet_(SOGA_SHIFT_ASSIGNMENT_SHEET, SOGA_SHIFT_ASSIGNMENT_HEADERS)
  ).filter(function (row) {
    return row.store_code === storeCode && row.date.slice(0, 7) === month;
  });
  if (!recorded.length) return [];

  const range = sogaMonthRange_(month);
  const response = sogaParseResponse_(getStaffShifts({
    start_date: range.start,
    end_date: range.end
  }));
  const shifts = response && response.ok === true
    ? (Array.isArray(response.data) ? response.data : (response.data && response.data.shifts || []))
    : [];
  const activeById = {};
  shifts.filter(function (row) {
    return String(row.store_code || "").trim().toUpperCase() === storeCode && row.active !== false;
  }).forEach(function (row) {
    activeById[String(row.shift_id || "")] = row;
  });

  return recorded.map(function (row) {
    const shift = activeById[row.shift_id];
    if (!shift) return null;
    const date = sogaDate_(shift.date);
    const start = sogaTime_(shift.start_time);
    const end = sogaTime_(shift.end_time);
    if (!sogaIsSlot_(start, end)) return null;
    return {
      assignment_id: row.assignment_id,
      shift_id: row.shift_id,
      store_code: storeCode,
      staff_code: String(shift.staff_code || row.staff_code || "").trim().toUpperCase(),
      date: date,
      start_time: start,
      end_time: end,
      assignment_type: row.assignment_type === "TRIAL" ? "TRIAL" : "SHIFT"
    };
  }).filter(Boolean);
}

function sogaStaffRows_() {
  const response = sogaParseResponse_(getStaff({ include_inactive: "false" }));
  const rows = response && response.ok === true
    ? (Array.isArray(response.data) ? response.data : (response.data && response.data.staff || []))
    : [];
  return rows.map(function (row) {
    return {
      staff_code: String(row.staff_code || "").trim().toUpperCase(),
      staff_name: String(row.staff_name || row.display_name || "").trim(),
      display_name: String(row.display_name || row.staff_name || row.staff_code || "").trim(),
      role: String(row.role || "STAFF").trim().toUpperCase(),
      store_code: String(row.store_code || "").trim().toUpperCase(),
      can_9round: sogaBool_(row.can_9round),
      active: row.active !== false
    };
  });
}

function sogaIsEligibleStaff_(row, storeCode) {
  if (!row || row.active === false) return false;
  const ownStore = String(row.store_code || "").trim().toUpperCase();
  const targetStore = String(storeCode || "").trim().toUpperCase();
  return sogaBool_(row.can_9round) || (!!targetStore && ownStore === targetStore);
}

function sogaRequireStaffEligibility_(auth, storeCode) {
  const permission = String(auth && auth.permission || "STAFF").trim().toUpperCase();
  if (permission === "ADMIN" || permission === "MANAGER") return;
  const staffCode = String(auth && auth.staff_code || "").trim().toUpperCase();
  const staff = sogaStaffRows_().find(function (row) {
    return row.staff_code === staffCode;
  });
  if (!sogaIsEligibleStaff_(staff, storeCode)) {
    throw new Error("このスタッフは蘇我シフトの対象に登録されていません。");
  }
}

function sogaGetSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const missing = headers.filter(function (header) { return current.indexOf(header) < 0; });
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function sogaReadSheet_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (valuesRow, index) {
    const row = { _row: index + 2 };
    headers.forEach(function (header, column) {
      let value = valuesRow[column];
      if (header === "date") value = sogaDate_(value);
      if (header === "start_time" || header === "end_time") value = sogaTime_(value);
      if (header === "store_code" || header === "staff_code" || header === "assignment_type") {
        value = String(value || "").trim().toUpperCase();
      }
      if (header === "request_id" || header === "assignment_id" || header === "shift_id") {
        value = String(value || "").trim();
      }
      row[header] = value;
    });
    return row;
  });
}

function sogaDeleteMatchingRows_(sheet, predicate) {
  sogaReadSheet_(sheet).filter(predicate).sort(function (a, b) {
    return b._row - a._row;
  }).forEach(function (row) {
    sheet.deleteRow(row._row);
  });
}

function sogaPublicRequest_(row) {
  return {
    request_id: row.request_id,
    store_code: row.store_code,
    staff_code: row.staff_code,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time
  };
}

function sogaSlotObjects_() {
  return SOGA_SHIFT_SLOTS.map(function (slot) {
    return { start_time: slot[0], end_time: slot[1] };
  });
}

function sogaIsSlot_(start, end) {
  return SOGA_SHIFT_SLOTS.some(function (slot) {
    return slot[0] === start && slot[1] === end;
  });
}

function sogaRequireMonth_(value) {
  const month = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("対象月を指定してください。");
  return month;
}

function sogaRequireStoreCode_(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!code) throw new Error("蘇我店の店舗コードを指定してください。");
  return code;
}

function sogaMonthRange_(month) {
  const parts = month.split("-").map(Number);
  const last = new Date(parts[0], parts[1], 0).getDate();
  return { start: month + "-01", end: month + "-" + ("0" + last).slice(-2) };
}

function sogaDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("日付形式が不正です。");
  return text;
}

function sogaTime_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error("時刻形式が不正です。");
  return ("0" + Number(match[1])).slice(-2) + ":" + match[2];
}

function sogaBool_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON"].indexOf(String(value || "").trim().toUpperCase()) >= 0;
}

function sogaParseResponse_(response) {
  if (response && typeof response.getContent === "function") {
    return JSON.parse(response.getContent() || "{}");
  }
  if (typeof response === "string") return JSON.parse(response || "{}");
  return response || {};
}
