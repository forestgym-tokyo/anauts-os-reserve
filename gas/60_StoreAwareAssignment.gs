/**
 * ============================================================
 * A-nauts OS Reserve
 * 店舗一致を必須にする予約担当者判定
 * ============================================================
 *
 * 同じスタッフが複数店舗で勤務しても、対象サービスの店舗と一致する
 * staff_shifts.store_code だけを予約可能枠・担当候補として使用する。
 */

const STORE_AWARE_LEGACY_CACHE_KEY_ = "store-aware-assignment-v1";
const STORE_AWARE_STATIC_CACHE_KEY_ = "store-aware-static-v3";
const STORE_AWARE_OLD_STATIC_CACHE_KEY_ = "store-aware-static-v2";
const STORE_AWARE_OLD_DYNAMIC_CACHE_KEY_ = "store-aware-dynamic-v2";
const STORE_AWARE_DYNAMIC_CACHE_PREFIX_ = "store-aware-dynamic-v3";
const STORE_AWARE_GENERATION_CACHE_KEY_ = "store-aware-generation-v3";
const STORE_AWARE_GENERATION_PROPERTY_ = "store-aware-generation-v3";
const STORE_AWARE_STATIC_CACHE_SECONDS_ = 300;
const STORE_AWARE_DYNAMIC_CACHE_SECONDS_ = 300;
const STORE_AWARE_GENERATION_CACHE_SECONDS_ = 21600;
const STORE_AWARE_MAX_SCOPE_DAYS_ = 31;
const TOUR_WEEK_BULK_ENABLED_ = true;
const TOUR_WEEK_BULK_SERVICE_CODE_ = "TOUR";
const TOUR_WEEK_BULK_CACHE_VERSION_ = "tour-week-bulk-v3";
const TOUR_WEEK_BULK_CACHE_SECONDS_ = 300;
const TOUR_WEEK_BULK_STALE_CACHE_SECONDS_ = 21600;
const TOUR_WEEK_BULK_INFLIGHT_SECONDS_ = 420;
const TOUR_WEEK_BULK_LOCK_WAIT_MILLISECONDS_ = 500;
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

  return runStoreAwareWithRequestSheetCache_(function() {
    return getAvailableSlotsStoreAwareImpl_(params);
  });
}


function getAvailableSlotsStoreAwareImpl_(params) {

  const response = getAvailableSlots(params);
  const payload = parseStoreAwareResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const snapshot = loadStoreAwareSnapshot_(true, params);
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

  return runStoreAwareWithRequestSheetCache_(function() {
    if (
      typeof shouldUseTrialAutoTrainerRange_ === "function" &&
      shouldUseTrialAutoTrainerRange_(params)
    ) {
      return getTrialAvailableSlotsRangeFast_(params);
    }
    if (shouldUseTourWeekBulk_(params)) {
      try {
        return getTourAvailableSlotsRangeBulk_(params);
      } catch (error) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "TOUR週次一括計算を従来処理へ切り替えます: " +
            normalizeStoreAwareText_(error && error.message)
          );
        }
      }
    }
    return getAvailableSlotsRangeStoreAwareImpl_(params);
  });
}


/**
 * 店内見学の7日分を、シート各1回・カレンダー1回で計算する。
 * tour_week_bulk=1 の比較リクエストだけで先行利用し、検証後に定数を有効化する。
 */
function shouldUseTourWeekBulk_(params) {
  params = params || {};
  if (
    normalizeStoreAwareCode_(params.service_code) !==
    TOUR_WEEK_BULK_SERVICE_CODE_
  ) {
    return false;
  }
  if (normalizeStoreAwareCode_(params.staff_code)) return false;

  const override = normalizeStoreAwareCode_(params.tour_week_bulk);
  if (["0", "FALSE", "NO", "OFF"].indexOf(override) >= 0) return false;
  if (["1", "TRUE", "YES", "ON"].indexOf(override) >= 0) return true;
  return TOUR_WEEK_BULK_ENABLED_ === true;
}


