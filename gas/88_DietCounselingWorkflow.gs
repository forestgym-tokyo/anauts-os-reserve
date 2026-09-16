/**
 * ============================================================
 * A-nauts OS Reserve
 * Diet counseling: method-specific availability, answer URL,
 * response storage and historical-recipient delivery.
 * ============================================================
 */

const DIET_COUNSELING_CONFIG_ = Object.freeze({
  SERVICE_CODE: "COUNSEL",
  GYM_STORE_CODE: "YACHIYO",
  OFFICE_STORE_CODE: "HEAD_OFFICE",
  ANSWER_SPREADSHEET_ID: "1muAm2zWPhI7NU3AA1vrd2ygKUqDh9ix6KFDATk9mX90",
  ANSWER_SHEET_NAME: "回答データ",
  TOKEN_SHEET_NAME: "回答URL管理",
  FORM_URL: "https://forestgym-tokyo.github.io/anauts-os-reserve/diet-counseling/",
  REPLY_TO: "info@theforestgym.com",
  ADMIN_NOTIFICATION_EMAIL: "info@theforestgym.com",
  TOKEN_VALID_DAYS: 30,
  ADMIN_VIEW_VALID_DAYS: 90,
  ONLINE_ONLY_LOCATION_CODE: "ONLINE_ONLY",
  ONLINE_ONLY_START_TIME: "19:00",
  ONLINE_ONLY_LAST_START_TIME: "22:00",
  ONLINE_ONLY_END_TIME: "23:00",
  ONLINE_ONLY_INTERVAL_MINUTES: 30,
  ONLINE_ONLY_TRAVEL_MINUTES: 150,
  TIMEZONE: "Asia/Tokyo",
  FORM_VERSION: "1.3",
  BULK_SEND_LIMIT: 50
});

const DIET_COUNSELING_TOKEN_HEADERS_ = [
  "URL発行ID", "予約ID", "サービスコード", "カウンセリング日", "開始時間",
  "会員区分", "会員番号", "氏名", "メールアドレス", "担当者", "実施方法",
  "担当者所在場所", "トークンハッシュ", "回答URL", "有効期限", "送信状態",
  "送信日時", "送信回数", "回答状態", "回答ID", "回答日時", "エラー内容",
  "最終更新日時"
];

const DIET_COUNSELING_ANSWER_HEADERS_ = [
  "回答ID", "送信日時", "カウンセリング日", "予約ID", "会員区分", "会員番号",
  "氏名", "メールアドレス", "担当者", "フォームバージョン", "年齢", "性別",
  "身長_cm", "体重_kg", "BMI", "基礎代謝_kcal", "気になる部位",
  "その他の気になる部位", "目標体重_kg", "カウンセリング後に目標決定",
  "目標体重差_kg", "減量率", "目標BMI", "目標基礎代謝_kcal", "就業有無",
  "仕事スタイル", "その他の仕事", "仕事日起床時間", "翌日仕事_就寝時間",
  "仕事日前睡眠時間", "休日起床時間", "翌日休み_就寝時間", "休日前睡眠時間",
  "食事回数", "朝食時間", "朝食メニュー", "昼食時間", "昼食メニュー",
  "夕食時間", "夕食メニュー", "間食時間", "間食メニュー", "好き嫌い有無",
  "苦手な食材", "アレルギー有無", "アレルギー詳細", "飲酒有無", "飲酒頻度",
  "運動歴有無", "運動歴詳細", "現在の運動有無", "現在の運動詳細",
  "既往歴有無", "既往歴詳細", "現在の体調", "体調詳細", "ダイエット経験有無",
  "ダイエット期間・方法", "PDF処理状態", "PDFファイルID", "PDF_URL",
  "PDF作成日時", "エラー内容", "最終更新日時", "ダイエット経験時期",
  "ダイエット方法", "ダイエット成果", "管理閲覧トークンハッシュ",
  "管理閲覧URL", "管理閲覧有効期限", "管理通知先", "管理通知状態",
  "管理通知日時", "管理通知エラー"
];

function isDietCounselingRequest_(params) {
  return normalizeDietCounselingCode_(params && params.service_code) ===
    DIET_COUNSELING_CONFIG_.SERVICE_CODE;
}

function normalizeDietCounselingMethod_(value) {
  const method = normalizeDietCounselingCode_(value);
  if (!method || method === "ONLINE" || method === "オンライン") return "ONLINE";
  if (["IN_PERSON", "INPERSON", "FACE_TO_FACE", "対面"].indexOf(method) >= 0) {
    return "IN_PERSON";
  }
  const error = new Error("実施方法はONLINEまたは対面を選択してください。");
  error.code = "INVALID_CONSULTATION_METHOD";
  throw error;
}

function normalizeDietCounselingSubmissionKey_(value) {
  const key = normalizeDietCounselingText_(value).toUpperCase();
  return /^DCR-[A-Z0-9]{16,72}$/.test(key) ? key : "";
}

function getDietCounselingSubmissionMarker_(submissionKey) {
  const key = normalizeDietCounselingSubmissionKey_(submissionKey);
  return key ? "【申込照合ID】" + key : "";
}

function findDietCounselingReservationBySubmissionKey_(submissionKey) {
  const marker = getDietCounselingSubmissionMarker_(submissionKey);
  if (!marker) return null;
  return readDietCounselingReservationRows_().find(function (reservation) {
    const noteLines = normalizeDietCounselingText_(reservation && reservation.note)
      .split(/\r?\n/);
    return isDietCounselingActiveReservation_(reservation) &&
      normalizeDietCounselingCode_(reservation && reservation.service_code) ===
        DIET_COUNSELING_CONFIG_.SERVICE_CODE &&
      noteLines.indexOf(marker) >= 0;
  }) || null;
}

function buildDietCounselingReservationStatusData_(reservation) {
  return {
    found: true,
    reservation_id: normalizeDietCounselingText_(reservation && reservation.reservation_id),
    date: normalizeDietCounselingDate_(
      reservation && (reservation.reservation_date || reservation.date)
    ),
    start_time: normalizeDietCounselingTime_(reservation && reservation.start_time),
    end_time: normalizeDietCounselingTime_(reservation && reservation.end_time),
    consultation_method: normalizeDietCounselingMethodForDisplay_(
      reservation && (
        reservation.consultation_method ||
        extractDietCounselingMethodFromNote_(reservation.note)
      )
    )
  };
}

function getDietCounselingReservationStatus_(params) {
  params = params || {};
  const submissionKey = normalizeDietCounselingSubmissionKey_(params.submission_key);
  if (!submissionKey) {
    return errorResponse(
      "申込照合IDを確認できませんでした。",
      "INVALID_SUBMISSION_KEY"
    );
  }
  const reservation = findDietCounselingReservationBySubmissionKey_(submissionKey);
  return successResponse(
    reservation ? buildDietCounselingReservationStatusData_(reservation) : { found: false }
  );
}

function getDietCounselingAvailableSlots_(params) {
  params = params || {};
  return runDietCounselingSheetCache_(function () {
    const method = normalizeDietCounselingMethod_(params.consultation_method);
    const baseResponse = getAvailableSlots(params);
    const payload = parseDietCounselingResponse_(baseResponse);
    if (!payload || payload.ok !== true) return baseResponse;

    const snapshot = buildDietCounselingSnapshot_();
    const service = findDietCounselingService_(snapshot.services, params.service_code);
    if (!service) {
      return errorResponse("サービス情報を確認できませんでした。", "SERVICE_NOT_FOUND");
    }

    return successResponse(filterDietCounselingSlotData_(
      payload.data || {}, params, snapshot, service, method
    ));
  });
}

function getDietCounselingAvailableSlotsRange_(params) {
  params = params || {};
  return runDietCounselingSheetCache_(function () {
    const method = normalizeDietCounselingMethod_(params.consultation_method);
    const baseResponse = getAvailableSlotsRange(params);
    const payload = parseDietCounselingResponse_(baseResponse);
    if (!payload || payload.ok !== true) return baseResponse;

    const snapshot = buildDietCounselingSnapshot_();
    const service = findDietCounselingService_(snapshot.services, params.service_code);
    if (!service) {
      return errorResponse("サービス情報を確認できませんでした。", "SERVICE_NOT_FOUND");
    }

    const data = payload.data || {};
    const results = Array.isArray(data.results) ? data.results : [];
    return successResponse(Object.assign({}, data, {
      consultation_method: method,
      results: results.map(function (result) {
        if (!result || result.ok !== true) return result;
        return Object.assign({}, result, {
          data: filterDietCounselingSlotData_(
            result.data || {}, params, snapshot, service, method
          )
        });
      })
    }));
  });
}

function filterDietCounselingSlotData_(data, params, snapshot, service, method) {
  const slots = mergeDietCounselingOnlineOnlySlots_(
    Array.isArray(data && data.slots) ? data.slots : [],
    data,
    params,
    service,
    method
  );
  const requestedStaffCode = normalizeDietCounselingCode_(params && params.staff_code);
  const filtered = [];

  slots.forEach(function (slot) {
    const date = normalizeDietCounselingDate_(
      slot.date || data.date || params.date || params.start_date
    );
    const start = normalizeDietCounselingTime_(slot.start_time);
    const end = normalizeDietCounselingTime_(
      slot.end_time || addDietCounselingMinutes_(start, Number(service.duration || 0))
    );
    if (!date || !start || !end) return;

    const assignments = getDietCounselingAssignments_(
      snapshot, service, date, start, end, method, requestedStaffCode, ""
    );
    if (!assignments.length) return;
    const gymStoreCode = normalizeDietCounselingCode_(service && service.store_code) ||
      DIET_COUNSELING_CONFIG_.GYM_STORE_CODE;
    const onlineOnly = method === "ONLINE" && assignments.every(function (item) {
      return item.location_code !== gymStoreCode;
    });

    filtered.push(Object.assign({}, slot, {
      consultation_method: method,
      online_only: onlineOnly,
      available_staff_count: assignments.length,
      available_locations: uniqueDietCounselingValues_(assignments.map(function (item) {
        return item.location_code;
      }))
    }));
  });

  return Object.assign({}, data || {}, {
    consultation_method: method,
    slots: filtered
  });
}

