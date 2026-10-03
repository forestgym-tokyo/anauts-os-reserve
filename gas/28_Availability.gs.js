/**
 * 予約可能枠取得API
 *
 * 必須:
 * - service_code
 * - date（yyyy-MM-dd）
 *
 * 任意:
 * - staff_code
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function getAvailableSlots(params) {

  try {

    params = params || {};

    const serviceCode = String(
      params.service_code || ""
    ).trim();

    const targetDate = String(
      params.date || ""
    ).trim();

    const requestedStaffCode = String(
      params.staff_code || ""
    ).trim();

    if (!serviceCode) {
      return errorResponse(
        "service_codeを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!targetDate) {
      return errorResponse(
        "dateを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    // 既存の27_GoogleCalendar.gsの関数を使用
    parseDateStart_(targetDate);

    /*
     * サービス取得
     */
    const service = getAvailabilityService_(
      serviceCode
    );

    const providerRoles =
      parseProviderRoles_(
        service.provider_role
      );

    if (providerRoles.length === 0) {
      return errorResponse(
        "サービスにprovider_roleが設定されていません。",
        "PROVIDER_ROLE_NOT_SET",
        {
          service_code:
            serviceCode
        }
      );
    }

    const durationMinutes = Number(
      service.duration
    );

    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes <= 0
    ) {
      return errorResponse(
        "サービスの所要時間が正しく設定されていません。",
        "INVALID_SERVICE_DURATION",
        {
          service_code: serviceCode,
          duration: service.duration
        }
      );
    }

    /*
     * サービス別予約ルール
     */
    const bookingMinHours =
      getAvailabilityRuleNumber_(
        service.booking_min_hours,
        0
      );

    const publicDays =
      getAvailabilityRuleNumber_(
        service.public_days,
        30
      );

    const intervalMinutes =
      getAvailabilityRuleNumber_(
        service.slot_interval_minutes,
        15
      );

    const publicRangeCheck =
      validateAvailabilityPublicRange_(
        targetDate,
        publicDays
      );

    if (!publicRangeCheck.ok) {
      return errorResponse(
        publicRangeCheck.message,
        "DATE_OUT_OF_PUBLIC_RANGE",
        {
          date:
            targetDate,
          public_days:
            publicDays,
          min_date:
            publicRangeCheck.minDate,
          max_date:
            publicRangeCheck.maxDate
        }
      );
    }

    const bookingOpenAt =
      new Date(
        new Date().getTime() +
        bookingMinHours * 60 * 60 * 1000
      );

    /*
     * 対象スタッフ取得
     */
    const allActiveStaffMap =
      getActiveStaffMap_();

    if (
      requestedStaffCode &&
      !allActiveStaffMap.has(
        requestedStaffCode
      )
    ) {
      return errorResponse(
        "指定されたスタッフが見つかりません。",
        "STAFF_NOT_FOUND",
        {
          staff_code:
            requestedStaffCode
        }
      );
    }

    if (
      requestedStaffCode &&
      !isStaffRoleAllowed_(
        allActiveStaffMap.get(
          requestedStaffCode
        ),
        providerRoles
      )
    ) {
      return errorResponse(
        "指定された担当者は、このサービスを担当できません。",
        "STAFF_ROLE_NOT_ALLOWED",
        {
          staff_code:
            requestedStaffCode,
          staff_role:
            normalizeProviderRole_(
              allActiveStaffMap.get(
                requestedStaffCode
              ).role
            ),
          provider_roles:
            providerRoles
        }
      );
    }

    if (
      requestedStaffCode &&
      !isStaffServiceAllowed_(
        allActiveStaffMap.get(
          requestedStaffCode
        ),
        service
      )
    ) {
      return errorResponse(
        "指定された担当者は、このサービスの担当対象ではありません。",
        "STAFF_SERVICE_NOT_ALLOWED",
        {
          staff_code:
            requestedStaffCode,
          service_code:
            serviceCode,
          permission_column:
            getAvailabilityPermissionColumn_(
              service
            )
        }
      );
    }

    const staffMap =
      getActiveStaffMap_(
        providerRoles,
        service
      );

    /*
     * 対象日のサービス受付時間取得
     */
    const serviceHours =
      getAvailabilityServiceHours_(
        service,
        targetDate
      );

    /*
     * 対象日のシフト取得
     */
    let rawShifts =
      getAvailabilityShifts_(
        targetDate,
        staffMap,
        service.store_code
      );

    if (requestedStaffCode) {
      rawShifts = rawShifts.filter(shift =>
        shift.staff_code === requestedStaffCode
      );
    }

    /*
     * スタッフシフトとサービス受付時間の積集合
     */
    const shifts =
      intersectAvailabilityShiftsWithServiceHours_(
        rawShifts,
        serviceHours
      );

    /*
     * シフトがない場合
     */
    if (shifts.length === 0) {
      return successResponse({
        service_code: serviceCode,
        service_name:
          service.service_name ||
          service.name ||
          "",
        date: targetDate,
        duration_minutes: durationMinutes,
        interval_minutes:
          intervalMinutes,
        booking_min_hours:
          bookingMinHours,
        public_days:
          publicDays,
        booking_open_at:
          formatDateTime_(
            bookingOpenAt
          ),
        provider_roles:
          providerRoles,
        staff_code:
          requestedStaffCode || null,
        raw_shift_count:
          rawShifts.length,
        service_hour_count:
          serviceHours.length,
        shift_count: 0,
        calendar_event_count: 0,
        available_slot_count: 0,
        slots: []
      });
    }

    /*
     * カレンダー取得
     */
    const calendarCode = String(
      service.calendar_code || ""
    ).trim();

    if (!calendarCode) {
      return errorResponse(
        "サービスにcalendar_codeが設定されていません。",
        "CALENDAR_CODE_NOT_SET",
        {
          service_code: serviceCode
        }
      );
    }

    const calendarMaster =
      getCalendarMasterByCode_(
        calendarCode
      );

    const calendar =
      getGoogleCalendarById_(
        calendarMaster.calendar_id
      );

    if (!calendar) {
      return errorResponse(
        "Googleカレンダーに接続できません。",
        "CALENDAR_CONNECTION_ERROR",
        {
          calendar_code: calendarCode,
          calendar_id:
            calendarMaster.calendar_id
        }
      );
    }

    /*
     * Googleカレンダー予定取得
     */
    const busyPeriods =
      getAvailabilityCalendarEvents_(
        calendar,
        targetDate
      );

    /*
     * 空き枠生成
     */
    const slots =
      buildAvailabilitySlots_({
        targetDate: targetDate,
        durationMinutes: durationMinutes,
        intervalMinutes: intervalMinutes,
        shifts: shifts,
        busyPeriods: busyPeriods,
        requestedStaffCode:
          requestedStaffCode,
        bookingOpenAt:
          bookingOpenAt
      });

    return successResponse({
      service_code: serviceCode,
      service_name:
        service.service_name ||
        service.name ||
        "",
      date: targetDate,
      duration_minutes: durationMinutes,
      interval_minutes: intervalMinutes,
      booking_min_hours:
        bookingMinHours,
      public_days:
        publicDays,
      booking_open_at:
        formatDateTime_(
          bookingOpenAt
        ),
      provider_roles:
        providerRoles,
      calendar_code: calendarCode,
      calendar_id:
        calendarMaster.calendar_id,
      calendar_name:
        calendar.getName(),
      staff_code:
        requestedStaffCode || null,
      raw_shift_count:
        rawShifts.length,
      service_hour_count:
        serviceHours.length,
      shift_count:
        shifts.length,
      calendar_event_count:
        busyPeriods.length,
      available_slot_count:
        slots.length,
      slots: slots
    });

  } catch (error) {

    logError(
      "getAvailableSlots",
      error.message,
      {
        stack: error.stack
      }
    );

    return errorResponse(
      "空き枠の取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message: error.message
      }
    );
  }
}