function getTourAvailableSlotsRangeBulk_(params) {
  params = params || {};

  const startDate = normalizeStoreAwareDate_(params.start_date || params.date);
  const requestedDays = Number(params.days || 7);
  const days = Math.max(1, Math.min(7, Math.floor(requestedDays || 7)));

  if (!startDate) {
    return errorResponse(
      "開始日をYYYY-MM-DD形式で指定してください。",
      "START_DATE_REQUIRED",
      { start_date: normalizeStoreAwareText_(params.start_date || params.date) }
    );
  }

  const cacheKey = buildTourWeekCacheKey_(startDate, days);
  const cached = getTourWeekCache_(cacheKey);
  if (cached) return successResponse(cached);

  // CacheServiceには原子的な「未設定なら追加」がないため、短時間だけ
  // ScriptLockを使って同じ週の計算権を1実行だけに限定する。
  // 重いシート・カレンダー取得中はロックを保持せず、他機能を塞がない。
  if (!claimTourWeekCalculation_(cacheKey)) {
    const completed = getTourWeekCache_(cacheKey);
    if (completed) return successResponse(completed);

    // 予約確定時には最新状態を再検証するため、計算中だけ直近の正常結果を
    // 表示用に返し、同じ重い計算が並列に増えることを防ぐ。
    const stale = getTourWeekCache_(buildTourWeekStaleCacheKey_(cacheKey));
    if (stale) {
      return successResponse(Object.assign({}, stale, {
        cache_status: "stale",
        refreshing: true
      }));
    }

    return errorResponse(
      "空き時間を更新しています。数秒後にもう一度お試しください。",
      "TOUR_AVAILABILITY_BUSY",
      { retry_after_seconds: 5 }
    );
  }

  try {
    // 計算権の取得直前に別実行が完了している可能性があるため再確認する。
    const completed = getTourWeekCache_(cacheKey);
    if (completed) return successResponse(completed);

    const services = readTourWeekRows_("services");
    const service = services.find(function(row) {
      return normalizeStoreAwareCode_(row && row.service_code) ===
        TOUR_WEEK_BULK_SERVICE_CODE_;
    });

    if (!service || !isStoreAwareActive_(service.active)) {
      return errorResponse(
        "サービス情報を確認できませんでした。",
        "SERVICE_NOT_FOUND",
        { service_code: TOUR_WEEK_BULK_SERVICE_CODE_ }
      );
    }

  const storeCode = normalizeStoreAwareCode_(service.store_code);
  const duration = Math.max(1, Number(service.duration || 60));
  const interval = Math.max(1, Number(service.slot_interval_minutes || 30));
  const bookingMinHours = Math.max(0, Number(service.booking_min_hours || 0));
  const publicDays = Math.max(1, Number(service.public_days || 30));
  const providerRoles = normalizeStoreAwareText_(service.provider_role)
    .split(",")
    .map(function(value) { return normalizeStoreAwareCode_(value); })
    .filter(Boolean);

  const dates = Array.from({ length: days }, function(_, index) {
    return addStoreAwareUtcDays_(startDate, index);
  });
  const wantedDates = {};
  dates.forEach(function(date) { wantedDates[date] = true; });

  const serviceHours = readTourWeekRows_("service_hours").filter(function(row) {
    return normalizeStoreAwareCode_(row && row.service_code) ===
      TOUR_WEEK_BULK_SERVICE_CODE_ &&
      isStoreAwareActive_(row && row.active);
  });
  const staffRows = readTourWeekRows_("staff").filter(function(row) {
    if (!isStoreAwareActive_(row && row.active)) return false;
    if (!isStoreAwareRoleAllowed_(row, service)) return false;
    return isStoreAwareServiceAllowed_(row, service);
  });
  const staffByCode = {};
  staffRows.forEach(function(staff) {
    const code = normalizeStoreAwareCode_(staff && staff.staff_code);
    if (code) staffByCode[code] = staff;
  });

  const shifts = readTourWeekRows_("staff_shifts").filter(function(row) {
    const date = normalizeStoreAwareDate_(row && row.date);
    const staffCode = normalizeStoreAwareCode_(row && row.staff_code);
    return wantedDates[date] === true &&
      normalizeStoreAwareCode_(row && row.store_code) === storeCode &&
      isStoreAwareActive_(row && row.active) &&
      !!staffByCode[staffCode];
  });
  const reservations = readTourWeekRows_("reservations").filter(function(row) {
    const date = normalizeStoreAwareDate_(
      row && (row.reservation_date || row.date)
    );
    return wantedDates[date] === true && isStoreAwareActiveReservation_(row);
  });

  const calendarState = loadTourWeekCalendar_(service, dates);
  const now = new Date();
  const bookingOpenAt = new Date(
    now.getTime() + bookingMinHours * 60 * 60 * 1000
  );
  const todayText = formatTourWeekDate_(now);
  const publicLastDate = addStoreAwareUtcDays_(todayText, publicDays);

  const results = dates.map(function(date) {
    return {
      ok: true,
      message: "",
      data: buildTourWeekDay_(
        date,
        service,
        serviceHours,
        shifts,
        reservations,
        staffByCode,
        calendarState,
        {
          duration: duration,
          interval: interval,
          bookingMinHours: bookingMinHours,
          bookingOpenAt: bookingOpenAt,
          publicDays: publicDays,
          publicLastDate: publicLastDate,
          providerRoles: providerRoles,
          storeCode: storeCode
        }
      ),
      timestamp: new Date().toISOString()
    };
  });

    const data = {
      start_date: startDate,
      days: days,
      results: results
    };
    putTourWeekCache_(cacheKey, data, TOUR_WEEK_BULK_CACHE_SECONDS_);
    putTourWeekCache_(
      buildTourWeekStaleCacheKey_(cacheKey),
      data,
      TOUR_WEEK_BULK_STALE_CACHE_SECONDS_
    );
    return successResponse(data);
  } finally {
    releaseTourWeekCalculation_(cacheKey);
  }
}