function mergeDietCounselingOnlineOnlySlots_(slots, data, params, service, method) {
  const merged = (slots || []).slice();
  if (method !== "ONLINE") return merged;

  const date = normalizeDietCounselingDate_(
    (data && data.date) || (params && (params.date || params.start_date))
  );
  if (!date || !isDietCounselingOnlineOnlyWeekday_(date)) return merged;

  const seen = {};
  merged.forEach(function (slot) {
    const slotDate = normalizeDietCounselingDate_(slot && (slot.date || date));
    const slotStart = normalizeDietCounselingTime_(slot && slot.start_time);
    if (slotDate && slotStart) seen[slotDate + " " + slotStart] = true;
  });

  const duration = Math.max(1, Number(service && service.duration) || 60);
  const interval = Math.max(1, Number(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_INTERVAL_MINUTES) || 30);
  const firstStart = dietCounselingMinutes_(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_START_TIME);
  const lastStart = dietCounselingMinutes_(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_LAST_START_TIME);
  const dayEnd = dietCounselingMinutes_(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_END_TIME);

  for (let cursor = firstStart; cursor <= lastStart; cursor += interval) {
    const endMinutes = cursor + duration;
    if (endMinutes > dayEnd) continue;
    const start = dietCounselingTimeFromMinutes_(cursor);
    const end = dietCounselingTimeFromMinutes_(endMinutes);
    const key = date + " " + start;
    if (seen[key]) continue;
    seen[key] = true;
    merged.push({
      date: date,
      start_time: start,
      end_time: end,
      start_at: date + " " + start,
      end_at: date + " " + end
    });
  }

  return merged.sort(function (a, b) {
    return normalizeDietCounselingTime_(a && a.start_time)
      .localeCompare(normalizeDietCounselingTime_(b && b.start_time));
  });
}

function createDietCounselingReservation_(params) {
  params = params || {};
  return runDietCounselingSheetCache_(function () {
    const method = normalizeDietCounselingMethod_(params.consultation_method);
    const submissionKey = normalizeDietCounselingSubmissionKey_(params.submission_key);
    if (submissionKey) {
      const existingReservation = findDietCounselingReservationBySubmissionKey_(submissionKey);
      if (existingReservation) {
        return successResponse(buildDietCounselingReservationStatusData_(existingReservation));
      }
    }
    const snapshot = buildDietCounselingSnapshot_();
    const service = findDietCounselingService_(snapshot.services, params.service_code);
    if (!service) {
      return errorResponse("サービス情報を確認できませんでした。", "SERVICE_NOT_FOUND");
    }

    const date = normalizeDietCounselingDate_(params.date || params.reservation_date);
    const start = normalizeDietCounselingTime_(params.start_time);
    const end = normalizeDietCounselingTime_(
      params.end_time || addDietCounselingMinutes_(start, Number(service.duration || 0))
    );
    const assignments = getDietCounselingAssignments_(
      snapshot, service, date, start, end, method,
      normalizeDietCounselingCode_(params.staff_code),
      normalizeDietCounselingText_(params.reservation_id)
    );

    if (!assignments.length) {
      return errorResponse(
        method === "ONLINE"
          ? "この時間はONLINE対応できる担当者が不在です。空き状況を更新してください。"
          : "この時間は対面対応できる担当者が不在です。空き状況を更新してください。",
        "SLOT_NOT_AVAILABLE",
        { service_code: DIET_COUNSELING_CONFIG_.SERVICE_CODE, consultation_method: method }
      );
    }

    const assignment = chooseDietCounselingAssignment_(
      assignments, snapshot.reservations, date
    );
    const safeParams = buildDietCounselingReservationParams_(
      params, service, assignment, method, submissionKey
    );

    const baseResponse = createReservationWithTrainerPolicy_(safeParams);
    const payload = parseDietCounselingResponse_(baseResponse);
    if (!payload || payload.ok !== true) return baseResponse;

    const reservation = Object.assign({}, safeParams, payload.data || {}, {
      service_code: DIET_COUNSELING_CONFIG_.SERVICE_CODE,
      consultation_method: method,
      staff_location: assignment.location_code,
      staff_name: normalizeDietCounselingText_(
        (payload.data && payload.data.staff_name) || assignment.staff_name
      )
    });

    try {
      persistDietCounselingReservationMetadata_(reservation);
    } catch (metadataError) {
      console.error("persistDietCounselingReservationMetadata_", metadataError);
    }

    let mailSent = false;
    let mailWarning = "";
    try {
      const sent = sendDietCounselingAnswerUrlForReservation_(reservation, {
        source: "RESERVATION_CREATED"
      });
      mailSent = !!(sent && sent.sent === true);
    } catch (mailError) {
      mailWarning = mailError && mailError.message
        ? mailError.message
        : "回答URLメールを送信できませんでした。";
      console.error("sendDietCounselingAnswerUrlForReservation_", mailError);
    }

    if (typeof clearStoreAwareSnapshotCache_ === "function") {
      clearStoreAwareSnapshotCache_();
    }

    return successResponse(Object.assign({}, payload.data || {}, {
      consultation_method: method,
      staff_location: assignment.location_code,
      counseling_form_mail_sent: mailSent,
      counseling_form_mail_warning: mailWarning
    }));
  });
}

function buildDietCounselingReservationParams_(
  params, service, assignment, method, submissionKey
) {
  const serviceStoreCode = normalizeDietCounselingCode_(service && service.store_code) ||
    DIET_COUNSELING_CONFIG_.GYM_STORE_CODE;
  const assignmentStoreCode = normalizeDietCounselingCode_(
    assignment && assignment.location_code
  );
  const reservationStoreCode = assignmentStoreCode &&
    assignmentStoreCode !== DIET_COUNSELING_CONFIG_.ONLINE_ONLY_LOCATION_CODE
    ? assignmentStoreCode : serviceStoreCode;
  const locationLabel = getDietCounselingLocationLabel_(assignmentStoreCode);
  const methodLabel = method === "ONLINE" ? "ONLINE" : "対面";
  const notePrefix = [
    "【実施方法】" + methodLabel,
    "【担当者所在場所】" + locationLabel,
    getDietCounselingSubmissionMarker_(submissionKey)
  ].filter(function (value) { return !!value; }).join("\n");

  return Object.assign({}, params || {}, {
    staff_code: normalizeDietCounselingCode_(assignment && assignment.staff_code),
    store_code: reservationStoreCode,
    consultation_method: method,
    staff_location: assignmentStoreCode,
    note: [notePrefix, normalizeDietCounselingText_(params && params.note)]
      .filter(Boolean).join("\n")
  });
}

function getDietCounselingAssignments_(
  snapshot, service, date, start, end, method, requestedStaffCode, excludedReservationId
) {
  const gymStoreCode = normalizeDietCounselingCode_(service && service.store_code) ||
    DIET_COUNSELING_CONFIG_.GYM_STORE_CODE;
  const officeStoreCode = getDietCounselingOfficeStoreCode_();
  const allowedLocations = method === "ONLINE"
    ? [gymStoreCode, officeStoreCode]
    : [gymStoreCode];
  const assignments = [];

  (snapshot.staff || []).forEach(function (staff) {
    const staffCode = normalizeDietCounselingCode_(staff && staff.staff_code);
    if (!staffCode) return;
    if (requestedStaffCode && staffCode !== requestedStaffCode) return;
    if (!isDietCounselingActive_(staff && staff.active)) return;
    if (!isDietCounselingRoleAllowed_(staff, service)) return;
    if (!isDietCounselingStaffAllowed_(staff)) return;

    const reserved = (snapshot.reservations || []).some(function (reservation) {
      if (!isDietCounselingActiveReservation_(reservation)) return false;
      if (
        excludedReservationId &&
        normalizeDietCounselingText_(reservation && reservation.reservation_id) === excludedReservationId
      ) return false;
      return normalizeDietCounselingCode_(reservation && reservation.staff_code) === staffCode &&
        normalizeDietCounselingDate_(reservation && (reservation.reservation_date || reservation.date)) === date &&
        dietCounselingOverlaps_(
          reservation && reservation.start_time,
          reservation && reservation.end_time,
          start,
          end
        );
    });
    if (reserved) return;

    const locations = uniqueDietCounselingValues_((snapshot.shifts || [])
      .filter(function (shift) {
        const location = normalizeDietCounselingCode_(shift && shift.store_code);
        const baseEligible = isDietCounselingActive_(shift && shift.active) &&
          normalizeDietCounselingCode_(shift && shift.staff_code) === staffCode &&
          normalizeDietCounselingDate_(shift && shift.date) === date &&
          allowedLocations.indexOf(location) >= 0 &&
          dietCounselingCovers_(
            shift && shift.start_time,
            shift && shift.end_time,
            start,
            end
          );
        if (!baseEligible) return false;
        if (location !== officeStoreCode) return true;
        return isDietCounselingHeadOfficeAssignmentAllowed_(
          snapshot, staffCode, date, start, end
        );
      })
      .map(function (shift) { return normalizeDietCounselingCode_(shift.store_code); }));

    locations.forEach(function (locationCode) {
      assignments.push({
        staff_code: staffCode,
        staff_name: normalizeDietCounselingText_(staff.staff_name || staff.display_name),
        location_code: locationCode
      });
    });
  });

  return assignments;
}

