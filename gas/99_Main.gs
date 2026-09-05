/**
 * ============================================================
 * A-nauts OS Reserve
 * 99_Main.gs
 * ============================================================
 */

/**
 * シフトの直接編集、削除、CSV取込は管理権限だけに許可する。
 *
 * doPost の各シフト操作から共通して呼ばれるため、ここで必ず
 * Firebase IDトークンと auth_users の権限を検証する。
 */
function requireDirectShiftEditPermission_(params) {
  return requireAuth_(
    params || {},
    ["ADMIN", "MANAGER"]
  );
}

/**
 * SOGA所属の一般スタッフは「自分のシフト」と「9ROUND予定」だけを使う。
 * 画面を隠すだけでなく、対象外の管理APIもここで拒否する。
 */
function requireNonRestrictedAdminFeature_(params, allowedPermissions) {
  const auth = requireAuth_(
    params || {},
    allowedPermissions || ["ADMIN", "MANAGER", "STAFF"]
  );

  if (isRestrictedSogaStaff_(auth)) {
    throw new Error(
      "9ROUNDスタッフは、自分のシフトと9ROUND予定だけ利用できます。"
    );
  }

  return auth;
}

function isActiveSogaDirectoryRow_(row) {
  const value = row && row.active;
  if (value === false) return false;
  const normalized = String(value == null ? "TRUE" : value).trim().toUpperCase();
  return !["FALSE", "0", "NO", "OFF"].includes(normalized);
}

function sanitizeSogaDirectoryRow_(row) {
  row = row || {};
  return {
    staff_code: row.staff_code,
    staff_name: row.staff_name,
    display_name: row.display_name,
    role: row.role,
    store_code: row.store_code,
    color: row.color,
    active: row.active
  };
}

function getStaffForSignedInUser_(params, auth) {
  if (!isRestrictedSogaStaff_(auth)) return getStaff(params);

  const response = getStaff(
    Object.assign({}, params || {}, { include_inactive: "false" })
  );

  const payload = parseAuthJsonResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const data = payload.data;
  if (Array.isArray(data)) {
    return successResponse(
      data.filter(isActiveSogaDirectoryRow_).map(sanitizeSogaDirectoryRow_)
    );
  }

  const rows = data && Array.isArray(data.staff) ? data.staff : [];
  return successResponse(
    Object.assign({}, data || {}, {
      staff: rows
        .filter(isActiveSogaDirectoryRow_)
        .map(sanitizeSogaDirectoryRow_)
    })
  );
}

function filterSogaShiftRows_(rows, requestedStaffCode, auth) {
  const selfCode = String(auth && auth.staff_code || "").trim().toUpperCase();
  const requested = String(requestedStaffCode || "").trim().toUpperCase();

  if (requested && requested !== selfCode) {
    throw new Error("他のスタッフを指定してシフトを取得することはできません。");
  }

  return (Array.isArray(rows) ? rows : []).filter(function (row) {
    const storeCode = String(row && row.store_code || "").trim().toUpperCase();
    const staffCode = String(row && row.staff_code || "").trim().toUpperCase();
    return storeCode === "SOGA" && (!requested || staffCode === selfCode);
  });
}