function buildTourWeekDay_(
  date,
  service,
  serviceHours,
  shifts,
  reservations,
  staffByCode,
  calendarState,
  options
) {
  const dayCode = getTourWeekDayCode_(date);
  const dayHours = (serviceHours || []).filter(function(row) {
    const code = normalizeStoreAwareCode_(row && row.day_of_week);
    return code === "ALL" || code === dayCode;
  });
  const dayShifts = (shifts || []).filter(function(row) {
    return normalizeStoreAwareDate_(row && row.date) === date;
  });
  const dayReservations = (reservations || []).filter(function(row) {
    return normalizeStoreAwareDate_(
      row && (row.reservation_date || row.date)
    ) === date;
  });
  const dayStart = makeTourWeekDateTime_(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayEvents = (calendarState.events || []).filter(function(event) {
    return tourWeekDateRangesOverlap_(
      getTourWeekEventStart_(event),
      getTourWeekEventEnd_(event),
      dayStart,
      dayEnd
    );
  });

  const slots = [];
  if (date <= options.publicLastDate) {
    dayHours.forEach(function(hours) {
      const hoursStart = normalizeStoreAwareTime_(hours && hours.start_time);
      const hoursEnd = normalizeStoreAwareTime_(hours && hours.end_time);
      let cursor = tourWeekTimeToMinutes_(hoursStart);
      const limit = tourWeekTimeToMinutes_(hoursEnd);

      if (!isFinite(cursor) || !isFinite(limit) || cursor >= limit) return;

      while (cursor + options.duration <= limit) {
        const start = tourWeekMinutesToTime_(cursor);
        const end = tourWeekMinutesToTime_(cursor + options.duration);
        const startAt = makeTourWeekDateTime_(date, start);
        const endAt = makeTourWeekDateTime_(date, end);

        if (startAt >= options.bookingOpenAt) {
          const shiftStaff = getTourWeekShiftStaff_(
            dayShifts,
            staffByCode,
            start,
            end
          );
          const availableStaff = filterTourWeekReservedStaff_(
            shiftStaff,
            dayReservations,
            start,
            end
          );
          const busyEvents = dayEvents.filter(function(event) {
            return tourWeekDateRangesOverlap_(
              getTourWeekEventStart_(event),
              getTourWeekEventEnd_(event),
              startAt,
              endAt
            );
          });
          const availableCapacity = Math.min(
            availableStaff.length,
            Math.max(0, shiftStaff.length - busyEvents.length)
          );

          if (availableStaff.length && availableCapacity > 0) {
            slots.push({
              date: date,
              start_time: start,
              end_time: end,
              start_at: date + " " + start,
              end_at: date + " " + end,
              capacity: availableCapacity,
              working_staff_count: shiftStaff.length,
              busy_event_count: busyEvents.length,
              staff_candidates: availableStaff.map(function(staff) {
                return {
                  staff_code: normalizeStoreAwareCode_(staff && staff.staff_code),
                  staff_name: normalizeStoreAwareText_(
                    staff && (staff.staff_name || staff.name)
                  ),
                  role: normalizeStoreAwareCode_(staff && staff.role)
                };
              })
            });
          }
        }

        cursor += options.interval;
      }
    });
  }

  return {
    service_code: normalizeStoreAwareCode_(service && service.service_code),
    service_name: normalizeStoreAwareText_(service && service.service_name),
    date: date,
    duration_minutes: options.duration,
    interval_minutes: options.interval,
    booking_min_hours: options.bookingMinHours,
    public_days: options.publicDays,
    booking_open_at: formatTourWeekDateTime_(options.bookingOpenAt),
    provider_roles: options.providerRoles,
    calendar_code: normalizeStoreAwareCode_(service && service.calendar_code),
    calendar_id: calendarState.calendarId,
    calendar_name: calendarState.calendarName,
    staff_code: null,
    raw_shift_count: dayShifts.length,
    service_hour_count: dayHours.length,
    shift_count: dayShifts.length,
    calendar_event_count: dayEvents.length,
    available_slot_count: slots.length,
    slots: slots
  };
}


function getTourWeekShiftStaff_(
  dayShifts,
  staffByCode,
  start,
  end
) {
  const found = {};

  (dayShifts || []).forEach(function(shift) {
    const staffCode = normalizeStoreAwareCode_(shift && shift.staff_code);
    if (!staffCode || found[staffCode] || !staffByCode[staffCode]) return;
    if (!storeAwareCovers_(
      normalizeStoreAwareTime_(shift && shift.start_time),
      normalizeStoreAwareTime_(shift && shift.end_time),
      start,
      end
    )) return;

    found[staffCode] = staffByCode[staffCode];
  });

  return Object.keys(found).map(function(code) { return found[code]; });
}


function filterTourWeekReservedStaff_(staffRows, dayReservations, start, end) {
  return (staffRows || []).filter(function(staff) {
    const staffCode = normalizeStoreAwareCode_(staff && staff.staff_code);
    return !(dayReservations || []).some(function(reservation) {
      return normalizeStoreAwareCode_(reservation && reservation.staff_code) ===
        staffCode &&
        storeAwareOverlaps_(
          normalizeStoreAwareTime_(reservation && reservation.start_time),
          normalizeStoreAwareTime_(reservation && reservation.end_time),
          start,
          end
        );
    });
  });
}


function loadTourWeekCalendar_(service, dates) {
  const calendarCode = normalizeStoreAwareCode_(service && service.calendar_code);
  const calendarRows = readTourWeekRows_("calendars");
  const row = calendarRows.find(function(item) {
    return normalizeStoreAwareCode_(item && item.calendar_code) === calendarCode;
  }) || {};
  const calendarId = normalizeStoreAwareText_(
    row.calendar_id || row.google_calendar_id || row.id || "primary"
  );
  let calendar = null;

  if (calendarId.toLowerCase() === "primary") {
    calendar = CalendarApp.getDefaultCalendar();
  } else {
    calendar = CalendarApp.getCalendarById(calendarId);
  }
  if (!calendar) throw new Error("カレンダーを確認できませんでした。");

  const rangeStart = makeTourWeekDateTime_(dates[0], "00:00");
  const rangeEnd = makeTourWeekDateTime_(
    addStoreAwareUtcDays_(dates[dates.length - 1], 1),
    "00:00"
  );
  const events = calendar.getEvents(rangeStart, rangeEnd) || [];

  return {
    calendarId: calendarId,
    calendarName: normalizeStoreAwareText_(
      row.calendar_name || row.name ||
      (calendar.getName ? calendar.getName() : "") || calendarId
    ),
    events: events
  };
}


function readTourWeekRows_(sheetName) {
  if (typeof getSheetData === "function") {
    const rows = getSheetData(sheetName);
    if (
      Array.isArray(rows) &&
      (!rows.length || (
        rows[0] && typeof rows[0] === "object" && !Array.isArray(rows[0])
      ))
    ) {
      return rows;
    }
  }

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


function getTourWeekDayCode_(dateText) {
  const parts = String(dateText).split("-").map(Number);
  const index = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][index];
}


function makeTourWeekDateTime_(dateText, timeText) {
  const timezone = Session.getScriptTimeZone() || "Asia/Tokyo";
  if (Utilities && typeof Utilities.parseDate === "function") {
    return Utilities.parseDate(
      String(dateText) + " " + String(timeText),
      timezone,
      "yyyy-MM-dd HH:mm"
    );
  }

  const dateParts = String(dateText).split("-").map(Number);
  const timeParts = String(timeText).split(":").map(Number);
  return new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0] || 0,
    timeParts[1] || 0,
    0,
    0
  );
}


