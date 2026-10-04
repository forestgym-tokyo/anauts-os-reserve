/**
 * ============================================================
 * A-nauts OS Reserve
 * My Private Gym / KAWAKAMI shift automation
 * ============================================================
 *
 * Rules:
 * - MPG slots are 45 minutes from 10:15 through 20:45.
 * - YACHIYO requires a 150-minute travel buffer before and after.
 * - SOGA (9ROUND) requires no travel buffer, but overlapping MPG slots
 *   are removed automatically.
 * - Unreserved MPG slots are removed once they are within 48 hours.
 * - Reserved MPG slots are never auto-removed; a conflicting incoming
 *   non-MPG shift is rejected instead.
 */

const MPG_SHIFT_STORE_CODE_ = "MPG";
const MPG_SHIFT_SERVICE_CODE_ = "MPG_TRAINING_SUPPORT45";
const MPG_TOUR_SERVICE_CODE_ = "MPG_TOUR45";
const MPG_SHIFT_SERVICE_CODES_ = Object.freeze([
  MPG_SHIFT_SERVICE_CODE_,
  MPG_TOUR_SERVICE_CODE_
]);
const MPG_SHIFT_STAFF_CODE_ = "KAWAKAMI";
const MPG_SHIFT_YACHIYO_STORE_CODE_ = "YACHIYO";
const MPG_SHIFT_SOGA_STORE_CODE_ = "SOGA";
const MPG_SHIFT_HEAD_OFFICE_STORE_CODE_ = "HEAD_OFFICE";
const MPG_SHIFT_TRAVEL_MINUTES_ = 150;
const MPG_SHIFT_HEAD_OFFICE_TRAVEL_MINUTES_ = 150;
const MPG_SHIFT_SLOT_MINUTES_ = 45;
const MPG_SHIFT_DAY_START_MINUTES_ = 10 * 60 + 15;
const MPG_SHIFT_DAY_END_MINUTES_ = 20 * 60 + 45;
const MPG_SHIFT_UNRESERVED_CUTOFF_HOURS_ = 48;
const MPG_RESERVATION_MEMBER_MASTER_ID_ = "1-m6EtfX4XJT4uonkiX1eYxeynsX3ep9Uzk8eixU7FQk";
const MPG_RESERVATION_MEMBER_MASTER_SHEET_ = "MPG_20260830";
const MPG_TRAINING_MONTHLY_LIMIT_ = 4;

// 0=Sun ... 6=Sat. These are the agreed recurring MPG windows.
const MPG_SHIFT_WEEKLY_WINDOWS_ = {
  0: ["18:00", "21:00"],
  1: ["19:00", "21:00"],
  2: ["10:00", "13:00"],
  3: ["19:00", "21:00"],
  4: ["10:00", "13:00"]
};

function getMpgStoreCode_() {
  return MPG_SHIFT_STORE_CODE_;
}

function ensureMpgServiceConfiguration_() {
  const sheet = getSheet(APP_CONFIG.SHEETS.SERVICES);
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    throw new Error("servicesシートにヘッダーがありません。");
  }

  const headers = values[0].map(function (value) {
    return String(value || "").trim();
  });
  const codeIndex = headers.indexOf("service_code");
  if (codeIndex < 0) {
    throw new Error("servicesシートにservice_code列がありません。");
  }

  function findRow_(serviceCode) {
    const index = values.slice(1).findIndex(function (row) {
      return String(row[codeIndex] || "").trim().toUpperCase() === serviceCode;
    });
    return index >= 0 ? index + 2 : 0;
  }

  function rowObject_(rowNumber) {
    if (!rowNumber) return {};
    const raw = values[rowNumber - 1] || [];
    const obj = {};
    headers.forEach(function (header, index) {
      if (header) obj[header] = raw[index];
    });
    return obj;
  }

  const trainingRow = findRow_(MPG_SHIFT_SERVICE_CODE_);
  const trainingExisting = rowObject_(trainingRow);
  const tourRow = findRow_(MPG_TOUR_SERVICE_CODE_);
  const tourExisting = rowObject_(tourRow);
  const template = Object.assign({}, trainingExisting);

  function writeService_(rowNumber, existing, config) {
    const record = Object.assign({}, template, existing, {
      service_code: config.service_code,
      store_code: MPG_SHIFT_STORE_CODE_,
      service_name: config.service_name,
      category: config.category,
      form_type: config.form_type,
      duration: MPG_SHIFT_SLOT_MINUTES_,
      calendar_code: config.calendar_code,
      provider_role: config.provider_role,
      booking_min_hours: config.booking_min_hours,
      change_limit_hours: config.change_limit_hours,
      cancel_limit_hours: config.cancel_limit_hours,
      public_days: 30,
      slot_interval_minutes: MPG_SHIFT_SLOT_MINUTES_,
      mail_account_code: config.mail_account_code,
      public: true,
      active: true
    });

    if (!String(record.brand_code || "").trim()) {
      record.brand_code = "MPG";
    }
    if (!String(record.category || "").trim()) {
      record.category = "GENERAL";
    }
    if (!Number(record.public_days || 0)) {
      record.public_days = 30;
    }
    if (config.permission_column) {
      record.permission_column = config.permission_column;
    }

    const row = headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
    });

    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  }

  writeService_(
    trainingRow,
    trainingExisting,
    {
      service_code: MPG_SHIFT_SERVICE_CODE_,
      service_name: String(trainingExisting.service_name || "").trim() ||
        "My Private Gym トレーニングサポート",
      category: "TRAINING_SUPPORT",
      form_type: "MEMBER",
      calendar_code: "TFG_MAIN",
      provider_role: "STAFF",
      booking_min_hours: 3,
      change_limit_hours: 3,
      cancel_limit_hours: 3,
      mail_account_code: "GMAIL01",
      permission_column: "can_training_support"
    }
  );

  writeService_(
    tourRow,
    tourExisting,
    {
      service_code: MPG_TOUR_SERVICE_CODE_,
      service_name: String(tourExisting.service_name || "").trim() ||
        "My Private Gym 見学",
      category: "VISIT",
      form_type: "VISITOR",
      calendar_code: "TFG_MAIN",
      provider_role: "STAFF",
      booking_min_hours: 1.5,
      change_limit_hours: 3,
      cancel_limit_hours: 3,
      mail_account_code: "GMAIL01",
      permission_column: "can_tour"
    }
  );

  ensureMpgServiceHours_();

  return {
    store_code: MPG_SHIFT_STORE_CODE_,
    service_codes: MPG_SHIFT_SERVICE_CODES_.slice(),
    duration_minutes: MPG_SHIFT_SLOT_MINUTES_,
    interval_minutes: MPG_SHIFT_SLOT_MINUTES_
  };
}

