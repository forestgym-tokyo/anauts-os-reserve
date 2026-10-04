import fs from "node:fs";

function read_(name) {
  const path = ".gas-live/" + name;
  if (!fs.existsSync(path)) throw new Error("Live GAS file not found: " + path);
  return { path, src: fs.readFileSync(path, "utf8") };
}

function write_(file) {
  fs.writeFileSync(file.path, file.src);
}

function replaceOnce_(file, before, after, label) {
  if (file.src.includes(after)) return;
  if (!file.src.includes(before)) throw new Error("Overlay anchor not found: " + label);
  file.src = file.src.replace(before, after);
}

function replaceAllRequired_(file, before, after, minimum, label) {
  if (file.src.includes(after) && !file.src.includes(before)) return;
  const count = file.src.split(before).length - 1;
  if (count < minimum) throw new Error("Overlay anchor count too small for " + label + ": " + count);
  file.src = file.src.split(before).join(after);
}

// 28_Availability: only shifts from the service's own store may create availability.
{
  const file = read_("28_Availability.gs.js");

  replaceOnce_(
    file,
`      getAvailabilityShifts_(
        targetDate,
        staffMap
      );`,
`      getAvailabilityShifts_(
        targetDate,
        staffMap,
        service.store_code
      );`,
    "28 getAvailableSlots store scope"
  );

  replaceOnce_(
    file,
`    TRAINING_SUPPORT45:
      "can_training_support",
    NINE_ROUND:`,
`    TRAINING_SUPPORT45:
      "can_training_support",
    MPG_TRAINING_SUPPORT45:
      "can_training_support",
    MPG_TOUR45:
      "can_tour",
    NINE_ROUND:`,
    "28 MPG service permission map"
  );

  const hasStoreScopedShiftFilter =
    file.src.includes(
      `function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
)`
    ) &&
    file.src.includes("normalizedStoreCode") &&
    file.src.includes("String(row.store_code || \"\")");

  if (!hasStoreScopedShiftFilter) {
    replaceOnce_(
      file,
` * @param {Map<string, Object>} staffMap
 * @returns {Array<Object>}
 */
function getAvailabilityShifts_(
  targetDate,
  staffMap
) {

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  return rows
    .filter(row =>
      row.active === true &&
      staffMap.has(
        String(row.staff_code || "")
      ) &&
      formatAvailabilityDate_(
        row.date
      ) === targetDate
    )`,
` * @param {Map<string, Object>} staffMap
 * @param {string=} storeCode
 * @returns {Array<Object>}
 */
function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
) {

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  const normalizedStoreCode =
    String(storeCode || "")
      .trim()
      .toUpperCase();

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
    )`,
      "28 getAvailabilityShifts store filter"
    );
  }

  replaceOnce_(
    file,
`function getAvailabilityShifts_(
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

  return rows`,
`function getAvailabilityShifts_(
  targetDate,
  staffMap,
  storeCode
) {

  const normalizedStoreCode =
    String(storeCode || "")
      .trim()
      .toUpperCase();

  const rows = getSheetData(
    APP_CONFIG.SHEETS.STAFF_SHIFTS
  );

  return rows`,
    "28 remove synchronous MPG cleanup"
  );

  replaceOnce_(
    file,
`      buildAvailabilitySlots_({
        targetDate: targetDate,
        durationMinutes: durationMinutes,
        intervalMinutes: intervalMinutes,
        shifts: shifts,
        busyPeriods: busyPeriods,
        requestedStaffCode:
          requestedStaffCode,
        bookingOpenAt:
          bookingOpenAt
      });`,
`      buildAvailabilitySlots_({
        targetDate: targetDate,
        durationMinutes: durationMinutes,
        intervalMinutes: intervalMinutes,
        shifts: shifts,
        busyPeriods: busyPeriods,
        requestedStaffCode:
          requestedStaffCode,
        bookingOpenAt:
          bookingOpenAt,
        slotAnchorAt:
          String(service.store_code || "")
            .trim()
            .toUpperCase() === "MPG" &&
          serviceHours.length > 0
            ? serviceHours[0].start_at
            : null
      });`,
    "28 MPG slot anchor call"
  );

  replaceOnce_(
    file,
`  let cursor =
    roundUpAvailabilityTime_(
      earliestStart,
      intervalMinutes
    );`,
`  const slotAnchorAt =
    options.slotAnchorAt instanceof Date &&
    !isNaN(options.slotAnchorAt.getTime())
      ? options.slotAnchorAt
      : null;

  let cursor =
    slotAnchorAt
      ? roundUpAvailabilityTimeFromAnchor_(
          earliestStart,
          intervalMinutes,
          slotAnchorAt
        )
      : roundUpAvailabilityTime_(
          earliestStart,
          intervalMinutes
        );`,
    "28 MPG slot anchor cursor"
  );

  replaceOnce_(
    file,
`    const slots =
      buildAvailabilitySlots_({`,
`    let slots =
      buildAvailabilitySlots_({`,
    "28 mutable MPG slots"
  );

  replaceOnce_(
    file,
`      });

    return successResponse({`,
`      });

    if (
      String(service.store_code || "")
        .trim()
        .toUpperCase() === "MPG" &&
      typeof filterMpgSlotsAgainstHeadOfficeReservations_ === "function"
    ) {
      slots = filterMpgSlotsAgainstHeadOfficeReservations_(
        targetDate,
        slots
      );
    }

    return successResponse({`,
    "28 MPG head office availability filter"
  );

  replaceOnce_(
    file,
`function roundUpAvailabilityTime_(
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
}`,
`function roundUpAvailabilityTime_(
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

function roundUpAvailabilityTimeFromAnchor_(
  value,
  intervalMinutes,
  anchorAt
) {

  const intervalMs =
    intervalMinutes * 60000;

  const offset =
    value.getTime() -
    anchorAt.getTime();

  if (offset <= 0) {
    return new Date(
      anchorAt.getTime()
    );
  }

  return new Date(
    anchorAt.getTime() +
    Math.ceil(
      offset /
      intervalMs
    ) * intervalMs
  );
}`,
    "28 MPG slot anchor helper"
  );

  write_(file);
}

