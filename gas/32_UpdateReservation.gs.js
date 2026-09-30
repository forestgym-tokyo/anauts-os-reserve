/**
 * 管理画面からの予約変更かどうかを判定する。
 *
 * internal_operation=true の場合だけログイン認証を必須にし、
 * STAFF / TRAINER / MANAGER / ADMIN による店内処理として扱う。
 * （TRAINERもauth_users.permission上はSTAFFを想定）
 */
function getReservationUpdateAccess_(params) {
  params = params || {};

  const requested =
    params.internal_operation === true ||
    ["TRUE", "1", "YES", "ON"].includes(
      String(params.internal_operation || "")
        .trim()
        .toUpperCase()
    );

  if (!requested) {
    return {
      internal: false,
      staff_code: "",
      email: "",
      permission: ""
    };
  }

  /*
   * 1) 通常の管理画面API
   * Firebase ID tokenで認証する。
   */
  const idToken =
    normalizeReservationText_(
      params.id_token
    );

  if (idToken) {
    const auth =
      requireAuth_(
        params,
        ["ADMIN", "MANAGER", "STAFF"]
      );

    return {
      internal: true,
      staff_code:
        normalizeReservationText_(
          auth && auth.staff_code
        ),
      email:
        normalizeReservationText_(
          auth && auth.email
        ),
      permission:
        normalizeReservationText_(
          auth && auth.permission
        ).toUpperCase()
    };
  }

  /*
   * 2) 管理者用の署名付き予約管理ページ
   * google.script.run経由ではFirebase ID tokenを持たないため、
   * 既存のADMIN予約管理トークンで検証する。
   */
  const reservationId =
    normalizeReservationText_(
      params.reservation_id
    );

  const adminManageToken =
    normalizeReservationText_(
      params.admin_manage_token
    );

  if (
    reservationId &&
    adminManageToken &&
    verifyAdminReservationManageToken_(
      reservationId,
      adminManageToken
    )
  ) {
    return {
      internal: true,
      staff_code: "",
      email: "",
      permission:
        "ADMIN_MANAGE_TOKEN"
    };
  }

  throw new Error(
    "管理画面からの予約変更認証を確認できません。"
  );
}


/**
 * 予約変更API
 *
 * 変更対象:
 * - date
 * - start_time
 * - staff_code
 * - note
 */
