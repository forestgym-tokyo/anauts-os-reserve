/**
 * Internal-only staff reassignment entry point.
 *
 * This action deliberately accepts only reservation_id and staff_code.
 * Date, time, note and customer fields are never forwarded.
 */
function reassignReservationStaff(params) {
  try {
    params = params || {};

    requireAuth_(
      params,
      ["ADMIN", "MANAGER", "STAFF"]
    );

    const call = buildStaffReassignmentUpdateCall_(params);

    if (!call.params.reservation_id) {
      return errorResponse(
        "reservation_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!call.params.staff_code) {
      return errorResponse(
        "staff_codeを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    return updateReservation(
      call.params,
      call.options
    );

  } catch (error) {
    logError(
      "reassignReservationStaff",
      error.message,
      { stack: error.stack }
    );

    return errorResponse(
      error.message || "担当者の再割り当てに失敗しました。",
      "AUTH_ERROR"
    );
  }
}


/**
 * Build the only payload that the reassignment action may forward.
 * Keeping notification options in updateReservation's second argument means
 * an HTTP client cannot spoof the no-mail mode in its JSON body.
 */
function buildStaffReassignmentUpdateCall_(params) {
  params = params || {};

  return {
    params: {
      reservation_id:
        normalizeReservationText_(params.reservation_id),
      staff_code:
        normalizeReservationText_(params.staff_code),
      internal_operation: true,
      id_token:
        normalizeReservationText_(params.id_token)
    },
    options: {
      staff_reassignment_only: true,
      suppress_customer_mail: true,
      history_source: "AUTO_STAFF_REASSIGNMENT"
    }
  };
}


function shouldSendUpdateReservationMail_(operationOptions) {
  return !(
    operationOptions &&
    operationOptions.suppress_customer_mail === true
  );
}


function isStaffServiceCapabilityEnabled_(staff, serviceCode) {
  const code = normalizeReservationText_(serviceCode).toUpperCase();
  const fields = {
    TOUR: "can_tour",
    COUNSEL: "can_counsel",
    MEAL_PLANNING: "can_meal_planning"
  };
  const field = fields[code];

  if (!field) {
    return true;
  }

  const value = staff && staff[field];
  return value === true ||
    ["TRUE", "1", "YES", "ON"].includes(
      String(value || "").trim().toUpperCase()
    );
}


/**
 * Re-evaluate future TOUR / COUNSEL / MEAL_PLANNING reservations in one
 * authenticated request. All reads happen inside Apps Script, so the admin
 * browser does not issue per-day API bursts.
 */
function reassignInvalidReservations(params) {
  try {
    params = params || {};

    requireAuth_(
      params,
      ["ADMIN", "MANAGER", "STAFF"]
    );

    const startDate =
      normalizeReservationText_(params.start_date) ||
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      );

    const requestedDays = Number(params.days);
    const days = Number.isFinite(requestedDays)
      ? Math.max(0, Math.min(30, Math.floor(requestedDays)))
      : 14;

    const maxUpdates = 100;
    const endDate = addAutoReassignDays_(startDate, days);
    const staffData = getAutoReassignApiData_(
      getStaff({ include_inactive: "true" }),
      "getStaff"
    );
    const serviceData = getAutoReassignApiData_(
      getServices(),
      "getServices"
    );
    const shiftData = getAutoReassignApiData_(
      getStaffShifts({
        start_date: startDate,
        end_date: endDate
      }),
      "getStaffShifts"
    );

    const staff = getAutoReassignArray_(staffData, "staff");
    const services = getAutoReassignArray_(serviceData, "services");
    const shifts = getAutoReassignArray_(shiftData, "shifts")
      .filter(function(shift) {
        return shift && shift.active !== false;
      });
    const staffByCode = new Map();
    const serviceByCode = new Map();

    staff.forEach(function(row) {
      staffByCode.set(
        normalizeReservationText_(row.staff_code),
        row
      );
    });
    services.forEach(function(row) {
      serviceByCode.set(
        normalizeReservationText_(row.service_code).toUpperCase(),
        row
      );
    });

    const changed = [];
    const failures = [];
    const snapshotRows = [];
    const inspectedReservationIds = new Set();
    let scannedReservations = 0;

    for (let offset = 0; offset <= days; offset++) {
      const date = addAutoReassignDays_(startDate, offset);
      const dateRows = getAutoReassignScheduleRows_(date);

      for (let index = 0; index < dateRows.length; index++) {
        const reservation = dateRows[index] || {};
        const reservationId = normalizeReservationText_(
          reservation.reservation_id
        );
        const serviceCode = normalizeReservationText_(
          reservation.service_code
        ).toUpperCase();

        if (
          !reservationId ||
          inspectedReservationIds.has(reservationId) ||
          !["TOUR", "COUNSEL", "MEAL_PLANNING"].includes(serviceCode) ||
          !isAutoReassignReservationActive_(reservation)
        ) {
          continue;
        }

        inspectedReservationIds.add(reservationId);
        scannedReservations++;

        const service = serviceByCode.get(serviceCode) || {
          service_code: serviceCode,
          provider_role: reservation.provider_role || "STAFF"
        };
        const assigned = staffByCode.get(
          normalizeReservationText_(reservation.staff_code)
        );

        if (
          assigned &&
          isAutoReassignStaffEligible_(assigned, service) &&
          doesAutoReassignStaffWork_(assigned, shifts, reservation, date)
        ) {
          continue;
        }

        const candidates = staff.filter(function(candidate) {
          return isAutoReassignStaffEligible_(candidate, service) &&
            doesAutoReassignStaffWork_(candidate, shifts, reservation, date) &&
            isAutoReassignStaffFree_(candidate, reservation, dateRows);
        });
        const selected = selectAutoReassignCandidate_(
          candidates,
          dateRows
        );

        if (!selected) {
          failures.push({
            reservation_id: reservationId,
            service_code: serviceCode,
            reason: "NO_ELIGIBLE_STAFF"
          });
          continue;
        }

        if (changed.length >= maxUpdates) {
          failures.push({
            reservation_id: reservationId,
            service_code: serviceCode,
            reason: "UPDATE_LIMIT_REACHED"
          });
          continue;
        }

        const call = buildStaffReassignmentUpdateCall_({
          reservation_id: reservationId,
          staff_code: selected.staff_code,
          id_token: params.id_token
        });
        const updateResult = getAutoReassignApiResult_(
          updateReservation(call.params, call.options),
          "updateReservation"
        );

        if (!updateResult.ok) {
          failures.push({
            reservation_id: reservationId,
            service_code: serviceCode,
            staff_code: selected.staff_code,
            reason: updateResult.code || "UPDATE_FAILED",
            message: updateResult.message || ""
          });
          continue;
        }

        reservation.staff_code = selected.staff_code;
        reservation.staff_name =
          selected.staff_name ||
          selected.display_name ||
          selected.staff_code;

        if (!updateResult.data || updateResult.data.changed !== false) {
          changed.push({
            reservation_id: reservationId,
            service_code: serviceCode,
            old_staff_code:
              normalizeReservationText_(assigned && assigned.staff_code),
            staff_code:
              normalizeReservationText_(selected.staff_code)
          });
        }
      }

      if (isAutoReassignSnapshotRequested_(params)) {
        dateRows.forEach(function(row) {
          if (!row || !isAutoReassignReservationActive_(row)) {
            return;
          }
          snapshotRows.push(Object.assign({}, row, {
            date: normalizeReservationText_(
              row.date || row.reservation_date || date
            ).slice(0, 10)
          }));
        });
      }
    }

    const responseData = {
        start_date: startDate,
        end_date: endDate,
        scanned_reservations: scannedReservations,
        changed_count: changed.length,
        changed: changed,
        failure_count: failures.length,
        failures: failures,
        customer_notifications_sent: 0
      };

    if (isAutoReassignSnapshotRequested_(params)) {
      responseData.snapshot = {
        staff: staff,
        services: services,
        shifts: shifts,
        reservations: dedupeAutoReassignSnapshotRows_(snapshotRows)
      };
    }

    return successResponse(
      responseData,
      changed.length
        ? changed.length + "件の担当者を再割り当てしました。"
        : "担当者の再割り当てはありません。"
    );

  } catch (error) {
    logError(
      "reassignInvalidReservations",
      error.message,
      { stack: error.stack }
    );
    return errorResponse(
      error.message || "予約担当者の再判定に失敗しました。",
      "SYSTEM_ERROR"
    );
  }
}


function isAutoReassignSnapshotRequested_(params) {
  const value = params && params.include_snapshot;
  return value === true ||
    ["TRUE", "1", "YES", "ON"].includes(
      String(value || "").trim().toUpperCase()
    );
}


function dedupeAutoReassignSnapshotRows_(rows) {
  const unique = new Map();
  (rows || []).forEach(function(row) {
    const key = normalizeReservationText_(row && row.reservation_id) ||
      [
        normalizeReservationText_(row && row.date),
        normalizeReservationText_(row && row.start_time),
        normalizeReservationText_(row && row.service_code),
        normalizeReservationText_(row && row.customer_name)
      ].join("|");
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  });
  return Array.from(unique.values());
}


function getAutoReassignApiResult_(response, label) {
  if (!response || typeof response.getContent !== "function") {
    throw new Error(label + "の応答を取得できません。");
  }
  return JSON.parse(response.getContent());
}


function getAutoReassignApiData_(response, label) {
  const result = getAutoReassignApiResult_(response, label);
  if (!result.ok) {
    throw new Error(result.message || label + "に失敗しました。");
  }
  return result.data || {};
}


function getAutoReassignArray_(data, key) {
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data && data[key]) ? data[key] : [];
}