function isDietCounselingHeadOfficeAssignmentAllowed_(
  snapshot, staffCode, date, start, end
) {
  if (!isDietCounselingOnlineOnlyWeekday_(date)) return false;

  const startMinutes = dietCounselingMinutes_(start);
  const endMinutes = dietCounselingMinutes_(end);
  const firstStart = dietCounselingMinutes_(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_START_TIME);
  const lastStart = dietCounselingMinutes_(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_LAST_START_TIME);
  const dayEnd = dietCounselingMinutes_(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_END_TIME);
  if (
    ![startMinutes, endMinutes, firstStart, lastStart, dayEnd].every(isFinite) ||
    startMinutes < firstStart ||
    startMinutes > lastStart ||
    endMinutes > dayEnd
  ) return false;

  const officeStoreCode = getDietCounselingOfficeStoreCode_();
  const shiftEnds = (snapshot.shifts || []).filter(function (shift) {
    return isDietCounselingActive_(shift && shift.active) &&
      normalizeDietCounselingCode_(shift && shift.staff_code) === staffCode &&
      normalizeDietCounselingDate_(shift && shift.date) === date &&
      normalizeDietCounselingCode_(shift && shift.store_code) !== officeStoreCode;
  }).map(function (shift) {
    return dietCounselingMinutes_(shift && shift.end_time);
  }).filter(isFinite);

  if (!shiftEnds.length) return true;
  const latestShiftEnd = Math.max.apply(null, shiftEnds);
  return startMinutes >= latestShiftEnd +
    Number(DIET_COUNSELING_CONFIG_.ONLINE_ONLY_TRAVEL_MINUTES || 150);
}

function isDietCounselingOnlineOnlyWeekday_(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeDietCounselingDate_(dateText));
  if (!match) return false;
  const weekday = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3])
  )).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function chooseDietCounselingAssignment_(assignments, reservations, date) {
  return assignments.slice().sort(function (a, b) {
    const aCount = countDietCounselingReservations_(reservations, a.staff_code, date);
    const bCount = countDietCounselingReservations_(reservations, b.staff_code, date);
    if (aCount !== bCount) return aCount - bCount;
    const gym = DIET_COUNSELING_CONFIG_.GYM_STORE_CODE;
    if (a.location_code === gym && b.location_code !== gym) return -1;
    if (b.location_code === gym && a.location_code !== gym) return 1;
    return a.staff_code.localeCompare(b.staff_code);
  })[0];
}

function buildDietCounselingSnapshot_() {
  return {
    services: readDietCounselingRows_("services"),
    staff: readDietCounselingRows_("staff"),
    shifts: readDietCounselingRows_("staff_shifts"),
    reservations: readDietCounselingRows_("reservations")
  };
}

function readDietCounselingRows_(sheetName) {
  if (typeof readStoreAwareSheet_ === "function") {
    return readStoreAwareSheet_(sheetName);
  }
  if (typeof getSheetData === "function") return getSheetData(sheetName) || [];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return dietCounselingRowsFromValues_(sheet.getDataRange().getValues());
}

function findDietCounselingService_(services, serviceCode) {
  const code = normalizeDietCounselingCode_(serviceCode);
  return (services || []).find(function (service) {
    return normalizeDietCounselingCode_(service && service.service_code) === code;
  }) || null;
}

function getDietCounselingLinkCandidates_(params) {
  params = params || {};
  const reservations = readDietCounselingReservationRows_();
  const logIndex = getDietCounselingTokenLogIndex_();
  const rows = reservations.filter(function (reservation) {
    if (normalizeDietCounselingCode_(reservation.service_code) !== DIET_COUNSELING_CONFIG_.SERVICE_CODE) {
      return false;
    }
    if (isDietCounselingCancelledStatus_(reservation.status)) return false;
    return isDietCounselingEmail_(reservation.customer_email);
  }).map(function (reservation) {
    const reservationId = normalizeDietCounselingText_(reservation.reservation_id);
    const log = logIndex[reservationId] || {};
    return {
      reservation_id: reservationId,
      reservation_date: normalizeDietCounselingDate_(reservation.reservation_date || reservation.date),
      start_time: normalizeDietCounselingTime_(reservation.start_time),
      customer_name: normalizeDietCounselingText_(reservation.customer_name),
      customer_email: normalizeDietCounselingText_(reservation.customer_email),
      member_no: normalizeDietCounselingText_(reservation.member_no),
      staff_name: normalizeDietCounselingText_(reservation.staff_name),
      status: normalizeDietCounselingCode_(reservation.status),
      consultation_method: normalizeDietCounselingMethodForDisplay_(
        reservation.consultation_method || extractDietCounselingMethodFromNote_(reservation.note)
      ),
      mail_status: normalizeDietCounselingText_(log["送信状態"]) || "未送信",
      answer_status: normalizeDietCounselingText_(log["回答状態"]) || "未回答",
      sent_at: normalizeDietCounselingText_(log["送信日時"])
    };
  });

  rows.sort(function (a, b) {
    return (b.reservation_date + " " + b.start_time)
      .localeCompare(a.reservation_date + " " + a.start_time);
  });
  return successResponse({ candidates: rows, count: rows.length });
}

function sendDietCounselingLinksBulk_(body) {
  body = body || {};
  const reservationIds = uniqueDietCounselingValues_(
    Array.isArray(body.reservation_ids) ? body.reservation_ids : []
  ).filter(Boolean);
  if (!reservationIds.length) {
    return errorResponse("送信対象を選択してください。", "NO_RECIPIENTS");
  }
  if (reservationIds.length > DIET_COUNSELING_CONFIG_.BULK_SEND_LIMIT) {
    return errorResponse(
      "一度に送信できる件数は" + DIET_COUNSELING_CONFIG_.BULK_SEND_LIMIT + "件までです。",
      "TOO_MANY_RECIPIENTS"
    );
  }

  const byId = {};
  readDietCounselingReservationRows_().forEach(function (reservation) {
    byId[normalizeDietCounselingText_(reservation.reservation_id)] = reservation;
  });
  const results = [];
  reservationIds.forEach(function (reservationId) {
    const reservation = byId[reservationId];
    if (!reservation ||
        normalizeDietCounselingCode_(reservation.service_code) !== DIET_COUNSELING_CONFIG_.SERVICE_CODE ||
        isDietCounselingCancelledStatus_(reservation.status) ||
        !isDietCounselingEmail_(reservation.customer_email)) {
      results.push({ reservation_id: reservationId, ok: false, message: "送信対象として確認できません。" });
      return;
    }
    try {
      const sent = sendDietCounselingAnswerUrlForReservation_(reservation, {
        source: "HISTORICAL_BULK",
        allowResend: body.allow_resend === true
      });
      results.push({
        reservation_id: reservationId,
        ok: true,
        sent: sent.sent === true,
        skipped: sent.skipped === true,
        message: sent.message || ""
      });
    } catch (error) {
      results.push({
        reservation_id: reservationId,
        ok: false,
        message: error && error.message ? error.message : "送信できませんでした。"
      });
    }
  });

  const sentCount = results.filter(function (row) { return row.sent === true; }).length;
  const skippedCount = results.filter(function (row) { return row.skipped === true; }).length;
  const failedCount = results.filter(function (row) { return row.ok !== true; }).length;
  return successResponse({
    requested_count: reservationIds.length,
    sent_count: sentCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    results: results
  });
}

function sendDietCounselingAnswerUrlForReservation_(reservation, options) {
  options = options || {};
  const reservationId = normalizeDietCounselingText_(reservation && reservation.reservation_id);
  const email = normalizeDietCounselingText_(reservation && reservation.customer_email);
  if (!reservationId) throw new Error("予約IDを確認できませんでした。");
  if (!isDietCounselingEmail_(email)) throw new Error("メールアドレスを確認できませんでした。");

  const linkRecord = issueDietCounselingAnswerUrl_(reservation);
  if (linkRecord.alreadySent && options.allowResend !== true) {
    return { sent: false, skipped: true, message: "送信済みのためスキップしました。" };
  }

  const method = normalizeDietCounselingMethodForDisplay_(
    reservation.consultation_method || extractDietCounselingMethodFromNote_(reservation.note)
  );
  const name = normalizeDietCounselingText_(reservation.customer_name) || "お客様";
  const date = normalizeDietCounselingDate_(reservation.reservation_date || reservation.date);
  const start = normalizeDietCounselingTime_(reservation.start_time);
  const expiryText = formatDietCounselingDateTime_(linkRecord.expiresAt);
  const body = [
    name + " 様",
    "",
    "ダイエットカウンセリングのお申込みありがとうございます。",
    "カウンセリング前日までに、以下の専用URLから事前回答をお願いいたします。",
    "",
    "予約日時：" + formatDietCounselingDateJa_(date) + " " + start + "〜",
    "実施方法：" + method,
    "",
    linkRecord.url,
    "",
    "URL有効期限：" + expiryText,
    "※このURLは予約者様専用です。第三者へ転送しないでください。",
    "",
    "お問い合わせ：" + getDietCounselingReplyTo_(),
    "",
    "The Forest Gym/Meal Fit"
  ].join("\n");

  try {
    MailApp.sendEmail({
      to: email,
      subject: "【ダイエットカウンセリング】事前回答のお願い",
      body: body,
      name: "The Forest Gym/Meal Fit",
      replyTo: getDietCounselingReplyTo_()
    });
    markDietCounselingLinkSent_(linkRecord.sheet, linkRecord.rowNumber, "");
    return { sent: true, skipped: false, url: linkRecord.url };
  } catch (error) {
    markDietCounselingLinkSent_(
      linkRecord.sheet,
      linkRecord.rowNumber,
      error && error.message ? error.message : "メール送信エラー"
    );
    throw error;
  }
}

