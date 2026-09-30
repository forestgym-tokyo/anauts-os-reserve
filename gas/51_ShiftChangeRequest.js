
const SHIFT_CHANGE_REQUEST_SHEET = "shift_change_requests";


/**
 * シフト申請用 日付正規化
 * SheetsからDate型で返ってきても yyyy-MM-dd に統一する。
 */
function normalizeShiftRequestDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  const s = String(value == null ? "" : value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, APP_CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  return s;
}


/**
 * シフト申請用 時刻正規化
 * Sheetsの時刻が1899年Date型で返ってきても HH:mm に統一する。
 */
function normalizeShiftRequestClock_(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_CONFIG.TIMEZONE, "HH:mm");
  }

  const s = String(value).trim();

  const direct = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (direct) {
    return String(Number(direct[1])).padStart(2, "0") + ":" + direct[2];
  }

  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, APP_CONFIG.TIMEZONE, "HH:mm");
  }

  return s;
}


/**
 * 申請レコードを画面・承認処理用に正規化
 */
function normalizeShiftRequestRecord_(row) {
  if (!row) return row;

  const normalized = Object.assign({}, row);

  normalized.date = normalizeShiftRequestDate_(row.date);
  normalized.old_start_time = normalizeShiftRequestClock_(row.old_start_time);
  normalized.old_end_time = normalizeShiftRequestClock_(row.old_end_time);
  normalized.new_start_time = normalizeShiftRequestClock_(row.new_start_time);
  normalized.new_end_time = normalizeShiftRequestClock_(row.new_end_time);

  return normalized;
}


/**
 * 08:00〜24:00 / 15分刻みのみ許可
 */
function validateShiftRequestTime_(value) {
  const s = normalizeShiftRequestClock_(value);
  const m = /^(\d{2}):(\d{2})$/.exec(s);

  if (!m) return false;

  const hour = Number(m[1]);
  const minute = Number(m[2]);

  if (![0, 15, 30, 45].includes(minute)) {
    return false;
  }

  if (hour === 24) {
    return minute === 0;
  }

  return hour >= 8 && hour <= 23;
}


/**
 * 08:00基準で比較用分数へ変換
 */
function shiftRequestClockMinutes_(value) {
  const s = normalizeShiftRequestClock_(value);
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}


/**
 * 当日・過去日のWeb申請は禁止。
 * 当日の変更は直接電話連絡。
 */
function isShiftRequestTodayOrPast_(dateValue) {
  const date = normalizeShiftRequestDate_(dateValue);
  const today = Utilities.formatDate(
    new Date(),
    APP_CONFIG.TIMEZONE,
    "yyyy-MM-dd"
  );

  return !!date && date <= today;
}


function getSameDayShiftRequestMessage_() {
  return "当日のシフト追加・変更・削除はWeb申請できません。080-3553-4259まで直接ご連絡ください。";
}


/**
 * ============================================================
 * シフト変更申請 × 既存予約確認
 * ============================================================
 *
 * 申請時・承認画面表示時・承認直前に最新予定を確認する。
 *
 * 既存予約があっても申請・承認自体は禁止しない。
 * 影響を受ける予約は警告として表示し、承認後の担当再設定・
 * リスケ対応フローへ引き継ぐ。
 *
 * パーソナルは指名制のため別トレーナーへ自動振替しない。
 */

function getShiftRequestAffectedReservations_(requestRecord) {
  const req = normalizeShiftRequestRecord_(requestRecord || {});
  const staff = findShiftRequestStaff_(req.staff_code);

  if (!staff) {
    throw new Error("スタッフ情報が見つからないため予約確認できません。");
  }

  const role = String(staff.role || "STAFF").trim().toUpperCase();
  const scheduleOutput = role === "TRAINER"
    ? getTrainerSchedule({
        date: req.date,
        store_code: req.store_code
      })
    : getStaffSchedule({
        date: req.date,
        store_code: req.store_code
      });

  const scheduleResponse = parseTextOutputResponse_(scheduleOutput);

  if (!scheduleResponse.ok) {
    throw new Error(
      "既存予約を確認できません。時間をおいて再度お試しいただくか、管理者へご連絡ください。"
    );
  }

  const data = scheduleResponse.data || {};
  const reservations = Array.isArray(data.reservations)
    ? data.reservations
    : [];

  const targetCode =
    String(req.staff_code || "").trim().toUpperCase();

  return reservations
    .filter(r => isActiveShiftReservation_(r))
    .filter(r =>
      String(r.staff_code || "").trim().toUpperCase() === targetCode
    )
    .filter(r => !reservationCoveredByRequestedShift_(r, req))
    .map(normalizeShiftReservationForMessage_);
}


function buildShiftAffectedReservationWarningText_(reservations) {
  const rows = Array.isArray(reservations) ? reservations : [];

  if (!rows.length) {
    return "";
  }

  const details = rows
    .slice(0, 10)
    .map(r =>
      r.start_time + "〜" + r.end_time +
      " " + (r.service_name || r.service_code || "予約") +
      (r.customer_name ? " / " + r.customer_name + "様" : "")
    );

  return (
    "⚠ このシフト変更・削除により、現在の担当予定者が対応できなくなる予約があります。\n" +
    details.join("\n")
  );
}


function checkShiftRequestReservationConflict_(requestRecord) {
  const req = normalizeShiftRequestRecord_(requestRecord || {});
  const staff = findShiftRequestStaff_(req.staff_code);

  if (!staff) {
    throw new Error("スタッフ情報が見つからないため予約確認できません。");
  }

  const role = String(staff.role || "STAFF").trim().toUpperCase();

  if (role === "TRAINER") {
    return checkTrainerShiftReservationConflict_(req);
  }

  return checkStaffShiftReservationConflict_(req);
}


