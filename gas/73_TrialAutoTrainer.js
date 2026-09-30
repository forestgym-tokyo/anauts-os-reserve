/**
 * ============================================================
 * A-nauts OS Reserve
 * 無料体験パーソナル 担当トレーナー自動割当
 * ============================================================
 *
 * 対象者は店舗コードやパーソナル担当可否列ではなく、固定コードとroleで決める。
 * - 男性・性別不明: TANAKA / SHINDO
 * - 女性: TANAKA / SHINDO / YOSHIMARU
 *
 * 勤務時間そのものはstaff_shiftsを使うが、shift.store_codeは判定しない。
 */

const TRIAL_AUTO_TRAINER_POLICY_ = Object.freeze({
  SERVICE_CODE: "PT_TRIAL60",
  BASE_CODES: Object.freeze(["TANAKA", "SHINDO"]),
  FEMALE_CODE: "YOSHIMARU",
  CACHE_VERSION: "trial-auto-trainer-v1",
  CACHE_SECONDS: 120
});


function isTrialAutoTrainerServiceCode_(value) {
  return normalizeStoreAwareCode_(value) ===
    TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE;
}


function getTrialAutoTrainerCandidateCodes_(femaleAllowed) {
  const codes = TRIAL_AUTO_TRAINER_POLICY_.BASE_CODES.slice();
  if (femaleAllowed === true) {
    codes.push(TRIAL_AUTO_TRAINER_POLICY_.FEMALE_CODE);
  }
  return codes;
}


/**
 * 無料体験はstaff_codeの有無にかかわらず固定候補から自動割当する。
 */
function shouldUseTrialAutoTrainerRange_(params) {
  return isTrialAutoTrainerServiceCode_(params && params.service_code) &&
    normalizeStoreAwareBoolean_(params && params.trial_auto);
}


/**
 * 7日分をシート各1回・共有カレンダー1回で計算する。
 * 従来のトレーナー別取得よりHTTP数とCalendarApp呼出し数を増やさない。
 */
