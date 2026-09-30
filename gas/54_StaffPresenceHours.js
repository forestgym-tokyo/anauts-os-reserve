/**
 * ============================================================
 * A-nauts OS Reserve
 * Staff Presence Hours
 * ============================================================
 *
 * 対象: STAFFのみ
 * TRAINERには在駐時間制限を適用しない。
 *
 * Priority:
 *   DATE > MONTH_DAY > WEEKDAY
 */

const STAFF_PRESENCE_WEEKDAY_SHEET = "staff_presence_weekdays";
const STAFF_PRESENCE_SPECIAL_SHEET = "staff_presence_specials";

function getPresenceWeekdaySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STAFF_PRESENCE_WEEKDAY_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(STAFF_PRESENCE_WEEKDAY_SHEET);
    sheet.getRange(1,1,1,7).setValues([[
      "store_code","day_of_week","start_time","end_time","closed","created_at","updated_at"
    ]]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getPresenceSpecialSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STAFF_PRESENCE_SPECIAL_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(STAFF_PRESENCE_SPECIAL_SHEET);
    sheet.getRange(1,1,1,11).setValues([[
      "presence_id","store_code","rule_type","month_day","specific_date",
      "label","start_time","end_time","closed","created_at","updated_at"
    ]]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getStaffPresenceHours(params) {
  requireAuth_(params || {}, ["ADMIN","MANAGER"]);

  const storeCode = String(params.store_code || "").trim();
  const weekdays = sheetObjects_(getPresenceWeekdaySheet_())
    .filter(r => !storeCode || String(r.store_code || "").trim() === storeCode)
    .map(normalizePresenceRecord_);

  const specials = sheetObjects_(getPresenceSpecialSheet_())
    .filter(r => !storeCode || String(r.store_code || "").trim() === storeCode)
    .map(normalizePresenceRecord_);

  return successResponse({
    weekdays:weekdays,
    specials:specials
  });
}

function saveStaffPresenceWeekdays(body) {
  requireServiceManagementPermission_(body || {});

  const storeCode = String(body.store_code || "").trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const validDays = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

  if (!storeCode) {
    return errorResponse("店舗を指定してください。","VALIDATION_ERROR");
  }

  if (rows.length !== 7) {
    return errorResponse("7曜日すべてを指定してください。","VALIDATION_ERROR");
  }

  const sheet = getPresenceWeekdaySheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const now = new Date();

  rows.forEach(item => {
    const day = String(item.day_of_week || "").trim().toUpperCase();
    const closed = normalizePresenceBoolean_(item.closed);
    const start = closed ? "" : normalizePresenceTime_(item.start_time);
    const end = closed ? "" : normalizePresenceTime_(item.end_time);

    if (!validDays.includes(day)) {
      throw new Error("曜日設定が不正です：" + day);
    }

    if (!closed && (!start || !end || presenceMinutes_(start) >= presenceMinutes_(end))) {
      throw new Error(day + " の在駐時間が不正です。");
    }

    let rowNumber = -1;

    for (let r=1; r<values.length; r++) {
      if (
        String(values[r][headers.indexOf("store_code")] || "").trim() === storeCode &&
        String(values[r][headers.indexOf("day_of_week")] || "").trim().toUpperCase() === day
      ) {
        rowNumber = r + 1;
        break;
      }
    }

    const created = rowNumber > 0
      ? values[rowNumber-1][headers.indexOf("created_at")] || now
      : now;

    const record = {
      store_code:storeCode,
      day_of_week:day,
      start_time:start,
      end_time:end,
      closed:closed,
      created_at:created,
      updated_at:now
    };

    const row = headers.map(h =>
      Object.prototype.hasOwnProperty.call(record,h) ? record[h] : ""
    );

    if (rowNumber > 0) {
      sheet.getRange(rowNumber,1,1,headers.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  });

  return successResponse({saved:true});
}

function saveStaffPresenceSpecial(body) {
  requireServiceManagementPermission_(body || {});

  const storeCode = String(body.store_code || "").trim();
  const type = String(body.rule_type || "").trim().toUpperCase();
  const closed = normalizePresenceBoolean_(body.closed);
  const monthDay = type === "MONTH_DAY" ? Number(body.month_day) : "";
  const specificDate = type === "DATE" ? normalizePresenceDate_(body.specific_date) : "";
  const label = String(body.label || "").trim();
  const start = closed ? "" : normalizePresenceTime_(body.start_time);
  const end = closed ? "" : normalizePresenceTime_(body.end_time);

  if (!storeCode) {
    return errorResponse("店舗を指定してください。","VALIDATION_ERROR");
  }

  if (!["MONTH_DAY","DATE"].includes(type)) {
    return errorResponse("追加設定の種別が不正です。","VALIDATION_ERROR");
  }

  if (
    type === "MONTH_DAY" &&
    (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)
  ) {
    return errorResponse("毎月の日を1〜31で指定してください。","VALIDATION_ERROR");
  }

  if (
    type === "DATE" &&
    !/^\d{4}-\d{2}-\d{2}$/.test(specificDate)
  ) {
    return errorResponse("特定日を指定してください。","VALIDATION_ERROR");
  }

  if (
    !closed &&
    (!start || !end || presenceMinutes_(start) >= presenceMinutes_(end))
  ) {
    return errorResponse("開始・終了時刻を確認してください。","VALIDATION_ERROR");
  }

  const sheet = getPresenceSpecialSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);

  let id = String(body.presence_id || "").trim();
  let rowNumber = -1;

  for (let r=1; r<values.length; r++) {
    const row = values[r];

    const sameStore =
      String(row[headers.indexOf("store_code")] || "").trim() === storeCode;

    const sameType =
      String(row[headers.indexOf("rule_type")] || "").trim().toUpperCase() === type;

    const sameKey =
      type === "DATE"
        ? normalizePresenceDate_(row[headers.indexOf("specific_date")]) === specificDate
        : Number(row[headers.indexOf("month_day")]) === monthDay;

    if (
      (id && String(row[headers.indexOf("presence_id")] || "").trim() === id) ||
      (!id && sameStore && sameType && sameKey)
    ) {
      rowNumber = r + 1;

      if (!id) {
        id = String(row[headers.indexOf("presence_id")] || "").trim();
      }

      break;
    }
  }

  if (!id) {
    id = "PRES-" + Utilities.getUuid().slice(0,8).toUpperCase();
  }

  const now = new Date();

  const created = rowNumber > 0
    ? values[rowNumber-1][headers.indexOf("created_at")] || now
    : now;

  const record = {
    presence_id:id,
    store_code:storeCode,
    rule_type:type,
    month_day:monthDay,
    specific_date:specificDate,
    label:label,
    start_time:start,
    end_time:end,
    closed:closed,
    created_at:created,
    updated_at:now
  };

  const row = headers.map(h =>
    Object.prototype.hasOwnProperty.call(record,h) ? record[h] : ""
  );

  if (rowNumber > 0) {
    sheet.getRange(rowNumber,1,1,headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return successResponse({presence_id:id});
}

function deleteStaffPresenceSpecial(body) {
  requireServiceManagementPermission_(body || {});

  const id = String(body.presence_id || "").trim();

  if (!id) {
    return errorResponse("presence_idを指定してください。","VALIDATION_ERROR");
  }

  const sheet = getPresenceSpecialSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = headers.indexOf("presence_id");

  for (let r=1; r<values.length; r++) {
    if (String(values[r][idx] || "").trim() === id) {
      sheet.deleteRow(r+1);
      return successResponse({deleted:true});
    }
  }

  return errorResponse("追加設定が見つかりません。","NOT_FOUND");
}

function getResolvedStaffPresenceHours(params) {
  requireAuth_(params || {}, ["ADMIN","MANAGER","STAFF"]);

  const storeCode = String(params.store_code || "").trim();
  const date = normalizePresenceDate_(params.date);

  if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return errorResponse("店舗と日付を指定してください。","VALIDATION_ERROR");
  }

  return successResponse(
    resolveStaffPresenceHours_(storeCode,date)
  );
}

function resolveStaffPresenceHours_(storeCode,date) {
  const specials = sheetObjects_(getPresenceSpecialSheet_())
    .filter(r => String(r.store_code || "").trim() === storeCode)
    .map(normalizePresenceRecord_);

  const exact = specials.find(r =>
    r.rule_type === "DATE" &&
    r.specific_date === date
  );

  if (exact) {
    return presenceResolved_(exact,"DATE");
  }

  const day = Number(date.slice(8,10));

  const monthly = specials.find(r =>
    r.rule_type === "MONTH_DAY" &&
    Number(r.month_day) === day
  );

  if (monthly) {
    return presenceResolved_(monthly,"MONTH_DAY");
  }

  const weekdayCode =
    ["SUN","MON","TUE","WED","THU","FRI","SAT"][
      new Date(date + "T12:00:00").getDay()
    ];

  const weekday = sheetObjects_(getPresenceWeekdaySheet_())
    .map(normalizePresenceRecord_)
    .find(r =>
      String(r.store_code || "").trim() === storeCode &&
      r.day_of_week === weekdayCode
    );

  if (weekday) {
    return presenceResolved_(weekday,"WEEKDAY");
  }

  return {
    store_code:storeCode,
    date:date,
    source:"NONE",
    closed:true,
    start_time:"",
    end_time:"",
    label:"在駐設定なし"
  };
}

function presenceResolved_(r,source) {
  return {
    store_code:r.store_code,
    date:r.specific_date || "",
    source:source,
    rule_type:r.rule_type || "",
    day_of_week:r.day_of_week || "",
    month_day:r.month_day || "",
    label:r.label || "",
    start_time:r.start_time || "",
    end_time:r.end_time || "",
    closed:normalizePresenceBoolean_(r.closed)
  };
}

function validateStaffShiftAgainstPresence_(storeCode,date,startTime,endTime) {
  const p = resolveStaffPresenceHours_(storeCode,date);

  if (p.closed || !p.start_time || !p.end_time) {
    return {
      ok:false,
      presence:p,
      message:"この日はスタッフ在駐時間が設定されていません。"
    };
  }

  const ok =
    presenceMinutes_(startTime) >= presenceMinutes_(p.start_time) &&
    presenceMinutes_(endTime) <= presenceMinutes_(p.end_time);

  return {
    ok:ok,
    presence:p,
    message:ok
      ? ""
      : "変更後の勤務時間はスタッフ在駐時間内で指定してください。この日の在駐時間：" +
        p.start_time + "〜" + p.end_time
  };
}

function sheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return [];
  }

  const headers = values[0].map(v => String(v).trim());

  return values.slice(1).map(row => {
    const o = {};
    headers.forEach((h,i)=>o[h]=row[i]);
    return o;
  });
}

function normalizePresenceRecord_(r) {
  const o = Object.assign({},r);

  o.rule_type = String(o.rule_type || "").trim().toUpperCase();
  o.day_of_week = String(o.day_of_week || "").trim().toUpperCase();
  o.month_day = o.month_day === "" ? "" : Number(o.month_day);
  o.specific_date = normalizePresenceDate_(o.specific_date);
  o.start_time = normalizePresenceTime_(o.start_time);
  o.end_time = normalizePresenceTime_(o.end_time);
  o.closed = normalizePresenceBoolean_(o.closed);

  return o;
}

function normalizePresenceBoolean_(v) {
  if (v === true) return true;

  const s = String(
    v == null ? "" : v
  ).trim().toUpperCase();

  return (
    s === "TRUE" ||
    s === "1" ||
    s === "YES" ||
    s === "ON"
  );
}

function normalizePresenceDate_(v) {
  if (!v) return "";

  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(
      v,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  const s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(v);

  return isNaN(d.getTime())
    ? s
    : Utilities.formatDate(
        d,
        APP_CONFIG.TIMEZONE,
        "yyyy-MM-dd"
      );
}

function normalizePresenceTime_(v) {
  if (
    v === "" ||
    v === null ||
    v === undefined
  ) {
    return "";
  }

  if (
    v instanceof Date &&
    !isNaN(v.getTime())
  ) {
    return Utilities.formatDate(
      v,
      APP_CONFIG.TIMEZONE,
      "HH:mm"
    );
  }

  const s = String(v).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);

  if (m) {
    return String(
      Number(m[1])
    ).padStart(2,"0") + ":" + m[2];
  }

  return s;
}

function presenceMinutes_(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(
    normalizePresenceTime_(v)
  );

  return m
    ? Number(m[1]) * 60 + Number(m[2])
    : NaN;
}


/**
 * 初回だけGASエディタから1回実行
 */
function bootstrapStaffPresenceHours() {
  const sheet = getPresenceWeekdaySheet_();
  const existing = sheetObjects_(sheet);
  const store = "YACHIYO";

  if (!existing.some(r =>
    String(r.store_code || "").trim() === store
  )) {
    const defaults = [
      ["MON","09:00","16:00",false],
      ["TUE","16:00","21:00",false],
      ["WED","09:00","16:00",false],
      ["THU","16:00","21:00",false],
      ["FRI","","",true],
      ["SAT","11:00","21:00",false],
      ["SUN","09:00","16:00",false]
    ];

    const now = new Date();

    defaults.forEach(r =>
      sheet.appendRow([
        store,
        r[0],
        r[1],
        r[2],
        r[3],
        now,
        now
      ])
    );
  }

  const specialSheet = getPresenceSpecialSheet_();
  const specials = sheetObjects_(specialSheet);

  const hasNine = specials.some(r =>
    String(r.store_code || "").trim() === store &&
    String(r.rule_type || "").trim().toUpperCase() === "MONTH_DAY" &&
    Number(r.month_day) === 9
  );

  if (!hasNine) {
    const now = new Date();

    specialSheet.appendRow([
      "PRES-" + Utilities.getUuid().slice(0,8).toUpperCase(),
      store,
      "MONTH_DAY",
      9,
      "",
      "退会手続き最終日",
      "15:00",
      "20:00",
      false,
      now,
      now
    ]);
  }

  Logger.log("スタッフ在駐時間の初期設定を確認しました。");
}