function updateReservation(params, operationOptions) {
  const lock = LockService.getScriptLock();
  let calendarEvent = null;
  let eventRollbackData = null;
  let reservationInfo = null;
  let sheetRollbackValues = null;
  let sheetUpdated = false;
  let eventUpdated = false;

  try {
    lock.waitLock(30000);
    params = params || {};
    operationOptions = operationOptions || {};

    const staffReassignmentOnly =
      operationOptions.staff_reassignment_only === true;

    const suppressCustomerMail =
      operationOptions.suppress_customer_mail === true;

    const updateAccess = getReservationUpdateAccess_(params);

    const reservationId = normalizeReservationText_(params.reservation_id);
    if (!reservationId) {
      return errorResponse("reservation_idを指定してください。", "VALIDATION_ERROR");
    }

    reservationInfo = findReservationRowById_(reservationId);
    if (!reservationInfo) {
      return errorResponse("指定された予約が見つかりません。", "RESERVATION_NOT_FOUND", {
        reservation_id: reservationId
      });
    }

    const reservation = reservationInfo.record;
    const currentStatus = normalizeReservationText_(reservation.status);

    if (currentStatus !== "RESERVED" && currentStatus !== "CONFIRMED") {
      return errorResponse("この予約は変更できる状態ではありません。", "INVALID_RESERVATION_STATUS", {
        reservation_id: reservationId,
        status: currentStatus
      });
    }

    const oldDate = normalizeReservationDateValue_(reservation.reservation_date);
    const oldStartTime = normalizeReservationSheetTime_(reservation.start_time);
    const oldEndTime = normalizeReservationSheetTime_(reservation.end_time);
    const oldStaffCode = normalizeReservationText_(reservation.staff_code);
    const oldStaffName = normalizeReservationText_(reservation.staff_name);
    const oldNote = normalizeReservationText_(reservation.note);

    const hasDate = Object.prototype.hasOwnProperty.call(params, "date");
    const hasStartTime = Object.prototype.hasOwnProperty.call(params, "start_time");
    const hasStaffCode = Object.prototype.hasOwnProperty.call(params, "staff_code");
    const hasNote = Object.prototype.hasOwnProperty.call(params, "note");

    const targetDate = hasDate ? normalizeReservationText_(params.date) : oldDate;
    const startTime = hasStartTime ? normalizeReservationTime_(params.start_time) : oldStartTime;
    const requestedStaffCode = hasStaffCode ? normalizeReservationText_(params.staff_code) : oldStaffCode;
    const note = hasNote ? normalizeReservationText_(params.note) : oldNote;

    if (
      staffReassignmentOnly &&
      (
        !hasStaffCode ||
        hasDate ||
        hasStartTime ||
        hasNote
      )
    ) {
      return errorResponse(
        "担当者再割り当てではstaff_code以外を変更できません。",
        "INVALID_REASSIGNMENT_PAYLOAD"
      );
    }

    if (
      staffReassignmentOnly &&
      requestedStaffCode === oldStaffCode
    ) {
      return successResponse(
        {
          reservation_id: reservationId,
          staff_code: oldStaffCode,
          staff_name: oldStaffName,
          changed: false,
          internal_operation: true,
          customer_notification_suppressed: true
        },
        "担当者は変更済みです。"
      );
    }

    validateUpdateReservationParams_({ targetDate: targetDate, startTime: startTime });

    const serviceCode = normalizeReservationText_(reservation.service_code);
    const service = getAvailabilityService_(serviceCode);

    /*
     * サービスに設定された担当可能roleを取得
     *
     * 例:
     * TRAINER
     * STAFF
     * TRAINER,STAFF
     */
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

    const bookingMinHours =
      getReservationRuleNumber_(
        service.booking_min_hours,
        0
      );

    const changeLimitHours =
      getReservationRuleNumber_(
        service.change_limit_hours,
        0
      );

    const publicDays =
      getReservationRuleNumber_(
        service.public_days,
        30
      );

    const durationMinutes = getUpdateReservationDuration_(reservation, service);

    const startAt = createAvailabilityDateTime_(targetDate, startTime);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60000);

    /*
     * 現在の予約に対する変更期限チェック
     */
    const oldStartAt =
      createAvailabilityDateTime_(
        oldDate,
        oldStartTime
      );

    const changeDeadline =
      new Date(
        oldStartAt.getTime() -
        changeLimitHours * 60 * 60 * 1000
      );

    if (
      !updateAccess.internal &&
      new Date().getTime() >
      changeDeadline.getTime()
    ) {
      return errorResponse(
        "この予約は変更受付期限を過ぎています。店舗へご連絡ください。",
        "CHANGE_DEADLINE_PASSED",
        {
          reservation_id:
            reservationId,
          reservation_start_at:
            formatDateTime_(
              oldStartAt
            ),
          change_limit_hours:
            changeLimitHours,
          change_deadline:
            formatDateTime_(
              changeDeadline
            )
        }
      );
    }

    /*
     * 変更先の公開期間チェック
     */
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

    /*
     * 変更先も最短予約可能時間を満たす必要がある
     */
    const bookingOpenAt =
      new Date(
        new Date().getTime() +
        bookingMinHours * 60 * 60 * 1000
      );

    if (
      !updateAccess.internal &&
      startAt.getTime() <
      bookingOpenAt.getTime()
    ) {
      return errorResponse(
        "変更先の時間は予約受付期限を過ぎています。",
        "BOOKING_DEADLINE_PASSED",
        {
          date:
            targetDate,
          start_time:
            startTime,
          booking_min_hours:
            bookingMinHours,
          booking_open_at:
            formatDateTime_(
              bookingOpenAt
            )
        }
      );
    }

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
      staffReassignmentOnly &&
      requestedStaffCode &&
      !isStaffServiceCapabilityEnabled_(
        allActiveStaffMap.get(requestedStaffCode),
        serviceCode
      )
    ) {
      return errorResponse(
        "指定された担当者は、このサービスを担当できません。",
        "STAFF_SERVICE_NOT_ALLOWED",
        {
          staff_code: requestedStaffCode,
          service_code: serviceCode
        }
      );
    }

    /*
     * サービスのprovider_roleに一致する
     * 有効スタッフだけを変更候補にする。
     */
    const staffMap =
      getActiveStaffMap_(
        providerRoles
      );

    let shifts = getAvailabilityShifts_(targetDate, staffMap);
    if (requestedStaffCode) {
      shifts = shifts.filter(function(shift) {
        return shift.staff_code === requestedStaffCode;
      });
    }

    const workingStaff = shifts.filter(function(shift) {
      return shift.start_at.getTime() <= startAt.getTime() &&
        shift.end_at.getTime() >= endAt.getTime();
    });

    if (workingStaff.length === 0) {
      return errorResponse("指定された時間に対応可能なスタッフがいません。", "NO_WORKING_STAFF", {
        date: targetDate,
        start_time: startTime,
        end_time: formatReservationTime_(endAt),
        staff_code: requestedStaffCode || null
      });
    }

    const calendarCode = normalizeReservationText_(reservation.calendar_code || service.calendar_code);
    const calendarId = normalizeReservationText_(reservation.calendar_id);
    const calendar = getUpdateReservationCalendar_({ calendarCode: calendarCode, calendarId: calendarId });

    if (!calendar) {
      return errorResponse("予約先のGoogleカレンダーに接続できません。", "CALENDAR_NOT_FOUND", {
        reservation_id: reservationId,
        calendar_code: calendarCode,
        calendar_id: calendarId
      });
    }

    const googleEventId = normalizeReservationText_(reservation.google_event_id);
    if (!googleEventId) {
      return errorResponse("予約にGoogleカレンダー予定IDが保存されていません。", "GOOGLE_EVENT_ID_NOT_SET", {
        reservation_id: reservationId
      });
    }

    calendarEvent = calendar.getEventById(googleEventId);
    if (!calendarEvent) {
      return errorResponse("変更対象のGoogleカレンダー予定が見つかりません。", "CALENDAR_EVENT_NOT_FOUND", {
        reservation_id: reservationId,
        google_event_id: googleEventId
      });
    }

    const busyPeriods = getAvailabilityCalendarEvents_(calendar, targetDate);
    const overlappingEvents = busyPeriods.filter(function(event) {
      return !isSameGoogleEventId_(event.event_id, googleEventId) &&
        event.start_at.getTime() < endAt.getTime() &&
        event.end_at.getTime() > startAt.getTime();
    });

    const availableCapacity = requestedStaffCode
      ? (overlappingEvents.length === 0 ? 1 : 0)
      : Math.max(0, workingStaff.length - overlappingEvents.length);

    if (availableCapacity <= 0) {
      return errorResponse("変更先の予約枠はすでに埋まっています。", "SLOT_NOT_AVAILABLE", {
        date: targetDate,
        start_time: startTime,
        end_time: formatReservationTime_(endAt),
        working_staff_count: workingStaff.length,
        busy_event_count: overlappingEvents.length
      });
    }

    const assignedStaff = selectReservationStaff_({
      requestedStaffCode: requestedStaffCode,
      workingStaff: workingStaff,
      overlappingEvents: overlappingEvents
    });

    if (!assignedStaff) {
      return errorResponse("担当スタッフを割り当てられませんでした。", "STAFF_ASSIGNMENT_FAILED");
    }

    const serviceName = normalizeReservationText_(
      reservation.service_name || service.service_name || service.name
    );
    const staffName = normalizeReservationText_(assignedStaff.staff_name);
    const customerName = normalizeReservationText_(reservation.customer_name);

    const eventTitle = buildReservationEventTitle_({
      customerName: customerName,
      serviceName: serviceName,
      staffName: staffName
    });

    const eventDescription = buildReservationEventDescription_({
      reservationId: reservationId,
      serviceCode: serviceCode,
      serviceName: serviceName,
      staffCode: assignedStaff.staff_code,
      staffName: staffName,
      providerRoles: providerRoles,
      staffRole:
        normalizeProviderRole_(
          assignedStaff.role
        ),
      memberNo: normalizeReservationText_(reservation.member_no),
      customerName: customerName,
      customerEmail: normalizeReservationText_(reservation.customer_email),
      customerPhone: normalizeReservationText_(reservation.customer_phone),
      note: note
    });

    eventRollbackData = {
      title: calendarEvent.getTitle(),
      description: calendarEvent.getDescription(),
      startAt: calendarEvent.getStartTime(),
      endAt: calendarEvent.getEndTime()
    };

    sheetRollbackValues = reservationInfo.sheet
      .getRange(reservationInfo.rowNumber, 1, 1, reservationInfo.headers.length)
      .getValues()[0];

    calendarEvent.setTitle(eventTitle);
    calendarEvent.setDescription(eventDescription);
    calendarEvent.setTime(startAt, endAt);
    eventUpdated = true;

    const now = new Date();

    updateReservationRowObject_({
      sheet: reservationInfo.sheet,
      rowNumber: reservationInfo.rowNumber,
      headers: reservationInfo.headers,
      values: {
        staff_code: assignedStaff.staff_code,
        staff_name: staffName,
        provider_role:
          providerRoles.join(","),
        staff_role:
          normalizeProviderRole_(
            assignedStaff.role
          ),
        reservation_date: targetDate,
        start_time: startTime,
        end_time: formatReservationTime_(endAt),
        start_at: formatDateTime_(startAt),
        end_at: formatDateTime_(endAt),
        duration: durationMinutes,
        booking_min_hours:
          bookingMinHours,
        change_limit_hours:
          changeLimitHours,
        public_days:
          publicDays,
        note: note,
        updated_at: now
      }
    });
    sheetUpdated = true;

    appendReservationHistory_({
      history_id: generateReservationHistoryId_(),
      reservation_id: reservationId,
      action: "UPDATE",
      old_status: currentStatus,
      new_status: currentStatus,
      staff_code: assignedStaff.staff_code,
      service_code: serviceCode,
      reservation_date: targetDate,
      start_time: startTime,
      detail: JSON.stringify({
        source:
          normalizeReservationText_(
            operationOptions.history_source
          ) ||
          (
            updateAccess.internal
              ? "ADMIN_APP"
              : "WEB_API"
          ),
        customer_notification_suppressed:
          suppressCustomerMail,
        operated_by_staff_code:
          updateAccess.staff_code || "",
        operated_by_email:
          updateAccess.email || "",
        google_event_id: googleEventId,
        before: {
          date: oldDate,
          start_time: oldStartTime,
          end_time: oldEndTime,
          staff_code: oldStaffCode,
          staff_name: oldStaffName,
          staff_role:
            normalizeProviderRole_(
              reservation.staff_role
            ),
          note: oldNote
        },
        after: {
          date: targetDate,
          start_time: startTime,
          staff_code: assignedStaff.staff_code,
          staff_name: staffName,
          staff_role:
            normalizeProviderRole_(
              assignedStaff.role
            ),
          provider_roles:
            providerRoles,
          booking_min_hours:
            bookingMinHours,
          change_limit_hours:
            changeLimitHours,
          public_days:
            publicDays,
          note: note
        }
      }),
      created_at: now
    });

    const result = {
      reservation_id: reservationId,
      status: currentStatus,
      service_code: serviceCode,
      service_name: serviceName,
      old_date: oldDate,
      old_start_time: oldStartTime,
      old_end_time: oldEndTime,
      date: targetDate,
      start_time: startTime,
      end_time: formatReservationTime_(endAt),
      start_at: formatDateTime_(startAt),
      end_at: formatDateTime_(endAt),
      duration_minutes: durationMinutes,
      booking_min_hours:
        bookingMinHours,
      change_limit_hours:
        changeLimitHours,
      public_days:
        publicDays,
      change_deadline:
        formatDateTime_(
          changeDeadline
        ),
      provider_roles: providerRoles,
      old_staff_code: oldStaffCode || null,
      staff_code: assignedStaff.staff_code,
      staff_name: staffName,
      staff_role:
        normalizeProviderRole_(
          assignedStaff.role
        ),
      note: note,
      google_event_id: googleEventId,
      calendar_code: calendarCode,
      calendar_id: calendar.getId(),
      internal_operation:
        updateAccess.internal,
      changed: true,
      customer_notification_suppressed:
        suppressCustomerMail,
      operated_by_staff_code:
        updateAccess.staff_code || null
    };

    logInfo("updateReservation", "予約変更成功", result);

    /*
     * 予約変更メール
     *
     * 予約変更自体が正常完了した後に送信する。
     * メール送信失敗だけで予約変更をロールバックしない。
     */
    const updateMailRecord =
      Object.assign(
        {},
        reservation,
        {
          reservation_id:
            reservationId,

          status:
            currentStatus,

          service_code:
            serviceCode,

          service_name:
            serviceName,

          reservation_date:
            targetDate,

          date:
            targetDate,

          start_time:
            startTime,

          end_time:
            formatReservationTime_(
              endAt
            ),

          staff_code:
            assignedStaff.staff_code,

          staff_name:
            staffName,

          note:
            note,

          old_date:
            oldDate,

          old_start_time:
            oldStartTime,

          old_end_time:
            oldEndTime,

          google_event_id:
            googleEventId,

          calendar_code:
            calendarCode,

          calendar_id:
            calendar.getId()
        }
      );

    if (
      shouldSendUpdateReservationMail_(
        operationOptions
      )
    ) {
      sendUpdateReservationMailSafely_(
        updateMailRecord
      );
    } else {
      logInfo(
        "updateReservationMail",
        "担当者の内部再割り当てのため、お客様・管理者への変更メールを送信しませんでした。",
        {
          reservation_id: reservationId,
          old_staff_code: oldStaffCode,
          staff_code: assignedStaff.staff_code,
          source: "AUTO_STAFF_REASSIGNMENT"
        }
      );
    }

    return successResponse(result, "予約を変更しました。");

  } catch (error) {
    if (sheetUpdated && reservationInfo && sheetRollbackValues) {
      try {
        reservationInfo.sheet
          .getRange(reservationInfo.rowNumber, 1, 1, sheetRollbackValues.length)
          .setValues([sheetRollbackValues]);
      } catch (rollbackError) {
        logError("updateReservationSheetRollback", rollbackError.message, { stack: rollbackError.stack });
      }
    }

    if (eventUpdated && calendarEvent && eventRollbackData) {
      try {
        calendarEvent.setTitle(eventRollbackData.title);
        calendarEvent.setDescription(eventRollbackData.description);
        calendarEvent.setTime(eventRollbackData.startAt, eventRollbackData.endAt);
      } catch (rollbackError) {
        logError("updateReservationCalendarRollback", rollbackError.message, { stack: rollbackError.stack });
      }
    }

    logError("updateReservation", error.message, { stack: error.stack });
    return errorResponse("予約変更中にエラーが発生しました。", "SYSTEM_ERROR", {
      message: error.message
    });

  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // ロック未取得時は何もしない
    }
  }
}