function buildTourWeekCacheKey_(startDate, days) {
  return [
    TOUR_WEEK_BULK_CACHE_VERSION_,
    typeof getStoreAwareCacheGeneration_ === "function"
      ? getStoreAwareCacheGeneration_()
      : "0",
    TOUR_WEEK_BULK_SERVICE_CODE_,
    normalizeStoreAwareDate_(startDate),
    Number(days || 7)
  ].join(":");
}


function getTourWeekCache_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}


function putTourWeekCache_(key, data, seconds) {
  try {
    CacheService.getScriptCache().put(
      key,
      JSON.stringify(data),
      Number(seconds || TOUR_WEEK_BULK_CACHE_SECONDS_)
    );
  } catch (_) {
    // キャッシュ不可でも週次の空き枠は返す。
  }
}


function buildTourWeekStaleCacheKey_(cacheKey) {
  return String(cacheKey) + ":stale";
}


function buildTourWeekInflightCacheKey_(cacheKey) {
  return String(cacheKey) + ":inflight";
}


function claimTourWeekCalculation_(cacheKey) {
  if (typeof LockService === "undefined" || !LockService.getScriptLock) {
    return true;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(TOUR_WEEK_BULK_LOCK_WAIT_MILLISECONDS_)) return false;

  try {
    if (getTourWeekCache_(cacheKey)) return false;

    const inflightKey = buildTourWeekInflightCacheKey_(cacheKey);
    if (getTourWeekCache_(inflightKey)) return false;

    putTourWeekCache_(inflightKey, true, TOUR_WEEK_BULK_INFLIGHT_SECONDS_);
    return true;
  } finally {
    lock.releaseLock();
  }
}