/**
 * サービス取得
 *
 * @param {string} serviceCode
 * @returns {Object}
 */
function getAvailabilityService_(
  serviceCode
) {

  const services = getSheetData(
    APP_CONFIG.SHEETS.SERVICES
  );

  const service = services.find(row =>
    String(row.service_code || "") ===
      serviceCode &&
    row.active === true
  );

  if (!service) {
    throw new Error(
      `有効なサービスが見つかりません: ${serviceCode}`
    );
  }

  return service;
}


/**
 * 有効スタッフをMapで取得
 *
 * allowedRoles指定時はroleで絞り込み、
 * service指定時はサービス担当可否チェック列でも絞り込む。
 *
 * @param {Array<string>} allowedRoles
 * @param {Object} service
 * @returns {Map<string, Object>}
 */
function getActiveStaffMap_(
  allowedRoles,
  service
) {

  const staffRows = getSheetData(
    APP_CONFIG.SHEETS.STAFF
  );

  const normalizedAllowedRoles =
    Array.isArray(allowedRoles)
      ? allowedRoles
          .map(normalizeProviderRole_)
          .filter(Boolean)
      : [];

  const map = new Map();

  staffRows
    .filter(row =>
      row.active === true
    )
    .filter(row =>
      normalizedAllowedRoles.length === 0 ||
      normalizedAllowedRoles.includes(
        normalizeProviderRole_(
          row.role
        )
      )
    )
    .filter(row =>
      !service ||
      isStaffServiceAllowed_(
        row,
        service
      )
    )
    .forEach(row => {

      const staffCode = String(
        row.staff_code || ""
      ).trim();

      if (staffCode) {
        map.set(
          staffCode,
          {
            ...row,
            role:
              normalizeProviderRole_(
                row.role
              )
          }
        );
      }
    });

  return map;
}


