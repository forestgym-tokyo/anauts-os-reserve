/**
 * 予約登録API
 *
 * POST JSON例:
 * {
 *   "action": "createReservation",
 *   "service_code": "PT60",
 *   "date": "2026-08-01",
 *   "start_time": "14:00",
 *   "staff_code": "YAMADA",
 *   "member_no": "FRG000001",
 *   "customer_name": "山田太郎",
 *   "customer_email": "example@gmail.com",
 *   "customer_phone": "09012345678",
 *   "note": ""
 * }
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function createReservation(params) {

  const lock =
    LockService.getScriptLock();

  let createdEvent = null;

  try {

    lock.waitLock(30000);

    params = params || {};

    const serviceCode =
      normalizeReservationText_(
        params.service_code
      );

    const targetDate =
      normalizeReservationText_(
        params.date
      );

    const startTime =
      normalizeReservationTime_(
        params.start_time
      );

    const requestedStaffCode =
      normalizeReservationText_(
        params.staff_code
      );

    const memberNo =
      normalizeReservationText_(
        params.member_no
      );

    let customerName =
      normalizeReservationText_(
        params.customer_name
      );

    let customerEmail =
      normalizeReservationText_(
        params.customer_email
      );

    const customerPhone =
      normalizeReservationText_(
        params.customer_phone
      );

    const postalCode =
      normalizeReservationText_(
        params.postal_code
      );

    const address =
      normalizeReservationText_(
        params.address
      );

    const requestedCustomerType =
      normalizeReservationCustomerType_(
        params.customer_type
      );

    const note =
      normalizeReservationText_(
        params.note
      );

    validateCreateReservationParams_({
      serviceCode:
        serviceCode,
      targetDate:
        targetDate,
      startTime:
        startTime
    });

    /*
     * サービス取得
     */
    const service =
      getAvailabilityService_(
        serviceCode
      );

    /*
     * サービス別フォーム条件
     *
     * MEMBER
     * VISITOR
     * BOTH
     */
    const formType =
      normalizeReservationFormType_(
        service.form_type
      );

    if (!formType) {
      return errorResponse(
        "サービスにform_typeが設定されていません。",
        "FORM_TYPE_NOT_SET",
        {
          service_code:
            serviceCode
        }
      );
    }

    const customerValidation =
      validateReservationCustomer_({
        formType:
          formType,
        requestedCustomerType:
          requestedCustomerType,
        memberNo:
          memberNo,
        customerName:
          customerName,
        customerEmail:
          customerEmail,
        customerPhone:
          customerPhone,
        serviceCode:
          serviceCode
      });

    if (!customerValidation.ok) {
      return errorResponse(
        customerValidation.message,
        customerValidation.code,
        customerValidation.detail
      );
    }

    const customerType =
      customerValidation.customerType;

    let verifiedMember = null;

    if (customerType === "MEMBER") {

      const memberValidation =
        String(serviceCode || "").trim().toUpperCase() === "MPG_TRAINING_SUPPORT45" &&
        typeof validateMpgReservationMemberMaster_ === "function"
          ? validateMpgReservationMemberMaster_({
              memberNo:
                memberNo,
              customerEmail:
                customerEmail
            })
          : validateReservationMemberMaster_({
              memberNo:
                memberNo,
              customerEmail:
                customerEmail
            });

      if (!memberValidation.ok) {
        return errorResponse(
          memberValidation.message,
          memberValidation.code,
          memberValidation.detail
        );
      }

      verifiedMember =
        memberValidation.member;

      customerName =
        normalizeReservationText_(
          verifiedMember.name
        );

      customerEmail =
        normalizeReservationText_(
          verifiedMember.email
        );
    }

    if (
      String(serviceCode || "").trim().toUpperCase() ===
        "MPG_TRAINING_SUPPORT45" &&
      typeof validateMpgTrainingMonthlyBookingLimit_ ===
        "function"
    ) {
      const mpgMonthlyLimit =
        validateMpgTrainingMonthlyBookingLimit_(
          memberNo,
          targetDate,
          ""
        );

      if (!mpgMonthlyLimit.ok) {
        return errorResponse(
          mpgMonthlyLimit.message,
          mpgMonthlyLimit.code,
          mpgMonthlyLimit.detail
        );
      }
    }

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

    /*
     * サービス別予約ルール
     */
    const bookingMinHours =
      getReservationRuleNumber_(
        service.booking_min_hours,
        0
      );

    const publicDays =
      getReservationRuleNumber_(
        service.public_days,
        30
      );

    const durationMinutes =
      Number(service.duration);

    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes <= 0
    ) {
      throw new Error(
        `サービス所要時間が不正です: ${service.duration}`
      );
    }

    /*
     * 日時生成
     */
    const startAt =
      createAvailabilityDateTime_(
        targetDate,
        startTime
      );

    const endAt =
      new Date(
        startAt.getTime() +
        durationMinutes * 60000
      );

    if (
      /^MPG_/.test(
        String(serviceCode || "")
          .trim()
          .toUpperCase()
      ) &&
      typeof validateMpgHeadOfficeTravelForReservation_ ===
        "function"
    ) {
      const mpgTravelValidation =
        validateMpgHeadOfficeTravelForReservation_(
          targetDate,
          startTime,
          formatReservationTime_(endAt),
          ""
        );

      if (!mpgTravelValidation.ok) {
        return errorResponse(
          mpgTravelValidation.message,
          mpgTravelValidation.code,
          mpgTravelValidation.detail
        );
      }
    }

    /*
     * 予約公開期間チェック
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
     * 最短予約可能時間チェック
     */
    const bookingDeadline =
      new Date(
        new Date().getTime() +
        bookingMinHours * 60 * 60 * 1000
      );

    if (
      startAt.getTime() <
      bookingDeadline.getTime()
    ) {
      return errorResponse(
        "この時間は予約受付期限を過ぎています。",
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
              bookingDeadline
            )
        }
      );
    }

    /*
     * スタッフ確認
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

    /*
     * roleとサービス担当可否の両方を満たす
     * 有効スタッフだけを対象にする。
     */
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

    if (serviceHours.length === 0) {
      return errorResponse(
        "この日はサービス受付時間が設定されていません。",
        "SERVICE_HOURS_NOT_AVAILABLE",
        {
          service_code:
            serviceCode,
          date:
            targetDate
        }
      );
    }

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
        shift.staff_code ===
        requestedStaffCode
      );
    }

    /*
     * シフトとサービス受付時間の積集合
     */
    const shifts =
      intersectAvailabilityShiftsWithServiceHours_(
        rawShifts,
        serviceHours
      );

    /*
     * 予約時間全体を実効シフト内に含む
     * スタッフだけを抽出
     */
    const workingStaff =
      shifts.filter(shift =>
        shift.start_at.getTime() <=
          startAt.getTime() &&
        shift.end_at.getTime() >=
          endAt.getTime()
      );

    if (workingStaff.length === 0) {
      return errorResponse(
        "指定された時間に対応可能なスタッフがいません。",
        "NO_WORKING_STAFF",
        {
          date: targetDate,
          start_time: startTime,
          end_time:
            formatReservationTime_(
              endAt
            ),
          staff_code:
            requestedStaffCode || null,
          raw_shift_count:
            rawShifts.length,
          service_hour_count:
            serviceHours.length,
          effective_shift_count:
            shifts.length
        }
      );
    }

    /*
     * カレンダー取得
     */
    const calendarCode =
      normalizeReservationText_(
        service.calendar_code
      );

    if (!calendarCode) {
      throw new Error(
        `サービスにcalendar_codeが設定されていません: ${serviceCode}`
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
      throw new Error(
        `Googleカレンダーに接続できません: ${calendarMaster.calendar_id}`
      );
    }

    /*
     * ロック取得後にカレンダーを再取得して
     * 予約枠を再判定する
     */
    const busyPeriods =
      getAvailabilityCalendarEvents_(
        calendar,
        targetDate
      );

    const overlappingEvents =
      busyPeriods.filter(event =>
        event.start_at.getTime() <
          endAt.getTime() &&
        event.end_at.getTime() >
          startAt.getTime()
      );

    /*
     * スタッフ指定あり:
     * 共有カレンダー上に重複予定があれば不可
     *
     * スタッフ指定なし:
     * 勤務スタッフ数から重複予定数を差し引く
     */
    let availableCapacity = 0;

    if (requestedStaffCode) {

      availableCapacity =
        overlappingEvents.length === 0
          ? 1
          : 0;

    } else {

      availableCapacity =
        Math.max(
          0,
          workingStaff.length -
          overlappingEvents.length
        );
    }

    if (availableCapacity <= 0) {
      return errorResponse(
        "指定された予約枠はすでに埋まっています。",
        "SLOT_NOT_AVAILABLE",
        {
          date: targetDate,
          start_time: startTime,
          end_time:
            formatReservationTime_(
              endAt
            ),
          working_staff_count:
            workingStaff.length,
          busy_event_count:
            overlappingEvents.length
        }
      );
    }

    /*
     * 担当スタッフ決定
     */
    const assignedStaff =
      selectReservationStaff_({
        requestedStaffCode:
          requestedStaffCode,
        workingStaff:
          workingStaff,
        overlappingEvents:
          overlappingEvents
      });

    if (!assignedStaff) {
      return errorResponse(
        "担当スタッフを割り当てられませんでした。",
        "STAFF_ASSIGNMENT_FAILED"
      );
    }

    /*
     * 予約ID発行
     */
    const reservationId =
      generateReservationId_();

    const serviceName =
      normalizeReservationText_(
        service.service_name ||
        service.name
      );

    const staffName =
      normalizeReservationText_(
        assignedStaff.staff_name
      );

    /*
     * Googleカレンダー予定作成
     */
    const eventTitle =
      buildReservationEventTitle_({
        customerName:
          customerName,
        serviceName:
          serviceName,
        staffName:
          staffName
      });

    const eventDescription =
      buildReservationEventDescription_({
        reservationId:
          reservationId,
        serviceCode:
          serviceCode,
        serviceName:
          serviceName,
        staffCode:
          assignedStaff.staff_code,
        staffName:
          staffName,
        providerRoles:
          providerRoles,
        staffRole:
          normalizeProviderRole_(
            assignedStaff.role
          ),
        formType:
          formType,
        customerType:
          customerType,
        memberMasterVerified:
          customerType === "MEMBER",
        memberNo:
          memberNo,
        customerName:
          customerName,
        customerEmail:
          customerEmail,
        customerPhone:
          customerPhone,
        postalCode:
          postalCode,
        address:
          address,
        note:
          note
      });

    createdEvent =
      calendar.createEvent(
        eventTitle,
        startAt,
        endAt,
        {
          description:
            eventDescription
        }
      );

    const googleEventId =
      createdEvent.getId();

    const now =
      new Date();

    /*
     * reservationsシート保存
     */
    const reservationRecord = {
      reservation_id:
        reservationId,

      brand_code:
        normalizeReservationText_(
          service.brand_code
        ),

      store_code:
        normalizeReservationText_(
          service.store_code
        ),

      service_code:
        serviceCode,

      service_name:
        serviceName,

      calendar_code:
        calendarCode,

      calendar_id:
        normalizeReservationText_(
          calendarMaster.calendar_id
        ),

      staff_code:
        assignedStaff.staff_code,

      staff_name:
        staffName,

      provider_role:
        providerRoles.join(","),

      staff_role:
        normalizeProviderRole_(
          assignedStaff.role
        ),

      form_type:
        formType,

      customer_type:
        customerType,

      member_master_verified:
        customerType === "MEMBER",

      member_no:
        memberNo,

      customer_name:
        customerName,

      customer_email:
        customerEmail,

      customer_phone:
        customerPhone,

      postal_code:
        postalCode,

      address:
        address,

      reservation_date:
        targetDate,

      start_time:
        startTime,

      end_time:
        formatReservationTime_(
          endAt
        ),

      start_at:
        formatDateTime_(
          startAt
        ),

      end_at:
        formatDateTime_(
          endAt
        ),

      duration:
        durationMinutes,

      booking_min_hours:
        bookingMinHours,

      public_days:
        publicDays,

      status:
        "RESERVED",

      google_event_id:
        googleEventId,

      note:
        note,

      created_at:
        now,

      updated_at:
        now
    };

    appendReservationObject_(
      APP_CONFIG.SHEETS.RESERVATIONS,
      reservationRecord,
      [
        "reservation_id",
        "service_code",
        "staff_code",
        "customer_name",
        "reservation_date",
        "start_time",
        "status",
        "google_event_id"
      ]
    );

    /*
     * 履歴保存
     */
    appendReservationHistory_({
      history_id:
        generateReservationHistoryId_(),

      reservation_id:
        reservationId,

      action:
        "CREATE",

      old_status:
        "",

      new_status:
        "RESERVED",

      staff_code:
        assignedStaff.staff_code,

      service_code:
        serviceCode,

      reservation_date:
        targetDate,

      start_time:
        startTime,

      detail:
        JSON.stringify({
          source:
            "WEB_API",
          google_event_id:
            googleEventId,
          provider_roles:
            providerRoles,
          staff_role:
            normalizeProviderRole_(
              assignedStaff.role
            ),
          booking_min_hours:
            bookingMinHours,
          public_days:
            publicDays,
          form_type:
            formType,
          customer_type:
            customerType,
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
          member_master_verified:
            customerType === "MEMBER",
          member_master_status:
            verifiedMember
              ? normalizeReservationText_(
                  verifiedMember.status
                )
              : ""
        }),

      created_at:
        now
    });

    const result = {
      reservation_id:
        reservationId,

      status:
        "RESERVED",

      service_code:
        serviceCode,

      service_name:
        serviceName,

      date:
        targetDate,

      start_time:
        startTime,

      end_time:
        formatReservationTime_(
          endAt
        ),

      start_at:
        formatDateTime_(
          startAt
        ),

      end_at:
        formatDateTime_(
          endAt
        ),

      duration_minutes:
        durationMinutes,

      booking_min_hours:
        bookingMinHours,

      public_days:
        publicDays,

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

      provider_roles:
        providerRoles,

      staff_code:
        assignedStaff.staff_code,

      staff_name:
        staffName,

      staff_role:
        normalizeProviderRole_(
          assignedStaff.role
        ),

      form_type:
        formType,

      customer_type:
        customerType,

      member_no:
        memberNo,

      customer_name:
        customerName,

      customer_email:
        customerEmail,

      customer_phone:
        customerPhone,

      note:
        note,

      google_event_id:
        googleEventId,

      calendar_code:
        calendarCode,

      calendar_id:
        calendarMaster.calendar_id
    };

    logInfo(
      "createReservation",
      "予約登録成功",
      result
    );

    sendReservationMailSafely_(
      reservationRecord,
      "RESERVATION_CREATED",
      "createReservation"
    );

    if (
      String(
        reservationRecord.service_code || ""
      )
        .trim()
        .toUpperCase() ===
      "COUNSEL"
    ) {

      sendCounselingSheetRequestMailSafely_(
        reservationRecord,
        "createReservationCounselSheet"
      );
    }

    return successResponse(
      result,
      "予約を登録しました。"
    );

  } catch (error) {

    /*
     * シート保存などで失敗した場合は
     * 作成済みGoogleカレンダー予定を削除する
     */
    if (createdEvent) {

      try {
        createdEvent.deleteEvent();
      } catch (rollbackError) {

        logError(
          "createReservationRollback",
          rollbackError.message,
          {
            stack:
              rollbackError.stack
          }
        );
      }
    }

    logError(
      "createReservation",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "予約登録中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );

  } finally {

    try {
      lock.releaseLock();
    } catch (error) {
      // ロック未取得時などは何もしない
    }
  }
}