function ensureMpgServiceHours_() {
  const sheet = getSheet(APP_CONFIG.SHEETS.SERVICE_HOURS);
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    throw new Error("service_hoursシートにヘッダーがありません。");
  }

  const headers = values[0].map(function (value) {
    return String(value || "").trim();
  });
  const required = ["service_code", "day_of_week", "start_time", "end_time", "active"];
  required.forEach(function (header) {
    if (headers.indexOf(header) < 0) {
      throw new Error("service_hoursに必要な列がありません: " + header);
    }
  });

  const codeIndex = headers.indexOf("service_code");
  const dayIndex = headers.indexOf("day_of_week");
  const startIndex = headers.indexOf("start_time");
  const endIndex = headers.indexOf("end_time");
  const activeIndex = headers.indexOf("active");
  const wantedStart = mpgMinutesToTime_(MPG_SHIFT_DAY_START_MINUTES_);
  const wantedEnd = mpgMinutesToTime_(MPG_SHIFT_DAY_END_MINUTES_);

  MPG_SHIFT_SERVICE_CODES_.forEach(function (serviceCode) {
    let exactRow = 0;

    values.slice(1).forEach(function (row, index) {
      const rowCode = String(row[codeIndex] || "").trim().toUpperCase();
      if (rowCode !== serviceCode) return;

      const day = String(row[dayIndex] || "").trim().toUpperCase();
      const start = typeof formatServiceHourTime_ === "function"
        ? formatServiceHourTime_(row[startIndex])
        : String(row[startIndex] || "").trim();
      const end = typeof formatServiceHourTime_ === "function"
        ? formatServiceHourTime_(row[endIndex])
        : String(row[endIndex] || "").trim();
      const rowNumber = index + 2;

      if (day === "ALL" && start === wantedStart && end === wantedEnd) {
        exactRow = rowNumber;
        sheet.getRange(rowNumber, activeIndex + 1).setValue(true);
      } else {
        sheet.getRange(rowNumber, activeIndex + 1).setValue(false);
      }
    });

    if (!exactRow) {
      const record = {
        service_code: serviceCode,
        day_of_week: "ALL",
        start_time: wantedStart,
        end_time: wantedEnd,
        active: true
      };
      sheet.appendRow(headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
      }));
    }
  });
}


function normalizeMpgReservationMemberNo_(value) {
  return String(value || "").replace(/\D/g, "").slice(-6);
}

function getMpgReservationMemberMasterSheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = String(
    props.getProperty("MPG_MEMBER_MASTER_ID") ||
    MPG_RESERVATION_MEMBER_MASTER_ID_
  ).trim();
  const configuredSheet = String(
    props.getProperty("MPG_MEMBER_MASTER_SHEET_NAME") ||
    MPG_RESERVATION_MEMBER_MASTER_SHEET_
  ).trim();

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  return spreadsheet.getSheetByName(configuredSheet) || spreadsheet.getSheets()[0];
}