function issueDietCounselingAnswerUrl_(reservation) {
  const sheet = getOrCreateDietCounselingTokenSheet_();
  const headerMap = getDietCounselingHeaderMap_(sheet, DIET_COUNSELING_TOKEN_HEADERS_);
  const reservationId = normalizeDietCounselingText_(reservation.reservation_id);
  const existing = findDietCounselingLogRow_(sheet, headerMap, "予約ID", reservationId);
  const now = new Date();

  if (existing) {
    const values = existing.record;
    const expiresAt = parseDietCounselingDateTime_(values["有効期限"]);
    const completed = normalizeDietCounselingText_(values["回答状態"]) === "回答済み";
    const alreadySent = normalizeDietCounselingText_(values["送信状態"]) === "送信済み";
    if (completed) {
      const error = new Error("この予約は回答済みです。");
      error.code = "ALREADY_ANSWERED";
      throw error;
    }
    if (expiresAt && expiresAt.getTime() > now.getTime() && values["回答URL"]) {
      return {
        sheet: sheet,
        rowNumber: existing.rowNumber,
        url: normalizeDietCounselingText_(values["回答URL"]),
        expiresAt: expiresAt,
        alreadySent: alreadySent
      };
    }
  }

  const token = Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "");
  const tokenHash = hashDietCounselingToken_(token);
  const expiresAt = new Date(now.getTime() + getDietCounselingTokenValidDays_() * 86400000);
  const url = getDietCounselingFormUrl_() + "?token=" + encodeURIComponent(token);
  const rowRecord = {
    "URL発行ID": createDietCounselingId_("DCL"),
    "予約ID": reservationId,
    "サービスコード": DIET_COUNSELING_CONFIG_.SERVICE_CODE,
    "カウンセリング日": normalizeDietCounselingDate_(reservation.reservation_date || reservation.date),
    "開始時間": normalizeDietCounselingTime_(reservation.start_time),
    "会員区分": normalizeDietCounselingText_(reservation.customer_type) ||
      (normalizeDietCounselingText_(reservation.member_no) ? "会員" : "非会員"),
    "会員番号": normalizeDietCounselingText_(reservation.member_no),
    "氏名": normalizeDietCounselingText_(reservation.customer_name),
    "メールアドレス": normalizeDietCounselingText_(reservation.customer_email),
    "担当者": normalizeDietCounselingText_(reservation.staff_name || reservation.staff_code),
    "実施方法": normalizeDietCounselingMethodForDisplay_(
      reservation.consultation_method || extractDietCounselingMethodFromNote_(reservation.note)
    ),
    "担当者所在場所": normalizeDietCounselingText_(
      reservation.staff_location || extractDietCounselingLocationFromNote_(reservation.note)
    ),
    "トークンハッシュ": tokenHash,
    "回答URL": url,
    "有効期限": formatDietCounselingStorageDateTime_(expiresAt),
    "送信状態": "未送信",
    "送信日時": "",
    "送信回数": 0,
    "回答状態": "未回答",
    "回答ID": "",
    "回答日時": "",
    "エラー内容": "",
    "最終更新日時": formatDietCounselingStorageDateTime_(now)
  };

  let rowNumber;
  if (existing) {
    writeDietCounselingRecordToRow_(sheet, headerMap, existing.rowNumber, rowRecord);
    rowNumber = existing.rowNumber;
  } else {
    rowNumber = appendDietCounselingRecord_(sheet, headerMap, rowRecord);
  }
  return { sheet: sheet, rowNumber: rowNumber, url: url, expiresAt: expiresAt, alreadySent: false };
}

function getDietCounselingFormContext_(params) {
  try {
    const tokenInfo = resolveDietCounselingToken_(params && params.token, true);
    const record = tokenInfo.record;
    const submitted = normalizeDietCounselingText_(record["回答状態"]) === "回答済み";
    const answerId = normalizeDietCounselingText_(record["回答ID"]);
    return successResponse({
      reservation_id: normalizeDietCounselingText_(record["予約ID"]),
      counseling_date: normalizeDietCounselingDate_(record["カウンセリング日"]),
      start_time: normalizeDietCounselingTime_(record["開始時間"]),
      member_type: normalizeDietCounselingText_(record["会員区分"]),
      member_no: normalizeDietCounselingText_(record["会員番号"]),
      customer_name: normalizeDietCounselingText_(record["氏名"]),
      customer_email: normalizeDietCounselingText_(record["メールアドレス"]),
      staff_name: normalizeDietCounselingText_(record["担当者"]),
      consultation_method: normalizeDietCounselingText_(record["実施方法"]) || "ONLINE",
      expires_at: normalizeDietCounselingText_(record["有効期限"]),
      submitted: submitted,
      answer_id: answerId
    });
  } catch (error) {
    return errorResponse(
      error && error.message ? error.message : "専用URLを確認できませんでした。",
      error && error.code ? error.code : "TOKEN_ERROR"
    );
  }
}

function submitDietCounselingResponse_(body) {
  body = body || {};
  const lock = LockService.getScriptLock();
  let answerSheet = null;
  let answerHeaderMap = null;
  let answerRowNumber = 0;
  try {
    lock.waitLock(15000);
    const tokenInfo = resolveDietCounselingToken_(body.token, false);
    const tokenRecord = tokenInfo.record;
    if (normalizeDietCounselingText_(tokenRecord["回答状態"]) === "回答済み") {
      const duplicate = new Error("この回答はすでに送信済みです。");
      duplicate.code = "ALREADY_SUBMITTED";
      throw duplicate;
    }

    validateDietCounselingAnswer_(body.answers || {});
    const answerId = createDietCounselingId_("DCA");
    const now = new Date();
    const record = buildDietCounselingAnswerRecord_(
      answerId, now, tokenRecord, body.answers || {}
    );
    const adminAccess = issueDietCounselingAdminView_(now);
    Object.assign(record, {
      "管理閲覧トークンハッシュ": adminAccess.tokenHash,
      "管理閲覧URL": adminAccess.url,
      "管理閲覧有効期限": formatDietCounselingStorageDateTime_(adminAccess.expiresAt),
      "管理通知先": getDietCounselingAdminEmail_(),
      "管理通知状態": "未送信",
      "管理通知日時": "",
      "管理通知エラー": ""
    });
    answerSheet = getDietCounselingAnswerSheet_();
    answerHeaderMap = getDietCounselingHeaderMap_(
      answerSheet, DIET_COUNSELING_ANSWER_HEADERS_
    );
    answerRowNumber = appendDietCounselingRecord_(answerSheet, answerHeaderMap, record);

    updateDietCounselingLogFields_(tokenInfo.sheet, tokenInfo.headerMap, tokenInfo.rowNumber, {
      "回答状態": "回答済み",
      "回答ID": answerId,
      "回答日時": formatDietCounselingStorageDateTime_(now),
      "エラー内容": "",
      "最終更新日時": formatDietCounselingStorageDateTime_(now)
    });
    lock.releaseLock();

    let adminNotificationSent = false;
    let adminNotificationWarning = "";
    try {
      sendDietCounselingAdminNotification_(record);
      adminNotificationSent = true;
      record["管理通知状態"] = "送信済み";
      record["管理通知日時"] = formatDietCounselingStorageDateTime_(new Date());
      record["管理通知エラー"] = "";
    } catch (mailError) {
      adminNotificationWarning = mailError && mailError.message
        ? mailError.message
        : "管理通知メールを送信できませんでした。";
      record["管理通知状態"] = "送信失敗";
      record["管理通知日時"] = "";
      record["管理通知エラー"] = adminNotificationWarning;
      console.error("sendDietCounselingAdminNotification_", mailError);
    }
    try {
      writeDietCounselingRecordToRow_(
        answerSheet, answerHeaderMap, answerRowNumber, {
          "管理通知状態": record["管理通知状態"],
          "管理通知日時": record["管理通知日時"],
          "管理通知エラー": record["管理通知エラー"],
          "最終更新日時": formatDietCounselingStorageDateTime_(new Date())
        }
      );
    } catch (statusError) {
      console.error("updateDietCounselingAdminNotificationStatus_", statusError);
    }

    return successResponse({
      answer_id: answerId,
      submitted_at: formatDietCounselingDateTime_(now),
      admin_notification_sent: adminNotificationSent,
      admin_notification_warning: adminNotificationWarning
    });
  } catch (error) {
    try { lock.releaseLock(); } catch (_) {}
    return errorResponse(
      error && error.message ? error.message : "回答を保存できませんでした。",
      error && error.code ? error.code : "COUNSELING_SUBMIT_ERROR"
    );
  }
}