function checkStaffShiftReservationConflict_(req) {
  const scheduleResponse = parseTextOutputResponse_(
    getStaffSchedule({
      date: req.date,
      store_code: req.store_code
    })
  );

  if (!scheduleResponse.ok) {
    throw new Error(
      "既存予約を確認できないためシフト申請を処理できません。管理者へ直接ご連絡ください。080-3553-4259"
    );
  }

  const data = scheduleResponse.data || {};
  const reservations = Array.isArray(data.reservations) ? data.reservations : [];
  const shifts = Array.isArray(data.shifts) ? data.shifts : [];
  const staffRows = getSheetData(APP_CONFIG.SHEETS.STAFF);

  const targetCode = String(req.staff_code || "").trim().toUpperCase();
  const conflicts = [];

  reservations
    .filter(r => isActiveShiftReservation_(r))
    .filter(r =>
      String(r.staff_code || "").trim().toUpperCase() === targetCode
    )
    .forEach(r => {
      if (reservationCoveredByRequestedShift_(r, req)) {
        return;
      }

      if (canOtherStaffCoverReservation_(r, req, shifts, staffRows)) {
        return;
      }

      conflicts.push(normalizeShiftReservationForMessage_(r));
    });

  return {
    ok: conflicts.length === 0,
    conflicts: conflicts,
    message: conflicts.length
      ? buildShiftReservationConflictMessage_(conflicts)
      : ""
  };
}


function checkTrainerShiftReservationConflict_(req) {
  const scheduleResponse = parseTextOutputResponse_(
    getTrainerSchedule({
      date: req.date,
      store_code: req.store_code
    })
  );

  if (!scheduleResponse.ok) {
    throw new Error(
      "既存予約を確認できないためシフト申請を処理できません。管理者へ直接ご連絡ください。080-3553-4259"
    );
  }

  const data = scheduleResponse.data || {};
  const reservations = Array.isArray(data.reservations) ? data.reservations : [];
  const targetCode = String(req.staff_code || "").trim().toUpperCase();

  const conflicts = reservations
    .filter(r => isActiveShiftReservation_(r))
    .filter(r =>
      String(r.staff_code || "").trim().toUpperCase() === targetCode
    )
    .filter(r => !reservationCoveredByRequestedShift_(r, req))
    .map(normalizeShiftReservationForMessage_);

  return {
    ok: conflicts.length === 0,
    conflicts: conflicts,
    message: conflicts.length
      ? buildShiftReservationConflictMessage_(conflicts)
      : ""
  };
}


function reservationCoveredByRequestedShift_(reservation, req) {
  const type = String(req.request_type || "").trim().toUpperCase();

  if (type === "DELETE") {
    return false;
  }

  const reservationStart = shiftReservationMinutes_(reservation.start_time);
  const reservationEnd = shiftReservationMinutes_(reservation.end_time);
  const newStart = shiftReservationMinutes_(req.new_start_time);
  const newEnd = shiftReservationMinutes_(req.new_end_time);

  if (
    [reservationStart, reservationEnd, newStart, newEnd]
      .some(v => isNaN(v))
  ) {
    return false;
  }

  return (
    reservationStart >= newStart &&
    reservationEnd <= newEnd
  );
}


function canOtherStaffCoverReservation_(reservation, req, shifts, staffRows) {
  const targetCode = String(req.staff_code || "").trim().toUpperCase();
  const reservationStart = shiftReservationMinutes_(reservation.start_time);
  const reservationEnd = shiftReservationMinutes_(reservation.end_time);

  if (isNaN(reservationStart) || isNaN(reservationEnd)) {
    return false;
  }

  const candidates = (Array.isArray(shifts) ? shifts : [])
    .filter(s => {
      const code = String(s.staff_code || "").trim().toUpperCase();

      if (!code || code === targetCode) {
        return false;
      }

      const start = shiftReservationMinutes_(s.start_time);
      const end = shiftReservationMinutes_(s.end_time);

      return (
        !isNaN(start) &&
        !isNaN(end) &&
        start <= reservationStart &&
        end >= reservationEnd
      );
    });

  return candidates.some(s => {
    const code = String(s.staff_code || "").trim().toUpperCase();

    const master = (staffRows || []).find(row =>
      String(row.staff_code || "").trim().toUpperCase() === code &&
      normalizeShiftBoolean_(row.active) &&
      String(row.role || "STAFF").trim().toUpperCase() === "STAFF"
    );

    if (!master) {
      return false;
    }

    return staffCanHandleReservation_(master, reservation);
  });
}


function staffCanHandleReservation_(staff, reservation) {
  const code = String(
    reservation.service_code ||
    reservation.category ||
    ""
  ).trim().toUpperCase();

  const bool = value => {
    if (typeof value === "boolean") return value;
    const s = String(value == null ? "" : value).trim().toUpperCase();
    return ["TRUE","1","YES","ON"].includes(s);
  };

  if (code.includes("TOUR") || code.includes("見学")) {
    return bool(staff.can_tour);
  }

  if (code.includes("COUNSEL")) {
    return bool(staff.can_counsel);
  }

  if (code.includes("MEAL")) {
    return bool(staff.can_meal_planning);
  }

  if (
    code.includes("UNSUBSCRIBE") ||
    code.includes("退会")
  ) {
    return bool(staff.can_unsubscribe);
  }

  if (
    code.includes("PROCEDURE") ||
    code.includes("手続")
  ) {
    return bool(staff.can_procedure);
  }

  if (
    code.includes("TRAINING_SUPPORT") ||
    code.includes("SUPPORT")
  ) {
    return bool(staff.can_training_support);
  }

  if (code.includes("9ROUND")) {
    return bool(staff.can_9round);
  }

  // 未分類の一般スタッフ業務は、勤務中のSTAFFがいれば対応可能とする。
  return true;
}