function releaseTourWeekCalculation_(cacheKey) {
  try {
    CacheService.getScriptCache().remove(
      buildTourWeekInflightCacheKey_(cacheKey)
    );
  } catch (_) {
    // 実行中印は有効期限でも自動解除される。
  }
}


function formatTourWeekDate_(value) {
  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone() || "Asia/Tokyo",
    "yyyy-MM-dd"
  );
}


function formatTourWeekDateTime_(value) {
  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone() || "Asia/Tokyo",
    "yyyy-MM-dd HH:mm"
  );
}


function tourWeekTimeToMinutes_(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalizeStoreAwareText_(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}


function tourWeekMinutesToTime_(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
    String(minutes % 60).padStart(2, "0");
}


function getTourWeekEventStart_(event) {
  return event && typeof event.getStartTime === "function"
    ? event.getStartTime()
    : new Date(event && event.start);
}


function getTourWeekEventEnd_(event) {
  return event && typeof event.getEndTime === "function"
    ? event.getEndTime()
    : new Date(event && event.end);
}


function tourWeekDateRangesOverlap_(leftStart, leftEnd, rightStart, rightEnd) {
  if (
    !(leftStart instanceof Date) || isNaN(leftStart.getTime()) ||
    !(leftEnd instanceof Date) || isNaN(leftEnd.getTime())
  ) return false;
  return leftStart < rightEnd && leftEnd > rightStart;
}


function getAvailableSlotsRangeStoreAwareImpl_(params) {

  const response = getAvailableSlotsRange(params);
  const payload = parseStoreAwareResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const snapshot = loadStoreAwareSnapshot_(true, params);
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

  return runStoreAwareWithRequestSheetCache_(function() {
    return createReservationStoreAwareImpl_(params);
  });
}


function createReservationStoreAwareImpl_(params) {

  const directServiceCode = normalizeStoreAwareCode_(params && params.service_code);
  if (
    directServiceCode === "PT_TRIAL60" &&
    typeof createTrialAutoTrainerReservation_ === "function"
  ) {
    const trialResult = createTrialAutoTrainerReservation_(params);
    const trialCreated = parseStoreAwareResponse_(trialResult);
    if (trialCreated && trialCreated.ok === true) clearStoreAwareSnapshotCache_();
    return trialResult;
  }

  const snapshot = loadStoreAwareSnapshot_(false, params);
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


function loadStoreAwareSnapshot_(allowCache, params) {
  try {
    return loadStoreAwareSnapshotScoped_(allowCache, params || {});
  } catch (_) {
    // 新しい分割キャッシュが利用できない場合も予約可否判定は継続する。
    return buildStoreAwareSnapshot_();
  }
}


function loadStoreAwareSnapshotScoped_(allowCache, params) {
  const cache = allowCache ? CacheService.getScriptCache() : null;
  const staticPart = allowCache
    ? loadStoreAwareSnapshotPart_(
      cache,
      STORE_AWARE_STATIC_CACHE_KEY_,
      ["services", "staff"],
      STORE_AWARE_STATIC_CACHE_SECONDS_
    )
    : {
      services: readStoreAwareSheet_("services"),
      staff: readStoreAwareSheet_("staff")
    };
  const service = findStoreAwareService_(
    { services: staticPart.services || [] },
    params && params.service_code
  );
  const storeCode = normalizeStoreAwareCode_(service && service.store_code);
  const dates = getStoreAwareScopeDates_(params);

  if (!storeCode || !dates.length) {
    return buildStoreAwareSnapshot_();
  }

  const dynamicPart = loadStoreAwareScopedDynamicPart_(
    cache,
    storeCode,
    dates,
    allowCache
  );

  return {
    services: staticPart.services || [],
    staff: staticPart.staff || [],
    shifts: dynamicPart.shifts || [],
    reservations: dynamicPart.reservations || []
  };
}


function buildStoreAwareSnapshot_() {
  return {
    services: readStoreAwareSheet_("services"),
    staff: readStoreAwareSheet_("staff"),
    shifts: readStoreAwareSheet_("staff_shifts"),
    reservations: readStoreAwareSheet_("reservations")
  };
}


function loadStoreAwareScopedDynamicPart_(cache, storeCode, dates, allowCache) {
  const generation = allowCache ? getStoreAwareCacheGeneration_() : "fresh";
  const days = {};
  const missingDates = [];

  (dates || []).forEach(function(date) {
    const key = buildStoreAwareDynamicCacheKey_(generation, storeCode, date);
    if (allowCache && cache) {
      try {
        const cached = cache.get(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (
            parsed &&
            Array.isArray(parsed.shifts) &&
            Array.isArray(parsed.reservations)
          ) {
            days[date] = parsed;
            return;
          }
        }
      } catch (_) {
        // 破損・容量超過時は対象日だけシートから再構築する。
      }
    }
    missingDates.push(date);
  });

  if (missingDates.length) {
    const builtDays = buildStoreAwareScopedDynamicDays_(storeCode, missingDates);
    missingDates.forEach(function(date) {
      const day = builtDays[date] || { shifts: [], reservations: [] };
      days[date] = day;
      if (!allowCache || !cache) return;
      try {
        cache.put(
          buildStoreAwareDynamicCacheKey_(generation, storeCode, date),
          JSON.stringify(day),
          STORE_AWARE_DYNAMIC_CACHE_SECONDS_
        );
      } catch (_) {
        // 日別キャッシュが使えなくても、そのリクエストの判定は継続する。
      }
    });
  }

  const shifts = [];
  const reservations = [];
  (dates || []).forEach(function(date) {
    const day = days[date] || {};
    Array.prototype.push.apply(shifts, day.shifts || []);
    Array.prototype.push.apply(reservations, day.reservations || []);
  });

  return { shifts: shifts, reservations: reservations };
}


function buildStoreAwareScopedDynamicDays_(storeCode, dates) {
  const wantedDates = {};
  const days = {};
  (dates || []).forEach(function(date) {
    wantedDates[date] = true;
    days[date] = { shifts: [], reservations: [] };
  });

  const shifts = readStoreAwareSheet_("staff_shifts").filter(function(shift) {
    const date = normalizeStoreAwareDate_(shift && shift.date);
    return wantedDates[date] === true &&
      normalizeStoreAwareCode_(shift && shift.store_code) === storeCode;
  });
  const staffByDate = {};

  shifts.forEach(function(shift) {
    const date = normalizeStoreAwareDate_(shift && shift.date);
    const staffCode = normalizeStoreAwareCode_(shift && shift.staff_code);
    if (!days[date]) return;
    days[date].shifts.push(shift);
    if (!staffByDate[date]) staffByDate[date] = {};
    if (staffCode) staffByDate[date][staffCode] = true;
  });

  readStoreAwareSheet_("reservations").forEach(function(reservation) {
    const date = normalizeStoreAwareDate_(
      reservation && (reservation.reservation_date || reservation.date)
    );
    const staffCode = normalizeStoreAwareCode_(reservation && reservation.staff_code);
    if (
      days[date] &&
      staffCode &&
      staffByDate[date] &&
      staffByDate[date][staffCode] === true
    ) {
      // YACHIYO勤務者の他店舗予約も二重割当防止のため保持する。
      days[date].reservations.push(reservation);
    }
  });

  return days;
}


function buildStoreAwareDynamicCacheKey_(generation, storeCode, date) {
  return [
    STORE_AWARE_DYNAMIC_CACHE_PREFIX_,
    normalizeStoreAwareText_(generation) || "0",
    normalizeStoreAwareCode_(storeCode),
    normalizeStoreAwareDate_(date)
  ].join(":");
}


function getStoreAwareScopeDates_(params) {
  params = params || {};
  const start = normalizeStoreAwareDate_(
    params.start_date || params.date || params.reservation_date
  );
  if (!start) return [];

  const requestedDays = params.start_date ? Number(params.days || 7) : 1;
  const days = Math.max(
    1,
    Math.min(STORE_AWARE_MAX_SCOPE_DAYS_, Math.floor(requestedDays || 1))
  );
  return Array.from({ length: days }, function(_, index) {
    return addStoreAwareUtcDays_(start, index);
  });
}


function addStoreAwareUtcDays_(dateText, offset) {
  const parts = String(dateText).split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(offset || 0)));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}


