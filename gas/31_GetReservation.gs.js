/**
 * 予約情報取得API
 *
 * GET例:
 * ?action=getReservation
 * &reservation_id=RSV2026073115385016313D939
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function getReservation(params) {

  try {

    params = params || {};

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

    /*
     * 30_Cancel.gsにある共通検索関数を利用
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

    const result =
      buildReservationResponse_(
        reservation
      );

    logInfo(
      "getReservation",
      "予約情報取得成功",
      {
        reservation_id:
          reservationId,
        status:
          result.status
      }
    );

    return successResponse(
      result,
      "予約情報を取得しました。"
    );

  } catch (error) {

    logError(
      "getReservation",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      "予約情報の取得中にエラーが発生しました。",
      "SYSTEM_ERROR",
      {
        message:
          error.message
      }
    );
  }
}


/**
 * 予約シートのレコードをAPIレスポンス形式へ変換
 *
 * @param {Object} reservation
 * @returns {Object}
 */
function buildReservationResponse_(
  reservation
) {

  const date =
    normalizeReservationDateValue_(
      reservation.reservation_date
    );

  const startTime =
    normalizeReservationSheetTime_(
      reservation.start_time
    );

  const endTime =
    normalizeReservationSheetTime_(
      reservation.end_time
    );

  /*
   * reservationsシートの実列名はduration。
   * 旧列名duration_minutesにも対応する。
   */
  const durationValue =
    reservation.duration !== "" &&
    reservation.duration !== null &&
    reservation.duration !== undefined
      ? reservation.duration
      : reservation.duration_minutes;

  return {
    reservation_id:
      normalizeReservationText_(
        reservation.reservation_id
      ),

    status:
      normalizeReservationText_(
        reservation.status
      ),

    brand_code:
      normalizeReservationText_(
        reservation.brand_code
      ),

    store_code:
      normalizeReservationText_(
        reservation.store_code
      ),

    service_code:
      normalizeReservationText_(
        reservation.service_code
      ),

    service_name:
      normalizeReservationText_(
        reservation.service_name
      ),

    date:
      date,

    start_time:
      startTime,

    end_time:
      endTime,

    start_at:
      buildReservationDateTimeText_(
        date,
        startTime
      ),

    end_at:
      buildReservationDateTimeText_(
        date,
        endTime
      ),

    duration_minutes:
      normalizeReservationNumber_(
        durationValue
      ),

    staff_code:
      normalizeReservationText_(
        reservation.staff_code
      ),

    staff_name:
      normalizeReservationText_(
        reservation.staff_name
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

    note:
      normalizeReservationText_(
        reservation.note
      ),

    calendar_code:
      normalizeReservationText_(
        reservation.calendar_code
      ),

    calendar_id:
      normalizeReservationText_(
        reservation.calendar_id
      ),

    google_event_id:
      normalizeReservationText_(
        reservation.google_event_id
      ),

    cancel_reason:
      normalizeReservationText_(
        reservation.cancel_reason
      ),

    cancelled_by:
      normalizeReservationText_(
        reservation.cancelled_by
      ),

    cancelled_at:
      normalizeReservationDateTimeValue_(
        reservation.cancelled_at
      ),

    created_at:
      normalizeReservationDateTimeValue_(
        reservation.created_at
      ),

    updated_at:
      normalizeReservationDateTimeValue_(
        reservation.updated_at
      )
  };
}


/**
 * 日付と時刻を連結
 *
 * @param {string} date
 * @param {string} time
 * @returns {string}
 */
function buildReservationDateTimeText_(
  date,
  time
) {

  if (!date || !time) {
    return "";
  }

  return date + " " + time;
}


/**
 * 数値をAPIレスポンス用に変換
 *
 * @param {*} value
 * @returns {number|null}
 */
function normalizeReservationNumber_(
  value
) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numberValue =
    Number(value);

  if (isNaN(numberValue)) {
    return null;
  }

  return numberValue;
}


/**
 * 日時をyyyy-MM-dd HH:mm:ss形式へ変換
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeReservationDateTimeValue_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {

    return Utilities.formatDate(
      value,
      APP_CONFIG.TIMEZONE,
      "yyyy-MM-dd HH:mm:ss"
    );
  }

  return normalizeReservationText_(
    value
  );
}


/**
 * 予約情報取得結合テスト
 *
 * getAvailableSlots()から現在の空き枠を自動取得し、
 * その枠でテスト予約を作成する。
 *
 * 予約ID・時刻・スタッフコードの手入力は不要。
 *
 * 自動確認:
 * - duration_minutes: 60
 * - customer_phone: "09012345678"
 */
function testGetReservation() {

  const serviceCode =
    "PT60";

  const targetDate =
    "2026-08-01";

  /*
   * 現在の空き枠を取得
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

  Logger.log(
    "1. 空き枠取得結果: " +
    availabilityContent
  );

  const availabilityResult =
    JSON.parse(
      availabilityContent
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
      "テストに使用できる空き枠がありません: " +
      availabilityContent
    );
  }

  /*
   * 取得時点で空いている最初の枠を利用する。
   *
   * staff_codeは指定しない。
   * 共有カレンダーの空き状況と勤務人数から
   * createReservation()側で担当者を自動割当する。
   */
  const selectedSlot =
    availabilityResult.data.slots[0];

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
      "FRGTEST002",

    customer_name:
      "予約取得テスト",

    customer_email:
      "test@example.com",

    customer_phone:
      "09012345678",

    note:
      "予約情報取得API動作確認"
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

  const reservationId =
    createResult.data.reservation_id;

  const getResponse =
    getReservation({
      action:
        "getReservation",

      reservation_id:
        reservationId
    });

  const getContent =
    getResponse.getContent();

  Logger.log(
    "3. 予約情報取得結果: " +
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
      "予約情報を取得できませんでした: " +
      getContent
    );
  }

  if (
    getResult.data.duration_minutes !==
    60
  ) {
    throw new Error(
      "duration_minutesが正しくありません: " +
      getContent
    );
  }

  if (
    getResult.data.customer_phone !==
    "09012345678"
  ) {
    throw new Error(
      "customer_phoneの先頭0が保持されていません: " +
      getContent
    );
  }

  Logger.log(
    "予約情報取得API結合テスト成功: " +
    reservationId
  );
}