function isActiveShiftReservation_(r) {
  const status = String(r.status || "RESERVED").trim().toUpperCase();

  return ![
    "CANCELLED",
    "CANCELED",
    "CANCEL",
    "CONSUMED",
    "NO_SHOW"
  ].includes(status);
}


function normalizeShiftReservationForMessage_(r) {
  return {
    service_code: String(r.service_code || "").trim(),
    service_name: String(r.service_name || r.service_code || "予約").trim(),
    start_time: normalizeShiftRequestClock_(r.start_time),
    end_time: normalizeShiftRequestClock_(r.end_time),
    customer_name: String(r.customer_name || "").trim()
  };
}


function buildShiftReservationConflictMessage_(conflicts) {
  const rows = (conflicts || [])
    .slice(0, 5)
    .map(r =>
      r.start_time + "〜" + r.end_time +
      " " + (r.service_name || r.service_code || "予約")
    );

  return (
    "このシフト変更・削除はWebから申請できません。" +
    "変更後に対応できない予約があります。" +
    (rows.length ? " 対象：" + rows.join(" / ") : "") +
    " 予約対応の確認が必要なため、080-3553-4259まで直接ご連絡ください。"
  );
}


function shiftReservationMinutes_(value) {
  const s = normalizeShiftRequestClock_(value);
  const m = /^(\d{2}):(\d{2})$/.exec(s);

  if (!m) {
    return NaN;
  }

  return Number(m[1]) * 60 + Number(m[2]);
}


function assertNoShiftReservationConflict_(req) {
  const check = checkShiftRequestReservationConflict_(req);

  if (!check.ok) {
    throw new Error(
      check.message ||
      "予約対応の確認が必要なため、このシフト変更は処理できません。080-3553-4259まで直接ご連絡ください。"
    );
  }

  return check;
}


function createShiftChangeRequest(body) {
  try {
    body = body || {};
    const staffCode = String(body.staff_code || "").trim().toUpperCase();
    const requestType = String(body.request_type || "").trim().toUpperCase();
    const auth = requireOwnShiftRequestPermission_(body, staffCode);

    if (!["UPDATE","DELETE"].includes(requestType)) {
      return errorResponse("申請種別が正しくありません。","INVALID_REQUEST_TYPE");
    }

    const shiftId = String(body.shift_id || "").trim();
    let original = null;

    if (!shiftId) {
      return errorResponse("対象シフトを指定してください。","SHIFT_ID_REQUIRED");
    }

    original = findActiveShiftById_(shiftId);

    if (!original) {
      return errorResponse("対象シフトが見つかりません。","SHIFT_NOT_FOUND");
    }

    if (String(original.staff_code).toUpperCase() !== staffCode) {
      return errorResponse("他のスタッフのシフトは申請できません。","FORBIDDEN");
    }

    if (hasPendingShiftRequestForShift_(shiftId)) {
      return errorResponse("このシフトにはすでに申請中の変更があります。","REQUEST_ALREADY_PENDING");
    }

    const staff = findShiftRequestStaff_(staffCode);
    if (!staff) return errorResponse("スタッフ情報が見つかりません。","STAFF_NOT_FOUND");

    const date = requestType === "DELETE"
      ? normalizeShiftRequestDate_(original.date)
      : String(body.date || "").trim();

    const resolvedStoreCode =
      String(original.store_code || body.store_code || staff.store_code || "")
        .trim()
        .toUpperCase();

    const startTime = requestType === "DELETE" ? "" : normalizeShiftTime_(body.start_time);
    const endTime   = requestType === "DELETE" ? "" : normalizeShiftTime_(body.end_time);

    if (isShiftRequestTodayOrPast_(date)) {
      return errorResponse(
        getSameDayShiftRequestMessage_(),
        "SAME_DAY_SHIFT_REQUEST_NOT_ALLOWED"
      );
    }

    if (requestType !== "DELETE") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return errorResponse("勤務日をyyyy-MM-dd形式で指定してください。","VALIDATION_ERROR");
      }
      if (!startTime || !endTime) {
        return errorResponse("開始時刻と終了時刻を指定してください。","VALIDATION_ERROR");
      }
      if (!validateShiftRequestTime_(startTime) || !validateShiftRequestTime_(endTime)) {
        return errorResponse(
          "時刻は08:00〜24:00、分は00・15・30・45のみ指定できます。",
          "INVALID_SHIFT_TIME"
        );
      }
      if (shiftRequestClockMinutes_(startTime) >= shiftRequestClockMinutes_(endTime)) {
        return errorResponse("終了時刻は開始時刻より後にしてください。","INVALID_SHIFT_TIME");
      }

      const requestStaff = findShiftRequestStaff_(staffCode);
      const requestRole = String(
        requestStaff && requestStaff.role
          ? requestStaff.role
          : "STAFF"
      ).trim().toUpperCase();

      if (requestRole === "STAFF") {
        const presenceCheck = validateStaffShiftAgainstPresence_(
          resolvedStoreCode,
          date,
          startTime,
          endTime
        );

        if (!presenceCheck.ok) {
          return errorResponse(
            presenceCheck.message,
            "OUTSIDE_STAFF_PRESENCE_HOURS",
            {
              presence:presenceCheck.presence
            }
          );
        }
      }
    }

    const requestId = "SHREQ" +
      Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, "yyyyMMddHHmmss") +
      Utilities.getUuid().replace(/-/g,"").substring(0,8).toUpperCase();

    const record = {
      request_id: requestId,
      request_type: requestType,
      staff_code: staffCode,
      shift_id: shiftId,
      store_code: resolvedStoreCode,
      date: date,
      old_start_time: original ? original.start_time : "",
      old_end_time: original ? original.end_time : "",
      new_start_time: startTime,
      new_end_time: endTime,
      reason: String(body.reason || "").trim(),
      status: "PENDING",
      requested_by_email: auth.email,
      requested_at: new Date(),
      decided_by_email: "",
      decided_by_staff_code: "",
      decided_at: "",
      decision_note: "",
      approved_shift_id: ""
    };

    // 既存予約があっても申請は可能。
    // 影響予約は申請時警告・承認メール・承認画面で明示する。
    const affectedReservations =
      getShiftRequestAffectedReservations_(
        record
      );

    appendShiftChangeRequest_(record);

    const mailResult =
      sendShiftChangeRequestApprovalMails_(
        record
      );

    return successResponse({
      request_id: requestId,
      status: "PENDING",
      message: "シフト変更申請を送信しました。",
      mail_sent: true,
      mail_sent_to: mailResult.sent_to,
      has_affected_reservations:
        affectedReservations.length > 0,
      affected_reservations:
        affectedReservations
    });

  } catch (error) {
    logError("createShiftChangeRequest", error.message, {stack:error.stack});
    return errorResponse(error.message || "シフト変更申請中にエラーが発生しました。","SYSTEM_ERROR");
  }
}

