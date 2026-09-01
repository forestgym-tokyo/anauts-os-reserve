/**
 * ============================================================
 * A-nauts OS Reserve
 * 店舗一致を必須にする予約担当者判定
 * ============================================================
 *
 * 同じスタッフが複数店舗で勤務しても、対象サービスの店舗と一致する
 * staff_shifts.store_code だけを予約可能枠・担当候補として使用する。
 */

const STORE_AWARE_SNAPSHOT_CACHE_KEY_ = "store-aware-assignment-v1";
const STORE_AWARE_SNAPSHOT_CACHE_SECONDS_ = 15;
const STORE_AWARE_INACTIVE_RESERVATION_STATUSES_ = Object.freeze([
  "CANCELLED",
  "CANCELED",
  "CANCEL",
  "CONSUMED"
]);


/**
 * 既存の空き枠計算結果を、同一店舗で勤務する担当可能者がいる枠だけに絞る。
 */
function getAvailableSlotsStoreAware_(params) {
  params = params || {};

  const response = getAvailableSlots(params);
  const payload = parseStoreAwareResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const snapshot = loadStoreAwareSnapshot_(true);
  const service = findStoreAwareService_(snapshot, params.service_code);
  if (!service) {
    return errorResponse(
      "サービス情報を確認できませんでした。",
      "SERVICE_NOT_FOUND",
      { service_code: normalizeStoreAwareCode_(params.service_code) }
    );
  }

  return successResponse(
    filterStoreAwareSlotData_(payload.data || {}, params, snapshot, service)
  );
}


/**
 * 7日分一括取得にも同じ店舗条件を適用する。
 */
function getAvailableSlotsRangeStoreAware_(params) {
  params = params || {};

  const response = getAvailableSlotsRange(params);
  const payload = parseStoreAwareResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const snapshot = loadStoreAwareSnapshot_(true);
  const service = findStoreAwareService_(snapshot, params.service_code);
  if (!service) {
    return errorResponse(
      "サービス情報を確認できませんでした。",
      "SERVICE_NOT_FOUND",
      { service_code: normalizeStoreAwareCode_(params.service_code) }
    );
  }

  const data = payload.data || {};
  const results = Array.isArray(data.results) ? data.results : [];
  const filteredResults = results.map(function(result) {
    if (!result || result.ok !== true) return result;
    return Object.assign({}, result, {
      data: filterStoreAwareSlotData_(
        result.data || {},
        params,
        snapshot,
        service
      )
    });
  });

  return successResponse(
    Object.assign({}, data, {
      results: filteredResults
    })
  );
}


function filterStoreAwareSlotData_(data, params, snapshot, service) {
  const slots = Array.isArray(data && data.slots) ? data.slots : [];
  const requestedStaffCode = normalizeStoreAwareCode_(params && params.staff_code);

  const filtered = slots.filter(function(slot) {
    const date = normalizeStoreAwareDate_(
      slot.date || (data && data.date) || (params && (params.date || params.start_date))
    );
    const start = normalizeStoreAwareTime_(slot.start_time);
    const end = normalizeStoreAwareTime_(
      slot.end_time || addStoreAwareMinutes_(start, Number(service.duration || 0))
    );

    if (!date || !start || !end) return false;

    return getStoreAwareCandidates_(
      snapshot,
      service,
      date,
      start,
      end,
      requestedStaffCode,
      ""
    ).length > 0;
  });

  return Object.assign({}, data || {}, {
    slots: filtered
  });
}


/**
 * 予約確定直前にも同じ店舗条件を再確認する。
 * STAFF系サービスは、同一店舗で勤務している候補を明示して既存作成処理へ渡す。
 */
function createReservationStoreAware_(params) {
  params = params || {};

  const snapshot = loadStoreAwareSnapshot_(false);
  const service = findStoreAwareService_(snapshot, params.service_code);
  if (!service) {
    return errorResponse(
      "サービス情報を確認できませんでした。",
      "SERVICE_NOT_FOUND",
      { service_code: normalizeStoreAwareCode_(params.service_code) }
    );
  }

  const requestedStaffCode = normalizeStoreAwareCode_(params.staff_code);
  const serviceCode = normalizeStoreAwareCode_(service.service_code);

  // パーソナル系の担当者未指定は、既存の「担当トレーナー必須」判定へ渡す。
  if (!requestedStaffCode && isStoreAwarePersonalService_(service)) {
    return createReservationWithTrainerPolicy_(params);
  }

  const date = normalizeStoreAwareDate_(params.date || params.reservation_date);
  const start = normalizeStoreAwareTime_(params.start_time);
  const end = normalizeStoreAwareTime_(
    params.end_time || addStoreAwareMinutes_(start, Number(service.duration || 0))
  );

  if (!date || !start || !end) {
    return createReservationWithTrainerPolicy_(params);
  }

  const candidates = getStoreAwareCandidates_(
    snapshot,
    service,
    date,
    start,
    end,
    requestedStaffCode,
    normalizeStoreAwareText_(params.reservation_id)
  );

  if (!candidates.length) {
    return errorResponse(
      "この時間は担当スタッフが不在のため予約できません。空き状況を更新してください。",
      "SLOT_NOT_AVAILABLE",
      {
        service_code: serviceCode,
        store_code: normalizeStoreAwareCode_(service.store_code),
        date: date,
        start_time: start,
        end_time: end
      }
    );
  }

  const safeParams = Object.assign({}, params, {
    store_code: normalizeStoreAwareCode_(service.store_code)
  });

  // 自動割当てサービスでも、他店舗勤務者を既存処理が選ばないよう候補を固定する。
  if (!requestedStaffCode) {
    safeParams.staff_code = chooseStoreAwareCandidate_(
      candidates,
      snapshot.reservations,
      date
    ).staff_code;
  }

  const result = createReservationWithTrainerPolicy_(safeParams);
  const created = parseStoreAwareResponse_(result);
  if (created && created.ok === true) clearStoreAwareSnapshotCache_();
  return result;
}