/**
 * 予約登録パラメータ検証
 *
 * @param {Object} values
 */
function validateCreateReservationParams_(
  values
) {

  if (!values.serviceCode) {
    throw new Error(
      "service_codeを指定してください。"
    );
  }

  if (!values.targetDate) {
    throw new Error(
      "dateを指定してください。"
    );
  }

  parseDateStart_(
    values.targetDate
  );

  if (!values.startTime) {
    throw new Error(
      "start_timeを指定してください。"
    );
  }

  normalizeReservationTime_(
    values.startTime
  );
}


/**
 * サービス別の顧客入力条件を検証
 *
 * @param {Object} values
 * @returns {Object}
 */
function validateReservationCustomer_(
  values
) {

  const formType =
    normalizeReservationFormType_(
      values.formType
    );

  const requestedCustomerType =
    normalizeReservationCustomerType_(
      values.requestedCustomerType
    );

  let customerType = "";

  if (formType === "MEMBER") {

    if (
      requestedCustomerType &&
      requestedCustomerType !== "MEMBER"
    ) {
      return {
        ok:
          false,
        code:
          "CUSTOMER_TYPE_NOT_ALLOWED",
        message:
          "このサービスは会員のみ予約できます。",
        detail: {
          form_type:
            formType,
          customer_type:
            requestedCustomerType
        }
      };
    }

    customerType =
      "MEMBER";

  } else if (
    formType === "VISITOR"
  ) {

    if (
      requestedCustomerType &&
      requestedCustomerType !== "VISITOR"
    ) {
      return {
        ok:
          false,
        code:
          "CUSTOMER_TYPE_NOT_ALLOWED",
        message:
          "このサービスは非会員のみ予約できます。",
        detail: {
          form_type:
            formType,
          customer_type:
            requestedCustomerType
        }
      };
    }

    customerType =
      "VISITOR";

  } else if (
    formType === "BOTH"
  ) {

    if (
      requestedCustomerType !== "MEMBER" &&
      requestedCustomerType !== "VISITOR"
    ) {
      return {
        ok:
          false,
        code:
          "CUSTOMER_TYPE_REQUIRED",
        message:
          "会員または非会員を選択してください。",
        detail: {
          form_type:
            formType,
          allowed_customer_types: [
            "MEMBER",
            "VISITOR"
          ]
        }
      };
    }

    customerType =
      requestedCustomerType;

  } else {

    return {
      ok:
        false,
      code:
        "INVALID_FORM_TYPE",
      message:
        "form_typeの設定が正しくありません。",
      detail: {
        form_type:
          formType
      }
    };
  }

  const memberNo =
    normalizeReservationText_(
      values.memberNo
    );

  const customerName =
    normalizeReservationText_(
      values.customerName
    );

  const customerEmail =
    normalizeReservationText_(
      values.customerEmail
    );

  const customerPhone =
    normalizeReservationText_(
      values.customerPhone
    );

  const serviceCode =
    normalizeReservationText_(
      values.serviceCode
    ).toUpperCase();

  const customerNameRequired =
    isReservationCustomerNameRequired_(
      serviceCode,
      customerType
    );

  if (
    customerType === "MEMBER" &&
    !memberNo
  ) {
    return {
      ok:
        false,
      code:
        "MEMBER_NO_REQUIRED",
      message:
        "会員番号を入力してください。",
      detail: {
        customer_type:
          customerType
      }
    };
  }

  if (
    customerNameRequired &&
    !customerName
  ) {
    return {
      ok:
        false,
      code:
        "CUSTOMER_NAME_REQUIRED",
      message:
        "氏名を入力してください。",
      detail: {
        customer_type:
          customerType,
        service_code:
          serviceCode
      }
    };
  }

  if (!customerEmail) {
    return {
      ok:
        false,
      code:
        "CUSTOMER_EMAIL_REQUIRED",
      message:
        "メールアドレスを入力してください。",
      detail: {
        customer_type:
          customerType
      }
    };
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      customerEmail
    )
  ) {
    return {
      ok:
        false,
      code:
        "INVALID_CUSTOMER_EMAIL",
      message:
        "メールアドレスの形式が正しくありません。",
      detail: {
        customer_email:
          customerEmail
      }
    };
  }

  if (
    customerType === "VISITOR" &&
    !customerPhone
  ) {
    return {
      ok:
        false,
      code:
        "CUSTOMER_PHONE_REQUIRED",
      message:
        "電話番号を入力してください。",
      detail: {
        customer_type:
          customerType
      }
    };
  }

  return {
    ok:
      true,
    code:
      "",
    message:
      "",
    detail:
      null,
    customerType:
      customerType
  };
}


/**
 * サービス別の氏名入力要否
 *
 * 会員番号＋登録メールで会員マスター照合するサービスでは、
 * 画面で氏名を入力させず、照合後に会員マスターの氏名を使用する。
 */
function isReservationCustomerNameRequired_(
  serviceCode,
  customerType
) {

  const code =
    normalizeReservationText_(
      serviceCode
    ).toUpperCase();

  const type =
    normalizeReservationText_(
      customerType
    ).toUpperCase();

  if ([
    "TRAINING_SUPPORT45",
    "MPG_TRAINING_SUPPORT45",
    "PROCEDURE",
    "UNSUBSCRIBE",
    "MEAL_PLANNING"
  ].includes(code)) {
    return false;
  }

  if (code === "COUNSEL") {
    return type !== "MEMBER";
  }

  return true;
}


/**
 * form_typeを正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationFormType_(
  value
) {

  const formType =
    normalizeReservationText_(
      value
    ).toUpperCase();

  if (
    formType === "MEMBER" ||
    formType === "VISITOR" ||
    formType === "BOTH"
  ) {
    return formType;
  }

  return "";
}


/**
 * customer_typeを正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationCustomerType_(
  value
) {

  const customerType =
    normalizeReservationText_(
      value
    ).toUpperCase();

  if (
    customerType === "MEMBER" ||
    customerType === "VISITOR"
  ) {
    return customerType;
  }

  return "";
}

/**
 * 会員マスター接続設定
 *
 * @returns {Object}
 */
function getReservationMemberMasterConfig_() {

  return {
    spreadsheet_id:
      "1kLK6Dbe05Uqd0pxnoKX8MbHpQH9AgDnVygwzDPzyXvw",
    sheet_name:
      "master",
    active_status:
      "ACT"
  };
}


/**
 * 会員マスターシートを取得
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getReservationMemberMasterSheet_() {

  const config =
    getReservationMemberMasterConfig_();

  const spreadsheet =
    SpreadsheetApp.openById(
      config.spreadsheet_id
    );

  const sheet =
    spreadsheet.getSheetByName(
      config.sheet_name
    );

  if (!sheet) {
    throw new Error(
      `会員マスターシートが見つかりません: ${config.sheet_name}`
    );
  }

  return sheet;
}


/**
 * 会員マスターを取得
 *
 * @returns {Array<Object>}
 */
function getReservationMemberMasterRows_() {

  const sheet =
    getReservationMemberMasterSheet_();

  const values =
    sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers =
    values[0].map(function(header) {
      return String(
        header || ""
      ).trim();
    });

  const requiredHeaders = [
    "memberNo",
    "name",
    "email",
    "status"
  ];

  const missingHeaders =
    requiredHeaders.filter(
      function(header) {
        return !headers.includes(
          header
        );
      }
    );

  if (missingHeaders.length > 0) {
    throw new Error(
      "会員マスターに必要な列がありません: " +
      missingHeaders.join(", ")
    );
  }

  return values
    .slice(1)
    .map(function(row) {

      const record = {};

      headers.forEach(
        function(
          header,
          index
        ) {

          if (header) {
            record[header] =
              row[index];
          }
        }
      );

      return record;
    });
}