function getMyShiftChangeRequests(params) {
  try {
    const auth = requireAuth_(params || {}, ["ADMIN","MANAGER","STAFF"]);
    const rows = getShiftChangeRequestRows_()
      .filter(r => isManagement_(auth) ||
        String(r.staff_code || "").toUpperCase() === String(auth.staff_code || "").toUpperCase())
      .sort((a,b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0));
    return successResponse(rows);
  } catch (error) {
    return errorResponse(error.message,"AUTH_ERROR");
  }
}

function renderShiftChangeRequestDecisionPage_(params) {
  params = params || {};
  const rid = String(params.rid || "").trim();
  const approver = String(params.approver || "").trim().toLowerCase();
  const token = String(params.token || "").trim();

  let req = null;
  let err = "";
  try {
    verifyShiftRequestApprovalLink_(rid, approver, token);
    ensureApproverStillAuthorized_(approver);
    req = getShiftChangeRequestById_(rid);
    if (!req) throw new Error("申請が見つかりません。");
  } catch (e) {
    err = e.message;
  }

  const html = buildShiftRequestDecisionHtml_(req,{rid,approver,token,error:err});
  return HtmlService.createHtmlOutput(html).setTitle("シフト変更申請");
}

function getShiftChangeRequestDecisionPreview(payload) {
  payload = payload || {};

  const rid =
    String(payload.request_id || "").trim();

  const approver =
    String(payload.approver || "").trim().toLowerCase();

  const token =
    String(payload.token || "").trim();

  verifyShiftRequestApprovalLink_(
    rid,
    approver,
    token
  );

  ensureApproverStillAuthorized_(
    approver
  );

  const req =
    getShiftChangeRequestById_(
      rid
    );

  if (!req) {
    throw new Error(
      "申請が見つかりません。"
    );
  }

  if (
    String(req.status || "")
      .trim()
      .toUpperCase() !== "PENDING"
  ) {
    return {
      ok: true,
      already_decided: true,
      message:
        buildAlreadyDecidedMessage_(
          req
        ),
      affected_reservations: []
    };
  }

  const affectedReservations =
    getShiftRequestAffectedReservations_(
      req
    );

  return {
    ok: true,
    already_decided: false,
    affected_reservations:
      affectedReservations,
    warning:
      buildShiftAffectedReservationWarningText_(
        affectedReservations
      )
  };
}