function buildDietCounselingAnswerRecord_(answerId, now, tokenRecord, answers) {
  const age = Number(answers.age);
  const height = Number(answers.height);
  const weight = Number(answers.weight);
  const targetWeight = answers.target_weight === "" || answers.target_weight == null
    ? null : Number(answers.target_weight);
  const gender = normalizeDietCounselingText_(answers.gender);
  const bmi = calculateDietCounselingBmi_(height, weight);
  const bmr = calculateDietCounselingBmr_(gender, age, height, weight);
  const targetBmi = targetWeight == null ? "" : calculateDietCounselingBmi_(height, targetWeight);
  const targetBmr = targetWeight == null ? "" : calculateDietCounselingBmr_(gender, age, height, targetWeight);
  const targetDiff = targetWeight == null ? "" : roundDietCounseling_(targetWeight - weight, 1);
  const reductionRate = targetWeight == null || !weight
    ? "" : roundDietCounseling_((weight - targetWeight) / weight, 4);
  const dietExperiencePeriod = normalizeDietCounselingText_(answers.diet_experience_period);
  const dietExperienceMethod = normalizeDietCounselingText_(answers.diet_experience_method);
  const dietExperienceResult = normalizeDietCounselingText_(answers.diet_experience_result);
  const dietExperienceDetail = normalizeDietCounselingText_(answers.diet_experience_detail) || [
    dietExperiencePeriod ? "時期・期間：" + dietExperiencePeriod : "",
    dietExperienceMethod ? "方法：" + dietExperienceMethod : "",
    dietExperienceResult ? "成果：" + dietExperienceResult : ""
  ].filter(function (value) { return !!value; }).join("\n");

  return {
    "回答ID": answerId,
    "送信日時": formatDietCounselingStorageDateTime_(now),
    "カウンセリング日": normalizeDietCounselingDate_(tokenRecord["カウンセリング日"]),
    "予約ID": normalizeDietCounselingText_(tokenRecord["予約ID"]),
    "会員区分": normalizeDietCounselingText_(tokenRecord["会員区分"]),
    "会員番号": normalizeDietCounselingText_(tokenRecord["会員番号"]),
    "氏名": normalizeDietCounselingText_(tokenRecord["氏名"]) || normalizeDietCounselingText_(answers.name),
    "メールアドレス": normalizeDietCounselingText_(tokenRecord["メールアドレス"]),
    "担当者": normalizeDietCounselingText_(tokenRecord["担当者"]),
    "フォームバージョン": DIET_COUNSELING_CONFIG_.FORM_VERSION,
    "年齢": age,
    "性別": gender,
    "身長_cm": height,
    "体重_kg": weight,
    "BMI": bmi,
    "基礎代謝_kcal": bmr,
    "気になる部位": dietCounselingListText_(answers.concerns),
    "その他の気になる部位": normalizeDietCounselingText_(answers.concern_other),
    "目標体重_kg": targetWeight == null ? "" : targetWeight,
    "カウンセリング後に目標決定": normalizeDietCounselingBoolean_(answers.target_later),
    "目標体重差_kg": targetDiff,
    "減量率": reductionRate,
    "目標BMI": targetBmi,
    "目標基礎代謝_kcal": targetBmr,
    "就業有無": normalizeDietCounselingText_(answers.employment),
    "仕事スタイル": dietCounselingListText_(answers.work_style),
    "その他の仕事": normalizeDietCounselingText_(answers.work_other),
    "仕事日起床時間": normalizeDietCounselingTime_(answers.wake_work),
    "翌日仕事_就寝時間": normalizeDietCounselingTime_(answers.sleep_work),
    "仕事日前睡眠時間": calculateDietCounselingSleepHours_(answers.sleep_work, answers.wake_work),
    "休日起床時間": normalizeDietCounselingTime_(answers.wake_off),
    "翌日休み_就寝時間": normalizeDietCounselingTime_(answers.sleep_off),
    "休日前睡眠時間": calculateDietCounselingSleepHours_(answers.sleep_off, answers.wake_off),
    "食事回数": Number(answers.meal_count),
    "朝食時間": normalizeDietCounselingTime_(answers.breakfast_time),
    "朝食メニュー": normalizeDietCounselingText_(answers.breakfast_menu),
    "昼食時間": normalizeDietCounselingTime_(answers.lunch_time),
    "昼食メニュー": normalizeDietCounselingText_(answers.lunch_menu),
    "夕食時間": normalizeDietCounselingTime_(answers.dinner_time),
    "夕食メニュー": normalizeDietCounselingText_(answers.dinner_menu),
    "間食時間": normalizeDietCounselingTime_(answers.snack_time),
    "間食メニュー": normalizeDietCounselingText_(answers.snack_menu),
    "好き嫌い有無": normalizeDietCounselingText_(answers.food_dislike),
    "苦手な食材": normalizeDietCounselingText_(answers.dislike_detail),
    "アレルギー有無": normalizeDietCounselingText_(answers.allergy),
    "アレルギー詳細": normalizeDietCounselingText_(answers.allergy_detail),
    "飲酒有無": normalizeDietCounselingText_(answers.alcohol),
    "飲酒頻度": normalizeDietCounselingText_(answers.alcohol_frequency),
    "運動歴有無": normalizeDietCounselingText_(answers.exercise_history),
    "運動歴詳細": normalizeDietCounselingText_(answers.exercise_history_detail),
    "現在の運動有無": normalizeDietCounselingText_(answers.current_exercise),
    "現在の運動詳細": normalizeDietCounselingText_(answers.current_exercise_detail),
    "既往歴有無": normalizeDietCounselingText_(answers.medical_history),
    "既往歴詳細": normalizeDietCounselingText_(answers.medical_history_detail),
    "現在の体調": normalizeDietCounselingText_(answers.condition),
    "体調詳細": normalizeDietCounselingText_(answers.condition_detail),
    "ダイエット経験有無": normalizeDietCounselingText_(answers.diet_experience),
    "ダイエット期間・方法": dietExperienceDetail,
    "PDF処理状態": "PDF不要（管理画面印刷）",
    "PDFファイルID": "",
    "PDF_URL": "",
    "PDF作成日時": "",
    "エラー内容": "",
    "最終更新日時": formatDietCounselingStorageDateTime_(now),
    "ダイエット経験時期": dietExperiencePeriod,
    "ダイエット方法": dietExperienceMethod,
    "ダイエット成果": dietExperienceResult
  };
}

function issueDietCounselingAdminView_(now) {
  now = now || new Date();
  const token = Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "");
  const expiresAt = new Date(
    now.getTime() + getDietCounselingAdminViewValidDays_() * 86400000
  );
  return {
    tokenHash: hashDietCounselingToken_(token),
    url: getDietCounselingFormUrl_() + "?view_token=" + encodeURIComponent(token),
    expiresAt: expiresAt
  };
}

function getDietCounselingStaffSheet_(params) {
  try {
    const token = normalizeDietCounselingText_(params && params.token);
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      const invalid = new Error("管理者用URLが正しくありません。");
      invalid.code = "INVALID_ADMIN_VIEW_TOKEN";
      throw invalid;
    }
    const sheet = getDietCounselingAnswerSheet_();
    const headerMap = getDietCounselingHeaderMap_(
      sheet, DIET_COUNSELING_ANSWER_HEADERS_
    );
    const found = findDietCounselingLogRow_(
      sheet, headerMap, "管理閲覧トークンハッシュ", hashDietCounselingToken_(token)
    );
    if (!found) {
      const notFound = new Error("管理者用URLを確認できませんでした。");
      notFound.code = "ADMIN_VIEW_TOKEN_NOT_FOUND";
      throw notFound;
    }
    const expiresAt = parseDietCounselingDateTime_(found.record["管理閲覧有効期限"]);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      const expired = new Error("この管理者用URLの有効期限が切れています。");
      expired.code = "ADMIN_VIEW_TOKEN_EXPIRED";
      throw expired;
    }
    return successResponse(buildDietCounselingPrintSheetData_(found.record));
  } catch (error) {
    return errorResponse(
      error && error.message ? error.message : "カウンセリングシートを確認できませんでした。",
      error && error.code ? error.code : "ADMIN_VIEW_ERROR"
    );
  }
}

function sendDietCounselingAdminNotification_(record) {
  record = record || {};
  const to = normalizeDietCounselingText_(record["管理通知先"]) ||
    getDietCounselingAdminEmail_();
  if (!isDietCounselingEmail_(to)) {
    throw new Error("管理通知先メールアドレスを確認してください。");
  }
  const viewUrl = normalizeDietCounselingText_(record["管理閲覧URL"]);
  if (!viewUrl) throw new Error("管理者用閲覧URLを確認できませんでした。");
  const name = normalizeDietCounselingText_(record["氏名"]) || "お客様";
  const body = [
    "ダイエットカウンセリングの事前回答が届きました。",
    "",
    "氏名：" + name + " 様",
    "カウンセリング日：" + formatDietCounselingDateJa_(record["カウンセリング日"]),
    "会員区分：" + normalizeDietCounselingText_(record["会員区分"]),
    "担当：" + normalizeDietCounselingText_(record["担当者"]),
    "回答ID：" + normalizeDietCounselingText_(record["回答ID"]),
    "",
    "【管理者用カウンセリングシート】",
    viewUrl,
    "",
    "カウンセリング時にiPadで開き、会員様へお見せください。",
    "印刷する場合はA4縦・片面1枚で出力されます。",
    "※管理者専用URLです。お客様へ送信・転送しないでください。"
  ].join("\n");
  MailApp.sendEmail({
    to: to,
    subject: "【ダイエットカウンセリング】事前回答完了：" + name + " 様",
    body: body,
    name: "Diet Counseling",
    replyTo: getDietCounselingReplyTo_()
  });
  return { sent: true, to: to };
}