function validateMpgReservationMemberMaster_(values) {
  values = values || {};
  const memberNo = normalizeMpgReservationMemberNo_(values.memberNo);
  const customerEmail = String(values.customerEmail || "").trim().toLowerCase();

  if (!/^\d{6}$/.test(memberNo)) {
    return {
      ok: false,
      code: "INVALID_MEMBER_NO",
      message: "会員番号は6桁の数字で入力してください。",
      detail: { member_no: memberNo }
    };
  }

  const sheet = getMpgReservationMemberMasterSheet_();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return {
      ok: false,
      code: "MEMBER_NOT_FOUND",
      message: "会員番号が確認できません。",
      detail: { member_no: memberNo }
    };
  }

  const headers = data[0].map(function (value) {
    return String(value || "").trim();
  });
  const index = {};
  headers.forEach(function (header, i) {
    if (header) index[header] = i;
  });

  ["会員番号", "氏名（姓）", "氏名（名）", "メールアドレス", "契約ステータス"]
    .forEach(function (header) {
      if (index[header] === undefined) {
        throw new Error("MPG会員マスターに必要な列がありません: " + header);
      }
    });

  let found = null;
  data.slice(1).some(function (row) {
    if (
      normalizeMpgReservationMemberNo_(row[index["会員番号"]]) ===
      memberNo
    ) {
      found = row;
      return true;
    }
    return false;
  });

  if (!found) {
    return {
      ok: false,
      code: "MEMBER_NOT_FOUND",
      message: "会員番号が確認できません。",
      detail: { member_no: memberNo }
    };
  }

  const status = String(found[index["契約ステータス"]] || "").trim();
  if (status !== "契約中") {
    return {
      ok: false,
      code: "MEMBER_INACTIVE",
      message: "現在有効な会員番号ではありません。",
      detail: { member_no: memberNo, status: status }
    };
  }

  const masterEmail = String(found[index["メールアドレス"]] || "").trim().toLowerCase();
  if (!masterEmail || masterEmail !== customerEmail) {
    return {
      ok: false,
      code: "MEMBER_EMAIL_MISMATCH",
      message: "会員番号とメールアドレスが一致しません。",
      detail: { member_no: memberNo }
    };
  }

  const lastName = String(found[index["氏名（姓）"]] || "").trim();
  const firstName = String(found[index["氏名（名）"]] || "").trim();
  const name = (lastName + " " + firstName).trim();

  return {
    ok: true,
    code: "",
    message: "",
    detail: null,
    member: {
      memberNo: memberNo,
      name: name,
      email: String(found[index["メールアドレス"]] || "").trim(),
      status: status
    }
  };
}

function validateMpgTrainingMonthlyBookingLimit_(memberNo, targetDate, excludeReservationId) {
  const normalizedMemberNo = normalizeMpgReservationMemberNo_(memberNo);
  const month = String(targetDate || "").trim().slice(0, 7);
  const excludedId = String(excludeReservationId || "").trim();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return {
      ok: false,
      code: "INVALID_RESERVATION_DATE",
      message: "予約日を確認できません。",
      detail: { date: targetDate }
    };
  }

  const rows = getSheetData(APP_CONFIG.SHEETS.RESERVATIONS);
  const inactiveStatuses = ["CANCELLED", "CANCELED", "CANCEL"];
  let count = 0;

  rows.forEach(function (row) {
    const serviceCode = String(row.service_code || "").trim().toUpperCase();
    if (serviceCode !== MPG_SHIFT_SERVICE_CODE_) return;

    const reservationId = String(row.reservation_id || "").trim();
    if (excludedId && reservationId === excludedId) return;

    const rowMemberNo = normalizeMpgReservationMemberNo_(row.member_no);
    if (rowMemberNo !== normalizedMemberNo) return;

    const status = String(row.status || "").trim().toUpperCase();
    if (inactiveStatuses.indexOf(status) >= 0) return;

    const date = typeof normalizeReservationScheduleDate_ === "function"
      ? normalizeReservationScheduleDate_(row.reservation_date || row.date)
      : formatShiftDate_(row.reservation_date || row.date);

    if (String(date || "").slice(0, 7) === month) count += 1;
  });

  if (count >= MPG_TRAINING_MONTHLY_LIMIT_) {
    return {
      ok: false,
      code: "MPG_MONTHLY_BOOKING_LIMIT",
      message: "トレーニングサポートは1会員につき月4回までご予約いただけます。",
      detail: {
        member_no: normalizedMemberNo,
        month: month,
        current_count: count,
        limit: MPG_TRAINING_MONTHLY_LIMIT_
      }
    };
  }

  return {
    ok: true,
    code: "",
    message: "",
    detail: {
      member_no: normalizedMemberNo,
      month: month,
      current_count: count,
      remaining_count: MPG_TRAINING_MONTHLY_LIMIT_ - count
    }
  };
}