function loadStoreAwareSnapshotPart_(cache, cacheKey, sheetNames, seconds) {
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {
    // キャッシュ不可でもシートから読み込む。
  }

  const part = {};
  (sheetNames || []).forEach(function(sheetName) {
    const propertyName = sheetName === "staff_shifts" ? "shifts" : sheetName;
    part[propertyName] = readStoreAwareSheet_(sheetName);
  });

  try {
    cache.put(cacheKey, JSON.stringify(part), seconds);
  } catch (_) {
    // データ量が上限を超えても判定自体は継続する。
  }

  return part;
}


function getStoreAwareCacheGeneration_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(STORE_AWARE_GENERATION_CACHE_KEY_);
    if (cached) return normalizeStoreAwareText_(cached);
  } catch (_) {
    // CacheServiceが利用できない場合はScriptPropertiesを確認する。
  }

  let generation = "0";
  try {
    generation = normalizeStoreAwareText_(
      PropertiesService.getScriptProperties().getProperty(
        STORE_AWARE_GENERATION_PROPERTY_
      )
    ) || "0";
  } catch (_) {
    // PropertiesServiceが利用できない環境では短期キャッシュだけを使う。
  }

  try {
    CacheService.getScriptCache().put(
      STORE_AWARE_GENERATION_CACHE_KEY_,
      generation,
      STORE_AWARE_GENERATION_CACHE_SECONDS_
    );
  } catch (_) {
    // 世代番号の短期キャッシュ失敗は予約判定へ影響させない。
  }
  return generation;
}