function backfillDietCounselingAdminViewLinks_() {
  const sheet = getDietCounselingAnswerSheet_();
  const headerMap = getDietCounselingHeaderMap_(
    sheet, DIET_COUNSELING_ANSWER_HEADERS_
  );
  const summary = { processed: 0, links_created: 0, mails_sent: 0, skipped: 0, failed: 0 };
  if (sheet.getLastRow() < 2) return summary;

  const rows = sheet.getRange(
    2, 1, sheet.getLastRow() - 1, headerMap.columnCount
  ).getValues();
  rows.forEach(function (values, offset) {
    const record = {};
    headerMap.headers.forEach(function (header, index) {
      if (header) record[header] = values[index];
    });
    if (!normalizeDietCounselingText_(record["回答ID"])) {
      summary.skipped += 1;
      return;
    }
    summary.processed += 1;
    const rowNumber = offset + 2;
    let linkCreated = false;
    const currentExpiry = parseDietCounselingDateTime_(record["管理閲覧有効期限"]);
    if (!normalizeDietCounselingText_(record["管理閲覧URL"]) ||
        !normalizeDietCounselingText_(record["管理閲覧トークンハッシュ"]) ||
        !currentExpiry || currentExpiry.getTime() <= Date.now()) {
      const access = issueDietCounselingAdminView_(new Date());
      record["管理閲覧トークンハッシュ"] = access.tokenHash;
      record["管理閲覧URL"] = access.url;
      record["管理閲覧有効期限"] = formatDietCounselingStorageDateTime_(access.expiresAt);
      linkCreated = true;
      summary.links_created += 1;
    }
    record["管理通知先"] = normalizeDietCounselingText_(record["管理通知先"]) ||
      getDietCounselingAdminEmail_();
    record["PDF処理状態"] = "PDF不要（管理画面印刷）";
    record["最終更新日時"] = formatDietCounselingStorageDateTime_(new Date());

    const shouldSend = linkCreated ||
      normalizeDietCounselingText_(record["管理通知状態"]) !== "送信済み";
    if (shouldSend) {
      try {
        sendDietCounselingAdminNotification_(record);
        record["管理通知状態"] = "送信済み";
        record["管理通知日時"] = formatDietCounselingStorageDateTime_(new Date());
        record["管理通知エラー"] = "";
        summary.mails_sent += 1;
      } catch (error) {
        record["管理通知状態"] = "送信失敗";
        record["管理通知日時"] = "";
        record["管理通知エラー"] = error && error.message
          ? error.message : "管理通知メールを送信できませんでした。";
        summary.failed += 1;
      }
    } else {
      summary.skipped += 1;
    }
    writeDietCounselingRecordToRow_(sheet, headerMap, rowNumber, record);
  });
  console.log(JSON.stringify(summary));
  return summary;
}

function getDietCounselingPrintSheetByAnswerId_(answerId) {
  const sheet = getDietCounselingAnswerSheet_();
  const headerMap = getDietCounselingHeaderMap_(
    sheet, DIET_COUNSELING_ANSWER_HEADERS_
  );
  const found = findDietCounselingLogRow_(
    sheet, headerMap, "回答ID", answerId
  );
  if (!found) {
    const error = new Error("回答内容を確認できませんでした。");
    error.code = "ANSWER_NOT_FOUND";
    throw error;
  }

  const status = normalizeDietCounselingText_(found.record["PDF処理状態"]);
  if (!status || status === "未作成") {
    const now = formatDietCounselingStorageDateTime_(new Date());
    writeDietCounselingRecordToRow_(sheet, headerMap, found.rowNumber, {
      "PDF処理状態": "PDF不要（管理画面印刷）",
      "エラー内容": "",
      "最終更新日時": now
    });
    found.record["PDF処理状態"] = "PDF不要（管理画面印刷）";
    found.record["最終更新日時"] = now;
  }
  return buildDietCounselingPrintSheetData_(found.record);
}

function buildDietCounselingPrintSheetData_(record) {
  record = record || {};
  const targetLater = record["カウンセリング後に目標決定"] === true ||
    normalizeDietCounselingCode_(record["カウンセリング後に目標決定"]) === "TRUE";
  const concerns = [
    normalizeDietCounselingText_(record["気になる部位"]),
    normalizeDietCounselingText_(record["その他の気になる部位"])
  ].filter(Boolean).join("、");

  return {
    answer_id: normalizeDietCounselingText_(record["回答ID"]),
    submitted_at: normalizeDietCounselingText_(record["送信日時"]),
    counseling_date: normalizeDietCounselingDate_(record["カウンセリング日"]),
    reservation_id: normalizeDietCounselingText_(record["予約ID"]),
    member_type: normalizeDietCounselingText_(record["会員区分"]),
    member_no: normalizeDietCounselingText_(record["会員番号"]),
    name: normalizeDietCounselingText_(record["氏名"]),
    staff_name: normalizeDietCounselingText_(record["担当者"]),
    age: normalizeDietCounselingText_(record["年齢"]),
    gender: normalizeDietCounselingText_(record["性別"]),
    height_cm: normalizeDietCounselingText_(record["身長_cm"]),
    weight_kg: normalizeDietCounselingText_(record["体重_kg"]),
    bmi: normalizeDietCounselingText_(record["BMI"]),
    bmr_kcal: normalizeDietCounselingText_(record["基礎代謝_kcal"]),
    concerns: concerns,
    target_weight_kg: normalizeDietCounselingText_(record["目標体重_kg"]),
    target_later: targetLater,
    target_weight_diff_kg: normalizeDietCounselingText_(record["目標体重差_kg"]),
    reduction_rate: normalizeDietCounselingText_(record["減量率"]),
    target_bmi: normalizeDietCounselingText_(record["目標BMI"]),
    target_bmr_kcal: normalizeDietCounselingText_(record["目標基礎代謝_kcal"]),
    employment: normalizeDietCounselingText_(record["就業有無"]),
    work_style: normalizeDietCounselingText_(record["仕事スタイル"]),
    work_other: normalizeDietCounselingText_(record["その他の仕事"]),
    wake_work: normalizeDietCounselingTime_(record["仕事日起床時間"]),
    sleep_work: normalizeDietCounselingTime_(record["翌日仕事_就寝時間"]),
    sleep_hours_work: normalizeDietCounselingText_(record["仕事日前睡眠時間"]),
    wake_off: normalizeDietCounselingTime_(record["休日起床時間"]),
    sleep_off: normalizeDietCounselingTime_(record["翌日休み_就寝時間"]),
    sleep_hours_off: normalizeDietCounselingText_(record["休日前睡眠時間"]),
    meal_count: normalizeDietCounselingText_(record["食事回数"]),
    meals: [
      { label: "朝食", time: normalizeDietCounselingTime_(record["朝食時間"]), menu: normalizeDietCounselingText_(record["朝食メニュー"]) },
      { label: "昼食", time: normalizeDietCounselingTime_(record["昼食時間"]), menu: normalizeDietCounselingText_(record["昼食メニュー"]) },
      { label: "夕食", time: normalizeDietCounselingTime_(record["夕食時間"]), menu: normalizeDietCounselingText_(record["夕食メニュー"]) },
      { label: "間食", time: normalizeDietCounselingTime_(record["間食時間"]), menu: normalizeDietCounselingText_(record["間食メニュー"]) }
    ],
    food_dislike: normalizeDietCounselingText_(record["好き嫌い有無"]),
    dislike_detail: normalizeDietCounselingText_(record["苦手な食材"]),
    allergy: normalizeDietCounselingText_(record["アレルギー有無"]),
    allergy_detail: normalizeDietCounselingText_(record["アレルギー詳細"]),
    alcohol: normalizeDietCounselingText_(record["飲酒有無"]),
    alcohol_frequency: normalizeDietCounselingText_(record["飲酒頻度"]),
    exercise_history: normalizeDietCounselingText_(record["運動歴有無"]),
    exercise_history_detail: normalizeDietCounselingText_(record["運動歴詳細"]),
    current_exercise: normalizeDietCounselingText_(record["現在の運動有無"]),
    current_exercise_detail: normalizeDietCounselingText_(record["現在の運動詳細"]),
    medical_history: normalizeDietCounselingText_(record["既往歴有無"]),
    medical_history_detail: normalizeDietCounselingText_(record["既往歴詳細"]),
    condition: normalizeDietCounselingText_(record["現在の体調"]),
    condition_detail: normalizeDietCounselingText_(record["体調詳細"]),
    diet_experience: normalizeDietCounselingText_(record["ダイエット経験有無"]),
    diet_experience_period: normalizeDietCounselingText_(record["ダイエット経験時期"]),
    diet_experience_method: normalizeDietCounselingText_(record["ダイエット方法"]),
    diet_experience_result: normalizeDietCounselingText_(record["ダイエット成果"])
  };
}

function validateDietCounselingAnswer_(answers) {
  const requiredText = [
    "age", "gender", "height", "weight", "employment", "wake_work", "sleep_work",
    "wake_off", "sleep_off", "meal_count", "breakfast_menu", "lunch_menu",
    "dinner_menu", "snack_menu", "food_dislike", "allergy", "alcohol",
    "exercise_history", "current_exercise", "medical_history", "condition",
    "diet_experience"
  ];
  requiredText.forEach(function (key) {
    if (!normalizeDietCounselingText_(answers[key])) {
      const error = new Error("未入力の項目があります。入力内容をご確認ください。");
      error.code = "REQUIRED_FIELD_MISSING";
      throw error;
    }
  });
  const gender = normalizeDietCounselingText_(answers.gender);
  if (["男性", "女性"].indexOf(gender) < 0) {
    const error = new Error("性別は男性または女性を選択してください。");
    error.code = "INVALID_GENDER";
    throw error;
  }
  if (!dietCounselingListText_(answers.concerns)) {
    const error = new Error("気になる部位を1つ以上選択してください。");
    error.code = "CONCERNS_REQUIRED";
    throw error;
  }
  const age = Number(answers.age);
  const height = Number(answers.height);
  const weight = Number(answers.weight);
  if (!isFinite(age) || age < 15 || age > 100 ||
      !isFinite(height) || height < 100 || height > 250 ||
      !isFinite(weight) || weight < 30 || weight > 300) {
    const error = new Error("年齢・身長・体重の入力値をご確認ください。");
    error.code = "INVALID_BODY_DATA";
    throw error;
  }
  if (!normalizeDietCounselingBoolean_(answers.target_later)) {
    const target = Number(answers.target_weight);
    if (!isFinite(target) || target < 30 || target > 300) {
      const error = new Error("目標体重を入力するか、カウンセリング後に決定を選択してください。");
      error.code = "TARGET_WEIGHT_REQUIRED";
      throw error;
    }
  }
  [
    ["exercise_history", "exercise_history_detail", "運動経験の詳細を入力してください。"],
    ["current_exercise", "current_exercise_detail", "現在の運動内容・頻度・時間を入力してください。"],
    ["medical_history", "medical_history_detail", "既往症の詳細を入力してください。"],
    ["diet_experience", "diet_experience_period", "ダイエット経験の時期・期間を入力してください。"],
    ["diet_experience", "diet_experience_method", "ダイエット方法を入力してください。"],
    ["diet_experience", "diet_experience_result", "ダイエットの成果を入力してください。"]
  ].forEach(function (condition) {
    if (normalizeDietCounselingText_(answers[condition[0]]) === "有" &&
        !normalizeDietCounselingText_(answers[condition[1]])) {
      const error = new Error(condition[2]);
      error.code = "CONDITIONAL_DETAIL_REQUIRED";
      throw error;
    }
  });
}