/**
 * services.provider_roleを配列へ変換
 *
 * @param {*} value
 * @returns {Array<string>}
 */
function parseProviderRoles_(
  value
) {

  const text = String(
    value || ""
  ).trim();

  if (!text) {
    return [];
  }

  return Array.from(
    new Set(
      text
        .split(",")
        .map(normalizeProviderRole_)
        .filter(Boolean)
    )
  );
}


/**
 * roleを比較用の形式へ統一
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeProviderRole_(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}


/**
 * スタッフのroleがサービス担当条件を満たすか
 *
 * @param {Object} staff
 * @param {Array<string>} allowedRoles
 * @returns {boolean}
 */
function isStaffRoleAllowed_(
  staff,
  allowedRoles
) {

  if (!staff) {
    return false;
  }

  const normalizedAllowedRoles =
    Array.isArray(allowedRoles)
      ? allowedRoles
          .map(normalizeProviderRole_)
          .filter(Boolean)
      : [];

  if (
    normalizedAllowedRoles.length === 0
  ) {
    return false;
  }

  const staffRole =
    normalizeProviderRole_(
      staff.role
    );

  return normalizedAllowedRoles.includes(
    staffRole
  );
}


/**
 * サービスに対応するstaffシートの担当可否列を取得
 *
 * services.permission_columnが設定されている場合は
 * その列名を優先する。
 *
 * @param {Object} service
 * @returns {string}
 */
function getAvailabilityPermissionColumn_(
  service
) {

  const explicitColumn = String(
    service &&
    service.permission_column ||
    ""
  ).trim();

  if (explicitColumn) {
    return explicitColumn;
  }

  const serviceCode = String(
    service &&
    service.service_code ||
    ""
  )
    .trim()
    .toUpperCase();

  const category = String(
    service &&
    service.category ||
    ""
  )
    .trim()
    .toUpperCase();

  if (
    category === "PERSONAL" ||
    serviceCode === "PT60" ||
    serviceCode.indexOf("PT_") === 0
  ) {
    return "can_personal";
  }

  const permissionMap = {
    TOUR:
      "can_tour",
    COUNSEL:
      "can_counsel",
    MEAL_PLANNING:
      "can_meal_planning",
    PROCEDURE:
      "can_procedure",
    UNSUBSCRIBE:
      "can_unsubscribe",
    TRAINING_SUPPORT45:
      "can_training_support",
    MPG_TRAINING_SUPPORT45:
      "can_training_support",
    MPG_TOUR45:
      "can_tour",
    NINE_ROUND:
      "can_9round",
    "9ROUND":
      "can_9round"
  };

  return permissionMap[
    serviceCode
  ] || "";
}