function getTrialAvailableSlotsRangeFast_(params) {
  params = params || {};

  const startDate = normalizeStoreAwareDate_(params.start_date || params.date);
  const requestedDays = Number(params.days || 7);
  const days = Math.max(1, Math.min(7, Math.floor(requestedDays || 7)));
  const femaleAllowed = normalizeStoreAwareBoolean_(params.yoshimaru_allowed);

  if (!startDate) {
    return errorResponse(
      "開始日をYYYY-MM-DD形式で指定してください。",
      "START_DATE_REQUIRED",
      { start_date: normalizeStoreAwareText_(params.start_date || params.date) }
    );
  }

  const cacheKey = buildTrialAutoTrainerRangeCacheKey_(
    startDate,
    days,
    femaleAllowed
  );
  const cached = getTrialAutoTrainerRangeCache_(cacheKey);
  if (cached) return successResponse(cached);

  const services = readTourWeekRows_("services");
  const service = services.find(function(row) {
    return isTrialAutoTrainerServiceCode_(row && row.service_code);
  });

  if (!service || !isStoreAwareActive_(service.active)) {
    return errorResponse(
      "サービス情報を確認できませんでした。",
      "SERVICE_NOT_FOUND",
      { service_code: TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE }
    );
  }

  const duration = Math.max(1, Number(service.duration || 60));
  const interval = Math.max(1, Number(service.slot_interval_minutes || 30));
  const bookingMinHours = Math.max(0, Number(service.booking_min_hours || 0));
  const publicDays = Math.max(1, Number(service.public_days || 30));
  const providerRoles = normalizeStoreAwareText_(service.provider_role)
    .split(",")
    .map(function(value) { return normalizeStoreAwareCode_(value); })
    .filter(Boolean);
  const allowedCodes = getTrialAutoTrainerCandidateCodes_(femaleAllowed);

  const dates = Array.from({ length: days }, function(_, index) {
    return addStoreAwareUtcDays_(startDate, index);
  });
  const wantedDates = {};
  dates.forEach(function(date) { wantedDates[date] = true; });

  const serviceHours = readTourWeekRows_("service_hours").filter(function(row) {
    const rowCode = normalizeStoreAwareCode_(row && row.service_code);
    const category = normalizeStoreAwareCode_(service && service.category);
    return isStoreAwareActive_(row && row.active) &&
      (rowCode === TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE ||
        (!!category && rowCode === category));
  });
  const staffRows = readTourWeekRows_("staff").filter(function(row) {
    const code = normalizeStoreAwareCode_(row && row.staff_code);
    return allowedCodes.indexOf(code) >= 0 &&
      isStoreAwareActive_(row && row.active) &&
      isStoreAwareRoleAllowed_(row, service);
  });
  const staffByCode = {};
  staffRows.forEach(function(staff) {
    const code = normalizeStoreAwareCode_(staff && staff.staff_code);
    if (code) staffByCode[code] = staff;
  });

  // 店舗コードは見ない。固定候補の勤務日時だけを使う。
  const shifts = readTourWeekRows_("staff_shifts").filter(function(row) {
    const date = normalizeStoreAwareDate_(row && row.date);
    const staffCode = normalizeStoreAwareCode_(row && row.staff_code);
    return wantedDates[date] === true &&
      isStoreAwareActive_(row && row.active) &&
      !!staffByCode[staffCode];
  });

  let calendarState;
  try {
    calendarState = loadTourWeekCalendar_(service, dates);
  } catch (error) {
    return errorResponse(
      "空き状況を取得できませんでした。",
      "AVAILABLE_SLOTS_RANGE_ERROR",
      { message: normalizeStoreAwareText_(error && error.message) }
    );
  }

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
      data: buildTrialAutoTrainerDay_(
        date,
        service,
        serviceHours,
        shifts,
        staffByCode,
        calendarState,
        {
          duration: duration,
          interval: interval,
          bookingMinHours: bookingMinHours,
          bookingOpenAt: bookingOpenAt,
          publicDays: publicDays,
          publicLastDate: publicLastDate,
          providerRoles: providerRoles
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
  putTrialAutoTrainerRangeCache_(
    cacheKey,
    data,
    TRIAL_AUTO_TRAINER_POLICY_.CACHE_SECONDS
  );
  return successResponse(data);
}


function buildTrialAutoTrainerDay_(
  date,
  service,
  serviceHours,
  shifts,
  staffByCode,
  calendarState,
  options
) {
  const dayCode = getTourWeekDayCode_(date);
  const dayMatchedHours = (serviceHours || []).filter(function(row) {
    const code = normalizeStoreAwareCode_(row && row.day_of_week);
    return code === "ALL" || code === dayCode;
  });
  const exactHours = dayMatchedHours.filter(function(row) {
    return normalizeStoreAwareCode_(row && row.service_code) ===
      TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE;
  });
  const categoryHours = dayMatchedHours.filter(function(row) {
    return normalizeStoreAwareCode_(row && row.service_code) ===
      normalizeStoreAwareCode_(service && service.category);
  });
  const dayHours = exactHours.length ? exactHours : categoryHours;
  const dayShifts = (shifts || []).filter(function(row) {
    return normalizeStoreAwareDate_(row && row.date) === date;
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
  const seenSlots = {};

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
        const slotKey = start + "-" + end;
        const startAt = makeTourWeekDateTime_(date, start);
        const endAt = makeTourWeekDateTime_(date, end);

        if (!seenSlots[slotKey] && startAt >= options.bookingOpenAt) {
          const workingStaff = getTrialAutoTrainerShiftStaff_(
            dayShifts,
            staffByCode,
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

          // 既存の担当者指定予約と同じく、共有カレンダーの重複予定は1件でも不可。
          if (workingStaff.length && busyEvents.length === 0) {
            seenSlots[slotKey] = true;
            slots.push({
              date: date,
              start_time: start,
              end_time: end,
              start_at: date + " " + start,
              end_at: date + " " + end,
              capacity: 1,
              working_staff_count: workingStaff.length,
              busy_event_count: 0,
              staff_candidates: workingStaff.map(function(staff) {
                return {
                  staff_code: normalizeStoreAwareCode_(staff && staff.staff_code),
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
    service_code: TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE,
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


function getTrialAutoTrainerShiftStaff_(dayShifts, staffByCode, start, end) {
  const found = {};

  (dayShifts || []).forEach(function(shift) {
    const code = normalizeStoreAwareCode_(shift && shift.staff_code);
    if (!code || found[code] || !staffByCode[code]) return;
    if (!storeAwareCovers_(
      normalizeStoreAwareTime_(shift && shift.start_time),
      normalizeStoreAwareTime_(shift && shift.end_time),
      start,
      end
    )) return;
    found[code] = staffByCode[code];
  });

  return Object.keys(found).map(function(code) { return found[code]; });
}


function buildTrialAutoTrainerRangeCacheKey_(startDate, days, femaleAllowed) {
  return [
    TRIAL_AUTO_TRAINER_POLICY_.CACHE_VERSION,
    typeof getStoreAwareCacheGeneration_ === "function"
      ? getStoreAwareCacheGeneration_()
      : "0",
    TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE,
    femaleAllowed === true ? "F" : "BASE",
    normalizeStoreAwareDate_(startDate),
    Number(days || 7)
  ].join(":");
}


function getTrialAutoTrainerRangeCache_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}


function putTrialAutoTrainerRangeCache_(key, data, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(data), seconds);
  } catch (_) {
    // キャッシュ不可でも空き枠は返す。
  }
}


/**
 * 無料体験の予約直前に、会員マスターの性別と現在の勤務時間から担当を決める。
 */
function createTrialAutoTrainerReservation_(params) {
  params = params || {};

  const state = getYoshimaruMemberEligibilityState_(params);
  if (state.validation_error) {
    const validationError = state.validation_error;
    return errorResponse(
      validationError.message || "会員情報を確認できませんでした。",
      validationError.code || "MEMBER_VALIDATION_ERROR",
      validationError.detail || null
    );
  }

  const service = getAvailabilityService_(
    TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE
  );
  if (!service) {
    return errorResponse(
      "サービス情報を確認できませんでした。",
      "SERVICE_NOT_FOUND",
      { service_code: TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE }
    );
  }

  const date = normalizeStoreAwareDate_(params.date || params.reservation_date);
  const start = normalizeStoreAwareTime_(params.start_time);
  const end = normalizeStoreAwareTime_(
    addStoreAwareMinutes_(start, Number(service.duration || 0))
  );
  if (!date || !start || !end) {
    return createReservationWithTrainerPolicy_(params);
  }

  const allowedCodes = getTrialAutoTrainerCandidateCodes_(
    state.yoshimaru_eligible === true
  );
  const staffRows = readTourWeekRows_("staff").filter(function(staff) {
    const code = normalizeStoreAwareCode_(staff && staff.staff_code);
    return allowedCodes.indexOf(code) >= 0 &&
      isStoreAwareActive_(staff && staff.active) &&
      isStoreAwareRoleAllowed_(staff, service);
  });
  const staffByCode = {};
  staffRows.forEach(function(staff) {
    const code = normalizeStoreAwareCode_(staff && staff.staff_code);
    if (code) staffByCode[code] = staff;
  });

  const shifts = readTourWeekRows_("staff_shifts").filter(function(shift) {
    const code = normalizeStoreAwareCode_(shift && shift.staff_code);
    return normalizeStoreAwareDate_(shift && shift.date) === date &&
      isStoreAwareActive_(shift && shift.active) &&
      !!staffByCode[code] &&
      storeAwareCovers_(
        normalizeStoreAwareTime_(shift && shift.start_time),
        normalizeStoreAwareTime_(shift && shift.end_time),
        start,
        end
      );
  });
  const workingCodes = {};
  shifts.forEach(function(shift) {
    const code = normalizeStoreAwareCode_(shift && shift.staff_code);
    if (code) workingCodes[code] = true;
  });

  const reservations = readTourWeekRows_("reservations").filter(function(row) {
    return isStoreAwareActiveReservation_(row) &&
      normalizeStoreAwareDate_(row && (row.reservation_date || row.date)) === date;
  });
  const candidates = staffRows.filter(function(staff) {
    const code = normalizeStoreAwareCode_(staff && staff.staff_code);
    if (!workingCodes[code]) return false;
    return !reservations.some(function(reservation) {
      return normalizeStoreAwareCode_(reservation && reservation.staff_code) === code &&
        storeAwareOverlaps_(
          normalizeStoreAwareTime_(reservation && reservation.start_time),
          normalizeStoreAwareTime_(reservation && reservation.end_time),
          start,
          end
        );
    });
  });

  const assigned = chooseTrialAutoTrainer_(
    candidates,
    reservations,
    date,
    allowedCodes
  );
  if (!assigned) {
    return errorResponse(
      "この時間は担当トレーナーが不在のため予約できません。空き状況を更新してください。",
      "SLOT_NOT_AVAILABLE",
      {
        service_code: TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE,
        date: date,
        start_time: start,
        end_time: end
      }
    );
  }

  const safeParams = Object.assign({}, params, {
    service_code: TRIAL_AUTO_TRAINER_POLICY_.SERVICE_CODE,
    staff_code: normalizeStoreAwareCode_(assigned.staff_code)
  });

  return runTrialAutoTrainerRoleOnly_(function() {
    return createReservationWithTrainerPolicy_(safeParams);
  });
}


function chooseTrialAutoTrainer_(candidates, reservations, date, allowedCodes) {
  return (candidates || []).slice().sort(function(a, b) {
    const aCode = normalizeStoreAwareCode_(a && a.staff_code);
    const bCode = normalizeStoreAwareCode_(b && b.staff_code);
    const aCount = countStoreAwareAssignments_(reservations, aCode, date);
    const bCount = countStoreAwareAssignments_(reservations, bCode, date);
    if (aCount !== bCount) return aCount - bCount;
    return allowedCodes.indexOf(aCode) - allowedCodes.indexOf(bCode);
  })[0] || null;
}


/**
 * 既存の予約登録処理を利用しつつ、無料体験の固定候補だけ担当可否列を参照しない。
 * role・active・勤務時間・カレンダー重複の最終確認は既存処理のまま残す。
 */
function runTrialAutoTrainerRoleOnly_(callback) {
  if (typeof isStaffServiceAllowed_ !== "function") return callback();

  const original = isStaffServiceAllowed_;
  try {
    isStaffServiceAllowed_ = function(staff, service) {
      const staffCode = normalizeStoreAwareCode_(staff && staff.staff_code);
      if (
        isTrialAutoTrainerServiceCode_(service && service.service_code) &&
        getTrialAutoTrainerCandidateCodes_(true).indexOf(staffCode) >= 0
      ) {
        return true;
      }
      return original(staff, service);
    };
    return callback();
  } finally {
    isStaffServiceAllowed_ = original;
  }
}