function decideShiftChangeRequestFromPage(payload) {
  payload = payload || {};
  const rid = String(payload.request_id || "").trim();
  const approver = String(payload.approver || "").trim().toLowerCase();
  const token = String(payload.token || "").trim();
  const decision = String(payload.decision || "").trim().toUpperCase();
  const note = String(payload.note || "").trim();

  verifyShiftRequestApprovalLink_(rid, approver, token);
  const access = ensureApproverStillAuthorized_(approver);
  if (!["APPROVE","REJECT"].includes(decision)) throw new Error("処理内容が正しくありません。");

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const req = getShiftChangeRequestById_(rid);
    if (!req) throw new Error("申請が見つかりません。");

    if (String(req.status).toUpperCase() !== "PENDING") {
      return {ok:true, already_decided:true, message:buildAlreadyDecidedMessage_(req)};
    }

    let approvedShiftId = "";
    let affectedReservations = [];

    if (decision === "APPROVE") {
      // 申請後に予約が追加・変更される場合があるため、
      // 承認直前にも最新の影響予約を取得する。
      affectedReservations =
        getShiftRequestAffectedReservations_(
          req
        );

      const applied =
        applyApprovedShiftRequest_(
          req
        );

      approvedShiftId =
        applied.shift_id ||
        req.shift_id ||
        "";
    }

    updateShiftChangeRequestDecision_(rid,{
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      decided_by_email: approver,
      decided_by_staff_code: access.staff_code,
      decided_at: new Date(),
      decision_note: note,
      approved_shift_id: approvedShiftId
    });

    const updated = getShiftChangeRequestById_(rid);
    sendShiftChangeRequestResultMail_(updated);

    return {
      ok:true,
      message: decision === "APPROVE"
        ? (
            affectedReservations.length
              ? "承認しました。シフトへ反映しました。影響予約は担当者再設定またはリスケ対応が必要です。"
              : "承認しました。シフトへ反映しました。"
          )
        : "却下しました。",
      affected_reservations:
        affectedReservations
    };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function applyApprovedShiftRequest_(req) {
  req = normalizeShiftRequestRecord_(req);

  if (isShiftRequestTodayOrPast_(req.date)) {
    throw new Error(getSameDayShiftRequestMessage_());
  }

  const type = String(req.request_type || "").toUpperCase();

  if (type === "DELETE") {
    const r = parseTextOutputResponse_(
      deleteStaffShift({
        shift_id: req.shift_id
      })
    );

    if (!r.ok) {
      throw new Error(r.message || "シフト削除に失敗しました。");
    }

    return {
      shift_id: req.shift_id
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) {
    throw new Error("勤務日の形式を補正できませんでした。");
  }

  if (
    !validateShiftRequestTime_(req.new_start_time) ||
    !validateShiftRequestTime_(req.new_end_time)
  ) {
    throw new Error(
      "申請時刻が利用可能範囲外です。08:00〜24:00、15分刻みで再申請してください。"
    );
  }

  if (
    shiftRequestClockMinutes_(req.new_start_time) >=
    shiftRequestClockMinutes_(req.new_end_time)
  ) {
    throw new Error("終了時刻は開始時刻より後にしてください。");
  }

  const payload = {
    staff_code: req.staff_code,
    store_code: req.store_code,
    date: req.date,
    start_time: req.new_start_time,
    end_time: req.new_end_time
  };

  if (type === "UPDATE") {
    payload.shift_id = req.shift_id;
  }

  const r = parseTextOutputResponse_(
    saveStaffShift(payload)
  );

  if (!r.ok) {
    throw new Error(r.message || "シフト保存に失敗しました。");
  }

  return {
    shift_id:
      (r.data && r.data.shift_id) ||
      req.shift_id ||
      ""
  };
}

function sendShiftChangeRequestApprovalMails_(req) {
  const approvers =
    getShiftRequestApprovers_();

  if (!approvers.length) {
    throw new Error(
      "承認者（ADMIN / MANAGER）のメールアドレスが登録されていません。"
    );
  }

  const requester =
    getShiftRequestHonorific_(
      req.staff_code
    );

  const detail =
    buildShiftRequestDetailText_(
      req
    );

  const affectedReservations =
    getShiftRequestAffectedReservations_(
      req
    );

  const affectedWarning =
    buildShiftAffectedReservationWarningText_(
      affectedReservations
    );

  const sentTo = [];
  const errors = [];

  approvers.forEach(a => {

    try {

      const url =
        buildShiftRequestApprovalUrl_(
          req.request_id,
          a.email
        );

      MailApp.sendEmail({
        to:
          a.email,

        subject:
          "【A-nauts OS Reserve】" +
          requester +
          "からシフト変更申請",

        name:
          "A-nauts OS Reserve",

        body:
          requester +
          "からシフト変更申請が届きました。\n\n" +
          detail +
          (
            req.reason
              ? "\n\n申請理由：" +
                req.reason
              : ""
          ) +
          (
            affectedWarning
              ? "\n\n" +
                affectedWarning
              : ""
          ) +
          "\n\n承認・却下：\n" +
          url,

        htmlBody:
          '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.7">' +
          '<h2>シフト変更申請</h2>' +
          '<p>' +
          escShiftReq_(requester) +
          'から申請が届きました。</p>' +
          '<div style="padding:16px;border:1px solid #ddd;border-radius:12px">' +
          escShiftReq_(detail)
            .replace(/\n/g,"<br>") +
          (
            req.reason
              ? '<hr><strong>申請理由</strong><br>' +
                escShiftReq_(req.reason)
              : ''
          ) +
          (
            affectedWarning
              ? '<hr><div style="padding:12px;border:1px solid #d97706;background:#fff7ed;color:#9a3412;border-radius:10px">' +
                '<strong>⚠ 既存予定あり</strong><br>' +
                escShiftReq_(affectedWarning)
                  .replace(/\n/g,"<br>") +
                '</div>'
              : ''
          ) +
          '</div>' +
          '<p><a href="' +
          escShiftReq_(url) +
          '" style="display:inline-block;padding:12px 20px;background:#63d179;color:#061008;text-decoration:none;border-radius:10px;font-weight:700">' +
          '申請内容を確認・承認/却下' +
          '</a></p>' +
          '</div>'
      });

      sentTo.push(
        a.email
      );

      Logger.log(
        "Shift approval mail sent: " +
        a.email +
        " / " +
        req.request_id
      );

    } catch (error) {

      errors.push({
        email:
          a.email,

        message:
          error.message
      });

      logError(
        "sendShiftChangeRequestApprovalMails_",
        error.message,
        {
          email:
            a.email,

          request_id:
            req.request_id
        }
      );
    }
  });


  if (!sentTo.length) {

    throw new Error(
      "ADMIN / MANAGERへの承認メールを送信できませんでした。" +
      (
        errors.length
          ? " " +
            errors
              .map(x =>
                x.email +
                ": " +
                x.message
              )
              .join(" / ")
          : ""
      )
    );
  }


  return {
    sent_to:
      sentTo,

    errors:
      errors
  };
}

function sendShiftChangeRequestResultMail_(req) {
  const to = String(req.requested_by_email || "").trim();
  if (!to) return;

  const staffName = getShiftRequestHonorific_(req.staff_code);
  const approverName = getShiftRequestHonorific_(req.decided_by_staff_code);
  const approved = String(req.status).toUpperCase() === "APPROVED";

  MailApp.sendEmail({
    to:to,
    name:"A-nauts OS Reserve",
    subject: approved
      ? "【A-nauts OS Reserve】シフト変更申請が承認されました"
      : "【A-nauts OS Reserve】シフト変更申請が却下されました",
    body:
      staffName + "\n\nシフト変更申請が" + (approved ? "承認" : "却下") + "されました。\n\n" +
      buildShiftRequestDetailText_(req) +
      "\n\n対応者：" + approverName +
      (req.decision_note ? "\nコメント：" + req.decision_note : "")
  });
}

function getShiftRequestApprovers_() {
  const sheet =
    getAuthSheet_();

  const values =
    sheet
      .getDataRange()
      .getValues();

  if (
    values.length < 2
  ) {
    return [];
  }

  const h =
    values[0]
      .map(String);

  const idx = {};

  h.forEach(
    (x,i) =>
      idx[x] = i
  );


  const rows =
    values
      .slice(1)
      .map(r => ({
        email:
          String(
            r[idx.email] ||
            ""
          )
            .trim()
            .toLowerCase(),

        staff_code:
          String(
            r[idx.staff_code] ||
            ""
          )
            .trim()
            .toUpperCase(),

        permission:
          String(
            r[idx.permission] ||
            ""
          )
            .trim()
            .toUpperCase(),

        active:
          normalizeAuthBoolean_(
            r[idx.active]
          )
      }))
      .filter(x =>
        x.email &&
        x.active &&
        [
          "ADMIN",
          "MANAGER"
        ].includes(
          x.permission
        )
      );


  const seen =
    new Set();


  return rows.filter(x => {

    if (
      seen.has(
        x.email
      )
    ) {
      return false;
    }

    seen.add(
      x.email
    );

    return true;
  });
}

function ensureApproverStillAuthorized_(email) {
  const access = findAuthAccessByEmail_(email);
  if (!access || !access.active || !["ADMIN","MANAGER"].includes(access.permission)) {
    throw new Error("この申請を処理する権限がありません。");
  }
  return access;
}

function buildShiftRequestApprovalUrl_(rid, email) {
  const token = createShiftRequestApprovalToken_(rid,email);
  return ScriptApp.getService().getUrl() +
    "?page=shift-request&rid=" + encodeURIComponent(rid) +
    "&approver=" + encodeURIComponent(email) +
    "&token=" + encodeURIComponent(token);
}

function createShiftRequestApprovalToken_(rid,email) {
  const message = String(rid).trim() + "|" + String(email).trim().toLowerCase();
  const sig = Utilities.computeHmacSha256Signature(message,getShiftRequestSecret_());
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/g,"");
}

function verifyShiftRequestApprovalLink_(rid,email,token) {
  if (!rid || !email || !token) throw new Error("承認URLが正しくありません。");
  if (createShiftRequestApprovalToken_(rid,email) !== token) {
    throw new Error("承認URLの署名が一致しません。");
  }
}

function getShiftRequestSecret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("SHIFT_CHANGE_REQUEST_SECRET");
  if (!s) {
    s = Utilities.getUuid().replace(/-/g,"") + Utilities.getUuid().replace(/-/g,"");
    p.setProperty("SHIFT_CHANGE_REQUEST_SECRET",s);
  }
  return s;
}

function getShiftChangeRequestSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHIFT_CHANGE_REQUEST_SHEET);
  const headers = [
    "request_id","request_type","staff_code","shift_id","store_code","date",
    "old_start_time","old_end_time","new_start_time","new_end_time","reason","status",
    "requested_by_email","requested_at","decided_by_email","decided_by_staff_code",
    "decided_at","decision_note","approved_shift_id"
  ];
  if (!sh) {
    sh = ss.insertSheet(SHIFT_CHANGE_REQUEST_SHEET);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function appendShiftChangeRequest_(record) {
  const sh = getShiftChangeRequestSheet_();
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(record,h) ? record[h] : ""));
}

function getShiftChangeRequestRows_() {
  const sh = getShiftChangeRequestSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const h = values[0].map(String);
  return values.slice(1).map(r=>{
    const o={};
    h.forEach((x,i)=>o[x]=r[i]);
    return normalizeShiftRequestRecord_(o);
  });
}

function getShiftChangeRequestById_(rid) {
  return getShiftChangeRequestRows_().find(r=>String(r.request_id || "") === String(rid || "")) || null;
}

function updateShiftChangeRequestDecision_(rid,changes) {
  const sh = getShiftChangeRequestSheet_();
  const values = sh.getDataRange().getValues();
  const h = values[0].map(String);
  const idCol = h.indexOf("request_id");
  const idx = values.slice(1).findIndex(r=>String(r[idCol] || "") === String(rid || ""));
  if (idx < 0) throw new Error("申請が見つかりません。");
  const rowNo = idx + 2;
  const row = sh.getRange(rowNo,1,1,h.length).getValues()[0];
  h.forEach((x,i)=>{ if (Object.prototype.hasOwnProperty.call(changes,x)) row[i]=changes[x]; });
  sh.getRange(rowNo,1,1,h.length).setValues([row]);
}

function findActiveShiftById_(shiftId) {
  const r = getSheetData(APP_CONFIG.SHEETS.STAFF_SHIFTS).find(x=>
    String(x.shift_id || "").trim() === String(shiftId || "").trim() &&
    normalizeShiftBoolean_(x.active)
  );
  if (!r) return null;
  return {
    shift_id:String(r.shift_id || ""),
    staff_code:String(r.staff_code || ""),
    store_code:String(r.store_code || ""),
    date:formatShiftDate_(r.date),
    start_time:formatShiftTime_(r.start_time),
    end_time:formatShiftTime_(r.end_time),
    active:true
  };
}

function hasPendingShiftRequestForShift_(shiftId) {
  return getShiftChangeRequestRows_().some(r=>
    String(r.shift_id || "") === String(shiftId || "") &&
    String(r.status || "").toUpperCase() === "PENDING"
  );
}

function findShiftRequestStaff_(staffCode) {
  const code = String(staffCode || "").trim().toUpperCase();
  return getSheetData(APP_CONFIG.SHEETS.STAFF).find(r=>
    String(r.staff_code || "").trim().toUpperCase() === code
  ) || null;
}