/**
 * スタッフが対象サービスを担当可能か判定
 *
 * 対応列が定義されていないサービスは、
 * 従来どおりrole判定のみで許可する。
 *
 * @param {Object} staff
 * @param {Object} service
 * @returns {boolean}
 */
function isStaffServiceAllowed_(
  staff,
  service
) {

  if (!staff) {
    return false;
  }

  const permissionColumn =
    getAvailabilityPermissionColumn_(
      service
    );

  if (!permissionColumn) {
    return true;
  }

  return normalizeAvailabilityBoolean_(
    staff[
      permissionColumn
    ]
  );
}


/**
 * TRUE/FALSE・チェックボックス値をbooleanへ正規化
 *
 * @param {*} value
 * @returns {boolean}
 */
function normalizeAvailabilityBoolean_(
  value
) {

  if (value === true) {
    return true;
  }

  const normalized = String(
    value === null ||
    value === undefined
      ? ""
      : value
  )
    .trim()
    .toUpperCase();

  return (
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "YES" ||
    normalized === "ON"
  );
}


/**
 * 対象日の有効シフト取得
 *
 * @param {string} targetDate
 * @param {Map<string, Object>} staffMap
 * @param {string=} storeCode
 * @returns {Array<Object>}
 */
function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
) {

  const normalizedStoreCode =
    String(storeCode || "")
      .trim()
      .toUpperCase();

  if (
    normalizedStoreCode === "MPG" &&
    typeof cleanupUnbookedMpgShifts === "function"
  ) {
    try {
      cleanupUnbookedMpgShifts();
    } catch (_) {
      // Availability must remain readable even if cleanup itself fails.
    }
  }

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  return rows
    .filter(row =>
      row.active === true &&
      staffMap.has(
        String(row.staff_code || "")
      ) &&
      (
        !normalizedStoreCode ||
        String(row.store_code || "")
          .trim()
          .toUpperCase() ===
          normalizedStoreCode
      ) &&
      formatAvailabilityDate_(
        row.date
      ) === targetDate
    )
    .map(row => {

      const staffCode = String(
        row.staff_code || ""
      ).trim();

      const startTime =
        formatAvailabilityTime_(
          row.start_time
        );

      const endTime =
        formatAvailabilityTime_(
          row.end_time
        );

      return {
        shift_id:
          String(row.shift_id || ""),
        staff_code:
          staffCode,
        staff_name:
          getAvailabilityStaffName_(
            staffMap.get(staffCode)
          ),
        role:
          normalizeProviderRole_(
            staffMap.get(
              staffCode
            ).role
          ),
        start_time:
          startTime,
        end_time:
          endTime,
        start_at:
          createAvailabilityDateTime_(
            targetDate,
            startTime
          ),
        end_at:
          createAvailabilityDateTime_(
            targetDate,
            endTime
          )
      };
    })
    .filter(shift =>
      shift.start_time &&
      shift.end_time &&
      shift.end_at.getTime() >
        shift.start_at.getTime()
    );
}


/**
 * スタッフ表示名取得
 *
 * @param {Object} staff
 * @returns {string}
 */
function getAvailabilityStaffName_(
  staff
) {

  if (!staff) {
    return "";
  }

  return String(
    staff.display_name ||
    staff.staff_name ||
    staff.name ||
    ""
  );
}


/**
 * 対象日のサービス受付時間を取得
 *
 * 優先順位:
 * 1. service_code完全一致
 * 2. category一致
 *
 * day_of_week:
 * ALL / SUN / MON / TUE / WED / THU / FRI / SAT
 *
 * @param {Object} service
 * @param {string} targetDate
 * @returns {Array<Object>}
 */