/**
 * 担当者なし予約等に対する「予約変更・キャンセル」依頼メール送信。
 *
 * 管理画面からのみ使用する。
 * お客様には既存の署名付き予約管理URLを送る。
 */
function sendReservationRescheduleRequest(params) {
  try {
    params = params || {};

    const auth =
      requireAuth_(
        params,
        ["ADMIN", "MANAGER", "STAFF"]
      );

    const reservationId =
      normalizeReservationText_(
        params.reservation_id
      );

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    const info =
      findReservationRowById_(
        reservationId
      );

    if (!info) {
      return errorResponse(
        "指定された予約が見つかりません。",
        "RESERVATION_NOT_FOUND",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const reservation =
      info.record || {};

    const status =
      normalizeReservationText_(
        reservation.status
      ).toUpperCase();

    if (
      status !== "RESERVED" &&
      status !== "CONFIRMED"
    ) {
      return errorResponse(
        "この予約はリスケ依頼できる状態ではありません。",
        "INVALID_RESERVATION_STATUS",
        {
          reservation_id:
            reservationId,
          status:
            status
        }
      );
    }

    const customerEmail =
      normalizeReservationText_(
        reservation.customer_email ||
        reservation.email
      );

    if (!customerEmail) {
      return errorResponse(
        "お客様のメールアドレスが登録されていません。",
        "CUSTOMER_EMAIL_NOT_SET",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const manageUrl =
      buildReservationManageUrl_(
        reservationId
      );

    if (!manageUrl) {
      return errorResponse(
        "予約変更・キャンセルURLを生成できませんでした。",
        "RESERVATION_MANAGE_URL_NOT_AVAILABLE"
      );
    }

    const customerName =
      normalizeReservationText_(
        reservation.customer_name
      );

    const serviceName =
      normalizeReservationText_(
        reservation.service_name ||
        reservation.service_code
      );

    const date =
      normalizeReservationDateValue_(
        reservation.reservation_date ||
        reservation.date
      );

    const startTime =
      normalizeReservationSheetTime_(
        reservation.start_time
      );

    const endTime =
      normalizeReservationSheetTime_(
        reservation.end_time
      );

    const greeting =
      customerName
        ? customerName + "様"
        : "お客様";

    const subject =
      "ご予約変更・キャンセルのお願い｜The Forest Gym";

    const body =
      greeting + "\n\n" +
      "いつもThe Forest Gymをご利用いただき、誠にありがとうございます。\n\n" +
      "現在ご予約いただいております下記のご予約につきまして、" +
      "担当予定者の都合により、現在の日時でのご案内が難しくなりました。\n\n" +
      "【現在のご予約】\n" +
      date + " " +
      startTime + "〜" +
      endTime + "\n" +
      serviceName + "\n\n" +
      "大変お手数をおかけいたしますが、下記の「予約変更・キャンセル」より、" +
      "ご都合の良い日時への変更、またはキャンセルのお手続きをお願いいたします。\n\n" +
      manageUrl + "\n\n" +
      "ご迷惑をおかけし、申し訳ございません。\n" +
      "何卒ご理解、ご協力のほどよろしくお願いいたします。\n\n" +
      "The Forest Gym";

    const htmlBody =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.8;color:#222">' +
      '<p>' + escapeReservationMailHtml_(greeting) + '</p>' +
      '<p>いつもThe Forest Gymをご利用いただき、誠にありがとうございます。</p>' +
      '<p>現在ご予約いただいております下記のご予約につきまして、' +
      '<strong>担当予定者の都合により、現在の日時でのご案内が難しくなりました。</strong></p>' +
      '<div style="margin:18px 0;padding:16px;border:1px solid #ddd;border-radius:12px">' +
      '<strong>【現在のご予約】</strong><br>' +
      escapeReservationMailHtml_(date + " " + startTime + "〜" + endTime) + '<br>' +
      escapeReservationMailHtml_(serviceName) +
      '</div>' +
      '<p>大変お手数をおかけいたしますが、下記の「予約変更・キャンセル」より、' +
      'ご都合の良い日時への変更、またはキャンセルのお手続きをお願いいたします。</p>' +
      '<p><a href="' + escapeReservationMailHtml_(manageUrl) + '"' +
      ' style="display:inline-block;padding:13px 22px;background:#1f7a4d;color:#fff;' +
      'text-decoration:none;border-radius:10px;font-weight:700">予約変更・キャンセル</a></p>' +
      '<p>ご迷惑をおかけし、申し訳ございません。<br>' +
      '何卒ご理解、ご協力のほどよろしくお願いいたします。</p>' +
      '<p>The Forest Gym</p>' +
      '</div>';

    MailApp.sendEmail({
      to:
        customerEmail,
      subject:
        subject,
      name:
        "The Forest Gym",
      body:
        body,
      htmlBody:
        htmlBody
    });

    const now =
      new Date();

    appendReservationHistory_({
      history_id:
        generateReservationHistoryId_(),
      reservation_id:
        reservationId,
      action:
        "RESCHEDULE_REQUESTED",
      old_status:
        status,
      new_status:
        status,
      staff_code:
        normalizeReservationText_(
          reservation.staff_code
        ),
      service_code:
        normalizeReservationText_(
          reservation.service_code
        ),
      reservation_date:
        date,
      start_time:
        startTime,
      detail:
        JSON.stringify({
          source:
            "ADMIN_APP",
          requested_by_staff_code:
            normalizeReservationText_(
              auth && auth.staff_code
            ),
          requested_by_email:
            normalizeReservationText_(
              auth && auth.email
            ),
          customer_email:
            customerEmail,
          reservation_manage_url:
            manageUrl
        }),
      created_at:
        now
    });

    logInfo(
      "sendReservationRescheduleRequest",
      "予約変更・キャンセル依頼メール送信",
      {
        reservation_id:
          reservationId,
        customer_email:
          customerEmail,
        requested_by_staff_code:
          normalizeReservationText_(
            auth && auth.staff_code
          )
      }
    );

    return successResponse(
      {
        reservation_id:
          reservationId,
        customer_email:
          customerEmail,
        requested_at:
          formatDateTime_(
            now
          ),
        requested_by_staff_code:
          normalizeReservationText_(
            auth && auth.staff_code
          )
      },
      "予約変更・キャンセルのお願いを送信しました。"
    );

  } catch (error) {
    logError(
      "sendReservationRescheduleRequest",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      error.message ||
        "予約変更・キャンセル依頼メールの送信に失敗しました。",
      "SYSTEM_ERROR"
    );
  }
}


/**
 * HTMLメール用エスケープ
 */
function escapeReservationMailHtml_(value) {
  return String(
    value == null
      ? ""
      : value
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/**
 * 予約変更メール安全送信
 *
 * メール障害で予約変更処理自体を失敗扱いにしない。
 *
 * @param {Object} reservation
 * @returns {Object|null}
 */
function sendUpdateReservationMailSafely_(
  reservation
) {

  try {

    return sendReservationMail_(
      reservation,
      "RESERVATION_UPDATED"
    );

  } catch (error) {

    logError(
      "updateReservationMail",
      "予約変更は完了しましたが、変更通知メールの送信に失敗しました。",
      {
        reservation_id:
          normalizeReservationText_(
            reservation &&
            reservation.reservation_id
          ),

        event_type:
          "RESERVATION_UPDATED",

        message:
          error.message,

        stack:
          error.stack
      }
    );

    return null;
  }
}


function validateUpdateReservationParams_(values) {
  if (!values.targetDate) {
    throw new Error("dateを指定してください。");
  }
  parseDateStart_(values.targetDate);

  if (!values.startTime) {
    throw new Error("start_timeを指定してください。");
  }
  normalizeReservationTime_(values.startTime);
}


function getUpdateReservationDuration_(reservation, service) {
  const candidates = [reservation.duration, reservation.duration_minutes, service.duration];

  for (let i = 0; i < candidates.length; i++) {
    const value = Number(candidates[i]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  throw new Error("予約の所要時間を取得できません。");
}


function getUpdateReservationCalendar_(values) {
  const calendarId = normalizeReservationText_(values.calendarId);

  if (calendarId) {
    const calendar = getGoogleCalendarById_(calendarId);
    if (calendar) {
      return calendar;
    }
  }

  const calendarCode = normalizeReservationText_(values.calendarCode);
  if (!calendarCode) {
    return null;
  }

  const calendarMaster = getCalendarMasterByCode_(calendarCode);
  return getGoogleCalendarById_(calendarMaster.calendar_id);
}


function isSameGoogleEventId_(left, right) {
  function normalize(value) {
    return normalizeReservationText_(value).replace(/@google\.com$/i, "");
  }
  return normalize(left) === normalize(right);
}


function updateReservationRowObject_(options) {
  const sheet = options.sheet;
  const rowNumber = options.rowNumber;
  const headers = options.headers || [];
  const values = options.values || {};

  if (!sheet) {
    throw new Error("更新対象シートがありません。");
  }
  if (!rowNumber || rowNumber < 2) {
    throw new Error("更新対象行が正しくありません。");
  }

  const requiredHeaders = [
    "staff_code",
    "staff_name",
    "reservation_date",
    "start_time",
    "end_time",
    "start_at",
    "end_at"
  ];

  const missingRequired = requiredHeaders.filter(function(header) {
    return !headers.includes(header);
  });

  if (missingRequired.length > 0) {
    throw new Error(
      "reservationsシートに必要な列がありません: " + missingRequired.join(", ")
    );
  }

  const currentValues = sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .getValues()[0];

  const updatedValues = headers.map(function(header, index) {
    return Object.prototype.hasOwnProperty.call(values, header)
      ? values[header]
      : currentValues[index];
  });

  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([updatedValues]);
}


/**
 * 変更期限判定テスト
 *
 * 1時間後の予約に対してchange_limit_hours=3なら
 * 変更不可になることを確認する。
 *
 * カレンダーやシートは変更しない。
 */
function testUpdateReservationChangeDeadline() {

  const now =
    new Date();

  const reservationStartAt =
    new Date(
      now.getTime() +
      60 * 60 * 1000
    );

  const changeLimitHours =
    3;

  const changeDeadline =
    new Date(
      reservationStartAt.getTime() -
      changeLimitHours * 60 * 60 * 1000
    );

  const deadlinePassed =
    now.getTime() >
    changeDeadline.getTime();

  Logger.log(
    JSON.stringify({
      now:
        formatDateTime_(
          now
        ),
      reservation_start_at:
        formatDateTime_(
          reservationStartAt
        ),
      change_limit_hours:
        changeLimitHours,
      change_deadline:
        formatDateTime_(
          changeDeadline
        ),
      deadline_passed:
        deadlinePassed
    })
  );

  if (!deadlinePassed) {
    throw new Error(
      "変更期限判定が正しくありません。"
    );
  }

  Logger.log(
    "変更期限判定テスト成功"
  );
}


/**
 * 予約変更role対応結合テスト
 *
 * 処理:
 * 1. PT60の空き枠を取得
 * 2. 最初の空き枠でTRAINER予約を作成
 * 3. 同じ日時のままnoteを変更
 * 4. 自分自身のGoogleカレンダー予定を重複判定から除外できることを確認
 * 5. TRAINERだけが割り当てられていることを確認
 *
 * 空き枠が1件だけでも実行可能。
 */
function testUpdateReservation() {

  const serviceCode =
    "PT60";

  const targetDate =
    "2026-08-01";

  /*
   * 空き枠取得
   */
  const availabilityResponse =
    getAvailableSlots({
      action:
        "getAvailableSlots",
      service_code:
        serviceCode,
      date:
        targetDate
    });

  const availabilityContent =
    availabilityResponse.getContent();

  const availabilityResult =
    JSON.parse(
      availabilityContent
    );

  Logger.log(
    "1. 空き枠取得結果: " +
    JSON.stringify({
      ok:
        availabilityResult.ok,
      provider_roles:
        availabilityResult.data
          ? availabilityResult.data.provider_roles
          : null,
      available_slot_count:
        availabilityResult.data
          ? availabilityResult.data.available_slot_count
          : 0
    })
  );

  if (
    !availabilityResult.ok ||
    !availabilityResult.data ||
    !Array.isArray(
      availabilityResult.data.slots
    ) ||
    availabilityResult.data.slots.length === 0
  ) {
    throw new Error(
      "予約変更テストに使用できる空き枠がありません: " +
      availabilityContent
    );
  }

  const selectedSlot =
    availabilityResult.data.slots[0];

  /*
   * テスト予約作成
   */
  const createParams = {
    action:
      "createReservation",
    service_code:
      serviceCode,
    date:
      selectedSlot.date,
    start_time:
      selectedSlot.start_time,
    member_no:
      "FRGTEST_UPDATE_ROLE001",
    customer_name:
      "予約変更roleテスト",
    customer_email:
      "test@example.com",
    customer_phone:
      "09012345678",
    note:
      "変更前"
  };

  const createResponse =
    createReservation(
      createParams
    );

  const createContent =
    createResponse.getContent();

  Logger.log(
    "2. 予約登録結果: " +
    createContent
  );

  const createResult =
    JSON.parse(
      createContent
    );

  if (
    !createResult.ok ||
    !createResult.data ||
    !createResult.data.reservation_id
  ) {
    throw new Error(
      "テスト予約を作成できませんでした: " +
      createContent
    );
  }

  if (
    createResult.data.staff_role !==
    "TRAINER"
  ) {
    throw new Error(
      "変更前予約にTRAINER以外が割り当てられています: " +
      createContent
    );
  }

  const reservationId =
    createResult.data.reservation_id;

  /*
   * 同じ日時のままnoteを変更する。
   *
   * updateReservation()が自分自身のGoogleカレンダー予定を
   * 重複予定から除外できなければ、この処理は失敗する。
   */
  const updateParams = {
    action:
      "updateReservation",
    reservation_id:
      reservationId,
    date:
      selectedSlot.date,
    start_time:
      selectedSlot.start_time,
    note:
      "予約変更role対応API動作確認"
  };

  const updateResponse =
    updateReservation(
      updateParams
    );

  const updateContent =
    updateResponse.getContent();

  Logger.log(
    "3. 予約変更結果: " +
    updateContent
  );

  const updateResult =
    JSON.parse(
      updateContent
    );

  if (!updateResult.ok) {
    throw new Error(
      "予約変更に失敗しました: " +
      updateContent
    );
  }

  if (
    !Array.isArray(
      updateResult.data.provider_roles
    ) ||
    !updateResult.data.provider_roles.includes(
      "TRAINER"
    )
  ) {
    throw new Error(
      "provider_rolesが正しくありません: " +
      updateContent
    );
  }

  if (
    updateResult.data.staff_role !==
    "TRAINER"
  ) {
    throw new Error(
      "変更後予約にTRAINER以外が割り当てられています: " +
      updateContent
    );
  }

  /*
   * 変更後取得
   */
  const getResponse =
    getReservation({
      reservation_id:
        reservationId
    });

  const getContent =
    getResponse.getContent();

  Logger.log(
    "4. 変更後予約取得結果: " +
    getContent
  );

  const getResult =
    JSON.parse(
      getContent
    );

  if (
    !getResult.ok ||
    !getResult.data
  ) {
    throw new Error(
      "変更後予約の取得に失敗しました: " +
      getContent
    );
  }

  const data =
    getResult.data;

  if (
    data.date !==
      updateParams.date ||
    data.start_time !==
      updateParams.start_time ||
    data.note !==
      updateParams.note
  ) {
    throw new Error(
      "変更後の予約内容が想定と一致しません: " +
      getContent
    );
  }

  Logger.log(
    "予約変更role対応結合テスト成功: " +
    reservationId
  );
}