function getStoreAwareCandidates_(
  snapshot,
  service,
  date,
  start,
  end,
  requestedStaffCode,
  excludedReservationId
) {
  const serviceStore = normalizeStoreAwareCode_(service && service.store_code);
  if (!serviceStore) return [];

  return (snapshot.staff || []).filter(function(staff) {
    const staffCode = normalizeStoreAwareCode_(staff && staff.staff_code);
    if (!staffCode) return false;
    if (requestedStaffCode && staffCode !== requestedStaffCode) return false;
    if (!isStoreAwareActive_(staff && staff.active)) return false;
    if (!isStoreAwareRoleAllowed_(staff, service)) return false;
    if (!isStoreAwareServiceAllowed_(staff, service)) return false;

    const hasSameStoreShift = (snapshot.shifts || []).some(function(shift) {
      return isStoreAwareActive_(shift && shift.active) &&
        normalizeStoreAwareCode_(shift && shift.staff_code) === staffCode &&
        normalizeStoreAwareCode_(shift && shift.store_code) === serviceStore &&
        normalizeStoreAwareDate_(shift && shift.date) === date &&
        storeAwareCovers_(
          normalizeStoreAwareTime_(shift && shift.start_time),
          normalizeStoreAwareTime_(shift && shift.end_time),
          start,
          end
        );
    });

    if (!hasSameStoreShift) return false;

    return !(snapshot.reservations || []).some(function(reservation) {
      if (!isStoreAwareActiveReservation_(reservation)) return false;
      if (
        excludedReservationId &&
        normalizeStoreAwareText_(reservation && reservation.reservation_id) === excludedReservationId
      ) return false;
      if (normalizeStoreAwareCode_(reservation && reservation.staff_code) !== staffCode) return false;
      if (normalizeStoreAwareDate_(reservation && (reservation.reservation_date || reservation.date)) !== date) return false;
      return storeAwareOverlaps_(
        normalizeStoreAwareTime_(reservation && reservation.start_time),
        normalizeStoreAwareTime_(reservation && reservation.end_time),
        start,
        end
      );
    });
  });
}


function chooseStoreAwareCandidate_(candidates, reservations, date) {
  return candidates.slice().sort(function(a, b) {
    const aCode = normalizeStoreAwareCode_(a && a.staff_code);
    const bCode = normalizeStoreAwareCode_(b && b.staff_code);
    const aCount = countStoreAwareAssignments_(reservations, aCode, date);
    const bCount = countStoreAwareAssignments_(reservations, bCode, date);
    if (aCount !== bCount) return aCount - bCount;
    return aCode.localeCompare(bCode);
  })[0];
}


function countStoreAwareAssignments_(reservations, staffCode, date) {
  return (reservations || []).filter(function(reservation) {
    return isStoreAwareActiveReservation_(reservation) &&
      normalizeStoreAwareCode_(reservation && reservation.staff_code) === staffCode &&
      normalizeStoreAwareDate_(reservation && (reservation.reservation_date || reservation.date)) === date;
  }).length;
}


function findStoreAwareService_(snapshot, serviceCodeValue) {
  const serviceCode = normalizeStoreAwareCode_(serviceCodeValue);
  return (snapshot.services || []).find(function(service) {
    return normalizeStoreAwareCode_(service && service.service_code) === serviceCode;
  }) || null;
}


function isStoreAwarePersonalService_(service) {
  const code = normalizeStoreAwareCode_(service && service.service_code);
  const category = normalizeStoreAwareCode_(service && service.category);
  return /^PT(?:_|\d|$)/.test(code) || category === "PERSONAL";
}


function isStoreAwareRoleAllowed_(staff, service) {
  const roles = normalizeStoreAwareText_(service && service.provider_role)
    .split(",")
    .map(function(value) { return normalizeStoreAwareCode_(value); })
    .filter(Boolean);
  if (!roles.length) return true;
  return roles.indexOf(normalizeStoreAwareCode_(staff && staff.role)) >= 0;
}