function getAvailabilityServiceHours_(
  service,
  targetDate
) {

  const rows = getSheetData(
    APP_CONFIG.SHEETS.SERVICE_HOURS
  );

  const serviceCode = String(
    service.service_code || ""
  )
    .trim()
    .toUpperCase();

  const category = String(
    service.category || ""
  )
    .trim()
    .toUpperCase();

  const dayOfWeek =
    getAvailabilityDayOfWeek_(
      targetDate
    );

  const activeRows =
    rows.filter(row =>
      normalizeAvailabilityBoolean_(
        row.active
      )
    );

  const dayMatchedRows =
    activeRows.filter(row =>
      isAvailabilityDayMatched_(
        row.day_of_week,
        dayOfWeek
      )
    );

  let matchedRows =
    dayMatchedRows.filter(row =>
      String(
        row.service_code || ""
      )
        .trim()
        .toUpperCase() ===
      serviceCode
    );

  if (
    matchedRows.length === 0 &&
    category
  ) {
    matchedRows =
      dayMatchedRows.filter(row =>
        String(
          row.service_code || ""
        )
          .trim()
          .toUpperCase() ===
        category
      );
  }

  const periods =
    matchedRows
      .map(row => {

        const startTime =
          formatAvailabilityTime_(
            row.start_time
          );

        const endTime =
          formatAvailabilityTime_(
            row.end_time
          );

        if (
          !startTime ||
          !endTime
        ) {
          return null;
        }

        const startAt =
          createAvailabilityDateTime_(
            targetDate,
            startTime
          );

        const endAt =
          createAvailabilityDateTime_(
            targetDate,
            endTime
          );

        if (
          endAt.getTime() <=
          startAt.getTime()
        ) {
          return null;
        }

        return {
          service_code:
            serviceCode,
          day_of_week:
            dayOfWeek,
          start_time:
            startTime,
          end_time:
            endTime,
          start_at:
            startAt,
          end_at:
            endAt
        };
      })
      .filter(Boolean);

  return mergeAvailabilityPeriods_(
    periods
  );
}


/**
 * シフトとサービス受付時間の積集合を作成
 *
 * @param {Array<Object>} shifts
 * @param {Array<Object>} serviceHours
 * @returns {Array<Object>}
 */
function intersectAvailabilityShiftsWithServiceHours_(
  shifts,
  serviceHours
) {

  const result = [];

  (shifts || []).forEach(shift => {

    (serviceHours || []).forEach(
      serviceHour => {

        const startAt =
          new Date(
            Math.max(
              shift.start_at.getTime(),
              serviceHour.start_at.getTime()
            )
          );

        const endAt =
          new Date(
            Math.min(
              shift.end_at.getTime(),
              serviceHour.end_at.getTime()
            )
          );

        if (
          endAt.getTime() <=
          startAt.getTime()
        ) {
          return;
        }

        result.push({
          ...shift,
          source_shift_start_at:
            shift.start_at,
          source_shift_end_at:
            shift.end_at,
          service_hour_start_at:
            serviceHour.start_at,
          service_hour_end_at:
            serviceHour.end_at,
          start_time:
            Utilities.formatDate(
              startAt,
              APP_CONFIG.TIMEZONE,
              "HH:mm"
            ),
          end_time:
            Utilities.formatDate(
              endAt,
              APP_CONFIG.TIMEZONE,
              "HH:mm"
            ),
          start_at:
            startAt,
          end_at:
            endAt
        });
      }
    );
  });

  return result;
}


/**
 * 重複・連続するサービス受付時間を統合
 *
 * @param {Array<Object>} periods
 * @returns {Array<Object>}
 */
function mergeAvailabilityPeriods_(
  periods
) {

  const sorted =
    (periods || [])
      .slice()
      .sort((a, b) =>
        a.start_at.getTime() -
        b.start_at.getTime()
      );

  if (sorted.length === 0) {
    return [];
  }

  const merged = [
    {
      ...sorted[0]
    }
  ];

  for (
    let index = 1;
    index < sorted.length;
    index++
  ) {

    const current =
      sorted[index];

    const last =
      merged[
        merged.length - 1
      ];

    if (
      current.start_at.getTime() <=
      last.end_at.getTime()
    ) {

      if (
        current.end_at.getTime() >
        last.end_at.getTime()
      ) {
        last.end_at =
          new Date(
            current.end_at
          );

        last.end_time =
          Utilities.formatDate(
            last.end_at,
            APP_CONFIG.TIMEZONE,
            "HH:mm"
          );
      }

    } else {

      merged.push({
        ...current
      });
    }
  }

  return merged;
}