function resolveDietCounselingToken_(token, allowSubmitted) {
  const tokenText = normalizeDietCounselingText_(token);
  if (!/^[a-f0-9]{64}$/i.test(tokenText)) {
    const invalid = new Error("専用URLが正しくありません。");
    invalid.code = "INVALID_TOKEN";
    throw invalid;
  }
  const sheet = getOrCreateDietCounselingTokenSheet_();
  const headerMap = getDietCounselingHeaderMap_(sheet, DIET_COUNSELING_TOKEN_HEADERS_);
  const hash = hashDietCounselingToken_(tokenText);
  const found = findDietCounselingLogRow_(sheet, headerMap, "トークンハッシュ", hash);
  if (!found) {
    const notFound = new Error("専用URLを確認できませんでした。");
    notFound.code = "TOKEN_NOT_FOUND";
    throw notFound;
  }
  const expiresAt = parseDietCounselingDateTime_(found.record["有効期限"]);
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    const expired = new Error("この専用URLの有効期限が切れています。お申込み先へお問い合わせください。");
    expired.code = "TOKEN_EXPIRED";
    throw expired;
  }
  if (!allowSubmitted && normalizeDietCounselingText_(found.record["回答状態"]) === "回答済み") {
    const used = new Error("この回答はすでに送信済みです。");
    used.code = "ALREADY_SUBMITTED";
    throw used;
  }
  return {
    sheet: sheet,
    headerMap: headerMap,
    rowNumber: found.rowNumber,
    record: found.record,
    expiresAt: expiresAt
  };
}

function getDietCounselingAnswerSheet_() {
  const ss = SpreadsheetApp.openById(getDietCounselingAnswerSpreadsheetId_());
  const sheet = ss.getSheetByName(DIET_COUNSELING_CONFIG_.ANSWER_SHEET_NAME);
  if (!sheet) throw new Error("回答データシートが見つかりません。");
  ensureDietCounselingAnswerHeaders_(sheet);
  return sheet;
}

function ensureDietCounselingAnswerHeaders_(sheet) {
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(normalizeDietCounselingText_);
  const existing = {};
  headers.forEach(function (header) {
    if (header) existing[header] = true;
  });
  const missing = DIET_COUNSELING_ANSWER_HEADERS_.filter(function (header) {
    return !existing[header];
  });
  if (missing.length) {
    sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
  }
  return missing;
}

function getOrCreateDietCounselingTokenSheet_() {
  const ss = SpreadsheetApp.openById(getDietCounselingAnswerSpreadsheetId_());
  let sheet = ss.getSheetByName(DIET_COUNSELING_CONFIG_.TOKEN_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DIET_COUNSELING_CONFIG_.TOKEN_SHEET_NAME);
    sheet.getRange(1, 1, 1, DIET_COUNSELING_TOKEN_HEADERS_.length)
      .setValues([DIET_COUNSELING_TOKEN_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getDietCounselingHeaderMap_(sheet, requiredHeaders) {
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(normalizeDietCounselingText_);
  const map = {};
  const duplicates = [];
  headers.forEach(function (header, index) {
    if (!header) return;
    if (Object.prototype.hasOwnProperty.call(map, header)) duplicates.push(header);
    map[header] = index;
  });
  const missing = (requiredHeaders || []).filter(function (header) {
    return !Object.prototype.hasOwnProperty.call(map, header);
  });
  if (duplicates.length || missing.length) {
    const detail = [];
    if (missing.length) detail.push("不足：" + uniqueDietCounselingValues_(missing).join("、"));
    if (duplicates.length) detail.push("重複：" + uniqueDietCounselingValues_(duplicates).join("、"));
    const error = new Error("シートの項目名を確認してください（" + detail.join("／") + "）。");
    error.code = "INVALID_SHEET_HEADERS";
    throw error;
  }
  return { indexes: map, headers: headers, columnCount: lastColumn };
}

function appendDietCounselingRecord_(sheet, headerMap, record) {
  const row = Array(headerMap.columnCount).fill("");
  Object.keys(record || {}).forEach(function (header) {
    if (Object.prototype.hasOwnProperty.call(headerMap.indexes, header)) {
      row[headerMap.indexes[header]] = record[header];
    }
  });
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return rowNumber;
}

function writeDietCounselingRecordToRow_(sheet, headerMap, rowNumber, record) {
  const current = sheet.getRange(rowNumber, 1, 1, headerMap.columnCount).getValues()[0];
  Object.keys(record || {}).forEach(function (header) {
    if (Object.prototype.hasOwnProperty.call(headerMap.indexes, header)) {
      current[headerMap.indexes[header]] = record[header];
    }
  });
  sheet.getRange(rowNumber, 1, 1, current.length).setValues([current]);
}

function updateDietCounselingLogFields_(sheet, headerMap, rowNumber, values) {
  Object.keys(values || {}).forEach(function (header) {
    const index = headerMap.indexes[header];
    if (index == null) throw new Error("回答URL管理の項目が見つかりません：" + header);
    sheet.getRange(rowNumber, index + 1).setValue(values[header]);
  });
}

function findDietCounselingLogRow_(sheet, headerMap, header, wantedValue) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headerMap.columnCount).getValues();
  const index = headerMap.indexes[header];
  for (let offset = values.length - 1; offset >= 0; offset -= 1) {
    if (normalizeDietCounselingText_(values[offset][index]) === normalizeDietCounselingText_(wantedValue)) {
      const record = {};
      headerMap.headers.forEach(function (name, columnIndex) {
        if (name) record[name] = values[offset][columnIndex];
      });
      return { rowNumber: offset + 2, record: record };
    }
  }
  return null;
}

function markDietCounselingLinkSent_(sheet, rowNumber, errorMessage) {
  const map = getDietCounselingHeaderMap_(sheet, DIET_COUNSELING_TOKEN_HEADERS_);
  const currentCount = Number(sheet.getRange(rowNumber, map.indexes["送信回数"] + 1).getValue() || 0);
  const now = formatDietCounselingStorageDateTime_(new Date());
  updateDietCounselingLogFields_(sheet, map, rowNumber, {
    "送信状態": errorMessage ? "送信失敗" : "送信済み",
    "送信日時": errorMessage ? "" : now,
    "送信回数": currentCount + 1,
    "エラー内容": errorMessage || "",
    "最終更新日時": now
  });
}

function getDietCounselingTokenLogIndex_() {
  const sheet = getOrCreateDietCounselingTokenSheet_();
  const map = getDietCounselingHeaderMap_(sheet, DIET_COUNSELING_TOKEN_HEADERS_);
  const index = {};
  if (sheet.getLastRow() < 2) return index;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, map.columnCount).getValues();
  rows.forEach(function (row) {
    const record = {};
    map.headers.forEach(function (header, columnIndex) {
      if (header) record[header] = row[columnIndex];
    });
    const reservationId = normalizeDietCounselingText_(record["予約ID"]);
    if (reservationId) index[reservationId] = record;
  });
  return index;
}

function persistDietCounselingReservationMetadata_(reservation) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("reservations");
  if (!sheet) throw new Error("reservationsシートが見つかりません。");
  const required = ["reservation_id", "consultation_method", "staff_location"];
  const map = getDietCounselingHeaderMap_(sheet, required);
  const found = findDietCounselingLogRow_(
    sheet, map, "reservation_id", normalizeDietCounselingText_(reservation.reservation_id)
  );
  if (!found) throw new Error("作成した予約をreservationsシートで確認できませんでした。");
  updateDietCounselingLogFields_(sheet, map, found.rowNumber, {
    consultation_method: normalizeDietCounselingMethod_(reservation.consultation_method),
    staff_location: normalizeDietCounselingCode_(reservation.staff_location)
  });
}

function readDietCounselingReservationRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("reservations");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return dietCounselingRowsFromValues_(sheet.getDataRange().getValues());
}

function dietCounselingRowsFromValues_(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const headers = values[0].map(normalizeDietCounselingText_);
  return values.slice(1).map(function (row) {
    const record = {};
    headers.forEach(function (header, index) {
      if (header) record[header] = row[index];
    });
    return record;
  });
}

function calculateDietCounselingBmi_(heightCm, weightKg) {
  const heightM = Number(heightCm) / 100;
  if (!heightM || !isFinite(heightM) || !isFinite(Number(weightKg))) return "";
  return roundDietCounseling_(Number(weightKg) / (heightM * heightM), 1);
}

function calculateDietCounselingBmr_(gender, age, heightCm, weightKg) {
  const normalized = normalizeDietCounselingText_(gender);
  const a = Number(age);
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (![a, h, w].every(isFinite)) return "";
  if (normalized === "女性") {
    return Math.round(9.247 * w + 3.098 * h - 4.33 * a + 447.593);
  }
  if (normalized === "男性") {
    return Math.round(13.397 * w + 4.799 * h - 5.677 * a + 88.362);
  }
  return "";
}