function getAutoReassignScheduleRows_(date) {
  const rows = [];

  [getStaffSchedule, getTrainerSchedule].forEach(function(loader) {
    try {
      const data = getAutoReassignApiData_(
        loader({ date: date, store_code: "YACHIYO" }),
        loader === getStaffSchedule
          ? "getStaffSchedule"
          : "getTrainerSchedule"
      );
      getAutoReassignArray_(data, "reservations")
        .forEach(function(row) {
          rows.push(row);
        });
    } catch (error) {
      logError(
        "getAutoReassignScheduleRows_",
        error.message,
        { date: date }
      );
    }
  });

  const unique = new Map();
  rows.forEach(function(row) {
    const key = normalizeReservationText_(row.reservation_id) ||
      [
        date,
        normalizeReservationText_(row.start_time),
        normalizeReservationText_(row.service_code),
        normalizeReservationText_(row.customer_name)
      ].join("|");
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  });
  return Array.from(unique.values());
}


function isAutoReassignReservationActive_(reservation) {
  return ![
    "CANCELLED",
    "CANCELED",
    "CANCEL",
    "CONSUMED"
  ].includes(
    normalizeReservationText_(reservation && reservation.status)
      .toUpperCase()
  );
}


function getAutoReassignProviderRoles_(service) {
  return normalizeReservationText_(service && service.provider_role)
    .split(",")
    .map(function(role) {
      return normalizeReservationText_(role).toUpperCase();
    })
    .filter(Boolean);
}