/**
 * 対象日の曜日コード取得
 *
 * @param {string} targetDate
 * @returns {string}
 */
function getAvailabilityDayOfWeek_(
  targetDate
) {

  const date =
    parseDateStart_(
      targetDate
    );

  return [
    "SUN",
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT"
  ][
    date.getDay()
  ];
}


/**
 * service_hours.day_of_weekと対象曜日を照合
 *
 * @param {*} configuredDay
 * @param {string} targetDay
 * @returns {boolean}
 */
function isAvailabilityDayMatched_(
  configuredDay,
  targetDay
) {

  const normalized = String(
    configuredDay || "ALL"
  )
    .trim()
    .toUpperCase();

  const aliases = {
    SUNDAY:
      "SUN",
    MONDAY:
      "MON",
    TUESDAY:
      "TUE",
    WEDNESDAY:
      "WED",
    THURSDAY:
      "THU",
    FRIDAY:
      "FRI",
    SATURDAY:
      "SAT"
  };

  const resolved =
    aliases[
      normalized
    ] ||
    normalized;

  return (
    resolved === "ALL" ||
    resolved === targetDay
  );
}


/**
 * 対象日のGoogleカレンダー予定取得
 *
 * @param {GoogleAppsScript.Calendar.Calendar} calendar
 * @param {string} targetDate
 * @returns {Array<Object>}
 */
function getAvailabilityCalendarEvents_(
  calendar,
  targetDate
) {

  const startDate =
    parseDateStart_(targetDate);

  const endDate =
    new Date(startDate);

  endDate.setDate(
    endDate.getDate() + 1
  );

  return calendar
    .getEvents(
      startDate,
      endDate
    )
    .map(event => ({
      event_id:
        event.getId(),
      title:
        event.getTitle(),
      start_at:
        event.getStartTime(),
      end_at:
        event.getEndTime(),
      all_day:
        event.isAllDayEvent()
    }));
}


/**
 * 予約可能枠生成
 *
 * @param {Object} options
 * @returns {Array<Object>}
 */