function bumpStoreAwareCacheGeneration_() {
  const generation = [
    new Date().getTime().toString(36),
    Math.random().toString(36).slice(2, 8)
  ].join("-");

  try {
    PropertiesService.getScriptProperties().setProperty(
      STORE_AWARE_GENERATION_PROPERTY_,
      generation
    );
  } catch (_) {
    // CacheService側の世代番号だけでも旧キャッシュを参照しない。
  }

  try {
    CacheService.getScriptCache().put(
      STORE_AWARE_GENERATION_CACHE_KEY_,
      generation,
      STORE_AWARE_GENERATION_CACHE_SECONDS_
    );
  } catch (_) {
    // キャッシュ不能時は従来どおりシートから読み込む。
  }
  return generation;
}


function clearStoreAwareSnapshotCache_(clearStatic) {
  bumpStoreAwareCacheGeneration_();
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(STORE_AWARE_LEGACY_CACHE_KEY_);
    cache.remove(STORE_AWARE_OLD_DYNAMIC_CACHE_KEY_);
    if (clearStatic === true) {
      cache.remove(STORE_AWARE_OLD_STATIC_CACHE_KEY_);
      cache.remove(STORE_AWARE_STATIC_CACHE_KEY_);
    }
  } catch (_) {
    // キャッシュ削除失敗は予約結果へ影響させない。
  }
}


