/**
 * ============================================================
 * A-nauts OS Reserve
 * 99_Main.gs
 * ============================================================
 */

function doGet(e) {
  try {
    const params =
      e && e.parameter
        ? e.parameter
        : {};

    if (
      String(params.page || "").trim() ===
      "reservation"
    ) {
      return renderReservationManagePage_(
        params
      );
    }

    /*
     * =====================================================
     * 管理者向け予約管理ページ
     * =====================================================
     */
    if (
      String(params.page || "").trim() ===
      "reservation-admin"
    ) {
      return renderAdminReservationManagePage_(
        params
      );
    }

    if (
      String(params.page || "").trim() ===
      "shift-request"
    ) {
      return renderShiftChangeRequestDecisionPage_(
        params
      );
    }

    const action =
      String(
        params.action || "health"
      ).trim();

    switch (action) {

      case "health":
        return health();

      case "getCurrentUser":
        return getCurrentUser(
          params
        );

      case "getMyShiftChangeRequests":
        return getMyShiftChangeRequests(
          params
        );

      case "getStaffPresenceHours":
        return getStaffPresenceHours(
          params
        );

      case "getResolvedStaffPresenceHours":
        return getResolvedStaffPresenceHours(
          params
        );

      case "getStaff":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaff(
          params
        );

      case "getStaffByCode":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffByCode(
          params
        );

      case "getStaffShifts":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffShifts(
          params
        );

      case "getStaffSchedule":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffSchedule(
          params
        );

      case "generateTourQuestionnairePdf":
        requireAuth_(
          params,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return generateTourQuestionnairePdf(
          params
        );

      case "getAdminReservationManageUrl":
        requireAuth_(
          params,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return getAdminReservationManageUrl(
          params
        );

      case "getTrainerSchedule":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getTrainerSchedule(
          params
        );

      case "getCalendars":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER"]
        );
        return getCalendars();

      case "getMailAccounts":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER"]
        );
        return getMailAccounts();

      case "getCalendarEvents":
        requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getCalendarEvents(
          params
        );

      case "getBrands":
        return getBrands();

      case "getStores":
        return getStores();

      case "getServices":
        return getServices();

      case "getPublicTrainers":
        return getPublicTrainers(
          params
        );

      case "getAvailableSlots":
        return getAvailableSlots(
          params
        );

      case "getServiceHours":
        return getServiceHours(
          params
        );

      case "getReservation":
        return getReservation(
          params
        );

      default:
        return errorResponse(
          "指定されたactionは存在しません。",
          "ACTION_NOT_FOUND",
          {
            action: action
          }
        );
    }

  } catch (error) {

    logError(
      "doGet",
      error.message,
      {
        stack: error.stack
      }
    );

    return errorResponse(
      error.message ||
        "API実行中にエラーが発生しました。",
      "AUTH_ERROR",
      {
        message: error.message
      }
    );
  }
}


function doPost(e) {
  try {
    let body = {};

    if (
      e &&
      e.postData &&
      e.postData.contents
    ) {
      body = JSON.parse(
        e.postData.contents
      );
    }

    const action =
      String(
        body.action || ""
      ).trim();

    switch (action) {

      case "createReservation":
        return createReservationWithTrainerPolicy_(
          body
        );

      case "updateReservation":
        return updateReservation(
          body
        );

      case "reassignReservationStaff":
        return reassignReservationStaff(
          body
        );

      case "reassignInvalidReservations":
        return reassignInvalidReservations(
          body
        );

      /*
       * =====================================================
       * 担当者都合による予約変更・キャンセル依頼メール
       * 管理画面からのみ使用
       * =====================================================
       */
      case "sendReservationRescheduleRequest":
        requireAuth_(
          body,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return sendReservationRescheduleRequest(
          body
        );

      case "cancelReservation":
        return cancelReservation(
          body
        );

      case "restoreConsumedReservation":
        return restoreConsumedReservation(
          body
        );

      case "createShiftChangeRequest":
        return createShiftChangeRequest(
          body
        );

      case "provisionStaffLogin":
        return provisionStaffLogin(
          body
        );

      case "saveStaffPresenceWeekdays":
        return saveStaffPresenceWeekdays(
          body
        );

      case "saveStaffPresenceSpecial":
        return saveStaffPresenceSpecial(
          body
        );

      case "deleteStaffPresenceSpecial":
        return deleteStaffPresenceSpecial(
          body
        );

      case "saveStaff":
        requireStaffManagementPermission_(
          body
        );
        return saveStaff(
          body
        );

      case "setStaffActive":
        requireStaffManagementPermission_(
          body
        );
        return setStaffActive(
          body
        );

      case "saveService":
        requireServiceManagementPermission_(
          body
        );
        return saveService(
          body
        );

      case "setServiceActive":
        requireServiceManagementPermission_(
          body
        );
        return setServiceActive(
          body
        );

      case "saveStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return saveStaffShift(
          body
        );

      case "deleteStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return deleteStaffShift(
          body
        );

      case "previewStaffShiftImport":
        requireDirectShiftEditPermission_(
          body
        );
        return previewStaffShiftImport(
          body
        );

      case "importStaffShifts":
        requireDirectShiftEditPermission_(
          body
        );
        return importStaffShifts(
          body
        );

      case "saveServiceHour":
        requireServiceManagementPermission_(
          body
        );
        return saveServiceHour(
          body
        );

      case "deleteServiceHour":
        requireServiceManagementPermission_(
          body
        );
        return deleteServiceHour(
          body
        );

      /*
       * =====================================================
       * 見学同時入会
       * =====================================================
       */
      case "createTourSameDayEnrollment":
        requireAuth_(
          body,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return createTourSameDayEnrollment(
          body
        );

      case "updateTourCustomerAddress":
        requireAuth_(
          body,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );

        return updateTourCustomerAddress(
          body
        );

      case "sendTourCustomerReply":
        requireAuth_(
          body,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return sendTourCustomerReply(
          body
        );

      case "setTourInquiryStatus":
        requireAuth_(
          body,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return setTourInquiryStatus(
          body
        );

      default:
        return errorResponse(
          "指定されたactionは存在しません。",
          "ACTION_NOT_FOUND",
          {
            action: action
          }
        );
    }

  } catch (error) {

    logError(
      "doPost",
      error.message,
      {
        stack: error.stack
      }
    );

    return errorResponse(
      error.message ||
        "POST API実行中にエラーが発生しました。",
      "AUTH_ERROR",
      {
        message: error.message
      }
    );
  }
}


function health() {
  return successResponse({
    appName:
      APP_CONFIG.APP_NAME,

    version:
      APP_CONFIG.VERSION,

    timezone:
      APP_CONFIG.TIMEZONE
  });
}