function buildAvailabilitySlots_(
  options
) {

  const targetDate =
    options.targetDate;

  const durationMinutes =
    options.durationMinutes;

  const intervalMinutes =
    options.intervalMinutes;

  const shifts =
    options.shifts || [];

  const busyPeriods =
    options.busyPeriods || [];

  const requestedStaffCode =
    options.requestedStaffCode || "";

  const bookingOpenAt =
    options.bookingOpenAt instanceof Date
      ? options.bookingOpenAt
      : null;

  if (shifts.length === 0) {
    return [];
  }

  const earliestStart =
    new Date(
      Math.min.apply(
        null,
        shifts.map(shift =>
          shift.start_at.getTime()
        )
      )
    );

  const latestEnd =
    new Date(
      Math.max.apply(
        null,
        shifts.map(shift =>
          shift.end_at.getTime()
        )
      )
    );

  let cursor =
    roundUpAvailabilityTime_(
      earliestStart,
      intervalMinutes
    );

  const slots = [];

  while (
    cursor.getTime() +
      durationMinutes * 60000 <=
    latestEnd.getTime()
  ) {

    const slotStart =
      new Date(cursor);

    const slotEnd =
      new Date(
        slotStart.getTime() +
        durationMinutes * 60000
      );

    /*
     * 最短予約可能時間より前の枠は表示しない
     */
    if (
      bookingOpenAt &&
      slotStart.getTime() <
        bookingOpenAt.getTime()
    ) {

      cursor = new Date(
        cursor.getTime() +
        intervalMinutes * 60000
      );

      continue;
    }

    /*
     * 予約時間全体をカバーする勤務スタッフ
     */
    const workingStaff =
      shifts.filter(shift =>
        shift.start_at.getTime() <=
          slotStart.getTime() &&
        shift.end_at.getTime() >=
          slotEnd.getTime()
      );

    if (workingStaff.length > 0) {

      /*
       * 同時間帯と重複する既存予定
       */
      const overlappingEvents =
        busyPeriods.filter(event =>
          event.start_at.getTime() <
            slotEnd.getTime() &&
          event.end_at.getTime() >
            slotStart.getTime()
        );

      /*
       * スタッフ指定時:
       * 共有カレンダーに予定が1件でもあれば
       * 指定スタッフの予定か判別できないため、
       * 現段階ではその枠を使用不可とする。
       *
       * スタッフ指定なし:
       * 勤務スタッフ数－予定数で残容量を算出。
       */
      const availableCapacity =
        requestedStaffCode
          ? (
              overlappingEvents.length === 0
                ? workingStaff.length
                : 0
            )
          : Math.max(
              0,
              workingStaff.length -
              overlappingEvents.length
            );

      if (availableCapacity > 0) {

        slots.push({
          date:
            targetDate,
          start_time:
            Utilities.formatDate(
              slotStart,
              APP_CONFIG.TIMEZONE,
              "HH:mm"
            ),
          end_time:
            Utilities.formatDate(
              slotEnd,
              APP_CONFIG.TIMEZONE,
              "HH:mm"
            ),
          start_at:
            formatDateTime_(
              slotStart
            ),
          end_at:
            formatDateTime_(
              slotEnd
            ),
          capacity:
            availableCapacity,
          working_staff_count:
            workingStaff.length,
          busy_event_count:
            overlappingEvents.length,
          staff_candidates:
            workingStaff.map(staff => ({
              staff_code:
                staff.staff_code,
              staff_name:
                staff.staff_name,
              role:
                staff.role
            }))
        });
      }
    }

    cursor = new Date(
      cursor.getTime() +
      intervalMinutes * 60000
    );
  }

  return slots;
}


/**
 * yyyy-MM-ddとHH:mmからDate生成
 *
 * @param {string} dateText
 * @param {string} timeText
 * @returns {Date}
 */
function createAvailabilityDateTime_(
  dateText,
  timeText
) {

  const dateParts =
    String(dateText)
      .split("-")
      .map(Number);

  const timeParts =
    String(timeText)
      .split(":")
      .map(Number);

  const date = new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0],
    timeParts[1],
    0,
    0
  );

  if (isNaN(date.getTime())) {
    throw new Error(
      `日時を変換できません: ${dateText} ${timeText}`
    );
  }

  return date;
}


/**
 * 指定分単位に切り上げ
 *
 * @param {Date} value
 * @param {number} intervalMinutes
 * @returns {Date}
 */
function roundUpAvailabilityTime_(
  value,
  intervalMinutes
) {

  const intervalMs =
    intervalMinutes * 60000;

  return new Date(
    Math.ceil(
      value.getTime() /
      intervalMs
    ) * intervalMs
  );
}


/**
 * シフト日付をyyyy-MM-ddへ変換
 *
 * @param {*} value
 * @returns {string}
 */
function formatAvailabilityDate_(
  value
) {

  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  const text = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(text)
  ) {
    return text;
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return text;
  }

  return Utilities.formatDate(
    date,
    APP_CONFIG.TIMEZONE,
    "yyyy-MM-dd"
  );
}


/**
 * シフト時刻をHH:mmへ変換
 *
 * @param {*} value
 * @returns {string}
 */
function formatAvailabilityTime_(
  value
) {

  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "HH:mm"
    );
  }

  const text = String(value).trim();

  if (
    /^\d{1,2}:\d{2}$/.test(text)
  ) {
    const parts = text.split(":");

    return (
      String(Number(parts[0]))
        .padStart(2, "0") +
      ":" +
      String(Number(parts[1]))
        .padStart(2, "0")
    );
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(
    date,
    APP_CONFIG.TIMEZONE,
    "HH:mm"
  );
}