// 29_Reservation: reservation validation must use the same store-scoped shifts.
{
  const file = read_("29_Reservation.gs.js");
  replaceAllRequired_(
    file,
`getAvailabilityShifts_(
        targetDate,
        staffMap
      )`,
`getAvailabilityShifts_(
        targetDate,
        staffMap,
        service.store_code
      )`,
    1,
    "29 reservation store scope"
  );
  replaceAllRequired_(
    file,
`getAvailabilityShifts_(
      targetDate,
      staffMap
    )`,
`getAvailabilityShifts_(
      targetDate,
      staffMap,
      service.store_code
    )`,
    1,
    "29 diagnostics store scope"
  );

  replaceOnce_(
    file,
`      const memberValidation =
        validateReservationMemberMaster_({
          memberNo:
            memberNo,
          customerEmail:
            customerEmail
        });`,
`      const memberValidation =
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
            });`,
    "29 MPG member master"
  );

  replaceOnce_(
    file,
`      customerEmail =
        normalizeReservationText_(
          verifiedMember.email
        );
    }

    /*
     * サービスに設定された担当可能roleを取得`,
`      customerEmail =
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
     * サービスに設定された担当可能roleを取得`,
    "29 MPG monthly booking limit"
  );

  replaceOnce_(
    file,
`    const endAt =
      new Date(
        startAt.getTime() +
        durationMinutes * 60000
      );

    /*
     * 予約公開期間チェック
     */`,
`    const endAt =
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
     */`,
    "29 MPG head office travel validation"
  );

  replaceOnce_(
    file,
`    "TRAINING_SUPPORT45",
    "PROCEDURE",`,
`    "TRAINING_SUPPORT45",
    "MPG_TRAINING_SUPPORT45",
    "PROCEDURE",`,
    "29 MPG member name rule"
  );

  write_(file);
}

