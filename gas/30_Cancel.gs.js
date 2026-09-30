/**
 * 予約キャンセルAPI
 *
 * POST JSON例:
 * {
 *   "action": "cancelReservation",
 *   "reservation_id": "RSV202607311507088572019E8",
 *   "cancel_reason": "お客様都合",
 *   "cancelled_by": "CUSTOMER"
 * }
 *
 * cancelled_by例:
 * CUSTOMER
 * STAFF
 * ADMIN
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function cancelReservation(params) {

  return cancelReservationCore_(
    params,
    null
  );
}


/**
 * 予約キャンセル内部処理
 *
 * nowOverrideはテスト専用。
 * 公開APIからは指定できない。
 */
function cancelReservationCore_(
  params,
  nowOverride
) {

  const lock = LockService.getScriptLock();

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
        params.cancelled_by
      ) || "CUSTOMER";

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    /*
     * 予約データ取得
     */
    const reservationInfo =
      findReservationRowById_(
        reservationId
      );

    if (!reservationInfo) {
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
      reservationInfo.record;

    const currentStatus =
      normalizeReservationText_(
        reservation.status
      );

    /*
     * すでにキャンセル済み
     */
    if (currentStatus === "CANCELLED") {
      return errorResponse(
        "この予約はすでにキャンセルされています。",
        "ALREADY_CANCELLED",
        {
          reservation_id:
            reservationId
        }
      );
    }

    /*
     * キャンセル対象外ステータス
     */
    if (
      currentStatus !== "RESERVED" &&
      currentStatus !== "CONFIRMED"
    ) {
      return errorResponse(
        "この予約はキャンセルできる状態ではありません。",
        "INVALID_RESERVATION_STATUS",
        {
          reservation_id:
            reservationId,
          status:
            currentStatus
        }
      );
    }

    /*
     * サービス別キャンセル期限
     */
    const serviceCode =
      normalizeReservationText_(
        reservation.service_code
      );

    const service =
      getAvailabilityService_(
        serviceCode
      );

    const cancelLimitHours =
      getReservationRuleNumber_(
        service.cancel_limit_hours,
        0
      );

    const reservationDate =
      normalizeReservationDateValue_(
        reservation.reservation_date
      );

    const reservationStartTime =
      normalizeReservationSheetTime_(
        reservation.start_time
      );

    const reservationStartAt =
      createAvailabilityDateTime_(
        reservationDate,
        reservationStartTime
      );

    const cancelDeadline =
      new Date(
        reservationStartAt.getTime() -
        cancelLimitHours * 60 * 60 * 1000
      );

    const nowForCancel =
      nowOverride
        ? new Date(nowOverride)
        : new Date();

    const deadlinePassed =
      nowForCancel.getTime() >
      cancelDeadline.getTime();

    const reservationCalendarCode =
      normalizeReservationText_(
        reservation.calendar_code ||
        service.calendar_code
      ).toUpperCase();

    const isPersonalReservation =
      reservationCalendarCode ===
      "PERSONAL";

    /*
     * PERSONALは期限超過後のキャンセルを
     * 通常キャンセルではなく「消化扱い」とする。
     *
     * Googleカレンダー予定は削除しない。
     */
    if (
      deadlinePassed &&
      isPersonalReservation
    ) {

      const now =
        new Date();

      const googleEventId =
        normalizeReservationText_(
          reservation.google_event_id
        );

      updateReservationCancellation_({
        sheet:
          reservationInfo.sheet,

        rowNumber:
          reservationInfo.rowNumber,

        headers:
          reservationInfo.headers,

        values: {
          status:
            "CONSUMED",

          cancel_reason:
            cancelReason ||
            "キャンセル期限超過のため消化",

          cancelled_by:
            cancelledBy,

          cancelled_at:
            now,

          cancel_limit_hours:
            cancelLimitHours,

          updated_at:
            now
        }
      });

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
            reservation.staff_code
          ),

        service_code:
          serviceCode,

        reservation_date:
          reservationDate,

        start_time:
          reservationStartTime,

        detail:
          JSON.stringify({
            source:
              nowOverride
                ? "TEST"
                : "WEB_API",

            reason:
              "CANCEL_DEADLINE_PASSED",

            cancelled_by:
              cancelledBy,

            cancel_reason:
              cancelReason,

            google_event_id:
              googleEventId,

            calendar_event_deleted:
              false,

            cancel_limit_hours:
              cancelLimitHours,

            cancel_deadline:
              formatDateTime_(
                cancelDeadline
              ),

            judged_at:
              formatDateTime_(
                nowForCancel
              )
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
            reservation.service_name
          ),

        date:
          reservationDate,

        start_time:
          reservationStartTime,

        end_time:
          normalizeReservationSheetTime_(
            reservation.end_time
          ),

        staff_code:
          normalizeReservationText_(
            reservation.staff_code
          ),

        staff_name:
          normalizeReservationText_(
            reservation.staff_name
          ),

        customer_name:
          normalizeReservationText_(
            reservation.customer_name
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
          googleEventId || null,

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
          reservation,
          {
            status:
              "CONSUMED",

            reservation_date:
              reservationDate,

            date:
              reservationDate,

            start_time:
              reservationStartTime,

            end_time:
              normalizeReservationSheetTime_(
                reservation.end_time
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

      sendConsumedReservationMailSafely_(
        consumedMailRecord
      );

      return successResponse(
        result,
        "キャンセル期限を過ぎているため消化扱いとしました。"
      );
    }

    /*
     * PERSONAL以外は、ADMINのみ期限後の特例キャンセルを許可し、
     * 履歴へoverrideとして記録する。
     */
    const deadlineOverridden =
      deadlinePassed &&
      cancelledBy === "ADMIN";

    if (
      deadlinePassed &&
      !deadlineOverridden
    ) {
      return errorResponse(
        "この予約はキャンセル受付期限を過ぎています。店舗へご連絡ください。",
        "CANCEL_DEADLINE_PASSED",
        {
          reservation_id:
            reservationId,
          reservation_start_at:
            formatDateTime_(
              reservationStartAt
            ),
          cancel_limit_hours:
            cancelLimitHours,
          cancel_deadline:
            formatDateTime_(
              cancelDeadline
            )
        }
      );
    }

    const calendarCode =
      normalizeReservationText_(
        reservation.calendar_code
      );

    const calendarId =
      normalizeReservationText_(
        reservation.calendar_id
      );

    const googleEventId =
      normalizeReservationText_(
        reservation.google_event_id
      );

    let calendarEventDeleted = false;
    let calendarEventFound = false;

    /*
     * Googleカレンダー予定削除
     */
    if (googleEventId) {

      const calendar =
        getReservationCalendar_({
          calendarCode:
            calendarCode,
          calendarId:
            calendarId
        });

      if (!calendar) {
        return errorResponse(
          "予約先のGoogleカレンダーに接続できません。",
          "CALENDAR_NOT_FOUND",
          {
            reservation_id:
              reservationId,
            calendar_code:
              calendarCode,
            calendar_id:
              calendarId
          }
        );
      }

      const event =
        getReservationCalendarEvent_(
          calendar,
          googleEventId
        );

      if (event) {

        calendarEventFound = true;

        event.deleteEvent();

        calendarEventDeleted = true;
      }
    }

    const now = new Date();

    /*
     * reservationsシート更新
     */
    updateReservationCancellation_({
      sheet:
        reservationInfo.sheet,
      rowNumber:
        reservationInfo.rowNumber,
      headers:
        reservationInfo.headers,
      values: {
        status:
          "CANCELLED",

        cancel_reason:
          cancelReason,

        cancelled_by:
          cancelledBy,

        cancelled_at:
          now,

        cancel_limit_hours:
          cancelLimitHours,

        updated_at:
          now
      }
    });

    /*
     * 履歴追加
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
          reservation.staff_code
        ),

      service_code:
        normalizeReservationText_(
          reservation.service_code
        ),

      reservation_date:
        normalizeReservationDateValue_(
          reservation.reservation_date
        ),

      start_time:
        normalizeReservationSheetTime_(
          reservation.start_time
        ),

      detail:
        JSON.stringify({
          source:
            "WEB_API",

          cancelled_by:
            cancelledBy,

          cancel_reason:
            cancelReason,

          google_event_id:
            googleEventId,

          calendar_event_found:
            calendarEventFound,

          calendar_event_deleted:
            calendarEventDeleted,

          cancel_limit_hours:
            cancelLimitHours,

          cancel_deadline:
            formatDateTime_(
              cancelDeadline
            ),

          deadline_passed:
            deadlinePassed,

          deadline_overridden:
            deadlineOverridden
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
        "CANCELLED",

      service_code:
        normalizeReservationText_(
          reservation.service_code
        ),

      service_name:
        normalizeReservationText_(
          reservation.service_name
        ),

      date:
        normalizeReservationDateValue_(
          reservation.reservation_date
        ),

      start_time:
        normalizeReservationSheetTime_(
          reservation.start_time
        ),

      end_time:
        normalizeReservationSheetTime_(
          reservation.end_time
        ),

      staff_code:
        normalizeReservationText_(
          reservation.staff_code
        ),

      staff_name:
        normalizeReservationText_(
          reservation.staff_name
        ),

      customer_name:
        normalizeReservationText_(
          reservation.customer_name
        ),

      cancel_reason:
        cancelReason,

      cancelled_by:
        cancelledBy,

      cancelled_at:
        formatDateTime_(
          now
        ),

      cancel_limit_hours:
        cancelLimitHours,

      cancel_deadline:
        formatDateTime_(
          cancelDeadline
        ),

      deadline_overridden:
        deadlineOverridden,

      google_event_id:
        googleEventId || null,

      calendar_event_found:
        calendarEventFound,

      calendar_event_deleted:
        calendarEventDeleted
    };

    logInfo(
      "cancelReservation",
      "予約キャンセル成功",
      result
    );

    /*
     * 通常キャンセルメール
     *
     * キャンセル処理自体は完了済みなので、
     * メール送信失敗だけでキャンセルを失敗扱いにしない。
     */
    const cancelMailRecord =
      Object.assign(
        {},
        reservation,
        {
          status:
            "CANCELLED",

          reservation_date:
            reservationDate,

          date:
            reservationDate,

          start_time:
            reservationStartTime,

          end_time:
            normalizeReservationSheetTime_(
              reservation.end_time
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

    sendCancelReservationMailSafely_(
      cancelMailRecord
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
      // ロック未取得時は何もしない
    }
  }
}



/**
 * 消化扱い予約を予約状態へ戻す
 *
 * ADMIN専用。
 * 原則として予約開始前のみ復旧可能。
 *
 * POST:
 * {
 *   action: "restoreConsumedReservation",
 *   reservation_id: "...",
 *   restored_by: "ADMIN",
 *   restore_reason: "会員より受講希望の連絡あり"
 * }
 */
function restoreConsumedReservation(params) {

  const lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(30000);

    params = params || {};

    const reservationId =
      normalizeReservationText_(
        params.reservation_id
      );

    const restoredBy =
      normalizeReservationText_(
        params.restored_by || ""
      ).toUpperCase();

    const restoreReason =
      normalizeReservationText_(
        params.restore_reason
      );

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "RESERVATION_ID_REQUIRED"
      );
    }

    if (restoredBy !== "ADMIN") {
      return errorResponse(
        "消化扱いからの復旧は管理者のみ実行できます。",
        "ADMIN_REQUIRED",
        {
          restored_by:
            restoredBy
        }
      );
    }

    const reservationInfo =
      findReservationRowById_(
        reservationId
      );

    if (!reservationInfo) {
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
      reservationInfo.record;

    const currentStatus =
      normalizeReservationText_(
        reservation.status
      ).toUpperCase();

    if (currentStatus !== "CONSUMED") {
      return errorResponse(
        "この予約は消化扱いではありません。",
        "RESERVATION_NOT_CONSUMED",
        {
          reservation_id:
            reservationId,

          status:
            currentStatus
        }
      );
    }

    const reservationDate =
      normalizeReservationDateValue_(
        reservation.reservation_date
      );

    const startTime =
      normalizeReservationSheetTime_(
        reservation.start_time
      );

    const startAt =
      createAvailabilityDateTime_(
        reservationDate,
        startTime
      );

    if (
      new Date().getTime() >=
      startAt.getTime()
    ) {
      return errorResponse(
        "予約開始時刻を過ぎているため、通常の復旧はできません。",
        "RESTORE_DEADLINE_PASSED",
        {
          reservation_id:
            reservationId,

          reservation_start_at:
            formatDateTime_(
              startAt
            )
        }
      );
    }

    /*
     * 消化扱いではGoogleカレンダー予定を残す仕様。
     * 復旧前に予定が存在することを確認する。
     */
    const calendarCode =
      normalizeReservationText_(
        reservation.calendar_code
      );

    const calendarId =
      normalizeReservationText_(
        reservation.calendar_id
      );

    let calendar = null;

    if (calendarId) {
      calendar =
        getGoogleCalendarById_(
          calendarId
        );
    }

    if (
      !calendar &&
      calendarCode
    ) {
      const calendarMaster =
        getCalendarMasterByCode_(
          calendarCode
        );

      calendar =
        getGoogleCalendarById_(
          calendarMaster.calendar_id
        );
    }

    if (!calendar) {
      return errorResponse(
        "予約先のGoogleカレンダーに接続できません。",
        "CALENDAR_NOT_FOUND",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const googleEventId =
      normalizeReservationText_(
        reservation.google_event_id
      );

    if (!googleEventId) {
      return errorResponse(
        "予約にGoogleカレンダー予定IDがありません。",
        "GOOGLE_EVENT_ID_NOT_SET",
        {
          reservation_id:
            reservationId
        }
      );
    }

    const calendarEvent =
      calendar.getEventById(
        googleEventId
      );

    if (!calendarEvent) {
      return errorResponse(
        "Googleカレンダーの予約予定が見つかりません。",
        "CALENDAR_EVENT_NOT_FOUND",
        {
          reservation_id:
            reservationId,

          google_event_id:
            googleEventId
        }
      );
    }

    const now =
      new Date();

    /*
     * 現在状態をRESERVEDへ戻す。
     * 消化理由等は履歴に残っているため、
     * 現在行のキャンセル情報はクリアする。
     */
    updateReservationCancellation_({
      sheet:
        reservationInfo.sheet,

      rowNumber:
        reservationInfo.rowNumber,

      headers:
        reservationInfo.headers,

      values: {
        status:
          "RESERVED",

        cancel_reason:
          "",

        cancelled_by:
          "",

        cancelled_at:
          "",

        updated_at:
          now
      }
    });

    appendReservationHistory_({
      history_id:
        generateReservationHistoryId_(),

      reservation_id:
        reservationId,

      action:
        "RESTORE",

      old_status:
        "CONSUMED",

      new_status:
        "RESERVED",

      staff_code:
        normalizeReservationText_(
          reservation.staff_code
        ),

      service_code:
        normalizeReservationText_(
          reservation.service_code
        ),

      reservation_date:
        reservationDate,

      start_time:
        startTime,

      detail:
        JSON.stringify({
          source:
            "ADMIN",

          restored_by:
            restoredBy,

          restore_reason:
            restoreReason,

          google_event_id:
            googleEventId,

          calendar_event_preserved:
            true
        }),

      created_at:
        now
    });

    const result = {
      reservation_id:
        reservationId,

      old_status:
        "CONSUMED",

      status:
        "RESERVED",

      restored:
        true,

      restored_by:
        restoredBy,

      restore_reason:
        restoreReason,

      service_code:
        normalizeReservationText_(
          reservation.service_code
        ),

      service_name:
        normalizeReservationText_(
          reservation.service_name
        ),

      date:
        reservationDate,

      start_time:
        startTime,

      end_time:
        normalizeReservationSheetTime_(
          reservation.end_time
        ),

      staff_code:
        normalizeReservationText_(
          reservation.staff_code
        ),

      staff_name:
        normalizeReservationText_(
          reservation.staff_name
        ),

      customer_name:
        normalizeReservationText_(
          reservation.customer_name
        ),

      google_event_id:
        googleEventId,

      calendar_event_preserved:
        true
    };

    logInfo(
      "restoreConsumedReservation",
      "消化扱い予約の復旧成功",
      result
    );

    const restoreMailRecord =
      Object.assign(
        {},
        reservation,
        {
          status:
            "RESERVED",

          reservation_date:
            reservationDate,

          date:
            reservationDate,

          start_time:
            startTime,

          end_time:
            normalizeReservationSheetTime_(
              reservation.end_time
            ),

          restored_by:
            restoredBy,

          restore_reason:
            restoreReason
        }
      );

    sendRestoreReservationMailSafely_(
      restoreMailRecord
    );

    return successResponse(
      result,
      "予約を復旧しました。"
    );

  } catch (error) {

    logError(
      "restoreConsumedReservation",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "予約復旧中にエラーが発生しました。",
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
 * 予約復旧メール安全送信
 */
function sendRestoreReservationMailSafely_(
  reservation
) {

  try {

    return sendReservationMail_(
      reservation,
      "RESERVATION_RESTORED"
    );

  } catch (error) {

    logError(
      "restoreReservationMail",
      "予約復旧は完了しましたが、復旧通知メールの送信に失敗しました。",
      {
        reservation_id:
          normalizeReservationText_(
            reservation &&
            reservation.reservation_id
          ),

        event_type:
          "RESERVATION_RESTORED",

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
 * 消化扱い → 予約復旧 結合テスト
 *
 * 既存のCONSUMED予約を1件探して、
 * 開始前であればADMIN復旧する。
 */
function testRestoreConsumedReservation() {

  const sheet =
    getSheet(
      APP_CONFIG.SHEETS.RESERVATIONS
    );

  const values =
    sheet.getDataRange().getValues();

  if (values.length <= 1) {
    throw new Error(
      "reservationsにデータがありません。"
    );
  }

  const headers =
    values[0].map(function(header) {
      return String(
        header || ""
      ).trim();
    });

  const statusIndex =
    headers.indexOf("status");

  const reservationIdIndex =
    headers.indexOf("reservation_id");

  const dateIndex =
    headers.indexOf("reservation_date");

  const startTimeIndex =
    headers.indexOf("start_time");

  if (
    statusIndex < 0 ||
    reservationIdIndex < 0 ||
    dateIndex < 0 ||
    startTimeIndex < 0
  ) {
    throw new Error(
      "reservationsシートの必要列が不足しています。"
    );
  }

  let targetReservationId = "";

  for (
    let i = 1;
    i < values.length;
    i++
  ) {

    const status =
      normalizeReservationText_(
        values[i][statusIndex]
      ).toUpperCase();

    if (status !== "CONSUMED") {
      continue;
    }

    const date =
      normalizeReservationDateValue_(
        values[i][dateIndex]
      );

    const time =
      normalizeReservationSheetTime_(
        values[i][startTimeIndex]
      );

    const startAt =
      createAvailabilityDateTime_(
        date,
        time
      );

    if (
      startAt.getTime() >
      new Date().getTime()
    ) {
      targetReservationId =
        normalizeReservationText_(
          values[i][reservationIdIndex]
        );

      break;
    }
  }

  if (!targetReservationId) {
    throw new Error(
      "開始前のCONSUMED予約が見つかりません。"
    );
  }

  Logger.log(
    "復旧対象: " +
    targetReservationId
  );

  const response =
    restoreConsumedReservation({
      action:
        "restoreConsumedReservation",

      reservation_id:
        targetReservationId,

      restored_by:
        "ADMIN",

      restore_reason:
        "消化扱いから受講へ戻す動作テスト"
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
    !result.ok ||
    !result.data ||
    result.data.status !==
      "RESERVED"
  ) {
    throw new Error(
      "予約復旧テストに失敗しました: " +
      content
    );
  }

  Logger.log(
    "★★★★★ 消化扱い→予約復旧テスト成功 ★★★★★"
  );
}


/**
 * PT消化扱いメール安全送信
 *
 * @param {Object} reservation
 * @returns {Object|null}
 */
function sendConsumedReservationMailSafely_(
  reservation
) {

  try {

    return sendReservationMail_(
      reservation,
      "RESERVATION_CONSUMED"
    );

  } catch (error) {

    logError(
      "consumedReservationMail",
      "消化扱い処理は完了しましたが、通知メールの送信に失敗しました。",
      {
        reservation_id:
          normalizeReservationText_(
            reservation &&
            reservation.reservation_id
          ),

        event_type:
          "RESERVATION_CONSUMED",

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
 * 通常キャンセルメール安全送信
 *
 * @param {Object} reservation
 * @returns {Object|null}
 */
function sendCancelReservationMailSafely_(
  reservation
) {

  try {

    return sendReservationMail_(
      reservation,
      "RESERVATION_CANCELLED"
    );

  } catch (error) {

    logError(
      "cancelReservationMail",
      "予約キャンセルは完了しましたが、キャンセル通知メールの送信に失敗しました。",
      {
        reservation_id:
          normalizeReservationText_(
            reservation &&
            reservation.reservation_id
          ),

        event_type:
          "RESERVATION_CANCELLED",

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
 * reservation_idから予約行を取得
 *
 * @param {string} reservationId
 * @returns {Object|null}
 */
function findReservationRowById_(
  reservationId
) {

  const sheet =
    getSheet(
      APP_CONFIG.SHEETS.RESERVATIONS
    );

  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {
    return null;
  }

  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getValues();

  const headers =
    values[0].map(header =>
      String(header || "").trim()
    );

  const reservationIdIndex =
    headers.indexOf(
      "reservation_id"
    );

  if (reservationIdIndex === -1) {
    throw new Error(
      "reservationsシートにreservation_id列がありません。"
    );
  }

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {

    const rowReservationId =
      normalizeReservationText_(
        values[rowIndex][
          reservationIdIndex
        ]
      );

    if (
      rowReservationId ===
      reservationId
    ) {

      const record = {};

      headers.forEach(
        (header, columnIndex) => {

          if (header) {
            record[header] =
              values[rowIndex][
                columnIndex
              ];
          }
        }
      );

      return {
        sheet:
          sheet,

        headers:
          headers,

        rowNumber:
          rowIndex + 1,

        record:
          record
      };
    }
  }

  return null;
}


/**
 * キャンセル情報をreservationsシートへ反映
 *
 * @param {Object} options
 */
function updateReservationCancellation_(
  options
) {

  const sheet =
    options.sheet;

  const rowNumber =
    options.rowNumber;

  const headers =
    options.headers || [];

  const values =
    options.values || {};

  const requiredHeaders = [
    "status",
    "updated_at"
  ];

  const missingHeaders =
    requiredHeaders.filter(header =>
      !headers.includes(header)
    );

  if (missingHeaders.length > 0) {
    throw new Error(
      "reservationsシートに必要な列がありません: " +
      missingHeaders.join(", ")
    );
  }

  Object.keys(values).forEach(key => {

    const columnIndex =
      headers.indexOf(key);

    /*
     * 任意列は存在する場合のみ更新
     */
    if (columnIndex === -1) {
      return;
    }

    sheet
      .getRange(
        rowNumber,
        columnIndex + 1
      )
      .setValue(
        values[key]
      );
  });
}


/**
 * 予約データに設定されたカレンダーを取得
 *
 * @param {Object} options
 * @returns {GoogleAppsScript.Calendar.Calendar|null}
 */
function getReservationCalendar_(
  options
) {

  const calendarCode =
    normalizeReservationText_(
      options.calendarCode
    );

  const calendarId =
    normalizeReservationText_(
      options.calendarId
    );

  /*
   * calendar_codeを優先
   */
  if (calendarCode) {

    const calendarMaster =
      getCalendarMasterByCode_(
        calendarCode
      );

    return getGoogleCalendarById_(
      calendarMaster.calendar_id
    );
  }

  /*
   * 古い予約データなどで
   * calendar_codeがない場合
   */
  if (calendarId) {
    return getGoogleCalendarById_(
      calendarId
    );
  }

  return null;
}


/**
 * Googleカレンダーイベント取得
 *
 * @param {GoogleAppsScript.Calendar.Calendar} calendar
 * @param {string} googleEventId
 * @returns {GoogleAppsScript.Calendar.CalendarEvent|null}
 */
function getReservationCalendarEvent_(
  calendar,
  googleEventId
) {

  try {

    let event =
      calendar.getEventById(
        googleEventId
      );

    if (event) {
      return event;
    }

    /*
     * 環境によっては@google.comを除いたIDで
     * 取得できる場合があるため再試行
     */
    const shortEventId =
      googleEventId.replace(
        /@google\.com$/,
        ""
      );

    if (
      shortEventId !==
      googleEventId
    ) {

      event =
        calendar.getEventById(
          shortEventId
        );
    }

    return event || null;

  } catch (error) {

    logWarn(
      "getReservationCalendarEvent",
      "Googleカレンダーイベントを取得できませんでした。",
      {
        google_event_id:
          googleEventId,

        message:
          error.message
      }
    );

    return null;
  }
}


/**
 * シート上の日付をyyyy-MM-ddへ変換
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationDateValue_(
  value
) {

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

  return normalizeReservationText_(
    value
  );
}


/**
 * シート上の時刻をHH:mmへ変換
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationSheetTime_(
  value
) {

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

  const text =
    normalizeReservationText_(
      value
    );

  if (!text) {
    return "";
  }

  const match =
    text.match(
      /^(\d{1,2}):(\d{2})/
    );

  if (!match) {
    return text;
  }

  return (
    String(
      Number(match[1])
    ).padStart(2, "0") +
    ":" +
    match[2]
  );
}
/**
 * キャンセル期限判定テスト
 *
 * 1時間後の予約に対してcancel_limit_hours=3なら
 * CUSTOMERはキャンセル不可、ADMINは特例許可になることを確認する。
 *
 * カレンダーやシートは変更しない。
 */
function testCancelReservationDeadline() {

  const now =
    new Date();

  const reservationStartAt =
    new Date(
      now.getTime() +
      60 * 60 * 1000
    );

  const cancelLimitHours =
    3;

  const cancelDeadline =
    new Date(
      reservationStartAt.getTime() -
      cancelLimitHours * 60 * 60 * 1000
    );

  const deadlinePassed =
    now.getTime() >
    cancelDeadline.getTime();

  const customerAllowed =
    !deadlinePassed;

  const adminAllowed =
    !deadlinePassed ||
    true;

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
      cancel_limit_hours:
        cancelLimitHours,
      cancel_deadline:
        formatDateTime_(
          cancelDeadline
        ),
      deadline_passed:
        deadlinePassed,
      customer_allowed:
        customerAllowed,
      admin_allowed:
        adminAllowed
    })
  );

  if (
    !deadlinePassed ||
    customerAllowed ||
    !adminAllowed
  ) {
    throw new Error(
      "キャンセル期限判定が正しくありません。"
    );
  }

  Logger.log(
    "キャンセル期限判定テスト成功"
  );
}


/**
 * 予約キャンセル結合テスト
 *
 * 優先順位:
 * 1. reservationsシートに残っている有効なテスト予約を使用
 * 2. 有効なテスト予約がなければ、空き枠を自動取得して新規作成
 *
 * これにより、当日の空き枠が0件でも、
 * 既存のテスト予約があればキャンセルテストを実行できる。
 */
function testCancelReservation() {

  let reservationId = "";
  let googleEventId = "";
  let calendarCode = "";
  let calendarId = "";

  /*
   * 既存の有効なテスト予約を探す
   */
  const existingTestReservation =
    findLatestActiveTestReservation_();

  if (existingTestReservation) {

    reservationId =
      normalizeReservationText_(
        existingTestReservation.reservation_id
      );

    googleEventId =
      normalizeReservationText_(
        existingTestReservation.google_event_id
      );

    calendarCode =
      normalizeReservationText_(
        existingTestReservation.calendar_code
      );

    calendarId =
      normalizeReservationText_(
        existingTestReservation.calendar_id
      );

    Logger.log(
      "1. 既存テスト予約を使用: " +
      reservationId
    );

  } else {

    const serviceCode =
      "PT60";

    const targetDate =
      "2026-08-01";

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
        "有効なテスト予約も空き枠もありません。先にテスト予約を1件作成してください: " +
        availabilityContent
      );
    }

    const selectedSlot =
      availabilityResult.data.slots[0];

    const createResponse =
      createReservation({
        action:
          "createReservation",
        service_code:
          serviceCode,
        date:
          selectedSlot.date,
        start_time:
          selectedSlot.start_time,
        member_no:
          "FRGTEST_CANCEL001",
        customer_name:
          "キャンセル結合テスト",
        customer_email:
          "test@example.com",
        customer_phone:
          "09012345678",
        note:
          "キャンセルAPI結合テスト"
      });

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

    reservationId =
      createResult.data.reservation_id;

    googleEventId =
      createResult.data.google_event_id;

    calendarCode =
      createResult.data.calendar_code;

    calendarId =
      createResult.data.calendar_id;
  }

  /*
   * ADMINキャンセル
   */
  const cancelResponse =
    cancelReservation({
      action:
        "cancelReservation",
      reservation_id:
        reservationId,
      cancel_reason:
        "キャンセルAPI結合テスト",
      cancelled_by:
        "ADMIN"
    });

  const cancelContent =
    cancelResponse.getContent();

  Logger.log(
    "3. キャンセル結果: " +
    cancelContent
  );

  const cancelResult =
    JSON.parse(
      cancelContent
    );

  if (
    !cancelResult.ok ||
    !cancelResult.data
  ) {
    throw new Error(
      "予約キャンセルに失敗しました: " +
      cancelContent
    );
  }

  if (
    cancelResult.data.status !==
    "CANCELLED"
  ) {
    throw new Error(
      "キャンセル後のstatusが正しくありません: " +
      cancelContent
    );
  }

  if (
    cancelResult.data.calendar_event_found !==
      true ||
    cancelResult.data.calendar_event_deleted !==
      true
  ) {
    throw new Error(
      "Googleカレンダー予定を削除できていません: " +
      cancelContent
    );
  }

  /*
   * 予約情報再取得
   */
  const getResponse =
    getReservation({
      reservation_id:
        reservationId
    });

  const getContent =
    getResponse.getContent();

  Logger.log(
    "4. キャンセル後予約取得結果: " +
    getContent
  );

  const getResult =
    JSON.parse(
      getContent
    );

  if (
    !getResult.ok ||
    !getResult.data ||
    getResult.data.status !==
      "CANCELLED"
  ) {
    throw new Error(
      "キャンセル後の予約情報が正しくありません: " +
      getContent
    );
  }

  /*
   * Googleカレンダーから削除済みか再確認
   *
   * deleteEvent()直後はgetEventById()が一時的に
   * 削除前のイベントを返す場合があるため、
   * 対象日の予定一覧を最大5回確認する。
   */
  const calendar =
    getReservationCalendar_({
      calendarCode:
        calendarCode,
      calendarId:
        calendarId
    });

  const reservationDate =
    getResult.data.date;

  let calendarEventStillExists =
    false;

  for (
    let retry = 0;
    retry < 5;
    retry++
  ) {

    calendarEventStillExists =
      isCalendarEventPresentOnDate_(
        calendar,
        reservationDate,
        googleEventId
      );

    if (!calendarEventStillExists) {
      break;
    }

    Utilities.sleep(
      1000
    );
  }

  if (calendarEventStillExists) {
    throw new Error(
      "Googleカレンダー予定が削除確認後も残っています: " +
      googleEventId
    );
  }

  /*
   * 二重キャンセル拒否
   */
  const secondCancelResponse =
    cancelReservation({
      action:
        "cancelReservation",
      reservation_id:
        reservationId,
      cancel_reason:
        "二重キャンセル確認",
      cancelled_by:
        "ADMIN"
    });

  const secondCancelContent =
    secondCancelResponse.getContent();

  Logger.log(
    "5. 二重キャンセル結果: " +
    secondCancelContent
  );

  const secondCancelResult =
    JSON.parse(
      secondCancelContent
    );

  if (
    secondCancelResult.ok ||
    secondCancelResult.code !==
      "ALREADY_CANCELLED"
  ) {
    throw new Error(
      "二重キャンセル拒否が正しく動作していません: " +
      secondCancelContent
    );
  }

  Logger.log(
    "予約キャンセル結合テスト成功: " +
    reservationId
  );
}


/**
 * 指定日のGoogleカレンダー予定一覧に
 * 対象イベントIDが存在するか確認
 *
 * @param {GoogleAppsScript.Calendar.Calendar} calendar
 * @param {string} targetDate
 * @param {string} googleEventId
 * @returns {boolean}
 */
function isCalendarEventPresentOnDate_(
  calendar,
  targetDate,
  googleEventId
) {

  if (
    !calendar ||
    !targetDate ||
    !googleEventId
  ) {
    return false;
  }

  const startDate =
    parseDateStart_(
      targetDate
    );

  const endDate =
    new Date(
      startDate.getTime()
    );

  endDate.setDate(
    endDate.getDate() + 1
  );

  const targetId =
    normalizeReservationText_(
      googleEventId
    ).replace(
      /@google\.com$/i,
      ""
    );

  return calendar
    .getEvents(
      startDate,
      endDate
    )
    .some(function(event) {

      const eventId =
        normalizeReservationText_(
          event.getId()
        ).replace(
          /@google\.com$/i,
          ""
        );

      return eventId === targetId;
    });
}


/**
 * reservationsシートから
 * 最新の有効なテスト予約を取得
 *
 * 対象:
 * - statusがRESERVEDまたはCONFIRMED
 * - member_noがFRGTESTで始まる
 * - google_event_idが存在する
 *
 * @returns {Object|null}
 */
function findLatestActiveTestReservation_() {

  const sheet =
    getSheet(
      APP_CONFIG.SHEETS.RESERVATIONS
    );

  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  if (
    lastRow < 2 ||
    lastColumn < 1
  ) {
    return null;
  }

  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getValues();

  const headers =
    values[0].map(function(header) {
      return String(
        header || ""
      ).trim();
    });

  const records =
    values
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
      })
      .filter(function(record) {

        const status =
          normalizeReservationText_(
            record.status
          );

        const memberNo =
          normalizeReservationText_(
            record.member_no
          );

        const googleEventId =
          normalizeReservationText_(
            record.google_event_id
          );

        return (
          (
            status === "RESERVED" ||
            status === "CONFIRMED"
          ) &&
          memberNo.indexOf(
            "FRGTEST"
          ) === 0 &&
          Boolean(
            googleEventId
          )
        );
      });

  if (records.length === 0) {
    return null;
  }

  return records[
    records.length - 1
  ];
}


/**
 * 直近の予約復旧メール送信確認
 *
 * testRestoreConsumedReservation() 実行後に使用する。
 * mail_logs から RESERVATION_RESTORED の
 * CUSTOMER / ADMIN が SENT か確認する。
 */
function testRestoreReservationMailLogs() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        "mail_logs"
      );

  if (!sheet) {
    throw new Error(
      "mail_logsシートがありません。"
    );
  }

  const values =
    sheet
      .getDataRange()
      .getValues();

  if (values.length <= 1) {
    throw new Error(
      "mail_logsにデータがありません。"
    );
  }

  const headers =
    values[0].map(
      function(header) {
        return String(
          header || ""
        ).trim();
      }
    );

  const records =
    values
      .slice(1)
      .map(
        function(row) {

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
        }
      )
      .filter(
        function(record) {

          return (
            normalizeReservationText_(
              record.event_type
            ).toUpperCase() ===
            "RESERVATION_RESTORED"
          );
        }
      );

  if (records.length === 0) {
    throw new Error(
      "RESERVATION_RESTORED のメールログがありません。"
    );
  }

  /*
   * 最後に記録された復旧予約IDを対象とする。
   */
  const latest =
    records[
      records.length - 1
    ];

  const reservationId =
    normalizeReservationText_(
      latest.reservation_id
    );

  const targetRecords =
    records.filter(
      function(record) {

        return (
          normalizeReservationText_(
            record.reservation_id
          ) ===
          reservationId
        );
      }
    );

  const required = [
    "CUSTOMER",
    "ADMIN"
  ];

  const result =
    required.map(
      function(mailType) {

        const sent =
          targetRecords.some(
            function(record) {

              return (
                normalizeReservationText_(
                  record.mail_type
                ).toUpperCase() ===
                  mailType &&
                normalizeReservationText_(
                  record.status
                ).toUpperCase() ===
                  "SENT"
              );
            }
          );

        return {
          reservation_id:
            reservationId,

          event_type:
            "RESERVATION_RESTORED",

          mail_type:
            mailType,

          sent:
            sent
        };
      }
    );

  Logger.log(
    JSON.stringify(
      result
    )
  );

  const missing =
    result.filter(
      function(item) {
        return !item.sent;
      }
    );

  if (missing.length > 0) {
    throw new Error(
      "予約復旧メールが不足しています: " +
      JSON.stringify(
        missing
      )
    );
  }

  Logger.log(
    "★★★★★ 予約復旧メール確認成功 ★★★★★"
  );
}