function invalidateStoreAwareAfterMutation_(response, clearStatic) {
  clearStoreAwareSnapshotCache_(clearStatic === true);
  return response;
}


function runStoreAwareWithRequestSheetCache_(callback) {
  if (typeof getSheetData !== "function") return callback();

  const originalGetSheetData = getSheetData;
  const localCache = Object.create(null);

  try {
    getSheetData = function(sheetName) {
      const key = String(sheetName || "");
      if (!Object.prototype.hasOwnProperty.call(localCache, key)) {
        localCache[key] = originalGetSheetData(sheetName);
      }
      return localCache[key];
    };
    return callback();
  } finally {
    getSheetData = originalGetSheetData;
  }
}


function readStoreAwareSheet_(sheetName) {
  if (typeof getSheetData === "function") {
    try {
      const sharedRows = getSheetData(sheetName);
      if (
        Array.isArray(sharedRows) &&
        (!sharedRows.length || (
          sharedRows[0] &&
          typeof sharedRows[0] === "object" &&
          !Array.isArray(sharedRows[0])
        ))
      ) {
        return compactStoreAwareRows_(sheetName, sharedRows);
      }
    } catch (_) {
      // 既存getSheetDataの形式が異なる場合は従来の直接読込へ戻す。
    }
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet && spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) {
    return normalizeStoreAwareText_(value);
  });

  const rows = values.slice(1).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) {
      if (header) record[header] = row[index];
    });
    return record;
  });

  return compactStoreAwareRows_(sheetName, rows);
}


function compactStoreAwareRows_(sheetName, rows) {
  const columnsBySheet = {
    services: [
      "service_code", "store_code", "duration", "provider_role", "category"
    ],
    staff: [
      "staff_code", "role", "active", "can_personal", "can_tour",
      "can_counsel", "can_meal_planning", "can_procedure",
      "can_unsubscribe", "can_training_support", "can_9round"
    ],
    staff_shifts: [
      "staff_code", "store_code", "date", "start_time", "end_time", "active"
    ],
    reservations: [
      "reservation_id", "store_code", "staff_code", "reservation_date", "date",
      "start_time", "end_time", "status"
    ]
  };
  const columns = columnsBySheet[sheetName];
  if (!columns) return rows || [];

  const compacted = (rows || []).map(function(row) {
    const record = {};
    columns.forEach(function(column) {
      if (Object.prototype.hasOwnProperty.call(row || {}, column)) {
        record[column] = row[column];
      }
    });

    if (sheetName === "staff_shifts") {
      record.date = normalizeStoreAwareDate_(record.date);
      record.start_time = normalizeStoreAwareTime_(record.start_time);
      record.end_time = normalizeStoreAwareTime_(record.end_time);
    } else if (sheetName === "reservations") {
      record.reservation_date = normalizeStoreAwareDate_(record.reservation_date);
      record.date = normalizeStoreAwareDate_(record.date);
      record.start_time = normalizeStoreAwareTime_(record.start_time);
      record.end_time = normalizeStoreAwareTime_(record.end_time);
    }

    return record;
  });

  if (sheetName === "reservations") {
    return compacted.filter(isStoreAwareActiveReservation_);
  }

  return compacted;
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