// 32_UpdateReservation: preserve MPG store scope and monthly booking limit on reschedule.
{
  const file = read_("32_UpdateReservation.gs.js");

  replaceOnce_(
    file,
`    const serviceCode = normalizeReservationText_(reservation.service_code);
    const service = getAvailabilityService_(serviceCode);

    /*
     * サービスに設定された担当可能roleを取得`,
`    const serviceCode = normalizeReservationText_(reservation.service_code);
    const service = getAvailabilityService_(serviceCode);

    if (
      String(serviceCode || "").trim().toUpperCase() ===
        "MPG_TRAINING_SUPPORT45" &&
      typeof validateMpgTrainingMonthlyBookingLimit_ ===
        "function"
    ) {
      const mpgMonthlyLimit =
        validateMpgTrainingMonthlyBookingLimit_(
          reservation.member_no,
          targetDate,
          reservationId
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
     * サービスに設定された担当可能roleを取得`,
    "32 MPG monthly booking limit"
  );

  replaceOnce_(
    file,
`    const startAt = createAvailabilityDateTime_(targetDate, startTime);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60000);

    /*
     * 現在の予約に対する変更期限チェック
     */`,
`    const startAt = createAvailabilityDateTime_(targetDate, startTime);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60000);

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
          reservationId
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
     * 現在の予約に対する変更期限チェック
     */`,
    "32 MPG head office travel validation"
  );

  replaceOnce_(
    file,
`    const staffMap =
      getActiveStaffMap_(
        providerRoles
      );`,
`    const staffMap =
      getActiveStaffMap_(
        providerRoles,
        service
      );`,
    "32 service permission scope"
  );

  replaceOnce_(
    file,
`    let shifts = getAvailabilityShifts_(targetDate, staffMap);`,
`    let shifts = getAvailabilityShifts_(
      targetDate,
      staffMap,
      service.store_code
    );`,
    "32 MPG store scope"
  );

  write_(file);
}

// 88_DietCounselingWorkflow: keep HEAD_OFFICE and MPG shifts concurrent
// and apply the same 150-minute travel rule only after an MPG reservation exists.
{
  const file = read_("88_DietCounselingWorkflow.js");

  replaceOnce_(
    file,
`        return isDietCounselingHeadOfficeAssignmentAllowed_(
          snapshot, staffCode, date, start, end
        );`,
`        return isDietCounselingHeadOfficeAssignmentAllowed_(
          snapshot, staffCode, date, start, end, excludedReservationId
        );`,
    "88 head office assignment exclude reservation"
  );

  replaceOnce_(
    file,
`function isDietCounselingHeadOfficeAssignmentAllowed_(
  snapshot, staffCode, date, start, end
) {`,
`function isDietCounselingHeadOfficeAssignmentAllowed_(
  snapshot, staffCode, date, start, end, excludedReservationId
) {`,
    "88 head office signature"
  );

  replaceOnce_(
    file,
`  const officeStoreCode = getDietCounselingOfficeStoreCode_();
  const shiftEnds = (snapshot.shifts || []).filter(function (shift) {`,
`  if (
    typeof mpgFindMpgTravelConflictForHeadOffice_ === "function" &&
    mpgFindMpgTravelConflictForHeadOffice_(
      date,
      start,
      end,
      excludedReservationId || ""
    )
  ) {
    return false;
  }

  const officeStoreCode = getDietCounselingOfficeStoreCode_();
  const shiftEnds = (snapshot.shifts || []).filter(function (shift) {`,
    "88 MPG reservation travel conflict"
  );

  replaceOnce_(
    file,
`      normalizeDietCounselingDate_(shift && shift.date) === date &&
      normalizeDietCounselingCode_(shift && shift.store_code) !== officeStoreCode;`,
`      normalizeDietCounselingDate_(shift && shift.date) === date &&
      normalizeDietCounselingCode_(shift && shift.store_code) !== officeStoreCode &&
      normalizeDietCounselingCode_(shift && shift.store_code) !== "MPG";`,
    "88 ignore unbooked MPG shift"
  );

  write_(file);
}

