/**
 * ============================================================
 * A-nauts OS Reserve
 * 見学予約 住所訂正専用API
 * ============================================================
 *
 * updateReservation() は使わない。
 * 予約日時・スタッフ・Googleカレンダーには一切触れず、
 * reservations の住所だけを更新する。
 */

function updateTourCustomerAddress(params) {

  const lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(30000);

    params = params || {};

    const reservationId =
      String(
        params.reservation_id || ""
      ).trim();

    const customerAddress =
      String(
        params.customer_address || ""
      ).trim();

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!customerAddress) {
      return errorResponse(
        "住所を入力してください。",
        "VALIDATION_ERROR"
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
      reservationInfo.record || {};

    const serviceCode =
      String(
        reservation.service_code || ""
      ).trim().toUpperCase();

    if (serviceCode !== "TOUR") {
      return errorResponse(
        "住所訂正は店内見学予約のみ対象です。",
        "INVALID_SERVICE",
        {
          service_code:
            serviceCode
        }
      );
    }

    const sheet =
      reservationInfo.sheet;

    const rowNumber =
      reservationInfo.rowNumber;

    const headers =
      reservationInfo.headers || [];

    if (
      !sheet ||
      !rowNumber ||
      rowNumber < 2
    ) {
      throw new Error(
        "更新対象の予約行を取得できません。"
      );
    }

    /*
     * =====================================================
     * 元住所
     * =====================================================
     */

    const oldAddress =
      String(
        reservation.address ||
        reservation.customer_address ||
        reservation.full_address ||
        ""
      ).trim();

    /*
     * =====================================================
     * reservations更新
     * =====================================================
     *
     * シートによって
     * address / customer_address
     * のどちらがある場合でも対応。
     *
     * 両方ある場合は両方同じ値に更新。
     */

    const currentValues =
      sheet
        .getRange(
          rowNumber,
          1,
          1,
          headers.length
        )
        .getValues()[0];

    const updatedValues =
      headers.map(
        function(header, index) {

          const key =
            String(header || "")
              .trim()
              .toLowerCase();

          if (
            key === "address" ||
            key === "customer_address" ||
            key === "full_address"
          ) {
            return customerAddress;
          }

          if (
            key === "updated_at"
          ) {
            return new Date();
          }

          return currentValues[index];
        }
      );

    /*
     * 住所列が1つも無い場合は異常
     */

    const addressHeaders =
      headers.filter(
        function(header) {

          const key =
            String(header || "")
              .trim()
              .toLowerCase();

          return (
            key === "address" ||
            key === "customer_address" ||
            key === "full_address"
          );
        }
      );

    if (
      addressHeaders.length === 0
    ) {
      throw new Error(
        "reservationsシートに住所列がありません。"
      );
    }

    sheet
      .getRange(
        rowNumber,
        1,
        1,
        headers.length
      )
      .setValues([
        updatedValues
      ]);

    SpreadsheetApp.flush();

    /*
     * =====================================================
     * 履歴
     * =====================================================
     */

    try {

      appendReservationHistory_({
        history_id:
          generateReservationHistoryId_(),

        reservation_id:
          reservationId,

        action:
          "ADDRESS_UPDATE",

        old_status:
          reservation.status || "",

        new_status:
          reservation.status || "",

        staff_code:
          reservation.staff_code || "",

        service_code:
          serviceCode,

        reservation_date:
          reservation.reservation_date || "",

        start_time:
          reservation.start_time || "",

        detail:
          JSON.stringify({
            source:
              "ADMIN_TOUR_QUESTIONNAIRE",

            before: {
              address:
                oldAddress
            },

            after: {
              address:
                customerAddress
            }
          }),

        created_at:
          new Date()
      });

    } catch (historyError) {

      logError(
        "updateTourCustomerAddressHistory",
        historyError.message,
        {
          reservation_id:
            reservationId,

          stack:
            historyError.stack
        }
      );
    }

    /*
     * =====================================================
     * 結果
     * =====================================================
     */

    const result = {
      reservation_id:
        reservationId,

      customer_name:
        reservation.customer_name || "",

      customer_address:
        customerAddress,

      old_address:
        oldAddress,

      service_code:
        serviceCode
    };

    logInfo(
      "updateTourCustomerAddress",
      "見学予約住所訂正成功",
      result
    );

    return successResponse(
      result,
      "住所を訂正しました。"
    );

  } catch (error) {

    logError(
      "updateTourCustomerAddress",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      error.message ||
        "住所訂正中にエラーが発生しました。",
      "TOUR_ADDRESS_UPDATE_ERROR",
      {
        message:
          error.message
      }
    );

  } finally {

    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}