function isAutoReassignStaffEligible_(staff, service) {
  if (!staff) {
    return false;
  }
  const active = staff.active === true ||
    ["TRUE", "1", "YES", "ON"].includes(
      String(staff.active || "").trim().toUpperCase()
    );
  const roles = getAutoReassignProviderRoles_(service);
  const role = normalizeReservationText_(staff.role).toUpperCase();

  return active &&
    roles.length > 0 &&
    roles.includes(role) &&
    isStaffServiceCapabilityEnabled_(
      staff,
      service && service.service_code
    );
}


function autoReassignMinutes_(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  return match
    ? Number(match[1]) * 60 + Number(match[2])
    : NaN;
}


function autoReassignCovers_(outerStart, outerEnd, innerStart, innerEnd) {
  return autoReassignMinutes_(outerStart) <= autoReassignMinutes_(innerStart) &&
    autoReassignMinutes_(outerEnd) >= autoReassignMinutes_(innerEnd);
}


function autoReassignOverlaps_(leftStart, leftEnd, rightStart, rightEnd) {
  return autoReassignMinutes_(leftStart) < autoReassignMinutes_(rightEnd) &&
    autoReassignMinutes_(leftEnd) > autoReassignMinutes_(rightStart);
}


function doesAutoReassignStaffWork_(staff, shifts, reservation, date) {
  const staffCode = normalizeReservationText_(staff && staff.staff_code);
  return shifts.some(function(shift) {
    return normalizeReservationText_(shift.staff_code) === staffCode &&
      normalizeReservationText_(shift.date).slice(0, 10) === date &&
      autoReassignCovers_(
        shift.start_time,
        shift.end_time,
        reservation.start_time,
        reservation.end_time
      );
  });
}


function isAutoReassignStaffFree_(staff, reservation, dateRows) {
  const staffCode = normalizeReservationText_(staff && staff.staff_code);
  const reservationId = normalizeReservationText_(reservation.reservation_id);

  return !dateRows.some(function(other) {
    if (!isAutoReassignReservationActive_(other)) {
      return false;
    }
    if (normalizeReservationText_(other.reservation_id) === reservationId) {
      return false;
    }
    if (normalizeReservationText_(other.staff_code) !== staffCode) {
      return false;
    }
    return autoReassignOverlaps_(
      other.start_time,
      other.end_time,
      reservation.start_time,
      reservation.end_time
    );
  });
}