function mpgTimeToMinutes_(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function mpgMinutesToTime_(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return "";
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function mpgDateTime_(dateText, timeText) {
  const d = String(dateText || "").split("-").map(Number);
  const t = String(timeText || "").split(":").map(Number);
  return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
}

function mpgSlotGrid_() {
  const slots = [];
  for (
    let start = MPG_SHIFT_DAY_START_MINUTES_;
    start + MPG_SHIFT_SLOT_MINUTES_ <= MPG_SHIFT_DAY_END_MINUTES_;
    start += MPG_SHIFT_SLOT_MINUTES_
  ) {
    slots.push({
      start_time: mpgMinutesToTime_(start),
      end_time: mpgMinutesToTime_(start + MPG_SHIFT_SLOT_MINUTES_)
    });
  }
  return slots;
}

function mpgMonthRange_(month) {
  const text = String(month || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    throw new Error("対象月は yyyy-MM 形式で指定してください。");
  }
  const parts = text.split("-").map(Number);
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  return {
    month: text,
    first: text + "-01",
    last: text + "-" + String(lastDay).padStart(2, "0"),
    year: parts[0],
    monthNumber: parts[1],
    lastDay: lastDay
  };
}

function mpgIsActive_(value) {
  if (value === true) return true;
  const text = String(value == null ? "" : value).trim().toUpperCase();
  return ["TRUE", "1", "YES", "ON", "RESERVED", "CONFIRMED"].includes(text);
}

function mpgReservationDate_(row) {
  return typeof normalizeReservationScheduleDate_ === "function"
    ? normalizeReservationScheduleDate_(row && (row.reservation_date || row.date))
    : formatShiftDate_(row && (row.reservation_date || row.date));
}

function mpgReservationTime_(value) {
  return typeof normalizeReservationTime_ === "function"
    ? normalizeReservationTime_(value)
    : formatShiftTime_(value);
}

function mpgIsActiveReservationRow_(row) {
  const status = String(row && row.status || "").trim().toUpperCase();
  return status !== "CANCELLED" &&
    status !== "CANCELED" &&
    status !== "CANCEL";
}

/**
 * 川上の別拠点予約との移動時間競合を探す。
 * candidateと既存予約の間にbufferMinutes以上の間隔がない場合は競合。
 */
function mpgFindKawakamiReservationTravelConflict_(
  dateText,
  startTime,
  endTime,
  otherStoreCode,
  bufferMinutes,
  excludeReservationId,
  reservationRows
) {
  const date = String(dateText || "").trim();
  const candidateStart = mpgTimeToMinutes_(startTime);
  const candidateEnd = mpgTimeToMinutes_(endTime);
  const storeCode = String(otherStoreCode || "").trim().toUpperCase();
  const excludedId = String(excludeReservationId || "").trim();
  const buffer = Math.max(0, Number(bufferMinutes || 0));

  if (
    !date ||
    !Number.isFinite(candidateStart) ||
    !Number.isFinite(candidateEnd) ||
    !storeCode
  ) {
    return null;
  }

  const rows = Array.isArray(reservationRows)
    ? reservationRows
    : getSheetData(APP_CONFIG.SHEETS.RESERVATIONS);
  return rows.find(function (row) {
    if (!mpgIsActiveReservationRow_(row)) return false;
    if (
      String(row.staff_code || "").trim().toUpperCase() !==
      MPG_SHIFT_STAFF_CODE_
    ) return false;
    if (
      String(row.store_code || "").trim().toUpperCase() !==
      storeCode
    ) return false;
    if (
      excludedId &&
      String(row.reservation_id || "").trim() === excludedId
    ) return false;
    if (mpgReservationDate_(row) !== date) return false;

    const otherStart = mpgTimeToMinutes_(
      mpgReservationTime_(row.start_time)
    );
    const otherEnd = mpgTimeToMinutes_(
      mpgReservationTime_(row.end_time)
    );
    if (
      !Number.isFinite(otherStart) ||
      !Number.isFinite(otherEnd)
    ) return false;

    return candidateStart < otherEnd + buffer &&
      candidateEnd > otherStart - buffer;
  }) || null;
}

function mpgFindHeadOfficeTravelConflict_(
  dateText,
  startTime,
  endTime,
  excludeReservationId
) {
  return mpgFindKawakamiReservationTravelConflict_(
    dateText,
    startTime,
    endTime,
    MPG_SHIFT_HEAD_OFFICE_STORE_CODE_,
    MPG_SHIFT_HEAD_OFFICE_TRAVEL_MINUTES_,
    excludeReservationId
  );
}

function mpgFindMpgTravelConflictForHeadOffice_(
  dateText,
  startTime,
  endTime,
  excludeReservationId
) {
  return mpgFindKawakamiReservationTravelConflict_(
    dateText,
    startTime,
    endTime,
    MPG_SHIFT_STORE_CODE_,
    MPG_SHIFT_HEAD_OFFICE_TRAVEL_MINUTES_,
    excludeReservationId
  );
}

function filterMpgSlotsAgainstHeadOfficeReservations_(
  dateText,
  slots
) {
  const reservationRows =
    getSheetData(APP_CONFIG.SHEETS.RESERVATIONS);
  const cutoffAt =
    new Date(
      new Date().getTime() +
      MPG_SHIFT_UNRESERVED_CUTOFF_HOURS_ * 60 * 60 * 1000
    );

  return (Array.isArray(slots) ? slots : []).filter(function (slot) {
    const startTime = slot && slot.start_time;
    const endTime = slot && slot.end_time;
    const startAt = mpgDateTime_(dateText, startTime);

    // 48時間以内に入った未予約枠は、時間トリガーの実行待ちでも表示しない。
    if (
      startAt instanceof Date &&
      !isNaN(startAt.getTime()) &&
      startAt.getTime() <= cutoffAt.getTime()
    ) {
      return false;
    }

    return !mpgFindKawakamiReservationTravelConflict_(
      dateText,
      startTime,
      endTime,
      MPG_SHIFT_HEAD_OFFICE_STORE_CODE_,
      MPG_SHIFT_HEAD_OFFICE_TRAVEL_MINUTES_,
      "",
      reservationRows
    );
  });
}

function validateMpgHeadOfficeTravelForReservation_(
  dateText,
  startTime,
  endTime,
  excludeReservationId
) {
  const conflict = mpgFindHeadOfficeTravelConflict_(
    dateText,
    startTime,
    endTime,
    excludeReservationId
  );

  if (!conflict) {
    return { ok: true, code: "", message: "", detail: null };
  }

  return {
    ok: false,
    code: "MPG_HEAD_OFFICE_TRAVEL_CONFLICT",
    message: "本社予定との移動時間（2時間30分）を確保できないため、この時間は予約できません。",
    detail: {
      travel_minutes: MPG_SHIFT_HEAD_OFFICE_TRAVEL_MINUTES_,
      conflicting_reservation_id:
        String(conflict.reservation_id || "").trim(),
      conflicting_store_code:
        MPG_SHIFT_HEAD_OFFICE_STORE_CODE_
    }
  };
}

function mpgReservationKeySet_() {
  const rows = getSheetData(APP_CONFIG.SHEETS.RESERVATIONS);
  const keys = new Set();

  rows.forEach(function (row) {
    const serviceCode = String(row.service_code || "").trim().toUpperCase();
    if (MPG_SHIFT_SERVICE_CODES_.indexOf(serviceCode) < 0) return;

    const status = String(row.status || "").trim().toUpperCase();
    if (status === "CANCELLED" || status === "CANCELED") return;

    const staffCode = String(row.staff_code || "").trim().toUpperCase();
    if (staffCode && staffCode !== MPG_SHIFT_STAFF_CODE_) return;

    const date = typeof normalizeReservationScheduleDate_ === "function"
      ? normalizeReservationScheduleDate_(row.reservation_date || row.date)
      : formatShiftDate_(row.reservation_date || row.date);
    const start = typeof normalizeReservationTime_ === "function"
      ? normalizeReservationTime_(row.start_time)
      : formatShiftTime_(row.start_time);

    if (date && start) keys.add(date + "|" + start);
  });

  return keys;
}

function mpgShiftRows_() {
  return getSheetData(APP_CONFIG.SHEETS.STAFF_SHIFTS);
}

function mpgNormalizeShiftRow_(row) {
  return {
    shift_id: String(row.shift_id || "").trim(),
    staff_code: String(row.staff_code || "").trim().toUpperCase(),
    store_code: String(row.store_code || "").trim().toUpperCase(),
    date: formatShiftDate_(row.date),
    start_time: formatShiftTime_(row.start_time),
    end_time: formatShiftTime_(row.end_time),
    active: normalizeShiftBoolean_(row.active)
  };
}

function mpgBlockedIntervalForShift_(shift) {
  const start = mpgTimeToMinutes_(shift.start_time);
  const end = mpgTimeToMinutes_(shift.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  // HEAD_OFFICEの勤務枠とMPG枠は同時に持てる。
  // 実際にどちらかへ予約が入った時点で、150分の移動バッファを
  // 予約可否判定に適用して反対側の空き枠を消す。
  if (shift.store_code === MPG_SHIFT_HEAD_OFFICE_STORE_CODE_) {
    return null;
  }

  if (shift.store_code === MPG_SHIFT_YACHIYO_STORE_CODE_) {
    return {
      start: start - MPG_SHIFT_TRAVEL_MINUTES_,
      end: end + MPG_SHIFT_TRAVEL_MINUTES_,
      reason: "YACHIYO_TRAVEL"
    };
  }

  return {
    start: start,
    end: end,
    reason: shift.store_code === MPG_SHIFT_SOGA_STORE_CODE_ ? "SOGA" : "OTHER"
  };
}

function mpgSlotConflict_(slot, otherShift) {
  const slotStart = mpgTimeToMinutes_(slot.start_time);
  const slotEnd = mpgTimeToMinutes_(slot.end_time);
  const block = mpgBlockedIntervalForShift_(otherShift);
  if (!block) return false;
  return slotStart < block.end && slotEnd > block.start;
}

function mpgExternalShiftsByDate_(month) {
  const mpgStoreCode = getMpgStoreCode_();
  const map = new Map();

  mpgShiftRows_()
    .map(mpgNormalizeShiftRow_)
    .filter(function (row) {
      return row.active &&
        row.staff_code === MPG_SHIFT_STAFF_CODE_ &&
        row.store_code !== mpgStoreCode &&
        row.date.slice(0, 7) === month;
    })
    .forEach(function (row) {
      if (!map.has(row.date)) map.set(row.date, []);
      map.get(row.date).push(row);
    });

  return map;
}

function mpgWeeklyWindowForDate_(dateText) {
  const parts = String(dateText || "").split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  return MPG_SHIFT_WEEKLY_WINDOWS_[date.getDay()] || null;
}

function mpgExpectedSlotsForDate_(dateText) {
  const window = mpgWeeklyWindowForDate_(dateText);
  if (!window) return [];

  const windowStart = mpgTimeToMinutes_(window[0]);
  const windowEnd = mpgTimeToMinutes_(window[1]);

  return mpgSlotGrid_().filter(function (slot) {
    const start = mpgTimeToMinutes_(slot.start_time);
    const end = mpgTimeToMinutes_(slot.end_time);
    return start >= windowStart && end <= windowEnd;
  });
}

function mpgGetShiftSheetTable_() {
  const sheet = getSheet(APP_CONFIG.SHEETS.STAFF_SHIFTS);
  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error("staff_shiftsシートにヘッダーがありません。");
  const headers = values[0].map(function (value) { return String(value).trim(); });
  return { sheet: sheet, values: values, headers: headers };
}

function mpgSetShiftRowsInactive_(rowNumbers, table) {
  if (!rowNumbers.length) return 0;
  table = table || mpgGetShiftSheetTable_();

  const activeIndex = table.headers.indexOf("active");
  const updatedIndex = table.headers.indexOf("updated_at");
  if (activeIndex < 0) throw new Error("staff_shiftsにactive列がありません。");

  const now = new Date();
  rowNumbers.forEach(function (rowNumber) {
    table.sheet.getRange(rowNumber, activeIndex + 1).setValue(false);
    if (updatedIndex >= 0) {
      table.sheet.getRange(rowNumber, updatedIndex + 1).setValue(now);
    }
  });
  return rowNumbers.length;
}

function mpgReservedConflictsForIncomingShift_(staffCode, storeCode, date, startTime, endTime) {
  const normalizedStaff = String(staffCode || "").trim().toUpperCase();
  const incomingStore = String(storeCode || "").trim().toUpperCase();
  const mpgStoreCode = getMpgStoreCode_();

  if (normalizedStaff !== MPG_SHIFT_STAFF_CODE_ || !incomingStore || incomingStore === mpgStoreCode) {
    return [];
  }

  const incoming = {
    store_code: incomingStore,
    start_time: formatShiftTime_(startTime),
    end_time: formatShiftTime_(endTime)
  };
  const reservations = mpgReservationKeySet_();

  return mpgShiftRows_()
    .map(mpgNormalizeShiftRow_)
    .filter(function (row) {
      return row.active &&
        row.staff_code === MPG_SHIFT_STAFF_CODE_ &&
        row.store_code === mpgStoreCode &&
        row.date === date &&
        mpgSlotConflict_(row, incoming) &&
        reservations.has(row.date + "|" + row.start_time);
    });
}

function mpgAssertIncomingShiftCanReplaceMpg_(staffCode, storeCode, date, startTime, endTime) {
  const conflicts = mpgReservedConflictsForIncomingShift_(
    staffCode, storeCode, date, startTime, endTime
  );
  if (!conflicts.length) return;

  const first = conflicts[0];
  throw new Error(
    "MPG_RESERVED_CONFLICT::" +
    first.date + "::" + first.start_time + "::" + String(storeCode || "").trim().toUpperCase()
  );
}

function mpgCanIgnoreExistingMpgOverlap_(staffCode, incomingStoreCode, existingStoreCode) {
  const mpgStoreCode = getMpgStoreCode_();
  return String(staffCode || "").trim().toUpperCase() === MPG_SHIFT_STAFF_CODE_ &&
    String(incomingStoreCode || "").trim().toUpperCase() !== mpgStoreCode &&
    String(existingStoreCode || "").trim().toUpperCase() === mpgStoreCode;
}

function mpgDeactivateConflictsForIncomingShift_(staffCode, storeCode, date, startTime, endTime) {
  const normalizedStaff = String(staffCode || "").trim().toUpperCase();
  const incomingStore = String(storeCode || "").trim().toUpperCase();
  const mpgStoreCode = getMpgStoreCode_();

  if (normalizedStaff !== MPG_SHIFT_STAFF_CODE_ || !incomingStore || incomingStore === mpgStoreCode) {
    return { removed_count: 0 };
  }

  mpgAssertIncomingShiftCanReplaceMpg_(staffCode, storeCode, date, startTime, endTime);

  const incoming = {
    store_code: incomingStore,
    start_time: formatShiftTime_(startTime),
    end_time: formatShiftTime_(endTime)
  };
  const table = mpgGetShiftSheetTable_();
  const headers = table.headers;
  const rowNumbers = [];

  table.values.slice(1).forEach(function (valuesRow, index) {
    const row = {};
    headers.forEach(function (header, column) { row[header] = valuesRow[column]; });
    const normalized = mpgNormalizeShiftRow_(row);
    if (
      normalized.active &&
      normalized.staff_code === MPG_SHIFT_STAFF_CODE_ &&
      normalized.store_code === mpgStoreCode &&
      normalized.date === date &&
      mpgSlotConflict_(normalized, incoming)
    ) {
      rowNumbers.push(index + 2);
    }
  });

  return { removed_count: mpgSetShiftRowsInactive_(rowNumbers, table) };
}

function reconcileKawakamiMpgShifts_(options) {
  options = options || {};
  const month = mpgMonthRange_(options.month).month;
  const mpgStoreCode = getMpgStoreCode_();
  const reservations = mpgReservationKeySet_();
  const externalByDate = mpgExternalShiftsByDate_(month);
  const table = mpgGetShiftSheetTable_();
  const rowNumbers = [];
  const reservedConflicts = [];

  table.values.slice(1).forEach(function (valuesRow, index) {
    const row = {};
    table.headers.forEach(function (header, column) { row[header] = valuesRow[column]; });
    const normalized = mpgNormalizeShiftRow_(row);

    if (
      !normalized.active ||
      normalized.staff_code !== MPG_SHIFT_STAFF_CODE_ ||
      normalized.store_code !== mpgStoreCode ||
      normalized.date.slice(0, 7) !== month
    ) {
      return;
    }

    const blockers = externalByDate.get(normalized.date) || [];
    if (!blockers.some(function (other) { return mpgSlotConflict_(normalized, other); })) {
      return;
    }

    if (reservations.has(normalized.date + "|" + normalized.start_time)) {
      reservedConflicts.push({
        date: normalized.date,
        start_time: normalized.start_time,
        end_time: normalized.end_time
      });
      return;
    }

    rowNumbers.push(index + 2);
  });

  return {
    removed_count: mpgSetShiftRowsInactive_(rowNumbers, table),
    reserved_conflicts: reservedConflicts
  };
}

function generateKawakamiMpgShiftsInternal_(month) {
  const range = mpgMonthRange_(month);
  const mpgStoreCode = getMpgStoreCode_();
  const reservations = mpgReservationKeySet_();
  const externalByDate = mpgExternalShiftsByDate_(range.month);
  const table = mpgGetShiftSheetTable_();
  const now = new Date();

  const staffRows = getSheetData(APP_CONFIG.SHEETS.STAFF);
  const kawakami = staffRows.find(function (row) {
    return String(row.staff_code || "").trim().toUpperCase() === MPG_SHIFT_STAFF_CODE_ &&
      normalizeShiftBoolean_(row.active);
  });
  if (!kawakami) throw new Error("KAWAKAMI の有効なスタッフ登録がありません。");

  const activeExistingKeys = new Set();
  const deactivateRows = [];

  table.values.slice(1).forEach(function (valuesRow, index) {
    const row = {};
    table.headers.forEach(function (header, column) { row[header] = valuesRow[column]; });
    const normalized = mpgNormalizeShiftRow_(row);

    if (
      !normalized.active ||
      normalized.staff_code !== MPG_SHIFT_STAFF_CODE_ ||
      normalized.store_code !== mpgStoreCode ||
      normalized.date.slice(0, 7) !== range.month
    ) {
      return;
    }

    const key = normalized.date + "|" + normalized.start_time;
    if (reservations.has(key)) {
      activeExistingKeys.add(key);
    } else {
      deactivateRows.push(index + 2);
    }
  });

  const disabledCount = mpgSetShiftRowsInactive_(deactivateRows, table);
  const insertRecords = [];
  const blocked = [];

  for (let day = 1; day <= range.lastDay; day += 1) {
    const date = range.month + "-" + String(day).padStart(2, "0");
    const blockers = externalByDate.get(date) || [];

    mpgExpectedSlotsForDate_(date).forEach(function (slot) {
      const key = date + "|" + slot.start_time;
      if (activeExistingKeys.has(key)) return;

      const slotStartAt = mpgDateTime_(date, slot.start_time);
      if (slotStartAt.getTime() <= now.getTime()) return;

      const conflict = blockers.find(function (other) {
        return mpgSlotConflict_(slot, other);
      });

      if (conflict) {
        blocked.push({
          date: date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          by_store: conflict.store_code
        });
        return;
      }

      insertRecords.push({
        shift_id: createShiftId_(MPG_SHIFT_STAFF_CODE_, date),
        staff_code: MPG_SHIFT_STAFF_CODE_,
        store_code: mpgStoreCode,
        date: date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        active: true,
        created_at: now,
        updated_at: now
      });
    });
  }

  const insertRows = insertRecords.map(function (record) {
    return table.headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
    });
  });

  if (insertRows.length) {
    table.sheet.getRange(
      table.sheet.getLastRow() + 1,
      1,
      insertRows.length,
      table.headers.length
    ).setValues(insertRows);
  }

  const reconciled = reconcileKawakamiMpgShifts_({ month: range.month });

  return {
    month: range.month,
    store_code: mpgStoreCode,
    staff_code: MPG_SHIFT_STAFF_CODE_,
    disabled_count: disabledCount,
    inserted_count: insertRows.length,
    blocked_count: blocked.length,
    blocked: blocked,
    reserved_conflicts: reconciled.reserved_conflicts || []
  };
}

function ensureMpgShiftCleanupTrigger_() {
  const handler = "cleanupUnbookedMpgShifts";
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === handler;
  });

  if (!exists) {
    ScriptApp.newTrigger(handler)
      .timeBased()
      .everyHours(1)
      .create();
  }

  return !exists;
}