function getShiftRequestHonorific_(staffCode) {
  const s = findShiftRequestStaff_(staffCode);
  if (!s) return String(staffCode || "");
  const name = String(s.display_name || s.staff_name || s.staff_code || "").trim();
  return String(s.role || "").trim().toUpperCase() === "TRAINER"
    ? name + "トレーナー"
    : name + "さん";
}

function parseTextOutputResponse_(output) {
  if (output && typeof output.getContent === "function") return JSON.parse(output.getContent());
  if (output && typeof output === "object") return output;
  throw new Error("API応答を解析できません。");
}

function buildShiftRequestDetailText_(r) {
  r = normalizeShiftRequestRecord_(r);

  const t = String(r.request_type || "").toUpperCase();

  if (t === "ADD") {
    return (
      "申請内容：シフト追加\n" +
      "勤務日：" + r.date + "\n" +
      "時間：" + r.new_start_time + "〜" + r.new_end_time
    );
  }

  if (t === "DELETE") {
    return (
      "申請内容：シフト削除\n" +
      "勤務日：" + r.date + "\n" +
      "現在：" + r.old_start_time + "〜" + r.old_end_time
    );
  }

  return (
    "申請内容：シフト変更\n" +
    "勤務日：" + r.date + "\n" +
    "変更前：" + r.old_start_time + "〜" + r.old_end_time + "\n" +
    "変更後：" + r.new_start_time + "〜" + r.new_end_time
  );
}

function buildAlreadyDecidedMessage_(r) {
  const person = getShiftRequestHonorific_(r.decided_by_staff_code);
  const dt = r.decided_at ? Utilities.formatDate(new Date(r.decided_at),APP_CONFIG.TIMEZONE,"yyyy/MM/dd HH:mm") : "";
  return "この申請は" + person + "が" + dt + "に" +
    (String(r.status).toUpperCase() === "APPROVED" ? "承認済みです。" : "却下済みです。");
}