// 24_StaffShift: protect reserved MPG slots and remove unreserved MPG
// conflicts when YACHIYO/SOGA shifts are saved/imported.
{
  const file = read_("24_StaffShift.gs.js");

  replaceOnce_(
    file,
`    const activeIndex =
      headers.indexOf(
        "active"
      );

    existingRows.forEach(`,
`    const activeIndex =
      headers.indexOf(
        "active"
      );

    const storeCodeIndex =
      headers.indexOf(
        "store_code"
      );

    if (
      typeof mpgAssertIncomingShiftCanReplaceMpg_ ===
      "function"
    ) {
      mpgAssertIncomingShiftCanReplaceMpg_(
        staffCode,
        resolvedStoreCode,
        date,
        startTime,
        endTime
      );
    }

    existingRows.forEach(`,
    "24 preflight MPG reservation conflict"
  );

  replaceOnce_(
    file,
`        if (overlaps) {
          throw new Error(
            "SHIFT_OVERLAP"
          );
        }`,
`        if (overlaps) {
          const existingStoreCode =
            storeCodeIndex >= 0
              ? String(
                  row[
                    storeCodeIndex
                  ] || ""
                ).trim()
              : "";

          if (
            typeof mpgCanIgnoreExistingMpgOverlap_ ===
              "function" &&
            mpgCanIgnoreExistingMpgOverlap_(
              staffCode,
              resolvedStoreCode,
              existingStoreCode
            )
          ) {
            return;
          }

          throw new Error(
            "SHIFT_OVERLAP"
          );
        }`,
    "24 ignore replaceable MPG overlap"
  );

  replaceOnce_(
    file,
`    return successResponse({
      shift_id:
        finalShiftId,`,
`    let mpgRemovedCount = 0;

    if (
      typeof mpgDeactivateConflictsForIncomingShift_ ===
      "function"
    ) {
      const mpgResult =
        mpgDeactivateConflictsForIncomingShift_(
          staffCode,
          resolvedStoreCode,
          date,
          startTime,
          endTime
        );

      mpgRemovedCount =
        Number(
          mpgResult &&
          mpgResult.removed_count ||
          0
        );
    }

    return successResponse({
      shift_id:
        finalShiftId,`,
    "24 post-save MPG pruning"
  );

  replaceOnce_(
    file,
`      active:
        true,

      mode:`,
`      active:
        true,

      mpg_removed_count:
        mpgRemovedCount,

      mode:`,
    "24 return MPG removed count"
  );

  replaceOnce_(
    file,
`  if (
    error.message ===
    "SHIFT_OVERLAP"
  ) {`,
`  if (
    String(
      error.message || ""
    ).indexOf(
      "MPG_RESERVED_CONFLICT::"
    ) === 0
  ) {
    const parts =
      String(
        error.message
      ).split("::");

    return errorResponse(
      "MPGに確定予約があるため、この時間帯には他店舗シフトを登録できません。",
      "MPG_RESERVED_CONFLICT",
      {
        date:
          parts[1] || "",
        start_time:
          parts[2] || "",
        incoming_store_code:
          parts[3] || ""
      }
    );
  }

  if (
    error.message ===
    "SHIFT_OVERLAP"
  ) {`,
    "24 reserved MPG error"
  );

  const validationAnchor =
`    if (
      validation.errors.length > 0
    ) {

      return errorResponse(
        "エラーがあるためシフトを登録できません。",
        "SHIFT_IMPORT_VALIDATION_ERROR",
        {
          total_count:
            validation.totalCount,

          valid_count:
            validation.validRows.length,

          error_count:
            validation.errors.length,

          errors:
            validation.errors
        }
      );
    }

    const sheet =`;

  const validationPatched =
`    if (
      validation.errors.length > 0
    ) {

      return errorResponse(
        "エラーがあるためシフトを登録できません。",
        "SHIFT_IMPORT_VALIDATION_ERROR",
        {
          total_count:
            validation.totalCount,

          valid_count:
            validation.validRows.length,

          error_count:
            validation.errors.length,

          errors:
            validation.errors
        }
      );
    }

    if (
      typeof mpgReservedConflictsForIncomingShift_ ===
      "function"
    ) {
      const mpgReservedConflicts = [];

      validation.validRows.forEach(
        row => {
          const conflicts =
            mpgReservedConflictsForIncomingShift_(
              row.staff_code,
              row.store_code,
              row.date,
              row.start_time,
              row.end_time
            );

          conflicts.forEach(
            conflict => {
              mpgReservedConflicts.push({
                incoming_store_code:
                  row.store_code,
                date:
                  conflict.date,
                start_time:
                  conflict.start_time,
                end_time:
                  conflict.end_time
              });
            }
          );
        }
      );

      if (
        mpgReservedConflicts.length > 0
      ) {
        return errorResponse(
          "MPGに確定予約があるため、競合する川上の他店舗シフトを一括登録できません。",
          "MPG_RESERVED_CONFLICT",
          {
            conflicts:
              mpgReservedConflicts
          }
        );
      }
    }

    const sheet =`;

  replaceOnce_(file, validationAnchor, validationPatched, "24 bulk import MPG preflight");

  replaceOnce_(
    file,
`    return successResponse({

      mode:
        validation.mode,`,
`    let mpgReconcileResult = null;

    if (
      typeof reconcileKawakamiMpgShifts_ ===
      "function"
    ) {
      mpgReconcileResult =
        reconcileKawakamiMpgShifts_({
          month:
            validation.targetMonth
        });
    }

    return successResponse({

      mode:
        validation.mode,`,
    "24 bulk import MPG reconcile"
  );

  replaceOnce_(
    file,
`      inserted_count:
        insertRows.length
    });`,
`      inserted_count:
        insertRows.length,

      mpg_removed_count:
        Number(
          mpgReconcileResult &&
          mpgReconcileResult.removed_count ||
          0
        ),

      mpg_reserved_conflicts:
        mpgReconcileResult &&
        mpgReconcileResult.reserved_conflicts ||
        []
    });`,
    "24 bulk import MPG result"
  );

  write_(file);
}