/**
 * 会員番号で会員マスターを検索
 *
 * @param {string} memberNo
 * @returns {Object|null}
 */
function findReservationMemberByNo_(
  memberNo
) {

  const normalizedMemberNo =
    normalizeReservationMemberNo_(
      memberNo
    );

  if (!normalizedMemberNo) {
    return null;
  }

  return getReservationMemberMasterRows_()
    .find(function(member) {

      return (
        normalizeReservationMemberNo_(
          member.memberNo
        ) ===
        normalizedMemberNo
      );
    }) || null;
}


/**
 * 会員番号・メール・在籍状態を照合
 *
 * @param {Object} values
 * @returns {Object}
 */
function validateReservationMemberMaster_(
  values
) {

  const memberNo =
    normalizeReservationText_(
      values.memberNo
    );

  const customerEmail =
    normalizeReservationEmail_(
      values.customerEmail
    );

  const member =
    findReservationMemberByNo_(
      memberNo
    );

  if (!member) {
    return {
      ok:
        false,
      code:
        "MEMBER_NOT_FOUND",
      message:
        "会員番号が確認できません。",
      detail: {
        member_no:
          memberNo
      }
    };
  }

  const config =
    getReservationMemberMasterConfig_();

  const memberStatus =
    normalizeReservationText_(
      member.status
    ).toUpperCase();

  if (
    memberStatus !==
    config.active_status
  ) {
    return {
      ok:
        false,
      code:
        "MEMBER_INACTIVE",
      message:
        "現在有効な会員番号ではありません。",
      detail: {
        member_no:
          memberNo,
        status:
          memberStatus
      }
    };
  }

  const masterEmail =
    normalizeReservationEmail_(
      member.email
    );

  if (
    !masterEmail ||
    masterEmail !==
      customerEmail
  ) {
    return {
      ok:
        false,
      code:
        "MEMBER_EMAIL_MISMATCH",
      message:
        "会員番号とメールアドレスが一致しません。",
      detail: {
        member_no:
          memberNo
      }
    };
  }

  const masterName =
    normalizeReservationText_(
      member.name
    );

  if (!masterName) {
    return {
      ok:
        false,
      code:
        "MEMBER_NAME_NOT_SET",
      message:
        "会員マスターに氏名が設定されていません。",
      detail: {
        member_no:
          memberNo
      }
    };
  }

  return {
    ok:
      true,
    code:
      "",
    message:
      "",
    detail:
      null,
    member: {
      memberNo:
        normalizeReservationText_(
          member.memberNo
        ),
      name:
        masterName,
      email:
        normalizeReservationText_(
          member.email
        ),
      status:
        memberStatus
    }
  };
}


/**
 * 会員番号を比較用に正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationMemberNo_(
  value
) {

  return normalizeReservationText_(
    value
  )
    .replace(/\s+/g, "")
    .toUpperCase();
}


/**
 * メールアドレスを比較用に正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationEmail_(
  value
) {

  return normalizeReservationText_(
    value
  ).toLowerCase();
}


/**
 * 会員マスター接続テスト
 */
function testReservationMemberMasterConnection() {

  const sheet =
    getReservationMemberMasterSheet_();

  const values =
    sheet.getDataRange().getValues();

  const headers =
    values[0].map(function(header) {
      return String(
        header || ""
      ).trim();
    });

  const requiredHeaders = [
    "memberNo",
    "name",
    "email",
    "status"
  ];

  const missingHeaders =
    requiredHeaders.filter(
      function(header) {
        return !headers.includes(
          header
        );
      }
    );

  if (missingHeaders.length > 0) {
    throw new Error(
      "会員マスターに必要な列がありません: " +
      missingHeaders.join(", ")
    );
  }

  Logger.log(
    JSON.stringify({
      sheet_name:
        sheet.getName(),
      data_row_count:
        Math.max(
          0,
          values.length - 1
        ),
      required_headers:
        requiredHeaders
    })
  );

  Logger.log(
    "会員マスター接続テスト成功"
  );
}



/**
 * 会員マスター照合テスト
 *
 * 正常照合・メール不一致・存在しない会員番号を確認する。
 * 予約やGoogleカレンダー予定は作成しない。
 */
function testReservationMemberMasterValidation() {

  const validMemberNo =
    "108035";

  const validEmail =
    "ichi6kawakami@gmail.com";

  /*
   * 正常照合
   */
  const validResult =
    validateReservationMemberMaster_({
      memberNo:
        validMemberNo,
      customerEmail:
        validEmail
    });

  Logger.log(
    "1. 正常照合結果: " +
    JSON.stringify(
      validResult
    )
  );

  if (
    !validResult.ok ||
    !validResult.member
  ) {
    throw new Error(
      "正常照合に失敗しました: " +
      JSON.stringify(
        validResult
      )
    );
  }

  if (
    normalizeReservationText_(
      validResult.member.memberNo
    ) !==
      validMemberNo
  ) {
    throw new Error(
      "会員番号が一致しません: " +
      JSON.stringify(
        validResult
      )
    );
  }

  if (
    normalizeReservationEmail_(
      validResult.member.email
    ) !==
      normalizeReservationEmail_(
        validEmail
      )
  ) {
    throw new Error(
      "メールアドレスが一致しません: " +
      JSON.stringify(
        validResult
      )
    );
  }

  /*
   * メール不一致
   */
  const mismatchResult =
    validateReservationMemberMaster_({
      memberNo:
        validMemberNo,
      customerEmail:
        "wrong@example.com"
    });

  Logger.log(
    "2. メール不一致結果: " +
    JSON.stringify(
      mismatchResult
    )
  );

  if (
    mismatchResult.ok ||
    mismatchResult.code !==
      "MEMBER_EMAIL_MISMATCH"
  ) {
    throw new Error(
      "メール不一致判定に失敗しました: " +
      JSON.stringify(
        mismatchResult
      )
    );
  }

  /*
   * 存在しない会員番号
   */
  const notFoundResult =
    validateReservationMemberMaster_({
      memberNo:
        "999999999",
      customerEmail:
        validEmail
    });

  Logger.log(
    "3. 会員番号不存在結果: " +
    JSON.stringify(
      notFoundResult
    )
  );

  if (
    notFoundResult.ok ||
    notFoundResult.code !==
      "MEMBER_NOT_FOUND"
  ) {
    throw new Error(
      "会員番号不存在判定に失敗しました: " +
      JSON.stringify(
        notFoundResult
      )
    );
  }

  Logger.log(
    "会員マスター照合テスト成功"
  );
}


/**
 * 担当スタッフ選択
 *
 * 現段階ではGoogleカレンダーの既存予定に
 * staff_code情報がないため、スタッフ指定なしの場合は
 * 勤務スタッフの先頭から割り当てる。
 *
 * @param {Object} options
 * @returns {Object|null}
 */
function selectReservationStaff_(
  options
) {

  const requestedStaffCode =
    options.requestedStaffCode || "";

  const workingStaff =
    options.workingStaff || [];

  if (requestedStaffCode) {

    return workingStaff.find(staff =>
      staff.staff_code ===
      requestedStaffCode
    ) || null;
  }

  if (workingStaff.length === 0) {
    return null;
  }

  /*
   * 将来は既存イベントの説明欄から
   * staff_codeを抽出し、未使用スタッフを選ぶ。
   */
  return workingStaff[0];
}


/**
 * Googleカレンダー予定タイトル生成
 *
 * @param {Object} values
 * @returns {string}
 */
function buildReservationEventTitle_(
  values
) {

  const customerName =
    values.customerName || "";

  const serviceName =
    values.serviceName || "";

  const staffName =
    values.staffName || "";

  let title =
    `${customerName} さん (${serviceName})`;

  if (staffName) {
    title += `【担当:${staffName}】`;
  }

  return title;
}


/**
 * Googleカレンダー説明欄生成
 *
 * @param {Object} values
 * @returns {string}
 */
function buildReservationEventDescription_(
  values
) {

  const lines = [
    "A-nauts OS Reserve",
    "",
    `reservation_id: ${values.reservationId || ""}`,
    `service_code: ${values.serviceCode || ""}`,
    `service_name: ${values.serviceName || ""}`,
    `staff_code: ${values.staffCode || ""}`,
    `staff_name: ${values.staffName || ""}`,
    `provider_roles: ${
      Array.isArray(values.providerRoles)
        ? values.providerRoles.join(",")
        : values.providerRoles || ""
    }`,
    `staff_role: ${values.staffRole || ""}`,
    `form_type: ${values.formType || ""}`,
    `customer_type: ${values.customerType || ""}`,
    `member_master_verified: ${
      values.memberMasterVerified === true
        ? "true"
        : "false"
    }`,
    `member_no: ${values.memberNo || ""}`,
    `customer_name: ${values.customerName || ""}`,
    `customer_email: ${values.customerEmail || ""}`,
    `customer_phone: ${values.customerPhone || ""}`,
    `postal_code: ${values.postalCode || ""}`,
    `address: ${values.address || ""}`
  ];

  if (values.note) {
    lines.push(
      `note: ${values.note}`
    );
  }

  return lines.join("\n");
}


/**
 * reservationsシートへ
 * オブジェクト形式で1行追加
 *
 * シート1行目のヘッダー名と
 * recordのキーを照合して保存する。
 *
 * @param {string} sheetName
 * @param {Object} record
 * @param {Array<string>} requiredHeaders
 */
function appendReservationObject_(
  sheetName,
  record,
  requiredHeaders
) {

  const sheet =
    getSheet(sheetName);

  const lastColumn =
    sheet.getLastColumn();

  if (lastColumn === 0) {
    throw new Error(
      `${sheetName}シートにヘッダーがありません。`
    );
  }

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(header =>
        String(header || "").trim()
      );

  const missingHeaders =
    (requiredHeaders || [])
      .filter(requiredHeader =>
        !headers.includes(
          requiredHeader
        )
      );

  if (missingHeaders.length > 0) {
    throw new Error(
      `${sheetName}シートに必要な列がありません: ` +
      missingHeaders.join(", ")
    );
  }

  /*
   * 数値として自動変換させない列。
   *
   * 電話番号・郵便番号・会員番号・各種IDなどの
   * 先頭0や長い文字列を確実に保持する。
   */
  const textHeaders =
    new Set([
      "reservation_id",
      "history_id",
      "brand_code",
      "store_code",
      "service_code",
      "service_name",
      "calendar_code",
      "calendar_id",
      "staff_code",
      "staff_name",
      "provider_role",
      "staff_role",
      "form_type",
      "customer_type",
      "member_no",
      "customer_name",
      "customer_email",
      "customer_phone",
      "postal_code",
      "address",
      "status",
      "google_event_id",
      "note",
      "cancel_reason",
      "cancelled_by",
      "action",
      "old_status",
      "new_status",
      "detail",
      "reservation_date",
      "start_time",
      "end_time",
      "start_at",
      "end_at"
    ]);

  const row =
    headers.map(header => {

      if (
        !Object.prototype.hasOwnProperty.call(
          record,
          header
        )
      ) {
        return "";
      }

      const value =
        record[header];

      if (
        textHeaders.has(header) &&
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        return String(value);
      }

      return value;
    });

  const rowNumber =
    sheet.getLastRow() + 1;

  /*
   * setValues()の前に文字列書式を設定する。
   * これにより090...などが数値化されず、
   * 先頭0を保持したまま保存される。
   */
  headers.forEach(function(
    header,
    index
  ) {

    if (textHeaders.has(header)) {

      sheet
        .getRange(
          rowNumber,
          index + 1
        )
        .setNumberFormat("@");
    }
  });

  sheet
    .getRange(
      rowNumber,
      1,
      1,
      row.length
    )
    .setValues([
      row
    ]);
}