/**
 * サービス設定値を0以上の数値として取得
 *
 * @param {*} value
 * @param {number} defaultValue
 * @returns {number}
 */
function getAvailabilityRuleNumber_(
  value,
  defaultValue
) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return defaultValue;
  }

  const numberValue =
    Number(value);

  if (
    !Number.isFinite(numberValue) ||
    numberValue < 0
  ) {
    throw new Error(
      `サービス設定値が不正です: ${value}`
    );
  }

  return numberValue;
}


/**
 * 公開期間内の日付か確認
 *
 * 今日からpublic_days日先までを許可する。
 *
 * @param {string} targetDate
 * @param {number} publicDays
 * @returns {Object}
 */
function validateAvailabilityPublicRange_(
  targetDate,
  publicDays
) {

  const todayText =
    Utilities.formatDate(
      new Date(),
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );

  const minDate =
    parseDateStart_(
      todayText
    );

  const maxDate =
    new Date(
      minDate.getTime()
    );

  maxDate.setDate(
    maxDate.getDate() +
    publicDays
  );

  const target =
    parseDateStart_(
      targetDate
    );

  const minText =
    Utilities.formatDate(
      minDate,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );

  const maxText =
    Utilities.formatDate(
      maxDate,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );

  if (
    target.getTime() <
    minDate.getTime()
  ) {
    return {
      ok:
        false,
      message:
        "過去の日付は予約できません。",
      minDate:
        minText,
      maxDate:
        maxText
    };
  }

  if (
    target.getTime() >
    maxDate.getTime()
  ) {
    return {
      ok:
        false,
      message:
        "予約公開期間外の日付です。",
      minDate:
        minText,
      maxDate:
        maxText
    };
  }

  return {
    ok:
      true,
    message:
      "",
    minDate:
      minText,
    maxDate:
      maxText
  };
}

/**
 * service_hours積集合テスト
 *
 * 実際のstaff_shiftsは使用しない。
 * 仮想シフト10:00～20:00とservice_hoursの積集合を確認する。
 * 予約・カレンダー予定・シートデータは変更しない。
 */
function testAvailabilityServiceRules() {

  const serviceCode =
    "UNSUBSCRIBE";

  const targetDate =
    "2026-08-03";

  const service =
    getAvailabilityService_(
      serviceCode
    );

  const serviceHours =
    getAvailabilityServiceHours_(
      service,
      targetDate
    );

  if (serviceHours.length === 0) {
    throw new Error(
      "service_hoursに対象サービスの受付時間がありません: " +
      serviceCode
    );
  }

  const virtualShifts = [
    {
      shift_id:
        "TEST_SHIFT_KAWAKAMI",

      staff_code:
        "KAWAKAMI",

      staff_name:
        "川上",

      role:
        "STAFF",

      start_time:
        "10:00",

      end_time:
        "20:00",

      start_at:
        createAvailabilityDateTime_(
          targetDate,
          "10:00"
        ),

      end_at:
        createAvailabilityDateTime_(
          targetDate,
          "20:00"
        )
    }
  ];

  const effectiveShifts =
    intersectAvailabilityShiftsWithServiceHours_(
      virtualShifts,
      serviceHours
    );

  const result = {
    service_code:
      serviceCode,

    date:
      targetDate,

    permission_column:
      getAvailabilityPermissionColumn_(
        service
      ),

    service_hours:
      serviceHours.map(function(period) {
        return {
          start_time:
            period.start_time,

          end_time:
            period.end_time
        };
      }),

    virtual_shift: {
      staff_code:
        "KAWAKAMI",

      start_time:
        "10:00",

      end_time:
        "20:00"
    },

    effective_shifts:
      effectiveShifts.map(function(shift) {
        return {
          staff_code:
            shift.staff_code,

          start_time:
            shift.start_time,

          end_time:
            shift.end_time
        };
      })
  };

  Logger.log(
    JSON.stringify(
      result
    )
  );

  if (effectiveShifts.length === 0) {
    throw new Error(
      "service_hoursと仮想シフトの積集合が取得できません。"
    );
  }

  Logger.log(
    "service_hours積集合テスト成功"
  );
}