function getStaffShiftsForSignedInUser_(params, auth) {
  if (!isRestrictedSogaStaff_(auth)) return getStaffShifts(params);

  const safeParams = Object.assign({}, params || {}, { store_code: "SOGA" });
  const response = getStaffShifts(safeParams);
  const payload = parseAuthJsonResponse_(response);
  if (!payload || payload.ok !== true) return response;

  const data = payload.data;
  if (Array.isArray(data)) {
    return successResponse(
      filterSogaShiftRows_(data, params && params.staff_code, auth)
    );
  }

  const rows = data && Array.isArray(data.shifts) ? data.shifts : [];
  return successResponse(
    Object.assign({}, data || {}, {
      shifts: filterSogaShiftRows_(rows, params && params.staff_code, auth)
    })
  );
}

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
        requireNonRestrictedAdminFeature_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffPresenceHours(
          params
        );

      case "getResolvedStaffPresenceHours":
        requireNonRestrictedAdminFeature_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getResolvedStaffPresenceHours(
          params
        );

      case "getStaff": {
        const staffAuth = requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffForSignedInUser_(
          params,
          staffAuth
        );
      }

      case "getStaffByCode":
        requireNonRestrictedAdminFeature_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffByCode(
          params
        );

      case "getStaffShifts": {
        const shiftAuth = requireAuth_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffShiftsForSignedInUser_(
          params,
          shiftAuth
        );
      }

      case "getStaffSchedule":
        requireNonRestrictedAdminFeature_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getStaffSchedule(
          params
        );

      case "getDailyReport": {
        const dailyReportAuth = requireNonRestrictedAdminFeature_(
          params,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return getDailyReport(
          params,
          dailyReportAuth
        );
      }

      case "generateTourQuestionnairePdf":
        requireNonRestrictedAdminFeature_(
          params,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return generateTourQuestionnairePdfFast(
          params
        );

      case "getTourReplyHistory":
        requireNonRestrictedAdminFeature_(
          params,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return getTourReplyHistoryV2(
          params
        );

      case "getAdminReservationManageUrl":
        requireNonRestrictedAdminFeature_(
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
        requireNonRestrictedAdminFeature_(
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
        requireNonRestrictedAdminFeature_(
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

      case "getPersonalBookingEligibility":
        return getYoshimaruBookingEligibilityResponse_(
          params
        );

      case "getPublicTrainers":
        return getPublicTrainers(
          params
        );

      case "getAvailableSlots":
        return getAvailableSlotsStoreAware_(
          params
        );

      case "getAvailableSlotsRange":
        return getAvailableSlotsRangeStoreAware_(
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

      case "verifyMpgSuspensionMember":
        return verifyMpgSuspensionMember_(
          body
        );

      case "submitMpgSuspension":
        return submitMpgSuspension_(
          body
        );

      case "createReservation":
        return createReservationStoreAware_(
          body
        );

      case "updateReservation":
        return invalidateStoreAwareAfterMutation_(
          updateReservation(body)
        );

      case "reassignReservationStaff":
        return invalidateStoreAwareAfterMutation_(
          reassignReservationStaff(body)
        );

      case "reassignInvalidReservations":
        return invalidateStoreAwareAfterMutation_(
          reassignInvalidReservations(body)
        );

      /*
       * =====================================================
       * 担当者都合による予約変更・キャンセル依頼メール
       * 管理画面からのみ使用
       * =====================================================
       */
      case "sendReservationRescheduleRequest":
        requireNonRestrictedAdminFeature_(
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
        return invalidateStoreAwareAfterMutation_(
          cancelReservation(body)
        );

      case "restoreConsumedReservation":
        return invalidateStoreAwareAfterMutation_(
          restoreConsumedReservation(body)
        );

      case "createShiftChangeRequest": {
        const shiftRequestAuth = requireAuth_(
          body,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        if (isRestrictedSogaStaff_(shiftRequestAuth)) {
          body.staff_code = shiftRequestAuth.staff_code;
          body.store_code = "SOGA";
        }
        return createShiftChangeRequest(
          body
        );
      }

      case "provisionStaffLogin":
        return provisionStaffLogin(
          body
        );

      case "saveStaffPresenceWeekdays":
        return invalidateStoreAwareAfterMutation_(
          saveStaffPresenceWeekdays(body)
        );

      case "saveStaffPresenceSpecial":
        return invalidateStoreAwareAfterMutation_(
          saveStaffPresenceSpecial(body)
        );

      case "deleteStaffPresenceSpecial":
        return invalidateStoreAwareAfterMutation_(
          deleteStaffPresenceSpecial(body)
        );

      case "saveStaff":
        requireStaffManagementPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveStaff(body),
          true
        );

      case "setStaffActive":
        requireStaffManagementPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          setStaffActive(body),
          true
        );

      case "saveService":
        requireServiceManagementPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveService(body),
          true
        );

      case "setServiceActive":
        requireServiceManagementPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          setServiceActive(body),
          true
        );

      case "saveStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveStaffShift(body)
        );

      case "deleteStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          deleteStaffShift(body)
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
        return invalidateStoreAwareAfterMutation_(
          importStaffShifts(body)
        );

      case "saveServiceHour":
        requireServiceManagementPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveServiceHour(body)
        );

      case "deleteServiceHour":
        requireServiceManagementPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          deleteServiceHour(body)
        );

      case "saveDailyReport": {
        const dailyReportSaveAuth = requireNonRestrictedAdminFeature_(
          body,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return saveDailyReport(
          body,
          dailyReportSaveAuth
        );
      }

      case "submitDailyReport": {
        const dailyReportSubmitAuth = requireNonRestrictedAdminFeature_(
          body,
          ["ADMIN", "MANAGER", "STAFF"]
        );
        return submitDailyReport(
          body,
          dailyReportSubmitAuth
        );
      }

      /*
       * =====================================================
       * 見学同時入会
       * =====================================================
       */
      case "createTourSameDayEnrollment":
        requireNonRestrictedAdminFeature_(
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
        requireNonRestrictedAdminFeature_(
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
        requireNonRestrictedAdminFeature_(
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

      case "sendTourCustomerReplyV2": {
        const tourReplyAuth = requireNonRestrictedAdminFeature_(
          body,
          [
            "ADMIN",
            "MANAGER",
            "STAFF"
          ]
        );
        return sendTourCustomerReplyV2(
          body,
          tourReplyAuth
        );
      }

      case "setTourInquiryStatus":
        requireNonRestrictedAdminFeature_(
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