function isStoreAwareServiceAllowed_(staff, service) {
  const code = normalizeStoreAwareCode_(service && service.service_code);
  let column = "";

  if (/^PT(?:_|\d|$)/.test(code)) column = "can_personal";
  else if (code === "TOUR") column = "can_tour";
  else if (code === "COUNSEL") column = "can_counsel";
  else if (code === "MEAL_PLANNING") column = "can_meal_planning";
  else if (code === "PROCEDURE") column = "can_procedure";
  else if (code === "UNSUBSCRIBE") column = "can_unsubscribe";
  else if (code === "TRAINING_SUPPORT45") column = "can_training_support";
  else if (code.indexOf("9ROUND") >= 0) column = "can_9round";

  return !column || normalizeStoreAwareBoolean_(staff && staff[column]);
}


function loadStoreAwareSnapshot_(allowCache) {
  const cache = CacheService.getScriptCache();

  if (allowCache) {
    try {
      const cached = cache.get(STORE_AWARE_SNAPSHOT_CACHE_KEY_);
      if (cached) return JSON.parse(cached);
    } catch (_) {
      // キャッシュ不可でもシートから読み込む。
    }
  }

  const snapshot = {
    services: readStoreAwareSheet_("services"),
    staff: readStoreAwareSheet_("staff"),
    shifts: readStoreAwareSheet_("staff_shifts"),
    reservations: readStoreAwareSheet_("reservations")
  };

  if (allowCache) {
    try {
      cache.put(
        STORE_AWARE_SNAPSHOT_CACHE_KEY_,
        JSON.stringify(snapshot),
        STORE_AWARE_SNAPSHOT_CACHE_SECONDS_
      );
    } catch (_) {
      // データ量が上限を超えても判定自体は継続する。
    }
  }

  return snapshot;
}


function clearStoreAwareSnapshotCache_() {
  try {
    CacheService.getScriptCache().remove(STORE_AWARE_SNAPSHOT_CACHE_KEY_);
  } catch (_) {
    // キャッシュ削除失敗は予約結果へ影響させない。
  }
}


function readStoreAwareSheet_(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet && spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) {
    return normalizeStoreAwareText_(value);
  });

  return values.slice(1).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) {
      if (header) record[header] = row[index];
    });
    return record;
  });
}


function parseStoreAwareResponse_(response) {
  let value = response;
  if (value && typeof value.getContent === "function") value = value.getContent();
  if (typeof value === "string") {
    try {
      value = JSON.parse(value || "{}");
    } catch (_) {
      return null;
    }
  }
  return value && typeof value === "object" ? value : null;
}


function isStoreAwareActive_(value) {
  if (value === false) return false;
  const normalized = normalizeStoreAwareCode_(value == null || value === "" ? "TRUE" : value);
  return ["FALSE", "0", "NO", "OFF"].indexOf(normalized) < 0;
}


function isStoreAwareActiveReservation_(reservation) {
  const status = normalizeStoreAwareCode_(reservation && reservation.status);
  return STORE_AWARE_INACTIVE_RESERVATION_STATUSES_.indexOf(status) < 0;
}


function normalizeStoreAwareBoolean_(value) {
  if (value === true) return true;
  return ["TRUE", "1", "YES", "ON"].indexOf(normalizeStoreAwareCode_(value)) >= 0;
}


function normalizeStoreAwareDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || "Asia/Tokyo",
      "yyyy-MM-dd"
    );
  }
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(normalizeStoreAwareText_(value));
  return match ? [match[1], match[2], match[3]].join("-") : "";
}


function normalizeStoreAwareTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || "Asia/Tokyo",
      "HH:mm"
    );
  }
  const match = /(\d{1,2}):(\d{2})/.exec(normalizeStoreAwareText_(value));
  return match ? String(Number(match[1])).padStart(2, "0") + ":" + match[2] : "";
}


function addStoreAwareMinutes_(timeValue, addedMinutes) {
  const start = storeAwareMinutes_(timeValue);
  const duration = Number(addedMinutes || 0);
  if (!isFinite(start) || !isFinite(duration) || duration <= 0) return "";
  const total = start + duration;
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" +
    String(total % 60).padStart(2, "0");
}


function storeAwareMinutes_(value) {
  const time = normalizeStoreAwareTime_(value);
  if (!time) return NaN;
  const parts = time.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}


function storeAwareCovers_(shiftStart, shiftEnd, reservationStart, reservationEnd) {
  const ss = storeAwareMinutes_(shiftStart);
  const se = storeAwareMinutes_(shiftEnd);
  const rs = storeAwareMinutes_(reservationStart);
  const re = storeAwareMinutes_(reservationEnd);
  return [ss, se, rs, re].every(isFinite) && ss <= rs && se >= re;
}


function storeAwareOverlaps_(aStart, aEnd, bStart, bEnd) {
  const as = storeAwareMinutes_(aStart);
  const ae = storeAwareMinutes_(aEnd);
  const bs = storeAwareMinutes_(bStart);
  const be = storeAwareMinutes_(bEnd);
  return [as, ae, bs, be].every(isFinite) && as < be && ae > bs;
}


function normalizeStoreAwareCode_(value) {
  return normalizeStoreAwareText_(value).toUpperCase();
}


function normalizeStoreAwareText_(value) {
  return String(value == null ? "" : value).trim();
}