function calculateDietCounselingSleepHours_(sleepTime, wakeTime) {
  const sleep = dietCounselingMinutes_(sleepTime);
  const wake = dietCounselingMinutes_(wakeTime);
  if (![sleep, wake].every(isFinite)) return "";
  let duration = wake - sleep;
  if (duration <= 0) duration += 24 * 60;
  return roundDietCounseling_(duration / 60, 2);
}

function getDietCounselingHeaderProperty_(name, fallback) {
  try {
    const value = PropertiesService.getScriptProperties().getProperty(name);
    return normalizeDietCounselingText_(value) || fallback;
  } catch (_) {
    return fallback;
  }
}

function getDietCounselingOfficeStoreCode_() {
  return normalizeDietCounselingCode_(
    getDietCounselingHeaderProperty_("DIET_COUNSELING_OFFICE_STORE_CODE", DIET_COUNSELING_CONFIG_.OFFICE_STORE_CODE)
  );
}

function getDietCounselingAnswerSpreadsheetId_() {
  return getDietCounselingHeaderProperty_(
    "DIET_COUNSELING_ANSWER_SPREADSHEET_ID",
    DIET_COUNSELING_CONFIG_.ANSWER_SPREADSHEET_ID
  );
}

function getDietCounselingFormUrl_() {
  return getDietCounselingHeaderProperty_(
    "DIET_COUNSELING_FORM_URL",
    DIET_COUNSELING_CONFIG_.FORM_URL
  ).replace(/\/+$/, "") + "/";
}

function getDietCounselingReplyTo_() {
  return getDietCounselingHeaderProperty_(
    "DIET_COUNSELING_REPLY_TO",
    DIET_COUNSELING_CONFIG_.REPLY_TO
  );
}

function getDietCounselingAdminEmail_() {
  return getDietCounselingHeaderProperty_(
    "DIET_COUNSELING_ADMIN_EMAIL",
    DIET_COUNSELING_CONFIG_.ADMIN_NOTIFICATION_EMAIL
  );
}

function getDietCounselingAdminViewValidDays_() {
  const value = Number(getDietCounselingHeaderProperty_(
    "DIET_COUNSELING_ADMIN_VIEW_VALID_DAYS",
    String(DIET_COUNSELING_CONFIG_.ADMIN_VIEW_VALID_DAYS)
  ));
  return isFinite(value) && value >= 1 && value <= 365
    ? Math.floor(value) : DIET_COUNSELING_CONFIG_.ADMIN_VIEW_VALID_DAYS;
}

function getDietCounselingTokenValidDays_() {
  const value = Number(getDietCounselingHeaderProperty_(
    "DIET_COUNSELING_TOKEN_VALID_DAYS",
    String(DIET_COUNSELING_CONFIG_.TOKEN_VALID_DAYS)
  ));
  return isFinite(value) && value >= 1 && value <= 365 ? Math.floor(value) : 30;
}

function runDietCounselingSheetCache_(callback) {
  if (typeof runStoreAwareWithRequestSheetCache_ === "function") {
    return runStoreAwareWithRequestSheetCache_(callback);
  }
  return callback();
}

function parseDietCounselingResponse_(response) {
  if (!response) return null;
  if (typeof response.getContent === "function") {
    try { return JSON.parse(response.getContent()); } catch (_) { return null; }
  }
  return typeof response === "object" ? response : null;
}

function isDietCounselingRoleAllowed_(staff, service) {
  const roles = normalizeDietCounselingText_(service && service.provider_role)
    .split(",").map(normalizeDietCounselingCode_).filter(Boolean);
  return !roles.length || roles.indexOf(normalizeDietCounselingCode_(staff && staff.role)) >= 0;
}

function isDietCounselingStaffAllowed_(staff) {
  return isDietCounselingActive_(staff && staff.can_counsel);
}

function isDietCounselingActive_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON"].indexOf(normalizeDietCounselingCode_(value)) >= 0;
}

function isDietCounselingActiveReservation_(reservation) {
  return !isDietCounselingCancelledStatus_(reservation && reservation.status);
}

function isDietCounselingCancelledStatus_(status) {
  return ["CANCELLED", "CANCELED", "CANCEL"].indexOf(normalizeDietCounselingCode_(status)) >= 0;
}

function countDietCounselingReservations_(reservations, staffCode, date) {
  return (reservations || []).filter(function (reservation) {
    return isDietCounselingActiveReservation_(reservation) &&
      normalizeDietCounselingCode_(reservation && reservation.staff_code) === staffCode &&
      normalizeDietCounselingDate_(reservation && (reservation.reservation_date || reservation.date)) === date;
  }).length;
}

function persistDietCounselingHeaderSafeValue_(value) {
  return value == null ? "" : value;
}

function extractDietCounselingMethodFromNote_(note) {
  const match = /【実施方法】([^\r\n]+)/.exec(normalizeDietCounselingText_(note));
  return match ? match[1] : "ONLINE";
}

function extractDietCounselingLocationFromNote_(note) {
  const match = /【担当者所在場所】([^\r\n]+)/.exec(normalizeDietCounselingText_(note));
  return match ? match[1] : "";
}

function normalizeDietCounselingMethodForDisplay_(value) {
  try {
    return normalizeDietCounselingMethod_(value) === "ONLINE" ? "ONLINE" : "対面";
  } catch (_) {
    return "ONLINE";
  }
}

function getDietCounselingLocationLabel_(code) {
  if (normalizeDietCounselingCode_(code) === DIET_COUNSELING_CONFIG_.ONLINE_ONLY_LOCATION_CODE) {
    return "ONLINE専用";
  }
  return normalizeDietCounselingCode_(code) === getDietCounselingOfficeStoreCode_()
    ? "本社事務所" : "対面会場";
}

function dietCounselingListText_(value) {
  if (Array.isArray(value)) return value.map(normalizeDietCounselingText_).filter(Boolean).join("、");
  return normalizeDietCounselingText_(value);
}

function normalizeDietCounselingBoolean_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON", "カウンセリング後に決めたい"]
    .indexOf(normalizeDietCounselingCode_(value)) >= 0;
}

function hashDietCounselingToken_(token) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizeDietCounselingText_(token),
    Utilities.Charset.UTF_8
  ).map(function (byte) {
    return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0");
  }).join("");
}

function createDietCounselingId_(prefix) {
  return prefix + Utilities.formatDate(new Date(), DIET_COUNSELING_CONFIG_.TIMEZONE, "yyyyMMddHHmmss") +
    Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDietCounselingStorageDateTime_(date) {
  return Utilities.formatDate(date, DIET_COUNSELING_CONFIG_.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function formatDietCounselingDateTime_(date) {
  return Utilities.formatDate(date, DIET_COUNSELING_CONFIG_.TIMEZONE, "yyyy年M月d日 HH:mm");
}

function formatDietCounselingDateJa_(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeDietCounselingText_(dateText));
  return match ? Number(match[1]) + "年" + Number(match[2]) + "月" + Number(match[3]) + "日" : dateText;
}

function parseDietCounselingDateTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = normalizeDietCounselingText_(value).replace(/-/g, "/");
  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function normalizeDietCounselingDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, DIET_COUNSELING_CONFIG_.TIMEZONE, "yyyy-MM-dd");
  }
  const match = /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/.exec(normalizeDietCounselingText_(value));
  return match ? match[1] + "-" + String(Number(match[2])).padStart(2, "0") + "-" + String(Number(match[3])).padStart(2, "0") : "";
}

function normalizeDietCounselingTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, DIET_COUNSELING_CONFIG_.TIMEZONE, "HH:mm");
  }
  const match = /(\d{1,2}):(\d{2})/.exec(normalizeDietCounselingText_(value));
  return match ? String(Number(match[1])).padStart(2, "0") + ":" + match[2] : "";
}

function normalizeDietCounselingCode_(value) {
  return normalizeDietCounselingText_(value).toUpperCase();
}

function normalizeDietCounselingText_(value) {
  return String(value == null ? "" : value).trim();
}

function dietCounselingMinutes_(value) {
  const time = normalizeDietCounselingTime_(value);
  if (!time) return NaN;
  const parts = time.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function addDietCounselingMinutes_(value, added) {
  const start = dietCounselingMinutes_(value);
  if (!isFinite(start) || !isFinite(Number(added))) return "";
  return dietCounselingTimeFromMinutes_(start + Number(added));
}

function dietCounselingTimeFromMinutes_(value) {
  const total = Number(value);
  if (!isFinite(total) || total < 0) return "";
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" +
    String(total % 60).padStart(2, "0");
}

function dietCounselingCovers_(shiftStart, shiftEnd, slotStart, slotEnd) {
  const ss = dietCounselingMinutes_(shiftStart);
  const se = dietCounselingMinutes_(shiftEnd);
  const rs = dietCounselingMinutes_(slotStart);
  const re = dietCounselingMinutes_(slotEnd);
  return [ss, se, rs, re].every(isFinite) && ss <= rs && se >= re;
}

function dietCounselingOverlaps_(aStart, aEnd, bStart, bEnd) {
  const as = dietCounselingMinutes_(aStart);
  const ae = dietCounselingMinutes_(aEnd);
  const bs = dietCounselingMinutes_(bStart);
  const be = dietCounselingMinutes_(bEnd);
  return [as, ae, bs, be].every(isFinite) && as < be && ae > bs;
}

function roundDietCounseling_(value, digits) {
  const power = Math.pow(10, Number(digits || 0));
  return Math.round(Number(value) * power) / power;
}

function uniqueDietCounselingValues_(values) {
  const seen = {};
  return (values || []).filter(function (value) {
    const key = normalizeDietCounselingText_(value);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function isDietCounselingEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeDietCounselingText_(value));
}