function setupMpgShiftCleanupTrigger() {
  const created = ensureMpgShiftCleanupTrigger_();
  return {
    ok: true,
    created: created,
    handler: "cleanupUnbookedMpgShifts"
  };
}

function generateKawakamiMpgShifts(body) {
  body = body || {};
  const serviceConfig = ensureMpgServiceConfiguration_();
  const month = String(body.month || Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, "yyyy-MM")).trim();
  const result = generateKawakamiMpgShiftsInternal_(month);
  result.service_configuration = serviceConfig;

  // Web app execution may not yet have script.scriptapp consent.
  // Shift generation must still complete; the one-time trigger can be
  // authorized separately from the Apps Script editor.
  try {
    result.cleanup_trigger_created = ensureMpgShiftCleanupTrigger_();
    result.cleanup_trigger_ready = true;
  } catch (triggerError) {
    result.cleanup_trigger_created = false;
    result.cleanup_trigger_ready = false;
    result.cleanup_trigger_error = String(
      triggerError && triggerError.message || triggerError || ""
    );
  }

  // Apply the 48-hour rule immediately. The availability/reservation path
  // also performs the same cleanup as a safety net until the hourly trigger
  // has been authorized.
  const cleanup = cleanupUnbookedMpgShifts();
  result.cleanup_removed_count = cleanup.removed_count || 0;
  result.cleanup_reserved_count = cleanup.reserved_count || 0;

  return successResponse(result);
}