/**
 * 予約履歴保存
 *
 * @param {Object} record
 */
function appendReservationHistory_(
  record
) {

  appendReservationObject_(
    APP_CONFIG.SHEETS
      .RESERVATION_HISTORIES,
    record,
    [
      "history_id",
      "reservation_id",
      "action",
      "new_status",
      "created_at"
    ]
  );
}


/**
 * 予約ID生成
 *
 * @returns {string}
 */
function generateReservationId_() {

  const timestamp =
    Utilities.formatDate(
      new Date(),
      APP_CONFIG.TIMEZONE,
      "yyyyMMddHHmmssSSS"
    );

  const random =
    Utilities
      .getUuid()
      .replace(/-/g, "")
      .substring(0, 6)
      .toUpperCase();

  return `RSV${timestamp}${random}`;
}


/**
 * 予約履歴ID生成
 *
 * @returns {string}
 */
function generateReservationHistoryId_() {

  const timestamp =
    Utilities.formatDate(
      new Date(),
      APP_CONFIG.TIMEZONE,
      "yyyyMMddHHmmssSSS"
    );

  const random =
    Utilities
      .getUuid()
      .replace(/-/g, "")
      .substring(0, 6)
      .toUpperCase();

  return `HIS${timestamp}${random}`;
}


/**
 * 文字列正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationText_(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


/**
 * 時刻をHH:mm形式へ正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationTime_(
  value
) {

  const text =
    normalizeReservationText_(
      value
    );

  if (!text) {
    return "";
  }

  const match =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    throw new Error(
      `時刻形式が正しくありません: ${text}`
    );
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(
      `時刻が正しくありません: ${text}`
    );
  }

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}


/**
 * DateをHH:mm形式へ変換
 *
 * @param {Date} value
 * @returns {string}
 */