function selectAutoReassignCandidate_(candidates, dateRows) {
  return candidates.slice().sort(function(left, right) {
    function assignedCount(staff) {
      const staffCode = normalizeReservationText_(staff.staff_code);
      return dateRows.filter(function(row) {
        return isAutoReassignReservationActive_(row) &&
          normalizeReservationText_(row.staff_code) === staffCode;
      }).length;
    }
    return assignedCount(left) - assignedCount(right) ||
      normalizeReservationText_(left.staff_code)
        .localeCompare(normalizeReservationText_(right.staff_code));
  })[0] || null;
}


function addAutoReassignDays_(dateText, days) {
  const parts = String(dateText).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2] + days);
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}


/**
 * Pure safety checks. Does not read or update Sheets/Calendar and sends no mail.
 */
function testStaffReassignmentSafetyPolicy() {
  const call = buildStaffReassignmentUpdateCall_({
    reservation_id: "RSV_TEST",
    staff_code: "KAWAKAMI",
    id_token: "TOKEN",
    date: "2099-01-01",
    start_time: "00:00",
    note: "must not be forwarded",
    suppress_customer_mail: false
  });

  if (call.params.date || call.params.start_time || call.params.note) {
    throw new Error("担当者以外の変更項目が転送されています。");
  }

  if (shouldSendUpdateReservationMail_(call.options)) {
    throw new Error("自動再割り当てで顧客メールが有効です。");
  }

  if (!shouldSendUpdateReservationMail_(null)) {
    throw new Error("通常の予約変更メールが無効です。");
  }

  if (!isStaffServiceCapabilityEnabled_({ can_tour: true }, "TOUR")) {
    throw new Error("TOUR対応可能スタッフを拒否しています。");
  }

  if (isStaffServiceCapabilityEnabled_({ can_tour: false }, "TOUR")) {
    throw new Error("TOUR対応不可スタッフを許可しています。");
  }

  const eligibleStaff = {
    active: true,
    role: "STAFF",
    can_tour: true
  };
  const ineligibleStaff = {
    active: true,
    role: "STAFF",
    can_tour: false
  };
  const tourService = {
    service_code: "TOUR",
    provider_role: "STAFF"
  };

  if (!isAutoReassignStaffEligible_(eligibleStaff, tourService)) {
    throw new Error("勤務可能候補のサービス適格性判定に失敗しました。");
  }

  if (isAutoReassignStaffEligible_(ineligibleStaff, tourService)) {
    throw new Error("担当サービス不可スタッフを候補に含めています。");
  }

  if (
    isAutoReassignStaffEligible_(
      { active: true, role: "TRAINER", can_tour: true },
      tourService
    )
  ) {
    throw new Error("provider_role不一致スタッフを候補に含めています。");
  }

  const kawakami = {
    staff_code: "KAWAKAMI",
    active: true,
    role: "STAFF",
    can_tour: true
  };
  const tourReservation = {
    reservation_id: "RSV_TOUR_TEST",
    service_code: "TOUR",
    start_time: "14:00",
    end_time: "15:00",
    status: "RESERVED"
  };
  const shifts = [{
    staff_code: "KAWAKAMI",
    date: "2026-08-26",
    start_time: "09:00",
    end_time: "16:00",
    active: true
  }];

  if (
    !doesAutoReassignStaffWork_(
      kawakami,
      shifts,
      tourReservation,
      "2026-08-26"
    )
  ) {
    throw new Error("14:00〜15:00を含む勤務シフトを認識できません。");
  }

  if (
    !isAutoReassignStaffFree_(
      kawakami,
      tourReservation,
      [tourReservation]
    )
  ) {
    throw new Error("対象予約自身を重複予定として扱っています。");
  }

  if (
    isAutoReassignStaffFree_(
      kawakami,
      tourReservation,
      [
        tourReservation,
        {
          reservation_id: "RSV_CONFLICT",
          staff_code: "KAWAKAMI",
          start_time: "14:30",
          end_time: "15:30",
          status: "RESERVED"
        }
      ]
    )
  ) {
    throw new Error("同時間帯の重複予約を見逃しています。");
  }

  Logger.log("担当者再割り当て安全ポリシーテスト成功");
}