// 40_ReservationMail: Tiffany blue customer manage button for MPG.
{
  const file = read_("40_ReservationMail.gs.js");

  const customerStart =
    file.src.indexOf(
      "function buildReservationCustomerHtmlBody_("
    );

  if (customerStart < 0) {
    throw new Error("Overlay anchor not found: 40 customer html function");
  }

  const prefix = file.src.slice(0, customerStart);
  const customerFile = {
    path: file.path,
    src: file.src.slice(customerStart)
  };

  replaceOnce_(
    customerFile,
`  const allowedEvents = [
    "RESERVATION_CREATED",
    "RESERVATION_UPDATED",
    "RESERVATION_RESTORED"
  ];

  const escapedBody =`,
`  const allowedEvents = [
    "RESERVATION_CREATED",
    "RESERVATION_UPDATED",
    "RESERVATION_RESTORED"
  ];

  const actionButtonBackground =
    serviceCode === "MPG_TRAINING_SUPPORT45"
      ? "#81d8d0"
      : "#178447";

  const actionButtonColor =
    serviceCode === "MPG_TRAINING_SUPPORT45"
      ? "#111111"
      : "#ffffff";

  const escapedBody =`,
    "40 MPG Tiffany button colors"
  );

  replaceOnce_(
    customerFile,
`          'background:#178447;' +
          'color:#ffffff;' +
          'text-decoration:none;' +
          'font-size:15px;' +
          'font-weight:700;' +
          'line-height:1.4;' +
          'padding:14px 22px;' +
          'border-radius:8px;' +
        '">' +
          '予約を変更・キャンセル' +`,
`          'background:' + actionButtonBackground + ';' +
          'color:' + actionButtonColor + ';' +
          'text-decoration:none;' +
          'font-size:15px;' +
          'font-weight:700;' +
          'line-height:1.4;' +
          'padding:14px 22px;' +
          'border-radius:8px;' +
        '">' +
          '予約を変更・キャンセル' +`,
    "40 MPG Tiffany customer action button"
  );

  file.src = prefix + customerFile.src;
  write_(file);
}

// 99_Main: expose the monthly MPG generator.
{
  const file = read_("99_Main.js");
  replaceOnce_(
    file,
`      case "saveStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveStaffShift(body),
          false,
          body
        );`,
`      case "generateKawakamiMpgShifts":
        requireDirectShiftEditPermission_(
          body
        );
        return generateKawakamiMpgShifts(
          body
        );

      case "saveStaffShift":
        requireDirectShiftEditPermission_(
          body
        );
        return invalidateStoreAwareAfterMutation_(
          saveStaffShift(body),
          false,
          body
        );`,
    "99 MPG route"
  );
  write_(file);
}