function cleanupUnbookedMpgShifts() {
  const mpgStoreCode = getMpgStoreCode_();
  const reservations = mpgReservationKeySet_();
  const table = mpgGetShiftSheetTable_();
  const now = new Date();
  const cutoff = new Date(
    now.getTime() + MPG_SHIFT_UNRESERVED_CUTOFF_HOURS_ * 60 * 60 * 1000
  );
  const rowNumbers = [];
  let reservedCount = 0;

  table.values.slice(1).forEach(function (valuesRow, index) {
    const row = {};
    table.headers.forEach(function (header, column) { row[header] = valuesRow[column]; });
    const normalized = mpgNormalizeShiftRow_(row);

    if (
      !normalized.active ||
      normalized.staff_code !== MPG_SHIFT_STAFF_CODE_ ||
      normalized.store_code !== mpgStoreCode
    ) {
      return;
    }

    const startAt = mpgDateTime_(normalized.date, normalized.start_time);
    if (startAt.getTime() > cutoff.getTime()) return;

    if (reservations.has(normalized.date + "|" + normalized.start_time)) {
      reservedCount += 1;
      return;
    }

    rowNumbers.push(index + 2);
  });

  const removedCount = mpgSetShiftRowsInactive_(rowNumbers, table);

  return {
    removed_count: removedCount,
    reserved_count: reservedCount,
    cutoff_at: Utilities.formatDate(cutoff, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")
  };
}