function buildShiftRequestDecisionHtml_(r,c) {
  if (c.error) {
    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>シフト変更申請</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#090d0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(100% - 24px,760px);margin:24px auto;padding-bottom:24px}
.card{padding:24px;border:1px solid rgba(255,255,255,.10);border-radius:20px;background:#121914}
h1{font-size:28px;margin:0 0 16px}
p{font-size:17px;line-height:1.7;color:#ffb7b7}
@media(max-width:600px){
  main{width:100%;margin:0;padding:12px}
  .card{min-height:calc(100vh - 24px);padding:22px 18px;border-radius:18px}
  h1{font-size:26px}
}
</style>
</head>
<body><main><section class="card">
<h1>申請を確認できません</h1>
<p>${escShiftReq_(c.error)}</p>
</section></main></body></html>`;
  }

  r = normalizeShiftRequestRecord_(r);

  const decided =
    String(r.status || "").toUpperCase() !== "PENDING";

  const detail =
    escShiftReq_(buildShiftRequestDetailText_(r))
      .replace(/\n/g,"<br>");

  const name =
    escShiftReq_(getShiftRequestHonorific_(r.staff_code));

  let affectedReservations = [];
  let affectedWarning = "";

  if (!decided) {
    try {
      affectedReservations =
        getShiftRequestAffectedReservations_(
          r
        );

      affectedWarning =
        buildShiftAffectedReservationWarningText_(
          affectedReservations
        );
    } catch (error) {
      affectedWarning =
        "⚠ 最新の予約状況を確認できませんでした。承認前に再確認してください。";
    }
  }

  const affectedWarningHtml =
    affectedWarning
      ? '<div class="warn"><strong>重要：既存予定あり</strong><br>' +
        escShiftReq_(affectedWarning)
          .replace(/\\n/g,"<br>") +
        '</div>'
      : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>シフト変更申請</title>
<style>
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;
  background:#090d0a;
  color:#f5f8f5;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
}
main{
  width:min(100% - 28px,760px);
  margin:24px auto;
  padding-bottom:24px
}
.card{
  padding:30px;
  border:1px solid rgba(255,255,255,.10);
  border-radius:22px;
  background:#131a15;
  box-shadow:0 24px 70px rgba(0,0,0,.28)
}
.e{
  color:#63d179;
  font-size:13px;
  font-weight:900;
  letter-spacing:.16em
}
h1{
  margin:10px 0 12px;
  font-size:34px;
  line-height:1.25
}
.m{
  color:#a7b3aa;
  font-size:18px
}
.d{
  margin:24px 0;
  padding:22px;
  border-radius:16px;
  background:#0d130f;
  font-size:18px;
  line-height:1.9;
  overflow-wrap:anywhere
}
.d hr{
  border:0;
  border-top:1px solid rgba(255,255,255,.09);
  margin:18px 0
}
label.note-label{
  display:block;
  margin-top:4px;
  color:#a7b3aa;
  font-size:15px
}
textarea{
  width:100%;
  min-height:120px;
  margin-top:10px;
  padding:16px;
  border:1px solid #354038;
  border-radius:14px;
  background:#0a100c;
  color:white;
  font-size:17px;
  line-height:1.5
}
.a{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
  margin-top:18px
}
button{
  min-height:58px;
  padding:14px 18px;
  border-radius:14px;
  font-size:18px;
  font-weight:900;
  cursor:pointer
}
button:disabled{opacity:.55;cursor:wait}
.ok{
  border:0;
  background:#63d179;
  color:#061008
}
.ng{
  border:1px solid #74383b;
  background:#3b191b;
  color:#ffb7b7
}
.warn{
  margin:18px 0;
  padding:16px;
  border:1px solid #d97706;
  border-radius:14px;
  background:#2a1b08;
  color:#ffd8a8;
  font-size:16px;
  line-height:1.7
}
#msg{
  margin-top:18px;
  padding:16px;
  border-radius:12px;
  background:#0d130f;
  font-size:16px;
  line-height:1.6
}

@media(max-width:600px){
  main{
    width:100%;
    margin:0;
    padding:10px
  }
  .card{
    min-height:calc(100vh - 20px);
    padding:24px 18px;
    border-radius:18px
  }
  .e{font-size:12px}
  h1{font-size:30px;margin-top:8px}
  .m{font-size:18px}
  .d{
    padding:18px;
    font-size:17px;
    line-height:1.85
  }
  textarea{
    min-height:130px;
    font-size:16px
  }
  .a{
    grid-template-columns:1fr;
    gap:12px
  }
  button{
    width:100%;
    min-height:60px;
    font-size:18px
  }
}
</style>
</head>
<body>
<main>
<section class="card">
  <div class="e">SHIFT REQUEST</div>
  <h1>シフト変更申請</h1>
  <div class="m">${name}</div>

  <div class="d">
    ${detail}
    ${
      r.reason
        ? '<hr><strong>申請理由</strong><br>' + escShiftReq_(r.reason)
        : ''
    }
  </div>

  ${affectedWarningHtml}

  ${
    decided
      ? '<div id="msg">' + escShiftReq_(buildAlreadyDecidedMessage_(r)) + '</div>'
      : `
        <label class="note-label" for="note">コメント（任意）</label>
        <textarea id="note" placeholder="承認・却下に関するコメントがあれば入力してください。"></textarea>
        <div class="a">
          <button class="ok" onclick="go('APPROVE')">承認する</button>
          <button class="ng" onclick="go('REJECT')">却下する</button>
        </div>
        <div id="msg" style="display:none"></div>
      `
  }
</section>
</main>

<script>
function setButtonsDisabled(disabled){
  document.querySelectorAll("button")
    .forEach(function(button){
      button.disabled=disabled;
    });
}

function showError(error){
  const msg=document.getElementById("msg");
  const text=(error&&error.message)||"処理に失敗しました。";
  msg.style.display="block";
  msg.innerHTML=text.replace(/080-3553-4259/g,
    '<a href="tel:08035534259" style="color:#79dc8c;font-weight:900">080-3553-4259</a>');
  setButtonsDisabled(false);
}

function submitDecision(decision){
  const msg=document.getElementById("msg");
  msg.style.display="block";
  msg.textContent="処理中です…";

  google.script.run
    .withSuccessHandler(function(result){
      msg.textContent=result.message||"処理しました。";
      document.querySelectorAll("button")
        .forEach(function(button){
          button.style.display="none";
        });
    })
    .withFailureHandler(showError)
    .decideShiftChangeRequestFromPage({
      request_id:${JSON.stringify(c.rid)},
      approver:${JSON.stringify(c.approver)},
      token:${JSON.stringify(c.token)},
      decision:decision,
      note:(document.getElementById("note")||{}).value||""
    });
}

function go(decision){
  if(decision==="REJECT"){
    setButtonsDisabled(true);
    submitDecision(decision);
    return;
  }

  setButtonsDisabled(true);

  const msg=document.getElementById("msg");
  msg.style.display="block";
  msg.textContent="最新の予定を確認しています…";

  google.script.run
    .withSuccessHandler(function(preview){
      if(preview&&preview.already_decided){
        msg.textContent=preview.message||"この申請は処理済みです。";
        document.querySelectorAll("button")
          .forEach(function(button){
            button.style.display="none";
          });
        return;
      }

      const rows=(preview&&preview.affected_reservations)||[];
      let confirmText="本当に承認しますか？\\n承認するとシフトへ反映されます。";

      if(rows.length){
        confirmText+=
          "\\n\\n⚠ 承認すると担当者の再設定またはリスケ対応が必要な予約があります。\\n" +
          rows.slice(0,10).map(function(row){
            return (row.start_time||"") + "〜" + (row.end_time||"") +
              " " + (row.service_name||row.service_code||"予約") +
              (row.customer_name ? " / " + row.customer_name + "様" : "");
          }).join("\\n");
      }

      if(!window.confirm(confirmText)){
        msg.style.display="none";
        msg.textContent="";
        setButtonsDisabled(false);
        return;
      }

      submitDecision("APPROVE");
    })
    .withFailureHandler(showError)
    .getShiftChangeRequestDecisionPreview({
      request_id:${JSON.stringify(c.rid)},
      approver:${JSON.stringify(c.approver)},
      token:${JSON.stringify(c.token)}
    });
}
</script>
</body>
</html>`;
}

function escShiftReq_(v) {
  return String(v == null ? "" : v)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function testEnsureShiftChangeRequestSheet() {
  Logger.log(getShiftChangeRequestSheet_().getName());
}


/**
 * STAFF / TRAINER本人のシフト変更申請権限
 */
function requireOwnShiftRequestPermission_(params, staffCode) {
  const auth = requireAuth_(
    params || {},
    ["ADMIN", "MANAGER", "STAFF"]
  );

  const loginStaffCode =
    String(auth.staff_code || "").trim().toUpperCase();

  const targetStaffCode =
    String(staffCode || "").trim().toUpperCase();

  if (!targetStaffCode) {
    throw new Error("スタッフコードを確認できません。");
  }

  if (loginStaffCode !== targetStaffCode) {
    throw new Error("他のスタッフのシフト変更は申請できません。");
  }

  const staff = findShiftRequestStaff_(targetStaffCode);

  if (!staff) {
    throw new Error("スタッフ情報が見つかりません。");
  }

  const role =
    String(staff.role || "").trim().toUpperCase();

  if (!["STAFF", "TRAINER"].includes(role)) {
    throw new Error("このスタッフ種別ではシフト変更申請を利用できません。");
  }

  return auth;
}