function formatReservationTime_(
  value
) {

  return Utilities.formatDate(
    value,
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
function getReservationRuleNumber_(
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
 * サービス別フォーム条件テスト
 *
 * カレンダーやシートは変更しない。
 */
function testReservationCustomerValidation() {

  const memberResult =
    validateReservationCustomer_({
      formType:
        "MEMBER",
      requestedCustomerType:
        "",
      memberNo:
        "FRGTEST001",
      customerName:
        "会員テスト",
      customerEmail:
        "member@example.com",
      customerPhone:
        ""
    });

  if (
    !memberResult.ok ||
    memberResult.customerType !==
      "MEMBER"
  ) {
    throw new Error(
      "MEMBERフォームの検証に失敗しました: " +
      JSON.stringify(
        memberResult
      )
    );
  }

  const visitorResult =
    validateReservationCustomer_({
      formType:
        "VISITOR",
      requestedCustomerType:
        "",
      memberNo:
        "",
      customerName:
        "非会員テスト",
      customerEmail:
        "visitor@example.com",
      customerPhone:
        "09012345678"
    });

  if (
    !visitorResult.ok ||
    visitorResult.customerType !==
      "VISITOR"
  ) {
    throw new Error(
      "VISITORフォームの検証に失敗しました: " +
      JSON.stringify(
        visitorResult
      )
    );
  }

  const bothMissingResult =
    validateReservationCustomer_({
      formType:
        "BOTH",
      requestedCustomerType:
        "",
      memberNo:
        "",
      customerName:
        "選択なしテスト",
      customerEmail:
        "both@example.com",
      customerPhone:
        "09012345678"
    });

  if (
    bothMissingResult.ok ||
    bothMissingResult.code !==
      "CUSTOMER_TYPE_REQUIRED"
  ) {
    throw new Error(
      "BOTHフォームのcustomer_type必須判定に失敗しました: " +
      JSON.stringify(
        bothMissingResult
      )
    );
  }

  const visitorPhoneMissingResult =
    validateReservationCustomer_({
      formType:
        "BOTH",
      requestedCustomerType:
        "VISITOR",
      memberNo:
        "",
      customerName:
        "電話なしテスト",
      customerEmail:
        "visitor@example.com",
      customerPhone:
        ""
    });

  if (
    visitorPhoneMissingResult.ok ||
    visitorPhoneMissingResult.code !==
      "CUSTOMER_PHONE_REQUIRED"
  ) {
    throw new Error(
      "非会員の電話番号必須判定に失敗しました: " +
      JSON.stringify(
        visitorPhoneMissingResult
      )
    );
  }

  Logger.log(
    "サービス別フォーム条件テスト成功"
  );
}


/**
 * 予約登録期限判定テスト
 *
 * 過去またはbooking_min_hours以内の予約が
 * BOOKING_DEADLINE_PASSEDになることを確認する。
 */
function testCreateReservationBookingDeadline() {

  const response =
    createReservation({
      action:
        "createReservation",
      service_code:
        "PT60",
      date:
        Utilities.formatDate(
          new Date(),
          APP_CONFIG.TIMEZONE,
          "yyyy-MM-dd"
        ),
      start_time:
        Utilities.formatDate(
          new Date(),
          APP_CONFIG.TIMEZONE,
          "HH:mm"
        ),
      member_no:
        "FRGTEST_DEADLINE001",
      customer_name:
        "予約期限テスト",
      customer_email:
        "test@example.com",
      customer_phone:
        "09012345678",
      note:
        "booking_min_hours動作確認"
    });

  const content =
    response.getContent();

  Logger.log(
    content
  );

  const result =
    JSON.parse(
      content
    );

  if (
    result.ok ||
    result.code !==
      "BOOKING_DEADLINE_PASSED"
  ) {
    throw new Error(
      "予約期限チェックが正しく動作していません: " +
      content
    );
  }

  Logger.log(
    "予約登録期限判定テスト成功"
  );
}


/**
 * 予約登録結合テスト
 *
 * 今日からpublic_daysの範囲内で空き枠を自動検索し、
 * 最初に見つかった枠へ予約する。
 *
 * PT60:
 * - form_type = MEMBER
 * - customer_type = MEMBER
 * - provider_role = TRAINER
 */
function testCreateReservation() {

  const serviceCode =
    "PT60";

  const service =
    getAvailabilityService_(
      serviceCode
    );

  const publicDays =
    getReservationRuleNumber_(
      service.public_days,
      30
    );

  const today =
    parseDateStart_(
      Utilities.formatDate(
        new Date(),
        APP_CONFIG.TIMEZONE,
        "yyyy-MM-dd"
      )
    );

  let selectedSlot = null;
  let selectedDate = "";

  for (
    let dayOffset = 0;
    dayOffset <= publicDays;
    dayOffset++
  ) {

    const date =
      new Date(
        today.getTime()
      );

    date.setDate(
      date.getDate() +
      dayOffset
    );

    const targetDate =
      Utilities.formatDate(
        date,
        APP_CONFIG.TIMEZONE,
        "yyyy-MM-dd"
      );

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

    const slotCount =
      availabilityResult.ok &&
      availabilityResult.data &&
      Array.isArray(
        availabilityResult.data.slots
      )
        ? availabilityResult.data.slots.length
        : 0;

    Logger.log(
      "空き枠確認: " +
      targetDate +
      " / " +
      slotCount +
      "件"
    );

    if (slotCount > 0) {

      selectedSlot =
        availabilityResult.data.slots[0];

      selectedDate =
        targetDate;

      break;
    }
  }

  if (!selectedSlot) {
    throw new Error(
      "公開期間内にテストへ使用できる空き枠がありません。"
    );
  }

  Logger.log(
    "1. 使用する空き枠: " +
    selectedDate +
    " " +
    selectedSlot.start_time
  );

  const params = {
    action:
      "createReservation",

    service_code:
      serviceCode,

    date:
      selectedSlot.date,

    start_time:
      selectedSlot.start_time,

    customer_type:
      "MEMBER",

    member_no:
      "FRGTEST_FORM001",

    customer_name:
      "フォーム結合テスト",

    customer_email:
      "test@example.com",

    customer_phone:
      "09012345678",

    note:
      "form_type・customer_type動作確認"
  };

  const response =
    createReservation(
      params
    );

  const content =
    response.getContent();

  Logger.log(
    "2. 予約登録結果: " +
    content
  );

  const result =
    JSON.parse(
      content
    );

  if (
    !result.ok ||
    !result.data ||
    !result.data.reservation_id
  ) {
    throw new Error(
      "予約登録に失敗しました: " +
      content
    );
  }

  if (
    result.data.member_master_verified !==
    true
  ) {
    throw new Error(
      "会員マスター照合結果が正しくありません: " +
      content
    );
  }

  if (
    result.data.form_type !==
    "MEMBER"
  ) {
    throw new Error(
      "form_typeが正しくありません: " +
      content
    );
  }

  if (
    result.data.customer_type !==
    "MEMBER"
  ) {
    throw new Error(
      "customer_typeが正しくありません: " +
      content
    );
  }

  if (
    !Array.isArray(
      result.data.provider_roles
    ) ||
    !result.data.provider_roles.includes(
      "TRAINER"
    )
  ) {
    throw new Error(
      "provider_rolesが正しくありません: " +
      content
    );
  }

  if (
    result.data.staff_role !==
    "TRAINER"
  ) {
    throw new Error(
      "PT60にTRAINER以外が割り当てられています: " +
      content
    );
  }

  if (
    result.data.booking_min_hours !==
    3
  ) {
    throw new Error(
      "booking_min_hoursが正しくありません: " +
      content
    );
  }

  if (
    result.data.public_days !==
    30
  ) {
    throw new Error(
      "public_daysが正しくありません: " +
      content
    );
  }

  if (
    result.data.duration_minutes !==
    60
  ) {
    throw new Error(
      "duration_minutesが正しくありません: " +
      content
    );
  }

  if (
    result.data.customer_phone !==
    "09012345678"
  ) {
    throw new Error(
      "customer_phoneの先頭0が保持されていません: " +
      content
    );
  }

  Logger.log(
    "予約登録フォーム制御結合テスト成功: " +
    result.data.reservation_id
  );
}

/**
 * 予約登録時ルール再検証テスト
 *
 * 実際の予約・カレンダー予定は作成しない。
 * service_hours、担当可否、シフトの積集合だけ確認する。
 */
function testCreateReservationServiceRules() {

  const serviceCode =
    "UNSUBSCRIBE";

  const targetDate =
    Utilities.formatDate(
      new Date(),
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );

  const service =
    getAvailabilityService_(
      serviceCode
    );

  const providerRoles =
    parseProviderRoles_(
      service.provider_role
    );

  const staffMap =
    getActiveStaffMap_(
      providerRoles,
      service
    );

  const serviceHours =
    getAvailabilityServiceHours_(
      service,
      targetDate
    );

  const rawShifts =
    getAvailabilityShifts_(
      targetDate,
      staffMap,
      service.store_code
    );

  const effectiveShifts =
    intersectAvailabilityShiftsWithServiceHours_(
      rawShifts,
      serviceHours
    );

  Logger.log(
    JSON.stringify({
      service_code:
        serviceCode,
      date:
        targetDate,
      permission_column:
        getAvailabilityPermissionColumn_(
          service
        ),
      eligible_staff_codes:
        Array.from(
          staffMap.keys()
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
      raw_shifts:
        rawShifts.map(function(shift) {
          return {
            staff_code:
              shift.staff_code,
            start_time:
              shift.start_time,
            end_time:
              shift.end_time
          };
        }),
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
    })
  );

  Logger.log(
    "予約登録時ルール再検証テスト成功"
  );
}



/**
 * スタッフ予定取得API
 *
 * GET:
 * action=getStaffSchedule
 *
 * 任意:
 * - date       yyyy-MM-dd（省略時は今日）
 * - store_code 店舗コード
 * - staff_code スタッフコード
 *
 * reservations を正本として STAFF 担当予約を取得し、
 * 同日の staff_shifts も併せて返す。
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function getStaffSchedule(params) {

  try {

    params = params || {};

    const targetDate =
      normalizeReservationText_(
        params.date
      ) ||
      Utilities.formatDate(
        new Date(),
        APP_CONFIG.TIMEZONE,
        "yyyy-MM-dd"
      );

    parseDateStart_(targetDate);

    const storeCode =
      normalizeReservationText_(
        params.store_code
      ).toUpperCase();

    const requestedStaffCode =
      normalizeReservationText_(
        params.staff_code
      ).toUpperCase();

    /*
     * STAFFマスターを先に作る。
     * reservationsシートにstaff_role列が無い構成でも
     * staff_codeから役割を判定できるようにする。
     */
    const staffRows =
      getSheetData(
        APP_CONFIG.SHEETS.STAFF
      );

    const allStaffMap =
      new Map();

    staffRows.forEach(function(row) {

      const code =
        normalizeReservationText_(
          row.staff_code
        ).toUpperCase();

      if (code) {
        allStaffMap.set(
          code,
          row
        );
      }
    });

    /*
     * 現在 STAFF として有効な人。
     * シフト表示・代替候補判定にはこちらを使用する。
     */
    const staffMap =
      new Map();

    staffRows
      .filter(function(row) {
        return (
          normalizeAvailabilityBoolean_(
            row.active
          ) &&
          normalizeProviderRole_(
            row.role
          ) === "STAFF"
        );
      })
      .forEach(function(row) {

        const code =
          normalizeReservationText_(
            row.staff_code
          ).toUpperCase();

        if (code) {
          staffMap.set(
            code,
            row
          );
        }
      });

    /*
     * 予約を「現在の担当者role」ではなく
     * 「サービスのprovider_role」で分類する。
     *
     * 担当者が後からTRAINERへ変更・無効化されても、
     * STAFFサービスの予約自体を予定画面から消さないため。
     */
    const serviceRows =
      getSheetData(
        APP_CONFIG.SHEETS.SERVICES
      );

    const serviceMap =
      new Map();

    serviceRows.forEach(function(row) {

      const code =
        normalizeReservationText_(
          row.service_code
        ).toUpperCase();

      if (code) {
        serviceMap.set(
          code,
          row
        );
      }
    });

    const reservations =
      getSheetData(
        APP_CONFIG.SHEETS.RESERVATIONS
      );

    const excludedStatuses =
      new Set([
        "CANCELLED",
        "CANCELED"
      ]);

    const reservationRows =
      reservations
        .filter(function(row) {

          const reservationDate =
            normalizeReservationScheduleDate_(
              row.reservation_date ||
              row.date
            );

          const status =
            normalizeReservationText_(
              row.status
            ).toUpperCase();

          const rowStoreCode =
            normalizeReservationText_(
              row.store_code
            ).toUpperCase();

          const rowStaffCode =
            normalizeReservationText_(
              row.staff_code
            ).toUpperCase();

          if (
            reservationDate !==
            targetDate
          ) {
            return false;
          }

          /*
           * 予約の表示区分は現在の担当者roleではなく、
           * サービス側のprovider_roleを正本にする。
           *
           * これにより、予約後に担当者のrole/activeが変更されても
           * 予約が画面から消えない。
           */
          const serviceCode =
            normalizeReservationText_(
              row.service_code
            ).toUpperCase();

          const service =
            serviceMap.get(
              serviceCode
            ) || {};

          const providerRoles =
            parseProviderRoles_(
              service.provider_role ||
              row.provider_role
            );

          const isStaffService =
            providerRoles.indexOf(
              "STAFF"
            ) !== -1 ||
            (
              providerRoles.length === 0 &&
              staffMap.has(
                rowStaffCode
              )
            );

          if (!isStaffService) {
            return false;
          }

          if (
            excludedStatuses.has(
              status
            )
          ) {
            return false;
          }

          if (
            storeCode &&
            rowStoreCode &&
            rowStoreCode !==
              storeCode
          ) {
            return false;
          }

          if (
            requestedStaffCode &&
            rowStaffCode !==
              requestedStaffCode
          ) {
            return false;
          }

          return true;
        })
        .map(function(row) {

          const rowStaffCode =
            normalizeReservationText_(
              row.staff_code
            ).toUpperCase();

          const staff =
            allStaffMap.get(
              rowStaffCode
            ) || {};

          return {
            reservation_id:
              normalizeReservationText_(
                row.reservation_id
              ),

            service_code:
              normalizeReservationText_(
                row.service_code
              ),

            service_name:
              normalizeReservationText_(
                row.service_name
              ),

            staff_code:
              rowStaffCode,

            staff_name:
              normalizeReservationText_(
                row.staff_name ||
                staff.display_name ||
                staff.staff_name
              ),

            staff_role:
              "STAFF",

            customer_type:
              normalizeReservationText_(
                row.customer_type
              ),

            member_no:
              normalizeReservationText_(
                row.member_no
              ),

            customer_name:
              normalizeReservationText_(
                row.customer_name
              ),

            customer_email:
              normalizeReservationText_(
                row.customer_email
              ),

            customer_phone:
              normalizeReservationText_(
                row.customer_phone
              ),

            postal_code:
              normalizeReservationText_(
                row.postal_code
              ),

            prefecture:
              normalizeReservationText_(
                row.prefecture
              ),

            city:
              normalizeReservationText_(
                row.city
              ),

            address_detail:
              normalizeReservationText_(
                row.address_detail
              ),

            address:
              normalizeReservationText_(
                row.address ||
                [
                  row.prefecture,
                  row.city,
                  row.address_detail
                ].join("")
              ),

            date:
              targetDate,

            start_time:
              normalizeReservationScheduleTime_(
                row.start_time
              ),

            end_time:
              normalizeReservationScheduleTime_(
                row.end_time
              ),

            status:
              normalizeReservationText_(
                row.status
              ).toUpperCase(),

            note:
              normalizeReservationText_(
                row.note
              ),

            store_code:
              normalizeReservationText_(
                row.store_code
              ),

            google_event_id:
              normalizeReservationText_(
                row.google_event_id
              )
          };
        })
        .sort(function(a, b) {

          const timeCompare =
            a.start_time.localeCompare(
              b.start_time
            );

          if (timeCompare !== 0) {
            return timeCompare;
          }

          return a.staff_name.localeCompare(
            b.staff_name
          );
        });

    const shiftRows =
      getSheetData(
        APP_CONFIG.SHEETS.STAFF_SHIFTS
      )
        .filter(function(row) {

          const staffCode =
            normalizeReservationText_(
              row.staff_code
            ).toUpperCase();

          const rowStoreCode =
            normalizeReservationText_(
              row.store_code
            ).toUpperCase();

          if (
            !normalizeAvailabilityBoolean_(
              row.active
            )
          ) {
            return false;
          }

          if (
            normalizeReservationScheduleDate_(
              row.date
            ) !== targetDate
          ) {
            return false;
          }

          if (
            !staffMap.has(
              staffCode
            )
          ) {
            return false;
          }

          if (
            storeCode &&
            rowStoreCode &&
            rowStoreCode !==
              storeCode
          ) {
            return false;
          }

          if (
            requestedStaffCode &&
            staffCode !==
              requestedStaffCode
          ) {
            return false;
          }

          return true;
        })
        .map(function(row) {

          const staffCode =
            normalizeReservationText_(
              row.staff_code
            ).toUpperCase();

          const staff =
            staffMap.get(
              staffCode
            ) || {};

          return {
            shift_id:
              normalizeReservationText_(
                row.shift_id
              ),
            staff_code:
              staffCode,
            staff_name:
              normalizeReservationText_(
                staff.display_name ||
                staff.staff_name ||
                staffCode
              ),
            date:
              targetDate,
            start_time:
              normalizeReservationScheduleTime_(
                row.start_time
              ),
            end_time:
              normalizeReservationScheduleTime_(
                row.end_time
              ),
            store_code:
              normalizeReservationText_(
                row.store_code
              )
          };
        })
        .sort(function(a, b) {
          return a.start_time.localeCompare(
            b.start_time
          );
        });

    return successResponse({
      date:
        targetDate,
      store_code:
        storeCode || null,
      staff_code:
        requestedStaffCode || null,
      role:
        "STAFF",
      reservation_count:
        reservationRows.length,
      shift_count:
        shiftRows.length,
      reservations:
        reservationRows,
      shifts:
        shiftRows
    });

  } catch (error) {

    logError(
      "getStaffSchedule",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "スタッフ予定の取得中にエラーが発生しました。",
      "STAFF_SCHEDULE_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * 予定取得用の日付正規化
 */
function normalizeReservationScheduleDate_(value) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  const text =
    normalizeReservationText_(
      value
    );

  const direct =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

  if (direct) {
    return (
      direct[1] +
      "-" +
      String(Number(direct[2])).padStart(2, "0") +
      "-" +
      String(Number(direct[3])).padStart(2, "0")
    );
  }

  return text;
}


/**
 * 予定取得用の時刻正規化
 */
function normalizeReservationScheduleTime_(value) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "HH:mm"
    );
  }

  return normalizeReservationTime_(
    value
  );
}
/**
 * トレーナー予定取得API
 *
 * GET:
 * action=getTrainerSchedule
 *
 * params:
 * - date
 * - store_code
 * - staff_code (任意)
 */
function getTrainerSchedule(params) {

  try {

    params = params || {};

    const targetDate =
      normalizeReservationScheduleDate_(
        params.date ||
        Utilities.formatDate(
          new Date(),
          APP_CONFIG.TIMEZONE,
          "yyyy-MM-dd"
        )
      );

    const storeCode =
      normalizeReservationText_(
        params.store_code || "YACHIYO"
      ).toUpperCase();

    const requestedStaffCode =
      normalizeReservationText_(
        params.staff_code || ""
      ).toUpperCase();


    /*
     * TRAINERマスター
     */
    const staffRows =
      getSheetData(
        APP_CONFIG.SHEETS.STAFF
      );

    const allStaffMap =
      new Map();

    staffRows.forEach(function(staff) {

      const code =
        normalizeReservationText_(
          staff.staff_code
        ).toUpperCase();

      if (code) {
        allStaffMap.set(
          code,
          staff
        );
      }
    });

    const trainerMap =
      new Map();

    staffRows.forEach(function(staff) {

      const active =
        staff.active === true ||
        String(staff.active).toUpperCase() === "TRUE";

      const role =
        normalizeProviderRole_(
          staff.role
        );

      const code =
        normalizeReservationText_(
          staff.staff_code
        ).toUpperCase();

      const staffStoreCode =
        normalizeReservationText_(
          staff.store_code
        ).toUpperCase();

      if (!active) {
        return;
      }

      if (role !== "TRAINER") {
        return;
      }

      if (
        storeCode &&
        staffStoreCode &&
        staffStoreCode !== storeCode
      ) {
        return;
      }

      if (
        requestedStaffCode &&
        code !== requestedStaffCode
      ) {
        return;
      }

      trainerMap.set(
        code,
        {
          staff_code: code,
          staff_name:
            normalizeReservationText_(
              staff.display_name ||
              staff.staff_name ||
              code
            ),
          role: "TRAINER",
          store_code: staffStoreCode
        }
      );
    });


    /*
     * TRAINERシフト
     */
    const shiftRows =
      getSheetData(
        APP_CONFIG.SHEETS.STAFF_SHIFTS
      );

    const shifts =
      shiftRows
        .filter(function(shift) {

          const active =
            shift.active === true ||
            String(shift.active).toUpperCase() === "TRUE";

          if (!active) {
            return false;
          }

          const staffCode =
            normalizeReservationText_(
              shift.staff_code
            ).toUpperCase();

          if (
            !trainerMap.has(
              staffCode
            )
          ) {
            return false;
          }

          const shiftDate =
            normalizeReservationScheduleDate_(
              shift.date
            );

          if (
            shiftDate !==
            targetDate
          ) {
            return false;
          }

          const shiftStoreCode =
            normalizeReservationText_(
              shift.store_code
            ).toUpperCase();

          if (
            storeCode &&
            shiftStoreCode &&
            shiftStoreCode !==
            storeCode
          ) {
            return false;
          }

          return true;
        })
        .map(function(shift) {

          const staffCode =
            normalizeReservationText_(
              shift.staff_code
            ).toUpperCase();

          const trainer =
            allStaffMap.get(
              staffCode
            ) ||
            trainerMap.get(
              staffCode
            );

          return {
            shift_id:
              normalizeReservationText_(
                shift.shift_id
              ),

            staff_code:
              staffCode,

            staff_name:
              trainer
                ? trainer.staff_name
                : staffCode,

            date:
             normalizeReservationScheduleDate_ (
                shift.date
              ),

            start_time:
              normalizeReservationScheduleTime_(
                shift.start_time
              ),

            end_time:
              normalizeReservationScheduleTime_(
                shift.end_time
              ),

            store_code:
              normalizeReservationText_(
                shift.store_code ||
                storeCode
              ).toUpperCase()
          };
        })
        .sort(function(a, b) {

          if (
            a.start_time !==
            b.start_time
          ) {
            return a.start_time.localeCompare(
              b.start_time
            );
          }

          return a.staff_code.localeCompare(
            b.staff_code
          );
        });


    /*
     * 予約表示区分判定用サービスマスター
     */
    const serviceRows =
      getSheetData(
        APP_CONFIG.SHEETS.SERVICES
      );

    const serviceMap =
      new Map();

    serviceRows.forEach(function(row) {

      const code =
        normalizeReservationText_(
          row.service_code
        ).toUpperCase();

      if (code) {
        serviceMap.set(
          code,
          row
        );
      }
    });


    /*
     * TRAINER担当予約
     */
    const reservationRows =
      getSheetData(
        APP_CONFIG.SHEETS.RESERVATIONS
      );

    const reservations =
      reservationRows
        .filter(function(reservation) {

          const reservationDate =
            normalizeReservationScheduleDate_(
              reservation.reservation_date ||
              reservation.date
            );

          if (
            reservationDate !==
            targetDate
          ) {
            return false;
          }

          const reservationStoreCode =
            normalizeReservationText_(
              reservation.store_code
            ).toUpperCase();

          if (
            storeCode &&
            reservationStoreCode &&
            reservationStoreCode !==
            storeCode
          ) {
            return false;
          }

          const staffCode =
            normalizeReservationText_(
              reservation.staff_code
            ).toUpperCase();

          if (
            !trainerMap.has(
              staffCode
            )
          ) {
            return false;
          }

          if (
            requestedStaffCode &&
            staffCode !==
            requestedStaffCode
          ) {
            return false;
          }

          const status =
            normalizeReservationText_(
              reservation.status
            ).toUpperCase();

          if (
            status === "CANCELLED"
          ) {
            return false;
          }

          return true;
        })
        .map(function(reservation) {

          const staffCode =
            normalizeReservationText_(
              reservation.staff_code
            ).toUpperCase();

          const trainer =
            trainerMap.get(
              staffCode
            );

          return {
            reservation_id:
              normalizeReservationText_(
                reservation.reservation_id
              ),

            service_code:
              normalizeReservationText_(
                reservation.service_code
              ),

            service_name:
              normalizeReservationText_(
                reservation.service_name
              ),

            staff_code:
              staffCode,

            staff_name:
              normalizeReservationText_(
                reservation.staff_name
              ) ||
              (
                trainer
                  ? trainer.staff_name
                  : staffCode
              ),

            staff_role:
              "TRAINER",

            customer_type:
              normalizeReservationText_(
                reservation.customer_type
              ),

            member_no:
              normalizeReservationText_(
                reservation.member_no
              ),

            customer_name:
              normalizeReservationText_(
                reservation.customer_name
              ),

            customer_email:
              normalizeReservationText_(
                reservation.customer_email
              ),

            customer_phone:
              normalizeReservationText_(
                reservation.customer_phone
              ),

            date:
              normalizeReservationScheduleDate_(
                reservation.reservation_date ||
                reservation.date
              ),

            start_time:
             normalizeReservationScheduleTime_ (
                reservation.start_time
              ),

            end_time:
              normalizeReservationScheduleTime_(
                reservation.end_time
              ),

            status:
              normalizeReservationText_(
                reservation.status
              ).toUpperCase(),

            note:
              normalizeReservationText_(
                reservation.note
              ),

            store_code:
              normalizeReservationText_(
                reservation.store_code ||
                storeCode
              ).toUpperCase(),

            google_event_id:
              normalizeReservationText_(
                reservation.google_event_id
              )
          };
        })
        .sort(function(a, b) {

          if (
            a.start_time !==
            b.start_time
          ) {
            return a.start_time.localeCompare(
              b.start_time
            );
          }

          return a.staff_code.localeCompare(
            b.staff_code
          );
        });


    return successResponse({
      date:
        targetDate,

      store_code:
        storeCode,

      staff_code:
        requestedStaffCode || null,

      role:
        "TRAINER",

      reservation_count:
        reservations.length,

      shift_count:
        shifts.length,

      reservations:
        reservations,

      shifts:
        shifts
    });


  } catch (error) {

    logError(
      "getTrainerSchedule",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "トレーナー予定の取得中にエラーが発生しました。",
      "TRAINER_SCHEDULE_ERROR",
      {
        message:
          error.message
      }
    );
  }
}
/**
 * 予定取得用の日付を yyyy-MM-dd に正規化
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationScheduleDate_(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (
    Object.prototype.toString.call(value) === "[object Date]" &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  const text =
    String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) {
    return text.replace(/\//g, "-");
  }

  const date =
    new Date(text);

  if (!isNaN(date.getTime())) {
    return Utilities.formatDate(
      date,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  return text;
}
function testTrainerShift() {

  const result = saveStaffShift({
    staff_code: "YOSHIMARU",
    store_code: "YACHIYO",
    date: "2026-08-15",
    start_time: "13:00",
    end_time: "18:00"
  });

  Logger.log(
    result.getContent()
  );
}
function testTrainerReservation() {

  const result = createReservation({
    action: "createReservation",

    service_code: "PT60",

    date: "2026-08-15",
    start_time: "14:00",

    staff_code: "YOSHIMARU",

    member_no: "108035",
    customer_name: "森林筋太",
    customer_email: "ichi6kawakami@gmail.com",
    customer_phone: "",

    note: "トレーナー予定画面表示テスト"
  });

  Logger.log(
    result.getContent()
  );
}
function testTrainerScheduleReservation() {

  const result = createReservation({
    action: "createReservation",

    service_code: "PT60",

    date: "2026-08-15",
    start_time: "16:00",

    staff_code: "YOSHIMARU",

    member_no: "108035",
    customer_name: "森林筋太",
    customer_email: "ichi6kawakami@gmail.com",
    customer_phone: "",

    note: "トレーナー予定画面表示テスト"
  });

  Logger.log(
    result.getContent()
  );
}
/**
 * 予約変更API
 *
 * POST:
 * {
 *   action: "updateReservation",
 *   reservation_id: "...",
 *   date: "2026-08-15",
 *   start_time: "17:00",
 *   staff_code: "YOSHIMARU"
 * }
 */
/*
 * IMPORTANT:
 * 予約変更の正本は 32_UpdateReservation.gs の updateReservation()。
 * 29_Reservation.gs に同名関数を残さない。
 */
function updateReservationLegacy29_(params) {

  const lock = LockService.getScriptLock();

  try {

    lock.waitLock(30000);
    params = params || {};

    /*
     * 管理者用予約管理画面からの変更のみ true。
     * お客様側の通常変更は従来どおり変更期限を適用する。
     */
    const adminOverride =
      params._admin_override === true ||
      String(
        params._admin_override || ""
      ).toLowerCase() === "true";

    const reservationId =
      normalizeReservationText_(
        params.reservation_id
      );

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "RESERVATION_ID_REQUIRED"
      );
    }

    /*
     * 現在の予約を取得
     */
    const current =
      findReservationRecordForUpdate_(
        reservationId
      );

    if (!current) {
      return errorResponse(
        "予約が見つかりません。",
        "RESERVATION_NOT_FOUND",
        {
          reservation_id: reservationId
        }
      );
    }

    const currentStatus =
      normalizeReservationText_(
        current.record.status
      ).toUpperCase();

    if (currentStatus !== "RESERVED") {
      return errorResponse(
        "この予約は変更できません。",
        "RESERVATION_NOT_CHANGEABLE",
        {
          reservation_id: reservationId,
          status: currentStatus
        }
      );
    }

    const serviceCode =
      normalizeReservationText_(
        current.record.service_code
      );

    const service =
      getAvailabilityService_(
        serviceCode
      );

    const targetDate =
      normalizeReservationText_(
        params.date ||
        current.record.reservation_date
      );

    const startTime =
      normalizeReservationTime_(
        params.start_time ||
        current.record.start_time
      );

    const requestedStaffCode =
      normalizeReservationText_(
        params.staff_code ||
        current.record.staff_code
      );

    /*
     * 変更期限
     */
    const changeLimitHours =
      getReservationRuleNumber_(
        service.change_limit_hours,
        0
      );

    const currentStartAt =
      createAvailabilityDateTime_(
        normalizeReservationScheduleDate_(
          current.record.reservation_date
        ),
        normalizeReservationScheduleTime_(
          current.record.start_time
        )
      );

    const changeDeadline =
      new Date(
        currentStartAt.getTime() -
        changeLimitHours * 60 * 60 * 1000
      );

    if (
      !adminOverride &&
      new Date().getTime() >=
      changeDeadline.getTime()
    ) {
      return errorResponse(
        "予約変更期限を過ぎています。",
        "CHANGE_DEADLINE_PASSED",
        {
          reservation_id:
            reservationId,

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
     * 新しい枠が実際に予約可能か確認
     */
    const availabilityResponse =
      getAvailableSlots({
        action:
          "getAvailableSlots",

        service_code:
          serviceCode,

        date:
          targetDate,

        staff_code:
          requestedStaffCode
      });

    const availability =
      JSON.parse(
        availabilityResponse.getContent()
      );

    if (!availability.ok) {
      return errorResponse(
        availability.message ||
        "空き枠を確認できませんでした。",
        availability.code ||
        "AVAILABILITY_CHECK_FAILED",
        availability.detail || null
      );
    }

    const slots =
      Array.isArray(
        availability.data &&
        availability.data.slots
      )
        ? availability.data.slots
        : [];

    const selectedSlot =
      slots.find(function(slot) {

        return (
          normalizeReservationTime_(
            slot.start_time
          ) === startTime
        );
      });

    if (!selectedSlot) {
      return errorResponse(
        "指定された変更先は予約できません。",
        "SLOT_NOT_AVAILABLE",
        {
          date:
            targetDate,

          start_time:
            startTime,

          staff_code:
            requestedStaffCode
        }
      );
    }

    const endTime =
      normalizeReservationTime_(
        selectedSlot.end_time
      );

    /*
     * 変更後の担当者情報
     *
     * staff_codeを変更した場合も
     * staff_name・Googleカレンダー件名・通知メールを
     * 新しい担当者に揃える。
     */
    const selectedStaffCandidates =
      Array.isArray(
        selectedSlot.staff_candidates
      )
        ? selectedSlot.staff_candidates
        : [];

    const selectedStaffCandidate =
      selectedStaffCandidates.find(
        function(staff) {
          return (
            normalizeReservationText_(
              staff.staff_code
            ) === requestedStaffCode
          );
        }
      ) || null;

    const updatedStaffName =
      selectedStaffCandidate
        ? normalizeReservationText_(
            selectedStaffCandidate.staff_name
          )
        : normalizeReservationText_(
            current.record.staff_name
          );

    const newStartAt =
      createAvailabilityDateTime_(
        targetDate,
        startTime
      );

    const newEndAt =
      createAvailabilityDateTime_(
        targetDate,
        endTime
      );

    /*
     * Googleカレンダー更新
     */
    const calendarCode =
      normalizeReservationText_(
        current.record.calendar_code ||
        service.calendar_code
      );

    const calendarMaster =
      getCalendarMasterByCode_(
        calendarCode
      );

    const calendar =
      getGoogleCalendarById_(
        calendarMaster.calendar_id
      );

    if (!calendar) {
      throw new Error(
        "Googleカレンダーに接続できません。"
      );
    }

    const googleEventId =
      normalizeReservationText_(
        current.record.google_event_id
      );

    if (!googleEventId) {
      return errorResponse(
        "Googleカレンダー予定IDがありません。",
        "GOOGLE_EVENT_ID_NOT_FOUND",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const event =
      calendar.getEventById(
        googleEventId
      );

    if (!event) {
      return errorResponse(
        "Googleカレンダーの予定が見つかりません。",
        "GOOGLE_EVENT_NOT_FOUND",
        {
          google_event_id:
            googleEventId
        }
      );
    }

    event.setTime(
      newStartAt,
      newEndAt
    );

    event.setTitle(
      buildReservationEventTitle_({
        customerName:
          normalizeReservationText_(
            current.record.customer_name
          ),

        serviceName:
          normalizeReservationText_(
            current.record.service_name
          ),

        staffName:
          updatedStaffName
      })
    );

    /*
     * reservations更新
     */
    const now = new Date();

    updateReservationSheetRow_(
      current,
      {
        reservation_date:
          targetDate,

        start_time:
          startTime,

        end_time:
          endTime,

        start_at:
          formatDateTime_(
            newStartAt
          ),

        end_at:
          formatDateTime_(
            newEndAt
          ),

        staff_code:
          requestedStaffCode,

        staff_name:
          updatedStaffName,

        updated_at:
          now
      }
    );

    /*
     * 履歴
     */
    appendReservationHistory_({

      history_id:
        generateReservationHistoryId_(),

      reservation_id:
        reservationId,

      action:
        "UPDATE",

      old_status:
        currentStatus,

      new_status:
        "RESERVED",

      staff_code:
        requestedStaffCode,

      service_code:
        serviceCode,

      reservation_date:
        targetDate,

      start_time:
        startTime,

      detail:
        JSON.stringify({
          source:
            "WEB_API",

          old_date:
            normalizeReservationScheduleDate_(
              current.record.reservation_date
            ),

          old_start_time:
            normalizeReservationScheduleTime_(
              current.record.start_time
            ),

          new_date:
            targetDate,

          new_start_time:
            startTime,

          google_event_id:
            googleEventId
        }),

      created_at:
        now
    });

    const result = {

      reservation_id:
        reservationId,

      status:
        "RESERVED",

      service_code:
        serviceCode,

      service_name:
        normalizeReservationText_(
          current.record.service_name
        ),

      date:
        targetDate,

      start_time:
        startTime,

      end_time:
        endTime,

      staff_code:
        requestedStaffCode,

      staff_name:
        updatedStaffName,

      old_date:
        normalizeReservationScheduleDate_(
          current.record.reservation_date
        ),

      old_start_time:
        normalizeReservationScheduleTime_(
          current.record.start_time
        ),

      old_end_time:
        normalizeReservationScheduleTime_(
          current.record.end_time
        ),

      google_event_id:
        googleEventId
    };

    logInfo(
      "updateReservation",
      "予約変更成功",
      result
    );

    const updateMailRecord =
      Object.assign(
        {},
        current.record,
        {
          status:
            "RESERVED",

          reservation_date:
            targetDate,

          date:
            targetDate,

          start_time:
            startTime,

          end_time:
            endTime,

          staff_code:
            requestedStaffCode,

          staff_name:
            updatedStaffName,

          old_date:
            normalizeReservationScheduleDate_(
              current.record.reservation_date
            ),

          old_start_time:
            normalizeReservationScheduleTime_(
              current.record.start_time
            ),

          old_end_time:
            normalizeReservationScheduleTime_(
              current.record.end_time
            ),

          google_event_id:
            googleEventId
        }
      );

    sendReservationMailSafely_(
      updateMailRecord,
      "RESERVATION_UPDATED",
      "updateReservation"
    );

    return successResponse(
      result,
      "予約を変更しました。"
    );

  } catch (error) {

    logError(
      "updateReservation",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "予約変更中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );

  } finally {

    try {
      lock.releaseLock();
    } catch (error) {
      // 何もしない
    }
  }
}


/**
 * 管理者用予約管理画面からの予約変更
 *
 * 管理者は change_limit_hours の制限対象外。
 * トークン検証は管理者用予約管理側で実施したうえで、
 * この関数を呼び出す。
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function updateReservationForAdmin_(
  params
) {

  const adminParams =
    Object.assign(
      {},
      params || {},
      {
        _admin_override:
          true
      }
    );

  return updateReservation(
    adminParams
  );
}


/**
 * reservation_idから
 * reservationsシートの行を取得
 */
function findReservationRecordForUpdate_(
  reservationId
) {

  const sheet =
    getSheet(
      APP_CONFIG.SHEETS.RESERVATIONS
    );

  const values =
    sheet
      .getDataRange()
      .getValues();

  if (values.length <= 1) {
    return null;
  }

  const headers =
    values[0].map(function(header) {
      return String(
        header || ""
      ).trim();
    });

  const idIndex =
    headers.indexOf(
      "reservation_id"
    );

  if (idIndex < 0) {
    throw new Error(
      "reservationsシートにreservation_id列がありません。"
    );
  }

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    if (
      normalizeReservationText_(
        values[i][idIndex]
      ) === reservationId
    ) {

      const record = {};

      headers.forEach(
        function(
          header,
          index
        ) {

          if (header) {
            record[header] =
              values[i][index];
          }
        }
      );

      return {
        sheet:
          sheet,

        headers:
          headers,

        row_number:
          i + 1,

        record:
          record
      };
    }
  }

  return null;
}


/**
 * reservationsの既存1行を更新
 */
function updateReservationSheetRow_(
  current,
  changes
) {

  const row =
    current.headers.map(
      function(
        header,
        index
      ) {

        if (
          Object.prototype
            .hasOwnProperty.call(
              changes,
              header
            )
        ) {
          return changes[header];
        }

        return current
          .sheet
          .getRange(
            current.row_number,
            index + 1
          )
          .getValue();
      }
    );

  current
    .sheet
    .getRange(
      current.row_number,
      1,
      1,
      row.length
    )
    .setValues([
      row
    ]);
}


/**
 * PT予約変更テスト
 *
 * 8/15 16:00 → 17:00
 */
function testUpdateTrainerReservation() {

  const result =
    updateReservation({

      action:
        "updateReservation",

      reservation_id:
        "RSV202608141510278628118F5",

      date:
        "2026-08-15",

      start_time:
        "17:00",

      staff_code:
        "YOSHIMARU"
    });

  Logger.log(
    result.getContent()
  );
}
/**
 * 予約キャンセルAPI
 *
 * POST:
 * {
 *   action: "cancelReservation",
 *   reservation_id: "...",
 *   cancel_reason: "テストキャンセル",
 *   cancelled_by: "ADMIN"
 * }
 */
/**
 * 公開用キャンセルAPI
 *
 * 外部からテスト時刻を指定できないようにする。
 */
/*
 * IMPORTANT:
 * キャンセルの正本は 30_Cancel.gs の cancelReservation()。
 * 29_Reservation.gs に同名関数を残さない。
 */
function cancelReservationLegacy29_(params) {

  return cancelReservationCore_(
    params,
    null
  );
}
function cancelReservationCore_(params, nowOverride)  {

  const lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(30000);

    params = params || {};

    const reservationId =
      normalizeReservationText_(
        params.reservation_id
      );

    const cancelReason =
      normalizeReservationText_(
        params.cancel_reason
      );

    const cancelledBy =
      normalizeReservationText_(
        params.cancelled_by || "CUSTOMER"
      ).toUpperCase();

    if (!reservationId) {

      return errorResponse(
        "reservation_idを指定してください。",
        "RESERVATION_ID_REQUIRED"
      );
    }

    /*
     * 現在の予約取得
     *
     * updateReservationで作成済みの
     * 共通検索関数を使用する。
     */
    const current =
      findReservationRecordForUpdate_(
        reservationId
      );

    if (!current) {

      return errorResponse(
        "予約が見つかりません。",
        "RESERVATION_NOT_FOUND",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const currentStatus =
      normalizeReservationText_(
        current.record.status
      ).toUpperCase();

    if (currentStatus !== "RESERVED") {

      return errorResponse(
        "この予約はキャンセルできません。",
        "RESERVATION_NOT_CANCELLABLE",
        {
          reservation_id:
            reservationId,

          status:
            currentStatus
        }
      );
    }

    /*
     * サービス取得
     */
    const serviceCode =
      normalizeReservationText_(
        current.record.service_code
      );

    const service =
      getAvailabilityService_(
        serviceCode
      );

    /*
     * キャンセル期限取得
     */
    const cancelLimitHours =
      getReservationRuleNumber_(
        service.cancel_limit_hours,
        0
      );

    const reservationDate =
      normalizeReservationScheduleDate_(
        current.record.reservation_date
      );

    const startTime =
      normalizeReservationScheduleTime_(
        current.record.start_time
      );

    const startAt =
      createAvailabilityDateTime_(
        reservationDate,
        startTime
      );

    const cancelDeadline =
      new Date(
        startAt.getTime() -
        cancelLimitHours *
          60 *
          60 *
          1000
      );

    /*
 * キャンセル期限判定
 *
 * PERSONALカレンダーを使用する予約は、
 * 期限超過後のキャンセルを「消化扱い」とする。
 *
 * 消化扱いの場合:
 * - status = CONSUMED
 * - Googleカレンダー予定は削除しない
 * - 履歴を残す
 */
const nowForCancel =
  nowOverride
    ? new Date(nowOverride)
    : new Date();

const deadlinePassed =
  nowForCancel.getTime() >=
  cancelDeadline.getTime();

const reservationCalendarCode =
  normalizeReservationText_(
    current.record.calendar_code ||
    service.calendar_code
  ).toUpperCase();

const isPersonalReservation =
  reservationCalendarCode ===
  "PERSONAL";

/*
 * デバッグ確認
 */
Logger.log({
  nowOverride:
    nowOverride,

  nowForCancel:
    formatDateTime_(nowForCancel),

  cancelDeadline:
    formatDateTime_(cancelDeadline),

  deadlinePassed:
    deadlinePassed,

  reservationCalendarCode:
    reservationCalendarCode,

  isPersonalReservation:
    isPersonalReservation
});

if (
  deadlinePassed &&
  isPersonalReservation
) {

  const now =
    new Date();

  const googleEventId =
    normalizeReservationText_(
      current.record.google_event_id
    );

  /*
   * 消化扱いではGoogleカレンダー予定を
   * 削除しない。
   */
  updateReservationSheetRow_(
    current,
    {
      status:
        "CONSUMED",

      cancel_reason:
        cancelReason ||
        "キャンセル期限超過のため消化",

      cancelled_by:
        cancelledBy,

      cancelled_at:
        now,

      updated_at:
        now
    }
  );

  appendReservationHistory_({

    history_id:
      generateReservationHistoryId_(),

    reservation_id:
      reservationId,

    action:
      "CONSUME",

    old_status:
      currentStatus,

    new_status:
      "CONSUMED",

    staff_code:
      normalizeReservationText_(
        current.record.staff_code
      ),

    service_code:
      serviceCode,

    reservation_date:
      reservationDate,

    start_time:
      startTime,

    detail:
      JSON.stringify({

        source:
          nowOverride
            ? "TEST"
            : "WEB_API",

        reason:
          "CANCEL_DEADLINE_PASSED",

        cancel_reason:
          cancelReason,

        cancelled_by:
          cancelledBy,

        cancel_limit_hours:
          cancelLimitHours,

        cancel_deadline:
          formatDateTime_(
            cancelDeadline
          ),

        judged_at:
          formatDateTime_(
            nowForCancel
          ),

        google_event_id:
          googleEventId,

        calendar_event_deleted:
          false
      }),

    created_at:
      now
  });

  const result = {

    reservation_id:
      reservationId,

    old_status:
      currentStatus,

    status:
      "CONSUMED",

    consumed:
      true,

    service_code:
      serviceCode,

    service_name:
      normalizeReservationText_(
        current.record.service_name
      ),

    date:
      reservationDate,

    start_time:
      startTime,

    end_time:
      normalizeReservationScheduleTime_(
        current.record.end_time
      ),

    staff_code:
      normalizeReservationText_(
        current.record.staff_code
      ),

    staff_name:
      normalizeReservationText_(
        current.record.staff_name
      ),

    customer_name:
      normalizeReservationText_(
        current.record.customer_name
      ),

    cancel_reason:
      cancelReason ||
      "キャンセル期限超過のため消化",

    cancelled_by:
      cancelledBy,

    cancel_limit_hours:
      cancelLimitHours,

    cancel_deadline:
      formatDateTime_(
        cancelDeadline
      ),

    judged_at:
      formatDateTime_(
        nowForCancel
      ),

    deadline_passed:
      true,

    google_event_id:
      googleEventId,

    calendar_event_deleted:
      false
  };

  logInfo(
    "cancelReservation",
    "キャンセル期限超過・消化扱い",
    result
  );

  const consumedMailRecord =
    Object.assign(
      {},
      current.record,
      {
        status:
          "CONSUMED",

        reservation_date:
          reservationDate,

        date:
          reservationDate,

        start_time:
          startTime,

        end_time:
          normalizeReservationScheduleTime_(
            current.record.end_time
          ),

        cancel_reason:
          cancelReason ||
          "キャンセル期限超過のため消化",

        cancel_deadline:
          formatDateTime_(
            cancelDeadline
          ),

        judged_at:
          formatDateTime_(
            nowForCancel
          )
      }
    );

  sendReservationMailSafely_(
    consumedMailRecord,
    "RESERVATION_CONSUMED",
    "cancelReservation"
  );

  return successResponse(
    result,
    "キャンセル期限を過ぎているため消化扱いとしました。"
  );
}


/*
 * PERSONAL以外は従来どおり
 * 期限超過キャンセルを拒否する。
 */
if (deadlinePassed) {

  return errorResponse(
    "キャンセル期限を過ぎています。",
    "CANCEL_DEADLINE_PASSED",
    {
      reservation_id:
        reservationId,

      service_code:
        serviceCode,

      cancel_limit_hours:
        cancelLimitHours,

      cancel_deadline:
        formatDateTime_(
          cancelDeadline
        )
    }
  );
}

    /*
     * Googleカレンダー取得
     */
    const calendarCode =
      normalizeReservationText_(
        current.record.calendar_code ||
        service.calendar_code
      );

    const calendarMaster =
      getCalendarMasterByCode_(
        calendarCode
      );

    const calendar =
      getGoogleCalendarById_(
        calendarMaster.calendar_id
      );

    if (!calendar) {

      throw new Error(
        "Googleカレンダーに接続できません。"
      );
    }

    const googleEventId =
      normalizeReservationText_(
        current.record.google_event_id
      );

    if (!googleEventId) {

      return errorResponse(
        "Googleカレンダー予定IDがありません。",
        "GOOGLE_EVENT_ID_NOT_FOUND",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const event =
      calendar.getEventById(
        googleEventId
      );

    if (!event) {

      return errorResponse(
        "Googleカレンダーの予定が見つかりません。",
        "GOOGLE_EVENT_NOT_FOUND",
        {
          reservation_id:
            reservationId,

          google_event_id:
            googleEventId
        }
      );
    }

    /*
     * カレンダーから予約を削除
     */
    event.deleteEvent();

    const now =
      new Date();

    /*
     * reservations更新
     */
    updateReservationSheetRow_(
      current,
      {
        status:
          "CANCELLED",

        cancel_reason:
          cancelReason,

        cancelled_by:
          cancelledBy,

        cancelled_at:
          now,

        updated_at:
          now
      }
    );

    /*
     * 履歴保存
     */
    appendReservationHistory_({

      history_id:
        generateReservationHistoryId_(),

      reservation_id:
        reservationId,

      action:
        "CANCEL",

      old_status:
        currentStatus,

      new_status:
        "CANCELLED",

      staff_code:
        normalizeReservationText_(
          current.record.staff_code
        ),

      service_code:
        serviceCode,

      reservation_date:
        reservationDate,

      start_time:
        startTime,

      detail:
        JSON.stringify({

          source:
            "WEB_API",

          cancel_reason:
            cancelReason,

          cancelled_by:
            cancelledBy,

          cancel_limit_hours:
            cancelLimitHours,

          cancel_deadline:
            formatDateTime_(
              cancelDeadline
            ),

          google_event_id:
            googleEventId
        }),

      created_at:
        now
    });

    const result = {

      reservation_id:
        reservationId,

      status:
        "CANCELLED",

      service_code:
        serviceCode,

      service_name:
        normalizeReservationText_(
          current.record.service_name
        ),

      date:
        reservationDate,

      start_time:
        startTime,

      end_time:
        normalizeReservationScheduleTime_(
          current.record.end_time
        ),

      staff_code:
        normalizeReservationText_(
          current.record.staff_code
        ),

      staff_name:
        normalizeReservationText_(
          current.record.staff_name
        ),

      cancel_reason:
        cancelReason,

      cancelled_by:
        cancelledBy,

      cancel_limit_hours:
        cancelLimitHours,

      cancel_deadline:
        formatDateTime_(
          cancelDeadline
        ),

      google_event_id:
        googleEventId
    };

    logInfo(
      "cancelReservation",
      "予約キャンセル成功",
      result
    );

    const cancelMailRecord =
      Object.assign(
        {},
        current.record,
        {
          status:
            "CANCELLED",

          reservation_date:
            reservationDate,

          date:
            reservationDate,

          start_time:
            startTime,

          end_time:
            normalizeReservationScheduleTime_(
              current.record.end_time
            ),

          cancel_reason:
            cancelReason,

          cancel_deadline:
            formatDateTime_(
              cancelDeadline
            ),

          judged_at:
            formatDateTime_(
              nowForCancel
            )
        }
      );

    sendReservationMailSafely_(
      cancelMailRecord,
      "RESERVATION_CANCELLED",
      "cancelReservation"
    );

    return successResponse(
      result,
      "予約をキャンセルしました。"
    );

  } catch (error) {

    logError(
      "cancelReservation",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "予約キャンセル中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );

  } finally {

    try {

      lock.releaseLock();

    } catch (error) {

      // 何もしない
    }
  }
}


/**
 * 予約メール安全送信
 *
 * 予約・変更・キャンセル処理が正常完了した後、
 * メール送信だけが失敗しても予約API自体を失敗扱いにしない。
 *
 * @param {Object} reservation
 * @param {string} eventType
 * @param {string} source
 * @returns {Object|null}
 */
function sendReservationMailSafely_(
  reservation,
  eventType,
  source
) {

  try {

    return sendReservationMail_(
      reservation,
      eventType
    );

  } catch (error) {

    logError(
      source ||
      "sendReservationMailSafely",
      "予約処理は完了しましたが、メール送信に失敗しました。",
      {
        reservation_id:
          normalizeReservationText_(
            reservation &&
            reservation.reservation_id
          ),

        event_type:
          normalizeReservationText_(
            eventType
          ),

        message:
          error.message,

        stack:
          error.stack
      }
    );

    return null;
  }
}


/**
 * PT通常キャンセルテスト
 *
 * 対象:
 * 2026-08-15 17:00 PT60
 */
function testCancelTrainerReservation() {

  const result =
    cancelReservation({

      action:
        "cancelReservation",

      reservation_id:
        "RSV202608141510278628118F5",

      cancel_reason:
        "キャンセル機能動作テスト",

      cancelled_by:
        "ADMIN"
    });

  Logger.log(
    result.getContent()
  );
}
/**
 * PT期限超過 → 消化扱いテスト
 */
function testConsumeTrainerReservation() {

  /*
   * 1. PTテスト予約を作成
   */
  const createResponse =
    createReservation({

      action:
        "createReservation",

      service_code:
        "PT60",

      date:
        "2026-08-15",

      start_time:
        "16:00",

      staff_code:
        "YOSHIMARU",

      customer_type:
        "MEMBER",

      member_no:
        "108035",

      customer_name:
        "森林筋太",

      customer_email:
        "ichi6kawakami@gmail.com",

      customer_phone:
        "",

      note:
        "PT期限超過・消化扱いテスト"
    });

  const createContent =
    createResponse.getContent();

  Logger.log(
    "1. 予約作成: " +
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
      "テスト予約作成失敗: " +
      createContent
    );
  }


  /*
   * 2. 予約開始2時間前を擬似的に作る
   *
   * PTは3時間前までキャンセル可能。
   * 2時間前なので期限超過。
   */
  const startAt =
    createAvailabilityDateTime_(
      createResult.data.date,
      createResult.data.start_time
    );

  const simulatedNow =
    new Date(
      startAt.getTime() -
      2 * 60 * 60 * 1000
    );

  Logger.log(
    "2. 擬似現在時刻: " +
    formatDateTime_(
      simulatedNow
    )
  );


  /*
   * 3. 内部キャンセル処理
   */
  const cancelResponse =
    cancelReservationCore_(
      {

        reservation_id:
          createResult.data.reservation_id,

        cancel_reason:
          "3時間前以降キャンセルテスト",

        cancelled_by:
          "ADMIN"
      },

      simulatedNow
    );

  const cancelContent =
    cancelResponse.getContent();

  Logger.log(
    "3. 消化処理: " +
    cancelContent
  );

  const cancelResult =
    JSON.parse(
      cancelContent
    );


  /*
   * 4. 判定
   */
  if (
    !cancelResult.ok ||
    !cancelResult.data ||
    cancelResult.data.status !==
      "CONSUMED"
  ) {

    throw new Error(
      "CONSUMEDになっていません: " +
      cancelContent
    );
  }

  if (
    cancelResult.data
      .calendar_event_deleted !==
    false
  ) {

    throw new Error(
      "Googleカレンダー予定が削除されています。"
    );
  }

  Logger.log(
    "★★★★★ PT期限超過 → 消化扱いテスト成功 ★★★★★"
  );
}